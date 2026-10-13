/**
 * Cristi AI - VisionStreamService
 * High-performance, low-latency visual perception engine for real-time screen & camera streaming to Gemini Live.
 * Implements a unified, continuous video pipeline over WebSocket with congestion backpressure.
 * Selectable capture modes: Fullscreen (primary/secondary monitor), Region, Application Window, Physical Camera.
 * Regulates sampling rate between 0.5 FPS and 1.0 FPS, preventing turn saturation and GPU/audio starvation.
 */

import { electronBridge } from '../../services/desktop/ElectronBridge';
import { logger } from '../../infrastructure/logging/logger';
import { eventBus, EVENTS } from '../../infrastructure/events/eventBus';
import { VisionFrameDispatcher, LiveSessionLike } from './VisionFrameDispatcher';
import { CaptureLoop } from '../sensory/vision/CaptureLoop';
import { useSessionStore } from '../../stores/useSessionStore';
import type { ScreenRegion, ScreenCaptureRequest } from '../../../shared/ipc/contracts';

export type VisionCaptureMode = 'fullscreen' | 'region' | 'window' | 'camera';

export interface VisionMonitoringOptions {
  mode?: VisionCaptureMode;
  fps?: number;
  displayId?: 'primary' | 'secondary' | string | number | null;
  region?: ScreenRegion | null;
  targetWindow?: string | null;
  windowId?: string | null;
  deviceId?: string | null;
}

export interface VisionStreamServiceOptions {
  socketRef?: { current: LiveSessionLike | null } | null;
}

export interface DetectionState {
  isFacePresent: boolean;
  emotion: string;
  age: number | null;
  gender: string | null;
}

export class VisionStreamService {
  public socketRef: { current: LiveSessionLike | null } | null;
  public frameDispatcher: VisionFrameDispatcher;

  // Active Capture State
  public activeMode: VisionCaptureMode | null = null;
  public isStreaming = false;

  // Screen Streamer State
  public isScreenStreaming = false;
  public screenLoop: CaptureLoop;
  public screenFPS = 0.5; // Controlled between 0.5 and 1.0 FPS
  public screenRegion: ScreenRegion | null = null;
  public targetDisplayId: 'primary' | 'secondary' | string | number | null = null;
  public targetWindow: string | null = null;
  public targetWindowId: string | null = null;

  // Voice Call & Speaking State
  public isVoiceCallActive = false;
  public isAiSpeaking = false;

  // Camera Streamer State
  public isCameraStreaming = false;
  private cameraGeneration = 0;
  public disposed = false;
  public cameraLoop: CaptureLoop;
  private cameraStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private cameraCanvas: HTMLCanvasElement | null = null;
  public cameraFPS = 0.5;
  private cancelCameraSetup: (() => void) | null = null;

  // Face / Emotion Detections Cache
  public lastDetection: DetectionState = {
    isFacePresent: false,
    emotion: 'neutral',
    age: null,
    gender: null
  };

  private unsubAudioStart: (() => void) | null = null;
  private unsubAudioEnd: (() => void) | null = null;

