import { z } from 'zod';

const text = z.string().max(65536).refine(value => !value.includes('\0'));
const name = z.string().min(1).max(256);
const number = z.number().finite();
const json: z.ZodType<unknown> = z.lazy(() => z.union([z.null(), z.boolean(), number, text,
  z.array(json).max(10000), z.record(z.string(), json)]));
const record = z.record(z.string(), json);
export type PathScope = 'userData' | 'exports' | 'workspaceApproved' | 'desktop' | 'downloads' | 'documents' | 'pictures' | 'videos' | 'music' | 'custom';
const pathScopeSchema = z.enum([
  'userData',
  'exports',
  'workspaceApproved',
  'desktop',
  'downloads',
  'documents',
  'pictures',
  'videos',
  'music',
  'custom',
]);
const fileObjectSchema = z.object({ scope: pathScopeSchema, path: z.string().max(4096) }).strict();
const file = z.union([
  fileObjectSchema,
  z.string().max(4096).transform((p): { scope: PathScope; path: string } => ({ scope: 'workspaceApproved', path: p })),
]);
const secret = z.enum(['gemini.apiKey', 'spotify.clientSecret']);
const noArgs = z.tuple([]);
const screenRegionSchema = z.object({ x_pct: number.min(0).max(100).optional(), y_pct: number.min(0).max(100).optional(),
  w_pct: number.min(1).max(100).optional(), h_pct: number.min(1).max(100).optional() }).strict();
const screenCaptureRequestSchema = z.object({ region: screenRegionSchema.nullish(), targetWindow: z.string().nullish(), fresh: z.boolean().optional() }).strict();

