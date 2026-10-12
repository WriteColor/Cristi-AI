/**
 * Cristi AI - Desktop Global Cursor Tracker (Strict TypeScript)
 * 
 * Provides continuous 360° cursor tracking across the entire OS desktop,
 * even when the mouse leaves the browser window or the app is unfocused.
 */

export interface CursorPosition {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  isInsideWindow: boolean;
  lastUpdated: number;
}

export type CursorUpdateCallback = (pos: CursorPosition) => void;

export class DesktopCursorTracker {
  private isTracking = false;
  private listeners: Set<CursorUpdateCallback> = new Set();
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;

  private currentPos: CursorPosition = {
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 640,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 360,
    screenX: typeof window !== 'undefined' ? (window.screenX || 0) + window.innerWidth / 2 : 640,
    screenY: typeof window !== 'undefined' ? (window.screenY || 0) + window.innerHeight / 2 : 360,
    isInsideWindow: true,
    lastUpdated: typeof performance !== 'undefined' ? performance.now() : Date.now()
  };

  constructor() {
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.handleWindowBlur = this.handleWindowBlur.bind(this);

    if (typeof window !== 'undefined') {
      (window as any).__cristiDesktopCursor = this;
      (window as any).__setDesktopCursor = (x: number, y: number) => this.setGlobalPosition(x, y);
    }
  }

  public start(): void {
    if (this.isTracking || typeof window === 'undefined') return;
    this.isTracking = true;

    window.addEventListener('pointermove', this.handlePointerMove, { passive: true, capture: true });
    document.addEventListener('mouseleave', this.handleMouseLeave, { passive: true });
    window.addEventListener('blur', this.handleWindowBlur, { passive: true });
  }

  public stop(): void {
    if (!this.isTracking || typeof window === 'undefined') return;
    this.isTracking = false;

    window.removeEventListener('pointermove', this.handlePointerMove, { capture: true });
    document.removeEventListener('mouseleave', this.handleMouseLeave);
    window.removeEventListener('blur', this.handleWindowBlur);

    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  public onCursorUpdate(callback: CursorUpdateCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public setGlobalPosition(x: number, y: number, isScreenCoords: boolean = false): void {
    let clientX = x;
    let clientY = y;
    let screenX = x;
    let screenY = y;

    if (typeof window !== 'undefined') {
      const winScreenX = window.screenX || (window as any).screenLeft || 0;
      const winScreenY = window.screenY || (window as any).screenTop || 0;

      if (isScreenCoords) {
        clientX = x - winScreenX;
        clientY = y - winScreenY;
      } else {
        screenX = winScreenX + x;
        screenY = winScreenY + y;
      }
    }

    const isInsideWindow = (
      clientX >= 0 &&
      clientX <= (typeof window !== 'undefined' ? window.innerWidth : 1280) &&
      clientY >= 0 &&
      clientY <= (typeof window !== 'undefined' ? window.innerHeight : 720)
    );

    this.currentPos = {
      x: clientX,
      y: clientY,
      screenX,
      screenY,
      isInsideWindow,
      lastUpdated: typeof performance !== 'undefined' ? performance.now() : Date.now()
    };

    this.emitUpdate();
  }

  private handleMouseMove(e: MouseEvent): void {
    this.processDOMMouseEvent(e);
  }

  private handlePointerMove(e: PointerEvent): void {
    this.processDOMMouseEvent(e);
  }

  private processDOMMouseEvent(e: MouseEvent | PointerEvent): void {
    const clientX = e.clientX;
    const clientY = e.clientY;
    const screenX = e.screenX !== undefined ? e.screenX : clientX + (window.screenX || 0);
    const screenY = e.screenY !== undefined ? e.screenY : clientY + (window.screenY || 0);

    const isInside = (
      clientX >= 0 && clientX <= window.innerWidth &&
      clientY >= 0 && clientY <= window.innerHeight
    );

    this.currentPos = {
      x: clientX,
      y: clientY,
      screenX,
      screenY,
      isInsideWindow: isInside,
      lastUpdated: typeof performance !== 'undefined' ? performance.now() : Date.now()
    };

    this.emitUpdate();
  }

  private handleMouseLeave(e: MouseEvent): void {
    if (e.screenX !== undefined && e.screenY !== undefined) {
      const winScreenX = window.screenX || (window as any).screenLeft || 0;
      const winScreenY = window.screenY || (window as any).screenTop || 0;
      const clientX = e.screenX - winScreenX;
      const clientY = e.screenY - winScreenY;

      this.currentPos = {
        x: clientX,
        y: clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        isInsideWindow: false,
        lastUpdated: typeof performance !== 'undefined' ? performance.now() : Date.now()
      };
      this.emitUpdate();
    }
  }

  private handleWindowBlur(): void {
    this.currentPos.isInsideWindow = false;
  }

  private emitUpdate(): void {
    for (const cb of this.listeners) {
      try {
        cb(this.currentPos);
      } catch (err) {
        console.warn('[DesktopCursorTracker] Callback error:', err);
      }
    }
  }

  public getPosition(): CursorPosition {
    return this.currentPos;
  }
}

export const desktopCursorTracker = new DesktopCursorTracker();
export default desktopCursorTracker;
