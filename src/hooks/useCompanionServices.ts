import { useCompanionRuntime } from '../app/CompanionRuntimeProvider';
import { useEffect, useRef, useCallback } from 'react';
import {
  eventBus,
  EVENTS,
  GeminiLiveSocket,
  AudioInputService,
  AudioOutputService,
  ToolExecutor,
  CameraService,
  VisionDetectionService,
  LocalVisionRuntime,
  ScreenCaptureService,
  SystemTrayService,
  externalDeviceManager,
  live2dModelRegistry,
  memoryService,
  mcpClientManager,
  contextualEmotionOrchestrator,
  electronBridge,
  clickThroughService,
  modelManager,
  configManager,
  soundFxService,
  proactiveTriggerService,
  proactiveScheduler,
  toast,
  toastService,
  logger,
  VisionFrameDispatcher,
  runtimeBudgetCoordinator,
  runtimeDiagnosticsRecorder,
  performanceProfiler
} from '../app/serviceRegistry.js';
import { DEFAULT_MODEL_ID, getScreenCaptureFPS } from '../config/index.js';
import { useCompanionStore } from '../stores/useCompanionStore.js';
import { useSessionStore } from '../stores/useSessionStore.js';
import { useAudioStore } from '../stores/useAudioStore.js';
import { useVisionStore, ScreenRegion } from '../stores/useVisionStore.js';
import { useSettingsStore } from '../stores/useSettingsStore.js';
import { useTelemetryStore } from '../stores/useTelemetryStore.js';
import { spotifyEmotionBridge } from '../mcp/servers/spotify/SpotifyEmotionBridge.ts';
import { EchoSuppressionGate } from '../domain/audio/EchoSuppressionGate.ts';

interface UseCompanionServicesProps {
  live2dRef: React.RefObject<any>;
}

