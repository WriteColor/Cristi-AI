/**
 * Cristi AI - Spotify to Live2D Emotion Bridge
 * Maps currently playing tracks and musical genres/moods to Live2D emotions and motions.
 */

import { eventBus, EVENTS } from '../../../infrastructure/events/eventBus.ts';
import { logger } from '../../../infrastructure/logging/logger.ts';

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

  if (/lo-?fi|chill|relax|ambient|study|peaceful|soft|calm|jazz|acoustic/i.test(t)) {
    return { mood: 'chill', suggestedEmotion: 'idle', suggestedMotion: 'sway' };
  }
  if (/death|black metal|doom|thrash|slipknot|cannibal|breakdown|grindcore|heavy metal/i.test(t)) {
    return { mood: 'metal', suggestedEmotion: 'crazy', suggestedMotion: 'headbang' };
  }
  if (/rock|punk|grunge|deftones|nirvana|guitar|alternative|indie/i.test(t)) {
    return { mood: 'rock', suggestedEmotion: 'happy', suggestedMotion: 'nod' };
  }
  if (/love|amor|heart|beso|darling|quererte|enamorad|romantic|lover|sweetheart/i.test(t)) {
    return { mood: 'love', suggestedEmotion: 'blush', suggestedMotion: 'sway' };
  }
  if (/sad|depress|cry|llorar|alone|triste|melanchol|heartbreak|tears|pain/i.test(t)) {
    return { mood: 'sad', suggestedEmotion: 'sad', suggestedMotion: 'down' };
  }
  if (/dance|pop|electro|party|disco|reggaeton|techno|house|club|edm/i.test(t)) {
    return { mood: 'dance', suggestedEmotion: 'happy', suggestedMotion: 'dance' };
  }
  if (/goth|dark|vampire|witch|shadow|darkwave|post-punk|bauhaus|cure/i.test(t)) {
    return { mood: 'dark', suggestedEmotion: 'yandere', suggestedMotion: 'nod' };
  }

  return { mood: 'happy', suggestedEmotion: 'happy', suggestedMotion: 'nod' };
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
