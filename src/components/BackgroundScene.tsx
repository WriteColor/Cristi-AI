import React, { useEffect, useRef, useState } from 'react';
import { sceneManager, SceneState } from '../domain/scenes/SceneManager.js';

export const BackgroundScene: React.FC = React.memo(function BackgroundScene() {
  const [sceneState, setSceneState] = useState<SceneState>(() => sceneManager.getScene());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = sceneManager.onSceneChange((newState: SceneState) => {
      setSceneState(newState);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const { sceneId, isSceneVisible } = sceneState;

  // ── Matrix Digital Rain Canvas Effect ─────────────────────────────────────
  useEffect(() => {
    if (sceneId !== 'matrix_rain' || !isSceneVisible) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const characters = 'アカサタナハマヤラワ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>{}[]=+/\\';
    const fontSize = 16;
    const columns = Math.floor(width / fontSize);
    const drops: number[] = new Array(columns).fill(1);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    let lastTime = 0;
    const interval = 33; // ~30-60 FPS matrix draw

    const draw = (currentTime: number) => {
      animFrameRef.current = requestAnimationFrame(draw);
      const delta = currentTime - lastTime;
      if (delta < interval) return;
      lastTime = currentTime;

      ctx.fillStyle = 'rgba(4, 5, 7, 0.08)';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#a855f7';
      ctx.font = `${fontSize}px "JetBrains Mono", monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = characters.charAt(Math.floor(Math.random() * characters.length));
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        if (Math.random() > 0.95) {
          ctx.fillStyle = '#f8fafc';
        } else {
          ctx.fillStyle = i % 3 === 0 ? '#38bdf8' : '#a855f7';
        }

        ctx.fillText(text, x, y);

        if (y > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [sceneId, isSceneVisible]);

  if (!isSceneVisible || sceneId === 'transparent') {
    return null;
  }

  // ── Matrix Rain Canvas ───────────────────────────────────────────────────
  if (sceneId === 'matrix_rain') {
    return (
      <div className="fixed inset-0 pointer-events-none z-0 w-full h-full overflow-hidden select-none bg-black">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-linear-to-t from-zinc-950/70 via-transparent to-zinc-950/40" />
      </div>
    );
  }

  return null;
});

export default BackgroundScene;
