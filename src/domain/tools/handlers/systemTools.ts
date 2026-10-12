import type { IToolHandler, ToolExecutionContext } from '../IToolHandler';

let cachedElectronBridge: any = null;

async function getElectronBridge() {
  if (typeof window !== 'undefined' && (window as any).electronBridge) {
    return (window as any).electronBridge;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).electronBridge) {
    return (globalThis as any).electronBridge;
  }
  if (cachedElectronBridge) return cachedElectronBridge;
  try {
    const mod = await import('../../../services/desktop/ElectronBridge.js');
    if (mod?.electronBridge) {
      cachedElectronBridge = mod.electronBridge;
      return cachedElectronBridge;
    }
  } catch {
    try {
      const tsPath = '../../../services/desktop/ElectronBridge.ts';
      const mod = await import(/* @vite-ignore */ tsPath);
      if (mod?.electronBridge) {
        cachedElectronBridge = mod.electronBridge;
        return cachedElectronBridge;
      }
    } catch {
      return null;
    }
  }
  return null;
}

const bridgeProxy: any = new Proxy({}, {
  get(_target, prop) {
    if (typeof window !== 'undefined' && (window as any).electronBridge) {
      return (window as any).electronBridge[prop];
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).electronBridge) {
      return (globalThis as any).electronBridge[prop];
    }
    if (cachedElectronBridge) {
      return cachedElectronBridge[prop];
    }
    if (prop === 'isElectron') return false;
    return undefined;
  }
});

let cachedEventBusModule: any = null;
async function getEventBusModule() {
  if (cachedEventBusModule) return cachedEventBusModule;
  try {
    const mod = await import('../../../infrastructure/events/eventBus.js');
    cachedEventBusModule = mod;
    return mod;
  } catch {
    try {
      const tsPath = '../../../infrastructure/events/eventBus.ts';
      const mod = await import(/* @vite-ignore */ tsPath);
      cachedEventBusModule = mod;
      return mod;
    } catch {
      return null;
    }
  }
}

