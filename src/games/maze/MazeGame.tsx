import { useEffect, useRef } from 'react';
import { LOGICAL_W, LOGICAL_H } from '../../core/coords';
import { audioGuide } from '../../core/audio/AudioGuide';
import type { PointerState } from '../../core/input/PointerSource';
import { createPointerSource } from '../../core/input/inputProvider';
import { ReplayRecorder } from '../../core/engine/ReplayRecorder';
import { getProgress, setProgress, type PlayRecord } from '../../core/storage/db';
import { PolylinePath } from './geometry';
import { MAZE_LEVELS } from './levels';
import {
  HOLD_DURATION_MS,
  HOLD_RADIUS_TOUCH,
  MIN_WIDTH_TOUCH,
  RELIEF_OUT_RATIO,
  RELIEF_WIDTH_BONUS,
  STUCK_ASSIST_MS,
  type MazeLevel,
} from './types';

// モードA「ねっこの迷路」（SPEC §5）。
// 原則1: はみ出しは根が細く・薄くなる視覚変化のみ。音・停止・巻き戻しは一切ない。

type Phase = 'waiting' | 'tracing' | 'clearing';

interface StopState {
  s: number;
  x: number;
  y: number;
  status: 'pending' | 'done';
  holdMs: number;
  announced: boolean;
}

interface TrailPoint {
  x: number;
  y: number;
  health: number; // 1=通路内の健康な根、下限0.35=薄く細い根
}

interface LevelState {
  level: MazeLevel;
  index: number;
  path: PolylinePath;
  effectiveWidth: number;
  stops: StopState[];
  trail: TrailPoint[];
  phase: Phase;
  health: number;
  outMs: number;
  totalMs: number;
  startedAt: number;
  clearStartedAt: number;
  assist: boolean;
  recorder: ReplayRecorder;
}

const THEME_BG: Record<MazeLevel['theme'], [string, string]> = {
  soil: ['#3a2a1c', '#241a12'],
  rock: ['#33383f', '#1e2126'],
  water: ['#1c3345', '#122029'],
};

const CLEAR_VOICES = ['maze.clear.1', 'maze.clear.2', 'maze.clear.3'];
const CLEAR_ANIM_MS = 2600;

