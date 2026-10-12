/**
 * Bounded local memory index.
 */

export interface IndexedRecord {
  id: string;
  text: string;
  vector: Float32Array;
  tokens: string[];
}

export interface MemoryIndexSearchResult {
  id: string;
  score: number;
}

export interface MemoryItemForIndex {
  id: string;
  key?: string;
  content?: string;
  category?: string;
}

export class MemoryIndex {
  private dimensions: number;
  private embedder: ((text: string) => number[] | Float32Array) | null = null;
  private records = new Map<string, IndexedRecord>();
  private postings = new Map<string, Set<string>>();

  constructor({
    dimensions = 96,
    embedder = null
  }: {
    dimensions?: number;
    embedder?: ((text: string) => number[] | Float32Array) | null;
  } = {}) {
    this.dimensions = Math.max(16, Number(dimensions) || 96);
    this.embedder = typeof embedder === 'function' ? embedder : null;
  }

  setEmbedder(embedder: ((text: string) => number[] | Float32Array) | null): void {
    this.embedder = typeof embedder === 'function' ? embedder : null;
    for (const record of this.records.values()) {
      record.vector = this.embed(record.text);
    }
  }

  clear(): void {
    this.records.clear();
    this.postings.clear();
  }

  static tokenize(text = ''): string[] {
    return [...new Set(String(text)
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1))];
  }

  hashVector(text = ''): Float32Array {
    const vector = new Float32Array(this.dimensions);
    for (const token of MemoryIndex.tokenize(text)) {
      let hash = 2166136261;
      for (let i = 0; i < token.length; i += 1) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      const index = (hash >>> 0) % this.dimensions;
      const sign = (hash & 1) === 0 ? 1 : -1;
      vector[index] += sign;
      const index2 = ((hash >>> 7) ^ (hash >>> 16)) % this.dimensions;
      vector[index2 < 0 ? index2 + this.dimensions : index2] += sign * 0.5;
    }
    return this.normalize(vector);
  }

  embed(text: string): Float32Array {
    const supplied = this.embedder?.(text);
    if (supplied && typeof supplied.length === 'number') {
      const vector = Float32Array.from(supplied).slice(0, this.dimensions);
      return this.normalize(vector);
    }
    return this.hashVector(text);
  }

  normalize(vector: Float32Array): Float32Array {
    let norm = 0;
    for (const value of vector) norm += value * value;
    const divisor = Math.sqrt(norm) || 1;
    for (let i = 0; i < vector.length; i += 1) vector[i] /= divisor;
    return vector;
  }

  upsert(memory: MemoryItemForIndex): boolean {
    if (!memory?.id) return false;
    this.remove(memory.id);
    const text = `${memory.key || ''} ${memory.content || ''} ${memory.category || ''}`.trim();
    const tokens = MemoryIndex.tokenize(text);
    this.records.set(memory.id, { id: memory.id, text, vector: this.embed(text), tokens });
    for (const token of tokens) {
      let ids = this.postings.get(token);
      if (!ids) {
        ids = new Set();
        this.postings.set(token, ids);
      }
      ids.add(memory.id);
    }
    return true;
  }

  remove(id: string): boolean {
    const record = this.records.get(id);
    if (!record) return false;
    this.records.delete(id);
    for (const token of record.tokens) {
      const ids = this.postings.get(token);
      ids?.delete(id);
      if (ids?.size === 0) this.postings.delete(token);
    }
    return true;
  }

  score(query: string, { candidateIds = null }: { candidateIds?: Set<string> | null } = {}): Map<string, number> {
    const queryTokens = MemoryIndex.tokenize(query);
    if (queryTokens.length === 0) return new Map();
    const candidates = candidateIds || new Set(this.records.keys());
    const queryVector = this.embed(query);
    const result = new Map<string, number>();
    for (const id of candidates) {
      const record = this.records.get(id);
      if (!record) continue;
      let dot = 0;
      for (let i = 0; i < queryVector.length; i += 1) dot += queryVector[i] * record.vector[i];
      const lexical = queryTokens.reduce((sum, token) => sum + (record.tokens.includes(token) ? 1 : 0), 0) / queryTokens.length;
      result.set(id, Math.max(0, Math.min(1, dot * 0.55 + lexical * 0.45)));
    }
    return result;
  }

  search(query: string, { limit = 6, minScore = 0 }: { limit?: number; minScore?: number } = {}): MemoryIndexSearchResult[] {
    const tokens = MemoryIndex.tokenize(query);
    const candidateIds = new Set<string>();
    for (const token of tokens) {
      for (const id of this.postings.get(token) || []) candidateIds.add(id);
    }
    if (candidateIds.size === 0 && !this.embedder) {
      return [];
    }
    const candidates = candidateIds.size >= limit ? candidateIds : null;
    return [...this.score(query, { candidateIds: candidates })]
      .filter(([, score]) => score >= minScore)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({ id, score }));
  }
}

export default MemoryIndex;
