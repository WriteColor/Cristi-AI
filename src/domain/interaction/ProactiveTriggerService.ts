/**
 * Cristi AI - Proactive Trigger & Autonomous Behavior Engine
 */

import { eventBus, EVENTS } from '../../infrastructure/events/eventBus';
import { toastService } from '../../infrastructure/notifications/toastService';
import { soundFxService } from '../audio/SoundFxService';
import { contextualEmotionOrchestrator } from '../live2d/ContextualEmotionOrchestrator';
import { logger } from '../../infrastructure/logging/logger';
import { memoryService, type MemoryService } from '../integrations/memory/MemoryService';

const MIN_GLOBAL_INTERVENTION_COOLDOWN_MS = 30000;
const SILENCE_INTERVENTION_COOLDOWN_MS = 180000;
const PROACTIVE_TOPIC_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_QUEUED_INTERVENTIONS = 3;
const INTERVENTION_TTL_MS = 60000;

export interface ArbiterEvaluationResult {
  allowed: boolean;
  score: number;
  reason: string;
  remainingCooldownMs?: number;
}

export interface ProactiveContextItem {
  id: string;
  category?: string;
  content: string;
}

export class ProactiveArbiter {
  private minRelevanceThreshold: number;
  private userSpeechCooldownMs: number;
  private topicCooldownMs: number;
  private lastUserSpeechEnded = 0;
  private lastModelTurnWasQuestion = false;
  private userAnsweredSinceLastQuestion = true;

  constructor({
    minRelevanceThreshold = 0.65,
    userSpeechCooldownMs = 15000,
    topicCooldownMs = 30 * 60 * 1000
  }: {
    minRelevanceThreshold?: number;
    userSpeechCooldownMs?: number;
    topicCooldownMs?: number;
  } = {}) {
    this.minRelevanceThreshold = minRelevanceThreshold;
    this.userSpeechCooldownMs = userSpeechCooldownMs;
    this.topicCooldownMs = topicCooldownMs;
  }

  recordUserSpeechEnded(timestamp = Date.now()): void {
    this.lastUserSpeechEnded = timestamp;
    this.userAnsweredSinceLastQuestion = true;
  }

  recordModelSpoke(text = '', isQuestion = false): void {
    this.lastModelTurnWasQuestion = isQuestion || (typeof text === 'string' && (text.includes('?') || text.includes('¿')));
    if (this.lastModelTurnWasQuestion) {
      this.userAnsweredSinceLastQuestion = false;
    }
  }

  evaluate({
    silenceSec = 0,
    context = [],
    now = Date.now(),
    isModelSpeaking = false,
    isUserSpeaking = false,
    gameThreat = null
  }: {
    silenceSec?: number;
    context?: ProactiveContextItem[];
    now?: number;
    isModelSpeaking?: boolean;
    isUserSpeaking?: boolean;
    gameThreat?: unknown;
  } = {}): ArbiterEvaluationResult {
    if (isModelSpeaking) {
      return { allowed: false, reason: 'model_speaking', score: 0 };
    }
    if (isUserSpeaking) {
      return { allowed: false, reason: 'user_speaking', score: 0 };
    }
    if (this.lastUserSpeechEnded && now - this.lastUserSpeechEnded < this.userSpeechCooldownMs) {
      return { allowed: false, reason: 'user_speech_cooldown', score: 0, remainingCooldownMs: this.userSpeechCooldownMs - (now - this.lastUserSpeechEnded) };
    }
    if (this.lastModelTurnWasQuestion && !this.userAnsweredSinceLastQuestion && !gameThreat) {
      return { allowed: false, reason: 'question_chaining_veto', score: 0 };
    }

    let score = 0.5;
    if (gameThreat) {
      score += 0.4;
    }
    if (Array.isArray(context) && context.length > 0) {
      score += 0.15;
      const hasTaskOrProject = context.some((c) => ['task', 'project', 'episodic'].includes(c?.category || ''));
      const hasConversationOrPref = context.some((c) => ['preference', 'conversation', 'fact'].includes(c?.category || ''));
      if (hasTaskOrProject) score += 0.15;
      else if (hasConversationOrPref) score += 0.10;
      score = Math.min(1.0, score + Math.min(0.2, context.length * 0.05));
    } else if (!gameThreat) {
      return { allowed: false, reason: 'no_context', score: 0.2 };
    }

    if (silenceSec >= 30) score = Math.min(1.0, score + 0.05);

    const allowed = score >= this.minRelevanceThreshold;
    return {
      allowed,
      score: Math.round(score * 100) / 100,
      reason: allowed ? 'passed' : 'below_threshold'
    };
  }
}

