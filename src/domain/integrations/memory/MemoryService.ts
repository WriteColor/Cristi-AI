/**
 * Cristi AI - Persistent Context & Long-Term Memory Service
 * Inspired by Open-LLM-VTuber and AIRI long-term memory architectures.
 * Manages structured facts, preferences, user relationship history, tasks, and semantic memory retrieval for Gemini Live.
 */

import { logger } from '../../../infrastructure/logging/logger.ts';
import { eventBus, EVENTS } from '../../../infrastructure/events/eventBus.ts';
import { MemoryRepository } from './MemoryRepository.ts';
import { MemoryIndex } from './MemoryIndex.ts';

export const MEMORY_CATEGORIES = {
  FACT: 'fact',
  PREFERENCE: 'preference',
  RELATIONSHIP: 'relationship',
  TASK: 'task',
  CONVERSATION: 'conversation'
} as const;

export type MemoryCategory = typeof MEMORY_CATEGORIES[keyof typeof MEMORY_CATEGORIES];

export interface MemoryItem {
  id: string;
  key: string;
  content: string;
  category: string;
  importance: number;
  confidence: number;
  status: string;
  source: string;
  sessionId: string | null;
  context: Record<string, unknown>;
  tags: string[];
  relatedMemoryIds: string[];
  supersedes: string | null;
  previousVersions: Array<{ content?: string; updatedAt?: string; source?: string }>;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
  accessCount: number;
  [key: string]: unknown;
}

export interface SessionTurn {
  role: string;
  text: string;
  source: string;
  speakerId: string | null;
  timestamp: number;
}

export interface MemorySession {
  id: string;
  metadata: Record<string, unknown>;
  turns: SessionTurn[];
  startedAt: number;
}

export interface RememberOptions {
  key?: string;
  content: string;
  category?: string;
  importance?: number;
  confidence?: number;
  source?: string;
  sessionId?: string | null;
  context?: Record<string, unknown>;
  tags?: string[];
  relatedMemoryIds?: string[];
  validUntil?: string | null;
}

export interface ManageMemoryParams {
  action?: string;
  key?: string;
  content?: string;
  value?: string;
  category?: string;
  importance?: number;
  reason?: string;
  query?: string;
  id?: string | null;
}

export interface ManageMemoryResult {
  status: 'success' | 'not_found' | 'error';
  action?: string;
  memory?: MemoryItem;
  message?: string;
  query?: string;
  count?: number;
  results?: Array<{ id: string; key: string; content: string; category: string; importance: number }>;
  idOrKey?: string;
  memories?: Array<{ id: string; key: string; content: string; category: string }>;
}

const PROMPT_QUERY_STOPWORDS = new Set([
  'a', 'al', 'de', 'del', 'el', 'ella', 'en', 'es', 'esta', 'este', 'la', 'las', 'lo', 'los',
  'me', 'mi', 'mis', 'para', 'por', 'que', 'se', 'su', 'sus', 'un', 'una', 'uno', 'y', 'yo',
  'como', 'con', 'cual', 'cuales', 'cuando', 'donde', 'porque', 'qué', 'quien'
]);

export class MemoryService {
  private repository: MemoryRepository;
  public storageKey: string;
  public memories: MemoryItem[] = [];
  public isLoaded = false;
  public currentSessionId: string | null = null;
  public sessionTurns: SessionTurn[] = [];
  public sessions = new Map<string, MemorySession>();
  public maxSessionTurns = 120;
  private memoryIndex = new Map<string, string>();
  private semanticIndex: MemoryIndex;

  constructor({ repository = null, index = null }: { repository?: MemoryRepository | null; index?: MemoryIndex | null } = {}) {
    this.repository = repository || new MemoryRepository();
    this.storageKey = (this.repository as unknown as { storageKey?: string }).storageKey || 'cristi_ai_memories_v2';
    this.semanticIndex = index || new MemoryIndex();
  }

