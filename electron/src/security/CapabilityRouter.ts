import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { channelAllowed, validateRequest, type IpcChannel, type IpcRequest, type IpcResponse } from '../../../shared/ipc/contracts';
import { trustedKind } from './SenderPolicy';

const disposers: (() => void)[] = [];

function validate(event: IpcMainEvent | IpcMainInvokeEvent, channel: IpcChannel, args: unknown[]) {
  if (!channelAllowed(channel, trustedKind(event))) throw new Error('Capacidad no disponible para esta ventana.');
  return validateRequest(channel, args);
}

export function handleTrusted<C extends IpcChannel>(
  channel: C,
  handler: (event: IpcMainInvokeEvent, ...args: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>
): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => handler(event, ...validate(event, channel, args) as IpcRequest<C>));
  disposers.push(() => ipcMain.removeHandler(channel));
}

export function onTrusted<C extends IpcChannel>(channel: C,
  handler: (event: IpcMainEvent, ...args: IpcRequest<C>) => unknown): void {
  const listener = (event: IpcMainEvent, ...args: unknown[]) => {
    try { void Promise.resolve(handler(event, ...validate(event, channel, args) as IpcRequest<C>)).catch(() => console.warn(`[IPC] Operación fallida: ${channel}`)); }
    catch { console.warn(`[IPC] Solicitud rechazada: ${channel}`); }
  };
  ipcMain.on(channel, listener);
  disposers.push(() => ipcMain.removeListener(channel, listener));
}

export function disposeCapabilities(): void {
  for (const dispose of disposers.splice(0).reverse()) dispose();
}
