import { createSecureWebPreferences, secureWindow } from '../security/WindowPolicy';
import { BrowserWindow, screen, app, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { unregisterGlobalShortcuts, registerGlobalShortcuts } from '../core/shortcuts';
import { getAppRootDir } from '../core/paths';

export class WindowManager {
  private static instance: WindowManager;
  private mainWindow: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;
  private cameraWindow: BrowserWindow | null = null;
  private telemetryWindow: BrowserWindow | null = null;
  private rootDir: string;
  private isDev: boolean;
  private rendererUrl = 'http://localhost:5173';

  private constructor(rootDir?: string) {
    this.rootDir = rootDir || getAppRootDir();
    this.isDev = !app.isPackaged;
  }

  public setRootDir(dir: string): void {
    this.rootDir = dir;
  }

  public static getInstance(rootDir?: string): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager(rootDir);
    } else if (rootDir) {
      WindowManager.instance.setRootDir(rootDir);
    }
    return WindowManager.instance;
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  public getSettingsWindow(): BrowserWindow | null {
    return this.settingsWindow;
  }

  public getCameraWindow(): BrowserWindow | null {
    return this.cameraWindow;
  }

  public getTelemetryWindow(): BrowserWindow | null { return this.telemetryWindow; }

  public isSettingsActive(): boolean {
    return !!(this.settingsWindow && !this.settingsWindow.isDestroyed() && this.settingsWindow.isVisible());
  }

  public isCameraWindowOpen(): boolean {
    return !!(this.cameraWindow && !this.cameraWindow.isDestroyed() && this.cameraWindow.isVisible());
  }

  /**
   * Resolves the application icon across development and packaged paths.
   */
  public getAppIcon(): string {
    const appPath = app.isPackaged ? app.getAppPath() : this.rootDir;
    const candidates = [
      path.join(this.rootDir, 'public/icon.png'),
      path.join(this.rootDir, 'public/favicon.ico'),
      path.join(this.rootDir, 'dist/icon.png'),
      path.join(this.rootDir, 'dist/favicon.ico'),
      path.join(appPath, 'public/icon.png'),
      path.join(appPath, 'public/favicon.ico'),
      path.join(process.resourcesPath, 'icon.png'),
      path.join(process.resourcesPath, 'public/icon.png'),
      path.join(process.resourcesPath, 'favicon.ico'),
      path.join(__dirname, '../../public/icon.png'),
      path.join(__dirname, '../public/icon.png'),
    ];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          const img = nativeImage.createFromPath(candidate);
          if (!img.isEmpty()) return candidate;
        }
      } catch (_) {}
    }
    return '';
  }

  /**
   * Resolves the preload script path.
   */
  public getPreloadPath(kind = 'main'): string {
    return path.join(app.isPackaged ? app.getAppPath() : this.rootDir, 'electron/dist', kind + '.preload.cjs');
  }

  /**
   * Creates the primary transparent, frameless, click-through companion window.
   */
  public createMainWindow(): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isMinimized()) this.mainWindow.restore();
      this.mainWindow.show();
      this.mainWindow.focus();
      return this.mainWindow;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const bounds = primaryDisplay ? primaryDisplay.bounds : { x: 0, y: 0, width: 1920, height: 1080 };

    this.mainWindow = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: Math.max(1, bounds.height - 1), // 1px offset prevents Windows DWM DirectFlip hijacking
      transparent: true,
      frame: false,
      hasShadow: false,
      // The transparent companion overlay is the only primary surface that
      // remains above desktop applications.
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      resizable: false,
      movable: false,
      fullscreen: false,
      icon: this.getAppIcon() || undefined,
      webPreferences: { ...createSecureWebPreferences(this.getPreloadPath('main')) },
    });
    secureWindow(this.mainWindow, 'main', this.isDev ? this.rendererUrl + '' : 'app://cristi/index.html');

    // Windows 11 Virtual Desktop & Workspaces Continuity
    try {
      this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch (_) {}

    // Start in click-through mode without global OS mouse hook (WH_MOUSE_LL)
    this.mainWindow.setIgnoreMouseEvents(true);

    // 'screen-saver', 1 keeps window persistently above all desktop windows with highest OS priority
    this.mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);

    if (this.isDev) {
      let devConnected = false;
      const loadDevWithRetry = (retries = 30) => {
        if (!this.mainWindow || this.mainWindow.isDestroyed() || devConnected) return;
        this.mainWindow.loadURL(this.rendererUrl).then(() => {
          devConnected = true;
        }).catch((err) => {
          if (retries > 0) {
            setTimeout(() => loadDevWithRetry(retries - 1), 300);
          } else {
            console.error('[WindowManager] No se pudo conectar al servidor de desarrollo Vite (http://localhost:5173):', err);
          }
        });
      };

      this.mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        if (!devConnected && validatedURL.includes('5173')) {
          console.warn(`[WindowManager] Vite aún no está listo (${errorCode}: ${errorDescription}), reintentando...`);
          setTimeout(() => {
            if (this.mainWindow && !this.mainWindow.isDestroyed() && !devConnected) {
              this.mainWindow.loadURL(this.rendererUrl).catch(() => {});
            }
          }, 400);
        }
      });

      this.mainWindow.webContents.on('console-message', (event: any) => {
        const level = typeof event?.level === 'number' ? event.level : 0;
        const message = event?.message || '';
        const line = event?.lineNumber || 0;
        const sourceId = event?.sourceId || '';
        if (level >= 2) {
          const tag = level === 3 ? '[Renderer ERROR]' : '[Renderer WARN]';
          console.error(`\x1b[31m${tag}\x1b[0m ${message} (${sourceId}:${line})`);
        }
      });

      this.mainWindow.webContents.once('did-finish-load', () => {
        devConnected = true;
        console.log('[WindowManager] ✓ Conectado exitosamente al servidor Vite HMR (http://localhost:5173)');
      });

      loadDevWithRetry();
    } else {
      this.mainWindow.loadURL('app://cristi/index.html').catch(() => {
        console.error('[WindowManager] No se pudo cargar la página segura.');
      });
    }

    this.mainWindow.on('blur', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isAlwaysOnTop()) {
        this.mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      }
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    return this.mainWindow;
  }

  /**
   * Creates or activates the Settings & Control Panel window.
   */
  public createSettingsWindow(): BrowserWindow {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      unregisterGlobalShortcuts();
      this.mainWindow?.hide();
      this.closeCameraWindow();
      this.closeTelemetryWindow();
      if (this.settingsWindow.isMinimized()) this.settingsWindow.restore();
      if (!this.settingsWindow.isMaximized()) this.settingsWindow.maximize();
      this.settingsWindow.show();
      this.settingsWindow.focus();
      return this.settingsWindow;
    }

    // Unregister global shortcuts while settings window is open to prevent key capture conflicts
    unregisterGlobalShortcuts();
    // Settings is a normal, exclusive work surface. Hide the desktop overlay
    // and every auxiliary panel so neither click-through UI nor shortcuts can
    // bypass it while configuration is being edited.
    this.mainWindow?.webContents.send('settings-window-state', { isOpen: true });
    this.mainWindow?.hide();
    this.closeCameraWindow();
    this.closeTelemetryWindow();

    this.settingsWindow = new BrowserWindow({
      width: 1120,
      height: 760,
      minWidth: 900,
      minHeight: 650,
      center: true,
      frame: true,
      transparent: false,
      backgroundColor: '#090d16',
      autoHideMenuBar: true,
      show: false,
      title: 'Cristi AI Companion - Panel de Control & Configuración',
      icon: this.getAppIcon() || undefined,
      webPreferences: { ...createSecureWebPreferences(this.getPreloadPath('settings')) },
    });
    secureWindow(this.settingsWindow, 'settings', this.isDev ? this.rendererUrl + '/settings.html' : 'app://cristi/settings.html');

    this.settingsWindow.once('ready-to-show', () => {
      if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
        this.settingsWindow.maximize();
        this.settingsWindow.show();
        this.settingsWindow.focus();
      }
    });

    if (this.isDev) {
      const devUrl = `${this.rendererUrl}/settings.html`;
      const loadSettingsDev = (retries = 30) => {
        if (!this.settingsWindow || this.settingsWindow.isDestroyed()) return;
        this.settingsWindow.loadURL(devUrl).catch((err) => {
          if (retries > 0) {
            setTimeout(() => loadSettingsDev(retries - 1), 300);
          } else {
            console.error('[WindowManager] No se pudo conectar a settings en Vite (http://localhost:5173/settings.html):', err);
          }
        });
      };
      loadSettingsDev();
    } else {
      this.settingsWindow.loadURL('app://cristi/settings.html').catch(() => {
        console.error('[WindowManager] No se pudo cargar la página segura.');
      });
    }

    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;

      // Re-enable all global shortcuts
      registerGlobalShortcuts(() => this.getMainWindow(), () => this.isSettingsActive());

      // Restore companion overlay window
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        try {
          this.mainWindow.show();
          this.mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
          this.mainWindow.webContents.send('companion-resume');
          this.mainWindow.webContents.send('settings-window-state', { isOpen: false });
        } catch (_) {}
      }
    });

    return this.settingsWindow;
  }

  public closeSettingsWindow(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.close();
    }
  }

  /**
   * Creates or activates the dedicated WebRTC camera monitor window.
   */
  public createCameraWindow(): BrowserWindow {
    if (this.cameraWindow && !this.cameraWindow.isDestroyed()) {
      if (this.cameraWindow.isMinimized()) this.cameraWindow.restore();
      this.cameraWindow.show();
      this.cameraWindow.focus();
      return this.cameraWindow;
    }

    this.cameraWindow = new BrowserWindow({
      width: 680,
      height: 520,
      minWidth: 440,
      minHeight: 360,
      backgroundColor: '#09090b',
      title: 'Cristi AI • Monitor Óptico de Cámara',
      show: false,
      frame: true,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      icon: this.getAppIcon() || undefined,
      webPreferences: { ...createSecureWebPreferences(this.getPreloadPath('camera')) },
    });
    secureWindow(this.cameraWindow, 'camera', this.isDev ? this.rendererUrl + '/camera.html' : 'app://cristi/camera.html');

    this.cameraWindow.setAlwaysOnTop(true, 'pop-up-menu');

    this.cameraWindow.once('ready-to-show', () => {
      if (this.cameraWindow && !this.cameraWindow.isDestroyed()) {
        this.cameraWindow.show();
      }
    });

    if (this.isDev) {
      const devUrl = `${this.rendererUrl}/camera.html`;
      const loadCameraDev = (retries = 30) => {
        if (!this.cameraWindow || this.cameraWindow.isDestroyed()) return;
        this.cameraWindow.loadURL(devUrl).catch((err) => {
          if (retries > 0) {
            setTimeout(() => loadCameraDev(retries - 1), 300);
          } else {
            console.error('[WindowManager] No se pudo conectar a camera en Vite (http://localhost:5173/camera.html):', err);
          }
        });
      };
      loadCameraDev();
    } else {
      this.cameraWindow.loadURL('app://cristi/camera.html').catch(() => {
        console.error('[WindowManager] No se pudo cargar la página segura.');
      });
    }

    this.cameraWindow.on('closed', () => {
      this.cameraWindow = null;
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('camera-window-state', { isOpen: false });
      }
    });

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('camera-window-state', { isOpen: true });
    }

    return this.cameraWindow;
  }

  public closeCameraWindow(): void {
    if (this.cameraWindow && !this.cameraWindow.isDestroyed()) {
      this.cameraWindow.close();
    }
  }

  public createTelemetryWindow(): BrowserWindow {
    if (this.telemetryWindow && !this.telemetryWindow.isDestroyed()) {
      if (this.telemetryWindow.isMinimized()) this.telemetryWindow.restore();
      this.telemetryWindow.show(); this.telemetryWindow.focus(); return this.telemetryWindow;
    }
    this.telemetryWindow = new BrowserWindow({
      width: 760, height: 620, minWidth: 620, minHeight: 480, show: false,
      title: 'Cristi AI • Telemetría en tiempo real', backgroundColor: '#09090b',
      autoHideMenuBar: true, icon: this.getAppIcon() || undefined,
      webPreferences: { ...createSecureWebPreferences(this.getPreloadPath('telemetry')) },
    });
    secureWindow(this.telemetryWindow, 'telemetry', this.isDev ? this.rendererUrl + '/telemetry.html' : 'app://cristi/telemetry.html');
    this.telemetryWindow.once('ready-to-show', () => this.telemetryWindow?.show());
    const target = this.isDev ? `${this.rendererUrl}/telemetry.html` : 'app://cristi/telemetry.html';
    this.telemetryWindow.loadURL(target).catch(error => console.error('[WindowManager] No se pudo abrir telemetría:', error));
    this.telemetryWindow.on('closed', () => { this.telemetryWindow = null; });
    return this.telemetryWindow;
  }

  public closeTelemetryWindow(): void { this.telemetryWindow?.close(); }
}

export const windowManager = WindowManager.getInstance();
