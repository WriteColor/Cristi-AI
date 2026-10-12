/**
 * Cristi AI - Live2D Universal Adapter
 * Bridges semantic animation commands (head, body, eyes, brows, mouth, blush, breathing)
 * to model-specific parameter adjustments with smooth physical lerp interpolation.
 *
 * v2.1 — Added blockedExpressions support, setMotionByGroup(), and expression fallback.
 */

import type {
  Live2DModelInstance,
  ModelProfile,
  StandardMappingEntry,
  BezierTransition
} from './types';

export class Live2DAdapter {
  public model: Live2DModelInstance | null;
  public mapping: Record<string, StandardMappingEntry> = {};
  public profile: ModelProfile | null;

  // Current smoothed parameter values and Target values
  public currentValues: Map<string, number> = new Map();
  public targetValues: Map<string, number> = new Map();

  // Active Bezier transitions: paramId -> BezierTransition
  public bezierTransitions: Map<string, BezierTransition> = new Map();

  // Expression state
  public currentExpression: string = 'none';

  // Lerp speeds for different types of parameters
  public readonly speeds = {
    head: 0.20,
    body: 0.14,
    eyes: 0.38,
    eyeballs: 0.24,
    brows: 0.22,
    mouth: 0.50,
    breath: 0.16,
    physics: 0.35,
    custom: 0.22
  };

  constructor(
    modelInstance: Live2DModelInstance | null = null,
    capabilityMapping: Record<string, string | StandardMappingEntry> = {},
    modelProfile: ModelProfile | null = null
  ) {
    this.model = modelInstance;
    this.profile = modelProfile;

    this.setMapping(capabilityMapping, modelProfile);
  }

  /**
   * Introspects model core and fills missing standard mappings automatically
   */
  autoDiscoverParameters(): void {
    if (!this.model?.internalModel?.coreModel) return;
    const coreModel = this.model.internalModel.coreModel;
    const paramIds = Array.isArray(coreModel._parameterIds) ? coreModel._parameterIds : [];

    const standardPatterns: Record<string, RegExp> = {
      head_angle_x: /angle.*x|head.*x/i,
      head_angle_y: /angle.*y|head.*y/i,
      head_angle_z: /angle.*z|head.*z/i,
      body_angle_x: /body.*x/i,
      body_angle_y: /body.*y/i,
      body_angle_z: /body.*z/i,
      eye_l_open: /eye.*l.*open/i,
      eye_r_open: /eye.*r.*open/i,
      eye_l_smile: /eye.*l.*smile/i,
      eye_r_smile: /eye.*r.*smile/i,
      eye_ball_x: /eye.*ball.*x/i,
      eye_ball_y: /eye.*ball.*y/i,
      brow_l_y: /brow.*l.*y/i,
      brow_r_y: /brow.*r.*y/i,
      brow_l_angle: /brow.*l.*angle/i,
      brow_r_angle: /brow.*r.*angle/i,
      mouth_open_y: /mouth.*open/i,
      mouth_form: /mouth.*form/i,
      cheek_blush: /cheek|blush/i,
      breath: /breath/i
    };

    for (const [cap, regex] of Object.entries(standardPatterns)) {
      if (!this.mapping[cap]) {
        const found = paramIds.find((p) => regex.test(p));
        if (found) {
          const def = 0;
          let min = -30;
          let max = 30;
          if (/eye|mouth|cheek|breath/i.test(cap)) {
            min = (/eye_ball|mouth_form|brow/i.test(cap)) ? -1 : 0;
            max = 1;
          }
          this.mapping[cap] = { paramId: found, min, max, default: def };
        }
      }
    }
  }

  /**
   * Smoothly transitions a parameter to target value using Cubic Bezier ease-in-out
   */
  setBezierTarget(paramId: string, targetValue: number, durationMs: number = 400): void {
    if (!paramId) return;
    const current = this.currentValues.get(paramId) ?? 0;
    this.bezierTransitions.set(paramId, {
      startVal: current,
      targetVal: targetValue,
      startTime: performance.now(),
      durationMs: Math.max(durationMs, 50)
    });
    this.targetValues.set(paramId, targetValue);
  }