export interface FocusTimerState {
  active: boolean;
  mode: 'work' | 'break';
  durationMinutes: number;
  remainingSeconds: number;
  sessionsCompleted: number;
}

export interface QueuedIntervention {
  id: string;
  text: string;
  timestamp: number;
  priority?: number;
}

export interface ProactiveTriggerConfig {
  id: string;
  intervalSeconds?: number;
  condition: () => unknown;
  action: (result: unknown) => void;
  lastExecuted?: number;
}

export interface SocketLike {
  isConnected?: boolean;
  isConnecting?: boolean;
  sendTextMessage?: (text: string) => void;
}

export class ProactiveTriggerService {
  private isRunning = false;
  private activeTriggers = new Map<string, Required<ProactiveTriggerConfig>>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private geminiSocket: SocketLike | null = null;
  private memory: MemoryService;
  private arbiter: ProactiveArbiter;
  private unsubscribers: Array<() => void> = [];

  private focusTimer: FocusTimerState = {
    active: false,
    mode: 'work',
    durationMinutes: 25,
    remainingSeconds: 25 * 60,
    sessionsCompleted: 0
  };

  private lastUserActivityTimestamp = Date.now();
  private sessionStartTimestamp = Date.now();
  private lastHydrationPrompt = Date.now();
  private lastFatiguePrompt = Date.now();
  private lastInactivityDwell = Date.now();
  private lastTimePeriodGreeting: string | null = null;

  private lastDialogueTimestamp = Date.now();
  private silenceThresholdSec = 35 + Math.floor(Math.random() * 15);
  private inquiryIndex = Math.floor(Math.random() * 8);

  private lastAutonomousInterventionTime = 0;
  private isModelSpeaking = false;
  private isUserSpeaking = false;
  private interventionQueue: QueuedIntervention[] = [];
  private recentProactiveMemoryIds = new Map<string, number>();

  constructor({ geminiSocket = null, memory = memoryService, arbiter = null }: { geminiSocket?: SocketLike | null; memory?: MemoryService; arbiter?: ProactiveArbiter | null } = {}) {
    this.geminiSocket = geminiSocket;
    this.memory = memory;
    this.arbiter = arbiter || new ProactiveArbiter();

    this.initDefaultTriggers();
    this.bindEvents();
  }

  setGeminiSocket(socket: SocketLike | null): void {
    this.geminiSocket = socket;
    if (socket) {
      this.recordDialogueActivity();
    }
  }

  recordDialogueActivity(): void {
    this.lastDialogueTimestamp = Date.now();
    this.lastUserActivityTimestamp = Date.now();
    this.silenceThresholdSec = 35 + Math.floor(Math.random() * 15);
  }

