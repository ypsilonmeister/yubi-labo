// v2.7 はんぶんチャレンジ（§22）: 出発値・半分・誤答候補・連続問題・検証
import { describe, expect, it } from 'vitest';
import {
  chainOf,
  digitsOf,
  halfOf,
  halvingDistractorCandidates,
  halvingDistractors,
  halvingPlan,
  halvingSteps,
  MIN_GUARANTEED_STEPS,
  mismatchPlaces,
  narrowHalving,
  noRegroupHalf,
  pickStart,
  sidesAfter,
  START_MAX,
  START_MIN,
  startValues,
} from '../core/math/halving';
import { choicesOf, continuationsOf, decisionValue, generateQuestion, halvingQuestion, nextInChain, validateQuestion } from '../core/engine/questions';
import { DEFAULT_LEARNING, DEFAULT_SETTINGS } from '../core/settings';
import { ALL_MODES, ALL_TASKS } from '../core/ids';
import { previewImport } from '../core/storage/dataio';
import { trialPoints } from '../core/score';
import type { Question, Trial, TrialResult } from '../core/types';

/** 再現できる乱数（mulberry32） */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = { recentIds: [], priorDayIds: new Set<string>() };
const gen = (rng: () => number) =>
  generateQuestion({ task: 'halving', mode: 'mode_i_halving', stage: 'construct', settings: DEFAULT_SETTINGS, learning: DEFAULT_LEARNING, pick, rng });

describe('v2.7 はんぶんチャレンジ: 出発値', () => {
  it('出発値は必ず 4けたの 32 の倍数で、少なくとも 5 回は整数の半分が続く（テスト1）', () => {
    const all = startValues();
    expect(all[0]).toBe(1024);
    expect(all[all.length - 1]).toBe(9984); // 境界の 9984 も有効（テスト4）
    expect(all.length).toBe(281);
    for (const n of all) {
      expect(n >= START_MIN && n <= START_MAX).toBe(true);
      expect(n % 32).toBe(0);
      expect(halvingSteps(n)).toBeGreaterThanOrEqual(MIN_GUARANTEED_STEPS);
    }
  });

  it('乱数を固定すると出発値と候補が再現でき、ちがう乱数では複数の出発値が出る（テスト2）', () => {
    const a = gen(seeded(42));
    const b = gen(seeded(42));
    expect(b.operands).toEqual(a.operands);
    expect(b.distractors).toEqual(a.distractors);
    const starts = new Set<number>();
    for (let s = 1; s <= 30; s++) starts.add(gen(seeded(s)).operands[0]);
    expect(starts.size).toBeGreaterThan(5);
    // 固定の値（1024 など）だけにならない
    expect([...starts].some((n) => n !== 1024)).toBe(true);
  });

  it('ほぼ均等に選ぶ（最初と最後の候補も選ばれる）', () => {
    expect(pickStart(() => 0)).toBe(1024);
    expect(pickStart(() => 0.999999)).toBe(9984);
    expect(pickStart(() => 0, [1024])).toBe(1056);
  });
});

describe('v2.7 はんぶんチャレンジ: 半分と分け方', () => {
  it('7424 → 3712 → 1856 → 928 → 464 → 232 → 116 → 58 → 29（テスト3）', () => {
    expect(chainOf(7424)).toEqual([7424, 3712, 1856, 928, 464, 232, 116, 58, 29]);
    expect(halfOf(29)).toBeNull(); // 奇数は丸めない（テスト9）
    expect(halfOf(0)).toBeNull();
  });

  it('全部の出発値の全部の段で、位ごとに分けた結果が半分と一致する', () => {
    for (const s of startValues())
      for (const n of chainOf(s).slice(0, -1)) {
        const plan = halvingPlan(n)!;
        expect(plan.half).toBe(n / 2);
        // 分け終わると、真ん中には何も残らず、左右は半分
        const end = sidesAfter(n, plan.steps.length);
        expect(end.middle.every((c) => c === 0)).toBe(true);
        expect(digitsOf(n / 2)).toEqual(end.each);
        // 各位で、左右に同じ数を置いたあと残るのは 0 か 1（1 なら下の位へひらく）
        for (const st of plan.steps) {
          expect(st.available - st.each * 2).toBe(st.opens ? 1 : 0);
          expect(st.available).toBeLessThanOrEqual(19);
        }
        // 一の位でひらくことはない（偶数なので）
        expect(plan.steps.some((st) => st.place === 0 && st.opens)).toBe(false);
      }
  });

  it('7424: 千の位の 7 は 3 と 3、のこりの 1 を 百の 10 こに ひらく', () => {
    const plan = halvingPlan(7424)!;
    expect(plan.steps[0]).toEqual({ place: 3, available: 7, fromOpened: false, each: 3, opens: true });
    expect(plan.steps[1]).toEqual({ place: 2, available: 14, fromOpened: true, each: 7, opens: false });
    expect(sidesAfter(7424, 1).middle).toEqual([4, 2, 14, 0]);
  });
});

