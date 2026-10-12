import type { IToolHandler, ToolExecutionContext, GeminiFunctionDeclaration } from './IToolHandler';
import type { GeminiLiveToolCall, GeminiLiveToolResponse } from '@/types/gemini.types';
// @ts-ignore
import { toolExecutionLogger } from './ToolExecutionLogger.ts';

let logger: any = {
  info: (tag: string, msg: string, ...args: any[]) => {
    if (typeof console !== 'undefined') console.info?.(`[${tag}] ${msg}`, ...args);
  },
  warn: (tag: string, msg: string, ...args: any[]) => {
    if (typeof console !== 'undefined') console.warn?.(`[${tag}] ${msg}`, ...args);
  },
  error: (tag: string, msg: string, ...args: any[]) => {
    if (typeof console !== 'undefined') console.error?.(`[${tag}] ${msg}`, ...args);
  }
};

let mcpClientManager: any = null;

if (typeof globalThis !== 'undefined') {
  if ((globalThis as any).__cristiLogger) logger = (globalThis as any).__cristiLogger;
  if ((globalThis as any).__cristiMcpClientManager) mcpClientManager = (globalThis as any).__cristiMcpClientManager;
}

try {
  import('../../infrastructure/logging/logger.js')
    .then(mod => {
      if (mod?.logger) logger = mod.logger;
    })
    .catch(() => {});
  import('../integrations/mcp/MCPClientManager.js')
    .then(mod => {
      if (mod?.mcpClientManager) mcpClientManager = mod.mcpClientManager;
    })
    .catch(() => {});
} catch (_) {}

export class ToolRegistry {
  private readonly handlers = new Map<string, IToolHandler>();

  /**
   * Registra un nuevo manejador de herramienta (Command Pattern).
   */
  register(handler: IToolHandler): this {
    if (!handler || !handler.name) {
      throw new Error('ToolRegistry.register: El manejador debe tener un nombre válido.');
    }
    this.handlers.set(handler.name, handler);
    return this;
  }

  /**
   * Registra múltiples manejadores de herramientas a la vez.
   */
  registerMany(handlers: IToolHandler[]): this {
    if (Array.isArray(handlers)) {
      for (const handler of handlers) {
        this.register(handler);
      }
    }
    return this;
  }

  /**
   * Desregistra una herramienta por su nombre.
   */
  unregister(name: string): boolean {
    return this.handlers.delete(name);
  }

  /**
   * Obtiene el manejador de una herramienta por su nombre o alias federado.
   */
  get(name: string): IToolHandler | undefined {
    if (this.handlers.has(name)) return this.handlers.get(name);
    if (name.startsWith('mcp_cristi_spotify_spotify_')) {
      const alias = 'spotify_' + name.slice('mcp_cristi_spotify_spotify_'.length);
      if (this.handlers.has(alias)) return this.handlers.get(alias);
    } else if (name.startsWith('mcp_cristi_spotify_')) {
      const alias = name.slice('mcp_cristi_spotify_'.length);
      if (this.handlers.has(alias)) return this.handlers.get(alias);
      if (this.handlers.has('spotify_' + alias)) return this.handlers.get('spotify_' + alias);
    } else if (name.startsWith('mcp_cristi_playwright_browser_')) {
      const alias = 'browser_' + name.slice('mcp_cristi_playwright_browser_'.length);
      if (this.handlers.has(alias)) return this.handlers.get(alias);
    } else if (name.startsWith('mcp_cristi_playwright_')) {
      const alias = name.slice('mcp_cristi_playwright_'.length);
      if (this.handlers.has(alias)) return this.handlers.get(alias);
      if (this.handlers.has('browser_' + alias)) return this.handlers.get('browser_' + alias);
    } else if (name === 'play_youtube_video' || name === 'play_youtube' || name === 'youtube_play') {
      if (this.handlers.has('browser_play_youtube_video')) return this.handlers.get('browser_play_youtube_video');
    }
    return undefined;
  }

  /**
   * Verifica si una herramienta o alias federado está registrado.
   */
  has(name: string): boolean {
    return Boolean(this.get(name));
  }

  /**
   * Retorna la lista completa de manejadores registrados.
   */
  getAllHandlers(): IToolHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Retorna todas las declaraciones de esquema para la API de Gemini Live.
   */
  getAllDeclarations(): GeminiFunctionDeclaration[] {
    return Array.from(this.handlers.values()).map(h => h.declaration);
  }

  /**
   * Retorna la cantidad total de herramientas registradas.
   */
  getToolsCount(): number {
    return this.handlers.size;
  }

