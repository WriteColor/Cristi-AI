import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  Terminal,
  Server,
  Wrench,
  ChevronDown,
  ChevronRight,
  Play,
  Check,
  Copy,
  X,
  RefreshCw,
  FileCode,
  Power,
  AlertTriangle,
  Globe,
  Loader2,
  ExternalLink,
  Shield,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { mcpClientManager, type McpServerConfig, type McpToolDeclaration } from '../../domain/integrations/mcp/MCPClientManager.js';
import { soundFxService } from '../../domain/audio/SoundFxService.js';
import { toastService } from '../../infrastructure/notifications/toastService.js';
import { spotifyMcpServer } from '../../mcp/servers/spotify/SpotifyMcpServer.js';
import { playwrightMcpServer } from '../../mcp/servers/playwright/PlaywrightMcpServer.js';
import { getLiveToolsConfig } from '../../config/tools.js';

interface ToolTestState {
  serverId: string;
  tool: McpToolDeclaration;
  rawArgs: string;
  result: unknown | null;
  error: string | null;
  isRunning: boolean;
}

export const McpTab: React.FC = () => {
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>(() => {
    try {
      return mcpClientManager.getServers() || [];
    } catch {
      return [];
    }
  });

  // New server registration form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpType, setNewMcpType] = useState<'stdio' | 'sse'>('stdio');
  const [newMcpCommand, setNewMcpCommand] = useState('');
  const [newMcpArgs, setNewMcpArgs] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');
  const [newMcpEnv, setNewMcpEnv] = useState('');

  // Server interaction & UI states
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);
  const [connectingServerId, setConnectingServerId] = useState<string | null>(null);

  // Tool tester state
  const [toolTest, setToolTest] = useState<ToolTestState | null>(null);
  const [copiedResult, setCopiedResult] = useState(false);

  // Config modal state (Claude / Cursor standard mcpServers format)
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonModalTab, setJsonModalTab] = useState<'import' | 'export'>('export');
  const [jsonInput, setJsonInput] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);

  const refreshMcpServers = useCallback(() => {
    try {
      setMcpServers(mcpClientManager.getServers() || []);
    } catch {
      setMcpServers([]);
    }
  }, []);

  useEffect(() => {
    refreshMcpServers();
  }, [refreshMcpServers]);

  // Native Armored Servers (Immune to accidental deletion)
  const nativeServers = [
    {
      id: 'cristi_spotify',
      name: 'Spotify Cristi MCP',
      description: 'Control de reproducción Spotify (Web API + Windows SMTC) y sincronización emocional con Live2D.',
      health: 'HEALTHY' as const,
      tools: spotifyMcpServer.getToolsDeclarations().map((t) => ({
        name: t.name,
        originalName: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    },
    {
      id: 'cristi_playwright',
      name: 'Playwright Brave MCP',
      description: 'Automatización de navegación web en Brave Browser y reproducción garantizada de YouTube.',
      health: 'HEALTHY' as const,
      tools: playwrightMcpServer.getToolsDeclarations().map((t) => ({
        name: t.name,
        originalName: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    }
  ];

  const dynamicServers = mcpServers.filter((s) => s.id !== 'cristi_spotify' && s.id !== 'cristi_playwright' && s.type !== 'internal');
  const liveToolsConfig = getLiveToolsConfig();
  const totalLiveExportedFunctions = liveToolsConfig[0]?.functionDeclarations?.length || 0;

  // Statistics calculation
  const totalServers = nativeServers.length + dynamicServers.length;
  const connectedServers = nativeServers.length + dynamicServers.filter((s) => s.status === 'connected').length;
  const totalActiveTools = nativeServers.reduce((acc, s) => acc + s.tools.length, 0) + dynamicServers.reduce((acc, s) => acc + (s.status === 'connected' ? (s.tools?.length || 0) : 0), 0);

  // Server Actions
  const handleConnectServer = async (id: string) => {
    soundFxService.playClick();
    setConnectingServerId(id);
    try {
      const success = await mcpClientManager.connectServer(id);
      refreshMcpServers();
      if (success) {
        toastService.success('Servidor MCP', 'Conexión establecida correctamente.');
      } else {
        toastService.error('Servidor MCP', 'No se pudo conectar al servidor.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toastService.error('Error MCP', msg);
    } finally {
      setConnectingServerId(null);
    }
  };

  const handleDisconnectServer = async (id: string) => {
    soundFxService.playClick();
    try {
      await mcpClientManager.disconnectServer(id);
      refreshMcpServers();
      toastService.info('Servidor MCP', 'Servidor desconectado.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toastService.error('Error MCP', msg);
    }
  };

  const handleToggleServer = async (id: string, enabled: boolean) => {
    soundFxService.playClick();
    try {
      await mcpClientManager.toggleServer(id, enabled);
      refreshMcpServers();
      toastService.info('Servidor MCP', enabled ? 'Servidor activado.' : 'Servidor desactivado.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toastService.error('Error MCP', msg);
    }
  };

  const handleRemoveServer = async (id: string, name: string) => {
    soundFxService.playClick();
    try {
      await mcpClientManager.removeServer(id);
      refreshMcpServers();
      if (toolTest?.serverId === id) {
        setToolTest(null);
      }
      toastService.info('Servidor MCP', `Servidor "${name}" eliminado.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toastService.error('Error MCP', msg);
    }
  };

  const handleRegisterServer = async () => {
    if (!newMcpName.trim()) {
      toastService.warn('Servidor MCP', 'Por favor especifica un nombre para el servidor.');
      return;
    }

    soundFxService.playClick();
    try {
      const envObj: Record<string, string> = {};
      if (newMcpEnv.trim()) {
        const lines = newMcpEnv.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            envObj[key] = val;
          }
        }
      }

      if (newMcpType === 'stdio') {
        if (!newMcpCommand.trim()) {
          toastService.warn('Servidor MCP', 'El comando ejecutable es requerido.');
          return;
        }
        await mcpClientManager.addServer({
          name: newMcpName.trim(),
          type: 'stdio',
          command: newMcpCommand.trim(),
          args: newMcpArgs.split(' ').filter(Boolean),
          env: envObj,
          enabled: true
        });
      } else {
        if (!newMcpUrl.trim()) {
          toastService.warn('Servidor MCP', 'La URL SSE es requerida.');
          return;
        }
        await mcpClientManager.addServer({
          name: newMcpName.trim(),
          type: 'sse',
          url: newMcpUrl.trim(),
          env: envObj,
          enabled: true
        });
      }

      refreshMcpServers();
      setNewMcpName('');
      setNewMcpCommand('');
      setNewMcpArgs('');
      setNewMcpUrl('');
      setNewMcpEnv('');
      setShowAddForm(false);
      toastService.success('Servidor MCP', `Servidor "${newMcpName.trim()}" registrado con éxito.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toastService.error('Error MCP', msg);
    }
  };

  // Tool Tester Actions
  const handleOpenToolTester = (serverId: string, tool: McpToolDeclaration) => {
    soundFxService.playClick();
    const rawSchema = tool.parameters || tool.inputSchema || {};
    const props = (rawSchema as { properties?: Record<string, unknown> })?.properties || {};
    const defaultArgs: Record<string, string> = {};
    for (const key of Object.keys(props)) {
      defaultArgs[key] = '';
    }

    setToolTest({
      serverId,
      tool,
      rawArgs: JSON.stringify(defaultArgs, null, 2),
      result: null,
      error: null,
      isRunning: false
    });
  };

  const handleExecuteToolTest = async () => {
    if (!toolTest) return;
    soundFxService.playClick();

    let parsedArgs: Record<string, unknown> = {};
    try {
      if (toolTest.rawArgs.trim()) {
        parsedArgs = JSON.parse(toolTest.rawArgs);
      }
    } catch {
      setToolTest((prev) => prev ? { ...prev, error: 'Los argumentos deben ser un JSON válido.' } : null);
      return;
    }

    setToolTest((prev) => prev ? { ...prev, isRunning: true, error: null, result: null } : null);

    try {
      let res: unknown;
      if (toolTest.serverId === 'cristi_spotify') {
        res = await spotifyMcpServer.executeTool(toolTest.tool.originalName || toolTest.tool.name, parsedArgs);
      } else if (toolTest.serverId === 'cristi_playwright') {
        res = await playwrightMcpServer.executeTool(toolTest.tool.originalName || toolTest.tool.name, parsedArgs);
      } else {
        res = await mcpClientManager.callServerTool(
          toolTest.serverId,
          toolTest.tool.originalName || toolTest.tool.name,
          parsedArgs
        );
      }
      setToolTest((prev) => prev ? { ...prev, isRunning: false, result: res } : null);
      toastService.success('MCP Tester', 'Herramienta ejecutada.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToolTest((prev) => prev ? { ...prev, isRunning: false, error: msg } : null);
      toastService.error('MCP Tester', msg);
    }
  };

  // Claude / Cursor JSON Import & Export
  const generateExportJson = (): string => {
    const mcpServersMap: Record<string, unknown> = {};
    for (const s of mcpServers) {
      if (s.type === 'sse') {
        mcpServersMap[s.id || s.name] = {
          type: 'sse',
          url: s.url
        };
      } else {
        mcpServersMap[s.id || s.name] = {
          command: s.command,
          args: s.args || [],
          env: s.env || {}
        };
      }
    }
    return JSON.stringify({ mcpServers: mcpServersMap }, null, 2);
  };

  const handleOpenJsonModal = (tab: 'import' | 'export') => {
    soundFxService.playClick();
    setJsonModalTab(tab);
    if (tab === 'export') {
      setJsonInput(generateExportJson());
    } else {
      setJsonInput('');
    }
    setShowJsonModal(true);
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonInput || generateExportJson());
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
      toastService.success('MCP Config', 'JSON copiado al portapapeles.');
    } catch {
      toastService.error('Error', 'No se pudo copiar el JSON.');
    }
  };

  const handleImportJsonConfig = async () => {
    soundFxService.playClick();
    try {
      const parsed = JSON.parse(jsonInput);
      const rootServers = parsed?.mcpServers ?? parsed;

      let count = 0;
      if (rootServers && typeof rootServers === 'object') {
        const entries = Array.isArray(rootServers)
          ? rootServers
          : Object.entries(rootServers).map(([key, val]) => ({
              name: key,
              ...((val as object) || {})
            }));

        for (const entry of entries) {
          if (!entry || typeof entry !== 'object' || !entry.name) continue;
          if (entry.type === 'sse' ? !entry.url : !entry.command) continue;

          await mcpClientManager.addServer({
            name: String(entry.name),
            type: entry.type === 'sse' ? 'sse' : 'stdio',
            command: entry.command ? String(entry.command) : undefined,
            args: Array.isArray(entry.args) ? entry.args.map(String) : [],
            env: typeof entry.env === 'object' && entry.env ? entry.env : {},
            url: entry.url ? String(entry.url) : undefined,
            enabled: true
          });
          count++;
        }
      }

      refreshMcpServers();
      setShowJsonModal(false);
      toastService.success('MCP Import', `${count} servidor(es) importados exitosamente.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'JSON de configuración inválido.';
      toastService.error('Error de importación', msg);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-zinc-100">
      {/* Header & Metrics Summary */}
      <div className="border border-zinc-800 bg-zinc-900/50 p-4 rounded-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-100 flex items-center gap-2">
              <Layers size={16} className="text-purple-400" />
              Servidores Model Context Protocol (MCP)
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5 font-sans">
              Federación dinámica de herramientas externas en Gemini Live (compatible con Claude y Cursor).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenJsonModal('import')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-sm border border-zinc-700 transition-colors"
              title="Importar o exportar configuración mcpServers compatible con Claude y Cursor"
            >
              <FileCode size={13} className="text-purple-400" />
              <span>Config JSON</span>
            </button>
            <button
              type="button"
              onClick={() => {
                soundFxService.playClick();
                setShowAddForm(!showAddForm);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-purple-600 hover:bg-purple-500 text-white rounded-sm transition-colors shadow-xs"
            >
              <Plus size={13} />
              <span>{showAddForm ? 'Cancelar' : 'Añadir Servidor'}</span>
            </button>
          </div>
        </div>

        {/* Status Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-800/80 text-xs font-mono">
          <div className="bg-zinc-950/70 p-2 rounded-sm border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-400">Nativos Blindados:</span>
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              <ShieldCheck size={12} className="text-emerald-400" />
              {nativeServers.length}
            </span>
          </div>
          <div className="bg-zinc-950/70 p-2 rounded-sm border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-400">Dinámicos (JSON):</span>
            <span className="font-semibold text-zinc-200">{dynamicServers.length}</span>
          </div>
          <div className="bg-zinc-950/70 p-2 rounded-sm border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-400">Gemini Live Tools:</span>
            <span className="font-semibold text-purple-400 flex items-center gap-1" title="Funciones exportadas a la sesión Gemini Live">
              <Zap size={11} className="text-purple-400" />
              {totalLiveExportedFunctions}
            </span>
          </div>
          <div className="bg-zinc-950/70 p-2 rounded-sm border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-400">Conectados:</span>
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {connectedServers}/{totalServers}
            </span>
          </div>
        </div>
      </div>

      {/* Formulario para Registrar Nuevo Servidor MCP */}
      {showAddForm && (
        <div className="border border-purple-900/60 bg-zinc-900/70 p-4 space-y-3.5 rounded-sm animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-mono font-semibold text-zinc-200 flex items-center gap-1.5">
              <Plus size={14} className="text-purple-400" />
              Nuevo Servidor MCP
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setNewMcpType('stdio')}
                className={`px-2.5 py-1 text-[11px] font-mono border rounded-sm transition-colors ${
                  newMcpType === 'stdio'
                    ? 'bg-purple-900/70 border-purple-500 text-purple-200 font-medium'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-300'
                }`}
              >
                stdio (CLI)
              </button>
              <button
                type="button"
                onClick={() => setNewMcpType('sse')}
                className={`px-2.5 py-1 text-[11px] font-mono border rounded-sm transition-colors ${
                  newMcpType === 'sse'
                    ? 'bg-purple-900/70 border-purple-500 text-purple-200 font-medium'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-300'
                }`}
              >
                SSE (HTTP/Web)
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] font-mono text-zinc-400 block mb-1">Nombre del Servidor</label>
              <input
                type="text"
                value={newMcpName}
                onChange={(e) => setNewMcpName(e.target.value)}
                placeholder="ej. filesystem, weather-mcp, sqlite-memory..."
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-700 text-zinc-200 rounded-sm focus:outline-hidden focus:border-purple-500"
              />
            </div>

            {newMcpType === 'stdio' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 block mb-1">Comando Ejecutable</label>
                  <input
                    type="text"
                    value={newMcpCommand}
                    onChange={(e) => setNewMcpCommand(e.target.value)}
                    placeholder="ej. pnpm, node, npx, python..."
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-700 text-zinc-200 rounded-sm focus:outline-hidden focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 block mb-1">Argumentos (separados por espacio)</label>
                  <input
                    type="text"
                    value={newMcpArgs}
                    onChange={(e) => setNewMcpArgs(e.target.value)}
                    placeholder="ej. dlx @modelcontextprotocol/server-filesystem C:\Path"
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-700 text-zinc-200 rounded-sm focus:outline-hidden focus:border-purple-500"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-[11px] font-mono text-zinc-400 block mb-1">URL Endpoint SSE</label>
                <input
                  type="text"
                  value={newMcpUrl}
                  onChange={(e) => setNewMcpUrl(e.target.value)}
                  placeholder="ej. http://localhost:3000/sse"
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-700 text-zinc-200 rounded-sm focus:outline-hidden focus:border-purple-500"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] font-mono text-zinc-400 block mb-1">Variables de Entorno (Opcional, KEY=VAL por línea)</label>
              <textarea
                value={newMcpEnv}
                onChange={(e) => setNewMcpEnv(e.target.value)}
                rows={2}
                placeholder="API_KEY=xxx&#10;DEBUG=1"
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-700 text-zinc-200 rounded-sm focus:outline-hidden focus:border-purple-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1 text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-sm border border-zinc-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleRegisterServer}
              className="px-3 py-1 text-xs font-mono bg-purple-600 hover:bg-purple-500 text-white rounded-sm font-medium"
            >
              Registrar y Guardar
            </button>
          </div>
        </div>
      )}

      {/* ── SECCIÓN 1: INTEGRACIONES NATIVAS BLINDADAS ─────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-zinc-300 px-1 border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span className="font-semibold uppercase tracking-wider text-zinc-200">
              Integraciones Nativas Blindadas ({nativeServers.length})
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 font-mono">
            Protegidas por el Núcleo • Sin Riesgo de Eliminación
          </span>
        </div>

        {nativeServers.map((server) => {
          const isExpanded = expandedServerId === server.id;
          const tools = server.tools;

          return (
            <div
              key={server.id}
              className="border border-emerald-900/40 bg-zinc-900/60 rounded-sm p-3.5 space-y-3 transition-colors shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <Shield size={14} className="text-emerald-400 shrink-0" />
                  <span className="font-semibold text-xs font-mono text-zinc-100 truncate">
                    {server.name}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800/80 rounded-none uppercase">
                    Blindado (Nativo)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-none border border-emerald-700/80 bg-emerald-950/80 text-emerald-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    HEALTHY
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-950 text-zinc-400 border border-zinc-800 rounded-none">
                    Permanente
                  </span>
                </div>
              </div>

              <p className="text-[11px] font-mono text-zinc-400 bg-zinc-950/70 px-2.5 py-1.5 rounded-sm border border-zinc-800/80">
                {server.description}
              </p>

              {/* Tool catalogue toggle */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    soundFxService.playClick();
                    setExpandedServerId(isExpanded ? null : server.id);
                  }}
                  className="w-full flex items-center justify-between text-[11px] font-mono px-2.5 py-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-sm text-zinc-300 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <Wrench size={11} className="text-emerald-400" />
                    <span className="font-semibold">
                      {tools.length} funciones nativas registradas
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                    <span>{isExpanded ? 'Ocultar catálogo' : 'Explorar y probar'}</span>
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-2 space-y-2 pl-1 animate-in fade-in duration-100">
                    {tools.map((tool, idx) => {
                      const rawParams = (tool.parameters || {}) as {
                        properties?: Record<string, { type?: string; description?: string }>;
                        required?: string[];
                      };
                      const properties = rawParams.properties || {};
                      const requiredList = rawParams.required || [];

                      return (
                        <div
                          key={idx}
                          className="bg-zinc-950 border border-zinc-800 rounded-sm p-2.5 space-y-2 text-xs font-mono"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                                <Wrench size={11} className="text-emerald-400" />
                                <span>{tool.name}</span>
                              </div>
                              {tool.description && (
                                <p className="text-[11px] text-zinc-400 mt-0.5">
                                  {tool.description}
                                </p>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleOpenToolTester(server.id, tool as any)}
                              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-700 rounded-xs transition-colors shrink-0 cursor-pointer"
                            >
                              <Play size={9} /> Probar
                            </button>
                          </div>

                          {Object.keys(properties).length > 0 ? (
                            <div className="bg-zinc-900/60 p-2 rounded-xs border border-zinc-800/80 space-y-1">
                              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-semibold">
                                Parámetros:
                              </span>
                              <div className="space-y-1">
                                {Object.entries(properties).map(([propName, propDef]) => (
                                  <div key={propName} className="text-[11px] flex items-baseline gap-1.5 flex-wrap">
                                    <span className="text-zinc-200 font-semibold">{propName}</span>
                                    <span className="text-[10px] px-1 bg-zinc-800 text-zinc-400 rounded-xs">
                                      {String(propDef?.type || 'string').toUpperCase()}
                                    </span>
                                    {requiredList.includes(propName) && (
                                      <span className="text-[9px] px-1 bg-rose-950 text-rose-300 border border-rose-800 rounded-xs font-semibold">
                                        Requerido
                                      </span>
                                    )}
                                    {propDef?.description && (
                                      <span className="text-zinc-500 text-[10px]">
                                        — {propDef.description}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-zinc-500 italic block">
                              No requiere parámetros.
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── SECCIÓN 2: SERVIDORES MCP DINÁMICOS ─────────────────── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between text-xs font-mono text-zinc-300 px-1 border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <Server size={14} className="text-purple-400" />
            <span className="font-semibold uppercase tracking-wider text-zinc-200">
              Servidores MCP Dinámicos ({dynamicServers.length})
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 font-mono">
            config/mcp.json • stdio / SSE
          </span>
        </div>

        {dynamicServers.map((server) => {
          const isExpanded = expandedServerId === server.id;
          const tools = Array.isArray(server.tools) ? server.tools : [];
          const isConnecting = connectingServerId === server.id || server.status === 'connecting';

          let statusBadgeClass = 'bg-zinc-800 text-zinc-400 border-zinc-700';
          let statusLabel = 'Desconectado';
          if (server.status === 'connected') {
            statusBadgeClass = 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80';
            statusLabel = 'Conectado';
          } else if (isConnecting) {
            statusBadgeClass = 'bg-amber-950/80 text-amber-300 border-amber-800/80';
            statusLabel = 'Conectando...';
          } else if (server.status === 'error') {
            statusBadgeClass = 'bg-rose-950/80 text-rose-300 border-rose-800/80';
            statusLabel = 'Error';
          }

          return (
            <div
              key={server.id}
              className={`border bg-zinc-900/50 rounded-sm p-3.5 space-y-3 transition-colors ${
                server.enabled ? 'border-zinc-800 hover:border-zinc-700' : 'border-zinc-800/60 opacity-60'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <Server size={14} className="text-purple-400 shrink-0" />
                  <span className="font-semibold text-xs font-mono text-zinc-200 truncate">
                    {server.name}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-xs shrink-0 uppercase">
                    {server.type || 'stdio'}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-xs border shrink-0 flex items-center gap-1 ${statusBadgeClass}`}
                  >
                    {server.status === 'connected' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    {isConnecting && <Loader2 size={10} className="animate-spin" />}
                    {server.status === 'error' && <AlertTriangle size={10} />}
                    {statusLabel}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {server.status === 'connected' ? (
                    <button
                      type="button"
                      onClick={() => handleDisconnectServer(server.id)}
                      className="px-2.5 py-1 text-[11px] font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-sm transition-colors cursor-pointer"
                    >
                      Desconectar
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isConnecting || !server.enabled}
                      onClick={() => handleConnectServer(server.id)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800 rounded-sm transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isConnecting && <Loader2 size={11} className="animate-spin" />}
                      <span>Conectar</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleToggleServer(server.id, !server.enabled)}
                    className={`px-2 py-1 text-[11px] font-mono rounded-sm border transition-colors flex items-center gap-1 cursor-pointer ${
                      server.enabled
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-750'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                    title={server.enabled ? 'Desactivar servidor' : 'Activar servidor'}
                  >
                    <Power size={11} className={server.enabled ? 'text-emerald-400' : 'text-zinc-600'} />
                    <span>{server.enabled ? 'Activo' : 'Inactivo'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemoveServer(server.id, server.name)}
                    className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors rounded-sm hover:bg-zinc-800/50 cursor-pointer"
                    title="Eliminar servidor permanentemente"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="text-[11px] font-mono text-zinc-400 truncate bg-zinc-950/80 px-2.5 py-1.5 rounded-sm border border-zinc-800">
                {server.type === 'sse' ? (
                  <span className="flex items-center gap-1.5">
                    <Globe size={11} className="text-purple-400 shrink-0" />
                    <span className="truncate">{server.url}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Terminal size={11} className="text-zinc-500 shrink-0" />
                    <span className="text-purple-300 font-semibold">{server.command}</span>
                    <span className="truncate text-zinc-400">
                      {Array.isArray(server.args) ? server.args.join(' ') : server.args || ''}
                    </span>
                  </span>
                )}
              </div>

              {server.lastError && (
                <div className="bg-rose-950/40 border border-rose-800/70 text-rose-300 p-2.5 rounded-sm text-xs font-mono flex items-start gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-rose-400" />
                  <span className="break-all">{server.lastError}</span>
                </div>
              )}

              {tools.length > 0 && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      soundFxService.playClick();
                      setExpandedServerId(isExpanded ? null : server.id);
                    }}
                    className="w-full flex items-center justify-between text-[11px] font-mono px-2.5 py-1.5 bg-purple-950/30 hover:bg-purple-950/50 border border-purple-800/50 rounded-sm text-purple-200 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <Wrench size={11} className="text-purple-400" />
                      <span className="font-semibold">
                        {tools.length} {tools.length === 1 ? 'herramienta descubierta' : 'herramientas descubiertas'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-purple-300">
                      <span>{isExpanded ? 'Ocultar catálogo' : 'Explorar y probar'}</span>
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-2 space-y-2 pl-1 animate-in fade-in duration-100">
                      {tools.map((tool, idx) => {
                        const rawParams = (tool.parameters || tool.inputSchema || {}) as {
                          properties?: Record<string, { type?: string; description?: string }>;
                          required?: string[];
                        };
                        const properties = rawParams.properties || {};
                        const requiredList = rawParams.required || [];

                        return (
                          <div
                            key={idx}
                            className="bg-zinc-950 border border-zinc-800 rounded-sm p-2.5 space-y-2 text-xs font-mono"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-semibold text-purple-300 flex items-center gap-1.5">
                                  <Wrench size={11} className="text-purple-400" />
                                  <span>{tool.originalName || tool.name}</span>
                                </div>
                                {tool.description && (
                                  <p className="text-[11px] text-zinc-400 mt-0.5">
                                    {tool.description}
                                  </p>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleOpenToolTester(server.id, tool)}
                                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700 rounded-xs transition-colors shrink-0 cursor-pointer"
                              >
                                <Play size={9} /> Probar
                              </button>
                            </div>

                            {Object.keys(properties).length > 0 ? (
                              <div className="bg-zinc-900/60 p-2 rounded-xs border border-zinc-800/80 space-y-1">
                                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-semibold">
                                  Parámetros:
                                </span>
                                <div className="space-y-1">
                                  {Object.entries(properties).map(([propName, propDef]) => {
                                    const isRequired = requiredList.includes(propName);
                                    return (
                                      <div key={propName} className="text-[11px] flex items-baseline gap-1.5 flex-wrap">
                                        <span className="text-zinc-200 font-semibold">{propName}</span>
                                        <span className="text-[10px] px-1 bg-zinc-800 text-zinc-400 rounded-xs">
                                          {String(propDef?.type || 'string').toUpperCase()}
                                        </span>
                                        {isRequired && (
                                          <span className="text-[9px] px-1 bg-rose-950 text-rose-300 border border-rose-800 rounded-xs font-semibold">
                                            Requerido
                                          </span>
                                        )}
                                        {propDef?.description && (
                                          <span className="text-zinc-500 text-[10px]">
                                            — {propDef.description}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] text-zinc-500 italic block">
                                No requiere parámetros.
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {dynamicServers.length === 0 && (
          <div className="text-center py-8 border border-dashed border-zinc-800 rounded-sm space-y-2">
            <Server size={22} className="mx-auto text-zinc-600" />
            <p className="text-xs text-zinc-400 font-mono">
              No hay servidores MCP dinámicos externos configurados actualmente.
            </p>
            <p className="text-[11px] text-zinc-500 max-w-sm mx-auto font-sans">
              Registra un servidor local stdio o remoto SSE para extender las herramientas de Cristi AI.
            </p>
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-purple-700 hover:bg-purple-600 text-white rounded-sm cursor-pointer"
            >
              <Plus size={12} /> Registrar Servidor Dinámico
            </button>
          </div>
        )}
      </div>

      {/* Interactive Tool Execution Tester Drawer */}
      {toolTest && (
        <div className="border border-purple-800 bg-zinc-950 p-4 rounded-sm space-y-3 shadow-xl animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <Play size={14} className="text-purple-400" />
              <span className="text-xs font-mono font-semibold text-zinc-200">
                Tester en Vivo: <span className="text-purple-300">{toolTest.tool.originalName || toolTest.tool.name}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setToolTest(null)}
              className="p-1 text-zinc-500 hover:text-zinc-200 rounded-sm"
              title="Cerrar tester"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono text-zinc-400">
                Argumentos de Prueba (JSON):
              </label>
              <button
                type="button"
                onClick={() => setToolTest((prev) => prev ? { ...prev, rawArgs: '{}' } : null)}
                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300"
              >
                Limpiar JSON
              </button>
            </div>
            <textarea
              value={toolTest.rawArgs}
              onChange={(e) => {
                const val = e.target.value;
                setToolTest((prev) => prev ? { ...prev, rawArgs: val, error: null } : null);
              }}
              rows={4}
              className="w-full px-3 py-2 text-xs font-mono bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-sm focus:outline-hidden focus:border-purple-500"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              disabled={toolTest.isRunning}
              onClick={handleExecuteToolTest}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-purple-600 hover:bg-purple-500 text-white rounded-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {toolTest.isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              <span>{toolTest.isRunning ? 'Ejecutando...' : 'Ejecutar Herramienta'}</span>
            </button>
          </div>

          {/* Test Error Message */}
          {toolTest.error && (
            <div className="bg-rose-950/40 border border-rose-800 text-rose-300 p-2.5 rounded-sm text-xs font-mono">
              <strong>Error:</strong> {toolTest.error}
            </div>
          )}

          {/* Test Result Display */}
          {toolTest.result !== null && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
                  <Check size={12} /> Resultado de Ejecución:
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(JSON.stringify(toolTest.result, null, 2));
                    setCopiedResult(true);
                    setTimeout(() => setCopiedResult(false), 2000);
                  }}
                  className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-zinc-200"
                >
                  {copiedResult ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                  <span>{copiedResult ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="w-full max-h-56 overflow-y-auto p-2.5 text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-sm">
                {JSON.stringify(toolTest.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Modal / Panel for standard mcpServers JSON Import & Export */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 w-full max-w-xl p-4 rounded-sm space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2">
                <FileCode size={16} className="text-purple-400" />
                <h3 className="text-xs font-mono font-semibold uppercase text-zinc-100">
                  Configuración Estándar `mcpServers` (Claude / Cursor)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowJsonModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-100 rounded-sm"
              >
                <X size={15} />
              </button>
            </div>

            {/* Segmented Selector for Export / Import */}
            <div className="flex border-b border-zinc-800">
              <button
                type="button"
                onClick={() => handleOpenJsonModal('export')}
                className={`flex-1 py-1.5 text-xs font-mono text-center border-b-2 transition-colors ${
                  jsonModalTab === 'export'
                    ? 'border-purple-500 text-purple-300 font-semibold'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Exportar Configuración
              </button>
              <button
                type="button"
                onClick={() => handleOpenJsonModal('import')}
                className={`flex-1 py-1.5 text-xs font-mono text-center border-b-2 transition-colors ${
                  jsonModalTab === 'import'
                    ? 'border-purple-500 text-purple-300 font-semibold'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Importar JSON
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-zinc-400 font-sans">
                {jsonModalTab === 'export'
                  ? 'Copia este bloque JSON para usarlo directamente en claude_desktop_config.json o en la configuración MCP de Cursor.'
                  : 'Pega una configuración estándar con formato { "mcpServers": { ... } } para importar los servidores a Cristi AI.'}
              </p>

              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                rows={10}
                placeholder='{\n  "mcpServers": {\n    "filesystem": {\n      "command": "pnpm",\n      "args": ["dlx", "@modelcontextprotocol/server-filesystem", "C:\\\\"]\n    }\n  }\n}'
                className="w-full px-3 py-2 text-xs font-mono bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-sm focus:outline-hidden focus:border-purple-500"
              />
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowJsonModal(false)}
                className="px-3 py-1.5 text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-sm"
              >
                Cerrar
              </button>

              {jsonModalTab === 'export' ? (
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-purple-600 hover:bg-purple-500 text-white rounded-sm font-semibold transition-colors"
                >
                  {copiedJson ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
                  <span>{copiedJson ? 'Copiado al Portapapeles' : 'Copiar JSON'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleImportJsonConfig}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-purple-600 hover:bg-purple-500 text-white rounded-sm font-semibold transition-colors"
                >
                  <Plus size={13} />
                  <span>Validar e Importar</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default McpTab;
