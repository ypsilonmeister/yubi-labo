import { useEffect, useRef } from 'react';
import { LOGICAL_W, LOGICAL_H } from '../../core/coords';
import { audioGuide } from '../../core/audio/AudioGuide';
import {
  PointerEventSource,
  detectPointerKind,
  type PointerState,
} from '../../core/input/PointerSource';
import { ReplayRecorder } from '../../core/engine/ReplayRecorder';
import type { PlayRecord } from '../../core/storage/db';
import { KANJI_ENTRIES } from './data';
import {
  advanceProgress,
  defaultProgress,
  loadKanjiProgress,
  pickDistractors,
  pickNext,
  saveKanjiProgress,
  type KanjiProgressMap,
} from './scheduler';
import {
  HINT_AFTER_MISSES,
  RECALL_EVERY,
  SNAP_RADIUS,
  type KanjiEntry,
  type KanjiPart,
} from './types';

// モードB「かんじ工場」（SPEC §6）。分子合成の実験室テーマ。
// 原則1: 誤配置はぷるぷる首を振ってふわりと戻るだけ。音・エフェクトなし。

const FRAME = 400; // 完成枠（正方形）
const FRAME_X = (LOGICAL_W - FRAME) / 2;
const FRAME_Y = 96;
const TRAY_Y = 668;
const TRAY_GLYPH = 96;
const KANJI_FONT = '"UD デジタル 教科書体 N-R", "UD Digi Kyokasho N-R", "Klee One", serif';
const STUCK_MS = 90_000;

type Phase = 'present' | 'sequence' | 'assemble' | 'celebrate' | 'recall';

interface PartState {
  def: KanjiPart;
  state: 'tray' | 'dragging' | 'returning' | 'flying' | 'placed';
  x: number;
  y: number;
  trayX: number;
  trayY: number;
  animStart: number;
  fromX: number;
  fromY: number;
}

interface RecallState {
  target: KanjiEntry;
  choices: KanjiEntry[];
  missed: boolean;
}

interface QState {
  entry: KanjiEntry;
  level: 1 | 2 | 3;
  isFirst: boolean;
  phase: Phase;
  phaseStart: number;
  parts: PartState[];
  seqIndex: number;
  misplacements: number;
  hintUsed: boolean;
  assist: boolean;
  assistIndex: number;
  assembleStart: number;
  celebrated: boolean;
  recall: RecallState | null;
  recorder: ReplayRecorder;
  startedAt: number;
}

function zoneCenter(part: KanjiPart): [number, number] {
  return [
    FRAME_X + (part.zone.x + part.zone.w / 2) * FRAME,
    FRAME_Y + (part.zone.y + part.zone.h / 2) * FRAME,
  ];
}

// 付録C: 位置名の語彙
function positionName(part: KanjiPart): string {
  const cx = part.zone.x + part.zone.w / 2;
  const cy = part.zone.y + part.zone.h / 2;
  const h = cx < 0.38 ? 'ひだり' : cx > 0.62 ? 'みぎ' : '';
  const v = cy < 0.38 ? 'うえ' : cy > 0.62 ? 'した' : '';
  if (h && v) return h + v;
  if (h) return h + 'がわ';
  if (v) return v;
  return 'まんなか';
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2;
}

