import type { IToolHandler, ToolExecutionContext } from '../IToolHandler';
// @ts-ignore
import { mcpClientManager } from '../../integrations/mcp/MCPClientManager.ts';

export const mcpAddServerHandler: IToolHandler = {
  name: 'mcp_add_server',
  declaration: {
    name: 'mcp_add_server',
    description: 'Registra y conecta un servidor MCP nuevo para ampliar tus herramientas. Usa stdio para procesos locales o sse para endpoints HTTP compatibles.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Nombre legible del servidor MCP.' },
        transport: { type: 'STRING', enum: ['stdio', 'sse'], description: 'Transporte MCP.' },
        command: { type: 'STRING', description: 'Comando del proceso local (stdio), por ejemplo node, pnpm o python.' },
        args: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Argumentos del proceso stdio, en orden.' },
        url: { type: 'STRING', description: 'URL del endpoint SSE cuando transport es sse.' },
        enabled: { type: 'BOOLEAN', description: 'Conecta el servidor inmediatamente (por defecto true).' }
      },
      required: ['name']
    }
  },
  async execute(args: {
    name?: string;
    transport?: string;
    command?: string;
    args?: any[];
    url?: string;
    enabled?: boolean;
  }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Registro de servidor MCP cancelado por señal de aborto.', cancelled: true };
    const server = await mcpClientManager.addServer({
      name: String(args?.name || '').trim(),
      type: args?.transport === 'sse' ? 'sse' : 'stdio',
      command: String(args?.command || '').trim(),
      args: Array.isArray(args?.args) ? args.args.map(value => String(value)) : [],
      url: String(args?.url || '').trim(),
      enabled: args?.enabled !== false
    });

    if (context?.signal?.aborted) {
      if (server) await mcpClientManager.removeServer(server.id);
      return { status: 'cancelled', message: 'Registro de servidor MCP cancelado durante la inicialización.', cancelled: true };
    }

    if (!server) {
      return { status: 'error', message: 'El servidor MCP requiere un nombre válido.' };
    }

    return {
      status: server.status === 'connected' ? 'success' : 'error',
      server: {
        id: server.id,
        name: server.name,
        type: server.type,
        status: server.status,
        lastError: (server as any).lastError || null,
        tools: (server.tools || []).map((tool: any) => tool.name)
      }
    };
  }
};

export const mcpRemoveServerHandler: IToolHandler = {
  name: 'mcp_remove_server',
  declaration: {
    name: 'mcp_remove_server',
    description: 'Desconecta y elimina un servidor MCP registrado.',
    parameters: {
      type: 'OBJECT',
      properties: {
        server_id: { type: 'STRING', description: 'ID del servidor MCP.' }
      },
      required: ['server_id']
    }
  },
  async execute(args: { server_id?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Eliminación de servidor MCP cancelada por señal de aborto.', cancelled: true };
    const serverId = String(args?.server_id || '').trim();
    const removed = await mcpClientManager.removeServer(serverId);
    return removed
      ? { status: 'success', server_id: serverId }
      : { status: 'error', message: `Servidor MCP "${serverId}" no encontrado.` };
  }
};

export const mcpListServersHandler: IToolHandler = {
  name: 'mcp_list_servers',
  declaration: {
    name: 'mcp_list_servers',
    description: 'Lista los servidores MCP registrados, su estado y las herramientas descubiertas.'
  },
  async execute(_args?: unknown, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Listado de servidores MCP cancelado por señal de aborto.', cancelled: true };
    return {
      status: 'success',
      servers: mcpClientManager.getServers().map((server: any) => ({
        id: server.id,
        name: server.name,
        type: server.type,
        enabled: server.enabled,
        status: server.status,
        lastError: server.lastError || null,
        tools: (server.tools || []).map((tool: any) => tool.name)
      }))
    };
  }
};

export const mcpReconnectServerHandler: IToolHandler = {
  name: 'mcp_reconnect_server',
  declaration: {
    name: 'mcp_reconnect_server',
    description: 'Reconecta un servidor MCP existente y vuelve a descubrir sus herramientas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        server_id: { type: 'STRING', description: 'ID del servidor MCP.' }
      },
      required: ['server_id']
    }
  },
  async execute(args: { server_id?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Reconexión de servidor MCP cancelada por señal de aborto.', cancelled: true };
    const serverId = String(args?.server_id || '').trim();
    const server = mcpClientManager.getServers().find((item: any) => item.id === serverId);
    if (!server) {
      return { status: 'error', message: `Servidor MCP "${serverId}" no encontrado.` };
    }

    await mcpClientManager.disconnectServer(serverId);
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Reconexión MCP cancelada tras desconexión.', cancelled: true };

    const connected = await mcpClientManager.connectServer(serverId);
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Reconexión MCP cancelada tras enlace.', cancelled: true };

    const current = mcpClientManager.getServers().find((item: any) => item.id === serverId) || server;

    return {
      status: connected ? 'success' : 'error',
      server: {
        id: current.id,
        name: current.name,
        status: current.status,
        tools: (current.tools || []).map((tool: any) => tool.name),
        lastError: current.lastError || null
      }
    };
  }
};

