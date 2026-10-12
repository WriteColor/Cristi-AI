import { publicSettings, redactText } from './shared/security.js';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TerminalLogPayload {
  id?: string;
  timestamp?: string;
  level?: 'info' | 'warn' | 'error' | 'debug' | 'voice' | string;
  tag?: string;
  message?: string;
  data?: unknown;
}

/**
 * Vite plugin that captures frontend runtime logs sent to /__log and formats
 * them with clean ANSI color styling directly in the terminal console.
 */
function terminalLoggerPlugin(): Plugin {
  return {
    name: 'cristi-terminal-logger',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__log', (req: IncomingMessage, res: ServerResponse) => {
        const address = req.socket.remoteAddress;
        const origin = req.headers.origin;
        if (req.method !== 'POST' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address || '') || origin !== 'http://localhost:5173') {
          res.statusCode = 403; res.end('Forbidden'); return;
        }
        let bytes = 0;
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > 16384) { res.statusCode = 413; res.end('Too large'); req.destroy(); return; }
          body += chunk;
        });
        req.on('end', () => {
          if (res.writableEnded) return;
          try {
            if (body.trim()) {
              const { level, tag = 'SYSTEM', message = '', data } = publicSettings(JSON.parse(redactText(body))) as TerminalLogPayload;
              const time = new Date().toLocaleTimeString('es-ES', { hour12: false });
              const chalkTime = `\x1b[90m[${time}]\x1b[0m`;

              // Tag color map
              const tagColors: Record<string, string> = {
                GEMINI: '\x1b[35m',     // Magenta
                AUDIO: '\x1b[36m',      // Cyan
                ASR: '\x1b[32m',        // Green
                VISION: '\x1b[31m',     // Red
                TOOL: '\x1b[33m',       // Yellow
                SYSTEM: '\x1b[34m',     // Blue
                SCENE: '\x1b[35m',      // Magenta
                ELECTRON: '\x1b[36m',   // Cyan
                CONFIG: '\x1b[32m',     // Green
                PROACTIVE: '\x1b[33m',  // Yellow
                AVATAR: '\x1b[35m',     // Magenta
                PROFILER: '\x1b[35m',   // Magenta
              };

              const normalizedTag = String(tag || 'SYSTEM').toUpperCase();
              const tagColor = tagColors[normalizedTag] || '\x1b[35m';
              const chalkTag = `${tagColor}[${normalizedTag}]\x1b[0m`;

              // Level prefix formatting
              let prefix = '\x1b[32m[INFO]\x1b[0m';
              if (level === 'error') {
                prefix = '\x1b[31m[ERROR]\x1b[0m';
              } else if (level === 'warn') {
                prefix = '\x1b[33m[WARN]\x1b[0m';
              } else if (level === 'voice') {
                prefix = '\x1b[36m[VOICE]\x1b[0m';
              } else if (level === 'debug') {
                prefix = '\x1b[90m[DEBUG]\x1b[0m';
              }

              const hasData =
                data !== null &&
                data !== undefined &&
                (typeof data !== 'object' || Object.keys(data as object).length > 0);
              const dataStr = hasData
                ? ` \x1b[90m=> ${typeof data === 'string' ? data : JSON.stringify(data)}\x1b[0m`
                : '';

              console.log(`${chalkTime} ${prefix} ${chalkTag} ${message}${dataStr}`);
            }
          } catch {
            // Ignore malformed payloads silently
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/plain');
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), terminalLoggerPlugin()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: 'localhost',
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        settings: path.resolve(__dirname, 'settings.html'),
        camera: path.resolve(__dirname, 'camera.html'),
        telemetry: path.resolve(__dirname, 'telemetry.html'),
      },
    },
  },
});