describe('v2.7 はんぶんチャレンジ: 選択肢', () => {
  it('どの段でも、誤答候補に正答が入らず、重複もなく、0 より大きい（テスト5）', () => {
    for (const s of startValues())
      for (const n of chainOf(s).slice(0, -1))
        for (const count of [1, 2, 3]) {
          const d = halvingDistractors(n, count, seeded(n));
          expect(d.length).toBe(count);
          expect(d.includes(n / 2)).toBe(false);
          expect(new Set(d).size).toBe(d.length);
          expect(d.every((v) => Number.isInteger(v) && v > 0)).toBe(true);
        }
  });

  it('ひらかずに分けた間違いがあれば必ず候補に入る（数字の細かい読み分けではなく、理由のある間違い）', () => {
    expect(noRegroupHalf(7424)).toBe(3212);
    expect(halvingDistractors(7424, 2, seeded(1))).toContain(3212);
    // 奇数の位がなければ、ひらかずに分けても正答と同じなので候補にならない
    expect(noRegroupHalf(4824)).toBe(2412);
    expect(halvingDistractorCandidates(4824).some((c) => c.kind === 'no_regroup')).toBe(false);
    // ±1 のような候補は、ほかに候補があるかぎり使わない
    expect(halvingDistractors(7424, 3, seeded(1)).some((v) => Math.abs(v - 3712) === 1)).toBe(false);
  });

  it('L2: 2つに絞ると、正答と「ひらかずに分けた」が残る', () => {
    expect(narrowHalving(7424, [3212, 1856])).toEqual([3712, 3212]);
    expect(narrowHalving(4824, [1206, 9648])).toEqual([2412, 1206]);
  });

  it('違う数を選んだとき、2つ合わせると合わない位がわかる', () => {
    // 3212 を2つ → 6424。千の位だけ違う
    expect(mismatchPlaces(7424, 3212)).toEqual([false, false, false, true, false]);
    expect(mismatchPlaces(7424, 3712).every((x) => !x)).toBe(true);
    // 2倍（14848）を2つ → 29696。5けたになっても比べられる
    expect(mismatchPlaces(7424, 14848)[4]).toBe(true);
  });
});

