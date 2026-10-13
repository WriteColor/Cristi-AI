import { ToolRegistry } from './ToolRegistry';
import { avatarTools } from './handlers/avatarTools';
import { systemTools } from './handlers/systemTools';
import { computerTools } from './handlers/computerTools';
import { visionTools } from './handlers/visionTools';
import { memoryTools } from './handlers/memoryTools';
import { widgetTools } from './handlers/widgetTools';
import { windowsMediaTools } from './handlers/windowsMediaTools';
import { spotifyMcpTools } from './handlers/spotifyMcpTools';
import { browserMcpTools } from './handlers/browserMcpTools';
import { mcpTools } from './handlers/mcpTools';
import { loggerTools } from './handlers/loggerTools';

export * from './IToolHandler';
export * from './ToolRegistry';
export * from './ToolExecutionLogger';
export * from './ToolExecutor';
export * from './handlers/avatarTools';
export * from './handlers/systemTools';
export * from './handlers/computerTools';
export * from './handlers/visionTools';
export * from './handlers/memoryTools';
export * from './handlers/widgetTools';
export * from './handlers/windowsMediaTools';
export * from './handlers/spotifyMcpTools';
export * from './handlers/browserMcpTools';
export * from './handlers/mcpTools';
export * from './handlers/loggerTools';

/**
 * Registro de herramientas preconfigurado con todas las herramientas agénticas de Cristi AI.
 */
export const toolRegistry = new ToolRegistry();

toolRegistry.registerMany([
  ...avatarTools,
  ...systemTools,
  ...computerTools,
  ...visionTools,
  ...memoryTools,
  ...widgetTools,
  ...spotifyMcpTools,
  ...browserMcpTools,
  ...mcpTools
]);

export default toolRegistry;
