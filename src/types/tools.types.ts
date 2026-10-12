/**
 * Command Pattern interface for all 45+ agentic tools.
 */

import { GeminiFunctionDeclaration } from './gemini.types';
import type { ScreenRegion } from './sensory.types';

export interface ToolExecutionContext {
  isCallCancelled?: (id: string) => boolean;
  signal?: AbortSignal;
  sessionId?: string;
  source?: string;
  onGestureTrigger?: (gesture: string, comment?: string) => void;
  onMotionTrigger?: (motionGroup: string, index?: number) => void;
  onAvatarMove?: (position: string, animation?: string) => void;
  onToolExecutionStart?: (name: string, args: any) => void;
  onToolExecutionEnd?: (name: string, result: any) => void;
  onScreenRegionChange?: (region: ScreenRegion | null) => void;
  onScreenWatchChange?: (enabled: boolean) => void;
  getCameraSnapshot?: () => any;
  getVisionDetections?: () => any;
  getScreenCapture?: (region?: string, options?: { fresh?: boolean }) => Promise<string | null>;
  setScreenWatch?: (enabled: boolean) => void;

  // Convenient shorthand aliases
  triggerGesture?: (gesture: string, comment?: string) => void;
  triggerMotion?: (motionGroup: string, index?: number) => void;
  moveAvatar?: (position: string, animation?: string) => void;
  takeScreenshot?: (region?: string) => Promise<string | null>;
  captureRegion?: () => Promise<string | null>;
}

export interface IToolHandler<TArgs = any, TResult = any> {
  readonly name: string;
  readonly declaration: GeminiFunctionDeclaration;
  execute(args: TArgs, context?: ToolExecutionContext): Promise<TResult>;
}
