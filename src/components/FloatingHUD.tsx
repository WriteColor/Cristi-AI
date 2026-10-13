import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneCall,
  PhoneOff,
  Settings,
  Monitor,
  MonitorOff,
  Crosshair,
  Trash2,
  User,
  Maximize2,
  Frame,
  Activity,
  Cpu,
  Wrench,
  Volume2,
  Eye,
  EyeOff,
  RefreshCw,
  Sparkles,
  AppWindow,
  ShieldCheck,
  Music,
  Play,
  Pause,
  SkipForward,
  ChevronUp,
  AlertCircle,
  Camera,
  Check,
  Disc,
} from 'lucide-react';
import { useClickThrough } from '../hooks/useClickThrough.js';
import { soundFxService } from '../domain/audio/SoundFxService.js';
import { clickThroughService } from '../services/desktop/ClickThroughService.js';
import { useSessionStore } from '../stores/useSessionStore.js';
import { useAudioStore } from '../stores/useAudioStore.js';
import { useVisionStore, type VisionCaptureMode } from '../stores/useVisionStore.js';
import { useSettingsStore } from '../stores/useSettingsStore.js';
import { useCompanionStore } from '../stores/useCompanionStore.js';
import { electronBridge } from '../services/desktop/ElectronBridge.js';
import { windowsMediaService } from '../domain/media/WindowsMediaService.js';

export interface FloatingHUDProps {
  isConnected?: boolean;
  isConnecting?: boolean;
  isMuted?: boolean;
  isCameraActive?: boolean;
  isSolidBackdrop?: boolean;
  modelId?: string;
  voiceName?: string;
  isSpeaking?: boolean;
  isListening?: boolean;
  activeToolName?: string | null;
  onToggleConnection?: () => void;
  onToggleMute?: () => void;
  onToggleCamera?: () => void;
  onToggleBackdrop?: () => void;
  onOpenSettings?: () => void;
  isScreenWatchActive?: boolean;
  hasScreenRegion?: boolean;
  onToggleScreenWatch?: () => void;
  onOpenRegionPicker?: () => void;
  onClearScreenRegion?: () => void;
  viewMode?: 'torso' | 'full' | string;
  onToggleViewMode?: () => void;
  isZenMode?: boolean;
  onToggleZenMode?: () => void;
  isUiVisible?: boolean;
  onWakeUi?: () => void;
  onTogglePerformanceHUD?: () => void;
  isLive2dVisible?: boolean;
  live2dModelId?: 'yanderegirl' | 'jane_doe';
  onToggleLive2d?: () => void;
  onToggleLive2dModel?: () => void;
}

/**
 * Cristi AI - Barra de Herramientas Flotante Táctica (Floating HUD v4)
 * Estilo Shadcn Dark Zinc Minimalista (Obsidian)
 * Bordes border-zinc-800, fondo bg-zinc-950/95, desenfoque backdrop-blur-md,
 * selector táctico de 4 modos de visión, widget multimedia de Spotify,
 * telemetría de reconexión con jitter en vivo, visualizador de pensamiento y salvaguardas de C:\.
 */
