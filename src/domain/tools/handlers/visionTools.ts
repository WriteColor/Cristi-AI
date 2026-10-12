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

export const captureScreenSnapshotHandler: IToolHandler = {
  name: 'capture_screen_snapshot',
  declaration: {
    name: 'capture_screen_snapshot',
    description: 'Captura un fotograma de la pantalla del usuario o de una ventana específica en este momento y te lo envía para que puedas ver qué está haciendo. Puedes especificar región (semántica o coordenadas porcentuales) o el nombre de una ventana.',
    parameters: {
      type: 'OBJECT',
      properties: {
        region: {
          type: 'STRING',
          enum: ['full', 'active_region', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'left', 'right'],
          description: 'Qué parte de la pantalla capturar. "full" por defecto.'
        },
        target_window: {
          type: 'STRING',
          description: 'Nombre de una aplicación o ventana específica a capturar directamente (ej: "Brave", "Excel", "Visual Studio Code").'
        },
        x_pct: { type: 'NUMBER', description: 'Coordenada X izquierda (0-100).' },
        y_pct: { type: 'NUMBER', description: 'Coordenada Y superior (0-100).' },
        w_pct: { type: 'NUMBER', description: 'Ancho porcentual (1-100).' },
        h_pct: { type: 'NUMBER', description: 'Alto porcentual (1-100).' }
      }
    }
  },
  async execute(
    args: {
      region?: string;
      target_window?: string;
      x_pct?: number;
      y_pct?: number;
      w_pct?: number;
      h_pct?: number;
    },
    context?: ToolExecutionContext
  ) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Captura de pantalla cancelada por señal de aborto.', cancelled: true };
    const region = typeof args?.region === 'string' ? args.region : 'full';
    const targetWindow = typeof args?.target_window === 'string' && args.target_window.trim() ? args.target_window.trim() : null;
    let frameData: string | null = null;

    if (electronBridge?.isElectron && electronBridge.captureScreenNative) {
      if (targetWindow) {
        frameData = await electronBridge.captureScreenNative({ targetWindow, fresh: true });
      } else if (args?.w_pct !== undefined && args?.h_pct !== undefined) {
        const customRegion = {
          x_pct: Math.max(0, Math.min(100, Number(args.x_pct || 0))),
          y_pct: Math.max(0, Math.min(100, Number(args.y_pct || 0))),
          w_pct: Math.max(1, Math.min(100, Number(args.w_pct))),
          h_pct: Math.max(1, Math.min(100, Number(args.h_pct))),
        };
        frameData = await electronBridge.captureScreenNative({ region: customRegion, fresh: true });
      } else {
        const semanticMap: Record<string, { x_pct: number; y_pct: number; w_pct: number; h_pct: number } | null> = {
          'top-left': { x_pct: 0, y_pct: 0, w_pct: 50, h_pct: 50 },
          'top-right': { x_pct: 50, y_pct: 0, w_pct: 50, h_pct: 50 },
          'bottom-left': { x_pct: 0, y_pct: 50, w_pct: 50, h_pct: 50 },
          'bottom-right': { x_pct: 50, y_pct: 50, w_pct: 50, h_pct: 50 },
          center: { x_pct: 25, y_pct: 25, w_pct: 50, h_pct: 50 },
          left: { x_pct: 0, y_pct: 0, w_pct: 50, h_pct: 100 },
          right: { x_pct: 50, y_pct: 0, w_pct: 50, h_pct: 100 },
          full: null,
          active_region: null
        };
        const nativeRegion = semanticMap[region] ?? null;
        frameData = await electronBridge.captureScreenNative({ region: nativeRegion, fresh: true });
      }
    }

    if (region === 'active_region' && !frameData && context?.getScreenCapture) {
      frameData = await context.getScreenCapture('active_region', { fresh: true });
    }

    if (!frameData && context?.getScreenCapture) {
      frameData = await context.getScreenCapture(region === 'full' ? 'full' : 'active_region', { fresh: true });
    } else if (!frameData && context?.takeScreenshot) {
      frameData = await context.takeScreenshot(region === 'full' ? 'full' : 'active_region');
    }

    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Captura cancelada tras procesamiento.', cancelled: true };

    if (!frameData) {
      return {
        status: 'unavailable',
        message: 'La captura de pantalla no está disponible en este momento.'
      };
    }

    return {
      status: 'captured',
      region: targetWindow ? `window:${targetWindow}` : region,
      captured_at_ms: Date.now(),
      message: 'Este es el fotograma solicitado para la petición actual del usuario. Analízalo para responder.',
      frame_data: frameData
    };
  }
};