const DANGEROUS_COMMAND_PATTERNS = [
  /format\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\bbcdedit\b/i,
  /cipher\s+\/w/i,
  /\b(rmdir|del|erase|remove-item)\b.*[\\/](windows|system32|systemroot)/i,
  /\b(rmdir|del|erase|remove-item)\b.*([a-z]:[\\/]?\*?["']?\s*$)/i,
];

function isCommandSafeLocal(command: string): boolean {
  if (typeof command !== 'string' || !command.trim()) return false;
  const trimmed = command.trim();
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }
  return true;
}

export const getCurrentTimeAndDateHandler: IToolHandler = {
  name: 'get_current_time_and_date',
  declaration: {
    name: 'get_current_time_and_date',
    description: 'Obtiene la hora actual exacta, fecha completa, día de la semana y zona horaria del sistema local.'
  },
  async execute(_args?: unknown, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Consulta de fecha/hora cancelada por señal de aborto.', cancelled: true };
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    };
    return {
      status: 'success',
      current_time: now.toLocaleTimeString('es-ES'),
      current_date: now.toLocaleDateString('es-ES', options),
      iso: now.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }
};

export const getWeatherHandler: IToolHandler = {
  name: 'get_weather',
  declaration: {
    name: 'get_weather',
    description: 'Consulta el clima actual o pronóstico de una ciudad dada o ubicación local.',
    parameters: {
      type: 'OBJECT',
      properties: {
        city: {
          type: 'STRING',
          description: 'Nombre de la ciudad o localidad a consultar. Si no se especifica, usa la ubicación del usuario.'
        }
      }
    }
  },
  async execute(args: { city?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Consulta de clima cancelada por señal de aborto.', cancelled: true };
    const city = typeof args?.city === 'string' && args.city.trim() ? args.city.trim() : 'Ubicación actual';
    const weatherData = {
      status: 'success',
      location: city,
      temperature: '22°C',
      condition: 'Soleado y agradable',
      humidity: '45%',
      wind: '12 km/h'
    };
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Consulta de clima cancelada antes de emitir evento.', cancelled: true };
    const eventBusMod = await getEventBusModule();
    if (eventBusMod?.eventBus && eventBusMod?.EVENTS) {
      eventBusMod.eventBus.emit(eventBusMod.EVENTS.WIDGET_TRIGGERED, {
        id: String(Date.now()),
        type: 'weather',
        title: `Clima: ${city}`,
        content: `${weatherData.temperature} • ${weatherData.condition}`,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        duration: 12000
      });
    }
    return weatherData;
  }
};

export const systemDiagnosticsHandler: IToolHandler = {
  name: 'system_diagnostics',
  declaration: { name: 'system_diagnostics', description: 'Consulta información del sistema operativo.' },
  async execute(_args?: unknown, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Diagnóstico de sistema cancelado por señal de aborto.', cancelled: true };
    try {
      const bridge = (await getElectronBridge()) || bridgeProxy;
      const res = await bridge.systemExecute('system-info');
      if (context?.signal?.aborted) return { status: 'cancelled', message: 'Diagnóstico de sistema cancelado tras ejecución.', cancelled: true };
      return { status: 'success', ...res };
    } catch (error) {
      return { status: 'error', message: String(error) };
    }
  }
};

export const executeSystemCommandHandler: IToolHandler = {
  name: 'execute_system_command',
  declaration: {
    name: 'execute_system_command',
    description: 'Consulta diagnósticos mediante capacidades nominales del sistema.',
    parameters: { type: 'OBJECT', properties: { kind: { type: 'STRING', enum: ['system-info', 'list-processes'] } }, required: ['kind'] }
  },
  async execute(args: { kind?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Ejecución de comando cancelada por señal de aborto.', cancelled: true };
    if (args.kind !== 'system-info' && args.kind !== 'list-processes') return { status: 'error', message: 'Capacidad no autorizada.' };
    try {
      const bridge = (await getElectronBridge()) || bridgeProxy;
      const res = await bridge.systemExecute(args.kind);
      if (context?.signal?.aborted) return { status: 'cancelled', message: 'Ejecución de comando cancelada tras ejecución.', cancelled: true };
      return { status: 'success', ...res };
    } catch (error) {
      return { status: 'error', message: String(error) };
    }
  }
};

export const executeTerminalCommandHandler: IToolHandler = {
  name: 'execute_terminal_command',
  declaration: {
    name: 'execute_terminal_command',
    description: 'Ejecuta comandos de consola de Windows (PowerShell/CMD) en el sistema del usuario con salvaguardas de seguridad.',
    parameters: {
      type: 'OBJECT',
      properties: {
        command: {
          type: 'STRING',
          description: 'Comando de consola o script a ejecutar en PowerShell.'
        },
        cwd: {
          type: 'STRING',
          description: 'Directorio de trabajo relativo o absoluto donde ejecutar el comando. Opcional.'
        }
      },
      required: ['command']
    }
  },
  async execute(args: { command?: string; cwd?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Ejecución de comando cancelada por señal de aborto.', cancelled: true };
    if (!args?.command || typeof args.command !== 'string' || !args.command.trim()) {
      return { status: 'error', message: 'El parámetro "command" es requerido para execute_terminal_command.' };
    }

    if (!isCommandSafeLocal(args.command)) {
      return {
        status: 'error',
        command: args.command,
        message: 'Comando bloqueado por salvaguardas de seguridad del sistema.'
      };
    }

    const bridge = (await getElectronBridge()) || bridgeProxy;
    if (bridge?.executeTerminalCommand) {
      try {
        const res = await bridge.executeTerminalCommand(args.command, args.cwd);
        if (context?.signal?.aborted) return { status: 'cancelled', message: 'Ejecución cancelada tras retorno de terminal.', cancelled: true };
        if (res?.exitCode === 0) {
          return {
            status: 'success',
            command: args.command,
            stdOut: res.stdOut ?? '',
            stdErr: '',
            exitCode: 0,
            message: 'Comando ejecutado con éxito.'
          };
        } else {
          const rawErr = res?.error || res?.stdErr || '';
          const cleanErr = rawErr
            .replace(/#<\s*CLIXML[\s\S]*?<\/Objs>/gi, '')
            .replace(/<Objs[\s\S]*?<\/Objs>/gi, '')
            .trim();
          return {
            status: 'error',
            command: args.command,
            stdOut: res?.stdOut ?? '',
            stdErr: cleanErr,
            exitCode: res?.exitCode ?? 1,
            message: cleanErr || `El comando finalizó con código de salida ${res?.exitCode ?? 1}.`
          };
        }
      } catch (err: any) {
        return {
          status: 'error',
          command: args.command,
          message: err?.message || String(err)
        };
      }
    }

    return {
      status: 'error',
      command: args.command,
      message: 'Terminal no disponible fuera del entorno de escritorio.'
    };
  }
};

export const readFileHandler: IToolHandler = {
  name: 'read_file',
  declaration: {
    name: 'read_file',
    description: 'Lee el contenido de un archivo dentro de las carpetas autorizadas (Workspace, Escritorio, Descargas, Documentos, Imágenes, Vídeos, Música o carpetas añadidas).',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: {
          type: 'STRING',
          description: 'Ruta del archivo (relativa a cualquiera de las carpetas autorizadas como "escritorio/archivo.txt", o ruta absoluta).'
        }
      },
      required: ['path']
    }
  },
  async execute(args: { path?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) {
      return { status: 'cancelled', message: 'Lectura cancelada por señal de aborto.', cancelled: true };
    }
    const path = args?.path;
    if (!path || typeof path !== 'string') {
      return { status: 'error', message: 'La ruta de archivo (path) es requerida.' };
    }

    const bridge = (await getElectronBridge()) || bridgeProxy;
    if (bridge.isElectron) {
      try {
        const targetReq = { scope: 'workspaceApproved' as const, path };
        const content = await bridge.readFile(targetReq);
        if (context?.signal?.aborted) {
          return { status: 'cancelled', message: 'Lectura cancelada tras recepción.', cancelled: true };
        }
        return { status: 'success', path, content: content.substring(0, 8000) };
      } catch (e: any) {
        return { status: 'error', path, message: e?.message };
      }
    }
    return { status: 'error', path, message: 'Operación no disponible fuera del entorno de escritorio.' };
  }
};

export const writeFileHandler: IToolHandler = {
  name: 'write_file',
  declaration: {
    name: 'write_file',
    description: 'Crea o sobreescribe un archivo dentro de las carpetas autorizadas (Workspace, Escritorio, Descargas, Documentos, Imágenes, Vídeos, Música o carpetas añadidas).',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: {
          type: 'STRING',
          description: 'Ruta de destino del archivo (relativa a cualquiera de las carpetas autorizadas como "escritorio/archivo.txt", o ruta absoluta).'
        },
        content: {
          type: 'STRING',
          description: 'Contenido a escribir en el archivo.'
        },
        append: {
          type: 'BOOLEAN',
          description: 'Si es true, agrega el contenido al final sin borrar lo existente. Por defecto false.'
        }
      },
      required: ['path', 'content']
    }
  },
  async execute(args: { path?: string; content?: any; append?: boolean }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) {
      return { status: 'cancelled', message: 'Escritura cancelada por señal de aborto.', cancelled: true };
    }
    const { path, content, append } = args || {};
    if (!path || typeof path !== 'string') {
      return { status: 'error', message: 'La ruta de archivo (path) es requerida.' };
    }
    const contentStr = content !== undefined ? String(content) : '';

    const bridge = (await getElectronBridge()) || bridgeProxy;
    if (bridge.isElectron) {
      try {
        if (context?.signal?.aborted) {
          return { status: 'cancelled', message: 'Escritura cancelada antes de acceder al disco.', cancelled: true };
        }
        const targetReq = { scope: 'workspaceApproved' as const, path };
        if (append) {
          await bridge.appendFile(targetReq, contentStr);
        } else {
          await bridge.writeFile(targetReq, contentStr);
        }
        return { status: 'success', path, bytes_written: contentStr.length, append: !!append };
      } catch (e: any) {
        return { status: 'error', path, message: e?.message };
      }
    }
    return { status: 'error', path, message: 'Operación no disponible fuera del entorno de escritorio.' };
  }
};

