// Mode H ぼうの れっしゃの純粋関数（React に依存しない）。
// うえ と した の2本の列車に、それぞれ同じ長さの棒（a と b）を1両ずつつないでいく。
// 「のばす」は短い方の列車に1両足す（同じ長さなら両方）。端がそろったところ＝a と b の公倍数。時間で進むのではなく、タップで1歩ずつ。

export const TRACK = 60; // 線路の長さ（目盛り）

export function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

export interface Trains {
  a: number;
  b: number;
  lenA: number;
  lenB: number;
}

/** 次の1歩。短い方に1両（同じなら両方）。線路からはみ出すなら null（かべ） */
export function stepTrains(t: Trains): Trains | null {
  const addA = t.lenA <= t.lenB;
  const addB = t.lenB <= t.lenA;
  const next = { ...t, lenA: t.lenA + (addA ? t.a : 0), lenB: t.lenB + (addB ? t.b : 0) };
  if (next.lenA > TRACK || next.lenB > TRACK) return null;
  return next;
}

/** 端がそろっているか（そろった位置） */
export function meetingAt(t: Trains): number | null {
  return t.lenA > 0 && t.lenA === t.lenB ? t.lenA : null;
}

/** 図鑑に残す（ちがう長さで、どちらも 2 以上のとき）。最初にそろったところ＝最小公倍数 */
export function isPeriodDiscovery(a: number, b: number): boolean {
  return a !== b && Math.min(a, b) >= 2;
}
