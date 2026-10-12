/**
 * Google Gemini Multimodal Live API WebSocket Types (BidiGenerateContent).
 */

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  behavior?: 'NON_BLOCKING' | 'BLOCKING';
  parameters?: {
    type: 'object' | 'OBJECT';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface GeminiLiveToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
}

export interface GeminiLiveToolResponse {
  id: string;
  name: string;
  response: {
    result: any;
    output?: any;
    error?: string;
  };
}

export type GeminiLiveConnectionState = 
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'READY'
  | 'TRANSMITTING'
  | 'RECONNECTING'
  | 'ERROR';

export interface GeminiLiveConfig {
  apiKey: string;
  modelId?: string;
  voiceName?: string;
  systemPrompt?: string;
  temperature?: number;
  tools?: GeminiFunctionDeclaration[];
  sessionResumptionHandle?: string | null;
  maxReconnectAttempts?: number;
  onReconnecting?: (attempts: number, delay: number) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (err: any) => void;
  onAudioChunk?: (pcm16: Int16Array) => void;
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onToolCall?: (calls: GeminiLiveToolCall[]) => Promise<GeminiLiveToolResponse[]> | void;
  onConnectionStateChange?: (state: GeminiLiveConnectionState) => void;
}

export interface LipSyncMetrics {
  mouthOpen: number;
  mouthForm: number;
  volume: number;
  isSpeaking: boolean;
  spectralCentroid?: number;
}

export interface GeminiSessionConfig extends GeminiLiveConfig {
  autoStartMicrophone?: boolean;
  onLipSync?: (metrics: LipSyncMetrics) => void;
  onInputVolumeChange?: (volume: number) => void;
  onOutputVolumeChange?: (volume: number) => void;
  onVADChange?: (isSpeaking: boolean) => void;
}
