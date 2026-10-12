import { create } from 'zustand';
import { toastService } from '../infrastructure/notifications/toastService.js';

export interface AudioState {
  // --- Core Estado Requerido ---
  isMicMuted: boolean;
  micVolume: number;
  speakerVolume: number;
  lipSyncValue: number;
  isSynthesizing: boolean;
  activeInputDevice: string;
  activeOutputDevice: string;

  // --- Extended State ---
  isMuted: boolean; // Alias to isMicMuted
  availableAudioDevices: MediaDeviceInfo[];
  currentAudioDeviceId: string;
  soundFxEnabled: boolean;
  soundFxVolume: number;

  // --- Core Acciones Requeridas ---
  setMicMuted: (isMicMuted: boolean) => void;
  toggleMicMute: () => void;
  setMicVolume: (micVolume: number) => void;
  setSpeakerVolume: (speakerVolume: number) => void;
  setVolumes: (micVolume: number, speakerVolume: number) => void;
  setLipSyncValue: (lipSyncValue: number) => void;
  setIsSynthesizing: (isSynthesizing: boolean) => void;
  setActiveInputDevice: (activeInputDevice: string) => void;
  setActiveOutputDevice: (activeOutputDevice: string) => void;
  setDevices: (activeInputDevice: string, activeOutputDevice: string) => void;

  // --- Extended Actions ---
  setIsMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setAudioDevices: (devices: MediaDeviceInfo[]) => void;
  setAudioDeviceId: (id: string) => void;
  setSoundFxEnabled: (enabled: boolean) => void;
  setSoundFxVolume: (vol: number) => void;
}

export const useAudioStore = create<AudioState>()((set, get) => ({
  // Core initial state
  isMicMuted: false,
  micVolume: 1.0,
  speakerVolume: 1.0,
  lipSyncValue: 0,
  isSynthesizing: false,
  activeInputDevice: 'default',
  activeOutputDevice: 'default',

  // Extended initial state
  isMuted: false,
  availableAudioDevices: [],
  currentAudioDeviceId: 'default',
  soundFxEnabled: true,
  soundFxVolume: 1.0,

  // Core Actions
  setMicMuted: (isMicMuted) => set({ isMicMuted, isMuted: isMicMuted }),
  toggleMicMute: () => {
    const next = !get().isMicMuted;
    set({ isMicMuted: next, isMuted: next });
    toastService.info(next ? 'Micrófono silenciado (Ctrl+Shift+M)' : 'Micrófono activado (Ctrl+Shift+M)');
  },
  setMicVolume: (micVolume) => set({ micVolume: Math.max(0, Math.min(2, micVolume)) }),
  setSpeakerVolume: (speakerVolume) => set({ speakerVolume: Math.max(0, Math.min(2, speakerVolume)) }),
  setVolumes: (micVolume, speakerVolume) =>
    set({
      micVolume: Math.max(0, Math.min(2, micVolume)),
      speakerVolume: Math.max(0, Math.min(2, speakerVolume)),
    }),
  setLipSyncValue: (lipSyncValue) => set({ lipSyncValue: Math.max(0, Math.min(1, lipSyncValue)) }),
  setIsSynthesizing: (isSynthesizing) => set({ isSynthesizing }),
  setActiveInputDevice: (activeInputDevice) =>
    set({ activeInputDevice, currentAudioDeviceId: activeInputDevice }),
  setActiveOutputDevice: (activeOutputDevice) => set({ activeOutputDevice }),
  setDevices: (activeInputDevice, activeOutputDevice) =>
    set({ activeInputDevice, activeOutputDevice, currentAudioDeviceId: activeInputDevice }),

  // Extended Actions
  setIsMuted: (muted) => set({ isMuted: muted, isMicMuted: muted }),
  toggleMute: () => {
    const next = !get().isMuted;
    set({ isMuted: next, isMicMuted: next });
    toastService.info(next ? 'Micrófono silenciado (Ctrl+Shift+M)' : 'Micrófono activado (Ctrl+Shift+M)');
  },
  setAudioDevices: (devices) => set({ availableAudioDevices: devices }),
  setAudioDeviceId: (id) => set({ currentAudioDeviceId: id, activeInputDevice: id }),
  setSoundFxEnabled: (enabled) => set({ soundFxEnabled: enabled }),
  setSoundFxVolume: (vol) => set({ soundFxVolume: Math.max(0, Math.min(2, vol)) }),
}));
