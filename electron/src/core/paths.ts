import * as electron from 'electron';
import path from 'path';
import fs from 'fs';

interface ElectronAppLike {
  isPackaged?: boolean;
  getAppPath?: () => string;
}

const app: ElectronAppLike = (electron as any).app || (electron as any).default?.app || {
  isPackaged: false,
  getAppPath: () => process.cwd()
};

let cachedRootDir: string | null = null;

/**
 * Returns the definitive root directory for the application across:
 * - Development (Vite dev server + raw Electron)
 * - Development compiled (`electron electron/main.cjs`)
 * - Packaged application (`resources/app.asar` or `resources/app`)
 */
export function getAppRootDir(): string {
  if (cachedRootDir) return cachedRootDir;

  if (app.isPackaged) {
    // In packaged Electron, app.getAppPath() returns the path to app.asar or app directory
    cachedRootDir = (app.getAppPath?.() || process.cwd()) as string;
    return cachedRootDir;
  }

  // 1. Try app.getAppPath() first
  try {
    const appPath = app.getAppPath?.();
    if (appPath && fs.existsSync(path.join(appPath, 'package.json'))) {
      cachedRootDir = appPath;
      return cachedRootDir;
    }
  } catch (_) {}

  // 2. Search upwards from __dirname for package.json
  let curr = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(curr, 'package.json'))) {
      cachedRootDir = curr;
      return cachedRootDir;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }

  // 3. Fallback to process.cwd()
  cachedRootDir = process.cwd();
  return cachedRootDir;
}

/**
 * Resolves an asset path within the application bundle or public directory.
 */
export function resolveAppPath(...relativeSegments: string[]): string {
  return path.join(getAppRootDir(), ...relativeSegments);
}
