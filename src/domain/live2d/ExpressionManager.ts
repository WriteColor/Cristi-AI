/**
 * Cristi Desktop - Live2D Expression & Blendshape Manager 2.0
 * Provides robust facial expression transitions, blocked expression filtering (e.g. artist credits),
 * smooth Bezier target blending, and fallback parameter mappings for models without .exp3.json.
 */

import { live2dModelRegistry } from './Live2DModelRegistry';
import type { Live2DAdapter } from './Live2DAdapter';
import { logger } from '../../infrastructure/logging/logger';

export class ExpressionManager {
  public adapter: Live2DAdapter | null;
  public modelId: string;
  public currentExpression: string = 'none';
  public lockedParams: Set<string> = new Set();
  public lockExpiry: number = 0;

  constructor(adapter: Live2DAdapter | null = null, modelId: string = 'yanderegirl') {
    this.adapter = adapter;
    this.modelId = modelId;
  }

  setModel(modelId: string, adapter?: Live2DAdapter | null): void {
    this.modelId = modelId;
    if (adapter) this.adapter = adapter;
    this.currentExpression = 'none';
    this.lockedParams.clear();
    this.lockExpiry = 0;
  }

  setAdapter(adapter: Live2DAdapter | null): void {
    this.adapter = adapter;
  }

  /**
   * Check if expression is blocked (e.g. watermark overlay)
   */
  isBlocked(expName: string): boolean {
    const profile = live2dModelRegistry.getModel(this.modelId);
    return profile?.blockedExpressions?.includes(expName) ?? false;
  }

  /**
   * Set facial expression with semantic action resolution & fallback
   */
  setExpression(expressionName: string, blendDurationMs: number = 400): void {
    if (!expressionName || expressionName.toLowerCase() === 'idle' || expressionName.toLowerCase() === 'none') {
      this.resetExpression();
      return;
    }

    if (this.isBlocked(expressionName)) {
      logger.info('AVATAR', `[ExpressionManager] Expresión "${expressionName}" bloqueada por perfil de seguridad.`);
      return;
    }

    const resolved = live2dModelRegistry.resolveSemanticAction(this.modelId, expressionName);

    if (resolved.type === 'expression' && resolved.name) {
      if (this.adapter) {
        this.adapter.setExpression(resolved.name);
      }
      this.currentExpression = resolved.name;
      this.lockedParams.clear();
      this.lockExpiry = 0;
    } else if (resolved.type === 'parameters' && resolved.targets) {
      this.lockedParams = new Set(Object.keys(resolved.targets));
      this.lockExpiry = performance.now() + 8000;
      if (this.adapter) {
        for (const [paramId, val] of Object.entries(resolved.targets)) {
          this.adapter.setBezierTarget(paramId, val, blendDurationMs);
        }
      }
      this.currentExpression = expressionName;
    }
  }

  /**
   * Reset to neutral baseline
   */
  resetExpression(): void {
    this.currentExpression = 'none';
    this.lockedParams.clear();
    this.lockExpiry = 0;
    if (this.adapter) {
      this.adapter.resetNeutralState();
    }
  }

  /**
   * Periodic tick check for expression lock expiration
   */
  update(): void {
    if (this.lockExpiry > 0 && performance.now() > this.lockExpiry) {
      this.lockedParams.clear();
      this.lockExpiry = 0;
    }
  }

  destroy(): void {
    this.lockedParams.clear();
    this.adapter = null;
  }
}
