/**
 * Cristi AI - Sensory Perception & Vision Subsystem Domain Types.
 * Strictly typed definitions for screen capture, local browser vision, and voice biometrics.
 */

/**
 * Percentage or normalized region for targeted visual attention and cropping.
 * Can be defined in percentage terms (0 to 100) or normalized floating point (0.0 to 1.0).
 */
export interface ScreenRegion {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  x_pct?: number;
  y_pct?: number;
  w_pct?: number;
  h_pct?: number;
}

/**
 * Output compression format for Gemini Multimodal Live streaming.
 */
export type ScreenImageFormat = 'jpeg' | 'webp';

/**
 * Configuration options for the ScreenCaptureEngine.
 */
export interface ScreenCaptureOptions {
  /** Target frame rate (up to 60 FPS) */
  fps?: number;
  /** Image format: 'jpeg' (default) or 'webp' */
  format?: ScreenImageFormat;
  /** Compression quality between 0.0 and 1.0 (default 0.6) */
  quality?: number;
  /** Maximum output frame width (default 768px for optimal Gemini Live latency) */
  maxWidth?: number;
  /** Maximum output frame height (calculated proportionally if omitted) */
  maxHeight?: number;
  /** Target region to crop on every capture */
  screenRegion?: ScreenRegion | null;
  /** Force Electron IPC native capture even when Web MediaStream is available */
  preferNativeIpc?: boolean;
}

/**
 * Encapsulates a captured screen or camera frame ready for Gemini Multimodal Live.
 */
export interface CapturedFrame {
  /** Pure base64 data string without the data URL prefix (ready for Gemini Live payload) */
  dataBase64: string;
  /** Optional full data URL schema: data:image/jpeg;base64,... */
  dataUrl?: string;
  /** MIME type of the encoded frame */
  mimeType: 'image/jpeg' | 'image/webp';
  /** Timestamp when the frame was acquired */
  timestamp: number;
  /** Output pixel width */
  width: number;
  /** Output pixel height */
  height: number;
  /** Actual rolling FPS achieved by the engine */
  fpsActual?: number;
  /** Monotonic frame sequence number */
  frameIndex: number;
  /** Active region applied if cropped */
  region?: ScreenRegion | null;
}

/**
 * 2D Bounding Box in pixel coordinates.
 */
export interface VisionBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Object detected by the local COCO-SSD model.
 */
export interface DetectedObjectInfo {
  /** Class label (e.g. 'person', 'cell phone', 'laptop', 'cup', etc.) */
  class: string;
  /** Detection confidence score between 0.0 and 1.0 */
  score: number;
  /** Bounding box coordinates [x, y, width, height] in source pixels */
  bbox: [number, number, number, number];
  /** Normalized bounding box [0.0 - 1.0] */
  normalizedBox?: VisionBoundingBox;
}

/**
 * Facial expression probabilities detected by Face-API.
 */
export interface FaceExpressions {
  neutral: number;
  happy: number;
  sad: number;
  angry: number;
  fearful: number;
  disgusted: number;
  surprised: number;
}

/**
 * 2D landmark point on the detected face.
 */
export interface FaceLandmarkPoint {
  x: number;
  y: number;
}

/**
 * Result of a single detected face.
 */
export interface FaceDetectionInfo {
  box: VisionBoundingBox;
  score: number;
  landmarks?: FaceLandmarkPoint[];
  expressions?: FaceExpressions;
  dominantEmotion: string;
  descriptor?: number[];
  isOwner?: boolean;
  ownerDistance?: number;
}

/**
 * Pose estimation keypoint (e.g. nose, eyes, shoulders).
 */
export interface PoseKeypointInfo {
  name: string;
  x: number;
  y: number;
  score: number;
}

/**
 * Body posture and pose estimation result.
 */
export interface PoseEstimationResult {
  keypoints: PoseKeypointInfo[];
  score: number;
  posture: 'upright' | 'slumped' | 'turned_away' | 'head_down' | 'unknown';
  headPitch?: number; // In degrees
  headYaw?: number;   // In degrees
  headRoll?: number;  // In degrees
}

/**
 * High-level verification of human presence and interaction status in front of the webcam.
 */
export interface HumanPresenceVerification {
  /** True if a human face or person body is detected */
  isHumanPresent: boolean;
  /** Number of faces currently detected in view */
  facesCount: number;
  /** True if the detected face matches enrolled biometric descriptors of the authorized owner */
  isAuthorizedOwner: boolean;
  /** Biometric match confidence (0.0 to 1.0) */
  ownerConfidence: number;
  /** Dominant emotional state detected */
  primaryEmotion: string;
  /** Estimated proximity to camera */
  distanceEstimate: 'close' | 'optimal' | 'far' | 'none';
  /** True if a cell phone is detected in proximity (anti-procrastination trigger) */
  phoneDetected: boolean;
  /** True if a laptop/computer screen is detected in frame */
  laptopDetected: boolean;
  /** True if head yaw and pitch indicate user is looking toward the screen */
  isAttentiveToScreen: boolean;
  /** Overall confidence of presence assessment */
  confidence: number;
  /** Timestamp of the last confirmed human presence */
  lastSeenTimestamp: number;
}

