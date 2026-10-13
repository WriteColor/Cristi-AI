import type { IToolHandler, ToolExecutionContext } from '../IToolHandler';

let cachedMemoryService: any = null;

async function getMemoryService() {
  if (cachedMemoryService) return cachedMemoryService;
  if (typeof globalThis !== 'undefined' && (globalThis as any).memoryService) {
    cachedMemoryService = (globalThis as any).memoryService;
    return cachedMemoryService;
  }
  try {
    const mod = await import('../../integrations/memory/MemoryService.js');
    if (mod?.memoryService) {
      cachedMemoryService = mod.memoryService;
      return cachedMemoryService;
    }
  } catch {
    try {
      const tsPath = '../../integrations/memory/MemoryService.ts';
      const mod = await import(/* @vite-ignore */ tsPath);
      if (mod?.memoryService) {
        cachedMemoryService = mod.memoryService;
        return cachedMemoryService;
      }
    } catch {
      return (globalThis as any).memoryService || null;
    }
  }
  return null;
}

export const manageMemoryHandler: IToolHandler = {
  name: 'manage_memory',
  declaration: {
    name: 'manage_memory',
    description: 'Gestiona la memoria persistente a largo plazo sobre Ariel y tus experiencias en segundo plano. IMPORTANTE: Esta operación es 100% silenciosa; NUNCA verbalices frases como "He guardado esto en mi memoria", "Anotado en la base de datos" o "He registrado tu preferencia". Continúa la conversación con naturalidad humana.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          enum: ['store', 'update', 'recall', 'invalidate', 'get_recent'],
          description: 'Acción de memoria a realizar: "store" para guardar un recuerdo nuevo, "update" para actualizarlo, "recall" para buscar información previa, "invalidate" para marcarlo obsoleto.'
        },
        key: {
          type: 'STRING',
          description: 'Clave o tema conciso del recuerdo (ej: "comida_favorita", "proyecto_actual", "coordenadas_casa").'
        },
        content: {
          type: 'STRING',
          description: 'Contenido detallado y claro del recuerdo a fijar en la memoria.'
        },
        category: {
          type: 'STRING',
          enum: ['fact', 'preference', 'relationship', 'task', 'conversation'],
          description: 'Categoría del recuerdo (hecho objetivo, preferencia, relación emocional, tarea pendiente, etc.).'
        },
        importance: {
          type: 'NUMBER',
          description: 'Nivel de relevancia de 0.1 a 1.0 (por defecto 0.8).'
        },
        reason: {
          type: 'STRING',
          description: 'Motivo o contexto en caso de actualización o invalidación (opcional).'
        },
        query: {
          type: 'STRING',
          description: 'Término de búsqueda cuando action es "recall".'
        },
        id: {
          type: 'STRING',
          description: 'Identificador específico del recuerdo (opcional).'
        }
      },
      required: ['action']
    }
  },
  async execute(args: any, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Operación de memoria cancelada por señal de aborto.', cancelled: true };
    const normalizedArgs = {
      ...args,
      action: args?.action || 'store',
      content: args?.content || args?.fact || args?.text || args?.value || args?.key || ''
    };
    const svc = await getMemoryService();
    if (svc && typeof svc.manageMemory === 'function') {
      const res = await svc.manageMemory(normalizedArgs);
      return {
        ...res,
        silent: true,
        instruction_for_model: 'Continúa conversando con total naturalidad sobre el tema. NUNCA digas que has guardado, anotado o registrado el recuerdo.'
      };
    }
    return {
      status: 'success',
      silent: true,
      action: normalizedArgs.action,
      instruction_for_model: 'Continúa conversando con total naturalidad sobre el tema. NUNCA digas que has guardado, anotado o registrado el recuerdo.'
    };
  }
};

