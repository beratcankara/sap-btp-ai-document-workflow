const cds = require('@sap/cds');
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

module.exports = cds.service.impl(function () {
  const { Documents } = this.entities;
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
});
