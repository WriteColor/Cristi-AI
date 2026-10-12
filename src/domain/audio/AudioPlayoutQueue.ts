export type PlayoutState = 'IDLE' | 'PREFILL' | 'PLAYING' | 'DRAINING' | 'INTERRUPTED';

export class AudioPlayoutQueue {
  state: PlayoutState = 'IDLE';
  generation = 0;
  generationComplete = false;
  turnComplete = false;
  jitterMs = 0;
  underruns = 0;
  scheduledAheadMs = 0;
  bufferedDurationMs = 0;
  totalReceivedDurationMs = 0;
  private lastArrival: number | null = null;
  private lastDuration = 0;
  private meanArrivalInterval = 0;

  get targetMs(): number {
    // A 60 ms initial reservoir keeps short native-audio packets continuous
    // under renderer scheduling jitter while remaining conversationally fast.
    return Math.max(60, Math.min(180, 60 + this.jitterMs * 2));
  }

  /**
   * Starts a new generation/turn reservoir, un-wedging from INTERRUPTED or IDLE state.
   */
  begin(): number {
    this.generation++;
    this.generationComplete = this.turnComplete = false;
    this.state = 'PREFILL';
    this.lastArrival = null;
    this.scheduledAheadMs = 0;
    this.bufferedDurationMs = 0;
    this.totalReceivedDurationMs = 0;
    this.meanArrivalInterval = 0;

    // Retain some network history without carrying stale spikes forever.
    this.jitterMs *= 0.5;

    return this.generation;
  }

  receive(nowMs: number, durationMs: number): void {
    if (this.lastArrival !== null) {
      const arrivalInterval = Math.max(0, nowMs - this.lastArrival);
      if (this.meanArrivalInterval === 0) {
        this.meanArrivalInterval = arrivalInterval;
      } else {
        this.meanArrivalInterval += (arrivalInterval - this.meanArrivalInterval) / 16;
      }

      // Fast production bursts (arrivalInterval < lastDuration) indicate the server
      // is generating audio faster than real time. This is advantageous accumulation
      // and must NOT be penalized as network jitter.
      // Jitter is strictly the variance in network arrival cadence or real starvation risk.
      const intervalVariance = Math.abs(arrivalInterval - this.meanArrivalInterval);
      const starvationGap = Math.max(0, arrivalInterval - this.lastDuration);
      const measuredJitter = Math.max(intervalVariance, starvationGap);

      this.jitterMs += (measuredJitter - this.jitterMs) / 16;
    }
    this.lastArrival = nowMs;
    this.lastDuration = durationMs;
    this.totalReceivedDurationMs += durationMs;
    this.bufferedDurationMs += durationMs;
  }

  consume(durationMs: number): void {
    this.bufferedDurationMs = Math.max(0, this.bufferedDurationMs - durationMs);
  }

  finishGeneration(): void {
    this.generationComplete = true;
    this.state = 'DRAINING';
  }

  finishTurn(): void {
    this.turnComplete = true;
    this.state = 'DRAINING';
  }

  interrupt(): void {
    this.generation++;
    this.state = 'INTERRUPTED';
    this.scheduledAheadMs = 0;
    this.bufferedDurationMs = 0;
    this.totalReceivedDurationMs = 0;
  }
}
