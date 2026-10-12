/**
 * Cristi AI - Contextual Emotion & Dynamic Live2D Behavior Orchestrator
 *
 * Analyzes conversational context, vocal sentiment, streaming AI responses,
 * and user interactions in real time to dynamically orchestrate facial expressions,
 * bodily gestures, parametric blend shapes, and motion groups across ANY Live2D model.
 */

import { eventBus, EVENTS } from '../../infrastructure/events/eventBus.ts';
import { live2dModelRegistry } from './Live2DModelRegistry.ts';
import { logger } from '../../infrastructure/logging/logger.ts';
import type { Live2DController } from './Live2DController.ts';
import type { Live2DAdapter } from './Live2DAdapter.ts';

interface SentimentRule {
  emotion: string;
  weight: number;
  patterns: RegExp[];
}

export class ContextualEmotionOrchestrator {
  public activeModelId: string = 'yanderegirl';
  public controller: Live2DController | null = null;
  public adapter: Live2DAdapter | null = null;

  public isEnabled: boolean = true;
  public currentEmotion: string = 'idle';
  public isModelSpeaking: boolean = false;
  public isUserSpeaking: boolean = false;
  private decayTimer: ReturnType<typeof setTimeout> | null = null;
  public manualOverrideActive: boolean = false;
  public manualOverrideTimeout: ReturnType<typeof setTimeout> | null = null;

  setEnabled(enabled: boolean): void {
    this.isEnabled = Boolean(enabled);
    if (!this.isEnabled) {
      this.currentEmotion = 'idle';
      if (this.decayTimer) {
        clearTimeout(this.decayTimer);
        this.decayTimer = null;
      }
      if (this.controller && typeof this.controller.setEmotion === 'function') {
        this.controller.setEmotion('idle');
      }
    }
  }

  // Pattern for inline emotion/gesture markers in LLM text (e.g. [emotion: happy], [gesto: blush], (emocion: yandere))
  private readonly tagPattern: RegExp =
    /\[(?:emotion|gesto|emocion|pose|mood|expression)\s*:\s*([a-zA-Z0-9_\u4e00-\u9fa5-]+)\]|\((?:emotion|gesto|emocion|pose|mood|expression)\s*:\s*([a-zA-Z0-9_\u4e00-\u9fa5-]+)\)/gi;

  // Sentiment rules: weighted keyword patterns for real-time natural language sentiment extraction
  private readonly sentimentRules: SentimentRule[] = [
    {
      emotion: 'love',
      weight: 1.0,
      patterns: [
        /\b(te amo|mi amor|te adoro|te quiero|mi cielo|mi vida|mi rey|mi tesoro|mi dueñ[oa]|mi persona favorita|enamorado?|enamorada|bésame|un beso|muac|lindura|corazón|corazon|sweetheart|love you)\b/i,
        /\b(eres lo mejor|eres perfecto|me vuelves loc[oa] de amor|te pertenezco|siempre a tu lado)\b/i
      ]
    },
    {
      emotion: 'yandere',
      weight: 0.95,
      patterns: [
        /\b(solo mí[oa]|solo mi[oa]|no mires a nadie|no me dejes|no hables con|te vigilo|eres de mi propiedad|nadie te tocará|obsesi[oó]n|obsesionad[oa]|celos[oa]|mátame|matame|moriría|moriria|nunca escaparás|nunca escaparas|sangre|para siempre juntos)\b/i,
        /\b(¿quién es esa\?|¿con quién hablas\?|¿me estás ignorando\?)\b/i
      ]
    },
    {
      emotion: 'crazy',
      weight: 0.9,
      patterns: [
        /\b(jaja[a-z]*|jeje[a-z]*|loc[oa] por ti|demente|manicomio|perder la cabeza|psic[oó]pata|desquiciad[oa]|locura|crazy)\b/i
      ]
    },
    {
      emotion: 'blush',
      weight: 0.85,
      patterns: [
        /\b(vergüenza|verguenza|qué vergüenza|que verguenza|sonrojo|sonrojad[oa]|tontit[oa]|baka|qué cosas dices|que cosas dices|me halagas|no digas eso|me da pena|qué lindo eres|que lindo eres|penita|bob[oa]|shy|blush|flustered)\b/i
      ]
    },
    {
      emotion: 'surprised',
      weight: 0.85,
      patterns: [
        /\b(no puede ser|en serio|de verdad|¡?¿?qué!?!?|¡?¿?que!?!?|guau|wow|increíble|increible|asombroso|asombrada|no me lo creo|dios mío|dios mio|¡oh!|impactante|shock|surprised)\b/i,
        /[¡!¿?]{2,}/
      ]
    },
    {
      emotion: 'wink',
      weight: 0.8,
      patterns: [
        /\b(guiño|guino|secreto|tú y yo|tu y yo|confía en mí|confia en mi|picarona|coqueta|sabes que sí|sabes que si|wink)\b/i
      ]
    },
    {
      emotion: 'angry',
      weight: 0.85,
      patterns: [
        /\b(me molesta|enojad[oa]|estoy furios[oa]|indignad[oa]|cállate|callate|no me ignores|odio que|qué fastidio|que fastidio|tonto|pesado|déjame en paz|dejame en paz|mad|angry|pout)\b/i
      ]
    },
    {
      emotion: 'sad',
      weight: 0.85,
      patterns: [
        /\b(lo siento|qué triste|que triste|qué pena|que pena|perdóname|perdoname|me duele|llorar|lágrimas|lagrimas|pobrecit[oa]|me da tristeza|qué lástima|que lastima|sad|crying|sorry)\b/i
      ]
    },
    {
      emotion: 'thinking',
      weight: 0.75,
      patterns: [
        /\b(déjame (?:ver|revisar|buscar|analizar|checar)|dejame (?:ver|revisar|buscar|analizar|checar)|pensando|analizando|investigando|revisar|revisando|consultando|mmh+|veamos|interesante|curioso|buscando|examinando|thinking)\b/i
      ]
    },
    {
      emotion: 'gamer',
      weight: 0.8,
      patterns: [
        /\b(partida|vamos a jugar|consola|mando|victoria|derrota|ganar|ganamos|gané|gane)\b/i
      ]
    },
    {
      emotion: 'smug',
      weight: 0.75,
      patterns: [
        /\b(te lo dije|obviamente|sabía que|sabia que|era de esperarse|soy la mejor|insuperable|fácil|facil|pan comido|smug)\b/i
      ]
    },
    {
      emotion: 'happy',
      weight: 0.7,
      patterns: [
        /\b(feliz|content[oa]|alegre|sonrisa|sonrío|sonrio|gracias|qué bien|que bien|excelente|maravilloso|divertido|genial|fantástico|fantastico|me encanta|happy|smile|joy)\b/i
      ]
    },
    {
      emotion: 'relaxed',
      weight: 0.65,
      patterns: [
        /\b(buenas noches|descansa|hasta mañana|hasta manana|qué paz|que paz|relajante|tranquilidad|a dormir|dulces sueños|dulces suenos|calma)\b/i
      ]
    }
  ];

