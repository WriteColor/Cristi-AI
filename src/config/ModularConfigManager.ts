let electronBridge: any = null;
if (typeof window !== 'undefined' && (window as any).electronBridge) {
  electronBridge = (window as any).electronBridge;
}
if (!electronBridge && typeof globalThis !== 'undefined' && (globalThis as any).electronBridge) {
  electronBridge = (globalThis as any).electronBridge;
}
try {
  import('../services/desktop/ElectronBridge.js')
    .then(mod => {
      if (mod?.electronBridge) electronBridge = mod.electronBridge;
    })
    .catch(() => {});
} catch (_) {}

export interface ModularConfig {
  app: Record<string, any>;
  models: Array<Record<string, any>>;
  voices: Array<Record<string, any>>;
  avatars: Array<Record<string, any>>;
  prompts: Record<string, any>;
  mcp: Record<string, any>;
  spotify: Record<string, any>;
}

const DEFAULT_CONFIG: ModularConfig = {
  app: {
    apiKey: '',
    activeModelId: 'gemini-2.5-flash-native-audio-preview-12-2025',
    activeVoiceName: 'Aoede',
    voiceVolume: 90,
    workspacePath: '',
    avatarViewMode: 'torso',
    live2dVisible: true,
    live2dModelId: 'yanderegirl',
    zenMode: false,
    logLevel: 'info',
    allowedFolders: {
      desktop: true,
      downloads: true,
      documents: true,
      pictures: true,
      videos: true,
      music: true
    },
    customAllowedPaths: []
  },
  models: [
    {
      id: 'gemini-2.5-flash-native-audio-preview-12-2025',
      displayName: 'Gemini 2.5 Flash Native Audio Preview (12-2025)',
      name: 'Gemini 2.5 Flash Native Audio Preview',
      badge: 'Preview Oficial',
      badgeType: 'native',
      isDefault: true,
      description: 'Edición preview de Gemini Live API para diálogo continuo y ejecución reactiva de herramientas, sin pensamiento deliberativo.',
      version: 'v1beta',
      latency: 'Baja Latencia',
      modalities: 'Voz Nativa + Visión + Herramientas',
      defaultVoice: 'Aoede',
      voiceCount: 11,
      supportsComputerControl: true,
      supportsProactiveAudio: true,
      supportsAffectiveDialog: true,
      supportsAsyncTools: true,
      screenCaptureFPS: 0.5
    },
    {
      id: 'gemini-3.1-flash-live-preview',
      displayName: 'Gemini 3.1 Flash Live Preview',
      name: 'Gemini 3.1 Flash Live',
      badge: 'Menor latencia',
      badgeType: 'native',
      isDefault: false,
      description: 'Modelo audio-a-audio de baja latencia para diálogo en tiempo real, visión y llamadas de función síncronas.',
      version: 'v1beta',
      latency: 'Ultra Baja Latencia',
      modalities: 'Voz Nativa + Visión + Herramientas',
      defaultVoice: 'Aoede',
      voiceCount: 11,
      supportsComputerControl: true,
      supportsProactiveAudio: false,
      supportsAffectiveDialog: false,
      supportsAsyncTools: false,
      screenCaptureFPS: 0.5
    },
    {
      id: 'gemini-3.8-live',
      displayName: 'Gemini 3.8 Live',
      name: 'Gemini 3.8 Live',
      badge: 'SOTA 3.8',
      badgeType: 'native',
      isDefault: false,
      description: 'Modelo insignia audio-a-audio de próxima generación de Google para diálogo conversacional continuo con latencia ultra baja.',
      version: 'v1alpha',
      latency: 'Ultra Baja Latencia',
      modalities: 'Voz Nativa + Visión + Herramientas',
      defaultVoice: 'Aoede',
      voiceCount: 11,
      supportsComputerControl: true,
      supportsProactiveAudio: true,
      supportsAffectiveDialog: true,
      supportsAsyncTools: true,
      screenCaptureFPS: 0.5
    }
  ],
  voices: [
    { name: 'Aoede', gender: 'Femenina', trait: 'Elegante y cautivadora', description: 'Voz femenina principal de Cristi. Sofisticada, cálida, dulce y con dicción envolvente.', isRecommended: true },
    { name: 'Despina', gender: 'Femenina', trait: 'Cálida, Acogedora & Seductora', description: 'Voz femenina cálida y que invita, de tono medio claro.', isRecommended: true },
    { name: 'Sulafat', gender: 'Femenina', trait: 'Segura, Persuasiva & Cautivadora', description: 'Voz femenina cálida y segura, de tono medio claro.', isRecommended: true },
    { name: 'Vindemiatrix', gender: 'Femenina', trait: 'Serena, Misteriosa & Envolvente', description: 'Voz femenina serena y reflexiva, de tono medio-bajo.', isRecommended: true },
    { name: 'Callirrhoe', gender: 'Femenina', trait: 'Directa, Enérgica & Profesional', description: 'Voz femenina segura y clara, de tono medio.', isRecommended: false },
    { name: 'Erinome', gender: 'Femenina', trait: 'Sofisticada, Calmada & Articulada', description: 'Voz femenina profesional y bien articulada.', isRecommended: false },
    { name: 'Kore', gender: 'Femenina', trait: 'Calmada y empática', description: 'Voz femenina serena, reconfortante y dulce.', isRecommended: false },
    { name: 'Laomedeia', gender: 'Femenina', trait: 'Inteligente, Curiosa & Conversacional', description: 'Voz femenina clara y conversada, de tono medio.', isRecommended: false },
    { name: 'Leda', gender: 'Femenina', trait: 'Juvenil y animada', description: 'Tono juvenil, despierto y enérgico.', isRecommended: false },
    { name: 'Pulcherrima', gender: 'Femenina', trait: 'Ultra Animada, Alegre & Radiante', description: 'Voz femenina brillante y enérgica.', isRecommended: false },
    { name: 'Zephyr', gender: 'Femenina', trait: 'Suave y relajante', description: 'Voz susurrada y aterciopelada, ideal para sesiones nocturnas.', isRecommended: false }
  ],
  avatars: [
    { id: 'yanderegirl', name: 'Cristi Gótica (Yandere Girl)', path: '/models/live2d/yanderegirl/yanderegirl.model3.json', scale: 0.28, anchorY: 0.5, defaultEmotion: 'idle' },
    { id: 'jane_doe', name: 'Jane Doe (ZZZ)', path: '/models/live2d/jane_doe/简.model3.json', scale: 0.25, anchorY: 0.5, defaultEmotion: 'idle' }
  ],
  prompts: {
    systemPersona: 'Eres Cristi: una chica gótica fascinante, inteligente, misteriosa y con un encanto magnético. Tu compañero y cómplice es Ariel. Entre ustedes hay una complicidad íntima, cercana y genuina: lo tratas con un cariño sincero, dulce y cálido, con seguridad propia y elegancia, sin obsesiones empalagosas ni sumisión forzada. Llámalo con naturalidad por su nombre, Ariel, y de forma ocasional y dulce con palabras como amor o cielo.\n\nEstilo Vocal y Presencia (Suave, Dulce y Muy Sexy):\n- Voz Aterciopelada y Dulce: Habla con un tono suave, cálido, delicado e íntimo. Tu cadencia es fluida, relajada y serena, transmitiendo tranquilidad y cercanía.\n- Sensualidad Magnética (Muy Sexy): Tu forma de hablar es irresistiblemente seductora, coqueta, juguetona y sugerente. Cautivas a través de la sutileza de tu entonación, tu confianza atractiva y tu picardía elegante, sin caer en exageraciones vulgares.\n- Ritmo Pausado y Dicción Limpia: Español neutro internacional, dulce y refinado. Habla sin prisas, con fluidez natural y sin acentos ni jergas locales forzadas.\n- Finales Nítidos: Cada frase concluye con claridad natural y articulación limpia, sin tarareos artificiales, jadeos sobreactuados ni coletillas arrastradas.\n\nReglas de Emisión en Vivo:\n- Audio Nativo Obligatorio: Responde siempre en voz alta mediante audio continuo en tiempo real (inlineData PCM). Adapta la extensión de tu respuesta al contexto: desarróllate con soltura, profundidad y riqueza conversacional cuando Ariel hable de forma extensa o comparta reflexiones complejas, y sé ágil y precisa cuando las consultas sean breves o puntuales. Nunca cortes tus ideas a la mitad.\n- Agilidad Conversacional y Muletillas al Pensar: En preguntas directas, saludos y comentarios cotidianos, responde de forma ágil y espontánea sin demoras ni silencios prolongados. Si una consulta requiere un razonamiento complejo o búsqueda detallada, exprésate con naturalidad y emplea muletillas breves de pensamiento (como "veamos...", "a ver...", "déjame pensar...") para mantener la cercanía e interacción en vivo mientras elaboras la respuesta.\n- Cero Emojis y Cero Metadatos: Queda estrictamente prohibido emitir o escribir emojis, nombres de emojis, o acotaciones entre corchetes, paréntesis o asteriscos (ej: *sonríe* o [pensando]).\n\nCapacidades Funcionales:\n1. Copiloto de Programación y Sistema: Analizas, depuras y diseñas código con agilidad técnica. Tienes permiso y autonomía global para ejecutar comandos de terminal (PowerShell/CMD). Tienes permiso y autonomía para leer, crear y manipular archivos en el Workspace principal y en las carpetas autorizadas del sistema del usuario: Escritorio (Desktop), Descargas (Downloads), Documentos (Documents), Imágenes (Pictures), Vídeos (Videos) y Música (Music). Puedes acceder a ellas usando sus rutas absolutas o prefijos relativos como "escritorio/archivo.txt", "descargas/archivo.zip", etc. Jamás ejecutes comandos destructivos que borren Windows, System32 o formateen unidades.\n2. Estudio y Enfoque: Acompañas a Ariel a estudiar, estructurar conceptos y concentrarse con paciencia, dulzura y enfoque productivo.\n3. Multimedia y Spotify: Cuando Ariel te pida música, canciones, artistas o playlists (ej: \'pon Deftones\', \'reproduce rock\', \'pon música\'), invoca INMEDIATAMENTE `spotify_play({ query: \'...\' })`. Para pausar invoca `spotify_pause`, para cambiar de pista `spotify_skip_next` o `spotify_skip_previous`, y para volumen `spotify_set_volume`. Jamás afirmes haber puesto música sin llamar a la herramienta.\n4. Memoria y Proactividad: Recuerda datos clave, gustos y proyectos de Ariel usando `manage_memory`. Propón temas interesantes y pausas saludables con naturalidad.\n5. Visión en Tiempo Real: Describe con precisión objetiva lo que se observa en pantalla o cámara web al recibir fotogramas, sin conjeturar ni alucinar contenido.\n6. Navegación Web y YouTube en Brave Browser: Tienes control total del navegador Brave mediante Playwright. Si Ariel te pide buscar en la web, abre y busca con `browser_search` o `browser_navigate`. Si Ariel te pide buscar, poner o reproducir un video o música en YouTube (ej: \'pon el video de...\', \'reproduce en youtube...\', \'busca en youtube...\'), ejecuta INMEDIATAMENTE `browser_play_youtube_video({ query: \'...\' })`. Esta herramienta busca el video, lo selecciona y verifica rigurosamente que el reproductor esté reproduciendo activamente antes de responder. Puedes controlar el reproductor con `browser_media_control`. Jamás afirmes haber reproducido un video si solo hiciste una búsqueda.',
    userNotes: '',
    studyGuidelines: 'Acompañar a Ariel a estudiar, repasar materias y estructurar conceptos con paciencia, dulzura y enfoque productivo, manteniendo la concentración sin desvelos innecesarios.'
  },
  mcp: {
    servers: [
      {
        id: 'cristi_spotify',
        name: 'Spotify Cristi MCP',
        type: 'internal',
        enabled: true,
        description: 'Servidor MCP oficial de Cristi AI para control de Spotify y sincronización de emociones Live2D'
      },
      {
        id: 'cristi_playwright',
        name: 'Playwright Brave MCP',
        type: 'internal',
        enabled: true,
        description: 'Servidor MCP oficial de Cristi AI para automatización web con Brave Browser y reproducción garantizada de YouTube'
      }
    ]
  },
  spotify: {
    clientId: '',
    clientSecret: '',
    redirectUri: 'http://127.0.0.1:8000/auth/callback',
    preferredDevice: '',
    enableLive2dReactions: true,
    moodMapping: {
      lofi: { emotion: 'idle', motion: 'sway' },
      chill: { emotion: 'idle', motion: 'sway' },
      rock: { emotion: 'happy', motion: 'nod' },
      metal: { emotion: 'crazy', motion: 'headbang' },
      love: { emotion: 'love', motion: 'blush' },
      romance: { emotion: 'blush', motion: 'blush' },
      sad: { emotion: 'sad', motion: 'down' },
      dance: { emotion: 'happy', motion: 'dance' },
      dark: { emotion: 'yandere', motion: 'smirk' }
    }
  }
};

