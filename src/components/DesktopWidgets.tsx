import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell,
  Clock,
  CloudSun,
  CheckCircle2,
  Sparkles,
  X,
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Terminal,
  ShieldCheck
} from 'lucide-react';
import { eventBus, EVENTS } from '../infrastructure/events/eventBus.js';
import { proactiveScheduler } from '../domain/interaction/ProactiveScheduler.js';
import { windowsMediaService } from '../domain/media/WindowsMediaService.js';
import { soundFxService } from '../domain/audio/SoundFxService.js';
import { clickThroughService } from '../services/desktop/ClickThroughService.js';
import { logger } from '../infrastructure/logging/logger.js';
import { useClickThrough } from '../hooks/useClickThrough.js';
import { useWidgetStore } from '../stores/useWidgetStore.js';
import { useCompanionStore } from '../stores/useCompanionStore.js';
import { Widget } from '@/types';

const STORAGE_KEY_CRISTI_WIDGETS = 'cristi_ai_widgets_data';

export interface DesktopWidgetsProps {
  isVisible?: boolean;
}

interface WindowsMediaStatus {
  isSpotifyRunning: boolean;
  trackInfo: string | null;
  artist: string | null;
  title: string | null;
  isPlaying: boolean;
  source: 'spotify' | 'system' | 'none';
}

/**
 * Cristi AI - Dynamic Tactical Desktop Widgets
 * Minimalist, event-driven widgets triggered exclusively by Cristi AI and native Windows Media.
 * Zero generic placeholders: only renders when Cristi generates an authentic alarm, reminder,
 * or when Spotify / Windows Media is actively playing.
 */
