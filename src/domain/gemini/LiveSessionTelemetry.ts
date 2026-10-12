/**
 * Cristi AI - Live Session Telemetry
 * Tracks monotonic timing and percentiles for real-time audio interaction
 * without recording sensitive user data.
 */

export interface TurnMetrics {
  turnId: number;
  audioCapturedAt?: number;
  webSocketSentAt?: number;
  lastInputSentAt?: number;
  modelAudioReceivedAt?: number;
  playoutStartedAt?: number;
  interruptedAt?: number;
  stopImmediateAt?: number;
  
  // Latencies
  localAudioSendMs?: number;
  bargeInLatencyMs?: number;
  playoutBufferMs?: number;
  modelAudioAfterLastInputMs?: number;
}

export interface AggregatedLiveMetrics {
  localAudioSend: { p50: number; p90: number; sampleCount: number };
  bargeInLatency: { p50: number; p90: number; sampleCount: number };
  playoutBuffer: { p50: number; p90: number; sampleCount: number };
  modelAudioAfterLastInput: { p50: number; p90: number; sampleCount: number };
}

export class LiveSessionTelemetry {
  private currentTurnId = 0;
  private currentTurn: TurnMetrics = { turnId: 0 };
  
  // History bounded to last 50 samples
  private history: TurnMetrics[] = [];
  private readonly MAX_HISTORY = 50;

  constructor() {
    this.startNewTurn();
  }

  private startNewTurn() {
    // Only push if there's meaningful latency data to track
    if (
      this.currentTurn.localAudioSendMs !== undefined ||
      this.currentTurn.bargeInLatencyMs !== undefined ||
      this.currentTurn.playoutBufferMs !== undefined ||
      this.currentTurn.modelAudioAfterLastInputMs !== undefined
    ) {
      this.history.push({ ...this.currentTurn });
      if (this.history.length > this.MAX_HISTORY) {
        this.history.shift();
      }
    }
    this.currentTurnId++;
    this.currentTurn = { turnId: this.currentTurnId };
  }

  // ---- Markers ----

  markAudioCaptured(now = performance.now()) {
    if (this.currentTurn.audioCapturedAt === undefined) {
      this.currentTurn.audioCapturedAt = now;
    }
  }

  markWebSocketSent(now = performance.now()) {
    if (this.currentTurn.audioCapturedAt !== undefined && this.currentTurn.webSocketSentAt === undefined) {
      this.currentTurn.webSocketSentAt = now;
      this.currentTurn.localAudioSendMs = Math.max(0, Math.round((now - this.currentTurn.audioCapturedAt) * 100) / 100);
    }
  }

  markInputSent(now = performance.now()) {
    this.currentTurn.lastInputSentAt = now;
  }

  markModelAudioReceived(now = performance.now()) {
    if (this.currentTurn.modelAudioReceivedAt === undefined) {
      this.currentTurn.modelAudioReceivedAt = now;
      if (this.currentTurn.lastInputSentAt !== undefined) {
        this.currentTurn.modelAudioAfterLastInputMs = Math.max(0, Math.round((now - this.currentTurn.lastInputSentAt) * 100) / 100);
      }
    }
  }

  markPlayoutStarted(now = performance.now()) {
    if (this.currentTurn.modelAudioReceivedAt !== undefined && this.currentTurn.playoutStartedAt === undefined) {
      this.currentTurn.playoutStartedAt = now;
      this.currentTurn.playoutBufferMs = Math.max(0, Math.round((now - this.currentTurn.modelAudioReceivedAt) * 100) / 100);
    }
  }

  markInterrupted(now = performance.now()) {
    this.currentTurn.interruptedAt = now;
  }

  markStopImmediate(now = performance.now()) {
    if (this.currentTurn.interruptedAt !== undefined && this.currentTurn.stopImmediateAt === undefined) {
      this.currentTurn.stopImmediateAt = now;
      this.currentTurn.bargeInLatencyMs = Math.max(0, Math.round((now - this.currentTurn.interruptedAt) * 100) / 100);
    }
  }

  markTurnComplete() {
    this.startNewTurn();
  }

  getCurrentTurn(): Readonly<TurnMetrics> {
    return this.currentTurn;
  }

  getHistory(): ReadonlyArray<TurnMetrics> {
    return this.history;
  }

  reset(): void {
    this.history = [];
    this.currentTurnId = 0;
    this.currentTurn = { turnId: 0 };
  }

  // ---- Aggregation ----

  getAggregatedMetrics(): AggregatedLiveMetrics {
    // Include current turn in aggregation if it has valid data
    const samples = [...this.history, this.currentTurn];

    return {
      localAudioSend: this.calculatePercentiles(samples, 'localAudioSendMs'),
      bargeInLatency: this.calculatePercentiles(samples, 'bargeInLatencyMs'),
      playoutBuffer: this.calculatePercentiles(samples, 'playoutBufferMs'),
      modelAudioAfterLastInput: this.calculatePercentiles(samples, 'modelAudioAfterLastInputMs'),
    };
  }

  private calculatePercentiles(samples: TurnMetrics[], key: keyof TurnMetrics) {
    const validValues = samples
      .map(s => s[key])
      .filter((v): v is number => typeof v === 'number' && !isNaN(v))
      .sort((a, b) => a - b);

    if (validValues.length === 0) {
      return { p50: 0, p90: 0, sampleCount: 0 };
    }

    return {
      p50: this.getPercentile(validValues, 0.5),
      p90: this.getPercentile(validValues, 0.9),
      sampleCount: validValues.length,
    };
  }

  private getPercentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = (sortedValues.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= sortedValues.length) return sortedValues[lower];
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }
}