export function MazeGame({
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

    let raf = 0;
    let disposed = false;
    let pointer: PointerState = {
      x: LOGICAL_W / 2,
      y: LOGICAL_H / 2,
      active: false,
      confidence: 1,
      timestamp: 0,
    };
    let lastFrame = performance.now();
    let ls: LevelState | null = null;
    let cleared = 0;
    let highOutStreak = 0;
    let reliefPending = false;

    const source = createPointerSource(canvas);
    const unsubscribe = source.subscribe((s) => {
      pointer = s;
    });
    void source.start();

    function loadLevel(index: number): void {
      const level = MAZE_LEVELS[Math.min(index, MAZE_LEVELS.length - 1)];
      const path = new PolylinePath(level.path);
      const bonus = reliefPending ? RELIEF_WIDTH_BONUS : 0;
      const effectiveWidth = Math.max(level.width + bonus, MIN_WIDTH_TOUCH);
      ls = {
        level,
        index,
        path,
        effectiveWidth,
        stops: level.stops.map((s) => {
          const [x, y] = path.pointAt(s);
          return { s, x, y, status: 'pending', holdMs: 0, announced: false };
        }),
        trail: [],
        phase: 'waiting',
        health: 1,
        outMs: 0,
        totalMs: 0,
        startedAt: performance.now(),
        clearStartedAt: 0,
        assist: false,
        recorder: new ReplayRecorder(),
      };
      audioGuide.speak('maze.intro');
    }

    function clearLevel(now: number): void {
      if (!ls) return;
      const outRatio = ls.totalMs > 0 ? ls.outMs / ls.totalMs : 0;
      onPlayRef.current({
        game: 'maze',
        levelId: ls.level.id,
        startedAt: Date.now() - (now - ls.startedAt),
        durationMs: now - ls.startedAt,
        completed: true,
        metrics: {
          outRatio,
          stopsCompleted: ls.stops.filter((s) => s.status === 'done').length,
          stopsTotal: ls.stops.length,
          widthUsed: ls.effectiveWidth,
          levelIndex: ls.index,
        },
        replay: ls.recorder.finish(),
      });

      cleared = Math.max(cleared, ls.index + 1);
      // 自動救済（SPEC §5.4）: 本人には通知しない
      if (outRatio > RELIEF_OUT_RATIO) {
        highOutStreak += 1;
      } else {
        highOutStreak = 0;
      }
      reliefPending = highOutStreak >= 2;
      if (reliefPending) highOutStreak = 0;
      void setProgress('maze.cleared', cleared);
      void setProgress('maze.highOutStreak', highOutStreak);
      void setProgress('maze.reliefPending', reliefPending);

      audioGuide.speak(CLEAR_VOICES[Math.floor(Math.random() * CLEAR_VOICES.length)]);
      audioGuide.chime();
      ls.phase = 'clearing';
      ls.clearStartedAt = now;
    }

    function update(now: number, dt: number): void {
      if (!ls) return;
      const proj = ls.path.project(pointer.x, pointer.y);
      const halfWidth = ls.effectiveWidth / 2;
      const inside = proj.dist <= halfWidth;

      if (ls.phase === 'waiting') {
        const [sx, sy] = ls.path.start;
        if (pointer.active && Math.hypot(pointer.x - sx, pointer.y - sy) < halfWidth + 20) {
          ls.phase = 'tracing';
          ls.startedAt = now;
          ls.recorder.start();
        }
        return;
      }

      if (ls.phase === 'clearing') {
        if (now - ls.clearStartedAt >= CLEAR_ANIM_MS) {
          if (endRequestedRef.current) {
            onFinishRef.current();
            disposed = true;
          } else {
            loadLevel(ls.index + 1);
          }
        }
        return;
      }

      // --- tracing ---
      ls.recorder.record(pointer.x, pointer.y, pointer.active);

      if (pointer.active) {
        ls.totalMs += dt;
        if (!inside) ls.outMs += dt;

        // 根の健康度: 通路外で薄くなり、戻ると2秒かけて回復（SPEC §5.2）
        if (inside) {
          ls.health = Math.min(1, ls.health + dt / 2000);
        } else {
          ls.health = Math.max(0.35, ls.health - dt / 300);
        }

        const lastP = ls.trail[ls.trail.length - 1];
        if (!lastP || Math.hypot(pointer.x - lastP.x, pointer.y - lastP.y) >= 3) {
          ls.trail.push({ x: pointer.x, y: pointer.y, health: ls.health });
        }

        // ストップポイント（SPEC §5.2-4, §5.3）
        for (const stop of ls.stops) {
          if (stop.status === 'done') continue;
          const d = Math.hypot(pointer.x - stop.x, pointer.y - stop.y);
          if (!stop.announced && d < HOLD_RADIUS_TOUCH * 2) {
            stop.announced = true;
            audioGuide.speak('maze.stop.request');
          }
          if (d <= HOLD_RADIUS_TOUCH) {
            stop.holdMs += dt;
            if (stop.holdMs >= HOLD_DURATION_MS) {
              stop.status = 'done';
              audioGuide.speak('maze.stop.done');
              audioGuide.chime();
            }
          } else {
            // リングはゆっくり減る（リセットしない、SPEC §5.3）
            stop.holdMs = Math.max(0, stop.holdMs - dt * 0.4);
          }
        }

        // ゴール判定
        const [gx, gy] = ls.path.goal;
        if (proj.s > 0.95 && Math.hypot(pointer.x - gx, pointer.y - gy) < halfWidth + 15) {
          clearLevel(now);
          return;
        }
      }

      // 90秒停滞で救援（SPEC §8）: 光る誘導線
      if (!ls.assist && now - ls.startedAt > STUCK_ASSIST_MS) {
        ls.assist = true;
        audioGuide.speak('maze.stuck');
      }
    }

    function draw(now: number): void {
      if (!ls) return;
      const { path, effectiveWidth, level } = ls;

      const [c0, c1] = THEME_BG[level.theme];
      const bg = ctx!.createRadialGradient(640, 300, 100, 640, 400, 900);
      bg.addColorStop(0, c0);
      bg.addColorStop(1, c1);
      ctx!.fillStyle = bg;
      ctx!.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      // 通路（みずいろの みち）
      ctx!.save();
      ctx!.lineCap = 'round';
      ctx!.lineJoin = 'round';
      ctx!.beginPath();
      ctx!.moveTo(path.points[0][0], path.points[0][1]);
      for (let i = 1; i < path.points.length; i++) {
        ctx!.lineTo(path.points[i][0], path.points[i][1]);
      }
      ctx!.strokeStyle = 'rgba(140, 205, 235, 0.28)';
      ctx!.lineWidth = effectiveWidth;
      ctx!.stroke();
      ctx!.strokeStyle = 'rgba(170, 225, 250, 0.35)';
      ctx!.lineWidth = 3;
      ctx!.setLineDash([2, 14]);
      ctx!.stroke();
      ctx!.restore();

      // 救援: 現在地からゴールへ光る誘導（SPEC §8）
      if (ls.assist && ls.phase === 'tracing') {
        const proj = path.project(pointer.x, pointer.y);
        const pulse = 0.35 + 0.25 * Math.sin(now / 250);
        ctx!.save();
        ctx!.strokeStyle = `rgba(255, 240, 160, ${pulse})`;
        ctx!.lineWidth = 10;
        ctx!.lineCap = 'round';
        ctx!.beginPath();
        let started = false;
        for (let f = Math.max(0, proj.s); f <= 1.0001; f += 0.02) {
          const [x, y] = path.pointAt(Math.min(1, f));
          if (!started) {
            ctx!.moveTo(x, y);
            started = true;
          } else {
            ctx!.lineTo(x, y);
          }
        }
        ctx!.stroke();
        ctx!.restore();
      }

      // 根（trail）: 健康度で太さと色が変わる
      for (let i = 1; i < ls.trail.length; i++) {
        const a = ls.trail[i - 1];
        const b = ls.trail[i];
        const h = b.health;
        ctx!.strokeStyle = `rgba(139, 90, 43, ${0.35 + 0.65 * h})`;
        ctx!.lineWidth = 4 + 12 * h;
        ctx!.lineCap = 'round';
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(b.x, b.y);
        ctx!.stroke();
      }

      // スタート（種）とゴール（水）
      ctx!.font = '56px serif';
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      const [sx, sy] = path.start;
      const [gx, gy] = path.goal;
      if (ls.phase === 'waiting') {
        const pulse = 1 + 0.08 * Math.sin(now / 280);
        ctx!.save();
        ctx!.translate(sx, sy);
        ctx!.scale(pulse, pulse);
        ctx!.fillText('🌰', 0, 0);
        ctx!.restore();
      } else {
        ctx!.fillText('🌰', sx, sy);
      }
      ctx!.save();
      ctx!.shadowColor = 'rgba(140, 210, 255, 0.9)';
      ctx!.shadowBlur = 24;
      ctx!.fillText('💧', gx, gy);
      ctx!.restore();

      // ストップポイント（お日さま）
      for (const stop of ls.stops) {
        const done = stop.status === 'done';
        ctx!.save();
        ctx!.translate(stop.x, stop.y);
        // 光線
        ctx!.strokeStyle = done ? 'rgba(110, 220, 130, 0.7)' : 'rgba(255, 120, 90, 0.7)';
        ctx!.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 * i) / 8 + now / 2000;
          ctx!.beginPath();
          ctx!.moveTo(Math.cos(a) * 26, Math.sin(a) * 26);
          ctx!.lineTo(Math.cos(a) * 34, Math.sin(a) * 34);
          ctx!.stroke();
        }
        ctx!.fillStyle = done ? '#59c96a' : '#ff6b57';
        ctx!.beginPath();
        ctx!.arc(0, 0, 20, 0, Math.PI * 2);
        ctx!.fill();
        // ホールド進捗リング
        if (!done && stop.holdMs > 0) {
          ctx!.strokeStyle = 'rgba(255, 235, 150, 0.95)';
          ctx!.lineWidth = 6;
          ctx!.beginPath();
          ctx!.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * stop.holdMs) / HOLD_DURATION_MS);
          ctx!.stroke();
        }
        ctx!.restore();
      }

      // クリア演出: 花が咲く
      if (ls.phase === 'clearing') {
        const t = (now - ls.clearStartedAt) / CLEAR_ANIM_MS;
        const scale = 1 + t * 2.2;
        ctx!.save();
        ctx!.translate(gx, gy);
        ctx!.globalAlpha = Math.min(1, 2 - t * 1.2);
        ctx!.scale(scale, scale);
        ctx!.font = '64px serif';
        ctx!.fillText('🌸', 0, 0);
        ctx!.restore();
        for (let i = 0; i < 10; i++) {
          const a = (Math.PI * 2 * i) / 10 + t * 2;
          const r = t * 220;
          ctx!.fillStyle = `rgba(255, 220, 160, ${Math.max(0, 1 - t)})`;
          ctx!.beginPath();
          ctx!.arc(gx + Math.cos(a) * r, gy + Math.sin(a) * r, 5, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      // カーソル（柔らかい光）
      const cr = pointer.active ? 30 : 20;
      const glow = ctx!.createRadialGradient(pointer.x, pointer.y, 2, pointer.x, pointer.y, cr);
      glow.addColorStop(0, 'rgba(180, 235, 190, 0.95)');
      glow.addColorStop(1, 'rgba(180, 235, 190, 0)');
      ctx!.fillStyle = glow;
      ctx!.beginPath();
      ctx!.arc(pointer.x, pointer.y, cr, 0, Math.PI * 2);
      ctx!.fill();
    }

    async function init(): Promise<void> {
      cleared = await getProgress('maze.cleared', 0);
      highOutStreak = await getProgress('maze.highOutStreak', 0);
      reliefPending = await getProgress('maze.reliefPending', false);
      if (disposed) return;
      loadLevel(cleared);

      const loop = () => {
        if (disposed) return;
        const now = performance.now();
        const dt = Math.min(100, now - lastFrame);
        lastFrame = now;
        update(now, dt);
        if (!disposed) draw(now);
        raf = requestAnimationFrame(loop);
      };
      lastFrame = performance.now();
      raf = requestAnimationFrame(loop);
    }
    void init();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      unsubscribe();
      source.stop();
    };
  }, []);

  return <canvas ref={canvasRef} className="game-canvas" width={LOGICAL_W} height={LOGICAL_H} />;
}
