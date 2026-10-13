/**
 * Cristi AI - GeminiModelController
 * Base interfaces and types for family-specialized Gemini Live controllers.
 */

export interface ControllerSetupParams {
  modelId: string;
  endpointId: string;
  voiceName: string;
  temperature: number;
  systemPrompt: string;
  tools: unknown[] | null;
  resumptionHandle: string | null;
  transcriptHistory?: string;
}

export interface IGeminiModelController {
  readonly family: 'gemini-2.5-native-audio' | 'gemini-3.1-live' | 'gemini-3.8-live' | 'gemini-3.8-live-extended-thinking';
  readonly supportsThinking: boolean;
  readonly streamingMediaFormat: 'mediaChunks' | 'distinctAudioVideo';

  buildSetupMessage(params: ControllerSetupParams): Record<string, unknown>;
  formatAudioPayload(data: string): Record<string, unknown>;
  formatVideoPayload(data: string, mimeType?: string): Record<string, unknown>;
  formatTextPayload(text: string): Record<string, unknown>;
  getEnrichedPrompt(basePrompt: string, memoryContext?: string, schedulerContext?: string, transcriptHistory?: string): string;
}
