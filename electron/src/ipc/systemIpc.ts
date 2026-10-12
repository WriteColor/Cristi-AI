import { isNewerVersion, verifyInstaller } from '../security/UpdatePolicy';
import {
  resolveFile,
  approveWorkspace,
  executeSystemCapability,
  executeTerminalCommand,
  getSystemFoldersPaths,
  deleteFileSafe,
  moveFileSafe,
  searchDirectorySafe,
  listOpenWindows,
  focusWindow as focusOsWindow,
  manageWindow as manageOsWindow,
  listInstalledApps,
  launchApp
} from '../security/SystemCapabilityService';
import { readPublicConfig, writePublicConfig } from '../security/PublicConfig';
import { handleTrusted, onTrusted } from '../security/CapabilityRouter';
import { shell, clipboard, Notification, desktopCapturer, screen, dialog, app, BrowserWindow } from 'electron';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);
import { processManager } from '../core/processManager';
import { windowManager } from '../windows/windowManager';
import { ExecCommandOptions, ExecCommandResult, ScreenRegion, AppConfig } from '../types/electron.types';
import { getAppRootDir } from '../core/paths';
import { processScreen, disposeScreenWorker } from '../utility/ScreenClient';
import { windowsMediaController } from '../integrations/WindowsMediaController';
import { modularConfigLoader } from '../core/ModularConfigLoader';
import { spotifyAuthManager } from '../integrations/SpotifyAuthManager';
import { spotifyApiClient } from '../integrations/SpotifyApiClient';

/**
 * Sanitizes and validates a filesystem path against directory traversal and null byte injections.
 */
let isScreenCaptureInProgress = false;
const activeScreenCapturePromises = new Map<string, Promise<string | null>>();
let lastScreenCaptureCache: {
  timestamp: number;
  regionKey: string;
  base64: string | null;
} = {
  timestamp: 0,
  regionKey: '',
  base64: null,
};

let pendingLocalUpdate: {
  version: string | null;
  fileName: string;
  filePath: string;
  fileSize: number;
  mtime: Date;
} | null = null;

function findLocalProjectRelease(rootDir: string) {
  const candidateDirs = [
    path.join(rootDir, 'release'),
    path.join(process.cwd(), 'release'),
    path.join(__dirname, '../../../release'),
  ];

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        const setupFiles = files.filter((f) => /^Cristi-AI-Companion-Setup-(\d+\.\d+\.\d+)\.exe$/i.test(f));
        if (setupFiles.length > 0) {
          setupFiles.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
          const latestFile = setupFiles[0];
          const match = latestFile.match(/^Cristi-AI-Companion-Setup-(\d+\.\d+\.\d+)\.exe$/i);
          const version = match ? match[1] : null;
          const fullPath = path.join(dir, latestFile);
          const stats = fs.statSync(fullPath);
          return {
            version,
            fileName: latestFile,
            filePath: fullPath,
            fileSize: stats.size,
            mtime: stats.mtime,
          };
        }
      } catch (_) {}
    }
  }
  return null;
}

/**
 * Maps standard key names and key combinations to Windows Forms SendKeys format.
 * Examples:
 * - Control+d -> ^d
 * - Alt+F4 -> %{F4}
 * - Shift+a -> +a
 * - Enter -> {ENTER}
 * - Tab -> {TAB}
 * - Backspace -> {BACKSPACE}
 * - Escape -> {ESC}
 */
