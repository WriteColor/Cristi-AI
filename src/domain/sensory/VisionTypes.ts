/** Shared local-vision data contracts. The inference owner is LocalVisionRuntime. */
export const MOVENET_KEYPOINTS = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
] as const;

export interface PoseKeypoint {
  name: string;
  y: number;
  x: number;
  score: number;
}

export interface DetectedObject {
  class: string;
  score: number;
  bbox: [number, number, number, number];
  centerX?: number;
  centerY?: number;
}