export const requestSchemas = {
  'set-ignore-mouse-events': z.tuple([z.boolean(), z.object({ forward: z.boolean().optional() }).strict().optional()]),
  'sync-interactive-hitboxes': z.tuple([z.array(z.object({ x: number, y: number, width: number.nonnegative(), height: number.nonnegative() }).passthrough()).max(256)]),
  'set-always-on-top': z.tuple([z.boolean()]),
  'get-always-on-top': noArgs, 'focus-window': noArgs, 'minimize-window': noArgs, 'show-window': noArgs, 'hide-window': noArgs,
  'quit-app': noArgs, 'relaunch-app': noArgs, 'reload-window': noArgs, 'get-display-info': noArgs,
  'get-process-memory-info': noArgs, 'get-gpu-feature-status': noArgs, 'get-gpu-info': noArgs, 'get-app-version': noArgs,
  'open-settings-window': noArgs, 'close-settings-window': noArgs, 'open-camera-window': noArgs,
  'close-camera-window': noArgs, 'is-camera-window-open': noArgs,
  'open-telemetry-window': noArgs, 'close-telemetry-window': noArgs,
  'telemetry-report': z.tuple([record]), 'telemetry-snapshot': noArgs,
  'read-file': z.tuple([file]), 'write-file': z.tuple([file, text]), 'append-file': z.tuple([file, text]),
  'delete-file': z.union([z.tuple([file]), z.tuple([file, z.boolean().optional()])]),
  'move-file': z.tuple([file, file]),
  'search-directory': z.union([noArgs, z.tuple([file]), z.tuple([file, text.optional()]), z.tuple([file, text.optional(), number.optional()])]),
  'list-windows': noArgs,
  'focus-os-window': z.tuple([z.union([text, number])]),
  'manage-os-window': z.tuple([z.union([text, number]), z.enum(['minimize', 'maximize', 'restore', 'close'])]),
  'list-installed-apps': z.union([noArgs, z.tuple([text.optional()])]),
  'launch-app': z.union([z.tuple([text]), z.tuple([text, z.array(text).optional()])]),
  'read-directory': z.tuple([file]), 'open-path': z.tuple([file]), 'show-item-in-folder': z.tuple([file]),
  'approve-workspace': noArgs,
  'system-get-folders': noArgs,
  'system-execute': z.tuple([z.object({ kind: z.enum(['system-info', 'list-processes']) }).strict()]),
  'open-external': z.tuple([z.string().url().max(4096)]),
  'get-clipboard-text': noArgs, 'set-clipboard-text': z.tuple([text]),
  'show-notification': z.tuple([z.object({ title: text.optional(), body: text.optional() }).strict()]),
  // Legacy callers may pass a region directly; explicit snapshots use { region, fresh: true }.
  'capture-screen-native': z.tuple([z.union([screenRegionSchema.nullish(), screenCaptureRequestSchema]).optional()]),
  'get-app-config': noArgs, 'save-app-config': z.tuple([record]),
  'config-read-all': noArgs,
  'config-write-section': z.union([
    z.tuple([z.object({ section: text, data: z.unknown() }).passthrough()]),
    z.tuple([text, z.unknown()])
  ]),
  'secure-set-secret': z.tuple([secret, z.string().max(8192)]),
  'secure-delete-secret': z.tuple([secret]), 'credential-status': noArgs,
  'live-token': z.tuple([z.string().regex(/^gemini-[a-zA-Z0-9.-]+$/).max(160)]),
  'gemini-generate': z.tuple([z.string().regex(/^gemini-[a-zA-Z0-9.-]+$/).max(160), record]),
  'memory-load': noArgs, 'memory-save': z.tuple([z.array(record).max(10000)]),
  'companion-pause': noArgs, 'companion-resume': noArgs,
  'check-for-updates': noArgs, 'download-update': noArgs, 'install-update': noArgs,
  'mcp-connect': z.tuple([z.object({ id: name, name: name.optional(), type: z.enum(['stdio', 'sse']).optional(),
    command: text.optional(), args: z.array(text).max(100).optional(), env: z.record(z.string(), text).optional(),
    url: z.string().url().optional(), headers: z.record(z.string(), text).optional() }).strict()]),
  'mcp-call-tool': z.tuple([z.object({ serverId: name, name, arguments: record.optional(), timeoutMs: number.min(1000).max(60000).optional() }).strict()]),
  'mcp-disconnect': z.tuple([name]),
  'windows-media-control': z.tuple([text]),
  'windows-media-status': noArgs,
  'windows-spotify-launch': z.tuple([text]),
  'spotify-start-auth': z.union([
    z.tuple([]),
    z.tuple([z.object({
      clientId: text.optional(),
      clientSecret: text.optional(),
      redirectUri: text.optional()
    }).passthrough().optional()])
  ]),
  'spotify-get-session': noArgs,
  'spotify-logout': noArgs,
  'spotify-web-api': z.tuple([z.object({
    action: text,
    args: z.unknown().optional()
  }).passthrough()]),
  'computer-input': z.tuple([z.object({
    action: z.enum(['press_key', 'type_text', 'mouse_click', 'scroll']),
    key: z.string().optional(),
    text: z.string().optional(),
    coordinate: z.tuple([z.number(), z.number()]).optional(),
    scroll_amount: z.number().optional(),
  }).strict()]),
  'system-execute-command': z.tuple([z.object({
    command: z.string(),
    cwd: z.string().optional(),
    timeoutMs: z.number().optional(),
  }).strict()]),
  'browser-navigate': z.tuple([z.object({
    url: z.string().min(1).max(4096),
    timeoutMs: z.number().optional(),
  }).strict()]),
  'browser-search': z.tuple([z.object({
    query: z.string().min(1).max(2048),
    engine: z.enum(['google', 'brave', 'duckduckgo']).optional(),
  }).strict()]),
  'browser-play-youtube': z.tuple([z.object({
    query: z.string().min(1).max(2048),
    autoPlay: z.boolean().optional(),
    timeoutMs: z.number().optional(),
  }).strict()]),
  'browser-media-control': z.tuple([z.object({
    action: z.enum(['play', 'pause', 'toggle', 'seek', 'volume', 'mute', 'unmute', 'fullscreen']),
    value: z.number().optional(),
  }).strict()]),
  'browser-click': z.tuple([z.object({
    selector: z.string().min(1).max(2048),
    timeoutMs: z.number().optional(),
  }).strict()]),
  'browser-type': z.tuple([z.object({
    selector: z.string().min(1).max(2048),
    text: z.string().max(8192),
    pressEnter: z.boolean().optional(),
    timeoutMs: z.number().optional(),
  }).strict()]),
  'browser-snapshot': z.union([
    noArgs,
    z.tuple([z.object({
      maxChars: z.number().optional(),
    }).strict()])
  ]),
  'browser-take-screenshot': z.union([
    noArgs,
    z.tuple([z.object({
      fullPage: z.boolean().optional(),
    }).strict()])
  ]),
  'browser-evaluate': z.tuple([z.object({
    script: z.string().min(1).max(32768),
  }).strict()]),
  'browser-close': noArgs,
  'browser-get-status': noArgs,
} as const;

export type IpcChannel = keyof typeof requestSchemas;
export type IpcRequest<C extends IpcChannel> = z.input<(typeof requestSchemas)[C]>;
export type FileRequest = z.infer<typeof file>;