  bindEvents(): void {
    this.unsubscribers.push(
      eventBus.on(EVENTS.SPEECH_START, () => {
        this.isModelSpeaking = true;
        this.recordDialogueActivity();
      })
    );

    this.unsubscribers.push(
      eventBus.on(EVENTS.SPEECH_END, () => {
        this.isModelSpeaking = false;
        this.recordDialogueActivity();
        this.processInterventionQueue();
      })
    );

    this.unsubscribers.push(
      eventBus.on(EVENTS.USER_SPEAKING, () => {
        this.isUserSpeaking = true;
        this.recordDialogueActivity();
      })
    );

    this.unsubscribers.push(
      eventBus.on(EVENTS.USER_STOPPED_SPEAKING, () => {
        this.isUserSpeaking = false;
        this.arbiter.recordUserSpeechEnded(Date.now());
        this.recordDialogueActivity();
      })
    );

    this.unsubscribers.push(
      eventBus.on('game.threat_alert', (envelope: unknown) => {
        const threat = ((envelope && typeof envelope === 'object' && 'payload' in envelope)
          ? (envelope as { payload: unknown }).payload
          : envelope) as { alertType?: string; health?: number };
        this.handleGameThreatAlert(threat);
      })
    );

    this.unsubscribers.push(
      eventBus.on(EVENTS.DISTRACTION_ALERT, (data: unknown) => {
        this.handleDistractionAlert(data as { message?: string; duration?: number });
      })
    );

    this.unsubscribers.push(
      eventBus.on(EVENTS.SCENE_STATE_CHANGED, (sceneState: unknown) => {
        this.handleSceneStateChanged(String(sceneState));
      })
    );
  }

  initDefaultTriggers(): void {
    this.registerTrigger({
      id: 'routine_time_of_day',
      intervalSeconds: 60,
      condition: () => {
        const hour = new Date().getHours();
        let currentPeriod = 'night';
        if (hour >= 6 && hour < 12) currentPeriod = 'morning';
        else if (hour >= 12 && hour < 19) currentPeriod = 'afternoon';
        else if (hour >= 19 && hour < 23) currentPeriod = 'evening';

        if (this.lastTimePeriodGreeting !== currentPeriod) {
          this.lastTimePeriodGreeting = currentPeriod;
          return { period: currentPeriod };
        }
        return false;
      },
      action: (result) => {
        const { period } = result as { period: string };
        const poses: Record<string, string> = {
          morning: 'happy',
          afternoon: 'relaxed',
          evening: 'relaxed',
          night: 'thinking'
        };
        contextualEmotionOrchestrator.triggerEmotion?.(poses[period] || 'idle', 'proactive_time_of_day');
      }
    });

    this.registerTrigger({
      id: 'routine_hydration_stretch',
      intervalSeconds: 120,
      condition: () => {
        const elapsed = (Date.now() - this.lastHydrationPrompt) / (1000 * 60);
        if (elapsed >= 45) {
          this.lastHydrationPrompt = Date.now();
          return true;
        }
        return false;
      },
      action: () => {
        toastService.info('Recordatorio Ergonómico', '45 minutos de uso continuo de pantalla.');
        soundFxService.playNotification();
        eventBus.emit(EVENTS.WIDGET_TRIGGERED, {
          id: 'widget_hydration',
          type: 'reminder',
          title: 'Recordatorio Ergonómico',
          message: 'Pausa de 45m: se recomienda estirar o hidratarse.',
          iconName: 'Sparkles',
          color: '#38bdf8'
        });
      }
    });

    this.registerTrigger({
      id: 'routine_inactivity_monitor',
      intervalSeconds: 60,
      condition: () => {
        const idleSec = (Date.now() - this.lastUserActivityTimestamp) / 1000;
        const dwellElapsed = (Date.now() - this.lastInactivityDwell) / 1000;
        if (idleSec >= 900 && dwellElapsed >= 900) {
          this.lastInactivityDwell = Date.now();
          return { idleMinutes: Math.round(idleSec / 60) };
        }
        return false;
      },
      action: () => {
        contextualEmotionOrchestrator.triggerEmotion?.('relaxed', 'proactive_idle');
      }
    });

    this.registerTrigger({
      id: 'routine_inquisitive_silence_breaker',
      intervalSeconds: 3,
      condition: () => {
        const socket = this.geminiSocket;
        if (!socket || !socket.isConnected || socket.isConnecting) return false;
        if (this.isModelSpeaking || this.isUserSpeaking) return false;

        const now = Date.now();
        const silenceSec = (now - this.lastDialogueTimestamp) / 1000;
        const cooldownSec = (now - this.lastAutonomousInterventionTime) / 1000;

        if (silenceSec >= this.silenceThresholdSec && cooldownSec >= SILENCE_INTERVENTION_COOLDOWN_MS / 1000) {
          return { silenceSec };
        }
        return false;
      },
      action: (result) => {
        const { silenceSec } = result as { silenceSec: number };
        this.triggerInquisitiveConversationStarter(silenceSec);
      }
    });
  }

