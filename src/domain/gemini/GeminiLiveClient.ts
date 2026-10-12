/**
 * Cristi AI - GeminiLiveClient
 * Enforces native 24 kHz out / 16 kHz in PCM buffer streaming without jitter or sample rate drift.
 * Real-time bidirectional WebSocket client for Gemini Multimodal Live API.
 */

export const GEMINI_LIVE_OUTPUT_SAMPLE_RATE = 24000;
export const GEMINI_LIVE_INPUT_SAMPLE_RATE = 16000;

export { GeminiLiveSocket as GeminiLiveClient } from './LiveTransport.js';
export { GeminiLiveSocket } from './LiveTransport.js';