const cameraChannels = new Set<IpcChannel>(['close-camera-window', 'get-app-config', 'get-app-version']);
const telemetryChannels = new Set<IpcChannel>(['close-telemetry-window', 'telemetry-snapshot', 'get-process-memory-info', 'get-gpu-feature-status', 'get-gpu-info', 'get-app-version', 'windows-media-status']);
const settingsOnly = new Set<IpcChannel>(['secure-set-secret', 'secure-delete-secret', 'approve-workspace', 'install-update']);
const mainOnly = new Set<IpcChannel>(['live-token', 'gemini-generate', 'sync-interactive-hitboxes',
  'set-ignore-mouse-events', 'capture-screen-native', 'memory-save', 'telemetry-report']);
export function channelAllowed(channel: IpcChannel, kind: 'main' | 'settings' | 'camera' | 'telemetry'): boolean {
  if (kind === 'camera') return cameraChannels.has(channel);
  if (kind === 'telemetry') return telemetryChannels.has(channel);
  if (settingsOnly.has(channel)) return kind === 'settings';
  if (mainOnly.has(channel)) return kind === 'main';
  return true;
}

export function validateRequest<C extends IpcChannel>(channel: C, args: unknown[]): IpcRequest<C> {
  // Size/depth before recursive schema evaluation prevents resource exhaustion.
  const visit = (value: unknown, depth: number): void => {
    if (depth > 24) throw new Error('Payload demasiado profundo.');
    if (value && typeof value === 'object') {
      for (const entry of Object.values(value)) visit(entry, depth + 1);
    }
  };
  if (JSON.stringify(args).length > 1_048_576) throw new Error('Payload demasiado grande.');
  visit(args, 0);
  return requestSchemas[channel].parse(args) as IpcRequest<C>;
}

// ── Interfaces auxiliares para respuestas tipadas ─────────────────────────────

/** Información de pantalla devuelta por get-display-info */
export interface DisplayInfo {
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  id: number;
  label?: string;
}

/** Información de memoria del proceso devuelta por get-process-memory-info */
export interface ProcessMemoryInfo {
  residentSet?: number;
  private: number;
  shared?: number;
  [key: string]: unknown;
}

/** Región de pantalla para capture-screen-native (porcentajes 0-100) */
export interface ScreenCaptureRequest {
  region?: ScreenRegion | null;
  /** Focus and capture only the specified window title or process. */
  targetWindow?: string | null;
  /** Bypass the short native cache for an explicit user/model snapshot. */
  fresh?: boolean;
}

export interface ScreenRegion {
  x_pct?: number;
  y_pct?: number;
  w_pct?: number;
  h_pct?: number;
}