  triggerInquisitiveConversationStarter(silenceSec: number): { sent: boolean; reason?: string; score?: number; memoryIds?: string[] } {
    const now = Date.now();
    this._pruneProactiveTopics(now);
    const context: ProactiveContextItem[] = this.memory.getProactiveContext?.({
      limit: 4,
      excludeMemoryIds: [...this.recentProactiveMemoryIds.keys()]
    }) || [];

    const evaluation = this.arbiter.evaluate({
      silenceSec,
      context,
      now,
      isModelSpeaking: this.isModelSpeaking,
      isUserSpeaking: this.isUserSpeaking
    });

    if (!evaluation.allowed) {
      return { sent: false, reason: evaluation.reason, score: evaluation.score };
    }

    eventBus.emitDomain(EVENTS.USER_SILENCE, {
      silenceSec,
      score: evaluation.score,
      memoryIds: context.map((memory) => memory.id)
    }, { source: 'proactive', sessionId: this.memory.currentSessionId, privacy: 'internal' });

    const memoryLines = context.map((memory) => `- [${memory.category}] ${memory.content}`).join('\n');
    const promptText = `[SISTEMA PROACTIVO - OPORTUNIDAD CONTEXTUAL]\nHan pasado aproximadamente ${Math.round(silenceSec)} segundos sin diálogo (pertinencia calculada: ${evaluation.score}). Decide de forma autónoma si vale la pena intervenir. Si intervienes, formula una sola pregunta o comentario natural, breve y específico usando un solo tema del contexto; retoma algo pendiente o muestra curiosidad real. No uses preguntas genéricas ni plantillas repetidas, no encadenes preguntas y guarda información solo si el usuario aporta algo estable. Si no puedes decir algo específico y oportuno sobre este contexto, no respondas.\nContexto recuperado:\n${memoryLines}`;

    this.recordDialogueActivity();
    this.lastAutonomousInterventionTime = now;
    this.arbiter.recordModelSpoke(promptText, true);
    for (const memory of context) this.recentProactiveMemoryIds.set(memory.id, now);

    logger.info('PROACTIVE', `Iniciando conversación autónoma tras ${Math.round(silenceSec)}s de silencio (score: ${evaluation.score}):`, promptText);

    if (this.geminiSocket && typeof this.geminiSocket.sendTextMessage === 'function') {
      this.geminiSocket.sendTextMessage(promptText);
      return { sent: true, score: evaluation.score, memoryIds: context.map((memory) => memory.id) };
    }
    return { sent: false, reason: 'socket_unavailable' };
  }

  private _pruneProactiveTopics(now = Date.now()): void {
    for (const [memoryId, usedAt] of this.recentProactiveMemoryIds) {
      if (now - usedAt >= PROACTIVE_TOPIC_COOLDOWN_MS) this.recentProactiveMemoryIds.delete(memoryId);
    }
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('PROACTIVE', 'Motor de Triggers Autónomos y Rutinas Proactivas iniciado.');

    this.intervalId = setInterval(() => {
      this.tick();
    }, 1000);
  }

