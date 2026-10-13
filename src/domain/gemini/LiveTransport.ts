import { liveServerMessageSchema, type LiveClientOptions, type LiveToolResponse } from './protocol.ts';
import type { LiveSessionPort } from '../../app/ports';
import { LiveSessionSupervisor } from './LiveSessionSupervisor.ts';
import { AudioInputQueue } from './AudioInputQueue.ts';
import { electronBridge } from '../../services/desktop/ElectronBridge.ts';
/**
 * Cristi AI - Gemini Multimodal Live API WebSocket Client
 * Bi-directional real-time communication for audio, video, text, and tool calls.
 * Includes Session Resumption support, Exponential Backoff auto-reconnection,
 * and instantaneous Barge-in interruption handling.
 */

import { SYSTEM_PERSONA_PROMPT, DEFAULT_MODEL_ID, getLiveEndpointConfig, resolveLiveModelId } from '../../config/models.ts';
import { getLiveToolsConfig } from '../../config/tools.ts';
import type { GeminiFunctionDeclaration } from '../../types/gemini.types';
import { sanitizeVoiceForModel } from '../../config/voices.ts';
import { logger } from '../../infrastructure/logging/logger.ts';
import { memoryService } from '../integrations/memory/MemoryService.ts';
import { mcpClientManager } from '../integrations/mcp/MCPClientManager.ts';
import { proactiveScheduler } from '../interaction/ProactiveScheduler.ts';
import { LiveSessionTelemetry } from './LiveSessionTelemetry.ts';
import { geminiLiveOrchestrator } from './GeminiLiveOrchestrator.ts';
import { sessionTranscriptBuffer } from './SessionTranscriptBuffer.ts';

export class GeminiLiveSocket implements LiveSessionPort {
  modelId: string;
  voiceName: string;
  systemPrompt: string;
  sessionId: string;
  temperature: number;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  responseWatchdogMs: number;
  _connectEpoch: number;
  _generationStarted: boolean;
  includeCompanionContext: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isExplicitDisconnect: boolean;
  awaitingTextResponse: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  responseWatchdogTimer: ReturnType<typeof setTimeout> | undefined;
  _setupTimer: ReturnType<typeof setTimeout> | undefined;
  _goAwayTimer: ReturnType<typeof setTimeout> | undefined;
  _audioDrainTimer: ReturnType<typeof setTimeout> | undefined;
  websocket: WebSocket | null;
  sessionResumptionHandle: string | null;
  private lastLoggedResumptionHandle: string | null;
  private lastResumptionLogAt = 0;
  supervisor: LiveSessionSupervisor;
  inputQueue: AudioInputQueue;
  cancelledTools: Set<string>;
  completedTools: Set<string>;
  tools: unknown[] | null;
  tokenProvider: NonNullable<LiveClientOptions['tokenProvider']>;
  _messageChain: Promise<void>;
  onGenerationComplete: NonNullable<LiveClientOptions['onGenerationComplete']>;
  onGenerationStart: NonNullable<LiveClientOptions['onGenerationStart']>;
  onToolCallCancellation: NonNullable<LiveClientOptions['onToolCallCancellation']>;
  onOpen: NonNullable<LiveClientOptions['onOpen']>;
  onSetupComplete: NonNullable<LiveClientOptions['onSetupComplete']>;
  onClose: NonNullable<LiveClientOptions['onClose']>;
  onError: NonNullable<LiveClientOptions['onError']>;
  onAudioChunk: NonNullable<LiveClientOptions['onAudioChunk']>;
  onThoughtChunk: NonNullable<LiveClientOptions['onThoughtChunk']>;
  onTurnComplete: NonNullable<LiveClientOptions['onTurnComplete']>;
  onInterrupted: NonNullable<LiveClientOptions['onInterrupted']>;
  onTelemetry: NonNullable<LiveClientOptions['onTelemetry']>;
  onToolCall: NonNullable<LiveClientOptions['onToolCall']>;
  onReconnecting: NonNullable<LiveClientOptions['onReconnecting']>;
  onInteractionStatus: NonNullable<LiveClientOptions['onInteractionStatus']>;
  audioPlayback: { stopImmediate: () => void } | null;

  telemetry: LiveSessionTelemetry;

