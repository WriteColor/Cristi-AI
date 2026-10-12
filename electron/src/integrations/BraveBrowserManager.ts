import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import * as fs from 'fs';
import * as path from 'path';

export interface YouTubePlayResult {
  success: boolean;
  title: string;
  videoUrl: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  error?: string;
}

export interface MediaControlResult {
  success: boolean;
  action: string;
  playing?: boolean;
  volume?: number;
  currentTime?: number;
  duration?: number;
  error?: string;
}

export interface BrowserStatusResult {
  running: boolean;
  url?: string;
  title?: string;
  playing?: boolean;
  currentTime?: number;
  duration?: number;
  browserType?: string;
  executablePath?: string;
}

/**
 * Searches for the authentic Brave Browser executable installed on the user's system.
 */
export function findBraveExecutablePath(): string | null {
  if (process.env.BRAVE_PATH && fs.existsSync(process.env.BRAVE_PATH)) {
    return process.env.BRAVE_PATH;
  }

  const standardPaths = [
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  ];

  for (const p of standardPaths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }

  // Fallback search for Chromium-compatible browsers if Brave is absent
  const fallbacks = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];

  for (const f of fallbacks) {
    if (f && fs.existsSync(f)) {
      return f;
    }
  }

  return null;
}

export class BraveBrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private activePage: Page | null = null;
  private isLaunching = false;

  constructor() {
    try {
      import('../core/processManager.ts')
        .then(({ processManager }) => {
          if (processManager?.registerCleanupHook) {
            processManager.registerCleanupHook('brave-browser', async () => {
              await this.close();
            });
          }
        })
        .catch(() => {});
    } catch {
      // Ignored outside Electron
    }
  }

  /**
   * Ensures the browser and active page are open and ready.
   */
  public async ensureBrowser(options?: { headless?: boolean }): Promise<Page> {
    if (this.browser && this.context && this.activePage && !this.activePage.isClosed()) {
      return this.activePage;
    }

    if (this.isLaunching) {
      // Wait for launch to settle
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (this.activePage && !this.activePage.isClosed()) return this.activePage;
      }
    }

    return this.launch(options);
  }

  /**
   * Launches Brave Browser with playwright-core and configures optimal media flags.
   */
  public async launch(options?: { headless?: boolean }): Promise<Page> {
    this.isLaunching = true;
    try {
      if (this.browser) {
        try {
          await this.browser.close();
        } catch {
          // Ignore
        }
        this.browser = null;
        this.context = null;
        this.activePage = null;
      }

      const executablePath = findBraveExecutablePath();
      if (!executablePath) {
        throw new Error(
          'No se encontró el ejecutable de Brave Browser en el sistema (ni fallbacks de Chrome/Edge). Verifique la ruta de Brave.'
        );
      }

      const headless = options?.headless ?? false;

      this.browser = await chromium.launch({
        executablePath,
        headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--autoplay-policy=no-user-gesture-required',
          '--disable-features=AudioServiceSandbox',
          '--start-maximized',
        ],
      });

      this.context = await this.browser.newContext({
        viewport: null, // Maximized
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      });

      this.activePage = await this.context.newPage();

      this.browser.on('disconnected', () => {
        this.browser = null;
        this.context = null;
        this.activePage = null;
      });

      this.activePage.on('close', () => {
        this.activePage = null;
      });

      return this.activePage;
    } finally {
      this.isLaunching = false;
    }
  }

  /**
   * Searches YouTube, selects the most relevant video, initiates playback, and rigorously
   * verifies that the video element is genuinely actively playing (!paused && currentTime > 0).
   * Cristi will NEVER falsely report that a video is playing when only a search was completed.
   */
  public async playYouTubeVideo(params: {
    query: string;
    autoPlay?: boolean;
    timeoutMs?: number;
  }): Promise<YouTubePlayResult> {
    const { query } = params;
    const page = await this.ensureBrowser({ headless: false });

    const isDirectWatchUrl =
      /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/i.test(query.trim());

    if (isDirectWatchUrl) {
      const fullUrl = query.startsWith('http') ? query : `https://${query}`;
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } else {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // Dismiss cookie/consent dialogs if present
      await this.dismissYouTubeDialogs(page);

      // Locate the first authentic video entry in YouTube search results
      const videoCardSelector =
        'ytd-video-renderer a#video-title, ytd-video-renderer a.ytd-video-renderer[href*="/watch?v="], a#video-title';

      const firstVideo = page.locator(videoCardSelector).first();
      await firstVideo.waitFor({ state: 'visible', timeout: 15000 });

      const videoHref = await firstVideo.getAttribute('href');
      if (!videoHref) {
        throw new Error(`No se encontró ningún video reproducible para la búsqueda: "${query}".`);
      }

      // Click the video link
      await firstVideo.click({ timeout: 5000 }).catch(async () => {
        const directVideoUrl = videoHref.startsWith('http')
          ? videoHref
          : `https://www.youtube.com${videoHref}`;
        await page.goto(directVideoUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      });
    }

    // Dismiss any dialogs or pre-video overlays
    await this.dismissYouTubeDialogs(page);

    // Wait for the HTML5 video element
    await page.waitForSelector('video.html5-main-video', { timeout: 18000 });

    // Try skipping video ads if present immediately
    await this.skipYouTubeAds(page);

    // Explicitly unpause and trigger play in page context
    await page.evaluate(() => {
      const video = document.querySelector('video.html5-main-video') as HTMLVideoElement | null;
      if (video) {
        video.muted = false;
        if (video.paused) {
          video.play().catch(() => {});
        }
      }
    });

    // Rigorous verification loop: poll for up to 12 seconds to ensure genuine playback progress
    const deadline = Date.now() + 14000;
    let verifiedPlaying = false;
    let lastCurrentTime = 0;
    let videoDuration = 0;

    while (Date.now() < deadline) {
      await this.skipYouTubeAds(page);

      const status = await page
        .evaluate(() => {
          const v = document.querySelector('video.html5-main-video') as HTMLVideoElement | null;
          if (!v) return { found: false, playing: false, currentTime: 0, duration: 0 };
          if (v.paused) {
            v.play().catch(() => {});
          }
          return {
            found: true,
            playing: !v.paused && v.currentTime > 0,
            currentTime: v.currentTime,
            duration: v.duration || 0,
          };
        })
        .catch(() => ({ found: false, playing: false, currentTime: 0, duration: 0 }));

      if (status.playing && status.currentTime >= 0.1) {
        verifiedPlaying = true;
        lastCurrentTime = status.currentTime;
        videoDuration = status.duration;
        break;
      }

      await new Promise((r) => setTimeout(r, 600));
    }

    const currentUrl = page.url();
    const rawTitle = await page.title();
    const cleanTitle = rawTitle.replace(/ - YouTube$/i, '').trim();

    if (!verifiedPlaying) {
      throw new Error(
        `No se pudo iniciar la reproducción del video "${cleanTitle}" en YouTube. El reproductor no avanzó en el tiempo requerido.`
      );
    }

    return {
      success: true,
      title: cleanTitle,
      videoUrl: currentUrl,
      playing: true,
      currentTime: Math.max(0.1, Math.round(lastCurrentTime * 100) / 100),
      duration: Math.round(videoDuration * 10) / 10,
    };
  }

  /**
   * Interacts with the active HTML5 video element for media playback controls.
   */
  public async mediaControl(options: {
    action: 'play' | 'pause' | 'toggle' | 'seek' | 'volume' | 'mute' | 'unmute' | 'fullscreen';
    value?: number;
  }): Promise<MediaControlResult> {
    const page = await this.ensureBrowser({ headless: false });

    return await page.evaluate((opts) => {
      const video =
        (document.querySelector('video.html5-main-video') as HTMLVideoElement | null) ||
        (document.querySelector('video') as HTMLVideoElement | null);

      if (!video) {
        return {
          success: false,
          action: opts.action,
          error: 'No se encontró ningún elemento de video en la página activa.',
        };
      }

      switch (opts.action) {
        case 'play':
          video.play().catch(() => {});
          break;
        case 'pause':
          video.pause();
          break;
        case 'toggle':
          if (video.paused) video.play().catch(() => {});
          else video.pause();
          break;
        case 'seek':
          if (typeof opts.value === 'number') {
            video.currentTime = opts.value;
          }
          break;
        case 'volume':
          if (typeof opts.value === 'number') {
            video.volume = Math.max(0, Math.min(1, opts.value / 100));
            video.muted = false;
          }
          break;
        case 'mute':
          video.muted = true;
          break;
        case 'unmute':
          video.muted = false;
          break;
        case 'fullscreen': {
          const container =
            document.querySelector('.html5-video-player') ||
            document.querySelector('#movie_player') ||
            video;
          if (container.requestFullscreen) {
            container.requestFullscreen().catch(() => {});
          }
          break;
        }
      }

      return {
        success: true,
        action: opts.action,
        playing: !video.paused,
        volume: Math.round(video.volume * 100),
        currentTime: Math.round(video.currentTime * 10) / 10,
        duration: Math.round((video.duration || 0) * 10) / 10,
      };
    }, options);
  }

  /**
   * Navigates to a specific URL.
   */
  public async navigate(options: {
    url: string;
    timeoutMs?: number;
  }): Promise<{ success: boolean; url: string; title: string }> {
    const page = await this.ensureBrowser({ headless: false });
    const targetUrl = options.url.startsWith('http') ? options.url : `https://${options.url}`;
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs || 25000,
    });
    return {
      success: true,
      url: page.url(),
      title: await page.title(),
    };
  }

  /**
   * Performs an internet search using Brave, Google, or DuckDuckGo.
   */
  public async search(options: {
    query: string;
    engine?: 'google' | 'brave' | 'duckduckgo';
  }): Promise<{ success: boolean; query: string; url: string; title: string }> {
    const engine = options.engine || 'brave';
    let searchUrl: string;

    switch (engine) {
      case 'google':
        searchUrl = `https://www.google.com/search?q=${encodeURIComponent(options.query)}`;
        break;
      case 'duckduckgo':
        searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(options.query)}`;
        break;
      case 'brave':
      default:
        searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(options.query)}`;
        break;
    }

    const nav = await this.navigate({ url: searchUrl });
    return {
      success: true,
      query: options.query,
      url: nav.url,
      title: nav.title,
    };
  }

  /**
   * Clicks an element matching a CSS or text selector.
   */
  public async click(options: {
    selector: string;
    timeoutMs?: number;
  }): Promise<{ success: boolean; selector: string }> {
    const page = await this.ensureBrowser({ headless: false });
    await page.click(options.selector, { timeout: options.timeoutMs || 10000 });
    return { success: true, selector: options.selector };
  }

  /**
   * Types text into an input element.
   */
  public async type(options: {
    selector: string;
    text: string;
    pressEnter?: boolean;
    timeoutMs?: number;
  }): Promise<{ success: boolean; selector: string }> {
    const page = await this.ensureBrowser({ headless: false });
    await page.fill(options.selector, options.text, { timeout: options.timeoutMs || 10000 });
    if (options.pressEnter) {
      await page.press(options.selector, 'Enter');
    }
    return { success: true, selector: options.selector };
  }

  /**
   * Extracts readable text, headings, and markdown-like snapshot from the current page.
   */
  public async snapshot(options?: {
    maxChars?: number;
  }): Promise<{ success: boolean; title: string; url: string; content: string }> {
    const page = await this.ensureBrowser({ headless: false });
    const maxChars = options?.maxChars || 8000;

    const data = await page.evaluate((maxLen) => {
      const title = document.title;
      const url = window.location.href;

      // Extract main text content
      const bodyClone = document.body.cloneNode(true) as HTMLElement;
      // Remove scripts, styles, iframes
      const removeTags = ['script', 'style', 'noscript', 'svg', 'iframe'];
      removeTags.forEach((tag) => {
        bodyClone.querySelectorAll(tag).forEach((el) => el.remove());
      });

      const rawText = bodyClone.innerText || bodyClone.textContent || '';
      const cleaned = rawText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('\n');

      return {
        title,
        url,
        content: cleaned.slice(0, maxLen),
      };
    }, maxChars);

    return {
      success: true,
      title: data.title,
      url: data.url,
      content: data.content,
    };
  }

  /**
   * Takes a screenshot of the active browser page.
   */
  public async takeScreenshot(options?: {
    fullPage?: boolean;
  }): Promise<{ success: boolean; base64Png: string }> {
    const page = await this.ensureBrowser({ headless: false });
    const buffer = await page.screenshot({ fullPage: options?.fullPage ?? false });
    return {
      success: true,
      base64Png: buffer.toString('base64'),
    };
  }

  /**
   * Evaluates custom JavaScript in the active page context.
   */
  public async evaluate(options: {
    script: string;
  }): Promise<{ success: boolean; result: unknown }> {
    const page = await this.ensureBrowser({ headless: false });
    // Evaluate script securely inside page context
    const result = await page.evaluate(options.script);
    return {
      success: true,
      result,
    };
  }

  /**
   * Gets current browser status, active page details, and playback state.
   */
  public async getStatus(): Promise<BrowserStatusResult> {
    if (!this.browser || !this.context || !this.activePage || this.activePage.isClosed()) {
      return { running: false };
    }

    try {
      const url = this.activePage.url();
      const title = await this.activePage.title();

      const mediaState: {
        hasVideo: boolean;
        playing?: boolean;
        currentTime?: number;
        duration?: number;
      } = await this.activePage
        .evaluate((): { hasVideo: boolean; playing?: boolean; currentTime?: number; duration?: number } => {
          const video = document.querySelector('video') as HTMLVideoElement | null;
          if (!video) return { hasVideo: false };
          return {
            hasVideo: true,
            playing: !video.paused,
            currentTime: Math.round(video.currentTime * 10) / 10,
            duration: Math.round((video.duration || 0) * 10) / 10,
          };
        })
        .catch(() => ({ hasVideo: false }));

      return {
        running: true,
        url,
        title,
        playing: mediaState.hasVideo ? mediaState.playing : undefined,
        currentTime: mediaState.hasVideo ? mediaState.currentTime : undefined,
        duration: mediaState.hasVideo ? mediaState.duration : undefined,
        browserType: 'Brave Browser',
        executablePath: findBraveExecutablePath() || undefined,
      };
    } catch {
      return { running: false };
    }
  }

  /**
   * Closes browser cleanly.
   */
  public async close(): Promise<{ success: boolean }> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore
      }
      this.browser = null;
      this.context = null;
      this.activePage = null;
    }
    return { success: true };
  }

  // --- Helper Methods ---

  private async dismissYouTubeDialogs(page: Page): Promise<void> {
    const consentSelectors = [
      'button[aria-label*="Reject"]',
      'button[aria-label*="Accept"]',
      'button:has-text("Aceptar todo")',
      'button:has-text("Aceptar")',
      'button:has-text("Reject all")',
      'button:has-text("Accept all")',
      'ytd-button-renderer:has-text("Aceptar todo")',
      'ytd-button-renderer:has-text("Accept all")',
      'tp-yt-paper-dialog button#button',
    ];

    for (const sel of consentSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 600 })) {
          await btn.click({ timeout: 600 });
          break;
        }
      } catch {
        // Continue
      }
    }
  }

  private async skipYouTubeAds(page: Page): Promise<void> {
    const skipSelectors = [
      '.ytp-ad-skip-button',
      '.ytp-skip-ad-button',
      'button.ytp-ad-skip-button-modern',
      '.ytp-ad-overlay-close-button',
    ];

    for (const sel of skipSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 400 })) {
          await btn.click({ timeout: 400 });
        }
      } catch {
        // Continue
      }
    }
  }
}

export const braveBrowserManager = new BraveBrowserManager();
