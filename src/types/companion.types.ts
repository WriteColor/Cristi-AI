import type { CompanionViewMode, Position2D } from './domain.types';

export interface AllowedFoldersConfig {
  desktop: boolean;
  downloads: boolean;
  documents: boolean;
  pictures: boolean;
  videos: boolean;
  music: boolean;
}

export interface CompanionConfig {
  hasGeminiCredential?: boolean;
  hasSpotifyCredential?: boolean;
  apiKey: string;
  modelId: string;
  voiceName: string;
  systemPrompt: string;
  temperature: number;
  alwaysOnTop: boolean;
  viewMode: CompanionViewMode;
  avatarViewMode?: 'torso' | 'full';
  live2dVisible?: boolean;
  live2dModelId?: 'yanderegirl' | 'jane_doe';
  avatarScale: number;
  avatarPosition: Position2D;
  avatarAnchor?: 'center' | 'bottom-right' | 'bottom-center' | 'bottom-left';
  microphoneDeviceId: string;
  speakerDeviceId: string;
  visionEnabled: boolean;
  visionFaceDetection?: boolean;
  visionObjectDetection?: boolean;
  visionExpressions?: boolean;
  visionHeadlessTimeoutMs?: number;
  screenWatchIntervalMs: number;
  autoReconnect: boolean;
  breathingRoomCooldownMs: number;
  soundFxEnabled: boolean;
  soundFxVolume: number;
  voiceVolume?: number;
  spotifyClientId?: string;
  workspacePath?: string;
  mcpServers?: Array<Record<string, unknown>>;
  updatedAt?: string;
  allowedFolders?: AllowedFoldersConfig;
  customAllowedPaths?: string[];
}