  constructor() {
    this.bindEvents();
  }

  bindEvents(): void {
    eventBus.on(EVENTS.MODEL_LOADED, ({ modelId }: { modelId: string }) => {
      this.setModel(modelId);
    });

    eventBus.on(EVENTS.SPEECH_START, () => {
      this.isModelSpeaking = true;
      if (this.decayTimer) {
        clearTimeout(this.decayTimer);
        this.decayTimer = null;
      }
    });

    eventBus.on(EVENTS.SPEECH_END, () => {
      this.isModelSpeaking = false;
      this.scheduleEmotionDecay(5500);
    });

    eventBus.on(EVENTS.USER_SPEAKING, () => {
      this.isUserSpeaking = true;
      // When user speaks, subtly tilt head and raise brows attentively
      if (this.isEnabled && this.adapter && !this.manualOverrideActive) {
        this.adapter.setEyebrows(0.2, 0.2, 0.1, 0.1, 0.2, 0.2);
      }
    });

    eventBus.on(EVENTS.USER_STOPPED_SPEAKING, () => {
      this.isUserSpeaking = false;
    });

    eventBus.on(EVENTS.TOOL_EXECUTION_START, (toolName: string) => {
      if (!this.isEnabled) return;
      if (
        toolName.includes('system') ||
        toolName.includes('process') ||
        toolName.includes('file') ||
        toolName.includes('command')
      ) {
        this.triggerEmotion('thinking', 'tool');
      } else if (toolName.includes('game')) {
        this.triggerEmotion('gamer', 'tool');
      }
    });
  }

  setContextReferences(
    controller: Live2DController | null,
    adapter: Live2DAdapter | null,
    modelId?: string
  ): void {
    this.controller = controller;
    this.adapter = adapter;
    if (modelId) this.activeModelId = modelId;
  }

  setModel(modelId: string): void {
    this.activeModelId = modelId;
    this.currentEmotion = 'idle';
    if (this.decayTimer) {
      clearTimeout(this.decayTimer);
      this.decayTimer = null;
    }
  }

