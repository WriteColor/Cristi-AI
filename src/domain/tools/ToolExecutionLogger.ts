export type ToolExecutionStatus = 'running' | 'success' | 'warning' | 'error' | 'cancelled';

export type ToolRootCauseCategory =
  | 'system_io'
  | 'mcp_protocol'
  | 'process_spawn'
  | 'network'
  | 'validation'
  | 'authorization'
  | 'runtime'
  | 'unknown';

export interface ToolRootCause {
  message: string;
  code?: string;
  type?: string;
  category: ToolRootCauseCategory;
  stack?: string;
  chain: string[];
  remediationSuggestion: string;
  rawError?: unknown;
}

export interface ToolExecutionRecord {
  id: string;
  toolName: string;
  category: string;
  args: Record<string, any>;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  status: ToolExecutionStatus;
  result?: any;
  warning?: string;
  error?: string;
  rootCause?: ToolRootCause;
}

export const EVENTS = {
  TOOL_EXECUTION_LOGGED: 'tool_execution_logged'
} as const;

let resolvedEventBus: any = null;
let resolvedLogger: any = {
  info: (tag: string, msg: string) => {
    if (typeof console !== 'undefined') console.info?.(`[${tag}] ${msg}`);
  },
  warn: (tag: string, msg: string) => {
    if (typeof console !== 'undefined') console.warn?.(`[${tag}] ${msg}`);
  },
  error: (tag: string, msg: string) => {
    if (typeof console !== 'undefined') console.error?.(`[${tag}] ${msg}`);
  }
};

if (typeof globalThis !== 'undefined') {
  if ((globalThis as any).__cristiEventBus) {
    resolvedEventBus = (globalThis as any).__cristiEventBus;
  }
  if ((globalThis as any).__cristiLogger) {
    resolvedLogger = (globalThis as any).__cristiLogger;
  }
}

try {
  import('../../infrastructure/events/eventBus.js')
    .then(mod => {
      if (mod?.eventBus) resolvedEventBus = mod.eventBus;
    })
    .catch(() => {});
  import('../../infrastructure/logging/logger.js')
    .then(mod => {
      if (mod?.logger) resolvedLogger = mod.logger;
    })
    .catch(() => {});
} catch (_) {}

export function classifyToolCategory(toolName: string): string {
  if (toolName.startsWith('spotify_') || toolName.includes('spotify')) return 'multimedia_spotify';
  if (toolName.startsWith('mcp_')) return 'mcp_ecosystem';
  if (toolName.startsWith('avatar_') || toolName.includes('emotion') || toolName.includes('motion')) return 'avatar_live2d';
  if (toolName.includes('file') || toolName.includes('directory')) return 'filesystem';
  if (toolName.includes('memory')) return 'cognitive_memory';
  if (toolName.includes('system') || toolName.includes('time') || toolName.includes('weather') || toolName.includes('clipboard')) return 'system_os';
  return 'general';
}

export function unwrapRootCause(err: unknown, resultPayload?: any): ToolRootCause {
  const chain: string[] = [];
  let current: any = err;
  let deepestError: any = err;
  let code: string | undefined;
  let stack: string | undefined;

  // Crawl through error causes
  while (current) {
    const msg = current?.message || String(current);
    chain.push(msg);
    if (current?.code && !code) code = String(current.code);
    if (current?.stack && !stack) stack = current.stack;
    deepestError = current;
    current = current?.cause || current?.parent || current?.innerError;
  }

  // If no thrown exception but tool returned error status payload
  if (chain.length === 0 && resultPayload) {
    const msg = resultPayload?.error || resultPayload?.message || 'Error no especificado';
    chain.push(String(msg));
  }

  const rootMessage = deepestError?.message || chain[chain.length - 1] || 'Error desconocido';
  const combinedText = chain.join(' | ') + (code ? ` [code: ${code}]` : '');

  // Determine category and actionable remediation
  let category: ToolRootCauseCategory = 'runtime';
  let remediationSuggestion = 'Revise los parámetros enviados a la herramienta y el estado del servicio.';

  if (code === 'ENOENT' || /ENOENT|not recognized|no se reconoce|spawn.*failed/i.test(combinedText)) {
    category = 'process_spawn';
    remediationSuggestion = 'El ejecutable o archivo no existe en la ruta especificada o no se encuentra en la variable PATH del sistema. Verifique la instalación con pnpm o uv.';
  } else if (code === 'EACCES' || code === 'EPERM' || /permission denied|unauthorized|no autorizado|acceso denegado/i.test(combinedText)) {
    category = 'authorization';
    remediationSuggestion = 'El sistema operativo o la política de seguridad denegó el acceso. Verifique que la ruta esté dentro del workspace autorizado o ejecute con permisos suficientes.';
  } else if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || /fetch failed|network|socket|econnreset/i.test(combinedText)) {
    category = 'network';
    remediationSuggestion = 'Fallo de conectividad de red o resolución DNS. Verifique la conexión a internet del sistema o la disponibilidad del endpoint remoto.';
  } else if (/mcp|jsonrpc|stdio|initialize|tools\/call|parse error/i.test(combinedText)) {
    category = 'mcp_protocol';
    remediationSuggestion = 'El servidor MCP falló en el handshake o protocolo JSON-RPC. Verifique que el servidor stdio/sse responda al comando initialize y que los argumentos sean válidos.';
  } else if (/invalid_type|unrecognized_keys|validation|parámetro requerido|requerida/i.test(combinedText)) {
    category = 'validation';
    remediationSuggestion = 'Los argumentos proporcionados no cumplen con el esquema de parámetros requerido por la herramienta.';
  } else if (code === 'EBUSY' || code === 'ENOSPC' || /disk|io error|filesystem/i.test(combinedText)) {
    category = 'system_io';
    remediationSuggestion = 'Error de lectura o escritura en disco. Verifique que el archivo no esté bloqueado por otro proceso y que haya espacio disponible.';
  }

  return {
    message: rootMessage,
    code,
    type: deepestError?.name || (typeof err === 'object' && err !== null ? (err as any).constructor?.name : undefined),
    category,
    stack,
    chain,
    remediationSuggestion,
    rawError: err
  };
}

