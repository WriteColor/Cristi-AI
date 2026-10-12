import { Worker } from 'node:worker_threads';
import path from 'node:path';

type Region = { x_pct?: number; y_pct?: number; w_pct?: number; h_pct?: number } | null;

/** Resultado que devuelve el worker o el fallback en main. */
export type ScreenWorkerReply = {
  base64: string | null;
  error?: string;
};

type WorkerReply = { id: number; base64: string | null; error?: string };

let worker: Worker | null = null;
let sequence = 0;
const pending = new Map<
  number,
  { resolve: (r: ScreenWorkerReply) => void; timer: ReturnType<typeof setTimeout> }
>();

function ensureWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(path.join(__dirname, 'screen.worker.cjs'));
  worker = w;

  w.on('message', (msg: WorkerReply) => {
    const p = pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(msg.id);
    p.resolve({ base64: msg.base64, error: msg.error });
  });

  w.on('error', (err: Error) => {
    if (worker === w) {
      terminateWorker(w, `Worker de pantalla falló: ${err.message}`);
    }
  });

  w.on('exit', () => {
    if (worker === w) {
      terminateWorker(w, 'Worker de pantalla terminó inesperadamente.');
    }
  });

  return w;
}

function terminateWorker(targetWorker: Worker, reason: string): void {
  if (worker === targetWorker) {
    worker = null;
  }
  failAll(reason);
  targetWorker.terminate().catch(() => {});
}

function failAll(errorMsg = 'Worker de pantalla terminó inesperadamente.'): void {
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.resolve({ base64: null, error: errorMsg });
  }
  pending.clear();
}

/**
 * Envia bytes BGRA al worker para crop + JPEG encode.
 * Siempre copia el buffer a un ArrayBuffer propio para garantizar transferibilidad.
 * Tras postMessage el buffer copiado queda vaciado; el caller debe usar NativeImage
 * original si necesita el fallback.
 * Maneja timeouts de forma segura y recupera el worker sin fugas de memoria.
 */
export function processScreen(
  bgraBuffer: Buffer,
  width: number,
  height: number,
  region: Region,
  jpegQuality = 55
): Promise<ScreenWorkerReply> {
  if (!bgraBuffer || bgraBuffer.byteLength === 0 || width <= 0 || height <= 0) {
    return Promise.resolve({ base64: null, error: 'Buffer o dimensiones de captura inválidos.' });
  }

  const w = ensureWorker();
  const id = ++sequence;

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ base64: null, error: 'Tiempo de espera de screen worker agotado.' });
      if (worker === w) {
        terminateWorker(w, 'Tiempo de espera de screen worker agotado.');
      }
    }, 5000);

    timer.unref?.();
    pending.set(id, { resolve, timer });

    try {
      // Copiar a nuevo Buffer para garantizar ArrayBuffer no compartido y transferible
      const copy = Buffer.allocUnsafe(bgraBuffer.byteLength);
      bgraBuffer.copy(copy);
      // copy.buffer es ArrayBuffer estándar; slice aísla la porción exacta
      const ab = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) as unknown as ArrayBuffer;
      w.postMessage({ id, width, height, buffer: ab, region: region ?? null, jpegQuality }, [ab]);
    } catch (postErr) {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ base64: null, error: `Fallo al transferir buffer al worker: ${(postErr as Error).message}` });
    }
  });
}

export async function disposeScreenWorker(): Promise<void> {
  const w = worker;
  worker = null;
  failAll('Worker de pantalla descartado.');
  if (w) {
    w.removeAllListeners();
    await w.terminate().catch(() => {});
  }
}
