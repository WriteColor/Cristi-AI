import * as electron from 'electron';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const shell = (electron as any).shell ?? {
  openExternal: async (_url: string) => {},
};

export type WindowsMediaAction =
  | 'play_pause'
  | 'next'
  | 'previous'
  | 'stop'
  | 'volume_up'
  | 'volume_down'
  | 'mute';

export interface WindowsMediaPlaybackStatus {
  isSpotifyRunning: boolean;
  trackInfo: string | null;
  artist: string | null;
  title: string | null;
  isPlaying: boolean;
  source: 'spotify' | 'system' | 'none';
}

export class WindowsMediaController {
  private static readonly VIRTUAL_KEY_CODES: Record<WindowsMediaAction, number> = {
    play_pause: 0xB3,  // VK_MEDIA_PLAY_PAUSE
    next: 0xB0,        // VK_MEDIA_NEXT_TRACK
    previous: 0xB1,    // VK_MEDIA_PREV_TRACK
    stop: 0xB2,        // VK_MEDIA_STOP
    volume_up: 0xAF,   // VK_VOLUME_UP
    volume_down: 0xAE, // VK_VOLUME_DOWN
    mute: 0xAD,        // VK_VOLUME_MUTE
  };

  public getSpotifyCliPath(): string | null {
    if (process.platform !== 'win32') return null;
    const candidates = [
      path.join(process.env.APPDATA || '', 'Spotify', 'spotify_cli.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'spotify_cli.exe'),
      path.join(process.env.ProgramFiles || '', 'Spotify', 'spotify_cli.exe'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  public isValidMediaAction(action: string): action is WindowsMediaAction {
    return Object.prototype.hasOwnProperty.call(WindowsMediaController.VIRTUAL_KEY_CODES, action);
  }

  public isSpotifyUri(uri: string): boolean {
    return typeof uri === 'string' && /^spotify:(track|album|artist|playlist|search):[a-zA-Z0-9%_-]+$/i.test(uri.trim());
  }

  public buildSpotifySearchUri(query: string): string {
    return `spotify:search:${encodeURIComponent(query.trim())}`;
  }

  /**
   * Dispatches a native Windows media virtual key press via PowerShell assembly call.
   */
  public async sendMediaKey(action: WindowsMediaAction): Promise<{ success: boolean; action: string }> {
    if (!this.isValidMediaAction(action)) {
      throw new Error(`Acción multimedia no válida: ${action}`);
    }

    const cliPath = this.getSpotifyCliPath();
    if (cliPath) {
      try {
        if (action === 'play_pause') {
          const { stdout } = await execFileAsync(cliPath, ['now-playing', '--format', 'json']);
          const parsed = JSON.parse(stdout.trim());
          if (parsed?.currently_playing?.is_playing) {
            await execFileAsync(cliPath, ['pause']);
          } else {
            await execFileAsync(cliPath, ['resume']);
          }
          return { success: true, action };
        }
        if (action === 'next') {
          await execFileAsync(cliPath, ['next']);
          return { success: true, action };
        }
        if (action === 'previous') {
          await execFileAsync(cliPath, ['previous']);
          return { success: true, action };
        }
        if (action === 'stop') {
          await execFileAsync(cliPath, ['pause']);
          return { success: true, action };
        }
      } catch (_) {}
    }

    const vkCode = WindowsMediaController.VIRTUAL_KEY_CODES[action];
    const psScript = `
$source = @"
using System;
using System.Runtime.InteropServices;
public class WinMediaKey {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public static void Send(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        keybd_event(vk, 0, 2, UIntPtr.Zero);
    }
}
"@
if (-not ([System.Management.Automation.PSTypeName]'WinMediaKey').Type) {
    Add-Type -TypeDefinition $source -Language CSharp
}
[WinMediaKey]::Send(${vkCode})
`;
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

    try {
      await execAsync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, { timeout: 5000 });
      return { success: true, action };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Error al enviar tecla multimedia a Windows (${action}): ${msg}`, { cause: error });
    }
  }

  /**
   * Launches Spotify with a track, album, playlist, or search query using Windows protocol handler.
   */
  public async launchSpotify(target: string): Promise<{ success: boolean; uri: string }> {
    const trimmed = target.trim();
    const cliPath = this.getSpotifyCliPath();
    if (cliPath) {
      try {
        if (this.isSpotifyUri(trimmed)) {
          await execFileAsync(cliPath, ['play', trimmed]);
          return { success: true, uri: trimmed };
        } else {
          const { stdout } = await execFileAsync(cliPath, ['search', trimmed, '--format', 'json']);
          const parsed = JSON.parse(stdout.trim());
          const topTrack = parsed.tracks?.[0];
          if (topTrack?.uri) {
            await execFileAsync(cliPath, ['play', topTrack.uri]);
            return { success: true, uri: topTrack.uri };
          }
        }
      } catch (_) {}
    }

    const finalUri = this.isSpotifyUri(trimmed) ? trimmed : this.buildSpotifySearchUri(trimmed);
    await shell.openExternal(finalUri);
    // Wake up playback after navigating to URI
    setTimeout(() => {
      this.sendMediaKey('play_pause').catch(() => {});
    }, 1500);
    return { success: true, uri: finalUri };
  }

  /**
   * Queries Windows process list and window titles to inspect Spotify playback state.
   */
  public async getStatus(): Promise<WindowsMediaPlaybackStatus> {
    const cliPath = this.getSpotifyCliPath();
    if (cliPath) {
      try {
        const { stdout } = await execFileAsync(cliPath, ['now-playing', '--format', 'json']);
        const parsed = JSON.parse(stdout.trim());
        if (parsed?.currently_playing) {
          const cp = parsed.currently_playing;
          const [title, artist] = (cp.description || '').split(' — ');
          return {
            isSpotifyRunning: true,
            trackInfo: cp.description,
            artist: artist?.trim() || null,
            title: title?.trim() || cp.description,
            isPlaying: Boolean(cp.is_playing),
            source: 'spotify'
          };
        }
      } catch (_) {}
    }

    if (process.platform !== 'win32') {
      return { isSpotifyRunning: false, trackInfo: null, artist: null, title: null, isPlaying: false, source: 'none' };
    }

    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -NonInteractive -Command "Get-Process -Name Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne \'\' } | Select-Object -ExpandProperty MainWindowTitle"',
        { timeout: 3000 }
      );

      const titles = stdout.split(/\r?\n/).map(t => t.trim()).filter(Boolean);
      if (titles.length === 0) {
        // Check if Spotify process exists without an active visible title
        const { stdout: procOut } = await execAsync('tasklist /FI "IMAGENAME eq Spotify.exe" /NH', { timeout: 2000 });
        const isRunning = procOut.toLowerCase().includes('spotify.exe');
        return { isSpotifyRunning: isRunning, trackInfo: null, artist: null, title: null, isPlaying: false, source: isRunning ? 'spotify' : 'none' };
      }

      const activeTitle = titles[0];
      const isStaticTitle = activeTitle.toLowerCase() === 'spotify' || activeTitle.toLowerCase().includes('spotify premium') || activeTitle.toLowerCase().includes('spotify free');

      if (isStaticTitle) {
        return { isSpotifyRunning: true, trackInfo: null, artist: null, title: null, isPlaying: false, source: 'spotify' };
      }

      // Title is formatted as "Artist - Song Name"
      const separatorIdx = activeTitle.indexOf(' - ');
      let artist: string | null = null;
      let title: string | null = null;

      if (separatorIdx > 0) {
        artist = activeTitle.slice(0, separatorIdx).trim();
        title = activeTitle.slice(separatorIdx + 3).trim();
      } else {
        title = activeTitle;
      }

      return {
        isSpotifyRunning: true,
        trackInfo: activeTitle,
        artist,
        title,
        isPlaying: true,
        source: 'spotify'
      };
    } catch {
      return { isSpotifyRunning: false, trackInfo: null, artist: null, title: null, isPlaying: false, source: 'none' };
    }
  }
}

export const windowsMediaController = new WindowsMediaController();
