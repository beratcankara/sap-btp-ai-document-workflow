const { __internals } = require('../srv/document-service');
const { InMemoryRagStore } = require('../srv/rag-store');

const {
  buildAnalysisPrompt,
  callGenAiAPI,
  deriveDecisionOutcome,
  evaluateRoutingRules,
  parseAnalysisResult,
  metrics,
  ragStore,
} = __internals;

describe('Document service helpers', () => {
  describe('evaluateRoutingRules', () => {
    it('requires review when amount exceeds threshold', () => {
      const decision = evaluateRoutingRules({ amount: 20000, riskLevel: 'low' });
      expect(decision.decision).toBe('REQUIRES_REVIEW');
      expect(decision.amountExceedsThreshold).toBe(true);
      expect(decision.highRisk).toBe(false);
    });

    it('requires review when risk is high even with small amount', () => {
      const decision = evaluateRoutingRules({ amount: 50, riskLevel: 'Critical' });
      expect(decision.decision).toBe('REQUIRES_REVIEW');
      expect(decision.highRisk).toBe(true);
      expect(decision.reason).toContain('Risk level');
    });
  });

  describe('analysis prompt and parsing', () => {
    it('builds prompts with contextual metadata', () => {
      const prompt = buildAnalysisPrompt({
        title: 'Invoice 123',
        description: 'Quarterly subscription',
        extractedText: 'Sample PDF text',
      });

      expect(prompt).toContain('Invoice 123');
      expect(prompt).toContain('Quarterly subscription');
      expect(prompt).toContain('ExtractedText');
    });

    it('parses AI responses into normalized analysis', () => {
      const parsed = parseAnalysisResult({
        body: {
          result: {
            amount: '1200.50',
            vendor: 'Acme Corp',
            date: '2024-03-01',
            riskLevel: 'High',
            confidence: '0.91',
          },
        },
      });

      expect(parsed).toEqual({
        amount: 1200.5,
        vendor: 'Acme Corp',
        date: '2024-03-01',
        riskLevel: 'High',
        confidence: 0.91,
      });
    });
  });

  describe('deriveDecisionOutcome', () => {
    it('generates labels based on routing decision', () => {
      const routingDecision = evaluateRoutingRules({ amount: 5, riskLevel: 'low' });
      const outcome = deriveDecisionOutcome({ routingDecision });
      expect(outcome.label).toBe('Auto-Approve');

      const manualOutcome = deriveDecisionOutcome({ routingDecision: evaluateRoutingRules({ amount: 999999 }) });
      expect(manualOutcome.label).toBe('Finance Approval');
    });
  });

  describe('callGenAiAPI', () => {
    const originalFetch = global.fetch;
    const originalUrl = process.env.GENAI_API_URL;

    beforeEach(() => {
      metrics.aiLatencies.length = 0;
      process.env.GENAI_API_URL = 'https://mock.genai.local';
    });

    afterEach(() => {
      global.fetch = originalFetch;
      process.env.GENAI_API_URL = originalUrl;
    });

    it('returns structured payload when GenAI responds', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: { amount: 10 } }),
      }));

      const result = await callGenAiAPI('prompt', 'input');
      expect(result.body).toEqual({ result: { amount: 10 } });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://mock.genai.local',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws when API returns non-2xx status', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: 'boom' }),
      }));

      await expect(callGenAiAPI('prompt', 'input')).rejects.toThrow('boom');
    });
  });
});

describe('RAG store interface', () => {
  it('stores and retrieves document history', async () => {
    const store = new InMemoryRagStore();
    await store.upsertEmbeddings('doc-1', [
      { text: 'First version of the document', metadata: { version: 1 } },
      { text: 'Second version mentioning budget', metadata: { version: 2 } },
    ]);

    const history = await store.getHistory('doc-1');
    expect(history).toHaveLength(2);

    const results = await store.similaritySearch('budget', { limit: 1 });
    expect(results[0].metadata.version).toBe(2);
  });

  it('shares the default rag store instance for future enrichment', async () => {
    await ragStore.upsertEmbeddings('doc-2', [{ text: 'hello world' }]);
    const history = await ragStore.getHistory('doc-2');
    expect(history[0].text).toBe('hello world');
  });
});
