/**
 * Domain types and event envelopes for Cristi AI Companion.
 */

export type CompanionViewMode = 'transparent' | 'windowed' | 'pip';

export interface Position2D {
  x: number;
  y: number;
}

import type { ScreenRegion } from './sensory.types';
import type { AllowedFoldersConfig } from './companion.types';

export interface VisionDetection {
  id?: string;
  class?: string;
  label?: string;
  score?: number;
  bbox?: [number, number, number, number];
  box?: ScreenRegion;
  timestamp?: number;
  [key: string]: unknown;
}

export interface SessionLog {
  id: string;
  tag: string;
  message: string;
  timestamp: number;
}

export interface TelemetryMetrics {
  fps: number;
  tps: number;
  p99: number;
  v8HeapMB: number;
  processRssMB: number;
}

export interface Widget {
  id: string;
  title: string;
  content: string;
  type: string;
  createdAt: number;
  time?: string;
  tag?: string;
  done?: boolean;
  duration?: number;
  description?: string;
  icon?: string;
  badge?: string;
  progress?: number;
}

export interface Alarm {
  id: string;
  time: string;
  label: string;
  title?: string;
  action?: string | null;
  executed?: boolean;
  approachingAlerted?: boolean;
  createdAt: number;
  enabled?: boolean;
}

export interface DomainEventEnvelope<T = unknown> {
  type: string;
  source: string;
  sessionId?: string | null;
  correlationId?: string;
  priority?: number | string; // 0 = normal, 1 = priority, 2 = emergency, or 'normal' | 'high' | 'emergency'
  privacy?: 'local' | 'shared' | 'sensitive' | 'internal' | 'external';
  payload: T;
  timestamp?: number;
}

export interface AppConfig {
  hasGeminiCredential?: boolean;
  hasSpotifyCredential?: boolean;
  apiKey: string;
  modelId: string;
  voiceName: string;
  systemPrompt: string;
  temperature: number;
  alwaysOnTop: boolean;
  viewMode: CompanionViewMode;
  /** Framing for the Live2D avatar; distinct from the companion window mode. */
  avatarViewMode?: 'torso' | 'full';
  /** The avatar renderer is mounted only while this is true. */
  live2dVisible?: boolean;
  /** The two bundled companion avatars. */
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
  zenMode?: boolean;
  updatedAt?: string;
  allowedFolders?: AllowedFoldersConfig;
  customAllowedPaths?: string[];
}

export interface Live2DModelConfig {
  id: string;
  name: string;
  path: string;
  scale: number;
  initialScale?: number;
  defaultPosition?: Position2D;
  expressions?: Record<string, string>;
  motions?: Record<string, string[]>;
  description?: string;
  tags?: string[];
}

// ── Memory Domain Types ──────────────────────────────────────────────────────
export type MemoryCategory = 'fact' | 'preference' | 'relationship' | 'task' | 'general' | 'conversation';

export interface MemoryItem {
  id: string;
  key?: string;
  category: MemoryCategory;
  content: string;
  confidence: number;
  source: string;
  createdAt: number;
  updatedAt: number;
  sessionId?: string | null;
  supersededBy?: string | null;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
  id: string;
  memory: MemoryItem;
  score: number;
}

export interface MemorySearchOptions {
  limit?: number;
  minScore?: number;
  category?: MemoryCategory;
  includeInactive?: boolean;
}

export interface ContradictionResolution {
  detected: boolean;
  strategy: 'replace' | 'supersede' | 'keep_both' | 'none';
  priorMemoryId?: string | null;
  supersededMemoryId?: string | null;
  explanation?: string;
}

// ── Spotify Domain Types ─────────────────────────────────────────────────────
export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string[];
  albumName: string;
  uri: string;
  durationMs?: number;
  previewUrl?: string | null;
  coverImage?: string | null;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artists: string[];
  uri: string;
  totalTracks?: number;
  coverImage?: string | null;
}

export interface SpotifySearchResult {
  success: boolean;
  query: string;
  tracks: SpotifyTrack[];
  albums: SpotifyAlbum[];
  error?: string;
}

export interface SpotifyPlaybackState {
  success: boolean;
  isRunning: boolean;
  isPlaying: boolean;
  rawTitle?: string;
  artist?: string | null;
  track?: string | null;
  uri?: string | null;
  error?: string;
}

export interface SpotifyCommandResult {
  success: boolean;
  status?: 'success' | 'error' | 'idle';
  action?: string;
  uri?: string;
  message?: string;
  error?: string;
  isWebFallback?: boolean;
}
