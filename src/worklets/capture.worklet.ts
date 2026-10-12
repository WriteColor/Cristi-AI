import { StreamingResampler } from '../domain/audio/StreamingResampler';
declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort; }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

const CHUNK_SAMPLES = 480; // 30ms at 16kHz for responsive turn detection

class CaptureProcessor extends AudioWorkletProcessor {
  private resampler = new StreamingResampler(sampleRate, 16000);
  private buffer = new Int16Array(CHUNK_SAMPLES);
  private index = 0;
  private previousInput = 0;
  private previousOutput = 0;
  private energy = 0;
  private muted = false;
  private epoch = 0;
  private highPassEnabled = true;
  private highPassHz = 80;

  private flush(): void {
    if (this.index > 0) {
      const pcm = this.buffer.slice(0, this.index);
      const volume = Math.sqrt(this.energy / this.index);
      this.port.postMessage({ pcm: pcm.buffer, volume, epoch: this.epoch }, [pcm.buffer]);
      this.buffer = new Int16Array(CHUNK_SAMPLES);
      this.index = 0;
      this.energy = 0;
    }
  }

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<{ muted?: boolean; epoch?: number; highPassEnabled?: boolean; highPassHz?: number }>) => {
      if (typeof event.data.muted === 'boolean') {
        if (event.data.muted) this.flush();
        this.muted = event.data.muted;
      }
      if (typeof event.data.epoch === 'number') this.epoch = event.data.epoch;
      if (typeof event.data.highPassEnabled === 'boolean') this.highPassEnabled = event.data.highPassEnabled;
      if (typeof event.data.highPassHz === 'number') this.highPassHz = event.data.highPassHz;
      this.resampler = new StreamingResampler(sampleRate, 16000);
      this.buffer = new Int16Array(CHUNK_SAMPLES); this.index = this.energy = this.previousInput = this.previousOutput = 0;
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input || this.muted) return true;
    let processedInput = input;
    if (this.highPassEnabled && this.highPassHz > 0) {
      const filtered = new Float32Array(input.length);
      const alpha = Math.exp(-2 * Math.PI * this.highPassHz / sampleRate);
      for (let i = 0; i < input.length; i++) {
        const value = alpha * (this.previousOutput + input[i] - this.previousInput);
        this.previousInput = input[i]; this.previousOutput = value;
        filtered[i] = value;
      }
      processedInput = filtered;
    }
    for (const sample of this.resampler.process(processedInput)) {
      const clamped = Math.max(-1, Math.min(1, sample));
      this.buffer[this.index++] = Math.round(clamped * (clamped < 0 ? 32768 : 32767));
      this.energy += clamped * clamped;
      if (this.index === CHUNK_SAMPLES) {
        const pcm = this.buffer;
        this.port.postMessage({ pcm: pcm.buffer, volume: Math.sqrt(this.energy / CHUNK_SAMPLES), epoch: this.epoch }, [pcm.buffer]);
        this.buffer = new Int16Array(CHUNK_SAMPLES); this.index = 0; this.energy = 0;
      }
    }
    return true;
  }
}
registerProcessor('cristi-capture', CaptureProcessor);
