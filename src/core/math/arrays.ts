// 実装拡張（v2.10）: タイルの かけわり（§9.10）の純粋関数。React に依存しない。
//
// - かけざん（array_multiply）: operands = [行, 列]（各 2〜9）。答え = 行 × 列。
// - わりざん（array_divide）: operands = [ぜんぶの数, 行]（ぜんぶの数 = 行 × 列、列も 2〜9）。答え = 列。割り切れる組だけ。
// - 10と のこり（array_split）: operands = [行, 列]（行 2〜9、列 11〜19。のこりが 0 の 10 は出さない）。答え = 行 × 列 = 10の列ぶん + のこりの列ぶん。
// - あまりのある わりざん（array_divide_rem、v2.13）: operands = [ぜんぶの数, 行]。ぜんぶの数 = 行 × 列 + あまり（あまりは 1〜行−1、列は 2〜9）。
//   答え（主な決定点）は 列（1れつの数）。あまりは2つめの決定点として、画面で選ぶ。
// - 誤答候補は、数字の ±1 ではなく「理由のある間違い」（たした・1列ずれた・のこりを かけわすれた など）にする。

import { shuffle, type Rng } from './choices';

export const FACTOR_MIN = 2;
export const FACTOR_MAX = 9;
/** 10と のこりの列の下限（10 は のこりが 0 になり、分ける意味がないので出さない） */
export const SPLIT_MIN = 11;
export const SPLIT_MAX = 19;

export type ArrayTask = 'array_multiply' | 'array_divide' | 'array_split' | 'array_divide_rem';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const isFactor = (v: number) => Number.isInteger(v) && v >= FACTOR_MIN && v <= FACTOR_MAX;

/** かけざんの組（行・列とも 2〜9。3×4 と 4×3 は向きの違う別の問題） */
export function multiplyPairs(): number[][] {
  return range(FACTOR_MIN, FACTOR_MAX).flatMap((r) => range(FACTOR_MIN, FACTOR_MAX).map((c) => [r, c]));
}

/** わりざんの組 [ぜんぶの数, 行]（列も 2〜9） */
export function dividePairs(): number[][] {
  return multiplyPairs().map(([r, c]) => [r * c, r]);
}

/** 10と のこりの組 [行, 列]（行 2〜9、列 11〜19） */
export function splitPairs(): number[][] {
  return range(FACTOR_MIN, FACTOR_MAX).flatMap((r) => range(SPLIT_MIN, SPLIT_MAX).map((c) => [r, c]));
}

/** あまりのある わりざんの組 [ぜんぶの数, 行]（列 2〜9、あまり 1〜行−1） */
export function remainderPairs(): number[][] {
  const out: number[][] = [];
  for (let r = FACTOR_MIN; r <= FACTOR_MAX; r++)
    for (let c = FACTOR_MIN; c <= FACTOR_MAX; c++) for (let d = 1; d < r; d++) out.push([r * c + d, r]);
  return out;
}

export function arrayPairs(task: ArrayTask): number[][] {
  if (task === 'array_divide_rem') return remainderPairs();
  return task === 'array_multiply' ? multiplyPairs() : task === 'array_divide' ? dividePairs() : splitPairs();
}

/** 盤に並べる形（行・列）。わりざんでは答えの列も含む */
export function arrayShape(task: ArrayTask, ops: number[]): { rows: number; cols: number } {
  if (task === 'array_divide') return { rows: ops[1], cols: ops[0] / ops[1] };
  if (task === 'array_divide_rem') return { rows: ops[1], cols: Math.floor(ops[0] / ops[1]) };
  return { rows: ops[0], cols: ops[1] };
}

export function arrayAnswer(task: ArrayTask, ops: number[]): number {
  if (task === 'array_divide') return ops[0] / ops[1];
  if (task === 'array_divide_rem') return Math.floor(ops[0] / ops[1]);
  return ops[0] * ops[1];
}

