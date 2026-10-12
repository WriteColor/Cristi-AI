/**
 * Cristi AI - Live2D Domain Types
 */

export type OfficialModelId = 'yanderegirl' | 'jane_doe';

export interface MotionDefinition {
  group: string;
  index?: number;
  label?: string;
  icon?: string;
  [key: string]: unknown;
}

export interface SemanticActionTarget {
  type: 'parameters' | 'expression' | 'motion' | 'fallback' | string;
  name?: string;
  targets?: Record<string, number>;
  fallback?: string;
  motion?: { group: string; index?: number };
  group?: string;
  index?: number;
  [key: string]: unknown;
}

export interface HitArea {
  id: string;
  label: string;
  reaction: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface ModelCapabilities {
  facialExpressions?: boolean;
  eyeBlink?: boolean;
  eyeTracking?: boolean;
  mouthControl?: boolean;
  headMovement?: boolean;
  bodyMovement?: boolean;
  armMovement?: boolean;
  breathing?: boolean;
  physics?: boolean;
  customExpressions?: string[];
  motions?: Array<string | MotionDefinition>;
  motionGroups?: Record<string, unknown>;
  totalParameters?: number;
}

export interface StandardMappingEntry {
  paramId: string;
  min?: number;
  max?: number;
  default?: number;
}

export interface ModelProfile {
  id: string;
  name: string;
  character?: string;
  theme?: string;
  badge?: string;
  recommendedVoice?: string;
  description?: string;
  path: string;
  capabilities?: ModelCapabilities;
  standardMapping?: Record<string, string | StandardMappingEntry>;
  semanticActions?: Record<string, SemanticActionTarget>;
  hitAreas?: HitArea[];
  expressions?: string[];
  blockedExpressions?: string[];
  hiddenParts?: string[];
  lockedParameters?: Record<string, number>;
  registeredAt?: number;
  [key: string]: unknown;
}

export interface ParameterInfo {
  id: string;
  min: number;
  max: number;
  default: number;
  index?: number;
}

export interface DetectedCapabilities {
  parameters: Map<string, ParameterInfo>;
  expressions: string[];
  motions: string[];
  hasPhysics: boolean;
  standardMapping: Record<string, StandardMappingEntry>;
}

export interface RawModel3Json {
  Version?: number;
  FileReferences?: {
    Moc?: string;
    Textures?: string[];
    Physics?: string;
    Expressions?: Array<{ Name: string; File: string }>;
    Motions?: Record<string, Array<{ File: string }>>;
  };
  [key: string]: unknown;
}

export interface Live2DCoreModel {
  _parameterIds?: string[];
  _parameterMinimumValues?: number[];
  _parameterMaximumValues?: number[];
  _parameterDefaultValues?: number[];
  _parameters?: {
    ids?: string[];
    minimumValues?: number[];
    maximumValues?: number[];
    defaultValues?: number[];
  };
  _partIds?: string[];
  _partOpacities?: number[];
  getParameterCount?: () => number;
  getParameterId?: (index: number) => string;
  getParameterMinimumValue?: (index: number) => number;
  getParameterMaximumValue?: (index: number) => number;
  getParameterDefaultValue?: (index: number) => number;
  setParameterValueById?: (id: string, value: number) => void;
  setPartOpacityByIndex?: (index: number, opacity: number) => void;
  [key: string]: unknown;
}

export interface Live2DExpressionManager {
  definitions?: Array<{ name: string; file?: string }>;
  resetExpression?: () => void;
  [key: string]: unknown;
}

export interface Live2DMotionManager {
  expressionManager?: Live2DExpressionManager;
  [key: string]: unknown;
}

export interface Live2DInternalModel {
  coreModel?: Live2DCoreModel;
  motionManager?: Live2DMotionManager;
  parameters?: Record<string, number>;
  setParamFloat?: (id: string, value: number) => void;
  [key: string]: unknown;
}

export interface Live2DModelInstance {
  internalModel?: Live2DInternalModel;
  expression?: (name: string) => void;
  motion?: (group: string, index?: number) => void;
  [key: string]: unknown;
}

export interface BezierTransition {
  startVal: number;
  targetVal: number;
  startTime: number;
  durationMs: number;
}

export interface SpringPhysicsState {
  position: number;
  velocity: number;
  target: number;
  spring: number;
  damping: number;
  mass: number;
  type: string;
}

export interface ActivePhysicsParam {
  paramId: string;
  type: string;
  spring: number;
  damping: number;
  mass: number;
}

export interface Kinematics {
  headX: number;
  headY: number;
  headZ: number;
  bodyX: number;
  bodyY: number;
  bodyZ: number;
}

export interface AudioAnalysisMetrics {
  mouthOpen: number;
  mouthForm: number;
  volume: number;
  isSpeaking: boolean;
  isPeakEnergy?: boolean;
}