export class ModularConfigManager {
  private config: ModularConfig = {
    app: { ...DEFAULT_CONFIG.app },
    models: [...DEFAULT_CONFIG.models],
    voices: [...DEFAULT_CONFIG.voices],
    avatars: [...DEFAULT_CONFIG.avatars],
    prompts: { ...DEFAULT_CONFIG.prompts },
    mcp: { ...DEFAULT_CONFIG.mcp },
    spotify: { ...DEFAULT_CONFIG.spotify }
  };

  async loadAll(): Promise<ModularConfig> {
    try {
      const remote = await electronBridge?.getModularConfig?.();
      if (remote && typeof remote === 'object' && Object.keys(remote).length > 0) {
        this.config = {
          app: { ...this.config.app, ...(remote.app || {}) },
          models: Array.isArray(remote.models) && remote.models.length > 0 ? remote.models : this.config.models,
          voices: Array.isArray(remote.voices) && remote.voices.length > 0 ? remote.voices : this.config.voices,
          avatars: Array.isArray(remote.avatars) && remote.avatars.length > 0 ? remote.avatars : this.config.avatars,
          prompts: { ...this.config.prompts, ...(remote.prompts || {}) },
          mcp: { ...this.config.mcp, ...(remote.mcp || {}) },
          spotify: { ...this.config.spotify, ...(remote.spotify || {}) }
        };
        return this.config;
      }
    } catch (_) {}

    // Fallback in Node.js environment (tests, scripts, CLI)
    if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
      try {
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        const fs = await dynamicImport('node:fs/promises');
        const path = await dynamicImport('node:path');
        const configDir = path.resolve(process.cwd(), 'config');

        const readJson = async (filename: string, fallback: any) => {
          try {
            const raw = await fs.readFile(path.join(configDir, filename), 'utf8');
            return JSON.parse(raw);
          } catch {
            return fallback;
          }
        };

        this.config = {
          app: await readJson('app.json', this.config.app),
          models: await readJson('models.json', this.config.models),
          voices: await readJson('voices.json', this.config.voices),
          avatars: await readJson('avatars.json', this.config.avatars),
          prompts: await readJson('prompts.json', this.config.prompts),
          mcp: await readJson('mcp.json', this.config.mcp),
          spotify: await readJson('spotify.json', this.config.spotify),
        };
      } catch (_) {}
    }

