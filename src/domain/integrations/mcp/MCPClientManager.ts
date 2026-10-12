/**
 * Cristi AI - Model Context Protocol (MCP) Client Manager
 * Manages MCP servers (stdio & SSE), discovers tools, and transforms them into Gemini Live function declarations.
 */

import type { GeminiFunctionDeclaration } from '../../../types/gemini.types';
// @ts-ignore
import { modularConfigManager } from '../../../config/ModularConfigManager.ts';

let electronBridge: any = null;
if (typeof window !== 'undefined' && (window as any).electronBridge) {
  electronBridge = (window as any).electronBridge;
}
if (!electronBridge && typeof globalThis !== 'undefined' && (globalThis as any).electronBridge) {
  electronBridge = (globalThis as any).electronBridge;
}
try {
  import('../../../services/desktop/ElectronBridge.js')
    .then(mod => { if (mod?.electronBridge) electronBridge = mod.electronBridge; })
    .catch(() => {});
} catch (_) {}

let logger: any = {
  info: (tag: string, msg: string, ...args: any[]) => {
    if (typeof console !== 'undefined') console.info?.(`[${tag}] ${msg}`, ...args);
  },
  warn: (tag: string, msg: string, ...args: any[]) => {
    if (typeof console !== 'undefined') console.warn?.(`[${tag}] ${msg}`, ...args);
  },
  error: (tag: string, msg: string, ...args: any[]) => {
    if (typeof console !== 'undefined') console.error?.(`[${tag}] ${msg}`, ...args);
  }
};
if (typeof globalThis !== 'undefined' && (globalThis as any).__cristiLogger) {
  logger = (globalThis as any).__cristiLogger;
}
try {
  import('../../../infrastructure/logging/logger.js')
    .then(mod => { if (mod?.logger) logger = mod.logger; })
    .catch(() => {});
} catch (_) {}

const DEFAULT_MCP_EVENTS = {
  CONFIG_CHANGED: 'config_changed'
} as const;
let eventBus: any = {
  emit: () => {},
  on: () => () => {},
  off: () => {}
};
let EVENTS: any = DEFAULT_MCP_EVENTS;
if (typeof globalThis !== 'undefined' && (globalThis as any).__cristiEventBus) {
  eventBus = (globalThis as any).__cristiEventBus;
}
try {
  import('../../../infrastructure/events/eventBus.js')
    .then(mod => {
      if (mod?.eventBus) eventBus = mod.eventBus;
      if (mod?.EVENTS) EVENTS = mod.EVENTS;
    })
    .catch(() => {});
} catch (_) {}

let integrationHealthRegistry: any = {
  update: () => {}
};
try {
  import('../IntegrationHealth.js')
    .then(mod => { if (mod?.integrationHealthRegistry) integrationHealthRegistry = mod.integrationHealthRegistry; })
    .catch(() => {});
} catch (_) {}

let spotifyMcpServer: any = null;
try {
  import('../../../mcp/servers/spotify/SpotifyMcpServer.js')
    .then(mod => { if (mod?.spotifyMcpServer) spotifyMcpServer = mod.spotifyMcpServer; })
    .catch(() => {});
} catch (_) {}

let playwrightMcpServer: any = null;
try {
  import('../../../mcp/servers/playwright/PlaywrightMcpServer.js')
    .then(mod => { if (mod?.playwrightMcpServer) playwrightMcpServer = mod.playwrightMcpServer; })
    .catch(() => {});
} catch (_) {}

