import { useShallow } from 'zustand/react/shallow';
import React, { useRef } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import {
  BackgroundScene,
  AvatarStage,
  FloatingHUD,
  ContextMenu,
  ScreenRegionOverlay,
  ScreenRegionPicker,
  DesktopWidgets,
  ToastContainer
} from './components';
import {
  useCompanionStore,
  useSessionStore,
  useAudioStore,
  useVisionStore,
  useSettingsStore,
  useTelemetryStore,
  useWidgetStore
} from './stores/index.js';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts.js';
import { useCompanionServices } from './hooks/useCompanionServices.js';
import { electronBridge } from './services/desktop/ElectronBridge.js';
import { integrationHealthRegistry } from './domain/integrations/IntegrationHealth.js';
import { logger } from './infrastructure/logging/logger.js';

export function App() {
  const live2dRef = useRef<any>(null);
  const recentErrorsRef = useRef<string[]>([]);
  React.useEffect(() => {
    void useSettingsStore.getState().loadConfig().catch(error => useSessionStore.getState().setErrorMessage(String(error)));
  }, []);

  React.useEffect(() => logger.subscribe((entry) => {
    if (entry.level !== 'warn' && entry.level !== 'error') return;
    const message = `${entry.tag}: ${entry.message}`.slice(0, 320);
    const previous = recentErrorsRef.current;
    recentErrorsRef.current = previous[0] === message ? previous : [message, ...previous].slice(0, 5);
  }), []);

  // Consume Zustand stores
  const { currentGesture, isSpeaking, isListening, activeToolName, isSolidBackdrop, isAlwaysOnTop, isClickThroughEnabled, isZenMode, isUiVisible, contextMenu, triggerRandomGesture, toggleBackdrop, toggleAlwaysOnTop, toggleClickThrough, toggleZenMode, closeContextMenu } = useCompanionStore(useShallow(s => ({ currentGesture: s.currentGesture, isSpeaking: s.isSpeaking, isListening: s.isListening, activeToolName: s.activeToolName, isSolidBackdrop: s.isSolidBackdrop, isAlwaysOnTop: s.isAlwaysOnTop, isClickThroughEnabled: s.isClickThroughEnabled, isZenMode: s.isZenMode, isUiVisible: s.isUiVisible, contextMenu: s.contextMenu, triggerRandomGesture: s.triggerRandomGesture, toggleBackdrop: s.toggleBackdrop, toggleAlwaysOnTop: s.toggleAlwaysOnTop, toggleClickThrough: s.toggleClickThrough, toggleZenMode: s.toggleZenMode, closeContextMenu: s.closeContextMenu })));

  const { isConnected, isConnecting, errorMessage, setErrorMessage } = useSessionStore(useShallow(s => ({ isConnected: s.isConnected, isConnecting: s.isConnecting, errorMessage: s.errorMessage, setErrorMessage: s.setErrorMessage })));
  const { isMuted, toggleMute } = useAudioStore(useShallow(s => ({ isMuted: s.isMuted, toggleMute: s.toggleMute })));
  const { isCameraActive, isScreenWatchActive, screenRegion, isRegionPickerOpen, openRegionPicker, closeRegionPicker } = useVisionStore(useShallow(s => ({ isCameraActive: s.isCameraActive, isScreenWatchActive: s.isScreenWatchActive, screenRegion: s.screenRegion, isRegionPickerOpen: s.isRegionPickerOpen, openRegionPicker: s.openRegionPicker, closeRegionPicker: s.closeRegionPicker })));
  const { config, switchAiModel, switchVoice, handleOpenSettings, updateConfig } = useSettingsStore(useShallow(s => ({ config: s.config, switchAiModel: s.switchAiModel, switchVoice: s.switchVoice, handleOpenSettings: s.handleOpenSettings, updateConfig: s.updateConfig })));
  const openTelemetry = React.useCallback(() => { void electronBridge.openTelemetryWindow(); }, []);
  const { showWidgets, toggleShowWidgets } = useWidgetStore(useShallow(s => ({ showWidgets: s.showWidgets, toggleShowWidgets: s.toggleShowWidgets })));
  const avatarViewMode = config.avatarViewMode || 'torso';
  const live2dVisible = config.live2dVisible !== false;
  const live2dModelId = config.live2dModelId === 'jane_doe' ? 'jane_doe' : 'yanderegirl';
  const toggleAvatarViewMode = React.useCallback(() => {
    void updateConfig({ avatarViewMode: avatarViewMode === 'torso' ? 'full' : 'torso' });
  }, [avatarViewMode, updateConfig]);
  const toggleLive2d = React.useCallback(() => {
    void updateConfig({ live2dVisible: !live2dVisible });
  }, [live2dVisible, updateConfig]);
  const toggleLive2dModel = React.useCallback(() => {
    void updateConfig({ live2dModelId: live2dModelId === 'yanderegirl' ? 'jane_doe' : 'yanderegirl' });
  }, [live2dModelId, updateConfig]);

  // Background services coordination & native shortcuts
  const {
    handleToggleConnection, handleToggleCamera, handleToggleScreenWatch, handleRegionSelected,
    handleClearScreenRegion, handleModelContextMenu, handleMinimizeToTray, resetInactivityTimer
  } = useCompanionServices({ live2dRef });

  React.useEffect(() => {
    const publish = () => {
      const session = useSessionStore.getState();
      const audio = useAudioStore.getState();
      const vision = useVisionStore.getState();
      const companion = useCompanionStore.getState();
      const telemetry = useTelemetryStore.getState();
      // IPC validates a strict JSON value. Runtime objects may contain optional
      // `undefined` fields, which are not JSON and must never make telemetry
      // spam the main process with validation errors.
      const snapshot = {
        liveSession: {
          state: session.connectionState,
          connected: session.isConnected,
          connecting: session.isConnecting,
          interrupted: session.isInterrupted,
          activeTool: session.activeToolName,
          metrics: telemetry.liveMetrics,
        },
        audio: {
          microphoneMuted: audio.isMuted,
          inputActive: companion.isListening,
          outputActive: companion.isSpeaking,
          speakerVolume: audio.speakerVolume,
          diagnostics: telemetry.audioRuntime,
        },
        vision: {
          cameraActive: vision.isCameraActive,
          screenActive: vision.isScreenWatchActive,
          regionActive: Boolean(vision.screenRegion),
          detections: vision.latestDetections.length,
        },
        runtimeBudget: telemetry.runtimeBudget,
        recentErrors: recentErrorsRef.current,
        integrations: integrationHealthRegistry.all().map(({ id, state, configured, authenticated, connected, latencyMs, updatedAt }) =>
          ({ id, state, configured, authenticated, connected, latencyMs: latencyMs ?? null, updatedAt })),
      };
      void electronBridge.reportTelemetry(JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>).catch(() => {});
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleNext = () => {
      const session = useSessionStore.getState();
      const vision = useVisionStore.getState();
      const isBusy = session.isConnected || vision.isCameraActive || vision.isScreenWatchActive;
      const delay = isBusy ? 1000 : 3000;
      timer = setTimeout(() => {
        publish();
        scheduleNext();
      }, delay);
    };
    publish();
    scheduleNext();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  useGlobalShortcuts({ resetInactivityTimer, onToggleConnection: handleToggleConnection });

  return (
    <div className={`app-container ${isSolidBackdrop ? 'solid-backdrop' : 'transparent-backdrop'}`}>
      {errorMessage && (
        <div className="global-error-toast">
          <ShieldAlert size={16} color="#f43f5e" />
          <span style={{ flex: 1 }}>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)}><X size={14} /></button>
        </div>
      )}

      {/* 1. BackgroundScene */}
      <BackgroundScene />

      {/* 2. Live2DContainer / AvatarStage */}
      {live2dVisible && !isZenMode && <AvatarStage
        ref={live2dRef}
        modelId={live2dModelId}
        gesture={currentGesture}
        isSpeaking={isSpeaking}
        isListening={isListening}
        viewMode={avatarViewMode}
        onModelClick={triggerRandomGesture}
        onModelContextMenu={handleModelContextMenu}
      />}

      {/* 3. FloatingHUD */}
      <FloatingHUD
        isConnected={isConnected} isConnecting={isConnecting} isMuted={isMuted}
        isCameraActive={isCameraActive} isSolidBackdrop={isSolidBackdrop}
        modelId={config.modelId} voiceName={config.voiceName}
        isSpeaking={isSpeaking} isListening={isListening}
        activeToolName={activeToolName} viewMode={avatarViewMode} isUiVisible={isUiVisible}
        isLive2dVisible={live2dVisible} live2dModelId={live2dModelId}
        onToggleConnection={handleToggleConnection} onToggleMute={toggleMute}
        onToggleCamera={handleToggleCamera} onToggleBackdrop={toggleBackdrop}
        onOpenSettings={handleOpenSettings} isScreenWatchActive={isScreenWatchActive}
        hasScreenRegion={Boolean(screenRegion)} onToggleScreenWatch={handleToggleScreenWatch}
        onTogglePerformanceHUD={openTelemetry} onOpenRegionPicker={openRegionPicker}
        onClearScreenRegion={handleClearScreenRegion} onToggleViewMode={toggleAvatarViewMode}
        onToggleLive2d={toggleLive2d} onToggleLive2dModel={toggleLive2dModel}
        onToggleZenMode={toggleZenMode} onWakeUi={resetInactivityTimer}
      />

      {/* 4. ContextMenu */}
      <ContextMenu
        position={contextMenu} isOpen={contextMenu.isOpen} onClose={closeContextMenu}
        onOpenSettings={handleOpenSettings} onToggleCamera={handleToggleCamera} isCameraActive={isCameraActive}
        onToggleBackdrop={toggleBackdrop} isSolidBackdrop={isSolidBackdrop}
        onTriggerRandomGesture={triggerRandomGesture} onToggleAlwaysOnTop={toggleAlwaysOnTop} isAlwaysOnTop={isAlwaysOnTop}
        viewMode={avatarViewMode} onToggleViewMode={toggleAvatarViewMode} isZenMode={isZenMode} onToggleZenMode={toggleZenMode}
        isLive2dVisible={live2dVisible} live2dModelId={live2dModelId} onToggleLive2d={toggleLive2d} onToggleLive2dModel={toggleLive2dModel}
        onMinimizeToTray={handleMinimizeToTray} showWidgets={showWidgets} onToggleWidgets={toggleShowWidgets}
        isClickThroughEnabled={isClickThroughEnabled} onToggleClickThrough={toggleClickThrough}
        onTogglePerformanceHUD={openTelemetry} onOpenRegionPicker={openRegionPicker}
        isMuted={isMuted} onToggleMute={toggleMute} activeAiModelId={config.modelId} onSwitchAiModel={switchAiModel}
        activeVoiceName={config.voiceName} onSwitchVoice={switchVoice}
      />

      {/* 5. ScreenRegionOverlay & ScreenRegionPicker */}
      <ScreenRegionOverlay region={screenRegion} isWatchActive={isScreenWatchActive} />
      {isRegionPickerOpen && (
        <ScreenRegionPicker onRegionSelected={handleRegionSelected} onCancel={closeRegionPicker} />
      )}

      {/* 6. DesktopWidgets */}
      <DesktopWidgets isVisible={showWidgets && isUiVisible && !isZenMode} />

      {/* 8. ToastContainer */}
      <ToastContainer />
    </div>
  );
}

export default App;
