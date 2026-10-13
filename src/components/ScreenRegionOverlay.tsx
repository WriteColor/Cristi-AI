import React from 'react';
import { Eye, Scan, Monitor, AppWindow } from 'lucide-react';
import { useVisionStore } from '../stores/useVisionStore.js';
import { ScreenRegion } from '@/types';

export interface ScreenRegionOverlayProps {
  region?: ScreenRegion | null;
  isWatchActive?: boolean;
}

/**
 * Cristi AI - ScreenRegionOverlay Component
 * Obsidian / Shadcn Dark Zinc Minimalist Tactical Overlay
 * Delimita con precisión el área visual observada por Cristi (Pantalla Completa, Región o Ventana).
 */
export const ScreenRegionOverlay: React.FC<ScreenRegionOverlayProps> = React.memo(function ScreenRegionOverlay(props = {}) {
  const storeRegion = useVisionStore((s) => s.screenRegion);
  const storeWatch = useVisionStore((s) => s.isScreenWatchActive);
  const captureMode = useVisionStore((s) => s.captureMode);
  const targetDisplayId = useVisionStore((s) => s.targetDisplayId);
  const targetWindowTitle = useVisionStore((s) => s.targetWindowTitle);

  const region = props.region !== undefined ? props.region : storeRegion;
  const isWatchActive = props.isWatchActive !== undefined ? props.isWatchActive : storeWatch;

  if (!isWatchActive) return null;

  // 1. Modo Ventana Específica
  if (captureMode === 'window' && targetWindowTitle) {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9998] pointer-events-none animate-in fade-in slide-in-from-top-1 duration-200">
        <span className="flex items-center gap-2 bg-zinc-950/95 text-zinc-300 border border-cyan-800/60 px-3 py-1 rounded-sm shadow-2xl backdrop-blur-md text-[11px] font-mono tracking-wide">
          <AppWindow size={12} className="text-cyan-400" />
          <span className="text-zinc-400">OBJETIVO:</span>
          <span className="text-zinc-100 font-medium truncate max-w-xs">{targetWindowTitle}</span>
          <span className="text-[10px] text-cyan-400/80 bg-cyan-950/40 px-1.5 py-0.2 rounded border border-cyan-900/50">0.5 FPS</span>
        </span>
      </div>
    );
  }

  // 2. Modo Región Interactiva
  if (region && captureMode === 'region') {
    const xPct = region.x_pct ?? (region.x != null && typeof window !== 'undefined' ? (region.x / window.innerWidth) * 100 : 0);
    const yPct = region.y_pct ?? (region.y != null && typeof window !== 'undefined' ? (region.y / window.innerHeight) * 100 : 0);
    const wPct = region.w_pct ?? (region.width != null && typeof window !== 'undefined' ? (region.width / window.innerWidth) * 100 : 100);
    const hPct = region.h_pct ?? (region.height != null && typeof window !== 'undefined' ? (region.height / window.innerHeight) * 100 : 100);

    const style: React.CSSProperties = {
      left: `${xPct}%`,
      top: `${yPct}%`,
      width: `${wPct}%`,
      height: `${hPct}%`,
    };

    return (
      <div className="fixed z-[9998] pointer-events-none border border-cyan-500/80 bg-cyan-500/5 shadow-2xl backdrop-contrast-105" style={style}>
        {/* Retícula Táctica de Esquinas */}
        <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-cyan-400" />
        <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-cyan-400" />
        <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-cyan-400" />
        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-cyan-400" />
        
        {/* Borde sutil central tipo visor HUD */}
        <div className="absolute inset-x-1/2 top-0 -translate-x-1/2 w-4 h-[1px] bg-cyan-400/60" />
        <div className="absolute inset-y-1/2 left-0 -translate-y-1/2 h-4 w-[1px] bg-cyan-400/60" />

        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-zinc-950/95 text-cyan-300 border border-cyan-900/60 px-2 py-0.5 rounded-sm shadow-xl backdrop-blur-md text-[10px] font-mono tracking-wider whitespace-nowrap">
          <Scan size={10} className="text-cyan-400" />
          <span>REGIÓN: {Math.round(wPct)}% × {Math.round(hPct)}% (0.5 FPS)</span>
        </span>
      </div>
    );
  }

  // 3. Modo Pantalla Completa
  if (captureMode === 'fullscreen') {
    const displayLabel = targetDisplayId === 'secondary' ? 'Pantalla 2' : 'Pantalla 1';
    return (
      <div className="fixed inset-0 z-[9998] pointer-events-none border border-zinc-800/50">
        <span className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-950/95 text-zinc-300 border border-zinc-800 px-2.5 py-1 rounded-sm shadow-xl backdrop-blur-md text-[11px] font-mono tracking-wide">
          <Monitor size={12} className="text-emerald-400" />
          <span>VISIÓN: {displayLabel.toUpperCase()} (0.5 FPS)</span>
        </span>
      </div>
    );
  }

  return null;
});

export default ScreenRegionOverlay;