export interface MemoryRecord {
  id: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type MemoryLoadResult = {
  success: true;
  backend: 'sqlite' | 'json';
  memories: MemoryRecord[] | null;
} | { success: false; error: string };

export interface MemorySaveResult {
  success: boolean;
  backend?: 'sqlite' | 'json';
  count?: number;
  error?: string;
}

// ── Mapa de tipos de respuesta por canal IPC ──────────────────────────────────
// Tipos inferidos en compile-time; NO se validan en runtime (sin Zod).

export interface IpcResponseMap {
  'set-ignore-mouse-events': void;
  'sync-interactive-hitboxes': void;
  'set-always-on-top': void;
  'get-always-on-top': boolean;
  'minimize-window': void;
  'show-window': void;
  'hide-window': void;
  'quit-app': void;
  'relaunch-app': { success: boolean; error?: string };
  'reload-window': { success: boolean; error?: string };
  'get-display-info': DisplayInfo;
  'get-process-memory-info': ProcessMemoryInfo;
  'get-gpu-feature-status': Record<string, string>;
  'get-gpu-info': Record<string, unknown>;
  'get-app-version': string;
  'open-settings-window': { success: boolean };
  'close-settings-window': { success: boolean };
  'open-camera-window': { success: boolean };
  'close-camera-window': { success: boolean };
  'is-camera-window-open': boolean;
  'open-telemetry-window': { success: boolean };
  'close-telemetry-window': { success: boolean };
  'telemetry-report': { success: boolean };
  'telemetry-snapshot': Record<string, unknown>;
  'read-file': string;
  'write-file': boolean;
  'append-file': boolean;
  'delete-file': { success: boolean; error?: string };
  'move-file': { success: boolean; error?: string };
  'search-directory': Array<{ path: string; name: string; type: 'FILE' | 'DIRECTORY'; size?: number }>;
  'list-windows': Array<{ hwnd: number; pid: number; title: string; process: string; isMinimized: boolean; isMaximized: boolean }>;
  'focus-os-window': { success: boolean; title?: string; error?: string };
  'manage-os-window': { success: boolean; action: string; error?: string };
  'list-installed-apps': Array<{ name: string; path: string; type: 'shortcut' | 'executable' }>;
  'launch-app': { success: boolean; appName: string; path?: string; error?: string };
  'read-directory': { entry: string; type: 'FILE' | 'DIRECTORY' }[];
  'open-path': { success: boolean; error: string | null };
  'show-item-in-folder': boolean;
  'approve-workspace': { success: boolean; path?: string };
  'system-get-folders': Record<string, string>;
  'system-execute': unknown;
  'open-external': boolean;
  'get-clipboard-text': string;
  'set-clipboard-text': boolean;
  'show-notification': boolean;
  'capture-screen-native': string | null;
  'get-app-config': Record<string, unknown>;
  'save-app-config': { success: boolean };
  'config-read-all': Record<string, unknown>;
  'config-write-section': { success: boolean } | boolean;
  'secure-set-secret': { success: boolean };
  'secure-delete-secret': { success: boolean };
  'credential-status': {
    hasGeminiCredential: boolean;
  };
  'live-token': string;
  'gemini-generate': unknown;
  'memory-load': MemoryLoadResult;
  'memory-save': MemorySaveResult;
  'companion-pause': void;
  'companion-resume': void;
  'check-for-updates': { success: boolean; version?: string; isLocal?: boolean; error?: string };
  'download-update': { success: boolean; error?: string };
  'install-update': boolean;
  'mcp-connect': {
    success: boolean;
    serverId?: string;
    protocolVersion?: string | null;
    version?: string | null;
    tools?: unknown[];
    error?: string;
  };
  'mcp-call-tool': { success: boolean; content?: unknown; error?: string };
  'mcp-disconnect': { success: boolean };
  'windows-media-control': { success: boolean; action: string };
  'windows-media-status': unknown;
  'windows-spotify-launch': { success: boolean; uri: string };
  'spotify-start-auth': { success: boolean; url?: string; error?: string };
  'spotify-get-session': SpotifySessionStatus;
  'spotify-logout': { success: boolean };
  'spotify-web-api': unknown;
  'computer-input': { success: boolean; error?: string };
  'system-execute-command': { stdOut?: string; stdErr?: string; exitCode?: number; error?: string };
  'browser-navigate': { success: boolean; url: string; title: string; error?: string };
  'browser-search': { success: boolean; query: string; url: string; title: string; error?: string };
  'browser-play-youtube': {
    success: boolean;
    title: string;
    videoUrl: string;
    playing: boolean;
    currentTime: number;
    duration: number;
    error?: string;
  };
  'browser-media-control': { success: boolean; action: string; playing?: boolean; volume?: number; currentTime?: number; duration?: number; error?: string };
  'browser-click': { success: boolean; selector: string; error?: string };
  'browser-type': { success: boolean; selector: string; error?: string };
  'browser-snapshot': { success: boolean; title: string; url: string; content: string; error?: string };
  'browser-take-screenshot': { success: boolean; base64Png?: string; error?: string };
  'browser-evaluate': { success: boolean; result?: unknown; error?: string };
  'browser-close': { success: boolean };
  'browser-get-status': {
    running: boolean;
    url?: string;
    title?: string;
    playing?: boolean;
    currentTime?: number;
    duration?: number;
    browserType?: string;
    executablePath?: string;
  };
}

export interface SpotifyUserProfile {
  id?: string;
  display_name?: string;
  email?: string;
  product?: string;
  images?: Array<{ url: string; height?: number; width?: number }>;
  uri?: string;
  [key: string]: unknown;
}

export interface SpotifySessionStatus {
  authenticated: boolean;
  userProfile?: SpotifyUserProfile | null;
  expiresAt?: number | null;
  clientId?: string;
  hasRefreshToken?: boolean;
}

/** Tipo helper: obtiene el tipo de respuesta de un canal IPC dado */
export type IpcResponse<C extends IpcChannel> = C extends keyof IpcResponseMap ? IpcResponseMap[C] : unknown;

export interface ElectronApiBridge {
  credentialStatus: () => Promise<{ hasGeminiCredential: boolean }>;
  requestLiveToken: (model: string) => Promise<string>;
  geminiGenerate: (model: string, body: Record<string, unknown>) => Promise<unknown>;
  systemExecute: (request: { kind: 'system-info' | 'list-processes' }) => Promise<unknown>;
  approveWorkspace: () => Promise<{ success: boolean; path?: string }>;
  isElectron: boolean;