  /**
   * Update the capability mapping for this adapter
   */
  setMapping(
    mapping: Record<string, string | StandardMappingEntry> | null,
    profile: ModelProfile | null = null
  ): void {
    this.mapping = {};
    if (mapping) {
      for (const [cap, entry] of Object.entries(mapping)) {
        if (typeof entry === 'string') {
          const def = 0;
          let min = -30;
          let max = 30;
          if (cap.includes('eye_ball') || cap.includes('eye_l_open') || cap.includes('eye_r_open') || cap.includes('eye_l_smile') || cap.includes('eye_r_smile') || cap.includes('mouth') || cap.includes('cheek') || cap.includes('breath')) {
            min = (cap.includes('eye_ball') || cap.includes('mouth_form') || cap.includes('brow')) ? -1 : 0;
            max = 1;
          }
          this.mapping[cap] = { paramId: entry, min, max, default: def };
        } else if (typeof entry === 'object' && entry !== null) {
          this.mapping[cap] = entry;
        }
      }
    }
    if (profile) this.profile = profile;
    this.autoDiscoverParameters();
  }

  /**
   * Set target value for a standard capability
   */
  setCapabilityTarget(capability: string, value: number): void {
    const mapEntry = this.mapping[capability];
    if (!mapEntry) return;

    const paramId = typeof mapEntry === 'string' ? mapEntry : mapEntry.paramId;
    const min = typeof mapEntry === 'object' && mapEntry.min !== undefined ? mapEntry.min : -30;
    const max = typeof mapEntry === 'object' && mapEntry.max !== undefined ? mapEntry.max : 30;
    const def = typeof mapEntry === 'object' && mapEntry.default !== undefined ? mapEntry.default : 0;

    const clamped = Math.min(Math.max(value, min), max);
    this.targetValues.set(paramId, clamped);

    if (!this.currentValues.has(paramId)) {
      this.currentValues.set(paramId, def);
    }
  }

  /**
   * Set target for a direct parameter ID (including custom parameters)
   */
  setDirectParamTarget(paramId: string, value: number): void {
    if (!paramId) return;
    this.targetValues.set(paramId, value);
    if (!this.currentValues.has(paramId)) {
      this.currentValues.set(paramId, 0);
    }
  }

  // ── High-Level Semantic Controls ──────────────────────────────────────────

  setHeadAngle(x: number = 0, y: number = 0, z: number = 0): void {
    this.setCapabilityTarget('head_angle_x', x);
    this.setCapabilityTarget('head_angle_y', y);
    this.setCapabilityTarget('head_angle_z', z);
  }

  setBodyAngle(x: number = 0, y: number = 0, z: number = 0): void {
    this.setCapabilityTarget('body_angle_x', x);
    this.setCapabilityTarget('body_angle_y', y);
    this.setCapabilityTarget('body_angle_z', z);
  }

  setEyes(
    lOpen: number = 1,
    rOpen: number = 1,
    lSmile: number = 0,
    rSmile: number = 0,
    ballX: number = 0,
    ballY: number = 0
  ): void {
    this.setCapabilityTarget('eye_l_open', lOpen);
    this.setCapabilityTarget('eye_r_open', rOpen);
    this.setCapabilityTarget('eye_l_smile', lSmile);
    this.setCapabilityTarget('eye_r_smile', rSmile);
    this.setCapabilityTarget('eye_ball_x', ballX);
    this.setCapabilityTarget('eye_ball_y', ballY);
  }

  setEyebrows(
    lY: number = 0,
    rY: number = 0,
    lAngle: number = 0,
    rAngle: number = 0,
    lForm: number = 0,
    rForm: number = 0
  ): void {
    this.setCapabilityTarget('brow_l_y', lY);
    this.setCapabilityTarget('brow_r_y', rY);
    this.setCapabilityTarget('brow_l_angle', lAngle);
    this.setCapabilityTarget('brow_r_angle', rAngle);
    this.setCapabilityTarget('brow_l_form', lForm);
    this.setCapabilityTarget('brow_r_form', rForm);
  }

  setMouth(openY: number = 0, form: number = 0): void {
    this.setCapabilityTarget('mouth_open_y', openY);
    this.setCapabilityTarget('mouth_form', form);
    if (openY === 0 && form === 0) {
      this.snapMouthClosed();
    }
  }

