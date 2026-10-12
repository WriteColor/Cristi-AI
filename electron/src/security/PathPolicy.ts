import path from 'node:path';
import fs from 'node:fs/promises';

export type PathScope = 'userData' | 'exports' | 'workspaceApproved' | 'desktop' | 'downloads' | 'documents' | 'pictures' | 'videos' | 'music' | 'custom' | 'systemDrive';

export function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

const PROTECTED_SYSTEM_DIRECTORIES = [
  (process.env.SystemRoot || 'C:\\Windows').toLowerCase(),
  (process.env.windir || 'C:\\Windows').toLowerCase(),
  'c:\\windows',
  'c:\\recovery',
  'c:\\system volume information',
  'c:\\$recycle.bin',
  'c:\\boot',
  'c:\\efi',
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Windows Defender').toLowerCase(),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Defender').toLowerCase(),
  path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows Defender').toLowerCase(),
];

const PROTECTED_SYSTEM_FILES = new Set([
  'pagefile.sys',
  'swapfile.sys',
  'hiberfil.sys',
  'dumpstack.log',
  'bootmgr',
  'bootnxt',
  'ntldr',
]);

// Protege archivos y carpetas esenciales del sistema Windows contra borrado accidental
export function isPathProtectedFromDeletion(candidatePath: string): boolean {
  if (!candidatePath || typeof candidatePath !== 'string') return true;
  const normalized = path.resolve(candidatePath).toLowerCase();

  // No permitir borrar raíces de unidad (C:\, D:\)
  const parsed = path.parse(normalized);
  if (normalized === parsed.root.toLowerCase() || normalized === parsed.root.toLowerCase().replace(/[\\/]+$/, '')) {
    return true;
  }

  // No permitir borrar carpetas críticas del sistema (Windows, System32, etc.)
  for (const sysDir of PROTECTED_SYSTEM_DIRECTORIES) {
    if (normalized === sysDir || normalized.startsWith(sysDir + path.sep)) {
      return true;
    }
  }

  // No permitir borrar archivos de paginación o arranque en la raíz
  const baseName = path.basename(normalized);
  if (PROTECTED_SYSTEM_FILES.has(baseName)) {
    const parentDir = path.dirname(normalized);
    if (parentDir === parsed.root.toLowerCase() || parentDir === parsed.root.toLowerCase().replace(/[\\/]+$/, '')) {
      return true;
    }
  }

  return false;
}

export function validateRelativePath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096 || [...value].some(char => char.charCodeAt(0) < 32) ||
      value.split(/[\\/]/).some(part => part === '..' || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part))) {
    throw new Error('Ruta inválida o contiene caracteres no permitidos.');
  }
  return value;
}

export class PathPolicy {
  private readonly roots: Partial<Record<PathScope, string>>;
  constructor(roots: Partial<Record<PathScope, string>>) {
    this.roots = roots;
  }

  async resolveWithin(scope: PathScope, relativeOrAbsolutePath: unknown): Promise<string> {
    if (typeof relativeOrAbsolutePath !== 'string' || !relativeOrAbsolutePath.trim()) {
      throw new Error('Ruta vacía o inválida.');
    }

    const raw = relativeOrAbsolutePath.trim();
    if (raw.includes('\0')) {
      throw new Error('Inyección de byte nulo detectada en la ruta.');
    }

    // Soporte para rutas absolutas en C:\ o cualquier unidad
    if (path.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
      const candidate = path.resolve(raw);
      return candidate;
    }

    const relative = validateRelativePath(raw);
    const configured = this.roots[scope] || this.roots.workspaceApproved || process.cwd();
    let root: string;
    try {
      root = await fs.realpath(configured);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        root = path.resolve(configured);
      } else {
        throw error;
      }
    }

    const candidate = path.resolve(root, relative);
    return candidate;
  }
}
