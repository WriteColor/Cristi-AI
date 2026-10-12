/**
 * Cristi AI - Native Playwright Model Context Protocol (MCP) Server
 * Full browser automation for Brave Browser (brave.exe) with native web navigation,
 * information search, and autonomous YouTube video playback with verified playing state.
 */

import { logger } from '../../../infrastructure/logging/logger.ts';

export interface McpToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, any>;
    required?: string[];
  };
}

export class PlaywrightMcpServer {
  public readonly id = 'cristi_playwright';
  public readonly name = 'Playwright Brave MCP';
  public readonly version = '1.0.0';

  /**
   * Returns standard MCP tool declarations for Brave Browser automation.
   */
  getToolsDeclarations(): McpToolSchema[] {
    return [
      {
        name: 'browser_play_youtube_video',
        description:
          'Busca un video o música en YouTube, selecciona el video más relevante, inicia la reproducción en Brave Browser y VERIFICA rigurosamente que el video esté reproduciéndose de verdad (!paused && currentTime > 0). Úsalo cuando Ariel pida un video, canción o música de YouTube.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description:
                'Término de búsqueda o URL de YouTube (ejemplo: "Deftones Be Quiet and Drive", "Queen Bohemian Rhapsody", o enlace directo).',
            },
            autoPlay: {
              type: 'BOOLEAN',
              description: 'Si debe iniciar la reproducción de forma automática (por defecto true).',
            },
            timeoutMs: {
              type: 'NUMBER',
              description: 'Tiempo máximo de espera para confirmar la reproducción en milisegundos.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'browser_media_control',
        description:
          'Controla la reproducción de video y audio en Brave Browser (reproducir, pausar, alternar, cambiar volumen, silenciar, adelantar/retroceder o pantalla completa).',
        parameters: {
          type: 'OBJECT',
          properties: {
            action: {
              type: 'STRING',
              description:
                'Acción a ejecutar: "play", "pause", "toggle", "seek", "volume", "mute", "unmute", "fullscreen".',
            },
            value: {
              type: 'NUMBER',
              description:
                'Valor numérico: porcentaje para volume (0-100) o segundos para seek.',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'browser_search',
        description:
          'Realiza una búsqueda en internet en Brave Browser usando Brave Search, Google o DuckDuckGo y abre los resultados.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'Consulta o tema a buscar en la web.',
            },
            engine: {
              type: 'STRING',
              description: 'Motor de búsqueda: "brave", "google" o "duckduckgo" (por defecto "brave").',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'browser_navigate',
        description: 'Navega a una URL específica en Brave Browser.',
        parameters: {
          type: 'OBJECT',
          properties: {
            url: {
              type: 'STRING',
              description: 'Dirección URL completa a la que navegar (ej: "https://wikipedia.org").',
            },
            timeoutMs: {
              type: 'NUMBER',
              description: 'Tiempo máximo de espera en milisegundos.',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'browser_snapshot',
        description:
          'Obtiene el contenido legible de la página web actual en texto limpio, incluyendo título y URL.',
        parameters: {
          type: 'OBJECT',
          properties: {
            maxChars: {
              type: 'NUMBER',
              description: 'Límite de caracteres del contenido extraído (por defecto 8000).',
            },
          },
        },
      },
      {
        name: 'browser_click',
        description:
          'Hace clic en un elemento de la página web activa utilizando un selector CSS o texto.',
        parameters: {
          type: 'OBJECT',
          properties: {
            selector: {
              type: 'STRING',
              description: 'Selector CSS o expresión del elemento donde hacer clic.',
            },
            timeoutMs: {
              type: 'NUMBER',
              description: 'Tiempo máximo de espera en milisegundos.',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'browser_type',
        description: 'Escribe texto en un campo de entrada (input, textarea) en la página activa.',
        parameters: {
          type: 'OBJECT',
          properties: {
            selector: {
              type: 'STRING',
              description: 'Selector CSS del campo de texto donde escribir.',
            },
            text: {
              type: 'STRING',
              description: 'Texto que se va a ingresar.',
            },
            pressEnter: {
              type: 'BOOLEAN',
              description: 'Si debe presionar Enter tras escribir el texto.',
            },
            timeoutMs: {
              type: 'NUMBER',
              description: 'Tiempo máximo de espera en milisegundos.',
            },
          },
          required: ['selector', 'text'],
        },
      },
      {
        name: 'browser_take_screenshot',
        description: 'Toma una captura de pantalla de la página activa en Brave Browser.',
        parameters: {
          type: 'OBJECT',
          properties: {
            fullPage: {
              type: 'BOOLEAN',
              description: 'Si la captura debe abarcar la página completa con desplazamiento.',
            },
          },
        },
      },
      {
        name: 'browser_evaluate',
        description:
          'Ejecuta un fragmento de JavaScript en el contexto de la página web activa y retorna el resultado.',
        parameters: {
          type: 'OBJECT',
          properties: {
            script: {
              type: 'STRING',
              description: 'Código JavaScript a ejecutar en la consola de la página.',
            },
          },
          required: ['script'],
        },
      },
      {
        name: 'browser_get_status',
        description:
          'Obtiene el estado actual del navegador Brave (si está abierto, URL activa, título, si hay un video reproduciéndose y tiempo transcurrido).',
        parameters: {
          type: 'OBJECT',
          properties: {},
        },
      },
      {
        name: 'browser_close',
        description: 'Cierra el navegador Brave Browser.',
        parameters: {
          type: 'OBJECT',
          properties: {},
        },
      },
    ];
  }

  /**
   * Executes a given Playwright MCP tool by name.
   */
  async executeTool(
    name: string,
    args: Record<string, any> = {},
    signal?: AbortSignal
  ): Promise<Record<string, any>> {
    if (signal?.aborted) {
      return { status: 'cancelled', cancelled: true };
    }

    try {
      const backend = await this.getBackend();

      switch (name) {
        case 'browser_play_youtube_video':
        case 'play_youtube_video':
        case 'play_youtube':
        case 'youtube_play': {
          const query = String(args.query || args.search || '').trim();
          if (!query) {
            return {
              status: 'error',
              success: false,
              error: 'Se requiere el parámetro "query" para buscar y reproducir en YouTube.',
            };
          }

          logger.info('PLAYWRIGHT', `Iniciando reproducción autónoma en YouTube: "${query}"...`);
          const result = await backend.playYouTube({
            query,
            autoPlay: args.autoPlay !== false,
            timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
          });

          return {
            status: result.success ? 'success' : 'error',
            ...result,
            message: result.success
              ? `Reproduciendo "${result.title}" en YouTube a través de Brave Browser.`
              : (result.error || 'No se pudo reproducir el video.'),
          };
        }

        case 'browser_media_control': {
          const action = String(args.action || 'toggle').toLowerCase();
          const validActions = [
            'play',
            'pause',
            'toggle',
            'seek',
            'volume',
            'mute',
            'unmute',
            'fullscreen',
          ];
          if (!validActions.includes(action)) {
            return {
              status: 'error',
              success: false,
              error: `Acción inválida "${action}". Acciones soportadas: ${validActions.join(', ')}`,
            };
          }

          const result = await backend.mediaControl({
            action: action as any,
            value: typeof args.value === 'number' ? args.value : undefined,
          });

          return {
            status: result.success ? 'success' : 'error',
            ...result,
          };
        }

        case 'browser_search': {
          const query = String(args.query || '').trim();
          if (!query) {
            return { status: 'error', success: false, error: 'Se requiere el parámetro "query" para buscar.' };
          }
          const result = await backend.search({
            query,
            engine: args.engine,
          });
          return {
            status: result.success ? 'success' : 'error',
            ...result,
          };
        }

        case 'browser_navigate': {
          const url = String(args.url || '').trim();
          if (!url) {
            return { status: 'error', success: false, error: 'Se requiere el parámetro "url".' };
          }
          const result = await backend.navigate({
            url,
            timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
          });
          return {
            status: result.success ? 'success' : 'error',
            ...result,
          };
        }

        case 'browser_snapshot': {
          const result = await backend.snapshot({
            maxChars: typeof args.maxChars === 'number' ? args.maxChars : undefined,
          });
          return {
            status: result.success ? 'success' : 'error',
            ...result,
          };
        }

        case 'browser_click': {
          const selector = String(args.selector || '').trim();
          if (!selector) {
            return { success: false, error: 'Se requiere el parámetro "selector".' };
          }
          const result = await backend.click({
            selector,
            timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
          });
          return {
            status: result.success ? 'success' : 'error',
            ...result,
          };
        }

        case 'browser_type': {
          const selector = String(args.selector || '').trim();
          const text = String(args.text || '');
          if (!selector) {
            return { success: false, error: 'Se requiere el parámetro "selector".' };
          }
          const result = await backend.type({
            selector,
            text,
            pressEnter: Boolean(args.pressEnter),
            timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
          });
          return {
            status: result.success ? 'success' : 'error',
            ...result,
          };
        }

        case 'browser_take_screenshot': {
          const result = await backend.takeScreenshot({
            fullPage: Boolean(args.fullPage),
          });
          return {
            status: result.success ? 'success' : 'error',
            ...result,
          };
        }

        case 'browser_evaluate': {
          const script = String(args.script || '').trim();
          if (!script) {
            return { success: false, error: 'Se requiere el parámetro "script".' };
          }
          const result = await backend.evaluate({ script });
          return {
            status: result.success ? 'success' : 'error',
            ...result,
          };
        }

        case 'browser_get_status': {
          const result = await backend.getStatus();
          return {
            status: 'success',
            ...result,
          };
        }

        case 'browser_close': {
          const result = await backend.close();
          return {
            status: 'success',
            ...result,
          };
        }

        default:
          return {
            status: 'error',
            error: `Herramienta desconocida en Playwright MCP: "${name}"`,
          };
      }
    } catch (err) {
      const errorMsg = (err as Error).message || String(err);
      logger.error('PLAYWRIGHT', `Error ejecutando ${name}: ${errorMsg}`);
      return {
        status: 'error',
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Dispatches standard MCP tool calls.
   */
  async callTool(name: string, args: Record<string, any> = {}): Promise<{ success: boolean; content?: any; error?: string }> {
    const result = await this.executeTool(name, args);
    if (result.status === 'error' || result.success === false) {
      return {
        success: false,
        error: result.error || 'Fallo en la ejecución de la herramienta.',
      };
    }
    return {
      success: true,
      content: result,
    };
  }

  /**
   * Resolves the execution backend (Electron IPC bridge or direct BraveBrowserManager in Node).
   */
  private async getBackend() {
    if (typeof window !== 'undefined' && (window as any).electronBridge?.browserPlayYouTube) {
      const bridge = (window as any).electronBridge;
      return {
        navigate: (opts: any) => bridge.browserNavigate(opts),
        search: (opts: any) => bridge.browserSearch(opts),
        playYouTube: (opts: any) => bridge.browserPlayYouTube(opts),
        mediaControl: (opts: any) => bridge.browserMediaControl(opts),
        click: (opts: any) => bridge.browserClick(opts),
        type: (opts: any) => bridge.browserType(opts),
        snapshot: (opts: any) => bridge.browserSnapshot(opts),
        takeScreenshot: (opts: any) => bridge.browserTakeScreenshot(opts),
        evaluate: (opts: any) => bridge.browserEvaluate(opts),
        close: () => bridge.browserClose(),
        getStatus: () => bridge.browserGetStatus(),
      };
    }

    // Node.js environment (e.g. tests or standalone MCP process)
    const tsPath = '../../../../electron/src/integrations/BraveBrowserManager.ts';
    const mod: any = await import(/* @vite-ignore */ tsPath);
    const braveBrowserManager = mod.braveBrowserManager;
    return {
      navigate: (opts: any) => braveBrowserManager.navigate(opts),
      search: (opts: any) => braveBrowserManager.search(opts),
      playYouTube: (opts: any) => braveBrowserManager.playYouTubeVideo(opts),
      mediaControl: (opts: any) => braveBrowserManager.mediaControl(opts),
      click: (opts: any) => braveBrowserManager.click(opts),
      type: (opts: any) => braveBrowserManager.type(opts),
      snapshot: (opts: any) => braveBrowserManager.snapshot(opts),
      takeScreenshot: (opts: any) => braveBrowserManager.takeScreenshot(opts),
      evaluate: (opts: any) => braveBrowserManager.evaluate(opts),
      close: () => braveBrowserManager.close(),
      getStatus: () => braveBrowserManager.getStatus(),
    };
  }
}

export const playwrightMcpServer = new PlaywrightMcpServer();