  /**
   * Immediately snaps mouth parameters to 0, clearing any residual lerp interpolation
   * or smoothing buffer so lips never drift or oscillate after speech ends.
   */
  snapMouthClosed(): void {
    const mouthOpenEntry = this.mapping['mouth_open_y'];
    const mouthFormEntry = this.mapping['mouth_form'];

    const mouthOpenId = typeof mouthOpenEntry === 'string' ? mouthOpenEntry : mouthOpenEntry?.paramId;
    const mouthFormId = typeof mouthFormEntry === 'string' ? mouthFormEntry : mouthFormEntry?.paramId;

    if (mouthOpenId) {
      this.targetValues.set(mouthOpenId, 0);
      this.currentValues.set(mouthOpenId, 0);
      this.bezierTransitions.delete(mouthOpenId);
      try {
        const coreModel = this.model?.internalModel?.coreModel;
        if (typeof coreModel?.setParameterValueById === 'function') {
          coreModel.setParameterValueById(mouthOpenId, 0);
        } else if (typeof this.model?.internalModel?.setParamFloat === 'function') {
          this.model.internalModel.setParamFloat(mouthOpenId, 0);
        }
      } catch (_) {}
    }

    if (mouthFormId) {
      this.targetValues.set(mouthFormId, 0);
      this.currentValues.set(mouthFormId, 0);
      this.bezierTransitions.delete(mouthFormId);
      try {
        const coreModel = this.model?.internalModel?.coreModel;
        if (typeof coreModel?.setParameterValueById === 'function') {
          coreModel.setParameterValueById(mouthFormId, 0);
        } else if (typeof this.model?.internalModel?.setParamFloat === 'function') {
          this.model.internalModel.setParamFloat(mouthFormId, 0);
        }
      } catch (_) {}
    }
  }

  setCheeks(blush: number = 0): void {
    this.setCapabilityTarget('cheek_blush', blush);
  }

  setBreath(value: number = 0): void {
    this.setCapabilityTarget('breath', value);
  }

  /**
   * Check if an expression is blocked by this model's profile
   * (e.g., artist credit overlays like Ellen's 'shuiyin')
   */
  isExpressionBlocked(expressionName: string): boolean {
    const blocked = this.profile?.blockedExpressions;
    if (!blocked || !Array.isArray(blocked)) return false;
    return blocked.includes(expressionName);
  }

  /**
   * Set expression on the Live2D model.
   * Checks blockedExpressions first, then falls back to parameter targets if no expressionManager.
   */
  setExpression(expressionName: string): void {
    // Guard: refuse to activate blocked expressions (e.g., artist credit overlays)
    if (expressionName && expressionName !== 'none' && expressionName !== 'idle') {
      if (this.isExpressionBlocked(expressionName)) {
        console.info(`[Live2DAdapter] Expression "${expressionName}" is blocked (artist credit overlay). Skipping.`);
        return;
      }
    }

    if (!this.model?.internalModel?.motionManager) return;

    try {
      const expManager = this.model.internalModel.motionManager.expressionManager;

      if (!expressionName || expressionName.toLowerCase() === 'idle' || expressionName.toLowerCase() === 'none') {
        // Reset: clear expression manager and reset parameter targets
        if (expManager && typeof expManager.resetExpression === 'function') {
          expManager.resetExpression();
        }
        this.currentExpression = 'none';
        return;
      }

      if (expManager && expManager.definitions && expManager.definitions.length > 0) {
        // Cubism expressionManager exists — use it directly
        if (typeof this.model.expression === 'function') {
          this.model.expression(expressionName);
        }
        this.currentExpression = expressionName;
      } else {
        // No expressionManager loaded — fallback: check semanticActions parameter targets
        const action = this.profile?.semanticActions?.[expressionName];
        if (action?.type === 'parameters' && action.targets) {
          for (const [paramId, val] of Object.entries(action.targets)) {
            this.setDirectParamTarget(paramId, val);
          }
          this.currentExpression = expressionName;
        } else {
          console.warn(`[Live2DAdapter] No expressionManager and no parameter fallback for "${expressionName}"`);
        }
      }
    } catch (e) {
      console.warn(`[Live2DAdapter] Failed to set expression "${expressionName}":`, e);
    }
  }

  /**
   * Trigger a motion by group name and index using the Live2D model's motion API.
   */
  setMotionByGroup(groupName: string, index: number = 0): void {
    if (!this.model) return;
    try {
      if (typeof this.model.motion === 'function') {
        this.model.motion(groupName, index);
      }
    } catch (e) {
      console.warn(`[Live2DAdapter] Failed to trigger motion "${groupName}[${index}]":`, e);
    }
  }