  /**
   * Ejecuta una sola herramienta por nombre con aislamiento de fallos y trazabilidad profunda.
   */
  async executeTool(
    name: string,
    args: Record<string, any> = {},
    context: ToolExecutionContext = {},
    callId?: string
  ): Promise<any> {
    const loggedId = toolExecutionLogger.start(name || 'unknown', args, callId);

    if (!name || typeof name !== 'string') {
      const errPayload = { status: 'error', message: 'Nombre de herramienta inválido.' };
      toolExecutionLogger.finishError(loggedId, 'Nombre de herramienta inválido.', errPayload);
      return errPayload;
    }

    if (context?.signal?.aborted) {
      const cancelPayload = { status: 'cancelled', message: 'Ejecución de herramienta cancelada.', cancelled: true };
      toolExecutionLogger.finishCancelled(loggedId, 'Ejecución de herramienta cancelada por señal de aborto.');
      return cancelPayload;
    }

    const targetHandler = this.get(name);

    if (targetHandler) {
      try {
        const result = await targetHandler.execute(args, context);

        if (context?.signal?.aborted) {
          const cancelPayload = { status: 'cancelled', message: 'Ejecución de herramienta cancelada.', cancelled: true };
          toolExecutionLogger.finishCancelled(loggedId, 'Ejecución de herramienta cancelada por señal de aborto.');
          return cancelPayload;
        }

        if (result && typeof result === 'object') {
          if (result.status === 'cancelled' || result.cancelled === true) {
            toolExecutionLogger.finishCancelled(loggedId, result.message || 'Ejecución cancelada.');
            return result;
          }
          if (result.status === 'error' || Boolean(result.error)) {
            const errDetail = result.error || result.message || 'Error en ejecución de herramienta';
            toolExecutionLogger.finishError(loggedId, errDetail, result);
            return result;
          }
          if (result.warning) {
            toolExecutionLogger.finishWarning(loggedId, result, String(result.warning));
            return result;
          }
        }

        toolExecutionLogger.finishSuccess(loggedId, result);
        return result;
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        logger.error('TOOL', `Error al ejecutar handler de "${name}":`, errorMsg);
        const errorPayload = {
          status: 'error',
          name,
          error: errorMsg,
          message: errorMsg
        };
        toolExecutionLogger.finishError(loggedId, err, errorPayload);
        return errorPayload;
      }
    }

    // Soporte para herramientas descubiertas dinámicamente vía servidores MCP conectados
    if (mcpClientManager && (mcpClientManager as any).discoveredTools?.has(name)) {
      if (context?.signal?.aborted) {
        const cancelPayload = { status: 'cancelled', message: 'Ejecución de herramienta MCP cancelada por señal de aborto.', cancelled: true };
        toolExecutionLogger.finishCancelled(loggedId, 'Ejecución de herramienta MCP cancelada por señal de aborto.');
        return cancelPayload;
      }
      try {
        const result = await (mcpClientManager as any).executeMCPTool(name, args, context?.signal);
        if (context?.signal?.aborted) {
          const cancelPayload = { status: 'cancelled', message: 'Ejecución de herramienta MCP cancelada tras invocación.', cancelled: true };
          toolExecutionLogger.finishCancelled(loggedId, 'Ejecución de herramienta MCP cancelada tras invocación.');
          return cancelPayload;
        }

        if (result && typeof result === 'object') {
          if (result.status === 'cancelled' || result.cancelled === true) {
            toolExecutionLogger.finishCancelled(loggedId, result.message || 'Ejecución MCP cancelada.');
            return result;
          }
          if (result.status === 'error' || Boolean(result.error)) {
            const errDetail = result.error || result.message || 'Error en herramienta MCP';
            toolExecutionLogger.finishError(loggedId, errDetail, result);
            return result;
          }
          if (result.warning) {
            toolExecutionLogger.finishWarning(loggedId, result, String(result.warning));
            return result;
          }
        }

        toolExecutionLogger.finishSuccess(loggedId, result);
        return result;
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        logger.error('TOOL', `Error ejecutando MCP tool "${name}":`, errorMsg);
        const errorPayload = {
          status: 'error',
          name,
          error: errorMsg,
          message: errorMsg
        };
        toolExecutionLogger.finishError(loggedId, err, errorPayload);
        return errorPayload;
      }
    }

    const unknownPayload = {
      status: 'error',
      error: 'unknown_tool',
      name,
      message: `Herramienta "${name}" no reconocida.`
    };
    toolExecutionLogger.finishError(loggedId, unknownPayload.message, unknownPayload);
    return unknownPayload;
  }

  /**
   * Ejecuta un lote de llamadas a herramientas con aislamiento individual de errores y trazabilidad completa.
   * Si una herramienta falla, retorna el error estructurado sin tumbar las demás.
   */
  async executeCalls(
    calls: GeminiLiveToolCall[],
    context: ToolExecutionContext = {}
  ): Promise<GeminiLiveToolResponse[]> {
    if (!Array.isArray(calls)) return [];
    const responses: GeminiLiveToolResponse[] = [];

    for (const call of calls) {
      const { id, name, args } = call;
      if (context.isCallCancelled?.(id) || context.signal?.aborted) continue;
      const controller = new AbortController();
      const cancelIfNeeded = () => {
        if (context.isCallCancelled?.(id) || context.signal?.aborted) controller.abort();
      };
      cancelIfNeeded();
      const cancellationPoll = setInterval(cancelIfNeeded, 25);
      context.onToolExecutionStart?.(name, args);
      logger.info('TOOL', `Ejecutando herramienta local "${name}"...`, args);

      let result: any;
      try {
        result = await this.executeTool(name, args || {}, { ...context, signal: controller.signal }, id);
        logger.info('TOOL', `Resultado de "${name}":`, result);
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        logger.error('TOOL', `Error crítico al ejecutar herramienta ${name}:`, errorMsg);
        result = {
          status: 'error',
          error: errorMsg,
          message: errorMsg
        };
      } finally {
        clearInterval(cancellationPoll);
      }

      context.onToolExecutionEnd?.(name, result);

      if (context.isCallCancelled?.(id) || context.signal?.aborted) continue;
      responses.push({
        id,
        name,
        response: {
          result,
          output: result
        }
      });
    }

    return responses;
  }
}
