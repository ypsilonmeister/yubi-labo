import { useEffect, useRef } from 'react';
import { LOGICAL_W, LOGICAL_H } from '../../core/coords';
import { audioGuide } from '../../core/audio/AudioGuide';
import type { PointerState } from '../../core/input/PointerSource';
import { createPointerSource } from '../../core/input/inputProvider';
import { ReplayRecorder } from '../../core/engine/ReplayRecorder';
import { getSetting, type PlayRecord } from '../../core/storage/db';
import { loadKanjiProgress, type KanjiProgressMap } from '../kanji/scheduler';
import { distractorSource, stagePool, stageUsesConfusable } from './data';
import {
  isLowAccuracy,
  loadMojiProgress,
  pickCards,
  pickTarget,
  saveMojiProgress,
  updateStats,
} from './scheduler';
import {
  CHALLENGE_MS,
  MAX_CARDS,
  MIN_CARDS,
  QUESTIONS_PER_SET,
  RECENT_WINDOW,
  SETS_TO_UNLOCK_CHALLENGE,
  SLOW_SEARCH_MS,
  SLOW_SEARCH_STREAK,
  START_CARDS,
  STUCK_MS,
  type MojiChar,
  type MojiMetrics,
  type MojiProgress,
} from './types';

// モードC「もじさがし」（SPEC §7）。ききとりモード＝デフォルト。
// 原則1(NO-FAIL): 他のカードを触っても否定表示・音は無し。その字の音を読むだけ（§7.2-3）。
// 文字を子ども画面に出すのは §7 学習内容としての明示的例外（§2 テキストレス原則）。

const KANJI_FONT = '"UD デジタル 教科書体 N-R", "UD Digi Kyokasho N-R", "Klee One", serif';

// カード配置領域（§7.2-1 重ならない・最小間隔100px）
const AREA = { x0: 180, y0: 156, x1: 1100, y1: 690 };
const CARD = 132; // カード一辺
const HALF = CARD / 2;

type Phase = 'search' | 'burst' | 'setclear' | 'challengeend';

interface Card {
  ch: MojiChar;
  x: number;
  y: number;
}

interface QState {
  target: MojiChar;
  cards: Card[];
  correctIndex: number;
  distractors: string[];
  cardCount: number;
  startedAt: number; // 出題（音声）時刻: 反応時間とreplayの基準
  wrongTaps: number;
  stuckAssisted: boolean; // §8 90秒停滞→半自動化済み
  wrongPulseIndex: number; // 直近に触れた他カード（やさしいパルス表示用）
  wrongPulseStart: number;
  recorder: ReplayRecorder;
}

