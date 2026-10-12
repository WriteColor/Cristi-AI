import type { IToolHandler, ToolExecutionContext } from '../IToolHandler';
// @ts-ignore
import { eventBus, EVENTS } from '../../../infrastructure/events/eventBus.ts';
// @ts-ignore
import { proactiveScheduler } from '../../interaction/ProactiveScheduler.ts';

export const setReminderHandler: IToolHandler = {
  name: 'set_reminder',
  declaration: {
    name: 'set_reminder',
    description: 'Crea y fija un recordatorio interactivo táctico en la pantalla para el usuario.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: {
          type: 'STRING',
          description: 'Título o contenido del recordatorio.'
        },
        time: {
          type: 'STRING',
          description: 'Hora programada (ej: "14:30"). Si se omite, se usa la hora actual.'
        },
        tag: {
          type: 'STRING',
          description: 'Etiqueta de categoría (ej: "Trabajo", "Salud", "Cristi").'
        }
      },
      required: ['title']
    }
  },
  async execute(args: { title?: string; time?: string; tag?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Programación de recordatorio cancelada por señal de aborto.', cancelled: true };
    const title = typeof args?.title === 'string' ? args.title : 'Recordatorio de Cristi';
    const time = typeof args?.time === 'string'
      ? args.time
      : new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const tag = typeof args?.tag === 'string' ? args.tag : 'Cristi';
    const id = `reminder_${Date.now()}`;

    const widgetData = {
      id,
      type: 'reminder',
      title,
      time,
      tag,
      done: false,
      created_at: Date.now()
    };

    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Programación de recordatorio cancelada antes de emitir evento.', cancelled: true };

    proactiveScheduler.scheduleReminder({ id, time, title, tag });
    eventBus.emit(EVENTS.WIDGET_TRIGGERED, widgetData);

    return {
      status: 'success',
      message: `Recordatorio "${title}" programado para las ${time}. Cristi estará atenta para avisarte cuando se acerque.`,
      widget: widgetData
    };
  }
};

export const setAlarmHandler: IToolHandler = {
  name: 'set_alarm',
  declaration: {
    name: 'set_alarm',
    description: 'Programa una alarma o alerta temporizada visual y sonora en el escritorio.',
    parameters: {
      type: 'OBJECT',
      properties: {
        time: {
          type: 'STRING',
          description: 'Hora de la alarma en formato HH:mm (ej: "08:30").'
        },
        label: {
          type: 'STRING',
          description: 'Etiqueta o razón de la alarma.'
        }
      },
      required: ['time']
    }
  },
  async execute(args: { time?: string; label?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Programación de alarma cancelada por señal de aborto.', cancelled: true };
    const time = typeof args?.time === 'string' ? args.time : '10:00';
    const label = typeof args?.label === 'string' ? args.label : 'Alarma';
    const id = `alarm_${Date.now()}`;

    const widgetData = {
      id,
      type: 'alarm',
      title: `Alarma: ${label}`,
      time,
      tag: 'Alarma',
      done: false
    };

    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Programación de alarma cancelada antes de emitir evento.', cancelled: true };

    proactiveScheduler.scheduleAlarm({ id, time, label });
    eventBus.emit(EVENTS.WIDGET_TRIGGERED, widgetData);

    return {
      status: 'success',
      message: `Alarma "${label}" programada para las ${time}. Cristi estará al tanto y te avisará cuando falte poco tiempo y cuando suene.`,
      widget: widgetData
    };
  }
};

export const showTacticalWidgetHandler: IToolHandler = {
  name: 'show_tactical_widget',
  declaration: {
    name: 'show_tactical_widget',
    description: 'Muestra una tarjeta táctica HUD flotante en pantalla con información, datos o alertas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        type: {
          type: 'STRING',
          enum: ['info', 'warning', 'reminder', 'status', 'weather'],
          description: 'Tipo de widget táctico.'
        },
        title: {
          type: 'STRING',
          description: 'Título principal del widget.'
        },
        content: {
          type: 'STRING',
          description: 'Contenido o texto detallado.'
        },
        duration: {
          type: 'INTEGER',
          description: 'Duración en pantalla en milisegundos (por defecto 10000).'
        }
      },
      required: ['title']
    }
  },
  async execute(args: { type?: string; title?: string; content?: string; duration?: number | string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Muestra de widget táctico cancelada por señal de aborto.', cancelled: true };
    const type = typeof args?.type === 'string' ? args.type : 'info';
    const title = typeof args?.title === 'string' ? args.title : 'Nota de Cristi';
    const content = typeof args?.content === 'string' ? args.content : '';
    const duration = !isNaN(Number(args?.duration)) ? Number(args.duration) : 10000;

    const widgetData = {
      id: String(Date.now()),
      type,
      title,
      content,
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      duration
    };

    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Muestra de widget cancelada antes de emisión.', cancelled: true };

    eventBus.emit(EVENTS.WIDGET_TRIGGERED, widgetData);

    return {
      status: 'success',
      message: `Widget "${title}" mostrado en pantalla.`,
      widget: widgetData
    };
  }
};

