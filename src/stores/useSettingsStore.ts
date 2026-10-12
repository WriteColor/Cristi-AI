import { hasLegacyCredentials, migrateLegacySettings } from '../infrastructure/config/LegacySettingsMigration';
import { publicSettings } from '../../shared/security';
import { create } from 'zustand';
import { AppConfig, AllowedFoldersConfig } from '@/types';
import { DEFAULT_MODEL_ID, SYSTEM_PERSONA_PROMPT, resolveLiveModelId } from '../config/models.js';
import { electronBridge } from '../services/desktop/ElectronBridge.js';
import { toastService } from '../infrastructure/notifications/toastService.js';
import { modularConfigManager } from '../config/ModularConfigManager';

const STORAGE_KEY_CONFIG = 'cristi_ai_settings_v1';
// Renderer-side writes must retain their order too. Electron serializes writes
// across windows, but its full-config broadcasts can otherwise briefly put an
// older voice/model back into a controlled selector while a newer patch waits.
let configSaveQueue: Promise<void> = Promise.resolve();
const pendingConfigFields = new Map<string, number>();

function markPendingConfigFields(fields: string[]): void {
  for (const field of fields) pendingConfigFields.set(field, (pendingConfigFields.get(field) || 0) + 1);
}

function clearPendingConfigFields(fields: string[]): void {
  for (const field of fields) {
    const remaining = (pendingConfigFields.get(field) || 1) - 1;
    if (remaining > 0) pendingConfigFields.set(field, remaining);
    else pendingConfigFields.delete(field);
  }
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  apiKey: '',
  modelId: DEFAULT_MODEL_ID || 'gemini-3.1-flash-live-preview',
  voiceName: 'Aoede',
  systemPrompt: SYSTEM_PERSONA_PROMPT,
  temperature: 0.75,
  alwaysOnTop: false,
  viewMode: 'transparent',
  avatarViewMode: 'torso',
  live2dVisible: true,
  live2dModelId: 'yanderegirl',
  avatarScale: 1.0,
  avatarPosition: { x: 0, y: 0 },
  avatarAnchor: 'center',
  microphoneDeviceId: 'default',
  speakerDeviceId: 'default',
  visionEnabled: true,
  visionFaceDetection: true,
  visionObjectDetection: true,
  visionExpressions: true,
  visionHeadlessTimeoutMs: 300000,
  screenWatchIntervalMs: 2000,
  autoReconnect: true,
  breathingRoomCooldownMs: 1500,
  soundFxEnabled: true,
  soundFxVolume: 0.7,
  voiceVolume: 100,
  allowedFolders: {
    desktop: true,
    downloads: true,
    documents: true,
    pictures: true,
    videos: true,
    music: true,
  },
  customAllowedPaths: [],
};

export const defaultCompanionConfig: AppConfig = DEFAULT_APP_CONFIG;

export const DEFAULT_ALLOWED_FOLDERS: AllowedFoldersConfig = {
  desktop: true,
  downloads: true,
  documents: true,
  pictures: true,
  videos: true,
  music: true,
};

function getEnvApiKey(): string { return ''; }

function loadFromLocalStorage(): AppConfig {
  const envKey = getEnvApiKey();
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return {
            ...DEFAULT_APP_CONFIG,
            ...publicSettings(parsed),
            apiKey: '',
          };
        }
      }
    }
  } catch (_) {
    // Fallback to default
  }
  return {
    ...DEFAULT_APP_CONFIG,
    apiKey: envKey,
  };
}

function saveToLocalStorage(config: AppConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      if (!hasLegacyCredentials()) localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(publicSettings(config)));
    }
  } catch (_) {
    // Ignore storage quota errors
  }
}