export function MojiGame({
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

    // セッションレベルの可変状態
    let q: QState | null = null;
    let phase: Phase = 'search';
    let phaseStart = 0;
    let burstIndex = -1;
    let progress: MojiProgress = {
      stage: 0,
      setsCompleted: 0,
      stars: 0,
      challengeBest: 0,
      charStats: {},
    };
    let kanjiProg: KanjiProgressMap = {};
    let challengeEnabled = true; // §7.4 保護者画面で無効化できる想定
    let challengeUnlocked = false; // 3セット完了で⚡出現
    let challengeActive = false;
    let challengeEndAt = 0;
    let challengeCount = 0;

    // 適応制御用（§7.3 / §8）
    let cardCount = START_CARDS;
    let firstTryStreak = 0;
    let questionsInSet = 0;
    let lastChar: string | null = null;
    let slowChar: string | null = null;
    let slowStreak = 0;
    const recent: { char: string; correct: boolean; reactionMs: number }[] = [];

    const source = createPointerSource(canvas);
    const unsubscribe = source.subscribe((s) => {
      pointer = s;
    });
    void source.start();

    // 最小100px間隔を保証するジッタ付きグリッド配置（§7.2-1）
    function layoutCards(count: number): [number, number][] {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const w = (AREA.x1 - AREA.x0) / cols;
      const h = (AREA.y1 - AREA.y0) / rows;
      const cells = Array.from({ length: cols * rows }, (_, i) => i);
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j]!, cells[i]!];
      }
      const jx = Math.max(0, (w - CARD - 100) / 2);
      const jy = Math.max(0, (h - CARD - 100) / 2);
      return cells.slice(0, count).map((cell) => {
        const cx = cell % cols;
        const cy = Math.floor(cell / cols);
        const x = AREA.x0 + w * (cx + 0.5) + (Math.random() * 2 - 1) * jx;
        const y = AREA.y0 + h * (cy + 0.5) + (Math.random() * 2 - 1) * jy;
        return [x, y];
      });
    }

    function loadQuestion(now: number): void {
      const pool = stagePool(progress.stage, kanjiProg);
      const target = pickTarget(pool, progress, lastChar);
      lastChar = target.char;

      const source2 = distractorSource(progress.stage, kanjiProg);
      const available = source2.filter((c) => c.char !== target.char).length + 1;
      // §7.3 低正答率の字は4枚に減らす。それ以外は現在の難易度カード数。
      let count = isLowAccuracy(progress, target.char) ? MIN_CARDS : cardCount;
      count = Math.max(MIN_CARDS, Math.min(count, available));

      const chosen = pickCards(target, source2, count, stageUsesConfusable(progress.stage));
      const pos = layoutCards(chosen.length);
      const cards: Card[] = chosen.map((ch, i) => ({ ch, x: pos[i]![0], y: pos[i]![1] }));
      const correctIndex = cards.findIndex((c) => c.ch.char === target.char);

      const recorder = new ReplayRecorder();
      recorder.start();
      q = {
        target,
        cards,
        correctIndex,
        distractors: chosen.filter((c) => c.char !== target.char).map((c) => c.char),
        cardCount: chosen.length,
        startedAt: now,
        wrongTaps: 0,
        stuckAssisted: false,
        wrongPulseIndex: -1,
        wrongPulseStart: 0,
        recorder,
      };
      phase = 'search';
      phaseStart = now;
      // §7.2-2 出題音声「『ね』は どこかな？」（音＝reading を読む）
      audioGuide.speak('moji.q', { char: target.reading });
    }

    // 難易度の静かな調整（§7.3 / §8。本人に通知しない §8）
    function adapt(char: string, correct: boolean, reactionMs: number): void {
      recent.push({ char, correct, reactionMs });
      if (recent.length > RECENT_WINDOW) recent.shift();

      // 連続正解→静かに難化（カード+1、最大9）
      if (correct) {
        firstTryStreak += 1;
        if (firstTryStreak >= 3) {
          cardCount = Math.min(MAX_CARDS, cardCount + 1);
          firstTryStreak = 0;
        }
      } else {
        firstTryStreak = 0;
      }

      // §8 苦戦兆候: 同一文字3回連続の探索が20秒超→静かに易化（カード-2）
      if (reactionMs > SLOW_SEARCH_MS) {
        if (char === slowChar) slowStreak += 1;
        else {
          slowChar = char;
          slowStreak = 1;
        }
        if (slowStreak >= SLOW_SEARCH_STREAK) {
          cardCount = Math.max(MIN_CARDS, cardCount - 2);
          slowStreak = 0;
        }
      } else {
        slowChar = null;
        slowStreak = 0;
      }
    }

    function recordPlay(now: number, correct: boolean, reactionMs: number): void {
      if (!q) return;
      const metrics: MojiMetrics = {
        char: q.target.char,
        correct,
        reactionMs: Math.round(reactionMs),
        distractors: q.distractors,
        stage: progress.stage,
        cardCount: q.cardCount,
        challenge: challengeActive,
      };
      onPlayRef.current({
        game: 'moji',
        levelId: q.target.char,
        startedAt: Date.now() - (now - q.startedAt),
        durationMs: now - q.startedAt,
        completed: true,
        metrics,
        replay: q.recorder.finish(),
      });
    }

    function recentAccuracy(n: number): number {
      const slice = recent.slice(-n);
      if (slice.length < n) return 0;
      const ok = slice.filter((r) => r.correct).length;
      return ok / slice.length;
    }

    function canAdvanceStage(): boolean {
      const next = progress.stage + 1;
      if (next > 5) return false;
      return stagePool(next, kanjiProg).length > 0;
    }

    function onCorrect(now: number): void {
      if (!q) return;
      const reactionMs = now - q.startedAt;
      const correct = q.wrongTaps === 0;
      audioGuide.chime();
      // §7.2-3 正解: 文字の音を即時再生（音と文字の結合強化）
      audioGuide.speak('moji.correct', { char: q.target.reading });
      updateStats(progress, q.target.char, correct, reactionMs);
      recordPlay(now, correct, reactionMs);
      adapt(q.target.char, correct, reactionMs);
      burstIndex = q.correctIndex;
      phase = 'burst';
      phaseStart = now;
      if (challengeActive) challengeCount += 1;
      else questionsInSet += 1;
    }

    function onWrongTap(now: number, index: number): void {
      if (!q) return;
      // §7.2-3 他カード: 誤答扱いにしない。その字の音を読むだけ。
      q.wrongTaps += 1;
      q.wrongPulseIndex = index;
      q.wrongPulseStart = now;
      audioGuide.speak('moji.other', {
        char: q.cards[index]!.ch.reading,
        target: q.target.reading,
      });
    }

    function beginSetClear(now: number): void {
      progress.setsCompleted += 1;
      progress.stars += 1;
      questionsInSet = 0;
      // §7.3 静かに段階を上げる: 直近1セットの正答率が高ければ次段階へ
      if (recentAccuracy(QUESTIONS_PER_SET) >= 0.9 && canAdvanceStage()) {
        progress.stage += 1;
      }
      challengeUnlocked = progress.setsCompleted >= SETS_TO_UNLOCK_CHALLENGE;
      void saveMojiProgress(progress);
      audioGuide.chime();
      audioGuide.speak('moji.set.clear');
      phase = 'setclear';
      phaseStart = now;
    }

    function startChallenge(now: number): void {
      // §7.4 本人が⚡をタップした時だけ発動。時間圧の唯一の許容箇所。
      challengeActive = true;
      challengeCount = 0;
      challengeEndAt = now + CHALLENGE_MS;
      audioGuide.speak('moji.challenge.start');
      // 「スタート！」が出題音声(moji.q)に置き換えられて消えないよう間を置く
      window.setTimeout(() => {
        if (!disposed) loadQuestion(performance.now());
      }, 1800);
    }

    function endChallenge(now: number): void {
      challengeActive = false;
      if (challengeCount > progress.challengeBest) progress.challengeBest = challengeCount;
      void saveMojiProgress(progress);
      // §7.4 成果側だけを言う（カウントダウン音・警告音は無し）
      audioGuide.speak('moji.challenge.end', { n: challengeCount });
      phase = 'challengeend';
      phaseStart = now;
    }

    function afterBurst(now: number): void {
      if (challengeActive) {
        if (now >= challengeEndAt) endChallenge(now);
        else loadQuestion(now);
        return;
      }
      if (questionsInSet >= QUESTIONS_PER_SET) {
        beginSetClear(now);
        return;
      }
      if (endRequestedRef.current) {
        onFinishRef.current();
        disposed = true;
        return;
      }
      loadQuestion(now);
    }

    function challengeZone(): [number, number, number] {
      return [1180, 700, 62]; // x, y, 半径
    }

    function update(now: number): void {
      const downEdge = pointer.active && !prevActive;
      prevActive = pointer.active;

      switch (phase) {
        case 'search': {
          if (!q) break;
          q.recorder.record(pointer.x, pointer.y, pointer.active);

          // §8 90秒停滞→半自動化: 正解カードがゆっくり点滅（音声で一言添える）
          if (!q.stuckAssisted && now - q.startedAt > STUCK_MS) {
            q.stuckAssisted = true;
            audioGuide.speak('common.stuck');
          }

          if (downEdge) {
            // ⚡チャレンジ起動（§7.4 本人トリガー）
            if (challengeUnlocked && challengeEnabled && !challengeActive) {
              const [zx, zy, zr] = challengeZone();
              if (Math.hypot(pointer.x - zx, pointer.y - zy) < zr) {
                startChallenge(now);
                break;
              }
            }
            for (let i = 0; i < q.cards.length; i++) {
              const c = q.cards[i]!;
              if (Math.abs(pointer.x - c.x) < HALF && Math.abs(pointer.y - c.y) < HALF) {
                if (i === q.correctIndex) onCorrect(now);
                else onWrongTap(now, i);
                break;
              }
            }
          }
          break;
        }
        case 'burst': {
          if (now - phaseStart > 650) afterBurst(now);
          break;
        }
        case 'setclear': {
          if (now - phaseStart > 1900) {
            if (endRequestedRef.current) {
              onFinishRef.current();
              disposed = true;
            } else {
              loadQuestion(now);
            }
          }
          break;
        }
        case 'challengeend': {
          if (now - phaseStart > 2600) {
            if (endRequestedRef.current) {
              onFinishRef.current();
              disposed = true;
            } else {
              loadQuestion(now); // ききとりモードへ戻る
            }
          }
          break;
        }
      }
    }

    function drawCard(c: Card, scale: number, alpha: number, glow: number): void {
      ctx!.save();
      ctx!.globalAlpha = alpha;
      ctx!.translate(c.x, c.y);
      ctx!.scale(scale, scale);
      if (glow > 0) {
        ctx!.shadowColor = `rgba(255, 214, 110, ${glow})`;
        ctx!.shadowBlur = 30 * glow;
      }
      ctx!.fillStyle = 'rgba(247, 243, 232, 0.96)';
      ctx!.beginPath();
      ctx!.roundRect(-HALF, -HALF, CARD, CARD, 22);
      ctx!.fill();
      ctx!.shadowBlur = 0;
      ctx!.fillStyle = '#2b2b33';
      ctx!.font = `${CARD * 0.6}px ${KANJI_FONT}`;
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      ctx!.fillText(c.ch.char, 0, 6);
      ctx!.restore();
    }

    function draw(now: number): void {
      // 背景（実験室調、モードBと統一感）
      const bg = ctx!.createRadialGradient(640, 300, 100, 640, 400, 900);
      bg.addColorStop(0, '#22323f');
      bg.addColorStop(1, '#111d25');
      ctx!.fillStyle = bg;
      ctx!.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      if (phase === 'challengeend') {
        drawStarResult(now, challengeCount, true);
      } else if (phase === 'setclear') {
        drawStarResult(now, progress.stars, false);
      } else if (q) {
        for (let i = 0; i < q.cards.length; i++) {
          const c = q.cards[i]!;
          if (phase === 'burst' && i === burstIndex) {
            const t = Math.min(1, (now - phaseStart) / 650);
            drawCard(c, 1 + t * 0.5, 1 - t, 0.9 * (1 - t));
            // 弾ける光の粒
            ctx!.save();
            ctx!.globalAlpha = 1 - t;
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * Math.PI * 2;
              const r = 40 + t * 90;
              ctx!.fillStyle = 'rgba(255, 226, 130, 0.9)';
              ctx!.beginPath();
              ctx!.arc(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 8 * (1 - t), 0, Math.PI * 2);
              ctx!.fill();
            }
            ctx!.restore();
            continue;
          }
          if (phase === 'burst') {
            // 他カードはそっとフェード
            drawCard(c, 1, Math.max(0, 1 - (now - phaseStart) / 400), 0);
            continue;
          }
          // §8 半自動化: 正解カードをゆっくり点滅
          let glow = 0;
          if (q.stuckAssisted && i === q.correctIndex) {
            glow = 0.5 + 0.5 * Math.sin(now / 500);
          }
          // 他カードを触れた時のやさしいパルス（否定表示ではない）
          let scale = 1;
          if (i === q.wrongPulseIndex) {
            const t = (now - q.wrongPulseStart) / 500;
            if (t < 1) scale = 1 + 0.06 * Math.sin(t * Math.PI);
          }
          drawCard(c, scale, 1, glow);
        }

        // §7.4 チャレンジの円タイマー（数字なし・警告なし）
        if (challengeActive) {
          const frac = Math.max(0, (challengeEndAt - now) / CHALLENGE_MS);
          ctx!.save();
          ctx!.translate(640, 74);
          ctx!.lineWidth = 12;
          ctx!.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx!.beginPath();
          ctx!.arc(0, 0, 34, 0, Math.PI * 2);
          ctx!.stroke();
          ctx!.strokeStyle = 'rgba(150, 220, 250, 0.9)';
          ctx!.beginPath();
          ctx!.arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
          ctx!.stroke();
          ctx!.restore();
        } else if (challengeUnlocked && challengeEnabled) {
          // ⚡アイコン（本人が選んで押す）
          const [zx, zy, zr] = challengeZone();
          ctx!.save();
          ctx!.fillStyle = 'rgba(255, 226, 130, 0.16)';
          ctx!.beginPath();
          ctx!.arc(zx, zy, zr, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.font = '58px serif';
          ctx!.textAlign = 'center';
          ctx!.textBaseline = 'middle';
          ctx!.fillText('⚡', zx, zy + 4);
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

    // 成果を星で表現（数字は画面に出さない、§7.4）
    function drawStarResult(now: number, count: number, big: boolean): void {
      const pop = Math.min(1, (now - phaseStart) / 400);
      ctx!.save();
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      ctx!.font = `${140 * (0.6 + 0.4 * pop)}px serif`;
      ctx!.globalAlpha = pop;
      ctx!.fillText('⭐', 640, big ? 300 : 320);
      ctx!.globalAlpha = 1;
      // 集めた星（横並び、最大15個まで表示）
      const shown = Math.min(count, 15);
      ctx!.font = '54px serif';
      const spacing = 66;
      const startX = 640 - ((shown - 1) * spacing) / 2;
      for (let i = 0; i < shown; i++) {
        ctx!.fillText('⭐', startX + i * spacing, big ? 470 : 490);
      }
      ctx!.restore();
    }

    async function init(): Promise<void> {
      progress = await loadMojiProgress();
      kanjiProg = await loadKanjiProgress();
      challengeEnabled = await getSetting<boolean>('moji.challenge.enabled', true);
      if (disposed) return;
      challengeUnlocked = progress.setsCompleted >= SETS_TO_UNLOCK_CHALLENGE;
      loadQuestion(performance.now());
      const loop = () => {
        if (disposed) return;
        const now = performance.now();
        update(now);
        if (!disposed) draw(now);
        raf = requestAnimationFrame(loop);
      };
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