  stop(): void {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  destroy(): void {
    this.stop();
    this.unsubscribers.forEach((fn) => {
      try { fn(); } catch {
        // ignore unsubscribe error
      }
    });
    this.unsubscribers = [];
    this.activeTriggers.clear();
    this.interventionQueue = [];
    this.recentProactiveMemoryIds.clear();
  }

  registerTrigger(triggerConfig: ProactiveTriggerConfig): boolean {
    const { id, intervalSeconds = 10, condition, action } = triggerConfig;
    if (!id || typeof condition !== 'function' || typeof action !== 'function') return false;

    this.activeTriggers.set(id, {
      id,
      intervalSeconds,
      condition,
      action,
      lastExecuted: 0
    });
    return true;
  }

  unregisterTrigger(id: string): boolean {
    return this.activeTriggers.delete(id);
  }

  tick(): void {
    const now = Date.now();

    // 1. Evaluate Focus Timer (Pomodoro)
    if (this.focusTimer.active) {
      this.focusTimer.remainingSeconds--;
      if (this.focusTimer.remainingSeconds <= 0) {
        this.handleFocusTimerComplete();
      }
    }

    // 2. Evaluate Registered Proactive Triggers
    for (const [id, trigger] of this.activeTriggers.entries()) {
      const elapsed = (now - trigger.lastExecuted) / 1000;
      if (elapsed >= trigger.intervalSeconds) {
        try {
          const conditionResult = trigger.condition();
          if (conditionResult) {
            trigger.lastExecuted = now;
            trigger.action(conditionResult);
          }
        } catch (err) {
          const error = err as Error;
          logger.warn('PROACTIVE', `Error evaluando trigger "${id}":`, error.message);
        }
      }
    }

    // 3. Process queued interventions if conditions are met
    this.processInterventionQueue();
  }

  handleGameThreatAlert(threat: { alertType?: string; health?: number }): void {
    const text = threat?.alertType === 'bot_death'
      ? '[SISTEMA PROACTIVO - ALERTA DE JUEGO]: Acabas de morir en el juego. Comenta con sorpresa o frustración divertida a Jeremy.'
      : `[SISTEMA PROACTIVO - ALERTA DE JUEGO]: Tu salud está baja (${threat?.health || 5}/20) en el juego. Pídele ayuda o avísale a Jeremy con urgencia natural.`;
    this.queueIntervention({
      id: `game_threat_${Date.now()}`,
      text,
      priority: 3
    });
  }

  handleDistractionAlert(data: { message?: string; duration?: number }): void {
    const now = Date.now();
    if (now - this.lastAutonomousInterventionTime < MIN_GLOBAL_INTERVENTION_COOLDOWN_MS) {
      return;
    }

    this.lastAutonomousInterventionTime = now;
    contextualEmotionOrchestrator.triggerEmotion?.('pout', 'distraction_alert');
    toastService.warn('Detección de Distracción', data?.message || 'Uso prolongado de dispositivo detectado.');
    soundFxService.playNotification();

    this.queueIntervention({
      id: `distraction_${now}`,
      text: `[SISTEMA PROACTIVO: El usuario lleva más de ${data?.duration || 30}s usando el teléfono celular. Llama su atención con cariño y picardía para que vuelva a enfocarse contigo]`,
      priority: 2
    });
  }

  handleSceneStateChanged(sceneState: string): void {
    const now = Date.now();
    if (now - this.lastAutonomousInterventionTime < MIN_GLOBAL_INTERVENTION_COOLDOWN_MS) {
      return;
    }

    if (sceneState === 'OWNER_WITH_OTHERS') {
      this.lastAutonomousInterventionTime = now;
      contextualEmotionOrchestrator.triggerEmotion?.('yandere', 'scene_state_jealousy');
      toastService.info('Alerta Sensorial', 'Presencia de terceros detectada frente a la cámara.');
    } else if (sceneState === 'OWNER_ALONE') {
      contextualEmotionOrchestrator.triggerEmotion?.('happy', 'scene_state_owner_alone');
    }
  }

  queueIntervention(item: { id: string; text: string; priority?: number }): void {
    const now = Date.now();
    const entry: QueuedIntervention = {
      ...item,
      timestamp: now
    };

    this.interventionQueue = this.interventionQueue.filter(
      (q) => now - q.timestamp < INTERVENTION_TTL_MS
    );

    if (this.interventionQueue.length >= MAX_QUEUED_INTERVENTIONS) {
      this.interventionQueue.shift();
    }

    this.interventionQueue.push(entry);
    this.processInterventionQueue();
  }

  processInterventionQueue(): void {
    if (this.interventionQueue.length === 0) return;

    const now = Date.now();
    this.interventionQueue = this.interventionQueue.filter(
      (q) => now - q.timestamp < INTERVENTION_TTL_MS
    );

    if (this.interventionQueue.length === 0) return;

    const socket = this.geminiSocket;
    const isSocketReady = socket && socket.isConnected && !socket.isConnecting;

    if (!isSocketReady || this.isModelSpeaking || this.isUserSpeaking) {
      return;
    }

    if (now - this.lastAutonomousInterventionTime < MIN_GLOBAL_INTERVENTION_COOLDOWN_MS) {
      return;
    }

    const nextItem = this.interventionQueue.shift();
    if (nextItem && typeof socket.sendTextMessage === 'function') {
      this.lastAutonomousInterventionTime = now;
      logger.info('PROACTIVE', 'Disparando intervención proactiva a Gemini Live:', nextItem.text);
      socket.sendTextMessage(nextItem.text);
    }
  }

  startFocusSession(minutes = 25): void {
    this.focusTimer = {
      active: true,
      mode: 'work',
      durationMinutes: minutes,
      remainingSeconds: minutes * 60,
      sessionsCompleted: this.focusTimer.sessionsCompleted
    };

    toastService.info('Temporizador de Enfoque', `Sesión de concentración iniciada (${minutes}m).`);
    soundFxService.playConnect();
    contextualEmotionOrchestrator.triggerEmotion?.('gamer', 'focus_start');

    eventBus.emit(EVENTS.WIDGET_TRIGGERED, {
      id: 'widget_focus_timer',
      type: 'timer',
      title: 'Temporizador de Enfoque',
      message: `${minutes}m de trabajo activo.`,
      iconName: 'Clock',
      color: '#a855f7'
    });
  }

  handleFocusTimerComplete(): void {
    if (this.focusTimer.mode === 'work') {
      this.focusTimer.sessionsCompleted++;
      this.focusTimer.mode = 'break';
      this.focusTimer.durationMinutes = 5;
      this.focusTimer.remainingSeconds = 5 * 60;

      toastService.info('Temporizador de Enfoque', 'Ciclo de trabajo completado. Inicio de pausa de 5 min.');
      soundFxService.playNotification();
      contextualEmotionOrchestrator.triggerEmotion?.('happy', 'focus_complete');
    } else {
      this.focusTimer.active = false;
      this.focusTimer.mode = 'work';
      toastService.info('Temporizador de Enfoque', 'Pausa finalizada.');
      soundFxService.playNotification();
    }
  }

  stopFocusSession(): void {
    this.focusTimer.active = false;
    eventBus.emit(EVENTS.WIDGET_DISMISSED, { id: 'widget_focus_timer' });
    toastService.info('Temporizador de Enfoque', 'Sesión detenida.');
  }

  recordUserActivity(): void {
    this.lastUserActivityTimestamp = Date.now();
  }

  getTelemetry(): {
    isRunning: boolean;
    activeTriggersCount: number;
    focusSession: FocusTimerState;
    sessionDurationMinutes: number;
    timeSinceLastActivitySeconds: number;
    queuedInterventionsCount: number;
  } {
    return {
      isRunning: this.isRunning,
      activeTriggersCount: this.activeTriggers.size,
      focusSession: { ...this.focusTimer },
      sessionDurationMinutes: Math.round((Date.now() - this.sessionStartTimestamp) / (1000 * 60)),
      timeSinceLastActivitySeconds: Math.round((Date.now() - this.lastUserActivityTimestamp) / 1000),
      queuedInterventionsCount: this.interventionQueue.length
    };
  }
}

export const proactiveTriggerService = new ProactiveTriggerService();
export default proactiveTriggerService;
