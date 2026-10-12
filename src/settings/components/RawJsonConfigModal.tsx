import React, { useState, useEffect } from 'react';
import { X, Save, FileCode, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { modularConfigManager, ModularConfig } from '../../config/ModularConfigManager';
import { soundFxService } from '../../domain/audio/SoundFxService';
import { electronBridge } from '../../services/desktop/ElectronBridge';

interface RawJsonConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ConfigSectionKey = keyof ModularConfig;

const CONFIG_FILES: Array<{ key: ConfigSectionKey; label: string; filename: string }> = [
  { key: 'app', label: 'Aplicación (app.json)', filename: 'app.json' },
  { key: 'models', label: 'Modelos Gemini (models.json)', filename: 'models.json' },
  { key: 'voices', label: 'Voces (voices.json)', filename: 'voices.json' },
  { key: 'avatars', label: 'Modelos Live2D (avatars.json)', filename: 'avatars.json' },
  { key: 'prompts', label: 'Prompt Maestro (prompts.json)', filename: 'prompts.json' },
  { key: 'mcp', label: 'Servidores MCP (mcp.json)', filename: 'mcp.json' },
  { key: 'spotify', label: 'Spotify & Emociones (spotify.json)', filename: 'spotify.json' }
];

export const RawJsonConfigModal: React.FC<RawJsonConfigModalProps> = ({ isOpen, onClose }) => {
  const [selectedKey, setSelectedKey] = useState<ConfigSectionKey>('app');
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load section content when modal opens or selected key changes
  useEffect(() => {
    if (!isOpen) return;
    void loadCurrentSection();
  }, [isOpen, selectedKey]);

  const loadCurrentSection = async () => {
    try {
      await modularConfigManager.loadAll();
      const data = modularConfigManager.getSection(selectedKey);
      setJsonText(JSON.stringify(data ?? {}, null, 2));
      setParseError(null);
      setSaveSuccess(false);
    } catch (err) {
      setParseError(`Error al cargar sección: ${(err as Error).message}`);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonText(e.target.value);
    setSaveSuccess(false);
    try {
      JSON.parse(e.target.value);
      setParseError(null);
    } catch (err) {
      setParseError((err as Error).message);
    }
  };

  const handleSave = async () => {
    soundFxService.playClick();
    try {
      const parsed = JSON.parse(jsonText);
      modularConfigManager.updateSection(selectedKey, parsed);
      await modularConfigManager.flush();
      if (selectedKey === 'app') {
        try {
          await electronBridge.saveAppConfig(parsed);
        } catch (_) {}
      }
      setSaveSuccess(true);
      setParseError(null);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setParseError(`JSON Inválido: ${(err as Error).message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in font-mono">
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-900/90 border-b border-zinc-800">
          <div className="flex items-center gap-2.5 text-zinc-100">
            <FileCode size={18} className="text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Editor de Configuraciones Modulares JSON
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-sm transition-colors cursor-pointer"
            title="Cerrar modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Toolbar with Section Selector */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-zinc-900/40 border-b border-zinc-800/80 gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400 uppercase tracking-wider" htmlFor="config-section-select">
              Archivo:
            </label>
            <select
              id="config-section-select"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value as ConfigSectionKey)}
              className="bg-zinc-900 border border-zinc-700/80 text-zinc-200 text-xs px-2.5 py-1.5 rounded-sm focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              {CONFIG_FILES.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 size={14} /> Guardado con éxito
              </span>
            )}
            {parseError && (
              <span className="flex items-center gap-1 text-xs text-rose-400 truncate max-w-xs" title={parseError}>
                <AlertCircle size={14} /> Error de Sintaxis
              </span>
            )}
            <button
              type="button"
              onClick={loadCurrentSection}
              className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors cursor-pointer"
              title="Recargar archivo"
            >
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={Boolean(parseError)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-sm text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            >
              <Save size={13} /> Guardar Cambios
            </button>
          </div>
        </div>

        {/* Code Editor Area */}
        <div className="flex-1 p-4 bg-zinc-950/90 relative overflow-hidden flex flex-col">
          <textarea
            value={jsonText}
            onChange={handleTextChange}
            spellCheck={false}
            className="w-full flex-1 bg-zinc-900/50 border border-zinc-800 rounded-md p-4 text-xs font-mono text-zinc-200 resize-none focus:outline-none focus:border-zinc-700 custom-scrollbar leading-relaxed"
          />
          {parseError && (
            <div className="mt-2 p-2.5 bg-rose-950/40 border border-rose-900/60 rounded text-rose-300 text-xs">
              <span className="font-semibold">Error:</span> {parseError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-zinc-900/80 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
          <span>Ruta: config/{CONFIG_FILES.find((f) => f.key === selectedKey)?.filename}</span>
          <span>Sincronización IPC atómica sin recarga de aplicación</span>
        </div>
      </div>
    </div>
  );
};
