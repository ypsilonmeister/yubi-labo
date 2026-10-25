// 実装拡張（v2.11）: 2けたの繰り上がり・繰り下がり（§9.3 の拡張、C 10の へや）の純粋関数。React に依存しない。
//
// - carry_2d1: 2けた＋1けた（27＋5）。一の位の和が 11〜18（10をこえて のこりがある）、答えは 99 まで。
// - borrow_2d1: 2けた−1けた（43−8）。一の位が足りない。答えは 10 以上（十の位が消えない）。
// - carry_2d2: 2けた＋2けた（27＋15）。一の位の和が 11〜18、答えは 99 まで（100 は Phase 5）。
// - borrow_2d2: 2けた−2けた（43−18）。一の位が足りない。答えは 10 以上。
// 一の位の計算は、今の C と同じ10フレームの規則（10をつくる・ひらく）で行う。十の位は「10」のカードで数える。
// 誤答候補は「理由のある間違い」（くりあがりを わすれた・ひらいた 10を へらしわすれた・一の位を 大きいほうから ひいた など）。

import { shuffle, type Rng } from './choices';

export type TwoDigitTask = 'carry_2d1' | 'borrow_2d1' | 'carry_2d2' | 'borrow_2d2';

export const TWO_DIGIT_MAX = 99;

const tens = (n: number) => Math.floor(n / 10);
const ones = (n: number) => n % 10;

export const isCarryTask = (t: TwoDigitTask) => t === 'carry_2d1' || t === 'carry_2d2';

function carryOk(a: number, b: number, twoDigitB: boolean): boolean {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  if (a < 10 || a > 98 || tens(a) < 1) return false;
  if (twoDigitB ? b < 10 || b > 98 : b < 2 || b > 9) return false;
  const s = ones(a) + ones(b);
  return s >= 11 && s <= 18 && a + b <= TWO_DIGIT_MAX;
}

function borrowOk(m: number, s: number, twoDigitS: boolean): boolean {
  if (!Number.isInteger(m) || !Number.isInteger(s)) return false;
  if (m < 10 || m > 99) return false;
  if (twoDigitS ? s < 10 || s > 98 : s < 2 || s > 9) return false;
  return ones(m) < ones(s) && m - s >= 10;
}

export function isValidTwoDigit(task: TwoDigitTask, ops: number[]): boolean {
  if (ops.length !== 2) return false;
  const [a, b] = ops;
  if (task === 'carry_2d1') return carryOk(a, b, false);
  if (task === 'carry_2d2') return carryOk(a, b, true);
  if (task === 'borrow_2d1') return borrowOk(a, b, false);
  return borrowOk(a, b, true);
}

/** 出題の組（全部）。carry は [たされる数, たす数]、borrow は [ひかれる数, ひく数] */
export function twoDigitPairs(task: TwoDigitTask): number[][] {
  const out: number[][] = [];
  const two = task === 'carry_2d2' || task === 'borrow_2d2';
  for (let a = 10; a <= 99; a++)
    for (let b = two ? 10 : 2; b <= (two ? 98 : 9); b++) if (isValidTwoDigit(task, [a, b])) out.push([a, b]);
  return out;
}

export function twoDigitAnswer(task: TwoDigitTask, ops: number[]): number {
  return isCarryTask(task) ? ops[0] + ops[1] : ops[0] - ops[1];
}

/**
 * 理由のある間違い（優先順）。
 * - たし算: くりあがりを わすれた（−10）／一の位の たし算が 1 ずれた（±1）／10を 2かい たした（+10）
 * - ひき算: ひらいた 10を へらしわすれた（+10）／一の位を 大きいほうから ひいた／一の位の ひき算が 1 ずれた（±1）／十の位を ひきすぎた（−10）
 */
export function twoDigitWrongs(task: TwoDigitTask, ops: number[]): number[] {
  const ans = twoDigitAnswer(task, ops);
  if (isCarryTask(task)) return [ans - 10, ans - 1, ans + 1, ans + 10];
  const [m, s] = ops;
  const reversed = (tens(m) - tens(s)) * 10 + (ones(s) - ones(m));
  return [ans + 10, reversed, ans - 1, ans + 1, ans - 10];
}

/** 誤答候補を count こ。先頭の理由（出せるなら）は必ず。正答・重複・0以下・99 をこえる数は入れない */
export function twoDigitDistractors(task: TwoDigitTask, ops: number[], count: number, rng: Rng = Math.random): number[] {
  const ans = twoDigitAnswer(task, ops);
  const out: number[] = [];
  const ok = (v: number) => Number.isInteger(v) && v > 0 && v <= TWO_DIGIT_MAX && v !== ans && !out.includes(v);
  const reasons = twoDigitWrongs(task, ops);
  const firstIdx = reasons.findIndex(ok);
  if (firstIdx >= 0 && count > 0) out.push(reasons[firstIdx]);
  for (const v of shuffle(reasons.slice(firstIdx + 1), rng)) {
    if (out.length >= count) break;
    if (ok(v)) out.push(v);
  }
  for (let d = 2; out.length < count; d++) {
    if (ok(ans + d)) out.push(ans + d);
    if (out.length < count && ok(ans - d)) out.push(ans - d);
  }
  return out;
}

/** 位ごとの数（十の位・一の位） */
export const digits2 = (n: number) => ({ tens: tens(n), ones: ones(n) });
