import React from 'react';
import { Eye, Scan } from 'lucide-react';
import { useVisionStore } from '../stores/useVisionStore.js';
import { ScreenRegion } from '@/types';

export interface ScreenRegionOverlayProps {
  region?: ScreenRegion | null;
  isWatchActive?: boolean;
}

/**
 * Cristi AI - ScreenRegionOverlay Component
 * Minimalist Shadcn Dark Gray Style
 */
export const ScreenRegionOverlay: React.FC<ScreenRegionOverlayProps> = React.memo(function ScreenRegionOverlay(props = {}) {
  const storeRegion = useVisionStore((s) => s.screenRegion);
  const storeWatch = useVisionStore((s) => s.isScreenWatchActive);

  const region = props.region !== undefined ? props.region : storeRegion;
  const isWatchActive = props.isWatchActive !== undefined ? props.isWatchActive : storeWatch;

  if (!region && !isWatchActive) return null;

  // Pantalla completa vigilada
  if (!region) {
    return (
      <div className="fixed inset-0 z-[9998] pointer-events-none border border-zinc-700/40">
        <span className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-950/95 text-zinc-300 border border-zinc-800 px-3 py-1.5 rounded-sm shadow-xl backdrop-blur-md text-xs font-mono tracking-wide uppercase">
          <Eye size={13} className="text-zinc-400" />
          <span>Visión: Pantalla Completa</span>
        </span>
      </div>
    );
  }

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
    <div className="fixed z-[9998] pointer-events-none border border-zinc-400/80 bg-zinc-500/5 shadow-md" style={style}>
      <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-zinc-300" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-zinc-300" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-zinc-300" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-zinc-300" />
      <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-zinc-950/95 text-zinc-300 border border-zinc-800 px-2 py-0.5 rounded-sm shadow-xl backdrop-blur-md text-[10px] font-mono tracking-wider whitespace-nowrap">
        <Scan size={11} className="text-zinc-400" />
        <span>ÁREA ({Math.round(wPct)}% × {Math.round(hPct)}%)</span>
      </span>
    </div>
  );
});

export default ScreenRegionOverlay;
