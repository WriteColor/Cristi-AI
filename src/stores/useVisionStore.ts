import { create } from 'zustand';
import { ScreenRegion, VisionDetection } from '@/types';
import { visionStreamService, type VisionCaptureMode } from '../domain/vision/VisionStreamService.js';
import { electronBridge } from '../services/desktop/ElectronBridge.js';

export type { ScreenRegion, VisionDetection, VisionCaptureMode };

export interface WindowSourceItem {
  id: string;
  hwnd?: number;
  title: string;
  process?: string;
  thumbnail?: string;
}

export interface DisplaySourceItem {
  id: string;
  label: string;
  primary?: boolean;
}

export interface VisionState {
  // --- Core Estado Requerido ---
  isScreenWatching: boolean;
  watchIntervalMs: number;
  screenRegion: ScreenRegion | null;
  isPickerActive: boolean;
  latestDetections: VisionDetection[];

  // --- Extended State ---
  isScreenWatchActive: boolean;
  isRegionPickerOpen: boolean;
  isCameraActive: boolean;

  // --- Tactical 4-Mode Vision Pipeline State ---
  captureMode: VisionCaptureMode;
  targetDisplayId: 'primary' | 'secondary' | string;
  targetWindowId: string | null;
  targetWindowTitle: string | null;
  availableWindows: WindowSourceItem[];
  availableDisplays: DisplaySourceItem[];
  fps: number;

  // --- Core Acciones Requeridas ---
  setIsScreenWatching: (isScreenWatching: boolean) => void;
  toggleScreenWatching: () => void;
  setWatchIntervalMs: (watchIntervalMs: number) => void;
  setScreenRegion: (screenRegion: ScreenRegion | null) => void;
  clearScreenRegion: () => void;
  setPickerActive: (isPickerActive: boolean) => void;
  togglePickerActive: () => void;
  setDetections: (latestDetections: VisionDetection[]) => void;
  setLatestDetections: (latestDetections: VisionDetection[]) => void;
  clearDetections: () => void;

  // --- Extended / Convenience Actions ---
  setIsScreenWatchActive: (isActive: boolean) => void;
  setIsCameraActive: (isActive: boolean) => void;
  openRegionPicker: () => void;
  closeRegionPicker: () => void;

  // --- 4-Mode Tactical Actions ---
  setCaptureMode: (mode: VisionCaptureMode) => void;
  setTargetDisplayId: (displayId: 'primary' | 'secondary' | string) => void;
  setTargetWindow: (windowId: string | null, title?: string | null) => void;
  refreshSources: () => Promise<void>;
  startVisionPipeline: (options?: { mode?: VisionCaptureMode; displayId?: string; windowId?: string; windowTitle?: string; region?: ScreenRegion | null }) => Promise<boolean>;
  stopVisionPipeline: () => void;
}

