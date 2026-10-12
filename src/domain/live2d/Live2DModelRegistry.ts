/**
 * Cristi AI - Extensible Live2D Model Registry & Capability Mapping Engine
 * Allows registering, validating, discovering, and switching Live2D Cubism models
 * without coupling the core AI or animation logic to specific parameter IDs.
 */

import { ALL_MODEL_PROFILES } from './models/index.ts';
import avatarsConfig from '../../../config/avatars.json' with { type: 'json' };
import { modularConfigManager } from '../../config/ModularConfigManager.ts';
import type {
  ModelProfile,
  ModelCapabilities,
  SemanticActionTarget,
  DetectedCapabilities,
  Live2DModelInstance,
  RawModel3Json,
  ParameterInfo,
  StandardMappingEntry
} from './types';

function normalizeAvatarPath(rawPath?: string): string {
  if (!rawPath) return '';
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://') || rawPath.startsWith('blob:') || rawPath.startsWith('data:')) {
    return rawPath;
  }
  const clean = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
  if (clean.startsWith('models/live2d/')) {
    return `/${clean}`;
  }
  return `/models/live2d/${clean}`;
}

export class Live2DModelRegistry {
  private models: Map<string, ModelProfile> = new Map();
  public activeModelId: string = 'yanderegirl';

  constructor() {
    // Register all discovered model profiles
    for (const profile of ALL_MODEL_PROFILES) {
      this.registerModel(profile);
    }

    // Populate and merge models from config/avatars.json
    for (const avatar of avatarsConfig) {
      const existing = this.models.get(avatar.id);
      const normalizedPath = normalizeAvatarPath(avatar.path || existing?.path);
      if (existing) {
        this.models.set(avatar.id, {
          ...existing,
          ...avatar,
          path: normalizedPath
        });
      } else {
        this.registerModel({
          id: avatar.id,
          name: avatar.name,
          path: normalizedPath,
          scale: avatar.scale,
          anchorY: avatar.anchorY,
          defaultEmotion: avatar.defaultEmotion,
        } as ModelProfile);
      }
    }
  }

  /**
   * Dynamically populate or update models from modular config
   */
  syncWithModularConfig(avatars?: Array<Record<string, unknown>>): void {
    const list = avatars || (modularConfigManager ? modularConfigManager.getSection('avatars') : []);
    if (Array.isArray(list)) {
      for (const avatar of list) {
        if (!avatar.id || !avatar.path) continue;
        const existing = this.models.get(avatar.id as string);
        const normalizedPath = normalizeAvatarPath((avatar.path as string) || existing?.path);
        if (existing) {
          this.models.set(avatar.id as string, { ...existing, ...avatar, path: normalizedPath });
        } else {
          this.registerModel({ ...avatar, path: normalizedPath } as unknown as ModelProfile);
        }
      }
    }
  }


  /**
   * Register a new Live2D Model descriptor
   */
  registerModel(modelConfig: ModelProfile): ModelProfile {
    if (!modelConfig.id || !modelConfig.path) {
      throw new Error('[Live2DModelRegistry] Model must have an id and path.');
    }
    const registered: ModelProfile = {
      ...modelConfig,
      registeredAt: Date.now()
    };
    this.models.set(modelConfig.id, registered);
    return registered;
  }

  /**
   * Get model configuration by ID
   */
  getModel(id?: string): ModelProfile | undefined {
    return (
      (id ? this.models.get(id) : undefined) ||
      this.models.get(this.activeModelId) ||
      this.models.get('yanderegirl')
    );
  }

  /**
   * Get all registered models
   */
  getAllModels(): ModelProfile[] {
    return Array.from(this.models.values());
  }

  /**
   * Set active model ID
   */
  setActiveModel(id: string): void {
    if (this.models.has(id)) {
      this.activeModelId = id;
    }
  }

  /**
   * Get capabilities profile of a model
   */
  getCapabilities(id?: string): ModelCapabilities {
    const model = this.getModel(id);
    return (
      model?.capabilities || {
        facialExpressions: true,
        eyeBlink: true,
        eyeTracking: true,
        mouthControl: true,
        headMovement: true,
        bodyMovement: true,
        breathing: true,
        physics: true
      }
    );
  }