describe('v2.7 はんぶんチャレンジ: 問題と連続', () => {
  it('出題は検証を通り、選ぶ値は半分（課題別の範囲。0〜20 の課題は変えない）', () => {
    for (let s = 1; s <= 50; s++) {
      const q = gen(seeded(s));
      expect(validateQuestion(q)).toEqual([]);
      expect(decisionValue(q)).toBe(q.operands[0] / 2);
      expect(q.chain?.step).toBe(0);
      expect(q.chain?.initial).toBe(q.operands[0]);
      expect(choicesOf(q, seeded(s)).length).toBe(DEFAULT_LEARNING.choiceCount);
    }
  });

  it('つぎの問題は、前の正答が新しい基準になる（テスト7）。奇数に着いたら続きはない（テスト9）', () => {
    let q: Question | null = halvingQuestion(7424, { id: 'c-1', initial: 7424, step: 0 }, 'mode_i_halving', 'construct', DEFAULT_LEARNING, seeded(1));
    const seen: number[] = [];
    while (q) {
      expect(validateQuestion(q)).toEqual([]);
      seen.push(q.operands[0]);
      expect(q.chain?.id).toBe('c-1');
      q = nextInChain(q, DEFAULT_LEARNING, seeded(2));
    }
    // 58 の半分 29 は奇数なので、58 が最後の問題
    expect(seen).toEqual([7424, 3712, 1856, 928, 464, 232, 116, 58]);
  });

  it('検証: 4けたでない出発値・列とずれた数・奇数ははじく', () => {
    const ok = halvingQuestion(3712, { id: 'c', initial: 7424, step: 1 }, 'mode_i_halving', 'construct', DEFAULT_LEARNING, seeded(3));
    expect(validateQuestion(ok)).toEqual([]);
    expect(validateQuestion({ ...ok, chain: { id: 'c', initial: 7424, step: 2 } }).length).toBeGreaterThan(0);
    expect(validateQuestion({ ...ok, chain: { id: 'c', initial: 512, step: 0 }, operands: [512], expectedValue: 256 }).length).toBeGreaterThan(0);
    expect(validateQuestion({ ...ok, chain: undefined }).length).toBeGreaterThan(0);
  });

  const trial = (q: Question, result: TrialResult): Trial => ({
    trialId: 't',
    orderInSession: 1,
    modeId: 'mode_i_halving',
    question: q,
    settingsSnapshot: DEFAULT_SETTINGS,
    events: [],
    result,
  });
  const res = (o: Partial<TrialResult>): TrialResult => ({ outcome: 'completed', assistanceLevel: 'independent', correctWithoutHint: true, mistakeCount: 0, hintCount: 0, maxHintLevel: 0, ...o });

  it('終わったあと: 選べたら「もう はんぶん」と「あたらしい 4けた」。スキップでは進めない。奇数で終わり', () => {
    const q = halvingQuestion(7424, { id: 'c', initial: 7424, step: 0 }, 'mode_i_halving', 'construct', DEFAULT_LEARNING, seeded(1));
    const c1 = continuationsOf(trial(q, res({})), DEFAULT_LEARNING)!;
    expect(c1.map((c) => c.key)).toEqual(['more', 'new_chain']);
    expect(c1[0].question?.operands).toEqual([3712]);
    // ヒント・実演のあとでも、本人が選べていれば進める
    expect(continuationsOf(trial(q, res({ assistanceLevel: 'after_demo', correctWithoutHint: false, maxHintLevel: 3 })), DEFAULT_LEARNING)![0].key).toBe('more');
    const skipped = continuationsOf(trial(q, res({ outcome: 'skipped', assistanceLevel: 'not_completed', correctWithoutHint: false })), DEFAULT_LEARNING)!;
    expect(skipped.map((c) => c.key)).toEqual(['new_chain']);
    const last = halvingQuestion(58, { id: 'c', initial: 7424, step: 7 }, 'mode_i_halving', 'construct', DEFAULT_LEARNING, seeded(1));
    expect(continuationsOf(trial(last, res({})), DEFAULT_LEARNING)!.map((c) => c.key)).toEqual(['new_chain']);
    // ほかの課題は従来どおり（null =「つぎへ」）
    expect(continuationsOf(trial({ ...q, taskType: 'carry_over' }, res({})), DEFAULT_LEARNING)).toBeNull();
  });

  it('点数は従来の付け方のまま（速さ・連続正解の倍率なし）。誤答→やり直し、ヒント後、実演後を区別できる（テスト6）', () => {
    const q = halvingQuestion(7424, { id: 'c', initial: 7424, step: 0 }, 'mode_i_halving', 'construct', DEFAULT_LEARNING, seeded(1));
    const first = trialPoints(trial(q, res({})));
    const tried = trialPoints(trial(q, res({ mistakeCount: 1 })));
    const hint = trialPoints(trial(q, res({ assistanceLevel: 'after_hint', correctWithoutHint: false, maxHintLevel: 1 })));
    const demo = trialPoints(trial(q, res({ assistanceLevel: 'after_demo', correctWithoutHint: false, maxHintLevel: 3 })));
    expect([first, tried, hint, demo]).toEqual([10, 3, 6, 4]);
    // 何段目でも同じ点（つづけるほど増える倍率はない）
    const deep = halvingQuestion(58, { id: 'c', initial: 7424, step: 7 }, 'mode_i_halving', 'construct', DEFAULT_LEARNING, seeded(1));
    expect(trialPoints(trial(deep, res({})))).toBe(first);
  });
});

describe('v2.7 課題・モードの一覧とインポート', () => {
  it('新しい課題・モードを含むバックアップを読み込める', () => {
    expect(ALL_TASKS).toContain('halving');
    expect(ALL_MODES).toContain('mode_i_halving');
    const q = halvingQuestion(7424, { id: 'c', initial: 7424, step: 0 }, 'mode_i_halving', 'construct', DEFAULT_LEARNING, seeded(1));
    const data = {
      schemaVersion: '2.1',
      profile: { playerLabel: 'x', settings: DEFAULT_SETTINGS },
      sessions: [
        {
          sessionId: 's-1',
          startedAt: '2026-10-25T21:00:00+09:00',
          timeOfDay: 'night',
          trials: [{ trialId: 't-1', orderInSession: 1, modeId: 'mode_i_halving', question: q, settingsSnapshot: DEFAULT_SETTINGS, events: [{ type: 'question_shown', timestampMs: 0 }] }],
        },
      ],
      craftBook: [],
    };
    const p = previewImport(JSON.stringify(data), { schemaVersion: '2.1', profile: data.profile as never, sessions: [], craftBook: [] });
    expect(p.errors).toEqual([]);
    expect(p.trialCount).toBe(1);
  });
});
