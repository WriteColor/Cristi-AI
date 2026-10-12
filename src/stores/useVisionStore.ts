import { create } from 'zustand';
import { ScreenRegion, VisionDetection } from '@/types';

export type { ScreenRegion, VisionDetection };

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
}

export const useVisionStore = create<VisionState>()((set) => ({
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

  // Core Actions
  setIsScreenWatching: (isScreenWatching) =>
    set({ isScreenWatching, isScreenWatchActive: isScreenWatching }),
  toggleScreenWatching: () =>
    set((state) => {
      const next = !state.isScreenWatching;
      return { isScreenWatching: next, isScreenWatchActive: next };
    }),
  setWatchIntervalMs: (watchIntervalMs) => set({ watchIntervalMs: Math.max(250, watchIntervalMs) }),
  setScreenRegion: (screenRegion) => set({ screenRegion }),
  clearScreenRegion: () => set({
    screenRegion: null,
    isPickerActive: false,
    isRegionPickerOpen: false,
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
  setIsCameraActive: (isCameraActive) => set({ isCameraActive }),
  openRegionPicker: () => set({ isPickerActive: true, isRegionPickerOpen: true }),
  closeRegionPicker: () => set({ isPickerActive: false, isRegionPickerOpen: false }),
}));
