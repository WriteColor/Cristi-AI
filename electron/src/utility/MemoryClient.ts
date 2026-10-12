import { app } from 'electron';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import type { MemoryLoadResult, MemorySaveResult } from '../types/electron.types';

type Result = MemoryLoadResult | MemorySaveResult;
let worker: Worker | null = null;
let sequence = 0;
const requests = new Map<number, { resolve: (result: Result) => void; timer: ReturnType<typeof setTimeout> }>();
function failPending(): void {
  for (const request of requests.values()) {
    clearTimeout(request.timer); request.resolve({ success: false, error: 'Repositorio de memoria interrumpido.' });
  }
  requests.clear();
}
export function memoryRequest(operation: 'load'): Promise<MemoryLoadResult>;
export function memoryRequest(operation: 'save', records?: unknown[]): Promise<MemorySaveResult>;
export function memoryRequest(operation: 'load' | 'save', records?: unknown[]): Promise<Result> {
  if (requests.size >= 8) return Promise.resolve({ success: false, error: 'Repositorio ocupado; vuelve a guardar.' } as Result);
  if (!worker) {
    const current = new Worker(path.join(__dirname, 'memory.worker.cjs'), { workerData: { userData: app.getPath('userData') } });
    worker = current;
    current.on('message', ({ id, result }: { id: number; result: Result }) => {
      const request = requests.get(id); if (!request) return;
      clearTimeout(request.timer); requests.delete(id); request.resolve(result);
    });
    const failed = () => { if (worker === current) { worker = null; failPending(); } };
    current.once('error', failed); current.once('exit', failed);
  }
  const current = worker;
  const id = ++sequence;
  return new Promise(resolve => {
    const timer = setTimeout(() => { if (worker === current) void disposeMemory(); }, 15000);
    requests.set(id, { resolve, timer }); current.postMessage({ id, operation, records });
  });
}
export async function disposeMemory(): Promise<void> {
  const current = worker; worker = null; failPending(); await current?.terminate();
}