export function mapKeyToSendKeys(key: string): string {
  if (!key) return '';

  const SPECIAL_KEYS: Record<string, string> = {
    enter: '{ENTER}',
    return: '{ENTER}',
    tab: '{TAB}',
    backspace: '{BACKSPACE}',
    bs: '{BACKSPACE}',
    bksp: '{BACKSPACE}',
    escape: '{ESC}',
    esc: '{ESC}',
    delete: '{DELETE}',
    del: '{DELETE}',
    insert: '{INSERT}',
    ins: '{INSERT}',
    home: '{HOME}',
    end: '{END}',
    pageup: '{PGUP}',
    pgup: '{PGUP}',
    pagedown: '{PGDN}',
    pgdn: '{PGDN}',
    arrowup: '{UP}',
    up: '{UP}',
    arrowdown: '{DOWN}',
    down: '{DOWN}',
    arrowleft: '{LEFT}',
    left: '{LEFT}',
    arrowright: '{RIGHT}',
    right: '{RIGHT}',
    space: ' ',
    capslock: '{CAPSLOCK}',
    numlock: '{NUMLOCK}',
    scrolllock: '{SCROLLLOCK}',
    printscreen: '{PRTSC}',
    prtsc: '{PRTSC}',
  };

  const tokens = key.split('+');
  let isPlusKey = false;
  if (tokens.length > 1 && tokens[tokens.length - 1] === '') {
    tokens.pop();
    isPlusKey = true;
  }

  let prefix = '';
  const remainingTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const lower = t.toLowerCase();
    if (lower === 'control' || lower === 'ctrl') {
      prefix += '^';
    } else if (lower === 'alt') {
      prefix += '%';
    } else if (lower === 'shift') {
      prefix += '+';
    } else if (lower === 'win' || lower === 'meta' || lower === 'command' || lower === 'cmd') {
      // SendKeys does not support Windows key
    } else {
      remainingTokens.push(t);
    }
  }

  const baseKey = isPlusKey ? '+' : remainingTokens.join('+');
  if (!baseKey && prefix) {
    return prefix;
  }

  const lowerBase = baseKey.toLowerCase();
  if (SPECIAL_KEYS[lowerBase]) {
    return prefix + SPECIAL_KEYS[lowerBase];
  }

  const fMatch = lowerBase.match(/^f([1-9]|1[0-9]|2[0-4])$/);
  if (fMatch) {
    return prefix + `{F${fMatch[1]}}`;
  }

  if (/^[+^%~(){}[\]]$/.test(baseKey)) {
    return prefix + `{${baseKey}}`;
  }

  return prefix + baseKey;
}

/**
 * Resolves the location of the compiled native CristiInput.exe helper binary.
 */