export const DesktopWidgets: React.FC<DesktopWidgetsProps> = React.memo(function DesktopWidgets(props = {}) {
  const storeVisible = useWidgetStore((s) => s.showWidgets);
  const isUiVisible = useCompanionStore((s) => s.isUiVisible && !s.isZenMode);
  const isOsOperating = useCompanionStore((s) => s.isOsOperating);
  const osOperationDetails = useCompanionStore((s) => s.osOperationDetails);
  const isVisible = props.isVisible !== undefined ? props.isVisible : (storeVisible && isUiVisible);
  const containerRef = useRef<HTMLDivElement>(null);

  const [widgets, setWidgets] = useState<Widget[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CRISTI_WIDGETS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [mediaStatus, setMediaStatus] = useState<WindowsMediaStatus | null>(null);
  const autoDismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleDismiss = useCallback((id: string | number) => {
    const targetId = String(id);
    const existingTimer = autoDismissTimersRef.current.get(targetId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      autoDismissTimersRef.current.delete(targetId);
    }

    setWidgets((prev) => {
      const updated = prev.filter((w) => String(w.id) !== targetId);
      try {
        localStorage.setItem(STORAGE_KEY_CRISTI_WIDGETS, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    eventBus.emit(EVENTS.WIDGET_DISMISSED, { id: targetId });
    proactiveScheduler.cancelTask(targetId);
  }, []);

  // Listen to Cristi AI real widget events
  useEffect(() => {
    const handleWidgetTriggered = (widget: Widget) => {
      if (!widget || !widget.id) return;
      const widgetId = String(widget.id);

      setWidgets((prev) => {
        const filtered = prev.filter((w) => String(w.id) !== widgetId);
        const updated = [widget, ...filtered];
        try {
          localStorage.setItem(STORAGE_KEY_CRISTI_WIDGETS, JSON.stringify(updated));
        } catch (_) {}
        return updated;
      });

      // Manage auto-dismiss timer safely
      if (widget.duration && widget.duration > 0) {
        const prevTimer = autoDismissTimersRef.current.get(widgetId);
        if (prevTimer) clearTimeout(prevTimer);

        const timerId = setTimeout(() => {
          autoDismissTimersRef.current.delete(widgetId);
          handleDismiss(widgetId);
        }, widget.duration);
        autoDismissTimersRef.current.set(widgetId, timerId);
      }
    };

    const handleWidgetDismissed = ({ id }: { id?: string | number }) => {
      if (id) handleDismiss(String(id));
    };

    const unsubTrigger = eventBus.on(EVENTS.WIDGET_TRIGGERED, handleWidgetTriggered);
    const unsubDismiss = eventBus.on(EVENTS.WIDGET_DISMISSED, handleWidgetDismissed);

    return () => {
      unsubTrigger();
      unsubDismiss();
      for (const t of autoDismissTimersRef.current.values()) {
        clearTimeout(t);
      }
      autoDismissTimersRef.current.clear();
    };
  }, [handleDismiss]);

  // Query native Windows Media & Spotify status periodically when widgets are visible
  useEffect(() => {
    if (!isVisible) {
      setMediaStatus(null);
      return;
    }

    let isMounted = true;
    const fetchMedia = async () => {
      try {
        const res = await windowsMediaService.getStatus();
        if (isMounted && res.status === 'success' && res.data) {
          setMediaStatus(res.data as WindowsMediaStatus);
        }
      } catch {
        if (isMounted) setMediaStatus(null);
      }
    };

    void fetchMedia();
    const interval = setInterval(fetchMedia, 3500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isVisible]);

  const { interactiveProps } = useClickThrough();

  // Register interactive hitbox with Electron Main to ensure passthrough click behavior
  useEffect(() => {
    const isMediaActive = Boolean(mediaStatus?.isPlaying && (mediaStatus.title || mediaStatus.trackInfo));
    const hasActiveContent = widgets.length > 0 || isMediaActive;

    if (!isVisible || !hasActiveContent) {
      clickThroughService.unregisterHitbox('widgets');
      return;
    }

    const syncHitbox = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        clickThroughService.unregisterHitbox('widgets');
        return;
      }
      clickThroughService.registerHitbox('widgets', {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    const frame = requestAnimationFrame(syncHitbox);
    window.addEventListener('resize', syncHitbox, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', syncHitbox);
      clickThroughService.unregisterHitbox('widgets');
    };
  }, [isVisible, widgets, mediaStatus]);

  const handleToggleDone = (id: string | number) => {
    const targetId = String(id);
    setWidgets((prev) => {
      const updated = prev.map((w) => (String(w.id) === targetId ? { ...w, done: !w.done } : w));
      try {
        localStorage.setItem(STORAGE_KEY_CRISTI_WIDGETS, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  };

  const handleMediaControl = async (action: 'play_pause' | 'next' | 'previous') => {
    soundFxService.playClick();
    try {
      await windowsMediaService.control(action);
      setTimeout(async () => {
        try {
          const res = await windowsMediaService.getStatus();
          if (res.status === 'success' && res.data) {
            setMediaStatus(res.data as WindowsMediaStatus);
          }
        } catch {}
      }, 400);
    } catch (err) {
      logger.warn('WIDGET', `Fallo al enviar comando multimedia (${action}):`, err);
    }
  };

  const isMediaActive = Boolean(mediaStatus?.isPlaying && (mediaStatus.title || mediaStatus.trackInfo));
  const hasContent = widgets.length > 0 || isMediaActive || isOsOperating;

  // Only render if there are authentic active widgets and isVisible is true
  if (!isVisible || !hasContent) return null;

  return (
    <div
      ref={containerRef}
      className="cristi-widgets-viewport zen-fadeable-ui pointer-events-auto select-none"
      {...interactiveProps}
    >
      {/* 0. Live OS Control & Critical Windows Protection Widget */}
      {isOsOperating && (
        <div className="cristi-widget-card border-amber-800/80 bg-zinc-950/95 shadow-2xl animate-pulse">
          <div className="cristi-widget-icon-box text-amber-400 bg-amber-950/40 border-amber-800/60">
            <Terminal size={13} className="animate-pulse" />
          </div>

          <div className="cristi-widget-info">
            <div className="cristi-widget-header">
              <span className="cristi-widget-title text-amber-200">
                Operación OS en Curso (C:\)
              </span>
              <span className="cristi-widget-badge text-[9px] px-1.5 py-0.2 bg-emerald-950/80 border border-emerald-800 text-emerald-300 flex items-center gap-1">
                <ShieldCheck size={9} className="text-emerald-400" />
                Protección Activa
              </span>
            </div>

            <p className="cristi-widget-desc truncate max-w-[200px] text-zinc-300 text-[11px] font-mono">
              {osOperationDetails || 'Ejecutando comando seguro en el sistema...'}
            </p>
          </div>
        </div>
      )}

      {/* 1. Live Windows & Spotify Media Widget */}
      {isMediaActive && mediaStatus && (
        <div className="cristi-widget-card cristi-media-widget border-emerald-900/60 bg-zinc-950/95 shadow-2xl">
          <div className="cristi-widget-icon-box text-emerald-400 bg-emerald-950/40 border-emerald-800/60">
            <Music size={13} className="animate-pulse" />
          </div>

          <div className="cristi-widget-info">
            <div className="cristi-widget-header">
              <span className="cristi-widget-title truncate max-w-[140px] text-zinc-100" title={mediaStatus.title || mediaStatus.trackInfo || ''}>
                {mediaStatus.title || mediaStatus.trackInfo || 'En reproducción'}
              </span>
              <span className="cristi-widget-badge text-[9px] px-1.5 py-0.2 bg-zinc-900 border border-zinc-800 text-emerald-400">
                {mediaStatus.source === 'spotify' ? 'SPOTIFY' : 'WINDOWS'}
              </span>
            </div>

            <p className="cristi-widget-desc truncate max-w-[180px] text-zinc-400 text-[11px]" title={mediaStatus.artist || ''}>
              {mediaStatus.artist || (mediaStatus.source === 'spotify' ? 'Spotify Desktop' : 'Windows Media')}
            </p>
          </div>

          <div className="cristi-widget-actions">
            <button
              type="button"
              className="cristi-widget-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                void handleMediaControl('previous');
              }}
              title="Pista anterior"
              aria-label="Pista anterior"
            >
              <SkipBack size={12} />
            </button>
            <button
              type="button"
              className="cristi-widget-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                void handleMediaControl('play_pause');
              }}
              title={mediaStatus.isPlaying ? 'Pausar' : 'Reproducir'}
              aria-label={mediaStatus.isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {mediaStatus.isPlaying ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <button
              type="button"
              className="cristi-widget-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                void handleMediaControl('next');
              }}
              title="Siguiente pista"
              aria-label="Siguiente pista"
            >
              <SkipForward size={12} />
            </button>
          </div>
        </div>
      )}

      {/* 2. Real Event-driven Widgets (Alarms, Reminders, Notes) */}
      {widgets.map((widget) => {
        let Icon = Sparkles;
        let iconColor = '#c084fc';
        if (widget.type === 'weather') {
          Icon = CloudSun;
          iconColor = '#f59e0b';
        } else if (widget.type === 'alarm') {
          Icon = Clock;
          iconColor = '#f43f5e';
        } else if (widget.type === 'reminder') {
          Icon = Bell;
          iconColor = '#a855f7';
        }

        return (
          <div
            key={widget.id}
            className={`cristi-widget-card pointer-events-auto ${widget.done ? 'done' : ''}`}
          >
            <div className="cristi-widget-icon-box" style={{ color: iconColor }}>
              <Icon size={12} />
            </div>

            <div className="cristi-widget-info">
              <div className="cristi-widget-header">
                <span className="cristi-widget-title">{widget.title}</span>
                {widget.time && (
                  <span className="cristi-widget-badge">[{widget.time}]</span>
                )}
              </div>

              {widget.content && (
                <p className="cristi-widget-desc line-clamp-2">{widget.content}</p>
              )}

              {widget.tag && (
                <span className="text-[10px] text-purple-400 font-mono">#{widget.tag}</span>
              )}
            </div>

            <div className="cristi-widget-actions">
              {widget.type === 'reminder' && (
                <button
                  type="button"
                  className="cristi-widget-action-btn check"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleToggleDone(widget.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title={widget.done ? 'Pendiente' : 'Completado'}
                  aria-label="Completar"
                >
                  <CheckCircle2 size={13} className={widget.done ? 'checked text-emerald-400' : ''} />
                </button>
              )}

              <button
                type="button"
                className="cristi-widget-action-btn dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleDismiss(widget.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                title="Descartar"
                aria-label="Cerrar widget"
              >
                <X size={13} />
              </button>
            </div>

            {widget.duration && widget.duration > 0 && (
              <div
                className="cristi-widget-timer-bar"
                style={{ animationDuration: `${widget.duration}ms` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});

export default DesktopWidgets;
