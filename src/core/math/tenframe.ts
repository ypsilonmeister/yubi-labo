// §9.3 10フレーム（2行×5列）と繰り上がり・繰り下がりの一般規則

export type FillOrder = 'pairs' | 'fives';

/** i 番目（0始まり）に埋まるマスの位置 */
export function frameSlot(i: number, fill: FillOrder): { col: number; row: 0 | 1 } {
  if (fill === 'pairs') return { col: Math.floor(i / 2), row: (i % 2) as 0 | 1 };
  return i < 5 ? { col: i, row: 0 } : { col: i - 5, row: 1 };
}

export interface CarryPlan {
  first: number; // フレームに先に入れる数
  second: number; // 後から入れる数
  toFill: number; // 10 − first: 空席に入る数
  rest: number; // first + second − 10: 一の位に残る数
  result: number;
}

/** 繰り上がり a + b（1〜9、和11〜18）。first: 'larger' なら大きい方を先にフレームへ */
export function carryPlan(a: number, b: number, firstOperand: 'larger' | 'first'): CarryPlan {
  const first = firstOperand === 'larger' ? Math.max(a, b) : a;
  const second = firstOperand === 'larger' ? Math.min(a, b) : b;
  return { first, second, toFill: 10 - first, rest: first + second - 10, result: a + b };
}

export interface BorrowPlan {
  minuend: number;
  subtrahend: number;
  tens: number; // 10 の位（Phase 1〜4 では常に 1）
  ones: number; // 一の位 u
  needsOpen: boolean; // u < b なら 10 を開く
  strategy: 'subtract_from_ten' | 'subtract_subtract';
  /** subtract_from_ten: 10 を [b, 10−b] に分ける / subtract_subtract: b を [u, b−u] に分ける */
  split: [number, number];
  /** subtract_from_ten: 10−b と u を合わせる / subtract_subtract: 10 から b−u を取って残る数 */
  remainFromTen: number;
  result: number;
}

export function borrowPlan(m: number, b: number, strategy: 'subtract_from_ten' | 'subtract_subtract'): BorrowPlan {
  const tens = Math.floor(m / 10);
  const ones = m % 10;
  const needsOpen = ones < b;
  if (strategy === 'subtract_from_ten') {
    return {
      minuend: m,
      subtrahend: b,
      tens,
      ones,
      needsOpen,
      strategy,
      split: [b, 10 - b],
      remainFromTen: 10 - b,
      result: 10 - b + ones + (tens - 1) * 10,
    };
  }
  return {
    minuend: m,
    subtrahend: b,
    tens,
    ones,
    needsOpen,
    strategy,
    split: [ones, b - ones],
    remainFromTen: 10 - (b - ones),
    result: 10 - (b - ones) + (tens - 1) * 10,
  };
}

/** §9.0 の範囲 */
export function isCarryPair(a: number, b: number): boolean {
  return a >= 1 && a <= 9 && b >= 1 && b <= 9 && a + b >= 11 && a + b <= 18;
}

export function isBorrowPair(m: number, b: number): boolean {
  return m >= 11 && m <= 18 && b >= 2 && b <= 9 && m % 10 < b;
}

export function allCarryPairs(): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) if (isCarryPair(a, b)) out.push([a, b]);
  return out;
}

export function allBorrowPairs(): [number, number][] {
  const out: [number, number][] = [];
  for (let m = 11; m <= 18; m++) for (let b = 2; b <= 9; b++) if (isBorrowPair(m, b)) out.push([m, b]);
  return out;
}