export const mcpCallToolHandler: IToolHandler = {
  name: 'mcp_call_tool',
  declaration: {
    name: 'mcp_call_tool',
    description: 'Ejecuta una herramienta MCP por servidor y nombre original. Permite usar inmediatamente un servidor recién creado sin esperar a reconectar la llamada Live.',
    parameters: {
      type: 'OBJECT',
      properties: {
        server_id: { type: 'STRING', description: 'ID del servidor MCP conectado.' },
        tool_name: { type: 'STRING', description: 'Nombre exacto de la herramienta anunciado por el servidor MCP.' },
        arguments: { type: 'OBJECT', description: 'Argumentos JSON requeridos por la herramienta.' }
      },
      required: ['server_id', 'tool_name']
    }
  },
  async execute(args: { server_id?: string; tool_name?: string; arguments?: Record<string, any> }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Invocación de herramienta MCP cancelada por señal de aborto.', cancelled: true };
    return await mcpClientManager.callServerTool(
      String(args?.server_id || '').trim(),
      String(args?.tool_name || '').trim(),
      args?.arguments && typeof args.arguments === 'object' ? args.arguments : {},
      context?.signal
    );
  }
};

export const mcpSearchServersHandler: IToolHandler = {
  name: 'mcp_search_servers',
  declaration: {
    name: 'mcp_search_servers',
    description: 'Busca paquetes de servidores MCP compatibles en el catálogo oficial para que Cristi AI pueda instalarlos autónomamente.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Término de búsqueda (ej: time, sqlite, filesystem, memory, fetch).' }
      },
      required: ['query']
    }
  },
  async execute(args: { query?: string }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Búsqueda MCP cancelada.', cancelled: true };
    const query = String(args?.query || '').toLowerCase().trim();

    // Curated high-reliability standard MCP packages
    const catalog = [
      {
        package: '@modelcontextprotocol/server-time',
        name: 'Time & Timezones MCP',
        description: 'Servicio MCP para consulta de hora exacta, cálculo de diferencias de zonas horarias y conversiones temporales.',
        defaultArgs: [],
        envVars: {}
      },
      {
        package: '@modelcontextprotocol/server-filesystem',
        name: 'Local Filesystem MCP',
        description: 'Servicio MCP para inspección y operaciones seguras sobre directorios y archivos locales.',
        defaultArgs: ['C:\\React-Nextjs-Projects'],
        envVars: {}
      },
      {
        package: '@modelcontextprotocol/server-sqlite',
        name: 'SQLite Database MCP',
        description: 'Servicio MCP para ejecución de consultas y almacenamiento relacional local SQLite.',
        defaultArgs: ['--db-path', 'cristi-memory.db'],
        envVars: {}
      },
      {
        package: '@modelcontextprotocol/server-memory',
        name: 'Knowledge Graph Memory MCP',
        description: 'Servicio MCP basado en grafos de conocimiento persistentes para memoria asociativa contextual.',
        defaultArgs: [],
        envVars: {}
      },
      {
        package: '@modelcontextprotocol/server-fetch',
        name: 'Web Fetch MCP',
        description: 'Servicio MCP para lectura directa de contenido web HTML a Markdown y llamadas HTTP.',
        defaultArgs: [],
        envVars: {}
      },
      {
        package: '@modelcontextprotocol/server-everything',
        name: 'Reference Everything MCP',
        description: 'Servidor MCP de referencia que expone herramientas, prompts y recursos para pruebas completas de integración.',
        defaultArgs: [],
        envVars: {}
      },
      {
        package: '@modelcontextprotocol/server-sequential-thinking',
        name: 'Sequential Thinking MCP',
        description: 'Servicio MCP para razonamiento estructurado, descomposición de problemas complejos y deducción secuencial paso a paso.',
        defaultArgs: [],
        envVars: {}
      }
    ];

    const matched = catalog.filter(c =>
      !query ||
      c.package.toLowerCase().includes(query) ||
      c.name.toLowerCase().includes(query) ||
      c.description.toLowerCase().includes(query)
    );

    return {
      status: 'success',
      query,
      results: matched.map(m => ({
        ...m,
        commandSnippet: `pnpm dlx ${m.package} ${m.defaultArgs.join(' ')}`.trim(),
        installInstruction: `Llama a mcp_install_server({ name: "${m.name}", package_name: "${m.package}", args: ${JSON.stringify(m.defaultArgs)} })`
      }))
    };
  }
};

