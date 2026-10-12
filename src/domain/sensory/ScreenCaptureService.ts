/**
 * Cristi Desktop - Screen Capture Service (TypeScript)
 * Manages native OS screen capture (Electron desktopCapturer C++ API) and getDisplayMedia stream,
 * full-screen and regional frame captures, with adaptive FPS throttling per Gemini model.
 */

import { logger } from '../../infrastructure/logging/logger';
import { electronBridge } from '../../services/desktop/ElectronBridge';
import { eventBus, EVENTS } from '../../infrastructure/events/eventBus';
import { CaptureLoop } from './vision/CaptureLoop';
import type { ScreenRegion } from '../../../shared/ipc/contracts';

export interface ScreenCaptureServiceOptions {
  onFrame?: (frame: string) => void;
  onError?: (error: unknown) => void;
  onStreamReady?: () => void;
  onStreamEnd?: () => void;
}

export interface PixelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class ScreenCaptureService {
  public onFrame: (frame: string) => void;
  public onError: (error: unknown) => void;
  public onStreamReady: () => void;
  public onStreamEnd: () => void;

  public stream: MediaStream | null = null;
  public videoEl: HTMLVideoElement | null = null;
  public offscreenCanvas: HTMLCanvasElement | null = null;
  public offscreenCtx: CanvasRenderingContext2D | null = null;
  public isCapturing = false;
  public fps = 1.0;
  public captureGeneration = 0;
  public streamRequestGeneration = 0;
  public captureRequest: Promise<boolean> | null = null;
  public cancelCaptureSetup: (() => void) | null = null;
  public captureLoop: CaptureLoop;

  // Active region: null = full screen, else { x_pct, y_pct, w_pct, h_pct }
  public region: ScreenRegion | null = null;
  public screenW: number;
  public screenH: number;

  public isAiSpeaking = false;
  private _unsubAudioStart: (() => void) | null = null;
  private _unsubAudioEnd: (() => void) | null = null;

  constructor({ onFrame, onError, onStreamReady, onStreamEnd }: ScreenCaptureServiceOptions = {}) {
    this.onFrame = onFrame || (() => {});
    this.onError = onError || console.error;
    this.onStreamReady = onStreamReady || (() => {});
    this.onStreamEnd = onStreamEnd || (() => {});

    this.captureLoop = new CaptureLoop({
      capture: async () => {
        const region = this.region;
        const frame = await this.captureActiveFrame();
        return region === this.region ? frame : null;
      },
      onFrame: frame => this.onFrame(frame),
      shouldCapture: () => true,
      onError: error => logger.warn('VISION', `Error capturando pantalla: ${error.message}`)
    });

    this.screenW = typeof window !== 'undefined' ? window.screen.width : 1920;
    this.screenH = typeof window !== 'undefined' ? window.screen.height : 1080;

    this.subscribeAudio();
  }

  public subscribeAudio(): void {
    if (this._unsubAudioStart) return;
    this._unsubAudioStart = eventBus.on(EVENTS.AUDIO_START, () => {
      this.isAiSpeaking = true;
    });
    this._unsubAudioEnd = eventBus.on(EVENTS.AUDIO_END, () => {
      this.isAiSpeaking = false;
      if (this.isCapturing) {
        this.triggerImmediateCapture();
      }
    });
  }

