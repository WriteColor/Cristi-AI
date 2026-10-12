import { publicSettings } from '../../../shared/security';
import { electronBridge } from '../../services/desktop/ElectronBridge';

const keys = ['cristi_ai_settings_v1'];
function read(key: string): Record<string, unknown> {
  const raw = localStorage.getItem(key);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Configuración anterior inválida.');
  return parsed as Record<string, unknown>;
}
function credentials(legacy: Record<string, unknown>) {
  return { 'gemini.apiKey': legacy.apiKey, 'spotify.clientSecret': legacy.spotifyClientSecret };
}
export function hasLegacyCredentials(): boolean {
  return typeof localStorage !== 'undefined' && keys.some(key => Object.values(credentials(read(key)))
    .some(value => typeof value === 'string' && Boolean(value.trim())));
}
let pending: Promise<void> | null = null;
export function migrateLegacySettings(): Promise<void> {
  if (!pending) pending = migrate().finally(() => { pending = null; });
  return pending;
}
async function migrate(): Promise<void> {
  if (typeof localStorage === 'undefined' || !electronBridge.isElectron) return;
  const canStore = Boolean((window as Window & { electronAPI?: { setSecureSecret?: unknown } }).electronAPI?.setSecureSecret);
  if (!canStore) {
    if (!hasLegacyCredentials()) return;
    // Only the trusted settings preload can write credentials. Open it before
    // replacing legacy localStorage with public settings from main.
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); window.removeEventListener('storage', changed); };
      const changed = () => {
        try { if (!hasLegacyCredentials()) { cleanup(); resolve(); } }
        catch (error) { cleanup(); reject(error); }
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Completa la migración de credenciales en Ajustes.')); }, 30000);
      window.addEventListener('storage', changed);
      electronBridge.openSettingsWindow();
      changed();
    });
    return;
  }
  for (const key of keys) {
    const legacy = read(key);
    for (const [name, value] of Object.entries(credentials(legacy))) {
      if (typeof value === 'string' && value.trim()) {
        const result = await electronBridge.setSecureSecret(name, value.trim());
        if (!result.success) throw new Error('No se pudo migrar la credencial al almacén cifrado.');
      }
    }
    localStorage.setItem(key, JSON.stringify(publicSettings(legacy)));
  }
  const backups = localStorage.getItem('cristi_ai_settings_backups_v1');
  if (backups) localStorage.setItem('cristi_ai_settings_backups_v1', JSON.stringify(publicSettings(JSON.parse(backups))));
}
