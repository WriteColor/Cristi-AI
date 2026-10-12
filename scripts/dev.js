import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// Path to electron binary from npm package
const electronBinary = require('electron');

// Path to vite bin entry point
const vitePackageJson = require.resolve('vite/package.json');
const viteBinary = path.join(path.dirname(vitePackageJson), 'bin/vite.js');

// Path to build-electron script
const buildScript = path.join(ROOT_DIR, 'scripts/build-electron.cjs');

export function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } catch (_) {}
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch (_) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch (_) {}
    }
  }
}

export async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  const parsed = new URL(url);
  while (Date.now() - start < timeoutMs) {
    const isReady = await new Promise((resolve) => {
      const req = http.get(
        {
          hostname: parsed.hostname,
          port: parsed.port,
          path: '/',
          timeout: 1000,
        },
        (res) => {
          resolve(Boolean(res.statusCode && res.statusCode < 500));
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });

    if (isReady) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`El servidor de desarrollo Vite no respondió en ${url}`);
}

export async function startDev() {
  console.log('\x1b[36m[Dev]\x1b[0m Iniciando entorno de desarrollo Cristi AI...');

  // 1. Iniciar Vite
  const viteChild = spawn(process.execPath, [viteBinary], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });

  // 2. Iniciar compilador de Electron en modo watch
  const buildChild = spawn(process.execPath, [buildScript, '--watch'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });

  let isShuttingDown = false;
  const cleanup = (code = 0) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    killProcessTree(buildChild.pid);
    killProcessTree(viteChild.pid);

    process.exit(code);
  };

  process.on('SIGINT', () => cleanup(0));
  process.on('SIGTERM', () => cleanup(0));
  process.on('exit', () => cleanup(0));

  viteChild.on('exit', (code) => {
    if (!isShuttingDown) {
      console.error(`\x1b[31m[Dev] Vite terminó inesperadamente con código ${code}\x1b[0m`);
      cleanup(code ?? 1);
    }
  });

  buildChild.on('exit', (code) => {
    if (!isShuttingDown) {
      console.error(`\x1b[31m[Dev] Compilador Electron terminó inesperadamente con código ${code}\x1b[0m`);
      cleanup(code ?? 1);
    }
  });

  // 3. Esperar que Vite responda en http://localhost:5173
  try {
    await waitForServer('http://localhost:5173');
  } catch (err) {
    console.error(`\x1b[31m[Dev] ${err.message}\x1b[0m`);
    cleanup(1);
    return;
  }

  // 4. Iniciar Electron
  const electronChild = spawn(electronBinary, ['electron/main.cjs'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });

  electronChild.on('exit', (code) => {
    cleanup(code ?? 0);
  });
}

// Ejecutar si se invoca como script principal
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startDev().catch((err) => {
    console.error('\x1b[31m[Dev] Error fatal al iniciar entorno:\x1b[0m', err);
    process.exit(1);
  });
}
