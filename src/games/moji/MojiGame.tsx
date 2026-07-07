import { useEffect, useRef } from 'react';
import { LOGICAL_W, LOGICAL_H } from '../../core/coords';
import { audioGuide } from '../../core/audio/AudioGuide';
import type { PointerState } from '../../core/input/PointerSource';
import { createPointerSource } from '../../core/input/inputProvider';
import { ReplayRecorder } from '../../core/engine/ReplayRecorder';
import { getSetting, type PlayRecord } from '../../core/storage/db';
import { loadKanjiProgress, type KanjiProgressMap } from '../kanji/scheduler';
import {
  distractorSource,
  isWordStage,
  MAX_STAGE,
  stagePool,
  stageUsesConfusable,
  wordDistractorPool,
  wordKanaChar,
  wordsForStage,
  type WordEntry,
} from './data';
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
  WORD_MAX_CARDS,
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
const CARD = 132; // カード一辺（標準）
const SMALL_CARD = 106; // 10枚以上のとき（ことばモード §12.6）
const WORD_AREA_TOP = 200; // ことばモードはスロット行のぶんカードを下げる

type Phase = 'search' | 'burst' | 'setclear' | 'challengeend';

interface Card {
  ch: MojiChar;
  x: number;
  y: number;
}

// ことばモード（SPEC §12.6）: 単語を順番に綴る
interface WordState {
  entry: WordEntry;
  kana: string[]; // 順番のターゲット列
  stepIndex: number;
  consumed: boolean[]; // カードごと（正しい順に消費）
}

interface QState {
  target: MojiChar;
  cards: Card[];
  correctIndex: number; // 単語モードでは -1
  distractors: string[];
  cardCount: number;
  size: number; // カード一辺（枚数で可変）
  startedAt: number; // 出題（音声）時刻: 反応時間とreplayの基準
  wrongTaps: number;
  stuckAssisted: boolean; // §8 90秒停滞→半自動化済み
  wrongPulseIndex: number; // 直近に触れた他カード（やさしいパルス表示用）
  wrongPulseStart: number;
  recorder: ReplayRecorder;
  word: WordState | null;
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
    let wordStagesEnabled = true; // §12.6 ことばモード（stage7+）を保護者が無効化できる
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