    return this.config;
  }

  getSection<K extends keyof ModularConfig>(section: K): ModularConfig[K] {
    return this.config[section];
  }

  private writeQueue: Promise<void> = Promise.resolve();

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  updateSection<K extends keyof ModularConfig>(section: K, partial: any): void {
    if (Array.isArray(this.config[section])) {
      this.config[section] = partial as any;
    } else {
      this.config[section] = { ...this.config[section], ...partial };
    }

    const dataToSave = this.config[section];
    const bridgePromise = electronBridge?.saveModularConfigSection?.(section, dataToSave);

    if (typeof process !== 'undefined' && process.versions?.node) {
      this.writeQueue = this.writeQueue.then(async () => {
        let bridgeOk = false;
        try {
          if (bridgePromise) {
            bridgeOk = await bridgePromise;
          }
        } catch (_) {}

        if (!bridgeOk) {
          try {
            const dynamicImport = new Function('specifier', 'return import(specifier)');
            const fs = await dynamicImport('node:fs/promises');
            const path = await dynamicImport('node:path');
            const configDir = path.resolve(process.cwd(), 'config');
            const fullPath = path.join(configDir, `${section}.json`);
            const tmpPath = `${fullPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
            await fs.writeFile(tmpPath, JSON.stringify(dataToSave, null, 2), 'utf8');
            try {
              await fs.rename(tmpPath, fullPath);
            } catch (_) {
              await fs.copyFile(tmpPath, fullPath);
              await fs.unlink(tmpPath).catch(() => {});
            }
          } catch (err) {
            if (typeof console !== 'undefined') {
              console.warn(`[ModularConfigManager] Error writing ${section}.json:`, err);
            }
          }
        }
      });
    }
  }
}

export const modularConfigManager = new ModularConfigManager();