export const rememberFactHandler: IToolHandler = {
  name: 'remember_fact',
  declaration: {
    name: 'remember_fact',
    description: 'Guarda un dato, preferencia o recuerdo sobre el usuario en segundo plano. IMPORTANTE: Esta operación es 100% silenciosa; NUNCA verbalices al usuario frases como "He guardado esto en mi memoria", "Anotado en la base de datos" o "He registrado tu preferencia". Continúa la conversación con naturalidad humana.',
    parameters: {
      type: 'OBJECT',
      properties: {
        key: {
          type: 'STRING',
          description: 'Concepto clave o identificador corto (ej: "comida_favorita", "proyecto_actual", "cumpleaños").'
        },
        content: {
          type: 'STRING',
          description: 'El recuerdo detallado o afirmación que deseas fijar en tu memoria.'
        },
        category: {
          type: 'STRING',
          enum: ['fact', 'preference', 'relationship', 'task', 'conversation'],
          description: 'Categoría del recuerdo (por defecto "fact").'
        },
        importance: {
          type: 'NUMBER',
          description: 'Nivel de importancia de 0.1 a 1.0.'
        }
      },
      required: ['key', 'content']
    }
  },
  async execute(args: { key?: string; content?: string; category?: string; importance?: number; fact?: string; text?: string; value?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Operación de memoria cancelada por señal de aborto.', cancelled: true };
    const rawContent = args?.content || args?.fact || args?.text || args?.value || args?.key;
    if (!rawContent || (typeof rawContent === 'string' && !rawContent.trim())) {
      return { status: 'error', message: 'Contenido de memoria requerido.' };
    }
    const content = String(rawContent).trim();
    const key = args?.key && typeof args.key === 'string' && args.key.trim()
      ? args.key.trim()
      : (content.length > 40 ? content.slice(0, 40) + '...' : content);

    const svc = await getMemoryService();
    const memory = (svc && typeof svc.remember === 'function')
      ? await svc.remember({
          key,
          content,
          category: (args.category as any) || 'fact',
          importance: args.importance || 0.8
        })
      : {
          id: `mem_${Date.now()}`,
          key,
          content,
          category: args.category || 'fact',
          importance: args.importance || 0.8
        };

    return {
      status: 'success',
      silent: true,
      action: 'remembered',
      memory,
      instruction_for_model: 'Continúa conversando con total naturalidad sobre el tema. NUNCA digas que has guardado, anotado o registrado el dato en tu memoria.'
    };
  }
};

export const searchMemoryHandler: IToolHandler = {
  name: 'search_memory',
  declaration: {
    name: 'search_memory',
    description: 'Busca en tu banco de memoria permanente recuerdos y notas almacenadas sobre el usuario o temas pasados.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Palabras clave o frase a buscar en la memoria.'
        }
      },
      required: ['query']
    }
  },
  async execute(args: { query?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Búsqueda de memoria cancelada por señal de aborto.', cancelled: true };
    const query = args?.query || '';
    const svc = await getMemoryService();
    const found = (svc && typeof svc.search === 'function') ? svc.search(query) : [];
    return {
      status: 'success',
      query,
      resultsCount: found.length,
      memories: found
    };
  }
};

export const deleteMemoryHandler: IToolHandler = {
  name: 'delete_memory',
  declaration: {
    name: 'delete_memory',
    description: 'Elimina un recuerdo obsoleto de tu base de memoria.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id_or_key: {
          type: 'STRING',
          description: 'ID o clave del recuerdo a olvidar.'
        }
      },
      required: ['id_or_key']
    }
  },
  async execute(args: { id_or_key?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Operación de memoria cancelada por señal de aborto.', cancelled: true };
    const target = args?.id_or_key || '';
    const svc = await getMemoryService();
    const removed = (svc && typeof svc.deleteMemory === 'function') ? await svc.deleteMemory(target) : true;
    return {
      status: removed ? 'success' : 'not_found',
      message: removed ? `Recuerdo "${target}" eliminado.` : `No se encontró recuerdo con ID/clave "${target}".`
    };
  }
};

export const memoryTools: IToolHandler[] = [
  manageMemoryHandler,
  rememberFactHandler,
  searchMemoryHandler,
  deleteMemoryHandler
];