    // ジッタ付きグリッド配置。最小間隔 minGap（§7.2-1）。ことばモードは top を下げる。
    function layoutCards(
      count: number,
      size = CARD,
      minGap = 100,
      top = AREA.y0,
    ): [number, number][] {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const w = (AREA.x1 - AREA.x0) / cols;
      const h = (AREA.y1 - top) / rows;
      const cells = Array.from({ length: cols * rows }, (_, i) => i);
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j]!, cells[i]!];
      }
      const jx = Math.max(0, (w - size - minGap) / 2);
      const jy = Math.max(0, (h - size - minGap) / 2);
      return cells.slice(0, count).map((cell) => {
        const cx = cell % cols;
        const cy = Math.floor(cell / cols);
        const x = AREA.x0 + w * (cx + 0.5) + (Math.random() * 2 - 1) * jx;
        const y = top + h * (cy + 0.5) + (Math.random() * 2 - 1) * jy;
        return [x, y];
      });
    }

    function loadQuestion(now: number): void {
      if (isWordStage(progress.stage)) {
        loadWordQuestion(now);
        return;
      }
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
        size: CARD,
        startedAt: now,
        wrongTaps: 0,
        stuckAssisted: false,
        wrongPulseIndex: -1,
        wrongPulseStart: 0,
        recorder,
        word: null,
      };
      phase = 'search';
      phaseStart = now;
      // §7.2-2 出題音声「『ね』は どこかな？」（音＝reading を読む）
      audioGuide.speak('moji.q', { char: target.reading });
    }

    // ことばモード（SPEC §12.6）: 単語をカードから順番にタップして綴る
    function loadWordQuestion(now: number): void {
      const words = wordsForStage(progress.stage);
      const avoid = words.filter((w) => w.word !== lastChar);
      const bag = avoid.length > 0 ? avoid : words;
      const entry = bag[Math.floor(Math.random() * bag.length)]!;
      lastChar = entry.word;
      const kata = !!entry.kata;
      const wordCards: MojiChar[] = entry.kana.map((k) => wordKanaChar(k, kata));

      // ダミー: 綴りに使わない字。カード上限 12 の範囲で cardCount に応じて増減。
      const kanaSet = new Set(entry.kana);
      const pool = wordDistractorPool(progress.stage).filter((c) => !kanaSet.has(c.char));
      const distractorCount = Math.max(2, Math.min(cardCount, WORD_MAX_CARDS - wordCards.length));
      const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
      const usedD = new Set<string>();
      const chosenD: MojiChar[] = [];
      for (const c of shuffledPool) {
        if (chosenD.length >= distractorCount) break;
        if (usedD.has(c.char)) continue;
        usedD.add(c.char);
        chosenD.push(c);
      }

      const all = [...wordCards, ...chosenD];
      const order = all.map((_, i) => i).sort(() => Math.random() - 0.5);
      const shuffledChars = order.map((i) => all[i]!);
      const total = shuffledChars.length;
      const size = total > 9 ? SMALL_CARD : CARD;
      const pos = layoutCards(total, size, total > 9 ? 70 : 100, WORD_AREA_TOP);
      const cards: Card[] = shuffledChars.map((ch, i) => ({ ch, x: pos[i]![0], y: pos[i]![1] }));

      const recorder = new ReplayRecorder();
      recorder.start();
      q = {
        target: wordCards[0]!,
        cards,
        correctIndex: -1,
        distractors: chosenD.map((c) => c.char),
        cardCount: total,
        size,
        startedAt: now,
        wrongTaps: 0,
        stuckAssisted: false,
        wrongPulseIndex: -1,
        wrongPulseStart: 0,
        recorder,
        word: { entry, kana: entry.kana, stepIndex: 0, consumed: new Array(total).fill(false) },
      };
      phase = 'search';
      phaseStart = now;
      audioGuide.speak('moji.word.q', { word: entry.word });
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
        char: q.word ? q.word.entry.word : q.target.char,
        correct,
        reactionMs: Math.round(reactionMs),
        distractors: q.distractors,
        stage: progress.stage,
        cardCount: q.cardCount,
        challenge: challengeActive,
        ...(q.word ? { word: q.word.entry.word, steps: q.word.kana.length } : {}),
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
      if (next > MAX_STAGE) return false;
      if (isWordStage(next)) {
        return wordStagesEnabled && wordsForStage(next).length >= 1;
      }
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

    // ことばモードのカードタップ（SPEC §12.6）。順番どおりなら消費、違えば案内のみ。
    function handleWordTap(now: number, index: number): void {
      if (!q || !q.word) return;
      if (q.word.consumed[index]) return; // 既に綴りに使ったカード
      const card = q.cards[index]!;
      const need = q.word.kana[q.word.stepIndex]!;
      if (card.ch.char === need) {
        q.word.consumed[index] = true;
        audioGuide.chime();
        if (need !== 'っ') audioGuide.speakText(need); // 促音は単体で読ませない
        q.word.stepIndex += 1;
        if (q.word.stepIndex >= q.word.kana.length) wordComplete(now);
      } else {
        // 順番違いも誤答扱いにしない（NO-FAIL）。次に探す字を案内するだけ。
        q.wrongTaps += 1;
        q.wrongPulseIndex = index;
        q.wrongPulseStart = now;
        audioGuide.speak('moji.other.seq', { char: card.ch.reading, target: need });
      }
    }

    function wordComplete(now: number): void {
      if (!q || !q.word) return;
      const reactionMs = now - q.startedAt;
      const correct = q.wrongTaps === 0;
      audioGuide.chime();
      audioGuide.speak('moji.word.done', { word: q.word.entry.word });
      updateStats(progress, q.word.entry.word, correct, reactionMs);
      recordPlay(now, correct, reactionMs);
      adapt(q.word.entry.word, correct, reactionMs);
      burstIndex = -1; // 単語モードは絵文字演出（drawで対応）
      phase = 'burst';
      phaseStart = now;
      if (challengeActive) challengeCount += 1;
      else questionsInSet += 1;
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
      // §12.6 段階別ベスト
      const byStage = progress.challengeBestByStage ?? (progress.challengeBestByStage = {});
      if (challengeCount > (byStage[progress.stage] ?? 0)) byStage[progress.stage] = challengeCount;
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
            const half = q.size / 2;
            for (let i = 0; i < q.cards.length; i++) {
              const c = q.cards[i]!;
              if (Math.abs(pointer.x - c.x) < half && Math.abs(pointer.y - c.y) < half) {
                if (q.word) handleWordTap(now, i);
                else if (i === q.correctIndex) onCorrect(now);
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

    function drawCard(c: Card, scale: number, alpha: number, glow: number, size = CARD): void {
      const half = size / 2;
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
      ctx!.roundRect(-half, -half, size, size, 22);
      ctx!.fill();
      ctx!.shadowBlur = 0;
      ctx!.fillStyle = '#2b2b33';
      // 複数コードポイント（拗音・促音）は字数でフォント縮小（§12.6）
      const glyphLen = [...c.ch.char].length;
      ctx!.font = `${(size * 0.6) / Math.max(1, glyphLen * 0.62)}px ${KANJI_FONT}`;
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      ctx!.fillText(c.ch.char, 0, 6);
      ctx!.restore();
    }

    // ことばモードの綴りスロット行（テキスト解禁の活用、§12.6）
    function drawWordSlots(): void {
      if (!q || !q.word) return;
      const kana = q.word.kana;
      const n = kana.length;
      const slotW = 84;
      const gap = 14;
      const sy = 96;
      const totalW = n * slotW + (n - 1) * gap;
      const sx = 640 - totalW / 2;
      for (let i = 0; i < n; i++) {
        const x = sx + i * (slotW + gap);
        ctx!.save();
        ctx!.fillStyle = 'rgba(247, 243, 232, 0.16)';
        ctx!.strokeStyle = 'rgba(200, 230, 250, 0.5)';
        ctx!.lineWidth = 3;
        ctx!.beginPath();
        ctx!.roundRect(x, sy, slotW, slotW, 16);
        ctx!.fill();
        ctx!.stroke();
        if (i < q.word.stepIndex) {
          ctx!.fillStyle = '#f2ecdc';
          const glyphLen = [...kana[i]!].length;
          ctx!.font = `${(slotW * 0.62) / Math.max(1, glyphLen * 0.62)}px ${KANJI_FONT}`;
          ctx!.textAlign = 'center';
          ctx!.textBaseline = 'middle';
          ctx!.fillText(kana[i]!, x + slotW / 2, sy + slotW / 2 + 4);
        }
        ctx!.restore();
      }
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
        // ことばモード: 綴りスロット行と、消費済み以外のカード
        if (q.word && phase === 'search') drawWordSlots();
        const nextNeed = q.word ? q.word.kana[q.word.stepIndex] : null;
        for (let i = 0; i < q.cards.length; i++) {
          const c = q.cards[i]!;
          if (q.word && q.word.consumed[i]) continue; // スロットへ移動済み
          if (phase === 'burst' && i === burstIndex) {
            const t = Math.min(1, (now - phaseStart) / 650);
            drawCard(c, 1 + t * 0.5, 1 - t, 0.9 * (1 - t), q.size);
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
            drawCard(c, 1, Math.max(0, 1 - (now - phaseStart) / 400), 0, q.size);
            continue;
          }
          // §8 半自動化: 正解カード（単語モードは次に必要な字）をゆっくり点滅
          let glow = 0;
          const assistThis = q.word ? c.ch.char === nextNeed : i === q.correctIndex;
          if (q.stuckAssisted && assistThis) {
            glow = 0.5 + 0.5 * Math.sin(now / 500);
          }
          // 他カードを触れた時のやさしいパルス（否定表示ではない）
          let scale = 1;
          if (i === q.wrongPulseIndex) {
            const t = (now - q.wrongPulseStart) / 500;
            if (t < 1) scale = 1 + 0.06 * Math.sin(t * Math.PI);
          }
          drawCard(c, scale, 1, glow, q.size);
        }
        // 単語完成の絵文字演出
        if (q.word && phase === 'burst') {
          const t = Math.min(1, (now - phaseStart) / 650);
          ctx!.save();
          ctx!.globalAlpha = Math.min(1, t * 2);
          ctx!.textAlign = 'center';
          ctx!.textBaseline = 'middle';
          ctx!.font = `${120 * (0.7 + 0.3 * t)}px serif`;
          ctx!.fillText(q.word.entry.emoji, 640, 400);
          ctx!.restore();
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
      wordStagesEnabled = await getSetting<boolean>('moji.wordStages.enabled', true);
      if (disposed) return;
      // §12.6 段階別ベストの初回シード（旧データの challengeBest を引き継ぐ）
      if (!progress.challengeBestByStage) progress.challengeBestByStage = {};
      if (progress.challengeBestByStage[progress.stage] === undefined) {
        progress.challengeBestByStage[progress.stage] = progress.challengeBest;
      }
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