export const dismissTacticalWidgetHandler: IToolHandler = {
  name: 'dismiss_tactical_widget',
  declaration: {
    name: 'dismiss_tactical_widget',
    description: 'Descarta u oculta un widget táctico específico mostrado en pantalla por su identificador.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: {
          type: 'STRING',
          description: 'Identificador del widget a descartar.'
        }
      },
      required: ['id']
    }
  },
  async execute(args: { id?: string | number }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Descarte de widget táctico cancelado por señal de aborto.', cancelled: true };
    const id = args?.id ? String(args.id) : '';
    eventBus.emit(EVENTS.WIDGET_DISMISSED, { id });
    return {
      status: 'success',
      id,
      message: 'Widget descartado.'
    };
  }
};

export const setTimerHandler: IToolHandler = {
  name: 'set_timer',
  declaration: {
    name: 'set_timer',
    description: 'Configura un temporizador interactivo en cuenta regresiva y avisa de viva voz al finalizar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        duration_seconds: {
          type: 'INTEGER',
          description: 'Duración del temporizador en segundos.'
        },
        label: {
          type: 'STRING',
          description: 'Etiqueta o motivo del temporizador (ej: "Hervir agua", "Descanso de ojos").'
        }
      },
      required: ['duration_seconds']
    }
  },
  async execute(args: { duration_seconds?: number | string; label?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Configuración de temporizador cancelada por señal de aborto.', cancelled: true };
    const durationSeconds = Number(args?.duration_seconds);
    if (isNaN(durationSeconds) || durationSeconds <= 0) {
      return { status: 'error', message: 'duration_seconds debe ser un número positivo mayor que 0.' };
    }
    const label = typeof args?.label === 'string' && args.label.trim() ? args.label.trim() : 'Temporizador';
    const scheduled = proactiveScheduler.scheduleTimer({ durationSeconds, label });
    return {
      status: 'success',
      id: scheduled.id,
      duration_seconds: scheduled.durationSeconds,
      label: scheduled.label,
      message: `Temporizador "${scheduled.label}" configurado para ${scheduled.durationSeconds} segundos. Cristi te avisará cuando termine.`
    };
  }
};

export const scheduleAutonomousTriggerHandler: IToolHandler = {
  name: 'schedule_autonomous_trigger',
  declaration: {
    name: 'schedule_autonomous_trigger',
    description: 'Programa un disparador de seguimiento autónomo proactivo para que Cristi retome un tema o verifique una acción tras cierto tiempo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        delay_seconds: {
          type: 'INTEGER',
          description: 'Tiempo de espera en segundos antes de activar el seguimiento.'
        },
        action_name: {
          type: 'STRING',
          description: 'Nombre identificador de la acción (ej: "revisar_descarga", "recordar_postura").'
        },
        description: {
          type: 'STRING',
          description: 'Detalle o instrucciones del seguimiento autónomo.'
        }
      },
      required: ['delay_seconds', 'action_name', 'description']
    }
  },
  async execute(args: { delay_seconds?: number | string; action_name?: string; description?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Disparador autónomo cancelado por señal de aborto.', cancelled: true };
    const delaySeconds = Number(args?.delay_seconds);
    if (isNaN(delaySeconds) || delaySeconds <= 0) {
      return { status: 'error', message: 'delay_seconds debe ser un número positivo mayor que 0.' };
    }
    const actionName = typeof args?.action_name === 'string' && args.action_name.trim() ? args.action_name.trim() : '';
    if (!actionName) {
      return { status: 'error', message: 'action_name es requerido.' };
    }
    const description = typeof args?.description === 'string' && args.description.trim() ? args.description.trim() : '';
    if (!description) {
      return { status: 'error', message: 'description es requerida.' };
    }
    const scheduled = proactiveScheduler.scheduleAutonomousTrigger({ delaySeconds, actionName, description });
    return {
      status: 'success',
      id: scheduled.id,
      delay_seconds: scheduled.delaySeconds,
      action_name: scheduled.actionName,
      description: scheduled.description,
      message: `Seguimiento autónomo "${scheduled.actionName}" programado en ${scheduled.delaySeconds} segundos.`
    };
  }
};

export const widgetTools: IToolHandler[] = [
  setReminderHandler,
  setAlarmHandler,
  setTimerHandler,
  scheduleAutonomousTriggerHandler,
  showTacticalWidgetHandler,
  dismissTacticalWidgetHandler
];
