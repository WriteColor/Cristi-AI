import { publicSettings } from '../../../shared/security.ts';
import type {
  ElectronApiBridge,
  FileRequest,
  DisplayInfo as IpcDisplayInfo,
  ProcessMemoryInfo,
  ScreenRegion,
  ScreenCaptureRequest,
  MemoryRecord,
  MemoryLoadResult,
  MemorySaveResult,
  SpotifySessionStatus,
  SpotifyUserProfile,
} from '../../../shared/ipc/contracts.ts';

export type { MemoryRecord, MemoryLoadResult, MemorySaveResult, SpotifySessionStatus, SpotifyUserProfile };

/**
 * Cristi AI - Modern Electron Bridge (Strict TypeScript)
 * 
 * Safely wraps window.electron / window.electronBridge / window.electronAPI
 * with complete type definitions, deduplication, zero-crash browser fallback,
 * and strict compile-time types (0 uses of `any`).
 */

export interface DisplayInfo {
  width: number;
  height: number;
  scaleFactor: number;
  workArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ExecCommandResult {
  stdOut: string;
  stdErr: string;
  exitCode: number;
}

export interface StatusResult {
  success: boolean;
  error?: string | null;
  [key: string]: unknown;
}

const getApi = (): ElectronApiBridge | null => {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    electronAPI?: ElectronApiBridge;
    electronBridge?: ElectronApiBridge;
    electron?: ElectronApiBridge;
  };
  return win.electronAPI || win.electronBridge || win.electron || null;
};

export class ElectronBridgeService {
  public async requestLiveToken(model: string): Promise<string> {
    const api = getApi();
    if (!api?.requestLiveToken) throw new Error('Live requiere Electron y una credencial configurada.');
    return api.requestLiveToken(model);
  }

  public async credentialStatus(): Promise<{ hasGeminiCredential: boolean }> {
    return await getApi()?.credentialStatus?.() ?? { hasGeminiCredential: false };
  }

  public async geminiGenerate(model: string, body: Record<string, unknown>): Promise<unknown> {
    const api = getApi();
    if (!api?.geminiGenerate) throw new Error('Gemini requiere Electron.');
    return api.geminiGenerate(model, body);
  }

  public _interactionLockCount = 0;
  private _lastIgnore: boolean | null = null;
  private _lastForward: boolean | null = null;

  /** True when running inside Electron desktop environment */
  public get isElectron(): boolean {
    return getApi() !== null;
  }

  public isElectronAvailable(): boolean {
    return this.isElectron;
  }

  public acquireInteractionLock(): void {
    this._interactionLockCount++;
    if (this._interactionLockCount > 0) {
      this.setIgnoreMouseEvents(false);
    }
  }

  public releaseInteractionLock(): void {
    if (this._interactionLockCount > 0) {
      this._interactionLockCount--;
      if (this._interactionLockCount === 0) {
        this.setIgnoreMouseEvents(true);
      }
    }
  }

  public resetInteractionLock(): void {
    this._interactionLockCount = 0;
    this._lastIgnore = null;
    this._lastForward = null;
    this.setIgnoreMouseEvents(true);
  }

  /**
   * Toggle window click-through mode.
   * Deduplicates identical consecutive calls to prevent flooding Electron IPC.
   * Never forwards global mouse events to avoid low-level WH_MOUSE_LL hooks.
   */
  public setIgnoreMouseEvents(ignore: boolean, options: { forward?: boolean } = {}): void {
    if (ignore === true && this._interactionLockCount > 0) {
      return; // Blocked by InteractionLock
    }
    const forward = false; // Intentionally false: eliminate WH_MOUSE_LL hook
    if (this._lastIgnore === ignore && this._lastForward === forward) {
      return; // Skip redundant IPC message
    }
    this._lastIgnore = ignore;
    this._lastForward = forward;
    getApi()?.setIgnoreMouseEvents?.(ignore, { ...options, forward: false });
  }

  public focusWindow(): void {
    getApi()?.focusWindow?.();
  }

