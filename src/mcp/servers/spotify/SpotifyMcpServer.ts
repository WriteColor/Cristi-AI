/**
 * Cristi AI - Native Spotify Model Context Protocol (MCP) Server
 * Dual-engine execution:
 * 1. Spotify Web API session (precise playback, search, queue, volume, playlists)
 * 2. Native Windows SMTC / URI fallback (zero-token, offline-resilient playback control)
 * Fully synchronized with Live2D emotional feedback.
 */

import { windowsMediaService } from '../../../domain/media/WindowsMediaService';
import { spotifyEmotionBridge } from './SpotifyEmotionBridge';
import { electronBridge } from '../../../services/desktop/ElectronBridge';
import { logger } from '../../../infrastructure/logging/logger';
import { modularConfigManager } from '../../../config/ModularConfigManager';

export interface McpToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, any>;
    required?: string[];
  };
}

interface PlaybackData {
  title?: string | null;
  artist?: string | null;
  isPlaying?: boolean;
  isSpotifyRunning?: boolean;
  source?: string;
}

export class SpotifyMcpServer {
  public readonly id = 'cristi_spotify';
  public readonly name = 'Spotify Cristi MCP';
  public readonly version = '2.0.0';

  /**
   * Returns the list of standard MCP tool declarations.
   */
  getToolsDeclarations(): McpToolSchema[] {
    return [
      {
        name: 'spotify_play',
        description: 'Inicia o reanuda la reproducción en Spotify. Puede buscar y reproducir una canción, playlist o URI específica mediante Web API o SMTC nativo.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'Nombre de la canción, álbum o artista a reproducir.'
            },
            uri: {
              type: 'STRING',
              description: 'URI directa de Spotify (ejemplo: spotify:track:... o spotify:playlist:...)'
            },
            user_explicitly_requested: {
              type: 'BOOLEAN',
              description: 'Obligatorio. Establece true ÚNICAMENTE si el usuario pidió de forma explícita, directa y consciente reproducir música. Si fue solo una mención casual o ruido dudoso, debe ser false.'
            }
          }
        }
      },
      {
        name: 'spotify_pause',
        description: 'Pausa la reproducción actual de música en Spotify.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      },
      {
        name: 'spotify_skip_next',
        description: 'Avanza a la siguiente pista o canción en Spotify.',
        parameters: {
          type: 'OBJECT',
          properties: {
            user_explicitly_requested: {
              type: 'BOOLEAN',
              description: 'Obligatorio. Establece true ÚNICAMENTE si el usuario solicitó de forma explícita avanzar o saltar a la siguiente pista.'
            }
          }
        }
      },
      {
        name: 'spotify_skip_previous',
        description: 'Regresa a la pista o canción anterior en Spotify.',
        parameters: {
          type: 'OBJECT',
          properties: {
            user_explicitly_requested: {
              type: 'BOOLEAN',
              description: 'Obligatorio. Establece true ÚNICAMENTE si el usuario solicitó de forma explícita regresar a la canción anterior.'
            }
          }
        }
      },
      {
        name: 'spotify_set_volume',
        description: 'Ajusta el volumen multimedia de Spotify (por porcentaje 0-100 en Web API o subir/bajar/silenciar en Windows).',
        parameters: {
          type: 'OBJECT',
          properties: {
            action: {
              type: 'STRING',
              enum: ['up', 'down', 'mute'],
              description: 'Acción de volumen nativo: "up" para subir, "down" para bajar, "mute" para silenciar/desilenciar.'
            },
            percent: {
              type: 'NUMBER',
              description: 'Porcentaje de volumen de 0 a 100 (usado con Spotify Web API).'
            },
            user_explicitly_requested: {
              type: 'BOOLEAN',
              description: 'Obligatorio. Establece true ÚNICAMENTE si el usuario pidió expresamente cambiar o silenciar el volumen.'
            }
          }
        }
      },
      {
        name: 'spotify_get_now_playing',
        description: 'Obtiene la información detallada de la canción activa en Spotify, artista, álbum, estado y emoción detectada para Live2D.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      },
      {
        name: 'spotify_search',
        description: 'Busca canciones, álbumes o playlists en Spotify Web API o abre la búsqueda en la app de Windows.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'Término de búsqueda para Spotify.'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'spotify_get_queue',
        description: 'Consulta el estado actual de la cola de reproducción y la canción en curso.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      },
      {
        name: 'spotify_get_playlists',
        description: 'Obtiene las listas de reproducción de la biblioteca del usuario o busca playlists.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'Nombre o género de la lista de reproducción (opcional).'
            }
          }
        }
      }
    ];
  }

  /**
   * Helper to check if a valid Spotify Web API session is active.
   */
  public async isWebApiActive(): Promise<boolean> {
    try {
      const session = await electronBridge.spotifyGetSession();
      return Boolean(session && session.authenticated);
    } catch {
      return false;
    }
  }

  /**
   * Executes a given Spotify MCP tool by name with dual-engine execution.
   */
  async executeTool(name: string, args: Record<string, any> = {}, signal?: AbortSignal): Promise<Record<string, any>> {
    if (signal?.aborted) {
      return { status: 'cancelled', cancelled: true };
    }

    const requiresExplicitConfirmation = [
      'spotify_play',
      'playMusic',
      'spotify_skip_next',
      'spotify_skip_previous',
      'spotify_set_volume'
    ].includes(name);

    const spotifyConfig = modularConfigManager.getSection('spotify');
    const enforceConfirmation = spotifyConfig?.requireExplicitConfirmation !== false;

    // Guardrail estricto contra alucinaciones o interpretaciones dudosas
    if (enforceConfirmation && requiresExplicitConfirmation && args?.user_explicitly_requested !== true) {
      logger.warn('SPOTIFY_GUARDRAIL', `Comando "${name}" bloqueado: falta confirmación explícita del usuario.`);
      return {
        status: 'confirmation_required',
        action: name,
        needs_verbal_confirmation: true,
        message: 'No se ejecutó la acción en Spotify porque no se detectó una orden explícita e inequívoca del usuario. Por favor, pide confirmación verbal a Ariel antes de realizar esta acción musical.'
      };
    }

    try {
      switch (name) {
        case 'spotify_play':
        case 'playMusic': {
          const isAuth = await this.isWebApiActive();
          const target = String(args.uri || args.query || '').trim();

          if (isAuth) {
            try {
              if (args.uri) {
                const res = await electronBridge.spotifyWebApi('play', { uri: args.uri }) as any;
                spotifyEmotionBridge.processTrack(args.uri);
                return {
                  success: true,
                  message: res?.message || `Reproduciendo URI en Spotify: ${args.uri}`,
                  target: args.uri,
                  engine: res?.engine || 'web_api'
                };
              } else if (args.query) {
                const res = await electronBridge.spotifyWebApi('play', { query: args.query }) as any;
                spotifyEmotionBridge.processTrack(args.query);
                return {
                  success: true,
                  message: res?.message || `Reproduciendo "${args.query}" en Spotify.`,
                  target: args.query,
                  engine: res?.engine || 'web_api'
                };
              } else {
                const res = await electronBridge.spotifyWebApi('play') as any;
                setTimeout(() => void this.syncCurrentTrackEmotion(), 600);
                return {
                  success: true,
                  message: res?.message || 'Reproducción reanudada en Spotify.',
                  engine: res?.engine || 'web_api'
                };
              }
            } catch (apiError) {
              logger.warn('SpotifyMcpServer', 'Fallo en Spotify Web API play, usando fallback Windows SMTC:', apiError);
            }
          }

          // Native Windows fallback
          if (target) {
            const launchResult = await windowsMediaService.launchSpotify(target);
            spotifyEmotionBridge.processTrack(target);
            return {
              success: launchResult.status === 'success',
              message: `Reproduciendo en Spotify (Windows): ${target}`,
              target,
              engine: 'windows_native'
            };
          }

          const res = await windowsMediaService.control('play_pause');
          await this.syncCurrentTrackEmotion();
          return { success: res.status === 'success', message: 'Reproducción reanudada.', engine: 'windows_native' };
        }

        case 'spotify_pause':
        case 'pausePlayback': {
          const isAuth = await this.isWebApiActive();
          if (isAuth) {
            try {
              await electronBridge.spotifyWebApi('pause');
              return { success: true, message: 'Reproducción pausada vía Spotify Web API.', engine: 'web_api' };
            } catch (apiError) {
              logger.warn('SpotifyMcpServer', 'Fallo en Spotify Web API pause, usando fallback:', apiError);
            }
          }

          const res = await windowsMediaService.control('play_pause');
          return { success: res.status === 'success', message: 'Reproducción pausada.', engine: 'windows_native' };
        }

        case 'resumePlayback': {
          const isAuth = await this.isWebApiActive();
          if (isAuth) {
            try {
              await electronBridge.spotifyWebApi('play');
              setTimeout(() => void this.syncCurrentTrackEmotion(), 600);
              return { success: true, message: 'Reproducción reanudada vía Spotify Web API.', engine: 'web_api' };
            } catch (apiError) {
              logger.warn('SpotifyMcpServer', 'Fallo en Spotify Web API resumePlayback, usando fallback:', apiError);
            }
          }

          const res = await windowsMediaService.control('play_pause');
          await this.syncCurrentTrackEmotion();
          return { success: res.status === 'success', message: 'Reproducción reanudada.', engine: 'windows_native' };
        }

        case 'spotify_skip_next':
        case 'skipToNext': {
          const isAuth = await this.isWebApiActive();
          if (isAuth) {
            try {
              await electronBridge.spotifyWebApi('skip_next');
              setTimeout(() => void this.syncCurrentTrackEmotion(), 600);
              return { success: true, message: 'Pista siguiente enviada vía Spotify Web API.', engine: 'web_api' };
            } catch (apiError) {
              logger.warn('SpotifyMcpServer', 'Fallo en Spotify Web API skip_next, usando fallback:', apiError);
            }
          }

          const res = await windowsMediaService.control('next');
          setTimeout(() => void this.syncCurrentTrackEmotion(), 600);
          return { success: res.status === 'success', message: 'Pista siguiente enviada.', engine: 'windows_native' };
        }

        case 'spotify_skip_previous':
        case 'skipToPrevious': {
          const isAuth = await this.isWebApiActive();
          if (isAuth) {
            try {
              await electronBridge.spotifyWebApi('skip_previous');
              setTimeout(() => void this.syncCurrentTrackEmotion(), 600);
              return { success: true, message: 'Pista anterior enviada vía Spotify Web API.', engine: 'web_api' };
            } catch (apiError) {
              logger.warn('SpotifyMcpServer', 'Fallo en Spotify Web API skip_previous, usando fallback:', apiError);
            }
          }

          const res = await windowsMediaService.control('previous');
          setTimeout(() => void this.syncCurrentTrackEmotion(), 600);
          return { success: res.status === 'success', message: 'Pista anterior enviada.', engine: 'windows_native' };
        }

        case 'spotify_set_volume':
        case 'setVolume': {
          const isAuth = await this.isWebApiActive();
          const percent = typeof args.volumePercent === 'number' ? args.volumePercent : (typeof args.percent === 'number' ? args.percent : undefined);
          if (isAuth && typeof percent === 'number') {
            try {
              await electronBridge.spotifyWebApi('set_volume', { percent });
              return { success: true, percent, engine: 'web_api' };
            } catch (apiError) {
              logger.warn('SpotifyMcpServer', 'Fallo en Spotify Web API set_volume, usando fallback:', apiError);
            }
          }

          const raw = String(args.action || 'up').toLowerCase();
          const actionMap: Record<string, 'volume_up' | 'volume_down' | 'mute'> = {
            up: 'volume_up',
            down: 'volume_down',
            mute: 'mute'
          };
          const mapped = actionMap[raw] || 'volume_up';
          const res = await windowsMediaService.control(mapped);
          return { success: res.status === 'success', action: mapped, engine: 'windows_native' };
        }

        case 'adjustVolume': {
          const isAuth = await this.isWebApiActive();
          const delta = typeof args.volumeDelta === 'number' ? args.volumeDelta : (typeof args.delta === 'number' ? args.delta : 5);
          if (isAuth) {
            try {
              const res = await electronBridge.spotifyWebApi('adjustVolume', { volumeDelta: delta });
              return { success: true, result: res, engine: 'web_api' };
            } catch (apiError) {
              logger.warn('SpotifyMcpServer', 'Fallo en adjustVolume Web API, usando fallback:', apiError);
            }
          }

          const action = delta >= 0 ? 'volume_up' : 'volume_down';
          const res = await windowsMediaService.control(action);
          return { success: res.status === 'success', action, engine: 'windows_native' };
        }

        case 'spotify_get_now_playing':
        case 'getNowPlaying': {
          const isAuth = await this.isWebApiActive();
          if (isAuth) {
            try {
              const data: any = await electronBridge.spotifyWebApi('now_playing');
              if (data && data.item) {
                const title = data.item.name || 'Desconocido';
                const artist = data.item.artists?.map((a: any) => a.name).join(', ') || 'Desconocido';
                const mood = spotifyEmotionBridge.processTrack(title, artist);
                return {
                  success: true,
                  title,
                  artist,
                  album: data.item.album?.name,
                  isPlaying: data.is_playing ?? true,
                  detectedMood: mood?.mood || 'chill',
                  suggestedLive2dEmotion: mood?.suggestedEmotion || 'idle',
                  engine: 'web_api'
                };
              }
            } catch (apiError) {
              logger.warn('SpotifyMcpServer', 'Fallo en Spotify Web API now_playing, usando fallback:', apiError);
            }
          }

          // Fallback to Windows SMTC
          const statusRes = await windowsMediaService.getStatus();
          const data = (statusRes.data || {}) as PlaybackData;
          let mood = null;
          if (data.title && data.title !== 'Spotify') {
            mood = spotifyEmotionBridge.processTrack(data.title, data.artist || undefined);
          }
          return {
            success: true,
            title: data.title || 'Desconocido',
            artist: data.artist || 'Desconocido',
            isPlaying: data.isPlaying ?? false,
            detectedMood: mood?.mood || 'chill',
            suggestedLive2dEmotion: mood?.suggestedEmotion || 'idle',
            engine: 'windows_native'
          };
        }

        case 'spotify_search':
        case 'searchSpotify': {
          const q = String(args.query || '').trim();
          if (!q) return { success: false, message: 'Se requiere término de búsqueda.' };

          const isAuth = await this.isWebApiActive();
          if (isAuth) {
            try {
              const searchRes = await electronBridge.spotifyWebApi('search', { query: q, types: args.type || args.types });
              spotifyEmotionBridge.processTrack(q);
              return {
                success: true,
                results: searchRes,
                message: `Búsqueda completada para "${q}".`,
                engine: 'web_api'
              };
            } catch (apiError) {
              logger.warn('SpotifyMcpServer', 'Fallo en Spotify Web API search, usando fallback:', apiError);
            }
          }

          const res = await windowsMediaService.launchSpotify(q);
          spotifyEmotionBridge.processTrack(q);
          return { success: res.status === 'success', message: `Buscando "${q}" en Spotify.`, engine: 'windows_native' };
        }

        case 'spotify_get_queue':
        case 'getQueue': {
          const isAuth = await this.isWebApiActive();
          if (isAuth) {
            try {
              const queueRes: any = await electronBridge.spotifyWebApi('get_queue');
              if (queueRes) {
                const current = queueRes.currently_playing?.name;
                const queueItems = Array.isArray(queueRes.queue)
                  ? queueRes.queue.slice(0, 10).map((t: any) => ({
                      title: t.name,
                      artist: t.artists?.map((a: any) => a.name).join(', '),
                      uri: t.uri
                    }))
                  : [];
                return {
                  success: true,
                  currentTrack: current,
                  queue: queueItems,
                  message: current ? `Pista activa: ${current}` : 'Cola obtenida de Spotify Web API.',
                  engine: 'web_api'
                };
              }
            } catch (apiError) {
              logger.warn('SpotifyMcpServer', 'Fallo en Spotify Web API get_queue, usando fallback:', apiError);
            }
          }

          const statusRes = await windowsMediaService.getStatus();
          const data = (statusRes.data || {}) as PlaybackData;
          return {
            success: true,
            currentTrack: data.title,
            currentArtist: data.artist,
            isPlaying: data.isPlaying,
            message: data.title ? `Pista activa: ${data.title} por ${data.artist}` : 'No hay pista activa detectada.',
            engine: 'windows_native'
          };
        }

        case 'addToQueue': {
          if (!args.uri) return { success: false, message: 'Se requiere URI de la pista (ej. spotify:track:...)' };
          const res = await electronBridge.spotifyWebApi('addToQueue', { uri: args.uri, deviceId: args.deviceId });
          return { success: true, result: res, message: `Pista añadida a la cola: ${args.uri}` };
        }

        case 'spotify_get_playlists':
        case 'getMyPlaylists': {
          const q = String(args.query || '').trim();
          const isAuth = await this.isWebApiActive();
          if (isAuth) {
            try {
              const playlistsRes: any = await electronBridge.spotifyWebApi('get_playlists', { limit: args.limit, offset: args.offset });
              if (playlistsRes && Array.isArray(playlistsRes.items)) {
                return {
                  success: true,
                  playlists: playlistsRes.items.map((p: any) => ({
                    name: p.name,
                    uri: p.uri,
                    totalTracks: p.tracks?.total,
                    description: p.description
                  })),
                  engine: 'web_api'
                };
              }
            } catch (apiError) {
              logger.warn('SpotifyMcpServer', 'Fallo en Spotify Web API get_playlists, usando fallback:', apiError);
            }
          }

          const res = await windowsMediaService.launchSpotify(q || 'playlist');
          return { success: res.status === 'success', message: `Abriendo listas para "${q || 'playlist'}" en Spotify.`, engine: 'windows_native' };
        }

        case 'getPlaylistTracks': {
          const res = await electronBridge.spotifyWebApi('getPlaylistTracks', args);
          return { success: true, result: res };
        }

        case 'getRecentlyPlayed': {
          const res = await electronBridge.spotifyWebApi('getRecentlyPlayed', args);
          return { success: true, result: res };
        }

        case 'getUsersSavedTracks': {
          const res = await electronBridge.spotifyWebApi('getUsersSavedTracks', args);
          return { success: true, result: res };
        }

        case 'removeUsersSavedTracks': {
          const res = await electronBridge.spotifyWebApi('removeUsersSavedTracks', args);
          return { success: true, result: res };
        }

        case 'getAvailableDevices': {
          const res = await electronBridge.spotifyWebApi('getDevices');
          return { success: true, result: res };
        }

        case 'getTopTracks': {
          const res = await electronBridge.spotifyWebApi('getTopTracks', args);
          return { success: true, result: res };
        }

        case 'getTopArtists': {
          const res = await electronBridge.spotifyWebApi('getTopArtists', args);
          return { success: true, result: res };
        }

        case 'createPlaylist': {
          const res = await electronBridge.spotifyWebApi('createPlaylist', args);
          return { success: true, result: res };
        }

        case 'addTracksToPlaylist': {
          const res = await electronBridge.spotifyWebApi('addTracksToPlaylist', args);
          return { success: true, result: res };
        }

        case 'getPlaylist': {
          const res = await electronBridge.spotifyWebApi('getPlaylist', args);
          return { success: true, result: res };
        }

        case 'updatePlaylist': {
          const res = await electronBridge.spotifyWebApi('updatePlaylist', args);
          return { success: true, result: res };
        }

        case 'removeTracksFromPlaylist': {
          const res = await electronBridge.spotifyWebApi('removeTracksFromPlaylist', args);
          return { success: true, result: res };
        }

        case 'reorderPlaylistItems': {
          const res = await electronBridge.spotifyWebApi('reorderPlaylistItems', args);
          return { success: true, result: res };
        }

        case 'unfollowPlaylist': {
          const res = await electronBridge.spotifyWebApi('unfollowPlaylist', args);
          return { success: true, result: res };
        }

        case 'getAlbums': {
          const res = await electronBridge.spotifyWebApi('getAlbums', args);
          return { success: true, result: res };
        }

        case 'getAlbumTracks': {
          const res = await electronBridge.spotifyWebApi('getAlbumTracks', args);
          return { success: true, result: res };
        }

        case 'saveOrRemoveAlbumForUser': {
          const res = await electronBridge.spotifyWebApi('saveOrRemoveAlbumForUser', args);
          return { success: true, result: res };
        }

        case 'checkUsersSavedAlbums': {
          const res = await electronBridge.spotifyWebApi('checkUsersSavedAlbums', args);
          return { success: true, result: res };
        }

        default:
          return { success: false, message: `Herramienta desconocida: ${name}` };
      }
    } catch (err) {
      logger.error('SpotifyMcpServer', `Error ejecutando ${name}:`, err);
      return { success: false, error: (err as Error).message };
    }
  }

  private async syncCurrentTrackEmotion(): Promise<void> {
    try {
      const isAuth = await this.isWebApiActive();
      if (isAuth) {
        try {
          const data: any = await electronBridge.spotifyWebApi('now_playing');
          if (data && data.item) {
            const title = data.item.name;
            const artist = data.item.artists?.map((a: any) => a.name).join(', ') || undefined;
            if (title) {
              spotifyEmotionBridge.processTrack(title, artist);
              return;
            }
          }
        } catch (_) {}
      }

      const statusRes = await windowsMediaService.getStatus();
      const data = (statusRes.data || {}) as PlaybackData;
      if (data.title && data.title !== 'Spotify') {
        spotifyEmotionBridge.processTrack(data.title, data.artist || undefined);
      }
    } catch (_) {}
  }
}

export const spotifyMcpServer = new SpotifyMcpServer();
