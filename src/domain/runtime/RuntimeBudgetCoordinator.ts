/**
 * Single, passive source of truth for renderer resource pressure.
 *
 * It does not throttle a subsystem by itself. Consumers use its published
 * budget to make their own lifecycle decisions, which keeps audio transport
 * independent from rendering, vision, and detached Electron windows.
 */
export type RuntimeBudgetProfile = 'call-critical' | 'interactive' | 'idle' | 'background';

export interface RuntimeBudgetInput {
  callActive: boolean;
  audioPlaying: boolean;
  audioUnderruns: number;
  playoutScheduledAheadMs: number;
  visionActive: boolean;
  visionInferenceActive: boolean;
  live2dInteracting: boolean;
  settingsWindowOpen: boolean;
  rendererVisible: boolean;
}

export interface RuntimeBudget {
  profile: RuntimeBudgetProfile;
  reason: string;
  updatedAt: number;
  audio: { priority: 'critical'; maxVisualWorkPerSecond: number };
  vision: { recommendedFps: number; allowContinuousCapture: boolean };
  live2d: { recommendedFps: number; allowDecorativeAnimation: boolean };
}

const INITIAL_INPUT: RuntimeBudgetInput = {
  callActive: false,
  audioPlaying: false,
  audioUnderruns: 0,
  playoutScheduledAheadMs: 0,
  visionActive: false,
  visionInferenceActive: false,
  live2dInteracting: false,
  settingsWindowOpen: false,
  rendererVisible: true,
};

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function derive(input: RuntimeBudgetInput, updatedAt: number): RuntimeBudget {
  if (!input.rendererVisible) {
    return {
      profile: 'background', reason: 'renderer-hidden', updatedAt,
      audio: { priority: 'critical', maxVisualWorkPerSecond: 0 },
      vision: { recommendedFps: 0, allowContinuousCapture: false },
      live2d: { recommendedFps: 0, allowDecorativeAnimation: false },
    };
  }

  if (input.callActive && (input.audioPlaying || input.audioUnderruns > 0 || input.playoutScheduledAheadMs < 80)) {
    return {
      profile: 'call-critical', reason: input.audioUnderruns > 0 ? 'audio-underrun-risk' : 'live-audio-priority', updatedAt,
      audio: { priority: 'critical', maxVisualWorkPerSecond: 1 },
      vision: { recommendedFps: input.visionActive ? 0.5 : 0, allowContinuousCapture: false },
      live2d: { recommendedFps: 60, allowDecorativeAnimation: false },
    };
  }

  if (input.settingsWindowOpen) {
    return {
      profile: 'background', reason: 'settings-window-active', updatedAt,
      audio: { priority: 'critical', maxVisualWorkPerSecond: 1 },
      vision: { recommendedFps: input.visionActive ? 0.5 : 0, allowContinuousCapture: false },
      live2d: { recommendedFps: 8, allowDecorativeAnimation: false },
    };
  }

  if (input.live2dInteracting || input.visionInferenceActive) {
    return {
      profile: 'interactive', reason: input.visionInferenceActive ? 'vision-inference-active' : 'live2d-interaction', updatedAt,
      audio: { priority: 'critical', maxVisualWorkPerSecond: 4 },
      vision: { recommendedFps: input.visionActive ? 2 : 0, allowContinuousCapture: input.visionActive },
      live2d: { recommendedFps: input.visionInferenceActive ? 15 : 60, allowDecorativeAnimation: !input.callActive },
    };
  }

  return {
    profile: 'idle', reason: 'no-real-time-work', updatedAt,
    audio: { priority: 'critical', maxVisualWorkPerSecond: 2 },
    vision: { recommendedFps: input.visionActive ? 1 : 0, allowContinuousCapture: input.visionActive },
    live2d: { recommendedFps: 60, allowDecorativeAnimation: true },
  };
}

export class RuntimeBudgetCoordinator {
  private input: RuntimeBudgetInput = { ...INITIAL_INPUT };
  private budget: RuntimeBudget = derive(this.input, now());
  private listeners = new Set<(budget: RuntimeBudget) => void>();

  update(patch: Partial<RuntimeBudgetInput>): RuntimeBudget {
    this.input = { ...this.input, ...patch };
    const next = derive(this.input, now());
    const changed = next.profile !== this.budget.profile || next.reason !== this.budget.reason;
    this.budget = next;
    if (changed) for (const listener of this.listeners) listener(this.getBudget());
    return this.getBudget();
  }

  getBudget(): RuntimeBudget {
    return {
      ...this.budget,
      audio: { ...this.budget.audio },
      vision: { ...this.budget.vision },
      live2d: { ...this.budget.live2d },
    };
  }

  getInput(): RuntimeBudgetInput { return { ...this.input }; }

  onChange(listener: (budget: RuntimeBudget) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  exportSnapshot(): { exportedAt: number; input: RuntimeBudgetInput; budget: RuntimeBudget } {
    return { exportedAt: Date.now(), input: this.getInput(), budget: this.getBudget() };
  }
}

export const runtimeBudgetCoordinator = new RuntimeBudgetCoordinator();
