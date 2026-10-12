import { handleTrusted } from '../security/CapabilityRouter';
import { braveBrowserManager } from '../integrations/BraveBrowserManager';

/**
 * Registers IPC handlers for Brave Browser automation and YouTube playback verification.
 */
export function registerBrowserIpc(): void {
  handleTrusted('browser-navigate', async (_event, options) => {
    try {
      return await braveBrowserManager.navigate(options);
    } catch (err) {
      return {
        success: false,
        url: options.url,
        title: '',
        error: (err as Error).message,
      };
    }
  });

  handleTrusted('browser-search', async (_event, options) => {
    try {
      return await braveBrowserManager.search(options);
    } catch (err) {
      return {
        success: false,
        query: options.query,
        url: '',
        title: '',
        error: (err as Error).message,
      };
    }
  });

  handleTrusted('browser-play-youtube', async (_event, options) => {
    try {
      return await braveBrowserManager.playYouTubeVideo(options);
    } catch (err) {
      return {
        success: false,
        title: '',
        videoUrl: '',
        playing: false,
        currentTime: 0,
        duration: 0,
        error: (err as Error).message,
      };
    }
  });

  handleTrusted('browser-media-control', async (_event, options) => {
    try {
      return await braveBrowserManager.mediaControl(options);
    } catch (err) {
      return {
        success: false,
        action: options.action,
        error: (err as Error).message,
      };
    }
  });

  handleTrusted('browser-click', async (_event, options) => {
    try {
      return await braveBrowserManager.click(options);
    } catch (err) {
      return {
        success: false,
        selector: options.selector,
        error: (err as Error).message,
      };
    }
  });

  handleTrusted('browser-type', async (_event, options) => {
    try {
      return await braveBrowserManager.type(options);
    } catch (err) {
      return {
        success: false,
        selector: options.selector,
        error: (err as Error).message,
      };
    }
  });

  handleTrusted('browser-snapshot', async (_event, ...args) => {
    try {
      const options = args[0];
      return await braveBrowserManager.snapshot(options);
    } catch (err) {
      return {
        success: false,
        title: '',
        url: '',
        content: '',
        error: (err as Error).message,
      };
    }
  });

  handleTrusted('browser-take-screenshot', async (_event, ...args) => {
    try {
      const options = args[0];
      return await braveBrowserManager.takeScreenshot(options);
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
      };
    }
  });

  handleTrusted('browser-evaluate', async (_event, options) => {
    try {
      return await braveBrowserManager.evaluate(options);
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
      };
    }
  });

  handleTrusted('browser-close', async () => {
    try {
      return await braveBrowserManager.close();
    } catch (err) {
      return {
        success: false,
      };
    }
  });

  handleTrusted('browser-get-status', async () => {
    try {
      return await braveBrowserManager.getStatus();
    } catch (err) {
      return {
        running: false,
      };
    }
  });
}