/**
 * Complete consolidated result from a single local vision inference pass.
 */
export interface LocalVisionAnalysisResult {
  presence: HumanPresenceVerification;
  objects: DetectedObjectInfo[];
  faces: FaceDetectionInfo[];
  pose: PoseEstimationResult | null;
  summary: string;
  timestamp: number;
  latencyMs: number;
}

/**
 * Mathematical configuration for Log-Mel filterbank extraction.
 */
export interface LogMelConfig {
  /** Audio sampling frequency (e.g. 16000 or 48000 Hz) */
  sampleRate: number;
  /** FFT window size (e.g. 512 or 1024) */
  fftSize: number;
  /** Step size between consecutive FFT frames (e.g. 256 or 512) */
  hopSize: number;
  /** Number of triangular Mel filter bands (e.g. 32 or 40) */
  numMelBands: number;
  /** Lower frequency bound in Hz (e.g. 80 Hz for human vocal tract) */
  minFrequencyHz: number;
  /** Upper frequency bound in Hz (e.g. 7600 Hz) */
  maxFrequencyHz: number;
  /** Pre-emphasis high-frequency boost coefficient (e.g. 0.97) */
  preEmphasisCoeff: number;
}

/**
 * Stored biometric sample of an authorized user's voice.
 */
export interface VoiceprintSample {
  id: string;
  label: string;
  timestamp: number;
  vector: number[];
  pitchMean: number;
  energyRms: number;
}

/**
 * Voice biometrics profile containing cluster centroid embeddings for speaker authentication.
 */
export interface VoiceBiometricsProfile {
  userId: string;
  userName: string;
  createdAt: number;
  updatedAt: number;
  samples: VoiceprintSample[];
  centroid: number[];
  referencePitch: number;
  confidenceThreshold: number;
}

/**
 * Speaker verification outcome distinguishing authorized user from background voices or ambient noise.
 */
export interface VoiceVerificationResult {
  /** True if the voice matches the authorized user profile above the confidence threshold */
  isAuthorizedUser: boolean;
  /** Confidence score of verification (0.0 to 1.0) */
  confidence: number;
  /** Raw cosine similarity score between input embedding and authorized voice centroid (-1.0 to 1.0) */
  similarityScore: number;
  /** True if vocal activity (speech formants) was detected */
  isSpeechDetected: boolean;
  /** True if signal is predominantly ambient background noise (low SNR / unvoiced) */
  isBackgroundNoise: boolean;
  /** True if speech is present, but biometric signature does NOT match the owner */
  isImposterOrBackgroundVoice: boolean;
  /** Estimated fundamental frequency (F0) in Hz */
  estimatedPitchHz: number;
  /** Signal-to-Noise Ratio estimation in decibels */
  snrDb: number;
  /** RMS energy level of the analyzed chunk */
  energyRms: number;
  /** Spectral centroid (vocal brightness) in Hz */
  spectralCentroid: number;
  /** Spectral flatness index (0 = tonal/voiced formants, 1 = white noise) */
  spectralFlatness: number;
  /** Normalized Log-Mel feature embedding fingerprint */
  logMelFingerprint: number[];
  /** Timestamp of verification */
  timestamp: number;
}

/**
 * Comprehensive configuration for the unified Sensory Subsystem Facade.
 */
export interface SensorySubsystemConfig {
  screen?: ScreenCaptureOptions;
  vision?: {
    fps?: number;
    minConfidence?: number;
    enablePose?: boolean;
    enableFaceLandmarks?: boolean;
    enableExpressions?: boolean;
    enableObjectTracking?: boolean;
    modelsPath?: string;
  };
  voice?: {
    sampleRate?: number;
    confidenceThreshold?: number;
    vadEnergyThreshold?: number;
    minPitchHz?: number;
    maxPitchHz?: number;
  };
}

/**
 * Real-time operational status of all sensory perception sub-engines.
 */
export interface SensoryStatus {
  screenActive: boolean;
  visionActive: boolean;
  voiceActive: boolean;
  screenFpsActual: number;
  visionFpsActual: number;
  isUserPresent: boolean;
  isUserAuthorized: boolean;
  isVoiceVerified: boolean;
  lastCaptureTime: number | null;
  lastVisionTime: number | null;
  lastVoiceTime: number | null;
}

/**
 * Synchronized multimodal snapshot combining visual, desktop, and auditory perception.
 */
export interface MultimodalSensorySnapshot {
  timestamp: number;
  screenFrame: CapturedFrame | null;
  visionAnalysis: LocalVisionAnalysisResult | null;
  voiceVerification: VoiceVerificationResult | null;
  presenceSummary: HumanPresenceVerification | null;
}
