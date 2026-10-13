import type { IToolHandler, ToolExecutionContext } from '../IToolHandler';

let electronBridge: any = null;
if (typeof window !== 'undefined' && (window as any).electronBridge) {
  electronBridge = (window as any).electronBridge;
}
if (!electronBridge && typeof globalThis !== 'undefined' && (globalThis as any).electronBridge) {
  electronBridge = (globalThis as any).electronBridge;
}
try {
  import('../../../services/desktop/ElectronBridge.js')
    .then(mod => {
      if (mod?.electronBridge) electronBridge = mod.electronBridge;
    })
    .catch(() => {});
} catch (_) {}

export function extractAppName(title: string): string {
  if (!title) return 'Desconocido';
  const clean = title.trim();
  if (clean.includes(' - ')) {
    const parts = clean.split(' - ');
    return parts[parts.length - 1].trim();
  }
  if (clean.includes(' — ')) {
    const parts = clean.split(' — ');
    return parts[parts.length - 1].trim();
  }
  return clean;
}

export const SEMANTIC_REGION_MAP: Record<string, { x_pct: number; y_pct: number; w_pct: number; h_pct: number }> = {
  'top-left': { x_pct: 0, y_pct: 0, w_pct: 50, h_pct: 50 },
  'arriba a la izquierda': { x_pct: 0, y_pct: 0, w_pct: 50, h_pct: 50 },
  'arriba izquierda': { x_pct: 0, y_pct: 0, w_pct: 50, h_pct: 50 },
  'superior izquierda': { x_pct: 0, y_pct: 0, w_pct: 50, h_pct: 50 },

  'top-right': { x_pct: 50, y_pct: 0, w_pct: 50, h_pct: 50 },
  'arriba a la derecha': { x_pct: 50, y_pct: 0, w_pct: 50, h_pct: 50 },
  'arriba derecha': { x_pct: 50, y_pct: 0, w_pct: 50, h_pct: 50 },
  'superior derecha': { x_pct: 50, y_pct: 0, w_pct: 50, h_pct: 50 },

  'bottom-left': { x_pct: 0, y_pct: 50, w_pct: 50, h_pct: 50 },
  'abajo a la izquierda': { x_pct: 0, y_pct: 50, w_pct: 50, h_pct: 50 },
  'abajo izquierda': { x_pct: 0, y_pct: 50, w_pct: 50, h_pct: 50 },
  'inferior izquierda': { x_pct: 0, y_pct: 50, w_pct: 50, h_pct: 50 },

  'bottom-right': { x_pct: 50, y_pct: 50, w_pct: 50, h_pct: 50 },
  'abajo a la derecha': { x_pct: 50, y_pct: 50, w_pct: 50, h_pct: 50 },
  'abajo derecha': { x_pct: 50, y_pct: 50, w_pct: 50, h_pct: 50 },
  'inferior derecha': { x_pct: 50, y_pct: 50, w_pct: 50, h_pct: 50 },

  'center': { x_pct: 25, y_pct: 25, w_pct: 50, h_pct: 50 },
  'centro': { x_pct: 25, y_pct: 25, w_pct: 50, h_pct: 50 },
  'medio': { x_pct: 25, y_pct: 25, w_pct: 50, h_pct: 50 },

  'left': { x_pct: 0, y_pct: 0, w_pct: 50, h_pct: 100 },
  'izquierda': { x_pct: 0, y_pct: 0, w_pct: 50, h_pct: 100 },
  'mitad izquierda': { x_pct: 0, y_pct: 0, w_pct: 50, h_pct: 100 },

  'right': { x_pct: 50, y_pct: 0, w_pct: 50, h_pct: 100 },
  'derecha': { x_pct: 50, y_pct: 0, w_pct: 50, h_pct: 100 },
  'mitad derecha': { x_pct: 50, y_pct: 0, w_pct: 50, h_pct: 100 },

  'top': { x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 50 },
  'arriba': { x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 50 },
  'mitad superior': { x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 50 },

  'bottom': { x_pct: 0, y_pct: 50, w_pct: 100, h_pct: 50 },
  'abajo': { x_pct: 0, y_pct: 50, w_pct: 100, h_pct: 50 },
  'mitad inferior': { x_pct: 0, y_pct: 50, w_pct: 100, h_pct: 50 },
};

