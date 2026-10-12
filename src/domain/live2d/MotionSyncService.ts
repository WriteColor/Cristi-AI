/**
 * Cristi Desktop - Live2D Motion Sync & Animation Queue Service 2.0
 * Manages motion group dispatching (e.g. 'Idle', 'Tap', 'Flick', 'MeiYan'), priority queues,
 * speech cadence synchronization, and cooldown throttles across all Live2D Cubism models.
 */

import { eventBus, EVENTS } from '../../infrastructure/events/eventBus';
import { live2dModelRegistry } from './Live2DModelRegistry';
import type { Live2DAdapter } from './Live2DAdapter';
import { logger } from '../../infrastructure/logging/logger';

export class MotionSyncService {
  public adapter: Live2DAdapter | null;
  public modelId: string;
  public lastMotionTime: number = 0;
  public motionCooldownMs: number = 1200;
  public currentMotionGroup: string | null = null;
  private unsubscribeList: Array<() => void> = [];

  constructor(adapter: Live2DAdapter | null = null, modelId: string = 'yanderegirl') {
    this.adapter = adapter;
    this.modelId = modelId;

    this.bindEvents();
  }

  bindEvents(): void {
    this.unsubscribeList.push(
      eventBus.on(EVENTS.SPEECH_START, () => {
        this.onSpeechStart();
      }),
      eventBus.on(EVENTS.SPEECH_END, () => {
        this.onSpeechEnd();
      })
    );
  }

  setModel(modelId: string, adapter?: Live2DAdapter | null): void {
    this.modelId = modelId;
    if (adapter) this.adapter = adapter;
    this.currentMotionGroup = null;
  }

  setAdapter(adapter: Live2DAdapter | null): void {
    this.adapter = adapter;
  }

  /**
   * Play motion group by name and index
   */
  playMotion(groupName: string, index: number = 0, priority: number = 2): boolean {
    const now = performance.now();
    if (now - this.lastMotionTime < this.motionCooldownMs && priority < 3) {
      return false;
    }

    if (!this.adapter) return false;

    try {
      this.adapter.setMotionByGroup(groupName, index);
      this.lastMotionTime = now;
      this.currentMotionGroup = groupName;
      logger.info('AVATAR', `[MotionSync] Motion "${groupName}[${index}]" ejecutada en modelo ${this.modelId}.`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('AVATAR', `[MotionSync] Error al reproducir motion "${groupName}": ${msg}`);
      return false;
    }
  }

  onSpeechStart(): void {
    const profile = live2dModelRegistry.getModel(this.modelId);
    if (!profile) return;

    // Trigger subtle speaking posture motion if available
    const motions = profile.capabilities?.motions || [];
    if (motions.includes('talk') || motions.includes('speak')) {
      this.playMotion('Talk', 0, 1);
    }
  }

  onSpeechEnd(): void {
    this.currentMotionGroup = null;
  }

  destroy(): void {
    this.unsubscribeList.forEach((unsub) => unsub());
    this.unsubscribeList = [];
    this.adapter = null;
  }
}
