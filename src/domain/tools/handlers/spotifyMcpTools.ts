/**
 * Cristi AI - Spotify MCP Tool Handlers for Gemini Live
 * Connects Spotify MCP server commands directly to the active conversational session.
 */

import type { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { spotifyMcpServer } from '../../../mcp/servers/spotify/SpotifyMcpServer';

export const spotifyMcpTools: IToolHandler[] = spotifyMcpServer.getToolsDeclarations().map((declaration) => ({
  name: declaration.name,
  declaration: declaration as any,
  async execute(args: Record<string, any>, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) {
      return { status: 'cancelled', cancelled: true };
    }
    return await spotifyMcpServer.executeTool(declaration.name, args, context?.signal);
  }
}));

export const [
  spotifyPlayHandler,
  spotifyPauseHandler,
  spotifySkipNextHandler,
  spotifySkipPreviousHandler,
  spotifySetVolumeHandler,
  spotifyGetNowPlayingHandler,
  spotifySearchHandler,
  spotifyGetQueueHandler,
  spotifyGetPlaylistsHandler
] = spotifyMcpTools;