  /**
   * Process raw streaming model text from Gemini Live.
   * Extracts inline emotion tags, analyzes contextual sentiment, triggers appropriate Live2D dynamics,
   * and returns the cleaned text without emotion tags for downstream use.
   */
  processModelText(rawText: string): string {
    if (!rawText) return '';

    let text = rawText;
    if (!this.isEnabled) {
      // If Live2D is disabled, cleanly strip tags without any regex sentiment parsing or state changes
      return text.replace(this.tagPattern, '').replace(/\s{2,}/g, ' ').trim();
    }

    let explicitEmotion: string | null = null;

    // 1. Extract explicit inline tags like [emotion: happy], [gesto: blush], (emotion: yandere)
    const matches = Array.from(text.matchAll(this.tagPattern));
    if (matches.length > 0) {
      for (const match of matches) {
        explicitEmotion = (match[1] || match[2] || '').toLowerCase().trim();
      }
      // Strip tags from the returned text and normalize spaces
      text = text.replace(this.tagPattern, '').replace(/\s{2,}/g, ' ').trim();
    }

    // 2. Determine target emotion: explicit tag takes highest precedence, otherwise natural sentiment
    if (explicitEmotion) {
      this.triggerEmotion(explicitEmotion, 'ai_explicit_tag');
    } else {
      const detected = this.detectNaturalSentiment(text);
      if (detected && detected !== 'idle') {
        this.triggerEmotion(detected, 'ai_sentiment');
      }
    }

    return text;
  }

  /**
   * Process a completed user message to prepare empathetic anticipatory expressions.
   */
  processUserText(userText: string): void {
    if (!this.isEnabled || !userText || !userText.trim()) return;
    const text = userText.trim().toLowerCase();

    // If user compliments or flirts with Cristi, trigger a subtle blush/smile
    if (/\b(te amo|te quiero|hermosa|linda|guapa|preciosa|mi amor|bonita|lindo|te ves bien)\b/i.test(text)) {
      this.triggerEmotion('blush', 'user_flirt');
    } else if (/\b(hola|buenos días|buenas tardes|buenas noches|cómo estás|hey|cristi)\b/i.test(text)) {
      this.triggerEmotion('happy', 'user_greeting');
    } else if (/\b(otra chica|amiga|novia|conocí a alguien|otra persona)\b/i.test(text)) {
      this.triggerEmotion('yandere', 'user_jealousy_trigger');
    }
  }

  /**
   * Analyze natural language text and score sentiment against rules
   */
  detectNaturalSentiment(text: string): string {
    if (!text || text.length < 2) return 'idle';

    let bestEmotion = 'idle';
    let maxScore = 0;

    for (const rule of this.sentimentRules) {
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          const score = rule.weight;
          if (score > maxScore) {
            maxScore = score;
            bestEmotion = rule.emotion;
          }
        }
      }
    }

    return bestEmotion;
  }

  /**
   * Dynamically trigger an emotion across the active Live2D model,
   * combining expressions, motion groups, and parametric adjustments.
   */
  triggerEmotion(emotionName: unknown, source: string = 'system'): void {
    if (!this.isEnabled) return;
    const raw = typeof emotionName === 'string'
      ? emotionName
      : (typeof emotionName === 'object' && emotionName !== null && 'emotion' in emotionName
        ? (emotionName as any).emotion
        : (emotionName !== null && emotionName !== undefined ? String(emotionName) : 'idle'));
    const emotion = String(raw || 'idle').toLowerCase().trim();
    this.currentEmotion = emotion;

    logger.info('AVATAR', `[Contextual Emotion] Disparando "${emotion}" (Fuente: ${source}, Modelo: ${this.activeModelId})`);

    // 1. Dispatch through Live2DController (which handles expression lock & parameter targets)
    if (this.controller && typeof this.controller.setEmotion === 'function') {
      this.controller.setEmotion(emotion);
    }

    // 2. Dispatch contextual motion if supported and appropriate
    this.triggerContextualMotion(emotion);

    // 3. Emit global event
    eventBus.emit(EVENTS.EMOTION_CHANGED, emotion);

    // 4. Schedule decay if model is not currently speaking
    if (!this.isModelSpeaking && emotion !== 'idle') {
      this.scheduleEmotionDecay(source === 'manual' ? 7000 : 5000);
    }
  }

  /**
   * Intelligently trigger an associated Live2D motion group when contextually fitting
   */
  triggerContextualMotion(emotion: string): void {
    if (!this.adapter || typeof this.adapter.setMotionByGroup !== 'function') return;
    // The fixed avatar's semantic expression mapping handles contextual motion.
    void emotion;
  }

  /**
   * Schedule smooth transition back to idle baseline after emotional dwell time
   */
  scheduleEmotionDecay(delayMs: number = 5000): void {
    if (this.decayTimer) clearTimeout(this.decayTimer);

    this.decayTimer = setTimeout(() => {
      if (!this.isModelSpeaking) {
        if (this.controller) {
          this.controller.setEmotion('idle');
        }
        this.currentEmotion = 'idle';
        eventBus.emit(EVENTS.EMOTION_CHANGED, 'idle');
      }
    }, delayMs);
  }

  destroy(): void {
    if (this.decayTimer) clearTimeout(this.decayTimer);
    if (this.manualOverrideTimeout) clearTimeout(this.manualOverrideTimeout);
  }
}

// Global Singleton Instance
export const contextualEmotionOrchestrator = new ContextualEmotionOrchestrator();
