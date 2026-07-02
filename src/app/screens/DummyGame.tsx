import { useEffect, useRef } from 'react';
import { LOGICAL_W, LOGICAL_H } from '../../core/coords';
import { audioGuide } from '../../core/audio/AudioGuide';
import {
  PointerEventSource,
  detectPointerKind,
  type PointerState,
} from '../../core/input/PointerSource';
import type { PlayRecord } from '../../core/storage/db';

// P0 検証用ダミーゲーム「ほしあつめ」。
// PointerSource 経由の入力 + Canvas ゲームループ + 音声/効果音の一巡を確認する。
// ミス概念なし: ⭐に触れると集まる、それ以外は何も起きない（原則1）。

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface GameState {
  pointer: PointerState;
  star: { x: number; y: number; visible: boolean; respawnAt: number };
  particles: Particle[];
  playStart: number;
  count: number;
  finished: boolean;
}

const MARGIN = 160;

function randomStarPos() {
  return {
    x: MARGIN + Math.random() * (LOGICAL_W - MARGIN * 2),
    y: MARGIN + Math.random() * (LOGICAL_H - MARGIN * 2),
  };
}

export function DummyGame({
  endRequested,
  onPlay,
  onFinish,
}: {
  endRequested: boolean;
  onPlay: (play: PlayRecord) => void;
  onFinish: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const endRequestedRef = useRef(endRequested);
  endRequestedRef.current = endRequested;
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state: GameState = {
      pointer: { x: LOGICAL_W / 2, y: LOGICAL_H / 2, active: false, confidence: 1, timestamp: 0 },
      star: { ...randomStarPos(), visible: true, respawnAt: 0 },
      particles: [],
      playStart: performance.now(),
      count: 0,
      finished: false,
    };

    const source = new PointerEventSource(canvas, detectPointerKind());
    const unsubscribe = source.subscribe((s) => {
      state.pointer = s;
    });
    void source.start();
    audioGuide.speak('dummy.intro');

    const collect = (now: number) => {
      state.star.visible = false;
      state.count += 1;
      audioGuide.chime();
      for (let i = 0; i < 24; i++) {
        const a = (Math.PI * 2 * i) / 24;
        const v = 2 + Math.random() * 3;
        state.particles.push({
          x: state.star.x,
          y: state.star.y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 1,
        });
      }
      onPlayRef.current({
        game: 'dummy',
        levelId: `star-${state.count}`,
        startedAt: Date.now() - (now - state.playStart),
        durationMs: now - state.playStart,
        completed: true,
        metrics: {},
      });
      state.playStart = now;

      // セッション時間切れならキリの良いここで終了（強制中断しない、SPEC §4.4.3）
      if (endRequestedRef.current) {
        state.finished = true;
        window.setTimeout(() => onFinishRef.current(), 1200);
      } else {
        const next = randomStarPos();
        state.star.x = next.x;
        state.star.y = next.y;
        state.star.respawnAt = now + 600;
      }
    };

    let raf = 0;
    const loop = () => {
      const now = performance.now();

      if (!state.finished) {
        if (!state.star.visible && now >= state.star.respawnAt && state.star.respawnAt > 0) {
          state.star.visible = true;
          state.star.respawnAt = 0;
        }
        if (state.star.visible && state.pointer.active) {
          const dx = state.pointer.x - state.star.x;
          const dy = state.pointer.y - state.star.y;
          if (dx * dx + dy * dy < 70 * 70) collect(now);
        }
      }

      for (const p of state.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= 0.02;
      }
      state.particles = state.particles.filter((p) => p.life > 0);

      // 描画
      ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
      const bg = ctx.createRadialGradient(640, 300, 100, 640, 400, 900);
      bg.addColorStop(0, '#1b2a3a');
      bg.addColorStop(1, '#0e1721');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      if (state.star.visible) {
        const pulse = 1 + 0.06 * Math.sin(now / 300);
        ctx.save();
        ctx.translate(state.star.x, state.star.y);
        ctx.scale(pulse, pulse);
        ctx.font = '96px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(255,220,120,0.8)';
        ctx.shadowBlur = 30;
        ctx.fillText('⭐', 0, 0);
        ctx.restore();
      }

      for (const p of state.particles) {
        ctx.fillStyle = `rgba(255, 230, 140, ${p.life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 * p.life + 1, 0, Math.PI * 2);
        ctx.fill();
      }

      // カーソルの柔らかい光
      const glow = ctx.createRadialGradient(
        state.pointer.x,
        state.pointer.y,
        2,
        state.pointer.x,
        state.pointer.y,
        state.pointer.active ? 34 : 22,
      );
      glow.addColorStop(0, 'rgba(160, 220, 255, 0.9)');
      glow.addColorStop(1, 'rgba(160, 220, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(state.pointer.x, state.pointer.y, state.pointer.active ? 34 : 22, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      source.stop();
    };
  }, []);

  return <canvas ref={canvasRef} className="game-canvas" width={LOGICAL_W} height={LOGICAL_H} />;
}
