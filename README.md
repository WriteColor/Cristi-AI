# Cristi AI

Cristi AI es una aplicación Electron centrada en conversación de voz full-duplex con Gemini Live, visión actual de pantalla/cámara y control de Spotify mediante su adaptador MCP integrado.

## Funciones activas

- Audio PCM bidireccional con barge-in y VAD automático de Google.
- Gemini Live: `gemini-2.5-flash-native-audio-preview-09-2025` y `gemini-3.1-flash-live-preview`.
- Captura de pantalla completa, región y cámara con prioridad para audio.
- Spotify MCP integrado: búsqueda, reproducción, cola, consulta de contenido y playlists.
- Ajustes, cámara y telemetría como ventanas Electron independientes.

## Spotify

1. Crea una aplicación en Spotify Developer Dashboard.
2. Registra exactamente `http://127.0.0.1:8080/callback` como Redirect URI.
3. En Ajustes > Spotify & Música guarda Client ID y Client Secret.
4. Pulsa **Autorizar OAuth** y completa el acceso en el navegador.

El Client Secret y los tokens OAuth se guardan con el almacenamiento cifrado de Electron. Spotify Premium y un dispositivo Spotify activo son necesarios para controlar la reproducción mediante la Web API.

## Desarrollo

```powershell
pnpm install
pnpm dev
```

Para compilar el ejecutable (.exe):

```powershell
pnpm build
```

## Arquitectura

- Ventana principal: overlay transparente, avatar fijo y HUD.
- Ajustes: ventana normal que comparte la configuración pública serializada.
- Telemetría: ventana independiente con métricas de procesos, audio, visión y conexiones.
- Electron main: secretos cifrados, OAuth Spotify, IPC validado y captura nativa.
