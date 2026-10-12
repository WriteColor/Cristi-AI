import { electronBridge } from '../../services/desktop/ElectronBridge';
import { toastService } from '../../infrastructure/notifications/toastService';
import React, { useState, useEffect } from 'react';
import {
  Key,
  Cpu,
  Sliders,
  RotateCcw,
  ExternalLink,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle2,
  FileCode,
  Folder,
  FolderCheck,
  Plus,
  Trash2,
  Monitor,
  Download,
  FileText,
  Image,
  Film,
  Music
} from 'lucide-react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { AllowedFoldersConfig } from '@/types';
import { GEMINI_MODELS_LIST, SYSTEM_PERSONA_PROMPT } from '../../config/models.js';
import { soundFxService } from '../../domain/audio/SoundFxService.js';

const SYSTEM_FOLDERS: Array<{
  key: keyof AllowedFoldersConfig;
  name: string;
  sublabel: string;
  icon: React.ElementType;
}> = [
  { key: 'desktop', name: 'Escritorio', sublabel: 'Desktop', icon: Monitor },
  { key: 'downloads', name: 'Descargas', sublabel: 'Downloads', icon: Download },
  { key: 'documents', name: 'Documentos', sublabel: 'Documents', icon: FileText },
  { key: 'pictures', name: 'Imágenes', sublabel: 'Pictures', icon: Image },
  { key: 'videos', name: 'Vídeos', sublabel: 'Videos', icon: Film },
  { key: 'music', name: 'Música', sublabel: 'Music', icon: Music },
];

