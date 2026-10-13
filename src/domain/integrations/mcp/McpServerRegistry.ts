/**
 * Cristi AI - McpServerRegistry
 * Modular registry for Model Context Protocol (MCP) servers.
 * Supports built-in native servers (Spotify, Playwright) and external stdio/SSE servers.
 * Decoupled, typed, and fully validated with Zod.
 */

import { z } from 'zod';
import { logger } from '../../../infrastructure/logging/logger';
import { eventBus, EVENTS } from '../../../infrastructure/events/eventBus';
import { spotifyMcpServer } from '../../../mcp/servers/spotify/SpotifyMcpServer';
import { playwrightMcpServer } from '../../../mcp/servers/playwright/PlaywrightMcpServer';

export const McpTransportTypeSchema = z.enum(['internal', 'stdio', 'sse']);
export type McpTransportType = z.infer<typeof McpTransportTypeSchema>;

export const McpToolSchemaZod = z.object({
  name: z.string().min(1),
  originalName: z.string().optional(),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
});
export type McpToolSchema = z.infer<typeof McpToolSchemaZod>;

export const McpServerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: McpTransportTypeSchema,
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  enabled: z.boolean().default(true),
  status: z.enum(['connected', 'disconnected', 'error', 'connecting']).default('disconnected'),
  tools: z.array(McpToolSchemaZod).optional().default([]),
  lastError: z.string().optional(),
  description: z.string().optional(),
});
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export interface INativeMcpServer {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  getToolsDeclarations: () => Array<{
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
  }>;
  executeTool: (name: string, args?: Record<string, unknown>, signal?: AbortSignal) => Promise<Record<string, unknown>>;
}

export class McpServerRegistry {
  private servers = new Map<string, McpServerConfig>();
  private nativeServers = new Map<string, INativeMcpServer>();
  private isLoaded = false;

  constructor() {
    this.registerNativeServer('cristi_spotify', spotifyMcpServer as unknown as INativeMcpServer);
    this.registerNativeServer('cristi_playwright', playwrightMcpServer as unknown as INativeMcpServer);
  }

  public registerNativeServer(id: string, server: INativeMcpServer): void {
    this.nativeServers.set(id, server);
    const existing = this.servers.get(id);
    if (!existing) {
      this.servers.set(id, {
        id,
        name: server.name,
        type: 'internal',
        enabled: true,
        status: 'disconnected',
        tools: [],
        description: `Servidor nativo interno de Cristi AI (${server.name})`,
      });
    }
  }

  public getNativeServer(id: string): INativeMcpServer | undefined {
    return this.nativeServers.get(id);
  }

  /**
   * Registers or updates a server definition validated with Zod.
   */
  public registerServer(config: unknown): { success: boolean; server?: McpServerConfig; error?: string } {
    const parsed = McpServerConfigSchema.safeParse(config);
    if (!parsed.success) {
      const err = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      logger.warn('MCP_REGISTRY', 'Configuración de servidor MCP inválida:', err);
      return { success: false, error: err };
    }

    const server = parsed.data;
    this.servers.set(server.id, server);
    eventBus.emit(EVENTS.CONFIG_CHANGED, { type: 'mcp_server_registered', serverId: server.id });
    return { success: true, server };
  }

  /**
   * Unregisters a server by ID.
   */
  public unregisterServer(id: string): boolean {
    if (this.nativeServers.has(id)) {
      logger.warn('MCP_REGISTRY', `No se puede desinstalar el servidor nativo interno "${id}".`);
      return false;
    }
    const removed = this.servers.delete(id);
    if (removed) {
      eventBus.emit(EVENTS.CONFIG_CHANGED, { type: 'mcp_server_unregistered', serverId: id });
    }
    return removed;
  }

  public setServerStatus(id: string, status: McpServerConfig['status'], lastError?: string): void {
    const s = this.servers.get(id);
    if (s) {
      s.status = status;
      s.lastError = lastError;
      this.servers.set(id, s);
    }
  }

  public setServerTools(id: string, tools: McpToolSchema[]): void {
    const s = this.servers.get(id);
    if (s) {
      s.tools = tools;
      this.servers.set(id, s);
    }
  }

  public enableServer(id: string): boolean {
    const s = this.servers.get(id);
    if (!s) return false;
    s.enabled = true;
    this.servers.set(id, s);
    eventBus.emit(EVENTS.CONFIG_CHANGED, { type: 'mcp_server_enabled', serverId: id });
    return true;
  }

  public disableServer(id: string): boolean {
    const s = this.servers.get(id);
    if (!s) return false;
    s.enabled = false;
    s.status = 'disconnected';
    this.servers.set(id, s);
    eventBus.emit(EVENTS.CONFIG_CHANGED, { type: 'mcp_server_disabled', serverId: id });
    return true;
  }

  public getServer(id: string): McpServerConfig | undefined {
    return this.servers.get(id);
  }

  public getAllServers(): McpServerConfig[] {
    return Array.from(this.servers.values());
  }

  public getEnabledServers(): McpServerConfig[] {
    return Array.from(this.servers.values()).filter(s => s.enabled);
  }

  /**
   * Loads initial MCP configuration from config/mcp.json or default array.
   */
  public loadInitialConfig(initialServers: unknown[] = []): void {
    if (this.isLoaded && this.servers.size > 0) return;
    for (const raw of initialServers) {
      this.registerServer(raw);
    }
    this.isLoaded = true;
  }
}

export const mcpServerRegistry = new McpServerRegistry();
export default mcpServerRegistry;