  public syncHitboxes(hitboxes: unknown[]): void {
    getApi()?.syncHitboxes?.(hitboxes);
  }

  public syncInteractiveHitboxes(hitboxes: unknown[]): void {
    getApi()?.syncInteractiveHitboxes?.(hitboxes);
  }

  public setAlwaysOnTop(value: boolean): void {
    getApi()?.setAlwaysOnTop?.(value);
  }

  public async getAlwaysOnTop(): Promise<boolean> {
    return (await getApi()?.getAlwaysOnTop?.()) ?? false;
  }

  public async listCapturableWindows(): Promise<Array<{ id: string; name: string; thumbnail?: string }>> {
    try {
      const api = getApi();
      if (api?.listCapturableWindows) {
        return (await api.listCapturableWindows()) || [];
      }
      return [];
    } catch (err) {
      console.warn('[ElectronBridge] Error listing capturable windows:', err);
      return [];
    }
  }

  public async getDisplayInfo(): Promise<DisplayInfo> {
    const api = getApi();
    if (api?.getDisplayInfo) {
      const info: IpcDisplayInfo = await api.getDisplayInfo();
      return {
        width: info.bounds.width,
        height: info.bounds.height,
        scaleFactor: info.scaleFactor,
        workArea: {
          x: info.workArea.x,
          y: info.workArea.y,
          width: info.workArea.width,
          height: info.workArea.height
        }
      };
    }
    if (typeof window !== 'undefined' && window.screen) {
      return {
        width: window.screen.width,
        height: window.screen.height,
        scaleFactor: window.devicePixelRatio || 1,
        workArea: { x: 0, y: 0, width: window.screen.width, height: window.screen.height }
      };
    }
    return {
      width: 1920,
      height: 1080,
      scaleFactor: 1,
      workArea: { x: 0, y: 0, width: 1920, height: 1080 }
    };
  }

  public minimizeWindow(): void {
    getApi()?.minimizeWindow?.();
  }

  public quitApp(): void {
    getApi()?.quitApp?.();
  }

