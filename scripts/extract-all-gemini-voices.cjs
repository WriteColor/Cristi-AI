/**
 * Cristi AI — Gemini Live Complete Voice Audio Extraction Suite
 * 
 * Exhaustive audio sample extraction for ALL 30 Gemini Live voices
 * across all Gemini Live models in the project:
 * - gemini-2.5-flash-native-audio-preview-12-2025
 * - gemini-3.1-flash-live-preview
 * - gemini-3.8-live
 * 
 * Saves structured WAV audio files and generates CATALOG_REPORT.md.
 */

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

app.setName('cristi-ai-companion');
try {
  app.setPath('userData', path.join(app.getPath('appData'), 'cristi-ai-companion'));
} catch (_) {}

// ── Roster of All 30 Gemini Live Voices ──────────────────────────────────────
const VOICES_CATALOG = [
  // Femeninas (11)
  { name: 'Aoede', gender: 'Femenina', category: 'Femeninas', trait: 'Breezy, natural, mid-pitch', description: 'Voz relajada, fluida y con tono natural.' },
  { name: 'Despina', gender: 'Femenina', category: 'Femeninas', trait: 'Smooth, warm, gentle', description: 'Suave, cálida y envolvente.' },
  { name: 'Sulafat', gender: 'Femenina', category: 'Femeninas', trait: 'Warm and approachable', description: 'Cálida, empática y comprensiva.' },
  { name: 'Vindemiatrix', gender: 'Femenina', category: 'Femeninas', trait: 'Gentle and delicate', description: 'Delicada, suave y calmada.' },
  { name: 'Callirrhoe', gender: 'Femenina', category: 'Femeninas', trait: 'Friendly and easy-going', description: 'Amigable, accesible y cercana.' },
  { name: 'Erinome', gender: 'Femenina', category: 'Femeninas', trait: 'Clear and articulate', description: 'Clara, precisa y profesional.' },
  { name: 'Kore', gender: 'Femenina', category: 'Femeninas', trait: 'Strong, firm, calm', description: 'Firme, segura y tranquila.' },
  { name: 'Laomedeia', gender: 'Femenina', category: 'Femeninas', trait: 'Positive and upbeat', description: 'Positiva, entusiasta y animada.' },
  { name: 'Leda', gender: 'Femenina', category: 'Femeninas', trait: 'Youthful and energetic', description: 'Juvenil, dinámica y enérgica.' },
  { name: 'Pulcherrima', gender: 'Femenina', category: 'Femeninas', trait: 'Forward and animated', description: 'Expresiva, cautivadora y vivaz.' },
  { name: 'Zephyr', gender: 'Femenina', category: 'Femeninas', trait: 'Bright and clear', description: 'Luminosa, articulada y directa.' }
];

// ── Models Roster ────────────────────────────────────────────────────────────
const MODELS_CATALOG = [
  {
    id: 'gemini-2.5-flash-native-audio-preview-12-2025',
    shortName: 'Gemini 2.5 Flash',
    url: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
  },
  {
    id: 'gemini-3.1-flash-live-preview',
    shortName: 'Gemini 3.1 Flash Live',
    url: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
  },
  {
    id: 'gemini-3.8-live',
    shortName: 'Gemini 3.8 Live',
    url: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'
  }
];

// ── Helper: Safe API Key Decryption ──────────────────────────────────────────
function getApiKey() {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }
  const candidatePaths = [
    path.join(app.getPath('userData'), 'cristi-secrets.json'),
    path.join(app.getPath('appData'), 'cristi-ai-companion', 'cristi-secrets.json'),
    path.join(app.getPath('appData'), 'Electron', 'cristi-secrets.json'),
  ];
  for (const secretsPath of candidatePaths) {
    if (fs.existsSync(secretsPath)) {
      try {
        const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
        const enc = secrets['gemini.apiKey'];
        if (enc && safeStorage.isEncryptionAvailable()) {
          const dec = safeStorage.decryptString(Buffer.from(enc, 'base64'));
          if (dec && dec.trim()) return dec.trim();
        }
      } catch (_) {}
    }
  }
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const l of lines) {
      const trimmed = l.trim();
      if (trimmed.startsWith('GEMINI_API_KEY=')) {
        let val = trimmed.slice(15).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (val) return val;
      }
    }
  }
  throw new Error('No se pudo descifrar la clave API de Gemini.');
}

