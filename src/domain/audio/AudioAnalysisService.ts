/**
 * Cristi AI - Real-Time Audio Signal & Vocal Dynamics Analyzer (TypeScript)
 * Extracts multi-band FFT features, RMS energy, spectral centroid (viseme mouth form),
 * and speech rhythm impulses to drive organic Live2D avatar behaviors.
 */

// @ts-ignore
import { eventBus, EVENTS } from '../../infrastructure/events/eventBus.ts';

export interface AudioAnalysisBands {
  low: number;
  mid: number;
  high: number;
}

export interface AudioAnalysisMetrics {
  volume: number;
  mouthOpen: number;
  mouthForm: number;
  isSpeaking: boolean;
  isPeakEnergy: boolean;
  spectralCentroid: number;
  bands: AudioAnalysisBands;
}

export class AudioAnalysisService {
  public audioContext: AudioContext;
  public sourceNode: AudioNode | null = null;
  public analyser: AnalyserNode;

  public frequencyData: Uint8Array;
  public timeDomainData: Uint8Array;

  public isRunning = false;
  private animationFrameId: number | null = null;

  // Filtered / smoothed outputs
  public smoothedVolume = 0;
  public smoothedMouthOpen = 0;
  public smoothedMouthForm = 0;
  public lastSpeechActivityTime = 0;
  public isSpeaking = false;

  // Rhythmic nod impulse accumulator (zero-alloc circular buffer & running sum)
  private readonly energyHistorySize = 15;
  private energyHistory: Float32Array;
  private energyHistoryIndex = 0;
  private energyHistoryCount = 0;
  private energyHistorySum = 0;

  constructor(audioContext: AudioContext | null = null, sourceNode: AudioNode | null = null) {
    this.audioContext = audioContext as AudioContext;
    this.sourceNode = sourceNode;

    // Analyser Node setup
    if (this.audioContext && typeof this.audioContext.createAnalyser === 'function') {
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.25; // Quick response for speech

      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeDomainData = new Uint8Array(this.analyser.fftSize);
    } else {
      this.analyser = null as any;
      this.frequencyData = new Uint8Array(256);
      this.timeDomainData = new Uint8Array(512);
    }

    this.energyHistory = new Float32Array(this.energyHistorySize);

    if (this.sourceNode && this.analyser) {
      this.connectSource(this.sourceNode);
    }
  }

