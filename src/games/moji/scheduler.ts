import { getProgress, setProgress } from '../../core/storage/db';
import { CONFUSABLE } from './data';
import {
  HIGH_ACC_THRESHOLD,
  LOW_ACC_THRESHOLD,
  type MojiChar,
  type MojiProgress,
} from './types';

// SPEC §7.3 / §8 もじさがしの出題選択と難易度適応（すべて静かに調整、本人へ通知しない §8）。

const KEY = 'moji.progress';

export function defaultMojiProgress(): MojiProgress {
  return { stage: 0, setsCompleted: 0, stars: 0, challengeBest: 0, charStats: {} };
}

export async function loadMojiProgress(): Promise<MojiProgress> {
  return getProgress<MojiProgress>(KEY, defaultMojiProgress());
}

export async function saveMojiProgress(p: MojiProgress): Promise<void> {
  await setProgress(KEY, p);
}

// 文字別の正答率（判断材料が少ない字は中立値で扱い、極端な増減を避ける）
export function charAccuracy(p: MojiProgress, char: string): number {
  const st = p.charStats[char];
  if (!st || st.attempts < 2) return 0.75;
  return st.correct / st.attempts;
}

// 1問の結果を統計へ反映（§7.3 文字別正答率・反応時間）
export function updateStats(
  p: MojiProgress,
  char: string,
  correct: boolean,
  reactionMs: number,
): void {
  const st = p.charStats[char] ?? { attempts: 0, correct: 0, reactionSum: 0 };
  st.attempts += 1;
  if (correct) st.correct += 1;
  st.reactionSum += reactionMs;
  p.charStats[char] = st;
}

function weightedPick(weights: { c: MojiChar; w: number }[]): MojiChar {
  if (weights.length === 0) {
    // 空プールは呼び出し側のガードで防いでいるが、万一でもクラッシュさせない
    return { char: 'あ', reading: 'あ', kind: 'hiragana' };
  }
  const total = weights.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of weights) {
    r -= x.w;
    if (r <= 0) return x.c;
  }
  return weights[weights.length - 1]!.c;
}

// 次のターゲットを選ぶ。§7.3: 低正答率の字は頻度up / 高正答率かつ安定は間引く。
export function pickTarget(pool: MojiChar[], p: MojiProgress, avoidChar: string | null): MojiChar {
  const weights = pool.map((c) => {
    const acc = charAccuracy(p, c.char);
    let w = 1;
    if (acc < LOW_ACC_THRESHOLD) w = 3; // 出題頻度を上げる
    else if (acc > HIGH_ACC_THRESHOLD) w = 0.3; // 間引く
    // 直前と同じ字は避けめ（ただし低正答率なら残す＝連続で練習になる）
    if (c.char === avoidChar && acc >= LOW_ACC_THRESHOLD) w *= 0.15;
    return { c, w };
  });
  return weightedPick(weights);
}

// §7.3 低正答率の字は選択肢を4枚に減らす → その字が対象なら小さいカード数を使う
export function isLowAccuracy(p: MojiProgress, char: string): boolean {
  return charAccuracy(p, char) < LOW_ACC_THRESHOLD;
}

// ターゲット＋ダミーのカード列を作る（重複文字なし、シャッフル済み）。
// useConfusable の時は §7.3-3 の紛らわしいペアを優先的に混ぜる。
export function pickCards(
  target: MojiChar,
  source: MojiChar[],
  count: number,
  useConfusable: boolean,
): MojiChar[] {
  const used = new Set<string>([target.char]);
  const chosen: MojiChar[] = [];
  const pool = source.filter((c) => c.char !== target.char);

  if (useConfusable) {
    for (const ch of CONFUSABLE[target.char] ?? []) {
      if (chosen.length >= count - 1) break;
      const m = pool.find((c) => c.char === ch && !used.has(c.char));
      if (m) {
        chosen.push(m);
        used.add(ch);
      }
    }
  }

  const rest = pool.filter((c) => !used.has(c.char)).sort(() => Math.random() - 0.5);
  for (const c of rest) {
    if (chosen.length >= count - 1) break;
    chosen.push(c);
    used.add(c.char);
  }

  return [target, ...chosen].sort(() => Math.random() - 0.5);
}