export const FloatingHUD: React.FC<FloatingHUDProps> = React.memo(function FloatingHUD(props = {}) {
  // Store States
  const connectionState = useSessionStore((s) => s.connectionState);
  const reconnectAttempt = useSessionStore((s) => s.reconnectAttempt);
  const maxReconnectAttempts = useSessionStore((s) => s.maxReconnectAttempts);
  const reconnectTargetTime = useSessionStore((s) => s.reconnectTargetTime);
  const errorMessage = useSessionStore((s) => s.errorMessage);
  const storeConnected = useSessionStore((s) => s.isConnected);
  const storeConnecting = useSessionStore((s) => s.isConnecting);

  const storeMuted = useAudioStore((s) => s.isMuted);
  const toggleMute = useAudioStore((s) => s.toggleMute);

  // Vision Store
  const captureMode = useVisionStore((s) => s.captureMode);
  const targetDisplayId = useVisionStore((s) => s.targetDisplayId);
  const targetWindowId = useVisionStore((s) => s.targetWindowId);
  const targetWindowTitle = useVisionStore((s) => s.targetWindowTitle);
  const availableWindows = useVisionStore((s) => s.availableWindows);
  const storeCamera = useVisionStore((s) => s.isCameraActive);
  const storeScreenWatch = useVisionStore((s) => s.isScreenWatchActive);
  const storeRegion = useVisionStore((s) => s.screenRegion);
  const openRegionPicker = useVisionStore((s) => s.openRegionPicker);
  const clearScreenRegion = useVisionStore((s) => s.clearScreenRegion);
  const setCaptureMode = useVisionStore((s) => s.setCaptureMode);
  const setTargetDisplayId = useVisionStore((s) => s.setTargetDisplayId);
  const setTargetWindow = useVisionStore((s) => s.setTargetWindow);
  const refreshSources = useVisionStore((s) => s.refreshSources);
  const startVisionPipeline = useVisionStore((s) => s.startVisionPipeline);
  const stopVisionPipeline = useVisionStore((s) => s.stopVisionPipeline);

  // Companion Store
  const storeSolidBackdrop = useCompanionStore((s) => s.isSolidBackdrop);
  const toggleBackdrop = useCompanionStore((s) => s.toggleBackdrop);
  const openSettings = useSettingsStore((s) => s.handleOpenSettings);
  const storeViewMode = useCompanionStore((s) => s.viewMode);
  const toggleViewMode = useCompanionStore((s) => s.toggleViewMode);
  const storeZenMode = useCompanionStore((s) => s.isZenMode);
  const storeUiVisible = useCompanionStore((s) => s.isUiVisible);
  const storeSpeaking = useCompanionStore((s) => s.isSpeaking);
  const storeListening = useCompanionStore((s) => s.isListening);
  const storeThinking = useCompanionStore((s) => s.isThinking);
  const thoughtText = useCompanionStore((s) => s.thoughtText);
  const isOsOperating = useCompanionStore((s) => s.isOsOperating);
  const osOperationDetails = useCompanionStore((s) => s.osOperationDetails);
  const storeActiveTool = useCompanionStore((s) => s.activeToolName);

  // Resolution
  const isConnected = props.isConnected !== undefined ? props.isConnected : storeConnected;
  const isConnecting = props.isConnecting !== undefined ? props.isConnecting : storeConnecting;
  const isMuted = props.isMuted !== undefined ? props.isMuted : storeMuted;
  const isCameraActive = props.isCameraActive !== undefined ? props.isCameraActive : storeCamera;
  const isSolidBackdrop = props.isSolidBackdrop !== undefined ? props.isSolidBackdrop : storeSolidBackdrop;
  const isSpeaking = props.isSpeaking !== undefined ? props.isSpeaking : storeSpeaking;
  const isListening = props.isListening !== undefined ? props.isListening : storeListening;
  const isThinking = storeThinking;
  const activeToolName = props.activeToolName !== undefined ? props.activeToolName : storeActiveTool;

  const onToggleConnection = props.onToggleConnection;
  const onToggleMute = props.onToggleMute || toggleMute;
  const onToggleBackdrop = props.onToggleBackdrop || toggleBackdrop;
  const onOpenSettings = props.onOpenSettings || openSettings;
  const isScreenWatchActive = props.isScreenWatchActive !== undefined ? props.isScreenWatchActive : storeScreenWatch;
  const hasScreenRegion = props.hasScreenRegion !== undefined ? props.hasScreenRegion : Boolean(storeRegion);
  const viewMode = props.viewMode !== undefined ? props.viewMode : storeViewMode;
  const onToggleViewMode = props.onToggleViewMode || toggleViewMode;
  const isZenMode = props.isZenMode !== undefined ? props.isZenMode : storeZenMode;
  const onWakeUi = props.onWakeUi;
  const onTogglePerformanceHUD = props.onTogglePerformanceHUD;
  const isLive2dVisible = props.isLive2dVisible !== false;

  // Local UI State
  const dockRef = useRef<HTMLDivElement>(null);
  const [isVisionMenuOpen, setIsVisionMenuOpen] = useState(false);
  const visionMenuRef = useRef<HTMLDivElement>(null);
  const [, setIsHovered] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState<string>('0.0');

  // Spotify Media widget state
  const [mediaTrack, setMediaTrack] = useState<{ isPlaying: boolean; title: string | null; artist: string | null } | null>(null);

  const { interactiveProps } = useClickThrough();

  // Reconnection Countdown ticker
  useEffect(() => {
    if (connectionState !== 'RECONNECTING' || !reconnectTargetTime) return;
    const interval = setInterval(() => {
      const remainingMs = Math.max(0, reconnectTargetTime - Date.now());
      setReconnectCountdown((remainingMs / 1000).toFixed(1));
    }, 100);
    return () => clearInterval(interval);
  }, [connectionState, reconnectTargetTime]);

  // Media Player polling (3s)
  useEffect(() => {
    let mounted = true;
    const checkMedia = async () => {
      try {
        const res = await windowsMediaService.getStatus();
        if (mounted && res.status === 'success' && res.data) {
          const d = res.data as any;
          if (d.isPlaying && d.title) {
            setMediaTrack({ isPlaying: true, title: d.title, artist: d.artist || 'Spotify' });
          } else {
            setMediaTrack(null);
          }
        }
      } catch (_) {}
    };
    void checkMedia();
    const interval = setInterval(checkMedia, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Hitbox synchronization with Electron
  useEffect(() => {
    if (isZenMode) {
      clickThroughService.unregisterHitbox('hud');
      return;
    }

    const syncHitbox = () => {
      const rect = dockRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      clickThroughService.registerHitbox('hud', {
        x: Math.round(rect.left),
        y: Math.round(rect.top - (isVisionMenuOpen ? 220 : 0)),
        width: Math.round(rect.width),
        height: Math.round(rect.height + (isVisionMenuOpen ? 220 : 0)),
      });
    };
    const frame = requestAnimationFrame(syncHitbox);
    window.addEventListener('resize', syncHitbox, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', syncHitbox);
    };
  }, [isZenMode, isVisionMenuOpen]);

  // Close vision menu on outside click
  useEffect(() => {
    if (!isVisionMenuOpen) return;
    const handleOutside = (e: MouseEvent | PointerEvent) => {
      if (visionMenuRef.current && !visionMenuRef.current.contains(e.target as Node)) {
        setIsVisionMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutside);
    return () => window.removeEventListener('pointerdown', handleOutside);
  }, [isVisionMenuOpen]);

  if (isZenMode) return null;

  const handleConnectionClick = () => {
    soundFxService.playClick();
    if (isConnected) {
      soundFxService.playDisconnect();
    } else {
      soundFxService.playConnect();
    }
    onToggleConnection?.();
  };

  const handleMuteClick = () => {
    soundFxService.playMuteToggle(!isMuted);
    onToggleMute?.();
  };

  const handleToggleVisionMenu = () => {
    soundFxService.playClick();
    if (!isVisionMenuOpen) {
      void refreshSources();
    }
    setIsVisionMenuOpen((prev) => !prev);
  };

  const handleSelectFullscreen = (displayId: 'primary' | 'secondary') => {
    soundFxService.playClick();
    setCaptureMode('fullscreen');
    setTargetDisplayId(displayId);
    void startVisionPipeline({ mode: 'fullscreen', displayId });
    setIsVisionMenuOpen(false);
  };

  const handleSelectRegion = () => {
    soundFxService.playClick();
    setIsVisionMenuOpen(false);
    openRegionPicker();
  };

  const handleSelectWindow = (windowId: string, windowTitle: string) => {
    soundFxService.playClick();
    setTargetWindow(windowId, windowTitle);
    void startVisionPipeline({ mode: 'window', windowId, windowTitle });
    setIsVisionMenuOpen(false);
  };

  const handleSelectCamera = () => {
    soundFxService.playClick();
    setIsVisionMenuOpen(false);
    void startVisionPipeline({ mode: 'camera' });
  };

  const handleStopVision = () => {
    soundFxService.playClick();
    stopVisionPipeline();
    clearScreenRegion();
    setIsVisionMenuOpen(false);
  };

  const handleTelemetryClick = () => {
    soundFxService.playClick();
    if (onTogglePerformanceHUD) {
      onTogglePerformanceHUD();
    } else {
      void electronBridge.openTelemetryWindow();
    }
  };

  const handleSettingsClick = () => {
    soundFxService.playMenuOpen();
    onOpenSettings?.();
  };

  const hasActiveLiveSessionState = Boolean(
    isConnecting ||
    connectionState === 'RECONNECTING' ||
    connectionState === 'ERROR' ||
    activeToolName ||
    isOsOperating ||
    isThinking ||
    isSpeaking ||
    isListening ||
    isScreenWatchActive ||
    isCameraActive
  );

  // Vision Mode Badge Label
  const getVisionBadgeLabel = () => {
    if (isCameraActive) return '0.5 FPS • CÁMARA';
    if (captureMode === 'region' && hasScreenRegion) {
      return `0.5 FPS • REGIÓN (${Math.round(storeRegion?.w_pct || 100)}%×${Math.round(storeRegion?.h_pct || 100)}%)`;
    }
    if (captureMode === 'window' && targetWindowTitle) {
      return `0.5 FPS • VENTANA: ${targetWindowTitle.slice(0, 18)}`;
    }
    return `0.5 FPS • PANTALLA ${targetDisplayId === 'secondary' ? '2' : '1'}`;
  };

  return (
    <>
      {/* Barra de Herramientas Principal Flotante (Dock) */}
      <div
        className="fixed bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-[99] select-none opacity-100 transition-opacity duration-200"
        {...interactiveProps}
        onMouseEnter={() => {
          setIsHovered(true);
          onWakeUi?.();
          interactiveProps.onMouseEnter?.();
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          interactiveProps.onMouseLeave?.();
        }}
      >
        {/* Micro-Tarjeta de Spotify Activo */}
        {mediaTrack?.isPlaying && (
          <div className="flex items-center gap-2.5 px-3 py-1 rounded-sm bg-zinc-950/95 backdrop-blur-md border border-emerald-900/60 text-zinc-300 font-mono text-[11px] shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
            <Music size={11} className="text-emerald-400 animate-pulse" />
            <span className="text-zinc-400 text-[10px] uppercase">SPOTIFY:</span>
            <span className="text-emerald-300 font-medium truncate max-w-[200px]">{mediaTrack.title}</span>
            <span className="text-zinc-500 text-[10px]">· {mediaTrack.artist}</span>
            <div className="flex items-center gap-1 pl-1 border-l border-zinc-800">
              <button
                type="button"
                onClick={() => void windowsMediaService.control('play_pause')}
                className="p-0.5 hover:text-white transition-colors cursor-pointer"
                title="Pausar / Reanudar"
              >
                <Pause size={10} />
              </button>
              <button
                type="button"
                onClick={() => void windowsMediaService.control('next')}
                className="p-0.5 hover:text-white transition-colors cursor-pointer"
                title="Siguiente pista"
              >
                <SkipForward size={10} />
              </button>
            </div>
          </div>
        )}

        {/* Indicadores Dinámicos de Estado de Sesión en Vivo */}
        {hasActiveLiveSessionState && (
          <div
            className="flex items-center gap-2 px-2.5 py-1 rounded-sm bg-zinc-950/95 backdrop-blur-md border border-zinc-800 text-zinc-300 font-mono text-[11px] shadow-xl animate-in fade-in slide-in-from-bottom-1 duration-200 flex-wrap justify-center max-w-xl"
          >
            {/* 1. Estado Reconectando con Jitter */}
            {connectionState === 'RECONNECTING' && (
              <div className="flex items-center gap-1.5 text-amber-400 font-medium animate-pulse">
                <div className="w-2 h-2 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span>RECONECTANDO EN {reconnectCountdown}s (#{reconnectAttempt}/{maxReconnectAttempts})</span>
              </div>
            )}

            {/* 2. Estado Conectando */}
            {isConnecting && connectionState !== 'RECONNECTING' && (
              <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                <div className="w-2 h-2 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span>ENLAZANDO...</span>
              </div>
            )}

            {/* 3. Estado Error con Tooltip */}
            {connectionState === 'ERROR' && (
              <div className="flex items-center gap-1.5 text-rose-400 font-medium" title={errorMessage || 'Fallo de enlace'}>
                <AlertCircle size={11} className="text-rose-400" />
                <span>FALLO DE SESIÓN</span>
              </div>
            )}

            {/* 4. Operación del SO en C:\ & Salvaguardas */}
            {isOsOperating && (
              <div className="flex items-center gap-1.5 text-amber-300 font-medium bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-800/50">
                <Cpu size={10} className="text-amber-400 animate-spin" />
                <span>{osOperationDetails || 'C:\\ Acceso Activo'}</span>
                <span className="text-[9px] text-emerald-400 flex items-center gap-0.5">
                  <ShieldCheck size={9} /> PROTEGIDO
                </span>
              </div>
            )}

            {/* 5. Tool Call */}
            {activeToolName && !isOsOperating && (
              <div className="flex items-center gap-1.5 text-purple-300 font-medium">
                <Wrench size={11} className="animate-spin text-purple-400" />
                <span className="uppercase">TOOL: {activeToolName}</span>
              </div>
            )}

            {/* 6. Pensamiento en Vivo (Extended Thinking) */}
            {isThinking && !activeToolName && !isSpeaking && (
              <div
                className="flex items-center gap-1.5 text-violet-300 font-medium bg-violet-950/30 px-1.5 py-0.5 rounded border border-violet-800/50"
                title={thoughtText ? `Pensamiento: ${thoughtText}` : 'Razonando profundamente'}
              >
                <Sparkles size={11} className="animate-spin text-violet-400" />
                <span>{thoughtText ? `PENSANDO: "${thoughtText.slice(-35)}"` : 'PENSANDO...'}</span>
              </div>
            )}

            {/* 7. Hablando / Escuchando */}
            {isSpeaking && !activeToolName && (
              <div className="flex items-center gap-1.5 text-cyan-300 font-medium">
                <Volume2 size={11} className="animate-pulse text-cyan-400" />
                <span>HABLANDO</span>
              </div>
            )}

            {isListening && !isSpeaking && !activeToolName && !isThinking && (
              <div className="flex items-center gap-1.5 text-emerald-300 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>ESCUCHANDO</span>
              </div>
            )}

            {/* 8. Visión Activa con Insignia de Modo */}
            {(isScreenWatchActive || isCameraActive) && (
              <div className="flex items-center gap-1.5 text-sky-300 font-medium border-l border-zinc-800 pl-2">
                <Eye size={11} className="text-sky-400 animate-pulse" />
                <span>{getVisionBadgeLabel()}</span>
              </div>
            )}
          </div>
        )}

        {/* Menú Desplegable Táctico de 4 Modos de Visión */}
        {isVisionMenuOpen && (
          <div
            ref={visionMenuRef}
            className="w-72 bg-zinc-950/98 backdrop-blur-md border border-zinc-800 rounded-sm shadow-2xl p-2 font-mono text-xs text-zinc-200 space-y-2 animate-in fade-in zoom-in-95 duration-150 mb-1"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800 text-[11px] text-zinc-400 font-semibold uppercase">
              <span className="flex items-center gap-1.5">
                <Eye size={12} className="text-sky-400" /> Modo de Percepción Visual
              </span>
              <span className="text-[10px] text-zinc-500">0.5 FPS</span>
            </div>

            {/* 1. Pantalla Completa */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-zinc-500 font-bold block">1. Pantalla Completa</span>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => handleSelectFullscreen('primary')}
                  className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-sm border text-[11px] transition-colors cursor-pointer ${
                    isScreenWatchActive && captureMode === 'fullscreen' && targetDisplayId === 'primary'
                      ? 'bg-zinc-800 border-emerald-600/80 text-emerald-300'
                      : 'bg-zinc-900/60 border-zinc-800 hover:bg-zinc-800 text-zinc-300'
                  }`}
                >
                  <Monitor size={11} />
                  <span>Pantalla 1</span>
                  {isScreenWatchActive && captureMode === 'fullscreen' && targetDisplayId === 'primary' && <Check size={10} />}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectFullscreen('secondary')}
                  className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-sm border text-[11px] transition-colors cursor-pointer ${
                    isScreenWatchActive && captureMode === 'fullscreen' && targetDisplayId === 'secondary'
                      ? 'bg-zinc-800 border-emerald-600/80 text-emerald-300'
                      : 'bg-zinc-900/60 border-zinc-800 hover:bg-zinc-800 text-zinc-300'
                  }`}
                >
                  <Monitor size={11} />
                  <span>Pantalla 2</span>
                  {isScreenWatchActive && captureMode === 'fullscreen' && targetDisplayId === 'secondary' && <Check size={10} />}
                </button>
              </div>
            </div>

            {/* 2. Región Específica */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-zinc-500 font-bold block">2. Región Interactiva</span>
              <button
                type="button"
                onClick={handleSelectRegion}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm border text-[11px] transition-colors cursor-pointer ${
                  hasScreenRegion && captureMode === 'region'
                    ? 'bg-zinc-800 border-cyan-600/80 text-cyan-300'
                    : 'bg-zinc-900/60 border-zinc-800 hover:bg-zinc-800 text-zinc-300'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Crosshair size={12} className="text-cyan-400" />
                  <span>{hasScreenRegion ? 'Redefinir Bounding Box' : 'Trazar Región Específica'}</span>
                </span>
                {hasScreenRegion && <Check size={11} />}
              </button>
            </div>

            {/* 3. Ventana Específica */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase text-zinc-500 font-bold block">3. Ventana de Aplicación</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    soundFxService.playClick();
                    void refreshSources();
                  }}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 cursor-pointer"
                  title="Actualizar lista de aplicaciones abiertas"
                >
                  <RefreshCw size={9} />
                  <span>Actualizar</span>
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-0.5 pr-0.5 custom-scrollbar">
                {availableWindows.length > 0 ? (
                  availableWindows.map((w) => {
                    const isSelected = isScreenWatchActive && captureMode === 'window' && targetWindowId === w.id;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => handleSelectWindow(w.id, w.title)}
                        className={`w-full flex items-center justify-between px-2 py-1 rounded-sm text-[11px] text-left truncate transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-800 border border-purple-600/80 text-purple-300 font-medium'
                            : 'hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                        }`}
                        title={w.title}
                      >
                        <span className="flex items-center gap-2 truncate">
                          {w.thumbnail ? (
                            <img src={w.thumbnail} alt="" className="w-3.5 h-3.5 rounded-xs object-contain shrink-0" />
                          ) : (
                            <AppWindow size={11} className={isSelected ? 'text-purple-400 shrink-0' : 'text-zinc-500 shrink-0'} />
                          )}
                          <span className="truncate">{w.title}</span>
                        </span>
                        {isSelected && <Check size={11} className="shrink-0 text-purple-400" />}
                      </button>
                    );
                  })
                ) : (
                  <button
                    type="button"
                    onClick={() => void refreshSources()}
                    className="w-full text-left py-1 text-[10px] text-zinc-500 hover:text-zinc-300 italic flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={10} className="animate-spin-slow" />
                    <span>Haz clic para escanear ventanas abiertas...</span>
                  </button>
                )}
              </div>
            </div>

            {/* 4. Cámara Web Física & Detener */}
            <div className="pt-1.5 border-t border-zinc-800 flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={handleSelectCamera}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-sm border text-[11px] transition-colors cursor-pointer ${
                  isCameraActive
                    ? 'bg-zinc-800 border-zinc-500 text-white'
                    : 'bg-zinc-900/60 border-zinc-800 hover:bg-zinc-800 text-zinc-300'
                }`}
              >
                <Camera size={11} />
                <span>Cámara Web</span>
              </button>

              {(isScreenWatchActive || isCameraActive) && (
                <button
                  type="button"
                  onClick={handleStopVision}
                  className="px-2 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/70 text-rose-300 rounded-sm text-[11px] transition-colors cursor-pointer"
                  title="Detener toda percepción visual"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>
        )}

        <div
          ref={dockRef}
          className="flex items-center gap-1 px-2 py-1.5 rounded-sm bg-zinc-950/95 backdrop-blur-md border border-zinc-800 shadow-2xl font-mono text-xs"
        >
          {/* Botón Maestro: 5 Estados de Conexión */}
          <button
            type="button"
            onClick={handleConnectionClick}
            disabled={isConnecting && connectionState !== 'ERROR'}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-sm border transition-colors cursor-pointer ${
              isConnected
                ? 'bg-zinc-800 text-emerald-300 border-emerald-700/60 hover:bg-zinc-700'
                : connectionState === 'RECONNECTING'
                ? 'bg-zinc-900 text-amber-400 border-amber-600/80 hover:bg-zinc-800'
                : connectionState === 'ERROR'
                ? 'bg-rose-950/80 text-rose-300 border-rose-700/80 hover:bg-rose-900'
                : isConnecting
                ? 'bg-zinc-900 text-amber-300 border-zinc-700'
                : 'bg-zinc-100 text-zinc-950 border-zinc-300 hover:bg-white'
            }`}
            title={
              isConnected
                ? 'Desconectar llamada en vivo'
                : connectionState === 'RECONNECTING'
                ? `Reconectando en ${reconnectCountdown}s... Clic para forzar llamada`
                : connectionState === 'ERROR'
                ? `Error: ${errorMessage || 'Fallo de enlace'}. Haz clic para reintentar`
                : 'Iniciar llamada con Cristi en vivo'
            }
          >
            {isConnected ? (
              <>
                <PhoneOff size={13} />
                <span>DESCONECTAR</span>
              </>
            ) : connectionState === 'RECONNECTING' ? (
              <>
                <div className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span>REINTENTANDO...</span>
              </>
            ) : connectionState === 'ERROR' ? (
              <>
                <AlertCircle size={13} />
                <span>REINTENTAR</span>
              </>
            ) : isConnecting ? (
              <>
                <div className="w-2.5 h-2.5 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
                <span>ENLAZANDO...</span>
              </>
            ) : (
              <>
                <PhoneCall size={13} />
                <span>HABLAR EN VIVO</span>
              </>
            )}
          </button>

          <div className="w-px h-5 bg-zinc-800 mx-1" />

          {/* Micrófono / Silenciar */}
          <button
            type="button"
            onClick={handleMuteClick}
            className={`p-1.5 rounded-sm border transition-colors cursor-pointer ${
              isMuted
                ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
            title={isMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
          >
            {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
          </button>

          {/* Selector Táctico de Visión (4 Modos en Popover) */}
          <button
            type="button"
            onClick={handleToggleVisionMenu}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-sm border transition-colors cursor-pointer ${
              isScreenWatchActive || isCameraActive
                ? 'bg-zinc-800 text-sky-300 border-sky-700/70 shadow-sm'
                : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
            title="Seleccionar Modo de Visión (Pantalla, Región, Ventana, Cámara)"
          >
            {isCameraActive ? (
              <Video size={13} className="text-white" />
            ) : captureMode === 'region' && hasScreenRegion ? (
              <Crosshair size={13} className="text-cyan-400" />
            ) : captureMode === 'window' ? (
              <AppWindow size={13} className="text-purple-400" />
            ) : isScreenWatchActive ? (
              <Monitor size={13} className="text-emerald-400" />
            ) : (
              <Eye size={13} />
            )}
            <ChevronUp size={10} className={`transition-transform ${isVisionMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Limpiar Región si está fija */}
          {hasScreenRegion && (
            <button
              type="button"
              onClick={() => {
                soundFxService.playClick();
                clearScreenRegion();
              }}
              className="p-1.5 rounded-sm border bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800 transition-colors cursor-pointer"
              title="Limpiar región recortada"
            >
              <Trash2 size={13} />
            </button>
          )}

          <div className="w-px h-5 bg-zinc-800 mx-1" />

          {isLive2dVisible && (
            <>
              {/* Encuadre de Vista (Torso / Completo) */}
              <button
                type="button"
                onClick={() => {
                  soundFxService.playClick();
                  onToggleViewMode?.();
                }}
                className="p-1.5 rounded-sm border bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
                title={`Encuadre: ${viewMode === 'torso' ? 'Torso' : 'Completo'}`}
              >
                {viewMode === 'torso' ? <User size={13} /> : <Maximize2 size={13} />}
              </button>

              {/* Lluvia Matrix / Transparente */}
              <button
                type="button"
                onClick={onToggleBackdrop}
                className={`p-1.5 rounded-sm border transition-colors cursor-pointer ${
                  isSolidBackdrop
                    ? 'bg-zinc-800 text-white border-zinc-600 shadow-sm'
                    : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
                title={isSolidBackdrop ? 'Lluvia Matrix activa (clic para modo transparente)' : 'Modo transparente activo (clic para Lluvia Matrix)'}
              >
                <Frame size={13} />
              </button>

              {/* Alternar Modelo Live2D */}
              <button
                type="button"
                onClick={() => {
                  soundFxService.playClick();
                  props.onToggleLive2dModel?.();
                }}
                className="p-1.5 rounded-sm border bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
                title={`Cambiar modelo Live2D (Actual: ${props.live2dModelId === 'jane_doe' ? 'Jane Doe' : 'YandereGirl'})`}
              >
                <RefreshCw size={13} />
              </button>
            </>
          )}

          {/* Visibilidad de Live2D */}
          <button
            type="button"
            onClick={() => {
              soundFxService.playClick();
              props.onToggleLive2d?.();
            }}
            className="p-1.5 rounded-sm border bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
            title={isLive2dVisible ? 'Ocultar y suspender Live2D' : 'Mostrar Live2D'}
          >
            {isLive2dVisible ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>

          {/* Telemetría & Rendimiento (F3 / Launcher) */}
          <button
            type="button"
            onClick={handleTelemetryClick}
            className="p-1.5 rounded-sm border bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Telemetría y Rendimiento en Tiempo Real (F3)"
          >
            <Activity size={13} />
          </button>

          {/* Panel de Ajustes */}
          <button
            type="button"
            onClick={handleSettingsClick}
            className="p-1.5 rounded-sm border bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Abrir Panel de Configuración"
          >
            <Settings size={13} />
          </button>
        </div>
      </div>
    </>
  );
});

export default FloatingHUD;