export function sanitizeMcpToolParameters(schema?: any): {
  type: 'OBJECT';
  properties: Record<string, any>;
  required: string[];
} {
  if (!schema || typeof schema !== 'object') {
    return { type: 'OBJECT', properties: {}, required: [] };
  }

  const mapType = (rawType: unknown): string => {
    if (typeof rawType !== 'string') return 'STRING';
    const lower = rawType.toLowerCase();
    switch (lower) {
      case 'object': return 'OBJECT';
      case 'string': return 'STRING';
      case 'number':
      case 'integer': return 'NUMBER';
      case 'boolean': return 'BOOLEAN';
      case 'array': return 'ARRAY';
      default: return rawType.toUpperCase();
    }
  };

  const properties: Record<string, any> = {};

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [propName, propDef] of Object.entries(schema.properties as Record<string, any>)) {
      if (propDef && typeof propDef === 'object') {
        const propType = mapType(propDef.type);
        const propEntry: Record<string, any> = {
          type: propType,
          description: typeof propDef.description === 'string' ? propDef.description : '',
        };

        if (Array.isArray(propDef.enum)) {
          propEntry.enum = propDef.enum.map(String);
        }

        if (propType === 'ARRAY' && propDef.items && typeof propDef.items === 'object') {
          propEntry.items = {
            type: mapType(propDef.items.type),
            ...(propDef.items.description ? { description: String(propDef.items.description) } : {}),
          };
        }

        if (propType === 'OBJECT' && propDef.properties && typeof propDef.properties === 'object') {
          propEntry.properties = sanitizeMcpToolParameters(propDef).properties;
        }

        properties[propName] = propEntry;
      } else {
        properties[propName] = { type: 'STRING', description: '' };
      }
    }
  }

  const required = Array.isArray(schema.required)
    ? schema.required.filter((item: unknown): item is string => typeof item === 'string')
    : [];

  return {
    type: 'OBJECT',
    properties,
    required,
  };
}

export interface McpToolDeclaration {
  name: string;
  originalName?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
}

export interface McpServerConfig {
  id: string;
  name: string;
  type: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled: boolean;
  status: string;
  tools?: McpToolDeclaration[];
  lastError?: string;
  description?: string;
}

export interface DiscoveredToolInfo {
  serverId: string;
  tool?: McpToolDeclaration;
  originalTool?: McpToolDeclaration;
}

export class MCPClientManager {
  private storageKey = 'cristi_ai_mcp_servers';
  public servers: McpServerConfig[] = [];
  public discoveredTools = new Map<string, DiscoveredToolInfo>();
  public isInitialized = false;
  private initialization: Promise<void> | null = null;

  private isRemovedServer(_server: McpServerConfig): boolean {
    return false;
  }

  private normalizeServers(value: unknown): McpServerConfig[] {
    if (!Array.isArray(value)) return [];
    return value.filter((server): server is McpServerConfig => Boolean(server && typeof server === 'object' &&
      typeof (server as McpServerConfig).id === 'string' && typeof (server as McpServerConfig).name === 'string'))
      .map(server => ({ ...server, tools: [], status: 'disconnected', lastError: undefined }))
      .filter(server => !this.isRemovedServer(server));
  }

