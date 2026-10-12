/**
 * Cristi AI — Software Acoustic Echo Suppression & Gating
 * 
 * Completely eliminates self-echo and acoustic feedback by gating microphone
 * frame transmission during assistant speech playout, tool execution, and
 * acoustic reverberation decay windows.
 */

export interface EchoSuppressionGateOptions {
  hangoverMs?: number;
}

export class EchoSuppressionGate {
  private isSpeaking = false;
  private isPlaying = false;
  private isToolExecuting = false;
  private lastPlayoutEndedAt = -Infinity;
  private lastPlayoutExplicit = false;
  private readonly hangoverMs: number;

  constructor(options: EchoSuppressionGateOptions = {}) {
    this.hangoverMs = options.hangoverMs ?? 300;
  }

  setAssistantSpeaking(speaking: boolean, now?: number): void {
    if (this.isSpeaking && !speaking) {
      if (now !== undefined) {
        this.lastPlayoutEndedAt = now;
        this.lastPlayoutExplicit = true;
      } else {
        this.lastPlayoutEndedAt = performance.now();
        this.lastPlayoutExplicit = false;
      }
    }
    this.isSpeaking = speaking;
  }

  setAudioPlaying(playing: boolean, now?: number): void {
    if (this.isPlaying && !playing) {
      if (now !== undefined) {
        this.lastPlayoutEndedAt = now;
        this.lastPlayoutExplicit = true;
      } else {
        this.lastPlayoutEndedAt = performance.now();
        this.lastPlayoutExplicit = false;
      }
    }
    this.isPlaying = playing;
  }

  setToolExecuting(executing: boolean): void {
    this.isToolExecuting = executing;
  }

  recordTurnComplete(): void {
    // Keep gate closed if audio is still draining through speakers
  }

  recordPlayoutEnded(now?: number): void {
    this.isPlaying = false;
    if (now !== undefined) {
      this.lastPlayoutEndedAt = now;
      this.lastPlayoutExplicit = true;
    } else {
      this.lastPlayoutEndedAt = performance.now();
      this.lastPlayoutExplicit = false;
    }
  }

  canTransmit(now?: number): boolean {
    if (this.isToolExecuting) return false;
    if (this.isSpeaking) return false;
    if (this.isPlaying) return false;

    const currentTime = now !== undefined ? now : performance.now();
    const baseEndedAt = (now !== undefined && !this.lastPlayoutExplicit && this.lastPlayoutEndedAt !== -Infinity)
      ? 0
      : this.lastPlayoutEndedAt;

    // Suppress room acoustic reverberation decay
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
