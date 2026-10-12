/**
 * Cristi AI - VisionStreamService
 * High-performance, low-latency visual perception engine for real-time screen & camera streaming to Gemini Live.
 * Throttles screen capture to strict 0.5 FPS during active voice calls to eliminate GPU/audio contention.
 * Offloads frame processing exclusively to 'screen.worker.ts' via 'ScreenClient.ts' with transferable ArrayBuffers.
 */

import { electronBridge } from '../../services/desktop/ElectronBridge';
import { logger } from '../../infrastructure/logging/logger';
import { eventBus, EVENTS } from '../../infrastructure/events/eventBus';
import { VisionFrameDispatcher, LiveSessionLike } from './VisionFrameDispatcher';
import { CaptureLoop } from '../sensory/vision/CaptureLoop';
import type { ScreenRegion } from '../../../shared/ipc/contracts';

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

  // Screen Streamer State
  public isScreenStreaming = false;
  public screenLoop: CaptureLoop;
  public screenFPS = 0.5; // Strict 0.5 FPS default during active calls
  public screenRegion: ScreenRegion | null = null;

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
        const region = this.screenRegion;
        // Native screen capture delegates BGRA-to-JPEG and cropping exclusively to screen.worker.ts
        const frame = await this.captureScreenNative(region);
        return region === this.screenRegion ? frame : null;
      },
      onFrame: frame => this.frameDispatcher.queueFrame({ source: 'screen', base64: frame, timestamp: Date.now() }),
      shouldCapture: () => Boolean(
        this.socketRef?.current?.isConnected &&
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
        ((this.socketRef.current.websocket?.bufferedAmount ?? 0) <= 65536)
      ),
      onError: error => logger.warn('VISION', 'Error capturando cámara:', error.message)
    });

    this.unsubAudioStart = eventBus.on(EVENTS.AUDIO_START, () => {
      this.isAiSpeaking = true;
      this.applyActiveCallThrottling();
    });

    this.unsubAudioEnd = eventBus.on(EVENTS.AUDIO_END, () => {
      this.isAiSpeaking = false;
      this.applyActiveCallThrottling();
      this.screenLoop.requestImmediate();
      this.cameraLoop.requestImmediate();
    });
  }

  public setVoiceCallActive(active: boolean): void {
    this.isVoiceCallActive = active;
    this.applyActiveCallThrottling();
  }

  /**
   * Enforces strict 0.5 FPS (2000ms period) during active calls / speaking to prevent GPU/Audio starvation
   */
  private applyActiveCallThrottling(): void {
    if (!this.isScreenStreaming) return;
    const isUnderCallLoad = this.isVoiceCallActive || this.isAiSpeaking;
    const targetFps = isUnderCallLoad ? 0.5 : this.screenFPS;
    const intervalMs = Math.max(2000, Math.round(1000 / targetFps));
    this.screenLoop.start(intervalMs);
  }

  public setSocketRef(socketRef: { current: LiveSessionLike | null } | null): void {
    this.socketRef = socketRef;
    this.frameDispatcher.setSocketRef(socketRef);
  }

  public startScreenMonitoring({ fps = 0.5, region = null }: { fps?: number; region?: ScreenRegion | null } = {}): boolean {
    if (this.disposed) return false;
    this.stopScreenMonitoring();

    // Strict throttle to max 0.5 FPS during calls to eliminate GPU/audio contention
    this.screenFPS = Math.max(0.1, Math.min(0.5, Number.isFinite(fps) ? fps : 0.5));
    this.screenRegion = region;
    this.isScreenStreaming = true;

    const intervalMs = Math.max(2000, Math.round(1000 / this.screenFPS));
    this.screenLoop.start(intervalMs);
    eventBus.emit(EVENTS.CONFIG_CHANGED, { type: 'screen_monitoring_started', fps: this.screenFPS });
    return true;
  }

  public stopScreenMonitoring(): void {
    this.isScreenStreaming = false;
    this.screenLoop.stop();
    this.frameDispatcher.clearSource('screen');
    eventBus.emit(EVENTS.CONFIG_CHANGED, { type: 'screen_monitoring_stopped' });
  }

  /**
   * Captures screen natively via Electron bridge.
   * Execution is offloaded to worker thread (screen.worker.ts) using transferable buffers.
   */
  public async captureScreenNative(region: ScreenRegion | null = null): Promise<string | null> {
    try {
      if (electronBridge?.isElectron) {
        return await electronBridge.captureScreenNative(region);
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
      this.cameraFPS = Math.max(0.2, Math.min(3.0, Number.isFinite(fps) ? fps : 0.5));
      this.isCameraStreaming = true;

      const tracks = stream.getVideoTracks();
      if (tracks[0]) {
        tracks[0].onended = () => {
          if (this.cameraStream === stream) this.stopCameraMonitoring();
        };
      }
      this.cameraLoop.start(Math.round(1000 / this.cameraFPS));
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
    this.stopScreenMonitoring();
    this.stopCameraMonitoring();
    this.frameDispatcher.destroy();
  }
}

export const visionStreamService = new VisionStreamService();
export default visionStreamService;