export async function resolveCapturableWindow(targetQuery?: string | null, windowIdQuery?: string | null): Promise<{ id: string; name: string } | null> {
  if (!electronBridge?.isElectron || typeof electronBridge.listCapturableWindows !== 'function') {
    return null;
  }
  try {
    const windows = await electronBridge.listCapturableWindows();
    if (!windows || windows.length === 0) return null;

    if (windowIdQuery) {
      const matchById = windows.find((w: any) => w.id === windowIdQuery || w.id.toLowerCase().includes(windowIdQuery.toLowerCase()));
      if (matchById) return { id: matchById.id, name: matchById.name };
    }

    if (targetQuery) {
      const q = targetQuery.trim().toLowerCase();
      const exact = windows.find((w: any) => w.name.toLowerCase() === q);
      if (exact) return { id: exact.id, name: exact.name };

      const contains = windows.find((w: any) => w.name.toLowerCase().includes(q));
      if (contains) return { id: contains.id, name: contains.name };

      const words = q.split(/\s+/).filter(Boolean);
      const matchWords = windows.find((w: any) => {
        const lower = w.name.toLowerCase();
        return words.every((word: string) => lower.includes(word));
      });
      if (matchWords) return { id: matchWords.id, name: matchWords.name };
    }

    return null;
  } catch (err) {
    console.warn('[visionTools] Error resolving capturable window:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. UNIFIED VISION TOOL: capture_vision
// ─────────────────────────────────────────────────────────────────────────────
export const captureVisionHandler: IToolHandler = {
  name: 'capture_vision',
  declaration: {
    name: 'capture_vision',
    description: 'Captura un fotograma inmediato de la pantalla del usuario, ventana de aplicación o región semántica para observar qué está viendo en tiempo real. Admite lenguaje natural simple (ej: query="VS Code", query="Spotify", query="arriba a la derecha", target="screen", target="camera"). Devuelve inmediatamente el fotograma para que lo analices antes de responder.',
    parameters: {
      type: 'OBJECT',
      properties: {
        target: {
          type: 'STRING',
          enum: ['screen', 'window', 'region', 'camera'],
          description: 'Objetivo a observar: "screen" (pantalla completa), "window" (ventana de aplicación), "region" (región semántica) o "camera" (cámara web). Opcional si se especifica query.'
        },
        query: {
          type: 'STRING',
          description: 'Descripción natural u objetivo a enfocar: nombre de aplicación (ej: "Visual Studio Code", "Spotify", "Brave"), región semántica (ej: "top-right", "arriba a la derecha", "centro") o id de ventana.'
        }
      }
    }
  },
  async execute(
    args: { target?: 'screen' | 'window' | 'region' | 'camera'; query?: string },
    context?: ToolExecutionContext
  ) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Captura de visión cancelada por señal de aborto.', cancelled: true };

    const rawQuery = typeof args?.query === 'string' ? args.query.trim() : '';
    const lowerQuery = rawQuery.toLowerCase();
    let target = args?.target;

    // Inferencia de lenguaje natural si target no se especificó o es ambiguo
    if (!target) {
      if (lowerQuery.includes('cámara') || lowerQuery.includes('camara') || lowerQuery.includes('webcam')) {
        target = 'camera';
      } else if (SEMANTIC_REGION_MAP[lowerQuery] || lowerQuery.includes('arriba') || lowerQuery.includes('abajo') || lowerQuery.includes('derecha') || lowerQuery.includes('izquierda') || lowerQuery.includes('centro')) {
        target = 'region';
      } else if (rawQuery.length > 0) {
        target = 'window';
      } else {
        target = 'screen';
      }
    }

    // Caso 1: Cámara web
    if (target === 'camera') {
      const snapshot = context?.getCameraSnapshot?.();
      if (!snapshot) {
        return {
          status: 'camera_unavailable',
          message: 'La cámara web no está activa o disponible en este momento.'
        };
      }
      return {
        status: 'captured',
        target: 'camera',
        captured_at_ms: Date.now(),
        message: 'Fotograma de la cámara web capturado exitosamente. Analízalo para responder.',
        frame_data: snapshot
      };
    }

    let frameData: string | null = null;
    let resolvedWin: { id: string; name: string } | null = null;
    let customRegion: { x_pct: number; y_pct: number; w_pct: number; h_pct: number } | null = null;

    // Caso 2: Ventana de aplicación
    if (target === 'window') {
      resolvedWin = await resolveCapturableWindow(rawQuery || null);
      if (resolvedWin) {
        try {
          const { useVisionStore } = await import('../../../stores/useVisionStore.js');
          useVisionStore.getState().setTargetWindow(resolvedWin.id, resolvedWin.name);
          useVisionStore.getState().setCaptureMode('window');
        } catch (_) {}
      }

      if (electronBridge?.isElectron && electronBridge.captureScreenNative) {
        frameData = await electronBridge.captureScreenNative({
          windowId: resolvedWin?.id,
          targetWindow: resolvedWin?.name || (rawQuery || undefined),
          fresh: true
        });
      }
    }

    // Caso 3: Región semántica
    if (target === 'region') {
      customRegion = SEMANTIC_REGION_MAP[lowerQuery] || null;
      if (!customRegion) {
        // Coincidencia parcial con palabras clave semánticas
        for (const [key, val] of Object.entries(SEMANTIC_REGION_MAP)) {
          if (lowerQuery.includes(key)) {
            customRegion = val;
            break;
          }
        }
      }

      if (customRegion && electronBridge?.isElectron && electronBridge.captureScreenNative) {
        frameData = await electronBridge.captureScreenNative({ region: customRegion, fresh: true });
      }
    }

    // Caso 4: Pantalla completa o fallback
    if (!frameData && electronBridge?.isElectron && electronBridge.captureScreenNative) {
      frameData = await electronBridge.captureScreenNative({ fresh: true });
    }

    // Fallbacks a través del contexto
    if (!frameData && context?.getScreenCapture) {
      frameData = await context.getScreenCapture('full', { fresh: true });
    } else if (!frameData && context?.takeScreenshot) {
      frameData = await context.takeScreenshot('full');
    }

    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Captura cancelada.', cancelled: true };

    if (!frameData) {
      return {
        status: 'unavailable',
        message: 'No fue posible capturar el fotograma de pantalla. Comprueba que la ventana no esté minimizada.'
      };
    }

    const targetDesc = resolvedWin
      ? `Ventana: "${resolvedWin.name}" (${resolvedWin.id})`
      : customRegion
        ? `Región recortada: (${customRegion.x_pct}%, ${customRegion.y_pct}%, ${customRegion.w_pct}%x${customRegion.h_pct}%)`
        : 'Pantalla completa';

    return {
      status: 'captured',
      target,
      resolved_target: targetDesc,
      captured_at_ms: Date.now(),
      message: `Fotograma de ${targetDesc} capturado en este instante. Analízalo con precisión objetiva y responde a Ariel.`,
      frame_data: frameData
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. UNIFIED VISION STREAM TOOL: set_vision_stream
// ─────────────────────────────────────────────────────────────────────────────
export const setVisionStreamHandler: IToolHandler = {
  name: 'set_vision_stream',
  declaration: {
    name: 'set_vision_stream',
    description: 'Activa o desactiva la transmisión continua de visión en tiempo real (vigilancia continua). Úsalo cuando Ariel te pida explícitamente "mira continuamente mi pantalla", o para apagar la visión ante órdenes simples como "apaga la visión", "deja de mirar", "ya no mires" (ejecutando enabled=false).',
    parameters: {
      type: 'OBJECT',
      properties: {
        enabled: {
          type: 'BOOLEAN',
          description: 'true para iniciar la vigilancia continua de pantalla/ventana, false para apagarla por completo.'
        },
        mode: {
          type: 'STRING',
          enum: ['fullscreen', 'window', 'region', 'camera'],
          description: 'Modo de visión continua: "fullscreen" (pantalla completa), "window" (aplicación específica), "region" (área recortada) o "camera" (cámara web).'
        },
        target: {
          type: 'STRING',
          description: 'Nombre de la aplicación a enfocar para modo ventana (ej: "Spotify", "Visual Studio Code", "Brave") o región semántica.'
        }
      },
      required: ['enabled']
    }
  },
  async execute(
    args: { enabled: boolean; mode?: 'fullscreen' | 'window' | 'region' | 'camera'; target?: string },
    context?: ToolExecutionContext
  ) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Operación cancelada por señal de aborto.', cancelled: true };
    const enabled = Boolean(args?.enabled);
    const { useVisionStore } = await import('../../../stores/useVisionStore.js');

    // Apagado de la visión continua
    if (!enabled) {
      useVisionStore.getState().stopVisionPipeline();
      context?.onScreenWatchChange?.(false);
      return {
        status: 'success',
        enabled: false,
        message: 'Visión continua desactivada por completo. Cristi ha dejado de observar la pantalla.'
      };
    }

    // Encendido de la visión continua
    const requestedTarget = args?.target?.trim() || '';
    let mode = args?.mode;
    if (!mode) {
      mode = requestedTarget ? 'window' : 'fullscreen';
    }

    let windowId: string | undefined;
    let windowTitle: string | undefined;

    if (mode === 'window' && requestedTarget) {
      const resolved = await resolveCapturableWindow(requestedTarget);
      windowId = resolved?.id;
      windowTitle = resolved?.name || requestedTarget;
      useVisionStore.getState().setTargetWindow(windowId || null, windowTitle || null);
    }

    const ok = await useVisionStore.getState().startVisionPipeline({
      mode,
      windowId,
      windowTitle
    });

    context?.onScreenWatchChange?.(ok);

    return {
      status: ok ? 'success' : 'warning',
      enabled: ok,
      mode,
      target: windowTitle || undefined,
      message: ok
        ? `Visión continua iniciada en modo ${mode}${windowTitle ? ` enfocando la ventana "${windowTitle}"` : ''}. Cristi ahora está atenta a lo que sucede.`
        : 'No se pudo iniciar la transmisión continua de visión.'
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. UNIFIED WINDOW LISTING TOOL: list_open_windows
// ─────────────────────────────────────────────────────────────────────────────
export const listOpenWindowsHandler: IToolHandler = {
  name: 'list_open_windows',
  declaration: {
    name: 'list_open_windows',
    description: 'Lista todas las ventanas y programas abiertos en el ordenador del usuario para saber cuáles puedes observar o capturar con capture_vision o set_vision_stream. Devuelve window_id, title y app_name de cada ventana.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  async execute(_args: unknown, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Operación cancelada por señal de aborto.', cancelled: true };
    try {
      let sources: Array<{ id: string; name: string }> = [];
      if (electronBridge?.isElectron && typeof electronBridge.listCapturableWindows === 'function') {
        sources = await electronBridge.listCapturableWindows();
      }

      const windows = sources.map((s) => ({
        window_id: s.id,
        title: s.name,
        app_name: extractAppName(s.name)
      }));

      return {
        status: 'success',
        count: windows.length,
        windows,
        message: windows.length > 0
          ? `Se encontraron ${windows.length} aplicaciones/ventanas abiertas: ${windows.map((w) => w.app_name).join(', ')}.`
          : 'No se detectaron ventanas abiertas disponibles para capturar.'
      };
    } catch (err) {
      return {
        status: 'error',
        message: `Error al listar ventanas abiertas: ${(err as Error).message}`
      };
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPATIBILITY ALIASES (Para compatibilidad con UI y código heredado sin reactivaciones forzosas)
// ─────────────────────────────────────────────────────────────────────────────
export const captureScreenSnapshotHandler: IToolHandler = {
  name: 'capture_screen_snapshot',
  declaration: captureVisionHandler.declaration,
  async execute(args: any, context?: ToolExecutionContext) {
    return captureVisionHandler.execute({
      target: args?.target_window || args?.window_id ? 'window' : (args?.region && args?.region !== 'full' ? 'region' : 'screen'),
      query: args?.target_window || args?.window_id || args?.region
    }, context);
  }
};

export const captureWindowHandler: IToolHandler = {
  name: 'capture_window',
  declaration: captureVisionHandler.declaration,
  async execute(args: any, context?: ToolExecutionContext) {
    return captureVisionHandler.execute({ target: 'window', query: args?.window_query || args?.window_id }, context);
  }
};

export const setScreenWatchHandler: IToolHandler = {
  name: 'set_screen_watch',
  declaration: setVisionStreamHandler.declaration,
  async execute(args: any, context?: ToolExecutionContext) {
    return setVisionStreamHandler.execute({ enabled: Boolean(args?.enabled) }, context);
  }
};

export const setScreenRegionHandler: IToolHandler = {
  name: 'set_screen_region',
  declaration: {
    name: 'set_screen_region',
    description: 'Define programáticamente el área de visión de Cristi en pantalla en porcentajes.',
    parameters: {
      type: 'OBJECT',
      properties: {
        x_pct: { type: 'NUMBER' },
        y_pct: { type: 'NUMBER' },
        w_pct: { type: 'NUMBER' },
        h_pct: { type: 'NUMBER' }
      },
      required: ['x_pct', 'y_pct', 'w_pct', 'h_pct']
    }
  },
  async execute(args: any, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', cancelled: true };
    const region = {
      x_pct: !isNaN(Number(args?.x_pct)) ? Number(args.x_pct) : 0,
      y_pct: !isNaN(Number(args?.y_pct)) ? Number(args.y_pct) : 0,
      w_pct: !isNaN(Number(args?.w_pct)) ? Number(args.w_pct) : 100,
      h_pct: !isNaN(Number(args?.h_pct)) ? Number(args.h_pct) : 100
    };
    context?.onScreenRegionChange?.(region);
    // IMPORTANTE: NO forzar onScreenWatchChange(true) automáticamente para evitar bucles de reactivación involuntarios
    return { status: 'success', region, message: 'Región de visión configurada.' };
  }
};

export const clearScreenRegionHandler: IToolHandler = {
  name: 'clear_screen_region',
  declaration: {
    name: 'clear_screen_region',
    description: 'Restablece el área de visión a pantalla completa sin forzar reactivaciones.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  async execute(_args: unknown, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', cancelled: true };
    context?.onScreenRegionChange?.(null);
    return { status: 'success', message: 'Área de visión restablecida a pantalla completa.' };
  }
};

export const setActiveVisionSourceHandler: IToolHandler = {
  name: 'set_active_vision_source',
  declaration: setVisionStreamHandler.declaration,
  async execute(args: any, context?: ToolExecutionContext) {
    return setVisionStreamHandler.execute({
      enabled: true,
      mode: args?.mode || (args?.target_window || args?.window_id ? 'window' : 'fullscreen'),
      target: args?.target_window || args?.window_id
    }, context);
  }
};

export const analyzeVisualSceneHandler: IToolHandler = {
  name: 'analyze_visual_scene',
  declaration: captureVisionHandler.declaration,
  async execute(args: any, context?: ToolExecutionContext) {
    return captureVisionHandler.execute({ target: 'camera', query: args?.focus_target }, context);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN ÚNICA Y LIMPIA: 3 HERRAMIENTAS TÁCTICAS UNIFICADAS
// ─────────────────────────────────────────────────────────────────────────────
export const visionTools: IToolHandler[] = [
  captureVisionHandler,
  setVisionStreamHandler,
  listOpenWindowsHandler
];
