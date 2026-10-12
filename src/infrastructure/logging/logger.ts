// @ts-ignore
import { publicSettings, redactText } from '../../../shared/security.ts';
/**
 * Cristi Desktop - Clean Structured Terminal & Diagnostics Logger (Strict TypeScript)
 * 
 * Bridges frontend logs directly to the user's running terminal (Vite / Electron stdout)
 * and browser console with timestamped, colorized tags, deduplication, log level filtering,
 * and safe cyclic-reference serialization.
 */

export type LogLevel = 'debug' | 'info' | 'voice' | 'warn' | 'error' | 'silent';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  tag: string;
  message: string;
  data: unknown;
}

export type LogListener = (entry: LogEntry) => void;

const LOG_LEVEL_PRIORITIES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  voice: 2,
  warn: 3,
  error: 4,
  silent: 5
};

const TAG_COLORS: Record<string, string> = {
  GEMINI: '#c084fc',
  AUDIO: '#38bdf8',
  VISION: '#f43f5e',
  ASR: '#4ade80',
  TOOL: '#fbbf24',
  SYSTEM: '#94a3b8',
  SCENE: '#a855f7',
  ELECTRON: '#06b6d4',
  CONFIG: '#34d399',
  PROACTIVE: '#f59e0b',
  AVATAR: '#ec4899',
  PROFILER: '#8b5cf6',
  SPOTIFY: '#1db954'
};

function safeSerialize(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'bigint') return `${val.toString()}n`;
  if (typeof val === 'symbol' || typeof val === 'function') return val.toString();
  if (val instanceof Error) return `${val.name}: ${val.message}\n${val.stack || ''}`;

  try {
    const seen = new WeakSet();
    return JSON.stringify(val, (_key, value) => {
      if (typeof value === 'bigint') return `${value.toString()}n`;
      if (typeof value === 'function') return `[Function: ${(value as (...args: unknown[]) => unknown).name || 'anonymous'}]`;
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
  } catch (_err) {
    return String(val);
  }
}

export class LoggerService {
  private listeners: Set<LogListener> = new Set();
  private currentLevel: LogLevel = 'debug';
  private lastLogKey: string = '';
  private lastLogTime: number = 0;
  private repeatCount: number = 0;

  /**
   * Set minimum active log level threshold
   */
  public setLevel(level: LogLevel): void {
    if (level in LOG_LEVEL_PRIORITIES) {
      this.currentLevel = level;
    }
  }

  /**
   * Get current log level
   */
  public getLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * Subscribe to log events for UI Debug HUD or analytics
   */
  public subscribe(listener: LogListener): () => void {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitToListeners(entry: LogEntry): void {
    this.listeners.forEach((fn) => {
      try {
        fn(entry);
      } catch (_) {}
    });
  }

  private normalizeArgs(arg1: any, arg2?: any, arg3?: any): { tag: string; message: any; data: any } {
    // If called with only 1 argument: logger.info("System loaded")
    if (arg2 === undefined) {
      return { tag: 'SYSTEM', message: arg1, data: null };
    }
    // If called with 2 arguments: logger.info("AUDIO", "Worklet connected")
    if (arg3 === undefined) {
      return { tag: String(arg1 || 'SYSTEM'), message: arg2, data: null };
    }
    // If called with 3 arguments: logger.info("AUDIO", "Captured", { size: 1024 })
    return { tag: String(arg1 || 'SYSTEM'), message: arg2, data: arg3 };
  }

  public log(level: LogLevel, arg1: any, arg2?: any, arg3?: any): void {
    // Respect current log level priority threshold
    if (LOG_LEVEL_PRIORITIES[level] < LOG_LEVEL_PRIORITIES[this.currentLevel]) {
      return;
    }

    const { tag, message, data: rawData } = this.normalizeArgs(arg1, arg2, arg3);
    const data = publicSettings(rawData);
    const msgStr = redactText(typeof message === 'object' && message !== null ? safeSerialize(publicSettings(message)) : String(message ?? ''));

    // Deduplication filter (avoids log flooding within 1.5s for identical tag & message)
    const logKey = `${level}:${tag}:${msgStr}`;
    const now = Date.now();
    if (logKey === this.lastLogKey && now - this.lastLogTime < 1500) {
      this.repeatCount++;
      return;
    }
    this.lastLogKey = logKey;
    this.lastLogTime = now;
    this.repeatCount = 0;

    const timestamp = new Date().toLocaleTimeString('es-ES');
    const upperTag = (tag || 'SYSTEM').toUpperCase();
    const entry: LogEntry = {
      id: `${now}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp,
      level,
      tag: upperTag,
      message: msgStr,
      data: data !== undefined ? data : null
    };

    // 1. Browser Console Logging with clean CSS tags
    const color = TAG_COLORS[entry.tag] || '#a855f7';

    if (data !== null && data !== undefined) {
      console.log(
        `%c[${entry.timestamp}]%c [${entry.tag}] %c${entry.message}`,
        'color: #64748b; font-weight: normal;',
        `color: ${color}; font-weight: bold;`,
        'color: #f8fafc;',
        data
      );
    } else {
      console.log(
        `%c[${entry.timestamp}]%c [${entry.tag}] %c${entry.message}`,
        'color: #64748b; font-weight: normal;',
        `color: ${color}; font-weight: bold;`,
        'color: #f8fafc;'
      );
    }

    // 2. Notify in-app subscribers (UI Debug HUD)
    this.emitToListeners(entry);

    // 3. Forward to Vite terminal server endpoint (/__log)
    this.sendToTerminal(entry);
  }

  private async sendToTerminal(entry: LogEntry): Promise<void> {
    try {
      if (typeof window !== 'undefined' && typeof window.fetch === 'function' && (import.meta as any).env?.DEV) {
        fetch('/__log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: safeSerialize(entry),
          mode: 'no-cors'
        }).catch(() => {});
      }
    } catch (_) {}
  }

  public debug(arg1: any, arg2?: any, arg3?: any): void {
    this.log('debug', arg1, arg2, arg3);
  }

  public info(arg1: any, arg2?: any, arg3?: any): void {
    this.log('info', arg1, arg2, arg3);
  }

  public voice(arg1: any, arg2?: any, arg3?: any): void {
    this.log('voice', arg1, arg2, arg3);
  }

  public warn(arg1: any, arg2?: any, arg3?: any): void {
    this.log('warn', arg1, arg2, arg3);
  }

  public error(arg1: any, arg2?: any, arg3?: any): void {
    this.log('error', arg1, arg2, arg3);
  }
}

export const logger = new LoggerService();
export default logger;
