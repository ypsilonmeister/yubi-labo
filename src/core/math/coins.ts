// §9.4 両替の正規化規則
// 5トークンOFF: 1 が10枚で 10 へ。5トークンON: 1 が5枚で 5、5 が2枚で 10。10 が10枚で 100（表示のみ）

export type CoinValue = 1 | 5 | 10 | 100;

export interface Purse {
  1: number;
  5: number;
  10: number;
  100: number;
}

export const emptyPurse = (): Purse => ({ 1: 0, 5: 0, 10: 0, 100: 0 });

export function purseValue(p: Purse): number {
  return p[1] + p[5] * 5 + p[10] * 10 + p[100] * 100;
}

export interface ExchangeStep {
  from: CoinValue;
  count: number;
  to: CoinValue;
}

/** 正規化。行った交換を順に返す（アニメーション用） */
export function normalize(p: Purse, fiveToken: boolean): { purse: Purse; steps: ExchangeStep[] } {
  const q = { ...p };
  const steps: ExchangeStep[] = [];
  if (fiveToken) {
    while (q[1] >= 5) {
      q[1] -= 5;
      q[5] += 1;
      steps.push({ from: 1, count: 5, to: 5 });
    }
    while (q[5] >= 2) {
      q[5] -= 2;
      q[10] += 1;
      steps.push({ from: 5, count: 2, to: 10 });
    }
  } else {
    // 5 トークンを使わない設定: 途中で設定を切り替えて残った 5 は 1 として扱う
    q[1] += q[5] * 5;
    q[5] = 0;
    while (q[1] >= 10) {
      q[1] -= 10;
      q[10] += 1;
      steps.push({ from: 1, count: 10, to: 10 });
    }
  }
  while (q[10] >= 10) {
    q[10] -= 10;
    q[100] += 1;
    steps.push({ from: 10, count: 10, to: 100 });
  }
  return { purse: q, steps };
}

export function isNormalized(p: Purse, fiveToken: boolean): boolean {
  if (p[10] >= 10) return false;
  if (fiveToken) return p[1] < 5 && p[5] < 2;
  return p[1] < 10 && p[5] === 0;
}

/** 値 v を正規形の財布にする */
export function purseOf(v: number, fiveToken: boolean): Purse {
  return normalize({ ...emptyPurse(), 1: v }, fiveToken).purse;
}

export interface CountUpPlan {
  price: number; // 減数 b（ねだん）
  paid: number; // 被減数 m（10 + u で支払う）
  paidOnes: number; // u
  toTen: number; // b にあといくつで 10 か
  change: number; // おつり = toTen + u
}

/** 加数法（お釣り）: 13 − 8 → 8 にあと 2 で 10、残りの 3 と合わせて 5 */
export function countUpPlan(m: number, b: number): CountUpPlan {
  const u = m - 10;
  const toTen = 10 - b;
  return { price: b, paid: m, paidOnes: u, toTen, change: toTen + u };
}
