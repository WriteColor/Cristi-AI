import path from 'node:path';
import fs from 'node:fs/promises';

export type PathScope = 'userData' | 'exports' | 'workspaceApproved' | 'desktop' | 'downloads' | 'documents' | 'pictures' | 'videos' | 'music' | 'custom';

export function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function validateRelativePath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096 || (value.includes(':') || [...value].some(char => char.charCodeAt(0) < 32)) ||
      path.isAbsolute(value) || path.win32.isAbsolute(value) || value.startsWith('\\') ||
      value.split(/[\\/]/).some(part => part === '..' || (part !== '.' && /[. ]$/.test(part)) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part))) {
    throw new Error('Ruta relativa fuera de la capacidad autorizada.');
  }
  return value;
}

export class PathPolicy {
  private readonly roots: Partial<Record<PathScope, string>>;
  constructor(roots: Partial<Record<PathScope, string>>) {
    this.roots = roots;
  }

  async resolveWithin(scope: PathScope, relativePath: unknown): Promise<string> {
    const relative = validateRelativePath(relativePath);
    const configured = this.roots[scope];
    if (!configured) throw new Error('Scope no autorizado.');
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
    if (!isWithin(root, candidate)) throw new Error('Ruta fuera del scope.');
    // Inspect every existing ancestor, including the target, before reads or writes.
    let ancestor = candidate;
    for (;;) {
      try {
        const resolved = await fs.realpath(ancestor);
        if (!isWithin(root, resolved)) throw new Error('Enlace fuera del scope.');
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const parent = path.dirname(ancestor);
        if (parent === ancestor || parent === root) break;
        ancestor = parent;
      }
    }
    return candidate;
  }
}
