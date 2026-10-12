import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ROOT_DIR } from './diagnostics.js';

const require = createRequire(import.meta.url);

export function compileWasapiHelper() {
  if (process.platform !== 'win32') return true;
  const source = path.join(ROOT_DIR, 'native', 'CristiWasapiLoopback.cs');
  const script = path.join(ROOT_DIR, 'native', 'build-wasapi-helper.ps1');
  const output = path.join(ROOT_DIR, 'native', 'CristiWasapiLoopback.exe');

  if (!fs.existsSync(source) || !fs.existsSync(script)) return false;
  const res = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Source', source, '-Output', output], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    windowsHide: true
  });
  return res.status === 0;
}

export function compileInputHelper() {
  if (process.platform !== 'win32') return true;
  const source = path.join(ROOT_DIR, 'native', 'CristiInput.cs');
  const script = path.join(ROOT_DIR, 'native', 'build-input-helper.ps1');
  const output = path.join(ROOT_DIR, 'native', 'CristiInput.exe');

  if (!fs.existsSync(source) || !fs.existsSync(script)) return false;
  const res = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Source', source, '-Output', output], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    windowsHide: true
  });
  return res.status === 0;
}

export function compileElectron() {
  const { buildElectron } = require('../build-electron.cjs');
  buildElectron();
  return true;
}

export function cleanArtifacts() {
  const dirs = ['dist', 'release', 'electron/dist', '.tmp'];
  for (const d of dirs) {
    const full = path.join(ROOT_DIR, d);
    if (fs.existsSync(full)) {
      try {
        fs.rmSync(full, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

export function runPostInstall() {
  console.log('[PostInstall] Configurando entorno de Cristi AI Companion...');

  // 1. Ensure .env exists from .env.example
  try {
    const envPath = path.join(ROOT_DIR, '.env');
    const envExamplePath = path.join(ROOT_DIR, '.env.example');
    if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      console.log('   [OK] Archivo .env inicializado desde .env.example');
    } else if (fs.existsSync(envPath)) {
      console.log('   [OK] Archivo .env verificado.');
    }
  } catch (err) {
    console.warn('   [WARN] No se pudo inicializar .env:', err.message);
  }

  // 2. Ensure Electron binary is present
  try {
    const electronPkgDir = path.join(ROOT_DIR, 'node_modules', 'electron');
    const pathTxt = path.join(electronPkgDir, 'path.txt');
    const distExe = path.join(electronPkgDir, 'dist', 'electron.exe');

    const hasBinary =
      (fs.existsSync(pathTxt) && fs.existsSync(fs.readFileSync(pathTxt, 'utf8').trim())) ||
      fs.existsSync(distExe);

    if (!hasBinary) {
      const installScript = path.join(electronPkgDir, 'install.js');
      if (fs.existsSync(installScript)) {
        console.log('   [INFO] Descargando binario nativo de Electron...');
        spawnSync(process.execPath, [installScript], { stdio: 'inherit', cwd: ROOT_DIR });
        console.log('   [OK] Binario de Electron listo.');
      }
    } else {
      console.log('   [OK] Binario de Electron verificado.');
    }
  } catch (err) {
    console.warn('   [WARN] Aviso al verificar binario de Electron:', err.message);
  }

  // 3. Compile Electron main and preload scripts
  try {
    compileElectron();
    console.log('   [OK] Procesos de Electron compilados.');
  } catch (err) {
    console.warn('   [WARN] Fallo en compilación de Electron:', err.message);
  }

  console.log('[OK] [PostInstall] Entorno base listo con éxito.\n');
  return true;
}

export async function executeSetupAction() {
  const wasapiOk = compileWasapiHelper();
  const inputOk = compileInputHelper();
  const electronOk = compileElectron();
  return { wasapiOk, inputOk, electronOk };
}

export async function executeCleanAction() {
  cleanArtifacts();
}

export async function executeBuildAll() {
  compileWasapiHelper();
  compileInputHelper();
  return compileElectron();
}

const currentFilePath = fileURLToPath(import.meta.url);
const executedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (executedFilePath === currentFilePath) {
  if (process.argv.includes('--clean')) {
    cleanArtifacts();
    console.log('[TUI] Directorios dist/, release/ y electron/dist/ limpiados.');
  }

  if (process.argv.includes('--postinstall')) {
    runPostInstall();
  }
}

export default {
  compileWasapiHelper,
  compileInputHelper,
  compileElectron,
  cleanArtifacts,
  runPostInstall,
  executeSetupAction,
  executeCleanAction,
  executeBuildAll
};

