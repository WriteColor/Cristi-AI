import { globalShortcut, BrowserWindow } from 'electron';

export type ShortcutActionCallback = () => boolean;

/**
 * Registers global system shortcuts for fast desktop control.
 */
export function registerGlobalShortcuts(getMainWindow: () => BrowserWindow | null, isSettingsActive: () => boolean): void {
  try {
    globalShortcut.unregisterAll();

    // 1. Boss Key / Toggle Visibility (Ctrl + Shift + C)
    globalShortcut.register('CommandOrControl+Shift+C', () => {
      if (isSettingsActive()) return;
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        if (win.isVisible()) {
          win.hide();
        } else {
          win.show();
          win.focus();
        }
      }
    });

    // 2. Toggle Mute (Ctrl + Shift + M)
    globalShortcut.register('CommandOrControl+Shift+M', () => {
      if (isSettingsActive()) return;
      const win = getMainWindow();
      if (win?.webContents && !win.isDestroyed()) {
        win.webContents.send('shortcut-toggle-mute');
      }
    });

    // 3. Instant Screen Snapshot & Vision Query (Ctrl + Shift + S)
    globalShortcut.register('CommandOrControl+Shift+S', () => {
      if (isSettingsActive()) return;
      const win = getMainWindow();
      if (win?.webContents && !win.isDestroyed()) {
        win.webContents.send('shortcut-capture-screen');
      }
    });

    // 4. Toggle Zen Mode / Hide UI Globally (Ctrl + Shift + H)
    globalShortcut.register('CommandOrControl+Shift+H', () => {
      if (isSettingsActive()) return;
      const win = getMainWindow();
      if (win?.webContents && !win.isDestroyed()) {
        win.webContents.send('shortcut-toggle-zen-mode');
      }
    });

    // 5. Toggle Performance Telemetry & Profiler Globally (Ctrl + Shift + P)
    globalShortcut.register('CommandOrControl+Shift+P', () => {
      if (isSettingsActive()) return;
      const win = getMainWindow();
      if (win?.webContents && !win.isDestroyed()) {
        win.webContents.send('shortcut-toggle-perf-hud');
      }
    });

    // 6. Toggle Always-on-Top / Pin Globally (Ctrl + Shift + A)
    globalShortcut.register('CommandOrControl+Shift+A', () => {
      if (isSettingsActive()) return;
      const win = getMainWindow();
      if (win?.webContents && !win.isDestroyed()) {
        win.webContents.send('shortcut-toggle-always-on-top');
      }
    });
  } catch (err) {
    console.warn('[Shortcuts] Could not register global shortcuts:', (err as Error).message);
  }
}

/**
 * Unregisters all registered global shortcuts.
 */
export function unregisterGlobalShortcuts(): void {
  try {
    globalShortcut.unregisterAll();
  } catch (err) {
    console.warn('[Shortcuts] Error unregistering shortcuts:', (err as Error).message);
  }
}
