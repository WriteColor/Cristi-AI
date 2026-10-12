import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import { useClickThrough } from '../hooks/useClickThrough.js';
import { soundFxService } from '../domain/audio/SoundFxService.js';
import { clickThroughService } from '../services/desktop/ClickThroughService.js';
import { useSessionStore } from '../stores/useSessionStore.js';
import { useAudioStore } from '../stores/useAudioStore.js';
import { useVisionStore } from '../stores/useVisionStore.js';
import { useSettingsStore } from '../stores/useSettingsStore.js';
import { useCompanionStore } from '../stores/useCompanionStore.js';
import { electronBridge } from '../services/desktop/ElectronBridge.js';

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
 * Cristi AI - Barra de Herramientas Flotante (Floating HUD)
 * Estilo Shadcn Dark Zinc Minimalista
 * Esquinas rounded-sm, border-zinc-800, zinc-950 con transparencia y desenfoque,
 * controles de sesión de audio/visión/telemetría e indicadores de estado en tiempo real.
 */
export const FloatingHUD: React.FC<FloatingHUDProps> = React.memo(function FloatingHUD(props = {}) {
  const storeConnected = useSessionStore((s) => s.isConnected);
  const storeConnecting = useSessionStore((s) => s.isConnecting);
  const storeMuted = useAudioStore((s) => s.isMuted);
  const toggleMute = useAudioStore((s) => s.toggleMute);
  const storeCamera = useVisionStore((s) => s.isCameraActive);
  const storeSolidBackdrop = useCompanionStore((s) => s.isSolidBackdrop);
  const toggleBackdrop = useCompanionStore((s) => s.toggleBackdrop);
  const openSettings = useSettingsStore((s) => s.handleOpenSettings);
  const storeViewMode = useCompanionStore((s) => s.viewMode);
  const toggleViewMode = useCompanionStore((s) => s.toggleViewMode);
  const storeZenMode = useCompanionStore((s) => s.isZenMode);
  const storeUiVisible = useCompanionStore((s) => s.isUiVisible);
  const storeScreenWatch = useVisionStore((s) => s.isScreenWatchActive);
  const storeRegion = useVisionStore((s) => s.screenRegion);
  const openRegionPicker = useVisionStore((s) => s.openRegionPicker);
  const clearScreenRegion = useVisionStore((s) => s.clearScreenRegion);
  const storeSpeaking = useCompanionStore((s) => s.isSpeaking);
  const storeListening = useCompanionStore((s) => s.isListening);
  const storeThinking = useCompanionStore((s) => s.isThinking);
  const storeActiveTool = useCompanionStore((s) => s.activeToolName);

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
  const onToggleCamera = props.onToggleCamera;
  const onToggleBackdrop = props.onToggleBackdrop || toggleBackdrop;
  const onOpenSettings = props.onOpenSettings || openSettings;
  const isScreenWatchActive = props.isScreenWatchActive !== undefined ? props.isScreenWatchActive : storeScreenWatch;
  const hasScreenRegion = props.hasScreenRegion !== undefined ? props.hasScreenRegion : Boolean(storeRegion);
  const onToggleScreenWatch = props.onToggleScreenWatch;
  const onOpenRegionPicker = props.onOpenRegionPicker || openRegionPicker;
  const onClearScreenRegion = props.onClearScreenRegion || clearScreenRegion;
  const viewMode = props.viewMode !== undefined ? props.viewMode : storeViewMode;
  const onToggleViewMode = props.onToggleViewMode || toggleViewMode;
  const isZenMode = props.isZenMode !== undefined ? props.isZenMode : storeZenMode;
  const isUiVisible = props.isUiVisible !== undefined ? props.isUiVisible : storeUiVisible;
  const onWakeUi = props.onWakeUi;
  const onTogglePerformanceHUD = props.onTogglePerformanceHUD;
  const isLive2dVisible = props.isLive2dVisible !== false;
  const dockRef = useRef<HTMLDivElement>(null);
  const [, setIsHovered] = useState(false);

  const { interactiveProps } = useClickThrough();

  // Sincronizar hitbox interactivo del Dock de herramientas con Electron Main
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
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };
    const frame = requestAnimationFrame(syncHitbox);
    window.addEventListener('resize', syncHitbox, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', syncHitbox);
    };
  }, [isZenMode, isUiVisible]);

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

  const handleCameraClick = () => {
    soundFxService.playClick();
    if (onToggleCamera) {
      onToggleCamera();
    } else {
      void electronBridge.openCameraWindow();
    }
  };

  const handleCameraContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    soundFxService.playClick();
    void electronBridge.openCameraWindow();
  };

  const handleScreenWatchClick = () => {
    soundFxService.playClick();
    onToggleScreenWatch?.();
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
    isConnecting || activeToolName || isThinking || isSpeaking || isListening || isScreenWatchActive
  );

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
        {/* Indicadores Dinámicos de Estado de Sesión en Vivo */}
        {hasActiveLiveSessionState && (
          <div
            className="flex items-center gap-2 px-2.5 py-1 rounded-sm bg-zinc-950/95 backdrop-blur-md border border-zinc-800 text-zinc-300 font-mono text-[11px] shadow-xl animate-in fade-in slide-in-from-bottom-1 duration-200"
          >
            {isConnecting && (
              <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                <div className="w-2 h-2 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span>CONECTANDO...</span>
              </div>
            )}

            {activeToolName && (
              <div className="flex items-center gap-1.5 text-purple-300 font-medium">
                <Wrench size={11} className="animate-spin text-purple-400" />
                <span className="uppercase">TOOL: {activeToolName}</span>
              </div>
            )}

            {isThinking && !activeToolName && !isSpeaking && (
              <div className="flex items-center gap-1.5 text-violet-300 font-medium">
                <Sparkles size={11} className="animate-spin text-violet-400" />
                <span>PENSANDO...</span>
              </div>
            )}

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

            {isScreenWatchActive && (
              <div className="flex items-center gap-1.5 text-sky-300 font-medium border-l border-zinc-800 pl-2">
                <Monitor size={11} className="text-sky-400" />
                <span>{hasScreenRegion ? 'REGIÓN RECORTE' : 'PANTALLA COMPLETA'}</span>
              </div>
            )}
          </div>
        )}

        <div
          ref={dockRef}
          className="flex items-center gap-1 px-2 py-1.5 rounded-sm bg-zinc-950/95 backdrop-blur-md border border-zinc-800 shadow-2xl font-mono text-xs"
        >
          {/* Botón Maestro: Conectar / Hablar con Gemini Live */}
          <button
            type="button"
            onClick={handleConnectionClick}
            disabled={isConnecting}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-sm border transition-colors ${
              isConnected
                ? 'bg-zinc-800 text-emerald-300 border-emerald-700/60 hover:bg-zinc-700'
                : isConnecting
                ? 'bg-zinc-900 text-amber-300 border-zinc-700'
                : 'bg-zinc-100 text-zinc-950 border-zinc-300 hover:bg-white'
            }`}
            title={isConnected ? 'Desconectar llamada en vivo' : 'Iniciar llamada con Cristi en vivo'}
          >
            {isConnected ? (
              <>
                <PhoneOff size={13} />
                <span>DESCONECTAR</span>
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
            className={`p-1.5 rounded-sm border transition-colors ${
              isMuted
                ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
            title={isMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
          >
            {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
          </button>

          {/* Visión por Cámara */}
          <button
            type="button"
            onClick={handleCameraClick}
            onContextMenu={handleCameraContextMenu}
            className={`p-1.5 rounded-sm border transition-colors ${
              isCameraActive
                ? 'bg-zinc-800 text-white border-zinc-600'
                : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
            title={isCameraActive ? 'Desactivar cámara (Clic derecho: Abrir monitor óptico)' : 'Activar visión por cámara web (Clic derecho: Abrir monitor óptico)'}
          >
            {isCameraActive ? <Video size={13} /> : <VideoOff size={13} />}
          </button>

          {/* Visión de Pantalla Completa (Mutuamente Exclusiva con Región) */}
          <button
            type="button"
            onClick={handleScreenWatchClick}
            className={`p-1.5 rounded-sm border transition-colors ${
              isScreenWatchActive && !hasScreenRegion
                ? 'bg-zinc-800 text-white border-zinc-600'
                : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
            title={isScreenWatchActive && !hasScreenRegion ? 'Detener transmisión de pantalla completa' : 'Transmitir pantalla completa a Cristi'}
          >
            {isScreenWatchActive && !hasScreenRegion ? <Monitor size={13} /> : <MonitorOff size={13} />}
          </button>

          {/* Recorte de Región de Pantalla (Mutuamente Exclusiva con Pantalla Completa) */}
          <button
            type="button"
            onClick={() => {
              soundFxService.playClick();
              onOpenRegionPicker?.();
            }}
            className={`p-1.5 rounded-sm border transition-colors ${
              hasScreenRegion
                ? 'bg-zinc-800 text-white border-zinc-600'
                : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
            title={hasScreenRegion ? 'Región recortada activa (clic para redefinir)' : 'Seleccionar región específica de la pantalla'}
          >
            <Crosshair size={13} />
          </button>

          {hasScreenRegion && (
            <button
              type="button"
              onClick={() => {
                soundFxService.playClick();
                onClearScreenRegion?.();
              }}
              className="p-1.5 rounded-sm border bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800 transition-colors"
              title="Limpiar región y detener visión"
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
                className="p-1.5 rounded-sm border bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                title={`Encuadre: ${viewMode === 'torso' ? 'Torso' : 'Completo'}`}
              >
                {viewMode === 'torso' ? <User size={13} /> : <Maximize2 size={13} />}
              </button>

              {/* Lluvia Matrix / Transparente */}
              <button
                type="button"
                onClick={onToggleBackdrop}
                className={`p-1.5 rounded-sm border transition-colors ${
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
                className="p-1.5 rounded-sm border bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
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
            className="p-1.5 rounded-sm border bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            title={isLive2dVisible ? 'Ocultar y suspender Live2D' : 'Mostrar Live2D'}
          >
            {isLive2dVisible ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>

          {/* Telemetría & Rendimiento (F3 / Launcher) */}
          <button
            type="button"
            onClick={handleTelemetryClick}
            className="p-1.5 rounded-sm border bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            title="Telemetría y Rendimiento en Tiempo Real (F3)"
          >
            <Activity size={13} />
          </button>

          {/* Panel de Ajustes */}
          <button
            type="button"
            onClick={handleSettingsClick}
            className="p-1.5 rounded-sm border bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
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