export function KanjiGame({
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
    let prevActive = false;
    let lastFrame = performance.now();
    let q: QState | null = null;
    let progressMap: KanjiProgressMap = {};
    let reviewStreak = 0;
    let completedThisSession = 0;
    let previousEntry: KanjiEntry | null = null;
    let forcedNextId: string | null = null; // 想起ミス時の「もういっかい つくってみよう」

    const source = new PointerEventSource(canvas, detectPointerKind());
    const unsubscribe = source.subscribe((s) => {
      pointer = s;
    });
    void source.start();

    function trayPositions(count: number): [number, number][] {
      const spacing = 170;
      const startX = LOGICAL_W / 2 - ((count - 1) * spacing) / 2;
      return Array.from({ length: count }, (_, i) => [startX + i * spacing, TRAY_Y]);
    }

    function loadQuestion(now: number): boolean {
      const forced = forcedNextId;
      forcedNextId = null;
      let picked;
      if (forced) {
        const entry = KANJI_ENTRIES.find((e) => e.id === forced);
        picked = entry ? { entry, isReview: true } : pickNext(progressMap, reviewStreak, Date.now());
      } else {
        picked = pickNext(progressMap, reviewStreak, Date.now());
      }
      if (!picked) return false;
      reviewStreak = picked.isReview ? reviewStreak + 1 : 0;

      const prog = progressMap[picked.entry.id] ?? defaultProgress();
      const shuffled = [...picked.entry.parts].sort(() => Math.random() - 0.5);
      const pos = trayPositions(shuffled.length);
      q = {
        entry: picked.entry,
        level: prog.level,
        isFirst: prog.completions === 0,
        phase: 'present',
        phaseStart: now,
        parts: shuffled.map((def, i) => ({
          def,
          state: 'tray' as const,
          x: pos[i][0],
          y: pos[i][1],
          trayX: pos[i][0],
          trayY: pos[i][1],
          animStart: 0,
          fromX: pos[i][0],
          fromY: pos[i][1],
        })),
        seqIndex: -1,
        misplacements: 0,
        hintUsed: false,
        assist: false,
        assistIndex: 0,
        assembleStart: 0,
        celebrated: false,
        recall: null,
        recorder: new ReplayRecorder(),
        startedAt: now,
      };
      audioGuide.speakText(`これは「${picked.entry.reading}」。${picked.entry.storyText}`);
      return true;
    }

    function startAssemble(now: number): void {
      if (!q) return;
      for (const p of q.parts) {
        p.state = 'tray';
        p.x = p.trayX;
        p.y = p.trayY;
      }
      q.phase = 'assemble';
      q.phaseStart = now;
      q.assembleStart = now;
      q.recorder.start();
    }

    function completeAssembly(now: number): void {
      if (!q) return;
      q.phase = 'celebrate';
      q.phaseStart = now;
      q.celebrated = false;
      audioGuide.chime();
    }

    function recordAndAdvance(now: number): void {
      if (!q) return;
      const prog = progressMap[q.entry.id] ?? defaultProgress();
      onPlayRef.current({
        game: 'kanji',
        levelId: q.entry.id,
        startedAt: Date.now() - (now - q.startedAt),
        durationMs: now - q.startedAt,
        completed: true,
        metrics: {
          char: q.entry.char,
          level: q.level,
          misplacements: q.misplacements,
          hintUsed: q.hintUsed,
          firstComplete: q.isFirst,
        },
        replay: q.recorder.finish(),
      });
      progressMap[q.entry.id] = advanceProgress(prog, q.hintUsed, Date.now());
      void saveKanjiProgress(progressMap);
      completedThisSession += 1;
    }

    function nextStep(now: number): void {
      if (!q) return;
      // 想起チェック: 3問に1回、直前の漢字について（SPEC §6.2-5）
      const recallDue = completedThisSession % RECALL_EVERY === 0 && previousEntry;
      if (q.phase === 'celebrate' && recallDue && previousEntry) {
        const target = previousEntry;
        const choices = [target, ...pickDistractors(target)].sort(() => Math.random() - 0.5);
        q.phase = 'recall';
        q.phaseStart = now;
        q.recall = { target, choices, missed: false };
        audioGuide.speak('kanji.recall.q', { reading: target.reading });
        return;
      }
      previousEntry = q.entry;
      if (endRequestedRef.current) {
        onFinishRef.current();
        disposed = true;
        return;
      }
      if (!loadQuestion(now)) {
        onFinishRef.current();
        disposed = true;
      }
    }

    function update(now: number, dt: number): void {
      if (!q) return;
      const downEdge = pointer.active && !prevActive;
      const upEdge = !pointer.active && prevActive;
      prevActive = pointer.active;

      switch (q.phase) {
        case 'present': {
          if (now - q.phaseStart > 2600) {
            if (q.level <= 2) {
              q.phase = 'sequence';
              q.phaseStart = now;
              q.seqIndex = -1;
            } else {
              // Lv3: シーケンス提示なし、読みだけで記憶から組む（SPEC §6.4）
              startAssemble(now);
            }
          }
          break;
        }
        case 'sequence': {
          // 提示中のパーツを枠内へ飛ばすアニメーション
          for (const p of q.parts) {
            if (p.state !== 'flying') continue;
            const [zx, zy] = zoneCenter(p.def);
            const t = Math.min(1, (now - p.animStart) / 750);
            const e = ease(t);
            p.x = p.fromX + (zx - p.fromX) * e;
            p.y = p.fromY + (zy - p.fromY) * e;
            if (t >= 1) p.state = 'placed';
          }
          const slot = Math.floor((now - q.phaseStart) / 1100);
          if (slot > q.seqIndex && slot < q.parts.length) {
            q.seqIndex = slot;
            const orderedPart = q.entry.parts[slot];
            const ps = q.parts.find((p) => p.def === orderedPart);
            if (ps) {
              ps.state = 'flying';
              ps.animStart = now;
              ps.fromX = ps.trayX;
              ps.fromY = ps.trayY;
            }
            audioGuide.speak(slot === 0 ? 'kanji.seq.first' : 'kanji.seq.next', {
              partName: orderedPart.spokenName,
            });
          }
          if (now - q.phaseStart > q.parts.length * 1100 + 900) {
            startAssemble(now);
          }
          break;
        }
        case 'assemble': {
          q.recorder.record(pointer.x, pointer.y, pointer.active);

          // 90秒停滞 → 半自動化: 残りパーツが吸い込まれるのを見る（SPEC §8）
          if (!q.assist && now - q.assembleStart > STUCK_MS) {
            q.assist = true;
            q.hintUsed = true;
            q.assistIndex = 0;
            audioGuide.speak('common.stuck');
          }
          if (q.assist) {
            const unplaced = q.entry.parts
              .map((def) => q!.parts.find((p) => p.def === def)!)
              .filter((p) => p.state !== 'placed' && p.state !== 'flying');
            const flying = q.parts.some((p) => p.state === 'flying');
            if (!flying && unplaced.length > 0 && now - q.phaseStart > 1200) {
              const p = unplaced[0];
              p.state = 'flying';
              p.animStart = now;
              p.fromX = p.x;
              p.fromY = p.y;
              q.phaseStart = now;
            }
          }

          if (downEdge && !q.assist) {
            for (const p of q.parts) {
              if (p.state !== 'tray' && p.state !== 'returning') continue;
              if (Math.abs(pointer.x - p.x) < 70 && Math.abs(pointer.y - p.y) < 70) {
                p.state = 'dragging';
                break;
              }
            }
          }
          for (const p of q.parts) {
            if (p.state === 'dragging') {
              p.x = pointer.x;
              p.y = pointer.y;
              if (upEdge) {
                const [zx, zy] = zoneCenter(p.def);
                if (Math.hypot(p.x - zx, p.y - zy) < SNAP_RADIUS) {
                  p.state = 'placed';
                  p.x = zx;
                  p.y = zy;
                  audioGuide.chime();
                } else {
                  // 違うゾーンの近くか（誤配置カウント。音・エフェクトは出さない）
                  const nearWrong = q.parts.some((o) => {
                    if (o === p || o.state === 'placed') return false;
                    const [ox, oy] = zoneCenter(o.def);
                    return Math.hypot(p.x - ox, p.y - oy) < SNAP_RADIUS;
                  });
                  if (nearWrong) {
                    q.misplacements += 1;
                    if (q.misplacements >= HINT_AFTER_MISSES && !q.hintUsed) {
                      q.hintUsed = true;
                      audioGuide.speak('kanji.hint', {
                        partName: p.def.spokenName,
                        positionName: positionName(p.def),
                      });
                    }
                  }
                  p.state = 'returning';
                  p.animStart = now;
                  p.fromX = p.x;
                  p.fromY = p.y;
                }
              }
            } else if (p.state === 'returning') {
              const t = Math.min(1, (now - p.animStart) / 450);
              const e = ease(t);
              // ぷるぷる（首振り）しながらふわりと戻る
              const wiggle = Math.sin(t * Math.PI * 6) * 8 * (1 - t);
              p.x = p.fromX + (p.trayX - p.fromX) * e + wiggle;
              p.y = p.fromY + (p.trayY - p.fromY) * e;
              if (t >= 1) {
                p.state = 'tray';
                p.x = p.trayX;
                p.y = p.trayY;
              }
            } else if (p.state === 'flying') {
              const [zx, zy] = zoneCenter(p.def);
              const t = Math.min(1, (now - p.animStart) / 750);
              const e = ease(t);
              p.x = p.fromX + (zx - p.fromX) * e;
              p.y = p.fromY + (zy - p.fromY) * e;
              if (t >= 1) {
                p.state = 'placed';
                audioGuide.chime();
              }
            }
          }
          if (q.phase === 'assemble' && q.parts.every((p) => p.state === 'placed')) {
            completeAssembly(now);
          }
          break;
        }
        case 'celebrate': {
          const t = now - q.phaseStart;
          if (t > 500 && !q.celebrated) {
            q.celebrated = true;
            audioGuide.speakText(`${q.entry.reading}`);
            recordAndAdvance(now);
          }
          if (t > 2400 && t - dt <= 2400) {
            audioGuide.speak('kanji.complete', { reading: q.entry.reading });
          }
          if (t > 4300) {
            nextStep(now);
          }
          break;
        }
        case 'recall': {
          if (!q.recall) break;
          if (q.recall.missed) break; // 正解表示中は再タップを受け付けない
          if (downEdge) {
            const cards = recallCardRects(q.recall.choices.length);
            for (let i = 0; i < cards.length; i++) {
              const [cx, cy, size] = cards[i];
              if (Math.abs(pointer.x - cx) < size / 2 && Math.abs(pointer.y - cy) < size / 2) {
                const chosen = q.recall.choices[i];
                if (chosen.id === q.recall.target.id) {
                  audioGuide.chime();
                  const prog = progressMap[chosen.id];
                  if (prog) {
                    prog.recallStar = true;
                    void saveKanjiProgress(progressMap);
                  }
                  q.recall = null;
                  previousEntry = q.entry;
                  if (endRequestedRef.current) {
                    onFinishRef.current();
                    disposed = true;
                  } else if (!loadQuestion(now)) {
                    onFinishRef.current();
                    disposed = true;
                  }
                } else {
                  // ペナルティにしない: 答えを見せて、もう一度組み立てへ（SPEC §6.2-5）
                  audioGuide.speak('kanji.recall.miss');
                  forcedNextId = q.recall.target.id;
                  q.recall.missed = true;
                  window.setTimeout(() => {
                    if (!disposed && q) {
                      previousEntry = q.entry;
                      if (!loadQuestion(performance.now())) {
                        onFinishRef.current();
                        disposed = true;
                      }
                    }
                  }, 2200);
                }
                break;
              }
            }
          }
          break;
        }
      }
    }

    function recallCardRects(count: number): [number, number, number][] {
      const size = 220;
      const spacing = 290;
      const startX = LOGICAL_W / 2 - ((count - 1) * spacing) / 2;
      return Array.from({ length: count }, (_, i) => [startX + i * spacing, 400, size]);
    }

    function drawGlyphInZone(part: KanjiPart, alpha: number, color: string): void {
      const base = 100;
      const [cx, cy] = zoneCenter(part);
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.scale((part.zone.w * FRAME) / base, (part.zone.h * FRAME) / base);
      ctx!.globalAlpha = alpha;
      ctx!.fillStyle = color;
      ctx!.font = `${base}px ${KANJI_FONT}`;
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      ctx!.fillText(part.glyph, 0, 0);
      ctx!.restore();
    }

    function draw(now: number): void {
      if (!q) return;

      // 実験室背景
      const bg = ctx!.createRadialGradient(640, 300, 100, 640, 400, 900);
      bg.addColorStop(0, '#20303c');
      bg.addColorStop(1, '#131e26');
      ctx!.fillStyle = bg;
      ctx!.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      for (let i = 0; i < 6; i++) {
        const a = now / 6000 + (i * Math.PI) / 3;
        ctx!.fillStyle = 'rgba(140, 200, 235, 0.06)';
        ctx!.beginPath();
        ctx!.arc(640 + Math.cos(a) * 520, 400 + Math.sin(a) * 300, 40 + i * 8, 0, Math.PI * 2);
        ctx!.fill();
      }

      // 完成枠（フラスコ風パネル）
      ctx!.save();
      ctx!.fillStyle = 'rgba(247, 243, 232, 0.94)';
      ctx!.strokeStyle = 'rgba(150, 210, 240, 0.5)';
      ctx!.lineWidth = 4;
      ctx!.beginPath();
      ctx!.roundRect(FRAME_X - 16, FRAME_Y - 16, FRAME + 32, FRAME + 32, 24);
      ctx!.fill();
      ctx!.stroke();
      ctx!.restore();

      const ink = '#2b2b33';

      if (q.phase === 'present') {
        ctx!.save();
        ctx!.fillStyle = ink;
        ctx!.font = `${FRAME * 0.82}px ${KANJI_FONT}`;
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'middle';
        ctx!.fillText(q.entry.char, FRAME_X + FRAME / 2, FRAME_Y + FRAME / 2 + 10);
        ctx!.restore();
      } else if (q.phase === 'recall' && q.recall) {
        // 3択カード
        ctx!.fillStyle = '#131e26';
        ctx!.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        const cards = recallCardRects(q.recall.choices.length);
        for (let i = 0; i < cards.length; i++) {
          const [cx, cy, size] = cards[i];
          const isAnswer = q.recall.choices[i].id === q.recall.target.id;
          ctx!.save();
          ctx!.fillStyle = 'rgba(247, 243, 232, 0.94)';
          ctx!.beginPath();
          ctx!.roundRect(cx - size / 2, cy - size / 2, size, size, 20);
          ctx!.fill();
          if (q.recall.missed && isAnswer) {
            // 正解をやさしく示す
            ctx!.strokeStyle = `rgba(255, 214, 110, ${0.6 + 0.4 * Math.sin(now / 200)})`;
            ctx!.lineWidth = 8;
            ctx!.stroke();
          }
          ctx!.fillStyle = ink;
          ctx!.font = `${size * 0.62}px ${KANJI_FONT}`;
          ctx!.textAlign = 'center';
          ctx!.textBaseline = 'middle';
          ctx!.fillText(q.recall.choices[i].char, cx, cy + 6);
          ctx!.restore();
        }
      } else {
        // シルエット（Lvで濃度が変わる、SPEC §6.4）
        const silhouetteAlpha = q.level === 1 ? 0.22 : q.level === 2 ? 0.1 : 0;
        if (silhouetteAlpha > 0) {
          for (const part of q.entry.parts) {
            drawGlyphInZone(part, silhouetteAlpha, ink);
          }
        }
        // 配置済みパーツ
        for (const p of q.parts) {
          if (p.state === 'placed') drawGlyphInZone(p.def, 1, ink);
        }
        // celebrate: 光る
        if (q.phase === 'celebrate') {
          const t = (now - q.phaseStart) / 1000;
          ctx!.save();
          ctx!.shadowColor = 'rgba(255, 226, 130, 0.95)';
          ctx!.shadowBlur = 24 + 14 * Math.sin(t * 5);
          for (const part of q.entry.parts) drawGlyphInZone(part, 1, ink);
          ctx!.restore();
          // 意味アニメ: 絵文字クロスフェード（SPEC §6.6）
          const fade = Math.max(0, Math.min(1, (now - q.phaseStart - 800) / 1600));
          ctx!.textAlign = 'center';
          ctx!.textBaseline = 'middle';
          ctx!.font = '72px serif';
          ctx!.globalAlpha = 1 - fade;
          ctx!.fillText(q.entry.meaningEmoji[0], 200, 240);
          ctx!.globalAlpha = fade;
          ctx!.fillText(q.entry.meaningEmoji[1], 200, 240);
          ctx!.globalAlpha = 1;
        }
        // トレイ・移動中パーツ（自然なアスペクトで表示）
        for (const p of q.parts) {
          if (p.state === 'placed') continue;
          if (q.phase === 'sequence' && p.state !== 'flying') continue;
          ctx!.save();
          if (p.state === 'dragging') {
            ctx!.shadowColor = 'rgba(140, 200, 235, 0.9)';
            ctx!.shadowBlur = 26;
          }
          ctx!.fillStyle = '#f2ecdc';
          ctx!.font = `${TRAY_GLYPH}px ${KANJI_FONT}`;
          ctx!.textAlign = 'center';
          ctx!.textBaseline = 'middle';
          ctx!.fillText(p.def.glyph, p.x, p.y);
          ctx!.restore();
        }
      }

      // カーソル
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
      progressMap = await loadKanjiProgress();
      if (disposed) return;
      if (!loadQuestion(performance.now())) {
        onFinishRef.current();
        return;
      }
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