export class ToolExecutionLogger {
  private records: ToolExecutionRecord[] = [];
  private activeCalls = new Map<string, ToolExecutionRecord>();
  private readonly maxCapacity: number;
  private totalExecuted = 0;
  private totalSuccess = 0;
  private totalWarning = 0;
  private totalError = 0;
  private totalCancelled = 0;
  private customEventBus: any = null;
  private customLogger: any = null;

  constructor(options: { maxCapacity?: number; eventBus?: any; logger?: any } = {}) {
    this.maxCapacity = options.maxCapacity !== undefined ? Math.max(1, options.maxCapacity) : 200;
    if (options.eventBus) this.customEventBus = options.eventBus;
    if (options.logger) this.customLogger = options.logger;
  }

  private getEventBus(): any {
    return this.customEventBus || resolvedEventBus || (typeof globalThis !== 'undefined' && (globalThis as any).__cristiEventBus);
  }

  private getLogger(): any {
    return this.customLogger || resolvedLogger;
  }

  start(toolName: string, args: Record<string, any> = {}, callId?: string): string {
    const id = callId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record: ToolExecutionRecord = {
      id,
      toolName,
      category: classifyToolCategory(toolName),
      args: { ...args },
      startedAt: Date.now(),
      status: 'running'
    };
    this.activeCalls.set(id, record);
    return id;
  }

  finishSuccess(callId: string, result: any): ToolExecutionRecord {
    const record = this.finalizeRecord(callId, 'success', result);
    this.totalSuccess++;
    this.getLogger()?.info?.('TOOL_LOGGER', `✓ [${record.toolName}] Éxito en ${record.durationMs}ms`);
    return record;
  }

  finishWarning(callId: string, result: any, warningMessage: string): ToolExecutionRecord {
    const record = this.finalizeRecord(callId, 'warning', result, warningMessage);
    this.totalWarning++;
    this.getLogger()?.warn?.('TOOL_LOGGER', `⚠ [${record.toolName}] Advertencia: ${warningMessage}`);
    return record;
  }

  finishError(callId: string, error: unknown, resultPayload?: any): ToolExecutionRecord {
    const rootCause = unwrapRootCause(error, resultPayload);
    const errorMsg = rootCause.message;
    const record = this.finalizeRecord(callId, 'error', resultPayload || { error: errorMsg }, undefined, errorMsg, rootCause);
    this.totalError++;
    this.getLogger()?.error?.('TOOL_LOGGER', `✗ [${record.toolName}] Error Causa Raíz (${rootCause.category}): ${rootCause.message} -> ${rootCause.remediationSuggestion}`);
    return record;
  }

  finishCancelled(callId: string, reason = 'Ejecución cancelada por el usuario o timeout'): ToolExecutionRecord {
    const record = this.finalizeRecord(callId, 'cancelled', { cancelled: true, message: reason }, undefined, reason);
    this.totalCancelled++;
    this.getLogger()?.info?.('TOOL_LOGGER', `⏹ [${record.toolName}] Cancelada: ${reason}`);
    return record;
  }

  private finalizeRecord(
    callId: string,
    status: ToolExecutionStatus,
    result?: any,
    warning?: string,
    error?: string,
    rootCause?: ToolRootCause
  ): ToolExecutionRecord {
    const existing = this.activeCalls.get(callId) || {
      id: callId,
      toolName: 'unknown',
      category: 'general',
      args: {},
      startedAt: Date.now(),
      status: 'running'
    };

    this.activeCalls.delete(callId);
    const finishedAt = Date.now();
    const durationMs = Math.max(0, finishedAt - existing.startedAt);

    const record: ToolExecutionRecord = {
      ...existing,
      finishedAt,
      durationMs,
      status,
      result,
      warning,
      error,
      rootCause
    };

    this.totalExecuted++;
    this.records.unshift(record);
    if (this.records.length > this.maxCapacity) {
      this.records.length = this.maxCapacity;
    }

    const bus = this.getEventBus();
    bus?.emit?.(EVENTS.TOOL_EXECUTION_LOGGED, record);

    return record;
  }

  getHistory(limit = 50, filterStatus?: ToolExecutionStatus): ToolExecutionRecord[] {
    let result = this.records;
    if (filterStatus) {
      result = result.filter(r => r.status === filterStatus);
    }
    return result.slice(0, limit);
  }

  getRecord(id: string): ToolExecutionRecord | undefined {
    return this.records.find(r => r.id === id) || this.activeCalls.get(id);
  }

  clearHistory(): void {
    this.records = [];
    this.activeCalls.clear();
  }

  getStatistics() {
    const completed = this.records.filter(r => r.durationMs !== undefined);
    const avgDurationMs = completed.length > 0
      ? Math.round(completed.reduce((acc, r) => acc + (r.durationMs || 0), 0) / completed.length)
      : 0;

    return {
      total: this.totalExecuted,
      success: this.totalSuccess,
      warning: this.totalWarning,
      error: this.totalError,
      cancelled: this.totalCancelled,
      avgDurationMs
    };
  }
}

export const toolExecutionLogger = new ToolExecutionLogger();
export default toolExecutionLogger;
