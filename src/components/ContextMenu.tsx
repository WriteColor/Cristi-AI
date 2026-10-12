/**
 * Cristi AI - Minimalist Obsidian Context Menu (v3)
 * Completely rewritten from scratch:
 * - 100% Tailwind CSS & Shadcn Dark Zinc Minimalist Aesthetic
 * - Zero overflow clipping for tactical dropdowns
 * - Rock-solid click-through management (never locks passthrough on close)
 * - Exclusively 4 verified female voices
 * - Clean accordions for AI Model/Voice and tactical tools
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  X, Pin, Zap, Monitor, Volume2,
  ChevronDown, ChevronRight, Check, Sliders, Image as ImageIcon, Activity,
  FolderPlus, Settings, LogOut, LucideIcon, Eye, EyeOff, RefreshCw
} from 'lucide-react';
import { GEMINI_MODELS_LIST, DEFAULT_MODEL_ID } from '../config/models.js';
import { GEMINI_STANDARD_VOICES } from '../config/voices.js';
import { useClickThrough } from '../hooks/useClickThrough.js';
import { electronBridge } from '../services/desktop/ElectronBridge.js';
import { soundFxService } from '../domain/audio/SoundFxService.js';
import { useCompanionStore } from '../stores/useCompanionStore.js';
import { useVisionStore } from '../stores/useVisionStore.js';
import { useSettingsStore } from '../stores/useSettingsStore.js';

export interface ContextMenuDropdownOption {
  value: string;
  label: string;
}

interface TacticalDropdownLocalProps {
  options: ContextMenuDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: LucideIcon;
}

// ── Dropdown Táctico Shadcn con Menú Flotante Seguro ───────────────────────────
function TacticalDropdownLocal({
  options = [],
  value,
  onChange,
  placeholder = 'Seleccionar...',
  icon: Icon
}: TacticalDropdownLocalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      window.addEventListener('pointerdown', handleClickOutside);
    }
    return () => window.removeEventListener('pointerdown', handleClickOutside);
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          electronBridge.setIgnoreMouseEvents(false);
          soundFxService.playClick();
          setIsOpen(!isOpen);
        }}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 rounded-sm transition-colors text-left font-mono"
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          {Icon && <Icon size={13} className="text-zinc-400 shrink-0" />}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </div>
        <ChevronDown size={12} className={`text-zinc-400 transition-transform shrink-0 ml-1.5 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-100 max-h-48 overflow-y-auto bg-zinc-950 border border-zinc-700 rounded-sm shadow-2xl py-1 divide-y divide-zinc-800/40">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                electronBridge.setIgnoreMouseEvents(false);
                soundFxService.playClick();
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left transition-colors font-mono ${opt.value === value
                ? 'bg-zinc-800 text-white font-medium'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
            >
              <span className="truncate">{opt.label}</span>
              {opt.value === value && <Check size={12} className="text-zinc-200 shrink-0 ml-1.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface ContextMenuPosition {
  x?: number;
  y?: number;
  isOpen?: boolean;
}

export interface ContextMenuProps {
  isOpen?: boolean;
  position?: ContextMenuPosition;
  posX?: number;
  posY?: number;
  onClose?: () => void;
  isAlwaysOnTop?: boolean;
  onToggleAlwaysOnTop?: () => void;
  onOpenSettings?: () => void;
  onOpenRegionPicker?: () => void;
  onOpenVoiceEnrollment?: () => void;
  onTogglePerformanceHUD?: () => void;
  onSwitchAiModel?: (id: string) => void;
  onSwitchVoice?: (voice: string) => void;
  activeAiModelId?: string;
  activeVoiceName?: string;
  onToggleCamera?: () => void;
  isCameraActive?: boolean;
  onToggleBackdrop?: () => void;
  isSolidBackdrop?: boolean;
  onTriggerRandomGesture?: () => void;
  viewMode?: string;
  onToggleViewMode?: () => void;
  isZenMode?: boolean;
  onToggleZenMode?: () => void;
  onMinimizeToTray?: () => void;
  showWidgets?: boolean;
  onToggleWidgets?: () => void;
  isClickThroughEnabled?: boolean;
  onToggleClickThrough?: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
  isLive2dVisible?: boolean;
  live2dModelId?: 'yanderegirl' | 'jane_doe';
  onToggleLive2d?: () => void;
  onToggleLive2dModel?: () => void;
}

// ── Componente Principal ContextMenu ─────────────────────────────────────────
export const ContextMenu: React.FC<ContextMenuProps> = React.memo(function ContextMenu(props = {}) {
  const storeContextMenu = useCompanionStore((s) => s.contextMenu);
  const closeContextMenu = useCompanionStore((s) => s.closeContextMenu);
  const storeAlwaysOnTop = useCompanionStore((s) => s.isAlwaysOnTop || (s as unknown as { alwaysOnTop?: boolean }).alwaysOnTop);
  const toggleAlwaysOnTop = useCompanionStore((s) => s.toggleAlwaysOnTop);
  const storeAiModelId = useSettingsStore((s) => s.config?.modelId || DEFAULT_MODEL_ID);
  const storeVoiceName = useSettingsStore((s) => s.config?.voiceName || 'Aoede');
  const switchAiModel = useSettingsStore((s) => s.switchAiModel);
  const switchVoice = useSettingsStore((s) => s.switchVoice);
  const openSettings = useSettingsStore((s) => s.handleOpenSettings);
  const openRegionPicker = useVisionStore((s) => s.openRegionPicker);

  const isOpen = props.isOpen !== undefined ? props.isOpen : storeContextMenu.isOpen;
  const position = props.position !== undefined ? props.position : storeContextMenu;
  const posX = props.posX;
  const posY = props.posY;
  const onClose = props.onClose || closeContextMenu;
  const isAlwaysOnTop = props.isAlwaysOnTop !== undefined ? props.isAlwaysOnTop : storeAlwaysOnTop;
  const onToggleAlwaysOnTop = props.onToggleAlwaysOnTop || toggleAlwaysOnTop;
  const onOpenSettings = props.onOpenSettings || openSettings;
  const onOpenRegionPicker = props.onOpenRegionPicker || openRegionPicker;
  const onTogglePerformanceHUD = props.onTogglePerformanceHUD || (() => { void electronBridge.openTelemetryWindow(); });
  const onSwitchAiModel = props.onSwitchAiModel || switchAiModel;
  const onSwitchVoice = props.onSwitchVoice || switchVoice;
  const activeAiModelId = props.activeAiModelId || storeAiModelId;
  const activeVoiceName = props.activeVoiceName || storeVoiceName;
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<'ai' | 'tools' | null>(null);

  // Resetear estado interno cada vez que el menú se abre de nuevo
  useEffect(() => {
    if (isOpen) {
      setActiveSection(null);
      electronBridge.setIgnoreMouseEvents(false);
    }
  }, [isOpen]);

  const { interactiveProps } = useClickThrough();

  // Posicionamiento inteligente
  const leftPos = position?.x ?? posX ?? 300;
  const topPos = position?.y ?? posY ?? 200;

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const menuEl = menuRef.current;
    const rect = menuEl.getBoundingClientRect();
    const margin = 16;

    let targetLeft = leftPos;
    let targetTop = topPos;

    if (targetLeft + rect.width > window.innerWidth - margin) {
      targetLeft = window.innerWidth - rect.width - margin;
    }
    if (targetLeft < margin) targetLeft = margin;

    if (targetTop + rect.height > window.innerHeight - margin) {
      targetTop = window.innerHeight - rect.height - margin;
    }
    if (targetTop < margin) targetTop = margin;

    menuEl.style.left = `${Math.round(targetLeft)}px`;
    menuEl.style.top = `${Math.round(targetTop)}px`;
  }, [isOpen, leftPos, topPos, activeSection]);

  // Cierre inteligente por clic fuera y tecla Escape
  useEffect(() => {
    if (!isOpen) return;

    let isSubscribed = true;
    let removeClickFn: (() => void) | null = null;

    const timer = setTimeout(() => {
      if (!isSubscribed) return;
      const handleOutsideClick = (e: PointerEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          onClose?.();
        }
      };
      window.addEventListener('pointerdown', handleOutsideClick);
      removeClickFn = () => window.removeEventListener('pointerdown', handleOutsideClick);
    }, 120);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        soundFxService.playClick();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
      removeClickFn?.();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const aiModelOptions: ContextMenuDropdownOption[] = GEMINI_MODELS_LIST.map((m: { id: string; name: string }) => ({
    value: m.id,
    label: m.name
  }));

  // Exclusivamente las 4 voces femeninas verificadas
  const voiceOptions: ContextMenuDropdownOption[] = GEMINI_STANDARD_VOICES
    .filter((v: { gender: string }) => v.gender === 'Femenina')
    .map((v: { name: string }) => ({ value: v.name, label: v.name }));

  const toggleSection = (sectionName: 'ai' | 'tools') => {
    soundFxService.playClick();
    setActiveSection((prev) => (prev === sectionName ? null : sectionName));
  };

  const handleCloseApp = () => {
    soundFxService.playClick();
    if (typeof (electronBridge as any)?.quitApp === 'function') {
      (electronBridge as any).quitApp();
    } else if (typeof (electronBridge as any)?.closeApp === 'function') {
      (electronBridge as any).closeApp();
    } else {
      window.close();
    }
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-99999 w-64 bg-zinc-950/98 border border-zinc-800 text-zinc-300 font-sans shadow-2xl rounded-sm backdrop-blur-md select-none pointer-events-auto"
      style={{ left: leftPos, top: topPos }}
      {...interactiveProps}
      onPointerDown={(e) => {
        electronBridge.setIgnoreMouseEvents(false);
        e.stopPropagation();
      }}
      onClick={(e) => {
        electronBridge.setIgnoreMouseEvents(false);
        e.stopPropagation();
      }}
    >
      {/* ── Encabezado Minimalista Shadcn ───────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-zinc-400" />
          <span className="text-xs font-semibold tracking-wide text-zinc-100 font-mono">Cristi AI</span>
        </div>
        <button
          type="button"
          onClick={() => {
            soundFxService.playClick();
            onClose?.();
          }}
          className="p-0.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-sm transition-colors"
          title="Cerrar menú"
        >
          <X size={13} />
        </button>
      </div>

      <div className="p-1.5 space-y-1">
        {/* ── 3. CATEGORÍA: MODELO IA & VOZ ────────────────────────────── */}
        <div className="border border-zinc-800/80 rounded-sm bg-zinc-900/30">
          <button
            type="button"
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/50 transition-colors font-mono rounded-sm"
            onClick={() => toggleSection('ai')}
          >
            <div className="flex items-center gap-2">
              <Zap size={13} className="text-zinc-400" />
              <span>Modelo &amp; Voz</span>
            </div>
            {activeSection === 'ai' ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          {activeSection === 'ai' && (
            <div className="p-2 pt-1 border-t border-zinc-800/60 bg-zinc-950/50 space-y-2">
              <TacticalDropdownLocal
                options={aiModelOptions}
                value={activeAiModelId}
                onChange={(val) => onSwitchAiModel?.(val)}
                placeholder="Elegir modelo IA..."
                icon={Zap}
              />

              <TacticalDropdownLocal
                options={voiceOptions}
                value={activeVoiceName}
                onChange={(val) => onSwitchVoice?.(val)}
                placeholder="Elegir voz..."
                icon={Volume2}
              />
            </div>
          )}
        </div>

        {/* ── 4. CATEGORÍA: HERRAMIENTAS TÁCTICAS ───────────────────────── */}
        <div className="border border-zinc-800/80 rounded-sm bg-zinc-900/30">
          <button
            type="button"
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/50 transition-colors font-mono rounded-sm"
            onClick={() => toggleSection('tools')}
          >
            <div className="flex items-center gap-2">
              <Sliders size={13} className="text-zinc-400" />
              <span>Herramientas Tácticas</span>
            </div>
            {activeSection === 'tools' ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          {activeSection === 'tools' && (
            <div className="p-1.5 border-t border-zinc-800/60 bg-zinc-950/50 space-y-0.5">
              <button
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/80 rounded-sm transition-colors text-left font-mono"
                onClick={() => {
                  soundFxService.playClick();
                  onOpenRegionPicker?.();
                  onClose?.();
                }}
              >
                <Monitor size={12} className="text-zinc-400 shrink-0" />
                <span>Capturar Región de Pantalla</span>
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/80 rounded-sm transition-colors text-left font-mono"
                onClick={() => { soundFxService.playClick(); props.onToggleLive2d?.(); }}
              >
                {props.isLive2dVisible !== false ? <EyeOff size={12} className="text-zinc-400 shrink-0" /> : <Eye size={12} className="text-zinc-400 shrink-0" />}
                <span>{props.isLive2dVisible !== false ? 'Ocultar y apagar Live2D' : 'Mostrar Live2D'}</span>
              </button>
              {props.isLive2dVisible !== false && <button
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/80 rounded-sm transition-colors text-left font-mono"
                onClick={() => { soundFxService.playClick(); props.onToggleLive2dModel?.(); }}
              >
                <RefreshCw size={12} className="text-zinc-400 shrink-0" />
                <span>Cambiar a {props.live2dModelId === 'jane_doe' ? 'YandereGirl' : 'Jane Doe'}</span>
              </button>}

              <button
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/80 rounded-sm transition-colors text-left font-mono"
                onClick={() => {
                  soundFxService.playClick();
                  onTogglePerformanceHUD?.();
                  onClose?.();
                }}
              >
                <Activity size={12} className="text-zinc-400 shrink-0" />
                <span>Telemetría &amp; FPS (F3)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 5. PIE DE ACCIONES MINIMALISTA ─────────────────────────────── */}
      <div className="grid grid-cols-3 border-t border-zinc-800 bg-zinc-900/60 p-1 gap-1">
        <button
          type="button"
          className="flex items-center justify-center gap-1.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-sm transition-colors font-mono"
          onClick={() => {
            soundFxService.playClick();
            onToggleAlwaysOnTop?.();
          }}
          title="Fijar siempre visible"
        >
          <Pin size={11} className={isAlwaysOnTop ? 'text-zinc-100' : 'text-zinc-500'} />
          <span>{isAlwaysOnTop ? 'Fijado' : 'Libre'}</span>
        </button>

        <button
          type="button"
          className="flex items-center justify-center gap-1.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-sm transition-colors font-mono"
          onClick={() => {
            soundFxService.playClick();
            onOpenSettings?.();
            onClose?.();
          }}
          title="Abrir ventana de ajustes"
        >
          <Settings size={11} />
          <span>Ajustes</span>
        </button>

        <button
          type="button"
          className="flex items-center justify-center gap-1.5 py-1.5 text-xs text-zinc-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-sm transition-colors font-mono"
          onClick={handleCloseApp}
          title="Salir de Cristi AI"
        >
          <LogOut size={11} />
          <span>Salir</span>
        </button>
      </div>
    </div>
  );
});

export default ContextMenu;
