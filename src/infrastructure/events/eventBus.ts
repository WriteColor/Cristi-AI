/**
 * Cristi AI - Decoupled Global Event Bus & Signal Hub (Strict TypeScript)
 * Enables high-performance, pub/sub reactive communication across AI, Audio,
 * Live2D Avatar, Hardware/Sensors, Game Integration, and UI layers.
 * 
 * Features:
 * - Robust error isolation: Handler errors do not halt notification pipeline
 * - Zero-leak memory lifecycle: Sets auto-purged on empty, clean unsubscribers returned
 * - Stream-rate GC optimization: High-frequency events (60Hz) excluded from historyBuffer
 * - Safe iteration: Snapshot array iteration immune to subscriber mutations during emit
 * - Typed domain event envelopes: Full support for emitDomain<T>(envelope: DomainEventEnvelope<T>)
 */

import type { DomainEventEnvelope } from '../../types/domain.types.js';

export type EventBusListener<T = any> = (data: T, timestamp: number) => void;
export type EventBusWildcardListener = (event: string, data: any, timestamp: number) => void;
export type EventUnsubscribe = () => void;

export interface EventHistoryItem<T = any> {
  event: string;
  data: T;
  timestamp: number;
}

const HIGH_FREQUENCY_STREAM_EVENTS = new Set([
  'audio_analysis',
  'audio_chunk',
  'parameter_changed',
  'gaze_target_changed',
  'vision_detections_updated'
]);

// Standard System Event Names Constants
export const EVENTS = {
  DOMAIN_EVENT: 'domain_event',
  CONFIG_CHANGED: 'config_changed',
  SESSION_STARTED: 'session_started',
  SESSION_ENDED: 'session_ended',

  // Audio & Voice Lifecycle
  AUDIO_START: 'audio_start',
  AUDIO_CHUNK: 'audio_chunk',
  AUDIO_ANALYSIS: 'audio_analysis',
  AUDIO_END: 'audio_end',
  SPEECH_START: 'speech_start',
  SPEECH_END: 'speech_end',
  USER_SPEAKING: 'user_speaking',
  USER_STOPPED_SPEAKING: 'user_stopped_speaking',
  BARGE_IN_TRIGGERED: 'barge_in_triggered',
  VOICE_DETECTED: 'voice_detected',

  // Live2D Avatar & Dynamics
  MODEL_LOADING: 'model_loading',
  MODEL_LOADED: 'model_loaded',
  MODEL_LOAD_FALLBACK: 'model_load_fallback',
  MODEL_LOAD_ERROR: 'model_load_error',
  MODEL_CHANGED: 'model_changed',
  EMOTION_CHANGED: 'emotion_changed',
  EXPRESSION_CHANGED: 'expression_changed',
  MOTION_REQUESTED: 'motion_requested',
  PARAMETER_CHANGED: 'parameter_changed',
  AVATAR_POSE_TRIGGERED: 'avatar_pose_triggered',
  GAZE_TARGET_CHANGED: 'gaze_target_changed',

  // Tool Calling & Agentic System
  TOOL_EXECUTION_START: 'tool_execution_start',
  TOOL_EXECUTION_END: 'tool_execution_end',
  TOOL_EXECUTION_LOGGED: 'tool_execution_logged',
  SCREEN_WATCH_CHANGED: 'screen_watch_changed',
  SCREEN_REGION_CHANGED: 'screen_region_changed',

  // Sensory Vision & Anti-procrastination
  VISION_DETECTIONS_UPDATED: 'vision_detections_updated',
  DISTRACTION_ALERT: 'distraction_alert',
  SCENE_STATE_CHANGED: 'scene_state_changed',
  SCENE_CHANGED: 'scene_changed',

  // External Hardware & IoT Sensors
  SENSOR_EVENT: 'sensor_event',
  EXTERNAL_DEVICE_EVENT: 'external_device_event',
  DEVICE_CONNECTED: 'device_connected',
  DEVICE_DISCONNECTED: 'device_disconnected',
  ACTUATOR_COMMAND: 'actuator_command',


  // Memory lifecycle and proactive opportunities
  MEMORY_RETRIEVED: 'memory_retrieved',
  MEMORY_CREATED: 'memory_created',
  MEMORY_UPDATED: 'memory_updated',
  MEMORY_INVALIDATED: 'memory_invalidated',
  USER_SILENCE: 'user_silence',

  // Futuristic HUD Toast Notifications
  TOAST_TRIGGERED: 'toast_triggered',

  // Dynamic Desktop Tactical Widgets & Alarms
  WIDGET_TRIGGERED: 'widget_triggered',
  WIDGET_DISMISSED: 'widget_dismissed',
  ALARM_TRIGGERED: 'alarm_triggered',
  ALARM_APPROACHING: 'alarm_approaching'
} as const;

export type SystemEventName = typeof EVENTS[keyof typeof EVENTS];

export class EventBus {
  private listeners: Map<string, Set<EventBusListener>> = new Map();
  private anyListeners: Set<EventBusWildcardListener> = new Set();
  private historyBuffer: Array<EventHistoryItem> = [];
  private maxHistory: number = 100;

