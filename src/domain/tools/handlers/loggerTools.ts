import type { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import type { ToolExecutionStatus } from '../ToolExecutionLogger';
// @ts-ignore
import { toolExecutionLogger } from '../ToolExecutionLogger.ts';

export const getToolExecutionLogsHandler: IToolHandler = {
  name: 'get_tool_execution_logs',
  declaration: {
    name: 'get_tool_execution_logs',
    description: 'Consulta el historial de ejecuciones de herramientas, inspeccionando causas raíz de errores, advertencias, tiempos y estado del sistema.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'NUMBER', description: 'Cantidad máxima de registros a retornar (por defecto 15).' },
        status: { type: 'STRING', enum: ['success', 'warning', 'error', 'cancelled', 'all'], description: 'Filtro por estado de ejecución.' }
      }
    }
  },
  async execute(args: { limit?: number; status?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Consulta de logs cancelada por señal de aborto.', cancelled: true };
    const limit = Math.min(50, Math.max(1, Number(args?.limit) || 15));
    const statusFilter = (args?.status && args.status !== 'all') ? (args.status as ToolExecutionStatus) : undefined;
    const history = toolExecutionLogger.getHistory(limit, statusFilter);
    const stats = toolExecutionLogger.getStatistics();

    return {
      status: 'success',
      statistics: stats,
      total_returned: history.length,
      logs: history.map(r => ({
        id: r.id,
        tool: r.toolName,
        category: r.category,
        status: r.status,
        durationMs: r.durationMs,
        startedAt: new Date(r.startedAt).toLocaleTimeString(),
        warning: r.warning,
        error: r.error,
        rootCause: r.rootCause ? {
          category: r.rootCause.category,
          code: r.rootCause.code,
          message: r.rootCause.message,
          remediation: r.rootCause.remediationSuggestion
        } : undefined
      }))
    };
  }
};

// Pruned: get_tool_execution_logs is removed from agentic tools to prevent AI from inspecting
// internal execution logs and falling into metacognitive search loops. Retained for internal diagnostic calls only.
export const loggerTools: IToolHandler[] = [];

