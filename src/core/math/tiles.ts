// タイルを並べる純粋関数（React に依存しない）。Mode E タイル・リアクターから core へ移した（v2.10 の L・出題エンジンでも使う）。
// n 個のタイルを r 行に「列ごとに上から」並べる（A の偶奇プレートは r = 2 の場合と同じ並び）。
// 割り切れないときは最後の列が欠ける。長方形（r ≥ 2 かつ 列 ≥ 2）ができたら発見。
// 1〜36 個・1〜6 行なので、6 行まで試せば素数かどうかが必ず分かる（36 以下の合成数は 6 以下の約数を持つ）。

export const TILE_MAX = 36;
export const ROWS_MAX = 6;

export interface Cell {
  col: number;
  row: number;
}

/** n 個を rows 行に並べたときの各タイルの位置（i 番目のタイル → 列 floor(i/rows)、行 i%rows） */
export function arrange(n: number, rows: number): Cell[] {
  return Array.from({ length: n }, (_, i) => ({ col: Math.floor(i / rows), row: i % rows }));
}

export function colsOf(n: number, rows: number): number {
  return Math.max(1, Math.ceil(n / rows));
}

/** 欠けている席（最後の列のうち、タイルのない行） */
export function gaps(n: number, rows: number): Cell[] {
  const cols = colsOf(n, rows);
  const rem = n % rows;
  if (n === 0 || rem === 0) return [];
  return Array.from({ length: rows - rem }, (_, k) => ({ col: cols - 1, row: rem + k }));
}

/** 長方形（2行以上・2列以上で、欠けがない）ができるか */
export function isRectangle(n: number, rows: number): boolean {
  return rows >= 2 && n % rows === 0 && n / rows >= 2;
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

/** 素数かどうかを見分けるのに試す必要がある行の数（2 〜 min(6, n−1)） */
export function rowsToTry(n: number): number[] {
  const out: number[] = [];
  for (let r = 2; r <= Math.min(ROWS_MAX, n - 1); r++) out.push(r);
  return out;
}

/** 試した行の数で、どれも長方形にならなかったことが確かめられたら true（＝素数の石を見つけた） */
export function primeFound(n: number, tried: Iterable<number>): boolean {
  if (n < 2) return false;
  const t = new Set(tried);
  const need = rowsToTry(n);
  if (!need.every((r) => t.has(r))) return false;
  return !need.some((r) => isRectangle(n, r));
}
