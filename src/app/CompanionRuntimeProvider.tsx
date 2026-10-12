import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { CompanionRuntime } from './CompanionRuntime';

const RuntimeContext = createContext<CompanionRuntime | null>(null);
export function CompanionRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useRef<CompanionRuntime | null>(null);
  if (!runtime.current) runtime.current = new CompanionRuntime();
  useEffect(() => () => runtime.current?.dispose(), []);
  return <RuntimeContext.Provider value={runtime.current}>{children}</RuntimeContext.Provider>;
}
export function useCompanionRuntime(): CompanionRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('CompanionRuntimeProvider requerido.');
  return runtime;
}