export function useCompanionServices({ live2dRef }: UseCompanionServicesProps) {
  const runtime = useCompanionRuntime();
  const isCallActiveRef = useRef(false);
  const callGenerationRef = useRef(0);
  const socketRef = useRef<GeminiLiveSocket | null>(null);
  const audioInRef = useRef<AudioInputService | null>(null);
  const audioOutRef = useRef<AudioOutputService | null>(null);
  const cameraRef = useRef<CameraService | null>(null);
  const visionServiceRef = useRef<VisionDetectionService | null>(null);
  const localVisionRuntimeRef = useRef<LocalVisionRuntime | null>(null);
  const toolExecutorRef = useRef<ToolExecutor | null>(null);
  const screenCaptureRef = useRef<ScreenCaptureService | null>(null);
  const systemTrayRef = useRef<SystemTrayService | null>(null);
  const visionDispatcherRef = useRef<VisionFrameDispatcher | null>(null);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpotifyCredentialFingerprintRef = useRef<string | null>(null);
  const echoGateRef = useRef(new EchoSuppressionGate({ hangoverMs: 300 }));
  const isToolRunningRef = useRef(false);

  // Grab state from stores
  const config = useSettingsStore((s) => s.config);
  const isSettingsLoaded = useSettingsStore((s) => s.isLoaded);
  const isMuted = useAudioStore((s) => s.isMuted);
  const isZenMode = useCompanionStore((s) => s.isZenMode);
  const isClickThroughEnabled = useCompanionStore((s) => s.isClickThroughEnabled);
  const isAlwaysOnTop = useCompanionStore((s) => s.isAlwaysOnTop);
  const screenRegion = useVisionStore((s) => s.screenRegion);
  const isScreenWatchActive = useVisionStore((s) => s.isScreenWatchActive);

  // Settings are the sole source of truth. A voice/model change made from the
  // context menu or detached settings window must reconfigure an active Live
  // socket exactly once, after the optimistic setting has been persisted.
  useEffect(() => {
    const socket = socketRef.current;
    if (!isCallActiveRef.current || !socket) return;
    socket.reconfigure(config.modelId, config.voiceName);
  }, [config.modelId, config.voiceName]);

  // Synchronize avatar visibility state with emotion and behavior orchestrators
  useEffect(() => {
    const isLive2dActive = config.live2dVisible !== false && !isZenMode;
    contextualEmotionOrchestrator.setEnabled(isLive2dActive);
    spotifyEmotionBridge.setEnabled(isLive2dActive);
  }, [config.live2dVisible, isZenMode]);

  // Synchronize microphone capture mute state when toggled by user or system
  useEffect(() => {
    if (!audioInRef.current) return;
    if (isMuted) {
      audioInRef.current.mute();
    } else if (isCallActiveRef.current) {
      audioInRef.current.unmute();
    }
  }, [isMuted]);

  // Phase 0: observe shared runtime pressure without mutating subsystem rates.
  // Later phases consume this single published budget to throttle vision and
  // previews while keeping the live audio path independent and first-class.
  useEffect(() => {
    let lastDiagnosticSampleAt = 0;
    const publishBudget = () => {
      const playout = audioOutRef.current?.getTelemetry?.();
      const budget = runtimeBudgetCoordinator.update({
        callActive: isCallActiveRef.current,
        audioPlaying: Boolean(playout?.isPlaying),
        audioUnderruns: playout?.underruns ?? 0,
        playoutScheduledAheadMs: playout?.scheduledAheadMs ?? 0,
        visionActive: useVisionStore.getState().isCameraActive || useVisionStore.getState().isScreenWatchActive,
        visionInferenceActive: Boolean(visionServiceRef.current?.isRunning),
        live2dInteracting: useCompanionStore.getState().isDragging,
        settingsWindowOpen: useSettingsStore.getState().isSettingsWindowOpen,
        rendererVisible: typeof document === 'undefined' || !document.hidden,
      });
      useTelemetryStore.getState().setRuntimeBudget(budget);
      useTelemetryStore.getState().setAudioRuntime({
        isPlaying: Boolean(playout?.isPlaying),
        underruns: playout?.underruns ?? 0,
        bufferedDurationMs: playout?.bufferedDurationMs ?? 0,
        scheduledAheadMs: playout?.scheduledAheadMs ?? 0,
        jitterMs: playout?.jitterMs ?? 0,
      });
      localVisionRuntimeRef.current?.applyBudget(budget);

      const timestamp = Date.now();
      if (timestamp - lastDiagnosticSampleAt >= 1000) {
        lastDiagnosticSampleAt = timestamp;
        const renderer = performanceProfiler.getSnapshot();
        runtimeDiagnosticsRecorder.record({
          timestamp,
          budget,
          audio: {
            isPlaying: Boolean(playout?.isPlaying),
            underruns: playout?.underruns ?? 0,
            bufferedDurationMs: playout?.bufferedDurationMs ?? 0,
            scheduledAheadMs: playout?.scheduledAheadMs ?? 0,
            jitterMs: playout?.jitterMs ?? 0,
          },
          live: useTelemetryStore.getState().liveMetrics,
          renderer: {
            fps: renderer.fps,
            avgFrameTimeMs: renderer.avgFrameTimeMs,
            p99FrameTimeMs: renderer.p99FrameTimeMs,
            droppedFrames: renderer.droppedFrames,
          },
        });
      }
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleNextBudget = () => {
      const visionState = useVisionStore.getState();
      const isBusy = isCallActiveRef.current || visionState.isCameraActive || visionState.isScreenWatchActive;
      const delay = isBusy ? 500 : 2000;
      timer = setTimeout(() => {
        publishBudget();
        scheduleNextBudget();
      }, delay);
    };
    publishBudget();
    scheduleNextBudget();
    const onVisibilityChange = () => publishBudget();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Keep UI visible unless Zen Mode is explicitly active
  const resetInactivityTimer = useCallback(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
    if (useCompanionStore.getState().isZenMode) {
      useCompanionStore.getState().setIsUiVisible(false);
      return;
    }
    useCompanionStore.getState().setIsUiVisible(true);
  }, []);

  // Dispatch vision frames to Gemini Live socket
  const sendRealtimeVisionFrame = useCallback((base64Jpeg: string, source = 'vision', priority = false) => {
    if (!base64Jpeg) return false;
    return visionDispatcherRef.current?.enqueue(base64Jpeg, source, { priority: Boolean(priority) }) || false;
  }, []);

  // Send an explicit instruction with screen capture frame
  const sendScreenInstruction = useCallback(async (text: string) => {
    const socket = socketRef.current;
    if (!socket?.isConnected || !text) return false;
    let frame = null;
    try {
      frame = await screenCaptureRef.current?.captureActiveFrame?.(true);
    } catch (_) {}
    if (socketRef.current !== socket || !socket.isConnected) return false;
    socket.sendTextMessage(text, frame);
    return true;
  }, []);

  // Context menu helper
  const handleModelContextMenu = useCallback((e: any, bounds?: any) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    const posX = e?.clientX !== undefined ? e.clientX : window.innerWidth / 2;
    const posY = e?.clientY !== undefined ? e.clientY : window.innerHeight / 2;
    useCompanionStore.getState().openContextMenu(posX, posY, bounds || null);
  }, []);

  // Connection Toggle (Start / Stop Live Call)
  const handleToggleConnection = useCallback(async () => {
    const currentConfig = useSettingsStore.getState().config;
    const sessionStore = useSessionStore.getState();
    const companionStore = useCompanionStore.getState();

    if (isCallActiveRef.current) {
      callGenerationRef.current++;
      isCallActiveRef.current = false;
      echoGateRef.current.reset();
      isToolRunningRef.current = false;
      proactiveTriggerService.setGeminiSocket(null);
      proactiveScheduler.setGeminiSocket(null);
      if (socketRef.current) socketRef.current.disconnect();
      if (audioInRef.current) audioInRef.current.stop();
      if (audioOutRef.current) audioOutRef.current.stopImmediate();
      if (cameraRef.current) cameraRef.current.stopPeriodicStreaming();
      screenCaptureRef.current?.stopAll();
      visionDispatcherRef.current?.reset();
      useVisionStore.getState().setIsScreenWatchActive(false);

      sessionStore.dispatchConnection('DISCONNECT');
      companionStore.setIsSpeaking(false);
      companionStore.setIsListening(false);
      companionStore.setActiveDecision(null);
      companionStore.setActiveToolName(null);
      companionStore.setCurrentGesture('idle');
      soundFxService.playDisconnect();
      return;
    }

    if (!currentConfig.hasGeminiCredential) {
      if (electronBridge.isElectron && typeof electronBridge.credentialStatus === 'function') {
        try {
          const creds = await electronBridge.credentialStatus();
          if (creds?.hasGeminiCredential) {
            currentConfig.hasGeminiCredential = true;
            await useSettingsStore.getState().updateConfig({ hasGeminiCredential: true });
          }
        } catch (_) {}
      }
    }

    if (!currentConfig.hasGeminiCredential) {
      toastService.warning('Por favor configura tu Gemini API Key en el menú de Ajustes (⚙).');
      useSettingsStore.getState().handleOpenSettings();
      return;
    }

    isCallActiveRef.current = true;
    const callGeneration = ++callGenerationRef.current;
    sessionStore.setErrorMessage(null);
    sessionStore.dispatchConnection('CONNECT');

    try {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (audioOutRef.current) {
        audioOutRef.current.stopImmediate();
      }

      if (!audioInRef.current) {
        audioInRef.current = runtime.createCapture({
          onStreamEnd: () => socketRef.current?.endAudioStream(),
          onAudioData: (base64PCM: ArrayBuffer) => {
            const isSpeaking = useCompanionStore.getState().isSpeaking;
            const isPlaying = Boolean(audioOutRef.current?.isPlaying);
            const activeTool = Boolean(useCompanionStore.getState().activeToolName);
            
            echoGateRef.current.setAssistantSpeaking(isSpeaking);
            echoGateRef.current.setAudioPlaying(isPlaying);
            echoGateRef.current.setToolExecuting(activeTool || isToolRunningRef.current);

            if (!echoGateRef.current.canTransmit()) {
              // Self-echo elimination: drop microphone frames during assistant speech,
              // tool execution, or acoustic reverberation decay
              return;
            }

            if (socketRef.current && socketRef.current.isConnected && !audioInRef.current?.isMuted) {
              socketRef.current.sendAudioChunk(base64PCM);
            }
          },
          onError: (err: any) => {
            useSessionStore.getState().setErrorMessage(`Error de micrófono: ${err.message}`);
          }
        });
      }

      // Initialize audio capture in muted state during handshake to prevent unhandled packets
      audioInRef.current.mute();
      await audioInRef.current.start();

      if (callGeneration !== callGenerationRef.current) return;
      if (audioOutRef.current) {
        await audioOutRef.current.resumeContext();
      }
      if (callGeneration !== callGenerationRef.current) return;

      const socket = runtime.createSocket({
        audioPlayback: audioOutRef.current,
        modelId: currentConfig.modelId,
        voiceName: currentConfig.voiceName,
        temperature: currentConfig.temperature,
        systemPrompt: currentConfig.systemPrompt,
        maxReconnectAttempts: 5,
        onOpen: () => {
          if (callGeneration !== callGenerationRef.current) return;
          useSessionStore.getState().dispatchConnection('SETUP_COMPLETE');
          proactiveTriggerService.setGeminiSocket(socket);
          proactiveScheduler.setGeminiSocket(socket);
          soundFxService.playConnectedBleep();
        },
        onSetupComplete: () => {
          if (callGeneration !== callGenerationRef.current) return;
          // Open audio capture gate only when Gemini Live session setup is fully acknowledged
          if (!useAudioStore.getState().isMuted) {
            audioInRef.current?.unmute();
          }
        },
        onReconnecting: () => {
          audioInRef.current?.mute();
          audioOutRef.current?.stopImmediate();
          useSessionStore.getState().dispatchConnection('RECONNECT');
        },
        onClose: (event: any) => {
          if (callGeneration !== callGenerationRef.current) return;
          isCallActiveRef.current = false;
          echoGateRef.current.reset();
          isToolRunningRef.current = false;
          audioInRef.current?.mute();
          void audioInRef.current?.stop();
          audioOutRef.current?.stopImmediate();
          screenCaptureRef.current?.stopAll();
          visionDispatcherRef.current?.reset();
          useVisionStore.getState().setIsScreenWatchActive(false);
          proactiveTriggerService.setGeminiSocket(null);
          proactiveScheduler.setGeminiSocket(null);
          useSessionStore.getState().dispatchConnection('DISCONNECT');
          useCompanionStore.getState().setIsSpeaking(false);
          useCompanionStore.getState().setIsListening(false);
          useCompanionStore.getState().setIsThinking(false);
          useCompanionStore.getState().setActiveDecision(null);
          soundFxService.playDisconnect();
          if (event && !event.wasClean && event.code !== 1000) {
            useSessionStore.getState().setErrorMessage(`Conexión cerrada inesperadamente (Código: ${event.code})`);
          }
        },
        onError: (err: any) => {
          logger.error('Live2D', 'Socket Live error:', err);
          useCompanionStore.getState().setIsThinking(false);
          if (callGeneration !== callGenerationRef.current) return;
          useSessionStore.getState().setErrorMessage(`Error de conexión Live: ${err.message}`);
          if (!socket.isConnecting && !socket.reconnectTimer) {
            isCallActiveRef.current = false;
            audioInRef.current?.stop();
            useSessionStore.getState().dispatchConnection('FAIL');
          }
        },
        onGenerationStart: () => {
          audioOutRef.current?.beginGeneration();
          echoGateRef.current.setAudioPlaying(true);
        },
        onGenerationComplete: () => {
          if (useCompanionStore.getState().isThinking) {
            useCompanionStore.getState().setIsThinking(false);
          }
          audioOutRef.current?.signalGenerationComplete();
        },
        onThoughtChunk: () => {
          useCompanionStore.getState().setIsThinking(true);
        },
        onAudioChunk: (base64PCM: string) => {
          if (useCompanionStore.getState().isThinking) {
            useCompanionStore.getState().setIsThinking(false);
          }
          echoGateRef.current.setAudioPlaying(true);
          proactiveTriggerService.recordDialogueActivity();
          if (audioOutRef.current) {
            audioOutRef.current.playAudioChunk(base64PCM);
          }
        },
        onTurnComplete: () => {
          if (useCompanionStore.getState().isThinking) {
            useCompanionStore.getState().setIsThinking(false);
          }
          if (audioOutRef.current) {
            audioOutRef.current.signalTurnComplete();
          }
          echoGateRef.current.recordTurnComplete();
          if (!audioOutRef.current?.isPlaying && !useAudioStore.getState().isMuted) {
            audioInRef.current?.unmute();
          }
          if (screenCaptureRef.current?.isCapturing && !useCompanionStore.getState().isSpeaking && !audioOutRef.current?.isPlaying) {
            screenCaptureRef.current.triggerImmediateCapture();
          }
        },
        onTelemetry: metrics => useTelemetryStore.getState().setLiveMetrics(metrics),
        onInteractionStatus: (status: 'IN_PROGRESS' | 'IDLE') => {
          useSessionStore.getState().setInteractionStatus(status);
          if (status === 'IN_PROGRESS') {
            useCompanionStore.getState().setIsThinking(true);
          } else if (status === 'IDLE') {
            useCompanionStore.getState().setIsThinking(false);
          }
        },
        onInterrupted: () => {
          if (useCompanionStore.getState().isThinking) {
            useCompanionStore.getState().setIsThinking(false);
          }
          echoGateRef.current.setAssistantSpeaking(false);
          echoGateRef.current.setAudioPlaying(false);
          if (audioOutRef.current) {
            audioOutRef.current.stopImmediate();
          }
          if (!useAudioStore.getState().isMuted) {
            audioInRef.current?.unmute();
          }
          useCompanionStore.getState().setIsSpeaking(false);
        },
        onToolCall: async (functionCalls: any, sourceSocket: any) => {
          // Temporarily mute microphone stream during tool execution to prevent
          // ambient noise or audio chunks from colliding with server tool response processing
          isToolRunningRef.current = true;
          echoGateRef.current.setToolExecuting(true);
          audioInRef.current?.mute();
          try {
            if (toolExecutorRef.current) {
              const responses = await toolExecutorRef.current.executeCalls(
                functionCalls,
                (id?: string) => (id ? socket.cancelledTools.has(id) : false) || socket.websocket !== sourceSocket || callGeneration !== callGenerationRef.current
              );
              if (socket.websocket === sourceSocket && callGeneration === callGenerationRef.current) {
                socket.sendToolResponse(responses);
              }
            }
          } finally {
            isToolRunningRef.current = false;
            echoGateRef.current.setToolExecuting(false);
          }
        }
      });

      socketRef.current = socket;
      await socket.connect();
    } catch (err: any) {
      if (callGeneration !== callGenerationRef.current) return;
      isCallActiveRef.current = false;
      audioInRef.current?.stop();
      socketRef.current?.disconnect();
      useSessionStore.getState().setErrorMessage(`No se pudo conectar: ${err.message}`);
      useSessionStore.getState().dispatchConnection('FAIL');
    }
  }, []);

  // Camera toggle. The default uses the shared, headless camera owner; a
  // preview can later attach to that same stream without reopening hardware.
  const handleToggleCamera = useCallback(async () => {
    try {
      soundFxService.playClick();
      const visionRuntime = localVisionRuntimeRef.current;
      if (!visionRuntime) throw new Error('El runtime local de visión aún no está listo.');
      if (visionRuntime.isActive()) {
        visionRuntime.stop();
        useVisionStore.getState().setIsCameraActive(false);
        toastService.info('Visión por cámara desactivada');
        if (socketRef.current?.isConnected) {
          socketRef.current.sendTextMessage('[SISTEMA: Ariel ha cerrado la cámara web.]');
        }
      } else {
        await visionRuntime.start('headless');
        visionRuntime.startFrameStream(1);
        useVisionStore.getState().setIsCameraActive(true);
        toastService.info('Visión por cámara activa sin ventana de preview');
        if (socketRef.current?.isConnected) {
          socketRef.current.sendTextMessage(
            '[SISTEMA: Ariel ha encendido la cámara web. Los fotogramas de video en tiempo real corresponden a su cámara óptica.]'
          );
        }
      }
    } catch (err) {
      logger.error('VISION', 'Error al controlar cámara local:', err);
      toastService.error('No se pudo activar la cámara. Revisa permisos y dispositivo.');
    }
  }, []);

  // Screen watch toggle (full screen vs region)
  const handleToggleScreenWatch = useCallback(() => {
    const { screenRegion, isScreenWatchActive } = useVisionStore.getState();

    if (screenRegion) {
      useVisionStore.getState().setScreenRegion(null);
      screenCaptureRef.current?.clearRegion();
      visionDispatcherRef.current?.clearSource('screen');
      useVisionStore.getState().setIsScreenWatchActive(true);
      toastService.info('Visión de Pantalla Completa', 'Cristi ahora observa toda la pantalla.');
      if (toolExecutorRef.current) {
        toolExecutorRef.current.executeSingleTool('clear_screen_region', {});
        toolExecutorRef.current.executeSingleTool('set_screen_watch', { enabled: true });
      }
      void sendScreenInstruction(
        '[SISTEMA: Ariel ha cambiado a la observación de pantalla completa. Los fotogramas corresponden a su monitor entero.]'
      );
      return;
    }

    const nextState = !isScreenWatchActive;
    useVisionStore.getState().setIsScreenWatchActive(nextState);
    if (nextState) {
      toastService.info('Visión de Pantalla Activa', 'Cristi ahora está observando y analizando toda tu pantalla en tiempo real.');
      void sendScreenInstruction(
        '[SISTEMA: Ariel ha activado la compartición de pantalla completa. Los fotogramas corresponden a su monitor.]'
      );
    } else {
      toastService.info('Visión de Pantalla Desactivada', 'Se detuvo el análisis continuo de pantalla.');
      if (socketRef.current?.isConnected) {
        socketRef.current.sendTextMessage('[SISTEMA: Ariel ha desactivado la compartición de pantalla.]');
      }
    }
    if (toolExecutorRef.current) {
      toolExecutorRef.current.executeSingleTool('set_screen_watch', { enabled: nextState });
    }
  }, [sendScreenInstruction]);

  // Region selected handler
  const handleRegionSelected = useCallback((region: ScreenRegion) => {
    useVisionStore.getState().setScreenRegion(region);
    useVisionStore.getState().closeRegionPicker();
    useVisionStore.getState().setIsScreenWatchActive(true);
    const wPct = Number(region.w_pct ?? 100);
    const hPct = Number(region.h_pct ?? 100);
    toastService.success(
      'Área de Visión Seleccionada',
      `Cristi ahora vigila exclusivamente el área delimitada (${Math.round(wPct)}% × ${Math.round(hPct)}%).`
    );
    if (screenCaptureRef.current) {
      screenCaptureRef.current.setRegion(region);
      visionDispatcherRef.current?.clearSource('screen');
    }
    if (toolExecutorRef.current) {
      toolExecutorRef.current.executeSingleTool('set_screen_region', region as unknown as Record<string, unknown>);
    }
    void sendScreenInstruction(
      `[SISTEMA: Ariel ha seleccionado un área recortada de su pantalla (${Math.round(wPct)}% × ${Math.round(hPct)}%) para que la observes en el flujo de video.]`
    );
  }, [sendScreenInstruction]);

  // Clear screen region
  const handleClearScreenRegion = useCallback(() => {
    useVisionStore.getState().clearScreenRegion();
    useVisionStore.getState().setIsScreenWatchActive(false);
    screenCaptureRef.current?.clearRegion();
    visionDispatcherRef.current?.clearSource('screen');
    toastService.info('Visión Desactivada', 'Se limpió el área de recorte y se detuvo la transmisión.');
    if (toolExecutorRef.current) {
      toolExecutorRef.current.executeSingleTool('clear_screen_region', {});
      toolExecutorRef.current.executeSingleTool('set_screen_watch', { enabled: false });
    }
    if (socketRef.current?.isConnected) {
      socketRef.current.sendTextMessage('[SISTEMA: Ariel ha desactivado el área recortada de pantalla.]');
    }
  }, []);

  const handleMinimizeToTray = useCallback(() => {
    if (systemTrayRef.current) {
      systemTrayRef.current.minimizeToTray();
    } else {
      electronBridge.minimizeWindow();
    }
  }, []);

  // Lifecycle initialization
  useEffect(() => {
    // 1. Initialize AudioOutputService
    audioOutRef.current = runtime.createPlayback({
      onAudioStart: () => useCompanionStore.getState().setIsSpeaking(true),
      onAudioEnd: () => {
        useCompanionStore.getState().setIsSpeaking(false);
        echoGateRef.current.recordPlayoutEnded();
        if (!useAudioStore.getState().isMuted) {
          audioInRef.current?.unmute();
        }
      },
      onFirstPlayout: (timestamp: number) => {
        socketRef.current?.recordPlayoutTimestamp(timestamp);
      },
      onStopImmediate: () => {
        echoGateRef.current.recordPlayoutEnded();
        socketRef.current?.recordStopImmediate();
        if (!useAudioStore.getState().isMuted) {
          audioInRef.current?.unmute();
        }
      }
    });

    // 2. VisionFrameDispatcher & Autonomous services
    visionDispatcherRef.current = new (VisionFrameDispatcher as any)({ socketRef, minIntervalMs: 1000 });
    localVisionRuntimeRef.current = new LocalVisionRuntime({
      onFrame: frame => sendRealtimeVisionFrame(frame, 'camera'),
      onDetections: detections => useVisionStore.getState().setDetections(
        detections.objects.map(object => ({ class: object.class, score: object.score, bbox: object.bbox }))
      ),
      onError: error => logger.warn('VISION', 'Pipeline local de cámara:', error),
    });
    cameraRef.current = localVisionRuntimeRef.current.camera;
    visionServiceRef.current = localVisionRuntimeRef.current.detector;
    proactiveTriggerService.start();

    // 3. Emotion event bus subscription
    const unsubEmotion = eventBus.on(EVENTS.EMOTION_CHANGED, (emotion: unknown) => {
      const raw = typeof emotion === 'string'
        ? emotion
        : (emotion && typeof emotion === 'object' && 'emotion' in emotion
          ? String((emotion as { emotion: unknown }).emotion)
          : '');
      if (raw) useCompanionStore.getState().setCurrentGesture(raw);
    });

    // 5. Connection toggle event
    const unsubConnToggle = eventBus.on('connection.toggle', () => handleToggleConnection());

    // 6. Native screen capture event
    const unsubSnap = eventBus.on('screen.capture_snapshot', async () => {
      toastService.info('Analizando pantalla activa...');
      try {
        const frame = await electronBridge.captureScreenNative(null, true);
        if (frame) {
          sendRealtimeVisionFrame(frame, 'snapshot', true);
          toastService.success('Captura enviada a Cristi para análisis.');
        }
      } catch (e: any) {
        toastService.error('Error al capturar pantalla: ' + e.message);
      }
    });

    // 7. Initialize ToolExecutor
    toolExecutorRef.current = new ToolExecutor({
      onGestureTrigger: (gesture: string) => {
        const isLive2dActive = useSettingsStore.getState().config.live2dVisible !== false && !useCompanionStore.getState().isZenMode;
        if (!isLive2dActive) return;
        contextualEmotionOrchestrator.triggerEmotion(gesture, 'tool_call');
        useCompanionStore.getState().setCurrentGesture(gesture);
      },
      onMotionTrigger: (motionGroup: string, index?: number) => {
        const isLive2dActive = useSettingsStore.getState().config.live2dVisible !== false && !useCompanionStore.getState().isZenMode;
        if (!isLive2dActive) return;
        if ((window as any).__cristiAvatar?.setMotionByGroup) {
          (window as any).__cristiAvatar.setMotionByGroup(motionGroup, index);
        }
      },
      getCameraSnapshot: () => cameraRef.current?.captureFrameJPEG() || null,
      getVisionDetections: () => visionServiceRef.current?.currentDetections || null,
      getScreenCapture: async (_region?: string, options?: { fresh?: boolean }) => {
        if (!screenCaptureRef.current) return null;
        return await screenCaptureRef.current.captureActiveFrame(Boolean(options?.fresh));
      },
      onAvatarMove: (position: string, animation?: string) => {
        const isLive2dActive = useSettingsStore.getState().config.live2dVisible !== false && !useCompanionStore.getState().isZenMode;
        if (!isLive2dActive) return;
        if (live2dRef.current?.moveTo) {
          live2dRef.current.moveTo(position, animation);
        }
      },
      onScreenRegionChange: (region: ScreenRegion | null) => {
        useVisionStore.getState().setScreenRegion(region);
        if (screenCaptureRef.current) {
          if (region) {
            screenCaptureRef.current.setRegion(region);
          } else {
            screenCaptureRef.current.clearRegion();
          }
          visionDispatcherRef.current?.clearSource('screen');
        }
      },
      onScreenWatchChange: async (enabled: boolean) => {
        useVisionStore.getState().setIsScreenWatchActive(enabled);
        if (enabled) {
          if (!screenCaptureRef.current) {
            screenCaptureRef.current = new ScreenCaptureService({
              onFrame: (base64jpeg: string) => sendRealtimeVisionFrame(base64jpeg, 'screen'),
              onStreamEnd: () => {
                screenCaptureRef.current?.clearRegion();
                visionDispatcherRef.current?.clearSource('screen');
                useVisionStore.getState().clearScreenRegion();
                useVisionStore.getState().setIsScreenWatchActive(false);
              }
            });
          }
          const fps = getScreenCaptureFPS(useSettingsStore.getState().config.modelId);
          const started = await screenCaptureRef.current.startContinuous(fps);
          if (!started) useVisionStore.getState().setIsScreenWatchActive(false);
        } else {
          screenCaptureRef.current?.stopAll();
          screenCaptureRef.current?.clearRegion();
          visionDispatcherRef.current?.clearSource('screen');
          useVisionStore.getState().clearScreenRegion();
          useVisionStore.getState().setIsScreenWatchActive(false);
        }
      }
    });

    // 8. Audits and background init
    modelManager.auditAllModels().catch((e: any) => console.warn('ModelManager audit error:', e));
    memoryService.initialize().catch((e: any) => console.warn('MemoryService init error:', e));
    mcpClientManager.initialize().catch((e: any) => console.warn('MCPClientManager init error:', e));

    // 9. SystemTray Setup
    if (electronBridge.isElectron) {
      systemTrayRef.current = new SystemTrayService({
        onRestoreWindow: () => useCompanionStore.getState().setIsUiVisible(true),
        onToggleMute: () => useAudioStore.getState().toggleMute(),
        onToggleViewMode: () => useCompanionStore.getState().toggleViewMode(),
        onToggleAlwaysOnTop: () => useCompanionStore.getState().toggleAlwaysOnTop(),
        onOpenVoiceEnrollment: () => useSettingsStore.getState().handleOpenSettings()
      });
      systemTrayRef.current.setupTray();
    }

    // Development inspection only.
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      (window as any).__cristiEventBus = eventBus;
      (window as any).__cristiModelManager = modelManager;
      (window as any).__cristiApp = {
        connect: () => !isCallActiveRef.current && handleToggleConnection(),
        disconnect: () => isCallActiveRef.current && handleToggleConnection(),
        sendTextMessage: (t: string) => socketRef.current?.sendTextMessage(t),
        triggerGesture: (g: string) => useCompanionStore.getState().setCurrentGesture(g),
        openContextMenu: (x: number, y: number) => handleModelContextMenu({ clientX: x || 300, clientY: y || 200 }),
        closeContextMenu: () => useCompanionStore.getState().closeContextMenu(),
        openPerformanceHUD: () => electronBridge.openTelemetryWindow(),
        closePerformanceHUD: () => electronBridge.closeTelemetryWindow(),
        openRegionPicker: () => useVisionStore.getState().openRegionPicker(),
        closeRegionPicker: () => useVisionStore.getState().closeRegionPicker(),
        openVoiceEnrollment: () => useSettingsStore.getState().handleOpenSettings(),
        closeVoiceEnrollment: () => electronBridge.closeSettingsWindow(),
        openSettings: () => useSettingsStore.getState().handleOpenSettings(),
        closeSettings: () => electronBridge.closeSettingsWindow(),
        toggleCamera: handleToggleCamera,
        eventBus,
        toast,
        toastService,
        externalDeviceManager,
        live2dModelRegistry,
        socketRef,
        audioOutRef,
        audioInRef,
        exportRuntimeDiagnostics: () => runtimeDiagnosticsRecorder.exportJson()
      };
      (window as any).__triggerGesture = (g: string) => useCompanionStore.getState().setCurrentGesture(g);
    }

    return () => {
      callGenerationRef.current++;
      isCallActiveRef.current = false;
      for (const timer of [autoHideTimerRef]) {
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
      }
      runtime.dispose();
      audioInRef.current = audioOutRef.current = socketRef.current = null;
      visionDispatcherRef.current?.destroy();
      proactiveTriggerService.stop();
      unsubEmotion?.();
      unsubConnToggle?.();
      unsubSnap?.();
      screenCaptureRef.current?.stopAll();
      localVisionRuntimeRef.current?.dispose();
      localVisionRuntimeRef.current = null;
      cameraRef.current = null;
      visionServiceRef.current = null;
      delete (window as any).__cristiApp;
      delete (window as any).__triggerGesture;
    };
  }, [handleToggleConnection, handleToggleCamera, handleModelContextMenu, sendRealtimeVisionFrame, live2dRef]);

  // IPC Event Syncs
  useEffect(() => {
    const unsubSettingsState = electronBridge.onSettingsWindowState((data: any) => {
      useSettingsStore.getState().setIsSettingsWindowOpen(Boolean(data?.isOpen));
    });

    const unsubPause = electronBridge.onCompanionPause(() => {
      if (live2dRef.current?.setFpsLimit) live2dRef.current.setFpsLimit(60);
    });

    const unsubResume = electronBridge.onCompanionResume(() => {
      if (live2dRef.current?.setFpsLimit) live2dRef.current.setFpsLimit(0);
    });



    const unsubCameraState = electronBridge.onCameraWindowState?.(({ isOpen }: any) => {
      useVisionStore.getState().setIsCameraActive(isOpen);
    });

    // BroadcastChannel camera stream
    let broadcast: BroadcastChannel | null = null;
    try {
      broadcast = new BroadcastChannel('cristi_camera_stream');
      broadcast.onmessage = (e) => {
        if (e.data?.type === 'camera_frame' && e.data?.base64) {
          sendRealtimeVisionFrame(e.data.base64, 'camera');
        } else if (e.data?.type === 'camera_snapshot' && e.data?.base64) {
          if (socketRef.current?.isConnected) {
            sendRealtimeVisionFrame(e.data.base64, 'camera', true);
            toastService.info('Visión Cristi AI', 'Fotograma transmitido a la IA');
          }
        }
      };
    } catch (_) {}

    return () => {
      unsubSettingsState?.();
      unsubPause?.();
      unsubResume();
      if (unsubCameraState) unsubCameraState();
      try { broadcast?.close(); } catch (_) {}
    };
  }, [sendRealtimeVisionFrame, live2dRef]);

  // Audio mute sync
  useEffect(() => {
    if (audioInRef.current) {
      if (isMuted) audioInRef.current.mute();
      else audioInRef.current.unmute();
    }
  }, [isMuted]);

  // Interaction Lock for full blocking overlays
  const isRegionPickerOpen = useVisionStore((s) => s.isRegionPickerOpen);
  const isContextMenuOpen = useCompanionStore((s) => s.contextMenu.isOpen);
  useEffect(() => {
    if (isRegionPickerOpen || isContextMenuOpen) {
      electronBridge.acquireInteractionLock();
      return () => {
        electronBridge.releaseInteractionLock();
      };
    }
  }, [isRegionPickerOpen, isContextMenuOpen]);

  // Click-through sync
  useEffect(() => {
    if (!electronBridge.isElectron) return;
    if (!isClickThroughEnabled) {
      electronBridge.setIgnoreMouseEvents(false);
    } else if (electronBridge._interactionLockCount === 0) {
      electronBridge.setIgnoreMouseEvents(true, { forward: true });
    }
  }, [isClickThroughEnabled]);

  // Always-On-Top sync
  useEffect(() => {
    electronBridge.setAlwaysOnTop(isAlwaysOnTop);
  }, [isAlwaysOnTop]);

  // The child MCP process reads its OAuth pair only when it starts.  Settings
  // runs in a separate renderer, so reconnect from the owning runtime after a
  // committed config broadcast instead of relying on that window's local MCP
  // manager instance.
  useEffect(() => {
    const hasSpotifyCredential = (config as { hasSpotifyCredential?: unknown }).hasSpotifyCredential === true;
    const fingerprint = `${config?.spotifyClientId?.trim() || ''}:${hasSpotifyCredential ? 'stored' : 'missing'}`;
    // MCP initialization owns the first connection on application startup.
    // Only a subsequent saved credential change replaces that process.
    if (!isSettingsLoaded) return;
    if (lastSpotifyCredentialFingerprintRef.current === null) {
      lastSpotifyCredentialFingerprintRef.current = fingerprint;
      return;
    }
    if (lastSpotifyCredentialFingerprintRef.current === fingerprint) return;
    lastSpotifyCredentialFingerprintRef.current = fingerprint;
    if (!config?.spotifyClientId?.trim() || !hasSpotifyCredential) return;
    void (async () => {
      await mcpClientManager.initialize();
      const spotifyMcp = mcpClientManager.getServers().find(server => server.id === 'mcp_spotify');
      if (!spotifyMcp) return;
      await mcpClientManager.disconnectServer(spotifyMcp.id);
      await mcpClientManager.connectServer(spotifyMcp.id);
    })();
  }, [config?.spotifyClientId, (config as { hasSpotifyCredential?: unknown }).hasSpotifyCredential, isSettingsLoaded]);

  return {
    handleToggleConnection,
    handleToggleCamera,
    handleToggleScreenWatch,
    handleRegionSelected,
    handleClearScreenRegion,
    handleModelContextMenu,
    handleMinimizeToTray,
    resetInactivityTimer
  };
}

export default useCompanionServices;