  /**
   * Captures the native OS desktop screen via Electron IPC (desktopCapturer / native C++).
   */
  public async captureNativeDesktop(region: ScreenRegion | null = null, fresh = false): Promise<string | null> {
    if (!electronBridge.isElectron) return null;

    try {
      const activeRegion = region || this.region;
      const base64 = await electronBridge.captureScreenNative(activeRegion, fresh);
      if (base64 && base64.length > 100) {
        return base64;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('VISION', `Fallo captura nativa de escritorio: ${msg}`);
    }
    return null;
  }

  public async requestCapture(): Promise<boolean> {
    if (this.stream) return true;
    if (this.captureRequest) return this.captureRequest;
    const generation = this.streamRequestGeneration;
    const request = this.prepareCapture(generation);
    this.captureRequest = request;
    try {
      return await request;
    } finally {
      if (this.captureRequest === request) this.captureRequest = null;
    }
  }

  private async prepareCapture(generation: number): Promise<boolean> {
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let cancel: (() => void) | null = null;

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: { ideal: 5, max: 10 },
          width: { ideal: window.screen.width },
          height: { ideal: window.screen.height }
        },
        audio: false
      });
      if (generation !== this.streamRequestGeneration) return false;

      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      const cancelled = new Promise<void>((_, reject) => {
        cancel = () => reject(new Error('Captura de pantalla cancelada.'));
        this.cancelCaptureSetup = cancel;
        timeout = setTimeout(() => reject(new Error('La pantalla no entregó vídeo en 10 segundos.')), 10000);
      });

      await Promise.race([video.play(), cancelled]);
      if (generation !== this.streamRequestGeneration) return false;

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo preparar el lienzo de captura.');

      this.stream = stream;
      this.videoEl = video;
      this.offscreenCanvas = canvas;
      this.offscreenCtx = context;

      const tracks = stream.getVideoTracks();
      if (tracks[0]) {
        tracks[0].onended = () => {
          if (this.stream !== stream) return;
          this.stopAll();
          this.onStreamEnd();
        };
      }
      this.onStreamReady();
      return generation === this.streamRequestGeneration;
    } catch (error) {
      if (generation === this.streamRequestGeneration) this.onError(error);
      return false;
    } finally {
      if (timeout !== null) clearTimeout(timeout);
      if (this.cancelCaptureSetup === cancel) this.cancelCaptureSetup = null;
      if (stream && this.stream !== stream) {
        stream.getTracks().forEach(track => track.stop());
        if (video) {
          video.pause();
          video.srcObject = null;
        }
      }
    }
  }

  public captureFrame(region: PixelRegion | null = null, quality = 0.55): string | null {
    if (!this.videoEl || !this.offscreenCanvas || !this.offscreenCtx || this.videoEl.readyState < 2) return null;

    const videoWidth = this.videoEl.videoWidth;
    const videoHeight = this.videoEl.videoHeight;
    const raw = region || { x: 0, y: 0, width: videoWidth, height: videoHeight };
    const x = Math.max(0, Math.min(videoWidth - 1, Math.round(raw.x || 0)));
    const y = Math.max(0, Math.min(videoHeight - 1, Math.round(raw.y || 0)));
    const width = Math.max(1, Math.min(videoWidth - x, Math.round(raw.width || videoWidth)));
    const height = Math.max(1, Math.min(videoHeight - y, Math.round(raw.height || videoHeight)));
    const src = { x, y, width, height };
    const maxWidth = 768;
    const scale = Math.min(1, maxWidth / src.width);
    const destW = Math.round(src.width * scale);
    const destH = Math.round(src.height * scale);

    this.offscreenCanvas.width = destW;
    this.offscreenCanvas.height = destH;

    this.offscreenCtx.drawImage(
      this.videoEl,
      src.x, src.y, src.width, src.height,
      0, 0, destW, destH
    );

    const dataUrl = this.offscreenCanvas.toDataURL('image/jpeg', quality);
    return dataUrl.split(',')[1] ?? null;
  }

  public async captureActiveFrame(fresh = false): Promise<string | null> {
    if (electronBridge.isElectron) {
      const nativeFrame = await this.captureNativeDesktop(this.region, fresh);
      if (nativeFrame) return nativeFrame;
    }

    if (this.stream && this.videoEl) {
      return this.captureFrame(this.activeRegionPixels());
    }

    return null;
  }

  public activeRegionPixels(): PixelRegion | null {
    if (!this.region || !this.videoEl) return null;
    const vw = this.videoEl.videoWidth;
    const vh = this.videoEl.videoHeight;
    const xPct = this.region.x_pct ?? 0;
    const yPct = this.region.y_pct ?? 0;
    const wPct = this.region.w_pct ?? 100;
    const hPct = this.region.h_pct ?? 100;
    return {
      x: Math.round((xPct / 100) * vw),
      y: Math.round((yPct / 100) * vh),
      width: Math.round((wPct / 100) * vw),
      height: Math.round((hPct / 100) * vh)
    };
  }

  public setRegion({ x_pct, y_pct, w_pct, h_pct }: ScreenRegion): void {
    const safeX = Math.max(0, Math.min(99, typeof x_pct === 'number' && !isNaN(x_pct) ? x_pct : 0));
    const safeY = Math.max(0, Math.min(99, typeof y_pct === 'number' && !isNaN(y_pct) ? y_pct : 0));
    const safeW = Math.max(1, Math.min(100 - safeX, typeof w_pct === 'number' && !isNaN(w_pct) ? w_pct : 100));
    const safeH = Math.max(1, Math.min(100 - safeY, typeof h_pct === 'number' && !isNaN(h_pct) ? h_pct : 100));

    this.region = { x_pct: safeX, y_pct: safeY, w_pct: safeW, h_pct: safeH };
    logger.info('VISION', `Región de visión configurada: x=${safeX}% y=${safeY}% w=${safeW}% h=${safeH}%`);
  }

  public clearRegion(): void {
    this.region = null;
    logger.info('VISION', 'Región de visión restablecida a pantalla completa.');
  }

  public async startContinuous(fps = 0.5): Promise<boolean> {
    if (this.isCapturing) return true;
    this.fps = Math.max(0.2, Math.min(0.5, Number.isFinite(fps) ? fps : 0.5));
    this.isCapturing = true;
    this.subscribeAudio();
    const generation = ++this.captureGeneration;
    if (!electronBridge.isElectron) {
      const ok = await this.requestCapture();
      if (generation !== this.captureGeneration) return false;
      if (!ok) {
        this.isCapturing = false;
        return false;
      }
    }
    this.captureLoop.start(Math.round(1000 / this.fps));
    logger.info('VISION', `Vigilancia continua de pantalla iniciada (${this.fps} FPS).`);
    return true;
  }

  public stopContinuous(): void {
    this.isCapturing = false;
    this.captureGeneration++;
    if (this.captureRequest) {
      this.streamRequestGeneration++;
      this.cancelCaptureSetup?.();
      this.captureRequest = null;
    }
    this.captureLoop.stop();
  }

  public triggerImmediateCapture(): void {
    if (this.isCapturing && !this.isAiSpeaking) {
      this.captureLoop.requestImmediate();
    }
  }

  public stopAll(): void {
    this.stopContinuous();
    this.streamRequestGeneration++;
    this.cancelCaptureSetup?.();
    this.captureRequest = null;
    this._unsubAudioStart?.();
    this._unsubAudioEnd?.();
    this._unsubAudioStart = this._unsubAudioEnd = null;
    this.isAiSpeaking = false;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try { t.stop(); } catch (_) {}
      });
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      try { this.videoEl.pause(); } catch (_) {}
      this.videoEl = null;
    }
    if (this.offscreenCanvas) {
      if (this.offscreenCtx) {
        try {
          this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
        } catch (_) {}
      }
      this.offscreenCanvas.width = 0;
      this.offscreenCanvas.height = 0;
      this.offscreenCanvas = null;
      this.offscreenCtx = null;
    }
    this.region = null;
  }

  public get isStreamActive(): boolean {
    return Boolean(this.stream && this.stream.active);
  }
}

export default ScreenCaptureService;
