import { connectionTransition, connectionView, type ConnectionEvent } from '../domain/gemini/ConnectionState';
import { create } from 'zustand';
import { GeminiLiveConnectionState, SessionLog } from '@/types';

const MAX_LOGS = 100;

export interface SessionState {
  dispatchConnection: (event: ConnectionEvent) => void;
  // --- Core Estado Requerido ---
  connectionState: GeminiLiveConnectionState;
  isInterrupted: boolean;
  activeToolName: string | null;
  recentLogs: SessionLog[];

  // --- Extended / Convenience State ---
  isConnected: boolean;
  isConnecting: boolean;
  errorMessage: string | null;

  // --- Core Acciones Requeridas ---
  setConnectionState: (connectionState: GeminiLiveConnectionState) => void;
  setInterrupted: (isInterrupted: boolean) => void;
  setActiveTool: (activeToolName: string | null) => void;
  addLog: (tagOrLog: string | Omit<SessionLog, 'id' | 'timestamp'> | SessionLog, maybeMessage?: string) => void;

  // --- Extended Actions ---
  setIsConnected: (isConnected: boolean) => void;
  setIsConnecting: (isConnecting: boolean) => void;
  setErrorMessage: (errorMessage: string | null) => void;
  clearLogs: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  dispatchConnection: event => set(state => connectionView(connectionTransition(state.connectionState, event))),
  // Core initial state
  connectionState: 'DISCONNECTED',
  isInterrupted: false,
  activeToolName: null,
  recentLogs: [],

  // Extended initial state
  isConnected: false,
  isConnecting: false,
  errorMessage: null,

  // Core Actions
  setConnectionState: connectionState => set(connectionView(connectionState)),

  setInterrupted: (isInterrupted) => set({ isInterrupted }),
  setActiveTool: (activeToolName) => set({ activeToolName }),

  addLog: (tagOrLog, maybeMessage) =>
    set((state) => {
      let entry: SessionLog;

      if (typeof tagOrLog === 'string') {
        entry = {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          tag: tagOrLog,
          message: maybeMessage ?? '',
          timestamp: Date.now(),
        };
      } else {
        const hasId = 'id' in tagOrLog && typeof tagOrLog.id === 'string';
        const hasTimestamp = 'timestamp' in tagOrLog && typeof tagOrLog.timestamp === 'number';
        entry = {
          id: hasId ? (tagOrLog as SessionLog).id : `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          tag: tagOrLog.tag,
          message: tagOrLog.message,
          timestamp: hasTimestamp ? (tagOrLog as SessionLog).timestamp : Date.now(),
        };
      }

      const nextLogs = [entry, ...state.recentLogs].slice(0, MAX_LOGS);
      return { recentLogs: nextLogs };
    }),

  // Extended Actions
  setIsConnected: isConnected => set(connectionView(isConnected ? 'READY' : 'DISCONNECTED')),
  setIsConnecting: isConnecting => set(state => connectionView(isConnecting ? 'CONNECTING' :
    state.connectionState === 'CONNECTING' || state.connectionState === 'RECONNECTING' ? 'DISCONNECTED' : state.connectionState)),

  setErrorMessage: (errorMessage) => set({ errorMessage }),
  clearLogs: () => set({ recentLogs: [] }),
}));
