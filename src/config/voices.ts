/**
 * Cristi AI - Catálogo Oficial de Voces para Gemini Multimodal Live API
 * Sourced dynamically from config/voices.json
 */

import rawVoicesJson from '../../config/voices.json' with { type: 'json' };

export type OfficialVoiceName = string;

export interface GeminiVoiceDefinition {
  name: string;
  gender: string;
  trait: string;
  isRecommended: boolean;
  isSexy?: boolean;
  isUniversal?: boolean;
  supportedModels?: readonly string[];
  fallbackVoice?: string;
  tags?: readonly string[];
  description: string;
  badgeColor?: string;
  sampleRateHz?: number;
}

export type GeminiVoiceConfig = GeminiVoiceDefinition;

export const GEMINI_STANDARD_VOICES: readonly GeminiVoiceDefinition[] = (rawVoicesJson as GeminiVoiceDefinition[]).map(v => ({
  ...v,
  isUniversal: Boolean(v.isUniversal),
  supportedModels: v.supportedModels || ['gemini-2.5-flash-native-audio-preview-12-2025', 'gemini-3.1-flash-live-preview', 'gemini-3.8-live'],
  fallbackVoice: v.fallbackVoice || v.name,
  tags: v.tags || [v.trait, '24kHz'],
  badgeColor: v.badgeColor || (v.isRecommended ? 'purple' : 'zinc'),
  sampleRateHz: v.sampleRateHz || 24000
}));

export const DEFAULT_VOICE_NAME: string = (GEMINI_STANDARD_VOICES.find(v => v.isRecommended)?.name) || 'Aoede';

export function isVoiceSupportedForModel(modelId?: string, voiceName?: string): boolean {
  if (!voiceName) return false;
  const match = GEMINI_STANDARD_VOICES.find(
    (v) => v.name.toLowerCase() === voiceName.toLowerCase()
  );
  if (!match) return false;
  if (!modelId) return true;
  return match.supportedModels ? match.supportedModels.includes(modelId) : true;
}

export function getVoicesForModel(modelId?: string): readonly GeminiVoiceDefinition[] {
  if (!modelId) return GEMINI_STANDARD_VOICES;
  return GEMINI_STANDARD_VOICES;
}

export function sanitizeVoiceForModel(modelId?: string, requestedVoice?: string): string {
  if (!requestedVoice) return DEFAULT_VOICE_NAME;
  const match = GEMINI_STANDARD_VOICES.find(
    (v) => v.name.toLowerCase() === requestedVoice.toLowerCase()
  );
  if (!match) return DEFAULT_VOICE_NAME;

  // If model is specified, check compatibility
  if (modelId && match.supportedModels && !match.supportedModels.includes(modelId)) {
    console.warn(
      `[Voices] La voz '${match.name}' no está soportada nativamente por el modelo '${modelId}'. Mapeando armónicamente a '${match.fallbackVoice || DEFAULT_VOICE_NAME}'.`
    );
    return match.fallbackVoice || DEFAULT_VOICE_NAME;
  }

  return match.name;
}

export function getVoiceByName(name?: string): GeminiVoiceDefinition {
  const match = GEMINI_STANDARD_VOICES.find(
    (v) => v.name.toLowerCase() === (name || '').toLowerCase()
  );
  return match ?? GEMINI_STANDARD_VOICES[0];
}

export default GEMINI_STANDARD_VOICES;
