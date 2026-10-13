/**
 * Cristi AI - Gemini38ExtendedThinkingController
 * Specialized controller for Gemini 3.8 Live Extended Thinking (v1alpha).
 * Google's flagship reasoning audio-to-audio model.
 * Uses distinctAudioVideo, thinkingConfig with thinkingLevel: 'low',
 * high-sensitivity VAD, and spoken conversational filler directives.
 */

import type { IGeminiModelController, ControllerSetupParams } from './GeminiModelController';

export class Gemini38ExtendedThinkingController implements IGeminiModelController {
  public readonly family = 'gemini-3.8-live-extended-thinking' as const;
  public readonly supportsThinking = true;
  public readonly streamingMediaFormat = 'distinctAudioVideo' as const;

  public buildSetupMessage(params: ControllerSetupParams): Record<string, unknown> {
    return {
      setup: {
        model: `models/${params.endpointId}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: params.voiceName,
              },
            },
          },
          temperature: params.temperature || 0.75,
          thinkingConfig: {
            thinkingLevel: 'low',
            includeThoughts: true,
          },
        },
        systemInstruction: {
          parts: [{ text: params.systemPrompt }],
        },
        tools: params.tools,
        realtimeInputConfig: {
          turnCoverage: 'TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO',
          activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
            endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
            silenceDurationMs: 450,
            prefixPaddingMs: 250,
          },
        },
        contextWindowCompression: {
          slidingWindow: {},
        },
        sessionResumption: params.resumptionHandle ? { handle: params.resumptionHandle } : {},
      },
    };
  }

  public formatAudioPayload(data: string): Record<string, unknown> {
    return {
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data,
        },
      },
    };
  }

  public formatVideoPayload(data: string, mimeType = 'image/jpeg'): Record<string, unknown> {
    return {
      realtimeInput: {
        video: {
          mimeType,
          data,
        },
      },
    };
  }

  public formatTextPayload(text: string): Record<string, unknown> {
    return {
      realtimeInput: { text },
    };
  }

  public getEnrichedPrompt(
    basePrompt: string,
    memoryContext = '',
    schedulerContext = '',
    transcriptHistory = ''
  ): string {
    const thinkingDirective =
      '\n\n[DIRECTIVA DE DIÁLOGO Y RAZONAMIENTO EN VIVO (THINKING EXTENDIDO)]:\n' +
      'Para saludos, peticiones cotidianas y diálogo normal, responde de inmediato con tu voz cálida y dulce sin demoras. ' +
      'Al resolver problemas complejos o ejecutar herramientas de automatización, emite breves muletillas conversacionales ' +
      '(como "a ver...", "veamos...", "déjame revisar...") para que Ariel sepa que estás procesando activamente mientras razonas en segundo plano. ' +
      'Si una instrucción es ambigua o contradictoria, aclárala verbalmente antes de continuar.';

    return `${basePrompt}${memoryContext}${schedulerContext}${thinkingDirective}${transcriptHistory ? `\n\n${transcriptHistory}` : ''}`;
  }
}

export const gemini38ExtendedThinkingController = new Gemini38ExtendedThinkingController();