  constructor({
    tokenProvider = (model) => electronBridge.requestLiveToken(model),
    onGenerationComplete = () => {},
    onGenerationStart = () => {},
    onToolCallCancellation = () => {},
    onInteractionStatus = () => {},
    modelId = DEFAULT_MODEL_ID,
    voiceName = 'Aoede',
    systemPrompt = SYSTEM_PERSONA_PROMPT,
    temperature = 0.75,
    onOpen,
    onSetupComplete,
    onClose,
    onError,
    onAudioChunk,
    onThoughtChunk,
    onInterrupted,
    onTurnComplete,
    onTelemetry,
    onToolCall,
    onReconnecting,
    maxReconnectAttempts = 5,
    responseWatchdogMs = 45000,
    sessionId = null,
    includeCompanionContext = true,
    tools = null,
    audioPlayback = null,
  }: LiveClientOptions = {}) {
    this.tokenProvider = tokenProvider;
    this.audioPlayback = audioPlayback || null;
    this.onGenerationComplete = onGenerationComplete;
    this.onGenerationStart = onGenerationStart;
    this.onToolCallCancellation = onToolCallCancellation;
    this.supervisor = new LiveSessionSupervisor(maxReconnectAttempts);
    this.inputQueue = new AudioInputQueue();
    this.cancelledTools = new Set();
    this.completedTools = new Set();
    this._generationStarted = false;
    this._connectEpoch = 0;
    this._audioDrainTimer = undefined;
    this._goAwayTimer = undefined;
    this.modelId = modelId;
    this.voiceName = voiceName;
    this.systemPrompt = systemPrompt;
    this.includeCompanionContext = includeCompanionContext;
    this.tools = Array.isArray(tools) ? tools : null;
    this.temperature = temperature;
    this.sessionId = sessionId || `live_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.telemetry = new LiveSessionTelemetry();

    this.onOpen = onOpen || (() => {});
    this.onSetupComplete = onSetupComplete || (() => {});
    this.onClose = onClose || (() => {});
    this.onError = onError || console.error;
    this.onAudioChunk = onAudioChunk || (() => {});
    this.onThoughtChunk = onThoughtChunk || (() => {});
    this.onTurnComplete = onTurnComplete || (() => {});
    this.onInterrupted = onInterrupted || (() => {});
    this.onTelemetry = onTelemetry || (() => {});
    this.onToolCall = onToolCall || (() => {});
    this.onReconnecting = onReconnecting || (() => {});
    this.onInteractionStatus = onInteractionStatus || (() => {});

    this.websocket = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.sessionResumptionHandle = null;
    this.lastLoggedResumptionHandle = null;
    this.isExplicitDisconnect = false;

    // Bounded reconnect budget survives short-lived successful sockets.
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.reconnectTimer = undefined;
    this.responseWatchdogMs = Math.max(1000, Number(responseWatchdogMs) || 45000);
    this.responseWatchdogTimer = undefined;
    this.awaitingTextResponse = false;
    this._setupTimer = undefined;
    this._messageChain = Promise.resolve();
  }

  async connect() {
    if (this.isConnected || this.isConnecting) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;

    this.isConnecting = true;
    this.isExplicitDisconnect = false;
    logger.info('GEMINI', `Iniciando conexión WebSocket Live con modelo: ${this.modelId} (Intento #${this.reconnectAttempts + 1})...`);

    const epoch = ++this._connectEpoch;
    try {
      const activeModelId = resolveLiveModelId(this.modelId);
      const token = await this.tokenProvider(activeModelId);
      if (epoch !== this._connectEpoch || this.isExplicitDisconnect) return;
      const endpointConfig = getLiveEndpointConfig(activeModelId);
      const wsBase = endpointConfig.url;
      const wsUrl = token.startsWith('auth_tokens/')
        ? `${wsBase}?access_token=${encodeURIComponent(token)}`
        : `${wsBase}?key=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      this.websocket = ws;
      ws.binaryType = 'arraybuffer';
      this._messageChain = Promise.resolve();
      this._setupTimer = setTimeout(() => {
        if (this.websocket === ws && !this.isConnected) ws.close(4000, 'Tiempo de conexión agotado');
      }, 20000);

      this.websocket.onopen = () => {
        if (this.websocket !== ws || this.isExplicitDisconnect) return;
        logger.info('GEMINI', 'Conexión WebSocket establecida con Google AI Studio.');
        this.sendInitialSetup();
      };

      this.websocket.onmessage = (event) => {
        if (this.websocket !== ws || this.isExplicitDisconnect) return;
        this._messageChain = this._messageChain
          .then(() => this.handleServerMessage(event.data, ws))
          .catch((err) => logger.warn('GEMINI', 'Mensaje Live inválido:', err));
      };

      this.websocket.onerror = (error) => {
        logger.warn('GEMINI', 'Aviso en canal WebSocket de Gemini Live:', error);
      };

      this.websocket.onclose = (event) => {
        if (this.websocket !== ws) return;
        clearTimeout(this._setupTimer);
        this.websocket = null;
        const wasClean = event.wasClean;
        const code = event.code;
        const reason = event.reason;

        this.isConnected = false;
        this.isConnecting = false;
        this.clearInputQueue();


        // Manejo de estado corrupto: invalidar y limpiar sessionResumptionHandle ante códigos de error del servidor o sesión expirada
        if (
          [1008, 1011, 400, 4000, 4008].includes(code) ||
          /expired|resumption|invalid|policy|corrupt|goaway/i.test(reason)
        ) {
          logger.warn('GEMINI', `Invalidando sessionResumptionHandle tras cierre ${code} ("${reason || 'sin razón'}"). Se solicitará sesión limpia y token nuevo.`);
          this.sessionResumptionHandle = null;
        }

        if (this.isExplicitDisconnect) {
          logger.info('GEMINI', 'Sesión cerrada explícitamente por el usuario.');
          void memoryService.endSession({ sessionId: this.sessionId, source: 'gemini_live' });
          this.onClose(event);
          return;
        }

        logger.warn('GEMINI', `WebSocket cerrado por red o servidor (código ${code}, razón: "${reason || 'desconexión'}", wasClean: ${wasClean})`);

        // Always automatically reconnect unless permanent auth failure or reached max attempts
        const nextDelay = this.supervisor.nextDelay(code, reason);
        if (nextDelay !== null) {
          this.reconnectAttempts++;
          const delay = nextDelay;
          logger.info('GEMINI', `Reconectando automáticamente en ${(delay / 1000).toFixed(1)}s (Intento #${this.reconnectAttempts}, Resumption: ${this.sessionResumptionHandle ? 'Activo' : 'Nuevo'})...`);

          this.onReconnecting(this.reconnectAttempts, delay);

          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            if (!this.isExplicitDisconnect && !this.isConnected) {
              this.connect();
            }
          }, delay);
          return;
        }

        const detail = reason || (code === 1008 ? 'Solicitud rechazada por política del proveedor.' : 'Conexión terminada por el servidor.');
        void memoryService.endSession({ sessionId: this.sessionId, source: 'gemini_live' });
        this.onError(new Error(`Llamada terminada (${code}): ${detail}`));
        this.onClose(event);
      };
    } catch (err) {
      this.isConnecting = false;
      clearTimeout(this._setupTimer);
      this.clearInputQueue();
      logger.warn('GEMINI', 'Fallo al instanciar WebSocket:', err);
      this.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Builds the initial BidiGenerateContentSetup message object
   */
  buildInitialSetup() {
    const endpointConfig = getLiveEndpointConfig(this.modelId);
    const controller = geminiLiveOrchestrator.getController(this.modelId);
    const validatedVoice = sanitizeVoiceForModel(endpointConfig.endpointId, this.voiceName);

    const memoryContext = memoryService.getSystemPromptContext();
    const schedulerContext = proactiveScheduler.getPromptContext();
    const transcriptHistory = sessionTranscriptBuffer.getFormattedTranscript();

    const realtimeVisionDirective = '\n\n[DIRECTIVA ESTRICTA ANTI-ALUCINACIÓN Y VISIÓN EN TIEMPO REAL:\n' +
      '1. PROHIBICIÓN ABSOLUTA DE ADIVINAR O DESCRIBIR A CIEGAS: Jamás describas, inventes ni asumas qué hay en pantalla, ventana o cámara sin haber recibido previamente el fotograma procesado mediante `capture_vision`. Si el usuario te pide ver o mirar algo ("mira mi pantalla", "qué ves", "mira VS Code", "mira arriba a la derecha"), emite de inmediato una muletilla brevísima de pensamiento ("Veamos...", "A ver...") y ejecuta en ese mismo instante `capture_vision({ target: "...", query: "..." })`. Espera el resultado del fotograma antes de detallar cualquier contenido visual.\n' +
      '2. COMANDOS NATURALES DE VISIÓN: Para ver una ventana o pantalla usa `capture_vision({ target: "window", query: "..." })` o `capture_vision({ target: "screen" })`. Si el usuario pide que apagues o dejes de mirar ("apaga la visión", "deja de mirar", "ya no mires"), invoca inmediatamente `set_vision_stream({ enabled: false })`.\n' +
      '3. Para consultar las aplicaciones abiertas, usa `list_open_windows`.\n' +
      '4. Una imagen previa nunca demuestra qué hay ahora; basa tu respuesta únicamente en el fotograma recién capturado.]';

    const continuityDirective = '\n\n[DIRECTIVA DE CONTINUIDAD Y PROHIBICIÓN DE BÚSQUEDA A CIEGAS]:\n' +
      'El contexto conversacional inmediato de sesiones anteriores está inyectado directamente en tus instrucciones. Sabes de qué estabas hablando con Ariel sin necesidad de consultar herramientas.\n' +
      'Queda terminantemente prohibido llamar en bucle a `search_memory`, `manage_memory`, o inspeccionar logs técnicos para "averiguar" temas anteriores tras reconexiones.\n' +
      'Si en algún momento no recuerdas un detalle específico de una sesión antigua, responde con total naturalidad humana ("Recuérdame de qué estábamos hablando, amor" o "¿en qué nos habíamos quedado?") en lugar de hacer llamadas de herramientas a ciegas.';

    const basePrompt = this.includeCompanionContext
      ? `${this.systemPrompt}${realtimeVisionDirective}${continuityDirective}`
      : this.systemPrompt;
    const enrichedPrompt = controller.getEnrichedPrompt(
      basePrompt,
      this.includeCompanionContext ? memoryContext : '',
      this.includeCompanionContext ? schedulerContext : '',
      this.includeCompanionContext ? transcriptHistory : ''
    );

    const mcpDeclarations = mcpClientManager.getGeminiFunctionDeclarations();
    const liveTools = this.tools ?? getLiveToolsConfig(mcpDeclarations);

    return controller.buildSetupMessage({
      modelId: this.modelId,
      endpointId: endpointConfig.endpointId,
      voiceName: validatedVoice,
      temperature: this.temperature || 0.75,
      systemPrompt: enrichedPrompt,
      tools: liveTools,
      resumptionHandle: this.sessionResumptionHandle,
      transcriptHistory
    });
  }

  /**
   * Send the initial BidiGenerateContentSetup message with Session Resumption support
   */
  sendInitialSetup() {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;

    const setupMessage = this.buildInitialSetup();
    const endpointConfig = getLiveEndpointConfig(this.modelId);
    const validatedVoice = sanitizeVoiceForModel(endpointConfig.endpointId, this.voiceName);

    logger.info('GEMINI', `Enviando Setup inicial (Modelo: ${endpointConfig.endpointId}, Familia: ${endpointConfig.family}, Voz: ${validatedVoice}, Resumption: ${this.sessionResumptionHandle ? 'Activo' : 'Nuevo'})`);
    this.websocket.send(JSON.stringify(setupMessage));
  }

  updateTools(customDeclarations?: GeminiFunctionDeclaration[]): void {
    const declarations = customDeclarations ?? mcpClientManager.getGeminiFunctionDeclarations();
    this.tools = getLiveToolsConfig(declarations);
    logger.info('GEMINI', `Herramientas en vivo actualizadas. Total MCPs integradas: ${declarations.length}`);
  }

  clearInputQueue() {
    clearInterval(this._audioDrainTimer); this._audioDrainTimer = undefined;
    if (this.inputQueue.size) {
      this.inputQueue.clear(true);
      logger.warn('AUDIO', 'Audio pendiente descartado al cerrar stream', { audio_input_drop_ms: this.inputQueue.droppedMs });
    }
  }

  endAudioStream() {
    this.clearInputQueue();
    if (this.isConnected && this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
  }

  sendAudioChunk(data: ArrayBuffer | string) {
    if (!this.isConnected || this.websocket?.readyState !== WebSocket.OPEN) return false;
    this.telemetry.markAudioCaptured();
    let base64: string;
    if (typeof data === 'string') {
      base64 = data;
    } else if (typeof Buffer !== 'undefined') {
      base64 = Buffer.from(data).toString('base64');
    } else {
      const bytes = new Uint8Array(data);
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      base64 = btoa(binary);
    }
    if (!this.inputQueue.push(base64)) { this.recoverInputLoss(); return false; }
    this.drainInput();
    if (this.inputQueue.size && !this._audioDrainTimer) this._audioDrainTimer = setInterval(() => this.drainInput(), 10);
    return true;
  }

  drainInput() {
    const controller = geminiLiveOrchestrator.getController(this.modelId);
    const valid = this.inputQueue.drain(data => {
      if (!this.isConnected || this.websocket?.readyState !== WebSocket.OPEN || this.websocket.bufferedAmount > 65536) return false;
      const payload = controller.formatAudioPayload(data);

      this.websocket.send(JSON.stringify(payload));
      this.telemetry.markWebSocketSent();
      this.telemetry.markInputSent();
      return true;
    });
    if (!valid) this.recoverInputLoss();
    if (!this.inputQueue.size) { clearInterval(this._audioDrainTimer); this._audioDrainTimer = undefined; }
  }

  recoverInputLoss() {
    logger.warn('AUDIO', 'Discontinuidad de entrada', { audio_input_drop_ms: this.inputQueue.droppedMs });
    // End the discarded turn so Google can resolve it, but keep the healthy
    // socket alive. Closing here caused reconnect loops under small bursts.
    if (this.isConnected && this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
  }


  /**
   * Send a video/camera/screen frame (JPEG base64)
   */
  sendVideoFrame(base64JPEGData: string, priority = false) {
    if (!base64JPEGData || typeof base64JPEGData !== 'string') return false;
    const cleanData = base64JPEGData.includes(',') ? base64JPEGData.split(',')[1] : base64JPEGData;
    return this.sendRealtimeMedia(cleanData.trim(), 'image/jpeg', priority);
  }

  /**
   * Signal end of user speech for Hybrid VAD
   */
  sendAudioStreamEnd(): boolean {
    if (!this.isConnected || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) return false;
    this.websocket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    return true;
  }

  /**
   * Send text user input via realtimeInput (Gemini 3.8 Live API standard)
   */
  sendRealtimeText(text: string): boolean {
    if (!this.isConnected || !this.websocket || this.websocket.readyState !== WebSocket.OPEN || !text) return false;
    const controller = geminiLiveOrchestrator.getController(this.modelId);
    this.websocket.send(JSON.stringify(controller.formatTextPayload(text)));
    sessionTranscriptBuffer.addTurn('user', text);
    return true;
  }

  /**
   * Inject contextual conversation turns into the live session mid-stream
   */
  sendClientContent(turns: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string }> }>, turnComplete = true): boolean {
    if (!this.isConnected || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) return false;
    this.websocket.send(JSON.stringify({
      clientContent: {
        turns: turns.map(t => ({ role: t.role, parts: t.parts })),
        turnComplete
      }
    }));
    return true;
  }

  /**
   * Send real-time media chunk — dispatches per endpoint model controller (distinctAudioVideo vs mediaChunks)
   */
  sendRealtimeMedia(data: string, mimeType = 'image/jpeg', priority = false) {
    if (!this.isConnected || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) return false;

    // Traffic Guard: Do not saturate the socket buffer if queued data is high
    const maxBuffer = priority ? 262144 : 4096; // snapshots may pass a modest burst; periodic frames never compete with voice
    if ((!priority && this.inputQueue.size > 0) || this.websocket.bufferedAmount > maxBuffer) {
      logger.warn('GEMINI', `Omitiendo frame de medios (${mimeType}): buffer del socket saturado (${this.websocket.bufferedAmount} bytes). Priority: ${priority}`);
      return false;
    }

    try {
      const controller = geminiLiveOrchestrator.getController(this.modelId);
      const message = controller.formatVideoPayload(data, mimeType);

      this.websocket.send(JSON.stringify(message));
      return true;
    } catch (err) {
      logger.warn('GEMINI', `Fallo al enviar frame de medios (${mimeType}):`, err);
      return false;
    }
  }

  /**
   * Send a text message turn to Gemini Live, optionally preceded by a visual frame
   */
  sendTextMessage(text: string, imageBase64: string | null = null) {
    if (!this.isConnected || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) return false;
    this.awaitingTextResponse = true;
    this.armResponseWatchdog();
    const visualInstruction = imageBase64
      ? `La imagen adjunta es la observación visual más reciente y reemplaza cualquier imagen anterior. Ignora por completo el contenido visual previo. ${text || ''}`.trim()
      : text;
    if (imageBase64) this.sendVideoFrame(imageBase64, true);
    const controller = geminiLiveOrchestrator.getController(this.modelId);
    this.websocket.send(JSON.stringify(controller.formatTextPayload(visualInstruction)));
    if (text) {
      sessionTranscriptBuffer.addTurn('user', text);
    }
    return true;
  }

  armResponseWatchdog() {
    clearTimeout(this.responseWatchdogTimer);
    if (!this.awaitingTextResponse || !this.isConnected) return;
    this.responseWatchdogTimer = setTimeout(() => {
      this.responseWatchdogTimer = undefined;
      if (!this.awaitingTextResponse || !this.isConnected || this.isExplicitDisconnect) return;
      logger.warn('GEMINI', `El turno no produjo actividad durante ${this.responseWatchdogMs} ms; se reinicia la sesión para evitar una llamada congelada.`);
      this.awaitingTextResponse = false;
      // A missing model response after a tool result means the resumed context
      // is no longer reliable. Resume would preserve that stuck state and make
      // every later turn repeat the same refusal; start a fresh live session.
      this._restartSession({ preserveResumption: false });
    }, this.responseWatchdogMs);
    // Do not keep a Node-based diagnostic process alive solely for a browser
    // watchdog. Chromium timers do not expose unref(), so this is conditional.
    this.responseWatchdogTimer?.unref?.();
  }

  clearResponseWatchdog() {
    clearTimeout(this.responseWatchdogTimer);
    this.responseWatchdogTimer = undefined;
    this.awaitingTextResponse = false;
  }

  /**
   * Send tool response back to Gemini Live
   */
  sendToolResponse(responses: LiveToolResponse[]) {
    if (!this.isConnected || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;

    const formattedResponses = responses.filter(r => !this.cancelledTools.has(r.id)).map((r) => {
      const rawOut = r.output || r.response?.output || r.response?.result || r.response || {};
      const safeOutput: Record<string, unknown> = typeof rawOut === 'object' && rawOut !== null ? { ...rawOut } : { result: String(rawOut) };

      // Prevent Error 1007: Extract raw image base64 if present, stream via realtime video, and strip from tool response JSON
      if (safeOutput.frame_data) {
        let delivered = false;
        if (typeof safeOutput.frame_data === 'string' && safeOutput.frame_data.length > 100) {
          // A tool-requested snapshot is the model's current dependency. It
          // must outrank a transient microphone queue or Gemini only receives
          // the textual acknowledgement and repeatedly requests the same shot.
          delivered = this.sendVideoFrame(safeOutput.frame_data, true);
        }
        delete safeOutput.frame_data;
        safeOutput.image_delivery = delivered ? 'delivered' : 'unavailable';
      }

      return {
        id: r.id,
        name: r.name,
        response: {
          output: safeOutput
        }
      };
    });

    if (formattedResponses.length === 0) {
      logger.info('GEMINI', 'Todas las respuestas de herramientas fueron canceladas (barge-in); omitiendo envío de toolResponse vacío.');
      return;
    }

    // Clear stale audio input packets to prevent server VAD interference immediately following a tool response
    if (this.inputQueue.size > 0) {
      this.inputQueue.clear(true);
    }
    if (this._audioDrainTimer) {
      clearInterval(this._audioDrainTimer);
      this._audioDrainTimer = undefined;
    }

    const message = {
      toolResponse: {
        functionResponses: formattedResponses
      }
    };

    // Tool output can contain data from the operating system or an external
    // integration. Keep the log useful for diagnostics without retaining its
    // payload, credentials, image data, or user content.
    logger.info('GEMINI', 'Enviando respuestas de herramientas a Gemini Live.',
      formattedResponses.map(({ id, name, response }) => ({
        id,
        name,
        status: typeof response.output.status === 'string' ? response.output.status : 'sent',
      })));
    this.awaitingTextResponse = true;
    this.armResponseWatchdog();
    this.websocket.send(JSON.stringify(message));
  }

  /**
   * Handle incoming WebSocket message payloads from Google AI Studio
   */
  async handleServerMessage(data: string | ArrayBuffer | Blob, sourceSocket = this.websocket) {
    if (!sourceSocket || sourceSocket !== this.websocket || this.isExplicitDisconnect) return;
    let rawText = data;
    if (data instanceof Blob) {
      rawText = await data.text();
    } else if (data instanceof ArrayBuffer) {
      rawText = new TextDecoder().decode(data);
    }

    try {
      if (sourceSocket !== this.websocket || this.isExplicitDisconnect) return;
      if (typeof rawText !== 'string' || rawText.length > 8_388_608) return;
      const decoded = JSON.parse(rawText) as Record<string, unknown>;
      const serverError = decoded.error as { code?: unknown; message?: unknown; status?: unknown } | undefined;
      if (serverError && typeof serverError === 'object') {
        const detail = typeof serverError.message === 'string' ? serverError.message : JSON.stringify(serverError);
        logger.error('GEMINI', `Google rechazó la sesión Live (${String(serverError.code ?? 'sin código')}): ${detail}`);
        this.sessionResumptionHandle = null;
        this.onError(new Error(`Gemini Live rechazó la configuración: ${detail}`));
        sourceSocket.close(1008, 'Live setup rejected');
        return;
      }
      const parsed = liveServerMessageSchema.safeParse(decoded);
      if (!parsed.success) {
        logger.error('GEMINI', 'Mensaje Live no compatible recibido:', parsed.error.issues);
        return;
      }
      const message = parsed.data;
      if (this.awaitingTextResponse && message.serverContent) this.armResponseWatchdog();
      if (message.setupComplete) {
        if (this.isConnected) return;
        clearTimeout(this._setupTimer);
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        this.onOpen();
        this.onSetupComplete();
        if (!memoryService.hasSession?.(this.sessionId)) {
          memoryService.startSession(this.sessionId, {
            source: 'gemini_live', modelId: this.modelId, voiceName: this.voiceName
          });
        }
      }

      // 1. Session Resumption Handle Update (newHandle or handle)
      const resumptionHandle = message.sessionResumptionUpdate?.newHandle || message.sessionResumptionUpdate?.handle;
      if (message.sessionResumptionUpdate?.resumable === false) {
        this.sessionResumptionHandle = null;
      } else if (resumptionHandle) {
        this.sessionResumptionHandle = resumptionHandle;
        if (this.lastLoggedResumptionHandle !== resumptionHandle && Date.now() - this.lastResumptionLogAt >= 30000) {
          this.lastLoggedResumptionHandle = resumptionHandle;
          this.lastResumptionLogAt = Date.now();
          // logger.debug('GEMINI', `Session Resumption Handle actualizado: ${resumptionHandle.substring(0, 16)}...`);
        }
      }

      // 2. Server Content (audio, interruption and turn lifecycle)
      if (message.serverContent) {
        const { modelTurn, interrupted, turnComplete, generationComplete, inputTranscription, outputTranscription } = message.serverContent;

        if (inputTranscription?.text) {
          sessionTranscriptBuffer.addTurn('user', inputTranscription.text);
        }

        if (outputTranscription?.text) {
          sessionTranscriptBuffer.addTurn('model', outputTranscription.text);
        }

        if (interrupted) {
          this._generationStarted = false;
          this.telemetry.markInterrupted();
          logger.info('GEMINI', 'Interrupción por el usuario (Barge-in confirmado por Gemini Live).');
          this.audioPlayback?.stopImmediate();
          this.onInterrupted();
        }

        if (!interrupted && modelTurn && modelTurn.parts) {
          if (!this._generationStarted) { this._generationStarted = true; this.onGenerationStart(); }
          for (const part of modelTurn.parts) {
            // Filter thought parts (e.g. Gemini 2.5 internal thinking) from audio output, forward for thinking visualization
            if (part.thought) {
              if (part.text) {
                this.onThoughtChunk(part.text);
              }
              continue;
            }

            if (part.text && !outputTranscription?.text) {
              sessionTranscriptBuffer.addTurn('model', part.text);
            }

            // Audio output: base64 PCM 24kHz
            if (part.inlineData?.data && (!part.inlineData.mimeType || part.inlineData.mimeType.startsWith('audio/pcm'))) {
              this.telemetry.markModelAudioReceived();
              const audioData = part.inlineData.data;
              this.onAudioChunk(audioData);
            }
          }
        }
        if (generationComplete) {
          this.onGenerationComplete();
        }
        if (turnComplete) {
          this._generationStarted = false;
          this.completedTools.clear();
          this.cancelledTools.clear();
          this.clearResponseWatchdog();
          this.telemetry.markTurnComplete();
          this.publishTelemetry();
          this.onTurnComplete();
        }
      }

      // 3. Tool Calls
      if (message.toolCall && message.toolCall.functionCalls) {
        logger.info('GEMINI', 'Llamada de herramientas recibida desde Gemini Live:', message.toolCall.functionCalls);
        Promise.resolve(this.onToolCall(message.toolCall.functionCalls.filter(call => { if (this.completedTools.has(call.id)) return false; this.completedTools.add(call.id); return true; }), sourceSocket))
          .catch((err) => logger.warn('GEMINI', 'Error al ejecutar herramientas:', err));
      }

      // 4. Tool Call Cancellation (Barge-in)
      if (message.toolCallCancellation && message.toolCallCancellation.ids) {
        for (const id of message.toolCallCancellation.ids) this.cancelledTools.add(id);
        this.onToolCallCancellation(message.toolCallCancellation.ids);
        logger.warn('GEMINI', 'Llamadas de herramientas canceladas por el servidor (Barge-in):', message.toolCallCancellation.ids);
      }

      // 5. GoAway: server will disconnect soon — log for reconnection awareness
      if (message.goAway) {
        clearTimeout(this._goAwayTimer);
        const remainingMs = Math.max(0, parseFloat(message.goAway.timeLeft || '0') * 1000);
        this._goAwayTimer = setTimeout(() => {
          if (this.websocket === sourceSocket && !this.isExplicitDisconnect) {
            this.sessionResumptionHandle = null;
            sourceSocket.close(4000, 'Session renewal');
          }
        }, Math.max(0, remainingMs - 1000));
        logger.warn('GEMINI', `GoAway recibido del servidor. Tiempo restante: ${message.goAway.timeLeft || 'desconocido'}.`);
      }

      // 6. Interaction Status (Gemini 3.8 Live & Extended Thinking lifecycle)
      const currentInteractionStatus = message.interactionStatus || message.interaction_status;
      if (currentInteractionStatus) {
        this.onInteractionStatus(currentInteractionStatus);
      }
    } catch (err) {
      logger.error('GEMINI', 'Error al procesar mensaje del WebSocket de Gemini Live:', err);
    }
  }

  disconnect({ endSession = true } = {}) {
    this._connectEpoch++;
    this.endAudioStream();
    clearTimeout(this._goAwayTimer);
    this.isExplicitDisconnect = true;
    this.clearResponseWatchdog();
    this.clearInputQueue();
    this.completedTools.clear();
    this.cancelledTools.clear();
    clearTimeout(this._setupTimer);
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const ws = this.websocket;
    this.websocket = null;
    this.isConnected = false;
    this.isConnecting = false;
    if (endSession) void memoryService.endSession({ sessionId: this.sessionId, source: 'gemini_live' });
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try { ws.close(1000, 'Desconexión solicitada por el usuario'); } catch {}
    }
  }

  _restartSession({ preserveResumption = false } = {}) {
    const active = !this.isExplicitDisconnect && (this.isConnected || this.isConnecting || this.reconnectTimer);
    this.disconnect({ endSession: false });
    if (!preserveResumption) {
      this.sessionResumptionHandle = null;
      this.cancelledTools.clear();
      this.completedTools.clear();
    }
    if (!active) return;
    this.isExplicitDisconnect = false;
    this.reconnectAttempts = 0;
    this.onReconnecting(0, 100);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.isExplicitDisconnect) this.connect();
    }, 100);
  }

  reconfigure(modelId: string, voiceName: string) {
    const modelChanged = Boolean(modelId) && this.modelId !== modelId;
    const voiceChanged = Boolean(voiceName) && this.voiceName !== voiceName;
    if (!modelChanged && !voiceChanged) return;
    if (modelChanged) this.modelId = modelId;
    if (voiceChanged) this.voiceName = voiceName;
    // Voice and model are setup-only parameters. Changing either requires a clean session
    // because Google binds the voice and model pipeline at session creation time;
    // resuming an existing handle prevents Google from applying the new voice.
    this._restartSession({ preserveResumption: !modelChanged && !voiceChanged });
  }

  switchVoice(newVoiceName: string) {
    this.reconfigure(this.modelId, newVoiceName);
  }

  switchModel(newModelId: string) {
    this.reconfigure(newModelId, this.voiceName);
  }

  recordPlayoutTimestamp(now = performance.now()): void {
    this.telemetry.markPlayoutStarted(now);
    this.publishTelemetry();
  }

  recordStopImmediate(): void {
    this.telemetry.markStopImmediate();
    this.publishTelemetry();
  }

  setAudioPlayback(playback: { stopImmediate: () => void } | null): void {
    this.audioPlayback = playback;
  }

  interrupt(): void {
    this._generationStarted = false;
    this.telemetry.markInterrupted();
    this.audioPlayback?.stopImmediate();
    this.onInterrupted();
  }

  private publishTelemetry(): void {
    const metrics = this.telemetry.getAggregatedMetrics();
    queueMicrotask(() => this.onTelemetry(metrics));
  }
}
