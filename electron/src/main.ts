import { app, powerSaveBlocker } from 'electron';
import fs from 'fs';
import path from 'path';
import { setupAppLifecycle } from './core/appLifecycle';
import { windowManager } from './windows/windowManager';
import { registerAllIpcHandlers } from './ipc/ipcRouter';
import { initTray } from './core/tray';
import { registerGlobalShortcuts } from './core/shortcuts';
import { processManager } from './core/processManager';
import { getAppRootDir } from './core/paths';

// Keep development and the packaged application on one stable user-data path.
// This must happen before any code asks Electron for `userData`.
app.setName('cristi-ai-companion');
app.setPath('userData', path.join(app.getPath('appData'), 'cristi-ai-companion'));

// Determine root directory (handles development, compiled, and packaged asar runs)
const ROOT_DIR = getAppRootDir();
windowManager.setRootDir(ROOT_DIR);

// Prevent OS suspension and CPU power throttling during idle conversational streaming
let powerSaveBlockerId: number | null = null;
try {
  powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
} catch (_) {}

// ── Application Bootstrap ───────────────────────────────────────────────────
// Assign max GPU resources instead of disabling
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('enable-transparent-visuals');
setupAppLifecycle({
  rootDir: ROOT_DIR,
  onReady: async () => {
    console.log('[Main] Bootstrapping modular Electron architecture...');

    // 1. Register all IPC routes
    registerAllIpcHandlers(ROOT_DIR);

    // 2. Initialize primary transparent companion window
    windowManager.createMainWindow();

    // 3. Initialize system tray
    initTray(ROOT_DIR, {
      getMainWindow: () => windowManager.getMainWindow(),
      openSettingsWindow: () => windowManager.createSettingsWindow(),
      onQuit: async () => {
        if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
          try {
            powerSaveBlocker.stop(powerSaveBlockerId);
          } catch (_) {}
        }
        await processManager.cleanupAll();
        app.quit();
      },
    });

    // 4. Register global hotkeys
    registerGlobalShortcuts(
      () => windowManager.getMainWindow(),
      () => windowManager.isSettingsActive()
    );

    // 5. Development Live-Reload: auto-relaunch Electron when electron/src is recompiled by esbuild watch
    if (!app.isPackaged) {
      try {
        const distFile = path.join(__dirname, 'main.cjs');
        let debounceTimer: NodeJS.Timeout | null = null;
        fs.watch(distFile, () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            console.log('[Dev] Modificación detectada en proceso principal. Reiniciando Electron...');
            app.relaunch();
            app.exit(0);
          }, 300);
        });
      } catch (_) {}
    }

    console.log('[Main] ✓ Cristi AI Companion initialized successfully.');
  },
  onSecondInstance: () => {
    const mainWin = windowManager.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
  },
  onActivate: () => {
    if (!windowManager.getMainWindow()) {
      windowManager.createMainWindow();
    }
  },
});
