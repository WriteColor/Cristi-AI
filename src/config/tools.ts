/**
 * Cristi AI - Tool Function Declarations for Gemini Multimodal Live API.
 * Sincronizado dinámicamente con el catálogo Command Pattern de src/domain/tools/.
 */

import type { GeminiFunctionDeclaration } from '../types/gemini.types.js';

export interface LiveToolsConfig {
  functionDeclarations: GeminiFunctionDeclaration[];
}

// Gemini 3.1 executes function calls synchronously. Cosmetic avatar actions
// must never delay an otherwise simple voice response; the local UI can still
// invoke them through ToolRegistry when explicitly requested by the user.
const LIVE_LATENCY_EXEMPT_TOOL_NAMES = new Set([
  'trigger_companion_gesture',
  'trigger_model_motion',
  'move_avatar',
]);

let _toolRegistry: any = null;
try {
  const mod = await import('../domain/tools/index.ts');
  _toolRegistry = mod.toolRegistry;
} catch {
  // Test / Node headless environment fallback
}

export const COMPANION_FUNCTION_DECLARATIONS: GeminiFunctionDeclaration[] = _toolRegistry?.getAllDeclarations?.() ?? [];
export const TOOLS_DEFINITIONS = COMPANION_FUNCTION_DECLARATIONS;

function sanitizeDeclaration(decl: GeminiFunctionDeclaration): GeminiFunctionDeclaration {
  const params: any = (decl.parameters && typeof decl.parameters === 'object') ? decl.parameters : { type: 'OBJECT', properties: {} };
  const properties: Record<string, any> = {};

  if (params.properties && typeof params.properties === 'object') {
    for (const [key, val] of Object.entries(params.properties as Record<string, any>)) {
      if (val && typeof val === 'object') {
        const propEntry: Record<string, any> = {
          type: val.type || 'STRING',
          description: val.description || ''
        };
        if (Array.isArray(val.enum)) propEntry.enum = val.enum;
        if (val.type === 'ARRAY') {
          propEntry.items = val.items || { type: 'STRING' };
        }
        if (val.type === 'OBJECT') {
          propEntry.properties = val.properties || {};
        }
        properties[key] = propEntry;
      }
    }
  }

  return {
    name: decl.name,
    description: decl.description,
    behavior: decl.behavior || 'NON_BLOCKING',
    parameters: {
      type: 'OBJECT',
      properties,
      required: Array.isArray(params.required) ? params.required : []
    }
  };
}

export function getLiveToolsConfig(customMcpDeclarations: GeminiFunctionDeclaration[] = []): LiveToolsConfig[] {
  const baseDeclarations: GeminiFunctionDeclaration[] = _toolRegistry?.getAllDeclarations?.() ?? COMPANION_FUNCTION_DECLARATIONS ?? [];
  const allDeclarations: GeminiFunctionDeclaration[] = [
    ...baseDeclarations.filter(({ name }) => !LIVE_LATENCY_EXEMPT_TOOL_NAMES.has(name)),
    ...(Array.isArray(customMcpDeclarations) ? customMcpDeclarations : [])
  ].map(sanitizeDeclaration);

  return [
    {
      functionDeclarations: allDeclarations
    }
  ];
}

export function getToolDeclaration(name: string): GeminiFunctionDeclaration | undefined {
  return _toolRegistry?.get?.(name)?.declaration;
}

export default COMPANION_FUNCTION_DECLARATIONS;
