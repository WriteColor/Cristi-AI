/**
 * Cristi AI - Spotify to Live2D Emotion Bridge
 * Maps currently playing tracks and musical genres/moods to Live2D emotions and motions.
 */

import { eventBus, EVENTS } from '../../../infrastructure/events/eventBus.ts';
import { logger } from '../../../infrastructure/logging/logger.ts';
import { modularConfigManager } from '../../../config/ModularConfigManager';

export interface MusicMoodResult {
  mood: 'chill' | 'rock' | 'metal' | 'love' | 'sad' | 'dance' | 'dark' | 'happy';
  suggestedEmotion: 'idle' | 'happy' | 'blush' | 'love' | 'crazy' | 'yandere' | 'sad';
  suggestedMotion: 'sway' | 'nod' | 'headbang' | 'dance' | 'down';
}

export function detectMusicMood(text: string): MusicMoodResult {
  if (!text || typeof text !== 'string') {
    return { mood: 'chill', suggestedEmotion: 'idle', suggestedMotion: 'sway' };
  }

  const t = text.toLowerCase();
  let baseMood: MusicMoodResult['mood'] = 'happy';
  let defaultEmotion: MusicMoodResult['suggestedEmotion'] = 'happy';
  let defaultMotion: MusicMoodResult['suggestedMotion'] = 'nod';

  if (/lo-?fi|chill|relax|ambient|study|peaceful|soft|calm|jazz|acoustic/i.test(t)) {
    baseMood = 'chill';
    defaultEmotion = 'idle';
    defaultMotion = 'sway';
  } else if (/death|black metal|doom|thrash|slipknot|cannibal|breakdown|grindcore|heavy metal/i.test(t)) {
    baseMood = 'metal';
    defaultEmotion = 'crazy';
    defaultMotion = 'headbang';
  } else if (/rock|punk|grunge|deftones|nirvana|guitar|alternative|indie/i.test(t)) {
    baseMood = 'rock';
    defaultEmotion = 'happy';
    defaultMotion = 'nod';
  } else if (/love|amor|heart|beso|darling|quererte|enamorad|romantic|lover|sweetheart/i.test(t)) {
    baseMood = 'love';
    defaultEmotion = 'blush';
    defaultMotion = 'sway';
  } else if (/sad|depress|cry|llorar|alone|triste|melanchol|heartbreak|tears|pain/i.test(t)) {
    baseMood = 'sad';
    defaultEmotion = 'sad';
    defaultMotion = 'down';
  } else if (/dance|pop|electro|party|disco|reggaeton|techno|house|club|edm/i.test(t)) {
    baseMood = 'dance';
    defaultEmotion = 'happy';
    defaultMotion = 'dance';
  } else if (/goth|dark|vampire|witch|shadow|darkwave|post-punk|bauhaus|cure/i.test(t)) {
    baseMood = 'dark';
    defaultEmotion = 'yandere';
    defaultMotion = 'nod';
  }

  // Check user-configured moodMapping in modularConfigManager
  try {
    const customMapping = modularConfigManager.getSection('spotify')?.moodMapping;
    if (customMapping && typeof customMapping === 'object' && customMapping[baseMood]) {
      const custom = customMapping[baseMood];
      return {
        mood: baseMood,
        suggestedEmotion: (custom.emotion || defaultEmotion) as MusicMoodResult['suggestedEmotion'],
        suggestedMotion: (custom.motion || defaultMotion) as MusicMoodResult['suggestedMotion']
      };
    }
  } catch (_) {}

  return { mood: baseMood, suggestedEmotion: defaultEmotion, suggestedMotion: defaultMotion };
}

export class SpotifyEmotionBridge {
  private lastTrack = '';
  private lastMood: MusicMoodResult | null = null;
  private isEnabled = true;

  setEnabled(enabled: boolean): void {
    this.isEnabled = Boolean(enabled);
  }

  processTrack(trackTitle: string, artistName?: string): MusicMoodResult {
    const combined = `${trackTitle || ''} ${artistName || ''}`.trim();
    if (!combined) {
      return { mood: 'chill', suggestedEmotion: 'idle', suggestedMotion: 'sway' };
    }

    if (combined === this.lastTrack && this.lastMood) {
      return this.lastMood;
    }

    const mood = detectMusicMood(combined);
    this.lastTrack = combined;
    this.lastMood = mood;

    this.dispatchEmotion(mood, trackTitle);
    return mood;
  }

  dispatchEmotion(mood: MusicMoodResult, trackName?: string): void {
    if (!this.isEnabled) return;
    try {
      logger.info('SpotifyEmotionBridge', `Música detectada: "${trackName || 'desconocida'}" -> Ánimo: ${mood.mood}, Emoción Live2D: ${mood.suggestedEmotion}`);
      eventBus.emit(EVENTS.EMOTION_CHANGED, mood.suggestedEmotion);
    } catch (err) {
      logger.warn('SpotifyEmotionBridge', 'Error al emitir evento de emoción musical:', err);
    }
  }

  getLastMood(): MusicMoodResult | null {
    return this.lastMood;
  }
}

export const spotifyEmotionBridge = new SpotifyEmotionBridge();
