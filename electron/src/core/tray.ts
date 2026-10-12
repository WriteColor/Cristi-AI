import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { getAppRootDir } from './paths';

let trayInstance: Tray | null = null;

function createProceduralTrayIcon(): Electron.NativeImage {
  const width = 24;
  const height = 24;
  const buffer = Buffer.alloc(width * height * 4);
  const cyan = [6, 182, 212, 255]; // #06b6d4 - Cristi AI Cyan Accent
  const darkBg = [9, 13, 22, 255]; // #090d16 - Cristi AI Obsidian Zinc

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dx = x - 11.5;
      const dy = y - 11.5;
      const distSq = dx * dx + dy * dy;

      if (distSq <= 100) {
        if (distSq >= 64 || distSq <= 16) {
          buffer[idx] = cyan[0];
          buffer[idx + 1] = cyan[1];
          buffer[idx + 2] = cyan[2];
          buffer[idx + 3] = cyan[3];
        } else {
          buffer[idx] = darkBg[0];
          buffer[idx + 1] = darkBg[1];
          buffer[idx + 2] = darkBg[2];
          buffer[idx + 3] = darkBg[3];
        }
      } else {
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBuffer(buffer, { width, height });
}

export function getTrayIcon(rootDir?: string): Electron.NativeImage {
  const baseDir = rootDir || getAppRootDir();
  const appPath = app.isPackaged ? app.getAppPath() : baseDir;

  const candidates = [
    path.join(baseDir, 'public/tray-icon.png'),
    path.join(appPath, 'public/tray-icon.png'),
    path.join(baseDir, 'public/icon.png'),
    path.join(appPath, 'public/icon.png'),
    path.join(baseDir, 'dist/tray-icon.png'),
    path.join(appPath, 'dist/tray-icon.png'),
    path.join(baseDir, 'dist/icon.png'),
    path.join(appPath, 'dist/icon.png'),
    path.join(baseDir, 'public/favicon.ico'),
    path.join(appPath, 'public/favicon.ico'),
    path.join(process.resourcesPath, 'tray-icon.png'),
    path.join(process.resourcesPath, 'icon.png'),
    path.join(process.resourcesPath, 'favicon.ico'),
    path.join(process.resourcesPath, 'public/tray-icon.png'),
    path.join(process.resourcesPath, 'public/icon.png'),
    path.join(process.resourcesPath, 'app.asar/public/tray-icon.png'),
    path.join(process.resourcesPath, 'app.asar/public/icon.png'),
    path.join(__dirname, '../../public/tray-icon.png'),
    path.join(__dirname, '../../public/icon.png'),
    path.join(__dirname, '../public/tray-icon.png'),
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, 'public/tray-icon.png'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const img = nativeImage.createFromPath(candidate);
        if (!img.isEmpty()) {
          const size = img.getSize();
          if (size.width > 32 || size.height > 32) {
            return img.resize({ width: 24, height: 24, quality: 'best' });
          }
          return img;
        }
      }
    } catch (e) {
      console.warn(`[Tray] Warning resolving icon candidate ${candidate}:`, e);
    }
  }

  console.warn('[Tray] Notice: Using fallback procedural tray icon.');
  return createProceduralTrayIcon();
}

export interface TrayCallbacks {
  getMainWindow: () => BrowserWindow | null;
  openSettingsWindow: () => void;
  onQuit: () => void;
}

export function initTray(rootDir: string, callbacks: TrayCallbacks): Tray {
  if (trayInstance && !trayInstance.isDestroyed()) {
    return trayInstance;
  }

  const icon = getTrayIcon(rootDir);
  trayInstance = new Tray(icon);
  trayInstance.setToolTip('Cristi AI Companion');

  const updateMenu = () => {
    const mainWin = callbacks.getMainWindow();
    const isVisible = mainWin && !mainWin.isDestroyed() && mainWin.isVisible();
    const contextMenu = Menu.buildFromTemplate([
      {
        label: isVisible ? 'Ocultar' : 'Mostrar',
        click: () => {
          const win = callbacks.getMainWindow();
          if (win && !win.isDestroyed()) {
            if (win.isVisible()) {
              win.hide();
            } else {
              win.show();
              win.focus();
            }
          }
          updateMenu();
        },
      },
      {
        label: 'Modo Zen',
        click: () => {
          const win = callbacks.getMainWindow();
          if (win?.webContents && !win.isDestroyed()) {
            win.webContents.send('shortcut-toggle-zen-mode');
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Ajustes',
        click: () => {
          callbacks.openSettingsWindow();
        },
      },
      {
        label: 'Reiniciar',
        click: () => {
          app.relaunch();
          app.exit(0);
        },
      },
      { type: 'separator' },
      {
        label: 'Cerrar',
        click: () => {
          callbacks.onQuit();
        },
      },
    ]);

    if (trayInstance && !trayInstance.isDestroyed()) {
      trayInstance.setContextMenu(contextMenu);
    }
  };

  updateMenu();

  const handleShowFocus = () => {
    const win = callbacks.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
      updateMenu();
    }
  };

  trayInstance.on('click', handleShowFocus);
  trayInstance.on('double-click', handleShowFocus);

  return trayInstance;
}

export function destroyTray(): void {
  if (trayInstance && !trayInstance.isDestroyed()) {
    try {
      trayInstance.destroy();
    } catch (_) {}
    trayInstance = null;
  }
}
