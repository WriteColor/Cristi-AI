/**
 * Cristi AI - Model Configurations for Gemini Multimodal Live API & Live2D Avatars
 * 
 * Official Gemini models supported for bidiGenerateContent (Live API v1beta):
 * 1. gemini-2.5-flash-native-audio-preview-09-2025 — Gemini 2.5 Flash Native Audio
 * 2. gemini-3.1-flash-live-preview — Gemini 3.1 Flash Live Preview
 */

import rawModelsJson from '../../config/models.json' with { type: 'json' };
import rawPromptsJson from '../../config/prompts.json' with { type: 'json' };

export interface GeminiModelDefinition {
  id: string;
  displayName: string;
  name: string;
  badge: string;
  badgeType: 'exp' | 'native' | 'standard';
  isDefault: boolean;
  description: string;
  version: string;
  latency: string;
  modalities: string;
  defaultVoice: string;
  voiceCount: number;
  supportsComputerControl: boolean;
  supportsProactiveAudio: boolean;
  supportsAffectiveDialog: boolean;
  supportsAsyncTools: boolean;
  screenCaptureFPS: number;
}

export const GEMINI_MODELS_LIST: readonly GeminiModelDefinition[] = rawModelsJson as GeminiModelDefinition[];

const model25 = (GEMINI_MODELS_LIST.find(m => m.id === 'gemini-2.5-flash-native-audio-preview-12-2025') || GEMINI_MODELS_LIST[0]) as GeminiModelDefinition;
const model31 = (GEMINI_MODELS_LIST.find(m => m.id === 'gemini-3.1-flash-live-preview') || GEMINI_MODELS_LIST[1] || GEMINI_MODELS_LIST[0]) as GeminiModelDefinition;
const model38 = (GEMINI_MODELS_LIST.find(m => m.id === 'gemini-3.8-live') || GEMINI_MODELS_LIST[2] || GEMINI_MODELS_LIST[0]) as GeminiModelDefinition;
const model38Thinking = (GEMINI_MODELS_LIST.find(m => m.id === 'gemini-3.8-live-extended-thinking') || GEMINI_MODELS_LIST[3] || GEMINI_MODELS_LIST[0]) as GeminiModelDefinition;

export const GEMINI_MODELS: Record<'GEMINI_25_FLASH_PREVIEW_09_2025' | 'GEMINI_31_FLASH_LIVE_PREVIEW' | 'GEMINI_38_LIVE' | 'GEMINI_38_LIVE_EXTENDED_THINKING', GeminiModelDefinition> & Record<string, GeminiModelDefinition> = {
  GEMINI_25_FLASH_PREVIEW_09_2025: model25,
  GEMINI_31_FLASH_LIVE_PREVIEW: model31,
  GEMINI_38_LIVE: model38,
  GEMINI_38_LIVE_EXTENDED_THINKING: model38Thinking,
};

export const DEFAULT_MODEL_ID = (GEMINI_MODELS_LIST.find(m => m.isDefault)?.id) || 'gemini-3.8-live';

export interface LiveModelContract {
  requestedId: string;
  endpointId: string;
  family: 'gemini-2.5-native-audio' | 'gemini-3.1-live' | 'gemini-3.8-live' | 'gemini-3.8-live-extended-thinking';
  turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY' | 'TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO';
}

export interface GeminiLiveEndpointConfig {
  requestedId: string;
  endpointId: string;
  url: string;
  family: 'gemini-2.5-native-audio' | 'gemini-3.1-live' | 'gemini-3.8-live' | 'gemini-3.8-live-extended-thinking';
  bidiServicePath: string;
  turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY' | 'TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO';
  supportsThoughtParts: boolean;
  supportsOutputTranscription: boolean;
  speechSampleRateHz: number;
  thinkingBudget: number;
  streamingMediaFormat: 'mediaChunks' | 'distinctAudioVideo';
}

/**
 * Resuelve y normaliza el ID del modelo para la sesión WebSocket Live de Gemini.
 */
export function resolveLiveModelId(modelId?: string): string {
  if (!modelId) return DEFAULT_MODEL_ID;
  if (modelId === 'gemini-2.5-flash-native-audio-preview-09-2025') {
    return 'gemini-2.5-flash-native-audio-preview-12-2025';
  }
  const match = GEMINI_MODELS_LIST.find(m => m.id === modelId);
  return match ? match.id : DEFAULT_MODEL_ID;
}

