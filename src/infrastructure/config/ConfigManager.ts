/**
 * Cristi Desktop - Resilient Configuration & Backup Manager
 * Handles auto-backups, profile validation, JSON export/import, quota recovery, and settings integrity.
 */

import { publicSettings } from '../../../shared/security';
import { logger } from '../logging/logger';
import { SYSTEM_PERSONA_PROMPT, DEFAULT_MODEL_ID, GEMINI_MODELS } from '../../config/models';
import type { AppConfig } from '../../types/domain.types';

const STORAGE_KEY_CONFIG = 'cristi_ai_settings_v1';
const STORAGE_KEY_BACKUPS = 'cristi_ai_settings_backups_v1';
const MAX_BACKUP_HISTORY = 10;

export interface BackupSnapshot {
  id: string;
  timestamp: string;
  label: string;
  config: Partial<AppConfig>;
}


export interface StorageAdapter {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
}

export class ConfigManager {
  public storageKey = STORAGE_KEY_CONFIG;
  public backupsKey = STORAGE_KEY_BACKUPS;
  private _memoryStore: Record<string, string> = {};

  private _getStorage(): StorageAdapter {
    try {
      if (typeof localStorage !== 'undefined') {
        const testKey = '__storage_test__';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
        return localStorage;
      }
    } catch {
      // Fallback to in-memory store
    }

    return {
      getItem: (k: string) => this._memoryStore[k] || null,
      setItem: (k: string, v: string) => { this._memoryStore[k] = String(v); },
      removeItem: (k: string) => { delete this._memoryStore[k]; }
    };
  }

