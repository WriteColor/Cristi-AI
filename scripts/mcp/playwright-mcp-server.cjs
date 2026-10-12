#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/src/core/processManager.ts
var processManager_exports = {};
__export(processManager_exports, {
  processManager: () => processManager
});
var ProcessManager, processManager;
var init_processManager = __esm({
  "electron/src/core/processManager.ts"() {
    "use strict";
    ProcessManager = class {
      activeProcesses = /* @__PURE__ */ new Set();
      cleanupHooks = /* @__PURE__ */ new Map();
      cleanupPromise = null;
      /**
       * Tracks a spawned child process.
       */
      track(cp) {
        this.activeProcesses.add(cp);
        const remove = () => {
          this.activeProcesses.delete(cp);
        };
        cp.once("exit", remove);
        cp.once("error", remove);
        return cp;
      }
      /**
       * Removes tracking for a child process.
       */
      untrack(cp) {
        this.activeProcesses.delete(cp);
      }
      /**
       * Registers a cleanup hook to run on application shutdown.
       */
      registerCleanupHook(key, hook) {
        this.cleanupPromise = null;
        this.cleanupHooks.set(key, hook);
      }
      /**
       * Kills all currently tracked child processes.
       */
      terminateAll() {
        for (const cp of this.activeProcesses) {
          try {
            if (cp && !cp.killed) {
              cp.kill("SIGTERM");
            }
          } catch (_) {
            try {
              cp.kill("SIGKILL");
            } catch (_2) {
            }
          }
        }
        this.activeProcesses.clear();
      }
      /**
       * Runs all registered cleanup hooks and kills child processes.
       */
      cleanupAll() {
        this.cleanupPromise ??= this.runCleanup();
        return this.cleanupPromise;
      }
      async runCleanup() {
        for (const hook of this.cleanupHooks.values()) {
          try {
            await hook();
          } catch (err) {
            console.warn("[ProcessManager] Error executing cleanup hook:", err.message);
          }
        }
        this.terminateAll();
      }
    };
    processManager = new ProcessManager();
  }
});

