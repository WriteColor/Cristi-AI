import type { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { windowsMediaService } from '../../media/WindowsMediaService';

export const windowsMediaControlHandler: IToolHandler = {
  name: 'windows_media_control',
  declaration: {
    name: 'windows_media_control',
    description: 'Controla la reproducción multimedia de Windows y Spotify (reproducir, pausar, siguiente canción, canción anterior, silenciar o subir/bajar volumen).',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          enum: ['play_pause', 'next', 'previous', 'stop', 'volume_up', 'volume_down', 'mute'],
          description: 'Acción multimedia a ejecutar.'
        }
      },
      required: ['action']
    }
  },
  async execute(args: { action: 'play_pause' | 'next' | 'previous' | 'stop' | 'volume_up' | 'volume_down' | 'mute' }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', cancelled: true };
    const valid = ['play_pause', 'next', 'previous', 'stop', 'volume_up', 'volume_down', 'mute'];
    if (!valid.includes(args?.action)) return { success: false, message: `Acción inválida: ${args?.action}` };
    return await windowsMediaService.control(args.action);
  }
};

export const windowsMediaStatusHandler: IToolHandler = {
  name: 'windows_media_status',
  declaration: {
    name: 'windows_media_status',
    description: 'Consulta el estado de reproducción multimedia de Windows y Spotify (canción activa, artista y si se encuentra en reproducción).',
    parameters: { type: 'OBJECT', properties: {} }
  },
  async execute(_args?: unknown, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', cancelled: true };
    return await windowsMediaService.getStatus();
  }
};

export const windowsSpotifyLaunchHandler: IToolHandler = {
  name: 'windows_spotify_launch',
  declaration: {
    name: 'windows_spotify_launch',
    description: 'Abre Spotify en Windows buscando una canción, álbum o artista específico, o abriendo una URI directa.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Nombre de la canción, artista o lista a reproducir en Spotify.'
        }
      },
      required: ['query']
    }
  },
  async execute(args: { query: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', cancelled: true };
    if (!args?.query?.trim()) return { success: false, message: 'Se requiere término de búsqueda para Spotify.' };
    return await windowsMediaService.launchSpotify(args.query.trim());
  }
};

// Unified with spotifyMcpTools: Spotify MCP server acts as the authoritative multimedia controller
// with native Windows SMTC fallback. Excluded from tool registry to eliminate competing media tools.
export const windowsMediaTools: IToolHandler[] = [];

