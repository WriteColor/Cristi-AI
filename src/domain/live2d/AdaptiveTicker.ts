/**
 * Cristi AI - Adaptive Kinematic Ticker
 * 
 * Intelligent FPS regulator:
 * - 60 FPS during direct user interaction, cursor movement, or voice playback.
 * - Adaptive drop to 30 FPS after 4.5 seconds of user/voice inactivity (~65% GPU saving).
 * - 0 FPS (complete stop) when the window is hidden, minimized, or in boss-key mode.
 */

import * as PIXI from 'pixi.js';

export type FpsMode = 'active_144' | 'active_60' | 'idle_30' | 'idle_8' | 'suspended_0';
export type AdaptiveTickerBudget = 'suspended' | 'idle' | 'active';
export type RuntimeBudgetMode = AdaptiveTickerBudget | 'background' | 'interactive' | 'call-critical';

export interface AdaptiveTickerOptions {
  /** Target FPS during active interactions (default: 60) */
  activeFps?: number;
  /** Target FPS during idle resting state (default: 15) */
  idleFps?: number;
  /** Inactivity duration before dropping from active to idle in ms (default: 4500) */
  inactivityThresholdMs?: number;
  /** Automatically hook DOM pointer/mouse events to detect activity (default: true) */
  autoListenDom?: boolean;
  /** DOM element to listen on (default: window) */
  targetElement?: HTMLElement | Window | null;
  /** Callback fired whenever the FPS regulation mode changes */
  onFpsModeChange?: (mode: FpsMode, targetFps: number) => void;
}

export class AdaptiveTicker {
  private activeFps: number;
  private idleFps: number;
  private inactivityThresholdMs: number;
  private autoListenDom: boolean;
  private targetElement: HTMLElement | Window | null;
  private onFpsModeChange?: (mode: FpsMode, targetFps: number) => void;

  private lastActivityTime: number = performance.now();
  private isInteracting: boolean = false;
  private isVoicePlaying: boolean = false;
  private isBossKey: boolean = false;
  private isWindowHidden: boolean = false;

  private currentBudget: AdaptiveTickerBudget = 'active';
  private forcedBudget: AdaptiveTickerBudget | null = null;
  private targetFps: number = 144;
  private currentMode: FpsMode = 'active_144';
  private currentFps: number = 144;
  private externalFpsCap: number | null = null;
  private pixiTicker: PIXI.Ticker | null = null;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;
  private domCleanupFns: Array<() => void> = [];

  constructor(
    tickerOrOptions?: AdaptiveTickerOptions | PIXI.Ticker | any,
    options?: AdaptiveTickerOptions
  ) {
    let opts: AdaptiveTickerOptions = {};
    if (tickerOrOptions) {
      if (
        typeof tickerOrOptions.start === 'function' ||
        typeof tickerOrOptions.stop === 'function' ||
        typeof tickerOrOptions.add === 'function'
      ) {
        this.pixiTicker = tickerOrOptions;
        opts = options || {};
      } else {
        opts = tickerOrOptions;
      }
    }

    this.activeFps = Math.max(1, opts.activeFps ?? 144);
    this.idleFps = Math.max(1, opts.idleFps ?? 15);
    this.inactivityThresholdMs = Math.max(1, opts.inactivityThresholdMs ?? 4500);
    this.autoListenDom = opts.autoListenDom ?? true;
    this.targetElement = opts.targetElement !== undefined ? opts.targetElement : (typeof window !== 'undefined' ? window : null);
    this.onFpsModeChange = opts.onFpsModeChange;

    this.currentFps = this.activeFps;
    this.targetFps = this.activeFps;
    this.currentMode = this.activeFps >= 120 ? 'active_144' : 'active_60';
    this.isWindowHidden = typeof document !== 'undefined' && document.hidden;

    if (this.pixiTicker) {
      this.evaluate();
    }

    if (this.autoListenDom && typeof window !== 'undefined') {
      this.attachDomListeners();
    }

    // Interval to check inactivity transitions
    this.startInactivityChecker();
  }

  /**
   * Attach a PIXI.Ticker instance to govern.
   */
  public attachTicker(ticker: PIXI.Ticker): void {
    this.pixiTicker = ticker;
    this.evaluate();
  }

  /**
   * Detach the PIXI.Ticker instance.
   */
  public detachTicker(): void {
    this.pixiTicker = null;
  }

