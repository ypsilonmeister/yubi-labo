// v2.10 タイルの かけわり（§9.10）
import { describe, expect, it } from 'vitest';
import { arrayAnswer, arrayDistractors, arrayPairs, arrayShape, dividePairs, isValidArrayOperands, multiplyPairs, reasonedWrongs, splitPairs, splitParts, type ArrayTask } from '../core/math/arrays';
import { generateQuestion, validateQuestion } from '../core/engine/questions';
import { currentStep, stepsOf } from '../core/engine/progression';
import { DEFAULT_LEARNING, DEFAULT_SETTINGS } from '../core/settings';
import { GameRegistry } from '../core/registry';
import { registerModes } from '../modes/index';

const TASKS: ArrayTask[] = ['array_multiply', 'array_divide', 'array_split'];

describe('v2.10 タイルの かけわり: 組と答え', () => {
  it('組の数: かけざん 64・わりざん 64・10と のこり 72。どれも検証を通り、重複しない', () => {
    expect(multiplyPairs()).toHaveLength(64);
    expect(dividePairs()).toHaveLength(64);
    expect(splitPairs()).toHaveLength(72);
    for (const t of TASKS) {
      const ps = arrayPairs(t);
      expect(new Set(ps.map((p) => p.join(','))).size).toBe(ps.length);
      for (const p of ps) expect(isValidArrayOperands(t, p)).toBe(true);
    }
  });

  it('わりざんは割り切れる組だけで、答えの列も 2〜9。盤の形は 行 × 答え', () => {
    for (const [n, r] of dividePairs()) {
      expect(n % r).toBe(0);
      const c = arrayAnswer('array_divide', [n, r]);
      expect(c >= 2 && c <= 9).toBe(true);
      expect(arrayShape('array_divide', [n, r])).toEqual({ rows: r, cols: c });
    }
    expect(isValidArrayOperands('array_divide', [13, 3])).toBe(false); // 割り切れない
    expect(isValidArrayOperands('array_divide', [10, 5])).toBe(true);
    expect(isValidArrayOperands('array_divide', [5, 5])).toBe(false); // 列が 1
  });

  it('10と のこり: 10の列ぶん＋のこりの列ぶん＝答え（全72通り）。のこりが 0 の 10 は出さない', () => {
    for (const [r, c] of splitPairs()) {
      const { tens, ones } = splitParts(r, c);
      expect(tens + ones).toBe(arrayAnswer('array_split', [r, c]));
      expect(tens).toBe(10 * r);
    }
    expect(isValidArrayOperands('array_split', [6, 20])).toBe(false);
    expect(isValidArrayOperands('array_split', [6, 10])).toBe(false);
    for (const [, c] of splitPairs()) expect(c - 10).toBeGreaterThan(0);
    expect(isValidArrayOperands('array_split', [1, 13])).toBe(false);
  });
});

describe('v2.10 タイルの かけわり: 誤答候補', () => {
  it('どの組・どの数でも、正答・重複・0以下が入らず、こ数どおり', () => {
    for (const t of TASKS)
      for (const p of arrayPairs(t))
        for (const count of [1, 2, 3]) {
          const ds = arrayDistractors(t, p, count, () => 0.42);
          const ans = arrayAnswer(t, p);
          expect(ds).toHaveLength(count);
          expect(ds).not.toContain(ans);
          expect(new Set(ds).size).toBe(count);
          for (const d of ds) expect(Number.isInteger(d) && d > 0).toBe(true);
        }
  });

  it('いちばん起こりやすい間違いが必ず入る（たした／行と取りちがえ／のこりを かけわすれ）', () => {
    expect(arrayDistractors('array_multiply', [3, 4], 1)).toEqual([7]);
    expect(arrayDistractors('array_divide', [12, 3], 1)).toEqual([3]);
    expect(arrayDistractors('array_split', [6, 13], 1)).toEqual([63]); // 60 + 3
    // 先頭が正答と同じになるときは、つぎの理由を使う
    expect(arrayDistractors('array_multiply', [2, 2], 1)).toEqual([2]); // 2+2=4 は正答なので 4−2
    expect(arrayDistractors('array_divide', [9, 3], 1)).toEqual([2]); // 行=列=3 なので 3−1
  });

  it('理由が足りるかぎり、候補はすべて理由の一覧から出る（答えのまわりで補うのは、理由が足りない小さな組だけ）', () => {
    let filled = 0;
    for (const t of TASKS)
      for (const p of arrayPairs(t)) {
        const ans = arrayAnswer(t, p);
        const reasons = reasonedWrongs(t, p);
        const usable = new Set(reasons.filter((v) => v > 0 && v !== ans)).size;
        for (let seed = 0; seed < 5; seed++) {
          const ds = arrayDistractors(t, p, 3, () => seed / 5);
          const fromReasons = ds.filter((d) => reasons.includes(d)).length;
          expect(fromReasons).toBe(Math.min(3, usable));
          if (usable < 3) filled++;
        }
      }
    // 補うのはごく一部（2×2 など）
    expect(filled).toBeLessThan(40);
  });
});

describe('v2.10 タイルの かけわり: 出題とおまかせ進行', () => {
  it('どの課題・段階・選択肢数でも、出題前の検証を通る', () => {
    for (const choiceCount of [2, 3, 4] as const)
      for (const task of TASKS)
        for (const stage of ['observe', 'predict', 'construct'] as const)
          for (let i = 0; i < 40; i++) {
            const q = generateQuestion({ task, mode: 'mode_l_arrays', stage, settings: DEFAULT_SETTINGS, learning: { ...DEFAULT_LEARNING, choiceCount }, pick: { recentIds: [], priorDayIds: new Set() } });
            expect(validateQuestion(q)).toEqual([]);
            expect(q.distractors.length + 1).toBe(choiceCount);
            expect(q.expectedValue).toBe(arrayAnswer(task, q.operands));
          }
  });

  it('範囲外・割り切れない組は検証で弾く', () => {
    const q = generateQuestion({ task: 'array_divide', mode: 'mode_l_arrays', stage: 'construct', settings: DEFAULT_SETTINGS, learning: DEFAULT_LEARNING, pick: { recentIds: [], priorDayIds: new Set() } });
    expect(validateQuestion({ ...q, operands: [13, 3], expectedValue: 13 / 3 }).length).toBeGreaterThan(0);
    const s = generateQuestion({ task: 'array_split', mode: 'mode_l_arrays', stage: 'construct', settings: DEFAULT_SETTINGS, learning: DEFAULT_LEARNING, pick: { recentIds: [], priorDayIds: new Set() } });
    expect(validateQuestion({ ...s, operands: [6, 25], expectedValue: 150 }).length).toBeGreaterThan(0);
  });

  it('おまかせ進行は かけざん → わりざん → 10と のこり の順。E タイル・リアクターは自由探索のまま', () => {
    registerModes();
    const l = GameRegistry.get('mode_l_arrays');
    expect(stepsOf(l).map((s) => s.task)).toEqual(['array_multiply', 'array_divide', 'array_split']);
    expect(currentStep(l, []).task).toBe('array_multiply');
    expect(stepsOf(GameRegistry.get('mode_e_tiles'))).toEqual([]);
  });
});
