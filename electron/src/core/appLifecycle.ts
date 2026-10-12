import { app, protocol, net, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { registerAppProtocol } from '../protocol/AppProtocol';


import { processManager } from './processManager';
import { loadEnvironment } from './env';

// Initialize environment variables first
loadEnvironment();

/**
 * Configure hardware acceleration and media flags for Electron.
 * Uses Chromium's default GPU policy. Optional profiles exist exclusively for
 * diagnostics and driver compatibility (e.g. software, d3d11, no-overlays).
 */
export function setupCommandLineFlags(): void {
  // Chromium defaults are the baseline. Select only one diagnostic override.
  const profile = process.env.CRISTI_GPU_PROFILE || 'default';
  if (profile === 'software') app.disableHardwareAcceleration();
  else if (profile === 'd3d11') app.commandLine.appendSwitch('use-angle', 'd3d11');
  else if (profile === 'no-overlays') app.commandLine.appendSwitch('disable-features', 'DirectCompositionVideoOverlays');

  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

  // Prevenir que Chromium descarte el contexto WebGL al usar ALT+TAB o minimizar (bug de Live2D)
  app.commandLine.appendSwitch('disable-webgl-context-loss');
  // Unlock high-refresh display rendering (>120 FPS) without Chromium compositor caps
  app.commandLine.appendSwitch('disable-frame-rate-limit');

  const cdpPort = !app.isPackaged && process.env.CRISTI_CDP_PORT;
  if (cdpPort && /^\d{4,5}$/.test(cdpPort)) {
    app.commandLine.appendSwitch('remote-debugging-port', cdpPort);
    app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  }
}

/**
 * Registers privileged custom protocol `app://` for production asset and Live2D model serving.
 * Must be executed before `app.whenReady()`.
 */
export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        allowServiceWorkers: false,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        bypassCSP: false,
      },
    },
  ]);
}

export const registerProtocolHandler = registerAppProtocol;

/**
 * Older development builds used Electron's default `Electron` data directory.
 * Copy only missing durable state into Cristi's stable directory, never
 * overwriting credentials or configuration that were saved by a newer build.
 */
function migrateLegacyUserData(): void {
  const targetDir = app.getPath('userData');
  const legacyDir = path.join(app.getPath('appData'), 'Electron');
  if (path.resolve(targetDir).toLowerCase() === path.resolve(legacyDir).toLowerCase()) return;

  for (const filename of [
    'cristi-config.json',
    'cristi-secrets.json',
    'cristi-memories.json',
    'cristi-memory.sqlite',
    'mcp-launch-approvals.json',
  ]) {
    const source = path.join(legacyDir, filename);
    const target = path.join(targetDir, filename);
    try {
      if (fs.existsSync(source) && !fs.existsSync(target)) {
        fs.mkdirSync(targetDir, { recursive: true });
        fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
        console.info(`[Lifecycle] Migrated legacy user data: ${filename}`);
      }
    } catch (error) {
      console.warn(`[Lifecycle] Could not migrate ${filename}:`, error);
    }
  }
}

/**
 * Enforces single-instance lock for Cristi AI Companion.
 * If another instance is already running, exits immediately.
 */
export function enforceSingleInstanceLock(onSecondInstance?: () => void): boolean {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
    return false;
  }

  app.on('second-instance', () => {
    if (onSecondInstance) {
      onSecondInstance();
    }
  });

  return true;
}

/**
 * Sets up the full application lifecycle handlers.
 */
export function setupAppLifecycle(options: {
  rootDir: string;
  onReady: () => Promise<void> | void;
  onSecondInstance?: () => void;
  onActivate?: () => void;
}): void {
  // 1. Configure early flags & schemes
  setupCommandLineFlags();
  registerPrivilegedSchemes();

  // 2. Single instance lock
  const hasLock = enforceSingleInstanceLock(options.onSecondInstance);
  if (!hasLock) return;

  // 3. App ready lifecycle
  app.whenReady().then(async () => {
    migrateLegacyUserData();
    registerProtocolHandler(options.rootDir);
    await options.onReady();

    app.on('activate', () => {
      if (options.onActivate) {
        options.onActivate();
      } else if (BrowserWindow.getAllWindows().length === 0) {
        // Fallback default
      }
    });
  });

  // 4. Shutdown lifecycle
  const handleShutdown = async () => {
    await processManager.cleanupAll();
  };

  let shutdownComplete = false;
  app.on('before-quit', event => {
    if (shutdownComplete) return;
    event.preventDefault();
    void handleShutdown().finally(() => { shutdownComplete = true; app.quit(); });
  });
  app.on('window-all-closed', async () => {
    await handleShutdown();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
