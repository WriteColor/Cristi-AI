/**
 * Cristi AI - VisionFrameDispatcher
 * Single-owner visual transport for Gemini Live with congestion backpressure.
 * Automatically drops older frames when network is congested to avoid latency accumulation.
 */

import { eventBus, EVENTS } from '../../infrastructure/events/eventBus';
import { logger } from '../../infrastructure/logging/logger';

export interface LiveSessionLike {
  isConnected?: boolean;
  websocket?: WebSocket | null;
  sendRealtimeMedia?: (base64: string, mimeType: string, priority?: boolean) => boolean | unknown;
  [key: string]: unknown;
}

export interface VisionFrameDispatcherOptions {
  socketRef?: { current: LiveSessionLike | null } | null;
  minIntervalMs?: number;
  speechIntervalMs?: number;
  maxAgeMs?: number;
}

export interface QueuedFrame {
  base64: string;
  source: string;
  timestamp?: number;
  createdAt: number;
  priority: boolean;
  socket?: LiveSessionLike | null;
}

export type TransportSink = (frame: QueuedFrame) => void;

export class VisionFrameDispatcher {
  public socketRef: { current: LiveSessionLike | null } | null;
  public minIntervalMs: number;
  public speechIntervalMs: number;
  public maxAgeMs: number;
  private pending = new Map<string, QueuedFrame>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerDueAt = 0;
  private lastSentAt = -Infinity;
  private lastSpeechSentAt = -Infinity;
  public isSpeaking = false;
  public destroyed = false;
  private transportSink: TransportSink | null = null;
  private _unsubStart: (() => void) | null = null;
  private _unsubEnd: (() => void) | null = null;

  constructor({
    socketRef = null,
    minIntervalMs = 1000,
    speechIntervalMs = 2000,
    maxAgeMs = 8000
  }: VisionFrameDispatcherOptions = {}) {
    this.socketRef = socketRef;
    this.minIntervalMs = Math.max(500, minIntervalMs);
    this.speechIntervalMs = Math.max(this.minIntervalMs, speechIntervalMs);
    this.maxAgeMs = Math.max(this.minIntervalMs, maxAgeMs);

    this._unsubStart = eventBus.on(EVENTS.AUDIO_START, () => {
      this.isSpeaking = true;
      this.lastSpeechSentAt = Date.now();
    });
    this._unsubEnd = eventBus.on(EVENTS.AUDIO_END, () => {
      this.isSpeaking = false;
      this.lastSpeechSentAt = -Infinity;
      this.flushSoon(80);
    });
  }

  public setTransportSink(sink: TransportSink | null): void {
    this.transportSink = sink;
  }

  public queueFrame(frame: { source: string; base64: string; timestamp?: number; priority?: boolean }): boolean {
    if (this.destroyed || typeof frame?.base64 !== 'string' || frame.base64.length === 0) return false;

    const source = frame.source || 'screen';
    const createdAt = typeof frame.timestamp === 'number' ? frame.timestamp : Date.now();
    const priority = Boolean(frame.priority);

    // Overwrite previous frame for the same source to eliminate queue latency / backlog
    this.pending.set(source, {
      base64: frame.base64,
      source,
      timestamp: frame.timestamp,
      createdAt,
      priority,
      socket: this.socketRef?.current
    });

    const minDelay = this.isSpeaking && !priority
      ? Math.max(0, this.speechIntervalMs - (Date.now() - this.lastSpeechSentAt))
      : Math.max(0, this.minIntervalMs - (Date.now() - this.lastSentAt));
    this.flushSoon(minDelay);
    return true;
  }

  public enqueue(base64: string, source = 'vision', { priority = false }: { priority?: boolean } = {}): boolean {
    if (this.destroyed || typeof base64 !== 'string' || base64.length < 32) return false;
    if (!this.pending.has(source) && this.pending.size >= 8) return false;
    return this.queueFrame({ source, base64, timestamp: Date.now(), priority });
  }

  public setSocketRef(socketRef: { current: LiveSessionLike | null } | null): void {
    if (this.socketRef !== socketRef) this.reset();
    this.socketRef = socketRef;
  }

  public clearSource(source: string): void {
    this.pending.delete(source);
    if (!this.pending.size && this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
      this.timerDueAt = 0;
    }
  }

  public flushSoon(delay = 0): void {
    if (this.destroyed || !this.pending.size) return;
    const dueAt = Date.now() + Math.max(0, delay);
    if (this.timer && this.timerDueAt <= dueAt) return;
    if (this.timer) clearTimeout(this.timer);
    this.timerDueAt = dueAt;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.timerDueAt = 0;
      void this.flush();
    }, Math.max(0, delay));
  }

  public flush(): boolean {
    if (this.destroyed || !this.pending.size) return false;

    // Direct transport sink bypass (used in unit tests and specialized pipelines)
    if (this.transportSink) {
      const frame = [...this.pending.values()].find(candidate => candidate.priority)
        ?? this.pending.values().next().value;
      if (!frame) return false;
      this.pending.delete(frame.source);
      this.lastSentAt = Date.now();
      try {
        this.transportSink(frame);
        return true;
      } catch (err) {
        logger.warn('VISION', 'Fallo al despachar en transportSink:', err);
        return false;
      }
    }

    const socket = this.socketRef?.current;
    const now = Date.now();

    for (const [source, pending] of this.pending) {
      if (now - pending.createdAt > this.maxAgeMs || (pending.socket && pending.socket !== socket)) {
        this.pending.delete(source);
      }
    }

    const frame = [...this.pending.values()].find(candidate => candidate.priority)
      ?? this.pending.values().next().value;
    if (!frame) return false;

    const remaining = this.minIntervalMs - (now - this.lastSentAt);
    if (remaining > 0) {
      this.flushSoon(remaining);
      return false;
    }

    if (this.isSpeaking && !frame.priority) {
      const speechRemaining = this.speechIntervalMs - (now - this.lastSpeechSentAt);
      if (speechRemaining > 0) {
        this.flushSoon(speechRemaining);
        return false;
      }
    }

    const ws = socket?.websocket;
    const openState = globalThis.WebSocket?.OPEN ?? 1;
    if (!socket?.isConnected || !ws || ws.readyState !== openState) {
      this.flushSoon(500);
      return false;
    }

    // Congestion Backpressure: drop older frames if WS buffer exceeds 64KB
    if (ws.bufferedAmount > 65536) {
      this.flushSoon(100);
      return false;
    }

    try {
      const sent = socket.sendRealtimeMedia?.(frame.base64, 'image/jpeg', frame.priority);
      if (sent !== false) {
        if (this.pending.get(frame.source) === frame) this.pending.delete(frame.source);
        this.lastSentAt = Date.now();
        if (this.isSpeaking && !frame.priority) this.lastSpeechSentAt = this.lastSentAt;
        this.flushSoon(this.minIntervalMs);
        return true;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn('VISION', 'No se pudo enviar el fotograma:', msg);
    }
    this.flushSoon(250);
    return false;
  }

  public reset(): void {
    this.pending.clear();
    this.lastSentAt = -Infinity;
    this.lastSpeechSentAt = -Infinity;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timerDueAt = 0;
  }

  public destroy(): void {
    this.destroyed = true;
    this.reset();
    this.transportSink = null;
    this._unsubStart?.();
    this._unsubEnd?.();
    this._unsubStart = this._unsubEnd = null;
  }
}

export const visionFrameDispatcher = new VisionFrameDispatcher();
export default visionFrameDispatcher;
