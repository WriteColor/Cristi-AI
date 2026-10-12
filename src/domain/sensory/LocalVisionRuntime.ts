import { CameraService } from './CameraService.js';
import { VisionDetectionService, type DetectionResults } from './VisionDetectionService.js';
import type { RuntimeBudget } from '../runtime/RuntimeBudgetCoordinator.js';
import { useSettingsStore } from '../../stores/useSettingsStore.js';

export type CameraObservationMode = 'off' | 'headless' | 'preview';

export interface LocalVisionRuntimeOptions {
  onFrame?: (base64Jpeg: string) => void;
  onDetections?: (detections: DetectionResults) => void;
  onError?: (error: unknown) => void;
}

/**
 * Owns one camera stream and one local inference pipeline. A preview is only
 * an attachment to that stream; it never creates a competing getUserMedia call.
 */
export class LocalVisionRuntime {
  readonly camera: CameraService;
  readonly detector: VisionDetectionService;
  private mode: CameraObservationMode = 'off';
  private inactivityCheckInterval: any = null;
  private lastActiveTimestamp: number = Date.now();
  private isBudgetActive: boolean = false;
  private unsubscribeSettings: (() => void) | null = null;

  constructor(private readonly options: LocalVisionRuntimeOptions = {}) {
    this.camera = new CameraService({
      onFrameCaptured: frame => options.onFrame?.(frame),
      onError: error => options.onError?.(error),
    });
    this.detector = new VisionDetectionService({
      onDetectionsUpdated: detections => options.onDetections?.(detections),
      onError: error => options.onError?.(error),
    });
    // Apply detector switches immediately without reopening the camera.
    this.unsubscribeSettings = useSettingsStore.subscribe((next, previous) => {
      if (next.visionFaceDetection !== previous.visionFaceDetection ||
          next.visionObjectDetection !== previous.visionObjectDetection ||
          next.visionExpressions !== previous.visionExpressions) {
        void this.detector.refreshConfiguration().catch(error => options.onError?.(error));
      }
    });
  }

  getMode(): CameraObservationMode { return this.mode; }
  isActive(): boolean { return this.mode !== 'off' && this.camera.isStreaming; }

  async start(mode: Exclude<CameraObservationMode, 'off'> = 'headless', preferredDeviceId: string | null = null, preview: HTMLVideoElement | null = null): Promise<void> {
    await this.camera.start(mode === 'preview' ? preview : null, preferredDeviceId);
    this.mode = mode;
    this.lastActiveTimestamp = Date.now();
    // Local detection consumes the internal video element in both modes.
    try {
      await this.detector.start(() => this.camera.getVideoElement());
    } catch (error) {
      // Camera access and local inference are independent capabilities. Keep
      // the stream alive when an optional packaged model is unavailable so
      // Gemini can still receive camera snapshots and the UI reports the
      // actual inference problem instead of a misleading device error.
      this.options.onError?.(error);
      this.detector.stop();
    }
    this.startInactivityMonitor();
  }

  private startInactivityMonitor(): void {
    if (this.inactivityCheckInterval) clearInterval(this.inactivityCheckInterval);
    this.inactivityCheckInterval = setInterval(() => {
      if (this.mode !== 'headless' || this.isBudgetActive) {
        this.lastActiveTimestamp = Date.now();
        return;
      }
      
      const timeoutMs = useSettingsStore.getState().visionHeadlessTimeoutMs || 300000;
      if (Date.now() - this.lastActiveTimestamp > timeoutMs) {
        console.info(`[LocalVisionRuntime] Cámara headless inactiva por más de ${timeoutMs / 1000}s. Apagando para ahorrar recursos.`);
        this.stop();
      }
    }, 10000);
  }

  attachPreview(preview: HTMLVideoElement): void {
    if (!this.camera.isStreaming) throw new Error('La cámara no está activa.');
    this.camera.attachVideoPreview(preview);
    this.mode = 'preview';
  }

  startFrameStream(fps: number): void {
    if (!this.camera.isStreaming) return;
    this.camera.startPeriodicStreaming(Math.max(0.25, Math.min(2, fps)));
  }

  applyBudget(budget: RuntimeBudget): void {
    if (!this.isActive()) return;
    // A budget recommendation alone does not mean that the hidden camera is
    // currently being used. Only an explicitly permitted continuous capture
    // keeps the headless inactivity watchdog alive.
    this.isBudgetActive = budget.vision.allowContinuousCapture && budget.vision.recommendedFps > 0;
    if (this.isBudgetActive) {
      this.lastActiveTimestamp = Date.now();
    }

    if (budget.vision.allowContinuousCapture && budget.vision.recommendedFps > 0) {
      this.startFrameStream(budget.vision.recommendedFps);
    } else {
      this.camera.stopPeriodicStreaming();
    }
    this.detector.setTargetFps(budget.vision.recommendedFps);
  }

  stop(): void {
    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
      this.inactivityCheckInterval = null;
    }
    this.detector.stop();
    this.camera.stop();
    this.mode = 'off';
  }

  dispose(): void {
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    this.stop();
    this.detector.dispose();
  }
}
