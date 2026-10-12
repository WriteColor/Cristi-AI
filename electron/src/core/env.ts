import fs from 'fs';
import path from 'path';
import { getAppRootDir } from './paths';

/**
 * Loads project environment variables from `.env` file into `process.env`.
 * Operates gracefully without crashing if `.env` is absent or inaccessible.
 */
export function loadEnvironment(baseDir?: string): void {
  try {
    const rootDir = baseDir || getAppRootDir();
    const candidatePaths = [
      path.join(rootDir, '.env'),
      path.join(process.cwd(), '.env'),
      path.join(__dirname, '../.env'),
      path.join(__dirname, '../../.env'),
      path.join(process.resourcesPath, '.env'),
    ];

    for (const envPath of candidatePaths) {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        for (const rawLine of envContent.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line || line.startsWith('#')) continue;
          const eqIdx = line.indexOf('=');
          if (eqIdx > 0) {
            const key = line.slice(0, eqIdx).trim();
            let val = line.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (key && !process.env[key]) {
              process.env[key] = val;
            }
          }
        }
        break;
      }
    }
  } catch (err) {
    console.warn('[Env] Notice: could not load .env file:', (err as Error).message);
  }
}