  async initialize(): Promise<void> {
    await this.loadMemories();
    this.rebuildIndex();
    this.isLoaded = true;
    logger.info('MEMORY', `Memoria a largo plazo cargada. (${this.memories.length} recuerdos persistidos)`);
  }

  rebuildIndex(): void {
    this.memoryIndex.clear();
    this.semanticIndex.clear();
    for (const memory of this.memories) {
      const key = String(memory.key || memory.id || '').toLowerCase();
      if (key) this.memoryIndex.set(key, memory.id);
      this.semanticIndex.upsert(memory);
    }
  }

  startSession(sessionId: string | null = null, metadata: Record<string, unknown> = {}): string {
    const id = sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this._createSession(id, metadata);
    this.currentSessionId = id;
    this.sessionTurns = this.sessions.get(id)!.turns;
    return id;
  }

  private _createSession(id: string, metadata: Record<string, unknown> = {}): MemorySession {
    if (this.sessions.has(id)) return this.sessions.get(id)!;
    const session: MemorySession = { id, metadata: { ...metadata }, turns: [], startedAt: Date.now() };
    this.sessions.set(id, session);
    eventBus.emitDomain(EVENTS.SESSION_STARTED, { ...metadata }, {
      source: (metadata.source as string) || 'conversation',
      sessionId: id,
      privacy: 'internal'
    });
    return session;
  }

  ensureSession(sessionId?: string | null, metadata: Record<string, unknown> = {}): string {
    if (!sessionId) return this.startSession(null, metadata);
    return this._createSession(sessionId, metadata).id;
  }

  hasSession(sessionId?: string | null): boolean {
    return Boolean(sessionId && this.sessions.has(sessionId));
  }

  getSession(sessionId: string | null = this.currentSessionId): MemorySession | null {
    const session = sessionId ? this.sessions.get(sessionId) : null;
    return session ? { ...session, metadata: { ...session.metadata }, turns: [...session.turns] } : null;
  }

  private _activateSession(sessionId?: string | null): MemorySession {
    if (sessionId) return this._createSession(sessionId, { source: 'conversation' });
    const id = this.currentSessionId || this.startSession();
    if (!this.sessions.has(id)) this.startSession(id);
    this.sessionTurns = this.sessions.get(id)!.turns;
    return this.sessions.get(id)!;
  }

  private _selectCompatibilitySession(): void {
    const newest = [...this.sessions.values()].sort((a, b) => b.startedAt - a.startedAt)[0] || null;
    this.currentSessionId = newest?.id || null;
    this.sessionTurns = newest?.turns || [];
  }

  recordTurn({
    role,
    text,
    source = 'live',
    speakerId = null,
    timestamp = Date.now(),
    sessionId = null
  }: {
    role?: string;
    text?: string;
    source?: string;
    speakerId?: string | null;
    timestamp?: number;
    sessionId?: string | null;
  } = {}): SessionTurn | null {
    if (!text || typeof text !== 'string') return null;
    const session = this._activateSession(sessionId);
    const turn: SessionTurn = {
      role: role || 'user',
      text: text.trim(),
      source,
      speakerId,
      timestamp
    };
    session.turns.push(turn);
    if (session.turns.length > this.maxSessionTurns) session.turns.shift();
    if (this.currentSessionId === session.id) this.sessionTurns = session.turns;
    return turn;
  }

  async endSession({
    sessionId = this.currentSessionId,
    summary = null,
    source = 'conversation'
  }: {
    sessionId?: string | null;
    summary?: string | null;
    source?: string;
  } = {}): Promise<MemoryItem | null> {
    const session = sessionId ? this.sessions.get(sessionId) : null;
    if (!session) return null;
    const turns = session.turns.slice();
    this.sessions.delete(sessionId!);
    if (this.currentSessionId === sessionId) this._selectCompatibilitySession();

    let storedSummary: MemoryItem | null = null;
    if (turns.length > 0) {
      storedSummary = await this.consolidateSession(turns, { sessionId: sessionId!, explicitSummary: summary, source });
    }

    eventBus.emitDomain(EVENTS.SESSION_ENDED, { sessionId, turnCount: turns.length, memoryId: storedSummary?.id || null }, {
      source,
      sessionId,
      privacy: 'internal'
    });
    return storedSummary;
  }

