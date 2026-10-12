import React, { useEffect, useState, lazy, Suspense } from 'react';
import {
  Zap, Volume2, Music,
  Database, Layers, Save, X, FileCode
} from 'lucide-react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { soundFxService } from '../domain/audio/SoundFxService.js';
import { electronBridge } from '../services/desktop/ElectronBridge.js';
import { RawJsonConfigModal } from './components/RawJsonConfigModal';

const GeneralTab = lazy(() => import('./tabs/GeneralTab').then(module => ({ default: module.GeneralTab })));
const VoiceTab = lazy(() => import('./tabs/VoiceTab').then(module => ({ default: module.VoiceTab })));
const WindowsMediaTab = lazy(() => import('./tabs/WindowsMediaTab').then(m => ({ default: m.WindowsMediaTab })));
const MemoryTab = lazy(() => import('./tabs/MemoryTab').then(module => ({ default: module.MemoryTab })));
const McpTab = lazy(() => import('./tabs/McpTab').then(module => ({ default: module.McpTab })));

export interface SettingsAppProps {
  isModal?: boolean;
  onClose?: (() => void) | null;
}

const TABS = [
  { id: 'general', label: 'General & IA', icon: Zap },
  { id: 'voice', label: 'Voz & Audio', icon: Volume2 },
  { id: 'media', label: 'Windows & Spotify', icon: Music },
  { id: 'memory', label: 'Memoria Contextual', icon: Database },
  { id: 'mcp', label: 'Servidores MCP', icon: Layers }
];

export const SettingsApp: React.FC<SettingsAppProps> = ({ isModal = false, onClose = null }) => {
  const { activeTab, setActiveTab, saveStatus, saveSettings, loadConfig } = useSettingsStore();
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);

  useEffect(() => { void loadConfig().catch(error => console.error('No se pudo cargar la configuración:', error)); }, [loadConfig]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['c', 'C', 'm', 'M', 's', 'S', 'h', 'H', 'p', 'P', 'a', 'A'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation(); return;
      }
      if (e.key === 'F3') { e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === 'Escape') {
        soundFxService.playClick();
        if (typeof onClose === 'function') onClose();
        else if (electronBridge?.closeSettingsWindow) electronBridge.closeSettingsWindow();
        else window.close();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-200 font-sans select-none overflow-hidden border border-zinc-800">
      {/* ── Barra Superior Header ───────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 bg-zinc-300 rounded-none shrink-0" />
          <h1 className="text-xs font-semibold tracking-wider uppercase font-mono text-zinc-100">
            Cristi AI • Panel de Configuración
          </h1>
          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700/60 rounded-none">
            v1.0.0
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded-sm text-xs font-mono text-zinc-300">
            <div className={`w-2 h-2 rounded-full ${saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            <span>{saveStatus === 'saving' ? 'Sincronizando cambios...' : 'Sincronizado en tiempo real'}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              soundFxService.playClick();
              setIsJsonModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-cyan-400 rounded-sm border border-zinc-700/80 text-xs font-mono transition-colors cursor-pointer"
            title="Editar archivos JSON de configuración directamente"
          >
            <FileCode size={12} />
            <span>Editor JSON</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFxService.playClick();
              void saveSettings();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-sm border border-zinc-700 text-xs font-mono transition-colors"
            title="Guardar configuración manualmente"
          >
            <Save size={12} />
            <span>Guardar</span>
          </button>

          {isModal && (
            <button
              type="button"
              onClick={onClose || undefined}
              className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-sm transition-colors ml-1"
              title="Cerrar modal"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </header>

      {/* ── Distribución Principal: Sidebar + Contenido ──────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 bg-zinc-900/40 border-r border-zinc-800 p-2 space-y-1 shrink-0 overflow-y-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  soundFxService.playClick();
                  setActiveTab(tab.id);
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-mono text-left rounded-sm border transition-colors ${
                  isActive
                    ? 'bg-zinc-800 text-white border-zinc-700 font-medium'
                    : 'text-zinc-400 border-transparent hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-zinc-100' : 'text-zinc-400'} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </aside>

        <main className="flex-1 p-6 overflow-hidden flex flex-col bg-zinc-950">
          <Suspense fallback={<p className="text-sm text-zinc-400">Cargando ajustes…</p>}>
            {activeTab === 'general' && <GeneralTab />}
            {activeTab === 'voice' && <VoiceTab />}
            {activeTab === 'media' && <WindowsMediaTab />}
            {activeTab === 'memory' && <MemoryTab />}
            {activeTab === 'mcp' && <McpTab />}
          </Suspense>
        </main>
      </div>

      {/* ── Modal Editor JSON Maestro ────────────────────────────────────── */}
      <RawJsonConfigModal
        isOpen={isJsonModalOpen}
        onClose={() => setIsJsonModalOpen(false)}
      />
    </div>
  );
};

export default SettingsApp;