export function getInputHelperPath(rootDir?: string): string | null {
  const base = rootDir || getAppRootDir();
  const candidates = [
    path.join(base, 'native', 'CristiInput.exe'),
    path.join(process.cwd(), 'native', 'CristiInput.exe'),
    process.resourcesPath ? path.join(process.resourcesPath, 'native', 'CristiInput.exe') : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'CristiInput.exe') : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Registers native system operations, file I/O, screen capture, and app config IPC handlers.
 */
export function registerSystemIpc(rootDir?: string): void {
  const baseDir = rootDir || getAppRootDir();
  const configFilePath = path.join(app.getPath('userData'), 'cristi-config.json');

  // ── Native Command Execution with Safe Timeout ────────────────────────────
  handleTrusted('system-execute', (_event, request) => executeSystemCapability(request));
  handleTrusted('approve-workspace', (event) => approveWorkspace(BrowserWindow.fromWebContents(event.sender) ?? undefined));
  handleTrusted('system-execute-command', async (_event, req: { command: string; cwd?: string; timeoutMs?: number }) => executeTerminalCommand(req.command, req.cwd, req.timeoutMs));

  // ── Native Keyboard & Input Automation (CristiInput / SendKeys) ───────────
  handleTrusted('computer-input', async (_event, payload: {
    action: 'press_key' | 'type_text' | 'mouse_click' | 'scroll';
    key?: string;
    text?: string;
    coordinate?: [number, number];
    scroll_amount?: number;
  }) => {
    try {
      const helper = getInputHelperPath(baseDir);

      if (payload.action === 'press_key' && payload.key) {
        const rawKey = payload.key.trim();
        const lowerKey = rawKey.toLowerCase();

        // 1. Direct optimization for Desktop Toggle (Win+D / Show Desktop)
        if (
          lowerKey === 'win+d' ||
          lowerKey === 'windows+d' ||
          lowerKey === 'desktop' ||
          lowerKey === 'show_desktop' ||
          lowerKey === 'toggle_desktop'
        ) {
          if (helper) {
            await execFileAsync(helper, ['desktop'], { windowsHide: true, timeout: 5000 });
            return { success: true };
          }
          // Direct fallback via Shell.Application COM object
          const psScript = `(New-Object -ComObject Shell.Application).ToggleDesktop()`;
          await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { windowsHide: true, timeout: 5000 });
          return { success: true };
        }

        // 2. High-speed native C# helper with User32 keybd_event & SendInput
        if (helper) {
          await execFileAsync(helper, ['key', rawKey], { windowsHide: true, timeout: 5000 });
          return { success: true };
        }

        // 3. Fallback to SendKeys via PowerShell
        const sendKeyString = mapKeyToSendKeys(rawKey);
        if (sendKeyString) {
          const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKeyString.replace(/'/g, "''")}')`;
          await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5000 });
        }
        return { success: true };
      }

      if (payload.action === 'type_text' && payload.text) {
        if (helper) {
          await execFileAsync(helper, ['text', payload.text], { windowsHide: true, timeout: 5000 });
          return { success: true };
        }

        // Fallback to SendKeys
        const escaped = payload.text
          .replace(/[+^%~(){}[\]]/g, '{$&}')
          .replace(/\r\n|\n|\r/g, '{ENTER}');
        const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}')`;
        await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5000 });
        return { success: true };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ── Native Windows Media & Spotify Control ───────────────────────────────
  handleTrusted('windows-media-control', async (_event, action: string) => windowsMediaController.sendMediaKey(action as any));
  handleTrusted('windows-media-status', async () => windowsMediaController.getStatus());
  handleTrusted('windows-spotify-launch', async (_event, target: string) => windowsMediaController.launchSpotify(target));

  // ── Spotify OAuth & Web API ───────────────────────────────────────────────
  handleTrusted('spotify-start-auth', async (_event, creds?: { clientId?: string; clientSecret?: string; redirectUri?: string }) => {
    const config = await modularConfigLoader.readSection<Record<string, any>>('spotify.json', {});
    const clientId = creds?.clientId || config.clientId || '';
    const clientSecret = creds?.clientSecret || config.clientSecret || '';
    const redirectUri = creds?.redirectUri || config.redirectUri || 'http://127.0.0.1:8000/auth/callback';
    return await spotifyAuthManager.startAuthorization(clientId, clientSecret, redirectUri);
  });

  handleTrusted('spotify-get-session', async () => {
    return await spotifyAuthManager.getStatus();
  });

  handleTrusted('spotify-logout', async () => {
    await spotifyAuthManager.logout();
    return { success: true };
  });

  handleTrusted('spotify-web-api', async (_event, payload: { action: string; args?: any }) => {
    const action = payload?.action;
    const args = payload?.args;
    switch (action) {
      case 'play':
      case 'playMusic':
        return await spotifyApiClient.play(args);
      case 'pause':
      case 'pausePlayback':
        return await spotifyApiClient.pause(args?.deviceId);
      case 'resume':
      case 'resumePlayback':
        return await spotifyApiClient.play(args);
      case 'skip_next':
      case 'next':
      case 'skipToNext':
        return await spotifyApiClient.skipNext(args?.deviceId);
      case 'skip_previous':
      case 'previous':
      case 'skipToPrevious':
        return await spotifyApiClient.skipPrevious(args?.deviceId);
      case 'set_volume':
      case 'volume':
      case 'setVolume':
        return await spotifyApiClient.setVolume(args?.percent ?? args?.volume ?? args?.volumePercent ?? 50, args?.deviceId);
      case 'adjust_volume':
      case 'adjustVolume':
        return await spotifyApiClient.adjustVolume(args?.volumeDelta ?? args?.delta ?? 0, args?.deviceId);
      case 'now_playing':
      case 'get_now_playing':
      case 'getNowPlaying':
        return await spotifyApiClient.getNowPlaying();
      case 'search':
      case 'searchSpotify':
        return await spotifyApiClient.search(args?.query || '', args?.types || args?.type);
      case 'get_queue':
      case 'queue':
      case 'getQueue':
        return await spotifyApiClient.getQueue();
      case 'add_to_queue':
      case 'addToQueue':
        return await spotifyApiClient.addToQueue(args?.uri, args?.deviceId);
      case 'get_playlists':
      case 'playlists':
      case 'getMyPlaylists':
        return await spotifyApiClient.getPlaylists(args?.limit, args?.offset);
      case 'get_playlist_tracks':
      case 'getPlaylistTracks':
        return await spotifyApiClient.getPlaylistTracks(args?.playlistId, args?.limit, args?.offset);
      case 'get_recently_played':
      case 'getRecentlyPlayed':
        return await spotifyApiClient.getRecentlyPlayed(args?.limit);
      case 'get_saved_tracks':
      case 'getUsersSavedTracks':
        return await spotifyApiClient.getUsersSavedTracks(args?.limit, args?.offset);
      case 'remove_saved_tracks':
      case 'removeUsersSavedTracks':
        return await spotifyApiClient.removeUsersSavedTracks(args?.trackIds || args?.ids);
      case 'get_top_tracks':
      case 'getTopTracks':
        return await spotifyApiClient.getTopTracks(args?.timeRange, args?.limit);
      case 'get_top_artists':
      case 'getTopArtists':
        return await spotifyApiClient.getTopArtists(args?.timeRange, args?.limit);
      case 'create_playlist':
      case 'createPlaylist':
        return await spotifyApiClient.createPlaylist(args?.name, args?.description, args?.isPublic);
      case 'add_tracks_to_playlist':
      case 'addTracksToPlaylist':
        return await spotifyApiClient.addTracksToPlaylist(args?.playlistId, args?.uris, args?.position);
      case 'get_playlist':
      case 'getPlaylist':
        return await spotifyApiClient.getPlaylist(args?.playlistId);
      case 'update_playlist':
      case 'updatePlaylist':
        return await spotifyApiClient.updatePlaylist(args?.playlistId, args?.name, args?.description, args?.isPublic);
      case 'remove_tracks_from_playlist':
      case 'removeTracksFromPlaylist':
        return await spotifyApiClient.removeTracksFromPlaylist(args?.playlistId, args?.trackUris || args?.uris);
      case 'reorder_playlist_items':
      case 'reorderPlaylistItems':
        return await spotifyApiClient.reorderPlaylistItems(args);
      case 'unfollow_playlist':
      case 'unfollowPlaylist':
        return await spotifyApiClient.unfollowPlaylist(args?.playlistId);
      case 'get_albums':
      case 'getAlbums':
        return await spotifyApiClient.getAlbums(args?.ids);
      case 'get_album_tracks':
      case 'getAlbumTracks':
        return await spotifyApiClient.getAlbumTracks(args?.id, args?.limit, args?.offset);
      case 'save_or_remove_album':
      case 'saveOrRemoveAlbumForUser':
        return await spotifyApiClient.saveOrRemoveAlbumForUser(args?.ids, args?.action);
      case 'check_saved_albums':
      case 'checkUsersSavedAlbums':
        return await spotifyApiClient.checkUsersSavedAlbums(args?.ids);
      case 'get_devices':
      case 'getDevices':
      case 'getAvailableDevices':
      case 'devices':
        return await spotifyApiClient.getDevices();
      case 'transfer_playback':
      case 'transferPlayback':
        return await spotifyApiClient.transferPlayback(args?.deviceId, args?.play ?? true);
      default:
        throw new Error(`Acción desconocida para Spotify Web API: ${action}`);
    }
  });

  // ── Filesystem Operations ─────────────────────────────────────────────────
  handleTrusted('read-file', async (_event, filePath: import("../../../shared/ipc/contracts").FileRequest | string) => {
    try {
      const safePath = await resolveFile(filePath);
      return await fs.promises.readFile(safePath, 'utf8');
    } catch (err) {
      throw new Error(`Failed to read file: ${(err as Error).message}`, { cause: err });
    }
  });

  handleTrusted('write-file', async (_event, filePath: import("../../../shared/ipc/contracts").FileRequest | string, data: unknown) => {
    try {
      const safePath = await resolveFile(filePath);
      const safeData = typeof data === 'string' ? data : String(data ?? '');
      await fs.promises.mkdir(path.dirname(safePath), { recursive: true });
      await fs.promises.writeFile(safePath, safeData, 'utf8');
      return true;
    } catch (err) {
      throw new Error(`Failed to write file: ${(err as Error).message}`, { cause: err });
    }
  });

  handleTrusted('append-file', async (_event, filePath: import("../../../shared/ipc/contracts").FileRequest | string, data: unknown) => {
    try {
      const safePath = await resolveFile(filePath);
      const safeData = typeof data === 'string' ? data : String(data ?? '');
      await fs.promises.mkdir(path.dirname(safePath), { recursive: true });
      await fs.promises.appendFile(safePath, safeData, 'utf8');
      return true;
    } catch (err) {
      throw new Error(`Failed to append file: ${(err as Error).message}`, { cause: err });
    }
  });

  handleTrusted('read-directory', async (_event, dirPath: import("../../../shared/ipc/contracts").FileRequest | string) => {
    try {
      const safePath = await resolveFile(dirPath);
      const entries = await fs.promises.readdir(safePath, { withFileTypes: true });
      return entries.map((e) => ({
        entry: e.name,
        type: e.isDirectory() ? 'DIRECTORY' : 'FILE',
      }));
    } catch (err) {
      throw new Error(`Failed to read directory: ${(err as Error).message}`, { cause: err });
    }
  });

  handleTrusted('delete-file', async (_event, filePath: import("../../../shared/ipc/contracts").FileRequest | string, recursive?: boolean) => {
    return await deleteFileSafe(filePath, Boolean(recursive));
  });

  handleTrusted('move-file', async (_event, sourcePath: import("../../../shared/ipc/contracts").FileRequest | string, destPath: import("../../../shared/ipc/contracts").FileRequest | string) => {
    return await moveFileSafe(sourcePath, destPath);
  });

  handleTrusted('search-directory', async (_event, dirPath?: import("../../../shared/ipc/contracts").FileRequest | string, query?: string, maxResults?: number) => {
    return await searchDirectorySafe(dirPath || '', query, maxResults);
  });

  handleTrusted('list-windows', async () => {
    return await listOpenWindows();
  });

  handleTrusted('focus-os-window', async (_event, query: string | number) => {
    return await focusOsWindow(query);
  });

  handleTrusted('manage-os-window', async (_event, query: string | number, action: 'minimize' | 'maximize' | 'restore' | 'close') => {
    return await manageOsWindow(query, action);
  });

  handleTrusted('list-installed-apps', async (_event, filter?: string) => {
    return await listInstalledApps(filter);
  });

  handleTrusted('launch-app', async (_event, appName: string, args?: string[]) => {
    return await launchApp(appName, args || []);
  });

  handleTrusted('system-get-folders', () => {
    return getSystemFoldersPaths();
  });

  // ── Shell and Desktop Integration ─────────────────────────────────────────
  handleTrusted('open-external', async (_event, targetUrl: unknown) => {
    try {
      if (typeof targetUrl !== 'string' || !targetUrl.trim() || targetUrl.includes('\0')) {
        return false;
      }
      const parsed = new URL(targetUrl.trim());
      const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];
      if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
        console.warn(`[Security] Protocolo no permitido bloqueado: ${parsed.protocol}`);
        return false;
      }
      await shell.openExternal(targetUrl.trim());
      return true;
    } catch (err) {
      console.warn('[SystemIpc] Error opening external URL:', err);
      return false;
    }
  });

  handleTrusted('open-path', async (_event, targetPath: import("../../../shared/ipc/contracts").FileRequest | string) => {
    try {
      const safePath = await resolveFile(targetPath);
      const stat = await fs.promises.stat(safePath);
      if (!stat.isDirectory()) {
        // Reveal files without executing their shell association (scripts, shortcuts, executables).
        shell.showItemInFolder(safePath);
        return { success: true, error: null };
      }
      const errorMsg = await shell.openPath(safePath);
      return { success: !errorMsg, error: errorMsg || null };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  handleTrusted('show-item-in-folder', async (_event, targetPath: import("../../../shared/ipc/contracts").FileRequest | string) => {
    try {
      const safePath = await resolveFile(targetPath);
      shell.showItemInFolder(safePath);
      return true;
    } catch (err) {
      console.warn('[SystemIpc] Error showing item in folder:', err);
      return false;
    }
  });

  // ── Clipboard & Notifications ─────────────────────────────────────────────
  handleTrusted('get-clipboard-text', () => {
    try {
      return clipboard.readText();
    } catch (err) {
      console.warn('[SystemIpc] Error reading clipboard:', err);
      return '';
    }
  });

  handleTrusted('set-clipboard-text', (_event, text: unknown) => {
    try {
      clipboard.writeText(typeof text === 'string' ? text : String(text ?? ''));
      return true;
    } catch (err) {
      console.warn('[SystemIpc] Error setting clipboard text:', err);
      return false;
    }
  });

  handleTrusted('show-notification', (_event, payload: unknown) => {
    try {
      const title =
        payload && typeof payload === 'object' && 'title' in payload && payload.title
          ? String(payload.title)
          : 'Cristi AI Companion';
      const body =
        payload && typeof payload === 'object' && 'body' in payload && payload.body
          ? String(payload.body)
          : '';
      if (Notification.isSupported()) {
        new Notification({ title, body }).show();
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[SystemIpc] Error showing notification:', err);
      return false;
    }
  });

  // ── High-Performance Native Screen Capture ────────────────────────────────
  handleTrusted('capture-screen-native', async (_event, request: ScreenRegion | { region?: ScreenRegion | null; targetWindow?: string | null; fresh?: boolean } | null = null) => {
    const isFreshRequest = Boolean(request && typeof request === 'object' && 'fresh' in request && request.fresh);
    const region: ScreenRegion | null = request && typeof request === 'object' && 'region' in request
      ? (request.region ?? null)
      : (request && typeof request === 'object' && !('targetWindow' in request || 'fresh' in request) ? request as ScreenRegion : null);
    const targetWindowQuery = request && typeof request === 'object' && 'targetWindow' in request && typeof request.targetWindow === 'string'
      ? request.targetWindow.trim().toLowerCase()
      : null;
    const regionKey = targetWindowQuery
      ? `win_${targetWindowQuery}`
      : (region && typeof region === 'object'
          ? `${Math.round(region.x_pct || 0)}_${Math.round(region.y_pct || 0)}_${Math.round(region.w_pct || 100)}_${Math.round(region.h_pct || 100)}`
          : 'full');

    const now = Date.now();
    // Return cached frame if within 700ms for identical region (zero GPU contention)
    if (
      !isFreshRequest &&
      lastScreenCaptureCache.base64 &&
      lastScreenCaptureCache.regionKey === regionKey &&
      now - lastScreenCaptureCache.timestamp < 700
    ) {
      return lastScreenCaptureCache.base64;
    }

    // Coalesce duplicate ongoing capture requests for the same region
    if (!isFreshRequest && activeScreenCapturePromises.has(regionKey)) {
      return (activeScreenCapturePromises.get(regionKey) ?? null) as Promise<string | null>;
    }

    isScreenCaptureInProgress = true;
    const capturePromise = (async () => {
      try {
        let targetDisplay = null;
        const mainWin = windowManager.getMainWindow();
        if (mainWin && !mainWin.isDestroyed()) {
          try {
            const bounds = mainWin.getBounds();
            targetDisplay = screen.getDisplayMatching(bounds);
          } catch (_) {}
        }
        if (!targetDisplay) {
          targetDisplay = screen.getPrimaryDisplay();
        }
        if (!targetDisplay || !targetDisplay.bounds) {
          return null;
        }

        const { width, height } = targetDisplay.bounds;
        const scale = targetDisplay.scaleFactor || 1;
        const pixelWidth = Math.max(1, Math.round(width * scale));
        const pixelHeight = Math.max(1, Math.round(height * scale));

        // Ultra-efficient thumbnail size: 768px max width for Gemini Multimodal Live
        const targetW = Math.max(1, Math.min(768, pixelWidth));
        const targetH = Math.max(1, Math.round((pixelHeight / Math.max(1, pixelWidth)) * targetW));

        const capturerTypes: Array<'screen' | 'window'> = targetWindowQuery ? ['window', 'screen'] : ['screen'];
        let sources = [];
        try {
          sources = await desktopCapturer.getSources({
            types: capturerTypes,
            thumbnailSize: {
              width: targetW,
              height: targetH,
            },
            fetchWindowIcons: false,
          });
        } catch (capturerErr) {
          console.error('[SystemIpc] desktopCapturer error:', capturerErr);
          return null;
        }

        if (!sources || sources.length === 0) return null;

        let primarySource = null;
        if (targetWindowQuery) {
          primarySource = sources.find((s) => s.name.toLowerCase().includes(targetWindowQuery));
        }
        if (!primarySource) {
          primarySource =
            sources.find((s) => s.display_id === String(targetDisplay?.id)) ||
            sources.find((s) => s.display_id === String(screen.getPrimaryDisplay()?.id)) ||
            sources[0];
        }

        if (!primarySource || !primarySource.thumbnail || primarySource.thumbnail.isEmpty()) {
          return null;
        }

        let image = primarySource.thumbnail;
        const imgSize = image.getSize();
        if (imgSize.width <= 0 || imgSize.height <= 0) return null;

        // Preparar descripción de región normalizada para el worker
        let workerRegion: { x_pct: number; y_pct: number; w_pct: number; h_pct: number } | null = null;
        if (region && typeof region === 'object') {
          const rawX = typeof region.x_pct === 'number' && !isNaN(region.x_pct) ? region.x_pct : 0;
          const rawY = typeof region.y_pct === 'number' && !isNaN(region.y_pct) ? region.y_pct : 0;
          const rawW = typeof region.w_pct === 'number' && !isNaN(region.w_pct) ? region.w_pct : 100;
          const rawH = typeof region.h_pct === 'number' && !isNaN(region.h_pct) ? region.h_pct : 100;
          const clampedX = Math.max(0, Math.min(99, rawX));
          const clampedY = Math.max(0, Math.min(99, rawY));
          workerRegion = {
            x_pct: clampedX,
            y_pct: clampedY,
            w_pct: Math.max(1, Math.min(100 - clampedX, rawW)),
            h_pct: Math.max(1, Math.min(100 - clampedY, rawH)),
          };
        }

        // Intentar delegar crop + JPEG encode al worker (CPU-bound off-main)
        // toBitmap() se llama justo antes del postMessage; tras la transferencia
        // bgraBuffer queda vaciado, pero `image` sigue válida para el fallback.
        let base64Result: string;
        const bgraBuffer = image.toBitmap();
        const workerReply = await processScreen(
          bgraBuffer,
          imgSize.width,
          imgSize.height,
          workerRegion,
          55
        );

        if (workerReply.base64) {
          // Worker procesó correctamente (sharp disponible)
          base64Result = workerReply.base64;
        } else {
          // Fallback: sharp no disponible o worker agotó timeout → encode en main
          // Aplicar crop nativo si se especificó región
          if (workerRegion) {
            const cropX = Math.max(0, Math.min(imgSize.width - 1, Math.round((workerRegion.x_pct / 100) * imgSize.width)));
            const cropY = Math.max(0, Math.min(imgSize.height - 1, Math.round((workerRegion.y_pct / 100) * imgSize.height)));
            const maxW = imgSize.width - cropX;
            const maxH = imgSize.height - cropY;
            const cropW = Math.max(1, Math.min(maxW, Math.round((workerRegion.w_pct / 100) * imgSize.width)));
            const cropH = Math.max(1, Math.min(maxH, Math.round((workerRegion.h_pct / 100) * imgSize.height)));
            if (cropW > 0 && cropH > 0 && (cropW < imgSize.width || cropH < imgSize.height || cropX > 0 || cropY > 0)) {
              try {
                image = image.crop({ x: cropX, y: cropY, width: cropW, height: cropH });
              } catch (cropErr) {
                console.warn('[SystemIpc] Region cropping fallback failed, returning full thumbnail:', cropErr);
              }
            }
          }
          // Fast JPEG encode at quality 55 (~25KB payload, sub-3ms)
          const jpegBuffer = image.toJPEG(55);
          base64Result = jpegBuffer.toString('base64');
        }

        lastScreenCaptureCache = {
          timestamp: Date.now(),
          regionKey,
          base64: base64Result,
        };

        return base64Result;
      } catch (err) {
        console.error('[SystemIpc] capture-screen-native error:', err);
        return null;
      } finally {
        activeScreenCapturePromises.delete(regionKey);
        isScreenCaptureInProgress = activeScreenCapturePromises.size > 0;
      }
    })();

    if (!isFreshRequest) activeScreenCapturePromises.set(regionKey, capturePromise);
    return capturePromise;
  });

  // ── Configuration Store ───────────────────────────────────────────────────
  handleTrusted('get-app-config', () => readPublicConfig());
  handleTrusted('save-app-config', async (_event, config) => {
    const clean = await writePublicConfig(config);
    // Synchronize relevant application fields into physical config/app.json
    try {
      const appSectionUpdate: Record<string, any> = {};
      const syncKeys = [
        'live2dVisible', 'live2dModelId', 'avatarViewMode', 'zenMode',
        'workspacePath', 'voiceVolume', 'allowedFolders', 'customAllowedPaths'
      ];
      for (const key of syncKeys) {
        if (clean[key] !== undefined) appSectionUpdate[key] = clean[key];
      }
      if (clean.modelId) {
        appSectionUpdate.activeModelId = clean.modelId;
        appSectionUpdate.modelId = clean.modelId;
      }
      if (clean.voiceName) {
        appSectionUpdate.activeVoiceName = clean.voiceName;
        appSectionUpdate.voiceName = clean.voiceName;
      }
      if (Object.keys(appSectionUpdate).length > 0) {
        const currentAppConfig = await modularConfigLoader.readSection<Record<string, any>>('app.json', {});
        await modularConfigLoader.writeSection('app.json', { ...currentAppConfig, ...appSectionUpdate });
      }
    } catch (syncErr) {
      console.warn('[SystemIpc] Error syncing app.json from save-app-config:', syncErr);
    }
    // Every renderer owns a projection of the same config. Broadcast the
    // committed merge to each live window so a change in Settings, the HUD or
    // Camera never leaves another surface showing a stale selection.
    for (const window of [windowManager.getMainWindow(), windowManager.getSettingsWindow(), windowManager.getCameraWindow()]) {
      if (window && !window.isDestroyed()) window.webContents.send('config-updated', clean);
    }
    return { success: true };
  });

  handleTrusted('config-read-all', () => modularConfigLoader.loadAll());
  handleTrusted('config-write-section', async (_event, payload: any, dataFallback?: any) => {
    const section = (typeof payload === 'object' && payload !== null && 'section' in payload) ? payload.section : payload;
    const data = (typeof payload === 'object' && payload !== null && 'data' in payload) ? payload.data : dataFallback;
    if (typeof section === 'string' && section.trim()) {
      await modularConfigLoader.writeSection(`${section}.json`, data);
      if (section === 'app' && data && typeof data === 'object') {
        const clean = await writePublicConfig(data);
        for (const window of [windowManager.getMainWindow(), windowManager.getSettingsWindow(), windowManager.getCameraWindow()]) {
          if (window && !window.isDestroyed()) {
            window.webContents.send('config-updated', clean);
            window.webContents.send('modular-config-updated', { section, data });
          }
        }
      } else {
        for (const window of [windowManager.getMainWindow(), windowManager.getSettingsWindow(), windowManager.getCameraWindow()]) {
          if (window && !window.isDestroyed()) {
            window.webContents.send('modular-config-updated', { section, data });
          }
        }
      }
      return { success: true };
    }
    return { success: false, error: 'Invalid section' };
  });

  onTrusted('companion-pause', () => {
    const mainWin = windowManager.getMainWindow();
    if (mainWin?.webContents && !mainWin.isDestroyed()) {
      mainWin.webContents.send('companion-pause');
    }
  });

  onTrusted('companion-resume', () => {
    const mainWin = windowManager.getMainWindow();
    if (mainWin?.webContents && !mainWin.isDestroyed()) {
      mainWin.webContents.send('companion-resume');
    }
  });

  // ── Offline & Local Updater ───────────────────────────────────────────────
  handleTrusted('check-for-updates', async () => {
    try {
      const currentVersion = app.getVersion();
      const localRelease = findLocalProjectRelease(baseDir);

      if (localRelease && localRelease.version) {
        const isNewer = isNewerVersion(localRelease.version, currentVersion);
        if (isNewer) {
          pendingLocalUpdate = localRelease;
          const mainWin = windowManager.getMainWindow();
          if (mainWin?.webContents && !mainWin.isDestroyed()) {
            mainWin.webContents.send('update-status', {
              type: 'available',
              version: localRelease.version,
              releaseDate: localRelease.mtime,
              isLocal: true,
              sizeMB: Math.round(localRelease.fileSize / 1024 / 1024),
            });
          }
          return { success: true, version: localRelease.version, isLocal: true };
        }
      }

      const mainWin = windowManager.getMainWindow();
      if (mainWin?.webContents && !mainWin.isDestroyed()) {
        mainWin.webContents.send('update-status', {
          type: 'not-available',
          version: currentVersion,
          isLocal: true,
        });
      }
      return { success: true, version: currentVersion, isLocal: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  handleTrusted('download-update', async () => {
    try {
      if (!pendingLocalUpdate || !fs.existsSync(pendingLocalUpdate.filePath)) {
        const local = findLocalProjectRelease(baseDir);
        if (local) pendingLocalUpdate = local;
      }
      if (!pendingLocalUpdate || !fs.existsSync(pendingLocalUpdate.filePath)) {
        return { success: false, error: 'No se encontró instalador en la carpeta release/ local.' };
      }

      const mainWin = windowManager.getMainWindow();
      if (mainWin?.webContents && !mainWin.isDestroyed()) {
        mainWin.webContents.send('update-status', {
          type: 'progress',
          percent: 100,
          transferred: pendingLocalUpdate.fileSize,
          total: pendingLocalUpdate.fileSize,
        });
        mainWin.webContents.send('update-status', {
          type: 'downloaded',
          version: pendingLocalUpdate.version,
          isLocal: true,
        });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  handleTrusted('install-update', async () => {
    try {
      if (!pendingLocalUpdate || !fs.existsSync(pendingLocalUpdate.filePath)) {
        const local = findLocalProjectRelease(baseDir);
        if (local) pendingLocalUpdate = local;
      }
      if (pendingLocalUpdate && fs.existsSync(pendingLocalUpdate.filePath)) {
        await verifyInstaller(pendingLocalUpdate.filePath, pendingLocalUpdate.version || '', app.getVersion());
        await processManager.cleanupAll();
        const child = spawn(pendingLocalUpdate.filePath, [], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        app.quit();
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[SystemIpc] Error installing local update:', err);
      return false;
    }
  });

  // Registrar cleanup del worker de captura de pantalla para cierre limpio de la app
  processManager.registerCleanupHook('screen-worker', () => void disposeScreenWorker());
}
