'use strict';

/**
 * Cristi AI Companion — Electron Main Process Loader
 * 
 * Acts as a clean and robust loader that runs the compiled modular TypeScript
 * main process (`electron/dist/main.cjs`) or transparently compiles `electron/src/main.ts`
 * on the fly during development using esbuild.
 */

const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const compiledMainPath = path.join(__dirname, 'dist/main.cjs');
const srcMainPath = path.join(__dirname, 'src/main.ts');

function shouldRecompile() {
  if (!fs.existsSync(compiledMainPath)) return true;
  if (!fs.existsSync(srcMainPath)) return false;

  try {
    const compiledMtime = fs.statSync(compiledMainPath).mtimeMs;
    const srcMtime = fs.statSync(srcMainPath).mtimeMs;
    // Check if any file in electron/src was updated after the compiled bundle
    if (srcMtime > compiledMtime) return true;

    const srcFiles = fs.readdirSync(path.join(__dirname, 'src'), { recursive: true });
    for (const file of srcFiles) {
      const fullPath = path.join(__dirname, 'src', file);
      if (fs.statSync(fullPath).mtimeMs > compiledMtime) {
        return true;
      }
    }
  } catch (_) {
    return true;
  }
  return false;
}

function ensureCompiled() {
  if (shouldRecompile()) {
    try {
      const { buildElectron } = require('../scripts/build-electron.cjs');
      buildElectron();
    } catch (err) {
      console.warn('[Loader] Auto-compile with build-electron.cjs failed, attempting fallback esbuild:', err.message);
      try {
        const esbuild = require('esbuild');
        esbuild.buildSync({
          entryPoints: [srcMainPath],
          bundle: true,
          platform: 'node',
          target: 'node20',
          format: 'cjs',
          outfile: compiledMainPath,
          external: [
            'electron',
            'prism-media',
            '@modelcontextprotocol/sdk',
            'node:sqlite',
            'playwright-core'
          ],
          sourcemap: 'inline'
        });
        console.log('[Loader] ✓ Compiled on-the-fly with esbuild.');
      } catch (fallbackErr) {
        console.error('[Loader] Fatal: could not compile electron/src/main.ts:', fallbackErr);
      }
    }
  }
}

// ── Bootstrap Execution ─────────────────────────────────────────────────────
try {
  ensureCompiled();

  if (fs.existsSync(compiledMainPath)) {
    require(compiledMainPath);
  } else {
    throw new Error(`Compiled entrypoint not found at ${compiledMainPath}`);
  }
} catch (fatalErr) {
  console.error('[Loader] Fatal error bootstrapping Cristi AI Companion:', fatalErr);
  process.exit(1);
}