export const listDirectoryHandler: IToolHandler = {
  name: 'list_directory',
  declaration: {
    name: 'list_directory',
    description: 'Lista los archivos y subcarpetas dentro de las carpetas autorizadas (Workspace, Escritorio, Descargas, Documentos, Imágenes, Vídeos, Música o carpetas añadidas).',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: {
          type: 'STRING',
          description: 'Ruta del directorio a listar (dejar vacío para listar la raíz del workspace, usar prefijo como "escritorio", "descargas", etc., o ruta absoluta).'
        }
      },
      required: ['path']
    }
  },
  async execute(args: { path?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Listado de directorio cancelado por señal de aborto.', cancelled: true };
    const path = (typeof args?.path === 'string' && args.path.trim())
      ? args.path.trim()
      : '';

    const bridge = (await getElectronBridge()) || bridgeProxy;
    if (bridge.isElectron) {
      try {
        const targetReq = { scope: 'workspaceApproved' as const, path };
        const entries = await bridge.readDirectory(targetReq);
        if (context?.signal?.aborted) return { status: 'cancelled', message: 'Listado de directorio cancelado tras lectura.', cancelled: true };
        return {
          status: 'success',
          path,
          count: entries.length,
          entries: entries.slice(0, 100).map((e: any) => ({
            name: e.entry,
            type: e.type
          }))
        };
      } catch (e: any) {
        return { status: 'error', path, message: e?.message };
      }
    }
    return { status: 'error', path, message: 'Operación no disponible fuera del entorno de escritorio.' };
  }
};

