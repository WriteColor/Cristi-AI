import * as electron from 'electron';
import { spawn, ChildProcess } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { McpStdioConfig, McpToolCallPayload } from '../types/electron.types';

const app = (electron as any).app ?? {
  getVersion: () => '1.0.0',
  getPath: (_name: string) => process.cwd(),
};

let approveMcpLaunch: (config: object) => Promise<void>;
let handleTrusted: <C extends import('../../../shared/ipc/contracts').IpcChannel>(
  channel: C,
  handler: (...args: any[]) => any
) => void;
let processManager: typeof import('../core/processManager').processManager;

function initRuntimeDependencies(): boolean {
  if (!handleTrusted) {
    try {
      const cr = require('../security/CapabilityRouter');
      handleTrusted = cr.handleTrusted;
      const mp = require('../security/McpPolicy');
      approveMcpLaunch = mp.approveMcpLaunch;
      const pm = require('../core/processManager');
      processManager = pm.processManager;
      return true;
    } catch (_) {
      return false;
    }
  }
  return true;
}

interface McpPendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface McpSseClient {
  connect(transport: unknown): Promise<void>;
  listTools(): Promise<{ tools?: unknown[] }>;
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
  close?(): Promise<void>;
  getServerVersion?(): { version?: string };
}

interface McpStdioState {
  id: string;
  transport: 'stdio';
  process: ChildProcess;
  nextId: number;
  pending: Map<number, McpPendingRequest>;
  buffer: string;
}

interface McpSseState {
  id: string;
  transport: 'sse';
  client: McpSseClient;
  pending: Map<number, McpPendingRequest>;
}

type McpState = McpStdioState | McpSseState;

const mcpProcesses = new Map<string, McpState>();

/**
 * Parses and filters environment variables for MCP servers.
 * Strips undefined/null values and converts numbers/booleans to strings.
 */
export function parseMcpEnvironment(env?: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  if (!env || typeof env !== 'object') return result;
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
}

/**
 * Sanitizes JSON Schema tool input declarations into Gemini-compatible OBJECT format.
 * Maps types to uppercase strings (e.g. 'object' -> 'OBJECT', 'string' -> 'STRING'),
 * preserves descriptions, item types, and the required parameters array.
 */
export function sanitizeMcpToolParameters(schema?: any): Record<string, any> {
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

function resolveMcpCommand(command: string, args: string[]): { command: string; args: string[]; shell: boolean } {
  const requested = command.toLowerCase().trim();
  if (process.platform === 'win32') {
    if (requested === 'npx') {
      return { command: 'pnpm.cmd', args: ['dlx', ...args], shell: true };
    }
    if (requested === 'npm') {
      return { command: 'pnpm.cmd', args, shell: true };
    }
    if (requested === 'pnpm') {
      return { command: 'pnpm.cmd', args, shell: true };
    }
    const packagesRoot = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
    try {
      const packageDir = fs.readdirSync(packagesRoot).find(name => name.toLowerCase().startsWith('astral-sh.uv_'));
      if (packageDir) {
        const candidate = path.join(packagesRoot, packageDir, requested === 'uv' ? 'uv.exe' : 'uvx.exe');
        if (fs.existsSync(candidate)) return { command: candidate, args, shell: false };
      }
    } catch (_) {}
    if (/\.(cmd|bat)$/i.test(command)) {
      return { command, args, shell: true };
    }
  }
  return { command, args, shell: false };
}

function rejectMcpPending(state: McpState, error: Error): void {
  for (const pending of state.pending.values()) {
    pending.reject(error);
  }
  state.pending.clear();
}

function sendMcpRequest(state: McpStdioState, method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<unknown> {
  if (!state.process || state.process.killed) {
    return Promise.reject(new Error('Servidor MCP no está ejecutándose.'));
  }
  const id = state.nextId++;
  const payload = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      sendMcpNotification(state, 'notifications/cancelled', { requestId: id, reason: 'timeout' });
      reject(new Error(`Tiempo de espera agotado para MCP (${method}).`));
    }, Math.max(1000, Math.min(60000, timeoutMs)));

    state.pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });

    try {
      state.process.stdin?.write(payload);
    } catch (error) {
      clearTimeout(timer);
      state.pending.delete(id);
      reject(error as Error);
    }
  });
}

