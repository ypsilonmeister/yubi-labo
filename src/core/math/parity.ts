// §9.1 偶奇プレート: 2行×n列（横向き）。各列が上下ペア、奇数の余り1個は最終列の上段。
// row 0 = 上段, row 1 = 下段

export interface Cell {
  col: number;
  row: 0 | 1;
}

export function plateCols(n: number): number {
  return Math.ceil(n / 2);
}

export function plateCells(n: number): Cell[] {
  const cells: Cell[] = [];
  const pairs = Math.floor(n / 2);
  for (let c = 0; c < pairs; c++) cells.push({ col: c, row: 0 }, { col: c, row: 1 });
  if (n % 2 === 1) cells.push({ col: pairs, row: 0 });
  return cells;
}

/** 180°回転したプレート（余りは先頭列の下段に来る） */
export function rotatedCells(n: number): Cell[] {
  const cols = plateCols(n);
  return plateCells(n).map((c) => ({ col: cols - 1 - c.col, row: (1 - c.row) as 0 | 1 }));
}

export interface PlacedPlate {
  value: number;
  /** 何列目から置くか */
  offsetCol: number;
  rotated: boolean;
}

export interface CombinePlan {
  /** 左に置くプレート・右に置くプレート（最終形での配置） */
  left: PlacedPlate;
  right: PlacedPlate;
  /** 奇数＋奇数で2枚目を回転させるか */
  rotateSecond: boolean;
  /** 本人が置いた順と左右を入れ替える必要があるか */
  swapped: boolean;
}

/**
 * a を先に置き b を足したときの最終配置（§9.1）。
 * - 偶数＋任意: 回転なし。偶数を左に置く（a・b とも奇数でない限り）。
 * - 奇数＋奇数: 2枚目を180°回転し、1列左へずらして余り同士をかみ合わせる。
 */
export function combinePlates(a: number, b: number): CombinePlan {
  const aOdd = a % 2 === 1;
  const bOdd = b % 2 === 1;
  if (aOdd && bOdd) {
    return {
      left: { value: a, offsetCol: 0, rotated: false },
      right: { value: b, offsetCol: plateCols(a) - 1, rotated: true },
      rotateSecond: true,
      swapped: false,
    };
  }
  // 少なくとも一方が偶数: 偶数を左へ（両方偶数なら置いた順のまま）
  const swap = aOdd && !bOdd;
  const first = swap ? b : a;
  const second = swap ? a : b;
  return {
    left: { value: first, offsetCol: 0, rotated: false },
    right: { value: second, offsetCol: first / 2, rotated: false },
    rotateSecond: false,
    swapped: swap,
  };
}

export function placedCells(p: PlacedPlate): Cell[] {
  const base = p.rotated ? rotatedCells(p.value) : plateCells(p.value);
  return base.map((c) => ({ col: c.col + p.offsetCol, row: c.row }));
}

export const cellKey = (c: Cell) => `${c.col}:${c.row}`;
