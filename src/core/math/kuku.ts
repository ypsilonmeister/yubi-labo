// v2.16（§9.11）M 九九テストれんしゅう: 出題順・くだりの並び・アンカーヒント・記録の読み取り。React に依存しない純粋関数。
// 点数・合否・順位は扱わない。反応時間は使わない。

import type { KukuForm, KukuJudge, Trial, TrialResult } from '../types';
import { shuffle, type Rng } from './choices';

/** [段, かける数]。式は「段 × かける数」 */
export type KukuPair = [number, number];

export const KUKU_MIN = 1;
export const KUKU_MAX = 9;
const NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const isKukuPair = (ops: number[]) => ops.length === 2 && ops.every((v) => Number.isInteger(v) && v >= KUKU_MIN && v <= KUKU_MAX);

/** ぜんぶの段（81問） */
export const allKukuPairs = (): KukuPair[] => NUMS.flatMap((a) => NUMS.map((b): KukuPair => [a, b]));

/** ひとまわりぶんの出題順。mix（ぜんぶの段）だけ段を使わない */
export function kukuOrder(form: KukuForm, dan: number, rng: Rng = Math.random): KukuPair[] {
  if (form === 'mix') return shuffle(allKukuPairs(), rng);
  const up = NUMS.map((b): KukuPair => [dan, b]);
  if (form === 'up') return up;
  if (form === 'down') return up.reverse();
  return shuffle(up, rng);
}

/** 本人がえらんだ1回ぶんの並び（画面のあいだだけ持つ。記録には問題ごとの位置を残す） */
export interface KukuRun {
  id: string;
  form: KukuForm;
  /** mix では使わない */
  dan: number;
  judge: KukuJudge;
  order: KukuPair[];
}

export function newKukuRun(o: { id: string; form: KukuForm; dan: number; judge: KukuJudge }, rng: Rng = Math.random): KukuRun {
  return { ...o, order: kukuOrder(o.form, o.dan, rng) };
}

/**
 * つぎの問題の位置。段の形式は9問で終わり（null）。
 * ぜんぶの段は終わりを本人が決めるので、81問のあとは並べなおして続ける（同じ式は続けて出さない）。
 */
export function nextKukuPosition(run: KukuRun, index: number, rng: Rng = Math.random): { run: KukuRun; index: number } | null {
  if (index + 1 < run.order.length) return { run, index: index + 1 };
  if (run.form !== 'mix') return null;
  const last = run.order[index];
  const order = kukuOrder('mix', run.dan, rng);
  if (order[0][0] === last[0] && order[0][1] === last[1]) order.push(order.shift()!);
  return { run: { ...run, order }, index: 0 };
}

// ---------- くだりの並び ----------

export interface SequenceSlot {
  multiplier: number;
  /** null は数をまだ出さない（いまの式と、このあとの式） */
  value: number | null;
  current: boolean;
}

/**
 * くだり（×9 → ×1）の答えの並び。段の数ずつ減る。
 * すぎた式の答えは見せる。いまの式の答えは「こたえを みる」まで出さない。このあとの式の答えも出さない。
 */
export function descendingSequence(dan: number, multiplier: number, revealed: boolean): SequenceSlot[] {
  return [...NUMS].reverse().map((m) => ({
    multiplier: m,
    value: m > multiplier || (m === multiplier && revealed) ? dan * m : null,
    current: m === multiplier,
  }));
}

// ---------- アンカーヒント ----------

export interface Anchor {
  /** 手がかりにする式の かける数 */
  multiplier: number;
  /** 手がかりの答え（段 × multiplier） */
  value: number;
  /** いまの式まで、段の数を何回たすか（負ならひく回数） */
  steps: number;
}

/**
 * 近い「知っていそうな答え」。四角い数（段×段）・×5・×1 のうち、いちばん近いもの。
 * 同じ近さなら、たして作れる（小さい）ほうを選び、つぎに四角い数・×5・×1 の順。
 * どれも3つ以上はなれるときは、1つ前の式（となり）を使う。×1 は手がかりを使わない（段の数が1こ）。
 */
export function kukuAnchor(dan: number, multiplier: number): Anchor | null {
  if (multiplier <= 1) return null;
  const dist = (k: number) => Math.abs(multiplier - k);
  const near = [dan, 5, 1]
    .filter((k) => k !== multiplier)
    .sort((x, y) => dist(x) - dist(y) || Number(x > multiplier) - Number(y > multiplier))[0];
  const k = dist(near) <= 2 ? near : multiplier - 1;
  return { multiplier: k, value: dan * k, steps: multiplier - k };
}

// ---------- 記録 ----------

/** イベントの payload.action（既存のイベント種類に乗せる。保存形式は変えない） */
export const KUKU_REVEAL = 'kuku_reveal';
export const KUKU_REPORT = 'kuku_report';

/** 試行の結果。「まだ」は間違いに数えない */
export function kukuResult(said: boolean, hinted: boolean): TrialResult {
  const assistanceLevel = !said ? 'not_completed' : hinted ? 'after_hint' : 'independent';
  return {
    outcome: 'completed',
    assistanceLevel,
    correctWithoutHint: assistanceLevel === 'independent',
    mistakeCount: 0,
    hintCount: hinted ? 1 : 0,
    maxHintLevel: hinted ? 1 : 0,
  };
}

/** 「いえた／まだ」の申告（自己確認か親判定か）。まだ押していなければ null */
export function kukuReportOf(t: Pick<Trial, 'events'>): { said: boolean; judgedBy: KukuJudge } | null {
  const e = t.events.find((x) => x.type === 'decision_made' && x.payload?.action === KUKU_REPORT);
  if (!e) return null;
  return { said: e.payload!.said === true, judgedBy: e.payload!.judgedBy === 'parent' ? 'parent' : 'self' };
}

/** 答えを見る前にヒントを使ったか（見たあとのヒントは「ヒントを使って答えた」に数えない） */
export function kukuHinted(t: Pick<Trial, 'events'>): boolean {
  for (const e of t.events) {
    if (e.type === 'attempt' && e.payload?.action === KUKU_REVEAL) return false;
    if (e.type === 'hint_requested') return true;
  }
  return false;
}
