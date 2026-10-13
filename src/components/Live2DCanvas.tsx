/**
 * Cristi AI - High-Performance Live2D Cubism Engine v4
 *
 * Arquitectura de Click-Through correcta para Electron en Windows:
 * - El canvas WebGL es pointer-events: none (nunca bloquea nada)
 * - Solo el hitTarget (bounding box del modelo) tiene pointer-events: auto
 * - El hitTarget comienza oculto (pointer-events: none, opacity: 0) y solo
 *   se activa DESPUÉS de que el modelo carga y se calcula su bounding box real
 * - syncHitTargetBounds usa coordenadas CSS reales vía getBoundingClientRect()
 *   no coordenadas internas de PIXI (que no mapean 1:1 con px CSS)
 * - Ticker adaptativo (AdaptiveTicker) gobernando 60 FPS activo -> 30 FPS reposo -> 0 FPS suspendido.
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle
} from 'react';
import * as PIXI from 'pixi.js';
import { Live2DCanvasEngine } from '../domain/live2d/Live2DCanvasEngine';
import { live2dModelRegistry } from '../domain/live2d/Live2DModelRegistry.js';
import { Live2DAdapter } from '../domain/live2d/Live2DAdapter.js';
import { Live2DController } from '../domain/live2d/Live2DController.js';
import { contextualEmotionOrchestrator } from '../domain/live2d/ContextualEmotionOrchestrator.js';
import { logger } from '../infrastructure/logging/logger.js';
import { eventBus, EVENTS } from '../infrastructure/events/eventBus.js';
import { electronBridge } from '../services/desktop/ElectronBridge.js';
import { clickThroughService } from '../services/desktop/ClickThroughService.js';
import { soundFxService } from '../domain/audio/SoundFxService.js';
import { AdaptiveTicker } from '../domain/live2d/AdaptiveTicker';
import { useTelemetryStore } from '../stores/useTelemetryStore.js';
import { useCompanionStore } from '../stores/useCompanionStore.js';
import { useSettingsStore } from '../stores/useSettingsStore.js';

// ── Global PIXI & Live2D Engine Setup ────────────────────────────────────────
declare global {
  interface Window {
    PIXI?: typeof PIXI;
    Live2DCubismCore?: unknown;
    __cristiAvatar?: {
      model: any;
      adapter: any;
      controller: any;
      setExpression: (exp: string) => void;
      setEmotion: (emo: string) => void;
    };
  }
}

export interface Live2DCanvasProps {
  modelId?: string;
  gesture?: string;
  lipSyncValue?: number;
  isSpeaking?: boolean;
  isListening?: boolean;
  viewMode?: 'torso' | 'full' | string;
  onModelClick?: () => void;
  onModelContextMenu?: (e?: React.MouseEvent | MouseEvent | { clientX?: number; clientY?: number }) => void;
}

export interface Live2DCanvasRef {
  reapplyLayout: () => void;
  triggerMotion: (group: string, index?: number) => void;
  triggerGesture: (name: string, comment?: string) => void;
  getModel: () => any;
  getAdapter: () => any;
  getController: () => any;
  getHitboxRect: () => DOMRect | null;
  moveTo?: (pos: unknown, anim?: unknown) => void;
  moveToPreset?: (pos: unknown, anim?: unknown) => void;
  setFpsLimit?: (fps: number) => void;
}

export const Live2DCanvas = React.memo(forwardRef<Live2DCanvasRef, Live2DCanvasProps>(function Live2DCanvas(
  {
    modelId = 'yanderegirl',
    gesture = 'idle',
    lipSyncValue = 0,
    isSpeaking = false,
    isListening: _isListening = false,
    viewMode = 'torso',
    onModelClick,
    onModelContextMenu
  },
  ref
) {
  // ── DOM Refs ───────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null); // Contiene el canvas WebGL
  const hitTargetRef = useRef<HTMLDivElement>(null); // Capa interactiva (bounding box del modelo)
  const wrapperRef = useRef<HTMLDivElement>(null);   // Div raíz, pointer-events: none

  // ── Engine Refs ────────────────────────────────────────────────────────────
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<any>(null);
  const adapterRef = useRef<any>(null);
  const controllerRef = useRef<any>(null);
  const adaptiveTickerRef = useRef<AdaptiveTicker | null>(null);
  const runtimeBudget = useTelemetryStore((s) => s.runtimeBudget);

  // ── State ──────────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [modelReady, setModelReady] = useState(false); // controla visibilidad del hitTarget

  // ── Dimensiones dedicadas del Canvas de Pixi.js (Mitigación radical de carga en Windows DWM) ──
  const AVATAR_STAGE_WIDTH = 640;
  const AVATAR_STAGE_HEIGHT = 920;

  const [avatarPos, setAvatarPos] = useState<{ x: number; y: number }>(() => {
    const initialX = typeof window !== 'undefined' ? Math.max(0, Math.round((window.innerWidth - 640) * 0.5)) : 300;
    const initialY = typeof window !== 'undefined' ? Math.max(0, Math.round(window.innerHeight - 920)) : 100;
    return { x: initialX, y: initialY };
  });
  const avatarPosRef = useRef(avatarPos);
  avatarPosRef.current = avatarPos;

  // ── Sincronización de Estado de Actividad y Presupuesto ─────────────────────
  const isZenMode = useCompanionStore((s) => s.isZenMode);
  const live2dVisible = useSettingsStore((s) => s.config.live2dVisible !== false);
  const [isWindowPaused, setIsWindowPaused] = useState(false);
  const [isDocHidden, setIsDocHidden] = useState(() => typeof document !== 'undefined' && document.hidden);

  useEffect(() => {
    const onVisibility = () => {
      setIsDocHidden(typeof document !== 'undefined' && document.hidden);
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, []);

  const isSuspended =
    !live2dVisible ||
    isZenMode ||
    isWindowPaused ||
    isDocHidden ||
    runtimeBudget?.profile === 'background' ||
    runtimeBudget?.live2d.recommendedFps === 0;

  const isAvatarActive = isSpeaking || isDragging || lipSyncValue > 0.01;
  const isSuspendedRef = useRef(isSuspended);
  isSuspendedRef.current = isSuspended;
  const isAvatarActiveRef = useRef(isAvatarActive);
  isAvatarActiveRef.current = isAvatarActive;

  // ── Drag State & Persistent Position ───────────────────────────────────────
  const scaleRef = useRef(1.0);
  const baseScaleRef = useRef(1.0);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  const dragRef = useRef({
    active: false,
    hasMoved: false,
    startX: 0,
    startY: 0,
    modelStartX: 0,
    modelStartY: 0
  });
  const dragRafId = useRef<number | null>(null);
  const wheelRafId = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (dragRafId.current !== null) cancelAnimationFrame(dragRafId.current);
      if (wheelRafId.current !== null) cancelAnimationFrame(wheelRafId.current);
    };
  }, []);

  // ── Sincronizar Hit Target al Bounding Box CSS Real del Modelo ────────────
  const syncHitTargetBounds = useCallback(() => {
    const model = modelRef.current;
    const hitEl = hitTargetRef.current;
    const app = pixiAppRef.current;
    if (!model || !hitEl || !app?.screen) return;

    try {
      const bounds = model.getBounds();
      if (!bounds || bounds.width < 10 || bounds.height < 10) return;

      const pos = avatarPosRef.current;
      const cssX = Math.round(pos.x + bounds.x);
      const cssY = Math.round(pos.y + bounds.y);
      const cssW = Math.round(bounds.width);
      const cssH = Math.round(bounds.height);

      if (cssW > 10 && cssH > 10) {
        hitEl.style.left = `${cssX}px`;
        hitEl.style.top = `${cssY}px`;
        hitEl.style.width = `${cssW}px`;
        hitEl.style.height = `${cssH}px`;
        clickThroughService.registerHitbox('live2d', {
          x: cssX,
          y: cssY,
          width: cssW,
          height: cssH
        });
      }
    } catch (_) {}
  }, []);

  // ── Layout & Framing ───────────────────────────────────────────────────────
  const applyLayout = useCallback((model: any, app: PIXI.Application, mode = viewModeRef.current) => {
    if (!model || !app?.screen) return;
    const stageW = app.screen.width || AVATAR_STAGE_WIDTH;
    const stageH = app.screen.height || AVATAR_STAGE_HEIGHT;
    const origH = model.internalModel?.originalHeight || 2000;

    let baseScale: number;
    if (mode === 'torso') {
      baseScale = (stageH * 1.55) / origH;
      model.scale.set(baseScale * scaleRef.current);
      model.x = (stageW - model.width) * 0.5;
      model.y = stageH * 0.08;
    } else {
      baseScale = (stageH * 0.90) / origH;
      model.scale.set(baseScale * scaleRef.current);
      model.x = (stageW - model.width) * 0.5;
      model.y = stageH * 0.05;
    }
    baseScaleRef.current = baseScale;
    syncHitTargetBounds();
  }, [syncHitTargetBounds]);

  // ── Inicialización del Motor Live2D ───────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    setIsLoading(true); setLoadError(null); setModelReady(false);
    const engine = new Live2DCanvasEngine({
      container: containerRef.current,
      modelId,
      width: AVATAR_STAGE_WIDTH,
      height: AVATAR_STAGE_HEIGHT,
      applyLayout: (model, app) => applyLayout(model, app, viewModeRef.current),
      syncHitTargetBounds,
      onResources: current => {
        pixiAppRef.current = current.app; modelRef.current = current.model;
        adapterRef.current = current.adapter; controllerRef.current = current.controller;
        adaptiveTickerRef.current = current.ticker;
        if (isSuspendedRef.current) {
          current.ticker?.setBudget('suspended');
        } else if (isAvatarActiveRef.current) {
          current.ticker?.setBudget('active');
        } else {
          current.ticker?.setBudget('idle');
        }
      },
      onReady: () => { setIsLoading(false); setModelReady(true); },
      onError: error => { setLoadError(error); setIsLoading(false); }
    });
    void engine.start();
    return () => {
      engine.destroy();
      adaptiveTickerRef.current?.destroy();
      if (pixiAppRef.current) {
        try {
          pixiAppRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
        } catch (_) {}
        pixiAppRef.current = null;
      }
      modelRef.current = null;
      adapterRef.current = null;
      controllerRef.current = null;
      adaptiveTickerRef.current = null;
    };
  }, [modelId, applyLayout, syncHitTargetBounds]);

  // ── Sincronizar Presupuesto del Ticker con la Actividad del Avatar ──────────
  useEffect(() => {
    const ticker = adaptiveTickerRef.current;
    if (!ticker) return;

    if (isSuspended) {
      ticker.setBudget('suspended');
    } else if (isAvatarActive) {
      ticker.setBudget('active');
    } else {
      ticker.setBudget('idle');
    }
  }, [isSuspended, isAvatarActive]);

  // ── Sincronizar estado de voz con AdaptiveTicker ───────────────────────────
  useEffect(() => {
    if (adaptiveTickerRef.current) {
      adaptiveTickerRef.current.setVoicePlaying(isSpeaking);
    }
  }, [isSpeaking]);

  useEffect(() => {
    adaptiveTickerRef.current?.setExternalFpsCap(runtimeBudget?.live2d.recommendedFps ?? null);
  }, [runtimeBudget]);

  // The normal settings window can temporarily move focus away from the
  // transparent companion. Suspend decorative rendering only while the
  // companion is explicitly paused, then restore its exact layout on resume.
  useEffect(() => {
    const pause = () => {
      setIsWindowPaused(true);
      adaptiveTickerRef.current?.setWindowHidden(true);
    };
    const resume = () => {
      setIsWindowPaused(false);
      adaptiveTickerRef.current?.setWindowHidden(false);
      if (modelRef.current && pixiAppRef.current) {
        applyLayout(modelRef.current, pixiAppRef.current, viewModeRef.current);
        syncHitTargetBounds();
      }
    };
    const unsubscribePause = electronBridge.onCompanionPause(pause);
    const unsubscribeResume = electronBridge.onCompanionResume(resume);
    return () => { unsubscribePause(); unsubscribeResume(); };
  }, [applyLayout, syncHitTargetBounds]);

  useEffect(() => {
    adaptiveTickerRef.current?.setLive2dVisible(live2dVisible);
  }, [live2dVisible]);

  // ── Redimensionamiento ────────────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        const maxX = Math.max(0, window.innerWidth - AVATAR_STAGE_WIDTH);
        const maxY = Math.max(0, window.innerHeight - AVATAR_STAGE_HEIGHT);
        const clampedX = Math.min(avatarPosRef.current.x, maxX);
        const clampedY = Math.min(avatarPosRef.current.y, maxY);
        if (clampedX !== avatarPosRef.current.x || clampedY !== avatarPosRef.current.y) {
          avatarPosRef.current = { x: clampedX, y: clampedY };
          setAvatarPos({ x: clampedX, y: clampedY });
          if (containerRef.current) {
            containerRef.current.style.left = `${clampedX}px`;
            containerRef.current.style.top = `${clampedY}px`;
          }
        }
      }
      if (pixiAppRef.current && modelRef.current) {
        applyLayout(modelRef.current, pixiAppRef.current, viewModeRef.current);
        syncHitTargetBounds();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [applyLayout, syncHitTargetBounds]);

  // ── Cambios de viewMode ───────────────────────────────────────────────────
  useEffect(() => {
    if (modelRef.current && pixiAppRef.current) {
      applyLayout(modelRef.current, pixiAppRef.current, viewMode);
    }
  }, [viewMode, applyLayout]);

  // ── Gestos y Emociones ────────────────────────────────────────────────────
  const isThinking = useCompanionStore((s) => s.isThinking);

  useEffect(() => {
    if (isThinking && controllerRef.current) {
      controllerRef.current.setEmotion('thinking');
      return;
    }
    const raw = typeof gesture === 'string'
      ? gesture
      : (typeof gesture === 'object' && gesture !== null && 'emotion' in gesture
        ? (gesture as any).emotion
        : (gesture ? String(gesture) : 'idle'));
    if (controllerRef.current) controllerRef.current.setEmotion(raw);
  }, [gesture, isThinking]);

  // ── LipSync Reactivo ──────────────────────────────────────────────────────
  useEffect(() => {
    if (adapterRef.current) {
      if (lipSyncValue > 0.01) {
        adapterRef.current.setMouth(Math.min(1.0, Math.max(0, lipSyncValue)), 0.2);
      } else {
        adapterRef.current.setMouth(0, 0);
        adapterRef.current.snapMouthClosed();
      }
    }
  }, [lipSyncValue]);

  // ── Handlers de Interacción en el Hit Target ──────────────────────────────
  const handlePointerEnter = useCallback(() => {
    electronBridge?.setIgnoreMouseEvents(false);
    adaptiveTickerRef.current?.reportActivity('pointer_enter');
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (!dragRef.current.active) {
      electronBridge?.setIgnoreMouseEvents(true);
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    electronBridge?.setIgnoreMouseEvents(false);
    electronBridge?.focusWindow();
    adaptiveTickerRef.current?.setInteracting(true);
    if (e.button === 2) return; // Clic derecho → menú contextual

    dragRef.current = {
      active: true,
      hasMoved: false,
      startX: e.clientX,
      startY: e.clientY,
      modelStartX: avatarPosRef.current.x,
      modelStartY: avatarPosRef.current.y
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    adaptiveTickerRef.current?.reportActivity('pointer_move');
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.hasMoved = true;
    }

    const nextX = Math.round(dragRef.current.modelStartX + dx);
    const nextY = Math.round(dragRef.current.modelStartY + dy);
    avatarPosRef.current = { x: nextX, y: nextY };
    if (containerRef.current) {
      containerRef.current.style.left = `${nextX}px`;
      containerRef.current.style.top = `${nextY}px`;
    }

    if (dragRafId.current === null) {
      dragRafId.current = requestAnimationFrame(() => {
        syncHitTargetBounds();
        dragRafId.current = null;
      });
    }
  }, [syncHitTargetBounds]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    adaptiveTickerRef.current?.setInteracting(false);
    if (dragRafId.current !== null) {
      cancelAnimationFrame(dragRafId.current);
      dragRafId.current = null;
    }
    setAvatarPos(avatarPosRef.current);
    syncHitTargetBounds();

    if (!dragRef.current.active) return;
    const hadMoved = dragRef.current.hasMoved;
    dragRef.current.active = false;
    setIsDragging(false);

    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}

    if (!hadMoved) {
      soundFxService.playClick();
      onModelClick?.();
    }
  }, [onModelClick, syncHitTargetBounds]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    adaptiveTickerRef.current?.reportActivity('wheel');
    const model = modelRef.current;
    if (!model) return;

    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    scaleRef.current = Math.max(0.3, Math.min(3.0, scaleRef.current + delta));
    model.scale.set(baseScaleRef.current * scaleRef.current);

    if (wheelRafId.current === null) {
      wheelRafId.current = requestAnimationFrame(() => {
        syncHitTargetBounds();
        wheelRafId.current = null;
      });
    }
  }, [syncHitTargetBounds]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    electronBridge?.setIgnoreMouseEvents(false);
    soundFxService.playClick();
    onModelContextMenu?.(e);
  }, [onModelContextMenu]);

  // ── API Pública (ref) ─────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    reapplyLayout: () => {
      if (typeof window !== 'undefined') {
        const defaultPos = {
          x: Math.max(0, Math.round((window.innerWidth - AVATAR_STAGE_WIDTH) * 0.5)),
          y: Math.max(0, Math.round(window.innerHeight - AVATAR_STAGE_HEIGHT))
        };
        avatarPosRef.current = defaultPos;
        setAvatarPos(defaultPos);
        if (containerRef.current) {
          containerRef.current.style.left = `${defaultPos.x}px`;
          containerRef.current.style.top = `${defaultPos.y}px`;
        }
      }
      if (modelRef.current && pixiAppRef.current) {
        applyLayout(modelRef.current, pixiAppRef.current, viewModeRef.current);
      }
    },
    triggerMotion: (g: string, i?: number) => controllerRef.current?.playMotion?.(g, i),
    triggerGesture: (name: string, _comment?: string) => controllerRef.current?.setEmotion?.(name),
    getModel: () => modelRef.current,
    getAdapter: () => adapterRef.current,
    getController: () => controllerRef.current,
    getHitboxRect: () => hitTargetRef.current?.getBoundingClientRect() ?? null,
    setFpsLimit: (fps: number) => {
      adaptiveTickerRef.current?.setExternalFpsCap(fps > 0 ? fps : null);
    },
    moveTo: (pos: any) => {
      if (typeof pos?.x === 'number' && typeof pos?.y === 'number') {
        const nextPos = { x: Math.round(pos.x), y: Math.round(pos.y) };
        avatarPosRef.current = nextPos;
        setAvatarPos(nextPos);
        if (containerRef.current) {
          containerRef.current.style.left = `${nextPos.x}px`;
          containerRef.current.style.top = `${nextPos.y}px`;
        }
        syncHitTargetBounds();
      }
    }
  }));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={wrapperRef}
      data-avatar-ready={modelReady}
      data-avatar-error={loadError || undefined}
      className="relative w-full h-full select-none overflow-hidden"
      style={{ pointerEvents: 'none' }}
    >
      {/* Canvas WebGL — limitado estrictamente a las dimensiones del avatar */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          left: `${avatarPos.x}px`,
          top: `${avatarPos.y}px`,
          width: `${AVATAR_STAGE_WIDTH}px`,
          height: `${AVATAR_STAGE_HEIGHT}px`,
          pointerEvents: 'none'
        }}
      />

      {/*
        Hit Target Interactivo:
        - Comienza con pointer-events: none hasta que el modelo cargue (modelReady)
        - Una vez listo, se posiciona exactamente sobre el bounding box CSS real del modelo
        - Es el ÚNICO elemento que captura interacciones con Cristi
      */}
      <div
        ref={hitTargetRef}
        onMouseEnter={modelReady ? handlePointerEnter : undefined}
        onMouseLeave={modelReady ? handlePointerLeave : undefined}
        onPointerEnter={modelReady ? handlePointerEnter : undefined}
        onPointerLeave={modelReady ? handlePointerLeave : undefined}
        onPointerDown={modelReady ? handlePointerDown : undefined}
        onPointerMove={modelReady ? handlePointerMove : undefined}
        onPointerUp={modelReady ? handlePointerUp : undefined}
        onPointerCancel={modelReady ? handlePointerUp : undefined}
        onContextMenu={modelReady ? handleContextMenu : undefined}
        onWheel={modelReady ? handleWheel : undefined}
        className={`absolute z-10 bg-transparent ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{
          left: '-9999px',
          top: '-9999px',
          width: '100px',
          height: '100px',
          pointerEvents: modelReady ? 'auto' : 'none',
        }}
        title="Arrastra a Cristi • Rueda para escalar • Clic derecho para menú"
      />

      {/* Indicador de Carga */}
      {isLoading && (
        <div
          className="absolute bottom-6 right-6 z-20 flex items-center gap-2 px-3 py-1.5 rounded-sm bg-zinc-950/90 border border-zinc-800 text-zinc-300 font-mono text-xs shadow-2xl backdrop-blur-md"
          style={{ pointerEvents: 'none' }}
        >
          <div className="w-2.5 h-2.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
          <span>Cargando avatar...</span>
        </div>
      )}

      {/* Error de Carga */}
      {loadError && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 p-4 rounded-sm bg-zinc-950 border border-rose-800 text-zinc-200 font-mono text-xs shadow-2xl space-y-2 text-center max-w-sm"
          style={{ pointerEvents: 'none' }}
        >
          <p className="text-rose-400 font-semibold">Error al cargar el avatar</p>
          <p className="text-[11px] text-zinc-400">{loadError}</p>
        </div>
      )}
    </div>
  );
}));

export default Live2DCanvas;
