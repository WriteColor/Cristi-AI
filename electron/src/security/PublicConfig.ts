import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { atomicWrite, credentialVault } from './CredentialVault';
import { publicSettings } from '../../../shared/security';

let queue: Promise<unknown> = Promise.resolve();
const file = () => path.join(app.getPath('userData'), 'cristi-config.json');

async function readConfigFile(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(file(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError('La configuración debe ser un objeto JSON.');
    return parsed as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    // A hand-edited or interrupted file must never prevent the app from
    // starting. Preserve it for recovery and begin from validated defaults.
    const backup = `${file()}.invalid-${Date.now()}.json`;
    try { await fs.rename(file(), backup); } catch {}
    console.warn('[PublicConfig] Configuración inválida aislada para recuperación:', error);
    return {};
  }
}

export function readPublicConfig(): Promise<Record<string, unknown>> {
  const pending = queue.then(async () => {
    const config = await readConfigFile();
    if (!await credentialVault.get('gemini.apiKey')) config.apiKey ||= process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    const clean = await credentialVault.migrate(config);
    if (JSON.stringify(clean) !== JSON.stringify(config)) await atomicWrite(file(), clean);
    return { ...clean, ...await credentialVault.status() };
  });
  queue = pending.catch(() => undefined);
  return pending;
}

export function writePublicConfig(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const pending = queue.then(async () => {
    const current = await readConfigFile();
    // Every renderer submits a patch. This serialized merge preserves unrelated
    // values changed concurrently by another window.
    const clean = publicSettings({ ...current, ...config });
    await atomicWrite(file(), clean);
    return { ...clean, ...await credentialVault.status() };
  });
  queue = pending.catch(() => undefined);
  return pending;
}
