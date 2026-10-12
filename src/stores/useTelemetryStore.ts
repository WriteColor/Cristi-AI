import { create } from 'zustand';
import type { TelemetryMetrics } from '../types/domain.types.js';
import type { AggregatedLiveMetrics } from '../domain/gemini/LiveSessionTelemetry.js';
import type { RuntimeBudget } from '../domain/runtime/RuntimeBudgetCoordinator.js';

export interface AudioRuntimeTelemetry {
  isPlaying: boolean;
  underruns: number;
  bufferedDurationMs: number;
  scheduledAheadMs: number;
  jitterMs: number;
}

export interface TelemetrySnapshotEntry {
  timestamp: number;
  fps: number;
  tps: number;
  p99: number;
  v8HeapMB: number;
  processRssMB: number;
  workingSetSizeMB?: number;
  privateBytesMB?: number;
  sharedBytesMB?: number;
  cpuPercent?: number;
  uptimeSeconds?: number;
}

export interface TelemetryState extends TelemetryMetrics {
  activeTab: 'fps' | 'memory' | 'dsp' | 'live';
  telemetry: Partial<TelemetryMetrics>;
  liveMetrics: AggregatedLiveMetrics | null;
  runtimeBudget: RuntimeBudget | null;
  audioRuntime: AudioRuntimeTelemetry | null;
  history: TelemetrySnapshotEntry[];

  setMetrics: (metrics: Partial<TelemetryMetrics & {
    workingSetSizeMB?: number;
    privateBytesMB?: number;
    sharedBytesMB?: number;
    cpuPercent?: number;
    uptimeSeconds?: number;
  }>) => void;
  resetMetrics: () => void;
  setTelemetry: (telemetry: Partial<TelemetryMetrics>) => void;
  setActiveTab: (tab: 'fps' | 'memory' | 'dsp' | 'live') => void;
  setLiveMetrics: (metrics: AggregatedLiveMetrics) => void;
  setRuntimeBudget: (budget: RuntimeBudget) => void;
  setAudioRuntime: (audio: AudioRuntimeTelemetry) => void;
  clearHistory: () => void;
}

const DEFAULT_METRICS: TelemetryMetrics = {
  fps: 0,
  tps: 0,
  p99: 0,
  v8HeapMB: 0,
  processRssMB: 0,
};

const MAX_HISTORY_ENTRIES = 50;

export const useTelemetryStore = create<TelemetryState>()((set, get) => ({
  ...DEFAULT_METRICS,
  activeTab: 'fps',
  telemetry: {},
  liveMetrics: null,
  runtimeBudget: null,
  audioRuntime: null,
  history: [],

  setMetrics: (metrics) =>
    set((state) => {
      // Ensure strictly valid, authentic numbers without synthetic filler or NaN
      const cleanFps = typeof metrics.fps === 'number' && !Number.isNaN(metrics.fps) ? Math.max(0, metrics.fps) : state.fps;
      const cleanTps = typeof metrics.tps === 'number' && !Number.isNaN(metrics.tps) ? Math.max(0, metrics.tps) : state.tps;
      const cleanP99 = typeof metrics.p99 === 'number' && !Number.isNaN(metrics.p99) ? Math.max(0, metrics.p99) : state.p99;
      const cleanHeap = typeof metrics.v8HeapMB === 'number' && !Number.isNaN(metrics.v8HeapMB) ? Math.max(0, metrics.v8HeapMB) : state.v8HeapMB;
      const cleanRss = typeof metrics.processRssMB === 'number' && !Number.isNaN(metrics.processRssMB) ? Math.max(0, metrics.processRssMB) : state.processRssMB;

      const nextTelemetry: Partial<TelemetryMetrics> = {
        ...state.telemetry,
        ...metrics,
        fps: cleanFps,
        tps: cleanTps,
        p99: cleanP99,
        v8HeapMB: cleanHeap,
        processRssMB: cleanRss,
      };

      const entry: TelemetrySnapshotEntry = {
        timestamp: Date.now(),
        fps: cleanFps,
        tps: cleanTps,
        p99: cleanP99,
        v8HeapMB: cleanHeap,
        processRssMB: cleanRss,
        workingSetSizeMB: typeof metrics.workingSetSizeMB === 'number' ? Math.max(0, metrics.workingSetSizeMB) : undefined,
        privateBytesMB: typeof metrics.privateBytesMB === 'number' ? Math.max(0, metrics.privateBytesMB) : undefined,
        sharedBytesMB: typeof metrics.sharedBytesMB === 'number' ? Math.max(0, metrics.sharedBytesMB) : undefined,
        cpuPercent: typeof metrics.cpuPercent === 'number' ? Math.max(0, metrics.cpuPercent) : undefined,
        uptimeSeconds: typeof metrics.uptimeSeconds === 'number' ? Math.max(0, metrics.uptimeSeconds) : undefined,
      };

      const nextHistory = [...state.history, entry];
      if (nextHistory.length > MAX_HISTORY_ENTRIES) {
        nextHistory.splice(0, nextHistory.length - MAX_HISTORY_ENTRIES);
      }

      return {
        ...state,
        fps: cleanFps,
        tps: cleanTps,
        p99: cleanP99,
        v8HeapMB: cleanHeap,
        processRssMB: cleanRss,
        telemetry: nextTelemetry,
        history: nextHistory,
      };
    }),

  resetMetrics: () => set({ ...DEFAULT_METRICS, telemetry: {}, history: [] }),
  setTelemetry: (telemetry) => get().setMetrics(telemetry),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setLiveMetrics: (metrics) => set({ liveMetrics: metrics }),
  setRuntimeBudget: (runtimeBudget) => set({ runtimeBudget }),
  setAudioRuntime: (audioRuntime) => set({ audioRuntime }),
  clearHistory: () => set({ history: [] }),
}));
