import type { IToolHandler, ToolExecutionContext } from '../IToolHandler';

export const triggerCompanionGestureHandler: IToolHandler = {
  name: 'trigger_companion_gesture',
  declaration: {
    name: 'trigger_companion_gesture',
    description: 'Activa un gesto, expresión facial o emoción en el avatar de la compañera virtual en pantalla adaptándose al modelo Live2D activo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        gesture: {
          type: 'STRING',
          enum: ['idle', 'happy', 'blush', 'love', 'surprised', 'yandere', 'crazy', 'thinking', 'wink', 'pout', 'angry', 'sad', 'smug', 'gamer', 'nod', 'dance', 'relaxed', 'waving'],
          description: 'El gesto o emoción que debe manifestar el avatar.'
        },
        comment: {
          type: 'STRING',
          description: 'Breve razón interna del cambio emocional (opcional).'
        }
      },
      required: ['gesture']
    }
  },
  async execute(args: { gesture?: string; comment?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Gesto de avatar cancelado por señal de aborto.', cancelled: true };
    const gesture = typeof args?.gesture === 'string' ? args.gesture : 'happy';
    const comment = typeof args?.comment === 'string' ? args.comment : '';

    const trigger = context?.onGestureTrigger || context?.triggerGesture;
    trigger?.(gesture, comment);

    return {
      status: 'success',
      current_gesture: gesture,
      message: `Avatar expression and dynamic Live2D parameters updated to ${gesture}.`
    };
  }
};

export const triggerModelMotionHandler: IToolHandler = {
  name: 'trigger_model_motion',
  declaration: {
    name: 'trigger_model_motion',
    description: 'Dispara una animación o pose de movimiento específica del modelo Live2D activo (ej: saludar, giro, tap en la cabeza, postura idle, pose de encanto).',
    parameters: {
      type: 'OBJECT',
      properties: {
        motion_group: {
          type: 'STRING',
          description: 'Nombre del grupo de animación (ej: "Idle", "Tap", "Flick", "MeiYan", "HuiShou", "DaiJi").'
        },
        index: {
          type: 'INTEGER',
          description: 'Índice de la animación dentro del grupo (por defecto 0).'
        }
      },
      required: ['motion_group']
    }
  },
  async execute(args: { motion_group?: string; index?: number | string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Animación de avatar cancelada por señal de aborto.', cancelled: true };
    const motionGroup = typeof args?.motion_group === 'string' ? args.motion_group : 'Idle';
    const index = !isNaN(Number(args?.index)) ? Number(args.index) : 0;

    const trigger = context?.onMotionTrigger || context?.triggerMotion;
    trigger?.(motionGroup, index);

    return {
      status: 'success',
      motion_group: motionGroup,
      index,
      message: `Avatar triggered motion group "${motionGroup}"[${index}].`
    };
  }
};

export const moveAvatarHandler: IToolHandler = {
  name: 'move_avatar',
  declaration: {
    name: 'move_avatar',
    description: 'Mueve el avatar de Cristi a una posición específica en pantalla con una animación opcional. Úsalo para expresar tu estado de ánimo, para acercarte al usuario o para moverte por capricho.',
    parameters: {
      type: 'OBJECT',
      properties: {
        position: {
          type: 'STRING',
          enum: ['center', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'random'],
          description: 'Posición destino en la pantalla.'
        },
        animation: {
          type: 'STRING',
          enum: ['none', 'bounce', 'float', 'shake', 'dance', 'slide'],
          description: 'Animación al llegar a la posición. Por defecto slide suave.'
        }
      },
      required: ['position']
    }
  },
  async execute(args: { position?: string; animation?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Movimiento de avatar cancelado por señal de aborto.', cancelled: true };
    const position = typeof args?.position === 'string' ? args.position : 'center';
    const animation = typeof args?.animation === 'string' ? args.animation : 'slide';

    const move = context?.onAvatarMove || context?.moveAvatar;
    move?.(position, animation);

    return {
      status: 'success',
      position,
      animation,
      message: `Avatar moved to ${position} with ${animation} animation.`
    };
  }
};

// Pruned cosmetic tools: move_avatar and trigger_model_motion are excluded from active Live tool declarations
// so Live2D motions and poses are driven reactively by ContextualEmotionOrchestrator without blocking LLM voice turns.
export const avatarTools: IToolHandler[] = [
  triggerCompanionGestureHandler
];

