/**
 * Cristi AI - Futuristic HUD Toast Notification Service (Strict TypeScript)
 * Emits reactive HUD toasts with custom severity, icons, micro-animations, and sound cues.
 */

import { eventBus, EVENTS } from '../events/eventBus.js';

export type ToastType = 'info' | 'success' | 'warning' | 'error' | 'emotion' | 'tool' | 'ai' | 'alarm';

export interface ToastItem {
  id: string;
  title: string;
  description: string;
  type: ToastType;
  duration: number;
  icon: string | null;
  badge: string | null;
  createdAt: number;
  progress?: number;
}

export interface ShowToastOptions {
  title: string;
  description?: string;
  type?: ToastType;
  duration?: number;
  icon?: string | null;
  badge?: string | null;
  progress?: number;
}

export type ToastListener = (toasts: ToastItem[]) => void;

export class ToastService {
  private toasts: ToastItem[] = [];
  private listeners: Set<ToastListener> = new Set();

  public subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener(this.toasts);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const copy = [...this.toasts];
    for (const listener of this.listeners) {
      listener(copy);
    }
  }

  /**
   * Dispatch a new toast notification
   */
  public show({
    title,
    description = '',
    type = 'info',
    duration = 4000,
    icon = null,
    badge = null,
    progress
  }: ShowToastOptions): string {
    // Prevent strict mode / double-render duplication by title within 500ms
    const recentDuplicate = this.toasts.find(t => t.title === title && (Date.now() - t.createdAt) < 500);
    if (recentDuplicate) return recentDuplicate.id;

    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const toast: ToastItem = {
      id,
      title,
      description,
      type,
      duration,
      icon,
      badge,
      createdAt: Date.now(),
      progress
    };

    // Keep max 5 concurrent toasts
    this.toasts = [toast, ...this.toasts.slice(0, 4)];
    this.notify();

    eventBus.emit(EVENTS.TOAST_TRIGGERED, toast);

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  public dismiss(id: string): void {
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.notify();
  }

  public clearAll(): void {
    this.toasts = [];
    this.notify();
  }

  public info(title: string, description: string = '', options: Partial<ShowToastOptions> = {}): string {
    return this.show({ title, description, type: 'info', ...options });
  }

  public success(title: string, description: string = '', options: Partial<ShowToastOptions> = {}): string {
    return this.show({ title, description, type: 'success', ...options });
  }

  public warning(title: string, description: string = '', options: Partial<ShowToastOptions> = {}): string {
    return this.show({ title, description, type: 'warning', ...options });
  }

  public warn(title: string, description: string = '', options: Partial<ShowToastOptions> = {}): string {
    return this.warning(title, description, options);
  }

  public error(title: string, description: string = '', options: Partial<ShowToastOptions> = {}): string {
    return this.show({ title, description, type: 'error', duration: 6000, ...options });
  }

  public alarm(title: string, description: string = '', options: Partial<ShowToastOptions> = {}): string {
    return this.show({ title, description, type: 'alarm', duration: 0, badge: 'ALARMA', ...options });
  }

  public tool(toolName: string, description: string = '', options: Partial<ShowToastOptions> = {}): string {
    return this.show({
      title: `Ejecutando: ${toolName}`,
      description: description || 'Acción del sistema en progreso...',
      type: 'tool',
      badge: 'TOOL',
      ...options
    });
  }

  public ai(title: string, description: string = '', options: Partial<ShowToastOptions> = {}): string {
    return this.show({
      title,
      description,
      type: 'ai',
      badge: 'GEMINI',
      ...options
    });
  }
}

export const toastService = new ToastService();
export const toast = toastService;
export default toastService;