  async consolidateSession(turns: SessionTurn[], { sessionId, explicitSummary = null, source = 'conversation' }: { sessionId: string; explicitSummary?: string | null; source?: string }): Promise<MemoryItem | null> {
    if (!Array.isArray(turns) || turns.length === 0) return null;

    const userTurns = turns.filter((t) => t.role === 'user').map((t) => t.text);

    // 1. Autonomous Heuristic Fact & Preference Extraction
    const extractedItems = this._extractFactsAndPreferences(userTurns);
    for (const item of extractedItems) {
      try {
        await this.remember({
          key: item.key,
          content: item.content,
          category: item.category,
          importance: item.importance,
          confidence: item.confidence,
          source: `session_consolidation_${source}`,
          sessionId
        });
      } catch (err) {
        const error = err as Error;
        logger.warn('MEMORY', `Error al consolidar hecho extraído "${item.key}":`, error.message);
      }
    }

    // 2. Synthesize Coherent Multi-turn Narrative Summary
    let narrativeSummary = explicitSummary;
    if (!narrativeSummary) {
      narrativeSummary = this._synthesizeNarrativeSummary(turns);
    }

    // 3. Store the session summary with high importance for continuity
    const summaryMemory = await this.remember({
      key: `session_summary_${sessionId}`,
      content: narrativeSummary,
      category: MEMORY_CATEGORIES.CONVERSATION,
      importance: 0.88,
      confidence: 0.90,
      source,
      sessionId,
      context: {
        turnCount: turns.length,
        extractedCount: extractedItems.length,
        endedAt: new Date().toISOString()
      }
    });

    logger.info('MEMORY', `✓ Sesión ${sessionId} consolidada exitosamente (${extractedItems.length} hechos extraídos, resumen registrado).`);
    return summaryMemory;
  }