export const useVisionStore = create<VisionState>()((set, get) => ({
  // Core initial state
  isScreenWatching: false,
  watchIntervalMs: 2000,
  screenRegion: null,
  isPickerActive: false,
  latestDetections: [],

  // Extended initial state
  isScreenWatchActive: false,
  isRegionPickerOpen: false,
  isCameraActive: false,

  // Tactical 4-Mode Vision Initial State
  captureMode: 'fullscreen',
  targetDisplayId: 'primary',
  targetWindowId: null,
  targetWindowTitle: null,
  availableWindows: [],
  availableDisplays: [
    { id: 'primary', label: 'Pantalla 1 (Principal)', primary: true },
    { id: 'secondary', label: 'Pantalla 2 (Secundaria)', primary: false },
  ],
  fps: 0.5,

  // Core Actions
  setIsScreenWatching: (isScreenWatching) =>
    set({ isScreenWatching, isScreenWatchActive: isScreenWatching }),
  toggleScreenWatching: () =>
    set((state) => {
      const next = !state.isScreenWatching;
      if (next) {
        void get().startVisionPipeline({ mode: state.captureMode });
      } else {
        get().stopVisionPipeline();
      }
      return { isScreenWatching: next, isScreenWatchActive: next };
    }),
  setWatchIntervalMs: (watchIntervalMs) => set({ watchIntervalMs: Math.max(250, watchIntervalMs) }),
  setScreenRegion: (screenRegion) => {
    set({ screenRegion, captureMode: screenRegion ? 'region' : 'fullscreen' });
    if (get().isScreenWatchActive) {
      void get().startVisionPipeline({ mode: 'region', region: screenRegion });
    }
  },
  clearScreenRegion: () => set({
    screenRegion: null,
    isPickerActive: false,
    isRegionPickerOpen: false,
    captureMode: 'fullscreen',
  }),
  setPickerActive: (isPickerActive) =>
    set({ isPickerActive, isRegionPickerOpen: isPickerActive }),
  togglePickerActive: () =>
    set((state) => {
      const next = !state.isPickerActive;
      return { isPickerActive: next, isRegionPickerOpen: next };
    }),
  setDetections: (latestDetections) => set({ latestDetections }),
  setLatestDetections: (latestDetections) => set({ latestDetections }),
  clearDetections: () => set({ latestDetections: [] }),

  // Extended Actions
  setIsScreenWatchActive: (isActive) =>
    set({ isScreenWatching: isActive, isScreenWatchActive: isActive }),
  setIsCameraActive: (isCameraActive) => {
    set({ isCameraActive, captureMode: isCameraActive ? 'camera' : get().captureMode });
    if (isCameraActive) {
      void visionStreamService.startCameraMonitoring({ fps: 0.5 });
    } else {
      visionStreamService.stopCameraMonitoring();
    }
  },
  openRegionPicker: () => set({ isPickerActive: true, isRegionPickerOpen: true }),
  closeRegionPicker: () => set({ isPickerActive: false, isRegionPickerOpen: false }),

  // 4-Mode Tactical Actions
  setCaptureMode: (mode) => {
    set({ captureMode: mode });
    if (get().isScreenWatchActive) {
      void get().startVisionPipeline({ mode });
    }
  },

  setTargetDisplayId: (displayId) => {
    set({ targetDisplayId: displayId });
    if (get().isScreenWatchActive && get().captureMode === 'fullscreen') {
      void get().startVisionPipeline({ mode: 'fullscreen', displayId });
    }
  },

  setTargetWindow: (windowId, title = null) => {
    set({
      targetWindowId: windowId,
      targetWindowTitle: title,
      captureMode: windowId ? 'window' : get().captureMode
    });
    if (get().isScreenWatchActive && windowId) {
      void get().startVisionPipeline({ mode: 'window', windowId, windowTitle: title || undefined });
    }
  },

  refreshSources: async () => {
    try {
      if (electronBridge?.isElectron) {
        // Consultar fuentes capturables nativas vía desktopCapturer (con miniaturas e IDs exactos)
        const capturable = await electronBridge.listCapturableWindows();
        if (Array.isArray(capturable) && capturable.length > 0) {
          const formatted: WindowSourceItem[] = capturable
            .filter((w) => w.name && w.name.trim().length > 0 && !w.name.includes('Cristi AI'))
            .map((w) => ({
              id: w.id,
              title: w.name.trim(),
              thumbnail: w.thumbnail
            }));
          set({ availableWindows: formatted });
          return;
        }

        // Fallback: listWindows si desktopCapturer no entregó ventanas
        const windows = await electronBridge.listWindows?.();
        if (Array.isArray(windows)) {
          const formatted: WindowSourceItem[] = windows
            .filter((w) => w.title && w.title.trim().length > 0 && !w.isMinimized && !w.title.includes('Cristi AI'))
            .map((w) => ({
              id: String(w.hwnd || w.pid),
              hwnd: w.hwnd,
              title: w.title.trim(),
              process: w.process
            }));
          set({ availableWindows: formatted });
        }
      }
    } catch (err) {
      console.warn('[useVisionStore] Error refreshing sources:', err);
    }
  },

  startVisionPipeline: async (opts = {}) => {
    const state = get();
    const mode = opts.mode || state.captureMode;
    const displayId = opts.displayId || state.targetDisplayId;
    const windowId = opts.windowId || state.targetWindowId;
    const windowTitle = opts.windowTitle || state.targetWindowTitle;
    const region = opts.region !== undefined ? opts.region : state.screenRegion;

    if (mode === 'camera') {
      const ok = await visionStreamService.startCameraMonitoring({ fps: 0.5 });
      set({ isCameraActive: ok, captureMode: 'camera' });
      return ok;
    }

    const ok = await visionStreamService.startVisionMonitoring({
      mode,
      displayId,
      region,
      windowId: windowId || undefined,
      targetWindow: windowTitle || undefined,
      fps: 0.5
    });

    if (ok) {
      set({
        isScreenWatching: true,
        isScreenWatchActive: true,
        captureMode: mode,
        targetDisplayId: displayId,
        targetWindowId: windowId,
        targetWindowTitle: windowTitle,
        screenRegion: region
      });
    }
    return ok;
  },

  stopVisionPipeline: () => {
    visionStreamService.stopVisionMonitoring();
    set({
      isScreenWatching: false,
      isScreenWatchActive: false,
      isCameraActive: false
    });
  }
}));