// electron/src/integrations/BraveBrowserManager.ts
var BraveBrowserManager_exports = {};
__export(BraveBrowserManager_exports, {
  BraveBrowserManager: () => BraveBrowserManager,
  braveBrowserManager: () => braveBrowserManager,
  findBraveExecutablePath: () => findBraveExecutablePath
});
function findBraveExecutablePath() {
  if (process.env.BRAVE_PATH && fs.existsSync(process.env.BRAVE_PATH)) {
    return process.env.BRAVE_PATH;
  }
  const standardPaths = [
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    path.join(process.env.LOCALAPPDATA || "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
  ];
  for (const p of standardPaths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }
  const fallbacks = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ];
  for (const f of fallbacks) {
    if (f && fs.existsSync(f)) {
      return f;
    }
  }
  return null;
}
var import_playwright_core, fs, path, BraveBrowserManager, braveBrowserManager;
var init_BraveBrowserManager = __esm({
  "electron/src/integrations/BraveBrowserManager.ts"() {
    "use strict";
    import_playwright_core = require("playwright-core");
    fs = __toESM(require("fs"), 1);
    path = __toESM(require("path"), 1);
    BraveBrowserManager = class {
      browser = null;
      context = null;
      activePage = null;
      isLaunching = false;
      constructor() {
        try {
          Promise.resolve().then(() => (init_processManager(), processManager_exports)).then(({ processManager: processManager2 }) => {
            if (processManager2?.registerCleanupHook) {
              processManager2.registerCleanupHook("brave-browser", async () => {
                await this.close();
              });
            }
          }).catch(() => {
          });
        } catch {
        }
      }
      /**
       * Ensures the browser and active page are open and ready.
       */
      async ensureBrowser(options) {
        if (this.browser && this.context && this.activePage && !this.activePage.isClosed()) {
          return this.activePage;
        }
        if (this.isLaunching) {
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
      async launch(options) {
        this.isLaunching = true;
        try {
          if (this.browser) {
            try {
              await this.browser.close();
            } catch {
            }
            this.browser = null;
            this.context = null;
            this.activePage = null;
          }
          const executablePath = findBraveExecutablePath();
          if (!executablePath) {
            throw new Error(
              "No se encontr\xF3 el ejecutable de Brave Browser en el sistema (ni fallbacks de Chrome/Edge). Verifique la ruta de Brave."
            );
          }
          const headless = options?.headless ?? false;
          this.browser = await import_playwright_core.chromium.launch({
            executablePath,
            headless,
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--autoplay-policy=no-user-gesture-required",
              "--disable-features=AudioServiceSandbox",
              "--start-maximized"
            ]
          });
          this.context = await this.browser.newContext({
            viewport: null,
            // Maximized
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
          });
          this.activePage = await this.context.newPage();
          this.browser.on("disconnected", () => {
            this.browser = null;
            this.context = null;
            this.activePage = null;
          });
          this.activePage.on("close", () => {
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
      async playYouTubeVideo(params) {
        const { query } = params;
        const page = await this.ensureBrowser({ headless: false });
        const isDirectWatchUrl = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/i.test(query.trim());
        if (isDirectWatchUrl) {
          const fullUrl = query.startsWith("http") ? query : `https://${query}`;
          await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 2e4 });
        } else {
          const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
          await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 2e4 });
          await this.dismissYouTubeDialogs(page);
          const videoCardSelector = 'ytd-video-renderer a#video-title, ytd-video-renderer a.ytd-video-renderer[href*="/watch?v="], a#video-title';
          const firstVideo = page.locator(videoCardSelector).first();
          await firstVideo.waitFor({ state: "visible", timeout: 15e3 });
          const videoHref = await firstVideo.getAttribute("href");
          if (!videoHref) {
            throw new Error(`No se encontr\xF3 ning\xFAn video reproducible para la b\xFAsqueda: "${query}".`);
          }
          await firstVideo.click({ timeout: 5e3 }).catch(async () => {
            const directVideoUrl = videoHref.startsWith("http") ? videoHref : `https://www.youtube.com${videoHref}`;
            await page.goto(directVideoUrl, { waitUntil: "domcontentloaded", timeout: 2e4 });
          });
        }
        await this.dismissYouTubeDialogs(page);
        await page.waitForSelector("video.html5-main-video", { timeout: 18e3 });
        await this.skipYouTubeAds(page);
        await page.evaluate(() => {
          const video = document.querySelector("video.html5-main-video");
          if (video) {
            video.muted = false;
            if (video.paused) {
              video.play().catch(() => {
              });
            }
          }
        });
        const deadline = Date.now() + 14e3;
        let verifiedPlaying = false;
        let lastCurrentTime = 0;
        let videoDuration = 0;
        while (Date.now() < deadline) {
          await this.skipYouTubeAds(page);
          const status = await page.evaluate(() => {
            const v = document.querySelector("video.html5-main-video");
            if (!v) return { found: false, playing: false, currentTime: 0, duration: 0 };
            if (v.paused) {
              v.play().catch(() => {
              });
            }
            return {
              found: true,
              playing: !v.paused && v.currentTime > 0,
              currentTime: v.currentTime,
              duration: v.duration || 0
            };
          }).catch(() => ({ found: false, playing: false, currentTime: 0, duration: 0 }));
          if (status.playing && status.currentTime > 0) {
            verifiedPlaying = true;
            lastCurrentTime = status.currentTime;
            videoDuration = status.duration;
            break;
          }
          await new Promise((r) => setTimeout(r, 600));
        }
        const currentUrl = page.url();
        const rawTitle = await page.title();
        const cleanTitle = rawTitle.replace(/ - YouTube$/i, "").trim();
        if (!verifiedPlaying) {
          throw new Error(
            `No se pudo iniciar la reproducci\xF3n del video "${cleanTitle}" en YouTube. El reproductor no avanz\xF3 en el tiempo requerido.`
          );
        }
        return {
          success: true,
          title: cleanTitle,
          videoUrl: currentUrl,
          playing: true,
          currentTime: Math.round(lastCurrentTime * 10) / 10,
          duration: Math.round(videoDuration * 10) / 10
        };
      }
      /**
       * Interacts with the active HTML5 video element for media playback controls.
       */
      async mediaControl(options) {
        const page = await this.ensureBrowser({ headless: false });
        return await page.evaluate((opts) => {
          const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
          if (!video) {
            return {
              success: false,
              action: opts.action,
              error: "No se encontr\xF3 ning\xFAn elemento de video en la p\xE1gina activa."
            };
          }
          switch (opts.action) {
            case "play":
              video.play().catch(() => {
              });
              break;
            case "pause":
              video.pause();
              break;
            case "toggle":
              if (video.paused) video.play().catch(() => {
              });
              else video.pause();
              break;
            case "seek":
              if (typeof opts.value === "number") {
                video.currentTime = opts.value;
              }
              break;
            case "volume":
              if (typeof opts.value === "number") {
                video.volume = Math.max(0, Math.min(1, opts.value / 100));
                video.muted = false;
              }
              break;
            case "mute":
              video.muted = true;
              break;
            case "unmute":
              video.muted = false;
              break;
            case "fullscreen": {
              const container = document.querySelector(".html5-video-player") || document.querySelector("#movie_player") || video;
              if (container.requestFullscreen) {
                container.requestFullscreen().catch(() => {
                });
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
            duration: Math.round((video.duration || 0) * 10) / 10
          };
        }, options);
      }
      /**
       * Navigates to a specific URL.
       */
      async navigate(options) {
        const page = await this.ensureBrowser({ headless: false });
        const targetUrl = options.url.startsWith("http") ? options.url : `https://${options.url}`;
        await page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: options.timeoutMs || 25e3
        });
        return {
          success: true,
          url: page.url(),
          title: await page.title()
        };
      }
      /**
       * Performs an internet search using Brave, Google, or DuckDuckGo.
       */
      async search(options) {
        const engine = options.engine || "brave";
        let searchUrl;
        switch (engine) {
          case "google":
            searchUrl = `https://www.google.com/search?q=${encodeURIComponent(options.query)}`;
            break;
          case "duckduckgo":
            searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(options.query)}`;
            break;
          case "brave":
          default:
            searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(options.query)}`;
            break;
        }
        const nav = await this.navigate({ url: searchUrl });
        return {
          success: true,
          query: options.query,
          url: nav.url,
          title: nav.title
        };
      }
      /**
       * Clicks an element matching a CSS or text selector.
       */
      async click(options) {
        const page = await this.ensureBrowser({ headless: false });
        await page.click(options.selector, { timeout: options.timeoutMs || 1e4 });
        return { success: true, selector: options.selector };
      }
      /**
       * Types text into an input element.
       */
      async type(options) {
        const page = await this.ensureBrowser({ headless: false });
        await page.fill(options.selector, options.text, { timeout: options.timeoutMs || 1e4 });
        if (options.pressEnter) {
          await page.press(options.selector, "Enter");
        }
        return { success: true, selector: options.selector };
      }
      /**
       * Extracts readable text, headings, and markdown-like snapshot from the current page.
       */
      async snapshot(options) {
        const page = await this.ensureBrowser({ headless: false });
        const maxChars = options?.maxChars || 8e3;
        const data = await page.evaluate((maxLen) => {
          const title = document.title;
          const url = window.location.href;
          const bodyClone = document.body.cloneNode(true);
          const removeTags = ["script", "style", "noscript", "svg", "iframe"];
          removeTags.forEach((tag) => {
            bodyClone.querySelectorAll(tag).forEach((el) => el.remove());
          });
          const rawText = bodyClone.innerText || bodyClone.textContent || "";
          const cleaned = rawText.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).join("\n");
          return {
            title,
            url,
            content: cleaned.slice(0, maxLen)
          };
        }, maxChars);
        return {
          success: true,
          title: data.title,
          url: data.url,
          content: data.content
        };
      }
      /**
       * Takes a screenshot of the active browser page.
       */
      async takeScreenshot(options) {
        const page = await this.ensureBrowser({ headless: false });
        const buffer = await page.screenshot({ fullPage: options?.fullPage ?? false });
        return {
          success: true,
          base64Png: buffer.toString("base64")
        };
      }
      /**
       * Evaluates custom JavaScript in the active page context.
       */
      async evaluate(options) {
        const page = await this.ensureBrowser({ headless: false });
        const result = await page.evaluate(options.script);
        return {
          success: true,
          result
        };
      }
      /**
       * Gets current browser status, active page details, and playback state.
       */
      async getStatus() {
        if (!this.browser || !this.context || !this.activePage || this.activePage.isClosed()) {
          return { running: false };
        }
        try {
          const url = this.activePage.url();
          const title = await this.activePage.title();
          const mediaState = await this.activePage.evaluate(() => {
            const video = document.querySelector("video");
            if (!video) return { hasVideo: false };
            return {
              hasVideo: true,
              playing: !video.paused,
              currentTime: Math.round(video.currentTime * 10) / 10,
              duration: Math.round((video.duration || 0) * 10) / 10
            };
          }).catch(() => ({ hasVideo: false }));
          return {
            running: true,
            url,
            title,
            playing: mediaState.hasVideo ? mediaState.playing : void 0,
            currentTime: mediaState.hasVideo ? mediaState.currentTime : void 0,
            duration: mediaState.hasVideo ? mediaState.duration : void 0,
            browserType: "Brave Browser",
            executablePath: findBraveExecutablePath() || void 0
          };
        } catch {
          return { running: false };
        }
      }
      /**
       * Closes browser cleanly.
       */
      async close() {
        if (this.browser) {
          try {
            await this.browser.close();
          } catch {
          }
          this.browser = null;
          this.context = null;
          this.activePage = null;
        }
        return { success: true };
      }
      // --- Helper Methods ---
      async dismissYouTubeDialogs(page) {
        const consentSelectors = [
          'button[aria-label*="Reject"]',
          'button[aria-label*="Accept"]',
          'button:has-text("Aceptar todo")',
          'button:has-text("Aceptar")',
          'button:has-text("Reject all")',
          'button:has-text("Accept all")',
          'ytd-button-renderer:has-text("Aceptar todo")',
          'ytd-button-renderer:has-text("Accept all")',
          "tp-yt-paper-dialog button#button"
        ];
        for (const sel of consentSelectors) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 600 })) {
              await btn.click({ timeout: 600 });
              break;
            }
          } catch {
          }
        }
      }
      async skipYouTubeAds(page) {
        const skipSelectors = [
          ".ytp-ad-skip-button",
          ".ytp-skip-ad-button",
          "button.ytp-ad-skip-button-modern",
          ".ytp-ad-overlay-close-button"
        ];
        for (const sel of skipSelectors) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 400 })) {
              await btn.click({ timeout: 400 });
            }
          } catch {
          }
        }
      }
    };
    braveBrowserManager = new BraveBrowserManager();
  }
});