  /**
   * Signal user activity to immediately restore 60 FPS.
   */
  public reportActivity(_source: string = 'user'): void {
    this.lastActivityTime = performance.now();
    if (this.forcedBudget === 'idle') {
      this.forcedBudget = null;
    }
    this.evaluate();
  }

  /**
   * Mark active user interaction (drag, pointer down, click).
   * Forces 60 FPS while active.
   */
  public setInteracting(interacting: boolean): void {
    if (this.isInteracting === interacting) return;
    this.isInteracting = interacting;
    if (interacting) {
      this.lastActivityTime = performance.now();
      if (this.forcedBudget === 'idle') {
        this.forcedBudget = null;
      }
    }
    this.evaluate();
  }

  /**
   * Mark voice synthesis or audio playback active.
   * Forces 60 FPS during speech.
   */
  public setVoicePlaying(playing: boolean): void {
    if (this.isVoicePlaying === playing) return;
    this.isVoicePlaying = playing;
    if (playing) {
      this.lastActivityTime = performance.now();
    }
    this.evaluate();
  }

  /**
   * Set boss-key mode state (true = 0 FPS immediately).
   */
  public setBossKey(bossKey: boolean): void {
    if (this.isBossKey === bossKey) return;
    this.isBossKey = bossKey;
    this.evaluate();
  }

  /**
   * Set window visibility state (hidden = true -> 0 FPS).
   */
  public setWindowHidden(hidden: boolean): void {
    if (this.isWindowHidden === hidden) return;
    this.isWindowHidden = hidden;
    this.evaluate();
  }

  /**
   * Get current operating mode.
   */
  /**
   * Set budget mode explicitly:
   * - 'suspended': 0 FPS (calls ticker.stop())
   * - 'idle': 15 FPS (throttles to 15 FPS)
   * - 'active': 60 FPS (ticker.start(), full 60 FPS)
   */
  public setBudget(budget: 'suspended' | 'idle' | 'active' | RuntimeBudgetMode): void {
    let normalized: AdaptiveTickerBudget;
    let targetFps: number;

    if (budget === 'suspended' || budget === 'background') {
      normalized = 'suspended';
      targetFps = 0;
    } else if (budget === 'idle') {
      normalized = 'idle';
      targetFps = this.idleFps;
    } else {
      normalized = 'active';
      targetFps = this.activeFps;
    }

    this.forcedBudget = normalized;
    this.currentBudget = normalized;
    this.targetFps = targetFps;
    this.currentFps = targetFps;

    this.applyToTicker();

    const mode: FpsMode = targetFps === 0 ? 'suspended_0' : targetFps <= 15 ? 'idle_8' : targetFps >= 120 ? 'active_144' : 'active_60';
    const changed = mode !== this.currentMode;
    this.currentMode = mode;
    if (changed) {
      this.onFpsModeChange?.(mode, targetFps);
    }
  }

  /**
   * Get current operating budget mode.
   */
  public getCurrentBudget(): AdaptiveTickerBudget {
    return this.currentBudget;
  }

  /**
   * Get target FPS based on active budget.
   */
  public getTargetFPS(): number {
    return this.targetFps;
  }

  /**
   * Get current operating mode.
   */
  public getMode(): FpsMode {
    return this.currentMode;
  }

  /**
   * Get current target FPS.
   */
  public getCurrentFps(): number {
    return this.currentFps;
  }

  /** A runtime budget may cap rendering without changing interaction state. */
  public setExternalFpsCap(fps: number | null): void {
    this.externalFpsCap = fps === null ? null : Math.max(0, fps);
    this.evaluate();
  }

