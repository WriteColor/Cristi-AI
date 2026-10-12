import React, { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Square,
  Volume2,
  Volume1,
  VolumeX,
  Search,
  ExternalLink,
  Music,
  Radio,
  ShieldCheck,
  Cpu,
  RefreshCw,
  Sparkles,
  Layers,
  Heart,
  Key,
  User,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Speaker,
  Laptop,
  Smartphone,
  Headphones,
  Save,
  Link2
} from 'lucide-react';
import { windowsMediaService } from '../../domain/media/WindowsMediaService.js';
import { soundFxService } from '../../domain/audio/SoundFxService.js';
import { toastService } from '../../infrastructure/notifications/toastService.js';
import { modularConfigManager } from '../../config/ModularConfigManager';
import { detectMusicMood } from '../../mcp/servers/spotify/SpotifyEmotionBridge';
import { electronBridge } from '../../services/desktop/ElectronBridge';

interface PlaybackStatus {
  isSpotifyRunning: boolean;
  trackInfo: string | null;
  artist: string | null;
  title: string | null;
  isPlaying: boolean;
  source: 'spotify' | 'system' | 'none';
}

const QUICK_SUGGESTIONS = [
  'Lofi Hip Hop',
  'Synthwave Radio',
  'Coding Focus',
  'Top 50 Global'
];

