/**
 * Cristi Desktop - Procedural Cybernetic Sound FX Synthesizer (TypeScript)
 * Generates lightweight, zero-dependency tactile audio feedback using Web Audio API.
 * (Menu opens, connection, disconnections, boss key, mute toggle, snapshot chimes).
 */

export class SoundFxService {
  private audioCtx: AudioContext | null = null;
  public isEnabled = true;
  private masterGain: GainNode | null = null;

  public init(): void {
    if (typeof window === 'undefined') return;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
        this.masterGain.connect(this.audioCtx.destination);
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = Boolean(enabled);
  }

  public setVolume(volume0to1: number): void {
    if (this.masterGain && this.audioCtx) {
      const clamped = Math.max(0, Math.min(1, volume0to1));
      this.masterGain.gain.setValueAtTime(clamped * 0.3, this.audioCtx.currentTime);
    }
  }

  /** Subtle crisp UI click blip (8ms) */
  public playClick(): void {
    if (!this.isEnabled) return;
    this.init();
    if (!this.audioCtx || !this.masterGain) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.02);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.03);
    } catch (_) {}
  }

  /** Menu open chime (harmonic triple chord) */
  public playMenuOpen(): void {
    if (!this.isEnabled) return;
    this.init();
    if (!this.audioCtx || !this.masterGain) return;

    try {
      const now = this.audioCtx.currentTime;
      const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5 triad

      freqs.forEach((freq, idx) => {
        if (!this.audioCtx || !this.masterGain) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.02);

        gain.gain.setValueAtTime(0.08, now + idx * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.02 + 0.12);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now + idx * 0.02);
        osc.stop(now + idx * 0.02 + 0.14);
      });
    } catch (_) {}
  }

  /** Connection established chime (ascending cyber glide) */
  public playConnect(): void {
    if (!this.isEnabled) return;
    this.init();
    if (!this.audioCtx || !this.masterGain) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (_) {}
  }

  /** Alias for playConnect */
  public playConnectedBleep(): void {
    this.playConnect();
  }

  /** Success chime */
  public playSuccess(): void {
    this.playConnect();
  }

  /** Warning notification */
  public playWarning(): void {
    this.playNotification();
  }

  /** Error buzz */
  public playError(): void {
    this.playDisconnect();
  }

  /** Boss key stealth mute feedback */
  public playBossKey(): void {
    this.playDisconnect();
  }

  /** Disconnection chime (descending tone) */
  public playDisconnect(): void {
    if (!this.isEnabled) return;
    this.init();
    if (!this.audioCtx || !this.masterGain) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.18);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch (_) {}
  }

  /** Mute toggle feedback */
  public playMuteToggle(isMuted: boolean): void {
    if (!this.isEnabled) return;
    this.init();
    if (!this.audioCtx || !this.masterGain) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      if (isMuted) {
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.setValueAtTime(320, now + 0.06);
      } else {
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.setValueAtTime(480, now + 0.06);
      }

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch (_) {}
  }

  /** Vision snapshot chirp */
  public playSnapshot(): void {
    if (!this.isEnabled) return;
    this.init();
    if (!this.audioCtx || !this.masterGain) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(2400, now + 0.04);
      osc.frequency.exponentialRampToValueAtTime(1600, now + 0.08);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.14);
    } catch (_) {}
  }

  /** Camera mechanical shutter feedback */
  public playShutter(): void {
    if (!this.isEnabled) return;
    this.init();
    if (!this.audioCtx || !this.masterGain) return;

    try {
      const now = this.audioCtx.currentTime;
      // Mechanical shutter click
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1600, now);
      osc1.frequency.exponentialRampToValueAtTime(300, now + 0.025);

      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc1.connect(gain1);
      gain1.connect(this.masterGain);

      osc1.start(now);
      osc1.stop(now + 0.035);

      // Second latch sound
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1200, now + 0.035);
      osc2.frequency.exponentialRampToValueAtTime(200, now + 0.065);

      gain2.gain.setValueAtTime(0.15, now + 0.035);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

      osc2.connect(gain2);
      gain2.connect(this.masterGain);

      osc2.start(now + 0.035);
      osc2.stop(now + 0.08);
    } catch (_) {}
  }

  /** Proactive notification / reminder chime (dual harmonic glass bell) */
  public playNotification(): void {
    if (!this.isEnabled) return;
    this.init();
    if (!this.audioCtx || !this.masterGain) return;

    try {
      const now = this.audioCtx.currentTime;
      const freqs = [880, 1318.5]; // A5 + E6 crystal interval

      freqs.forEach((freq) => {
        if (!this.audioCtx || !this.masterGain) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.3);
      });
    } catch (_) {}
  }
}

export const soundFxService = new SoundFxService();
export default soundFxService;
