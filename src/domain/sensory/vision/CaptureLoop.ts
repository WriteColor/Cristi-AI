/**
 * Cristi AI - CaptureLoop (TypeScript)
 * One paced capture at a time, including across asynchronous stop/start races.
 */

export interface CaptureLoopOptions {
  capture: () => Promise<string | null> | string | null;
  onFrame: (frame: string) => void;
  shouldCapture?: () => boolean;
  onError?: (error: Error) => void;
}

export class CaptureLoop {
  private capture: () => Promise<string | null> | string | null;
  private onFrame: (frame: string) => void;
  private shouldCapture: () => boolean;
  private onError: (error: Error) => void;

  public active = false;
  public generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  public inFlight = false;
  public immediate = false;
  public intervalMs = 2000;

  constructor(options: CaptureLoopOptions) {
    this.capture = options.capture;
    this.onFrame = options.onFrame;
    this.shouldCapture = options.shouldCapture ?? (() => true);
    this.onError = options.onError ?? (() => {});
  }

  public start(intervalMs: number, initialDelay = 120): void {
    this.stop();
    this.active = true;
    this.intervalMs = intervalMs;
    this.schedule(initialDelay);
  }

  public schedule(delay: number): void {
    if (!this.active) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delay);
  }

  public requestImmediate(): void {
    if (!this.active) return;
    if (this.inFlight) {
      this.immediate = true;
    } else {
      this.schedule(120);
    }
  }

  public async tick(): Promise<void> {
    if (!this.active || this.inFlight) return;
    const generation = this.generation;
    this.inFlight = true;
    try {
      if (this.shouldCapture()) {
        const frame = await this.capture();
        if (frame && this.active && generation === this.generation && this.shouldCapture()) {
          this.onFrame(frame);
        }
      }
    } catch (error) {
      if (this.active && generation === this.generation) {
        this.onError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.inFlight = false;
      if (this.active && this.timer === null) {
        this.schedule(this.immediate || generation !== this.generation ? 120 : this.intervalMs);
      }
      this.immediate = false;
    }
  }

  public stop(): void {
    this.active = false;
    this.generation++;
    this.immediate = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export default CaptureLoop;