  // Window & Hitboxes
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => void;
  syncHitboxes: (hitboxes: unknown[]) => void;
  syncInteractiveHitboxes: (hitboxes: unknown[]) => void;
  setAlwaysOnTop: (value: boolean) => void;
  getAlwaysOnTop: () => Promise<boolean>;
  focusWindow?: () => void;
  minimizeWindow: () => void;
  showWindow: () => void;
  hideWindow: () => void;
  quitApp: () => void;
  relaunchApp: () => Promise<{ success: boolean; error?: string }>;
  reloadWindow: () => Promise<{ success: boolean; error?: string }>;
  getDisplayInfo: () => Promise<DisplayInfo>;
  getProcessMemoryInfo: () => Promise<ProcessMemoryInfo>;
  getGpuFeatureStatus: () => Promise<Record<string, string>>;
  getGpuInfo: () => Promise<Record<string, unknown>>;
  getAppVersion: () => Promise<string>;

  // Native OS & System
  readFile: (filePath: FileRequest | string) => Promise<string>;
  writeFile: (filePath: FileRequest | string, data: string) => Promise<boolean>;
  appendFile: (filePath: FileRequest | string, data: string) => Promise<boolean>;
  deleteFile?: (filePath: FileRequest | string, recursive?: boolean) => Promise<{ success: boolean; error?: string }>;
  moveFile?: (sourcePath: FileRequest | string, destPath: FileRequest | string) => Promise<{ success: boolean; error?: string }>;
  searchDirectory?: (dirPath: FileRequest | string, query?: string, maxResults?: number) => Promise<Array<{ path: string; name: string; type: 'FILE' | 'DIRECTORY'; size?: number }>>;
  listWindows?: () => Promise<Array<{ hwnd: number; pid: number; title: string; process: string; isMinimized: boolean; isMaximized: boolean }>>;
  focusOsWindow?: (query: string | number) => Promise<{ success: boolean; title?: string; error?: string }>;
  manageOsWindow?: (query: string | number, action: 'minimize' | 'maximize' | 'restore' | 'close') => Promise<{ success: boolean; action: string; error?: string }>;
  listInstalledApps?: (filter?: string) => Promise<Array<{ name: string; path: string; type: 'shortcut' | 'executable' }>>;
  launchApp?: (appName: string, args?: string[]) => Promise<{ success: boolean; appName: string; path?: string; error?: string }>;
  readDirectory: (dirPath: FileRequest | string) => Promise<{ entry: string; type: 'FILE' | 'DIRECTORY' }[]>;
  getSystemFolders?: () => Promise<Record<string, string>>;
  openExternal: (url: string) => Promise<boolean>;
  openPath: (targetPath: FileRequest | string) => Promise<{ success: boolean; error: string | null }>;
  showItemInFolder: (targetPath: FileRequest | string) => Promise<boolean>;
  getClipboardText: () => Promise<string>;
  setClipboardText: (text: string) => Promise<boolean>;
  showNotification: (payload: { title?: string; body?: string }) => Promise<boolean>;
  sendComputerInput?: (payload: { action: string; key?: string; text?: string; coordinate?: [number, number]; scroll_amount?: number }) => Promise<{ success: boolean; error?: string }>;
  executeTerminalCommand?: (command: string, cwd?: string, timeoutMs?: number) => Promise<{ stdOut?: string; stdErr?: string; exitCode?: number; error?: string }>;

  // Security & Secrets
  setSecureSecret: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;
  deleteSecureSecret: (key: string) => Promise<{ success: boolean; error?: string }>;

  // Screen capture
  captureScreenNative: (request?: ScreenRegion | ScreenCaptureRequest | null) => Promise<string | null>;

  // Memory
  memoryLoad: () => Promise<MemoryLoadResult>;
  memorySave: (memories: Record<string, unknown>[]) => Promise<MemorySaveResult>;

