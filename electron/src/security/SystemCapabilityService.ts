import * as electronModule from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PathPolicy, isWithin, type PathScope } from './PathPolicy.ts';
import type { FileRequest } from '../../../shared/ipc/contracts.ts';

interface ElectronLike {
  app?: typeof import('electron').app;
  dialog?: typeof import('electron').dialog;
  BrowserWindow?: typeof import('electron').BrowserWindow;
}

const electronModuleObj = electronModule as unknown as ElectronLike & { default?: ElectronLike };
const electron: ElectronLike = electronModuleObj?.app
  ? electronModuleObj
  : (electronModuleObj?.default && typeof electronModuleObj.default === 'object')
    ? electronModuleObj.default
    : {};
const { app, dialog, BrowserWindow } = electron;

const DANGEROUS_PATTERNS = [
  /format\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\bbcdedit\b/i,
  /cipher\s+\/w/i,
  /\b(rmdir|del|erase|remove-item)\b.*[\\/](windows|system32|systemroot)/i,
  /\b(rmdir|del|erase|remove-item)\b.*([a-z]:[\\/]?\*?["']?\s*$)/i,
];

export function isCommandSafe(command: string): boolean {
  if (typeof command !== 'string' || !command.trim()) return false;
  const trimmed = command.trim();
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }
  return true;
}

export function cleanPowerShellStderr(stderr: string): string {
  if (!stderr) return '';
  let cleaned = stderr;
  // If there's an execFile "Command failed: powershell.exe ...\n" prefix, strip it
  cleaned = cleaned.replace(/^Command failed: powershell\.exe[\s\S]*?[\r\n]+/i, '');

  if (cleaned.includes('<Objs')) {
    // Extract error stream strings: <S S="Error">...</S>
    const errorParts: string[] = [];
    const errorRegex = /<S S="Error">([\s\S]*?)<\/S>/gi;
    let match: RegExpExecArray | null;
    while ((match = errorRegex.exec(cleaned)) !== null) {
      errorParts.push(match[1]);
    }

    if (errorParts.length > 0) {
      cleaned = errorParts.join('')
        .replace(/_x000D__x000A_/g, '\n')
        .replace(/_x000A_/g, '\n')
        .replace(/_x000D_/g, '\r')
        .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    } else {
      // It was purely non-error progress XML, strip completely
      cleaned = cleaned.replace(/#<\s*CLIXML[\s\S]*?<\/Objs>/gi, '');
      cleaned = cleaned.replace(/<Objs[\s\S]*?<\/Objs>/gi, '');
    }
  }

  // Final cleanup of any stray tags
  cleaned = cleaned.replace(/#<\s*CLIXML/gi, '');
  cleaned = cleaned.replace(/<Objs[\s\S]*?<\/Objs>/gi, '');
  return cleaned.trim();
}

export async function executeTerminalCommand(
  command: string,
  cwd?: string,
  timeoutMs = 60000
): Promise<{ stdOut?: string; stdErr?: string; exitCode?: number; error?: string }> {
  if (!isCommandSafe(command)) {
    return {
      stdOut: '',
      stdErr: 'Comando bloqueado por salvaguardas de seguridad del sistema.',
      exitCode: 1,
      error: 'Comando bloqueado por salvaguardas de seguridad del sistema.'
    };
  }

  let effectiveCwd = cwd;
  if (!effectiveCwd) {
    try {
      const configPath = path.join(process.cwd(), 'config', 'app.json');
      const raw = await fs.readFile(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.workspacePath && typeof parsed.workspacePath === 'string') {
        effectiveCwd = parsed.workspacePath;
      }
    } catch {
      // ignore
    }
  }
  if (!effectiveCwd) {
    effectiveCwd = process.cwd();
  }

  try {
    const wrappedCommand = [
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`,
      `$OutputEncoding = [System.Text.Encoding]::UTF8`,
      `$ProgressPreference = 'SilentlyContinue'`,
      `$WarningPreference = 'SilentlyContinue'`,
      `$env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + $env:Path`,
      command
    ].join('; ');
    const encoded = Buffer.from(wrappedCommand, 'utf16le').toString('base64');
    const psArgs = encoded.length < 8000
      ? ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]
      : ['-NoProfile', '-NonInteractive', '-Command', wrappedCommand];

    const result = await promisify(execFile)(
      'powershell.exe',
      psArgs,
      {
        cwd: effectiveCwd,
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      }
    );
    // On success (exitCode 0), any remaining stderr is non-fatal noise or progress; clean and suppress it
    const cleanedErr = cleanPowerShellStderr(result.stderr || '');
    return {
      stdOut: result.stdout || '',
      stdErr: cleanedErr,
      exitCode: 0
    };
  } catch (err: unknown) {
    const errorObj = err as { stdout?: string | Buffer; stderr?: string | Buffer; code?: number; message?: string };
    const rawErr = errorObj.stderr ? String(errorObj.stderr) : (errorObj.message || String(err));
    const cleanedErr = cleanPowerShellStderr(rawErr);
    return {
      stdOut: errorObj.stdout ? String(errorObj.stdout) : '',
      stdErr: cleanedErr || (errorObj.message || String(err)),
      exitCode: typeof errorObj.code === 'number' ? errorObj.code : 1,
      error: cleanedErr || errorObj.message || String(err)
    };
  }
}

let workspaceApproved: string | undefined;
export async function approveWorkspace(parent?: import('electron').BrowserWindow): Promise<{ success: boolean; path?: string }> {
  if (!dialog || !BrowserWindow) return { success: false };
  const activeWindow = parent || BrowserWindow.getFocusedWindow();
  const options: import('electron').OpenDialogOptions = { title: 'Autorizar carpeta para herramientas de Cristi', properties: ['openDirectory'] };
  const result = activeWindow
    ? await dialog.showOpenDialog(activeWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled) return { success: false };
  workspaceApproved = await fs.realpath(result.filePaths[0]);
  return { success: true, path: workspaceApproved };
}

export function getSystemFoldersPaths(): Record<string, string> {
  const home = os.homedir();
  const safeGetPath = (name: 'desktop' | 'downloads' | 'documents' | 'pictures' | 'videos' | 'music', fallbackName: string): string => {
    try {
      if (app && typeof app.getPath === 'function') {
        const folder = app.getPath(name);
        if (folder && typeof folder === 'string') {
          return folder;
        }
      }
    } catch {
      // ignore
    }
    return path.join(home, fallbackName);
  };

  return {
    desktop: safeGetPath('desktop', 'Desktop'),
    downloads: safeGetPath('downloads', 'Downloads'),
    documents: safeGetPath('documents', 'Documents'),
    pictures: safeGetPath('pictures', 'Pictures'),
    videos: safeGetPath('videos', 'Videos'),
    music: safeGetPath('music', 'Music'),
  };
}

const PREFIX_MAPPINGS: Array<{ regex: RegExp; scope: PathScope }> = [
  { regex: /^(?:escritorio|desktop)(?:[\\/](.*))?$/i, scope: 'desktop' },
  { regex: /^(?:descargas|downloads)(?:[\\/](.*))?$/i, scope: 'downloads' },
  { regex: /^(?:documentos|documents)(?:[\\/](.*))?$/i, scope: 'documents' },
  { regex: /^(?:imagenes|imágenes|pictures|fotos)(?:[\\/](.*))?$/i, scope: 'pictures' },
  { regex: /^(?:videos|vídeos)(?:[\\/](.*))?$/i, scope: 'videos' },
  { regex: /^(?:musica|música|music)(?:[\\/](.*))?$/i, scope: 'music' },
];

interface AppConfigJson {
  workspacePath?: string;
  allowedFolders?: {
    desktop?: boolean;
    downloads?: boolean;
    documents?: boolean;
    pictures?: boolean;
    videos?: boolean;
    music?: boolean;
  };
  customAllowedPaths?: string[];
}

async function loadAppConfig(): Promise<AppConfigJson> {
  try {
    const configPath = path.join(process.cwd(), 'config', 'app.json');
    const raw = await fs.readFile(configPath, 'utf8');
    return JSON.parse(raw) as AppConfigJson;
  } catch {
    return {};
  }
}

export async function resolveFile(request: FileRequest | string): Promise<string> {
  const exportsDir = path.join(app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.userData'), 'exports');
  await fs.mkdir(exportsDir, { recursive: true });

  const config = await loadAppConfig();
  const allowedFolders = {
    desktop: true,
    downloads: true,
    documents: true,
    pictures: true,
    videos: true,
    music: true,
    ...(config.allowedFolders || {}),
  };
  const customAllowedPaths: string[] = Array.isArray(config.customAllowedPaths)
    ? config.customAllowedPaths
    : [];

  let effectiveWorkspace = workspaceApproved;
  if (!effectiveWorkspace && config.workspacePath && typeof config.workspacePath === 'string') {
    effectiveWorkspace = config.workspacePath;
  }
  if (!effectiveWorkspace) {
    effectiveWorkspace = process.cwd();
  }

  try {
    effectiveWorkspace = await fs.realpath(effectiveWorkspace);
  } catch {
    effectiveWorkspace = path.resolve(effectiveWorkspace);
  }

  const systemFolders = getSystemFoldersPaths();

  const roots: Partial<Record<PathScope, string>> = {
    workspaceApproved: effectiveWorkspace,
    exports: exportsDir,
    ...(allowedFolders.desktop ? { desktop: systemFolders.desktop } : {}),
    ...(allowedFolders.downloads ? { downloads: systemFolders.downloads } : {}),
    ...(allowedFolders.documents ? { documents: systemFolders.documents } : {}),
    ...(allowedFolders.pictures ? { pictures: systemFolders.pictures } : {}),
    ...(allowedFolders.videos ? { videos: systemFolders.videos } : {}),
    ...(allowedFolders.music ? { music: systemFolders.music } : {}),
  };

  const reqObj: FileRequest = typeof request === 'string'
    ? { scope: 'workspaceApproved', path: request }
    : request;
  let reqPath = reqObj.path;
  let targetScope: PathScope = reqObj.scope;

  if (path.isAbsolute(reqPath) || path.win32.isAbsolute(reqPath)) {
    const resolvedReq = path.resolve(reqPath);
    const candidates: Array<{ scope: PathScope; root: string }> = [];

    for (const [scopeKey, rootPath] of Object.entries(roots) as Array<[PathScope, string]>) {
      if (rootPath) {
        candidates.push({ scope: scopeKey, root: rootPath });
      }
    }
    for (const customPath of customAllowedPaths) {
      if (customPath) {
        candidates.push({ scope: 'custom', root: customPath });
      }
    }

    candidates.sort((a, b) => b.root.length - a.root.length);

    let matched: { scope: PathScope; root: string } | undefined;
    for (const candidate of candidates) {
      try {
        let realRoot = candidate.root;
        try {
          realRoot = await fs.realpath(candidate.root);
        } catch {
          realRoot = path.resolve(candidate.root);
        }
        if (isWithin(realRoot, resolvedReq) || isWithin(path.resolve(candidate.root), resolvedReq)) {
          matched = { scope: candidate.scope, root: candidate.root };
          break;
        }
      } catch {
        // ignore
      }
    }

    if (matched) {
      targetScope = matched.scope;
      if (matched.scope === 'custom') {
        roots.custom = matched.root;
      }
      reqPath = path.relative(matched.root, resolvedReq);
    }
  } else {
    for (const mapping of PREFIX_MAPPINGS) {
      const match = reqPath.match(mapping.regex);
      if (match) {
        targetScope = mapping.scope;
        reqPath = match[1] ? match[1].replace(/^[\\/]+/, '') : '';
        break;
      }
    }
  }

  return new PathPolicy(roots).resolveWithin(targetScope, reqPath);
}

export async function executeSystemCapability(request: { kind: 'system-info' | 'list-processes' }) {
  const executable = request.kind === 'system-info' ? 'systeminfo.exe' : 'tasklist.exe';
  const result = await promisify(execFile)(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', executable), [],
    { windowsHide: true, timeout: 10000, maxBuffer: 1_048_576 });
  return { stdOut: result.stdout, stdErr: result.stderr, exitCode: 0 };
}