  /** Public config must never serialize token-like MCP environment values. */
  private serializableServers(): McpServerConfig[] {
    return this.servers.map(server => {
      const env = Object.fromEntries(Object.entries(server.env || {}).filter(([key]) => !/(token|secret|password|api[_-]?key)/i.test(key)));
      // IPC validates actual JSON.  Do not send optional properties with an
      // `undefined` value: unlike JSON.stringify, Zod sees and rejects them.
      const serializable: McpServerConfig = {
        id: server.id,
        name: server.name,
        type: server.type,
        env,
        enabled: server.enabled,
        status: 'disconnected',
        tools: [],
      };
      if (server.command !== undefined) serializable.command = server.command;
      if (server.args !== undefined) serializable.args = [...server.args];
      if (server.url !== undefined) serializable.url = server.url;
      if (server.description !== undefined) serializable.description = server.description;
      return serializable;
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initialization) return this.initialization;
    this.initialization = (async () => {
      await this.loadServers();
      this.isInitialized = true;
      await this.connectEnabledServers();
    })().finally(() => { this.initialization = null; });
    return this.initialization;
  }

  async loadServers(): Promise<void> {
    try {
      const modularConfig = await modularConfigManager.loadAll();
      const modularServers = this.normalizeServers(modularConfig?.mcp?.servers);
      if (modularServers.length > 0) {
        this.servers = modularServers;
        this.saveServers();
        return;
      }

      if (electronBridge?.isElectron && typeof electronBridge.getAppConfig === 'function') {
        const config = await electronBridge.getAppConfig() as { mcpServers?: unknown } | null;
        const centralized = this.normalizeServers(config?.mcpServers);
        if (centralized.length) {
          this.servers = centralized;
          this.saveServers();
          return;
        }
      }
      this.servers = [
        {
          id: 'mcp_filesystem',
          name: 'Filesystem MCP',
          type: 'stdio',
          command: 'pnpm',
          args: ['dlx', '@modelcontextprotocol/server-filesystem', 'C:\\React-Nextjs-Projects'],
          env: {},
          enabled: false,
          status: 'disconnected',
          tools: []
        },
        {
          id: 'mcp_sqlite',
          name: 'SQLite Memory MCP',
          type: 'stdio',
          command: 'pnpm',
          args: ['dlx', '@modelcontextprotocol/server-sqlite', '--db-path', 'cristi-memory.db'],
          env: {},
          enabled: false,
          status: 'disconnected',
          tools: []
        }
      ];
      this.saveServers();
    } catch (err) {
      logger.error('MCP', 'Error cargando servidores MCP:', err);
      this.servers = [];
    }
  }

  saveServers(): void {
    try {
      if (electronBridge?.isElectron && typeof electronBridge.saveAppConfig === 'function') {
        void electronBridge.saveAppConfig({ mcpServers: this.serializableServers() }).catch((error: any) =>
          logger.warn('MCP', 'No se pudo persistir la configuración MCP central:', error));
      } else if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.servers, null, 2));
      }
      modularConfigManager.updateSection('mcp', { servers: this.serializableServers() });
      eventBus.emit(EVENTS.CONFIG_CHANGED, { type: 'mcp_servers_updated', count: this.servers.length });
    } catch (err) {
      logger.error('MCP', 'Error guardando servidores MCP:', err);
    }
  }

  async addServer(serverConfig: Partial<McpServerConfig>): Promise<McpServerConfig | null> {
    if (!serverConfig || !serverConfig.name) return null;
    if (!this.isInitialized && this.servers.length === 0) {
      try {
        await this.loadServers();
      } catch (_) {}
    }
    const newServer: McpServerConfig = {
      id: `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: serverConfig.name,
      type: serverConfig.type || 'stdio',
      command: serverConfig.command || '',
      args: Array.isArray(serverConfig.args) ? serverConfig.args : (serverConfig.args ? String(serverConfig.args).split(' ') : []),
      env: serverConfig.env || {},
      url: serverConfig.url || '',
      enabled: serverConfig.enabled !== false,
      status: 'disconnected',
      tools: []
    };

    if (this.isRemovedServer(newServer)) {
      throw new Error('Este servidor MCP está bloqueado por la política de integraciones de Cristi AI. Registra uno diferente.');
    }

    this.servers.push(newServer);
    this.saveServers();
    await (modularConfigManager as any)?.flush?.();

    if (newServer.enabled) {
      await this.connectServer(newServer.id);
    }

    return newServer;
  }

  async updateServer(id: string, updates: Partial<McpServerConfig>): Promise<boolean> {
    const sIdx = this.servers.findIndex((s) => s.id === id);
    if (sIdx === -1) return false;

    const candidate = { ...this.servers[sIdx], ...updates };
    if (this.isRemovedServer(candidate)) return false;
    this.servers[sIdx] = candidate;
    this.saveServers();
    await (modularConfigManager as any)?.flush?.();
    return true;
  }

  getServers(): McpServerConfig[] {
    return [...this.servers];
  }

  async removeServer(id: string): Promise<boolean> {
    await this.disconnectServer(id);
    this.servers = this.servers.filter((s) => s.id !== id);
    this.saveServers();
    await (modularConfigManager as any)?.flush?.();
    return true;
  }

  async deleteServer(id: string): Promise<boolean> {
    return this.removeServer(id);
  }

  async toggleServer(id: string, enabled: boolean): Promise<boolean> {
    const server = this.servers.find((s) => s.id === id);
    if (!server) return false;

    server.enabled = enabled;
    this.saveServers();

    if (enabled) {
      await this.connectServer(id);
    } else {
      await this.disconnectServer(id);
    }
    return true;
  }

  async setServerEnabled(id: string, enabled: boolean): Promise<boolean> {
    return this.toggleServer(id, enabled);
  }

  async connectEnabledServers(): Promise<void> {
    for (const s of this.servers) {
      if (s.enabled) {
        this.connectServer(s.id).catch((e) => logger.warn('MCP', `Error conectando servidor ${s.name}:`, e));
      }
    }
  }

  async connectServer(id: string): Promise<boolean> {
    const server = this.servers.find((s) => s.id === id);
    if (!server) return false;

    if (server.type === 'internal' || server.id === 'cristi_spotify') {
      server.status = 'connected';
      server.lastError = undefined;

      let declarations: any[] = [];
      const prefix = server.id === 'cristi_spotify'
        ? 'mcp_cristi_spotify_'
        : server.id === 'cristi_playwright'
          ? 'mcp_cristi_playwright_'
          : `mcp_${server.id}_`;

      if (server.id === 'cristi_spotify') {
        declarations = spotifyMcpServer ? spotifyMcpServer.getToolsDeclarations() : [];
      } else if (server.id === 'cristi_playwright') {
        declarations = playwrightMcpServer ? playwrightMcpServer.getToolsDeclarations() : [];
      }

      const mappedTools = declarations.map((tool: any) => {
        const originalName = tool.name;
        const federatedName = `${prefix}${originalName}`;
        return {
          ...tool,
          originalName,
          name: federatedName,
          parameters: sanitizeMcpToolParameters(tool.parameters)
        };
      });
      server.tools = mappedTools;

      mappedTools.forEach((t: any) => {
        this.discoveredTools.set(t.name, { serverId: server.id, tool: t });
      });

      this.saveServers();
      integrationHealthRegistry.update(`mcp:${id}`, {
        state: 'ready',
        configured: true,
        authenticated: true,
        connected: true,
        operation: undefined,
        lastSuccessAt: Date.now()
      });
      eventBus.emit(EVENTS.CONFIG_CHANGED, {
        type: 'mcp_server_connected',
        serverId: id,
        toolsCount: mappedTools.length
      });
      logger.info('MCP', `✓ Servidor MCP interno "${server.name}" conectado con ${mappedTools.length} herramienta(s).`);
      return true;
    }

    if (server.status === 'connected') return true;
    if (server.status === 'connecting') return false;

    server.status = 'connecting';
    integrationHealthRegistry.update(`mcp:${id}`, { state: 'connecting', configured: true, authenticated: true, connected: false, operation: 'connect' });
    this.saveServers();

    try {
      logger.info('MCP', `Conectando con servidor MCP "${server.name}" (${server.type})...`);

      if (electronBridge?.isElectron && typeof electronBridge.mcpConnect === 'function') {
        const res = await electronBridge.mcpConnect({
          id: server.id,
          name: server.name,
          type: server.type,
          command: server.command,
          args: server.args,
          env: server.env,
          url: server.url
        });
        if (!res?.success) throw new Error(res?.error || `No se pudo conectar MCP ${server.name}.`);
        server.status = 'connected';
        server.tools = (Array.isArray(res.tools) ? (res.tools as McpToolDeclaration[]) : []).map((tool) => {
          const originalName = String(tool?.name || 'tool');
          return {
            ...tool,
            originalName,
            name: namespaceMcpToolName(server.id, originalName)
          };
        });

        server.tools.forEach((t) => {
          this.discoveredTools.set(t.name, { serverId: server.id, tool: t });
        });

        this.saveServers();
        logger.info('MCP', `✓ Servidor MCP "${server.name}" conectado con ${server.tools.length} herramienta(s) reales.`);
        return true;
      }

      throw new Error('MCP requiere Electron para iniciar y verificar la conexión del servidor.');
    } catch (err) {
      const error = err as Error;
      server.status = 'error';
      server.lastError = error.message;
      this.saveServers();
      integrationHealthRegistry.update(`mcp:${id}`, { state: 'error', configured: true, authenticated: true, connected: false, lastError: error.message });
      logger.error('MCP', `Error al conectar servidor MCP ${server.name}:`, err);
      return false;
    }
  }

  async disconnectServer(id: string): Promise<boolean> {
    const server = this.servers.find((s) => s.id === id);
    if (!server) return false;

    if (server.tools) {
      server.tools.forEach((t) => this.discoveredTools.delete(t.name));
    }
    if (server.type !== 'internal' && server.id !== 'cristi_spotify') {
      if (electronBridge?.isElectron && typeof electronBridge.mcpDisconnect === 'function') {
        await electronBridge.mcpDisconnect(server.id).catch(() => {});
      }
    }

    server.status = 'disconnected';
    server.tools = [];
    this.saveServers();
    integrationHealthRegistry.update(`mcp:${id}`, { state: 'degraded', configured: server.enabled, authenticated: true, connected: false, lastError: undefined });
    logger.info('MCP', `Servidor MCP "${server.name}" desconectado.`);
    return true;
  }

  hasTool(toolName: string): boolean {
    return this.discoveredTools.has(toolName);
  }

  getGeminiFunctionDeclarations(): GeminiFunctionDeclaration[] {
    const declarations: GeminiFunctionDeclaration[] = [];
    const seenNames = new Set<string>();

    for (const server of this.servers) {
      if (server.enabled === false) continue;
      if (server.status !== 'connected' && (!server.tools || server.tools.length === 0)) continue;

      const tools = server.tools || [];
      for (const tool of tools) {
        const rawName = tool.originalName || tool.name;
        const prefix = server.id === 'cristi_spotify'
          ? 'mcp_cristi_spotify_'
          : `mcp_${server.id}_`;
        const pureName = rawName.startsWith(prefix) ? rawName.slice(prefix.length) : rawName;
        const federatedName = server.type === 'internal' || server.id === 'cristi_spotify'
          ? `${prefix}${pureName}`
          : namespaceMcpToolName(server.id, pureName);

        if (seenNames.has(federatedName)) continue;
        seenNames.add(federatedName);

        const rawParams = tool.parameters || tool.inputSchema || {};
        const sanitizedParams = sanitizeMcpToolParameters(rawParams);

        const baseDesc = tool.description ? tool.description.trim() : `Herramienta MCP: ${pureName}`;
        const description = baseDesc.startsWith(`[${server.name}]`) ? baseDesc : `[${server.name}] ${baseDesc}`;

        this.discoveredTools.set(federatedName, {
          serverId: server.id,
          tool: {
            ...tool,
            originalName: pureName,
            name: federatedName,
            description,
            parameters: sanitizedParams
          }
        });

        declarations.push({
          name: federatedName,
          description,
          parameters: sanitizedParams
        });
      }
    }

    for (const [name, info] of this.discoveredTools.entries()) {
      if (seenNames.has(name)) continue;
      seenNames.add(name);
      const toolObj = info.tool || info.originalTool || { name };
      const rawParams = toolObj.parameters || toolObj.inputSchema || {};
      const server = this.servers.find(s => s.id === info.serverId);
      const serverName = server?.name || 'MCP';
      const baseDesc = toolObj.description ? toolObj.description.trim() : `Herramienta MCP delegada: ${name}`;
      const description = baseDesc.startsWith(`[${serverName}]`) ? baseDesc : `[${serverName}] ${baseDesc}`;

      declarations.push({
        name,
        description,
        parameters: sanitizeMcpToolParameters(rawParams)
      });
    }

    return declarations;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    signalOrContext?: AbortSignal | { signal?: AbortSignal }
  ): Promise<unknown> {
    return this.executeMCPTool(toolName, args, signalOrContext);
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown> = {},
    signalOrContext?: AbortSignal | { signal?: AbortSignal }
  ): Promise<unknown> {
    return this.executeMCPTool(toolName, args, signalOrContext);
  }

  async callServerTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown> = {},
    signalOrContext?: AbortSignal | { signal?: AbortSignal }
  ): Promise<unknown> {
    const signal = signalOrContext instanceof AbortSignal ? signalOrContext : (signalOrContext as any)?.signal;
    if (signal?.aborted) {
      return { status: 'cancelled', message: 'Invocación de herramienta MCP cancelada.', cancelled: true };
    }

    const server = this.servers.find((item) => item.id === serverId || item.name === serverId || item.name.toLowerCase() === serverId.toLowerCase());
    if (!server && serverId !== 'cristi_spotify' && serverId !== 'cristi_playwright') return { status: 'error', error: 'mcp_server_not_found', serverId };
    const originalName = String(toolName || '').trim();
    if (!originalName) return { status: 'error', error: 'mcp_tool_name_required' };

    if (serverId === 'cristi_spotify' || serverId === 'cristi_playwright' || server?.type === 'internal') {
      const known = (server?.tools || []).find((tool) => tool.originalName === originalName || tool.name === originalName);
      let resolvedName = known?.originalName || originalName;
      if (resolvedName.startsWith('mcp_cristi_spotify_')) {
        resolvedName = resolvedName.slice('mcp_cristi_spotify_'.length);
      } else if (resolvedName.startsWith('mcp_cristi_playwright_')) {
        resolvedName = resolvedName.slice('mcp_cristi_playwright_'.length);
      } else if (server && resolvedName.startsWith(`mcp_${server.id}_`)) {
        resolvedName = resolvedName.slice(`mcp_${server.id}_`.length);
      }

      if (serverId === 'cristi_spotify' || (!serverId && server?.id === 'cristi_spotify')) {
        if (spotifyMcpServer) return spotifyMcpServer.executeTool(resolvedName, args, signal);
        return { status: 'error', error: 'spotify_not_ready', message: 'Spotify MCP Server no está inicializado.' };
      } else if (serverId === 'cristi_playwright' || (!serverId && server?.id === 'cristi_playwright')) {
        if (playwrightMcpServer) return playwrightMcpServer.executeTool(resolvedName, args, signal);
        return { status: 'error', error: 'playwright_not_ready', message: 'Playwright MCP Server no está inicializado.' };
      }
    }

    if (!server) return { status: 'error', error: 'mcp_server_not_found', serverId };

    const known = (server.tools || []).find((tool) => tool.originalName === originalName || tool.name === originalName);
    const resolvedName = known?.originalName || originalName;

    if (electronBridge?.isElectron && typeof electronBridge.mcpCallTool === 'function') {
      const result = await electronBridge.mcpCallTool({ serverId: server.id, name: resolvedName, arguments: args || {} });
      if (signal?.aborted) {
        return { status: 'cancelled', message: 'Invocación de herramienta MCP cancelada tras recepción.', cancelled: true };
      }
      return result;
    }
    return { status: 'error', error: 'mcp_requires_electron', message: 'MCP requiere Electron para ejecutar herramientas reales.' };
  }

  async executeMCPTool(
    toolName: string,
    args: Record<string, unknown> = {},
    signalOrContext?: AbortSignal | { signal?: AbortSignal }
  ): Promise<unknown> {
    const signal = signalOrContext instanceof AbortSignal ? signalOrContext : (signalOrContext as any)?.signal;
    if (signal?.aborted) {
      return { status: 'cancelled', message: 'Ejecución de herramienta MCP cancelada.', cancelled: true };
    }

    let info = this.discoveredTools.get(toolName);
    if (!info) {
      for (const server of this.servers) {
        const found = (server.tools || []).find(
          (t) =>
            t.name === toolName ||
            t.originalName === toolName ||
            `mcp_${server.id}_${t.originalName || t.name}` === toolName ||
            namespaceMcpToolName(server.id, t.originalName || t.name) === toolName
        );
        if (found) {
          info = { serverId: server.id, tool: found };
          this.discoveredTools.set(toolName, info);
          break;
        }
      }
    }

    // Dynamic resolution fallback for cristi_spotify / internal tools
    if (!info) {
      const isSpotifyPrefix = toolName.startsWith('mcp_cristi_spotify_') || toolName.startsWith('spotify_');
      if (isSpotifyPrefix) {
        const pure = toolName.startsWith('mcp_cristi_spotify_') ? toolName.slice('mcp_cristi_spotify_'.length) : toolName;
        const spotifyDeclarations = spotifyMcpServer ? spotifyMcpServer.getToolsDeclarations() : [];
        const found = spotifyDeclarations.find((d: any) => d.name === pure);
        if (found) {
          info = {
            serverId: 'cristi_spotify',
            tool: {
              ...found,
              originalName: found.name,
              name: `mcp_cristi_spotify_${found.name}`,
              parameters: sanitizeMcpToolParameters(found.parameters)
            }
          };
          this.discoveredTools.set(toolName, info);
        }
      } else {
        const isPlaywrightPrefix = toolName.startsWith('mcp_cristi_playwright_') || toolName.startsWith('browser_');
        if (isPlaywrightPrefix) {
          const pure = toolName.startsWith('mcp_cristi_playwright_') ? toolName.slice('mcp_cristi_playwright_'.length) : toolName;
          const playwrightDeclarations = playwrightMcpServer ? playwrightMcpServer.getToolsDeclarations() : [];
          const found = playwrightDeclarations.find((d: any) => d.name === pure);
          if (found) {
            info = {
              serverId: 'cristi_playwright',
              tool: {
                ...found,
                originalName: found.name,
                name: `mcp_cristi_playwright_${found.name}`,
                parameters: sanitizeMcpToolParameters(found.parameters)
              }
            };
            this.discoveredTools.set(toolName, info);
          }
        }
      }
    }

    if (!info) {
      throw new Error(`Herramienta MCP "${toolName}" no encontrada.`);
    }

    const server = this.servers.find((s) => s.id === info.serverId);
    logger.info('MCP', `Ejecutando herramienta MCP "${toolName}" en servidor "${server?.name || info.serverId}"...`, args);

    if (info.serverId === 'cristi_spotify' || (server?.type === 'internal' && server?.id === 'cristi_spotify')) {
      const rawName = info.tool?.originalName || info.tool?.name || toolName;
      let targetName = rawName;
      if (targetName.startsWith('mcp_cristi_spotify_')) {
        targetName = targetName.slice('mcp_cristi_spotify_'.length);
      } else if (server && targetName.startsWith(`mcp_${server.id}_`)) {
        targetName = targetName.slice(`mcp_${server.id}_`.length);
      }
      if (spotifyMcpServer) return spotifyMcpServer.executeTool(targetName, args, signal);
      return { status: 'error', error: 'spotify_not_ready', message: 'Spotify MCP Server no está inicializado.' };
    }

    if (info.serverId === 'cristi_playwright' || (server?.type === 'internal' && server?.id === 'cristi_playwright')) {
      const rawName = info.tool?.originalName || info.tool?.name || toolName;
      let targetName = rawName;
      if (targetName.startsWith('mcp_cristi_playwright_')) {
        targetName = targetName.slice('mcp_cristi_playwright_'.length);
      } else if (server && targetName.startsWith(`mcp_${server.id}_`)) {
        targetName = targetName.slice(`mcp_${server.id}_`.length);
      }
      if (playwrightMcpServer) return playwrightMcpServer.executeTool(targetName, args, signal);
      return { status: 'error', error: 'playwright_not_ready', message: 'Playwright MCP Server no está inicializado.' };
    }

    if (electronBridge?.isElectron && typeof electronBridge.mcpCallTool === 'function') {
      const result = await electronBridge.mcpCallTool({
        serverId: info.serverId,
        name: info.tool?.originalName || info.tool?.name || toolName,
        arguments: args
      });
      if (signal?.aborted) {
        return { status: 'cancelled', message: 'Ejecución de herramienta MCP cancelada tras llamada.', cancelled: true };
      }
      return result;
    }

    throw new Error('MCP requiere Electron para ejecutar herramientas reales.');
  }

  getAllServers(): McpServerConfig[] {
    return [...this.servers];
  }

  getAllTools(): McpToolDeclaration[] {
    return Array.from(this.discoveredTools.values()).map((v) => v.tool || { name: 'unknown' });
  }
}

export const mcpClientManager = new MCPClientManager();

function namespaceMcpToolName(serverId: string, toolName: string): string {
  const safeServer = String(serverId || 'server').replace(/[^a-zA-Z0-9_]/g, '_');
  const safeTool = String(toolName || 'tool').replace(/[^a-zA-Z0-9_]/g, '_');
  return `mcp_${safeServer}_${safeTool}`;
}

export default mcpClientManager;