// scripts/mcp/playwright-mcp-server.ts
var import_server = require("@modelcontextprotocol/sdk/server/index.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_types = require("@modelcontextprotocol/sdk/types.js");

// shared/security.ts
var SECRET_FIELD = /(?:api[_-]?key|client[_-]?secret|bot[_-]?token|(?:^|[_-])token$|access[_-]?token|refresh[_-]?token|authorization|password|secret)/i;
function publicSettings(value, ancestors = /* @__PURE__ */ new Set(), clones = /* @__PURE__ */ new Map()) {
  if (value && typeof value === "object") {
    if (ancestors.has(value)) return "[Circular]";
    if (clones.has(value)) return clones.get(value);
    ancestors.add(value);
  }
  try {
    if (Array.isArray(value)) {
      const arr = [];
      clones.set(value, arr);
      for (const item of value) {
        arr.push(publicSettings(item, ancestors, clones));
      }
      return arr;
    }
    if (value && typeof value === "object") {
      const obj = Object.getPrototypeOf(value) === null ? /* @__PURE__ */ Object.create(null) : {};
      clones.set(value, obj);
      for (const [key, val] of Object.entries(value)) {
        if (!SECRET_FIELD.test(key)) {
          Object.defineProperty(obj, key, {
            value: publicSettings(val, ancestors, clones),
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return obj;
    }
    return value;
  } finally {
    if (value && typeof value === "object") {
      ancestors.delete(value);
    }
  }
}
function redactText(text) {
  return text.replace(/([?&](?:key|access_token)=)[^&\s]+/gi, "$1[REDACTED]").replace(/AIza[\w-]+/g, "[REDACTED]").replace(/(Bearer\s+)[^\s,;]+/gi, "$1[REDACTED]").replace(/((?:api[_-]?key|token|secret|authorization|password)\s*[=:]\s*(?:Bearer\s+)?)[^\s,;]+/gi, "$1[REDACTED]");
}

// src/infrastructure/logging/logger.ts
var import_meta = {};
var LOG_LEVEL_PRIORITIES = {
  debug: 0,
  info: 1,
  voice: 2,
  warn: 3,
  error: 4,
  silent: 5
};
var TAG_COLORS = {
  GEMINI: "#c084fc",
  AUDIO: "#38bdf8",
  VISION: "#f43f5e",
  ASR: "#4ade80",
  TOOL: "#fbbf24",
  SYSTEM: "#94a3b8",
  SCENE: "#a855f7",
  ELECTRON: "#06b6d4",
  CONFIG: "#34d399",
  PROACTIVE: "#f59e0b",
  AVATAR: "#ec4899",
  PROFILER: "#8b5cf6",
  SPOTIFY: "#1db954"
};
function safeSerialize(val) {
  if (val === null || val === void 0) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "bigint") return `${val.toString()}n`;
  if (typeof val === "symbol" || typeof val === "function") return val.toString();
  if (val instanceof Error) return `${val.name}: ${val.message}
${val.stack || ""}`;
  try {
    const seen = /* @__PURE__ */ new WeakSet();
    return JSON.stringify(val, (_key, value) => {
      if (typeof value === "bigint") return `${value.toString()}n`;
      if (typeof value === "function") return `[Function: ${value.name || "anonymous"}]`;
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    });
  } catch (_err) {
    return String(val);
  }
}
var LoggerService = class {
  listeners = /* @__PURE__ */ new Set();
  currentLevel = "debug";
  lastLogKey = "";
  lastLogTime = 0;
  repeatCount = 0;
  /**
   * Set minimum active log level threshold
   */
  setLevel(level) {
    if (level in LOG_LEVEL_PRIORITIES) {
      this.currentLevel = level;
    }
  }
  /**
   * Get current log level
   */
  getLevel() {
    return this.currentLevel;
  }
  /**
   * Subscribe to log events for UI Debug HUD or analytics
   */
  subscribe(listener) {
    if (typeof listener !== "function") return () => {
    };
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emitToListeners(entry) {
    this.listeners.forEach((fn) => {
      try {
        fn(entry);
      } catch (_) {
      }
    });
  }
  normalizeArgs(arg1, arg2, arg3) {
    if (arg2 === void 0) {
      return { tag: "SYSTEM", message: arg1, data: null };
    }
    if (arg3 === void 0) {
      return { tag: String(arg1 || "SYSTEM"), message: arg2, data: null };
    }
    return { tag: String(arg1 || "SYSTEM"), message: arg2, data: arg3 };
  }
  log(level, arg1, arg2, arg3) {
    if (LOG_LEVEL_PRIORITIES[level] < LOG_LEVEL_PRIORITIES[this.currentLevel]) {
      return;
    }
    const { tag, message, data: rawData } = this.normalizeArgs(arg1, arg2, arg3);
    const data = publicSettings(rawData);
    const msgStr = redactText(typeof message === "object" && message !== null ? safeSerialize(publicSettings(message)) : String(message ?? ""));
    const logKey = `${level}:${tag}:${msgStr}`;
    const now = Date.now();
    if (logKey === this.lastLogKey && now - this.lastLogTime < 1500) {
      this.repeatCount++;
      return;
    }
    this.lastLogKey = logKey;
    this.lastLogTime = now;
    this.repeatCount = 0;
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString("es-ES");
    const upperTag = (tag || "SYSTEM").toUpperCase();
    const entry = {
      id: `${now}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp,
      level,
      tag: upperTag,
      message: msgStr,
      data: data !== void 0 ? data : null
    };
    const color = TAG_COLORS[entry.tag] || "#a855f7";
    if (data !== null && data !== void 0) {
      console.log(
        `%c[${entry.timestamp}]%c [${entry.tag}] %c${entry.message}`,
        "color: #64748b; font-weight: normal;",
        `color: ${color}; font-weight: bold;`,
        "color: #f8fafc;",
        data
      );
    } else {
      console.log(
        `%c[${entry.timestamp}]%c [${entry.tag}] %c${entry.message}`,
        "color: #64748b; font-weight: normal;",
        `color: ${color}; font-weight: bold;`,
        "color: #f8fafc;"
      );
    }
    this.emitToListeners(entry);
    this.sendToTerminal(entry);
  }
  async sendToTerminal(entry) {
    try {
      if (typeof window !== "undefined" && typeof window.fetch === "function" && import_meta.env?.DEV) {
        fetch("/__log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: safeSerialize(entry),
          mode: "no-cors"
        }).catch(() => {
        });
      }
    } catch (_) {
    }
  }
  debug(arg1, arg2, arg3) {
    this.log("debug", arg1, arg2, arg3);
  }
  info(arg1, arg2, arg3) {
    this.log("info", arg1, arg2, arg3);
  }
  voice(arg1, arg2, arg3) {
    this.log("voice", arg1, arg2, arg3);
  }
  warn(arg1, arg2, arg3) {
    this.log("warn", arg1, arg2, arg3);
  }
  error(arg1, arg2, arg3) {
    this.log("error", arg1, arg2, arg3);
  }
};
var logger = new LoggerService();

// src/mcp/servers/playwright/PlaywrightMcpServer.ts
var PlaywrightMcpServer = class {
  id = "cristi_playwright";
  name = "Playwright Brave MCP";
  version = "1.0.0";
  /**
   * Returns standard MCP tool declarations for Brave Browser automation.
   */
  getToolsDeclarations() {
    return [
      {
        name: "browser_play_youtube_video",
        description: "Busca un video o m\xFAsica en YouTube, selecciona el video m\xE1s relevante, inicia la reproducci\xF3n en Brave Browser y VERIFICA rigurosamente que el video est\xE9 reproduci\xE9ndose de verdad (!paused && currentTime > 0). \xDAsalo cuando Ariel pida un video, canci\xF3n o m\xFAsica de YouTube.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: 'T\xE9rmino de b\xFAsqueda o URL de YouTube (ejemplo: "Deftones Be Quiet and Drive", "Queen Bohemian Rhapsody", o enlace directo).'
            },
            autoPlay: {
              type: "BOOLEAN",
              description: "Si debe iniciar la reproducci\xF3n de forma autom\xE1tica (por defecto true)."
            },
            timeoutMs: {
              type: "NUMBER",
              description: "Tiempo m\xE1ximo de espera para confirmar la reproducci\xF3n en milisegundos."
            }
          },
          required: ["query"]
        }
      },
      {
        name: "browser_media_control",
        description: "Controla la reproducci\xF3n de video y audio en Brave Browser (reproducir, pausar, alternar, cambiar volumen, silenciar, adelantar/retroceder o pantalla completa).",
        parameters: {
          type: "OBJECT",
          properties: {
            action: {
              type: "STRING",
              description: 'Acci\xF3n a ejecutar: "play", "pause", "toggle", "seek", "volume", "mute", "unmute", "fullscreen".'
            },
            value: {
              type: "NUMBER",
              description: "Valor num\xE9rico: porcentaje para volume (0-100) o segundos para seek."
            }
          },
          required: ["action"]
        }
      },
      {
        name: "browser_search",
        description: "Realiza una b\xFAsqueda en internet en Brave Browser usando Brave Search, Google o DuckDuckGo y abre los resultados.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "Consulta o tema a buscar en la web."
            },
            engine: {
              type: "STRING",
              description: 'Motor de b\xFAsqueda: "brave", "google" o "duckduckgo" (por defecto "brave").'
            }
          },
          required: ["query"]
        }
      },
      {
        name: "browser_navigate",
        description: "Navega a una URL espec\xEDfica en Brave Browser.",
        parameters: {
          type: "OBJECT",
          properties: {
            url: {
              type: "STRING",
              description: 'Direcci\xF3n URL completa a la que navegar (ej: "https://wikipedia.org").'
            },
            timeoutMs: {
              type: "NUMBER",
              description: "Tiempo m\xE1ximo de espera en milisegundos."
            }
          },
          required: ["url"]
        }
      },
      {
        name: "browser_snapshot",
        description: "Obtiene el contenido legible de la p\xE1gina web actual en texto limpio, incluyendo t\xEDtulo y URL.",
        parameters: {
          type: "OBJECT",
          properties: {
            maxChars: {
              type: "NUMBER",
              description: "L\xEDmite de caracteres del contenido extra\xEDdo (por defecto 8000)."
            }
          }
        }
      },
      {
        name: "browser_click",
        description: "Hace clic en un elemento de la p\xE1gina web activa utilizando un selector CSS o texto.",
        parameters: {
          type: "OBJECT",
          properties: {
            selector: {
              type: "STRING",
              description: "Selector CSS o expresi\xF3n del elemento donde hacer clic."
            },
            timeoutMs: {
              type: "NUMBER",
              description: "Tiempo m\xE1ximo de espera en milisegundos."
            }
          },
          required: ["selector"]
        }
      },
      {
        name: "browser_type",
        description: "Escribe texto en un campo de entrada (input, textarea) en la p\xE1gina activa.",
        parameters: {
          type: "OBJECT",
          properties: {
            selector: {
              type: "STRING",
              description: "Selector CSS del campo de texto donde escribir."
            },
            text: {
              type: "STRING",
              description: "Texto que se va a ingresar."
            },
            pressEnter: {
              type: "BOOLEAN",
              description: "Si debe presionar Enter tras escribir el texto."
            },
            timeoutMs: {
              type: "NUMBER",
              description: "Tiempo m\xE1ximo de espera en milisegundos."
            }
          },
          required: ["selector", "text"]
        }
      },
      {
        name: "browser_take_screenshot",
        description: "Toma una captura de pantalla de la p\xE1gina activa en Brave Browser.",
        parameters: {
          type: "OBJECT",
          properties: {
            fullPage: {
              type: "BOOLEAN",
              description: "Si la captura debe abarcar la p\xE1gina completa con desplazamiento."
            }
          }
        }
      },
      {
        name: "browser_evaluate",
        description: "Ejecuta un fragmento de JavaScript en el contexto de la p\xE1gina web activa y retorna el resultado.",
        parameters: {
          type: "OBJECT",
          properties: {
            script: {
              type: "STRING",
              description: "C\xF3digo JavaScript a ejecutar en la consola de la p\xE1gina."
            }
          },
          required: ["script"]
        }
      },
      {
        name: "browser_get_status",
        description: "Obtiene el estado actual del navegador Brave (si est\xE1 abierto, URL activa, t\xEDtulo, si hay un video reproduci\xE9ndose y tiempo transcurrido).",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      },
      {
        name: "browser_close",
        description: "Cierra el navegador Brave Browser.",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      }
    ];
  }
  /**
   * Executes a given Playwright MCP tool by name.
   */
  async executeTool(name, args = {}, signal) {
    if (signal?.aborted) {
      return { status: "cancelled", cancelled: true };
    }
    try {
      const backend = await this.getBackend();
      switch (name) {
        case "browser_play_youtube_video":
        case "play_youtube_video":
        case "play_youtube":
        case "youtube_play": {
          const query = String(args.query || args.search || "").trim();
          if (!query) {
            return {
              status: "error",
              success: false,
              error: 'Se requiere el par\xE1metro "query" para buscar y reproducir en YouTube.'
            };
          }
          logger.info("PLAYWRIGHT", `Iniciando reproducci\xF3n aut\xF3noma en YouTube: "${query}"...`);
          const result = await backend.playYouTube({
            query,
            autoPlay: args.autoPlay !== false,
            timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : void 0
          });
          return {
            status: result.success ? "success" : "error",
            ...result,
            message: result.success ? `Reproduciendo "${result.title}" en YouTube a trav\xE9s de Brave Browser.` : result.error || "No se pudo reproducir el video."
          };
        }
        case "browser_media_control": {
          const action = String(args.action || "toggle").toLowerCase();
          const validActions = [
            "play",
            "pause",
            "toggle",
            "seek",
            "volume",
            "mute",
            "unmute",
            "fullscreen"
          ];
          if (!validActions.includes(action)) {
            return {
              status: "error",
              success: false,
              error: `Acci\xF3n inv\xE1lida "${action}". Acciones soportadas: ${validActions.join(", ")}`
            };
          }
          const result = await backend.mediaControl({
            action,
            value: typeof args.value === "number" ? args.value : void 0
          });
          return {
            status: result.success ? "success" : "error",
            ...result
          };
        }
        case "browser_search": {
          const query = String(args.query || "").trim();
          if (!query) {
            return { status: "error", success: false, error: 'Se requiere el par\xE1metro "query" para buscar.' };
          }
          const result = await backend.search({
            query,
            engine: args.engine
          });
          return {
            status: result.success ? "success" : "error",
            ...result
          };
        }
        case "browser_navigate": {
          const url = String(args.url || "").trim();
          if (!url) {
            return { status: "error", success: false, error: 'Se requiere el par\xE1metro "url".' };
          }
          const result = await backend.navigate({
            url,
            timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : void 0
          });
          return {
            status: result.success ? "success" : "error",
            ...result
          };
        }
        case "browser_snapshot": {
          const result = await backend.snapshot({
            maxChars: typeof args.maxChars === "number" ? args.maxChars : void 0
          });
          return {
            status: result.success ? "success" : "error",
            ...result
          };
        }
        case "browser_click": {
          const selector = String(args.selector || "").trim();
          if (!selector) {
            return { success: false, error: 'Se requiere el par\xE1metro "selector".' };
          }
          const result = await backend.click({
            selector,
            timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : void 0
          });
          return {
            status: result.success ? "success" : "error",
            ...result
          };
        }
        case "browser_type": {
          const selector = String(args.selector || "").trim();
          const text = String(args.text || "");
          if (!selector) {
            return { success: false, error: 'Se requiere el par\xE1metro "selector".' };
          }
          const result = await backend.type({
            selector,
            text,
            pressEnter: Boolean(args.pressEnter),
            timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : void 0
          });
          return {
            status: result.success ? "success" : "error",
            ...result
          };
        }
        case "browser_take_screenshot": {
          const result = await backend.takeScreenshot({
            fullPage: Boolean(args.fullPage)
          });
          return {
            status: result.success ? "success" : "error",
            ...result
          };
        }
        case "browser_evaluate": {
          const script = String(args.script || "").trim();
          if (!script) {
            return { success: false, error: 'Se requiere el par\xE1metro "script".' };
          }
          const result = await backend.evaluate({ script });
          return {
            status: result.success ? "success" : "error",
            ...result
          };
        }
        case "browser_get_status": {
          const result = await backend.getStatus();
          return {
            status: "success",
            ...result
          };
        }
        case "browser_close": {
          const result = await backend.close();
          return {
            status: "success",
            ...result
          };
        }
        default:
          return {
            status: "error",
            error: `Herramienta desconocida en Playwright MCP: "${name}"`
          };
      }
    } catch (err) {
      const errorMsg = err.message || String(err);
      logger.error("PLAYWRIGHT", `Error ejecutando ${name}: ${errorMsg}`);
      return {
        status: "error",
        success: false,
        error: errorMsg
      };
    }
  }
  /**
   * Dispatches standard MCP tool calls.
   */
  async callTool(name, args = {}) {
    const result = await this.executeTool(name, args);
    if (result.status === "error" || result.success === false) {
      return {
        success: false,
        error: result.error || "Fallo en la ejecuci\xF3n de la herramienta."
      };
    }
    return {
      success: true,
      content: result
    };
  }
  /**
   * Resolves the execution backend (Electron IPC bridge or direct BraveBrowserManager in Node).
   */
  async getBackend() {
    if (typeof window !== "undefined" && window.electronBridge?.browserPlayYouTube) {
      const bridge = window.electronBridge;
      return {
        navigate: (opts) => bridge.browserNavigate(opts),
        search: (opts) => bridge.browserSearch(opts),
        playYouTube: (opts) => bridge.browserPlayYouTube(opts),
        mediaControl: (opts) => bridge.browserMediaControl(opts),
        click: (opts) => bridge.browserClick(opts),
        type: (opts) => bridge.browserType(opts),
        snapshot: (opts) => bridge.browserSnapshot(opts),
        takeScreenshot: (opts) => bridge.browserTakeScreenshot(opts),
        evaluate: (opts) => bridge.browserEvaluate(opts),
        close: () => bridge.browserClose(),
        getStatus: () => bridge.browserGetStatus()
      };
    }
    const { braveBrowserManager: braveBrowserManager2 } = await Promise.resolve().then(() => (init_BraveBrowserManager(), BraveBrowserManager_exports));
    return {
      navigate: (opts) => braveBrowserManager2.navigate(opts),
      search: (opts) => braveBrowserManager2.search(opts),
      playYouTube: (opts) => braveBrowserManager2.playYouTubeVideo(opts),
      mediaControl: (opts) => braveBrowserManager2.mediaControl(opts),
      click: (opts) => braveBrowserManager2.click(opts),
      type: (opts) => braveBrowserManager2.type(opts),
      snapshot: (opts) => braveBrowserManager2.snapshot(opts),
      takeScreenshot: (opts) => braveBrowserManager2.takeScreenshot(opts),
      evaluate: (opts) => braveBrowserManager2.evaluate(opts),
      close: () => braveBrowserManager2.close(),
      getStatus: () => braveBrowserManager2.getStatus()
    };
  }
};
var playwrightMcpServer = new PlaywrightMcpServer();

// scripts/mcp/playwright-mcp-server.ts
var server = new import_server.Server(
  {
    name: "cristi_playwright",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);
server.setRequestHandler(import_types.ListToolsRequestSchema, async () => {
  const tools = playwrightMcpServer.getToolsDeclarations().map((d) => ({
    name: d.name,
    description: d.description,
    inputSchema: {
      type: "object",
      properties: d.parameters.properties,
      required: d.parameters.required || []
    }
  }));
  return { tools };
});
server.setRequestHandler(import_types.CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await playwrightMcpServer.executeTool(name, args || {});
  return {
    content: [
      {
        type: "text",
        text: typeof result === "string" ? result : JSON.stringify(result, null, 2)
      }
    ],
    isError: result.status === "error" || result.success === false
  };
});
async function main() {
  const transport = new import_stdio.StdioServerTransport();
  await server.connect(transport);
}
main().catch((err) => {
  console.error("Error fatal iniciando Playwright MCP Stdio Server:", err);
  process.exit(1);
});
