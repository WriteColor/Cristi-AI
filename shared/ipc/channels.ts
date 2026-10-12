import type { IpcChannel } from './contracts';
/**
 * Strongly-Typed IPC Channel definitions between Electron Main and Renderer.
 */

export const IPC_CHANNELS = {
  // Window & Shell
  SET_IGNORE_MOUSE_EVENTS: 'set-ignore-mouse-events',
  SYNC_INTERACTIVE_HITBOXES: 'sync-interactive-hitboxes',
  SET_ALWAYS_ON_TOP: 'set-always-on-top',
  GET_ALWAYS_ON_TOP: 'get-always-on-top',
  MINIMIZE_WINDOW: 'minimize-window',
  QUIT_APP: 'quit-app',
  RELOAD_WINDOW: 'reload-window',
  RELAUNCH_APP: 'relaunch-app',
  GET_DISPLAY_INFO: 'get-display-info',
  GET_PROCESS_MEMORY_INFO: 'get-process-memory-info',
  GET_GPU_FEATURE_STATUS: 'get-gpu-feature-status',
  GET_APP_VERSION: 'get-app-version',

  // System & OS
  READ_FILE: 'read-file',
  WRITE_FILE: 'write-file',
  APPEND_FILE: 'append-file',
  READ_DIRECTORY: 'read-directory',
  OPEN_EXTERNAL: 'open-external',
  OPEN_PATH: 'open-path',
  SHOW_ITEM_IN_FOLDER: 'show-item-in-folder',
  GET_CLIPBOARD_TEXT: 'get-clipboard-text',
  SET_CLIPBOARD_TEXT: 'set-clipboard-text',
  SHOW_NOTIFICATION: 'show-notification',
  COMPUTER_INPUT: 'computer-input',
  SYSTEM_EXECUTE_COMMAND: 'system-execute-command',
  SYSTEM_GET_FOLDERS: 'system-get-folders',

  // Config & Secrets
  GET_APP_CONFIG: 'get-app-config',
  SAVE_APP_CONFIG: 'save-app-config',
  CONFIG_READ_ALL: 'config-read-all',
  CONFIG_WRITE_SECTION: 'config-write-section',
  SECURE_SET_SECRET: 'secure-set-secret',
  SECURE_DELETE_SECRET: 'secure-delete-secret',

  CAPTURE_SCREEN_NATIVE: 'capture-screen-native',

  // Memory
  MEMORY_LOAD: 'memory-load',
  MEMORY_SAVE: 'memory-save',

  // Subwindows
  OPEN_SETTINGS_WINDOW: 'open-settings-window',
  CLOSE_SETTINGS_WINDOW: 'close-settings-window',
  OPEN_CAMERA_WINDOW: 'open-camera-window',
  CLOSE_CAMERA_WINDOW: 'close-camera-window',
  IS_CAMERA_WINDOW_OPEN: 'is-camera-window-open',
  OPEN_TELEMETRY_WINDOW: 'open-telemetry-window',
  CLOSE_TELEMETRY_WINDOW: 'close-telemetry-window',
  TELEMETRY_REPORT: 'telemetry-report',
  TELEMETRY_SNAPSHOT: 'telemetry-snapshot',

  // MCP
  MCP_CONNECT: 'mcp-connect',
  MCP_CALL_TOOL: 'mcp-call-tool',
  MCP_DISCONNECT: 'mcp-disconnect',

  // Updater
  CHECK_FOR_UPDATES: 'check-for-updates',
  DOWNLOAD_UPDATE: 'download-update',
  INSTALL_UPDATE: 'install-update',

  // Windows Media & Spotify
  WINDOWS_MEDIA_CONTROL: 'windows-media-control',
  WINDOWS_MEDIA_STATUS: 'windows-media-status',
  WINDOWS_SPOTIFY_LAUNCH: 'windows-spotify-launch',

  // Spotify OAuth & Web API
  SPOTIFY_START_AUTH: 'spotify-start-auth',
  SPOTIFY_GET_SESSION: 'spotify-get-session',
  SPOTIFY_LOGOUT: 'spotify-logout',
  SPOTIFY_WEB_API: 'spotify-web-api',

  // Brave Browser & Playwright Automation
  BROWSER_NAVIGATE: 'browser-navigate',
  BROWSER_SEARCH: 'browser-search',
  BROWSER_PLAY_YOUTUBE: 'browser-play-youtube',
  BROWSER_MEDIA_CONTROL: 'browser-media-control',
  BROWSER_CLICK: 'browser-click',
  BROWSER_TYPE: 'browser-type',
  BROWSER_SNAPSHOT: 'browser-snapshot',
  BROWSER_TAKE_SCREENSHOT: 'browser-take-screenshot',
  BROWSER_EVALUATE: 'browser-evaluate',
  BROWSER_CLOSE: 'browser-close',
  BROWSER_GET_STATUS: 'browser-get-status',
} as const satisfies Record<string, IpcChannel>;

export type IpcChannelName = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
