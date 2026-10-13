import { handleTrusted, onTrusted } from '../security/CapabilityRouter';
import { BrowserWindow, screen, app, desktopCapturer } from 'electron';
import { windowManager } from '../windows/windowManager';
import { processManager } from '../core/processManager';
import { DisplayInfo, InteractiveHitbox, ProcessMemoryResult, ProcessMetricInfo } from '../types/electron.types';

// Custom properties on BrowserWindow instances for deduplication
interface ExtendedBrowserWindow extends BrowserWindow {
  _lastIgnore?: boolean;
  _lastForward?: boolean;
  _manualIgnoreOverride?: boolean;
}

let activeHitboxes: InteractiveHitbox[] = [];
let hitboxIntervalId: NodeJS.Timeout | null = null;
let capturableWindowsCache: {
  timestamp: number;
  data: Array<{ id: string; name: string; thumbnail?: string }>;
} | null = null;

function startHitboxTracking(): void {
  if (hitboxIntervalId !== null) return;

  hitboxIntervalId = setInterval(() => {
    const mainWin = windowManager.getMainWindow() as ExtendedBrowserWindow | null;
    if (!mainWin || mainWin.isDestroyed() || !mainWin.isVisible() || mainWin.isMinimized()) {
      return;
    }

    // If renderer explicitly requested interaction lock (manual override)
    if (mainWin._manualIgnoreOverride === false) {
      if (mainWin._lastIgnore !== false) {
        mainWin._lastIgnore = false;
        mainWin.setIgnoreMouseEvents(false);
      }
      return;
    }

    if (activeHitboxes.length === 0) {
      if (mainWin._lastIgnore !== true) {
        mainWin._lastIgnore = true;
        mainWin.setIgnoreMouseEvents(true);
      }
      return;
    }

    const cursorPoint = screen.getCursorScreenPoint();
    let winBounds: { x: number; y: number; width: number; height: number };
    try {
      winBounds = mainWin.getBounds();
    } catch (_) {
      return;
    }

    const localX = cursorPoint.x - winBounds.x;
    const localY = cursorPoint.y - winBounds.y;

    const isHovering = activeHitboxes.some((box) => {
      return (
        localX >= box.x &&
        localX <= box.x + box.width &&
        localY >= box.y &&
        localY <= box.y + box.height
      );
    });

    const shouldIgnore = !isHovering;
    if (mainWin._lastIgnore !== shouldIgnore) {
      mainWin._lastIgnore = shouldIgnore;
      // Strictly without forward: true to permanently eliminate Windows WH_MOUSE_LL hook
      mainWin.setIgnoreMouseEvents(shouldIgnore);
    }
  }, 30);
}

/**
 * Registers window management and display IPC handlers.
 */
