import { create } from 'zustand';
import { Widget, Alarm } from '@/types';
import { eventBus, EVENTS } from '../infrastructure/events/eventBus.js';
import { proactiveScheduler } from '../domain/interaction/ProactiveScheduler.js';

const STORAGE_KEY_CRISTI_WIDGETS = 'cristi_ai_active_widgets';
const STORAGE_KEY_CRISTI_ALARMS = 'cristi_ai_active_alarms';

export type { Widget, Alarm };

export interface WidgetState {
  // --- Core Estado Requerido ---
  widgets: Widget[];
  alarms: Alarm[];

  // --- Extended State ---
  showWidgets: boolean;

  // --- Core Acciones Requeridas ---
  addWidget: (widget: Omit<Widget, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) => void;
  removeWidget: (id: string) => void;
  addAlarm: (alarm: Omit<Alarm, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) => void;
  removeAlarm: (id: string) => void;

  // --- Extended Actions ---
  dismissWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<Widget>) => void;
  toggleWidgetDone: (id: string) => void;
  clearWidgets: () => void;
  toggleAlarm: (id: string) => void;
  clearAlarms: () => void;
  setShowWidgets: (show: boolean) => void;
  toggleShowWidgets: () => void;
  setWidgets: (widgets: Widget[]) => void;
}

function getInitialWidgets(): Widget[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_CRISTI_WIDGETS);
      return saved ? JSON.parse(saved) : [];
    }
  } catch (_) {}
  return [];
}

function getInitialAlarms(): Alarm[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_CRISTI_ALARMS);
      return saved ? JSON.parse(saved) : [];
    }
  } catch (_) {}
  return [];
}

function saveWidgetsToStorage(widgets: Widget[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_CRISTI_WIDGETS, JSON.stringify(widgets));
    }
  } catch (_) {}
}

function saveAlarmsToStorage(alarms: Alarm[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_CRISTI_ALARMS, JSON.stringify(alarms));
    }
  } catch (_) {}
}

export const useWidgetStore = create<WidgetState>()((set, get) => ({
  // Core initial state
  widgets: getInitialWidgets(),
  alarms: getInitialAlarms(),

  // Extended initial state
  showWidgets: true,

  // Core Actions
  addWidget: (widget) => {
    if (!widget) return;
    const newWidget: Widget = {
      ...widget,
      id: widget.id ?? `widget_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: widget.title || 'Notificación',
      content: widget.content || '',
      type: widget.type || 'note',
      createdAt: widget.createdAt ?? Date.now(),
    };

    const current = get().widgets;
    const filtered = current.filter((w) => String(w.id) !== String(newWidget.id));
    const updated = [newWidget, ...filtered];
    saveWidgetsToStorage(updated);
    set({ widgets: updated });

    // Handle auto-dismiss duration if configured
    if (newWidget.duration && newWidget.duration > 0) {
      setTimeout(() => {
        get().removeWidget(newWidget.id);
      }, newWidget.duration);
    }
  },

  removeWidget: (id: string) => {
    const targetId = String(id);
    const updated = get().widgets.filter((w) => String(w.id) !== targetId);
    saveWidgetsToStorage(updated);
    set({ widgets: updated });

    eventBus.emit(EVENTS.WIDGET_DISMISSED, { id: targetId });
    proactiveScheduler.cancelTask(targetId);
  },

  addAlarm: (alarm) => {
    if (!alarm) return;
    const newAlarm: Alarm = {
      ...alarm,
      id: alarm.id ?? `alarm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label: alarm.label || 'Alarma',
      time: alarm.time || '12:00',
      createdAt: alarm.createdAt ?? Date.now(),
      enabled: alarm.enabled ?? true,
    };

    const current = get().alarms;
    const filtered = current.filter((a) => String(a.id) !== String(newAlarm.id));
    const updated = [newAlarm, ...filtered];
    saveAlarmsToStorage(updated);
    set({ alarms: updated });
  },

  removeAlarm: (id: string) => {
    const targetId = String(id);
    const updated = get().alarms.filter((a) => String(a.id) !== targetId);
    saveAlarmsToStorage(updated);
    set({ alarms: updated });
  },

  // Extended Actions
  dismissWidget: (id: string) => get().removeWidget(id),

  updateWidget: (id: string, updates: Partial<Widget>) => {
    const updated = get().widgets.map((w) => (String(w.id) === String(id) ? { ...w, ...updates } : w));
    saveWidgetsToStorage(updated);
    set({ widgets: updated });
  },

  toggleWidgetDone: (id: string) => {
    const updated = get().widgets.map((w) =>
      String(w.id) === String(id) ? { ...w, done: !w.done } : w
    );
    saveWidgetsToStorage(updated);
    set({ widgets: updated });
  },

  clearWidgets: () => {
    saveWidgetsToStorage([]);
    set({ widgets: [] });
  },

  toggleAlarm: (id: string) => {
    const updated = get().alarms.map((a) =>
      String(a.id) === String(id) ? { ...a, enabled: !a.enabled } : a
    );
    saveAlarmsToStorage(updated);
    set({ alarms: updated });
  },

  clearAlarms: () => {
    saveAlarmsToStorage([]);
    set({ alarms: [] });
  },

  setShowWidgets: (show: boolean) => set({ showWidgets: show }),
  toggleShowWidgets: () => set((state) => ({ showWidgets: !state.showWidgets })),
  setWidgets: (widgets: Widget[]) => {
    saveWidgetsToStorage(widgets);
    set({ widgets });
  },
}));
