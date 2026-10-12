export interface LiveSessionPort {
  readonly isConnected: boolean;
  connect(): Promise<void>;
  disconnect(): void;
  sendAudioChunk(data: ArrayBuffer | string): boolean;
  endAudioStream(): void;
}
export interface AudioCapturePort { start(): Promise<void>; stop(): void | Promise<void>; mute(): void; unmute(): void; }
export interface AudioPlaybackPort { playAudioChunk(data: string): Promise<void>; stopImmediate(): void; destroy(): void; }