function normalizeCompanionConfig(config: AppConfig): AppConfig {
  const legacyViewMode = config.viewMode as string;
  const legacyFraming = legacyViewMode === 'torso' || legacyViewMode === 'full' ? legacyViewMode : undefined;
  const normalized: AppConfig = {
    ...config,
    modelId: resolveLiveModelId(config.modelId),
    viewMode: ['transparent', 'windowed', 'pip'].includes(config.viewMode) ? config.viewMode : 'transparent',
    avatarViewMode: config.avatarViewMode || legacyFraming || 'torso',
    avatarAnchor: config.avatarAnchor || 'center',
    live2dVisible: config.live2dVisible !== false,
    live2dModelId: config.live2dModelId === 'jane_doe' ? 'jane_doe' : 'yanderegirl',
    allowedFolders: {
      ...DEFAULT_ALLOWED_FOLDERS,
      ...(config.allowedFolders || {}),
    },
    customAllowedPaths: Array.isArray(config.customAllowedPaths) ? config.customAllowedPaths : [],
  };
  return normalized;
}

export interface SettingsState {
  // --- Core Estado Requerido ---
  config: AppConfig;
  isLoaded: boolean;

  // --- Flattened reactive properties for UI tabs & hooks ---
  apiKey: string;
  showApiKey: boolean;
  modelId: string;
  temperature: number;
  systemPrompt: string;
  voiceName: string;
  voiceVolume: number;
  workspacePath?: string;
  isSettingsWindowOpen: boolean;

  // --- Vision ---
  visionFaceDetection: boolean;
  visionObjectDetection: boolean;
  visionExpressions: boolean;
  visionHeadlessTimeoutMs: number;

  // --- Avatar framing ---
  viewMode: 'torso' | 'full';

  // --- Tabs Navigation & Save Status ---
  activeTab: string;
  saveStatus: 'saved' | 'saving' | null;

  // --- Allowed Folders ---
  allowedFolders: AllowedFoldersConfig;
  customAllowedPaths: string[];

  // --- Core Acciones Requeridas ---
  loadConfig: () => Promise<void>;
  updateConfig: (partial: Partial<AppConfig>) => Promise<void>;
  resetDefaults: () => Promise<void>;
  saveSettings: () => Promise<void>;
  setActiveTab: (tab: string) => void;
  setSaveStatus: (status: 'saved' | 'saving' | null) => void;

  // --- Extended Actions ---
  setField: (field: string, value: unknown) => void;
  setConfig: (configOrUpdater: AppConfig | ((prev: AppConfig) => AppConfig)) => void;
  setIsSettingsWindowOpen: (isOpen: boolean) => void;
  handleOpenSettings: () => void;
  switchAiModel: (modelId: string) => void;
  switchVoice: (voiceName: string) => void;
  setAllowedFolder: (folder: keyof AllowedFoldersConfig, enabled: boolean) => void;
  addCustomAllowedPath: (folderPath: string) => void;
  removeCustomAllowedPath: (folderPath: string) => void;
}

const initialConfig = loadFromLocalStorage();

