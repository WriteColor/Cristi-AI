import { app } from 'electron';
import process from 'node:process';
import { handleTrusted } from '../security/CapabilityRouter';

/**
 * Authentic system performance snapshot containing genuine hardware & process metrics.
 */
export interface SystemPerformanceSnapshot {
  cpuPercent: number;
  totalCpuPercent: number;
  workingSetSize: number;
  privateBytes: number;
  sharedBytes: number;
  workingSetSizeMB: number;
  privateBytesMB: number;
  sharedBytesMB: number;
  uptimeSeconds: number;
  pid: number;
  gpuFeatureStatus: Record<string, unknown>;
  processMetrics: Array<{
    pid: number;
    type: string;
    cpuPercent: number;
    workingSetMB: number;
  }>;
  serverTime: number;
}

export async function getSystemPerformanceSnapshot(): Promise<SystemPerformanceSnapshot> {
  let mem: Electron.ProcessMemoryInfo = { residentSet: 0, private: 0, shared: 0 };
  if (process.getProcessMemoryInfo && typeof process.getProcessMemoryInfo === 'function') {
    try {
      mem = await process.getProcessMemoryInfo();
    } catch (_) {
      const nodeMem = process.memoryUsage();
      mem = {
        residentSet: Math.round(nodeMem.rss / 1024),
        private: Math.round(nodeMem.heapUsed / 1024),
        shared: Math.round((nodeMem.external || 0) / 1024),
      };
    }
  } else {
    const nodeMem = process.memoryUsage();
    mem = {
      residentSet: Math.round(nodeMem.rss / 1024),
      private: Math.round(nodeMem.heapUsed / 1024),
      shared: Math.round((nodeMem.external || 0) / 1024),
    };
  }

  const metrics = (app.getAppMetrics && typeof app.getAppMetrics === 'function')
    ? app.getAppMetrics()
    : [];
  const mainMetric = metrics.find((m) => m.type === 'Browser') || metrics[0];
  const gpuStatus = (app.getGPUFeatureStatus && typeof app.getGPUFeatureStatus === 'function')
    ? app.getGPUFeatureStatus()
    : {};

  const workingSetSizeKB = (mem as unknown as { workingSetSize?: number }).workingSetSize ?? mem.residentSet ?? 0;
  const privateBytesKB = (mem as unknown as { privateBytes?: number }).privateBytes ?? mem.private ?? 0;
  const sharedBytesKB = (mem as unknown as { sharedBytes?: number }).sharedBytes ?? mem.shared ?? 0;

  const totalCpuPercent = metrics.reduce((acc, m) => acc + (m.cpu?.percentCPUUsage || 0), 0);

  return {
    cpuPercent: mainMetric?.cpu?.percentCPUUsage ?? 0,
    totalCpuPercent,
    workingSetSize: workingSetSizeKB,
    privateBytes: privateBytesKB,
    sharedBytes: sharedBytesKB,
    workingSetSizeMB: Math.round(workingSetSizeKB / 1024),
    privateBytesMB: Math.round(privateBytesKB / 1024),
    sharedBytesMB: Math.round(sharedBytesKB / 1024),
    uptimeSeconds: Math.floor(process.uptime ? process.uptime() : 0),
    pid: process.pid,
    gpuFeatureStatus: gpuStatus,
    processMetrics: metrics.map((m) => ({
      pid: m.pid,
      type: m.type,
      cpuPercent: m.cpu?.percentCPUUsage || 0,
      workingSetMB: parseFloat(((m.memory?.workingSetSize ?? 0) / 1024).toFixed(1)),
    })),
    serverTime: Date.now(),
  };
}

/**
 * Keeps a small, payload-free operational snapshot from the overlay renderer
 * for the independent telemetry window.  It intentionally never persists
 * data, credentials, prompts, conversation content, image frames, or tool arguments.
 */
let latestSnapshot: Record<string, unknown> = { updatedAt: 0, available: false };

export function registerTelemetryIpc(): void {
  handleTrusted('telemetry-report', (_event, snapshot) => {
    latestSnapshot = { ...snapshot, updatedAt: Date.now(), available: true };
    return { success: true };
  });

  handleTrusted('telemetry-snapshot', async () => {
    const system = await getSystemPerformanceSnapshot();
    return {
      ...latestSnapshot,
      system,
      uptimeSeconds: system.uptimeSeconds,
      serverTime: system.serverTime,
    };
  });
}
