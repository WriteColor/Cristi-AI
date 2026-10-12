import type { GeminiLiveConnectionState } from '../../types/gemini.types';

export type ConnectionEvent = 'CONNECT' | 'SETUP_COMPLETE' | 'RECONNECT' | 'DISCONNECT' | 'FAIL' | 'TRANSMIT' | 'DRAIN';
export function connectionTransition(current: GeminiLiveConnectionState, event: ConnectionEvent): GeminiLiveConnectionState {
  switch (event) {
    case 'CONNECT': return 'CONNECTING';
    case 'SETUP_COMPLETE': return current === 'CONNECTING' || current === 'RECONNECTING' ? 'READY' : current;
    case 'RECONNECT': return current === 'DISCONNECTED' || current === 'ERROR' ? current : 'RECONNECTING';
    case 'DISCONNECT': return 'DISCONNECTED';
    case 'FAIL': return 'ERROR';
    case 'TRANSMIT': return current === 'READY' ? 'TRANSMITTING' : current;
    case 'DRAIN': return current === 'TRANSMITTING' ? 'READY' : current;
  }
}
export function connectionView(connectionState: GeminiLiveConnectionState) {
  return { connectionState, isConnected: connectionState === 'READY' || connectionState === 'TRANSMITTING',
    isConnecting: connectionState === 'CONNECTING' || connectionState === 'RECONNECTING' };
}
