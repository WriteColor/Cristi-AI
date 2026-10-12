import { electronBridge } from '../../services/desktop/ElectronBridge';
import { logger } from '../../infrastructure/logging/logger';

export interface MediaActionResult {
  status: 'success' | 'error' | 'cancelled';
  action?: string;
  message?: string;
  data?: unknown;
}

export class WindowsMediaService {
  async control(action: 'play_pause' | 'next' | 'previous' | 'stop' | 'volume_up' | 'volume_down' | 'mute'): Promise<MediaActionResult> {
    try {
      const res = await electronBridge.windowsMediaControl(action);
      return { status: res.success ? 'success' : 'error', action, data: res };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn('MEDIA', `Fallo al controlar multimedia de Windows: ${msg}`);
      return { status: 'error', action, message: msg };
    }
  }

  async getStatus(): Promise<MediaActionResult> {
    try {
      const status = await electronBridge.windowsMediaStatus();
      return { status: 'success', data: status };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { status: 'error', message: msg };
    }
  }

  async launchSpotify(queryOrUri: string): Promise<MediaActionResult> {
    try {
      const res = await electronBridge.windowsSpotifyLaunch(queryOrUri);
      return { status: res.success ? 'success' : 'error', data: res };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { status: 'error', message: msg };
    }
  }
}

export const windowsMediaService = new WindowsMediaService();