function sendMcpNotification(state: McpStdioState, method: string, params: Record<string, unknown> = {}): boolean {
  if (!state.process || state.process.killed) return false;
  try {
    state.process.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    return true;
  } catch (_) {
    return false;
  }
}

async function connectMcpSse(
  serverId: string,
  config: McpStdioConfig
): Promise<{ success: boolean; serverId?: string; protocolVersion?: string | null; tools?: unknown[]; error?: string }> {
  const urlText = String(config.url || '').trim();
  if (!urlText) return { success: false, error: 'MCP SSE requiere una URL.' };

  let url: URL;
  try {
    url = new URL(urlText);
  } catch (_) {
    return { success: false, error: 'URL SSE inválida.' };
  }

  try {
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');

    const headers = Object.fromEntries(
      Object.entries(config.headers || {})
        .filter(([key, value]) => /^[A-Za-z0-9-]+$/.test(key) && value !== undefined)
        .map(([key, value]) => [key, String(value)])
    );

    const transport = new SSEClientTransport(url, { requestInit: { headers } });
    const client = new Client({ name: 'Cristi AI Companion', version: app.getVersion() });
    await client.connect(transport);
    const listed = await client.listTools();

    const state: McpSseState = { id: serverId, transport: 'sse', client, pending: new Map() };
    mcpProcesses.set(serverId, state);

    transport.onerror = (error: Error) => console.warn(`[MCP:${serverId}] SSE`, error?.message || String(error));
    transport.onclose = () => {
      if (mcpProcesses.get(serverId) === state) mcpProcesses.delete(serverId);
    };

    return {
      success: true,
      serverId,
      protocolVersion: client.getServerVersion?.()?.version || null,
      tools: Array.isArray(listed.tools) ? listed.tools : [],
    };
  } catch (error) {
    return { success: false, error: `No se pudo conectar MCP SSE: ${(error as Error).message}` };
  }
}

async function closeMcpState(state: McpState, reason = 'Servidor MCP desconectado.'): Promise<void> {
  if (!state) return;
  if (state.transport === 'sse') {
    try {
      await state.client?.close?.();
    } catch (_) {}
  } else {
    rejectMcpPending(state, new Error(reason));
    try {
      if (state.process) {
        processManager?.untrack?.(state.process);
        state.process.kill();
      }
    } catch (_) {}
  }
}

/**
 * Registers Model Context Protocol (MCP) IPC handlers.
 */