  public async relaunchApp(): Promise<StatusResult> {
    const api = getApi();
    if (api?.relaunchApp) {
      return await api.relaunchApp();
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
    return { success: true };
  }

  public async reloadWindow(): Promise<StatusResult> {
    const api = getApi();
    if (api?.reloadWindow) {
      return await api.reloadWindow();
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
    return { success: true };
  }

  public showWindow(): void {
    getApi()?.showWindow?.();
  }

  public hideWindow(): void {
    getApi()?.hideWindow?.();
  }

  public async approveWorkspace(): Promise<{ success: boolean; path?: string }> {
    const api = getApi();
    if (!api?.approveWorkspace) throw new Error('Selecciona la carpeta desde Ajustes.');
    return api.approveWorkspace();
  }

  public async systemExecute(kind: 'system-info' | 'list-processes'): Promise<ExecCommandResult> {
    const api = getApi();
    if (!api?.systemExecute) throw new Error('Capacidad del sistema no disponible.');
    const result = await api.systemExecute({ kind }) as ExecCommandResult;
    return result;
  }

  public async sendComputerInput(payload: { action: string; key?: string; text?: string; coordinate?: [number, number]; scroll_amount?: number }): Promise<{ success: boolean; error?: string }> {
    const api = getApi();
    if (api?.sendComputerInput) {
      return await api.sendComputerInput(payload);
    }
    return { success: true };
  }

  public async executeTerminalCommand(
    command: string,
    cwd?: string,
    timeoutMs?: number
  ): Promise<{ stdOut?: string; stdErr?: string; exitCode?: number; error?: string }> {
    const api = getApi();
    if (api?.executeTerminalCommand) {
      return await api.executeTerminalCommand(command, cwd, timeoutMs);
    }
    return {
      stdOut: '',
      stdErr: 'Terminal execution not available outside Electron.',
      exitCode: 1,
      error: 'Terminal execution not available outside Electron.'
    };
  }

  public async mcpConnect(config: Record<string, unknown> = {}): Promise<StatusResult> {
    return (await getApi()?.mcpConnect?.(config)) || { success: false, error: 'Transporte MCP no disponible.' };
  }

  public async mcpCallTool(payload: Record<string, unknown> = {}): Promise<StatusResult> {
    return (await getApi()?.mcpCallTool?.(payload)) || { success: false, error: 'Transporte MCP no disponible.' };
  }

  public async mcpDisconnect(serverId: string): Promise<StatusResult> {
    return (await getApi()?.mcpDisconnect?.(serverId)) || { success: false, error: 'Transporte MCP no disponible.' };
  }

  public async reportTelemetry(snapshot: Record<string, unknown>): Promise<StatusResult> {
    return (await getApi()?.reportTelemetry?.(snapshot)) || { success: false, error: 'Telemetría requiere Electron.' };
  }

  public async getTelemetrySnapshot(): Promise<Record<string, unknown>> {
    return (await getApi()?.getTelemetrySnapshot?.()) || {};
  }

  public async readFile(filePath: FileRequest | string): Promise<string> {
    const api = getApi();
    if (api?.readFile) {
      return await api.readFile(filePath);
    }
    throw new Error('Electron filesystem unavailable in browser');
  }

  public async writeFile(filePath: FileRequest | string, data: string): Promise<boolean> {
    const api = getApi();
    if (api?.writeFile) {
      return await api.writeFile(filePath, data);
    }
    throw new Error('Electron filesystem unavailable in browser');
  }

  public async appendFile(filePath: FileRequest | string, data: string): Promise<boolean> {
    const api = getApi();
    if (api?.appendFile) {
      return await api.appendFile(filePath, data);
    }
    throw new Error('Electron filesystem unavailable in browser');
  }

  public async deleteFile(filePath: FileRequest | string, recursive = false): Promise<{ success: boolean; error?: string }> {
    const api = getApi();
    if (api?.deleteFile) {
      return await api.deleteFile(filePath, recursive);
    }
    throw new Error('Electron filesystem unavailable in browser');
  }

  public async moveFile(sourcePath: FileRequest | string, destPath: FileRequest | string): Promise<{ success: boolean; error?: string }> {
    const api = getApi();
    if (api?.moveFile) {
      return await api.moveFile(sourcePath, destPath);
    }
    throw new Error('Electron filesystem unavailable in browser');
  }

  public async searchDirectory(
    dirPath: FileRequest | string,
    query?: string,
    maxResults = 100
  ): Promise<Array<{ path: string; name: string; type: 'FILE' | 'DIRECTORY'; size?: number }>> {
    const api = getApi();
    if (api?.searchDirectory) {
      return await api.searchDirectory(dirPath, query, maxResults);
    }
    throw new Error('Electron filesystem unavailable in browser');
  }

  public async listWindows(): Promise<Array<{ hwnd: number; pid: number; title: string; process: string; isMinimized: boolean; isMaximized: boolean }>> {
    const api = getApi();
    if (api?.listWindows) {
      return await api.listWindows();
    }
    return [];
  }

  public async focusOsWindow(query: string | number): Promise<{ success: boolean; title?: string; error?: string }> {
    const api = getApi();
    if (api?.focusOsWindow) {
      return await api.focusOsWindow(query);
    }
    return { success: false, error: 'Electron unavailable' };
  }

  public async manageOsWindow(query: string | number, action: 'minimize' | 'maximize' | 'restore' | 'close'): Promise<{ success: boolean; action: string; error?: string }> {
    const api = getApi();
    if (api?.manageOsWindow) {
      return await api.manageOsWindow(query, action);
    }
    return { success: false, action, error: 'Electron unavailable' };
  }

  public async listInstalledApps(filter?: string): Promise<Array<{ name: string; path: string; type: 'shortcut' | 'executable' }>> {
    const api = getApi();
    if (api?.listInstalledApps) {
      return await api.listInstalledApps(filter);
    }
    return [];
  }

  public async launchApp(appName: string, args: string[] = []): Promise<{ success: boolean; appName: string; path?: string; error?: string }> {
    const api = getApi();
    if (api?.launchApp) {
      return await api.launchApp(appName, args);
    }
    return { success: false, appName, error: 'Electron unavailable' };
  }

  public async readDirectory(dirPath: FileRequest | string): Promise<{ entry: string; type: 'FILE' | 'DIRECTORY' }[]> {
    const api = getApi();
    if (api?.readDirectory) {
      return await api.readDirectory(dirPath);
    }
    throw new Error('Electron filesystem unavailable in browser');
  }

  public async getSystemFolders(): Promise<Record<string, string>> {
    const api = getApi();
    if (api?.getSystemFolders) {
      return await api.getSystemFolders();
    }
    return {};
  }

  public async memoryLoad(): Promise<MemoryLoadResult> {
    return (await getApi()?.memoryLoad?.()) ?? { success: false, error: 'Memoria no disponible.' };
  }

  public async memorySave(memories: Record<string, unknown>[]): Promise<MemorySaveResult> {
    return (await getApi()?.memorySave?.(memories)) ?? { success: false, error: 'Memoria no disponible.' };
  }

  public async setSecureSecret(key: string, value: string): Promise<StatusResult> {
    const api = getApi();
    if (!api?.setSecureSecret) throw new Error('Abre Ajustes para guardar credenciales.');
    const result = await api.setSecureSecret(key, value);
    if (!result.success) throw new Error(result.error || 'No se pudo guardar la credencial.');
    return result;
  }

  public async deleteSecureSecret(key: string): Promise<StatusResult> {
    return (await getApi()?.deleteSecureSecret?.(key)) || { success: false, error: 'Unavailable' };
  }

  public async openExternal(url: string): Promise<boolean> {
    const api = getApi();
    if (api?.openExternal) {
      return await api.openExternal(url);
    }
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
      return true;
    }
    return false;
  }

  public async openPath(targetPath: string): Promise<StatusResult> {
    const api = getApi();
    if (api?.openPath) {
      return await api.openPath({ scope: 'workspaceApproved', path: targetPath });
    }
    return { success: false, error: 'Electron unavailable' };
  }

  public async showItemInFolder(targetPath: string): Promise<boolean> {
    const api = getApi();
    if (api?.showItemInFolder) {
      return await api.showItemInFolder({ scope: 'workspaceApproved', path: targetPath });
    }
    return false;
  }

  public async captureScreenNative(requestOrRegion?: ScreenRegion | ScreenCaptureRequest | null, fresh = false): Promise<string | null> {
    const api = getApi();
    if (!api?.captureScreenNative) return null;
    if (requestOrRegion && typeof requestOrRegion === 'object' && ('targetWindow' in requestOrRegion || 'windowId' in requestOrRegion || 'displayId' in requestOrRegion || 'region' in requestOrRegion)) {
      const req = requestOrRegion as ScreenCaptureRequest;
      return await api.captureScreenNative({ ...req, fresh: fresh || req.fresh });
    }
    const region = requestOrRegion as ScreenRegion | null;
    return await api.captureScreenNative(fresh ? { region, fresh: true } : region);
  }

  // ── System Diagnostics & Native Features ─────────────────────────────────
  public async getProcessMemoryInfo(): Promise<ProcessMemoryInfo | null> {
    return (await getApi()?.getProcessMemoryInfo?.()) ?? null;
  }

  public async getGpuFeatureStatus(): Promise<Record<string, string> | null> {
    return (await getApi()?.getGpuFeatureStatus?.()) ?? null;
  }

  public async getGpuInfo(): Promise<Record<string, unknown> | null> {
    return (await getApi()?.getGpuInfo?.()) ?? null;
  }

  public onShortcutEvent(channel: string, callback: (...args: unknown[]) => void): () => void {
    const api = getApi();
    if (api?.onShortcutEvent) {
      return api.onShortcutEvent(channel, callback);
    }
    return () => {};
  }

  public async getClipboardText(): Promise<string> {
    const api = getApi();
    if (api?.getClipboardText) {
      return await api.getClipboardText();
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      return await navigator.clipboard.readText();
    }
    return '';
  }

  public async setClipboardText(text: string): Promise<boolean> {
    const api = getApi();
    if (api?.setClipboardText) {
      return await api.setClipboardText(text);
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

  public async showNotification(titleOrPayload: string | { title?: string; body?: string }, body?: string): Promise<boolean> {
    const api = getApi();
    if (api?.showNotification) {
      if (typeof titleOrPayload === 'object' && titleOrPayload !== null) {
        return await api.showNotification(titleOrPayload);
      }
      return await api.showNotification({ title: titleOrPayload, body });
    }
    return false;
  }

  // ── Auto-Updater Methods ───────────────────────────────────────────────────
  public async checkForUpdates(): Promise<StatusResult> {
    const api = getApi();
    if (api?.checkForUpdates) {
      return await api.checkForUpdates();
    }
    return { success: false, error: 'Actualizaciones automáticas no disponibles en versión web' };
  }

  public async downloadUpdate(): Promise<StatusResult> {
    const api = getApi();
    if (api?.downloadUpdate) {
      return await api.downloadUpdate();
    }
    return { success: false, error: 'Descarga no disponible en versión web' };
  }

  public async installUpdate(): Promise<boolean> {
    const api = getApi();
    if (api?.installUpdate) {
      return await api.installUpdate();
    }
    return false;
  }

  public async getAppVersion(): Promise<string> {
    const api = getApi();
    if (api?.getAppVersion) {
      return await api.getAppVersion();
    }
    return '1.0.0 (Web)';
  }

  public onUpdateStatus(callback: (data: unknown) => void): () => void {
    const api = getApi();
    if (api?.onUpdateStatus) {
      return api.onUpdateStatus(callback);
    }
    return () => {};
  }

  // ── Settings & Config ─────────────────────────────────────────────────────
  public openSettingsWindow(): void {
    getApi()?.openSettingsWindow?.();
  }

  public closeSettingsWindow(): void {
    getApi()?.closeSettingsWindow?.();
  }

  public async saveAppConfig(config: Record<string, unknown> | object): Promise<StatusResult> {
    const api = getApi();
    if (api?.saveAppConfig) {
      return await api.saveAppConfig(publicSettings(config as Record<string, unknown>));
    }
    // Fallback in web: localStorage
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('cristi_app_config', JSON.stringify(config));
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    return { success: false, error: 'Unavailable' };
  }

  public async sendConfigUpdated(config: Record<string, unknown> | object): Promise<StatusResult> {
    return await this.saveAppConfig(config);
  }

  public async saveConfig(config: Record<string, unknown> | object): Promise<StatusResult> {
    return await this.saveAppConfig(config);
  }

  public async getAppConfig(): Promise<Record<string, unknown> | null> {
    const api = getApi();
    if (api?.getAppConfig) {
      return await api.getAppConfig();
    }
    if (typeof window !== 'undefined') {
      try {
        const item = window.localStorage.getItem('cristi_app_config');
        return item ? JSON.parse(item) : null;
      } catch (err) {
        console.error(err);
      }
    }
    return null;
  }

  public onConfigUpdated<T = unknown>(callback: (config: T) => void): () => void {
    const api = getApi();
    if (api?.onConfigUpdated) {
      return api.onConfigUpdated(callback as (data: unknown) => void);
    }
    return () => {};
  }

  public onCompanionPause(callback: () => void): () => void {
    const api = getApi();
    if (api?.onCompanionPause) {
      return api.onCompanionPause(callback);
    }
    return () => {};
  }

  public onCompanionResume(callback: () => void): () => void {
    const api = getApi();
    if (api?.onCompanionResume) {
      return api.onCompanionResume(callback);
    }
    return () => {};
  }

  public onSettingsWindowState(callback: (state: unknown) => void): () => void {
    const api = getApi();
    if (api?.onSettingsWindowState) {
      return api.onSettingsWindowState(callback);
    }
    return () => {};
  }

  public async openCameraWindow(): Promise<StatusResult> {
    const api = getApi();
    if (api?.openCameraWindow) {
      return await api.openCameraWindow();
    }
    return { success: false, error: 'Unavailable' };
  }

  public async closeCameraWindow(): Promise<StatusResult> {
    const api = getApi();
    if (api?.closeCameraWindow) {
      return await api.closeCameraWindow();
    }
    return { success: false, error: 'Unavailable' };
  }

  public async openTelemetryWindow(): Promise<StatusResult> {
    const api = getApi();
    return api?.openTelemetryWindow ? await api.openTelemetryWindow() : { success: false, error: 'Unavailable' };
  }

  public async closeTelemetryWindow(): Promise<StatusResult> {
    const api = getApi();
    return api?.closeTelemetryWindow ? await api.closeTelemetryWindow() : { success: false, error: 'Unavailable' };
  }

  public async isCameraWindowOpen(): Promise<boolean> {
    const api = getApi();
    if (api?.isCameraWindowOpen) {
      return await api.isCameraWindowOpen();
    }
    return false;
  }

  public onCameraWindowState(callback: (state: unknown) => void): () => void {
    const api = getApi();
    if (api?.onCameraWindowState) {
      return api.onCameraWindowState(callback);
    }
    return () => {};
  }

  // ── Native Windows Media & Spotify Control ───────────────────────────────
  public async windowsMediaControl(action: string): Promise<{ success: boolean; action: string }> {
    return (await getApi()?.windowsMediaControl?.(action)) ?? { success: false, action };
  }

  public async windowsMediaStatus(): Promise<unknown> {
    return (await getApi()?.windowsMediaStatus?.()) ?? { isSpotifyRunning: false, isPlaying: false };
  }

  public async windowsSpotifyLaunch(target: string): Promise<{ success: boolean; uri: string }> {
    return (await getApi()?.windowsSpotifyLaunch?.(target)) ?? { success: false, uri: '' };
  }

  // ── Spotify OAuth & Web API ───────────────────────────────────────────────
  public async spotifyStartAuth(credentials?: { clientId?: string; clientSecret?: string; redirectUri?: string }): Promise<{ success: boolean; url?: string; error?: string }> {
    return (await getApi()?.spotifyStartAuth?.(credentials)) ?? { success: false, error: 'Spotify Auth no disponible' };
  }

  public async spotifyGetSession(): Promise<SpotifySessionStatus> {
    return (await getApi()?.spotifyGetSession?.()) ?? { authenticated: false };
  }

  public async spotifyLogout(): Promise<{ success: boolean }> {
    return (await getApi()?.spotifyLogout?.()) ?? { success: false };
  }

  public async spotifyWebApi(action: string, args?: unknown): Promise<unknown> {
    return await getApi()?.spotifyWebApi?.(action, args);
  }

  public onSpotifySessionUpdated(callback: (session: SpotifySessionStatus) => void): () => void {
    const api = getApi();
    if (api?.onSpotifySessionUpdated) {
      return api.onSpotifySessionUpdated(callback);
    }
    return () => {};
  }

  // ── Modular Functional Configurations ────────────────────────────────────
  public async getModularConfig(): Promise<Record<string, unknown> | null> {
    const api = getApi();
    if (api?.getModularConfig) {
      return await api.getModularConfig();
    }
    return null;
  }

  public async saveModularConfigSection(section: string, data: unknown): Promise<boolean> {
    const api = getApi();
    if (api?.saveModularConfigSection) {
      return await api.saveModularConfigSection(section, data);
    }
    return false;
  }

  // ── Brave Browser & Playwright Automation ─────────────────────────────────
  public async browserNavigate(options: { url: string; timeoutMs?: number }): Promise<{ success: boolean; url: string; title: string; error?: string }> {
    const api = getApi();
    if (api?.browserNavigate) {
      return await api.browserNavigate(options);
    }
    return { success: false, url: options.url, title: '', error: 'Browser automation not available outside Electron' };
  }

  public async browserSearch(options: { query: string; engine?: 'google' | 'brave' | 'duckduckgo' }): Promise<{ success: boolean; query: string; url: string; title: string; error?: string }> {
    const api = getApi();
    if (api?.browserSearch) {
      return await api.browserSearch(options);
    }
    return { success: false, query: options.query, url: '', title: '', error: 'Browser automation not available outside Electron' };
  }

  public async browserPlayYouTube(options: { query: string; autoPlay?: boolean; timeoutMs?: number }): Promise<{
    success: boolean;
    title: string;
    videoUrl: string;
    playing: boolean;
    currentTime: number;
    duration: number;
    error?: string;
  }> {
    const api = getApi();
    if (api?.browserPlayYouTube) {
      return await api.browserPlayYouTube(options);
    }
    return {
      success: false,
      title: '',
      videoUrl: '',
      playing: false,
      currentTime: 0,
      duration: 0,
      error: 'Browser automation not available outside Electron',
    };
  }

  public async browserMediaControl(options: {
    action: 'play' | 'pause' | 'toggle' | 'seek' | 'volume' | 'mute' | 'unmute' | 'fullscreen';
    value?: number;
  }): Promise<{ success: boolean; action: string; playing?: boolean; volume?: number; currentTime?: number; duration?: number; error?: string }> {
    const api = getApi();
    if (api?.browserMediaControl) {
      return await api.browserMediaControl(options);
    }
    return { success: false, action: options.action, error: 'Browser automation not available outside Electron' };
  }

  public async browserClick(options: { selector: string; timeoutMs?: number }): Promise<{ success: boolean; selector: string; error?: string }> {
    const api = getApi();
    if (api?.browserClick) {
      return await api.browserClick(options);
    }
    return { success: false, selector: options.selector, error: 'Browser automation not available outside Electron' };
  }

  public async browserType(options: { selector: string; text: string; pressEnter?: boolean; timeoutMs?: number }): Promise<{ success: boolean; selector: string; error?: string }> {
    const api = getApi();
    if (api?.browserType) {
      return await api.browserType(options);
    }
    return { success: false, selector: options.selector, error: 'Browser automation not available outside Electron' };
  }

  public async browserSnapshot(options?: { maxChars?: number }): Promise<{ success: boolean; title: string; url: string; content: string; error?: string }> {
    const api = getApi();
    if (api?.browserSnapshot) {
      return await api.browserSnapshot(options);
    }
    return { success: false, title: '', url: '', content: '', error: 'Browser automation not available outside Electron' };
  }

  public async browserTakeScreenshot(options?: { fullPage?: boolean }): Promise<{ success: boolean; base64Png?: string; error?: string }> {
    const api = getApi();
    if (api?.browserTakeScreenshot) {
      return await api.browserTakeScreenshot(options);
    }
    return { success: false, error: 'Browser automation not available outside Electron' };
  }

  public async browserEvaluate(options: { script: string }): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const api = getApi();
    if (api?.browserEvaluate) {
      return await api.browserEvaluate(options);
    }
    return { success: false, error: 'Browser automation not available outside Electron' };
  }

  public async browserClose(): Promise<{ success: boolean }> {
    const api = getApi();
    if (api?.browserClose) {
      return await api.browserClose();
    }
    return { success: true };
  }

  public async browserGetStatus(): Promise<{
    running: boolean;
    url?: string;
    title?: string;
    playing?: boolean;
    currentTime?: number;
    duration?: number;
    browserType?: string;
    executablePath?: string;
  }> {
    const api = getApi();
    if (api?.browserGetStatus) {
      return await api.browserGetStatus();
    }
    return { running: false };
  }
}

export const electronBridge = new ElectronBridgeService();
export const ElectronBridge = electronBridge;
export default electronBridge;