  /**
   * Evaluate state transitions and apply target FPS.
   */
  public evaluate(): void {
    const now = performance.now();
    let nextMode: FpsMode;
    let nextFps: number;
    let nextBudget: AdaptiveTickerBudget;

    if (this.isBossKey || this.isWindowHidden) {
      nextMode = 'suspended_0';
      nextFps = 0;
      nextBudget = 'suspended';
    } else if (this.forcedBudget !== null) {
      nextBudget = this.forcedBudget;
      if (this.forcedBudget === 'suspended') {
        nextFps = 0;
        nextMode = 'suspended_0';
      } else if (this.forcedBudget === 'idle') {
        if (now - this.lastActivityTime >= 30000) {
          nextMode = 'idle_8';
          nextFps = 8;
        } else {
          nextFps = this.idleFps;
          nextMode = nextFps <= 15 ? 'idle_8' : 'idle_30';
        }
      } else {
        nextFps = this.activeFps;
        nextMode = nextFps >= 120 ? 'active_144' : 'active_60';
      }
    } else if (
      this.isInteracting ||
      this.isVoicePlaying ||
      now - this.lastActivityTime < this.inactivityThresholdMs
    ) {
      nextMode = this.activeFps >= 120 ? 'active_144' : 'active_60';
      nextFps = this.activeFps;
      nextBudget = 'active';
    } else if (now - this.lastActivityTime >= 30000) {
      nextMode = 'idle_8';
      nextFps = 8;
      nextBudget = 'idle';
    } else {
      nextFps = this.idleFps;
      nextMode = nextFps <= 15 ? 'idle_8' : 'idle_30';
      nextBudget = 'idle';
    }

    if (this.externalFpsCap !== null) {
      nextFps = Math.min(nextFps, this.externalFpsCap);
      if (nextFps === 0) {
        nextMode = 'suspended_0';
        nextBudget = 'suspended';
      }
    }

    const changed = nextMode !== this.currentMode || nextFps !== this.currentFps;
    this.currentMode = nextMode;
    this.currentFps = nextFps;
    this.targetFps = nextFps;
    this.currentBudget = nextBudget;

    this.applyToTicker();

    if (changed) {
      this.onFpsModeChange?.(this.currentMode, this.currentFps);
    }
  }

  /**
   * Synchronize FPS setting to underlying PIXI Ticker.
   */
  private applyToTicker(): void {
    if (!this.pixiTicker) return;

    if (this.currentFps === 0 || this.targetFps === 0) {
      try {
        this.pixiTicker.stop();
      } catch (_) {}
    } else {
      try {
        this.pixiTicker.maxFPS = this.currentFps;
      } catch (_) {}
      try {
        this.pixiTicker.start();
      } catch (_) {}
    }
  }

  /**
   * Setup auto listeners for mouse/touch movements and window visibility.
   */
  private attachDomListeners(): void {
    const target = this.targetElement || (typeof window !== 'undefined' ? window : null);
    if (!target) return;

    const isWindowTarget =
      target === window ||
      (typeof window !== 'undefined' && target === (window as unknown as HTMLElement));

    let lastMoveReport = 0;
    const onMove = () => {
      const now = performance.now();
      // Throttle pointer activity reports to at most once per 100ms
      if (now - lastMoveReport > 100) {
        lastMoveReport = now;
        this.reportActivity('mousemove');
      }
    };

    const onPointerDown = () => {
      this.reportActivity('pointerdown');
    };

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined') {
        this.setWindowHidden(document.hidden);
      }
    };

    const onBlur = () => {
      // Background idle reduction when app loses focus
      this.evaluate();
    };

    const onFocus = () => {
      this.reportActivity('focus');
    };

    if (!isWindowTarget) {
      target.addEventListener('mousemove', onMove as EventListener, { passive: true });
      target.addEventListener('pointermove', onMove as EventListener, { passive: true });
    }
    target.addEventListener('pointerdown', onPointerDown as EventListener, { passive: true });
    target.addEventListener('touchstart', onPointerDown as EventListener, { passive: true });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
    }

    this.domCleanupFns.push(() => {
      if (!isWindowTarget) {
        target.removeEventListener('mousemove', onMove as EventListener);
        target.removeEventListener('pointermove', onMove as EventListener);
      }
      target.removeEventListener('pointerdown', onPointerDown as EventListener);
      target.removeEventListener('touchstart', onPointerDown as EventListener);

      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
      }
    });
  }

  /**
   * Periodic checker for idle threshold transition.
   */
  private startInactivityChecker(): void {
    if (this.checkIntervalId) return;

    this.checkIntervalId = setInterval(() => {
      // Only evaluate if not suspended, and neither interacting nor voice playing
      if (this.forcedBudget !== 'suspended' && this.currentMode !== 'suspended_0' && !this.isInteracting && !this.isVoicePlaying) {
        const now = performance.now();
        if (now - this.lastActivityTime >= this.inactivityThresholdMs) {
          this.evaluate();
        }
      }
    }, 500);

    if (typeof this.checkIntervalId === 'object' && typeof (this.checkIntervalId as any)?.unref === 'function') {
      (this.checkIntervalId as any).unref();
    }
  }

  /**
   * Dispose ticker regulator and cleanup all listeners.
   */
  public destroy(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }

    for (const cleanup of this.domCleanupFns) {
      try {
        cleanup();
      } catch (_) {}
    }
    this.domCleanupFns = [];

    this.pixiTicker = null;
  }
}
