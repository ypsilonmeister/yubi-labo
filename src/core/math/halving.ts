// 実装拡張（v2.7）: はんぶんチャレンジ（4けたから「はんぶん、また はんぶん」）の純粋関数。React に依存しない。
//
// - 出発値（A方式）: 1000〜9999 のうち STEP_DIVISOR（32）の倍数から、ほぼ均等に選ぶ「条件付きランダム」。
//   32 の倍数なら、少なくとも 5 回は整数の半分を選べる（例 1024 は 10 回、7424 は 8 回）。
// - 半分は、位ごとのまとまり（1000・100・10・1）を2つに分けて見せる。
//   ある位のまとまりが奇数なら、1つを「ひらいて」下の位の 10 こにする（10 を ひらく と同じ考え方）。
// - 誤答候補は、数字の細かい読み分け（±1 など）ではなく、理由のある間違いを優先する。
// - 小数・分数へは進まない。奇数に着いたら、その列はおしまい（失敗ではない）。

import { shuffle, type Rng } from './choices';

export const START_MIN = 1000;
export const START_MAX = 9999;
/** 出発値は 2^5 の倍数（5 回は整数の半分が続く） */
export const STEP_DIVISOR = 32;
export const MIN_GUARANTEED_STEPS = 5;
/** 出題として扱う値の上限（出発値より大きくはならない） */
export const HALVING_MAX = START_MAX;

/** 位（0: 一、1: 十、2: 百、3: 千） */
export const PLACES = [3, 2, 1, 0] as const;
export const PLACE_VALUE = [1, 10, 100, 1000] as const;
export const PLACE_NAME = ['いち', 'じゅう', 'ひゃく', 'せん'] as const;

/** 出発値の候補（昇順）。32 の倍数で 4 けたのもの */
export function startValues(divisor = STEP_DIVISOR): number[] {
  const out: number[] = [];
  for (let n = Math.ceil(START_MIN / divisor) * divisor; n <= START_MAX; n += divisor) out.push(n);
  return out;
}

/** 出発値を1つ選ぶ（rng を差しかえると再現できる）。avoid にある値はなるべく避ける */
export function pickStart(rng: Rng = Math.random, avoid: number[] = []): number {
  const all = startValues();
  const pool = all.filter((n) => !avoid.includes(n));
  const from = pool.length ? pool : all;
  return from[Math.min(from.length - 1, Math.floor(rng() * from.length))];
}

/** 整数の半分ができるか（2 以上の偶数） */
export function canHalve(n: number): boolean {
  return Number.isInteger(n) && n >= 2 && n % 2 === 0;
}

/** 整数の半分。できないときは null（勝手に丸めない） */
export function halfOf(n: number): number | null {
  return canHalve(n) ? n / 2 : null;
}

/** 出発値から、整数の半分が続くかぎりの列（出発値を含む。最後は奇数） */
export function chainOf(start: number): number[] {
  const out = [start];
  let n = start;
  while (canHalve(n)) {
    n /= 2;
    out.push(n);
  }
  return out;
}

/** 整数の半分が何回続くか */
export function halvingSteps(start: number): number {
  return chainOf(start).length - 1;
}

/** 位ごとのまとまりの数（[一, 十, 百, 千] の順。千の位は 9 をこえない前提） */
export function digitsOf(n: number): [number, number, number, number] {
  const x = Math.max(0, Math.floor(n));
  return [x % 10, Math.floor(x / 10) % 10, Math.floor(x / 100) % 10, Math.floor(x / 1000) % 10];
}

export function fromDigits(d: readonly number[]): number {
  return d.reduce((s, c, i) => s + c * 10 ** i, 0);
}

/** 半分にする1つの位の手順 */
export interface HalvingStep {
  place: 0 | 1 | 2 | 3;
  /** 上の位からひらいて来た 10 こを含めた、この位のまとまりの数 */
  available: number;
  /** 上の位からひらいて来たか */
  fromOpened: boolean;
  /** 左右それぞれに置く数 */
  each: number;
  /** 1つ余って、下の位の 10 こにひらくか */
  opens: boolean;
}

/**
 * 上の位から順に、まとまりを左右へ同じ数ずつ分ける手順。
 * 奇数のときは1つを下の位の 10 こにひらく。n が偶数なら一の位で必ず割り切れる。
 */
