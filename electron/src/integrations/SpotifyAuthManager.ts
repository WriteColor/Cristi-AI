import * as electron from 'electron';
import http from 'node:http';
import crypto from 'node:crypto';
import { modularConfigLoader, ModularConfigLoader } from '../core/ModularConfigLoader';

const shell = (electron as any).shell ?? {
  openExternal: async (_url: string) => {},
};

const BrowserWindow = (electron as any).BrowserWindow ?? {
  getAllWindows: () => [],
};

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

export interface SpotifyStoredConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
  userProfile?: SpotifyUserProfile | null;
  authenticated?: boolean;
  preferredDevice?: string;
  enableLive2dReactions?: boolean;
  moodMapping?: Record<string, unknown>;
  [key: string]: unknown;
}

export const SPOTIFY_OAUTH_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-read-playback-position'
].join(' ');

export class SpotifyAuthManager {
  private pendingServer: http.Server | null = null;
  private pendingTimeout: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(private configLoader: ModularConfigLoader = modularConfigLoader) {}

  /**
   * Builds the Spotify OAuth 2.0 authorization URL.
   */
  public getAuthorizeUrl(clientId: string, redirectUri: string, state?: string): string {
    const randomState = state || crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId.trim(),
      scope: SPOTIFY_OAUTH_SCOPES,
      redirect_uri: redirectUri.trim(),
      state: randomState,
      show_dialog: 'true'
    });
    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  /**
   * Starts a temporary local loopback HTTP server and opens the Spotify authorization URL in the user browser.
   */
  public async startAuthorization(
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    if (!clientId.trim() || !clientSecret.trim()) {
      return { success: false, error: 'Spotify Client ID and Client Secret are required.' };
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(redirectUri);
    } catch {
      return { success: false, error: `Invalid redirectUri: ${redirectUri}` };
    }

    const port = parseInt(parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80'), 10);
    const callbackPath = parsedUrl.pathname || '/callback';

    this.closePendingServer();

    return new Promise((resolve) => {
      let isResolved = false;

      const server = http.createServer(async (req, res) => {
        try {
          if (!req.url) {
            res.writeHead(400);
            res.end();
            return;
          }

          const requestUrl = new URL(req.url, `http://127.0.0.1:${port}`);
          if (requestUrl.pathname !== callbackPath) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
          }

          const error = requestUrl.searchParams.get('error');
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(this.buildErrorHtml(`Spotify authorization failed: ${error}`));
            this.closePendingServer();
            return;
          }

          const code = requestUrl.searchParams.get('code');
          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(this.buildErrorHtml('No authorization code was received.'));
            this.closePendingServer();
            return;
          }

          // Exchange authorization code for access & refresh tokens
          const tokenRes = await this.exchangeCodeForToken(clientId, clientSecret, code, redirectUri);
          if (!tokenRes.success || !tokenRes.tokens) {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(this.buildErrorHtml(tokenRes.error || 'Failed to exchange authorization code.'));
            this.closePendingServer();
            return;
          }

          const { access_token, refresh_token, expires_in } = tokenRes.tokens;

          // Retrieve user profile
          const userProfile = await this.fetchUserProfile(access_token);

          // Persist into config/spotify.json
          const current = await this.configLoader.readSection<SpotifyStoredConfig>('spotify.json', {});
          const expiresAt = Date.now() + (expires_in || 3600) * 1000;
          const updated: SpotifyStoredConfig = {
            ...current,
            clientId,
            clientSecret,
            redirectUri,
            accessToken: access_token,
            refreshToken: refresh_token || current.refreshToken || null,
            expiresAt,
            userProfile,
            authenticated: true
          };

          await this.configLoader.writeSection('spotify.json', updated);

          // Dark mode friendly HTML response
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.buildSuccessHtml());

          this.closePendingServer();

          // Notify Electron windows
          const sessionStatus: SpotifySessionStatus = {
            authenticated: true,
            userProfile,
            expiresAt,
            clientId: clientId ? `${clientId.slice(0, 6)}...` : undefined,
            hasRefreshToken: Boolean(updated.refreshToken)
          };
          this.notifyWindows(sessionStatus);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.buildErrorHtml(msg));
          this.closePendingServer();
        }
      });

      server.on('error', (err: any) => {
        if (!isResolved) {
          isResolved = true;
          this.closePendingServer();
          resolve({ success: false, error: `Loopback server error on port ${port}: ${err.message}` });
        }
      });

      server.listen(port, '127.0.0.1', async () => {
        this.pendingServer = server;
        // Auto-close after 5 minutes of inactivity
        this.pendingTimeout = setTimeout(() => {
          this.closePendingServer();
        }, 5 * 60 * 1000);

        const authUrl = this.getAuthorizeUrl(clientId, redirectUri);
        try {
          await shell.openExternal(authUrl);
        } catch (err) {
          console.warn('[SpotifyAuthManager] Failed to open external browser:', err);
        }

        if (!isResolved) {
          isResolved = true;
          resolve({ success: true, url: authUrl });
        }
      });
    });
  }

  /**
   * Exchanges authorization code with Spotify OAuth token endpoint.
   */
  public async exchangeCodeForToken(
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string
  ): Promise<{ success: boolean; tokens?: { access_token: string; refresh_token?: string; expires_in: number }; error?: string }> {
    try {
      const basicAuth = Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString('base64');
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code.trim(),
        redirect_uri: redirectUri.trim()
      });

      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error_description || errorData.error || `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const data = await response.json() as any;
      return {
        success: true,
        tokens: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: Number(data.expires_in) || 3600
        }
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Retrieves the current user's profile from Spotify Web API.
   */
  public async fetchUserProfile(accessToken: string): Promise<SpotifyUserProfile | null> {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (!response.ok) return null;
      return await response.json() as SpotifyUserProfile;
    } catch {
      return null;
    }
  }

  /**
   * Returns a valid access token. If expired or expiring in < 60s, automatically refreshes and persists.
   */
  public async getValidToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const config = await this.configLoader.readSection<SpotifyStoredConfig>('spotify.json', {});
    if (!config.authenticated || !config.refreshToken) {
      return null;
    }

    const now = Date.now();
    const expiresAt = typeof config.expiresAt === 'number' ? config.expiresAt : 0;
    const isExpiringSoon = !expiresAt || expiresAt - now < 60_000;

    if (!isExpiringSoon && config.accessToken) {
      return config.accessToken;
    }

    this.refreshPromise = (async () => {
      try {
        if (!config.clientId || !config.clientSecret || !config.refreshToken) {
          return null;
        }

        const basicAuth = Buffer.from(`${config.clientId.trim()}:${config.clientSecret.trim()}`).toString('base64');
        const body = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: config.refreshToken
        });

        const response = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: body.toString()
        });

        if (!response.ok) {
          console.warn('[SpotifyAuthManager] Failed to refresh Spotify token. Status:', response.status);
          return null;
        }

        const data = await response.json() as any;
        const newAccessToken = data.access_token as string;
        const newRefreshToken = (data.refresh_token as string) || config.refreshToken;
        const newExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;

        const updatedConfig: SpotifyStoredConfig = {
          ...config,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt
        };
        await this.configLoader.writeSection('spotify.json', updatedConfig);

        return newAccessToken;
      } catch (err) {
        console.error('[SpotifyAuthManager] Token refresh unexpected error:', err);
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Clears tokens and sets session to unauthenticated.
   */
  public async logout(): Promise<void> {
    const current = await this.configLoader.readSection<SpotifyStoredConfig>('spotify.json', {});
    const updated: SpotifyStoredConfig = {
      ...current,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      userProfile: null,
      authenticated: false
    };
    await this.configLoader.writeSection('spotify.json', updated);

    this.notifyWindows({
      authenticated: false,
      userProfile: null,
      expiresAt: null,
      clientId: current.clientId ? `${current.clientId.slice(0, 6)}...` : undefined,
      hasRefreshToken: false
    });
  }

  /**
   * Returns current Spotify session status.
   */
  public async getStatus(): Promise<SpotifySessionStatus> {
    const config = await this.configLoader.readSection<SpotifyStoredConfig>('spotify.json', {});
    const isAuthenticated = Boolean(config.authenticated && (config.accessToken || config.refreshToken));
    return {
      authenticated: isAuthenticated,
      userProfile: config.userProfile || null,
      expiresAt: config.expiresAt || null,
      clientId: config.clientId ? `${config.clientId.slice(0, 6)}...` : undefined,
      hasRefreshToken: Boolean(config.refreshToken)
    };
  }

  private closePendingServer(): void {
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
    if (this.pendingServer) {
      try {
        this.pendingServer.close();
      } catch (_) {}
      this.pendingServer = null;
    }
  }

  private notifyWindows(status: SpotifySessionStatus): void {
    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('spotify-session-updated', status);
        }
      }
    } catch (_) {}
  }

  private buildSuccessHtml(): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Spotify Conectado - Cristi AI</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #0f1115;
      color: #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 1rem;
      box-sizing: border-box;
    }
    .card {
      background: #181b21;
      border: 1px solid #1db95455;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      border-radius: 16px;
      padding: 2.5rem 2rem;
      max-width: 440px;
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(29, 185, 84, 0.15);
      color: #1db954;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 9999px;
      margin-bottom: 1.25rem;
    }
    h1 {
      color: #ffffff;
      font-size: 1.4rem;
      font-weight: 700;
      margin: 0 0 0.75rem;
    }
    p {
      color: #9ca3af;
      font-size: 0.95rem;
      line-height: 1.6;
      margin: 0 0 1.5rem;
    }
    .hint {
      color: #6b7280;
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Spotify Web API</div>
    <h1>¡Sesión de Spotify iniciada exitosamente!</h1>
    <p>Tu cuenta ha sido vinculada con Cristi AI.<br>Puedes cerrar esta pestaña del navegador y volver a la aplicación.</p>
    <div class="hint">Cristi AI continuará sincronizada en segundo plano.</div>
  </div>
</body>
</html>`;
  }

  private buildErrorHtml(errorMessage: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Error de Autenticación - Cristi AI</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #0f1115;
      color: #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 1rem;
      box-sizing: border-box;
    }
    .card {
      background: #181b21;
      border: 1px solid #ef444455;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      border-radius: 16px;
      padding: 2.5rem 2rem;
      max-width: 440px;
      text-align: center;
    }
    .badge {
      display: inline-block;
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 9999px;
      margin-bottom: 1.25rem;
    }
    h1 {
      color: #ef4444;
      font-size: 1.35rem;
      margin: 0 0 0.75rem;
    }
    p {
      color: #9ca3af;
      font-size: 0.92rem;
      line-height: 1.5;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Autorización Fallida</div>
    <h1>No se completó la vinculación</h1>
    <p>${errorMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  </div>
</body>
</html>`;
  }
}

export const spotifyAuthManager = new SpotifyAuthManager();