export const captureWindowHandler: IToolHandler = {
  name: 'capture_window',
  declaration: {
    name: 'capture_window',
    description: 'Captura específicamente la ventana de una aplicación en ejecución por su nombre o título (ej: "Brave", "Visual Studio Code", "Excel", "Spotify") y analiza su contenido visual.',
    parameters: {
      type: 'OBJECT',
      properties: {
        window_query: {
          type: 'STRING',
          description: 'Nombre de la aplicación o parte del título de la ventana a capturar.'
        }
      },
      required: ['window_query']
    }
  },
  async execute(args: { window_query?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Captura cancelada.', cancelled: true };
    if (!args?.window_query) return { status: 'error', message: 'Parámetro window_query requerido.' };
    let frameData: string | null = null;
    if (electronBridge?.isElectron && electronBridge.captureScreenNative) {
      frameData = await electronBridge.captureScreenNative({ targetWindow: args.window_query, fresh: true });
    }
    if (!frameData) {
      return { status: 'unavailable', message: `No se pudo capturar la ventana "${args.window_query}". Asegúrate de que esté abierta.` };
    }
    return {
      status: 'captured',
      target_window: args.window_query,
      captured_at_ms: Date.now(),
      message: `Fotograma de la ventana "${args.window_query}" capturado exitosamente. Analízalo para responder.`,
      frame_data: frameData
    };
  }
};

export const setScreenWatchHandler: IToolHandler = {
  name: 'set_screen_watch',
  declaration: {
    name: 'set_screen_watch',
    description: 'Activa o desactiva la vigilancia continua de la pantalla del usuario. Cuando está activa, recibirás frames periódicos de la pantalla automáticamente.',
    parameters: {
      type: 'OBJECT',
      properties: {
        enabled: {
          type: 'BOOLEAN',
          description: 'true para activar la vigilancia continua, false para detenerla.'
        }
      },
      required: ['enabled']
    }
  },
  async execute(args: { enabled?: boolean }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Vigilancia de pantalla cancelada por señal de aborto.', cancelled: true };
    const enabled = args?.enabled !== false;
    if (context?.onScreenWatchChange) {
      context.onScreenWatchChange(enabled);
    } else if (context?.setScreenWatch) {
      context.setScreenWatch(enabled);
    }

    return {
      status: 'success',
      screen_watch: enabled,
      message: enabled ? 'Vigilancia de pantalla activada.' : 'Vigilancia de pantalla desactivada.'
    };
  }
};

export const setScreenRegionHandler: IToolHandler = {
  name: 'set_screen_region',
  declaration: {
    name: 'set_screen_region',
    description: 'Define programáticamente el área de visión de Cristi en pantalla (en porcentaje del tamaño de la ventana). El área se destacará con un borde visual violeta.',
    parameters: {
      type: 'OBJECT',
      properties: {
        x_pct: {
          type: 'NUMBER',
          description: 'Posición horizontal del borde izquierdo como porcentaje de la pantalla (0–100).'
        },
        y_pct: {
          type: 'NUMBER',
          description: 'Posición vertical del borde superior como porcentaje de la pantalla (0–100).'
        },
        w_pct: {
          type: 'NUMBER',
          description: 'Ancho del área como porcentaje de la pantalla (0–100).'
        },
        h_pct: {
          type: 'NUMBER',
          description: 'Alto del área como porcentaje de la pantalla (0–100).'
        }
      },
      required: ['x_pct', 'y_pct', 'w_pct', 'h_pct']
    }
  },
  async execute(args: { x_pct?: number | string; y_pct?: number | string; w_pct?: number | string; h_pct?: number | string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Configuración de región cancelada por señal de aborto.', cancelled: true };
    const region = {
      x_pct: !isNaN(Number(args?.x_pct)) ? Number(args.x_pct) : 0,
      y_pct: !isNaN(Number(args?.y_pct)) ? Number(args.y_pct) : 0,
      w_pct: !isNaN(Number(args?.w_pct)) ? Number(args.w_pct) : 100,
      h_pct: !isNaN(Number(args?.h_pct)) ? Number(args.h_pct) : 100
    };

    context?.onScreenRegionChange?.(region);
    // A crop is an active screen-vision mode. Keep capture and the visible
    // region coupled so a tool call cannot leave a stale border behind.
    context?.onScreenWatchChange?.(true);

    return {
      status: 'success',
      region,
      message: `Región de visión configurada: x=${region.x_pct}% y=${region.y_pct}% w=${region.w_pct}% h=${region.h_pct}%`
    };
  }
};

export const analyzeVisualSceneHandler: IToolHandler = {
  name: 'analyze_visual_scene',
  declaration: {
    name: 'analyze_visual_scene',
    description: 'Solicita un análisis de la cámara del usuario para inspeccionar qué está viendo, objetos, posturas o expresiones.',
    parameters: {
      type: 'OBJECT',
      properties: {
        focus_target: {
          type: 'STRING',
          description: 'Elemento específico a observar (ej: "expresión del usuario", "lo que sostiene", "entorno").'
        }
      }
    }
  },
  async execute(args: { focus_target?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Análisis de escena visual cancelado por señal de aborto.', cancelled: true };
    const snapshot = context?.getCameraSnapshot?.();
    const detections = context?.getVisionDetections?.();

    if (!snapshot) {
      return {
        status: 'camera_unavailable',
        message: 'La cámara sensorial no está activa en este momento.'
      };
    }

    const facesSummary = detections?.faces?.map((f: any) => ({
      label: f.label || f.matchLabel || 'Desconocido',
      isOwner: !!f.isOwner,
      emotion: f.topEmotion || 'neutral',
      confidence: `${Math.round((f.confidence || (1 - (f.matchDistance || 0.3))) * 100)}%`
    })) || [];

    const objectsSummary = detections?.objects?.map((o: any) => ({
      object: o.class,
      score: `${Math.round(o.score * 100)}%`
    })) || [];

    return {
      status: 'scene_analyzed',
      scene_state: detections?.sceneState || 'UNKNOWN',
      summary: detections?.summary || 'Escaneo visual completado.',
      faces_detected_count: facesSummary.length,
      faces: facesSummary,
      objects_detected: objectsSummary,
      focus_target: args?.focus_target || 'general'
    };
  }
};

export const clearScreenRegionHandler: IToolHandler = {
  name: 'clear_screen_region',
  declaration: {
    name: 'clear_screen_region',
    description: 'Restablece el área de visión de pantalla a pantalla completa (100%), eliminando cualquier recorte previo.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  async execute(_args: unknown, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) {
      return { status: 'cancelled', message: 'Restablecimiento cancelado por señal de aborto.', cancelled: true };
    }
    context?.onScreenRegionChange?.(null);
    return {
      status: 'success',
      message: 'Región de visión restablecida a pantalla completa.'
    };
  }
};

export const visionTools: IToolHandler[] = [
  captureScreenSnapshotHandler,
  captureWindowHandler,
  setScreenWatchHandler,
  setScreenRegionHandler,
  clearScreenRegionHandler,
  analyzeVisualSceneHandler
];
