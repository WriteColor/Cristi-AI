import * as electronModule from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { PathPolicy, isPathProtectedFromDeletion, isPathProtectedFromModification, type PathScope } from './PathPolicy.ts';
import type { FileRequest } from '../../../shared/ipc/contracts.ts';

const execFileAsync = promisify(execFile);

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

export { isPathProtectedFromDeletion, isPathProtectedFromModification };

const DANGEROUS_PATTERNS = [
  /\bformat\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\bbcdedit\b/i,
  /\bcipher\s+\/w/i,
  /\b(rmdir|rd|del|erase|remove-item)\b.*[\\/](windows|system32|winsxs|systemroot|recovery|boot|efi)\b/i,
  /\b(rmdir|rd|del|erase|remove-item)\b.*([a-z]:[\\/]?\*?["']?\s*$)/i,
  /\b(del|erase|remove-item)\b.*(pagefile\.sys|swapfile\.sys|hiberfil\.sys|bootmgr)\b/i,
  /\bremove-item\s+.*[a-z]:[\\/]?\*?\s+(-recurse|-r)\b/i,
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
  cleaned = cleaned.replace(/^Command failed: powershell\.exe[\s\S]*?[\r\n]+/i, '');

  if (cleaned.includes('<Objs')) {
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
      cleaned = cleaned.replace(/#<\s*CLIXML[\s\S]*?<\/Objs>/gi, '');
      cleaned = cleaned.replace(/<Objs[\s\S]*?<\/Objs>/gi, '');
    }
  }

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

    const result = await execFileAsync(
      'powershell.exe',
      psArgs,
      {
        cwd: effectiveCwd,
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      }
    );
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

// Resuelve rutas absolutas en C:\, carpetas del usuario o relativas al workspace
export async function resolveFile(request: FileRequest | string): Promise<string> {
  const exportsDir = path.join(app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.userData'), 'exports');
  await fs.mkdir(exportsDir, { recursive: true });

  const config = await loadAppConfig();
  const systemFolders = getSystemFoldersPaths();

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

  const roots: Partial<Record<PathScope, string>> = {
    workspaceApproved: effectiveWorkspace,
    exports: exportsDir,
    desktop: systemFolders.desktop,
    downloads: systemFolders.downloads,
    documents: systemFolders.documents,
    pictures: systemFolders.pictures,
    videos: systemFolders.videos,
    music: systemFolders.music,
  };

  const reqObj: FileRequest = typeof request === 'string'
    ? { scope: 'workspaceApproved', path: request }
    : request;
  let reqPath = reqObj.path;
  let targetScope: PathScope = reqObj.scope;

  if (typeof reqPath !== 'string' || !reqPath.trim()) {
    return effectiveWorkspace;
  }
  reqPath = reqPath.trim();

  // Si ya es una ruta absoluta de Windows (C:\ o D:\)
  if (path.isAbsolute(reqPath) || path.win32.isAbsolute(reqPath)) {
    return path.resolve(reqPath);
  }

  // Comprobar prefijos semánticos (ej: "escritorio/archivo.txt")
  for (const mapping of PREFIX_MAPPINGS) {
    const match = reqPath.match(mapping.regex);
    if (match) {
      targetScope = mapping.scope;
      reqPath = match[1] ? match[1].replace(/^[\\/]+/, '') : '';
      break;
    }
  }

  return new PathPolicy(roots).resolveWithin(targetScope, reqPath);
}

// Elimina archivos o carpetas protegiendo las rutas críticas de Windows
export async function deleteFileSafe(filePath: FileRequest | string, recursive = false): Promise<{ success: boolean; error?: string }> {
  const safePath = await resolveFile(filePath);
  if (isPathProtectedFromDeletion(safePath)) {
    throw new Error(`Operación bloqueada por seguridad: La ruta "${safePath}" pertenece a archivos críticos o protegidos del sistema operativo.`);
  }

  try {
    const stat = await fs.stat(safePath);
    if (stat.isDirectory()) {
      await fs.rm(safePath, { recursive, force: true });
    } else {
      await fs.unlink(safePath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// Mueve o renombra archivos y carpetas protegiendo rutas del sistema
export async function moveFileSafe(sourcePath: FileRequest | string, destPath: FileRequest | string): Promise<{ success: boolean; error?: string }> {
  const safeSource = await resolveFile(sourcePath);
  const safeDest = await resolveFile(destPath);

  if (isPathProtectedFromDeletion(safeSource)) {
    throw new Error(`Operación bloqueada por seguridad: La ruta de origen "${safeSource}" está protegida.`);
  }
  if (isPathProtectedFromDeletion(safeDest)) {
    throw new Error(`Operación bloqueada por seguridad: La ruta de destino "${safeDest}" está protegida.`);
  }

  try {
    await fs.mkdir(path.dirname(safeDest), { recursive: true });
    await fs.rename(safeSource, safeDest);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// Búsqueda recursiva de archivos o carpetas por nombre o coincidencia de texto
export async function searchDirectorySafe(
  dirPath: FileRequest | string,
  query?: string,
  maxResults = 100
): Promise<Array<{ path: string; name: string; type: 'FILE' | 'DIRECTORY'; size?: number }>> {
  const safeRoot = await resolveFile(dirPath);
  const results: Array<{ path: string; name: string; type: 'FILE' | 'DIRECTORY'; size?: number }> = [];
  const cleanQuery = query ? query.toLowerCase().trim() : '';

  const IGNORED_DIRS = new Set([
    'node_modules', '.git', '$recycle.bin', 'system volume information',
    '.vscode', 'dist', 'build', '.next', '.nuxt', 'temp', 'tmp'
  ]);

  async function walk(currentDir: string, depth = 0): Promise<void> {
    if (depth > 6 || results.length >= maxResults) return;
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        const entryName = entry.name;
        if (entry.isDirectory() && IGNORED_DIRS.has(entryName.toLowerCase())) {
          continue;
        }

        const fullPath = path.join(currentDir, entryName);
        const matches = !cleanQuery || entryName.toLowerCase().includes(cleanQuery);

        if (matches) {
          results.push({
            path: fullPath,
            name: entryName,
            type: entry.isDirectory() ? 'DIRECTORY' : 'FILE',
          });
        }

        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        }
      }
    } catch {
      // Skip folders without permission
    }
  }

  await walk(safeRoot);
  return results;
}

// Ruta del ejecutable de automatización CristiInput.exe
export function getInputHelperPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'native', 'CristiInput.exe'),
    path.join(__dirname, '../../../native/CristiInput.exe'),
    process.resourcesPath ? path.join(process.resourcesPath, 'native', 'CristiInput.exe') : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'CristiInput.exe') : '',
  ].filter(Boolean);

  for (const c of candidates) {
    if (fsSync.existsSync(c)) {
      return c;
    }
  }
  return null;
}

export interface WindowInfo {
  hwnd: number;
  pid: number;
  title: string;
  process: string;
  isMinimized: boolean;
  isMaximized: boolean;
}

// Lista ventanas visibles de aplicaciones en el escritorio
export async function listOpenWindows(): Promise<WindowInfo[]> {
  const helper = getInputHelperPath();
  if (helper) {
    try {
      const { stdout } = await execFileAsync(helper, ['windows'], { windowsHide: true, timeout: 5000 });
      const parsed = JSON.parse(stdout.trim());
      if (Array.isArray(parsed)) {
        return parsed as WindowInfo[];
      }
    } catch {
      // Intentar fallback si falla el helper
    }
  }

  // Fallback con PowerShell
  try {
    const psScript = `
      Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object @{N='hwnd';E={$_.MainWindowHandle}}, @{N='pid';E={$_.Id}}, @{N='title';E={$_.MainWindowTitle}}, @{N='process';E={$_.ProcessName}}, @{N='isMinimized';E={$false}}, @{N='isMaximized';E={$false}} | ConvertTo-Json -Compress
    `;
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      windowsHide: true,
      timeout: 5000
    });
    if (!stdout || !stdout.trim()) return [];
    const parsed = JSON.parse(stdout.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

// Enfoca y restaura una ventana según su título, proceso o HWND
export async function focusWindow(query: string | number): Promise<{ success: boolean; title?: string; error?: string }> {
  const helper = getInputHelperPath();
  if (helper) {
    try {
      const { stdout } = await execFileAsync(helper, ['focus', String(query)], { windowsHide: true, timeout: 5000 });
      return JSON.parse(stdout.trim());
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  // Fallback con PowerShell y API Win32
  try {
    const queryStr = String(query).replace(/'/g, "''");
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
          [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
          [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        }
"@
      $p = Get-Process | Where-Object { $_.MainWindowTitle -like "*${queryStr}*" -or $_.ProcessName -like "*${queryStr}*" } | Select-Object -First 1
      if ($p -and $p.MainWindowHandle -ne 0) {
        [Win32]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
        $res = [Win32]::SetForegroundWindow($p.MainWindowHandle)
        [PSCustomObject]@{ success = $res; title = $p.MainWindowTitle } | ConvertTo-Json -Compress
      } else {
        [PSCustomObject]@{ success = $false; error = "Window not found" } | ConvertTo-Json -Compress
      }
    `;
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      timeout: 5000
    });
    return JSON.parse(stdout.trim());
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// Cambia el estado de una ventana (minimizar, maximizar, restaurar o cerrar)
export async function manageWindow(
  query: string | number,
  action: 'minimize' | 'maximize' | 'restore' | 'close'
): Promise<{ success: boolean; action: string; error?: string }> {
  const helper = getInputHelperPath();
  if (helper) {
    try {
      const { stdout } = await execFileAsync(helper, ['window', action, String(query)], { windowsHide: true, timeout: 5000 });
      return JSON.parse(stdout.trim());
    } catch (err) {
      return { success: false, action, error: (err as Error).message };
    }
  }

  return { success: false, action, error: 'CristiInput helper no disponible.' };
}

export interface InstalledAppInfo {
  name: string;
  path: string;
  type: 'shortcut' | 'executable';
}

// Lista aplicaciones instaladas en el Menú Inicio y en el Registro
export async function listInstalledApps(filter?: string): Promise<InstalledAppInfo[]> {
  const apps: Map<string, InstalledAppInfo> = new Map();
  const cleanFilter = filter ? filter.toLowerCase().trim() : '';

  // 1. Explorar accesos directos en el Menú Inicio
  const startMenuDirs = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Microsoft\\Windows\\Start Menu\\Programs') : '',
  ].filter(Boolean);

  for (const dir of startMenuDirs) {
    try {
      if (fsSync.existsSync(dir)) {
        const files = await fs.readdir(dir, { recursive: true, withFileTypes: true });
        for (const f of files) {
          if (!f.isDirectory() && f.name.toLowerCase().endsWith('.lnk')) {
            const baseName = path.basename(f.name, '.lnk');
            // Ignorar desinstaladores o archivos de ayuda
            if (/uninstall|desinstalar|help|ayuda|read\s*me/i.test(baseName)) continue;
            if (!cleanFilter || baseName.toLowerCase().includes(cleanFilter)) {
              const fullPath = path.join((f as any).parentPath || dir, f.name);
              if (!apps.has(baseName.toLowerCase())) {
                apps.set(baseName.toLowerCase(), {
                  name: baseName,
                  path: fullPath,
                  type: 'shortcut'
                });
              }
            }
          }
        }
      }
    } catch {
      // Ignorar errores de acceso
    }
  }

  // 2. Explorar rutas registradas en App Paths
  try {
    const ps = `
      Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\*" -ErrorAction SilentlyContinue |
      Select-Object PSChildName, '(default)' |
      ConvertTo-Json -Compress
    `;
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      windowsHide: true,
      timeout: 5000
    });
    if (stdout && stdout.trim()) {
      const parsed = JSON.parse(stdout.trim());
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (item && item.PSChildName) {
          const appExe = String(item.PSChildName);
          const appPath = String(item['(default)'] || appExe);
          const nameWithoutExt = path.basename(appExe, path.extname(appExe));
          if (!cleanFilter || nameWithoutExt.toLowerCase().includes(cleanFilter) || appExe.toLowerCase().includes(cleanFilter)) {
            if (!apps.has(nameWithoutExt.toLowerCase())) {
              apps.set(nameWithoutExt.toLowerCase(), {
                name: nameWithoutExt,
                path: appPath,
                type: 'executable'
              });
            }
          }
        }
      }
    }
  } catch {
    // Ignorar errores del registro
  }

  return Array.from(apps.values()).slice(0, 150);
}

// Inicia una aplicación instalada o ejecutable local sin requerir puertos
export async function launchApp(
  appNameOrPath: string,
  args: string[] = []
): Promise<{ success: boolean; appName: string; path?: string; error?: string }> {
  if (!appNameOrPath || typeof appNameOrPath !== 'string') {
    return { success: false, appName: '', error: 'Nombre de aplicación requerido.' };
  }

  const query = appNameOrPath.trim();

  // If direct absolute path to an executable or shortcut exists
  if ((path.isAbsolute(query) || path.win32.isAbsolute(query)) && fsSync.existsSync(query)) {
    try {
      const child = spawn(query, args, { detached: true, stdio: 'ignore' });
      child.unref();
      return { success: true, appName: path.basename(query), path: query };
    } catch (e) {
      return { success: false, appName: query, error: (e as Error).message };
    }
  }

  // Search installed apps
  const installed = await listInstalledApps(query);
  let bestMatch = installed.find(a => a.name.toLowerCase() === query.toLowerCase());
  if (!bestMatch && installed.length > 0) {
    bestMatch = installed[0];
  }

  if (bestMatch) {
    try {
      const target = bestMatch.path;
      if (bestMatch.type === 'shortcut') {
        // Open shortcut via shell
        const { shell } = electronModule;
        if (shell && typeof shell.openPath === 'function') {
          const err = await shell.openPath(target);
          if (!err) {
            return { success: true, appName: bestMatch.name, path: target };
          }
        }
      }

      const child = spawn(target, args, { detached: true, stdio: 'ignore', shell: true });
      child.unref();
      return { success: true, appName: bestMatch.name, path: target };
    } catch (e) {
      return { success: false, appName: bestMatch.name, error: (e as Error).message };
    }
  }

  // Try direct launch via PowerShell start-process
  try {
    const ps = `Start-Process -FilePath "${query.replace(/"/g, '`"')}" -ErrorAction Stop`;
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      windowsHide: true,
      timeout: 5000
    });
    return { success: true, appName: query };
  } catch (err) {
    return { success: false, appName: query, error: `No se pudo encontrar o iniciar la aplicación "${query}".` };
  }
}

export async function executeSystemCapability(request: { kind: 'system-info' | 'list-processes' }) {
  const executable = request.kind === 'system-info' ? 'systeminfo.exe' : 'tasklist.exe';
  const result = await execFileAsync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', executable), [],
    { windowsHide: true, timeout: 10000, maxBuffer: 1_048_576 });
  return { stdOut: result.stdout, stdErr: result.stderr, exitCode: 0 };
}