  private _extractFactsAndPreferences(userTexts: string[] = []): Array<{ key: string; content: string; category: string; importance: number; confidence: number }> {
    const extracted: Array<{ key: string; content: string; category: string; importance: number; confidence: number }> = [];
    const seenKeys = new Set<string>();

    const patterns = [
      {
        regex: /(?:recuerda\s+que|no\s+olvides\s+que|acu[eé]rdate\s+de\s+que|anota\s+que|guarda\s+que)\s+([^.!?\n]{5,120})/i,
        category: MEMORY_CATEGORIES.FACT,
        importance: 0.95,
        makeKey: (match: string) => `recuerdo_${match.slice(0, 20).replace(/\s+/g, '_').toLowerCase()}`
      },
      {
        regex: /(?:mi\s+(?:comida|juego|videojuego|m[uú]sica|canci[oó]n|color|pel[ií]cula|serie|bebida|anime|deporte)\s+favorit[oa]\s+es)\s+([^.!?\n]{3,80})/i,
        category: MEMORY_CATEGORIES.PREFERENCE,
        importance: 0.90,
        makeKey: (match: string) => `favorito_${match.slice(0, 20).replace(/\s+/g, '_').toLowerCase()}`
      },
      {
        regex: /(?:me\s+gusta\s+mucho|me\s+encanta|adoro|disfruto\s+de)\s+([^.!?\n]{3,80})/i,
        category: MEMORY_CATEGORIES.PREFERENCE,
        importance: 0.85,
        makeKey: (match: string) => `gusta_${match.slice(0, 20).replace(/\s+/g, '_').toLowerCase()}`
      },
      {
        regex: /(?:odio|detesto|no\s+me\s+gusta\s+nada|me\s+desagrada)\s+([^.!?\n]{3,80})/i,
        category: MEMORY_CATEGORIES.PREFERENCE,
        importance: 0.85,
        makeKey: (match: string) => `disgusta_${match.slice(0, 20).replace(/\s+/g, '_').toLowerCase()}`
      },
      {
        regex: /(?:vivo\s+en|me\s+mud[eé]\s+a|resido\s+en)\s+([^.!?\n]{3,60})/i,
        category: MEMORY_CATEGORIES.FACT,
        importance: 0.95,
        makeKey: () => 'usuario_residencia'
      },
      {
        regex: /(?:estoy\s+(?:trabajando|desarrollando|creando|empezando)\s+(?:en|un|una)?\s*)([^.!?\n]{5,100})/i,
        category: MEMORY_CATEGORIES.TASK,
        importance: 0.90,
        makeKey: (match: string) => `proyecto_${match.slice(0, 20).replace(/\s+/g, '_').toLowerCase()}`
      },
      {
        regex: /(?:mi\s+proyecto\s+(?:actual\s+)?es\s+)([^.!?\n]{5,100})/i,
        category: MEMORY_CATEGORIES.TASK,
        importance: 0.90,
        makeKey: () => 'proyecto_actual'
      },
      {
        regex: /(?:mañana\s+(?:tengo\s+que|voy\s+a)|planeo|tengo\s+planeado)\s+([^.!?\n]{5,100})/i,
        category: MEMORY_CATEGORIES.TASK,
        importance: 0.85,
        makeKey: (match: string) => `plan_${match.slice(0, 20).replace(/\s+/g, '_').toLowerCase()}`
      }
    ];

    for (const text of userTexts) {
      if (!text || typeof text !== 'string') continue;
      for (const pattern of patterns) {
        const match = text.match(pattern.regex);
        if (match && match[1]) {
          const content = match[0].trim();
          const key = pattern.makeKey(match[1]);
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            extracted.push({
              key,
              content: content.length > 150 ? content.slice(0, 150) + '...' : content,
              category: pattern.category,
              importance: pattern.importance,
              confidence: 0.85
            });
          }
        }
      }
    }

