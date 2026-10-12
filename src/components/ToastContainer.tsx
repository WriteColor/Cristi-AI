import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, AlertTriangle, XCircle, Info, Terminal, Heart, Clock, X, LucideIcon } from 'lucide-react';
import { toastService } from '../infrastructure/notifications/toastService.js';
import { useClickThrough } from '../hooks/useClickThrough.js';

export type ToastType = 'info' | 'success' | 'warning' | 'error' | 'emotion' | 'tool' | 'ai' | 'alarm';

export interface ToastItemData {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  duration?: number;
  badge?: string | null;
  icon?: string | null;
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  emotion: Heart,
  tool: Terminal,
  ai: Sparkles,
  alarm: Clock
};

interface ToastItemProps {
  t: ToastItemData;
}

const ToastItem: React.FC<ToastItemProps> = React.memo(({ t }) => {
  const IconComponent = TYPE_ICONS[t.type] || Info;

  return (
    <div
      className={`group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border bg-zinc-950 p-4 pr-10 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full ${
        t.type === 'error'
          ? 'border-rose-500 text-rose-500'
          : t.type === 'alarm'
          ? 'border-rose-500/80 bg-zinc-950/95 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.15)]'
          : 'border-zinc-800 text-zinc-100'
      }`}
      role="status"
    >
      <div className="flex w-full items-start gap-3">
        <IconComponent className={`mt-0.5 h-4 w-4 ${t.type === 'success' ? 'text-emerald-500' : (t.type === 'error' || t.type === 'alarm') ? 'text-rose-500' : t.type === 'warning' ? 'text-amber-500' : 'text-zinc-400'}`} />
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{t.title}</span>
            {t.badge && (
              <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${t.type === 'alarm' ? 'bg-rose-950/90 text-rose-300 border border-rose-800/50' : 'bg-zinc-800 text-zinc-300'}`}>{t.badge}</span>
            )}
          </div>
          {t.description && (
            <div className="text-sm opacity-90 text-zinc-400">{t.description}</div>
          )}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          toastService.dismiss(t.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-md p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all pointer-events-auto cursor-pointer focus:opacity-100 focus:outline-none focus:ring-2 ${
          t.type === 'alarm' ? 'opacity-100 bg-zinc-900 border border-zinc-700' : 'opacity-0 group-hover:opacity-100'
        }`}
        title="Descartar notificación"
        aria-label="Cerrar notificación"
      >
        <X className="h-4 w-4" />
      </button>
      {t.duration && t.duration > 0 && (
        <div
          className="absolute bottom-0 left-0 h-1 bg-zinc-700 w-full origin-left"
          style={{ animation: `shrink ${t.duration}ms linear forwards` }}
        />
      )}
    </div>
  );
});

export const ToastContainer: React.FC = React.memo(function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItemData[]>([]);

  useEffect(() => {
    return toastService.subscribe((list: ToastItemData[]) => {
      // Remove duplicates by ID and prevent React Strict Mode duplicate bugs if necessary
      const uniqueToasts = Array.from(new Map(list.map((item) => [item.id, item])).values());
      setToasts(uniqueToasts);
    });
  }, []);

  const { interactiveProps } = useClickThrough();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px] gap-2 pointer-events-none"
      aria-live="polite"
      role="region"
      {...interactiveProps}
    >
      <style>{`
        @keyframes shrink {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
});

export default ToastContainer;
