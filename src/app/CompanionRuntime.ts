import { GeminiLiveClient } from '../domain/gemini/GeminiLiveClient';
import { AudioInputProcessor, type AudioInputProcessorOptions } from '../domain/gemini/AudioInputProcessor';
import { AudioOutputPlayer, type AudioOutputPlayerOptions } from '../domain/gemini/AudioOutputPlayer';

/** Composition root and sole owner of the call's socket, capture and playback. */
export class CompanionRuntime {
  private socket: GeminiLiveClient | null = null;
  private capture: AudioInputProcessor | null = null;
  private playback: AudioOutputPlayer | null = null;
  createSocket(options: ConstructorParameters<typeof GeminiLiveClient>[0]): GeminiLiveClient {
    this.socket?.disconnect();
    this.socket = new GeminiLiveClient(options);
    return this.socket;
  }
  createCapture(options: AudioInputProcessorOptions): AudioInputProcessor {
    this.capture?.stop();
    this.capture = new AudioInputProcessor(options);
    return this.capture;
  }
  createPlayback(options: AudioOutputPlayerOptions): AudioOutputPlayer {
    this.playback?.destroy();
    this.playback = new AudioOutputPlayer(options);
    return this.playback;
  }
  dispose(): void {
    this.capture?.stop(); this.socket?.disconnect(); this.playback?.destroy();
    this.capture = this.socket = this.playback = null;
  }
}