export function registerMcpIpc(): void {
  if (!initRuntimeDependencies()) return;

  processManager.registerCleanupHook('mcp', async () => {
    for (const state of mcpProcesses.values()) {
      await closeMcpState(state, 'App cerrada.');
    }
    mcpProcesses.clear();
  });

  handleTrusted('mcp-connect', async (_event, config) => {
    const serverId = String(config.id || '').trim();
    const transportType = String(config.type || 'stdio').trim().toLowerCase();

    if (!serverId) return { success: false, error: 'MCP requiere id.' };

    if (transportType === 'sse') {
      await approveMcpLaunch(config);
      const previous = mcpProcesses.get(serverId);
      if (previous) {
        await closeMcpState(previous, 'Conexión MCP reemplazada.');
        mcpProcesses.delete(serverId);
      }
      return connectMcpSse(serverId, config);
    }

    const command = String(config.command || '').trim();
    const childCwd = app?.getPath ? app.getPath('userData') : process.cwd();
    if (!command) return { success: false, error: 'MCP stdio requiere id y command.' };

    const previous = mcpProcesses.get(serverId);
    if (previous) {
      await closeMcpState(previous, 'Conexión MCP reemplazada.');
      mcpProcesses.delete(serverId);
    }

    const args = Array.isArray(config.args) ? config.args.map((value: unknown) => String(value)) : [];
    const env = parseMcpEnvironment(config.env);
    const resolved = resolveMcpCommand(command, args);
    const shellCommand = resolved.command;
    const shellArgs = resolved.args;
    const useShell = resolved.shell;

    // Persist approval for the command that is actually executed.
    await approveMcpLaunch({
      id: serverId,
      type: 'stdio',
      command: shellCommand,
      args: shellArgs,
      env,
    });

    let child: ChildProcess;
    try {
      child = spawn(shellCommand, shellArgs, {
        cwd: childCwd,
        env: { ...process.env, ...env },
        shell: useShell,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      return { success: false, error: `No se pudo iniciar MCP: ${(error as Error).message}` };
    }

    const state: McpStdioState = {
      id: serverId,
      transport: 'stdio',
      process: child,
      nextId: 1,
      pending: new Map(),
      buffer: '',
    };

    mcpProcesses.set(serverId, state);
    processManager?.track?.(child);

    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        state.buffer += chunk;
        let newline: number;
        while ((newline = state.buffer.indexOf('\n')) >= 0) {
          const line = state.buffer.slice(0, newline).trim();
          state.buffer = state.buffer.slice(newline + 1);
          if (!line) continue;
          try {
            const message = JSON.parse(line);
            if (message.id !== undefined && state.pending.has(message.id)) {
              const pending = state.pending.get(message.id);
              state.pending.delete(message.id);
              if (message.error) {
                pending?.reject(new Error(message.error.message || 'Error MCP.'));
              } else {
                pending?.resolve(message.result || {});
              }
            }
          } catch (_) {}
        }
      });
    }

    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => console.warn(`[MCP:${serverId}]`, String(chunk).trim()));
    }

    let launchError = '';
    child.once('error', (error: Error & { code?: string }) => {
      launchError = error.message || (error.code ? `Error ${error.code}` : 'Error desconocido al iniciar el proceso.');
      rejectMcpPending(state, error);
    });
    child.once('exit', (code, signal) => {
      processManager?.untrack?.(child);
      if (mcpProcesses.get(serverId) === state) mcpProcesses.delete(serverId);
      rejectMcpPending(state, new Error(`Servidor MCP terminó (${code ?? signal ?? 'desconocido'}).`));
    });

    try {
      const initialize = (await sendMcpRequest(state, 'initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'Cristi AI Companion', version: app.getVersion() },
      })) as { protocolVersion?: string };

      sendMcpNotification(state, 'notifications/initialized');
      const listed = (await sendMcpRequest(state, 'tools/list', {})) as { tools?: unknown[] };

      return {
        success: true,
        serverId,
        protocolVersion: initialize.protocolVersion || null,
        tools: Array.isArray(listed.tools) ? listed.tools : [],
      };
    } catch (error) {
      try {
        child.kill();
      } catch (_) {}
      if (mcpProcesses.get(serverId) === state) mcpProcesses.delete(serverId);
      const failure = error as Error & { code?: string };
      const detail = failure.message || launchError;
      const executableMissing = failure.code === 'ENOENT' || /ENOENT|not recognized|no se reconoce/i.test(detail);
      return {
        success: false,
        error: executableMissing
          ? `No se encontró el ejecutable "${command}". Verifique que esté instalado y disponible en PATH.`
          : (detail || `El servidor MCP "${serverId}" no respondió durante su inicialización.`),
      };
    }
  });

  handleTrusted('mcp-call-tool', async (_event, payload: McpToolCallPayload = { serverId: '', name: '' }) => {
    const serverId = String(payload.serverId || '');
    const state = mcpProcesses.get(serverId);
    if (!state) return { success: false, error: 'Servidor MCP no conectado.' };

    const timeoutMs = typeof payload.timeoutMs === 'number' && payload.timeoutMs > 0 ? payload.timeoutMs : 30000;

    try {
      if (state.transport === 'sse') {
        const callPromise = state.client.callTool({
          name: String(payload.name || ''),
          arguments: payload.arguments || {},
        });
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Tiempo de espera agotado (${timeoutMs}ms) para herramienta MCP: ${payload.name}`)), timeoutMs);
        });
        const result = await Promise.race([callPromise, timeoutPromise]);
        return { success: true, ...(result as Record<string, unknown>) };
      }

      const result = await sendMcpRequest(state, 'tools/call', {
        name: String(payload.name || ''),
        arguments: payload.arguments || {},
      }, timeoutMs);
      return { success: true, ...(result as Record<string, unknown>) };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  handleTrusted('mcp-disconnect', async (_event, serverId: unknown) => {
    const id = String(serverId || '');
    const state = mcpProcesses.get(id);
    if (!state) return { success: true, alreadyDisconnected: true };

    if (state.transport !== 'sse') {
      try {
        sendMcpNotification(state, 'notifications/cancelled', { reason: 'client_disconnect' });
      } catch (_) {}
    }

    await closeMcpState(state);
    mcpProcesses.delete(id);
    return { success: true };
  });
}