  /**
   * Resolve a high-level semantic action to model-specific expression names,
   * motion groups, or parameter target combinations.
   */
  resolveSemanticAction(modelId: string, actionName: string): SemanticActionTarget {
    const model = this.getModel(modelId);
    if (!model) return { type: 'fallback', fallback: 'idle' };

    const normalizedAction = (actionName || 'idle').toLowerCase().trim();

    // 1. Check model's pre-configured semantic action map first
    if (model.semanticActions && model.semanticActions[normalizedAction]) {
      return model.semanticActions[normalizedAction];
    }

    // 2. Multi-lingual semantic synonym dictionary (ES, EN, CN Live2D expression keys)
    const SYNONYM_MAP: Record<string, string[]> = {
      love: ['爱心眼', 'love', 'amor', 'enamorada', 'corazon', 'corazón', 'teamo', 'red', 'yandere', 'shou'],
      happy: ['happy', 'feliz', 'alegre', 'contenta', 'smile', 'sonrisa', 'meiyan', 'red'],
      blush: ['脸红', 'blush', 'sonrojo', 'sonrojada', 'pena', 'vergüenza', 'verguenza', 'shy', 'tímida', 'timida', 'flustered', 'red', 'shou'],
      yandere: ['yandere', '脸黑', 'black', 'crazy', 'celosa', 'posesiva', 'obsesion', 'obsesión', 'dark', '血', 'mad'],
      crazy: ['crazy', 'loca', 'demente', 'yandere', 'black', '脸黑'],
      surprised: ['shock', '惊讶', '惊诧', 'surprised', 'sorprendida', 'asombrada', 'impactada', 'scared', 'asustada', '星星眼', '疑惑'],
      sad: ['流泪', '泪', 'sad', 'triste', 'pena', 'llorando', 'tears', 'crying'],
      angry: ['生气', 'mad', 'angry', 'enojada', 'molesta', 'pout', 'rabia'],
      wink: ['wink', 'guiño', 'guino', 'picarona', 'coqueta'],
      smug: ['←歪嘴', '歪嘴→', 'smug', 'presumida', 'mueca', '舌头', 'tongue'],
      gamer: ['手柄', 'gamer', 'juegos', 'videojuegos', 'jugar', 'partida'],
      streaming: ['直播套装', 'streaming', 'stream', 'en vivo'],
      thinking: ['疑惑', 'thinking', 'pensando', 'analizando', 'curiosa', 'duda'],
      relaxed: ['idle', 'relaxed', 'relajada', 'tranquila', 'paz', 'descanso'],
      excited: ['星星眼', 'excited', 'emocionada', 'stars', '直播套装', 'dance']
    };

    const synonyms = SYNONYM_MAP[normalizedAction] || [normalizedAction];
    const customExpressions: string[] =
      model.capabilities?.customExpressions || model.expressions || [];
    const blockedList: string[] = model.blockedExpressions || [];

    // 3. Dynamic fuzzy match against model's actual .exp3 expressions
    for (const syn of synonyms) {
      for (const exp of customExpressions) {
        if (blockedList.includes(exp)) continue;
        if (
          exp.toLowerCase() === syn ||
          exp.toLowerCase().includes(syn) ||
          syn.includes(exp.toLowerCase())
        ) {
          return { type: 'expression', name: exp };
        }
      }
    }

    // 4. Fallback standard parameter targets mapped to model's unique parameter IDs
    const rawMapping = model.standardMapping || {};
    const mapping: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawMapping)) {
      mapping[k] = typeof v === 'string' ? v : v.paramId;
    }

    const targets: Record<string, number> = {};

    if (normalizedAction === 'happy' || normalizedAction === 'smile') {
      if (mapping.eye_l_smile) targets[mapping.eye_l_smile] = 1.0;
      if (mapping.eye_r_smile) targets[mapping.eye_r_smile] = 1.0;
      if (mapping.mouth_form) targets[mapping.mouth_form] = 1.0;
      if (mapping.cheek_blush) targets[mapping.cheek_blush] = 0.6;
      if (mapping.brow_l_y) targets[mapping.brow_l_y] = 0.3;
      if (mapping.brow_r_y) targets[mapping.brow_r_y] = 0.3;
      if (mapping.brow_l_form) targets[mapping.brow_l_form] = 0.5;
      if (mapping.brow_r_form) targets[mapping.brow_r_form] = 0.5;
    } else if (normalizedAction === 'love') {
      if (mapping.eye_l_smile) targets[mapping.eye_l_smile] = 1.0;
      if (mapping.eye_r_smile) targets[mapping.eye_r_smile] = 1.0;
      if (mapping.mouth_form) targets[mapping.mouth_form] = 0.8;
      if (mapping.cheek_blush) targets[mapping.cheek_blush] = 1.0;
      if (mapping.eye_l_open) targets[mapping.eye_l_open] = 0.9;
      if (mapping.eye_r_open) targets[mapping.eye_r_open] = 0.9;
    } else if (normalizedAction === 'blush' || normalizedAction === 'shy') {
      if (mapping.cheek_blush) targets[mapping.cheek_blush] = 1.0;
      if (mapping.eye_l_smile) targets[mapping.eye_l_smile] = 0.8;
      if (mapping.eye_r_smile) targets[mapping.eye_r_smile] = 0.8;
      if (mapping.mouth_form) targets[mapping.mouth_form] = 0.5;
      if (mapping.eye_l_open) targets[mapping.eye_l_open] = 0.8;
      if (mapping.eye_r_open) targets[mapping.eye_r_open] = 0.8;
    } else if (normalizedAction === 'wink') {
      if (mapping.eye_r_open) targets[mapping.eye_r_open] = 0.0;
      if (mapping.eye_r_smile) targets[mapping.eye_r_smile] = 1.0;
      if (mapping.cheek_blush) targets[mapping.cheek_blush] = 0.5;
      if (mapping.mouth_form) targets[mapping.mouth_form] = 0.5;
    } else if (normalizedAction === 'sad') {
      if (mapping.brow_l_y) targets[mapping.brow_l_y] = -0.6;
      if (mapping.brow_r_y) targets[mapping.brow_r_y] = -0.6;
      if (mapping.mouth_form) targets[mapping.mouth_form] = -1.0;
      if (mapping.eye_l_open) targets[mapping.eye_l_open] = 0.7;
      if (mapping.eye_r_open) targets[mapping.eye_r_open] = 0.7;
    } else if (normalizedAction === 'angry' || normalizedAction === 'mad' || normalizedAction === 'pout') {
      if (mapping.brow_l_angle) targets[mapping.brow_l_angle] = -0.8;
      if (mapping.brow_r_angle) targets[mapping.brow_r_angle] = -0.8;
      if (mapping.mouth_form) targets[mapping.mouth_form] = -0.6;
      if (mapping.cheek_blush) targets[mapping.cheek_blush] = 0.4;
    } else if (normalizedAction === 'yandere' || normalizedAction === 'crazy') {
      if (mapping.mouth_form) targets[mapping.mouth_form] = -0.6;
      if (mapping.brow_l_angle) targets[mapping.brow_l_angle] = -0.5;
      if (mapping.brow_r_angle) targets[mapping.brow_r_angle] = -0.5;
      if (mapping.eye_l_smile) targets[mapping.eye_l_smile] = 0.3;
      if (mapping.eye_r_smile) targets[mapping.eye_r_smile] = 0.3;
      if (mapping.cheek_blush) targets[mapping.cheek_blush] = 0.7;
    } else if (normalizedAction === 'surprised' || normalizedAction === 'shock') {
      if (mapping.eye_l_open) targets[mapping.eye_l_open] = 1.0;
      if (mapping.eye_r_open) targets[mapping.eye_r_open] = 1.0;
      if (mapping.brow_l_y) targets[mapping.brow_l_y] = 0.7;
      if (mapping.brow_r_y) targets[mapping.brow_r_y] = 0.7;
      if (mapping.mouth_open_y) targets[mapping.mouth_open_y] = 0.3;
    } else if (normalizedAction === 'thinking') {
      if (mapping.brow_l_y) targets[mapping.brow_l_y] = 0.3;
      if (mapping.brow_r_y) targets[mapping.brow_r_y] = -0.2;
      if (mapping.mouth_form) targets[mapping.mouth_form] = 0.0;
    }

    if (Object.keys(targets).length > 0) {
      return { type: 'parameters', targets };
    }

    return { type: 'fallback', fallback: 'idle' };
  }

  /**
   * Introspect a loaded Live2DModel instance to auto-detect parameters and map capabilities
   */
  detectModelCapabilities(
    modelInstance: Live2DModelInstance | null,
    rawModel3Json: RawModel3Json | null = null
  ): DetectedCapabilities {
    const detected: DetectedCapabilities = {
      parameters: new Map<string, ParameterInfo>(),
      expressions: [],
      motions: [],
      hasPhysics: false,
      standardMapping: {}
    };

    if (!modelInstance?.internalModel) return detected;

    const coreModel = modelInstance.internalModel.coreModel;

    // Detect parameters from coreModel safely
    try {
      if (coreModel?._parameterIds && Array.isArray(coreModel._parameterIds)) {
        const ids = coreModel._parameterIds;
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const min = typeof coreModel.getParameterMinimumValue === 'function'
            ? coreModel.getParameterMinimumValue(i)
            : (coreModel._parameterMinimumValues ? coreModel._parameterMinimumValues[i] : -30);
          const max = typeof coreModel.getParameterMaximumValue === 'function'
            ? coreModel.getParameterMaximumValue(i)
            : (coreModel._parameterMaximumValues ? coreModel._parameterMaximumValues[i] : 30);
          const def = typeof coreModel.getParameterDefaultValue === 'function'
            ? coreModel.getParameterDefaultValue(i)
            : 0;
          detected.parameters.set(id, { id, min, max, default: def, index: i });
        }
      } else if (coreModel?._parameters?.ids) {
        const ids = coreModel._parameters.ids;
        const mins = coreModel._parameters.minimumValues || [];
        const maxs = coreModel._parameters.maximumValues || [];
        const defs = coreModel._parameters.defaultValues || [];
        for (let i = 0; i < ids.length; i++) {
          detected.parameters.set(ids[i], {
            id: ids[i],
            min: mins[i] ?? -1,
            max: maxs[i] ?? 1,
            default: defs[i] ?? 0,
            index: i
          });
        }
      } else if (typeof coreModel?.getParameterCount === 'function') {
        const count = coreModel.getParameterCount();
        for (let i = 0; i < count; i++) {
          const id = typeof coreModel.getParameterId === 'function'
            ? coreModel.getParameterId(i)
            : (coreModel._parameterIds ? coreModel._parameterIds[i] : `param_${i}`);
          const min = typeof coreModel.getParameterMinimumValue === 'function' ? coreModel.getParameterMinimumValue(i) : -30;
          const max = typeof coreModel.getParameterMaximumValue === 'function' ? coreModel.getParameterMaximumValue(i) : 30;
          const def = typeof coreModel.getParameterDefaultValue === 'function' ? coreModel.getParameterDefaultValue(i) : 0;
          detected.parameters.set(id, { id, min, max, default: def, index: i });
        }
      } else if (modelInstance.internalModel.parameters) {
        for (const [id, val] of Object.entries(modelInstance.internalModel.parameters)) {
          detected.parameters.set(id, { id, min: -30, max: 30, default: val || 0 });
        }
      }
    } catch (e) {
      console.warn('[Live2DModelRegistry] Parameter introspection notice:', e);
    }

    // Detect expressions from internal model or model3.json
    if (rawModel3Json?.FileReferences?.Expressions) {
      detected.expressions = rawModel3Json.FileReferences.Expressions.map((e) => e.Name);
    } else if (modelInstance.internalModel.motionManager?.expressionManager?.definitions) {
      detected.expressions = modelInstance.internalModel.motionManager.expressionManager.definitions.map(
        (d) => d.name
      );
    }

    // Build standard capability mapping automatically using standard naming heuristics
    const heuristicMap: Record<string, string[]> = {
      head_angle_x: ['ParamAngleX', 'PARAM_ANGLE_X', 'AngleX', 'HeadAngleX', 'PARAM_ANGLE_HEAD_X', 'ParamAngleHeadX', '角度 X'],
      head_angle_y: ['ParamAngleY', 'PARAM_ANGLE_Y', 'AngleY', 'HeadAngleY', 'PARAM_ANGLE_HEAD_Y', 'ParamAngleHeadY', '角度 Y'],
      head_angle_z: ['ParamAngleZ', 'PARAM_ANGLE_Z', 'AngleZ', 'HeadAngleZ', 'PARAM_ANGLE_HEAD_Z', 'ParamAngleHeadZ', '角度 Z'],
      body_angle_x: ['ParamBodyAngleX', 'PARAM_BODY_ANGLE_X', 'BodyAngleX', 'BodyX', 'PARAM_BODY_X', '身体旋转 X'],
      body_angle_y: ['ParamBodyAngleY', 'PARAM_BODY_ANGLE_Y', 'BodyAngleY', 'BodyY', 'PARAM_BODY_Y', '身体旋转 Y'],
      body_angle_z: ['ParamBodyAngleZ', 'PARAM_BODY_ANGLE_Z', 'BodyAngleZ', 'BodyZ', 'PARAM_BODY_Z', '身体旋转 Z'],
      eye_l_open: ['ParamEyeLOpen', 'PARAM_EYE_L_OPEN', 'EyeLOpen', 'ParamEyeOpen', '左眼 开闭'],
      eye_r_open: ['ParamEyeROpen', 'PARAM_EYE_R_OPEN', 'EyeROpen', 'ParamEyeOpen', '右眼 开闭'],
      eye_l_smile: ['ParamEyeLSmile', 'PARAM_EYE_L_SMILE', 'EyeLSmile', '左眼 微笑'],
      eye_r_smile: ['ParamEyeRSmile', 'PARAM_EYE_R_SMILE', 'EyeRSmile', '右眼 微笑'],
      eye_ball_x: ['ParamEyeBallX', 'PARAM_EYE_BALL_X', 'EyeBallX', 'ParamEyeX', '眼球 X'],
      eye_ball_y: ['ParamEyeBallY', 'PARAM_EYE_BALL_Y', 'EyeBallY', 'ParamEyeY', '眼球 Y'],
      brow_l_y: ['ParamBrowLY', 'PARAM_BROW_L_Y', 'BrowLY', '左眉 上下'],
      brow_r_y: ['ParamBrowRY', 'PARAM_BROW_R_Y', 'BrowRY', '右眉 上下'],
      brow_l_angle: ['ParamBrowLAngle', 'PARAM_BROW_L_ANGLE', 'BrowLAngle', '左眉 角度'],
      brow_r_angle: ['ParamBrowRAngle', 'PARAM_BROW_R_ANGLE', 'BrowRAngle', '右眉 角度'],
      brow_l_form: ['ParamBrowLForm', 'PARAM_BROW_L_FORM', 'BrowLForm', '左眉 变形'],
      brow_r_form: ['ParamBrowRForm', 'PARAM_BROW_R_FORM', 'BrowRForm', '右眉 变形'],
      mouth_open_y: ['ParamMouthOpenY', 'PARAM_MOUTH_OPEN_Y', 'MouthOpenY', 'MouthOpen', '嘴巴 张开'],
      mouth_form: ['ParamMouthForm', 'PARAM_MOUTH_FORM', 'MouthForm', '嘴巴 变形'],
      cheek_blush: ['ParamCheek', 'PARAM_CHEEK', 'Cheek', 'Blush', '脸颊 红晕'],
      breath: ['ParamBreath', 'PARAM_BREATH', 'Breath', '呼吸']
    };

    for (const [capability, candidateIds] of Object.entries(heuristicMap)) {
      for (const candidate of candidateIds) {
        if (detected.parameters.has(candidate)) {
          const paramInfo = detected.parameters.get(candidate)!;
          detected.standardMapping[capability] = {
            paramId: candidate,
            min: paramInfo.min,
            max: paramInfo.max,
            default: paramInfo.default
          };
          break;
        }
      }
    }

    return detected;
  }
}

export const live2dModelRegistry = new Live2DModelRegistry();
