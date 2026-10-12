import { electronBridge, type MemoryRecord } from '../../../services/desktop/ElectronBridge.ts';

export interface MemoryRepositoryOptions {
  storageKey?: string;
  filename?: string;
  bridge?: typeof electronBridge;
}

/**
 * Persistence port for memory records.
 */
export class MemoryRepository {
  private storageKey: string;
  private filename: string;
  private bridge: typeof electronBridge;

  constructor({ storageKey = 'cristi_ai_memories_v2', filename = 'cristi-memories.json', bridge = electronBridge }: MemoryRepositoryOptions = {}) {
    this.storageKey = storageKey;
    this.filename = filename;
    this.bridge = bridge;
  }

  async load(): Promise<MemoryRecord[] | null> {
    if (this.bridge?.isElectron) {
      const native = await this.bridge.memoryLoad?.();
      if (!native?.success) throw new Error(native?.error || 'No se pudo cargar la memoria nativa.');
      if (Array.isArray(native.memories)) return native.memories;
      if (native.memories !== null) throw new Error('Respuesta de memoria inválida.');
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const local = window.localStorage.getItem(this.storageKey);
        const parsed = local ? JSON.parse(local) : null;
        if (Array.isArray(parsed)) return parsed as MemoryRecord[];
      } catch {
        // ignore parse error
      }
    }
    return null;
  }

  async save(memories: MemoryRecord[]): Promise<boolean> {
    if (!Array.isArray(memories)) throw new Error('Registros de memoria inválidos.');
    if (this.bridge?.isElectron) {
      const native = await this.bridge.memorySave?.(memories as Record<string, unknown>[]);
      if (!native?.success) throw new Error(native?.error || 'No se pudo guardar la memoria nativa.');
      return true;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(this.storageKey, JSON.stringify(memories));
    }
    return true;
  }
}

export default MemoryRepository;
