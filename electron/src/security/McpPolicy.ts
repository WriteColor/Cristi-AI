import { app, dialog } from 'electron';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
const approved = new Set<string>();
const pending = new Map<string, Promise<void>>();

let persistedApprovals: Promise<Set<string>> | null = null;

function approvalFile(): string {
  return path.join(app.getPath('userData'), 'mcp-launch-approvals.json');
}

async function readPersistedApprovals(): Promise<Set<string>> {
  if (!persistedApprovals) {
    persistedApprovals = (async () => {
      try {
        const parsed: unknown = JSON.parse(await fs.readFile(approvalFile(), 'utf8'));
        if (Array.isArray(parsed)) return new Set(parsed.filter((value): value is string => typeof value === 'string'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[MCP] No se pudieron leer autorizaciones persistidas.', error);
      }
      return new Set<string>();
    })();
  }
  return persistedApprovals;
}

async function persistApproval(fingerprint: string): Promise<void> {
  const saved = await readPersistedApprovals();
  saved.add(fingerprint);
  const file = approvalFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify([...saved], null, 2), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, file);
}

/** Approval binds the exact launch configuration and survives an application restart. */
export async function approveMcpLaunch(config: object): Promise<void> {
  const encoded = JSON.stringify(config);
  const fingerprint = createHash('sha256').update(encoded).digest('hex');
  if (approved.has(fingerprint) || (await readPersistedApprovals()).has(fingerprint)) {
    approved.add(fingerprint);
    return;
  }
  if (pending.has(fingerprint)) return pending.get(fingerprint)!;
  const value = config as { command?: string; args?: string[]; url?: string };
  const task = dialog.showMessageBox({ type: 'question', buttons: ['Cancelar', 'Autorizar'], defaultId: 0, cancelId: 0,
    title: 'Autorizar servidor MCP', message: 'Este servidor podrá ejecutar herramientas en tu equipo.',
    detail: value.url || [value.command, ...(value.args || [])].join(' ') }).then(async result => {
      if (result.response !== 1) throw new Error('Servidor MCP no autorizado.');
      approved.add(fingerprint);
      await persistApproval(fingerprint);
    }).finally(() => pending.delete(fingerprint));
  pending.set(fingerprint, task);
  return task;
}
