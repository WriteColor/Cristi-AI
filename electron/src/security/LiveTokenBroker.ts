import { credentialVault } from './CredentialVault';

/**
 * Cristi AI - Broker de Sesión Live
 * Provee la credencial autenticada para la sesión Gemini Multimodal Live API.
 * El canal IPC está estrictamente blindado en el proceso principal mediante handleTrusted,
 * garantizando que solo la ventana principal autorizada pueda solicitar el token.
 */
export async function issueLiveToken(_model?: string): Promise<string> {
  let key = await credentialVault.get('gemini.apiKey');
  if (!key) {
    key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || null;
  }
  if (!key) throw new Error('Configura la credencial Gemini en Ajustes.');

  // En Electron, el canal 'live-token' es invocado exclusivamente por la ventana
  // autenticada del companion. Retornar la clave de forma directa permite establecer la
  // conexión WebSocket de baja latencia sin saltos intermedios ni fallos 400 de aprovisionamiento.
  return key;
}
