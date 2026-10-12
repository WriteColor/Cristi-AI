/**
 * Cristi AI - Standalone Optical Camera Application Window
 * 100% Minimalist Dark Zinc Shadcn UI Aesthetic
 * Dedicated Electron BrowserWindow with hardware-accelerated WebRTC playback,
 * dynamic device switching, accurate requestVideoFrameCallback FPS telemetry,
 * real-time resolution telemetry, snapshot capture with shutter sound feedback,
 * and BroadcastChannel streaming for Gemini Live vision.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  VideoOff,
  Camera,
  RefreshCw,
  Check,
  ChevronDown
} from 'lucide-react';
import { soundFxService } from '../domain/audio/SoundFxService.js';

interface VideoResolution {
  width: number;
  height: number;
}

export const CameraApp: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Telemetry
  const [resolution, setResolution] = useState<VideoResolution>({ width: 0, height: 0 });
  const [fps, setFps] = useState<number>(0);
  const [snapshotSuccess, setSnapshotSuccess] = useState<boolean>(false);
  const [shutterFlash, setShutterFlash] = useState<boolean>(false);

  // BroadcastChannel to stream frames to Cristi AI core
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    try {
      broadcastChannelRef.current = new BroadcastChannel('cristi_camera_stream');
    } catch (_) {}
    return () => {
      try {
        broadcastChannelRef.current?.close();
      } catch (_) {}
    };
  }, []);

  // Enumerate video devices
  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
      setDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.error('Error al enumerar dispositivos de video:', err);
    }
  }, [selectedDeviceId]);

  // Listen to device changes (webcam plugged/unplugged)
  useEffect(() => {
    void refreshDevices();

    const handleDeviceChange = () => {
      void refreshDevices();
    };

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshDevices]);

  // Strict Hardware Cleanup
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (_) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setFps(0);
  }, []);

  // Start Camera Stream
  const startCamera = useCallback(async (devId: string) => {
    try {
      setError(null);
      // Clean up any ongoing hardware stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (_) {}
        });
        streamRef.current = null;
      }

      const constraints: MediaStreamConstraints = {
        video: devId
          ? { deviceId: { exact: devId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
          setResolution({
            width: videoRef.current.videoWidth,
            height: videoRef.current.videoHeight
          });
        }
      }

      setIsStreaming(true);
      await refreshDevices();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Error al iniciar stream de cámara:', err);
      setError(`No se pudo inicializar la cámara: ${msg}`);
      setIsStreaming(false);
    }
  }, [refreshDevices]);

  // Initialize camera and switch dynamically
  useEffect(() => {
    void startCamera(selectedDeviceId);
    return () => {
      stopCamera();
    };
  }, [selectedDeviceId, startCamera, stopCamera]);

  // Release hardware instantly if window or tab unloads
  useEffect(() => {
    const handleBeforeUnload = () => {
      stopCamera();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [stopCamera]);

  // Handle device switch
  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDeviceId(newId);
  };

  // Accurate FPS Calculation & Live Resolution Telemetry
  // Uses requestVideoFrameCallback when available with requestAnimationFrame timestamp delta fallback
  useEffect(() => {
    if (!isStreaming) return;

    let isSubscribed = true;
    let frameCount = 0;
    let lastFpsTime = performance.now();
    let rvfcHandle: number | null = null;
    let rafHandle: number | null = null;
    let lastBroadcastTime = 0;
    let offscreenCanvas: HTMLCanvasElement | null = null;

    const currentVideo = videoRef.current;
    const hasRvfc = currentVideo && typeof (currentVideo as any).requestVideoFrameCallback === 'function';

    // Broadcast frame loop for Gemini Live Multimodal Vision (at ~0.5 FPS)
    const broadcastPeriodicFrame = (now: DOMHighResTimeStamp) => {
      if (!currentVideo || !broadcastChannelRef.current || now - lastBroadcastTime < 2000) return;
      lastBroadcastTime = now;
      try {
        if (!offscreenCanvas) {
          offscreenCanvas = document.createElement('canvas');
          offscreenCanvas.width = 480;
          offscreenCanvas.height = 270;
        }
        const ctx = offscreenCanvas.getContext('2d');
        if (ctx && currentVideo.videoWidth > 0) {
          ctx.drawImage(currentVideo, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
          const base64 = offscreenCanvas.toDataURL('image/jpeg', 0.5).split(',')[1];
          if (base64) {
            broadcastChannelRef.current.postMessage({
              type: 'camera_frame',
              base64,
              timestamp: Date.now()
            });
          }
        }
      } catch (_) {}
    };

    if (hasRvfc && currentVideo) {
      // Hardware-accelerated presentation callback directly from Chromium video compositor
      const onVideoFrame = (now: DOMHighResTimeStamp, metadata: { width?: number; height?: number }) => {
        if (!isSubscribed) return;

        frameCount++;
        if (metadata?.width && metadata?.height) {
          setResolution({ width: metadata.width, height: metadata.height });
        } else if (currentVideo.videoWidth && currentVideo.videoHeight) {
          setResolution({ width: currentVideo.videoWidth, height: currentVideo.videoHeight });
        }

        const delta = now - lastFpsTime;
        if (delta >= 1000) {
          setFps(Math.round((frameCount * 1000) / delta));
          frameCount = 0;
          lastFpsTime = now;
        }

        broadcastPeriodicFrame(now);

        if (isSubscribed && typeof (currentVideo as any).requestVideoFrameCallback === 'function') {
          rvfcHandle = (currentVideo as any).requestVideoFrameCallback(onVideoFrame);
        }
      };

      rvfcHandle = (currentVideo as any).requestVideoFrameCallback(onVideoFrame);
    } else {
      // Fallback: RAF with timestamp delta
      const rafLoop = (now: DOMHighResTimeStamp) => {
        if (!isSubscribed) return;

        frameCount++;
        if (currentVideo && currentVideo.videoWidth && currentVideo.videoHeight) {
          setResolution({ width: currentVideo.videoWidth, height: currentVideo.videoHeight });
        }

        const delta = now - lastFpsTime;
        if (delta >= 1000) {
          setFps(Math.round((frameCount * 1000) / delta));
          frameCount = 0;
          lastFpsTime = now;
        }

        broadcastPeriodicFrame(now);

        if (isSubscribed) {
          rafHandle = requestAnimationFrame(rafLoop);
        }
      };

      rafHandle = requestAnimationFrame(rafLoop);
    }

    return () => {
      isSubscribed = false;
      if (rvfcHandle !== null && currentVideo && typeof (currentVideo as any).cancelVideoFrameCallback === 'function') {
        (currentVideo as any).cancelVideoFrameCallback(rvfcHandle);
      }
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
      }
    };
  }, [isStreaming]);

  // Capture Snapshot Tool
  const handleSnapshot = () => {
    if (!videoRef.current || !isStreaming) return;

    // Audio tactile feedback
    soundFxService.playShutter();

    // Visual shutter flash feedback
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 120);

    try {
      const snapCanvas = document.createElement('canvas');
      const vid = videoRef.current;
      snapCanvas.width = vid.videoWidth || 1920;
      snapCanvas.height = vid.videoHeight || 1080;
      const ctx = snapCanvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(vid, 0, 0, snapCanvas.width, snapCanvas.height);

      // Copy to system clipboard
      snapCanvas.toBlob((blob) => {
        if (!blob) return;
        try {
          if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
            void navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            setSnapshotSuccess(true);
            setTimeout(() => setSnapshotSuccess(false), 2200);
          }
        } catch (_) {}
      });

      // Send high-priority snapshot frame directly to Cristi AI's Gemini live session
      const base64 = snapCanvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      if (base64 && broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: 'camera_snapshot',
          base64,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      console.error('Error al capturar instantánea:', err);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 font-sans select-none overflow-hidden border border-zinc-800">

      {/* ── Top Header Toolbar (Shadcn Dark Zinc) ─────────────────────────── */}
      <header className="flex items-center justify-between px-3 py-2 bg-zinc-900/90 backdrop-blur border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-2 h-2 rounded-full ${
              isStreaming ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse' : 'bg-zinc-600'
            } shrink-0`}
          />
          <h1 className="text-xs font-semibold tracking-wider uppercase font-mono text-zinc-200">
            Cristi AI • Monitor Óptico
          </h1>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              isStreaming
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700/60'
            }`}
          >
            {isStreaming ? 'ACTIVA' : 'INACTIVA'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Device Selector */}
          <div className="relative flex items-center">
            <select
              value={selectedDeviceId}
              onChange={handleDeviceChange}
              className="appearance-none bg-zinc-950 hover:bg-zinc-850 text-zinc-300 text-xs font-mono px-2.5 py-1 pr-6 border border-zinc-700/80 rounded-md focus:outline-none focus:border-zinc-500 transition-colors max-w-[190px] truncate"
            >
              {devices.length === 0 ? (
                <option value="">Cámara Predeterminada</option>
              ) : (
                devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Cámara ${i + 1}`}
                  </option>
                ))
              )}
            </select>
            <ChevronDown size={12} className="absolute right-2 text-zinc-500 pointer-events-none" />
          </div>

          {/* Live Resolution & FPS Indicator */}
          {isStreaming && resolution.width > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-zinc-950 border border-zinc-800 rounded-md text-[10px] font-mono text-zinc-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{resolution.width} x {resolution.height}</span>
              <span className="text-zinc-600">•</span>
              <span>{fps} FPS</span>
            </div>
          )}

          {/* Snapshot Button */}
          <button
            type="button"
            onClick={handleSnapshot}
            disabled={!isStreaming}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-700/80 rounded-md text-zinc-200 hover:text-white transition-colors disabled:opacity-40 text-xs font-mono active:scale-95"
            title="Capturar fotograma, copiar al portapapeles y transmitir a Cristi AI"
          >
            {snapshotSuccess ? (
              <Check size={13} className="text-emerald-400" />
            ) : (
              <Camera size={13} />
            )}
            <span>Capturar</span>
          </button>
        </div>
      </header>

      {/* ── Main Viewport Area ────────────────────────────────────────────── */}
      <div className="relative flex-1 bg-zinc-950 overflow-hidden flex items-center justify-center">
        {/* Hardware-accelerated Video Element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setResolution({
                width: videoRef.current.videoWidth,
                height: videoRef.current.videoHeight
              });
            }
          }}
          className="w-full h-full object-contain transform-gpu"
        />

        {/* Visual Shutter Flash Effect */}
        {shutterFlash && (
          <div className="absolute inset-0 bg-white/40 pointer-events-none transition-opacity duration-100" />
        )}

        {/* Snapshot Notification Toast */}
        {snapshotSuccess && (
          <div className="absolute top-4 right-4 bg-emerald-950/95 border border-emerald-700 text-emerald-200 text-xs font-mono px-3 py-1.5 rounded-md shadow-xl flex items-center gap-2 pointer-events-none">
            <Check size={14} className="text-emerald-400" />
            <span>Fotograma copiado al portapapeles</span>
          </div>
        )}

        {/* Error / Inactive State */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 p-6 text-center gap-3">
            <div className="w-10 h-10 rounded-md bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <VideoOff size={20} />
            </div>
            <div className="max-w-sm">
              <h3 className="text-xs font-semibold text-zinc-200">Error de Dispositivo de Video</h3>
              <p className="text-[11px] font-mono text-zinc-400 mt-1">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => void startCamera(selectedDeviceId)}
              className="px-3 py-1.5 text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-md transition-colors flex items-center gap-1.5"
            >
              <RefreshCw size={12} />
              <span>Reintentar</span>
            </button>
          </div>
        )}
      </div>

    </div>
  );
};

export default CameraApp;