export const GeneralTab: React.FC = () => {
  const hasCredential = useSettingsStore(s => s.config.hasGeminiCredential);
  const apiKey = useSettingsStore((s) => s.apiKey);
  const showApiKey = useSettingsStore((s) => s.showApiKey);
  const modelId = useSettingsStore((s) => s.modelId);
  const temperature = useSettingsStore((s) => s.temperature);
  const systemPrompt = useSettingsStore((s) => s.systemPrompt);
  const workspacePath = useSettingsStore((s) => s.config.workspacePath);
  const setField = useSettingsStore((s) => s.setField);

  // Allowed folders state and actions
  const allowedFolders = useSettingsStore(s => s.config.allowedFolders || s.allowedFolders);
  const customAllowedPaths = useSettingsStore(s => s.config.customAllowedPaths || s.customAllowedPaths || []);
  const setAllowedFolder = useSettingsStore(s => s.setAllowedFolder);
  const addCustomAllowedPath = useSettingsStore(s => s.addCustomAllowedPath);
  const removeCustomAllowedPath = useSettingsStore(s => s.removeCustomAllowedPath);

  const [systemFoldersPaths, setSystemFoldersPaths] = useState<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;
    if (electronBridge && typeof electronBridge.getSystemFolders === 'function') {
      electronBridge.getSystemFolders()
        .then((folders: Record<string, string>) => {
          if (isMounted && folders) {
            setSystemFoldersPaths(folders);
          }
        })
        .catch((err: unknown) => {
          console.warn('[GeneralTab] Error obteniendo carpetas del sistema:', err);
        });
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectWorkspace = async () => {
    soundFxService.playClick();
    try {
      const res = await electronBridge.approveWorkspace();
      if (res?.success && res.path) {
        useSettingsStore.getState().updateConfig({ workspacePath: res.path });
        toastService.info('Workspace autorizado para esta sesión.', res.path);
      }
    } catch (error) {
      toastService.error(String(error));
    }
  };

  const handleAddCustomAllowedPath = async () => {
    soundFxService.playClick();
    try {
      const res = await electronBridge.approveWorkspace();
      if (res?.success && res.path) {
        addCustomAllowedPath(res.path);
        toastService.info('Ruta autorizada agregada', res.path);
      }
    } catch (error) {
      toastService.error(String(error));
    }
  };

  const handleRemoveCustomAllowedPath = (pathToRemove: string) => {
    soundFxService.playClick();
    removeCustomAllowedPath(pathToRemove);
    toastService.info('Ruta removida', pathToRemove);
  };

  const isDefaultPrompt = systemPrompt.trim() === SYSTEM_PERSONA_PROMPT.trim();

  return (
    <div className="flex-1 overflow-y-auto space-y-5 pr-1 flex flex-col">
      {/* Encabezado */}
      <div>
        <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-100">
          Cerebro & Modelo de Inteligencia Artificial
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Conexión directa con Google Gemini Multimodal Live API en tiempo real y prompt maestro unificado.
        </p>
      </div>

      {/* Carpetas del Sistema & Workspace Autorizados */}
      <div className="flex flex-col gap-4 border border-zinc-800 bg-zinc-900/40 p-4 rounded-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderCheck size={15} className="text-emerald-400" />
            <h3 className="text-xs font-mono font-semibold text-zinc-100 uppercase tracking-wide">
              Carpetas del Sistema & Workspace Autorizados
            </h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/40">
            Control de Acceso al Sistema de Archivos
          </span>
        </div>

        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Define las carpetas y unidades donde Cristi tiene permiso de lectura, creación y manipulación de archivos. Puedes permitir o bloquear el acceso a las ubicaciones estándar del sistema y registrar rutas adicionales.
        </p>

        {/* Workspace Principal */}
        <div className="border border-zinc-800/80 bg-zinc-950/50 p-3 rounded-sm flex flex-col gap-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Folder size={14} className="text-cyan-400" />
              <span className="text-xs font-mono font-medium text-zinc-200 uppercase tracking-wide">
                Workspace Principal del Proyecto
              </span>
            </div>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-zinc-200 rounded transition-colors cursor-pointer"
              onClick={handleSelectWorkspace}
            >
              <Folder size={13} />
              <span>Seleccionar carpeta para herramientas</span>
            </button>
          </div>
          <p className="text-[11px] text-zinc-400">
            Cristi podrá leer y escribir archivos dentro de esta carpeta de trabajo principal durante la sesión actual.
          </p>
          <div className="p-2 bg-zinc-900/90 border border-zinc-800 rounded font-mono text-[10px] break-all flex items-center justify-between">
            <div className="min-w-0 flex-1 mr-2">
              <span className="text-zinc-500 font-bold uppercase mr-2">Ruta actual:</span>
              <span className={workspacePath ? 'text-emerald-400' : 'text-zinc-600'}>
                {workspacePath || 'Ninguna carpeta seleccionada'}
              </span>
            </div>
            {workspacePath && (
              <span className="shrink-0 text-[9px] font-mono text-emerald-400/80 bg-emerald-950/40 border border-emerald-900/40 px-1.5 py-0.5 rounded">
                ACTIVO
              </span>
            )}
          </div>
        </div>

        {/* Ubicaciones Estándar del Sistema */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-zinc-300 font-semibold uppercase tracking-wider">
              Ubicaciones Estándar del Sistema Operativo
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              Acceso directo por rutas absolutas o alias relativos
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SYSTEM_FOLDERS.map((item) => {
              const isEnabled = allowedFolders?.[item.key] ?? true;
              const resolvedPath = systemFoldersPaths[item.key] || '';
              const ItemIcon = item.icon;

              return (
                <div
                  key={item.key}
                  className="flex flex-col justify-between p-3 rounded bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-all gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1.5 rounded ${isEnabled ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40' : 'bg-zinc-800/60 text-zinc-500 border border-zinc-800'}`}>
                        <ItemIcon size={14} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-zinc-200 block truncate">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono block">
                          {item.sublabel}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        soundFxService.playClick();
                        setAllowedFolder(item.key, !isEnabled);
                      }}
                      className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                        isEnabled
                          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 hover:bg-emerald-900/60'
                          : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:bg-zinc-800/80 hover:text-zinc-400'
                      }`}
                      title={isEnabled ? `Bloquear acceso a ${item.name}` : `Permitir acceso a ${item.name}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-zinc-600'}`} />
                      {isEnabled ? 'Permitido' : 'Bloqueado'}
                    </button>
                  </div>
                  <div
                    className="p-1.5 bg-zinc-900/90 border border-zinc-800/80 rounded font-mono text-[10px] text-zinc-400 truncate"
                    title={resolvedPath || 'Ruta del sistema no detectada'}
                  >
                    {resolvedPath || <span className="text-zinc-600 italic">Detectando ruta del sistema...</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rutas Adicionales Personalizadas */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-zinc-800/60">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-[11px] font-mono text-zinc-300 font-semibold uppercase tracking-wider block">
                Rutas Adicionales Personalizadas
              </span>
              <span className="text-[10px] text-zinc-500">
                Directorios persistentes autorizados en cualquier unidad de disco.
              </span>
            </div>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-zinc-200 rounded transition-colors cursor-pointer"
              onClick={handleAddCustomAllowedPath}
            >
              <Plus size={13} className="text-emerald-400" />
              <span>Añadir carpeta personalizada</span>
            </button>
          </div>

          {customAllowedPaths && customAllowedPaths.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {customAllowedPaths.map((cPath) => (
                <div
                  key={cPath}
                  className="flex items-center justify-between p-2 rounded bg-zinc-950/70 border border-zinc-800/80 gap-2 hover:border-zinc-700/80 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderCheck size={14} className="text-emerald-400 shrink-0" />
                    <span
                      className="font-mono text-[10px] text-zinc-300 truncate"
                      title={cPath}
                    >
                      {cPath}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomAllowedPath(cPath)}
                    className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors shrink-0 cursor-pointer"
                    title={`Eliminar ${cPath}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 text-center border border-dashed border-zinc-800/80 rounded bg-zinc-950/30 text-zinc-500 text-[11px] font-mono">
              No hay rutas adicionales autorizadas. Haz clic en "Añadir carpeta personalizada" para autorizar carpetas fuera de las ubicaciones estándar.
            </div>
          )}
        </div>
      </div>

      {/* Controles Principales en 3 Columnas Horizontales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* API Key */}
        <div className="space-y-1.5 border border-zinc-800 bg-zinc-900/40 p-3.5 rounded-sm">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono font-medium text-zinc-200 flex items-center gap-1.5">
              <Key size={13} className="text-zinc-400" />
              Clave API de Gemini
            </label>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 underline flex items-center gap-1"
            >
              Obtener clave <ExternalLink size={10} />
            </a>
          </div>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setField('apiKey', e.target.value)}
              placeholder={hasCredential ? 'Credencial guardada. Pega otra para reemplazarla.' : 'Pega aquí tu API Key y guarda...'}
              className="w-full px-3 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-700 text-zinc-200 rounded-sm focus:outline-none focus:border-zinc-500"
            />
            <button
              type="button"
              onClick={() => setField('showApiKey', !showApiKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              title={showApiKey ? 'Ocultar clave' : 'Mostrar clave'}
            >
              {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>

        {/* Modelo de IA */}
        <div className="space-y-1.5 border border-zinc-800 bg-zinc-900/40 p-3.5 rounded-sm">
          <label className="text-xs font-mono font-medium text-zinc-200 flex items-center gap-1.5">
            <Cpu size={13} className="text-zinc-400" />
            Modelo Activo de Gemini Live
          </label>
          <select
            value={modelId}
            onChange={(e) => setField('modelId', e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-700 text-zinc-200 rounded-sm focus:outline-none focus:border-zinc-500"
          >
            {GEMINI_MODELS_LIST.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.displayName || m.name} ({m.id})
              </option>
            ))}
          </select>
        </div>

        {/* Temperatura */}
        <div className="space-y-2 border border-zinc-800 bg-zinc-900/40 p-3.5 rounded-sm">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-200 flex items-center gap-1.5">
              <Sliders size={13} className="text-zinc-400" />
              Temperatura: {temperature}
            </span>
            <span className="text-zinc-400 text-[11px]">
              {temperature < 0.4 ? 'Analítico' : temperature > 0.8 ? 'Afectuoso' : 'Equilibrado'}
            </span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1.2"
            step="0.05"
            value={temperature}
            onChange={(e) => setField('temperature', parseFloat(e.target.value))}
            className="w-full accent-zinc-200 cursor-pointer"
          />
        </div>
      </div>

      {/* Visión y GPU */}
      <div className="flex flex-col gap-3 border border-zinc-800 bg-zinc-900/40 p-4 rounded-sm">
        <h3 className="text-xs font-mono font-semibold text-zinc-100 uppercase tracking-wide flex items-center gap-2">
          <Eye size={14} className="text-emerald-400" />
          Configuración de Visión y GPU
        </h3>
        <p className="text-[11px] text-zinc-400">
          Activa o desactiva modelos locales de visión para ahorrar GPU. La cámara se apagará tras 5 minutos de inactividad.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-xs font-mono text-zinc-300">
            <input
              type="checkbox"
              checked={useSettingsStore(s => s.visionFaceDetection)}
              onChange={(e) => setField('visionFaceDetection', e.target.checked)}
              className="accent-emerald-500"
            />
            Detección de Rostro (Bajo)
          </label>
          <label className="flex items-center gap-2 text-xs font-mono text-zinc-300">
            <input
              type="checkbox"
              checked={useSettingsStore(s => s.visionExpressions)}
              onChange={(e) => setField('visionExpressions', e.target.checked)}
              className="accent-emerald-500"
            />
            Expresiones (Medio)
          </label>
          <label className="flex items-center gap-2 text-xs font-mono text-zinc-300">
            <input
              type="checkbox"
              checked={useSettingsStore(s => s.visionObjectDetection)}
              onChange={(e) => setField('visionObjectDetection', e.target.checked)}
              className="accent-emerald-500"
            />
            Reconocimiento Objetos (Alto)
          </label>
        </div>
      </div>

      {/* Único Prompt Maestro del Sistema (Totalmente Customizable y Persistente) */}
      <div className="flex flex-col flex-1 min-h-[260px] gap-2.5 border border-zinc-800 bg-zinc-900/40 p-4 rounded-sm">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileCode size={14} className="text-rose-400" />
            <label className="text-xs font-mono font-semibold text-zinc-100 uppercase tracking-wide">
              Prompt Maestro del Sistema (Directiva Única)
            </label>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 ${
              isDefaultPrompt
                ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
            }`}>
              {isDefaultPrompt ? <Sparkles size={10} /> : <CheckCircle2 size={10} />}
              {isDefaultPrompt ? 'Cadencia Auditada (Predeterminado)' : 'Personalizado'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-zinc-500">
              {systemPrompt.length} caracteres
            </span>
            <button
              type="button"
              onClick={() => {
                soundFxService.playClick();
                setField('systemPrompt', SYSTEM_PERSONA_PROMPT);
                toastService.info('Prompt Maestro', 'Restaurado al prompt oficial predeterminado.');
              }}
              className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 hover:border-zinc-600 bg-zinc-950 px-2.5 py-1 rounded transition-colors cursor-pointer"
              title="Restaurar prompt maestro oficial predeterminado"
            >
              <RotateCcw size={11} />
              <span>Restablecer Maestro</span>
            </button>
          </div>
        </div>

        <p className="text-[11px] text-zinc-400 shrink-0 leading-relaxed">
          Este es el único prompt maestro que gobierna a Cristi en todas las llamadas y modelos. Define su tono sensual y cariñoso, cadencia continua, herramientas y normas. Cualquier cambio que realices aquí se guarda automáticamente y persiste entre reinicios.
        </p>

        <div className="flex flex-col flex-1 min-h-[160px]">
          <textarea
            value={systemPrompt}
            onChange={(e) => setField('systemPrompt', e.target.value)}
            spellCheck={false}
            className="flex-1 min-h-[160px] w-full p-3 text-xs font-mono bg-zinc-950/90 border border-zinc-700 text-zinc-200 rounded-sm focus:outline-none focus:border-rose-500/70 leading-relaxed resize-none shadow-inner"
            placeholder="Escribe aquí las directivas del Prompt Maestro de Cristi..."
          />
        </div>
      </div>
    </div>
  );
};

export default GeneralTab;