  /**
   * Connect an audio source node (e.g. gainNode or bufferSource) to the analyser
   */
  public connectSource(sourceNode: AudioNode): void {
    this.sourceNode = sourceNode;
    try {
      this.sourceNode.connect(this.analyser);
    } catch (e) {
      console.warn('[AudioAnalysis] Could not connect source node to analyser:', e);
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.analyzeLoop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    const wasSpeaking = this.isSpeaking;
    this.smoothedVolume = 0;
    this.smoothedMouthOpen = 0;
    this.smoothedMouthForm = 0;
    this.isSpeaking = false;
    this.energyHistory.fill(0);
    this.energyHistoryIndex = 0;
    this.energyHistoryCount = 0;
    this.energyHistorySum = 0;

    if (wasSpeaking) {
      eventBus.emit(EVENTS.SPEECH_END);
    }

    // Emit zeroed metrics so avatar lips and visualizer return cleanly to neutral rest position
    eventBus.emit(EVENTS.AUDIO_ANALYSIS, {
      volume: 0,
      mouthOpen: 0,
      mouthForm: 0,
      isSpeaking: false,
      isPeakEnergy: false,
      spectralCentroid: 0,
      bands: { low: 0, mid: 0, high: 0 }
    });
  }

  public analyzeLoop = (): void => {
    if (!this.isRunning) return;

    this.analyser.getByteFrequencyData(this.frequencyData as unknown as Uint8Array<ArrayBuffer>);
    this.analyser.getByteTimeDomainData(this.timeDomainData as unknown as Uint8Array<ArrayBuffer>);

    const metrics = this.computeMetrics();

    // Emit analysis event on EventBus
    eventBus.emit(EVENTS.AUDIO_ANALYSIS, metrics);

    this.animationFrameId = requestAnimationFrame(this.analyzeLoop);
  };

  public computeMetrics(): AudioAnalysisMetrics {
    const binCount = this.frequencyData.length; // 256 bins for fftSize 512
    const sampleRate = this.audioContext.sampleRate || 24000;
    const binWidth = (sampleRate / 2) / binCount;

    // 1. Time-domain RMS Volume calculation
    let sumSquares = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      const normalized = (this.timeDomainData[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rawRms = Math.sqrt(sumSquares / this.timeDomainData.length);
    const volume = Math.min(Math.max(rawRms * 3.2, 0), 1);

    // Dynamic Attack/Decay Envelope for Speech
    const isAttacking = volume > this.smoothedVolume;
    const attackRate = 0.72; // Fast crisp opening on voice burst
    const decayRate = 0.28;  // Inertial smooth close without stutter
    const filterRate = isAttacking ? attackRate : decayRate;
    this.smoothedVolume = this.smoothedVolume + (volume - this.smoothedVolume) * filterRate;

    // 2. Multi-band frequency breakdown (Multi-Band Formant Decomposition)
    let lowEnergy = 0;
    let midEnergy = 0;
    let highEnergy = 0;
    let totalWeightedFreq = 0;
    let totalFreqEnergy = 0;

    for (let i = 0; i < binCount; i++) {
      const freq = i * binWidth;
      const mag = this.frequencyData[i] / 255;

      totalFreqEnergy += mag;
      totalWeightedFreq += freq * mag;

      if (freq >= 80 && freq < 450) {
        lowEnergy += mag * 1.4; // Fundamental voice harmonics (jaw drop)
      } else if (freq >= 450 && freq < 2800) {
        midEnergy += mag;       // Vowel formants F1/F2
      } else if (freq >= 2800) {
        highEnergy += mag * 1.2;// Fricatives and sibilance (lip spread)
      }
    }

    // Normalize bands
    const lowBand = lowEnergy / Math.max(1, Math.floor(400 / binWidth));
    const midBand = midEnergy / Math.max(1, Math.floor(2400 / binWidth));
    const highBand = highEnergy / Math.max(1, binCount - Math.floor(2800 / binWidth));

    // 3. Spectral Centroid for Viseme Shape (ParamMouthForm: -1.0 rounded 'O/U' to +1.0 wide 'A/E/I')
    const spectralCentroid = totalFreqEnergy > 0.05 ? totalWeightedFreq / totalFreqEnergy : 1200;
    const rawMouthForm = Math.min(Math.max((spectralCentroid - 1350) / 1000, -1), 1);
    this.smoothedMouthForm = this.smoothedMouthForm + (rawMouthForm - this.smoothedMouthForm) * 0.22;

    // 4. Proportional Jaw Mouth Opening (combines Low-band resonance with overall RMS volume)
    const jawEnergy = (lowEnergy * 0.45) + (this.smoothedVolume * 0.55);
    const rawMouthOpen = Math.min(Math.max(Math.pow(jawEnergy, 0.8) * 1.45, 0), 1.0);
    this.smoothedMouthOpen = this.smoothedMouthOpen + (rawMouthOpen - this.smoothedMouthOpen) * (isAttacking ? 0.80 : 0.35);

    // 5. Speech activity & rhythmic peak energy detection
    const isSpeakingNow = this.smoothedVolume > 0.04;
    const now = performance.now();
    const wasSpeaking = this.isSpeaking;

    if (isSpeakingNow) {
      this.lastSpeechActivityTime = now;
      this.isSpeaking = true;
    } else if (now - this.lastSpeechActivityTime > 300) {
      this.isSpeaking = false;
    }

    if (!wasSpeaking && this.isSpeaking) {
      eventBus.emit(EVENTS.SPEECH_START);
    } else if (wasSpeaking && !this.isSpeaking) {
      eventBus.emit(EVENTS.SPEECH_END);
    }

    // Detect emphatic speech peaks for head nod triggers
    const oldEnergy = this.energyHistory[this.energyHistoryIndex];
    this.energyHistorySum -= oldEnergy;
    this.energyHistory[this.energyHistoryIndex] = volume;
    this.energyHistorySum += volume;
    this.energyHistoryIndex = (this.energyHistoryIndex + 1) % this.energyHistorySize;
    if (this.energyHistoryCount < this.energyHistorySize) {
      this.energyHistoryCount++;
    }
    const avgEnergy = this.energyHistoryCount > 0 ? this.energyHistorySum / this.energyHistoryCount : 0;
    const isPeakEnergy = volume > 0.45 && volume > avgEnergy * 1.6;

    return {
      volume: this.smoothedVolume,
      mouthOpen: this.smoothedMouthOpen,
      mouthForm: this.smoothedMouthForm,
      isSpeaking: this.isSpeaking,
      isPeakEnergy,
      spectralCentroid,
      bands: {
        low: lowBand,
        mid: midBand,
        high: highBand
      }
    };
  }

  public destroy(): void {
    this.stop();
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect(this.analyser);
      } catch (_) {}
      this.sourceNode = null;
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch (_) {}
    }
  }
}

export default AudioAnalysisService;