export function halvingPlan(n: number): { steps: HalvingStep[]; half: number } | null {
  if (!canHalve(n) || n > HALVING_MAX) return null;
  const d = digitsOf(n);
  const steps: HalvingStep[] = [];
  let carry = 0;
  for (const place of PLACES) {
    const available = d[place] + carry * 10;
    const each = Math.floor(available / 2);
    const opens = available % 2 === 1;
    if (available > 0) steps.push({ place, available, fromOpened: carry > 0, each, opens });
    carry = opens ? 1 : 0;
  }
  const half = steps.reduce((s, st) => s + st.each * PLACE_VALUE[st.place], 0);
  return { steps, half };
}

/** 左右それぞれに置かれた、位ごとのまとまりの数（ステップ k まで進んだとき） */
export function sidesAfter(n: number, k: number): { each: [number, number, number, number]; middle: [number, number, number, number] } {
  const plan = halvingPlan(n);
  const each: [number, number, number, number] = [0, 0, 0, 0];
  const middle = digitsOf(n);
  if (!plan) return { each, middle };
  for (let i = 0; i < Math.min(k, plan.steps.length); i++) {
    const st = plan.steps[i];
    each[st.place] = st.each;
    middle[st.place] = 0;
    // ひらいた 1 つは、下の位の 10 こになって真ん中に残る
    if (st.opens && st.place > 0) middle[st.place - 1] += 10;
  }
  return { each, middle };
}

// ---------- 誤答候補 ----------

/** 位ごとに半分にして、余りを捨てた数（ひらかずに分けた間違い）。奇数の位がなければ正答と同じ */
export function noRegroupHalf(n: number): number {
  return fromDigits(digitsOf(n).map((c) => Math.floor(c / 2)));
}

export type DistractorKind = 'no_regroup' | 'quarter' | 'double' | 'place_shift';

/**
 * 理由のある誤答候補を優先順に並べる。
 * no_regroup: 奇数の位をひらかずに分けた／quarter: 半分を2回した／double: 半分ではなく2倍にした／
 * place_shift: 位の1つ分だけ違う（ほかに候補がないときの予備。いちばん上の位から）
 */
export function halvingDistractorCandidates(n: number): { value: number; kind: DistractorKind }[] {
  const h = halfOf(n);
  if (h === null) return [];
  const out: { value: number; kind: DistractorKind }[] = [];
  const push = (value: number, kind: DistractorKind) => {
    if (!Number.isInteger(value) || value <= 0 || value === h || out.some((o) => o.value === value)) return;
    out.push({ value, kind });
  };
  push(noRegroupHalf(n), 'no_regroup');
  if (h % 2 === 0) push(h / 2, 'quarter');
  push(n * 2, 'double');
  for (let p = 3; p >= 0; p--) {
    const v = PLACE_VALUE[p];
    if (h >= v * 2) push(h - v, 'place_shift');
    push(h + v, 'place_shift');
  }
  return out;
}

/**
 * 誤答候補を count 個。ひらかずに分けた間違いがあれば必ず入れ、
 * 残りは「半分を2回」「2倍」からランダムに、足りなければ位の1つ分の違いで補う。
 */
export function halvingDistractors(n: number, count: number, rng: Rng = Math.random): number[] {
  const cands = halvingDistractorCandidates(n);
  const out: number[] = [];
  const nr = cands.find((c) => c.kind === 'no_regroup');
  if (nr && out.length < count) out.push(nr.value);
  for (const c of shuffle(cands.filter((c) => c.kind === 'quarter' || c.kind === 'double'), rng)) if (out.length < count) out.push(c.value);
  for (const c of cands.filter((c) => c.kind === 'place_shift')) if (out.length < count && !out.includes(c.value)) out.push(c.value);
  return out;
}

/** L2 ヒント: 候補を2つに絞る（ひらかずに分けた間違いがあれば、それを残す） */
export function narrowHalving(n: number, distractors: number[]): number[] {
  const h = halfOf(n);
  if (h === null) return distractors;
  const nr = noRegroupHalf(n);
  const keep = distractors.includes(nr) ? nr : distractors[0];
  return keep === undefined ? [h] : [h, keep];
}

/** 位ごとの数（一・十・百・千・万の 5 けた。2倍の誤答を2つ合わせると 5 けたになることがある） */
export function digits5(n: number): number[] {
  const x = Math.max(0, Math.floor(n));
  return [0, 1, 2, 3, 4].map((i) => Math.floor(x / 10 ** i) % 10);
}

/** 選んだ数を2つ合わせた量と、もとの数の位ごとの比較（[一, 十, 百, 千, 万]。違う位だけ true） */
export function mismatchPlaces(n: number, chosen: number): boolean[] {
  const a = digits5(n);
  const b = digits5(chosen * 2);
  return a.map((x, i) => x !== b[i]);
}
