import { create } from 'zustand';
import { CompanionViewMode, Position2D } from '@/types';
import { soundFxService } from '../domain/audio/SoundFxService.js';
import { sceneManager } from '../domain/scenes/SceneManager.js';
import { electronBridge } from '../services/desktop/ElectronBridge.js';

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  bounds?: DOMRect | null;
}

export interface CompanionState {
  // --- Core Estado Requerido ---
  scale: number;
  position: Position2D;
  currentGesture: string;
  isDragging: boolean;
  viewMode: CompanionViewMode;
  alwaysOnTop: boolean;

  // --- Extended Desktop UI State ---
  isZenMode: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  thoughtText: string | null;
  isOsOperating: boolean;
  osOperationDetails: string | null;
  isClickThroughEnabled: boolean;
  isUiVisible: boolean;
  isSolidBackdrop: boolean;
  isAlwaysOnTop: boolean;
  activeDecision: unknown;
  activeToolName: string | null;
  contextMenu: ContextMenuState;

  // --- Core Acciones Requeridas ---
  setScale: (scale: number) => void;
  setPosition: (position: Position2D | ((prev: Position2D) => Position2D)) => void;
  setCurrentGesture: (currentGesture: string) => void;
  triggerRandomGesture: () => void;
  setIsDragging: (isDragging: boolean) => void;
  setViewMode: (viewMode: CompanionViewMode) => void;
  setAlwaysOnTop: (alwaysOnTop: boolean) => void;
  resetPosition: () => void;
  toggleViewMode: () => void;

  // --- Extended Actions ---
  toggleAlwaysOnTop: () => void;
  toggleBackdrop: () => void;
  toggleZenMode: () => void;
  setIsZenMode: (isZenMode: boolean) => void;
  setIsSpeaking: (isSpeaking: boolean) => void;
  setIsListening: (isListening: boolean) => void;
  setIsThinking: (isThinking: boolean) => void;
  setThoughtText: (thoughtText: string | null) => void;
  appendThoughtText: (chunk: string) => void;
  setIsOsOperating: (isOsOperating: boolean, details?: string | null) => void;
  setIsClickThroughEnabled: (isClickThroughEnabled: boolean) => void;
  toggleClickThrough: () => void;
  setIsUiVisible: (isUiVisible: boolean) => void;
  setIsSolidBackdrop: (isSolidBackdrop: boolean) => void;
  setActiveDecision: (activeDecision: unknown) => void;
  setActiveToolName: (activeToolName: string | null) => void;
  openContextMenu: (x: number, y: number, bounds?: DOMRect | null) => void;
  closeContextMenu: () => void;
}

const DEFAULT_POSITION: Position2D = { x: 0, y: 0 };
const VIEW_MODES: CompanionViewMode[] = ['transparent', 'windowed', 'pip'];

export const useCompanionStore = create<CompanionState>()((set, get) => ({
  // Core initial state
  scale: 1.0,
  position: DEFAULT_POSITION,
  currentGesture: 'idle',
  isDragging: false,
  viewMode: 'transparent',
  alwaysOnTop: true,

  // Extended initial state
  isZenMode: false,
  isSpeaking: false,
  isListening: false,
  isThinking: false,
  thoughtText: null,
  isOsOperating: false,
  osOperationDetails: null,
  isClickThroughEnabled: true,
  isUiVisible: true,
  isSolidBackdrop: sceneManager.getScene().isSceneVisible,
  isAlwaysOnTop: true,
  activeDecision: null,
  activeToolName: null,
  contextMenu: { isOpen: false, x: 0, y: 0, bounds: null },

  // Core Actions
  setScale: (scale) => set({ scale }),
  setPosition: (position) =>
    set((state) => ({
      position: typeof position === 'function' ? position(state.position) : position,
    })),
  setCurrentGesture: (currentGesture) => set({ currentGesture }),
  triggerRandomGesture: () => {
    const gestures = ['happy', 'blush', 'wink', 'dance', 'yandere', 'mad', 'surprised'];
    const random = gestures[Math.floor(Math.random() * gestures.length)];
    set({ currentGesture: random });
    setTimeout(() => {
      set((s) => (s.currentGesture === random ? { currentGesture: 'idle' } : {}));
    }, 4500);
  },
  setIsDragging: (isDragging) => set({ isDragging }),
  setViewMode: (viewMode) => set({ viewMode }),
  setAlwaysOnTop: (alwaysOnTop) => {
    electronBridge.setAlwaysOnTop(alwaysOnTop);
    set({ alwaysOnTop, isAlwaysOnTop: alwaysOnTop });
  },
  resetPosition: () => set({ position: { ...DEFAULT_POSITION } }),
  toggleViewMode: () =>
    set((state) => {
      const currentIndex = VIEW_MODES.indexOf(state.viewMode);
      const nextIndex = (currentIndex + 1) % VIEW_MODES.length;
      return { viewMode: VIEW_MODES[nextIndex] };
    }),

  // Extended Actions
  toggleAlwaysOnTop: () => {
    const nextValue = !get().isAlwaysOnTop;
    electronBridge.setAlwaysOnTop(nextValue);
    set({ alwaysOnTop: nextValue, isAlwaysOnTop: nextValue });
  },
  toggleBackdrop: () => {
    try { soundFxService.playClick(); } catch (_) {}
    const visible = sceneManager.toggleBackdrop();
    set({ isSolidBackdrop: visible });
  },
  toggleZenMode: () => set((state) => ({ isZenMode: !state.isZenMode })),
  setIsZenMode: (isZenMode) => set({ isZenMode }),
  setIsSpeaking: (isSpeaking) => set({ isSpeaking }),
  setIsListening: (isListening) => set({ isListening }),
  setIsThinking: (isThinking) => set((s) => ({ isThinking, thoughtText: isThinking ? s.thoughtText : null })),
  setThoughtText: (thoughtText) => set({ thoughtText }),
  appendThoughtText: (chunk) => set((s) => ({
    thoughtText: s.thoughtText ? `${s.thoughtText} ${chunk}`.slice(-400) : chunk.slice(-400)
  })),
  setIsOsOperating: (isOsOperating, details = null) => set({ isOsOperating, osOperationDetails: details }),
  setIsClickThroughEnabled: (isClickThroughEnabled) => set({ isClickThroughEnabled }),
  toggleClickThrough: () => set((state) => ({ isClickThroughEnabled: !state.isClickThroughEnabled })),
  setIsUiVisible: (isUiVisible) => set({ isUiVisible }),
  setIsSolidBackdrop: (isSolidBackdrop) => set({ isSolidBackdrop }),
  setActiveDecision: (activeDecision) => set({ activeDecision }),
  setActiveToolName: (activeToolName) => {
    const isOs = Boolean(activeToolName && /terminal|powershell|cmd|file|disk|write|read|system/i.test(activeToolName));
    set({
      activeToolName,
      isOsOperating: isOs,
      osOperationDetails: isOs ? `Operación en C:\\ (${activeToolName})` : null
    });
  },
  openContextMenu: (x, y, bounds = null) => set({ contextMenu: { isOpen: true, x, y, bounds } }),
  closeContextMenu: () => set({ contextMenu: { isOpen: false, x: 0, y: 0, bounds: null } }),
}));
