import { useEffect } from 'react';
import { useCompanionStore } from '../stores/useCompanionStore.js';
import { useAudioStore } from '../stores/useAudioStore.js';
import { useVisionStore } from '../stores/useVisionStore.js';
import { useSettingsStore } from '../stores/useSettingsStore.js';
import { proactiveTriggerService } from '../domain/interaction/ProactiveTriggerService.js';
import { electronBridge } from '../services/desktop/ElectronBridge.js';
import { toastService } from '../infrastructure/notifications/toastService.js';
import { eventBus, EVENTS } from '../infrastructure/events/eventBus.js';

interface UseGlobalShortcutsOptions {
  resetInactivityTimer?: () => void;
  onToggleConnection?: () => void;
}

/**
 * useGlobalShortcuts
 * Handles keyboard shortcuts (F3, Ctrl+Shift+C, Ctrl+Shift+H, etc.) and OS-wide Electron shortcut events.
 */
export function useGlobalShortcuts(options: UseGlobalShortcutsOptions = {}) {
  const { resetInactivityTimer, onToggleConnection } = options;

  useEffect(() => {
    let lastActivityTime = 0;

    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivityTime < 350) return; // Throttled activity
      lastActivityTime = now;
      proactiveTriggerService.recordUserActivity();
      resetInactivityTimer?.();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcut triggers if settings window is open
      if (useSettingsStore.getState().isSettingsWindowOpen) return;

      proactiveTriggerService.recordUserActivity();

      // Escape hierarchical resolution
      if (e.key === 'Escape') {
        const { contextMenu, closeContextMenu } = useCompanionStore.getState();
        const { isRegionPickerOpen, closeRegionPicker } = useVisionStore.getState();

        if (contextMenu.isOpen) {
          closeContextMenu();
          return;
        }
        if (isRegionPickerOpen) {
          closeRegionPicker();
          return;
        }
      }

      // F3: Performance HUD
      if (e.key === 'F3') {
        e.preventDefault();
        void electronBridge.openTelemetryWindow();
        return;
      }

      // Ctrl + Shift Shortcuts
      if (e.ctrlKey && e.shiftKey) {
        const key = e.key.toUpperCase();
        if (key === 'C') {
          e.preventDefault();
          if (onToggleConnection) {
            onToggleConnection();
          } else {
            eventBus.emit('connection.toggle');
          }
          return;
        }
        if (key === 'H') {
          e.preventDefault();
          useCompanionStore.getState().toggleZenMode();
          return;
        }
        if (key === 'M') {
          e.preventDefault();
          useAudioStore.getState().toggleMute();
          return;
        }
        if (key === 'P') {
          e.preventDefault();
          void electronBridge.openTelemetryWindow();
          return;
        }
        if (key === 'S') {
          e.preventDefault();
          eventBus.emit('screen.capture_snapshot');
          return;
        }
      }

      // 'h' / 'H' alone for Zen mode
      if (e.key === 'h' || e.key === 'H') {
        const target = e.target as HTMLElement | null;
        if (!target?.matches('input, textarea')) {
          e.preventDefault();
          useCompanionStore.getState().toggleZenMode();
          return;
        }
      }

      resetInactivityTimer?.();
    };

    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('mousedown', onActivity, { passive: true });
    window.addEventListener('keydown', onKeyDown);

    // Electron OS-wide shortcut event subscriptions
    const unsubShortcuts: Array<() => void> = [];

    if (electronBridge.isElectron) {
      const unsubMute = electronBridge.onShortcutEvent('shortcut-toggle-mute', () => {
        if (useSettingsStore.getState().isSettingsWindowOpen) return;
        useAudioStore.getState().toggleMute();
      });
      unsubShortcuts.push(unsubMute);

      const unsubZen = electronBridge.onShortcutEvent('shortcut-toggle-zen-mode', () => {
        if (useSettingsStore.getState().isSettingsWindowOpen) return;
        useCompanionStore.getState().toggleZenMode();
        toastService.info('Modo Zen alternado (Ctrl+Shift+H)');
      });
      unsubShortcuts.push(unsubZen);

      const unsubPerf = electronBridge.onShortcutEvent('shortcut-toggle-perf-hud', () => {
        if (useSettingsStore.getState().isSettingsWindowOpen) return;
        void electronBridge.openTelemetryWindow();
      });
      unsubShortcuts.push(unsubPerf);

      const unsubPin = electronBridge.onShortcutEvent('shortcut-toggle-always-on-top', () => {
        if (useSettingsStore.getState().isSettingsWindowOpen) return;
        useCompanionStore.getState().toggleAlwaysOnTop();
      });
      unsubShortcuts.push(unsubPin);

      const unsubVision = electronBridge.onShortcutEvent('shortcut-capture-screen', async () => {
        if (useSettingsStore.getState().isSettingsWindowOpen) return;
        eventBus.emit('screen.capture_snapshot');
      });
      unsubShortcuts.push(unsubVision);
    }

    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('mousedown', onActivity);
      window.removeEventListener('keydown', onKeyDown);
      unsubShortcuts.forEach((fn) => fn?.());
    };
  }, [resetInactivityTimer, onToggleConnection]);
}

export default useGlobalShortcuts;