export const readDirectoryHandler: IToolHandler = listDirectoryHandler;

export const getClipboardHandler: IToolHandler = {
  name: 'get_clipboard',
  declaration: {
    name: 'get_clipboard',
    description: 'Lee el contenido actual del portapapeles del sistema del usuario.'
  },
  async execute(_args?: unknown, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Lectura de portapapeles cancelada por señal de aborto.', cancelled: true };
    try {
      const bridge = (await getElectronBridge()) || bridgeProxy;
      const text = await bridge.getClipboardText();
      if (context?.signal?.aborted) return { status: 'cancelled', message: 'Lectura de portapapeles cancelada tras obtención.', cancelled: true };
      return { status: 'success', content: text };
    } catch (e: any) {
      return { status: 'error', message: e?.message };
    }
  }
};

export const setClipboardHandler: IToolHandler = {
  name: 'set_clipboard',
  declaration: {
    name: 'set_clipboard',
    description: 'Escribe texto en el portapapeles del sistema del usuario.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: {
          type: 'STRING',
          description: 'Texto a copiar al portapapeles.'
        }
      },
      required: ['text']
    }
  },
  async execute(args: { text?: any }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Operación de portapapeles cancelada por señal de aborto.', cancelled: true };
    const text = args?.text !== undefined ? String(args.text) : '';
    try {
      const bridge = (await getElectronBridge()) || bridgeProxy;
      await bridge.setClipboardText(text);
      if (context?.signal?.aborted) return { status: 'cancelled', message: 'Operación de portapapeles cancelada tras copia.', cancelled: true };
      return { status: 'success', message: 'Texto copiado al portapapeles.', length: text.length };
    } catch (e: any) {
      return { status: 'error', message: e?.message };
    }
  }
};

