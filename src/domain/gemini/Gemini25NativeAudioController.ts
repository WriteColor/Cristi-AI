/**
 * Cristi AI - Gemini25NativeAudioController
 * Specialized controller for Gemini 2.5 Flash Native Audio (v1beta).
 * Uses legacy mediaChunks format and standard VAD.
 * Enforces reinforced system prompt against assumptions, hallucination, and enforces active clarification.
 */

import type { IGeminiModelController, ControllerSetupParams } from './GeminiModelController';

export class Gemini25NativeAudioController implements IGeminiModelController {
  public readonly family = 'gemini-2.5-native-audio' as const;
  public readonly supportsThinking = false;
  public readonly streamingMediaFormat = 'mediaChunks' as const;

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
            thinkingBudget: 0,
          },
        },
        systemInstruction: {
          parts: [{ text: params.systemPrompt }],
        },
        tools: params.tools,
        realtimeInputConfig: {
          turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
          activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
          automaticActivityDetection: {
            disabled: false,
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
        mediaChunks: [
          {
            mimeType: 'audio/pcm;rate=16000',
            data,
          },
        ],
      },
    };
  }

  public formatVideoPayload(data: string, mimeType = 'image/jpeg'): Record<string, unknown> {
    return {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType,
            data,
          },
        ],
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
    const clarificationDirective =
      '\n\n[DIRECTIVA DE CLARIFICACIÓN ACTIVA Y ANTI-ALUCINACIÓN (MODELO NO-THINKING)]:\n' +
      'Operas sin un motor de pensamiento extendido en segundo plano. Tienes ESTRICTAMENTE PROHIBIDO inventar información, ' +
      'asumir intenciones no expresadas, adivinar rutas de archivo, comandos o títulos de canciones. ' +
      'Si una petición del usuario es ambigua, incompleta o contradictoria, PREGUNTA amablemente antes de intentar responder o ejecutar herramientas a ciegas. ' +
      'Si no cuentas con datos o la imagen no es nítida, reconócelo con naturalidad sin inventar.';

    return `${basePrompt}${memoryContext}${schedulerContext}${clarificationDirective}${transcriptHistory ? `\n\n${transcriptHistory}` : ''}`;
  }
}

export const gemini25NativeAudioController = new Gemini25NativeAudioController();