    return extracted;
  }

  private _synthesizeNarrativeSummary(turns: SessionTurn[] = []): string {
    if (turns.length <= 2) {
      return turns.map((t) => `${t.role}: ${t.text}`).join(' | ').slice(0, 500);
    }
    const userUtterances = turns.filter((t) => t.role === 'user').map((t) => t.text);

    const firstTopic = userUtterances[0] || 'conversación general';
    const middleTopics = userUtterances.slice(1, -1).slice(0, 3);
    const lastTopic = userUtterances[userUtterances.length - 1] || '';

    const summaryParts = [
      `Ariel conversó sobre: "${firstTopic.slice(0, 100)}"`,
      middleTopics.length ? `También trataron temas como: ${middleTopics.map((m) => `"${m.slice(0, 60)}"`).join(', ')}` : null,
      lastTopic ? `La conversación concluyó con: "${lastTopic.slice(0, 80)}"` : null
    ].filter(Boolean);

    return summaryParts.join('. ').slice(0, 1200);
  }

  async loadMemories(): Promise<void> {
    try {
      const persisted = await this.repository.load();
      if (Array.isArray(persisted) && persisted.length > 0) {
        this.memories = persisted.map((memory) => this.normalizeMemory(memory as unknown as Partial<MemoryItem>));
        return;
      }
      this.memories = [];
    } catch (err) {
      logger.error('MEMORY', 'Error al cargar memorias:', err);
      this.memories = [];
    }
  }

  normalizeMemory(memory: Partial<MemoryItem> = {}): MemoryItem {
    const now = new Date().toISOString();
    return {
      id: memory.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      key: String(memory.key || '').trim(),
      content: String(memory.content || '').trim(),
      category: memory.category || MEMORY_CATEGORIES.FACT,
      importance: Math.max(0.1, Math.min(1, Number(memory.importance) || 0.5)),
      confidence: Math.max(0, Math.min(1, Number.isFinite(Number(memory.confidence)) ? Number(memory.confidence) : 0.7)),
      status: memory.status || 'active',
      source: memory.source || 'user',
      sessionId: memory.sessionId || null,
      context: memory.context || {},
      tags: Array.isArray(memory.tags) ? memory.tags : [],
      relatedMemoryIds: Array.isArray(memory.relatedMemoryIds) ? memory.relatedMemoryIds : [],
      supersedes: memory.supersedes || null,
      previousVersions: Array.isArray(memory.previousVersions) ? memory.previousVersions : [],
      validFrom: memory.validFrom || memory.createdAt || now,
      validUntil: memory.validUntil || null,
      createdAt: memory.createdAt || now,
      updatedAt: memory.updatedAt || now,
      lastAccessedAt: memory.lastAccessedAt || now,
      accessCount: Number(memory.accessCount) || 0
    };
  }

  async saveMemories(): Promise<void> {
    try {
      await this.repository.save(this.memories);
      eventBus.emit(EVENTS.CONFIG_CHANGED, { type: 'memory_updated', count: this.memories.length });
    } catch (err) {
      logger.error('MEMORY', 'Error al guardar memorias:', err);
      throw err;
    }
  }

  async remember({
    key,
    content,
    category = MEMORY_CATEGORIES.FACT,
    importance = 0.8,
    confidence = 0.8,
    source = 'user',
    sessionId = null,
    context = {},
    tags = [],
    relatedMemoryIds = [],
    validUntil = null
  }: RememberOptions): Promise<MemoryItem | null> {
    if (!content || typeof content !== 'string') return null;

    const cleanContent = content.trim();
    const cleanKey = (key || cleanContent.slice(0, 30)).trim();

    const existingIndex = this.memories.findIndex(
      (m) => String(m.key || '').toLowerCase() === cleanKey.toLowerCase() || String(m.content || '').toLowerCase() === cleanContent.toLowerCase()
    );

    const now = new Date().toISOString();
    const previous = existingIndex >= 0 ? this.memories[existingIndex] : null;
    const isContradiction = previous && previous.content.toLowerCase() !== cleanContent.toLowerCase();

    const memoryItem = this.normalizeMemory({
      id: existingIndex >= 0 ? this.memories[existingIndex].id : `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      key: cleanKey,
      content: cleanContent,
      category,
      importance: Math.max(0.1, Math.min(1.0, Number(importance) || 0.8)),
      confidence,
      source,
      sessionId: sessionId || this.currentSessionId,
      context,
      tags,
      relatedMemoryIds,
      validUntil,
      supersedes: null,
      previousVersions: isContradiction
        ? [...(previous.previousVersions || []), { content: previous.content, updatedAt: previous.updatedAt, source: previous.source }].slice(-10)
        : (previous?.previousVersions || []),
      updatedAt: now,
      createdAt: existingIndex >= 0 ? this.memories[existingIndex].createdAt : now,
      accessCount: existingIndex >= 0 ? (this.memories[existingIndex].accessCount || 0) + 1 : 1
    });

    if (existingIndex >= 0) {
      this.memories[existingIndex] = memoryItem;
      logger.info('MEMORY', `Recuerdo actualizado: [${category}] "${cleanKey}"`);
      eventBus.emitDomain(EVENTS.MEMORY_UPDATED, memoryItem, { source, sessionId: memoryItem.sessionId });
    } else {
      this.memories.unshift(memoryItem);
      logger.info('MEMORY', `Nuevo recuerdo fijado: [${category}] "${cleanKey}": ${cleanContent}`);
      eventBus.emitDomain(EVENTS.MEMORY_CREATED, memoryItem, { source, sessionId: memoryItem.sessionId });
    }

    this.memoryIndex.set(cleanKey.toLowerCase(), memoryItem.id);
    this.semanticIndex.upsert(memoryItem);
    await this.saveMemories();
    return memoryItem;
  }

  async manageMemory({
    action = 'store',
    key = '',
    content = '',
    value = '',
    category = MEMORY_CATEGORIES.FACT,
    importance = 0.8,
    reason = '',
    query = '',
    id = null
  }: ManageMemoryParams = {}): Promise<ManageMemoryResult> {
    const act = String(action || 'store').toLowerCase();
    const effectiveContent = content || value || key;
    switch (act) {
      case 'store':
      case 'remember':
      case 'save': {
        const item = await this.remember({
          key,
          content: effectiveContent,
          category,
          importance: Number(importance) || 0.8,
          context: reason ? { initialReason: reason } : {}
        });
        return {
          status: 'success',
          action: 'store',
          memory: item!,
          message: `Recuerdo guardado: [${item!.category}] "${item!.key}"`
        };
      }
      case 'update': {
        const item = await this.remember({
          key,
          content: effectiveContent,
          category,
          importance: Number(importance) || 0.8,
          context: { updateReason: reason || 'actualización explícita' }
        });
        return {
          status: 'success',
          action: 'update',
          memory: item!,
          message: `Recuerdo actualizado: [${item!.category}] "${item!.key}"`
        };
      }
      case 'recall':
      case 'search':
      case 'get': {
        const q = String(query || key || effectiveContent || '').trim();
        const results = this.retrieveRelevant(q, { limit: 6 });
        return {
          status: 'success',
          action: 'recall',
          query: q,
          count: results.length,
          results: results.map((m) => ({ id: m.id, key: m.key, content: m.content, category: m.category, importance: m.importance }))
        };
      }
      case 'invalidate':
      case 'forget': {
        const target = id || key;
        const ok = await this.invalidateMemory(target, reason || 'solicitado por el usuario');
        return {
          status: ok ? 'success' : 'not_found',
          action: 'invalidate',
          idOrKey: target,
          message: ok ? `Recuerdo "${target}" invalidado.` : `Recuerdo "${target}" no encontrado.`
        };
      }
      case 'get_recent':
      case 'list': {
        const top = this.getTopMemories(8);
        return {
          status: 'success',
          action: 'get_recent',
          count: top.length,
          memories: top.map((m) => ({ id: m.id, key: m.key, content: m.content, category: m.category }))
        };
      }
      default:
        return { status: 'error', message: `Acción de memoria no reconocida: "${action}".` };
    }
  }

  search(query: string, { limit = 6, minScore = 0.1 }: { limit?: number; minScore?: number } = {}): MemoryItem[] {
    if (!query || typeof query !== 'string') return this.getTopMemories(limit);

    const tokens = query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((t) => t.length > 1);
    if (tokens.length === 0) return this.getTopMemories(limit);

    const semanticScores = this.semanticIndex.score(query);
    const scored = this.memories.map((mem) => {
      if (mem.status && mem.status !== 'active') return { mem, score: 0 };
      if (mem.validUntil && new Date(mem.validUntil).getTime() < Date.now()) return { mem, score: 0 };
      let score = 0;
      const text = `${mem.key} ${mem.content} ${mem.category}`.toLowerCase();

      tokens.forEach((token) => {
        if (text.includes(token)) {
          score += 1.0;
        }
      });

      const ageDays = Math.max(0, (Date.now() - new Date(mem.updatedAt || mem.createdAt || Date.now()).getTime()) / 86400000);
      const recency = 1 / (1 + ageDays * 0.03);
      score = score * (mem.importance || 0.5) * (mem.confidence || 0.7) * recency;
      const semantic = semanticScores.get(mem.id) || 0;
      score = score > 0 ? score * 0.72 + semantic * 0.28 : semantic * 0.28;

      return { mem, score };
    });

    return scored
      .filter((s) => s.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => {
        s.mem.accessCount = (s.mem.accessCount || 0) + 1;
        s.mem.lastAccessedAt = new Date().toISOString();
        return s.mem;
      });
  }

  recall(query: string, options: { limit?: number; minScore?: number } = {}): MemoryItem[] {
    return this.retrieveRelevant(query, options);
  }

  retrieveRelevant(query: string, options: { limit?: number; minScore?: number } = {}): MemoryItem[] {
    const results = this.search(query, options);
    eventBus.emitDomain(EVENTS.MEMORY_RETRIEVED, {
      query: query || '',
      memoryIds: results.map((memory) => memory.id),
      count: results.length
    }, { source: 'memory', sessionId: this.currentSessionId });
    return results;
  }

  getTopMemories(limit = 10): MemoryItem[] {
    return [...this.memories]
      .filter((memory) => memory.status === 'active' && (!memory.validUntil || new Date(memory.validUntil).getTime() >= Date.now()))
      .sort((a, b) => (b.importance || 0.5) - (a.importance || 0.5))
      .slice(0, limit);
  }

  getProactiveContext({ limit = 4, excludeMemoryIds = [], maxConversationAgeDays = 21 }: { limit?: number; excludeMemoryIds?: string[]; maxConversationAgeDays?: number } = {}): MemoryItem[] {
    const now = Date.now();
    const excluded = new Set(excludeMemoryIds);
    const active = this.memories.filter((memory) => memory.status === 'active'
      && !excluded.has(memory.id)
      && (!memory.validUntil || new Date(memory.validUntil).getTime() >= now));
    const recentConversationCutoff = now - Math.max(1, Number(maxConversationAgeDays) || 21) * 86400000;
    const recency = (left: MemoryItem, right: MemoryItem) => new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime();
    const recentConversations = active
      .filter((memory) => memory.category === MEMORY_CATEGORIES.CONVERSATION && new Date(memory.updatedAt || memory.createdAt).getTime() >= recentConversationCutoff)
      .sort(recency);
    const openTasks = active
      .filter((memory) => memory.category === MEMORY_CATEGORIES.TASK)
      .sort((left, right) => (right.importance - left.importance) || recency(left, right));
    const selected = [...recentConversations, ...openTasks];
    return selected.slice(0, Math.max(1, Math.floor(Number(limit) || 4)));
  }

  getAllMemories(): MemoryItem[] {
    return [...this.memories];
  }

  getMemory(id: string): MemoryItem | null {
    return this.memories.find((m) => m.id === id) || null;
  }

  getByCategory(category: string): MemoryItem[] {
    if (!category) return [];
    return this.memories.filter((m) => m.category === category);
  }

  async deleteMemory(idOrKey: string): Promise<boolean> {
    const beforeCount = this.memories.length;
    const removed = this.memories.filter((m) => m.id === idOrKey || m.key === idOrKey);
    this.memories = this.memories.filter((m) => m.id !== idOrKey && m.key !== idOrKey);
    if (this.memories.length !== beforeCount) {
      for (const memory of removed) this.semanticIndex.remove(memory.id);
      this.rebuildIndex();
      await this.saveMemories();
      logger.info('MEMORY', `Recuerdo eliminado: ${idOrKey}`);
      return true;
    }
    return false;
  }

  async invalidateMemory(idOrKey: string, reason = 'obsolete'): Promise<boolean> {
    const memory = this.memories.find((item) => item.id === idOrKey || item.key === idOrKey);
    if (!memory) return false;
    memory.status = 'invalidated';
    memory.updatedAt = new Date().toISOString();
    memory.context = { ...(memory.context || {}), invalidationReason: reason };
    await this.saveMemories();
    eventBus.emitDomain(EVENTS.MEMORY_INVALIDATED, memory, { source: 'memory', sessionId: this.currentSessionId });
    return true;
  }

  async forget(idOrKey: string, reason = 'solicitado por usuario'): Promise<boolean> {
    return this.invalidateMemory(idOrKey, reason);
  }

  async clearAll(): Promise<boolean> {
    this.memories = [];
    this.rebuildIndex();
    await this.saveMemories();
    logger.info('MEMORY', 'Todas las memorias han sido vaciadas.');
    return true;
  }

  destroy(): void {
    this.sessions.clear();
    this.memories = [];
    this.semanticIndex.clear();
  }

  getSystemPromptContext({ limit = 14, maxConversationSummaries = 2 }: { query?: string; limit?: number; maxConversationSummaries?: number; maxChars?: number } = {}): string {
    if (this.memories.length === 0) return '';

    const active = this.memories.filter((m) => m.status === 'active' && (!m.validUntil || new Date(m.validUntil).getTime() >= Date.now()));
    const byRecency = (left: MemoryItem, right: MemoryItem) => new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime();

    const facts = active.filter((m) => m.category === MEMORY_CATEGORIES.FACT || m.category === MEMORY_CATEGORIES.RELATIONSHIP)
      .sort((a, b) => (b.importance - a.importance) || byRecency(a, b)).slice(0, 5);
    const preferences = active.filter((m) => m.category === MEMORY_CATEGORIES.PREFERENCE)
      .sort((a, b) => (b.importance - a.importance) || byRecency(a, b)).slice(0, 4);
    const tasks = active.filter((m) => m.category === MEMORY_CATEGORIES.TASK)
      .sort((a, b) => (b.importance - a.importance) || byRecency(a, b)).slice(0, 3);
    const recentConversations = active.filter((m) => m.category === MEMORY_CATEGORIES.CONVERSATION)
      .sort(byRecency).slice(0, maxConversationSummaries);

    const sections: string[] = [];

    if (facts.length > 0) {
      sections.push('[HECHOS SOBRE ARIEL]\n' + facts.map((m) => `- ${m.key}: ${m.content}`).join('\n'));
    }

    if (preferences.length > 0) {
      sections.push('[GUSTOS Y PREFERENCIAS]\n' + preferences.map((m) => `- ${m.key}: ${m.content}`).join('\n'));
    }

    if (tasks.length > 0) {
      sections.push('[PROYECTOS Y TAREAS EN CURSO]\n' + tasks.map((m) => `- ${m.key}: ${m.content}`).join('\n'));
    }

    if (recentConversations.length > 0) {
      const latestSummary = recentConversations[0];
      const hoursAgo = Math.max(0, Math.round((Date.now() - new Date(latestSummary.updatedAt || latestSummary.createdAt).getTime()) / 3600000));
      const timeLabel = hoursAgo === 0 ? 'hace un momento' : hoursAgo === 1 ? 'hace 1 hora' : `hace ${hoursAgo} horas`;
      sections.push(`[CONTINUIDAD DE LA ÚLTIMA SESIÓN (${timeLabel})]\n- ${latestSummary.content}\n(Directiva de continuidad: Si Ariel te saluda o hace una pausa, puedes retomar amablemente algún tema de esta conversación previa).`);
    }

    if (sections.length === 0) return '';

    const silentMemoryDirective = '\n\n[DIRECTIVA DE MEMORIA SILENCIOSA E INMERSIÓN TOTAL]: Tienes estrictamente prohibido verbalizar frases como "He guardado esto en mi memoria", "Anotado en la base de datos", "He registrado tu preferencia" o aludir a acciones de persistencia. La memoria opera 100% en silencio de fondo; tu respuesta auditiva debe fluir con naturalidad humana, afecto y espontaneidad.';

    return `\n\n=== RECUERDOS Y MEMORIA PERMANENTE DE CRISTI ===\n${sections.join('\n\n')}\nUtiliza estos recuerdos de manera natural, afectuosa y sutil en tus respuestas cuando sean relevantes.${silentMemoryDirective}`;
  }

  getMemoryContextPrompt(limit = 12, query = ''): string {
    return this.getSystemPromptContext({ limit, query });
  }
}

export const memoryService = new MemoryService();
export default memoryService;
