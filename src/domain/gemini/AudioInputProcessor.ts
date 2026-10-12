import type { AudioCapturePort } from '../../app/ports';
import captureUrl from '../../worklets/capture.worklet?worker&url';
export interface AudioInputProcessorOptions {
  onAudioData?: (data: ArrayBuffer) => void;
  onVolumeChange?: (volume: number) => void;
  onStreamEnd?: () => void;
  onError?: (error: Error) => void;
  dspConfig?: { highPassEnabled?: boolean; highPassHz?: number };
}
export class AudioInputProcessor implements AudioCapturePort {
  audioContext: AudioContext | null = null;
  mediaStream: MediaStream | null = null;
  isRecording = false;
  isMuted = false;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private muteNode: GainNode | null = null;
  private generation = 0;
  private pending: Promise<void> | null = null;
  private lastVolume = 0;
  private processed = 0;
  private streamEpoch = 0;
  private dspConfig: { highPassEnabled: boolean; highPassHz: number };

  constructor(private readonly options: AudioInputProcessorOptions = {}) {
    this.dspConfig = {
      highPassEnabled: options.dspConfig?.highPassEnabled ?? true,
      highPassHz: options.dspConfig?.highPassHz ?? 80
    };
  }

  setDspConfig(config: { highPassEnabled?: boolean; highPassHz?: number }): void {
    if (typeof config.highPassEnabled === 'boolean') this.dspConfig.highPassEnabled = config.highPassEnabled;
    if (typeof config.highPassHz === 'number') this.dspConfig.highPassHz = config.highPassHz;
    this.node?.port.postMessage({
      highPassEnabled: this.dspConfig.highPassEnabled,
      highPassHz: this.dspConfig.highPassHz
    });
  }

  start(): Promise<void> {
    if (this.isRecording) return Promise.resolve();
    if (this.pending) return this.pending;
    const epoch = ++this.generation;
    const pending = this.open(epoch).finally(() => { if (this.pending === pending) this.pending = null; });
    this.pending = pending;
    return pending;
  }

  private async open(epoch: number): Promise<void> {
    let context: AudioContext | null = null;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (epoch !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      try {
        context = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
      } catch {
        context = new AudioContext({ latencyHint: 'interactive' });
      }
      await context.audioWorklet.addModule(captureUrl);
      await context.resume();
      if (epoch !== this.generation) { stream.getTracks().forEach(track => track.stop()); await context.close(); return; }
      this.mediaStream = stream; this.audioContext = context;
      this.node = new AudioWorkletNode(context, 'cristi-capture');
      this.node.port.postMessage({
        muted: this.isMuted,
        epoch: this.streamEpoch,
        highPassEnabled: this.dspConfig.highPassEnabled,
        highPassHz: this.dspConfig.highPassHz
      });
      this.node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; volume: number; epoch: number }>) => {
        if (!this.isRecording || this.isMuted || epoch !== this.generation || event.data.epoch !== this.streamEpoch) return;
        this.processed++;
        const now = performance.now();
        if (now - this.lastVolume >= 50) { this.options.onVolumeChange?.(Math.min(1, event.data.volume * 4.5)); this.lastVolume = now; }
        this.options.onAudioData?.(event.data.pcm);
      };
      this.source = context.createMediaStreamSource(stream);
      this.muteNode = context.createGain(); this.muteNode.gain.value = 0;
      this.source.connect(this.node); this.node.connect(this.muteNode); this.muteNode.connect(context.destination);
      this.isRecording = true;
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (context && context.state !== 'closed') await context.close();
      if (epoch === this.generation) this.options.onError?.(error as Error);
      throw error;
    }
  }
  mute(): void { if (!this.isMuted) this.options.onStreamEnd?.(); this.isMuted = true; this.node?.port.postMessage({ muted: true, epoch: ++this.streamEpoch }); this.options.onVolumeChange?.(0); }
  unmute(): void { this.node?.port.postMessage({ muted: false, epoch: ++this.streamEpoch }); this.isMuted = false; }
  toggleMute(): boolean { if (this.isMuted) this.unmute(); else this.mute(); return this.isMuted; }
  async resumeContext(): Promise<void> { if (this.audioContext?.state === 'suspended') await this.audioContext.resume(); }
  async stop(): Promise<void> {
    this.generation++;
    this.pending = null;
    if (this.isRecording && !this.isMuted) this.options.onStreamEnd?.();
    this.isRecording = false;
    if (this.node) { this.node.port.onmessage = null; this.node.port.close(); this.node.disconnect(); this.node = null; }
    this.source?.disconnect(); this.source = null; this.muteNode?.disconnect(); this.muteNode = null;
    this.mediaStream?.getTracks().forEach(track => track.stop()); this.mediaStream = null;
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { await this.audioContext.close(); } catch {}
    }
    this.audioContext = null; this.options.onVolumeChange?.(0);
  }
  destroy(): void { void this.stop(); }
  getTelemetry() { return { isRecording: this.isRecording, isMuted: this.isMuted, sampleRate: this.audioContext?.sampleRate ?? 0, targetRate: 16000, processorType: 'AudioWorklet', processedChunksCount: this.processed, dspConfig: this.dspConfig }; }
}
