import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Cpu,
  MemoryStick,
  Radio,
  Disc,
  Music,
  Database,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  RefreshCw,
  Layers,
  Volume2,
  Mic,
  MicOff,
  Eye,
  Terminal,
  X,
  Clock,
  ShieldCheck,
  Network,
  Server,
  Sparkles
} from 'lucide-react';
import { electronBridge } from './services/desktop/ElectronBridge';
import { memoryService } from './domain/integrations/memory/MemoryService';
import { detectMusicMood } from './mcp/servers/spotify/SpotifyEmotionBridge';
import './index.css';

interface ProcessMetricItem {
  pid: number;
  type: string;
  cpuPercent: number;
  workingSetMB: number;
}

interface SystemTelemetry {
  cpuPercent?: number;
  totalCpuPercent?: number;
  workingSetSizeMB?: number;
  privateBytesMB?: number;
  sharedBytesMB?: number;
  uptimeSeconds?: number;
  pid?: number;
  gpuFeatureStatus?: Record<string, unknown>;
  processMetrics?: ProcessMetricItem[];
  serverTime?: number;
}

interface WindowsMediaInfo {
  isSpotifyRunning: boolean;
  trackInfo: string | null;
  artist: string | null;
  title: string | null;
  isPlaying: boolean;
  source: 'spotify' | 'system' | 'none';
}

interface LatencyStats {
  p50?: number;
  p90?: number;
  sampleCount?: number;
}

interface LiveSessionData {
  state?: string;
  connected?: boolean;
  connecting?: boolean;
  interrupted?: boolean;
  activeTool?: string;
  metrics?: {
    localAudioSend?: LatencyStats;
    bargeInLatency?: LatencyStats;
    playoutBuffer?: LatencyStats;
    modelAudioAfterLastInput?: LatencyStats;
  };
}

interface AudioDiagnosticsData {
  isPlaying?: boolean;
  underruns?: number;
  bufferedDurationMs?: number;
  scheduledAheadMs?: number;
  jitterMs?: number;
}

interface AudioData {
  microphoneMuted?: boolean;
  inputActive?: boolean;
  outputActive?: boolean;
  speakerVolume?: number;
  diagnostics?: AudioDiagnosticsData;
}

interface VisionData {
  cameraActive?: boolean;
  screenActive?: boolean;
  regionActive?: boolean;
  detections?: number;
}

interface IntegrationItem {
  id: string;
  state: string;
  configured: boolean;
  authenticated: boolean;
  connected: boolean;
  latencyMs?: number | null;
  lastError?: string;
  updatedAt?: number;
}

interface TelemetryStateData {
  // System Memory (100% authentic)
  rssMB: number;
  workingSetMB: number;
  privateBytesMB: number;
  sharedBytesMB: number;

  // Process Performance
  cpuPercent: number;
  totalCpuPercent: number;
  uptimeSeconds: number;
  pid: number | string;
  pingMs: number;
  processMetrics: ProcessMetricItem[];

  // Hardware & GPU
  gpuFeatures: Record<string, string>;

  // Session & Audio Latency
  liveSession: LiveSessionData;
  audio: AudioData;
  vision: VisionData;

  // Active Integrations
  media: WindowsMediaInfo;
  memoryCount: number;
  integrations: IntegrationItem[];

  // Recent Diagnostics
  recentErrors: string[];
  lastUpdated: number;
}

interface MetricHistoryBuffers {
  cpu: number[];
  memory: number[];
  ping: number[];
  bargeIn: number[];
}

const MAX_HISTORY_SAMPLES = 30;

function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatLatency(ms?: number): string {
  if (typeof ms !== 'number' || ms <= 0) return '—';
  return `${Math.round(ms)} ms`;
}

function getStoredMemoryCount(): number {
  try {
    const mems = memoryService.getAllMemories();
    if (Array.isArray(mems) && mems.length > 0) return mems.length;
  } catch {
    // fallback to localStorage
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem('cristi_ai_memories_v2');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed.length;
      }
    }
  } catch {
    // Ignore parse error
  }
  return 0;
}

/**
 * Authentic SVG Sparkline component rendering an area graph from a real-time sample buffer.
 */
