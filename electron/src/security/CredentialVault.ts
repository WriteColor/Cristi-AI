import { app, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { publicSettings } from '../../../shared/security';

export async function atomicWrite(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temporary, file);
}

class CredentialVault {
  private queue: Promise<unknown> = Promise.resolve();
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(operation);
    this.queue = pending.catch(() => undefined);
    return pending;
  }
  private get file(): string { return path.join(app.getPath('userData'), 'cristi-secrets.json'); }
  private async read(): Promise<Record<string, string>> {
    try { return JSON.parse(await fs.readFile(this.file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
  }
  set(key: string, value: string): Promise<void> {
    return this.run(async () => {
      if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
        throw new Error('Almacenamiento cifrado no disponible.');
      }
      const secrets = await this.read();
      secrets[key] = safeStorage.encryptString(value).toString('base64');
      await atomicWrite(this.file, secrets);
    });
  }
  async get(key: string): Promise<string | null> {
    await this.queue;
    const value = (await this.read())[key];
    if (!value) return null;
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Almacenamiento cifrado no disponible.');
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  }
  delete(key: string): Promise<void> {
    return this.run(async () => { const secrets = await this.read(); delete secrets[key]; await atomicWrite(this.file, secrets); });
  }
  async status() {
    return {
      hasGeminiCredential: Boolean(await this.get('gemini.apiKey')),
    };
  }
  async migrate(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (typeof config.apiKey === 'string' && config.apiKey.trim()) {
      await this.set('gemini.apiKey', config.apiKey.trim());
    }
    return publicSettings(config);
  }
}
export const credentialVault = new CredentialVault();
