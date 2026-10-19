// Mode G ばいばいラボの純粋関数（React に依存しない）。
// ふえる: 1日すすむごとに ×2・×3・×10。64 までは1匹ずつ、それより多いときは 1・10・100・1000・10000 のまとまりで見せる
//   （数字を読まずに大きさが分かるように。10 ずつまとめる考え方は 両替 と同じ）。
// わける: 1 を半分・半分…に分け（1/2〜1/16）、同じ大きさどうしを合体させると元にもどる。

export const GROW_MAX = 99999;
export const SHOW_EACH_MAX = 64;
export const FACTORS = [2, 3, 10] as const;
export type Factor = (typeof FACTORS)[number];

export function canGrow(n: number, f: number): boolean {
  return n * f <= GROW_MAX;
}

/** 位ごとのまとまりの数（[1, 10, 100, 1000, 10000] の順） */
export function placeBlocks(n: number): number[] {
  const out: number[] = [];
  let x = Math.max(0, Math.floor(n));
  for (let i = 0; i < 5; i++) {
    out.push(x % 10);
    x = Math.floor(x / 10);
  }
  return out;
}

export function fromBlocks(b: number[]): number {
  return b.reduce((s, c, i) => s + c * 10 ** i, 0);
}

/**
 * 倍々の発見: 1 から同じ倍率 f だけで days 日すすんだら f^days。2日以上で図鑑に残す。
 * steps は 1 からの倍率の列（もどった分は除いたもの）
 */
export function powerOf(steps: number[]): { factor: number; days: number; value: number } | null {
  if (steps.length < 2 || !steps.every((f) => f === steps[0])) return null;
  return { factor: steps[0], days: steps.length, value: steps[0] ** steps.length };
}

// ---------- わける ----------

export const MAX_PARTS = 16;

/** かけら（分母）の列。合計はいつも 1 */
export function total(pieces: number[]): number {
  return pieces.reduce((s, d) => s + 1 / d, 0);
}

export function split(pieces: number[], i: number): number[] {
  const d = pieces[i];
  if (d === undefined || d * 2 > MAX_PARTS) return pieces;
  return [...pieces.slice(0, i), d * 2, d * 2, ...pieces.slice(i + 1)];
}

/** 合体: 同じ大きさのかけらを2つずつ合わせる（小さい方から）。合わせられなくなるまでくり返す */
export function mergeAll(pieces: number[]): number[] {
  const count = new Map<number, number>();
  for (const d of pieces) count.set(d, (count.get(d) ?? 0) + 1);
  for (let d = MAX_PARTS; d >= 2; d /= 2) {
    const c = count.get(d) ?? 0;
    if (c >= 2) {
      count.set(d, c % 2);
      count.set(d / 2, (count.get(d / 2) ?? 0) + Math.floor(c / 2));
    }
  }
  const out: number[] = [];
  for (const [d, c] of [...count.entries()].sort((a, b) => a[0] - b[0])) for (let k = 0; k < c; k++) out.push(d);
  return out;
}

/** 全部が同じ大きさ（1/d が d こ）になったら、その d（2 以上）。図鑑に「1 を d こに わけた」と残す */
export function evenSplit(pieces: number[]): number | null {
  if (pieces.length < 2 || !pieces.every((d) => d === pieces[0])) return null;
  return pieces[0];
}