export const WindowsMediaTab: React.FC = () => {
  const [status, setStatus] = useState<PlaybackStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [enableLive2dReactions, setEnableLive2dReactions] = useState(true);

  // Spotify OAuth & Developer Credentials State
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('http://127.0.0.1:8888/callback');
  const [session, setSession] = useState<any | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  const fetchSessionAndDevices = useCallback(async () => {
    try {
      let sess = await electronBridge.spotifyGetSession();
      if (!sess || (!sess.authenticated && !(sess as any).isAuthenticated)) {
        const modCfg = modularConfigManager.getSection('spotify');
        if (modCfg && (modCfg.authenticated || modCfg.accessToken)) {
          sess = {
            authenticated: true,
            userProfile: modCfg.userProfile,
            expiresAt: modCfg.expiresAt,
            clientId: modCfg.clientId,
            hasRefreshToken: Boolean(modCfg.refreshToken)
          };
        }
      }
      setSession(sess);
      const isAuth = Boolean(sess && ((sess as any).authenticated || (sess as any).isAuthenticated));
      if (isAuth) {
        setIsLoadingDevices(true);
        try {
          const devRes: any = await electronBridge.spotifyWebApi('getDevices');
          const devList = Array.isArray(devRes?.devices)
            ? devRes.devices
            : Array.isArray(devRes)
            ? devRes
            : [];
          setDevices(devList);
        } catch {
          setDevices([]);
        } finally {
          setIsLoadingDevices(false);
        }
      } else {
        setDevices([]);
      }
    } catch {
      setSession(null);
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    void modularConfigManager.loadAll().then(() => {
      const cfg = modularConfigManager.getSection('spotify');
      if (typeof cfg?.enableLive2dReactions === 'boolean') {
        setEnableLive2dReactions(cfg.enableLive2dReactions);
      }
      if (cfg?.clientId) setClientId(cfg.clientId);
      if (cfg?.clientSecret) setClientSecret(cfg.clientSecret);
      if (cfg?.redirectUri) setRedirectUri(cfg.redirectUri);
    });

    void fetchSessionAndDevices();
    const unsub = electronBridge.onSpotifySessionUpdated?.(() => {
      void fetchSessionAndDevices();
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [fetchSessionAndDevices]);

  const handleSaveCredentials = async () => {
    soundFxService.playClick();
    try {
      modularConfigManager.updateSection('spotify', { clientId, clientSecret, redirectUri });
      toastService.success('Credenciales guardadas', 'Configuración de Spotify Developer guardada correctamente.');
    } catch (err) {
      toastService.error('Error al guardar credenciales', String(err));
    }
  };

  const handleStartAuth = async () => {
    soundFxService.playClick();
    setIsAuthenticating(true);
    try {
      const res = await electronBridge.spotifyStartAuth({ clientId, clientSecret, redirectUri });
      await fetchSessionAndDevices();
      if (res?.success) {
        toastService.success('Spotify Vinculado', 'Autenticación con Spotify completada.');
      } else {
        toastService.error('Error al vincular cuenta', res?.error || 'No se pudo iniciar el flujo OAuth.');
      }
    } catch (err) {
      toastService.error('Error de autenticación', String(err));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    soundFxService.playClick();
    try {
      await electronBridge.spotifyLogout();
      modularConfigManager.updateSection('spotify', {
        authenticated: false,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        userProfile: null
      });
      await fetchSessionAndDevices();
      void fetchStatus();
      toastService.success('Sesión cerrada', 'Cuenta de Spotify desvinculada.');
    } catch (err) {
      toastService.error('Error al cerrar sesión', String(err));
    }
  };

  const handleSelectDevice = async (deviceId: string) => {
    soundFxService.playClick();
    try {
      await electronBridge.spotifyWebApi('transferPlayback', { deviceId, play: true });
      toastService.success('Dispositivo seleccionado', 'Reproducción transferida correctamente.');
      setTimeout(() => {
        void fetchSessionAndDevices();
        void fetchStatus();
      }, 500);
    } catch (err) {
      toastService.error('Error al transferir reproducción', String(err));
    }
  };

  const handleToggleLive2dReactions = () => {
    soundFxService.playClick();
    const next = !enableLive2dReactions;
    setEnableLive2dReactions(next);
    modularConfigManager.updateSection('spotify', { enableLive2dReactions: next });
    toastService.success(
      next ? 'Reacciones Live2D activadas' : 'Reacciones Live2D pausadas',
      next ? 'Cristi reaccionará al ánimo musical en vivo.' : 'El avatar permanecerá en estado neutral.'
    );
  };

  const fetchStatus = useCallback(async () => {
    try {
      setIsLoadingStatus(true);
      const res = await windowsMediaService.getStatus();
      if (res.status === 'success' && res.data) {
        setStatus(res.data as PlaybackStatus);
      } else {
        setStatus({
          isSpotifyRunning: false,
          trackInfo: null,
          artist: null,
          title: null,
          isPlaying: false,
          source: 'none'
        });
      }
    } catch {
      setStatus({
        isSpotifyRunning: false,
        trackInfo: null,
        artist: null,
        title: null,
        isPlaying: false,
        source: 'none'
      });
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => {
      void fetchStatus();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleMediaControl = async (action: 'play_pause' | 'next' | 'previous' | 'stop' | 'volume_up' | 'volume_down' | 'mute') => {
    soundFxService.playClick();
    setIsExecutingAction(true);
    try {
      await windowsMediaService.control(action);
      // Wait a moment for Windows SMTC title/state to update
      setTimeout(() => {
        void fetchStatus();
      }, 350);
    } catch (err) {
      toastService.error('Error al enviar control multimedia', String(err));
    } finally {
      setIsExecutingAction(false);
    }
  };

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    soundFxService.playClick();
    try {
      const res = await windowsMediaService.launchSpotify(query);
      if (res.status === 'success') {
        toastService.success('Spotify iniciado', `Buscando en Spotify: "${query}"`);
        setTimeout(() => void fetchStatus(), 1200);
      } else {
        toastService.error('Fallo al abrir Spotify', res.message || 'No se pudo abrir la aplicación.');
      }
    } catch (err) {
      toastService.error('Error al ejecutar Spotify', String(err));
    }
  };

  const handleQuickLaunch = async (query: string) => {
    setSearchQuery(query);
    soundFxService.playClick();
    try {
      const res = await windowsMediaService.launchSpotify(query);
      if (res.status === 'success') {
        toastService.success('Spotify iniciado', `Reproduciendo: "${query}"`);
        setTimeout(() => void fetchStatus(), 1200);
      }
    } catch (err) {
      toastService.error('Error al abrir sugerencia', String(err));
    }
  };

  // Session derived properties
  const isAuthenticated = Boolean(session && ((session as any).authenticated || (session as any).isAuthenticated));
  const userProfile = session?.userProfile || session?.user || (session?.id ? session : null);
  const userDisplayName = userProfile?.display_name || userProfile?.displayName || userProfile?.name || 'Usuario Spotify';
  const userEmail = userProfile?.email || '';
  const userProduct = userProfile?.product ? (userProfile.product === 'premium' ? 'Premium' : String(userProfile.product).toUpperCase()) : 'Premium / Free';
  const userAvatar = Array.isArray(userProfile?.images) && userProfile.images.length > 0 ? userProfile.images[0]?.url : undefined;

  // Status pill logic
  const renderStatusPill = () => {
    if (status?.isSpotifyRunning && status.isPlaying) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 text-emerald-300 border border-emerald-800/70 rounded-full text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Spotify Activo</span>
        </div>
      );
    }
    if (status?.isSpotifyRunning && !status.isPlaying) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-950/60 text-amber-300 border border-amber-800/70 rounded-full text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>Spotify en Pausa</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 text-zinc-400 border border-zinc-700/60 rounded-full text-xs font-mono">
        <span className="w-2 h-2 rounded-full bg-zinc-500" />
        <span>Spotify Cerrado</span>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-5 pr-1 text-zinc-200">
      {/* ── Encabezado ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-100 flex items-center gap-2">
            <Music size={16} className="text-zinc-400" />
            <span>Control Multimedia & Spotify para Windows</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Integración de transporte multimedia a través de Windows SMTC y simulación de teclas de hardware.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {renderStatusPill()}
          <button
            type="button"
            onClick={() => {
              soundFxService.playClick();
              void fetchStatus();
            }}
            disabled={isLoadingStatus}
            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-sm transition-colors disabled:opacity-50"
            title="Actualizar estado multimedia"
          >
            <RefreshCw size={13} className={isLoadingStatus ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Live Playback Card ─────────────────────────────────── */}
      <div className="border border-zinc-800 bg-zinc-900/40 rounded-sm p-4 relative overflow-hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={`w-12 h-12 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
              status?.isPlaying
                ? 'bg-zinc-900 border-zinc-700 text-emerald-400 shadow-sm'
                : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
            }`}>
              <Music size={22} className={status?.isPlaying ? 'animate-bounce' : ''} />
            </div>

            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                  {status?.isPlaying ? 'Reproduciendo Ahora' : 'Estado de Reproducción'}
                </span>
                {status?.source === 'spotify' && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-800 text-zinc-300 border border-zinc-700/60 rounded-none">
                    Spotify Win32
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold font-mono text-zinc-100 truncate">
                {status?.title || (status?.isSpotifyRunning ? 'Spotify en pausa o esperando pista' : 'Sin reproducción activa')}
              </p>
              <p className="text-xs text-zinc-400 font-mono truncate">
                {status?.artist || (status?.isSpotifyRunning ? 'Spotify Desktop' : 'Inicia la aplicación de Spotify para sincronizar')}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end shrink-0 gap-1 text-[11px] font-mono text-zinc-500">
            <div className="flex items-center gap-1.5">
              <Radio size={12} className={status?.isPlaying ? 'text-emerald-400' : 'text-zinc-600'} />
              <span>SMTC Activo</span>
            </div>
            <span>Windows Virtual Keys</span>
          </div>
        </div>
      </div>

      {/* ── Media Controls Toolbar ─────────────────────────────── */}
      <div className="border border-zinc-800 bg-zinc-900/30 rounded-sm p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-medium">
            Barra de Control Multimedia
          </span>
          <span className="text-[11px] font-mono text-zinc-500">
            Acciones globales de teclado
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Previous Track */}
          <button
            type="button"
            onClick={() => void handleMediaControl('previous')}
            disabled={isExecutingAction}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 rounded-sm text-xs font-mono transition-colors disabled:opacity-50"
            title="Pista anterior"
          >
            <SkipBack size={14} />
            <span>Anterior</span>
          </button>

          {/* Play/Pause */}
          <button
            type="button"
            onClick={() => void handleMediaControl('play_pause')}
            disabled={isExecutingAction}
            className={`flex items-center gap-1.5 px-4 py-2 border rounded-sm text-xs font-mono font-medium transition-colors disabled:opacity-50 ${
              status?.isPlaying
                ? 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-200 border-amber-700/70'
                : 'bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-600'
            }`}
            title="Reproducir / Pausar"
          >
            {status?.isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span>{status?.isPlaying ? 'Pausar' : 'Reproducir'}</span>
          </button>

          {/* Stop */}
          <button
            type="button"
            onClick={() => void handleMediaControl('stop')}
            disabled={isExecutingAction}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 rounded-sm text-xs font-mono transition-colors disabled:opacity-50"
            title="Detener reproducción"
          >
            <Square size={13} />
            <span>Detener</span>
          </button>

          {/* Next Track */}
          <button
            type="button"
            onClick={() => void handleMediaControl('next')}
            disabled={isExecutingAction}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 rounded-sm text-xs font-mono transition-colors disabled:opacity-50"
            title="Siguiente pista"
          >
            <span>Siguiente</span>
            <SkipForward size={14} />
          </button>

          <div className="h-5 w-px bg-zinc-800 mx-1 hidden sm:block" />

          {/* Volume Down */}
          <button
            type="button"
            onClick={() => void handleMediaControl('volume_down')}
            disabled={isExecutingAction}
            className="flex items-center gap-1 px-2.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-sm text-xs font-mono transition-colors disabled:opacity-50"
            title="Bajar volumen"
          >
            <Volume1 size={14} />
            <span>Vol -</span>
          </button>

          {/* Volume Up */}
          <button
            type="button"
            onClick={() => void handleMediaControl('volume_up')}
            disabled={isExecutingAction}
            className="flex items-center gap-1 px-2.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-sm text-xs font-mono transition-colors disabled:opacity-50"
            title="Subir volumen"
          >
            <Volume2 size={14} />
            <span>Vol +</span>
          </button>

          {/* Volume Mute */}
          <button
            type="button"
            onClick={() => void handleMediaControl('mute')}
            disabled={isExecutingAction}
            className="flex items-center gap-1 px-2.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-sm text-xs font-mono transition-colors disabled:opacity-50"
            title="Silenciar / Reactivar audio"
          >
            <VolumeX size={14} />
            <span>Mute</span>
          </button>
        </div>
      </div>

      {/* ── Sesión de Spotify & Credenciales Developer ────────── */}
      <div className="border border-zinc-800 bg-zinc-900/30 rounded-sm p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-zinc-200 flex items-center gap-2">
              <Key size={14} className="text-emerald-400" />
              <span>Sesión de Spotify & Credenciales Developer</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Gestión de credenciales OAuth 2.0 y estado de sesión Web API para control agéntico de Spotify.
            </p>
          </div>

          <div>
            {isAuthenticated ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 text-emerald-300 border border-emerald-800/70 rounded-full text-xs font-mono">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span>Sesión Web API Conectada</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 text-zinc-400 border border-zinc-700/60 rounded-full text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-zinc-500" />
                <span>Modo Local SMTC Activo (Sin Sesión Web API)</span>
              </div>
            )}
          </div>
        </div>

        {/* Auth status block: Available ONLY if not verified */}
        {!isAuthenticated ? (
          <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-sm space-y-4">
            <div>
              <span className="text-xs font-semibold font-mono text-zinc-300 block">
                Vincular con Spotify Developer (OAuth 2.0)
              </span>
              <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                Ingresa tu Client ID y Client Secret de Spotify Developer para autorizar la integración Web API.
              </p>
            </div>

            {/* Inputs de credenciales */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-mono text-zinc-400 block">Client ID</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Spotify Developer Client ID"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-600 rounded-sm px-2.5 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-zinc-400 block">Client Secret</label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Spotify Developer Client Secret"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-600 rounded-sm px-2.5 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-zinc-400 block">Redirect URI</label>
                <input
                  type="text"
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  placeholder="http://127.0.0.1:8888/callback"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-600 rounded-sm px-2.5 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
              <button
                type="button"
                onClick={() => void handleSaveCredentials()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-sm text-xs font-mono transition-colors cursor-pointer"
              >
                <Save size={13} />
                <span>Guardar Credenciales</span>
              </button>

              <button
                type="button"
                onClick={() => void handleStartAuth()}
                disabled={isAuthenticating}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 text-white disabled:text-zinc-500 rounded-sm text-xs font-mono font-medium transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <>
                    <Link2 size={14} />
                    <span>Vincular Cuenta de Spotify (OAuth)</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-2.5 bg-zinc-900/60 border border-zinc-800/60 rounded text-[11px] font-mono text-zinc-400 space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-300">
                <AlertCircle size={13} className="text-amber-400 shrink-0" />
                <span>¿Cómo obtener tus credenciales de Spotify Developer?</span>
              </div>
              <p>
                1. Accede a tu consola en{' '}
                <a
                  href="https://developer.spotify.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  https://developer.spotify.com/dashboard <ExternalLink size={10} />
                </a>{' '}
                y crea una App (o entra a una existente).
              </p>
              <p>
                2. En los ajustes de la App (Settings), configura la Redirect URI exactamente en:{' '}
                <code className="text-zinc-200 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 font-mono">
                  http://127.0.0.1:8888/callback
                </code>
              </p>
              <p>
                3. Copia el Client ID y Client Secret, pégalos aquí arriba, haz clic en "Guardar Credenciales" y luego en "Vincular Cuenta de Spotify (OAuth)".
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-sm space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt={userDisplayName}
                    className="w-10 h-10 rounded-full border border-emerald-500/40 object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-emerald-400">
                    <User size={18} />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold font-mono text-zinc-100">
                      {userDisplayName}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800/80 rounded">
                      {userProduct}
                    </span>
                  </div>
                  {userEmail && (
                    <p className="text-[11px] font-mono text-zinc-400">{userEmail}</p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleLogout()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-800/60 rounded-sm text-xs font-mono transition-colors cursor-pointer"
              >
                <LogOut size={13} />
                <span>Desvincular / Cerrar Sesión</span>
              </button>
            </div>

            {/* Active Spotify Connect Devices */}
            <div className="pt-2 border-t border-zinc-800/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Speaker size={12} className="text-emerald-400" /> Dispositivos Spotify Connect Disponibles:
                </span>
                {isLoadingDevices && (
                  <Loader2 size={12} className="animate-spin text-zinc-500" />
                )}
              </div>

              {devices.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {devices.map((dev: any) => {
                    const isActive = Boolean(dev.is_active);
                    const devType = String(dev.type || '').toLowerCase();
                    const DevIcon = devType.includes('computer')
                      ? Laptop
                      : devType.includes('smartphone')
                      ? Smartphone
                      : devType.includes('audio') || devType.includes('speaker')
                      ? Speaker
                      : Headphones;

                    return (
                      <button
                        key={dev.id}
                        type="button"
                        onClick={() => void handleSelectDevice(dev.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-mono border transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-emerald-950/70 border-emerald-700/80 text-emerald-200'
                            : 'bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        }`}
                        title={isActive ? 'Dispositivo activo' : 'Hacer clic para transferir reproducción aquí'}
                      >
                        <DevIcon size={13} className={isActive ? 'text-emerald-400' : 'text-zinc-500'} />
                        <span>{dev.name || 'Dispositivo'}</span>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] font-mono text-zinc-500 italic">
                  No se detectaron dispositivos Connect activos. Abre Spotify en tu PC, móvil o altavoz para conectar.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Quick Search & Launch ──────────────────────────────── */}
      <div className="border border-zinc-800 bg-zinc-900/30 rounded-sm p-4 space-y-3">
        <div>
          <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-zinc-200 flex items-center gap-2">
            <Search size={14} className="text-zinc-400" />
            <span>Búsqueda Rápida & Lanzador de Spotify</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Abre directamente canciones, álbumes o listas de reproducción usando el protocolo nativo de Spotify en Windows.
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar canción, artista o playlist en Spotify..."
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-sm px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <button
            type="submit"
            disabled={!searchQuery.trim()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-600 rounded-sm text-xs font-mono transition-colors disabled:opacity-50 shrink-0"
          >
            <ExternalLink size={13} />
            <span>Abrir en Spotify</span>
          </button>
        </form>

        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1">
            <Sparkles size={11} /> Accesos rápidos:
          </span>
          {QUICK_SUGGESTIONS.map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => void handleQuickLaunch(sug)}
              className="text-[11px] font-mono px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-sm transition-colors"
            >
              {sug}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sincronización Emocional con Avatar Live2D ────────── */}
      <div className="border border-zinc-800 bg-zinc-900/30 rounded-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-zinc-200 flex items-center gap-2">
              <Heart size={14} className="text-fuchsia-400" />
              <span>Sincronización Emocional con Avatar Live2D</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              El servidor MCP de Spotify analiza el ánimo de las pistas y sincroniza expresiones y movimientos de Cristi en tiempo real.
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleLive2dReactions}
            className={`px-3 py-1.5 rounded-sm text-xs font-mono border transition-colors cursor-pointer ${
              enableLive2dReactions
                ? 'bg-fuchsia-950/50 text-fuchsia-300 border-fuchsia-700/60'
                : 'bg-zinc-900 text-zinc-500 border-zinc-800'
            }`}
          >
            {enableLive2dReactions ? 'Reacciones Activas' : 'Desactivado'}
          </button>
        </div>

        {/* Current Track Mood Preview */}
        {status?.isPlaying && status.title && (
          <div className="p-2.5 bg-zinc-950/70 border border-zinc-800/80 rounded flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400">Ánimo detectado para pista actual:</span>
            <span className="px-2 py-0.5 bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/30 rounded capitalize">
              {detectMusicMood(status.title).mood} → Live2D: {detectMusicMood(status.title).suggestedEmotion}
            </span>
          </div>
        )}

        {/* Mood mapping reference table */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
          <div className="p-2 bg-zinc-950/40 border border-zinc-800/60 rounded">
            <span className="text-cyan-400 font-medium block">Lofi / Chill</span>
            <span className="text-zinc-500">Emoción: idle (sway)</span>
          </div>
          <div className="p-2 bg-zinc-950/40 border border-zinc-800/60 rounded">
            <span className="text-emerald-400 font-medium block">Rock / Punk</span>
            <span className="text-zinc-500">Emoción: happy (nod)</span>
          </div>
          <div className="p-2 bg-zinc-950/40 border border-zinc-800/60 rounded">
            <span className="text-rose-400 font-medium block">Metal / Hardcore</span>
            <span className="text-zinc-500">Emoción: crazy (headbang)</span>
          </div>
          <div className="p-2 bg-zinc-950/40 border border-zinc-800/60 rounded">
            <span className="text-pink-400 font-medium block">Amor / Romance</span>
            <span className="text-zinc-500">Emoción: blush (sway)</span>
          </div>
          <div className="p-2 bg-zinc-950/40 border border-zinc-800/60 rounded">
            <span className="text-purple-400 font-medium block">Goth / Darkwave</span>
            <span className="text-zinc-500">Emoción: yandere (nod)</span>
          </div>
          <div className="p-2 bg-zinc-950/40 border border-zinc-800/60 rounded">
            <span className="text-amber-400 font-medium block">Electro / Pop</span>
            <span className="text-zinc-500">Emoción: happy (dance)</span>
          </div>
        </div>
      </div>

      {/* ── Native Integration Architecture Callout ────────────── */}
      <div className="border border-zinc-800 bg-zinc-900/20 rounded-sm p-4 space-y-2">
        <div className="flex items-center gap-2 text-zinc-200">
          <ShieldCheck size={16} className="text-emerald-400" />
          <h4 className="text-xs font-semibold font-mono uppercase tracking-wider text-zinc-200">
            Arquitectura de Integración Nativa Windows SMTC
          </h4>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Cristi AI interactúa directamente con el subsistema <strong>System Media Transport Controls (SMTC)</strong> de Windows
          y la simulación de keycodes multimedia del kernel. Esta arquitectura prescinde por completo de cuentas de desarrollador,
          tokens de autenticación OAuth, llamadas a APIs remotas o servidores HTTP locales en segundo plano.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <div className="p-2 bg-zinc-950/60 border border-zinc-800/80 rounded-sm text-[11px] font-mono text-zinc-300">
            <span className="text-zinc-100 font-semibold block">Cero Dependencias de Red</span>
            Los controles multimedia funcionan de manera 100% local y autónoma, incluso sin conexión a Internet.
          </div>
          <div className="p-2 bg-zinc-950/60 border border-zinc-800/80 rounded-sm text-[11px] font-mono text-zinc-300">
            <span className="text-zinc-100 font-semibold block">Sin Expiración de Sesión</span>
            No requiere renovación de tokens OAuth ni reautenticaciones periódicas.
          </div>
        </div>
      </div>
    </div>
  );
};
