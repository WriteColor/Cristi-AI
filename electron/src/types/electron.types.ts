/**
 * Core type definitions for Electron Main Process & IPC Communication
 */

export interface DisplayInfo {
  id: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  width: number;
  height: number;
  scaleFactor: number;
  workArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  label?: string;
}

export interface ProcessMetricInfo {
  pid: number;
  type: string;
  workingSetMB: number;
  privateMB: number;
  sharedMB: number;
  cpuPercent: number;
}

export interface ProcessMemoryResult {
  success: boolean;
  residentSet: number;
  peakWorkingSet: number;
  private: number;
  processBreakdown: {
    browser: number;
    renderer: number;
    gpu: number;
    utility: number;
  };
  mainProcessResidentSet: number;
  totalWorkingSetMB: number;
  totalPrivateMB: number;
  totalSharedMB: number;
  processCount: number;
  processes: ProcessMetricInfo[];
  [key: string]: unknown;
}

export interface InteractiveHitbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExecCommandOptions {
  timeout?: number;
}

export interface ExecCommandResult {
  stdOut: string;
  stdErr: string;
  exitCode: number;
}

export interface McpStdioConfig {
  id: string;
  type?: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface McpToolCallPayload {
  serverId: string;
  name: string;
  arguments?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface ScreenRegion {
  x_pct?: number;
  y_pct?: number;
  w_pct?: number;
  h_pct?: number;
}

export interface MemoryRecord {
  id: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type MemoryLoadResult = {
  success: true;
  backend: 'sqlite' | 'json';
  memories: MemoryRecord[] | null;
} | { success: false; error: string };

export interface MemorySaveResult {
  success: boolean;
  backend?: 'sqlite' | 'json';
  count?: number;
  error?: string;
}

export interface AppConfig {
  apiKey?: string;
  [key: string]: unknown;
}
