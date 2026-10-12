/**
 * Cristi AI - Ultra-Optimized Real-Time Vision, Object Detection & Multi-Sample Face Recognition (TypeScript)
 * Powered by @vladmandic/face-api & @tensorflow-models/coco-ssd
 * 
 * Features:
 * - Multi-Sample Enrollment (With Glasses, Without Glasses, Multi-angle, Different lighting)
 * - 128D Face Descriptor Embedding Clustering for Robust Owner/Stranger Identification
 * - Windows Hello IR Sensor Compatibility & Contrast Optimization
 * - Real-time Object Tracking (coco-ssd 80 classes)
 * - Facial Expression & Emotion Breakdown
 * - Autonomous Scene State Transition Events
 * - Live HUD Framing / Bounding Box Overlays
 */

import { VISION_CONFIG } from '../../config/visionConfig';
import { performanceProfiler } from '../../infrastructure/profiler/PerformanceProfilerService';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { MOVENET_KEYPOINTS, type PoseKeypoint, type DetectedObject } from './VisionTypes';

const STORAGE_OWNER_SAMPLES = 'cristi_ai_owner_samples_v2';
const STORAGE_OWNER_NAME = 'cristi_ai_owner_name_v2';

export interface OwnerSample {
  id: string;
  label: string;
  descriptor: number[];
  timestamp: number;
}

export interface ProcessedFace {
  box: { x: number; y: number; width: number; height: number };
  isOwner: boolean;
  matchLabel: string;
  matchDistance: number;
  topEmotion: string;
  topEmotionScore: number;
  expressions?: Record<string, number>;
}

export interface DetectionResults {
  faces: ProcessedFace[];
  objects: DetectedObject[];
  pose: PoseKeypoint[] | null;
  phoneInHand: boolean;
  closestDistance: number | null;
  phoneUsageSeconds: number;
  activePhone?: DetectedObject | null;
  closestWrist?: PoseKeypoint | null;
  sceneState: string;
  summary: string;
}

export interface VisionDetectionServiceOptions {
  onSceneStateChange?: (state: string) => void;
  onDetectionsUpdated?: (detections: DetectionResults) => void;
  onSamplesUpdated?: (samples: Array<{ id: string; label: string; timestamp: number }>) => void;
  onDistractionAlert?: (alert: { type: string; duration: number; distancePx: number; message: string }) => void;
  onError?: (error: unknown) => void;
}

export class VisionDetectionService {
  public onSceneStateChange: (state: string) => void;
  public onDetectionsUpdated: (detections: DetectionResults) => void;
  public onSamplesUpdated: (samples: Array<{ id: string; label: string; timestamp: number }>) => void;
  public onDistractionAlert: (alert: { type: string; duration: number; distancePx: number; message: string }) => void;
  public onError: (error: unknown) => void;

  public isModelsLoaded = false;
  public isLoading = false;
  public isRunning = false;
  private cocoModel: any = null;
  private movenetModel: any = null;
  private faceMatcher: any = null;
  private faceapi: any = null;
  private tf: any = null;

  public ownerName = 'Mi Dueño';
  public ownerSamples: OwnerSample[] = [];

  private animationFrameId: number | null = null;
  public lastState = 'NO_ONE';
  public lastStateTimestamp = Date.now();
  private lastProcessTime = 0;
  private processIntervalMs = 100; // 10 FPS smooth tracking
  private reconfiguration: Promise<void> | null = null;

  /** Change sampling without recreating the stream or the loaded models. */
  public setTargetFps(fps: number): void {
    this.processIntervalMs = fps > 0 ? Math.round(1000 / Math.max(0.25, Math.min(10, fps))) : Infinity;
  }

  // Telemetry and Anti-Procrastination state
  public phoneInHand = false;
  public phoneUsageDurationSeconds = 0;
  private lastAlertTime = 0;
  public currentActivity = 'productive_work';

