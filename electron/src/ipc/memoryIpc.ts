import { handleTrusted } from '../security/CapabilityRouter';
import { memoryRequest, disposeMemory } from '../utility/MemoryClient';
import { processManager } from '../core/processManager';
export function registerMemoryIpc(): void {
  processManager.registerCleanupHook('memory', disposeMemory);
  handleTrusted('memory-load', () => memoryRequest('load'));
  handleTrusted('memory-save', (_event, records) => memoryRequest('save', records));
}
