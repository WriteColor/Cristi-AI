/**
 * Cristi AI - Gemini31LiveController
 * Specialized controller for Gemini 3.1 Flash Live Preview (v1beta).
 * Uses distinctAudioVideo format, bidirectional audio/transcription streaming.
 * Reinforced with active clarification and anti-assumption directives.
 */

import type { IGeminiModelController, ControllerSetupParams } from './GeminiModelController';

export class Gemini31LiveController implements IGeminiModelController {
  public readonly family = 'gemini-3.1-live' as const;
  public readonly supportsThinking = false;
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
    const clarificationDirective =
      '\n\n[DIRECTIVA DE CLARIFICACIÓN ACTIVA (GEMINI 3.1 LIVE)]:\n' +
      'Ante cualquier instrucción imprecisa, ambigua o contradictoria, pide clarificación antes de suponer o ejecutar acciones. ' +
      'Mantén tu tono dulce y cercano, fundamentando tus respuestas únicamente en lo que percibas en pantalla o en el diálogo.';

    return `${basePrompt}${memoryContext}${schedulerContext}${clarificationDirective}${transcriptHistory ? `\n\n${transcriptHistory}` : ''}`;
  }
}

export const gemini31LiveController = new Gemini31LiveController();
