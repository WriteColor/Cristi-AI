import '@pixi/unsafe-eval';
import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display/cubism4';
import { live2dModelRegistry } from './Live2DModelRegistry.js';
import { Live2DAdapter } from './Live2DAdapter.js';
import { Live2DController } from './Live2DController.js';
import { contextualEmotionOrchestrator } from './ContextualEmotionOrchestrator.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { clickThroughService } from '../../services/desktop/ClickThroughService.js';
import { AdaptiveTicker } from './AdaptiveTicker';
if (typeof window !== 'undefined') {
  window.PIXI = PIXI;
  PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL2;
  PIXI.settings.ROUND_PIXELS = false;
  PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.HIGH;
  (PIXI.settings as any).MIPMAP_MODES = PIXI.MIPMAP_MODES.OFF;

  const displayProto = PIXI.DisplayObject?.prototype as any;
  if (displayProto && !displayProto.isInteractive) {
    displayProto.isInteractive = function () { return false; };
  }
  const live2dProto = (Live2DModel as any)?.prototype;
  if (live2dProto && !live2dProto.isInteractive) {
    live2dProto.isInteractive = function () { return false; };
  }
}

try { (Live2DModel as any).registerTicker(PIXI.Ticker); } catch (_) {}

// Serialize decoding so cancelled loads release textures before a replacement
// reuses PIXI's cache, including rapid A -> B -> A model changes.
let modelLoadQueue: Promise<unknown> = Promise.resolve();
function loadModel(path: string, isCurrent: () => boolean): Promise<any> {
  const loading = modelLoadQueue.then(async () => {
    if (!isCurrent()) return null;
    const loaded = await (Live2DModel as any).from(path, { autoInteract: false, autoUpdate: false });
    if (!isCurrent()) {
      try {
        loaded.destroy({ texture: true, baseTexture: true });
      } catch (_) {}
      return null;
    }
    return loaded;
  });
  modelLoadQueue = loading.catch(() => {});
  return loading;
}

function resolveModelPath(modelPath: string): string {
  if (!modelPath) return '';
  if (modelPath.startsWith('blob:') || modelPath.startsWith('data:') || modelPath.startsWith('http://') || modelPath.startsWith('https://')) {
    return modelPath;
  }
  let cleanPath = modelPath.startsWith('/') ? modelPath.slice(1) : modelPath;
  if (!cleanPath.startsWith('models/live2d/') && !cleanPath.endsWith('.js')) {
    cleanPath = `models/live2d/${cleanPath}`;
  }
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    if (origin && origin !== 'null' && !origin.startsWith('file:')) {
      return `${origin}/${cleanPath}`;
    }
    if (window.location.protocol === 'file:') {
      return new URL('./' + cleanPath, window.location.href).href;
    }
  }
  return '/' + cleanPath;
}