export function isValidArrayOperands(task: ArrayTask, ops: number[]): boolean {
  if (ops.length !== 2 || !ops.every(Number.isInteger)) return false;
  const [a, b] = ops;
  if (task === 'array_multiply') return isFactor(a) && isFactor(b);
  if (task === 'array_divide') return isFactor(b) && a % b === 0 && isFactor(a / b);
  if (task === 'array_divide_rem') return isFactor(b) && a % b !== 0 && isFactor(Math.floor(a / b));
  return isFactor(a) && b >= SPLIT_MIN && b <= SPLIT_MAX;
}

/** 10と のこりに分けたときの、それぞれの数（10の列ぶん・のこりの列ぶん） */
export function splitParts(rows: number, cols: number): { tens: number; ones: number } {
  return { tens: 10 * rows, ones: (cols - 10) * rows };
}

/**
 * 理由のある間違いの候補（優先順）。先頭はいちばん起こりやすい間違いで、出せるときは必ず入れる。
 * - かけざん: たした（行＋列）／1列すくない・おおい（±行）／1行すくない・おおい（±列）
 * - わりざん: 行の数と取りちがえた／1列すくない・おおい
 * - 10と のこり: のこりを かけわすれた（10×行＋のこりの列）／1列ずれた（±行）／のこりを わすれた（10×行）／10を かけわすれた（のこり×行＋10）
 */
export function reasonedWrongs(task: ArrayTask, ops: number[]): number[] {
  const ans = arrayAnswer(task, ops);
  if (task === 'array_multiply') {
    const [r, c] = ops;
    return [r + c, ans - r, ans + r, ans - c, ans + c];
  }
  if (task === 'array_divide') {
    const r = ops[1];
    return [r, ans - 1, ans + 1, ans + 2];
  }
  if (task === 'array_divide_rem') {
    // あまりを入れて ならべようとした（1列おおい）／わけたりない（1列すくない）／行の数と取りちがえた
    const r = ops[1];
    return [ans + 1, ans - 1, r, ans + 2];
  }
  const [r, c] = ops;
  const rest = c - 10;
  return [10 * r + rest, ans - r, ans + r, 10 * r, rest * r + 10];
}

/** 誤答候補を count こ。先頭の理由（出せるなら）は必ず、のこりは理由の中からランダムに。正答・重複・0以下は入れない */
export function arrayDistractors(task: ArrayTask, ops: number[], count: number, rng: Rng = Math.random): number[] {
  const ans = arrayAnswer(task, ops);
  const ok = (v: number, out: number[]) => Number.isInteger(v) && v > 0 && v !== ans && !out.includes(v);
  const reasons = reasonedWrongs(task, ops);
  const out: number[] = [];
  const first = reasons.find((v) => ok(v, out));
  if (first !== undefined && count > 0) out.push(first);
  for (const v of shuffle(reasons.slice(reasons.indexOf(first ?? -1) + 1), rng)) {
    if (out.length >= count) break;
    if (ok(v, out)) out.push(v);
  }
  // 足りないときだけ、答えのまわりで補う（起こらない想定。安全のため）
  for (let d = 1; out.length < count; d++) {
    if (ok(ans + d, out)) out.push(ans + d);
    if (out.length < count && ok(ans - d, out)) out.push(ans - d);
  }
  return out;
}

/** あまりのある わりざんの あまり */
export function remainderOf(ops: number[]): number {
  return ops[0] % ops[1];
}

/**
 * あまり（2つめの決定点）の誤答候補。理由: 1こ ずれた／わる数（行）と取りちがえた／1列すくなく ならべたときの のこり（あまり＋行）。
 * 正答・重複・負の数は入れない。
 */
export function remainderDistractors(ops: number[], count: number, rng: Rng = Math.random): number[] {
  const [, r] = ops;
  const d = remainderOf(ops);
  const out: number[] = [];
  const ok = (v: number) => Number.isInteger(v) && v >= 0 && v !== d && !out.includes(v);
  for (const v of shuffle([d + 1, d - 1, r, d + r], rng)) {
    if (out.length >= count) break;
    if (ok(v)) out.push(v);
  }
  for (let k = 2; out.length < count; k++) {
    if (ok(d + k)) out.push(d + k);
    if (out.length < count && ok(d - k)) out.push(d - k);
  }
  return out;
}
