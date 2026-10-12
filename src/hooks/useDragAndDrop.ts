import { useState, useRef, useCallback } from 'react';
import { electronBridge } from '../services/desktop/ElectronBridge.js';

export interface DragPosition {
  x: number;
  y: number;
}

export interface DragDelta {
  dx: number;
  dy: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  hasMoved: boolean;
}

export interface UseDragAndDropOptions {
  threshold?: number;
  onDragStart?: (e: React.PointerEvent) => void;
  onDragMove?: (delta: DragDelta, e: React.PointerEvent) => void;
  onDragEnd?: (delta: DragDelta, e: React.PointerEvent) => void;
  onClick?: (e: React.PointerEvent) => void;
}

export interface UseDragAndDropReturn {
  isDragging: boolean;
  dragProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
}

/**
 * useDragAndDrop
 *
 * Provides fluid dragging and drop tracking for desktop avatars and draggable elements.
 * Correctly coordinates pointer capture and Electron mouse event passthrough.
 */
export function useDragAndDrop(options: UseDragAndDropOptions = {}): UseDragAndDropReturn {
  const { threshold = 3, onDragStart, onDragMove, onDragEnd, onClick } = options;

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({
    active: false,
    hasMoved: false,
    startX: 0,
    startY: 0
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Ignore right clicks or secondary buttons
      if (e.button !== 0) return;

      electronBridge.setIgnoreMouseEvents(false);
      dragRef.current = {
        active: true,
        hasMoved: false,
        startX: e.clientX,
        startY: e.clientY
      };
      setIsDragging(true);

      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch (_) {}

      onDragStart?.(e);
    },
    [onDragStart]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.active) return;

      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;

      if (!dragRef.current.hasMoved && (Math.abs(dx) > threshold || Math.abs(dy) > threshold)) {
        dragRef.current.hasMoved = true;
      }

      onDragMove?.(
        {
          dx,
          dy,
          x: e.clientX,
          y: e.clientY,
          startX: dragRef.current.startX,
          startY: dragRef.current.startY,
          hasMoved: dragRef.current.hasMoved
        },
        e
      );
    },
    [threshold, onDragMove]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.active) return;

      const hadMoved = dragRef.current.hasMoved;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;

      dragRef.current.active = false;
      setIsDragging(false);

      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (_) {}

      if (hadMoved) {
        onDragEnd?.(
          {
            dx,
            dy,
            x: e.clientX,
            y: e.clientY,
            startX: dragRef.current.startX,
            startY: dragRef.current.startY,
            hasMoved: true
          },
          e
        );
      } else {
        onClick?.(e);
      }

      // Restore mouse passthrough if interaction lock is free
      if (electronBridge._interactionLockCount === 0) {
        electronBridge.setIgnoreMouseEvents(true, { forward: true });
      }
    },
    [onDragEnd, onClick]
  );

  return {
    isDragging,
    dragProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp
    }
  };
}

export default useDragAndDrop;
