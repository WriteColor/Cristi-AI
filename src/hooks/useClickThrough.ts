import { useCallback } from 'react';
import { electronBridge } from '../services/desktop/ElectronBridge';

export interface InteractiveProps {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export interface UseClickThroughReturn {
  enableInteraction: () => void;
  disableInteraction: () => void;
  interactiveProps: InteractiveProps;
}

/**
 * useClickThrough
 *
 * Core hook for selective click-through in Electron on Windows.
 * Implements mouse passthrough via setIgnoreMouseEvents with forward forwarding.
 */
export function useClickThrough(): UseClickThroughReturn {
  const onMouseEnter = useCallback(() => {
    electronBridge?.setIgnoreMouseEvents(false);
  }, []);

  const onMouseLeave = useCallback(() => {
    electronBridge?.setIgnoreMouseEvents(true, { forward: true });
  }, []);

  return {
    enableInteraction: onMouseEnter,
    disableInteraction: onMouseLeave,
    interactiveProps: {
      onMouseEnter,
      onMouseLeave,
    }
  };
}

export default useClickThrough;