export function registerWindowIpc(): void {
  // Start background hitbox collision detection loop
  startHitboxTracking();

  // ── Click-Through Toggle (Native Event-Driven) ────────────────────────────
  onTrusted('set-ignore-mouse-events', (event, ignore: unknown) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) as ExtendedBrowserWindow | null;
      if (!win || win.isDestroyed()) return;

      const ignoreBool = Boolean(ignore);
      win._manualIgnoreOverride = ignoreBool ? undefined : false;

      if (win._lastIgnore === ignoreBool) {
        return; // Deduplicate call in main process
      }

      win._lastIgnore = ignoreBool;
      // Strictly without forward: true to permanently eliminate Windows WH_MOUSE_LL hook
      win.setIgnoreMouseEvents(ignoreBool);
    } catch (err) {
      console.error('[WindowIpc] Error setting ignore mouse events:', err);
    }
  });

  // ── Hitbox Synchronization (Zero-Lag Non-Hook Collision Testing) ───────────
  onTrusted('sync-interactive-hitboxes', (_event, hitboxes: unknown) => {
    if (Array.isArray(hitboxes)) {
      activeHitboxes = hitboxes.filter((b): b is InteractiveHitbox => (
        b &&
        typeof b === 'object' &&
        typeof (b as any).x === 'number' &&
        typeof (b as any).y === 'number' &&
        typeof (b as any).width === 'number' &&
        typeof (b as any).height === 'number' &&
        (b as any).width > 0 &&
        (b as any).height > 0
      ));
      startHitboxTracking();
    } else {
      activeHitboxes = [];
    }
  });

  // ── Capturable Windows Source Discovery (Cached to prevent DWM freezes) ────
  handleTrusted('get-capturable-windows', async () => {
    const now = Date.now();
    if (capturableWindowsCache && now - capturableWindowsCache.timestamp < 15000) {
      return capturableWindowsCache.data;
    }

    try {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        fetchWindowIcons: true,
        thumbnailSize: { width: 48, height: 48 }
      });

      const result = sources
        .filter((s) => s.name.trim().length > 0 && !s.name.includes('Cristi AI'))
        .map((s) => ({
          id: s.id,
          name: s.name,
          thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : undefined
        }));

      capturableWindowsCache = { timestamp: now, data: result };
      return result;
    } catch (err) {
      console.error('[WindowIpc] Error fetching capturable windows:', err);
      return capturableWindowsCache?.data || [];
    }
  });

  // ── Always-On-Top ─────────────────────────────────────────────────────────
  onTrusted('set-always-on-top', (event, value: unknown) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      if (value) {
        win.setAlwaysOnTop(true, 'screen-saver', 1);
      } else {
        win.setAlwaysOnTop(false);
      }
    } catch (err) {
      console.error('[WindowIpc] Error setting always-on-top:', err);
    }
  });

  handleTrusted('get-always-on-top', (event): boolean => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      return win && !win.isDestroyed() ? win.isAlwaysOnTop() : false;
    } catch (_) {
      return false;
    }
  });

  // ── Window Controls ───────────────────────────────────────────────────────
  onTrusted('focus-window', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.focus();
      }
    } catch (err) {
      console.error('[WindowIpc] Error focusing window:', err);
    }
  });

  onTrusted('minimize-window', () => {
    try {
      const mainWin = windowManager.getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.minimize();
      }
    } catch (err) {
      console.error('[WindowIpc] Error minimizing window:', err);
    }
  });

  onTrusted('show-window', () => {
    try {
      const mainWin = windowManager.getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.show();
        mainWin.focus();
      }
    } catch (err) {
      console.error('[WindowIpc] Error showing window:', err);
    }
  });

  onTrusted('hide-window', () => {
    try {
      const mainWin = windowManager.getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.hide();
      }
    } catch (err) {
      console.error('[WindowIpc] Error hiding window:', err);
    }
  });

  onTrusted('quit-app', async () => {
    await processManager.cleanupAll();
    app.quit();
  });

  handleTrusted('relaunch-app', async () => {
    try {
      await processManager.cleanupAll();
      app.relaunch();
      app.exit(0);
      return { success: true };
    } catch (err) {
      console.error('[WindowIpc] Error relaunching app:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  handleTrusted('reload-window', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) || windowManager.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.reload();
        return { success: true };
      }
      return { success: false, error: 'Window not found' };
    } catch (err) {
      console.error('[WindowIpc] Error reloading window:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  // ── Display Info ──────────────────────────────────────────────────────────
  handleTrusted('get-display-info', (): DisplayInfo => {
    try {
      const primary = screen.getPrimaryDisplay();
      if (!primary || !primary.bounds) {
        return {
          id: 1,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          width: 1920,
          height: 1080,
          scaleFactor: 1,
          workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        };
      }
      return {
        id: primary.id,
        bounds: primary.bounds,
        width: primary.bounds.width,
        height: primary.bounds.height,
        scaleFactor: primary.scaleFactor || 1,
        workArea: primary.workArea || primary.bounds,
        label: primary.label,
      };
    } catch (err) {
      console.error('[WindowIpc] Error getting display info:', err);
      return {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        width: 1920,
        height: 1080,
        scaleFactor: 1,
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      };
    }
  });

  // ── Process & GPU Telemetry ───────────────────────────────────────────────
  handleTrusted('get-process-memory-info', async (): Promise<ProcessMemoryResult> => {
    try {
      const metrics = (app.getAppMetrics && typeof app.getAppMetrics === 'function') ? app.getAppMetrics() : [];
      let totalWorkingSetKB = 0;
      let totalPeakWorkingSetKB = 0;
      let totalPrivateKB = 0;
      let totalSharedKB = 0;
      const processBreakdown = {
        browser: 0,
        renderer: 0,
        gpu: 0,
        utility: 0,
      };

      const processList: ProcessMetricInfo[] = [];

      if (Array.isArray(metrics)) {
        metrics.forEach((m) => {
          if (!m) return;
          const mem = m.memory as any;
          const ws = mem?.workingSetSize || 0;
          const peak = mem?.peakWorkingSetSize || 0;
          const priv = mem?.privateBytes || 0;
          const shared = mem?.sharedBytes || 0;
          totalWorkingSetKB += ws;
          totalPeakWorkingSetKB += peak;
          totalPrivateKB += priv;
          totalSharedKB += shared;

          if (m.type === 'Browser') processBreakdown.browser += Math.round(ws / 1024);
          else if (m.type === 'Tab') processBreakdown.renderer += Math.round(ws / 1024);
          else if (m.type === 'GPU') processBreakdown.gpu += Math.round(ws / 1024);
          else processBreakdown.utility += Math.round(ws / 1024);

          processList.push({
            pid: m.pid,
            type: m.type,
            workingSetMB: parseFloat((ws / 1024).toFixed(1)),
            privateMB: parseFloat((priv / 1024).toFixed(1)),
            sharedMB: parseFloat((shared / 1024).toFixed(1)),
            cpuPercent: m.cpu?.percentCPUUsage || 0,
          });
        });
      }

      let processMem: { residentSet: number } | null = null;
      if (process.getProcessMemoryInfo && typeof process.getProcessMemoryInfo === 'function') {
        try {
          processMem = await process.getProcessMemoryInfo();
        } catch (_) {}
      }

      return {
        success: true,
        residentSet: totalWorkingSetKB,
        peakWorkingSet: totalPeakWorkingSetKB,
        private: totalPrivateKB,
        processBreakdown,
        mainProcessResidentSet: processMem?.residentSet || 0,
        totalWorkingSetMB: parseFloat((totalWorkingSetKB / 1024).toFixed(1)),
        totalPrivateMB: parseFloat((totalPrivateKB / 1024).toFixed(1)),
        totalSharedMB: parseFloat((totalSharedKB / 1024).toFixed(1)),
        processCount: metrics.length,
        processes: processList,
      };
    } catch (err) {
      console.error('[WindowIpc] Error in get-process-memory-info:', err);
      return {
        success: false,
        residentSet: 0,
        peakWorkingSet: 0,
        private: 0,
        processBreakdown: { browser: 0, renderer: 0, gpu: 0, utility: 0 },
        mainProcessResidentSet: 0,
        totalWorkingSetMB: 0,
        totalPrivateMB: 0,
        totalSharedMB: 0,
        processCount: 0,
        processes: [],
      };
    }
  });

  handleTrusted('get-gpu-feature-status', () => {
    try {
      return (app.getGPUFeatureStatus && typeof app.getGPUFeatureStatus === 'function')
        ? app.getGPUFeatureStatus()
        : {};
    } catch (_) {
      return {};
    }
  });

  handleTrusted('get-gpu-info', async () => {
    try {
      let gpuInfo: unknown = {};
      let gpuFeatureStatus: unknown = {};

      try {
        if (app.getGPUInfo && typeof app.getGPUInfo === 'function') {
          gpuInfo = await app.getGPUInfo('basic');
        }
      } catch (_) {}

      try {
        if (app.getGPUFeatureStatus && typeof app.getGPUFeatureStatus === 'function') {
          gpuFeatureStatus = app.getGPUFeatureStatus();
        }
      } catch (_) {}

      return {
        gpuInfo: gpuInfo || {},
        gpuFeatureStatus: gpuFeatureStatus || {},
      };
    } catch (err) {
      console.error('[WindowIpc] Error in get-gpu-info:', err);
      return { gpuInfo: {}, gpuFeatureStatus: {} };
    }
  });

  handleTrusted('get-app-version', () => {
    return app.getVersion();
  });

  // ── Subwindow Management Handlers ─────────────────────────────────────────
  handleTrusted('open-settings-window', () => {
    windowManager.createSettingsWindow();
    return { success: true };
  });

  handleTrusted('close-settings-window', () => {
    windowManager.closeSettingsWindow();
    return { success: true };
  });

  handleTrusted('open-camera-window', () => {
    windowManager.createCameraWindow();
    return { success: true };
  });

  handleTrusted('close-camera-window', () => {
    windowManager.closeCameraWindow();
    return { success: true };
  });

  handleTrusted('is-camera-window-open', () => {
    return windowManager.isCameraWindowOpen();
  });

  handleTrusted('open-telemetry-window', () => {
    windowManager.createTelemetryWindow();
    return { success: true };
  });

  handleTrusted('close-telemetry-window', () => {
    windowManager.closeTelemetryWindow();
    return { success: true };
  });
}
