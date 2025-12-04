class RagStore {
  async upsertEmbeddings() {
    throw new Error('upsertEmbeddings not implemented');
  }

  async similaritySearch() {
    throw new Error('similaritySearch not implemented');
  }

  async getHistory() {
    throw new Error('getHistory not implemented');
  }
}

class InMemoryRagStore extends RagStore {
  constructor() {
    super();
    this.items = [];
  }

  async upsertEmbeddings(documentId, chunks = []) {
    const remaining = this.items.filter((entry) => entry.documentId !== documentId);
    const normalized = chunks.map((chunk, index) => ({
      id: `${documentId}-${index}`,
      documentId,
      text: chunk.text,
      metadata: chunk.metadata || {},
    }));
    this.items = [...remaining, ...normalized];
    return normalized;
  }

  async similaritySearch(query, { limit = 5 } = {}) {
    const loweredQuery = (query || '').toLowerCase();
    const scored = this.items
      .map((item) => {
        const score = item.text && loweredQuery ? (item.text.toLowerCase().includes(loweredQuery) ? 1 : 0) : 0;
        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  }

  async getHistory(documentId) {
    return this.items.filter((entry) => entry.documentId === documentId);
  }
}

module.exports = {
  RagStore,
  InMemoryRagStore,
};
