import type { AggregatedLiveMetrics } from '../gemini/LiveSessionTelemetry.js';
import type { TelemetrySnapshot } from '../../infrastructure/profiler/PerformanceProfilerService.js';
import type { RuntimeBudget } from './RuntimeBudgetCoordinator.js';

export interface RuntimeDiagnosticSample {
  timestamp: number;
  budget: RuntimeBudget;
  audio: {
    isPlaying: boolean;
    underruns: number;
    bufferedDurationMs: number;
    scheduledAheadMs: number;
    jitterMs: number;
  };
  live: AggregatedLiveMetrics | null;
  renderer: Pick<TelemetrySnapshot, 'fps' | 'avgFrameTimeMs' | 'p99FrameTimeMs' | 'droppedFrames'>;
}

export interface RuntimeDiagnosticReport {
  schemaVersion: 1;
  exportedAt: number;
  durationMs: number;
  sampleCount: number;
  profileCounts: Record<string, number>;
  maxUnderruns: number;
  samples: RuntimeDiagnosticSample[];
}

/** Bounded, data-only recorder. It never retains audio, images, prompts, or tool payloads. */
export class RuntimeDiagnosticsRecorder {
  private samples: RuntimeDiagnosticSample[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = 600) {
    this.maxSamples = maxSamples;
  }

  record(sample: RuntimeDiagnosticSample): void {
    this.samples.push({
      ...sample,
      budget: {
        ...sample.budget,
        audio: { ...sample.budget.audio },
        vision: { ...sample.budget.vision },
        live2d: { ...sample.budget.live2d },
      },
      audio: { ...sample.audio },
      live: sample.live ? structuredClone(sample.live) : null,
      renderer: { ...sample.renderer },
    });
    if (this.samples.length > this.maxSamples) this.samples.splice(0, this.samples.length - this.maxSamples);
  }

  clear(): void { this.samples = []; }

  getReport(): RuntimeDiagnosticReport {
    const samples = this.samples.map(sample => ({ ...sample, audio: { ...sample.audio }, renderer: { ...sample.renderer } }));
    const profileCounts: Record<string, number> = {};
    let maxUnderruns = 0;
    for (const sample of samples) {
      profileCounts[sample.budget.profile] = (profileCounts[sample.budget.profile] || 0) + 1;
      maxUnderruns = Math.max(maxUnderruns, sample.audio.underruns);
    }
    const start = samples[0]?.timestamp ?? Date.now();
    const end = samples.at(-1)?.timestamp ?? start;
    return { schemaVersion: 1, exportedAt: Date.now(), durationMs: Math.max(0, end - start), sampleCount: samples.length, profileCounts, maxUnderruns, samples };
  }

  exportJson(): string { return JSON.stringify(this.getReport()); }
}

export const runtimeDiagnosticsRecorder = new RuntimeDiagnosticsRecorder();
