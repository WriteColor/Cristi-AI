/**
 * Cristi Desktop - System Tray & Window Lifecycle Service
 * In Electron, the system tray is managed by electron/main.cjs.
 * This service provides window visibility controls for renderer components.
 */

import { logger } from '../../infrastructure/logging/logger.js';
import { electronBridge } from './ElectronBridge.js';

export interface SystemTrayOptions {
  onRestoreWindow?: () => void;
  onToggleMute?: () => void;
  onToggleViewMode?: () => void;
  onToggleAlwaysOnTop?: () => void;
  onExitApp?: () => void;
  onOpenVoiceEnrollment?: () => void;
}

export class SystemTrayService {
  onRestoreWindow: () => void;
  onToggleMute: () => void;
  onToggleViewMode: () => void;
  onToggleAlwaysOnTop: () => void;
  onExitApp: () => void;
  onOpenVoiceEnrollment: () => void;
  isInitialized = false;

  constructor({
    onRestoreWindow,
    onToggleMute,
    onToggleViewMode,
    onToggleAlwaysOnTop,
    onExitApp,
    onOpenVoiceEnrollment
  }: SystemTrayOptions = {}) {
    this.onRestoreWindow = onRestoreWindow || (() => {});
    this.onToggleMute = onToggleMute || (() => {});
    this.onToggleViewMode = onToggleViewMode || (() => {});
    this.onToggleAlwaysOnTop = onToggleAlwaysOnTop || (() => {});
    this.onExitApp = onExitApp || (() => {});
    this.onOpenVoiceEnrollment = onOpenVoiceEnrollment || (() => {});
  }

  async setupTray(): Promise<void> {
    this.isInitialized = true;
    logger.info('TRAY', 'Cristi AI Companion System Tray activo y gestionado por Electron.');
  }

  async minimizeToTray(): Promise<void> {
    try {
      electronBridge.hideWindow();
      await electronBridge.showNotification(
        'Cristi AI Companion',
        'Cristi permanece activa en la bandeja del sistema (haz doble clic para mostrar).'
      );
    } catch (err) {
      logger.warn('TRAY', `Aviso al minimizar a bandeja: ${(err as Error).message}`);
    }
  }

  async showWindow(): Promise<void> {
    try {
      electronBridge.showWindow();
    } catch (err) {
      logger.warn('TRAY', `Aviso al mostrar ventana: ${(err as Error).message}`);
    }
  }
}

export default SystemTrayService;
