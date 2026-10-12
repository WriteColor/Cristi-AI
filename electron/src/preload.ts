import type { FileRequest, DisplayInfo, ProcessMemoryInfo, ScreenRegion, ScreenCaptureRequest, ElectronApiBridge } from '../../shared/ipc/contracts';
import { ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from './types/ipcChannels';

const ALLOWED_SHORTCUT_CHANNELS = new Set([
  'shortcut-toggle-mute',
  'shortcut-capture-screen',
  'shortcut-toggle-zen-mode',
  'shortcut-toggle-perf-hud',
  'shortcut-toggle-always-on-top',
]);

export type { ElectronApiBridge };

export const electronBridgeApi: ElectronApiBridge = {
  isElectron: true,
  credentialStatus: () => ipcRenderer.invoke('credential-status'),
  requestLiveToken: model => ipcRenderer.invoke('live-token', model),
  geminiGenerate: (model, body) => ipcRenderer.invoke('gemini-generate', model, body),
  systemExecute: request => ipcRenderer.invoke('system-execute', request),
  approveWorkspace: () => ipcRenderer.invoke('approve-workspace'),

  // ── Click-Through & Hitboxes ──────────────────────────────────────────────
  setIgnoreMouseEvents: (ignore: boolean, options: { forward?: boolean } = {}) => {
    ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, Boolean(ignore), options);
  },
  syncHitboxes: (hitboxes: unknown[]) => {
    ipcRenderer.send(IPC_CHANNELS.SYNC_INTERACTIVE_HITBOXES, hitboxes);
  },
  syncInteractiveHitboxes: (hitboxes: unknown[]) => {
    ipcRenderer.send(IPC_CHANNELS.SYNC_INTERACTIVE_HITBOXES, hitboxes);
  },

  // ── Window Management ─────────────────────────────────────────────────────
  focusWindow: () => ipcRenderer.send('focus-window'),
  setAlwaysOnTop: (value: boolean) => {
    ipcRenderer.send(IPC_CHANNELS.SET_ALWAYS_ON_TOP, Boolean(value));
  },
  getAlwaysOnTop: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ALWAYS_ON_TOP),
  minimizeWindow: () => ipcRenderer.send(IPC_CHANNELS.MINIMIZE_WINDOW),
  showWindow: () => ipcRenderer.send('show-window'),
  hideWindow: () => ipcRenderer.send('hide-window'),
  quitApp: () => ipcRenderer.send(IPC_CHANNELS.QUIT_APP),
  relaunchApp: () => ipcRenderer.invoke(IPC_CHANNELS.RELAUNCH_APP),
  reloadWindow: () => ipcRenderer.invoke(IPC_CHANNELS.RELOAD_WINDOW),

  // ── Display & Telemetry ───────────────────────────────────────────────────
  getDisplayInfo: () => ipcRenderer.invoke(IPC_CHANNELS.GET_DISPLAY_INFO),
  getProcessMemoryInfo: () => ipcRenderer.invoke(IPC_CHANNELS.GET_PROCESS_MEMORY_INFO),
  getGpuFeatureStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_GPU_FEATURE_STATUS),
  getGpuInfo: () => ipcRenderer.invoke('get-gpu-info'),
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),

  // ── Native OS Operations ──────────────────────────────────────────────────
  readFile: (filePath: FileRequest | string) => ipcRenderer.invoke(IPC_CHANNELS.READ_FILE, typeof filePath === 'string' ? { scope: 'workspaceApproved', path: filePath } : filePath),
  writeFile: (filePath: FileRequest | string, data: string) => ipcRenderer.invoke(IPC_CHANNELS.WRITE_FILE, typeof filePath === 'string' ? { scope: 'workspaceApproved', path: filePath } : filePath, data),
  appendFile: (filePath: FileRequest | string, data: string) => ipcRenderer.invoke(IPC_CHANNELS.APPEND_FILE, typeof filePath === 'string' ? { scope: 'workspaceApproved', path: filePath } : filePath, data),
  readDirectory: (dirPath: FileRequest | string) => ipcRenderer.invoke(IPC_CHANNELS.READ_DIRECTORY, typeof dirPath === 'string' ? { scope: 'workspaceApproved', path: dirPath } : dirPath),
  getSystemFolders: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_FOLDERS),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),
  openPath: (targetPath: FileRequest | string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_PATH, typeof targetPath === 'string' ? { scope: 'workspaceApproved', path: targetPath } : targetPath),
  showItemInFolder: (targetPath: FileRequest | string) => ipcRenderer.invoke(IPC_CHANNELS.SHOW_ITEM_IN_FOLDER, typeof targetPath === 'string' ? { scope: 'workspaceApproved', path: targetPath } : targetPath),
  getClipboardText: () => ipcRenderer.invoke(IPC_CHANNELS.GET_CLIPBOARD_TEXT),
  setClipboardText: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.SET_CLIPBOARD_TEXT, text),
  showNotification: (payload: { title?: string; body?: string }) => ipcRenderer.invoke(IPC_CHANNELS.SHOW_NOTIFICATION, payload),
  sendComputerInput: (payload: any) => ipcRenderer.invoke('computer-input', payload),
  executeTerminalCommand: (command: string, cwd?: string, timeoutMs?: number) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_EXECUTE_COMMAND, { command, cwd, timeoutMs }),

  // ── Security & Secrets ────────────────────────────────────────────────────
  setSecureSecret: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.SECURE_SET_SECRET, key, value),
  deleteSecureSecret: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.SECURE_DELETE_SECRET, key),

  // ── Screen Capture ─────────────────────────────────────────────────────────
  captureScreenNative: (request?: ScreenRegion | ScreenCaptureRequest | null) => ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SCREEN_NATIVE, request),

  // ── Memory ────────────────────────────────────────────────────────────────
  memoryLoad: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_LOAD),
  memorySave: (memories: Record<string, unknown>[]) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_SAVE, memories),

  // ── Subwindows ────────────────────────────────────────────────────────────
  openSettingsWindow: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_SETTINGS_WINDOW),
  closeSettingsWindow: () => ipcRenderer.invoke(IPC_CHANNELS.CLOSE_SETTINGS_WINDOW),
  openCameraWindow: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_CAMERA_WINDOW),
  closeCameraWindow: () => ipcRenderer.invoke(IPC_CHANNELS.CLOSE_CAMERA_WINDOW),
  isCameraWindowOpen: () => ipcRenderer.invoke(IPC_CHANNELS.IS_CAMERA_WINDOW_OPEN),
  openTelemetryWindow: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_TELEMETRY_WINDOW),
  closeTelemetryWindow: () => ipcRenderer.invoke(IPC_CHANNELS.CLOSE_TELEMETRY_WINDOW),
  reportTelemetry: (snapshot: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.TELEMETRY_REPORT, snapshot),
  getTelemetrySnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.TELEMETRY_SNAPSHOT),
  onSettingsWindowState: (callback: (data: unknown) => void) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('settings-window-state', listener);
    return () => {
      try {
        ipcRenderer.removeListener('settings-window-state', listener);
      } catch (_) {}
    };
  },
  onCameraWindowState: (callback: (data: unknown) => void) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('camera-window-state', listener);
    return () => {
      try {
        ipcRenderer.removeListener('camera-window-state', listener);
      } catch (_) {}
    };
  },

  // ── MCP ───────────────────────────────────────────────────────────────────
  mcpConnect: (config: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.MCP_CONNECT, config),
  mcpCallTool: (payload: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.MCP_CALL_TOOL, payload),
  mcpDisconnect: (serverId: string) => ipcRenderer.invoke(IPC_CHANNELS.MCP_DISCONNECT, serverId),

  // ── Updater ───────────────────────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.CHECK_FOR_UPDATES),
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_UPDATE),
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.INSTALL_UPDATE),
  onUpdateStatus: (callback: (data: unknown) => void) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('update-status', listener);
    return () => {
      try {
        ipcRenderer.removeListener('update-status', listener);
      } catch (_) {}
    };
  },

  // ── Shortcuts ─────────────────────────────────────────────────────────────
  onShortcutEvent: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_SHORTCUT_CHANNELS.has(channel) || typeof callback !== 'function') {
      return () => {};
    }
    const listener = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => {
      try {
        ipcRenderer.removeListener(channel, listener);
      } catch (_) {}
    };
  },

  // ── Settings & Config ─────────────────────────────────────────────────────
  getModularConfig: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_READ_ALL),
  saveModularConfigSection: async (section: string, data: any) => {
    const res = await ipcRenderer.invoke(IPC_CHANNELS.CONFIG_WRITE_SECTION, { section, data });
    return typeof res === 'object' && res !== null ? Boolean((res as any).success) : Boolean(res);
  },
  saveAppConfig: (config: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_APP_CONFIG, config),
  getAppConfig: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_CONFIG),
  onConfigUpdated: (callback: (data: unknown) => void) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('config-updated', listener);
    return () => {
      try {
        ipcRenderer.removeListener('config-updated', listener);
      } catch (_) {}
    };
  },
  onCompanionPause: (callback: () => void) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('companion-pause', listener);
    return () => {
      try {
        ipcRenderer.removeListener('companion-pause', listener);
      } catch (_) {}
    };
  },
  onCompanionResume: (callback: () => void) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('companion-resume', listener);
    return () => {
      try {
        ipcRenderer.removeListener('companion-resume', listener);
      } catch (_) {}
    };
  },

  // ── Windows Media & Spotify ───────────────────────────────────────────────
  windowsMediaControl: (action: string) => ipcRenderer.invoke(IPC_CHANNELS.WINDOWS_MEDIA_CONTROL, action),
  windowsMediaStatus: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOWS_MEDIA_STATUS),
  windowsSpotifyLaunch: (target: string) => ipcRenderer.invoke(IPC_CHANNELS.WINDOWS_SPOTIFY_LAUNCH, target),

  // ── Spotify OAuth & Web API ───────────────────────────────────────────────
  spotifyStartAuth: (credentials?: { clientId?: string; clientSecret?: string; redirectUri?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SPOTIFY_START_AUTH, credentials),
  spotifyGetSession: () => ipcRenderer.invoke(IPC_CHANNELS.SPOTIFY_GET_SESSION),
  spotifyLogout: () => ipcRenderer.invoke(IPC_CHANNELS.SPOTIFY_LOGOUT),
  spotifyWebApi: (action: string, args?: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.SPOTIFY_WEB_API, { action, args }),
  onSpotifySessionUpdated: (callback: (session: any) => void) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('spotify-session-updated', listener);
    return () => {
      try {
        ipcRenderer.removeListener('spotify-session-updated', listener);
      } catch (_) {}
    };
  },

  // ── Brave Browser & Playwright Automation ─────────────────────────────────
  browserNavigate: (options: { url: string; timeoutMs?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_NAVIGATE, options),
  browserSearch: (options: { query: string; engine?: 'google' | 'brave' | 'duckduckgo' }) =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SEARCH, options),
  browserPlayYouTube: (options: { query: string; autoPlay?: boolean; timeoutMs?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PLAY_YOUTUBE, options),
  browserMediaControl: (options: { action: string; value?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_MEDIA_CONTROL, options),
  browserClick: (options: { selector: string; timeoutMs?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_CLICK, options),
  browserType: (options: { selector: string; text: string; pressEnter?: boolean; timeoutMs?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_TYPE, options),
  browserSnapshot: (options?: { maxChars?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SNAPSHOT, options),
  browserTakeScreenshot: (options?: { fullPage?: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_TAKE_SCREENSHOT, options),
  browserEvaluate: (options: { script: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_EVALUATE, options),
  browserClose: () =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_CLOSE),
  browserGetStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_GET_STATUS),
};

// Expose on window.electron, window.electronBridge, and window.electronAPI for universal compatibility
