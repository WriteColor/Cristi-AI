import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';

export type WindowKind = 'main' | 'settings' | 'camera' | 'telemetry';
const registered = new Map<number, { kind: WindowKind; url: string }>();
export const senderPolicy = (id: number) => registered.get(id);

export function registerSender(contents: WebContents, kind: WindowKind, url: string): void {
  registered.set(contents.id, { kind, url });
  contents.once('destroyed', () => registered.delete(contents.id));
}

export function samePage(actual: string, expected: string): boolean {
  try {
    const a = new URL(actual); const b = new URL(expected);
    return a.protocol === b.protocol && a.host === b.host &&
      (a.pathname || '/') === (b.pathname || '/') && !a.username && !a.password;
  } catch { return false; }
}

export function trustedKind(event: IpcMainEvent | IpcMainInvokeEvent): WindowKind {
  const policy = registered.get(event.sender.id);
  if (!policy || !event.senderFrame || event.senderFrame !== event.sender.mainFrame ||
      !samePage(event.senderFrame.url, policy.url)) throw new Error('Emisor IPC no autorizado.');
  return policy.kind;
}
