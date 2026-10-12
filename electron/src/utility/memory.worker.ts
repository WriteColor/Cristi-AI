import { parentPort, workerData } from 'node:worker_threads';
import path from 'path';
import fs from 'fs';
import { MemoryRecord, MemoryLoadResult, MemorySaveResult } from '../types/electron.types';

interface SqliteDatabaseSync {
  exec(sql: string): void;
  close(): void;
  prepare(sql: string): {
    all(): Array<{ payload: string }>;
    run(...params: unknown[]): unknown;
  };
}

let memoryDatabase: SqliteDatabaseSync | null = null;
let memoryDatabaseUnavailable = false;
let memoryDatabaseFailure: Error | null = null;

function getMemoryDatabase(): SqliteDatabaseSync | null {
  if (memoryDatabaseFailure) throw memoryDatabaseFailure;
  if (memoryDatabase || memoryDatabaseUnavailable) return memoryDatabase;
  const dbPath = path.join(workerData.userData, 'cristi-memory.sqlite');
  const hadDatabase = fs.existsSync(dbPath);
  let candidate: SqliteDatabaseSync | null = null;
  try {
    // Dynamic require so older node runtimes fail gracefully without crash
     
    const { DatabaseSync } = require('node:sqlite');
    candidate = new DatabaseSync(dbPath) as SqliteDatabaseSync;
    candidate.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS memories_updated_at_idx ON memories(updated_at);
      CREATE TABLE IF NOT EXISTS memory_state (payload TEXT PRIMARY KEY);
    `);
    memoryDatabase = candidate;
    return memoryDatabase;
  } catch (error) {
    try { candidate?.close(); } catch { /* Preserve the original initialization error. */ }
    // A repository that already exists may contain newer data than legacy JSON.
    // Only a runtime without SQLite support and without a database may fall back.
    if (hadDatabase || (error as NodeJS.ErrnoException).code !== 'ERR_UNKNOWN_BUILTIN_MODULE') {
      memoryDatabaseFailure = new Error('No se pudo abrir el repositorio SQLite.');
      throw memoryDatabaseFailure;
    }
    memoryDatabaseUnavailable = true;
    console.warn('[Memory] SQLite no disponible; usando JSON atómico:', (error as Error)?.message || String(error));
    return null;
  }
}

function memoryJsonPath(): string {
  return path.join(workerData.userData, 'cristi-memories.json');
}

function memoryInitializedPath(): string {
  return path.join(workerData.userData, 'cristi-memory.initialized');
}

/**
 * Registers persistent memory IPC handlers with SQLite and atomic JSON fallback.
 */

async function load(): Promise<MemoryLoadResult> {
    const db = getMemoryDatabase();
    if (db) {
      try {
        const rows = db.prepare('SELECT payload FROM memories ORDER BY updated_at DESC').all();
        if (rows.length > 0) {
          return {
            success: true,
            backend: 'sqlite',
            memories: rows.map((row) => JSON.parse(row.payload) as MemoryRecord),
          };
        }
        if (db.prepare('SELECT payload FROM memory_state').all().length) {
          return { success: true, backend: 'sqlite', memories: [] };
        }
        // Import a legacy JSON repository on the next successful save. A new,
        // empty SQLite file must not hide records written by an older runtime.
        try {
          const legacy = JSON.parse(await fs.promises.readFile(memoryJsonPath(), 'utf8'));
          if (!Array.isArray(legacy)) throw new Error('Repositorio JSON inválido.');
          return { success: true, backend: 'json', memories: legacy };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        try {
          await fs.promises.access(memoryInitializedPath());
          return { success: true, backend: 'sqlite', memories: [] };
        } catch (_) {
          return { success: true, backend: 'sqlite', memories: null };
        }
      } catch (error) {
        console.warn('[Memory] Error leyendo SQLite:', (error as Error)?.message || String(error));
        return { success: false, error: 'No se pudo leer el repositorio SQLite.' };
      }
    }

    try {
      const content = await fs.promises.readFile(memoryJsonPath(), 'utf8');
      const memories = JSON.parse(content);
      if (!Array.isArray(memories)) throw new Error('Repositorio JSON inválido.');
      return {
        success: true,
        backend: 'json',
        memories: memories as MemoryRecord[],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { success: true, backend: 'json', memories: null };
      return { success: false, error: 'No se pudo leer el repositorio JSON.' };
    }
  }

async function save(memories: unknown): Promise<MemorySaveResult> {
    if (!Array.isArray(memories) || memories.length > 10000 || memories.some(memory => !memory || typeof memory.id !== 'string' || !memory.id)) {
      return { success: false, error: 'Registros de memoria inválidos.' };
    }
    const records = memories as MemoryRecord[];
    const db = getMemoryDatabase();

    if (db) {
      try {
        db.exec('BEGIN');
        db.exec('DELETE FROM memories');
        const insert = db.prepare('INSERT INTO memories (id, payload, updated_at) VALUES (?, ?, ?)');
        for (const memory of records) {
          if (!memory?.id) continue;
          insert.run(
            String(memory.id),
            JSON.stringify(memory),
            String(memory.updatedAt || new Date().toISOString())
          );
        }
        db.exec("INSERT OR IGNORE INTO memory_state (payload) VALUES ('initialized')");
        db.exec('COMMIT');
        return { success: true, backend: 'sqlite', count: records.length };
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch (_) {}
        // The previous transaction remains authoritative after rollback.
        // Reporting JSON fallback success here would resurrect old SQLite data
        // on the next load and silently lose the new save.
        console.warn('[Memory] Error guardando SQLite:', (error as Error)?.message || String(error));
        return { success: false, error: 'No se pudo guardar la memoria en SQLite.' };
      }
    }

    const target = memoryJsonPath();
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(temp, JSON.stringify(records, null, 2), 'utf8');
      await fs.promises.rename(temp, target);
      await fs.promises.writeFile(memoryInitializedPath(), 'initialized', 'utf8');
      return { success: true, backend: 'json', count: records.length };
    } catch (error) {
      try {
        await fs.promises.unlink(temp);
      } catch (_) {}
      return { success: false, error: (error as Error)?.message || String(error) };
    }
  }
let queue = Promise.resolve();
parentPort?.on('message', (message: { id: number; operation: 'load' | 'save'; records?: unknown[] }) => {
  queue = queue.then(async () => {
    try { parentPort?.postMessage({ id: message.id, result: message.operation === 'load' ? await load() : await save(message.records) }); }
    catch { parentPort?.postMessage({ id: message.id, result: { success: false, error: 'Error en repositorio de memoria.' } }); }
  });
});
