/**
 * Cristi AI - Interface Diagnostic & Error Boundary (Shadcn Dark Zinc Edition)
 * Catches unhandled React render exceptions and provides an executive,
 * minimal recovery dialog with technical diagnostic details.
 */

import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Copy, Check, ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { electronBridge } from '../services/desktop/ElectronBridge.js';
import { soundFxService } from '../domain/audio/SoundFxService.js';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showStack: boolean;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showStack: false,
      copied: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Capturó una excepción de interfaz:', error, errorInfo);
    this.setState({ errorInfo });
    try {
      electronBridge?.resetInteractionLock?.();
      electronBridge?.setIgnoreMouseEvents?.(false);
    } catch (_) {}
  }

  handleReload = async (): Promise<void> => {
    try { soundFxService.playClick(); } catch (_) {}
    try {
      await electronBridge?.relaunchApp?.();
    } catch (_) {
      try {
        await electronBridge?.reloadWindow?.();
      } catch (_) {
        window.location.reload();
      }
    }
  };

  handleRelaunch = async (): Promise<void> => {
    try { soundFxService.playClick(); } catch (_) {}
    try {
      await electronBridge?.relaunchApp?.();
    } catch (_) {
      window.location.reload();
    }
  };

  handleResetDefaults = async (): Promise<void> => {
    try { soundFxService.playClick(); } catch (_) {}
    try {
      localStorage.removeItem('cristi_app_config');
      localStorage.removeItem('cristi_active_model_id');
      localStorage.removeItem('cristi_avatar_type');
    } catch (_) {}
    try {
      await electronBridge?.relaunchApp?.();
    } catch (_) {
      window.location.reload();
    }
  };

  handleCopyDiagnostic = (): void => {
    try { soundFxService.playClick(); } catch (_) {}
    const { error, errorInfo } = this.state;
    const text = [
      'CRISTI AI // DIAGNÓSTICO DE INTERFAZ',
      '==================================',
      `Fecha: ${new Date().toISOString()}`,
      `Error: ${error?.message || String(error)}`,
      '',
      'Component Stack:',
      errorInfo?.componentStack || 'No component stack available',
      '',
      'Error Stack:',
      error?.stack || 'No stack available'
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    });
  };

  override render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo, showStack, copied } = this.state;

    return (
      <div
        className="fixed inset-0 z-[999999] flex items-center justify-center bg-zinc-950/95 backdrop-blur-md p-4 select-none font-sans text-zinc-100 pointer-events-auto cursor-default"
        onMouseEnter={() => {
          try {
            electronBridge?.resetInteractionLock?.();
            electronBridge?.setIgnoreMouseEvents?.(false);
          } catch (_) {}
        }}
      >
        <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200 pointer-events-auto">
          
          {/* Header & Badges */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono tracking-wider uppercase px-1.5 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700/60 rounded">
                    Diagnóstico // Excepción
                  </span>
                </div>
                <h2 className="text-sm font-semibold tracking-wide text-zinc-100 mt-1">
                  Se produjo una interrupción en la interfaz
                </h2>
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Cristi AI detectó una excepción imprevista durante el ciclo de renderizado. Puedes reiniciar la interfaz de usuario o restablecer los ajustes a sus valores seguros predeterminados.
          </p>

          {/* Monospace Error Box */}
          <div className="bg-zinc-950/90 border border-zinc-800 rounded-md p-3 font-mono text-[11px] text-rose-300 break-words select-text">
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-zinc-800/80 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Terminal size={11} /> Mensaje del Error
              </span>
              <button
                type="button"
                onClick={this.handleCopyDiagnostic}
                className="hover:text-zinc-300 flex items-center gap-1 transition-colors"
                title="Copiar diagnóstico al portapapeles"
              >
                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                <span>{copied ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
            {error?.message || String(error) || 'Error desconocido de renderizado'}
          </div>

          {/* Collapsible Stack Trace */}
          {(errorInfo?.componentStack || error?.stack) && (
            <div className="border border-zinc-800/80 rounded-md overflow-hidden bg-zinc-950/50">
              <button
                type="button"
                onClick={() => this.setState((prev) => ({ showStack: !prev.showStack }))}
                className="w-full px-3 py-2 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 flex items-center justify-between transition-colors"
              >
                <span>Detalles técnicos (Stack Trace)</span>
                {showStack ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {showStack && (
                <div className="p-3 border-t border-zinc-800/80 bg-zinc-950 font-mono text-[10px] text-zinc-400 max-h-40 overflow-y-auto leading-normal whitespace-pre-wrap select-text">
                  {errorInfo?.componentStack || error?.stack}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={this.handleResetDefaults}
              className="px-3 py-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 rounded-md transition-colors flex items-center gap-1.5"
            >
              <RotateCcw size={12} />
              <span>Ajustes por Defecto</span>
            </button>

            <button
              type="button"
              onClick={this.handleReload}
              className="px-3.5 py-1.5 text-xs font-semibold font-mono bg-zinc-100 hover:bg-white text-zinc-900 rounded-md transition-colors shadow-sm flex items-center gap-1.5"
            >
              <RefreshCw size={12} />
              <span>Reinicializar Cristi AI</span>
            </button>
          </div>

        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
