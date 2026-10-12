/**
 * Cristi AI - Live2D Avatar Stage
 * Dedicated stage for Live2D Cubism avatars.
 *
 * CRITICAL: The stage container itself is pointer-events: none.
 * Interaction is handled exclusively by the hitTarget inside Live2DCanvas.
 * This prevents the stage from blocking the toolbar, context menu, or any other UI overlay.
 */

import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { Live2DCanvas, Live2DCanvasRef } from './Live2DCanvas';
import { useCompanionStore } from '../stores/useCompanionStore.js';
import { useAudioStore } from '../stores/useAudioStore.js';

export interface AvatarStageProps {
  modelId?: string;
  gesture?: string;
  lipSyncValue?: number;
  isSpeaking?: boolean;
  isListening?: boolean;
  viewMode?: 'torso' | 'full' | string;
  onModelClick?: () => void;
  onModelContextMenu?: (e?: React.MouseEvent | MouseEvent | { clientX?: number; clientY?: number }) => void;
}

export interface AvatarStageRef {
  moveTo: (pos: unknown, anim?: unknown) => void;
  moveToPreset: (pos: unknown, anim?: unknown) => void;
  getModel: () => any;
  getAdapter: () => any;
  getController: () => any;
  reapplyLayout: () => void;
  triggerMotion: (group: string, index?: number) => void;
  triggerGesture: (gestureName: string, comment?: string) => void;
  getHitboxRect: () => DOMRect | null;
  setFpsLimit?: (fps: number) => void;
}

export const AvatarStage = React.memo(forwardRef<AvatarStageRef, AvatarStageProps>(function AvatarStage(props = {}, ref) {
  const storeGesture = useCompanionStore((s) => s.currentGesture || 'idle');
  const storeLipSync = useAudioStore((s) => s.lipSyncValue || 0);
  const storeIsSpeaking = useCompanionStore((s) => s.isSpeaking || false);
  const storeIsListening = useCompanionStore((s) => s.isListening || false);
  const storeViewMode = useCompanionStore((s) => s.viewMode || 'torso');
  const triggerRandomGesture = useCompanionStore((s) => s.triggerRandomGesture);
  const openContextMenu = useCompanionStore((s) => s.openContextMenu);

  const modelId = props.modelId ?? 'yanderegirl';
  const gesture = props.gesture ?? storeGesture;
  const lipSyncValue = props.lipSyncValue ?? storeLipSync;
  const isSpeaking = props.isSpeaking ?? storeIsSpeaking;
  const isListening = props.isListening ?? storeIsListening;
  const viewMode = props.viewMode ?? storeViewMode;
  const onModelClick = props.onModelClick ?? triggerRandomGesture;
  const onModelContextMenu =
    props.onModelContextMenu ??
    ((e) => {
      const posX = e && 'clientX' in e && e.clientX !== undefined ? e.clientX : window.innerWidth / 2;
      const posY = e && 'clientY' in e && e.clientY !== undefined ? e.clientY : window.innerHeight / 2;
      openContextMenu(posX, posY);
    });

  const live2dRef = useRef<Live2DCanvasRef>(null);

  useImperativeHandle(ref, () => ({
    moveTo: (pos: unknown, anim?: unknown) => {
      if (live2dRef.current?.moveTo) live2dRef.current.moveTo(pos, anim);
      else if (live2dRef.current?.moveToPreset) live2dRef.current.moveToPreset(pos, anim);
    },
    moveToPreset: (pos: unknown, anim?: unknown) => {
      if (live2dRef.current?.moveToPreset) live2dRef.current.moveToPreset(pos, anim);
    },
    getModel: () => live2dRef.current?.getModel?.() || null,
    getAdapter: () => live2dRef.current?.getAdapter?.() || null,
    getController: () => live2dRef.current?.getController?.() || null,
    reapplyLayout: () => live2dRef.current?.reapplyLayout?.(),
    triggerMotion: (group: string, index?: number) => {
      if (live2dRef.current?.triggerMotion) live2dRef.current.triggerMotion(group, index);
    },
    triggerGesture: (gestureName: string, comment?: string) => {
      if (live2dRef.current?.triggerGesture) live2dRef.current.triggerGesture(gestureName, comment);
    },
    getHitboxRect: () => {
      if (live2dRef.current?.getHitboxRect) return live2dRef.current.getHitboxRect();
      return null;
    },
    setFpsLimit: (fps: number) => {
      if (live2dRef.current?.setFpsLimit) live2dRef.current.setFpsLimit(fps);
    }
  }));

  return (
    <div
      className="avatar-stage live2d-mode w-full h-full relative z-[1]"
      style={{ pointerEvents: 'none' }}
    >
      <Live2DCanvas
        ref={live2dRef}
        modelId={modelId}
        gesture={gesture}
        lipSyncValue={lipSyncValue}
        isSpeaking={isSpeaking}
        isListening={isListening}
        viewMode={viewMode}
        onModelClick={onModelClick}
        onModelContextMenu={onModelContextMenu}
      />
    </div>
  );
}));

export default AvatarStage;