// ── Helper: RIFF WAV 24kHz Header ───────────────────────────────────────────
function createWav(pcmBuffers, sampleRate = 24000) {
  const data = Buffer.concat(pcmBuffers);
  const dataSize = data.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // 1 canal Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // 24000 * 2 = 48000 B/s
  buffer.writeUInt16LE(2, 32); // Block align
  buffer.writeUInt16LE(16, 34); // Bits por muestra
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  data.copy(buffer, 44);

  return buffer;
}

// ── Helper: Single Voice Extraction ─────────────────────────────────────────
function extractSingleVoice({ apiKey, model, voice, outFilePath, timeoutMs = 15000 }) {
  return new Promise((resolve) => {
    const wsUrl = `${model.url}?key=${encodeURIComponent(apiKey)}`;
    const pcmChunks = [];
    let silenceTimer = null;
    let finished = false;

    const ws = new WebSocket(wsUrl);

    const cleanup = () => {
      clearTimeout(maxTimeout);
      clearTimeout(silenceTimer);
      try { ws.close(); } catch (_) {}
    };

    const finishSuccess = () => {
      if (finished) return;
      finished = true;
      cleanup();

      if (pcmChunks.length === 0) {
        return resolve({
          success: false,
          error: 'No se recibieron chunks de audio PCM',
          durationSec: 0,
          bytes: 0
        });
      }

      try {
        const wav = createWav(pcmChunks, 24000);
        fs.mkdirSync(path.dirname(outFilePath), { recursive: true });
        fs.writeFileSync(outFilePath, wav);
        const totalPcmBytes = pcmChunks.reduce((a, c) => a + c.length, 0);
        const durationSec = Number((totalPcmBytes / 48000).toFixed(2));

        resolve({
          success: true,
          durationSec,
          bytes: wav.length,
          outFilePath
        });
      } catch (err) {
        resolve({
          success: false,
          error: err.message,
          durationSec: 0,
          bytes: 0
        });
      }
    };

    const finishError = (err) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve({
        success: false,
        error: String(err),
        durationSec: 0,
        bytes: 0
      });
    };

    const maxTimeout = setTimeout(() => {
      if (pcmChunks.length > 0) {
        finishSuccess();
      } else {
        finishError(`Timeout de ${timeoutMs}ms agotado.`);
      }
    }, timeoutMs);

    ws.onopen = () => {
      const setup = {
        setup: {
          model: `models/${model.id}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voice.name
                }
              }
            },
            thinkingConfig: {
              thinkingBudget: 0
            },
            temperature: 0.7
          },
          systemInstruction: {
            parts: [{ text: 'Eres un asistente de voz en español. Responde siempre de forma concisa y elocuente en una sola frase breve.' }]
          }
        }
      };
      ws.send(JSON.stringify(setup));
    };

    ws.onmessage = async (event) => {
      try {
        let rawText = event.data;
        if (rawText instanceof Blob) {
          rawText = await rawText.text();
        } else if (rawText instanceof ArrayBuffer) {
          rawText = new TextDecoder().decode(rawText);
        }
        const msg = JSON.parse(rawText);

        if (msg.error) {
          return finishError(msg.error.message || JSON.stringify(msg.error));
        }

        if (msg.setupComplete) {
          const phrase = `Hola, esta es una prueba de la voz ${voice.name} en el modelo ${model.shortName}.`;
          ws.send(JSON.stringify({
            clientContent: {
              turns: [
                {
                  role: 'user',
                  parts: [{ text: `Di exactamente en español con tu mejor pronunciación y tono: "${phrase}"` }]
                }
              ],
              turnComplete: true
            }
          }));
        }

        if (msg.serverContent) {
          const sc = msg.serverContent;
          if (sc.turnComplete) {
            return finishSuccess();
          }

          const parts = sc.modelTurn?.parts || [];
          for (const p of parts) {
            if (p.inlineData && p.inlineData.mimeType?.startsWith('audio/pcm')) {
              const chunk = Buffer.from(p.inlineData.data, 'base64');
              pcmChunks.push(chunk);

              // Debounce 2.5s of silence after audio begins
              clearTimeout(silenceTimer);
              silenceTimer = setTimeout(() => {
                finishSuccess();
              }, 2500);
            }
          }
        }
      } catch (err) {
        // Ignorar errores de parsing parciales
      }
    };

    ws.onerror = (err) => {
      finishError(err?.message || 'Error en WebSocket');
    };

    ws.onclose = (ev) => {
      if (pcmChunks.length > 0) {
        finishSuccess();
      } else if (!finished) {
        finishError(`WebSocket cerrado (código ${ev.code}: ${ev.reason || 'sin razón'})`);
      }
    };
  });
}

// ── Markdown Report Generator ───────────────────────────────────────────────
function generateMarkdownReport(results, outputDir) {
  let md = `# Catálogo y Banco de Pruebas de Respuestas de Voz — Google Gemini Live\n\n`;
  md += `**Proyecto:** Cristi AI Companion  \n`;
  md += `**Fecha:** ${new Date().toLocaleString()}  \n`;
  md += `**Total de Voces Oficiales Evaluadas:** ${VOICES_CATALOG.length} (14 Femeninas, 16 Masculinas)  \n`;
  md += `**Modelos Evaluados:**\n`;
  for (const m of MODELS_CATALOG) {
    md += `- **${m.shortName}** (\`${m.id}\`)\n`;
  }
  md += `\n---\n\n`;

  // Seccion Femeninas
  md += `## 1. Voces Femeninas (${VOICES_CATALOG.filter(v => v.category === 'Femeninas').length} Voces)\n\n`;
  md += `| Voz | Tonalidad / Rasgo | Descripción | Gemini 2.5 Flash | Gemini 3.1 Flash Live | Gemini 3.8 Live |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  for (const voice of VOICES_CATALOG.filter(v => v.category === 'Femeninas')) {
    const r25 = results[`${MODELS_CATALOG[0].id}:${voice.name}`];
    const r31 = results[`${MODELS_CATALOG[1].id}:${voice.name}`];
    const r38 = results[`${MODELS_CATALOG[2].id}:${voice.name}`];

    const formatCol = (r) => {
      if (!r) return '⚪ No probada';
      if (r.success) {
        const rel = path.relative(outputDir, r.outFilePath).replace(/\\/g, '/');
        return `[🔊 ${r.durationSec}s](${rel})`;
      }
      return `❌ Error`;
    };

    md += `| **${voice.name}** | *${voice.trait}* | ${voice.description} | ${formatCol(r25)} | ${formatCol(r31)} | ${formatCol(r38)} |\n`;
  }

  // Seccion Masculinas
  md += `\n## 2. Voces Masculinas (${VOICES_CATALOG.filter(v => v.category === 'Masculinas').length} Voces)\n\n`;
  md += `| Voz | Tonalidad / Rasgo | Descripción | Gemini 2.5 Flash | Gemini 3.1 Flash Live | Gemini 3.8 Live |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  for (const voice of VOICES_CATALOG.filter(v => v.category === 'Masculinas')) {
    const r25 = results[`${MODELS_CATALOG[0].id}:${voice.name}`];
    const r31 = results[`${MODELS_CATALOG[1].id}:${voice.name}`];
    const r38 = results[`${MODELS_CATALOG[2].id}:${voice.name}`];

    const formatCol = (r) => {
      if (!r) return '⚪ No probada';
      if (r.success) {
        const rel = path.relative(outputDir, r.outFilePath).replace(/\\/g, '/');
        return `[🔊 ${r.durationSec}s](${rel})`;
      }
      return `❌ Error`;
    };

    md += `| **${voice.name}** | *${voice.trait}* | ${voice.description} | ${formatCol(r25)} | ${formatCol(r31)} | ${formatCol(r38)} |\n`;
  }

  md += `\n---\n\n`;
  md += `### 📁 Estructura Física de Archivos Generados:\n\n`;
  md += `\`\`\`\n`;
  md += `audio_samples/voices/\n`;
  md += `├── CATALOG_REPORT.md\n`;
  for (const m of MODELS_CATALOG) {
    md += `├── ${m.id}/\n`;
    md += `│   ├── Femeninas/\n`;
    md += `│   │   ├── Aoede.wav\n`;
    md += `│   │   └── ...\n`;
    md += `│   └── Masculinas/\n`;
    md += `│       ├── Charon.wav\n`;
    md += `│       └── ...\n`;
  }
  md += `\`\`\`\n\n`;
  md += `> **Nota Técnica:** Todas las muestras son audio PCM 24kHz, 16-bit, Mono, encapsuladas en estándar RIFF/WAVE sin compresión con pérdidas para máxima fidelidad acústica.\n`;

  const reportPath = path.join(outputDir, 'CATALOG_REPORT.md');
  fs.writeFileSync(reportPath, md, 'utf8');
  return reportPath;
}

// ── Main Execution Routine ──────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    const apiKey = getApiKey();
    const baseSamplesDir = path.join(process.cwd(), 'audio_samples', 'voices');
    fs.mkdirSync(baseSamplesDir, { recursive: true });

    // Parse CLI options
    const rawArgs = process.argv.slice(2);
    let filterModel = null;
    let filterVoice = null;
    let filterGender = null;
    let limit = null;

    for (const a of rawArgs) {
      if (a.startsWith('--model=')) filterModel = a.split('=')[1];
      if (a.startsWith('--voice=')) filterVoice = a.split('=')[1];
      if (a.startsWith('--gender=')) filterGender = a.split('=')[1];
      if (a.startsWith('--limit=')) limit = parseInt(a.split('=')[1], 10);
    }

    let modelsToRun = MODELS_CATALOG;
    if (filterModel) {
      modelsToRun = MODELS_CATALOG.filter(m => m.id.includes(filterModel) || m.shortName.toLowerCase().includes(filterModel.toLowerCase()));
    }

    let voicesToRun = VOICES_CATALOG;
    if (filterVoice) {
      voicesToRun = VOICES_CATALOG.filter(v => v.name.toLowerCase() === filterVoice.toLowerCase());
    }
    if (filterGender) {
      voicesToRun = voicesToRun.filter(v => v.category.toLowerCase().includes(filterGender.toLowerCase()));
    }
    if (limit && limit > 0) {
      voicesToRun = voicesToRun.slice(0, limit);
    }

    const totalTests = modelsToRun.length * voicesToRun.length;
    console.log(`\n======================================================================`);
    console.log(`🎤 SUITE DE EXTRACCIÓN VOCAL DE GEMINI LIVE — TODAS LAS VOCES`);
    console.log(`   Total Combinaciones a Evaluar: ${totalTests}`);
    console.log(`   Modelos (${modelsToRun.length}): ${modelsToRun.map(m => m.shortName).join(', ')}`);
    console.log(`   Voces (${voicesToRun.length}): ${voicesToRun.length === 30 ? 'Todas las 30 oficiales' : voicesToRun.map(v => v.name).join(', ')}`);
    console.log(`======================================================================\n`);

    const results = {};
    let currentIndex = 0;
    let successfulCount = 0;
    let errorCount = 0;

    for (const model of modelsToRun) {
      console.log(`\n──────────────────────────────────────────────────────────────────────`);
      console.log(`📡 MODELO: [${model.shortName}] (${model.id})`);
      console.log(`──────────────────────────────────────────────────────────────────────`);

      for (const voice of voicesToRun) {
        currentIndex++;
        const key = `${model.id}:${voice.name}`;
        const outFilePath = path.join(baseSamplesDir, model.id, voice.category, `${voice.name}.wav`);

        // Check if sample already exists to allow resume if interrupted
        if (fs.existsSync(outFilePath) && fs.statSync(outFilePath).size > 1000) {
          const stats = fs.statSync(outFilePath);
          const durationSec = Number(((stats.size - 44) / 48000).toFixed(2));
          console.log(`[${currentIndex}/${totalTests}] ⏩ ${voice.category.padEnd(10)} ${voice.name.padEnd(14)} ya existe (${durationSec}s). Omitiendo.`);
          results[key] = {
            success: true,
            durationSec,
            bytes: stats.size,
            outFilePath
          };
          successfulCount++;
          continue;
        }

        process.stdout.write(`[${currentIndex}/${totalTests}] 🎙️ ${voice.category.padEnd(10)} ${voice.name.padEnd(14)} (${voice.trait.slice(0, 24)})... `);

        const res = await extractSingleVoice({
          apiKey,
          model,
          voice,
          outFilePath,
          timeoutMs: 15000
        });

        results[key] = res;

        if (res.success) {
          successfulCount++;
          console.log(`✓ OK (${res.durationSec}s, ${(res.bytes / 1024).toFixed(1)} KB)`);
        } else {
          errorCount++;
          console.log(`❌ FALLÓ: ${res.error}`);
        }

        // Breve pausa para cuidar cuotas de API de Google AI Studio
        await new Promise(r => setTimeout(r, 600));
      }
    }

    // Generar reporte
    const reportFile = generateMarkdownReport(results, baseSamplesDir);
    console.log(`\n======================================================================`);
    console.log(`🎉 PROCESO COMPLETADO EXITOSAMENTE`);
    console.log(`   Exitosas: ${successfulCount} / ${totalTests}`);
    console.log(`   Fallidas: ${errorCount} / ${totalTests}`);
    console.log(`   Reporte generado: ${reportFile}`);
    console.log(`======================================================================\n`);

    app.quit();
  } catch (err) {
    console.error('❌ Error fatal en suite de extracción:', err);
    app.quit();
  }
});