  /**
   * Reset all parameter targets back to their neutral / resting values
   */
  resetNeutralState(): void {
    this.setExpression('none');
    this.setCheeks(0);
    this.setEyebrows(0, 0, 0, 0, 0, 0);
    this.setEyes(1.0, 1.0, 0, 0, 0, 0);
    this.setMouth(0, 0);
  }

  /**
   * Called every animation frame to apply smoothed target parameters to the underlying model
   */
  update(deltaTime: number = 1.0): void {
    if (!this.model?.internalModel?.coreModel) return;

    const coreModel = this.model.internalModel.coreModel;

    // Enforce profile hidden parts (e.g. Part17, Part78, Part8 watermark layers in Ellen)
    if (this.profile?.hiddenParts && Array.isArray(this.profile.hiddenParts) && coreModel._partIds) {
      for (const partId of this.profile.hiddenParts) {
        const idx = coreModel._partIds.indexOf(partId);
        if (idx !== -1) {
          if (typeof coreModel.setPartOpacityByIndex === 'function') {
            coreModel.setPartOpacityByIndex(idx, 0);
          }
          if (coreModel._partOpacities) {
            coreModel._partOpacities[idx] = 0;
          }
        }
      }
    }

    // Enforce profile locked parameters (e.g. Paramheadxy = 0, ParambodyXY2 = 0)
    if (this.profile?.lockedParameters && typeof this.profile.lockedParameters === 'object') {
      for (const [lockParam, lockVal] of Object.entries(this.profile.lockedParameters)) {
        if (typeof coreModel.setParameterValueById === 'function') {
          coreModel.setParameterValueById(lockParam, lockVal);
        }
      }
    }

    const now = performance.now();

    for (const [paramId, targetVal] of this.targetValues.entries()) {
      const currentVal = this.currentValues.get(paramId) || 0;
      let nextVal: number;

      // 1. Check if an active Cubic Bezier transition is running for this parameter
      const bezier = this.bezierTransitions.get(paramId);
      if (bezier) {
        const elapsed = now - bezier.startTime;
        const t = Math.min(Math.max(elapsed / bezier.durationMs, 0), 1);
        
        // Cubic Bezier easeInOut: 3t^2 - 2t^3
        const ease = t * t * (3 - 2 * t);
        nextVal = bezier.startVal + (bezier.targetVal - bezier.startVal) * ease;

        if (t >= 1) {
          this.bezierTransitions.delete(paramId);
          nextVal = bezier.targetVal;
        }
      } else {
        // 2. Exponential Lerp - frame-rate normalized for 60Hz-240Hz
        let speed = this.speeds.custom;
        const lower = paramId.toLowerCase();
        if (lower.includes('mouth')) speed = this.speeds.mouth;
        else if (lower.includes('eyeopen') || lower.includes('eyesmile')) speed = this.speeds.eyes;
        else if (lower.includes('eyeball')) speed = this.speeds.eyeballs;
        else if (lower.includes('angle') && !lower.includes('body')) speed = this.speeds.head;
        else if (lower.includes('body')) speed = this.speeds.body;
        else if (lower.includes('brow')) speed = this.speeds.brows;
        else if (lower.includes('breath')) speed = this.speeds.breath;
        else if (lower.includes('hair') || lower.includes('cloth') || lower.includes('ribbon') || lower.includes('tail')) speed = this.speeds.physics;

        const dtSec = Math.max(0, (deltaTime * 16.6667) / 1000);
        const factor = 1.0 - Math.exp(-speed * 90.0 * dtSec);
        nextVal = currentVal + (targetVal - currentVal) * factor;
      }

      this.currentValues.set(paramId, nextVal);

      // Direct write to Cubism CoreModel safely
      try {
        if (typeof coreModel.setParameterValueById === 'function') {
          coreModel.setParameterValueById(paramId, nextVal);
        } else if (typeof this.model.internalModel?.setParamFloat === 'function') {
          this.model.internalModel.setParamFloat(paramId, nextVal);
        }
      } catch (_) {}
    }
  }

  /**
   * Release references and clear transition maps
   */
  destroy(): void {
    this.currentValues.clear();
    this.targetValues.clear();
    this.bezierTransitions.clear();
    this.model = null;
    this.mapping = {};
    this.profile = null;
  }
}