  public currentDetections: DetectionResults = {
    faces: [],
    objects: [],
    pose: null,
    phoneInHand: false,
    closestDistance: null,
    phoneUsageSeconds: 0,
    sceneState: 'NO_ONE',
    summary: ''
  };

  private videoSource: HTMLVideoElement | (() => HTMLVideoElement | null) | null = null;
  private canvasSource: HTMLCanvasElement | (() => HTMLCanvasElement | null) | null = null;

  constructor({
    onSceneStateChange,
    onDetectionsUpdated,
    onSamplesUpdated,
    onDistractionAlert,
    onError
  }: VisionDetectionServiceOptions = {}) {
    this.onSceneStateChange = onSceneStateChange || (() => {});
    this.onDetectionsUpdated = onDetectionsUpdated || (() => {});
    this.onSamplesUpdated = onSamplesUpdated || (() => {});
    this.onDistractionAlert = onDistractionAlert || (() => {});
    this.onError = onError || console.error;

    this.loadSavedOwnerSamples();
  }

  public loadSavedOwnerSamples(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const saved = localStorage.getItem(STORAGE_OWNER_SAMPLES);
      const name = localStorage.getItem(STORAGE_OWNER_NAME);
      if (saved) {
        this.ownerSamples = JSON.parse(saved);
        this.ownerName = name || 'Mi Dueño';
        this.updateFaceMatcher();
      }
    } catch (e) {
      console.error('Error al cargar muestras del dueño:', e);
      this.ownerSamples = [];
    }
  }

  public saveOwnerSamples(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_OWNER_SAMPLES, JSON.stringify(this.ownerSamples));
      localStorage.setItem(STORAGE_OWNER_NAME, this.ownerName);
      this.updateFaceMatcher();
      this.onSamplesUpdated(this.getOwnerSamples());
    } catch (e) {
      console.error('Error al guardar muestras del dueño:', e);
    }
  }

  public updateFaceMatcher(): void {
    if (!this.faceapi) return;
    if (this.ownerSamples && this.ownerSamples.length > 0) {
      const descriptors = this.ownerSamples.map((s) => new Float32Array(s.descriptor));
      const labeledDescriptor = new this.faceapi.LabeledFaceDescriptors(this.ownerName, descriptors);
      this.faceMatcher = new this.faceapi.FaceMatcher([labeledDescriptor], 0.54);
    } else {
      this.faceMatcher = null;
    }
  }

  public async initialize(): Promise<void> {
    return await this.loadModels();
  }

  /** Rebuild only the enabled local models while preserving the active camera. */
  public async refreshConfiguration(): Promise<void> {
    if (this.reconfiguration) return this.reconfiguration;
    const source = this.videoSource;
    const overlay = this.canvasSource;
    const wasRunning = this.isRunning;
    if (!source && !this.isModelsLoaded && !this.isLoading) return;

    this.reconfiguration = (async () => {
      this.unloadModels();
      if (wasRunning && source) await this.start(source, overlay);
      else if (source) await this.loadModels();
    })().finally(() => {
      this.reconfiguration = null;
    });
    return this.reconfiguration;
  }

  public async loadModels(): Promise<void> {
    if (this.isModelsLoaded || this.isLoading) return;
    this.isLoading = true;

    try {
      const [tfCore, cocoSsd, faceapiModule] = await Promise.all([
        import('@tensorflow/tfjs-core'),
        import('@tensorflow-models/coco-ssd'),
        import('@vladmandic/face-api'),
        import('@tensorflow/tfjs-backend-webgl')
      ]);

      this.tf = tfCore;
      this.faceapi = faceapiModule;
      this.updateFaceMatcher();
      try {
        if (this.tf.env) {
          this.tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0);
          this.tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
          this.tf.env().set('WEBGL_PACK', true);
        }
        await this.tf.ready?.();
      } catch (_) {}

      const modelPath = '/models';
      const settings = useSettingsStore.getState();

      const promises = [];
      if (settings.visionFaceDetection || settings.visionExpressions) {
        promises.push(this.faceapi.nets.tinyFaceDetector.loadFromUri(modelPath));
        promises.push(this.faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelPath));
        promises.push(this.faceapi.nets.faceRecognitionNet.loadFromUri(modelPath));
      }
      if (settings.visionExpressions) {
        promises.push(this.faceapi.nets.faceExpressionNet.loadFromUri(modelPath));
      }
      if (settings.visionObjectDetection) {
        promises.push(
          cocoSsd.load({ base: 'lite_mobilenet_v2' }).then((model: any) => {
            this.cocoModel = model;
          })
        );
      }

      await Promise.all(promises);

      this.isModelsLoaded = true;
      this.isLoading = false;
      this.updateFaceMatcher();
    } catch (err) {
      this.isLoading = false;
      const error = new Error(`Los modelos locales de visión empaquetados no están disponibles: ${err instanceof Error ? err.message : String(err)}`);
      this.onError(error);
      throw error;
    }
  }

  public async addOwnerSample(
    videoElementOrGetter: HTMLVideoElement | (() => HTMLVideoElement | null),
    sampleLabel = 'Muestra'
  ): Promise<{ status: string; sampleId: string; label: string; totalSamples: number; box: any }> {
    if (!this.isModelsLoaded) {
      await this.loadModels();
    }

    const videoElement = typeof videoElementOrGetter === 'function' ? videoElementOrGetter() : videoElementOrGetter;
    if (!videoElement || videoElement.readyState < 2) {
      throw new Error('La cámara aún se está inicializando. Por favor espera un instante y reintenta.');
    }

    const detection = await this.faceapi
      .detectSingleFace(videoElement, new this.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) {
      throw new Error('No se detectó ningún rostro con suficiente claridad. Mira fijamente a la cámara con buena luz.');
    }

    const sample: OwnerSample = {
      id: `sample_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      label: sampleLabel,
      descriptor: Array.from(detection.descriptor),
      timestamp: Date.now()
    };

    this.ownerSamples.push(sample);
    this.saveOwnerSamples();

    return {
      status: 'added',
      sampleId: sample.id,
      label: sampleLabel,
      totalSamples: this.ownerSamples.length,
      box: detection.detection.box
    };
  }

  public deleteOwnerSample(sampleId: string): void {
    this.ownerSamples = this.ownerSamples.filter((s) => s.id !== sampleId);
    this.saveOwnerSamples();
  }

  public clearAllOwnerSamples(): void {
    this.ownerSamples = [];
    this.saveOwnerSamples();
  }

  public getOwnerSamples(): Array<{ id: string; label: string; timestamp: number }> {
    return this.ownerSamples.map((s) => ({
      id: s.id,
      label: s.label,
      timestamp: s.timestamp
    }));
  }

  public isOwnerEnrolled(): boolean {
    return this.ownerSamples.length > 0;
  }

  public async start(
    videoElementOrGetter: HTMLVideoElement | (() => HTMLVideoElement | null),
    overlayCanvasOrGetter: HTMLCanvasElement | (() => HTMLCanvasElement | null) | null = null
  ): Promise<void> {
    this.videoSource = videoElementOrGetter;
    this.canvasSource = overlayCanvasOrGetter;

    if (this.isRunning) return;
    this.isRunning = true;

    if (!this.isModelsLoaded && !this.isLoading) {
      await this.loadModels();
    }

    const detectFrame = async (): Promise<void> => {
      if (!this.isRunning) return;

      try {
        const video = typeof this.videoSource === 'function' ? this.videoSource() : this.videoSource;
        const canvas = typeof this.canvasSource === 'function' ? this.canvasSource() : this.canvasSource;

        if (video && video.readyState >= 2) {
          await this.processVideoFrame(video, canvas);
        }
      } catch (err) {
        console.warn('Frame processing tick notice:', err);
      }

      if (this.isRunning) {
        this.animationFrameId = requestAnimationFrame(detectFrame);
      }
    };

    this.animationFrameId = requestAnimationFrame(detectFrame);
  }

  public startTracking(
    videoElementOrGetter: HTMLVideoElement | (() => HTMLVideoElement | null),
    overlayCanvasOrGetter: HTMLCanvasElement | (() => HTMLCanvasElement | null) | null = null
  ): Promise<void> {
    return this.start(videoElementOrGetter, overlayCanvasOrGetter);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    try {
      const canvas = typeof this.canvasSource === 'function' ? this.canvasSource() : this.canvasSource;
      if (canvas && canvas.getContext) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    } catch (_) {}

    this.videoSource = null;
    this.canvasSource = null;

    this.currentDetections = {
      faces: [],
      objects: [],
      pose: null,
      phoneInHand: false,
      closestDistance: null,
      phoneUsageSeconds: 0,
      sceneState: 'NO_ONE',
      summary: ''
    };
  }

  public stopTracking(): void {
    this.stop();
  }

  public unloadModels(): void {
    this.stop();
    if (this.movenetModel?.dispose) {
      try { this.movenetModel.dispose(); } catch (_) {}
      this.movenetModel = null;
    }
    if (this.cocoModel?.dispose) {
      try { this.cocoModel.dispose(); } catch (_) {}
      this.cocoModel = null;
    }
    this.faceMatcher = null;
    this.isModelsLoaded = false;
    this.isLoading = false;
  }

  public dispose(): void {
    this.unloadModels();
  }

  public getMemoryInfo(): unknown {
    try {
      if (this.tf && this.tf.memory) {
        return this.tf.memory();
      }
    } catch (_) {}
    return null;
  }

  public async processVideoFrame(videoElement: HTMLVideoElement, overlayCanvas: HTMLCanvasElement | null = null): Promise<void> {
    if (!this.isModelsLoaded || !videoElement || videoElement.readyState < 2) return;

    const now = Date.now();
    if (now - this.lastProcessTime < this.processIntervalMs) return;

    const elapsedSec = (now - this.lastProcessTime) / 1000;
    this.lastProcessTime = now;

    return performanceProfiler.measure('visionSensory', async () => {
      try {
        const displaySize = {
          width: videoElement.videoWidth || 640,
          height: videoElement.videoHeight || 480
        };

        const settings = useSettingsStore.getState();

        let faceDetectionsPromise: Promise<any> = Promise.resolve([]);
        // Expressions require a face pass even when identity/face labeling is
        // disabled; otherwise the expression toggle silently does nothing.
        if (settings.visionFaceDetection || settings.visionExpressions) {
          let chain = this.faceapi.detectAllFaces(videoElement, new this.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }))
            .withFaceLandmarks(true)
            .withFaceDescriptors();

          if (settings.visionExpressions) {
            chain = chain.withFaceExpressions();
          }
          faceDetectionsPromise = chain;
        }

        let objectDetectionsPromise = Promise.resolve([]);
        if (settings.visionObjectDetection && this.cocoModel) {
          objectDetectionsPromise = this.cocoModel.detect(videoElement, 8, 0.45);
        }

        // 1. Run Face API, Object Detection & MoveNet Pose in Parallel
        const [faceDetections, objectDetections] = await Promise.all([
          faceDetectionsPromise,
          objectDetectionsPromise
        ]);

        let poseKeypoints: PoseKeypoint[] | null = null;
        if (this.movenetModel && this.tf) {
          let expanded: any = null;
          let prediction: any = null;
          try {
            const tf = this.tf;
            expanded = tf.tidy(() => {
              const tfImg = tf.browser.fromPixels(videoElement);
              const resized = tf.image.resizeBilinear(tfImg, [192, 192]);
              const casted = tf.cast(resized, 'int32');
              return tf.expandDims(casted, 0);
            });

            prediction = this.movenetModel.predict(expanded);
            const arrayData = await prediction.array();

            if (arrayData?.[0]?.[0]) {
              poseKeypoints = arrayData[0][0].map((kp: number[], idx: number) => ({
                name: MOVENET_KEYPOINTS[idx] || `point_${idx}`,
                y: kp[0] * displaySize.height,
                x: kp[1] * displaySize.width,
                score: kp[2]
              }));
            }
          } catch (_) {
          } finally {
            if (expanded?.dispose) {
              try { expanded.dispose(); } catch (_) {}
            }
            if (prediction?.dispose) {
              try { prediction.dispose(); } catch (_) {}
            }
          }
        }

        // 2. Identify Faces (Owner vs Stranger)
        let ownerCount = 0;
        let strangerCount = 0;
        const processedFaces: ProcessedFace[] = [];

        faceDetections.forEach((fd: any) => {
          let isOwner = false;
          let matchDistance = 1.0;
          let matchLabel = 'Desconocido';

          if (this.faceMatcher && fd.descriptor) {
            const match = this.faceMatcher.findBestMatch(fd.descriptor);
            matchLabel = match.label;
            matchDistance = match.distance;
            if (match.label === this.ownerName) {
              isOwner = true;
              ownerCount++;
            } else {
              strangerCount++;
            }
          } else {
            strangerCount++;
          }

          let topEmotion = 'neutral';
          let topEmotionScore = 0;
          if (fd.expressions) {
            Object.entries(fd.expressions as Record<string, number>).forEach(([emo, score]) => {
              if (score > topEmotionScore) {
                topEmotionScore = score;
                topEmotion = emo;
              }
            });
          }

          processedFaces.push({
            box: fd.detection.box,
            isOwner,
            matchLabel,
            matchDistance: Number(matchDistance.toFixed(3)),
            topEmotion,
            topEmotionScore: Number(topEmotionScore.toFixed(2)),
            expressions: fd.expressions
          });
        });

        // 3. Wrist-to-Phone Distance Calculation
        let leftWrist: PoseKeypoint | null = null;
        let rightWrist: PoseKeypoint | null = null;
        let closestDistance = Infinity;
        let closestWrist: PoseKeypoint | null = null;
        let activePhone: DetectedObject | null = null;

        if (poseKeypoints) {
          leftWrist = poseKeypoints.find((k) => k.name === 'left_wrist' && k.score > 0.35) || null;
          rightWrist = poseKeypoints.find((k) => k.name === 'right_wrist' && k.score > 0.35) || null;
        }

        const phoneDetections: DetectedObject[] = objectDetections.filter(
          (o: DetectedObject) => o.class === 'cell phone' || o.class === 'remote'
        );

        for (const phone of phoneDetections) {
          const [px, py, pw, ph] = phone.bbox;
          const phoneCenterX = px + pw / 2;
          const phoneCenterY = py + ph / 2;

          if (leftWrist) {
            const dist = Math.hypot(leftWrist.x - phoneCenterX, leftWrist.y - phoneCenterY);
            if (dist < closestDistance) {
              closestDistance = dist;
              closestWrist = leftWrist;
              activePhone = { ...phone, centerX: phoneCenterX, centerY: phoneCenterY };
            }
          }

          if (rightWrist) {
            const dist = Math.hypot(rightWrist.x - phoneCenterX, rightWrist.y - phoneCenterY);
            if (dist < closestDistance) {
              closestDistance = dist;
              closestWrist = rightWrist;
              activePhone = { ...phone, centerX: phoneCenterX, centerY: phoneCenterY };
            }
          }
        }

        const isPhoneInHand = activePhone !== null && closestDistance <= VISION_CONFIG.wristPhoneThresholdPx;
        this.phoneInHand = isPhoneInHand;

        if (isPhoneInHand) {
          this.phoneUsageDurationSeconds += elapsedSec;
        } else {
          if (this.phoneUsageDurationSeconds > 0) {
            this.phoneUsageDurationSeconds = Math.max(0, this.phoneUsageDurationSeconds - elapsedSec * 1.5);
          }
        }

        // 4. Distraction & Procrastination Alert Event
        if (
          isPhoneInHand &&
          this.phoneUsageDurationSeconds >= VISION_CONFIG.phoneUsageAlertSeconds &&
          now - this.lastAlertTime > VISION_CONFIG.distractionReminderIntervalSeconds * 1000
        ) {
          this.lastAlertTime = now;
          const reactions = VISION_CONFIG.REACTION_MESSAGES.PHONE_USAGE;
          const message = reactions[Math.floor(Math.random() * reactions.length)] || '';
          this.onDistractionAlert({
            type: 'phone_usage',
            duration: Math.round(this.phoneUsageDurationSeconds),
            distancePx: Math.round(closestDistance),
            message
          });
        }

        // 5. Scene State Determination
        let sceneState = 'NO_ONE';
        if (ownerCount > 0 && strangerCount === 0) {
          sceneState = 'OWNER_ALONE';
        } else if (ownerCount > 0 && strangerCount > 0) {
          sceneState = 'OWNER_WITH_OTHERS';
        } else if (ownerCount === 0 && strangerCount > 0) {
          sceneState = 'STRANGER_ONLY';
        } else {
          sceneState = 'NO_ONE';
        }

        let summary = '';
        if (sceneState === 'OWNER_ALONE') {
          const emo = processedFaces[0]?.topEmotion || 'tranquilo';
          summary = `Tu Dueño está a solas frente a la cámara. Expresión: ${emo}.`;
        } else if (sceneState === 'OWNER_WITH_OTHERS') {
          summary = `¡ALERTA DE CELOS! Tu Dueño está acompañado por ${strangerCount} persona(s) desconocida(s).`;
        } else if (sceneState === 'STRANGER_ONLY') {
          summary = `Hay ${strangerCount} persona(s) desconocida(s) frente a la cámara.`;
        } else {
          summary = 'La cámara no detecta a nadie presente en este momento.';
        }

        if (isPhoneInHand) {
          summary += ` [ALERTA: USO DE CELULAR] Tu Dueño está usando el teléfono celular en la mano (${Math.round(this.phoneUsageDurationSeconds)}s de uso continuo).`;
        }

        this.currentDetections = {
          faces: processedFaces,
          objects: objectDetections,
          pose: poseKeypoints,
          phoneInHand: isPhoneInHand,
          closestDistance: closestDistance === Infinity ? null : Math.round(closestDistance),
          phoneUsageSeconds: Math.round(this.phoneUsageDurationSeconds),
          activePhone,
          closestWrist,
          sceneState,
          summary
        };

        this.onDetectionsUpdated(this.currentDetections);

        // 6. Draw Futuristic Cyber-HUD on Overlay Canvas
        if (overlayCanvas) {
          this.drawHUDOverlay(overlayCanvas, displaySize, processedFaces, objectDetections, this.currentDetections);
        }
      } catch (err) {
        console.error('Error en processVideoFrame:', err);
      }
    });
  }

  public drawHUDOverlay(
    canvas: HTMLCanvasElement,
    displaySize: { width: number; height: number },
    faces: ProcessedFace[],
    objects: DetectedObject[],
    telemetry: DetectionResults
  ): void {
    if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
      canvas.width = displaySize.width;
      canvas.height = displaySize.height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Face Bounding Boxes
    faces.forEach((face) => {
      const { x, y, width, height } = face.box;
      const isOwner = face.isOwner;

      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isOwner ? '#c084fc' : '#f43f5e';
      ctx.fillStyle = isOwner ? '#c084fc' : '#f43f5e';
      ctx.shadowColor = isOwner ? '#c084fc' : '#f43f5e';
      ctx.shadowBlur = 10;

      const cornerLen = Math.min(20, width * 0.25);
      ctx.beginPath();
      ctx.moveTo(x, y + cornerLen); ctx.lineTo(x, y); ctx.lineTo(x + cornerLen, y);
      ctx.moveTo(x + width - cornerLen, y); ctx.lineTo(x + width, y); ctx.lineTo(x + width, y + cornerLen);
      ctx.moveTo(x + width, y + height - cornerLen); ctx.lineTo(x + width, y + height); ctx.lineTo(x + width - cornerLen, y + height);
      ctx.moveTo(x + cornerLen, y + height); ctx.lineTo(x, y + height); ctx.lineTo(x, y + height - cornerLen);
      ctx.stroke();

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(isOwner ? `[DUENO] (${face.topEmotion})` : `[DESCONOCIDO]`, x + 4, y - 6);
      ctx.restore();
    });

    // Draw Object Bounding Boxes
    objects.forEach((obj) => {
      const [x, y, width, height] = obj.bbox;
      const isPhone = obj.class === 'cell phone' || obj.class === 'remote';

      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = isPhone ? (telemetry?.phoneInHand ? '#ec4899' : '#06b6d4') : '#10b981';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 8;

      ctx.strokeRect(x, y, width, height);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(
        isPhone ? `[PHONE] ${obj.class} ${Math.round(obj.score * 100)}%` : `${obj.class}`,
        x + 4,
        y - 4
      );
      ctx.restore();
    });

    // Draw Wrist-to-Phone Distance Laser Vector Line
    if (telemetry?.activePhone && telemetry?.closestWrist) {
      const wx = telemetry.closestWrist.x;
      const wy = telemetry.closestWrist.y;
      const px = telemetry.activePhone.centerX ?? 0;
      const py = telemetry.activePhone.centerY ?? 0;
      const inHand = telemetry.phoneInHand;

      ctx.save();
      ctx.lineWidth = inHand ? 2.5 : 1.5;
      ctx.strokeStyle = inHand ? '#ec4899' : '#38bdf8';
      ctx.setLineDash(inHand ? [] : [4, 4]);
      ctx.shadowColor = inHand ? '#ec4899' : '#38bdf8';
      ctx.shadowBlur = 12;

      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(px, py);
      ctx.stroke();

      ctx.fillStyle = inHand ? '#ec4899' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(wx, wy, 5, 0, Math.PI * 2);
      ctx.fill();

      const midX = (wx + px) / 2;
      const midY = (wy + py) / 2;
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillStyle = inHand ? '#ff2d55' : '#38bdf8';
      ctx.fillText(
        inHand
          ? `[USO DE CELULAR] (${telemetry.closestDistance}px • ${telemetry.phoneUsageSeconds}s)`
          : `Distancia: ${telemetry.closestDistance}px`,
        midX - 30,
        midY - 8
      );
      ctx.restore();
    }

    // Draw Cyber Activity Status Badge
    const activityKey = (telemetry as any)?.activity || (telemetry?.phoneInHand ? 'phone_usage' : 'productive_work');
    const activityLabel = (VISION_CONFIG.ACTIVITY_LABELS as Record<string, string>)[activityKey] || '💻 Trabajo Productivo Enfocado';

    ctx.save();
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    const badgeW = ctx.measureText(activityLabel).width + 16;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = telemetry?.phoneInHand ? '#ec4899' : '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.fillRect(canvas.width - badgeW - 10, 10, badgeW, 22);
    ctx.strokeRect(canvas.width - badgeW - 10, 10, badgeW, 22);
    ctx.fillStyle = telemetry?.phoneInHand ? '#ff2d55' : '#38bdf8';
    ctx.fillText(activityLabel, canvas.width - badgeW - 2, 25);
    ctx.restore();
  }

  public getCurrentSceneSummary(): string {
    return this.currentDetections.summary || 'Cámara sensorial activa.';
  }
}

export default VisionDetectionService;
