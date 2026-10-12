import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

export async function runFullDiagnostics() {
  const items = [];

  // 1. Node.js & pnpm
  const nodeVersion = process.version;
  const majorNode = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  items.push({
    id: 'node',
    name: 'Entorno Node.js',
    status: majorNode >= 20 ? 'OK' : 'FAIL',
    details: `${nodeVersion} (mínimo v20)`
  });

  // 2. Live2D Cubism Core
  const cubismCore = path.join(ROOT_DIR, 'public', 'live2dcubismcore.min.js');
  const cubismExists = fs.existsSync(cubismCore) && fs.statSync(cubismCore).size > 50000;
  items.push({
    id: 'cubism_core',
    name: 'Live2D Cubism Core 4',
    status: cubismExists ? 'OK' : 'FAIL',
    details: cubismExists ? 'public/live2dcubismcore.min.js presente' : 'Falta librería Cubism Core'
  });

  // 3. Modelos Live2D Aprobados
  const yanderePath = path.join(ROOT_DIR, 'public', 'models', 'live2d', 'yanderegirl', 'yanderegirl.model3.json');
  const janePath = path.join(ROOT_DIR, 'public', 'models', 'live2d', 'jane_doe', '简.model3.json');
  const modelsOk = fs.existsSync(yanderePath) && fs.existsSync(janePath);
  items.push({
    id: 'live2d_models',
    name: 'Modelos Live2D (Yandere & Jane)',
    status: modelsOk ? 'OK' : 'FAIL',
    details: modelsOk ? '2/2 modelos oficiales listos' : 'Modelos faltantes en public/models/live2d'
  });

  // 4. Modelos de Visión y Redes Neuronales
  const faceApiManifest = path.join(ROOT_DIR, 'public', 'models', 'face_landmark_68_model-weights_manifest.json');
  const visionOk = fs.existsSync(faceApiManifest);
  items.push({
    id: 'ai_models',
    name: 'Pesos IA (Face-API / Visión)',
    status: visionOk ? 'OK' : 'WARN',
    details: visionOk ? 'Pesos neuronales disponibles' : 'Pesos neuronales no encontrados'
  });

  // 5. Helper Nativo WASAPI (Windows)
  const isWindows = process.platform === 'win32';
  const wasapiExe = path.join(ROOT_DIR, 'native', 'CristiWasapiLoopback.exe');
  const wasapiOk = fs.existsSync(wasapiExe);
  items.push({
    id: 'wasapi',
    name: 'Loopback Audio WASAPI Nativo',
    status: !isWindows ? 'OK' : (wasapiOk ? 'OK' : 'WARN'),
    details: !isWindows
      ? 'No requerido en plataformas no-Windows'
      : (wasapiOk ? 'native/CristiWasapiLoopback.exe compilado' : 'Requiere compilación con csc.exe')
  });

  // 6. Helper Nativo Entrada Windows (CristiInput)
  const inputExe = path.join(ROOT_DIR, 'native', 'CristiInput.exe');
  const inputOk = fs.existsSync(inputExe);
  items.push({
    id: 'input_helper',
    name: 'Automatización Entrada Windows',
    status: !isWindows ? 'OK' : (inputOk ? 'OK' : 'WARN'),
    details: !isWindows
      ? 'No requerido en plataformas no-Windows'
      : (inputOk ? 'native/CristiInput.exe compilado' : 'Requiere compilación con csc.exe')
  });

  // 7. Archivos de Configuración Modulares (config/*.json)
  const configFiles = ['app.json', 'avatars.json', 'mcp.json', 'models.json', 'prompts.json', 'spotify.json', 'voices.json'];
  let missingConfigs = 0;
  for (const file of configFiles) {
    const p = path.join(ROOT_DIR, 'config', file);
    if (!fs.existsSync(p)) missingConfigs++;
  }
  items.push({
    id: 'configs',
    name: 'Configuraciones Modulares (config/)',
    status: missingConfigs === 0 ? 'OK' : 'FAIL',
    details: missingConfigs === 0 ? '7/7 archivos JSON verificados' : `${missingConfigs} archivo(s) faltantes`
  });

  // 7. Spotify MCP Server
  const spotifyConfigFile = path.join(ROOT_DIR, 'config', 'spotify.json');
  let spotifyConfigured = false;
  if (fs.existsSync(spotifyConfigFile)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(spotifyConfigFile, 'utf8'));
      spotifyConfigured = Boolean(cfg.clientId && cfg.clientSecret);
    } catch (_) {}
  }
  items.push({
    id: 'spotify_mcp',
    name: 'Spotify MCP Integration',
    status: spotifyConfigured ? 'OK' : 'WARN',
    details: spotifyConfigured ? 'Credenciales configuradas' : 'Requiere Client ID & Secret en settings'
  });

  return {
    timestamp: Date.now(),
    allOk: items.every(i => i.status === 'OK' || i.status === 'WARN'),
    items
  };
}

export default {
  runFullDiagnostics,
  ROOT_DIR
};
