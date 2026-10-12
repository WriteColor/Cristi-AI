/**
 * Cristi AI - Proactive Scheduler & Task Manager
 * High-level orchestration for scheduled reminders, alarms, periodic health checks,
 * approaching alerts, and autonomous companion awareness.
 */

// @ts-ignore
import { eventBus, EVENTS } from '../../infrastructure/events/eventBus.ts';
// @ts-ignore
import { soundFxService } from '../audio/SoundFxService.ts';

type SchedulerLogger = {
  info: (tag: string, message: string, ...args: unknown[]) => void;
  warn: (tag: string, message: string, ...args: unknown[]) => void;
  error: (tag: string, message: string, ...args: unknown[]) => void;
};

type SchedulerToast = {
  info: (title: string, description?: string) => void;
  alarm: (title: string, description?: string) => void;
};

let logger: SchedulerLogger = {
  info: (tag: string, msg: string, ...args: unknown[]) => console.log(`[${tag}] ${msg}`, ...args),
  warn: (tag: string, msg: string, ...args: unknown[]) => console.warn(`[${tag}] ${msg}`, ...args),
  error: (tag: string, msg: string, ...args: unknown[]) => console.error(`[${tag}] ${msg}`, ...args)
};

let toastService: SchedulerToast = {
  info: (_title: string, _desc?: string) => {},
  alarm: (_title: string, _desc?: string) => {}
};

try {
  import('../../infrastructure/logging/logger.js')
    .then(m => {
      if (m?.logger) logger = m.logger;
    })
    .catch(() => {});
  import('../../infrastructure/notifications/toastService.js')
    .then(m => {
      if (m?.toastService) toastService = m.toastService;
    })
    .catch(() => {});
} catch (_) {}

const STORAGE_KEY_SCHEDULED_TASKS = 'cristi_ai_scheduled_tasks';

export interface ScheduledTask {
  id: string;
  type: 'reminder' | 'alarm';
  targetTime: string;
  title: string;
  label?: string;
  tag?: string;
  action?: ((task: ScheduledTask) => void) | null;
  executed: boolean;
  approachingAlerted: boolean;
  createdAt: number;
  minutesRemaining?: number;
}

export interface SocketWithTextSender {
  isConnected?: boolean;
  isConnecting?: boolean;
  sendTextMessage?: (text: string) => void;
}

export class ProactiveScheduler {
  private scheduledTasks = new Map<string, ScheduledTask>();
  private activeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;
  private geminiSocket: SocketWithTextSender | null = null;

  constructor() {
    this.init();
  }

  setGeminiSocket(socket: SocketWithTextSender | null): void {
    this.geminiSocket = socket;
  }

  init(): void {
    this.loadFromStorage();
    if (typeof setInterval !== 'undefined') {
      this.checkIntervalId = setInterval(() => this.tick(), 1000);
      if (this.checkIntervalId && typeof this.checkIntervalId === 'object' && 'unref' in this.checkIntervalId) {
        (this.checkIntervalId as { unref?: () => void }).unref?.();
      }
    }

    eventBus.on(EVENTS.WIDGET_DISMISSED, (payload: unknown) => {
      const p = payload as { id?: string | number };
      if (p?.id) this.cancelTask(String(p.id));
    });
  }

  loadFromStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY_SCHEDULED_TASKS);
      if (!raw) return;
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const task of list) {
          if (task && task.id && !task.executed) {
            this.scheduledTasks.set(String(task.id), task);
          }
        }
      }
    } catch {
      // ignore storage parsing error
    }
  }

  saveToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const list = Array.from(this.scheduledTasks.values());
      localStorage.setItem(STORAGE_KEY_SCHEDULED_TASKS, JSON.stringify(list));
    } catch {
      // ignore storage write error
    }
  }

  /**
   * Schedule a one-time or recurring reminder
   */
  scheduleReminder({
    id = `reminder_${Date.now()}`,
    time,
    title,
    tag = 'Cristi',
    action = null
  }: {
    id?: string;
    time: string;
    title: string;
    tag?: string;
    action?: ((task: ScheduledTask) => void) | null;
  }): ScheduledTask {
    const task: ScheduledTask = {
      id: String(id),
      type: 'reminder',
      targetTime: time,
      title,
      tag,
      action,
      executed: false,
      approachingAlerted: false,
      createdAt: Date.now()
    };
    this.scheduledTasks.set(String(id), task);
    this.saveToStorage();
    logger.info('SCHEDULER', `Recordatorio programado "${title}" para las ${time}`);
    return task;
  }

  /**
   * Schedule an alarm
   */
  scheduleAlarm({
    id = `alarm_${Date.now()}`,
    time,
    label = 'Alarma',
    action = null
  }: {
    id?: string;
    time: string;
    label?: string;
    action?: ((task: ScheduledTask) => void) | null;
  }): ScheduledTask {
    const task: ScheduledTask = {
      id: String(id),
      type: 'alarm',
      targetTime: time,
      label,
      title: `Alarma: ${label}`,
      action,
      executed: false,
      approachingAlerted: false,
      createdAt: Date.now()
    };
    this.scheduledTasks.set(String(id), task);
    this.saveToStorage();
    logger.info('SCHEDULER', `Alarma programada "${label}" para las ${time}`);
    return task;
  }

  /**
   * Schedule a countdown timer with proactive completion feedback
   */
  scheduleTimer({
    durationSeconds,
    label,
    action
  }: {
    durationSeconds: number;
    label?: string;
    action?: () => void;
  }): { id: string; durationSeconds: number; label: string } {
    const id = `timer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timerLabel = label && label.trim() ? label.trim() : 'Temporizador';
    const duration = Math.max(1, Math.round(durationSeconds));

    logger.info('SCHEDULER', `Temporizador iniciado: "${timerLabel}" por ${duration}s.`);

    const timerTimeout = setTimeout(() => {
      this.activeTimers.delete(id);
      try {
        action?.();
      } catch (err) {
        logger.error('SCHEDULER', `Error en callback de temporizador ${id}:`, err);
      }

      eventBus.emit(EVENTS.WIDGET_TRIGGERED, {
        id,
        type: 'timer',
        title: `Temporizador finalizado: ${timerLabel}`,
        content: `El temporizador de ${duration} segundos ha concluido.`,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        duration: 10000
      });

      if (this.geminiSocket && this.geminiSocket.isConnected && typeof this.geminiSocket.sendTextMessage === 'function') {
        this.geminiSocket.sendTextMessage(`[AVISO PROACTIVO DE CRISTI: El temporizador "${timerLabel}" de ${duration} segundos ha finalizado. Infórmaselo de viva voz a tu usuario con cariño.]`);
      }
    }, duration * 1000);

    if (timerTimeout && typeof timerTimeout === 'object' && 'unref' in timerTimeout) {
      (timerTimeout as { unref?: () => void }).unref?.();
    }

    this.activeTimers.set(id, timerTimeout);

    return {
      id,
      durationSeconds: duration,
      label: timerLabel
    };
  }

  /**
   * Schedule an autonomous trigger for follow-up or proactive execution
   */
  scheduleAutonomousTrigger({
    delaySeconds,
    actionName,
    description,
    payload
  }: {
    delaySeconds: number;
    actionName: string;
    description: string;
    payload?: unknown;
  }): { id: string; delaySeconds: number; actionName: string; description: string } {
    const id = `trigger_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const delay = Math.max(1, Math.round(delaySeconds));

    logger.info('SCHEDULER', `Disparador autónomo programado: "${actionName}" en ${delay}s (${description}).`);

    const triggerTimeout = setTimeout(() => {
      this.activeTimers.delete(id);
      logger.info('SCHEDULER', `Disparador autónomo activado: "${actionName}" (${description}).`);

      if (this.geminiSocket && this.geminiSocket.isConnected && typeof this.geminiSocket.sendTextMessage === 'function') {
        this.geminiSocket.sendTextMessage(`[SEGUIMIENTO AUTÓNOMO ACTIVADO: Acción "${actionName}" - ${description}. Retoma el tema o ejecuta la acción con tu usuario.]`);
      }
    }, delay * 1000);

    if (triggerTimeout && typeof triggerTimeout === 'object' && 'unref' in triggerTimeout) {
      (triggerTimeout as { unref?: () => void }).unref?.();
    }

    this.activeTimers.set(id, triggerTimeout);

    return {
      id,
      delaySeconds: delay,
      actionName,
      description
    };
  }

  /**
   * Cancel or dismiss a scheduled task or timer
   */
  cancelTask(id: string | number): boolean {
    const strId = String(id);
    if (this.activeTimers.has(strId)) {
      const timer = this.activeTimers.get(strId);
      if (timer) clearTimeout(timer);
      this.activeTimers.delete(strId);
    }
    const deleted = this.scheduledTasks.delete(strId);
    this.saveToStorage();
    return deleted;
  }

  /**
   * Calculate minutes remaining until a given "HH:mm" time
   */
  calculateMinutesRemaining(targetTimeStr?: string): number | null {
    if (!targetTimeStr || typeof targetTimeStr !== 'string') return null;
    const parts = targetTimeStr.split(':');
    if (parts.length < 2) return null;
    const targetHour = parseInt(parts[0], 10);
    const targetMin = parseInt(parts[1], 10);
    if (isNaN(targetHour) || isNaN(targetMin)) return null;

    const now = new Date();
    const targetDate = new Date(now);
    targetDate.setHours(targetHour, targetMin, 0, 0);

    let diffMs = targetDate.getTime() - now.getTime();
    if (diffMs < -60000) {
      targetDate.setDate(targetDate.getDate() + 1);
      diffMs = targetDate.getTime() - now.getTime();
    }

    return Math.round(diffMs / 60000);
  }

  /**
   * Get all upcoming tasks sorted by minutes remaining
   */
  getUpcomingTasks(withinMinutes = 180): ScheduledTask[] {
    const list: ScheduledTask[] = [];
    for (const task of this.scheduledTasks.values()) {
      if (task.executed) continue;
      const minutesRemaining = this.calculateMinutesRemaining(task.targetTime);
      if (minutesRemaining !== null && minutesRemaining >= 0 && minutesRemaining <= withinMinutes) {
        list.push({
          ...task,
          minutesRemaining
        });
      }
    }
    return list.sort((a, b) => (a.minutesRemaining ?? 0) - (b.minutesRemaining ?? 0));
  }

  /**
   * Generate contextual prompt for Gemini Live awareness
   */
  getPromptContext(): string {
    const upcoming = this.getUpcomingTasks(180);
    if (upcoming.length === 0) return '';

    const lines = upcoming.map((t) => {
      const kind = t.type === 'alarm' ? 'Alarma' : 'Recordatorio';
      const name = t.label || t.title;
      const min = t.minutesRemaining ?? 0;
      const minStr = min <= 0 ? '¡es ahora mismo!' : `faltan ${min} min`;
      return `- ${kind} "${name}" programada para las ${t.targetTime} (${minStr})`;
    });

    return `\n\n[ALARMAS Y RECORDATORIOS ACTIVOS EN EL SISTEMA:\n${lines.join('\n')}\nTen siempre presentes estas alarmas y fechas en tu conversación. Si falta poco tiempo para una de ellas (o es la hora), menciónaselo a tu usuario cariñosamente para que esté preparado.]`;
  }

  /**
   * Evaluate scheduled tasks every second
   */
  tick(): void {
    const now = new Date();
    const currentTimeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    for (const [id, task] of this.scheduledTasks.entries()) {
      if (task.executed) continue;

      const minutesRemaining = this.calculateMinutesRemaining(task.targetTime);

      // 1. Approaching Alert (when <= 5 minutes away and not yet notified)
      if (minutesRemaining !== null && minutesRemaining > 0 && minutesRemaining <= 5 && !task.approachingAlerted) {
        task.approachingAlerted = true;
        this.saveToStorage();

        logger.info('SCHEDULER', `Alarma/Recordatorio "${task.label || task.title}" próxima a cumplirse (faltan ${minutesRemaining}m).`);
        eventBus.emit(EVENTS.ALARM_APPROACHING, { task, minutesRemaining });

        if (this.geminiSocket && this.geminiSocket.isConnected && typeof this.geminiSocket.sendTextMessage === 'function') {
          const kind = task.type === 'alarm' ? 'alarma' : 'recordatorio';
          const name = task.label || task.title;
          this.geminiSocket.sendTextMessage(`[AVISO PROACTIVO DE CRISTI: Tu ${kind} "${name}" está muy cerca de cumplirse (a las ${task.targetTime}, quedan ${minutesRemaining} minutos). Menciónaselo a tu usuario con dulzura, cariño y atención.]`);
        }
      }

      // 2. Alarm Triggered (exact time)
      if (task.targetTime === currentTimeStr) {
        task.executed = true;
        this.saveToStorage();

        if (task.type === 'reminder') {
          eventBus.emit(EVENTS.WIDGET_TRIGGERED, {
            id: task.id,
            type: 'reminder',
            title: task.title,
            time: currentTimeStr,
            tag: task.tag,
            done: false
          });
          toastService.info('Recordatorio', task.title);
        } else if (task.type === 'alarm') {
          eventBus.emit(EVENTS.WIDGET_TRIGGERED, {
            id: task.id,
            type: 'alarm',
            title: `Alarma: ${task.label}`,
            time: currentTimeStr,
            tag: 'Alarma',
            done: false
          });
          toastService.alarm(`Alarma: ${task.label}`, `¡Es la hora programada (${currentTimeStr})!`);
        }

        soundFxService.playNotification();
        eventBus.emit(EVENTS.ALARM_TRIGGERED, { task });

        if (this.geminiSocket && this.geminiSocket.isConnected && typeof this.geminiSocket.sendTextMessage === 'function') {
          const kind = task.type === 'alarm' ? 'alarma' : 'recordatorio';
          const name = task.label || task.title;
          this.geminiSocket.sendTextMessage(`[ALARMA/RECORDATORIO ACTIVADO AHORA: Tu ${kind} "${name}" se acaba de activar en este momento (${currentTimeStr}). Avísale a tu usuario en voz alta con dulzura y estilo propio.]`);
        }

        if (typeof task.action === 'function') {
          try {
            task.action(task);
          } catch (err) {
            logger.error('SCHEDULER', `Error al ejecutar acción de tarea programada ${id}:`, err);
          }
        }
      }
    }
  }

  destroy(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    for (const timeout of this.activeTimers.values()) {
      clearTimeout(timeout);
    }
    this.activeTimers.clear();
    this.scheduledTasks.clear();
  }
}

export const proactiveScheduler = new ProactiveScheduler();
export default proactiveScheduler;