  /**
   * Subscribe to an event with a generic payload type
   */
  public on<T = any>(event: string, callback: EventBusListener<T>): EventUnsubscribe {
    if (!event || typeof callback !== 'function') return () => {};

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventBusListener);

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.off(event, callback as EventBusListener);
    };
  }

  /**
   * Subscribe to an event once
   */
  public once<T = any>(event: string, callback: EventBusListener<T>): EventUnsubscribe {
    if (!event || typeof callback !== 'function') return () => {};

    let executed = false;
    const wrapper: EventBusListener<T> = (data: T, timestamp: number) => {
      if (executed) return;
      executed = true;
      this.off(event, wrapper as EventBusListener);
      try {
        callback(data, timestamp);
      } catch (err) {
        console.error(`[EventBus] Error in once-handler for event "${event}":`, err);
      }
    };

    return this.on<T>(event, wrapper);
  }

  /**
   * Unsubscribe from an event
   */
  public off<T = any>(event: string, callback: EventBusListener<T>): void {
    if (!event || !this.listeners.has(event)) return;
    const set = this.listeners.get(event)!;
    set.delete(callback as EventBusListener);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Alias for off()
   */
  public removeListener<T = any>(event: string, callback: EventBusListener<T>): void {
    this.off(event, callback);
  }

  /**
   * Remove all listeners for a given event, or all listeners if no event specified
   */
  public removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Check if any listeners exist for an event
   */
  public hasListeners(event: string): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }

  /**
   * Count active listeners for an event
   */
  public listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * Get raw array of active listeners for an event
   */
  public rawListeners<T = any>(event: string): Array<EventBusListener<T>> {
    const set = this.listeners.get(event);
    return set ? (Array.from(set) as Array<EventBusListener<T>>) : [];
  }

  /**
   * Wildcard listener subscribed to all emitted events
   */
  public onAny(callback: EventBusWildcardListener): EventUnsubscribe {
    if (typeof callback !== 'function') return () => {};
    this.anyListeners.add(callback);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.anyListeners.delete(callback);
    };
  }

  /**
   * Emit an event to all subscribers with data
   */
  public emit<T = any>(event: string, data?: T): void {
    if (!event) return;
    const timestamp = Date.now();

    // Only record non-stream discrete events to debug history buffer (avoids GC churn)
    if (!HIGH_FREQUENCY_STREAM_EVENTS.has(event)) {
      this.historyBuffer.push({ event, data, timestamp });
      if (this.historyBuffer.length > this.maxHistory) {
        this.historyBuffer.shift();
      }
    }

    const anyHandlers = Array.from(this.anyListeners);
    for (let i = 0; i < anyHandlers.length; i++) {
      try {
        anyHandlers[i](event, data, timestamp);
      } catch (err) {
        console.error(`[EventBus] Error in wildcard handler for event "${event}":`, err);
      }
    }

    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;

    // Snapshot iteration to prevent concurrent modification bugs
    const handlers = Array.from(set);
    for (let i = 0; i < handlers.length; i++) {
      try {
        handlers[i](data, timestamp);
      } catch (err) {
        console.error(`[EventBus] Error in handler for event "${event}":`, err);
      }
    }
  }

  /**
   * Clear all listeners and history
   */
  public clear(): void {
    this.listeners.clear();
    this.anyListeners.clear();
    this.historyBuffer = [];
  }

  /**
   * Get recent event history
   */
  public getHistory(count: number = 20): Array<EventHistoryItem> {
    return this.historyBuffer.slice(-count);
  }

  /**
   * Emit typed domain event envelope or overload with type/payload/metadata
   */
  public emitDomain<T = unknown>(envelope: DomainEventEnvelope<T>): DomainEventEnvelope<T>;
  public emitDomain<T = unknown>(
    type: string,
    payload?: T,
    metadata?: Partial<Omit<DomainEventEnvelope<T>, 'type' | 'payload'>>
  ): DomainEventEnvelope<T>;
  public emitDomain<T = unknown>(
    envelopeOrType: DomainEventEnvelope<T> | string,
    payload?: T,
    metadata?: Partial<Omit<DomainEventEnvelope<T>, 'type' | 'payload'>>
  ): DomainEventEnvelope<T> {
    let envelope: DomainEventEnvelope<T>;

    if (typeof envelopeOrType === 'object' && envelopeOrType !== null) {
      envelope = {
        ...envelopeOrType,
        source: envelopeOrType.source || 'system',
        correlationId: envelopeOrType.correlationId || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: envelopeOrType.timestamp || Date.now(),
        priority: envelopeOrType.priority ?? 'normal',
        privacy: envelopeOrType.privacy || 'internal'
      };
    } else {
      const typeStr = String(envelopeOrType);
      const meta = metadata || {};
      envelope = {
        type: typeStr,
        source: meta.source || 'system',
        sessionId: meta.sessionId ?? null,
        correlationId: meta.correlationId || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: meta.timestamp || Date.now(),
        priority: meta.priority ?? 'normal',
        privacy: meta.privacy || 'internal',
        payload: (payload !== undefined ? payload : ({} as T))
      };
    }

    this.emit<DomainEventEnvelope<T>>(EVENTS.DOMAIN_EVENT, envelope);
    this.emit<DomainEventEnvelope<T>>(envelope.type, envelope);
    return envelope;
  }
}

// Global Singleton Instance
export const eventBus = new EventBus();
export default eventBus;
