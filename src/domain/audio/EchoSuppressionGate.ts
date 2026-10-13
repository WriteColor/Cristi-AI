/**
 * Cristi AI — Software Acoustic Echo Suppression & Adaptive Gating
 * 
 * Coordinates with Web Audio / OS native hardware Acoustic Echo Cancellation (AEC)
 * to allow natural barge-in while suppressing tool execution noise and acoustic reverberation.
 */

export interface EchoSuppressionGateOptions {
  hangoverMs?: number;
  allowBargeIn?: boolean;
  adaptiveSoftGate?: boolean;
  minBargeInRms?: number;
}

export class EchoSuppressionGate {
  private isSpeaking = false;
  private isPlaying = false;
  private isToolExecuting = false;
  private lastPlayoutEndedAt = -Infinity;
  private lastPlayoutExplicit = false;
  private readonly hangoverMs: number;
  private readonly allowBargeIn: boolean;
  private readonly adaptiveSoftGate: boolean;
  private readonly minBargeInRms: number;

  constructor(options: EchoSuppressionGateOptions = {}) {
    this.hangoverMs = options.hangoverMs ?? 150;
    this.allowBargeIn = options.allowBargeIn ?? true;
    this.adaptiveSoftGate = options.adaptiveSoftGate ?? false;
    this.minBargeInRms = options.minBargeInRms ?? 0.008;
  }

  private calculateRms(buffer: ArrayBuffer): number {
    const view = new Int16Array(buffer);
    if (view.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < view.length; i++) {
      const norm = view[i] / 32768.0;
      sum += norm * norm;
    }
    return Math.sqrt(sum / view.length);
  }

  setAssistantSpeaking(speaking: boolean, now?: number): void {
    if (this.isSpeaking && !speaking) {
      this.lastPlayoutEndedAt = now !== undefined ? now : performance.now();
      this.lastPlayoutExplicit = now !== undefined;
    }
    this.isSpeaking = speaking;
  }

  setAudioPlaying(playing: boolean, now?: number): void {
    if (this.isPlaying && !playing) {
      this.lastPlayoutEndedAt = now !== undefined ? now : performance.now();
      this.lastPlayoutExplicit = now !== undefined;
    }
    this.isPlaying = playing;
  }

  setToolExecuting(executing: boolean): void {
    this.isToolExecuting = executing;
  }

  recordTurnComplete(): void {
    // Keep gate state consistent when turn completes
  }

  recordPlayoutEnded(now?: number): void {
    this.isPlaying = false;
    this.lastPlayoutEndedAt = now !== undefined ? now : performance.now();
    this.lastPlayoutExplicit = now !== undefined;
  }

  canTransmit(pcmData?: ArrayBuffer | number, now?: number): boolean {
    const isPlayingOrSpeaking = this.isSpeaking || this.isPlaying;

    // 1. Barge-in support: Allow microphone packets to flow to Gemini Live while assistant speaks
    // so Google's server-side VAD can detect user voice and emit `interrupted: true`.
    if (this.allowBargeIn) {
      if (isPlayingOrSpeaking && this.adaptiveSoftGate && pcmData instanceof ArrayBuffer) {
        const rms = this.calculateRms(pcmData);
        if (rms < this.minBargeInRms) {
          return false; // Soft gate below threshold to reduce residual speaker bleed
        }
      }
      return true;
    }

    // 2. Strict gating fallback when barge-in is explicitly disabled
    if (this.isToolExecuting) return false;
    if (isPlayingOrSpeaking) return false;

    const currentTime = typeof now === 'number' ? now : performance.now();
    const baseEndedAt = (typeof now === 'number' && !this.lastPlayoutExplicit && this.lastPlayoutEndedAt !== -Infinity)
      ? 0
      : this.lastPlayoutEndedAt;

    if (currentTime - baseEndedAt < this.hangoverMs) {
      return false;
    }

    return true;
  }

  reset(): void {
    this.isSpeaking = false;
    this.isPlaying = false;
    this.isToolExecuting = false;
    this.lastPlayoutEndedAt = -Infinity;
    this.lastPlayoutExplicit = false;
  }
}

export const echoSuppressionGate = new EchoSuppressionGate();

