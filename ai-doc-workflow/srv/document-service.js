const cds = require('@sap/cds');
const { SELECT, INSERT, UPDATE } = cds;
const { promises: fs } = require('fs');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');

const MAX_FILE_SIZE = Number(process.env.DOCUMENT_MAX_SIZE || 10 * 1024 * 1024);
const ALLOWED_MIME_TYPES = (process.env.ALLOWED_MIME_TYPES || 'application/pdf')
  .split(',')
  .map((type) => type.trim())
  .filter(Boolean);
const STORAGE_ROOT = process.env.DOCUMENT_STORAGE_PATH || path.join(process.cwd(), 'data', 'documents');
const GENAI_API_URL = process.env.GENAI_API_URL;
const GENAI_API_KEY = process.env.GENAI_API_KEY;
const GENAI_MODEL = process.env.GENAI_MODEL || 'gpt-4o-mini';
const FEEDBACK_CONFIDENCE_THRESHOLD = Number(process.env.FEEDBACK_CONFIDENCE_THRESHOLD || 0.8);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  },
});

function normalizeText(text = '') {
  return text.replace(/\s+/g, ' ').trim();
}

async function persistFile(buffer, documentId, originalName) {
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
  const safeName = originalName ? originalName.replace(/[^a-zA-Z0-9._-]/g, '_') : 'document';
  const filePath = path.join(STORAGE_ROOT, `${documentId}-${safeName}`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function extractPdfText(buffer) {
  const { text } = await pdfParse(buffer);
  return normalizeText(text);
}

async function buildPayload(req) {
  if (req.file) {
    return {
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
    };
  }

  if (req.body && req.body.data) {
    const base64String = req.body.data;
    const buffer = Buffer.from(base64String, 'base64');
    return {
      buffer,
      fileName: req.body.fileName || 'document.pdf',
      mimeType: req.body.mimeType || 'application/pdf',
    };
  }

  throw new Error('No file payload received');
}

function validatePayload({ buffer, mimeType }) {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    const error = new Error('Unsupported file type');
    error.statusCode = 400;
    throw error;
  }

  if (!buffer || buffer.length === 0) {
    const error = new Error('File is empty');
    error.statusCode = 400;
    throw error;
  }

  if (buffer.length > MAX_FILE_SIZE) {
    const error = new Error('File exceeds maximum allowed size');
    error.statusCode = 400;
    throw error;
  }
}

function buildAnalysisPrompt(document) {
  const header = document.title ? `Title: ${document.title}\n` : '';
  const description = document.description ? `Description: ${document.description}\n` : '';
  return [
    'You are an assistant that extracts structured invoice data.',
    'Return ONLY a JSON object with the following fields:',
    '{ "amount": number, "vendor": string, "date": "YYYY-MM-DD", "riskLevel": string, "confidence": number }.',
    'Use null for fields you cannot infer. Keep confidence between 0 and 1.',
    'Do not include any additional commentary.',
    'Context provided from the document follows.',
    header,
    description,
    'ExtractedText:\n' + document.extractedText,
  ]
    .filter(Boolean)
    .join('\n');
}

async function callGenAiAPI(prompt, extractedText) {
  if (!GENAI_API_URL) {
    const error = new Error('GENAI_API_URL is not configured');
    error.statusCode = 500;
    throw error;
  }

  const body = {
    model: GENAI_MODEL,
    prompt,
    input: extractedText,
  };

  const headers = {
    'Content-Type': 'application/json',
  };

  if (GENAI_API_KEY) {
    headers.Authorization = `Bearer ${GENAI_API_KEY}`;
  }

  const response = await fetch(GENAI_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let jsonBody;
  try {
    jsonBody = text ? JSON.parse(text) : {};
  } catch (err) {
    jsonBody = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(jsonBody.error || 'GenAI request failed');
    error.statusCode = response.status;
    error.details = jsonBody;
    throw error;
  }

  return { rawText: text, body: jsonBody };
}

function normalizeNumber(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseAnalysisResult(genAiResult) {
  const candidate =
    genAiResult?.body?.result ||
    genAiResult?.body?.output ||
    genAiResult?.body?.choices?.[0]?.message?.content ||
    genAiResult?.body?.generated_text ||
    genAiResult?.body?.completion ||
    genAiResult?.body?.content ||
    genAiResult?.body;

  let structured = {};
  if (typeof candidate === 'string') {
    try {
      structured = JSON.parse(candidate);
    } catch (err) {
      structured = {};
    }
  } else if (candidate && typeof candidate === 'object') {
    structured = candidate;
  }

  return {
    amount: normalizeNumber(structured.amount),
    vendor: structured.vendor || structured.supplier || null,
    date: normalizeDate(structured.date || structured.invoiceDate),
    riskLevel: structured.riskLevel || structured.risk || null,
    confidence: normalizeNumber(structured.confidence),
  };
}

module.exports = cds.service.impl(function () {
  const { Documents, DocumentAnalyses, DocumentFeedback } = this.entities;
  const app = cds.app;

  app.post('/documents', (req, res) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      try {
        const { buffer, fileName, mimeType } = await buildPayload(req);
        validatePayload({ buffer, mimeType });

        const extractedText = await extractPdfText(buffer);
        const documentId = cds.utils.uuid();
        const storagePath = await persistFile(buffer, documentId, fileName);

        const payload = {
          ID: documentId,
          title: req.body.title || fileName,
          description: req.body.description,
          fileName,
          mimeType,
          fileSize: buffer.length,
          contentUrl: storagePath,
          extractedText,
          status: 'PROCESSED',
        };

        const tx = cds.tx({ user: req.user || cds.User.Privileged });
        await tx.run(INSERT.into(Documents).entries(payload));

        res.status(201).json({ id: documentId, text: extractedText });
      } catch (error) {
        const status = error.statusCode || 400;
        res.status(status).json({ error: error.message || 'Failed to process document' });
      }
    });
  });

  app.post('/documents/:id/analyze', async (req, res) => {
    const documentId = req.params.id;

    try {
      const document = await SELECT.one.from(Documents).where({ ID: documentId });
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (!document.extractedText) {
        return res.status(400).json({ error: 'Document has no extracted text to analyze' });
      }

      const prompt = buildAnalysisPrompt(document);
      const genAiResult = await callGenAiAPI(prompt, document.extractedText);
      const analysis = parseAnalysisResult(genAiResult);

      const feedbackRequired =
        analysis.confidence === null || analysis.confidence < FEEDBACK_CONFIDENCE_THRESHOLD;

      const tx = cds.tx(req);
      const analysisId = cds.utils.uuid();
      await tx.run(
        INSERT.into(DocumentAnalyses).entries({
          ID: analysisId,
          document_ID: documentId,
          prompt,
          response: genAiResult.rawText,
          amount: analysis.amount,
          vendor: analysis.vendor,
          date: analysis.date,
          riskLevel: analysis.riskLevel,
          confidence: analysis.confidence,
          feedbackRequired,
        })
      );
      await tx.run(UPDATE(Documents, documentId).with({ status: 'ANALYZED' }));

      res.json({
        analysisId,
        documentId,
        ...analysis,
        feedbackRequired,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      res.status(status).json({ error: error.message || 'Failed to analyze document' });
    }
  });

  app.post('/documents/:id/feedback', async (req, res) => {
    const documentId = req.params.id;
    const { analysisId, corrections, comments } = req.body || {};

    if (!corrections) {
      return res.status(400).json({ error: 'Corrections payload is required' });
    }

    try {
      const document = await SELECT.one.from(Documents).where({ ID: documentId });
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      let analysisRecord;

      if (analysisId) {
        analysisRecord = await SELECT.one.from(DocumentAnalyses).where({ ID: analysisId, document_ID: documentId });
      } else {
        analysisRecord = await SELECT.one
          .from(DocumentAnalyses)
          .where({ document_ID: documentId })
          .orderBy('createdAt desc');
      }

      if (!analysisRecord) {
        return res.status(404).json({ error: 'No analysis found for this document' });
      }

      const tx = cds.tx(req);
      await tx.run(
        INSERT.into(DocumentFeedback).entries({
          analysis_ID: analysisRecord.ID,
          corrections: typeof corrections === 'string' ? corrections : JSON.stringify(corrections),
          comments,
          submittedBy: req.user && req.user.id ? req.user.id : 'anonymous',
        })
      );

      await tx.run(
        UPDATE(DocumentAnalyses, analysisRecord.ID).with({
          feedbackProvided: true,
          feedbackRequired: false,
        })
      );

      res.status(201).json({
        analysisId: analysisRecord.ID,
        documentId,
        message: 'Feedback received',
      });
    } catch (error) {
      const status = error.statusCode || 500;
      res.status(status).json({ error: error.message || 'Failed to store feedback' });
    }
  });
});
