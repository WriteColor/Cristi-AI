import { toolRegistry } from './index';
import type { ToolExecutionContext } from './IToolHandler';
import type { ScreenRegion } from '@/types/sensory.types';

/**
 * Adaptador / Facade para ToolRegistry que preserva compatibilidad hacia atrás
 * con el diseño anterior mientras delega toda la ejecución al catálogo de
 * herramientas basado en Command Pattern.
 */
export interface ToolExecutorOptions extends Partial<ToolExecutionContext> {
  [key: string]: unknown;
}

export class ToolExecutor {
  public context: ToolExecutionContext;
  public memoryKey = 'cristi_ai_user_memories';

  public onGestureTrigger?: (gesture: string, comment?: string) => void;
  public onMotionTrigger?: (motionGroup: string, index?: number) => void;
  public onAvatarMove?: (position: string, animation?: string) => void;
  public onToolExecutionStart?: (name: string, args: unknown) => void;
  public onToolExecutionEnd?: (name: string, result: unknown) => void;
  public onScreenRegionChange?: (region: ScreenRegion | null) => void;
  public onScreenWatchChange?: (active: boolean) => void;
  public getCameraSnapshot?: () => unknown;
  public getVisionDetections?: () => unknown;
  public getScreenCapture?: (region?: string, options?: { fresh?: boolean }) => Promise<string | null>;
  public setScreenWatch?: (active: boolean) => void;

  constructor(options: ToolExecutorOptions = {}) {
    const {
      onGestureTrigger = () => {},
      onMotionTrigger = () => {},
      onAvatarMove = () => {},
      onToolExecutionStart = () => {},
      onToolExecutionEnd = () => {},
      onScreenRegionChange = () => {},
      onScreenWatchChange = () => {},
      getCameraSnapshot = () => null,
      getVisionDetections = () => null,
      getScreenCapture = async () => null,
      setScreenWatch = () => {},
      ...rest
    } = options;

    this.onGestureTrigger = onGestureTrigger;
    this.onMotionTrigger = onMotionTrigger;
    this.onAvatarMove = onAvatarMove;
    this.onToolExecutionStart = onToolExecutionStart;
    this.onToolExecutionEnd = onToolExecutionEnd;
    this.onScreenRegionChange = onScreenRegionChange;
    this.onScreenWatchChange = onScreenWatchChange;
    this.getCameraSnapshot = getCameraSnapshot;
    this.getVisionDetections = getVisionDetections;
    this.getScreenCapture = getScreenCapture;
    this.setScreenWatch = setScreenWatch;

    this.context = {
      onGestureTrigger,
      onMotionTrigger,
      onAvatarMove,
      onToolExecutionStart,
      onToolExecutionEnd,
      onScreenRegionChange,
      onScreenWatchChange,
      getCameraSnapshot,
      getVisionDetections,
      getScreenCapture,
      setScreenWatch,
      ...rest
    };
  }

  public async executeCalls(functionCalls: unknown[], isCallCancelled: (id?: string) => boolean = () => false) {
    return toolRegistry.executeCalls(functionCalls as never, { ...this.context, isCallCancelled });
  }

  public async executeTool(name: string, args: Record<string, unknown> = {}, signal?: AbortSignal, callId?: string) {
    if (signal?.aborted) {
      return { status: 'cancelled', message: 'Ejecución de herramienta cancelada.', cancelled: true };
    }
    const effectiveContext: ToolExecutionContext = signal ? { ...this.context, signal } : this.context;
    effectiveContext.onToolExecutionStart?.(name, args);

    if (!signal) {
      const result = await toolRegistry.executeTool(name, args, effectiveContext, callId);
      effectiveContext.onToolExecutionEnd?.(name, result);
      return result;
    }

    let onAbort: (() => void) | undefined;
    const abortPromise = new Promise<{ status: string; message: string; cancelled: boolean }>((resolve) => {
      onAbort = () => {
        resolve({ status: 'cancelled', message: 'Ejecución de herramienta cancelada.', cancelled: true });
      };
      signal.addEventListener('abort', onAbort);
      if (signal.aborted) {
        onAbort();
      }
    });

    try {
      if (signal.aborted) {
        const cancelledResult = { status: 'cancelled', message: 'Ejecución de herramienta cancelada.', cancelled: true };
        effectiveContext.onToolExecutionEnd?.(name, cancelledResult);
        return cancelledResult;
      }

      const executionPromise = toolRegistry.executeTool(name, args, effectiveContext, callId);

      if (signal.aborted) {
        const cancelledResult = { status: 'cancelled', message: 'Ejecución de herramienta cancelada.', cancelled: true };
        effectiveContext.onToolExecutionEnd?.(name, cancelledResult);
        return cancelledResult;
      }

      const raceResult = await Promise.race([executionPromise, abortPromise]);
      const result = signal.aborted
        ? { status: 'cancelled', message: 'Ejecución de herramienta cancelada.', cancelled: true }
        : raceResult;

      effectiveContext.onToolExecutionEnd?.(name, result);
      return result;
    } finally {
      if (onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  }

  public async executeSingleTool(name: string, args: Record<string, unknown> = {}, signal?: AbortSignal, callId?: string) {
    return this.executeTool(name, args, signal, callId);
  }
}

export const toolExecutor = new ToolExecutor();
export default toolExecutor;