  // Subwindows
  openSettingsWindow: () => Promise<{ success: boolean }>;
  closeSettingsWindow: () => Promise<{ success: boolean }>;
  openCameraWindow: () => Promise<{ success: boolean }>;
  closeCameraWindow: () => Promise<{ success: boolean }>;
  isCameraWindowOpen: () => Promise<boolean>;
  openTelemetryWindow: () => Promise<{ success: boolean }>;
  closeTelemetryWindow: () => Promise<{ success: boolean }>;
  reportTelemetry: (snapshot: Record<string, unknown>) => Promise<{ success: boolean }>;
  getTelemetrySnapshot: () => Promise<Record<string, unknown>>;
  onSettingsWindowState: (callback: (data: unknown) => void) => () => void;
  onCameraWindowState: (callback: (data: unknown) => void) => () => void;

  // MCP
  mcpConnect: (config: Record<string, unknown>) => Promise<{
    success: boolean;
    serverId?: string;
    protocolVersion?: string | null;
    version?: string | null;
    tools?: unknown[];
    error?: string;
  }>;
  mcpCallTool: (payload: Record<string, unknown>) => Promise<{ success: boolean; content?: unknown; error?: string }>;
  mcpDisconnect: (serverId: string) => Promise<{ success: boolean }>;

  // Auto-Updater
  checkForUpdates: () => Promise<{ success: boolean; version?: string; isLocal?: boolean; error?: string }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => Promise<boolean>;
  onUpdateStatus: (callback: (data: unknown) => void) => () => void;

  // Global Shortcuts
  onShortcutEvent: (channel: string, callback: (...args: unknown[]) => void) => () => void;

  // Settings & Config
  getModularConfig: () => Promise<Record<string, unknown> | null>;
  saveModularConfigSection: (section: string, data: unknown) => Promise<boolean>;
  saveAppConfig: (config: Record<string, unknown>) => Promise<{ success: boolean }>;
  getAppConfig: () => Promise<Record<string, unknown>>;
  onConfigUpdated: (callback: (data: unknown) => void) => () => void;
  onCompanionPause: (callback: () => void) => () => void;
  onCompanionResume: (callback: () => void) => () => void;

  // Native Windows Media & Spotify
  windowsMediaControl: (action: string) => Promise<{ success: boolean; action: string }>;
  windowsMediaStatus: () => Promise<unknown>;
  windowsSpotifyLaunch: (target: string) => Promise<{ success: boolean; uri: string }>;

  // Spotify OAuth & Web API
  spotifyStartAuth: (credentials?: { clientId?: string; clientSecret?: string; redirectUri?: string }) => Promise<{ success: boolean; url?: string; error?: string }>;
  spotifyGetSession: () => Promise<SpotifySessionStatus>;
  spotifyLogout: () => Promise<{ success: boolean }>;
  spotifyWebApi: (action: string, args?: unknown) => Promise<unknown>;
  onSpotifySessionUpdated: (callback: (session: SpotifySessionStatus) => void) => () => void;

  // Brave Browser & Playwright Automation
  browserNavigate: (options: { url: string; timeoutMs?: number }) => Promise<{ success: boolean; url: string; title: string; error?: string }>;
  browserSearch: (options: { query: string; engine?: 'google' | 'brave' | 'duckduckgo' }) => Promise<{ success: boolean; query: string; url: string; title: string; error?: string }>;
  browserPlayYouTube: (options: { query: string; autoPlay?: boolean; timeoutMs?: number }) => Promise<{
    success: boolean;
    title: string;
    videoUrl: string;
    playing: boolean;
    currentTime: number;
    duration: number;
    error?: string;
  }>;
  browserMediaControl: (options: { action: 'play' | 'pause' | 'toggle' | 'seek' | 'volume' | 'mute' | 'unmute' | 'fullscreen'; value?: number }) => Promise<{ success: boolean; action: string; playing?: boolean; volume?: number; currentTime?: number; duration?: number; error?: string }>;
  browserClick: (options: { selector: string; timeoutMs?: number }) => Promise<{ success: boolean; selector: string; error?: string }>;
  browserType: (options: { selector: string; text: string; pressEnter?: boolean; timeoutMs?: number }) => Promise<{ success: boolean; selector: string; error?: string }>;
  browserSnapshot: (options?: { maxChars?: number }) => Promise<{ success: boolean; title: string; url: string; content: string; error?: string }>;
  browserTakeScreenshot: (options?: { fullPage?: boolean }) => Promise<{ success: boolean; base64Png?: string; error?: string }>;
  browserEvaluate: (options: { script: string }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
  browserClose: () => Promise<{ success: boolean }>;
  browserGetStatus: () => Promise<{
    running: boolean;
    url?: string;
    title?: string;
    playing?: boolean;
    currentTime?: number;
    duration?: number;
    browserType?: string;
    executablePath?: string;
  }>;
}