export const useSettingsStore = create<SettingsState>()((set, get) => {
  // Real-time synchronization with Electron IPC when available
  if (typeof window !== 'undefined') {
    try {
      electronBridge.onConfigUpdated((remoteConfig: Partial<AppConfig>) => {
        if (remoteConfig && typeof remoteConfig === 'object') {
          const localConfig = get().config as unknown as Record<string, unknown>;
          const mergedRaw: Record<string, unknown> = { ...localConfig, ...remoteConfig };
          // A broadcast from another renderer can describe the file before our
          // queued patch reaches Electron. Keep only fields we have locally
          // requested until that patch is acknowledged.
          for (const field of pendingConfigFields.keys()) mergedRaw[field] = localConfig[field];
          const merged: AppConfig = normalizeCompanionConfig(mergedRaw as unknown as AppConfig);
          saveToLocalStorage(merged);
          set({
            config: merged,
            isLoaded: true,
            apiKey: merged.apiKey,
            modelId: merged.modelId,
            temperature: merged.temperature,
            systemPrompt: merged.systemPrompt,
            voiceName: merged.voiceName,
            voiceVolume: merged.voiceVolume ?? 100,
            workspacePath: merged.workspacePath || '',
            visionFaceDetection: merged.visionFaceDetection ?? true,
            visionObjectDetection: merged.visionObjectDetection ?? true,
            visionExpressions: merged.visionExpressions ?? true,
            visionHeadlessTimeoutMs: merged.visionHeadlessTimeoutMs ?? 300000,
            viewMode: merged.avatarViewMode || 'torso',
            allowedFolders: merged.allowedFolders || DEFAULT_ALLOWED_FOLDERS,
            customAllowedPaths: merged.customAllowedPaths || [],
          });
        }
      });
    } catch (_) {
      // Browser only
    }
  }

  return {
    // Core state
    config: initialConfig,
    isLoaded: false,

    // Flattened UI tab bindings
    apiKey: initialConfig.apiKey,
    showApiKey: false,
    modelId: initialConfig.modelId,
    temperature: initialConfig.temperature,
    systemPrompt: initialConfig.systemPrompt,
    voiceName: initialConfig.voiceName,
    voiceVolume: initialConfig.voiceVolume ?? 100,
    workspacePath: initialConfig.workspacePath || '',
    isSettingsWindowOpen: false,

    visionFaceDetection: initialConfig.visionFaceDetection ?? true,
    visionObjectDetection: initialConfig.visionObjectDetection ?? true,
    visionExpressions: initialConfig.visionExpressions ?? true,
    visionHeadlessTimeoutMs: initialConfig.visionHeadlessTimeoutMs ?? 300000,

    viewMode: initialConfig.avatarViewMode || 'torso',

    // Allowed Folders
    allowedFolders: initialConfig.allowedFolders || DEFAULT_ALLOWED_FOLDERS,
    customAllowedPaths: initialConfig.customAllowedPaths || [],

    // Navigation & save status
    activeTab: 'general',
    saveStatus: null,

    saveSettings: async () => {
      set({ saveStatus: 'saving' });
      try {
        const drafts = get();
        if (drafts.apiKey.trim()) {
          await electronBridge.setSecureSecret('gemini.apiKey', drafts.apiKey.trim());
        }

        // Synchronize changes to modularConfigManager 'app' section
        modularConfigManager.updateSection('app', {
          apiKey: drafts.apiKey,
          activeModelId: drafts.modelId,
          modelId: drafts.modelId,
          activeVoiceName: drafts.voiceName,
          voiceName: drafts.voiceName,
          voiceVolume: drafts.voiceVolume,
          workspacePath: drafts.workspacePath || drafts.config.workspacePath || '',
          allowedFolders: drafts.allowedFolders || drafts.config.allowedFolders || DEFAULT_ALLOWED_FOLDERS,
          customAllowedPaths: drafts.customAllowedPaths || drafts.config.customAllowedPaths || [],
        });

        set({ apiKey: '' });
        const credentialStatus = await electronBridge.credentialStatus();
        await get().updateConfig(credentialStatus);

        set({ saveStatus: 'saved' });
        setTimeout(() => {
          if (get().saveStatus === 'saved') {
            set({ saveStatus: null });
          }
        }, 2500);
      } catch (err) {
        set({ saveStatus: null });
      }
    },

    setActiveTab: (tab: string) => set({ activeTab: tab }),
    setSaveStatus: (status: 'saved' | 'saving' | null) => set({ saveStatus: status }),

    // Core Actions
    loadConfig: async () => {
      await migrateLegacySettings();
      let activeConfig = loadFromLocalStorage();

      if (electronBridge.isElectron && typeof electronBridge.getAppConfig === 'function') {
        try {
          const ipcConfig = await electronBridge.getAppConfig();
          if (ipcConfig && typeof ipcConfig === 'object') {
            activeConfig = {
              ...activeConfig,
              ...ipcConfig,
              apiKey: '',
            };
            saveToLocalStorage(activeConfig);
          }
        } catch (err) {
          console.warn('[useSettingsStore] Fallo al cargar configuración vía IPC:', err);
        }
      }

      if (electronBridge.isElectron && typeof electronBridge.credentialStatus === 'function') {
        try {
          const credStatus = await electronBridge.credentialStatus();
          if (credStatus && typeof credStatus === 'object') {
            activeConfig = {
              ...activeConfig,
              ...credStatus,
            };
          }
        } catch (err) {
          console.warn('[useSettingsStore] Fallo al obtener estado de credenciales:', err);
        }
      }

      await modularConfigManager.loadAll();
      const appSection = modularConfigManager.getSection('app') || {};

      activeConfig = normalizeCompanionConfig({
        ...activeConfig,
        apiKey: appSection.apiKey !== undefined ? appSection.apiKey : activeConfig.apiKey,
        modelId: appSection.activeModelId || appSection.modelId || activeConfig.modelId,
        voiceName: appSection.activeVoiceName || appSection.voiceName || activeConfig.voiceName,
        voiceVolume: appSection.voiceVolume !== undefined ? appSection.voiceVolume : (activeConfig.voiceVolume ?? 100),
        workspacePath: appSection.workspacePath !== undefined ? appSection.workspacePath : (activeConfig.workspacePath || ''),
        allowedFolders: appSection.allowedFolders !== undefined ? appSection.allowedFolders : activeConfig.allowedFolders,
        customAllowedPaths: appSection.customAllowedPaths !== undefined ? appSection.customAllowedPaths : activeConfig.customAllowedPaths,
        live2dVisible: appSection.live2dVisible !== undefined ? appSection.live2dVisible : activeConfig.live2dVisible,
        live2dModelId: appSection.live2dModelId || activeConfig.live2dModelId,
        avatarViewMode: appSection.avatarViewMode || activeConfig.avatarViewMode,
        zenMode: appSection.zenMode !== undefined ? appSection.zenMode : activeConfig.zenMode,
      });

      set({
        config: activeConfig,
        isLoaded: true,
        apiKey: appSection.apiKey !== undefined ? appSection.apiKey : activeConfig.apiKey,
        modelId: appSection.activeModelId || appSection.modelId || activeConfig.modelId,
        temperature: activeConfig.temperature,
        systemPrompt: activeConfig.systemPrompt,
        visionFaceDetection: activeConfig.visionFaceDetection ?? true,
        visionObjectDetection: activeConfig.visionObjectDetection ?? true,
        visionExpressions: activeConfig.visionExpressions ?? true,
        visionHeadlessTimeoutMs: activeConfig.visionHeadlessTimeoutMs ?? 300000,
        voiceName: appSection.activeVoiceName || appSection.voiceName || activeConfig.voiceName,
        voiceVolume: appSection.voiceVolume !== undefined ? appSection.voiceVolume : (activeConfig.voiceVolume ?? 100),
        workspacePath: appSection.workspacePath !== undefined ? appSection.workspacePath : (activeConfig.workspacePath || ''),
        viewMode: activeConfig.avatarViewMode || 'torso',
        allowedFolders: activeConfig.allowedFolders || DEFAULT_ALLOWED_FOLDERS,
        customAllowedPaths: activeConfig.customAllowedPaths || [],
      });
    },

    updateConfig: async (partial) => {
      const current = get().config;
      const safePartial = publicSettings(partial) as Partial<AppConfig>;
      const updated: AppConfig = {
        ...current,
        ...safePartial,
        updatedAt: new Date().toISOString(),
      };

      saveToLocalStorage(updated);

      // Synchronize changes to modularConfigManager 'app' section
      const appModularUpdate: Record<string, unknown> = {};
      if (safePartial.apiKey !== undefined) appModularUpdate.apiKey = safePartial.apiKey;
      if (safePartial.modelId !== undefined) {
        appModularUpdate.activeModelId = safePartial.modelId;
        appModularUpdate.modelId = safePartial.modelId;
      }
      if (safePartial.voiceName !== undefined) {
        appModularUpdate.activeVoiceName = safePartial.voiceName;
        appModularUpdate.voiceName = safePartial.voiceName;
      }
      if (safePartial.voiceVolume !== undefined) appModularUpdate.voiceVolume = safePartial.voiceVolume;
      if (safePartial.workspacePath !== undefined) appModularUpdate.workspacePath = safePartial.workspacePath;
      if (safePartial.avatarViewMode !== undefined) appModularUpdate.avatarViewMode = safePartial.avatarViewMode;
      if (safePartial.live2dVisible !== undefined) appModularUpdate.live2dVisible = safePartial.live2dVisible;
      if (safePartial.live2dModelId !== undefined) appModularUpdate.live2dModelId = safePartial.live2dModelId;
      if (safePartial.allowedFolders !== undefined) appModularUpdate.allowedFolders = safePartial.allowedFolders;
      if (safePartial.customAllowedPaths !== undefined) appModularUpdate.customAllowedPaths = safePartial.customAllowedPaths;

      if (Object.keys(appModularUpdate).length > 0) {
        modularConfigManager.updateSection('app', appModularUpdate);
      }

      set({
        config: updated,
        apiKey: safePartial.apiKey !== undefined ? safePartial.apiKey : get().apiKey,
        modelId: updated.modelId,
        temperature: updated.temperature,
        systemPrompt: updated.systemPrompt,
        visionFaceDetection: updated.visionFaceDetection ?? true,
        visionObjectDetection: updated.visionObjectDetection ?? true,
        visionExpressions: updated.visionExpressions ?? true,
        visionHeadlessTimeoutMs: updated.visionHeadlessTimeoutMs ?? 300000,
        voiceName: updated.voiceName,
        voiceVolume: updated.voiceVolume ?? 100,
        workspacePath: updated.workspacePath || '',
        viewMode: updated.avatarViewMode || 'torso',
        allowedFolders: updated.allowedFolders || DEFAULT_ALLOWED_FOLDERS,
        customAllowedPaths: updated.customAllowedPaths || [],
      });

      const fields = Object.keys(safePartial);
      markPendingConfigFields(fields);
      const write = configSaveQueue.then(async () => {
        await migrateLegacySettings();
        if (electronBridge.isElectron && typeof electronBridge.saveAppConfig === 'function') {
          await electronBridge.saveAppConfig(publicSettings({ ...safePartial, updatedAt: updated.updatedAt }));
        }
      });
      configSaveQueue = write.catch(() => undefined);
      try {
        await write;
      } catch (err) {
        console.warn('[useSettingsStore] Fallo al guardar configuración vía IPC:', err);
      } finally {
        clearPendingConfigFields(fields);
      }
    },

    resetDefaults: async () => {
      const envKey = getEnvApiKey();
      const freshConfig: AppConfig = {
        ...DEFAULT_APP_CONFIG,
        apiKey: envKey,
        updatedAt: new Date().toISOString(),
      };

      saveToLocalStorage(freshConfig);
      modularConfigManager.updateSection('app', {
        apiKey: envKey,
        activeModelId: freshConfig.modelId,
        modelId: freshConfig.modelId,
        activeVoiceName: freshConfig.voiceName,
        voiceName: freshConfig.voiceName,
        voiceVolume: freshConfig.voiceVolume ?? 100,
        workspacePath: freshConfig.workspacePath || '',
        allowedFolders: freshConfig.allowedFolders || DEFAULT_ALLOWED_FOLDERS,
        customAllowedPaths: freshConfig.customAllowedPaths || [],
      });

      set({
        config: freshConfig,
        apiKey: freshConfig.apiKey,
        showApiKey: false,
        modelId: freshConfig.modelId,
        temperature: freshConfig.temperature,
        systemPrompt: freshConfig.systemPrompt,
        visionFaceDetection: freshConfig.visionFaceDetection ?? true,
        visionObjectDetection: freshConfig.visionObjectDetection ?? true,
        visionExpressions: freshConfig.visionExpressions ?? true,
        visionHeadlessTimeoutMs: freshConfig.visionHeadlessTimeoutMs ?? 300000,
        voiceName: freshConfig.voiceName,
        voiceVolume: freshConfig.voiceVolume ?? 100,
        workspacePath: freshConfig.workspacePath || '',
        viewMode: freshConfig.avatarViewMode || 'torso',
        allowedFolders: freshConfig.allowedFolders || DEFAULT_ALLOWED_FOLDERS,
        customAllowedPaths: freshConfig.customAllowedPaths || [],
      });

      if (electronBridge.isElectron && typeof electronBridge.saveAppConfig === 'function') {
        try {
          await electronBridge.saveAppConfig(freshConfig);
        } catch (err) {
          console.warn('[useSettingsStore] Fallo al resetear configuración vía IPC:', err);
        }
      }
    },


    setField: (field, value) => {
      if (field === 'apiKey') {
        set({ [field]: String(value) }); return;
      }
      if (field === 'showApiKey') {
        set({ showApiKey: Boolean(value) });
        return;
      }
      if (field === 'viewMode') {
        void get().updateConfig({ avatarViewMode: value === 'full' ? 'full' : 'torso' });
        return;
      }

      // Update both top-level property and internal config
      const partialConfig: Partial<AppConfig> = { [field]: value };
      void get().updateConfig(partialConfig);
    },

    setConfig: (configOrUpdater) => {
      const current = get().config;
      const next = typeof configOrUpdater === 'function' ? configOrUpdater(current) : configOrUpdater;
      void get().updateConfig(next);
    },

    setIsSettingsWindowOpen: (isOpen) => set({ isSettingsWindowOpen: isOpen }),

    handleOpenSettings: () => {
      if (electronBridge.isElectron && typeof electronBridge.openSettingsWindow === 'function') {
        void electronBridge.openSettingsWindow();
      } else {
        set({ isSettingsWindowOpen: true });
      }
    },

    switchAiModel: (modelId) => {
      void get().updateConfig({ modelId });
      toastService.info('Modelo IA', `Motor cambiado a: ${modelId}`);
    },

    switchVoice: (voiceName) => {
      void get().updateConfig({ voiceName });
      toastService.info('Voz de Cristi', `Timbre cambiado a: ${voiceName}`);
    },

    setAllowedFolder: (folder: keyof AllowedFoldersConfig, enabled: boolean) => {
      const currentAllowed = get().config.allowedFolders || DEFAULT_ALLOWED_FOLDERS;
      const updatedAllowed: AllowedFoldersConfig = {
        ...currentAllowed,
        [folder]: enabled,
      };
      void get().updateConfig({ allowedFolders: updatedAllowed });
    },

    addCustomAllowedPath: (folderPath: string) => {
      if (!folderPath || typeof folderPath !== 'string') return;
      const trimmed = folderPath.trim();
      if (!trimmed) return;
      const currentPaths = get().config.customAllowedPaths || [];
      if (!currentPaths.includes(trimmed)) {
        const updatedPaths = [...currentPaths, trimmed];
        void get().updateConfig({ customAllowedPaths: updatedPaths });
      }
    },

    removeCustomAllowedPath: (folderPath: string) => {
      const currentPaths = get().config.customAllowedPaths || [];
      const updatedPaths = currentPaths.filter(p => p !== folderPath);
      void get().updateConfig({ customAllowedPaths: updatedPaths });
    },
  };
});