  constructor({ socketRef = null }: VisionStreamServiceOptions = {}) {
    this.socketRef = socketRef;
    this.frameDispatcher = new VisionFrameDispatcher({ socketRef });

    this.screenLoop = new CaptureLoop({
      capture: async () => {
        // Native screen capture delegates BGRA-to-JPEG and cropping exclusively to worker thread
        return await this.captureCurrentScreenTarget();
      },
      onFrame: frame => this.frameDispatcher.queueFrame({ source: 'screen', base64: frame, timestamp: Date.now() }),
      shouldCapture: () => Boolean(
        this.socketRef?.current?.isConnected &&
        useSessionStore.getState().isConnected &&
        !this.isAiSpeaking && // Backpressure: drop frames if AI is actively speaking
        ((this.socketRef.current.websocket?.bufferedAmount ?? 0) <= 65536)
      ),
      onError: error => logger.warn('VISION', 'Error capturando pantalla:', error.message)
    });

    this.cameraLoop = new CaptureLoop({
      capture: () => {
        if (!this.videoElement || this.videoElement.readyState < 2 || !this.cameraCanvas) return null;
        const ctx = this.cameraCanvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(this.videoElement, 0, 0, this.cameraCanvas.width, this.cameraCanvas.height);
        return this.cameraCanvas.toDataURL('image/jpeg', 0.7).split(',')[1] ?? null;
      },
      onFrame: frame => this.frameDispatcher.queueFrame({ source: 'camera', base64: frame, timestamp: Date.now() }),
      shouldCapture: () => Boolean(
        this.socketRef?.current?.isConnected &&
        useSessionStore.getState().isConnected &&
        !this.isAiSpeaking && // Backpressure: pause visual sampling while AI speaks
        ((this.socketRef.current.websocket?.bufferedAmount ?? 0) <= 65536)
      ),
      onError: error => logger.warn('VISION', 'Error capturando cámara:', error.message)
    });

    // Suspensión reactiva: desconexión de Gemini Live suspende inmediatamente los bucles de captura
    useSessionStore.subscribe((state) => {
      if (!state.isConnected) {
        if (this.screenLoop.active) this.screenLoop.stop();
        if (this.cameraLoop.active) this.cameraLoop.stop();
      } else {
        if (this.isScreenStreaming && !this.screenLoop.active) {
          const intervalMs = this.isAiSpeaking || this.isVoiceCallActive
            ? 2000
            : Math.max(1000, Math.round(1000 / this.screenFPS));
          this.screenLoop.start(intervalMs);
        }
        if (this.isCameraStreaming && !this.cameraLoop.active) {
          const intervalMs = this.isAiSpeaking || this.isVoiceCallActive
            ? 2000
            : Math.max(1000, Math.round(1000 / this.cameraFPS));
          this.cameraLoop.start(intervalMs);
        }
      }
    });

    this.unsubAudioStart = eventBus.on(EVENTS.AUDIO_START, () => {
      this.isAiSpeaking = true;
      this.applyActiveCallThrottling();
    });

    this.unsubAudioEnd = eventBus.on(EVENTS.AUDIO_END, () => {
      this.isAiSpeaking = false;
      this.applyActiveCallThrottling();
      if (this.isScreenStreaming) this.screenLoop.requestImmediate();
      if (this.isCameraStreaming) this.cameraLoop.requestImmediate();
    });
  }

  public setVoiceCallActive(active: boolean): void {
    this.isVoiceCallActive = active;
    this.applyActiveCallThrottling();
  }

  /**
   * Enforces strict rate regulation (0.5 FPS during active calls/speech, up to 1.0 FPS idle)
   */
  private applyActiveCallThrottling(): void {
    const isUnderCallLoad = this.isVoiceCallActive || this.isAiSpeaking;
    const effectiveFps = isUnderCallLoad ? 0.5 : Math.max(0.5, Math.min(1.0, this.screenFPS));
    const intervalMs = Math.max(1000, Math.round(1000 / effectiveFps));

    if (this.isScreenStreaming) {
      this.screenLoop.start(intervalMs);
    }
    if (this.isCameraStreaming) {
      this.cameraLoop.start(intervalMs);
    }
  }

  public setSocketRef(socketRef: { current: LiveSessionLike | null } | null): void {
    this.socketRef = socketRef;
    this.frameDispatcher.setSocketRef(socketRef);
  }

  /**
   * Unified entry point for starting vision monitoring in any of the 4 selectable modes.
   */
  public async startVisionMonitoring(options: VisionMonitoringOptions = {}): Promise<boolean> {
    if (this.disposed) return false;
    const mode = options.mode || (options.region ? 'region' : (options.targetWindow || options.windowId ? 'window' : 'fullscreen'));
    this.stopVisionMonitoring();

    this.activeMode = mode;
    this.isStreaming = true;

    if (mode === 'camera') {
      return await this.startCameraMonitoring({ fps: options.fps, deviceId: options.deviceId });
    }

    return this.startScreenMonitoring({
      fps: options.fps,
      region: mode === 'region' ? options.region : null,
      displayId: options.displayId,
      targetWindow: options.targetWindow,
      windowId: options.windowId
    });
  }

  public stopVisionMonitoring(): void {
    this.isStreaming = false;
    this.activeMode = null;
    this.stopScreenMonitoring();
    this.stopCameraMonitoring();
  }

  public startScreenMonitoring({
    fps = 0.5,
    region = null,
    displayId = null,
    targetWindow = null,
    windowId = null
  }: {
    fps?: number;
    region?: ScreenRegion | null;
    displayId?: 'primary' | 'secondary' | string | number | null;
    targetWindow?: string | null;
    windowId?: string | null;
  } = {}): boolean {
    if (this.disposed) return false;
    this.stopScreenMonitoring();

    // Regulate sampling rate strictly between 0.5 FPS and 1.0 FPS
    this.screenFPS = Math.max(0.5, Math.min(1.0, Number.isFinite(fps) ? fps : 0.5));
    this.screenRegion = region;
    this.targetDisplayId = displayId;
    this.targetWindow = targetWindow;
    this.targetWindowId = windowId;
    this.isScreenStreaming = true;

    const intervalMs = this.isAiSpeaking || this.isVoiceCallActive
      ? 2000
      : Math.max(1000, Math.round(1000 / this.screenFPS));

    this.screenLoop.start(intervalMs);
    eventBus.emit(EVENTS.CONFIG_CHANGED, {
      type: 'screen_monitoring_started',
      fps: this.screenFPS,
      region: this.screenRegion,
      displayId: this.targetDisplayId,
      targetWindow: this.targetWindow
    });
    return true;
  }