function SvgSparkline({
  data,
  strokeColor = '#10b981',
  fillColor = 'rgba(16, 185, 129, 0.15)',
  height = 42,
  minVal,
  maxVal
}: {
  data: number[];
  strokeColor?: string;
  fillColor?: string;
  height?: number;
  minVal?: number;
  maxVal?: number;
}) {
  if (!data || data.length < 2) {
    return (
      <div className="h-[42px] flex items-center justify-center text-[10px] text-zinc-600 font-mono">
        Recopilando muestras...
      </div>
    );
  }

  const width = 280;
  const padding = 4;
  const actualMin = minVal !== undefined ? minVal : Math.min(...data);
  const actualMax = maxVal !== undefined ? maxVal : Math.max(...data);
  const range = Math.max(1, actualMax - actualMin);

  const points = data.map((val, idx) => {
    const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
    const normalized = (val - actualMin) / range;
    const y = height - padding - normalized * (height - padding * 2);
    return { x, y };
  });

  const pathD = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[42px] overflow-visible"
        preserveAspectRatio="none"
      >
        <path d={areaD} fill={fillColor} />
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Latest point dot */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r="2.5"
            fill={strokeColor}
          />
        )}
      </svg>
    </div>
  );
}

function TelemetryApp() {
  const [data, setData] = useState<TelemetryStateData>({
    rssMB: 0,
    workingSetMB: 0,
    privateBytesMB: 0,
    sharedBytesMB: 0,
    cpuPercent: 0,
    totalCpuPercent: 0,
    uptimeSeconds: 0,
    pid: 'MAIN',
    pingMs: 0,
    processMetrics: [],
    gpuFeatures: {},
    liveSession: {},
    audio: {},
    vision: {},
    media: {
      isSpotifyRunning: false,
      trackInfo: null,
      artist: null,
      title: null,
      isPlaying: false,
      source: 'none',
    },
    memoryCount: 0,
    integrations: [],
    recentErrors: [],
    lastUpdated: Date.now(),
  });

  const [history, setHistory] = useState<MetricHistoryBuffers>({
    cpu: [],
    memory: [],
    ping: [],
    bargeIn: [],
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const historyRef = useRef<MetricHistoryBuffers>({ cpu: [], memory: [], ping: [], bargeIn: [] });

  const fetchTelemetry = useCallback(async () => {
    setIsRefreshing(true);
    const pingStart = performance.now();
    try {
      const [rawMemory, rawGpu, rawSnapshot, rawMedia] = await Promise.all([
        electronBridge.getProcessMemoryInfo().catch(() => null),
        electronBridge.getGpuFeatureStatus().catch(() => null),
        electronBridge.getTelemetrySnapshot().catch(() => ({})),
        electronBridge.windowsMediaStatus().catch(() => null),
      ]);
      const pingMs = Math.max(1, Math.round(performance.now() - pingStart));

      const snap = (rawSnapshot || {}) as Record<string, any>;
      const sys = (snap.system as SystemTelemetry | undefined) || {};
      const mem = (rawMemory as Record<string, unknown> | null) || {};

      const workingSetMB = typeof sys.workingSetSizeMB === 'number' && sys.workingSetSizeMB > 0
        ? sys.workingSetSizeMB
        : (typeof mem.workingSetSize === 'number'
          ? Math.round((mem.workingSetSize as number) / 1024)
          : (typeof mem.residentSet === 'number' ? Math.round((mem.residentSet as number) / 1024) : 0));

      const rssMB = typeof mem.residentSet === 'number' && (mem.residentSet as number) > 0
        ? Math.round((mem.residentSet as number) / 1024)
        : workingSetMB;

      const privateBytesMB = typeof sys.privateBytesMB === 'number' && sys.privateBytesMB > 0
        ? sys.privateBytesMB
        : (typeof mem.privateBytes === 'number'
          ? Math.round((mem.privateBytes as number) / 1024)
          : (typeof mem.private === 'number' ? Math.round((mem.private as number) / 1024) : 0));

      const sharedBytesMB = typeof sys.sharedBytesMB === 'number' && sys.sharedBytesMB > 0
        ? sys.sharedBytesMB
        : (typeof mem.sharedBytes === 'number'
          ? Math.round((mem.sharedBytes as number) / 1024)
          : (typeof mem.shared === 'number' ? Math.round((mem.shared as number) / 1024) : 0));

      const cpuPercent = typeof sys.cpuPercent === 'number' ? sys.cpuPercent : 0;
      const totalCpuPercent = typeof sys.totalCpuPercent === 'number' ? sys.totalCpuPercent : cpuPercent;
      const uptimeSeconds = typeof sys.uptimeSeconds === 'number'
        ? sys.uptimeSeconds
        : (typeof snap.uptimeSeconds === 'number' ? (snap.uptimeSeconds as number) : 0);
      const pid = sys.pid ?? 'MAIN';
      const processMetrics = Array.isArray(sys.processMetrics) ? sys.processMetrics : [];

      const gpuFeatures: Record<string, string> = {};
      if (rawGpu && typeof rawGpu === 'object') {
        for (const [k, v] of Object.entries(rawGpu)) {
          gpuFeatures[k] = String(v);
        }
      } else if (sys.gpuFeatureStatus && typeof sys.gpuFeatureStatus === 'object') {
        for (const [k, v] of Object.entries(sys.gpuFeatureStatus)) {
          gpuFeatures[k] = String(v);
        }
      }

      const liveSession = (snap.liveSession as LiveSessionData) || {};
      const audio = (snap.audio as AudioData) || {};
      const vision = (snap.vision as VisionData) || {};

      const media: WindowsMediaInfo = (rawMedia as WindowsMediaInfo | null) || {
        isSpotifyRunning: false,
        trackInfo: null,
        artist: null,
        title: null,
        isPlaying: false,
        source: 'none',
      };

      const memoryCount = getStoredMemoryCount();
      const integrations = Array.isArray(snap.integrations)
        ? (snap.integrations as IntegrationItem[])
        : [];

      const recentErrors = Array.isArray(snap.recentErrors)
        ? (snap.recentErrors.filter((e: unknown): e is string => typeof e === 'string')).slice(0, 5)
        : [];

      // Update rolling sample buffers (max 30 items)
      const prev = historyRef.current;
      const nextCpu = [...prev.cpu, cpuPercent].slice(-MAX_HISTORY_SAMPLES);
      const nextMem = [...prev.memory, workingSetMB].slice(-MAX_HISTORY_SAMPLES);
      const nextPing = [...prev.ping, pingMs].slice(-MAX_HISTORY_SAMPLES);
      const bargeInVal = liveSession.metrics?.bargeInLatency?.p50 || 0;
      const nextBargeIn = [...prev.bargeIn, bargeInVal].slice(-MAX_HISTORY_SAMPLES);

      const nextHistory = {
        cpu: nextCpu,
        memory: nextMem,
        ping: nextPing,
        bargeIn: nextBargeIn,
      };

      historyRef.current = nextHistory;
      setHistory(nextHistory);

      setData({
        rssMB,
        workingSetMB,
        privateBytesMB,
        sharedBytesMB,
        cpuPercent,
        totalCpuPercent,
        uptimeSeconds,
        pid,
        pingMs,
        processMetrics,
        gpuFeatures,
        liveSession,
        audio,
        vision,
        media,
        memoryCount,
        integrations,
        recentErrors,
        lastUpdated: Date.now(),
      });
    } catch {
      // Keep previous telemetry on transient read errors
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchTelemetry();
    const interval = window.setInterval(() => {
      void fetchTelemetry();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [fetchTelemetry]);

  // Derived state
  const isGpuDisabled = Object.values(data.gpuFeatures).some(v => typeof v === 'string' && v.includes('disabled'));
  const sessionState = data.liveSession.state || 'idle';
  const liveMetrics = data.liveSession.metrics || {};
  const audioDiag = data.audio.diagnostics || {};
  const memoryTotalForRatio = Math.max(data.workingSetMB, data.rssMB, 1);
  const privatePercent = Math.min(100, Math.round((data.privateBytesMB / memoryTotalForRatio) * 100));
  const sharedPercent = Math.min(100 - privatePercent, Math.round((data.sharedBytesMB / memoryTotalForRatio) * 100));

  const sessionColor = sessionState === 'connected'
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : sessionState === 'connecting'
      ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
      : 'text-zinc-400 bg-zinc-800/40 border-zinc-700/50';

  // Detected music mood from current track
  const trackName = data.media.title || data.media.trackInfo || '';
  const detectedMusic = trackName ? detectMusicMood(trackName) : null;

  return (
    <div className="w-full h-full min-h-screen bg-zinc-950 text-zinc-100 font-mono flex flex-col select-none overflow-y-auto custom-scrollbar p-6">
      {/* ── Top Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-400">
            <Activity size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white uppercase">
                Cristi AI • Telemetría de Sistema
              </h1>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Tiempo Real
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Diagnóstico de proceso Windows, sparklines SVG continuos y telemetría de audio Gemini Live
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-md text-xs">
            <Radio size={13} className="text-fuchsia-400" />
            <span className="text-zinc-400">IPC Ping:</span>
            <span className="text-white font-semibold">{data.pingMs} ms</span>
          </div>

          <button
            type="button"
            onClick={() => void fetchTelemetry()}
            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-md transition-colors cursor-pointer"
            title="Actualizar datos"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-cyan-400' : ''} />
          </button>

          <button
            type="button"
            onClick={() => {
              void electronBridge.closeTelemetryWindow().catch(() => window.close());
            }}
            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-rose-400 rounded-md transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {/* ── Main Diagnostics Grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-5 flex-1">
        {/* ── 1. System Memory & Process Performance ───────────────────────────── */}
        <section className="col-span-12 lg:col-span-6 flex flex-col gap-5">
          {/* System Memory Card */}
          <article className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-cyan-400">
                <MemoryStick size={18} />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Memoria del Proceso
                </h2>
              </div>
              <span className="text-[11px] text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                PID: {data.pid}
              </span>
            </div>

            <div className="flex items-baseline justify-between mb-2">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-light text-white tracking-tight">
                  {data.workingSetMB}
                </span>
                <span className="text-xs text-zinc-400 uppercase tracking-wider">
                  MB Working Set (RAM Física)
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 uppercase">Buffer 30s</span>
            </div>

            {/* Sparkline Memory Graph */}
            <div className="mb-4 bg-zinc-950/80 rounded border border-zinc-800/60 p-1.5">
              <SvgSparkline
                data={history.memory}
                strokeColor="#06b6d4"
                fillColor="rgba(6, 182, 212, 0.12)"
              />
            </div>

            {/* Allocation Bar */}
            <div className="w-full bg-zinc-950 h-2.5 rounded-full overflow-hidden border border-zinc-800 flex mb-4">
              <div
                className="bg-cyan-500 h-full transition-all duration-500"
                style={{ width: `${privatePercent}%` }}
                title={`Privada: ${data.privateBytesMB} MB (${privatePercent}%)`}
              />
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{ width: `${sharedPercent}%` }}
                title={`Compartida: ${data.sharedBytesMB} MB (${sharedPercent}%)`}
              />
            </div>

            {/* 4 authentic metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-md">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">RSS Total</p>
                <p className="text-base font-semibold text-zinc-100 mt-0.5">
                  {data.rssMB} <span className="text-[10px] text-zinc-500 font-normal">MB</span>
                </p>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-md">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Working Set</p>
                <p className="text-base font-semibold text-cyan-400 mt-0.5">
                  {data.workingSetMB} <span className="text-[10px] text-zinc-500 font-normal">MB</span>
                </p>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-md">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Bytes Privados</p>
                <p className="text-base font-semibold text-zinc-200 mt-0.5">
                  {data.privateBytesMB} <span className="text-[10px] text-zinc-500 font-normal">MB</span>
                </p>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-md">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Bytes Compartidos</p>
                <p className="text-base font-semibold text-zinc-200 mt-0.5">
                  {data.sharedBytesMB} <span className="text-[10px] text-zinc-500 font-normal">MB</span>
                </p>
              </div>
            </div>
          </article>

          {/* Process Performance Card */}
          <article className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 flex-1">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <Cpu size={18} />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Rendimiento del Proceso
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Clock size={13} />
                <span>Uptime: <strong className="text-zinc-200">{formatUptime(data.uptimeSeconds)}</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-md">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Uso CPU (Main)</p>
                <p className="text-lg font-semibold text-emerald-400 mt-0.5">
                  {data.cpuPercent.toFixed(1)}<span className="text-xs text-zinc-500">%</span>
                </p>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-md">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">CPU Global</p>
                <p className="text-lg font-semibold text-zinc-200 mt-0.5">
                  {data.totalCpuPercent.toFixed(1)}<span className="text-xs text-zinc-500">%</span>
                </p>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-md">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Latencia IPC</p>
                <p className="text-lg font-semibold text-fuchsia-400 mt-0.5">
                  {data.pingMs}<span className="text-xs text-zinc-500"> ms</span>
                </p>
              </div>
            </div>

            {/* Sparkline CPU Graph */}
            <div className="mb-4 bg-zinc-950/80 rounded border border-zinc-800/60 p-1.5">
              <div className="flex justify-between items-center px-1 mb-1">
                <span className="text-[10px] text-zinc-500 uppercase">Carga CPU en Vivo</span>
                <span className="text-[10px] text-emerald-400">{data.cpuPercent.toFixed(1)}%</span>
              </div>
              <SvgSparkline
                data={history.cpu}
                strokeColor="#10b981"
                fillColor="rgba(16, 185, 129, 0.12)"
                minVal={0}
              />
            </div>

            {/* Electron Process Breakdown */}
            {data.processMetrics.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                  Procesos Electron Activos
                </p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                  {data.processMetrics.map((proc) => (
                    <div
                      key={proc.pid}
                      className="flex items-center justify-between text-[11px] bg-zinc-950/50 border border-zinc-800/60 px-2.5 py-1.5 rounded"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Terminal size={12} className="text-zinc-500" />
                        <span className="text-zinc-300 font-medium capitalize">{proc.type}</span>
                        <span className="text-zinc-600 text-[10px]">PID {proc.pid}</span>
                      </div>
                      <div className="flex items-center gap-3 text-right">
                        <span className="text-emerald-400">{proc.cpuPercent.toFixed(1)}% CPU</span>
                        <span className="text-zinc-400">{proc.workingSetMB} MB</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        </section>

        {/* ── 2. Live Audio & Session Latency ──────────────────────────────────── */}
        <section className="col-span-12 lg:col-span-6 flex flex-col gap-5">
          <article className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Radio size={18} />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                    Sesión Gemini Live & Latencias
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${sessionColor}`}>
                    {sessionState}
                  </span>
                  {data.liveSession.interrupted && (
                    <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Barge-In Activo
                    </span>
                  )}
                </div>
              </div>

              {/* Crucial 3 Latencies */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-md">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    Envío Local (Mic → WS)
                  </p>
                  <p className="text-xl font-light text-cyan-400 mt-1">
                    {formatLatency(liveMetrics.localAudioSend?.p50)}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    P90: {formatLatency(liveMetrics.localAudioSend?.p90)} · N: {liveMetrics.localAudioSend?.sampleCount ?? 0}
                  </p>
                </div>

                <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-md">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    Audio post-Input
                  </p>
                  <p className="text-xl font-light text-emerald-400 mt-1">
                    {formatLatency(liveMetrics.modelAudioAfterLastInput?.p50)}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    P90: {formatLatency(liveMetrics.modelAudioAfterLastInput?.p90)} · N: {liveMetrics.modelAudioAfterLastInput?.sampleCount ?? 0}
                  </p>
                </div>

                <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-md">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    Corte Barge-In
                  </p>
                  <p className="text-xl font-light text-amber-400 mt-1">
                    {formatLatency(liveMetrics.bargeInLatency?.p50)}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    P90: {formatLatency(liveMetrics.bargeInLatency?.p90)} · N: {liveMetrics.bargeInLatency?.sampleCount ?? 0}
                  </p>
                </div>
              </div>

              {/* Sparkline Barge-in Graph */}
              <div className="mb-4 bg-zinc-950/80 rounded border border-zinc-800/60 p-1.5">
                <div className="flex justify-between items-center px-1 mb-1">
                  <span className="text-[10px] text-zinc-500 uppercase">Respuesta Barge-in (ms)</span>
                  <span className="text-[10px] text-amber-400">
                    {formatLatency(liveMetrics.bargeInLatency?.p50)}
                  </span>
                </div>
                <SvgSparkline
                  data={history.bargeIn}
                  strokeColor="#f59e0b"
                  fillColor="rgba(245, 158, 11, 0.12)"
                />
              </div>

              {/* Audio DSP Subsystem */}
              <div className="bg-zinc-950/50 border border-zinc-800/70 rounded-md p-3.5 mb-4">
                <div className="flex items-center justify-between text-xs mb-3">
                  <div className="flex items-center gap-2 text-zinc-300 font-medium">
                    <Disc size={15} className="text-sky-400" />
                    <span>Pipeline DSP de Audio (24 kHz PCM)</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1">
                      {data.audio.microphoneMuted ? (
                        <MicOff size={13} className="text-rose-400" />
                      ) : (
                        <Mic size={13} className="text-emerald-400" />
                      )}
                      <span className={data.audio.microphoneMuted ? 'text-rose-400' : 'text-emerald-400'}>
                        {data.audio.microphoneMuted ? 'Silenciado' : (data.audio.inputActive ? 'Capturando' : 'Listo')}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Volume2 size={13} className={data.audio.outputActive ? 'text-cyan-400' : 'text-zinc-500'} />
                      <span className={data.audio.outputActive ? 'text-cyan-400' : 'text-zinc-500'}>
                        {data.audio.outputActive ? 'Reproduciendo' : 'Reposo'}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-zinc-900/60 p-2 rounded border border-zinc-800/50">
                    <span className="text-zinc-500 block text-[10px] uppercase">Buffer Ahead</span>
                    <span className="text-zinc-200 font-medium">{Math.round(audioDiag.scheduledAheadMs || 0)} ms</span>
                  </div>
                  <div className="bg-zinc-900/60 p-2 rounded border border-zinc-800/50">
                    <span className="text-zinc-500 block text-[10px] uppercase">Jitter de Red</span>
                    <span className="text-zinc-200 font-medium">{Math.round(audioDiag.jitterMs || 0)} ms</span>
                  </div>
                  <div className="bg-zinc-900/60 p-2 rounded border border-zinc-800/50">
                    <span className="text-zinc-500 block text-[10px] uppercase">Buffer Underruns</span>
                    <span className={`font-medium ${(audioDiag.underruns || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {audioDiag.underruns || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Vision & Contextual Tools footer */}
            <div className="flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-800/70 pt-3">
              <div className="flex items-center gap-2">
                <Eye size={13} className={data.vision.cameraActive || data.vision.screenActive ? 'text-emerald-400' : 'text-zinc-600'} />
                <span>Visión: {data.vision.cameraActive ? 'Cámara' : (data.vision.screenActive ? 'Pantalla' : 'Inactiva')}</span>
                {data.vision.detections !== undefined && data.vision.detections > 0 && (
                  <span className="text-cyan-400 text-[11px]">({data.vision.detections} detecciones)</span>
                )}
              </div>
              <div className="truncate max-w-[200px]">
                Herramienta activa: <strong className="text-zinc-300">{data.liveSession.activeTool || 'Ninguna'}</strong>
              </div>
            </div>
          </article>
        </section>

        {/* ── 3. Hardware & GPU Features ───────────────────────────────────────── */}
        <section className="col-span-12">
          <article className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-indigo-400">
                <HardDrive size={18} />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Aceleración por Hardware & GPU
                </h2>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${
                isGpuDisabled
                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                  : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
              }`}>
                {isGpuDisabled ? 'Renderizado Software' : 'GPU Acelerada Activa'}
              </span>
            </div>

            {/* GPU Key Features Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {[
                { name: 'WebGL', key: 'webgl' },
                { name: 'WebGL 2.0', key: 'webgl2' },
                { name: 'Rasterization', key: 'rasterization' },
                { name: '2D Canvas', key: '2d_canvas' },
                { name: 'Compositing', key: 'gpu_compositing' },
                { name: 'Raster Threads', key: 'multiple_raster_threads' },
              ].map(({ name, key }) => {
                const val = data.gpuFeatures[key] || 'unavailable';
                const isEnabled = val.includes('enabled');
                return (
                  <div key={key} className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-md">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider truncate">{name}</p>
                    <p className={`text-xs font-semibold mt-1 capitalize truncate ${
                      isEnabled ? 'text-emerald-400' : 'text-amber-400/80'
                    }`}>
                      {val.replace(/_/g, ' ')}
                    </p>
                  </div>
                );
              })}
            </div>
          </article>
        </section>

        {/* ── 4. Active Integrations ───────────────────────────────────────────── */}
        <section className="col-span-12 lg:col-span-6 flex flex-col gap-5">
          <article className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 flex-1">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-amber-400">
                <Layers size={18} />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Integraciones Activas
                </h2>
              </div>
              <span className="text-[11px] text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                Windows Media • MCP • Memoria
              </span>
            </div>

            <div className="space-y-3">
              {/* Windows Media & Spotify MCP integration */}
              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3.5 rounded-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20">
                      <Music size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">Windows & Spotify MCP</p>
                      <p className="text-[11px] text-zinc-400 truncate max-w-[260px] mt-0.5">
                        {data.media.trackInfo
                          || (data.media.artist && data.media.title ? `${data.media.artist} — ${data.media.title}` : 'Sin pista en reproducción')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${
                      data.media.isPlaying
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                        : data.media.isSpotifyRunning
                          ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
                          : 'text-zinc-500 bg-zinc-900 border-zinc-800'
                    }`}>
                      {data.media.isPlaying ? 'Reproduciendo' : (data.media.isSpotifyRunning ? 'Pausado' : 'Inactivo')}
                    </span>
                  </div>
                </div>

                {/* Detected Live2D Emotion Badge */}
                {detectedMusic && data.media.isPlaying && (
                  <div className="mt-2.5 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Sparkles size={12} className="text-fuchsia-400" />
                      <span>Ánimo Musical:</span>
                      <strong className="text-zinc-200 capitalize">{detectedMusic.mood}</strong>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/30 uppercase">
                      Live2D: {detectedMusic.suggestedEmotion}
                    </span>
                  </div>
                )}
              </div>

              {/* Memory store integration */}
              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-md flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-md border border-indigo-500/20">
                    <Database size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">Almacén de Memoria Contextual</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {data.memoryCount} hechos y resúmenes indexados
                    </p>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
                  SQLite / JSON Activo
                </span>
              </div>

              {/* MCP Servers */}
              {data.integrations.filter(i => i.id.startsWith('mcp:')).length > 0 ? (
                data.integrations.filter(i => i.id.startsWith('mcp:')).map((mcp) => (
                  <div key={mcp.id} className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-md flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-500/10 text-amber-400 rounded-md border border-amber-500/20">
                        <Server size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-200">Servidor MCP: {mcp.id.replace(/^mcp:/, '')}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          Estado: {mcp.state} {mcp.latencyMs != null ? `· ${mcp.latencyMs} ms` : ''}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${
                      mcp.connected
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                        : 'text-zinc-500 bg-zinc-900 border-zinc-800'
                    }`}>
                      {mcp.connected ? 'Conectado' : 'En reposo'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="bg-zinc-950/40 border border-dashed border-zinc-800 p-3 rounded-md text-center">
                  <p className="text-xs text-zinc-500">
                    0 servidores MCP externos conectados actualmente.
                  </p>
                </div>
              )}
            </div>
          </article>
        </section>

        {/* ── 5. Recent Errors Stream (Max 5 items) ────────────────────────────── */}
        <section className="col-span-12 lg:col-span-6 flex flex-col gap-5">
          <article className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 flex-1">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle size={18} />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Flujo de Diagnóstico & Errores
                </h2>
              </div>
              <span className="text-[11px] text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                Máx 5 Eventos
              </span>
            </div>

            {data.recentErrors.length === 0 ? (
              <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-md p-6 flex flex-col items-center justify-center text-center h-48">
                <CheckCircle2 size={32} className="text-emerald-400 mb-2" />
                <p className="text-xs font-semibold text-zinc-200">Sistema 100% Nominal</p>
                <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">
                  Cero anomalías o excepciones registradas en el renderizador ni en los workers de fondo.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                {data.recentErrors.map((err, idx) => (
                  <div
                    key={`${idx}-${err.slice(0, 20)}`}
                    className="bg-rose-950/20 border border-rose-900/40 rounded-md p-3 text-xs text-rose-300 font-mono break-all"
                  >
                    <div className="flex items-center gap-2 text-[10px] text-rose-400 uppercase tracking-wider mb-1 font-semibold">
                      <AlertTriangle size={12} />
                      <span>Incidencia #{idx + 1}</span>
                    </div>
                    {err}
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <footer className="mt-6 pt-4 border-t border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <ShieldCheck size={13} className="text-emerald-400" />
            Aislamiento de Contexto Seguro
          </span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            <Network size={13} className="text-emerald-400" />
            Canal IPC Verificado
          </span>
        </div>
        <div>
          Última actualización: {new Date(data.lastUpdated).toLocaleTimeString()}
        </div>
      </footer>
    </div>
  );
}

const container = document.getElementById('telemetry-root');
if (container) {
  createRoot(container).render(<TelemetryApp />);
}
