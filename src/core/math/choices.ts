// 選択肢（ダミー）の生成。§9.0: 2〜4個、識別課題では同じ偶奇のダミーを必ず含める

export type Rng = () => number;

export function shuffle<T>(xs: T[], rng: Rng = Math.random): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface DistractorOptions {
  min: number;
  max: number;
  /** 同じ偶奇のダミーを必ず1つ含める */
  sameParity?: boolean;
  /** 除外したい値 */
  exclude?: number[];
}

/**
 * answer に近い値から count 個のダミーを選ぶ。
 * sameParity のときは answer±2 のうち範囲内のものを必ず1つ入れる。
 */
export function makeDistractors(answer: number, count: number, opts: DistractorOptions, rng: Rng = Math.random): number[] {
  const { min, max } = opts;
  const exclude = new Set([answer, ...(opts.exclude ?? [])]);
  const out: number[] = [];
  const ok = (v: number) => v >= min && v <= max && !exclude.has(v) && !out.includes(v);
  if (opts.sameParity && count > 0) {
    const sp = shuffle([answer - 2, answer + 2], rng).filter(ok);
    if (sp.length) out.push(sp[0]);
  }
  // 近い順に候補を並べ、同じ距離の中はランダム
  for (let d = 1; out.length < count && d <= max - min + 2; d++) {
    for (const v of shuffle([answer - d, answer + d], rng)) {
      if (out.length >= count) break;
      if (ok(v)) out.push(v);
    }
  }
  return out;
}

export function hasSameParityDistractor(answer: number, distractors: number[]): boolean {
  return distractors.some((d) => d !== answer && d % 2 === answer % 2);
}

/** L2 ヒント: 候補を2つに絞る（同偶奇のダミーがあればそれを残す） */
export function narrowToTwo(answer: number, distractors: number[]): number[] {
  const keep = distractors.find((d) => d % 2 === answer % 2) ?? distractors[0];
  return keep === undefined ? [answer] : [answer, keep];
}
