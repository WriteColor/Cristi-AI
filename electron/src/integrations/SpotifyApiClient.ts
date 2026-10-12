import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { spotifyAuthManager, SpotifyAuthManager } from './SpotifyAuthManager';
import { modularConfigLoader, ModularConfigLoader } from '../core/ModularConfigLoader';

const execFileAsync = promisify(execFile);

export interface SpotifyPlayOptions {
  uri?: string;
  context_uri?: string;
  query?: string;
  deviceId?: string;
}

export class SpotifyApiClient {
  private static readonly BASE_URL = 'https://api.spotify.com/v1';

  constructor(
    private authManager: SpotifyAuthManager = spotifyAuthManager,
    private configLoader: ModularConfigLoader = modularConfigLoader
  ) {}

  /**
   * Locates bundled or installed spotify_cli executable on Windows.
   */
  public getSpotifyCliPath(): string | null {
    if (process.platform !== 'win32') return null;
    const candidates = [
      path.join(process.env.APPDATA || '', 'Spotify', 'spotify_cli.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'spotify_cli.exe'),
      path.join(process.env.ProgramFiles || '', 'Spotify', 'spotify_cli.exe'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'Spotify', 'spotify_cli.exe'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Internal generic request helper with automatic bearer token injection and error handling.
   */
  public async request<T = any>(endpoint: string, init: RequestInit = {}): Promise<T> {
    const token = await this.authManager.getValidToken();
    if (!token) {
      const err = new Error('NO_AUTH: No active or valid Spotify session.');
      (err as any).code = 'NO_AUTH';
      throw err;
    }

    const url = endpoint.startsWith('http') ? endpoint : `${SpotifyApiClient.BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      ...(init.headers as Record<string, string> || {})
    };

    if (init.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...init,
      headers
    });

    // 204 No Content indicates success for player actions (play, pause, next, prev, volume)
    if (response.status === 204) {
      return { success: true } as T;
    }

    if (!response.ok) {
      let errorBody: any = {};
      try {
        errorBody = await response.json();
      } catch {
        // Body is not JSON
      }

      const msg = errorBody?.error?.message || `Spotify API error (${response.status} ${response.statusText})`;
      const reason = errorBody?.error?.reason;
      const error = new Error(reason ? `${reason}: ${msg}` : msg);
      (error as any).status = response.status;
      (error as any).reason = reason;
      (error as any).spotifyError = errorBody?.error;
      throw error;
    }

    return await response.json() as T;
  }

  /**
   * Starts or resumes playback. If a query is supplied, searches for the top track and plays it.
   * Utilizes local spotify_cli when available for instant desktop playback even if in the system tray.
   */
  public async play(options?: SpotifyPlayOptions): Promise<any> {
    let targetUri = options?.uri;
    const contextUri = options?.context_uri;

    // Search track if query given
    if (options?.query && !targetUri && !contextUri) {
      const searchRes = await this.search(options.query, 'track').catch(() => null);
      const topTrack = searchRes?.tracks?.items?.[0];
      if (topTrack?.uri) {
        targetUri = topTrack.uri;
      }
    }

    const cliPath = this.getSpotifyCliPath();
    if (cliPath) {
      try {
        if (!targetUri && !contextUri && options?.query) {
          const { stdout } = await execFileAsync(cliPath, ['search', options.query, '--format', 'json']);
          const parsed = JSON.parse(stdout);
          const top = parsed.tracks?.[0];
          if (top?.uri) targetUri = top.uri;
        }

        if (targetUri) {
          await execFileAsync(cliPath, ['play', targetUri]);
          return {
            success: true,
            message: `Reproduciendo "${options?.query || targetUri}" en Spotify.`,
            target: options?.query || targetUri,
            engine: 'spotify_cli'
          };
        } else if (contextUri) {
          await execFileAsync(cliPath, ['play', contextUri]);
          return {
            success: true,
            message: `Reproduciendo "${contextUri}" en Spotify.`,
            target: contextUri,
            engine: 'spotify_cli'
          };
        } else {
          await execFileAsync(cliPath, ['resume']);
          return {
            success: true,
            message: 'Reproducción reanudada en Spotify.',
            engine: 'spotify_cli'
          };
        }
      } catch (cliErr) {
        console.warn('[SpotifyApiClient] Fallback a Web API tras aviso en spotify_cli:', cliErr);
      }
    }

    const config = await this.configLoader.readSection<any>('spotify.json', {});
    const targetDeviceId = options?.deviceId || config?.preferredDevice;
    const queryParam = targetDeviceId ? `?device_id=${encodeURIComponent(targetDeviceId)}` : '';
    let body: string | undefined = undefined;

    if (contextUri) {
      body = JSON.stringify({ context_uri: contextUri });
    } else if (targetUri) {
      if (targetUri.startsWith('spotify:track:')) {
        body = JSON.stringify({ uris: [targetUri] });
      } else {
        body = JSON.stringify({ context_uri: targetUri });
      }
    }

    try {
      return await this.request(`/me/player/play${queryParam}`, {
        method: 'PUT',
        body
      });
    } catch (err: unknown) {
      const errorObj = err as { status?: number; reason?: string; message?: string } | null;
      if (
        errorObj?.status === 404 ||
        errorObj?.reason === 'NO_ACTIVE_DEVICE' ||
        String(errorObj?.message || '').toLowerCase().includes('device') ||
        String(errorObj?.message || '').toLowerCase().includes('no active')
      ) {
        const autoDeviceId = await this.ensureActiveDevice(targetDeviceId);
        return await this.request(`/me/player/play?device_id=${encodeURIComponent(autoDeviceId)}`, {
          method: 'PUT',
          body
        });
      }
      throw err;
    }
  }

  /**
   * Automatically launches Spotify desktop application if installed on the system.
   */
  public launchSpotifyDesktop(): boolean {
    try {
      if (process.platform === 'win32') {
        const appData = process.env.APPDATA || '';
        const localAppData = process.env.LOCALAPPDATA || '';
        const defaultExe = path.join(appData, 'Spotify', 'Spotify.exe');
        const winAppsExe = path.join(localAppData, 'Microsoft', 'WindowsApps', 'Spotify.exe');

        if (fs.existsSync(defaultExe)) {
          spawn(defaultExe, [], { detached: true, stdio: 'ignore' }).unref();
          return true;
        }
        if (fs.existsSync(winAppsExe)) {
          spawn(winAppsExe, [], { detached: true, stdio: 'ignore' }).unref();
          return true;
        }
        spawn('cmd.exe', ['/c', 'start', 'spotify:'], { detached: true, stdio: 'ignore' }).unref();
        return true;
      } else if (process.platform === 'darwin') {
        spawn('open', ['-a', 'Spotify'], { detached: true, stdio: 'ignore' }).unref();
        return true;
      } else {
        spawn('spotify', [], { detached: true, stdio: 'ignore' }).unref();
        return true;
      }
    } catch {
      return false;
    }
  }

  /**
   * Ensures an active Spotify Connect device is available.
   * If Spotify is closed, launches Spotify Desktop and polls until the device registers.
   */
  public async ensureActiveDevice(preferredDeviceId?: string): Promise<string> {
    let devicesRes = await this.getDevices().catch(() => null);
    let devicesList: Array<{ id: string; is_active?: boolean; name?: string }> = Array.isArray(devicesRes?.devices)
      ? devicesRes.devices
      : [];

    if (devicesList.length === 0) {
      this.launchSpotifyDesktop();
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        devicesRes = await this.getDevices().catch(() => null);
        devicesList = Array.isArray(devicesRes?.devices) ? devicesRes.devices : [];
        if (devicesList.length > 0) break;
      }
    }

    if (devicesList.length === 0) {
      throw new Error('No se detectó ningún dispositivo de Spotify activo tras iniciar la aplicación.');
    }

    if (preferredDeviceId) {
      const preferred = devicesList.find((d) => d.id === preferredDeviceId);
      if (preferred) {
        if (!preferred.is_active) {
          await this.transferPlayback(preferred.id, false).catch(() => {});
          await new Promise((r) => setTimeout(r, 500));
        }
        return preferred.id;
      }
    }

    const active = devicesList.find((d) => d.is_active);
    if (active && active.id) return active.id;

    const target = devicesList[0];
    await this.transferPlayback(target.id, false).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    return target.id;
  }

  /**
   * Pauses active Spotify playback.
   */
  public async pause(deviceId?: string): Promise<any> {
    const cliPath = this.getSpotifyCliPath();
    if (cliPath) {
      try {
        await execFileAsync(cliPath, ['pause']);
      } catch (cliErr) {
        console.warn('[SpotifyApiClient] spotify_cli pause error:', cliErr);
      }
    }

    try {
      const queryParam = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
      return await this.request(`/me/player/pause${queryParam}`, {
        method: 'PUT'
      });
    } catch (err) {
      if (cliPath) return { success: true, engine: 'spotify_cli' };
      throw err;
    }
  }

  /**
   * Skips to the next track.
   */
  public async skipNext(deviceId?: string): Promise<any> {
    const cliPath = this.getSpotifyCliPath();
    if (cliPath) {
      try {
        await execFileAsync(cliPath, ['next']);
      } catch (cliErr) {
        console.warn('[SpotifyApiClient] spotify_cli next error:', cliErr);
      }
    }

    try {
      const queryParam = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
      return await this.request(`/me/player/next${queryParam}`, {
        method: 'POST'
      });
    } catch (err) {
      if (cliPath) return { success: true, engine: 'spotify_cli' };
      throw err;
    }
  }

  /**
   * Skips to the previous track.
   */
  public async skipPrevious(deviceId?: string): Promise<any> {
    const cliPath = this.getSpotifyCliPath();
    if (cliPath) {
      try {
        await execFileAsync(cliPath, ['previous']);
      } catch (cliErr) {
        console.warn('[SpotifyApiClient] spotify_cli previous error:', cliErr);
      }
    }

    try {
      const queryParam = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
      return await this.request(`/me/player/previous${queryParam}`, {
        method: 'POST'
      });
    } catch (err) {
      if (cliPath) return { success: true, engine: 'spotify_cli' };
      throw err;
    }
  }

  /**
   * Sets the playback volume (0 to 100 percent).
   */
  public async setVolume(percent: number, deviceId?: string): Promise<any> {
    const clamped = Math.round(Math.max(0, Math.min(100, percent)));
    const cliPath = this.getSpotifyCliPath();
    if (cliPath) {
      try {
        await execFileAsync(cliPath, ['volume', (clamped / 100).toFixed(2)]);
      } catch (cliErr) {
        console.warn('[SpotifyApiClient] spotify_cli volume error:', cliErr);
      }
    }

    try {
      const params = new URLSearchParams({ volume_percent: String(clamped) });
      if (deviceId) {
        params.set('device_id', deviceId);
      }
      return await this.request(`/me/player/volume?${params.toString()}`, {
        method: 'PUT'
      });
    } catch (err) {
      if (cliPath) return { success: true, volume_percent: clamped, engine: 'spotify_cli' };
      throw err;
    }
  }

  /**
   * Retrieves playback status and currently playing item.
   */
  public async getNowPlaying(): Promise<any> {
    try {
      const res = await this.request('/me/player');
      if (res && res.item && res.is_playing) {
        return res;
      }
    } catch (_) {}

    const cliPath = this.getSpotifyCliPath();
    if (cliPath) {
      try {
        const { stdout } = await execFileAsync(cliPath, ['now-playing', '--format', 'json']);
        const data = JSON.parse(stdout.trim());
        if (data?.currently_playing) {
          const cp = data.currently_playing;
          const [title, artist] = (cp.description || '').split(' — ');
          return {
            is_playing: Boolean(cp.is_playing),
            item: {
              name: title || cp.description,
              artists: artist ? [{ name: artist }] : [],
              uri: cp.uri
            },
            context: cp.context_description || null
          };
        }
      } catch (_) {}
    }
    return null;
  }

  /**
   * Searches Spotify for tracks, albums, artists, or playlists.
   */
  public async search(query: string, types: string = 'track,album,artist'): Promise<any> {
    const params = new URLSearchParams({
      q: query.trim(),
      type: types.trim(),
      limit: '10'
    });
    return await this.request(`/search?${params.toString()}`);
  }

  /**
   * Gets current user's queue.
   */
  public async getQueue(): Promise<any> {
    return await this.request('/me/player/queue');
  }

  /**
   * Gets user's playlists.
   */
  public async getPlaylists(limit: number = 20, offset: number = 0): Promise<any> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return await this.request(`/me/playlists?${params.toString()}`);
  }

  /**
   * Gets available playback devices.
   */
  public async getDevices(): Promise<any> {
    return await this.request('/me/player/devices');
  }

  /**
   * Transfers playback to a new device.
   */
  public async transferPlayback(deviceId: string, play: boolean = true): Promise<any> {
    return await this.request('/me/player', {
      method: 'PUT',
      body: JSON.stringify({
        device_ids: [deviceId],
        play
      })
    });
  }

  /**
   * Adds an item to the end of the user's current playback queue.
   */
  public async addToQueue(uri: string, deviceId?: string): Promise<any> {
    const params = new URLSearchParams({ uri });
    if (deviceId) params.set('device_id', deviceId);
    return await this.request(`/me/player/queue?${params.toString()}`, {
      method: 'POST'
    });
  }

  /**
   * Adjusts playback volume by a delta (+/- percent).
   */
  public async adjustVolume(volumeDelta: number, deviceId?: string): Promise<any> {
    const current = await this.getNowPlaying();
    const currentVolume = current?.device?.volume_percent ?? 50;
    const newVolume = Math.max(0, Math.min(100, currentVolume + volumeDelta));
    return await this.setVolume(newVolume, deviceId);
  }

  /**
   * Gets tracks from a specific playlist.
   */
  public async getPlaylistTracks(playlistId: string, limit: number = 20, offset: number = 0): Promise<any> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return await this.request(`/playlists/${encodeURIComponent(playlistId)}/tracks?${params.toString()}`);
  }

  /**
   * Gets user's recently played tracks.
   */
  public async getRecentlyPlayed(limit: number = 20): Promise<any> {
    const params = new URLSearchParams({ limit: String(limit) });
    return await this.request(`/me/player/recently-played?${params.toString()}`);
  }

  /**
   * Gets user's saved tracks in library.
   */
  public async getUsersSavedTracks(limit: number = 20, offset: number = 0): Promise<any> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return await this.request(`/me/tracks?${params.toString()}`);
  }

  /**
   * Removes tracks from user's library.
   */
  public async removeUsersSavedTracks(trackIds: string[]): Promise<any> {
    return await this.request('/me/tracks', {
      method: 'DELETE',
      body: JSON.stringify({ ids: trackIds })
    });
  }

  /**
   * Gets user's top tracks over a given time range.
   */
  public async getTopTracks(timeRange: string = 'medium_term', limit: number = 20): Promise<any> {
    const params = new URLSearchParams({ time_range: timeRange, limit: String(limit) });
    return await this.request(`/me/top/tracks?${params.toString()}`);
  }

  /**
   * Gets user's top artists over a given time range.
   */
  public async getTopArtists(timeRange: string = 'medium_term', limit: number = 20): Promise<any> {
    const params = new URLSearchParams({ time_range: timeRange, limit: String(limit) });
    return await this.request(`/me/top/artists?${params.toString()}`);
  }

  /**
   * Creates a new playlist for the current user.
   */
  public async createPlaylist(name: string, description?: string, isPublic: boolean = false): Promise<any> {
    const profile = await this.request('/me');
    const userId = profile?.id;
    if (!userId) throw new Error('No se pudo obtener el ID del usuario.');
    return await this.request(`/users/${encodeURIComponent(userId)}/playlists`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        public: isPublic
      })
    });
  }

  /**
   * Adds tracks to a playlist.
   */
  public async addTracksToPlaylist(playlistId: string, uris: string[], position?: number): Promise<any> {
    const body: Record<string, any> = { uris };
    if (typeof position === 'number') body.position = position;
    return await this.request(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  /**
   * Gets detailed playlist metadata and tracks.
   */
  public async getPlaylist(playlistId: string): Promise<any> {
    return await this.request(`/playlists/${encodeURIComponent(playlistId)}`);
  }

  /**
   * Updates playlist metadata (name, description, publicity).
   */
  public async updatePlaylist(playlistId: string, name?: string, description?: string, isPublic?: boolean): Promise<any> {
    const body: Record<string, any> = {};
    if (name) body.name = name;
    if (description !== undefined) body.description = description;
    if (isPublic !== undefined) body.public = isPublic;
    return await this.request(`/playlists/${encodeURIComponent(playlistId)}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  /**
   * Removes tracks from a playlist.
   */
  public async removeTracksFromPlaylist(playlistId: string, trackUris: string[]): Promise<any> {
    const tracks = trackUris.map((uri) => ({ uri }));
    return await this.request(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'DELETE',
      body: JSON.stringify({ tracks })
    });
  }

  /**
   * Reorders items in a playlist.
   */
  public async reorderPlaylistItems(options: {
    playlistId: string;
    rangeStart: number;
    insertBefore: number;
    rangeLength?: number;
    snapshotId?: string;
  }): Promise<any> {
    const { playlistId, rangeStart, insertBefore, rangeLength, snapshotId } = options;
    const body: Record<string, any> = {
      range_start: rangeStart,
      insert_before: insertBefore
    };
    if (typeof rangeLength === 'number') body.range_length = rangeLength;
    if (snapshotId) body.snapshot_id = snapshotId;
    return await this.request(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  /**
   * Unfollows (deletes) a playlist for current user.
   */
  public async unfollowPlaylist(playlistId: string): Promise<any> {
    return await this.request(`/playlists/${encodeURIComponent(playlistId)}/followers`, {
      method: 'DELETE'
    });
  }

  /**
   * Retrieves several albums by IDs.
   */
  public async getAlbums(ids: string[]): Promise<any> {
    const params = new URLSearchParams({ ids: ids.join(',') });
    return await this.request(`/albums?${params.toString()}`);
  }

  /**
   * Retrieves an album's tracks.
   */
  public async getAlbumTracks(id: string, limit: number = 20, offset: number = 0): Promise<any> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return await this.request(`/albums/${encodeURIComponent(id)}/tracks?${params.toString()}`);
  }

  /**
   * Saves or removes albums from the current user's library.
   */
  public async saveOrRemoveAlbumForUser(ids: string[], action: 'save' | 'remove'): Promise<any> {
    const method = action === 'save' ? 'PUT' : 'DELETE';
    return await this.request('/me/albums', {
      method,
      body: JSON.stringify({ ids })
    });
  }

  /**
   * Checks if one or more albums are in current user's library.
   */
  public async checkUsersSavedAlbums(ids: string[]): Promise<any> {
    const params = new URLSearchParams({ ids: ids.join(',') });
    return await this.request(`/me/albums/contains?${params.toString()}`);
  }
}

export const spotifyApiClient = new SpotifyApiClient();
