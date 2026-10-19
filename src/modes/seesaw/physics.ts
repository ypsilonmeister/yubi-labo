// Mode F シーソーの純粋関数（React に依存しない）。
// 重さ＝いろぼうと同じ長さ・色の重り。左右の合計が同じなら水平（＝）。違えば重い方へ傾く（はみ出し・すきまと同じく、形で見せる）。

export const MAX_TILT = 14; // 度
export const PAN_MAX_WEIGHTS = 8;

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** 傾き（度）。正なら右が下がる。差が大きいほど傾くが、上限で止める */
export function tiltOf(left: number[], right: number[]): number {
  const d = sum(right) - sum(left);
  if (d === 0) return 0;
  return Math.sign(d) * Math.min(MAX_TILT, 4 + Math.abs(d) * 1.5);
}

/** 本課題の左の皿: 10 以下なら1つ、10 をこえたら 10 と のこり（位取りとつながるように） */
export function leftWeights(t: number): number[] {
  return t > 10 ? [10, t - 10] : [t];
}

/**
 * 図鑑に残す釣り合いの形（parts）。左右それぞれを大きい順にそろえ、重りの少ない側を先にする（同じなら辞書順）。
 * 0 が左右の区切り。同じ釣り合いを左右逆にしても同じ記録になる。
 */
export function balanceParts(left: number[], right: number[]): number[] {
  const a = [...left].sort((x, y) => y - x);
  const b = [...right].sort((x, y) => y - x);
  const first = a.length < b.length || (a.length === b.length && a.join(',') <= b.join(',')) ? [a, b] : [b, a];
  return [...first[0], 0, ...first[1]];
}

/** 発見として数える釣り合い（両側に重りがあり、左右が同じ組み合わせではない） */
export function isDiscovery(left: number[], right: number[]): boolean {
  if (!left.length || !right.length || sum(left) !== sum(right)) return false;
  return [...left].sort().join(',') !== [...right].sort().join(',');
}