/**
 * Protocol capabilities are kept beside the model catalogue so a saved alias
 * cannot accidentally receive setup fields intended for a different Live API.
 */
export function getLiveModelContract(modelId?: string): LiveModelContract {
  const requestedId = modelId || DEFAULT_MODEL_ID;
  const endpointId = resolveLiveModelId(requestedId);
  const isGemini38Thinking = endpointId === 'gemini-3.8-live-extended-thinking';
  const isGemini38 = endpointId === 'gemini-3.8-live' || endpointId.startsWith('gemini-3.8-');
  const isGemini31 = endpointId.startsWith('gemini-3.1-');
  const family = isGemini38Thinking
    ? 'gemini-3.8-live-extended-thinking'
    : (isGemini38 ? 'gemini-3.8-live' : (isGemini31 ? 'gemini-3.1-live' : 'gemini-2.5-native-audio'));

  return {
    requestedId,
    endpointId,
    family,
    turnCoverage: (isGemini31 || isGemini38) ? 'TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO' : 'TURN_INCLUDES_ONLY_ACTIVITY',
  };
}

export function getLiveEndpointConfig(modelId?: string): GeminiLiveEndpointConfig {
  const requestedId = modelId || DEFAULT_MODEL_ID;
  const endpointId = resolveLiveModelId(requestedId);

  if (endpointId === 'gemini-3.8-live-extended-thinking') {
    return {
      requestedId,
      endpointId: 'gemini-3.8-live-extended-thinking',
      url: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent',
      family: 'gemini-3.8-live-extended-thinking',
      bidiServicePath: 'models/gemini-3.8-live-extended-thinking',
      turnCoverage: 'TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO',
      supportsThoughtParts: true,
      supportsOutputTranscription: true,
      speechSampleRateHz: 24000,
      thinkingBudget: 0,
      streamingMediaFormat: 'distinctAudioVideo',
    };
  }

  const isGemini38 = endpointId.startsWith('gemini-3.8-') || endpointId === 'gemini-3.8-live';
  const isGemini31 = endpointId.startsWith('gemini-3.1-');

  // Gemini 3.8 Live dedicated endpoint (v1alpha BidiGenerateContent)
  if (isGemini38) {
    return {
      requestedId,
      endpointId,
      url: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent',
      family: 'gemini-3.8-live',
      bidiServicePath: `models/${endpointId}`,
      turnCoverage: 'TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO',
      supportsThoughtParts: false,
      supportsOutputTranscription: true,
      speechSampleRateHz: 24000,
      thinkingBudget: 0,
      streamingMediaFormat: 'distinctAudioVideo',
    };
  }

  return {
    requestedId,
    endpointId,
    url: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
    family: isGemini31 ? 'gemini-3.1-live' : 'gemini-2.5-native-audio',
    bidiServicePath: `models/${endpointId}`,
    turnCoverage: isGemini31 ? 'TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO' : 'TURN_INCLUDES_ONLY_ACTIVITY',
    supportsThoughtParts: !isGemini31,
    supportsOutputTranscription: isGemini31,
    speechSampleRateHz: 24000,
    thinkingBudget: 0,
    streamingMediaFormat: isGemini31 ? 'distinctAudioVideo' : 'mediaChunks',
  };
}

/** Returns screenCaptureFPS for a given model ID (strict 0.5 FPS for zero GPU contention) */
export function getScreenCaptureFPS(modelId?: string): number {
  const resolved = resolveLiveModelId(modelId);
  const entry = GEMINI_MODELS_LIST.find(m => m.id === resolved);
  return entry?.screenCaptureFPS ?? 0.5;
}

/** Returns formatted short model name */
export function getModelDisplayName(modelId?: string): string {
  const resolved = resolveLiveModelId(modelId);
  const entry = GEMINI_MODELS_LIST.find(m => m.id === resolved);
  if (entry) return entry.displayName.split(' (')[0];
  return 'Gemini 2.5 Flash Native Audio';
}

export const SYSTEM_PERSONA_PROMPT: string = rawPromptsJson.systemPersona;