export interface CanvasEngineConfig {
  container: HTMLDivElement; modelId: string;
  applyLayout: (model: any, app: PIXI.Application) => void;
  syncHitTargetBounds: () => void;
  onResources: (engine: Live2DCanvasEngine) => void;
  onReady: () => void; onError: (message: string) => void;
}
export class Live2DCanvasEngine {
  app: PIXI.Application | null = null;
  model: any = null;
  controller: any = null;
  adapter: any = null;
  ticker: AdaptiveTicker | null = null;
  private disposed = false;
  private container: HTMLDivElement;
  constructor(private options: CanvasEngineConfig) { this.container = options.container; }
  async start(): Promise<void> {
    if (this.app || this.disposed) return;

      try {
        if (!this.container) return;
        this.container.innerHTML = '';

        // 1. Cargar Cubism Core si no está en window
        if (typeof window !== 'undefined' && !window.Live2DCubismCore) {
          await new Promise<void>((resolve) => {
            const script = document.createElement('script');
            script.src = resolveModelPath('live2dcubismcore.min.js');
            script.onload = () => resolve();
            script.onerror = () => resolve();
            document.head.appendChild(script);
          });
        }
        if (this.disposed) return;

        if (PIXI.settings) {
          PIXI.settings.ROUND_PIXELS = false;
          PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.HIGH;
        }

        // Calidad nativa con soporte ultra nítido para pantallas HiDPI / 4K (hasta 2.0)
        const renderRes = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2.0);

        // 2. Crear PIXI Application (fondo transparente, pointer-events disabled en canvas)
        this.app = new PIXI.Application({
          width: window.innerWidth,
          height: window.innerHeight,
          backgroundAlpha: 0,
          backgroundColor: 0x000000,
          antialias: true,
          autoDensity: true,
          autoStart: true,
          resolution: renderRes,
          clearBeforeRender: true,
          preserveDrawingBuffer: false, // Desactivar copia redundante de backbuffer (ahorra 40% de GPU)
          powerPreference: 'high-performance'
        });

        // Conectar AdaptiveTicker para regulación inteligente de FPS (144fps activo -> 60fps reposo -> 0fps en background)
        this.ticker = new AdaptiveTicker({
          activeFps: 144,
          idleFps: 60,
          inactivityThresholdMs: 4500,
          autoListenDom: false,
          targetElement: null
        });
        this.ticker.attachTicker(this.app.ticker);

        const canvasEl = this.app.view as HTMLCanvasElement;
        if (canvasEl) {
          canvasEl.style.width = '100%';
          canvasEl.style.height = '100%';
          canvasEl.style.position = 'absolute';
          canvasEl.style.top = '0';
          canvasEl.style.left = '0';
          canvasEl.style.pointerEvents = 'none';
          this.container.appendChild(canvasEl);
        }

        // 3. Cargar modelo Live2D
        const descriptor = live2dModelRegistry.getModel(this.options.modelId) || live2dModelRegistry.getModel('yanderegirl');
        if (!descriptor) {
          throw new Error(`[Live2DCanvasEngine] Model profile not found for "${this.options.modelId}" or default.`);
        }
        const resolvedPath = resolveModelPath(descriptor.path);

        logger.info('Live2D', `Cargando modelo ${descriptor.name}...`);

        this.model = await loadModel(resolvedPath, () => !this.disposed);

        if (this.disposed) {
          try { this.model?.destroy({ texture: true, baseTexture: true }); } catch (_) {}
          try { this.app?.destroy(true); } catch (_) {}
          return;
        }

        // 4. Pre-decodificar texturas para evitar frames negros en WebGL
        const textures: any[] = [
          ...(this.model.textures || []),
          ...(this.model.internalModel?.textures || [])
        ];

        await Promise.all(textures.map((tex) => {
          const src = tex?.baseTexture?.resource?.source;
          if (src instanceof HTMLImageElement && !src.complete) {
            return new Promise<void>((res) => {
              src.onload = () => res();
              src.onerror = () => res();
              if (typeof src.decode === 'function') {
                src.decode().then(() => res()).catch(() => res());
              }
            });
          }
          return Promise.resolve();
        }));
        if (this.disposed) return;

        // Filtrado bilineal de alta fidelidad sin blur en texturas
        for (const tex of textures) {
          if (tex?.baseTexture) {
            tex.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
            tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
            tex.baseTexture.wrapMode = PIXI.WRAP_MODES.CLAMP;
            tex.baseTexture.update();
          }
        }

        // 5. Supresión selectiva de partes y parámetros específicos según el perfil del modelo
        const core = this.model.internalModel?.coreModel;
        if (core) {
          const hiddenParts = Array.isArray(descriptor.hiddenParts) ? descriptor.hiddenParts : [];
          if (core._partIds && hiddenParts.length > 0) {
            for (const pId of hiddenParts) {
              const idx = core._partIds.indexOf(pId);
              if (idx !== -1) {
                if (typeof core.setPartOpacityByIndex === 'function') core.setPartOpacityByIndex(idx, 0);
                if (core._partOpacities) core._partOpacities[idx] = 0;
              }
            }
          }
          if (descriptor.lockedParameters && typeof descriptor.lockedParameters === 'object') {
            for (const [pId, val] of Object.entries(descriptor.lockedParameters)) {
              if (typeof core.setParameterValueById === 'function') {
                core.setParameterValueById(pId, val);
              }
            }
          }
        }

        // 6. Desactivar toda interactividad interna de PIXI (la maneja el DOM hitTarget)
        this.model.interactive = false;
        this.model.interactiveChildren = false;
        this.model.eventMode = 'none';
        if (this.model.internalModel) {
          try { this.model.internalModel.interactive = false; } catch (_) {}
        }
        this.app.stage.interactiveChildren = false;
        this.app.stage.eventMode = 'none';
        this.app.stage.addChild(this.model);

        // 7. Conectar adaptador y controlador de expresiones
        const detected = live2dModelRegistry.detectModelCapabilities(this.model);
        const mapping = {
          ...(detected?.standardMapping || {}),
          ...(descriptor.standardMapping || {})
        };
        this.adapter = new Live2DAdapter(this.model, mapping, descriptor);
        this.controller = new Live2DController(this.adapter, descriptor.id);
        contextualEmotionOrchestrator.setContextReferences(this.controller, this.adapter, descriptor.id);

        // 8. Conectar bucle de animación y cinética
        const onTick = (delta: number) => {
          if (this.disposed) return;
          const deltaMs = this.app?.ticker?.deltaMS || (delta * 16.6667);
          this.model.update(deltaMs);
          this.controller.update(deltaMs);
        };
        this.app.ticker.add(onTick);

        // 9. Aplicar layout y cebar WebGL con pases de render
        this.options.onResources(this);
        this.options.applyLayout(this.model, this.app);
        this.model.update(16);
        this.app.renderer.render(this.app.stage);

        // Ready means resources have rendered, even if the hidden window suspends RAF.
        this.options.syncHitTargetBounds();
        this.options.onReady();


      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error('Live2D', `Error fatal: ${errorMsg}`, err);
        if (!this.disposed) {
          this.options.onError(errorMsg);
        }
      }
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ticker?.destroy();
    if (this.controller) this.controller.destroy(); else this.adapter?.destroy();
    if (contextualEmotionOrchestrator.controller === this.controller) contextualEmotionOrchestrator.setContextReferences(null, null);
    const canvas = (this.app?.view as HTMLCanvasElement | null) || (this.container?.querySelector?.('canvas') as HTMLCanvasElement | null);
    if (canvas && typeof canvas.getContext === 'function') {
      try {
        const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as (WebGLRenderingContext | WebGL2RenderingContext | null);
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch (_) {}
    }
    try { this.model?.destroy({ texture: true, baseTexture: true }); } catch { /* already released */ }
    try { this.app?.destroy(true, { children: true, texture: true, baseTexture: true }); } catch { /* initialization was cancelled */ }
    if (this.container) {
      try {
        this.container.innerHTML = '';
      } catch (_) {}
    }
    clickThroughService.unregisterHitbox('live2d');
    this.app = this.model = this.controller = this.adapter = this.ticker = null;
  }
}
