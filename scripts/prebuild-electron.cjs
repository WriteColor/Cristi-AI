/**
 * Cristi AI Companion — Prebuild Verification & Cache Hardening
 * 
 * Ensures:
 *  1. electron-builder caches (winCodeSign, nsis) are prepared to prevent 7-Zip symlink errors.
 *  2. Native WASAPI audio loopback helper is compiled using csc.exe.
 *  3. Electron main process and preload scripts are built with esbuild.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

function prepareWinCodeSignCache() {
  if (process.platform !== 'win32') return;

  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return;

  const winCodeSignBase = path.join(localAppData, 'electron-builder', 'Cache', 'winCodeSign');
  const targetDir = path.join(winCodeSignBase, 'winCodeSign-2.6.0');

  if (fs.existsSync(targetDir) && fs.existsSync(path.join(targetDir, 'rcedit-x64.exe'))) {
    console.log('[Prebuild] ✓ winCodeSign cache ya se encuentra listo.');
    return;
  }

  if (fs.existsSync(winCodeSignBase)) {
    try {
      const entries = fs.readdirSync(winCodeSignBase, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && /^\d+$/.test(entry.name)) {
          const candidateDir = path.join(winCodeSignBase, entry.name);
          const rceditPath = path.join(candidateDir, 'rcedit-x64.exe');
          if (fs.existsSync(rceditPath)) {
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }
            fs.cpSync(candidateDir, targetDir, { recursive: true, force: true });
            console.log(`[Prebuild] ✓ winCodeSign cache sincronizado en: ${targetDir}`);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[Prebuild] Aviso en preparación de winCodeSign cache:', err.message);
    }
  }
}

function prepareWasapiHelper() {
  if (process.platform !== 'win32') return;

  const source = path.join(ROOT_DIR, 'native', 'CristiWasapiLoopback.cs');
  const script = path.join(ROOT_DIR, 'native', 'build-wasapi-helper.ps1');
  const output = path.join(ROOT_DIR, 'native', 'CristiWasapiLoopback.exe');

  if (!fs.existsSync(source) || !fs.existsSync(script)) {
    console.warn('[Prebuild] Aviso: Archivos fuente de WASAPI no encontrados en native/');
    return;
  }

  const sourceMtime = fs.statSync(source).mtimeMs;
  const outputMtime = fs.existsSync(output) ? fs.statSync(output).mtimeMs : 0;

  if (outputMtime >= sourceMtime) {
    console.log('[Prebuild] ✓ Helper nativo WASAPI loopback actualizado.');
    return;
  }

  console.log('[Prebuild] Compilando helper nativo WASAPI loopback con csc.exe...');
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Source', source, '-Output', output],
    { cwd: ROOT_DIR, stdio: 'inherit', windowsHide: true }
  );

  if (result.status !== 0) {
    console.warn('[Prebuild] Aviso: Helper WASAPI no pudo compilarse; se usará captura de audio fallback.');
  } else {
    console.log('[Prebuild] ✓ Helper nativo WASAPI compilado exitosamente.');
  }
}

function prepareInputHelper() {
  if (process.platform !== 'win32') return;

  const source = path.join(ROOT_DIR, 'native', 'CristiInput.cs');
  const script = path.join(ROOT_DIR, 'native', 'build-input-helper.ps1');
  const output = path.join(ROOT_DIR, 'native', 'CristiInput.exe');

  if (!fs.existsSync(source) || !fs.existsSync(script)) {
    console.warn('[Prebuild] Aviso: Archivos fuente de CristiInput no encontrados en native/');
    return;
  }

  const sourceMtime = fs.statSync(source).mtimeMs;
  const outputMtime = fs.existsSync(output) ? fs.statSync(output).mtimeMs : 0;

  if (outputMtime >= sourceMtime) {
    console.log('[Prebuild] ✓ Helper nativo de entrada de Windows actualizado.');
    return;
  }

  console.log('[Prebuild] Compilando helper nativo CristiInput con csc.exe...');
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Source', source, '-Output', output],
    { cwd: ROOT_DIR, stdio: 'inherit', windowsHide: true }
  );

  if (result.status !== 0) {
    console.warn('[Prebuild] Aviso: Helper CristiInput no pudo compilarse; se usará SendKeys fallback.');
  } else {
    console.log('[Prebuild] ✓ Helper nativo CristiInput compilado exitosamente.');
  }
}

function compileElectron() {
  console.log('[Prebuild] Compilando procesos de Electron...');
  const { buildElectron } = require('./build-electron.cjs');
  buildElectron();
}

function runPrebuild() {
  console.log('─── Iniciando Prebuild de Cristi AI Companion ───');
  prepareWinCodeSignCache();
  prepareWasapiHelper();
  prepareInputHelper();
  compileElectron();
  console.log('─── Prebuild completado exitosamente ───');
}

if (require.main === module) {
  try {
    runPrebuild();
    process.exit(0);
  } catch (err) {
    console.error('[Prebuild Fatal]', err);
    process.exit(1);
  }
}

module.exports = { runPrebuild, prepareWinCodeSignCache, prepareWasapiHelper, compileElectron };
