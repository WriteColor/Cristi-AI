/**
 * ClickThroughService — Compatibility shim (Strict TypeScript)
 *
 * Replaced by Electron's native setIgnoreMouseEvents IPC via useClickThrough hook.
 * Preserved for seamless backward compatibility.
 */

import { electronBridge } from './ElectronBridge';

export class ClickThroughService {
  private _boxes: Map<string, unknown> = new Map();

  public registerHitbox(id: string, box: unknown): void {
    if (!id || !box) return;
    this._boxes.set(id, box);
    this.syncHitboxes();
  }

  public unregisterHitbox(id: string): void {
    if (this._boxes.has(id)) {
      this._boxes.delete(id);
      this.syncHitboxes();
    }
  }

  public syncHitboxes(): void {
    try {
      const hitboxes = Array.from(this._boxes.values());
      electronBridge.syncHitboxes(hitboxes);
    } catch (_) {}
  }

  public async setEnabled(): Promise<void> {}
  public async init(): Promise<boolean> { return true; }

  public destroy(): void {
    this._boxes.clear();
    this.syncHitboxes();
  }
}

export const clickThroughService = new ClickThroughService();
export default clickThroughService;
