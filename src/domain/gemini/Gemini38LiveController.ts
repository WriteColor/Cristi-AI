/**
 * Cristi AI - Gemini38LiveController
 * Specialized controller for Gemini 3.8 Live (v1alpha).
 * Google's flagship low-latency audio-to-audio model.
 * Uses distinctAudioVideo, high-sensitivity calibrated VAD, and non-blocking tool execution.
 */

import type { IGeminiModelController, ControllerSetupParams } from './GeminiModelController';

export class Gemini38LiveController implements IGeminiModelController {
  public readonly family = 'gemini-3.8-live' as const;
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
    const directives =
      '\n\n[DIRECTIVA DE DIÁLOGO EN VIVO (GEMINI 3.8 LIVE)]:\n' +
      'Responde con fluidez inmediata y calidez humana natural a Ariel. ' +
      'Si una orden es incompleta, contradictoria o ambigua, pregunta con brevedad antes de suponer o ejecutar comandos a ciegas.';

    return `${basePrompt}${memoryContext}${schedulerContext}${directives}${transcriptHistory ? `\n\n${transcriptHistory}` : ''}`;
  }
}

export const gemini38LiveController = new Gemini38LiveController();