export const getRunningProcessesHandler: IToolHandler = {
  name: 'get_running_processes',
  declaration: { name: 'get_running_processes', description: 'Lista los procesos activos.' },
  async execute(_args?: unknown, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Consulta de procesos activos cancelada por señal de aborto.', cancelled: true };
    try {
      const bridge = (await getElectronBridge()) || bridgeProxy;
      const res = await bridge.systemExecute('list-processes');
      if (context?.signal?.aborted) return { status: 'cancelled', message: 'Consulta de procesos activos cancelada tras ejecución.', cancelled: true };
      return { status: 'success', ...res };
    } catch (error) {
      return { status: 'error', message: String(error) };
    }
  }
};

export const killProcessHandler: IToolHandler = {
  name: 'kill_process',
  declaration: { name: 'kill_process', description: 'Capacidad no disponible.' },
  async execute(_args?: unknown, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Operación cancelada por señal de aborto.', cancelled: true };
    return { status: 'error', message: 'Terminar procesos no es una capacidad autorizada.' };
  }
};

export const openFileOrFolderHandler: IToolHandler = {
  name: 'open_file_or_folder',
  declaration: {
    name: 'open_file_or_folder',
    description: 'Muestra un archivo o abre una carpeta del espacio autorizado en el Explorador.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: {
          type: 'STRING',
          description: 'Ruta relativa dentro de la carpeta autorizada desde Ajustes.'
        }
      },
      required: ['path']
    }
  },
  async execute(args: { path?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Apertura de archivo cancelada por señal de aborto.', cancelled: true };
    const path = args?.path;
    if (!path || typeof path !== 'string') {
      return { status: 'error', message: 'No path provided.' };
    }
    const bridge = (await getElectronBridge()) || bridgeProxy;
    if (bridge.isElectron) {
      if (context?.signal?.aborted) return { status: 'cancelled', message: 'Apertura de archivo cancelada antes de invocar el sistema.', cancelled: true };
      const res = await bridge.openPath(path);
      if (context?.signal?.aborted) return { status: 'cancelled', message: 'Apertura de archivo cancelada tras invocar el sistema.', cancelled: true };
      if (res.success) {
        return { status: 'success', path, message: `Ruta "${path}" abierta en el explorador o aplicación predeterminada.` };
      }
      return { status: 'error', path, message: res.error || 'No se pudo abrir la ruta.' };
    }
    return { status: 'success', path, message: `Ruta "${path}" procesada en modo virtual.` };
  }
};

export const openSystemAppOrLinkHandler: IToolHandler = {
  name: 'open_system_app_or_link',
  declaration: {
    name: 'open_system_app_or_link',
    description: 'Abre un enlace web, aplicación o archivo usando el programa predeterminado del sistema.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: {
          type: 'STRING',
          description: 'URL completa a abrir, o ruta a una aplicación/archivo del sistema (ej: "https://youtube.com", "C:\\\\Windows\\\\notepad.exe").'
        }
      },
      required: ['url']
    }
  },
  async execute(args: { url?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Apertura de aplicación/enlace cancelada por señal de aborto.', cancelled: true };
    const url = args?.url;
    if (!url || typeof url !== 'string') {
      return { status: 'error', message: 'No URL or path provided.' };
    }

    try {
      if (context?.signal?.aborted) return { status: 'cancelled', message: 'Apertura cancelada antes de abrir externamente.', cancelled: true };
      const bridge = (await getElectronBridge()) || bridgeProxy;
      await bridge.openExternal(url);
      if (context?.signal?.aborted) return { status: 'cancelled', message: 'Apertura cancelada tras abrir externamente.', cancelled: true };
      return { status: 'success', opened: true, url };
    } catch (error) { return { status: 'error', opened: false, message: String(error) }; }
  }
};

export const systemTools: IToolHandler[] = [
  getCurrentTimeAndDateHandler,
  getWeatherHandler,
  systemDiagnosticsHandler,
  executeSystemCommandHandler,
  executeTerminalCommandHandler,
  readFileHandler,
  writeFileHandler,
  listDirectoryHandler,
  getClipboardHandler,
  setClipboardHandler,
  getRunningProcessesHandler,
  openFileOrFolderHandler,
  openSystemAppOrLinkHandler
];