  /**
   * Loads current persistent configuration with automatic fallback defaults.
   */
  public loadConfig(defaultConfig: Partial<AppConfig> = {}): AppConfig {
    try {
      const storage = this._getStorage();
      const raw = storage.getItem(this.storageKey);
      if (!raw) return this.sanitizeConfig(defaultConfig);

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        logger.warn('CONFIG', 'Formato de configuración local anómalo. Usando valores por defecto.');
        return this.sanitizeConfig(defaultConfig);
      }

      return this.sanitizeConfig({ ...defaultConfig, ...parsed });
    } catch (err: unknown) {
      logger.error('CONFIG', `Error al parsear configuración local: ${err instanceof Error ? err.message : String(err)}. Restaurando valores por defecto.`);
      return this.sanitizeConfig(defaultConfig);
    }
  }

  /**
   * Saves configuration and generates an automatic timestamped backup point.
   */
  public saveConfig(newConfig: Partial<AppConfig>): { success: boolean; config: AppConfig; fallback?: string } {
    const sanitized = this.sanitizeConfig(newConfig);
    const storage = this._getStorage();

    try {
      storage.setItem(this.storageKey, JSON.stringify(sanitized));
      this.createBackupSnapshot(sanitized, 'auto_save');
      return { success: true, config: sanitized };
    } catch (err: unknown) {
      logger.warn('CONFIG', `Fallo al escribir en localStorage (${err instanceof Error ? err.message : String(err)}). Intentando recuperación de cuota...`);

      // Quota recovery strategy: purge old backups and retry
      try {
        storage.removeItem(this.backupsKey);
        storage.setItem(this.storageKey, JSON.stringify(sanitized));
        return { success: true, config: sanitized };
      } catch (retryErr: unknown) {
        this._memoryStore[this.storageKey] = JSON.stringify(sanitized);
        logger.error('CONFIG', `Cuota de almacenamiento agotada; configuración retenida en memoria de sesión: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
        return { success: true, config: sanitized, fallback: 'memory' };
      }
    }
  }

  /**
   * Sanitizes and validates configuration object against expected schema.
   */
  public sanitizeConfig(config: Partial<AppConfig> = {}): AppConfig {
    const base: Record<string, unknown> = config && typeof config === 'object' && !Array.isArray(config)
      ? { ...config }
      : {};

    const envSpotifyClientId = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SPOTIFY_CLIENT_ID) ||
                               (typeof process !== 'undefined' && (process.env?.VITE_SPOTIFY_CLIENT_ID || process.env?.SPOTIFY_CLIENT_ID)) ||
                               '';
    const rawSpotifyClientId = typeof base.spotifyClientId === 'string' ? base.spotifyClientId.trim() : '';
    const safeSpotifyClientId = rawSpotifyClientId || envSpotifyClientId.trim();

    const validModelIds = Object.values(GEMINI_MODELS).map(m => m.id);
    const requestedModel = typeof base.modelId === 'string' ? base.modelId.trim() : '';
    const safeModelId = validModelIds.includes(requestedModel) ? requestedModel : DEFAULT_MODEL_ID;

    const sanitized: AppConfig = {
      apiKey: '',
      hasGeminiCredential: Boolean(base.hasGeminiCredential),
      hasSpotifyCredential: Boolean(base.hasSpotifyCredential),
      modelId: safeModelId,
      voiceName: typeof base.voiceName === 'string' && base.voiceName.trim() ? base.voiceName.trim() : 'Aoede',
      temperature: typeof base.temperature === 'number' && !isNaN(base.temperature) ? Math.max(0, Math.min(2, base.temperature)) : 0.75,
      systemPrompt: typeof base.systemPrompt === 'string' && base.systemPrompt.trim()
        && !base.systemPrompt.includes('1. Respuestas habladas, fluidas, íntimas y concisas:')
        && !base.systemPrompt.includes('Rasgos Fundamentales de tu Identidad y Convivencia:')
        && !base.systemPrompt.includes('Cadencia Seductora, Pausada y Coqueta:')
        ? base.systemPrompt.trim()
        : SYSTEM_PERSONA_PROMPT,
      spotifyClientId: safeSpotifyClientId,
      alwaysOnTop: base.alwaysOnTop === true,
      viewMode: (base.viewMode as AppConfig['viewMode']) || 'torso',
      avatarScale: typeof base.avatarScale === 'number' ? base.avatarScale : 1.0,
      avatarPosition: (base.avatarPosition as AppConfig['avatarPosition']) || { x: 0, y: 0 },
      microphoneDeviceId: typeof base.microphoneDeviceId === 'string' ? base.microphoneDeviceId : 'default',
      speakerDeviceId: typeof base.speakerDeviceId === 'string' ? base.speakerDeviceId : 'default',
      visionEnabled: base.visionEnabled === true,
      screenWatchIntervalMs: typeof base.screenWatchIntervalMs === 'number' ? base.screenWatchIntervalMs : 3000,
      autoReconnect: base.autoReconnect !== false,
      breathingRoomCooldownMs: typeof base.breathingRoomCooldownMs === 'number' ? base.breathingRoomCooldownMs : 2000,
      soundFxEnabled: base.soundFxEnabled !== false,
      soundFxVolume: typeof base.soundFxVolume === 'number' ? base.soundFxVolume : 0.7,
      voiceVolume: typeof base.voiceVolume === 'number' ? base.voiceVolume : 1.0,
      updatedAt: typeof base.updatedAt === 'string' ? base.updatedAt : new Date().toISOString()
    };

    return publicSettings(sanitized);
  }

  /**
   * Creates an internal backup snapshot stored in localStorage.
   */
  public createBackupSnapshot(config: Partial<AppConfig>, label = 'manual'): BackupSnapshot | null {
    try {
      const storage = this._getStorage();
      const historyRaw = storage.getItem(this.backupsKey);
      let history: BackupSnapshot[] = [];

      try {
        const parsedHistory = historyRaw ? JSON.parse(historyRaw) : [];
        if (Array.isArray(parsedHistory)) {
          history = parsedHistory as BackupSnapshot[];
        }
      } catch {
        history = [];
      }

      const snapshot: BackupSnapshot = {
        id: `backup_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toISOString(),
        label,
        config: publicSettings(config)
      };

      const updatedHistory = [snapshot, ...history].slice(0, MAX_BACKUP_HISTORY);
      storage.setItem(this.backupsKey, JSON.stringify(publicSettings(updatedHistory)));
      return snapshot;
    } catch (err: unknown) {
      logger.warn('CONFIG', `No se pudo crear punto de restauración: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Gets list of available backup snapshots.
   */
  public getBackupHistory(): BackupSnapshot[] {
    try {
      const storage = this._getStorage();
      const historyRaw = storage.getItem(this.backupsKey);
      if (!historyRaw) return [];
      const parsed = JSON.parse(historyRaw);
      const clean = publicSettings(Array.isArray(parsed) ? parsed : []) as BackupSnapshot[];
      storage.setItem(this.backupsKey, JSON.stringify(clean));
      return clean;
    } catch {
      return [];
    }
  }

  /**
   * Restores a configuration from a specific backup ID.
   */
  public restoreBackup(backupId: string): { success: boolean; config?: AppConfig; error?: string } {
    try {
      const history = this.getBackupHistory();
      const found = history.find(b => b.id === backupId);
      if (!found || !found.config) {
        throw new Error(`Punto de restauración "${backupId}" no encontrado.`);
      }
      return this.saveConfig(found.config);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('CONFIG', `Error al restaurar copia de seguridad: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Exports configuration to downloadable JSON string.
   */
  public exportConfigJSON(): string {
    const current = this.loadConfig();
    const exportPayload = {
      app: 'Cristi AI Companion',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      config: current
    };
    return JSON.stringify(publicSettings(exportPayload), null, 2);
  }

  /**
   * Imports configuration from JSON string with strict validation.
   */
  public importConfigJSON(jsonString: string): { success: boolean; config?: AppConfig; error?: string } {
    try {
      if (typeof jsonString !== 'string' || !jsonString.trim()) {
        throw new Error('El contenido del archivo está vacío o no es una cadena de texto.');
      }

      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Formato JSON inválido.');
      }

      const configToImport = (parsed as { config?: unknown }).config || parsed;
      if (!configToImport || typeof configToImport !== 'object') {
        throw new Error('No se encontró un bloque de configuración válido en el archivo.');
      }

      const sanitized = this.sanitizeConfig(configToImport as Partial<AppConfig>);
      this.saveConfig(sanitized);
      return { success: true, config: sanitized };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('CONFIG', `Error al importar archivo de configuración: ${msg}`);
      return { success: false, error: msg };
    }
  }
}

export const configManager = new ConfigManager();
export default configManager;
