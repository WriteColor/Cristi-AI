import { disposeCapabilities } from '../security/CapabilityRouter';
import { registerWindowIpc } from './windowIpc';
import { registerSystemIpc } from './systemIpc';
import { registerMemoryIpc } from './memoryIpc';
import { registerSecurityIpc } from './securityIpc';
import { registerMcpIpc } from './mcpIpc';
import { registerTelemetryIpc } from './telemetryIpc';
import { registerBrowserIpc } from './browserIpc';

let handlersRegistered = false;

/**
 * Registers all strongly-typed Electron IPC handlers in a modular and centralized architecture.
 */
export function registerAllIpcHandlers(rootDir: string): void {
  if (handlersRegistered) return;

  registerWindowIpc();
  registerSystemIpc(rootDir);
  registerMemoryIpc();
  registerSecurityIpc();
  registerMcpIpc();
  registerTelemetryIpc();
  registerBrowserIpc();

  handlersRegistered = true;
  console.log('[IPCRouter] ✓ All modular IPC domain handlers registered successfully.');
}

/**
 * Teardown helper for hot reloads or test environments.
 */
export function unregisterAllIpcHandlers(): void {
  disposeCapabilities();
  handlersRegistered = false;
}
