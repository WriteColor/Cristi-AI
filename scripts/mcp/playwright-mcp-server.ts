#!/usr/bin/env node
/**
 * Cristi AI - Standalone Stdio Runner for Playwright Brave MCP Server
 * Conforms to the standard Model Context Protocol (MCP) JSON-RPC specification.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { playwrightMcpServer } from '../../src/mcp/servers/playwright/PlaywrightMcpServer';

const server = new Server(
  {
    name: 'cristi_playwright',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = playwrightMcpServer.getToolsDeclarations().map((d) => ({
    name: d.name,
    description: d.description,
    inputSchema: {
      type: 'object',
      properties: d.parameters.properties,
      required: d.parameters.required || [],
    },
  }));
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await playwrightMcpServer.executeTool(name, (args as Record<string, any>) || {});
  return {
    content: [
      {
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      },
    ],
    isError: result.status === 'error' || result.success === false,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Error fatal iniciando Playwright MCP Stdio Server:', err);
  process.exit(1);
});
