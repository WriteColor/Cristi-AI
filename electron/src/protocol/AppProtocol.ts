import { protocol, net, app } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PathPolicy } from '../security/PathPolicy';

export const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.scdn.co; media-src 'self' blob: data:; font-src 'self'; connect-src 'self' wss://generativelanguage.googleapis.com https://generativelanguage.googleapis.com https://api.spotify.com https://accounts.spotify.com; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function protocolResource(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'app:' || parsed.host !== 'cristi' || parsed.username || parsed.password) throw new Error('Origen inválido.');
  const decoded = decodeURIComponent(parsed.pathname);
  if (decoded.includes('\\') || decoded.includes('%')) throw new Error('Ruta inválida.');
  return decoded.slice(1) || 'index.html';
}

export function registerAppProtocol(rootDir: string): void {
  const policy = new PathPolicy({ exports: path.join(app.isPackaged ? app.getAppPath() : rootDir, 'dist') });
  protocol.handle('app', async request => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
      const file = await policy.resolveWithin('exports', protocolResource(request.url));
      const response = await net.fetch(pathToFileURL(file).href, { method: request.method, headers: request.headers });
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response('Recurso no disponible', { status: 404,
        headers: { 'Content-Security-Policy': CONTENT_SECURITY_POLICY } });
    }
  });
}
