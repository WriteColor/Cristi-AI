/**
 * Cristi AI - Playwright MCP Tool Handlers for Gemini Live
 * Connects Brave Browser automation and YouTube playback tools directly to Cristi's conversational session.
 */

import type { IToolHandler, ToolExecutionContext } from '../IToolHandler.ts';
import { playwrightMcpServer } from '../../../mcp/servers/playwright/PlaywrightMcpServer.ts';

export const browserMcpTools: IToolHandler[] = playwrightMcpServer
  .getToolsDeclarations()
  .map((declaration) => ({
    name: declaration.name,
    declaration: declaration as any,
    async execute(args: Record<string, any>, context?: ToolExecutionContext) {
      if (context?.signal?.aborted) {
        return { status: 'cancelled', cancelled: true };
      }
      return await playwrightMcpServer.executeTool(declaration.name, args, context?.signal);
    },
  }));

export const [
  browserPlayYouTubeVideoHandler,
  browserMediaControlHandler,
  browserSearchHandler,
  browserNavigateHandler,
  browserSnapshotHandler,
  browserClickHandler,
  browserTypeHandler,
  browserTakeScreenshotHandler,
  browserEvaluateHandler,
  browserGetStatusHandler,
  browserCloseHandler,
] = browserMcpTools;