export const mcpInstallServerHandler: IToolHandler = {
  name: 'mcp_install_server',
  declaration: {
    name: 'mcp_install_server',
    description: 'Instala y activa de forma autónoma un nuevo servidor MCP usando pnpm dlx, conectándolo y guardándolo en la configuración de Cristi AI.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Nombre descriptivo del servidor MCP.' },
        package_name: { type: 'STRING', description: 'Nombre del paquete (ej: @modelcontextprotocol/server-time).' },
        args: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Argumentos adicionales para el servidor.' },
        env: { type: 'OBJECT', description: 'Variables de entorno opcionales.' },
        auto_connect: { type: 'BOOLEAN', description: 'Conectar inmediatamente el servidor tras instalarlo (por defecto true).' }
      },
      required: ['name', 'package_name']
    }
  },
  async execute(args: {
    name?: string;
    package_name?: string;
    args?: string[];
    env?: Record<string, string>;
    auto_connect?: boolean;
  }, context?: ToolExecutionContext) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Instalación MCP cancelada por señal de aborto.', cancelled: true };
    const name = String(args?.name || '').trim();
    const pkg = String(args?.package_name || '').trim();
    if (!name || !pkg) {
      return { status: 'error', message: 'name y package_name son obligatorios para instalar un servidor MCP.' };
    }

    const commandArgs = ['dlx', pkg, ...(Array.isArray(args?.args) ? args.args.map(String) : [])];

    const server = await mcpClientManager.addServer({
      name,
      type: 'stdio',
      command: 'pnpm',
      args: commandArgs,
      env: args?.env || {},
      enabled: args?.auto_connect !== false
    });

    if (!server) {
      return { status: 'error', message: 'No se pudo crear la configuración del servidor MCP.' };
    }

    return {
      status: 'success',
      message: `Servidor MCP "${name}" instalado y configurado exitosamente.`,
      server: {
        id: server.id,
        name: server.name,
        command: server.command,
        args: server.args,
        status: server.status,
        lastError: (server as any).lastError || null,
        tools: (server.tools || []).map((t: any) => t.name)
      }
    };
  }
};

export const mcpTools: IToolHandler[] = [
  mcpAddServerHandler,
  mcpRemoveServerHandler,
  mcpListServersHandler,
  mcpReconnectServerHandler,
  mcpCallToolHandler,
  mcpSearchServersHandler,
  mcpInstallServerHandler
];