  public stopScreenMonitoring(): void {
    this.isScreenStreaming = false;
    this.screenLoop.stop();
    this.screenRegion = null;
    this.targetDisplayId = null;
    this.targetWindow = null;
    this.targetWindowId = null;
    this.frameDispatcher.clearSource('screen');
    eventBus.emit(EVENTS.CONFIG_CHANGED, { type: 'screen_monitoring_stopped' });
  }

  private async captureCurrentScreenTarget(): Promise<string | null> {
    const request: ScreenCaptureRequest = {
      region: this.screenRegion,
      displayId: this.targetDisplayId,
      targetWindow: this.targetWindow,
      windowId: this.targetWindowId,
      fresh: false
    };
    return await this.captureScreenNative(request);
  }

  /**
   * Captures screen natively via Electron bridge.
   * Execution is offloaded to worker thread (screen.worker.ts) using transferable buffers.
   */
  public async captureScreenNative(requestOrRegion: ScreenRegion | ScreenCaptureRequest | null = null): Promise<string | null> {
    try {
      if (electronBridge?.isElectron) {
        return await electronBridge.captureScreenNative(requestOrRegion);
      }
      return null;
    } catch (err) {
      logger.error('VISION', 'Error capturando pantalla nativa:', err);
      return null;
    }
  }

  public async startCameraMonitoring({ fps = 0.5, deviceId = null }: { fps?: number; deviceId?: string | null } = {}): Promise<boolean> {
    if (this.disposed) return false;
    this.stopCameraMonitoring();
    const generation = this.cameraGeneration;
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let cancel: (() => void) | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { width: 640, height: 480 }
      });
      if (generation !== this.cameraGeneration || this.disposed) return false;

      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      const cancelled = new Promise<void>((_, reject) => {
        cancel = () => reject(new Error('Cámara cancelada.'));
        this.cancelCameraSetup = cancel;
        timeout = setTimeout(() => reject(new Error('La cámara no entregó vídeo en 10 segundos.')), 10000);
      });

      await Promise.race([video.play(), cancelled]);
      if (generation !== this.cameraGeneration || this.disposed) return false;

      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 360;
      this.cameraStream = stream;
      this.videoElement = video;
      this.cameraCanvas = canvas;
      // Regulate camera sampling strictly between 0.5 and 1.0 FPS
      this.cameraFPS = Math.max(0.5, Math.min(1.0, Number.isFinite(fps) ? fps : 0.5));
      this.isCameraStreaming = true;

      const tracks = stream.getVideoTracks();
      if (tracks[0]) {
        tracks[0].onended = () => {
          if (this.cameraStream === stream) this.stopCameraMonitoring();
        };
      }
      const intervalMs = this.isAiSpeaking || this.isVoiceCallActive ? 2000 : Math.round(1000 / this.cameraFPS);
      this.cameraLoop.start(intervalMs);
      return true;
    } catch (error) {
      if (generation === this.cameraGeneration && !this.disposed) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('VISION', 'Error al acceder a la cámara web:', msg);
      }
      return false;
    } finally {
      if (timeout !== null) clearTimeout(timeout);
      if (this.cancelCameraSetup === cancel) this.cancelCameraSetup = null;
      if (stream && this.cameraStream !== stream) {
        stream.getTracks().forEach(track => track.stop());
        if (video) {
          video.pause();
          video.srcObject = null;
        }
      }
    }
  }

  public stopCameraMonitoring(): void {
    this.isCameraStreaming = false;
    this.cameraGeneration++;
    this.cancelCameraSetup?.();
    this.cameraLoop.stop();
    this.frameDispatcher.clearSource('camera');
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
    this.cameraCanvas = null;
    logger.info('VISION', 'Monitoreo de cámara detenido.');
  }

  public dispose(): void {
    this.disposed = true;
    this.unsubAudioStart?.();
    this.unsubAudioEnd?.();
    this.stopVisionMonitoring();
    this.frameDispatcher.destroy();
  }
}

export const visionStreamService = new VisionStreamService();
export default visionStreamService;
