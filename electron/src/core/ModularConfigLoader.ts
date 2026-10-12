import fs from 'node:fs/promises';
import path from 'node:path';
import * as electron from 'electron';
import { getAppRootDir } from './paths.ts';

interface ElectronAppLike {
  isPackaged?: boolean;
  getAppPath?: () => string;
  getPath?: (name: string) => string;
}

const app: ElectronAppLike = (electron as any).app || (electron as any).default?.app || {
  isPackaged: false,
  getAppPath: () => process.cwd(),
  getPath: () => process.cwd(),
};

export class ModularConfigLoader {
  private baseDir: string;
  private userConfigDir: string | null = null;

  constructor(rootDir?: string) {
    this.baseDir = path.join(rootDir || getAppRootDir(), 'config');
    if (!rootDir && app && typeof app.getPath === 'function') {
      try {
        this.userConfigDir = path.join(app.getPath('userData'), 'config');
      } catch (_) {
        this.userConfigDir = null;
      }
    }
  }

  async readSection<T>(filename: string, defaultValue: T): Promise<T> {
    const targetFile = filename.endsWith('.json') ? filename : `${filename}.json`;

    // 1. In packaged Electron, try reading user overrides first
    if (app.isPackaged && this.userConfigDir && this.userConfigDir !== this.baseDir) {
      const userPath = path.join(this.userConfigDir, targetFile);
      try {
        const data = await fs.readFile(userPath, 'utf8');
        return JSON.parse(data) as T;
      } catch (_) {
        // User config not found or invalid; fall through to bundled default
      }
    }

    // 2. Read from baseDir (development config or bundled app.asar/config)
    const fullPath = path.join(this.baseDir, targetFile);
    try {
      const data = await fs.readFile(fullPath, 'utf8');
      return JSON.parse(data) as T;
    } catch (_) {
      return defaultValue;
    }
  }

  async writeSection(filename: string, data: unknown): Promise<void> {
    const targetFile = filename.endsWith('.json') ? filename : `${filename}.json`;
    // In packaged Electron, write to userData to respect read-only app.asar
    const targetDir = (app.isPackaged && this.userConfigDir) ? this.userConfigDir : this.baseDir;

    await fs.mkdir(targetDir, { recursive: true });
    const fullPath = path.join(targetDir, targetFile);
    const tmp = `${fullPath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    try {
      await fs.rename(tmp, fullPath);
    } catch (_) {
      await fs.copyFile(tmp, fullPath);
      await fs.unlink(tmp).catch(() => {});
    }

    // When in development mode and writing spotify.json, also sync standalone server config if present
    if (!app.isPackaged && targetFile === 'spotify.json') {
      try {
        const standaloneConfig = path.join(getAppRootDir(), 'src', 'mcp', 'servers', 'spotify', 'spotify-mcp-server', 'spotify-config.json');
        await fs.writeFile(standaloneConfig, JSON.stringify(data, null, 2), 'utf8').catch(() => {});
      } catch (_) {}
    }
  }

  async loadAll() {
    return {
      app: await this.readSection('app.json', {}),
      models: await this.readSection('models.json', []),
      voices: await this.readSection('voices.json', []),
      avatars: await this.readSection('avatars.json', []),
      prompts: await this.readSection('prompts.json', {}),
      mcp: await this.readSection('mcp.json', { servers: [] }),
      spotify: await this.readSection('spotify.json', {})
    };
  }
}

export const modularConfigLoader = new ModularConfigLoader();

