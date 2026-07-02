import { useEffect, useRef } from 'react';
import { LOGICAL_W, LOGICAL_H } from '../core/coords';
import { audioGuide } from '../core/audio/AudioGuide';
import type { Highlight } from '../core/engine/highlights';

// SPEC §4.6 — 実プレイの軌跡を2倍速でキラキラ再生。1件10秒以内、スキップ可。

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export function HighlightPlayer({
  highlights,
  withIntro,
  onDone,
}: {
  highlights: Highlight[];
  withIntro: boolean;
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (highlights.length === 0) {
      onDoneRef.current();
      return;
    }

    if (withIntro) audioGuide.speak('app.highlight.intro');

    let raf = 0;
    let disposed = false;
    let hlIndex = 0;
    let hlStart = performance.now() + (withIntro ? 1800 : 400);
    let finishedAt = 0;
    const sparks: Spark[] = [];

    const finishAll = () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      audioGuide.speak('app.highlight.praise');
      window.setTimeout(() => onDoneRef.current(), 1600);
    };

    const loop = () => {
      if (disposed) return;
      const now = performance.now();
      const hl = highlights[hlIndex];
      const samples = hl.play.replay ?? [];
      const lastT = samples.length > 0 ? samples[samples.length - 1].t : 0;
      // 2倍速、ただし1件10秒以内に収める（SPEC §4.6）
      const timeScale = Math.max(2, lastT / 10_000);
      const tPlay = Math.max(0, (now - hlStart) * timeScale);

      ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
      const bg = ctx.createRadialGradient(640, 300, 100, 640, 400, 900);
      bg.addColorStop(0, '#22213a');
      bg.addColorStop(1, '#131223');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      // 軌跡（再生済み部分）
      let head = samples[0];
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 226, 150, 0.75)';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(255, 226, 150, 0.8)';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      let begun = false;
      for (const s of samples) {
        if (s.t > tPlay) break;
        head = s;
        if (!begun) {
          ctx.moveTo(s.x, s.y);
          begun = true;
        } else {
          ctx.lineTo(s.x, s.y);
        }
      }
      if (begun) ctx.stroke();
      ctx.restore();

      // 先端のキラキラ
      if (head && tPlay > 0 && tPlay <= lastT) {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          sparks.push({
            x: head.x,
            y: head.y,
            vx: Math.cos(a) * (0.5 + Math.random() * 1.5),
            vy: Math.sin(a) * (0.5 + Math.random() * 1.5) - 0.5,
            life: 1,
          });
        }
      }
      for (const p of sparks) {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        ctx.fillStyle = `rgba(255, 240, 190, ${Math.max(0, p.life)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * p.life + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        if (sparks[i].life <= 0) sparks.splice(i, 1);
      }

      // 1件終了 → ファンファーレ → 次へ
      if (tPlay > lastT && finishedAt === 0) {
        finishedAt = now;
        audioGuide.chime();
      }
      if (finishedAt > 0 && now - finishedAt > 1000) {
        if (hlIndex + 1 < highlights.length) {
          hlIndex += 1;
          hlStart = now + 400;
          finishedAt = 0;
          sparks.length = 0;
        } else {
          finishAll();
          return;
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, [highlights, withIntro]);

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" width={LOGICAL_W} height={LOGICAL_H} />
      <button className="icon-button skip-button" onClick={() => onDoneRef.current()} aria-label="スキップ">
        ▶▶
      </button>
    </>
  );
}
