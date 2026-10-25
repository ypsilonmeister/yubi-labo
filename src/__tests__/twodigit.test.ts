// v2.11 2けたの繰り上がり・繰り下がり（C 10の へや の拡張）
import { describe, expect, it } from 'vitest';
import { isValidTwoDigit, twoDigitAnswer, twoDigitDistractors, twoDigitPairs, twoDigitWrongs, type TwoDigitTask } from '../core/math/twodigit';
import { borrow2Script, carry2Script, CARD_R, cardPos, countWorld, MINI_LOW, scenesOf, TENS, type Step } from '../modes/tenframe/scenes';
import { generateQuestion, validateQuestion } from '../core/engine/questions';
import { currentStep, stepsOf } from '../core/engine/progression';
import { DEFAULT_LEARNING, DEFAULT_SETTINGS } from '../core/settings';
import { GameRegistry } from '../core/registry';
import { registerModes } from '../modes/index';

const TASKS: TwoDigitTask[] = ['carry_2d1', 'borrow_2d1', 'carry_2d2', 'borrow_2d2'];
const fills = ['pairs', 'fives'] as const;
const decides = (steps: Step[]) => steps.filter((x): x is Extract<Step, { kind: 'decide' }> => x.kind === 'decide');

describe('v2.11 2けた: 組の範囲', () => {
  it('どの組も規則を守る（一の位の和 11〜18・答え 99 まで／一の位が足りない・答え 10 以上）', () => {
    for (const t of TASKS) {
      const ps = twoDigitPairs(t);
      expect(ps.length).toBeGreaterThan(30);
      for (const [a, b] of ps) {
        expect(isValidTwoDigit(t, [a, b])).toBe(true);
        const ans = twoDigitAnswer(t, [a, b]);
        if (t.startsWith('carry')) {
          expect((a % 10) + (b % 10)).toBeGreaterThanOrEqual(11);
          expect((a % 10) + (b % 10)).toBeLessThanOrEqual(18);
          expect(ans).toBeLessThanOrEqual(99);
        } else {
          expect(a % 10).toBeLessThan(b % 10);
          expect(ans).toBeGreaterThanOrEqual(10);
        }
        expect(a).toBeGreaterThanOrEqual(10);
        if (t.endsWith('2d2')) expect(b).toBeGreaterThanOrEqual(10);
        else expect(b).toBeLessThanOrEqual(9);
      }
    }
    expect(isValidTwoDigit('carry_2d1', [25, 5])).toBe(false); // 一の位の和が ちょうど 10
    expect(isValidTwoDigit('carry_2d2', [57, 48])).toBe(false); // 100 をこえる
    expect(isValidTwoDigit('borrow_2d1', [13, 5])).toBe(false); // 答えが 10 未満
    expect(isValidTwoDigit('borrow_2d2', [45, 12])).toBe(false); // ひらかなくてよい
  });
});

describe('v2.11 2けた: 誤答候補', () => {
  it('正答・重複・0以下・99 をこえる数が入らず、こ数どおり', () => {
    for (const t of TASKS)
      for (const p of twoDigitPairs(t))
        for (const count of [1, 2, 3]) {
          const ds = twoDigitDistractors(t, p, count, () => 0.3);
          expect(ds).toHaveLength(count);
          expect(ds).not.toContain(twoDigitAnswer(t, p));
          expect(new Set(ds).size).toBe(count);
          for (const d of ds) expect(d > 0 && d <= 99).toBe(true);
        }
  });

  it('いちばん起こりやすい間違いが入る（くりあがりを わすれた／ひらいた 10を へらしわすれた）', () => {
    expect(twoDigitDistractors('carry_2d2', [27, 15], 1)).toEqual([32]);
    expect(twoDigitDistractors('carry_2d1', [27, 5], 1)).toEqual([22]);
    expect(twoDigitDistractors('borrow_2d2', [43, 18], 1)).toEqual([35]);
    expect(twoDigitDistractors('borrow_2d1', [43, 8], 1)).toEqual([45]);
    // 一の位を大きいほうから ひいた数も理由に入っている（43−18 → 4−1=3、8−3=5 で 35）
    expect(twoDigitWrongs('borrow_2d2', [52, 17])).toContain(45);
  });
});

describe('v2.11 2けた: C の場面（全組み合わせ × 埋め方）', () => {
  for (const fill of fills)
    it(`2けた＋1けた・2けた＋2けた / ${fill}`, () => {
      for (const t of ['carry_2d1', 'carry_2d2'] as const)
        for (const [a, b] of twoDigitPairs(t)) {
          const sc = carry2Script(a, b, fill);
          const ws = scenesOf(sc).map((x) => countWorld(x.world));
          // はじめ: 10のカードは a の十の位（と、左下に b の十の位）。フレームに a の一の位、下に b の一の位
          expect(ws[0]).toMatchObject({ kings: Math.floor(a / 10) + Math.floor(b / 10), ones: a % 10, waiting: b % 10, overflow: 0 });
          // どの場面でも、カード×10 と ばら の合計は a + b
          for (const c of ws) expect(10 * c.kings + c.ones + c.waiting + c.overflow + c.inBus).toBe(a + b);
          const last = ws[ws.length - 1];
          expect(10 * last.kings + last.ones).toBe(a + b);
          expect(last).toMatchObject({ waiting: 0, overflow: 0 });
          // 決定点は D1（空席に入れる数）と D3（ぜんぶで いくつ）
          const [d1, d3] = decides(sc.steps);
          expect(d1).toMatchObject({ id: 'D1', target: 'frame', answer: 10 - (a % 10) });
          expect(d3).toMatchObject({ id: 'D3', target: 'total', answer: a + b });
          // カードは9枚まで、10の部屋の中に入る
          const cards = scenesOf(sc)[scenesOf(sc).length - 1].world.blobs.filter((x) => x.king && x.opacity > 0.5);
          expect(cards.length).toBeLessThanOrEqual(9);
          for (const c of cards) {
            expect(c.x + CARD_R * 1.15).toBeLessThanOrEqual(TENS.x + TENS.w);
            expect(c.y + CARD_R).toBeLessThanOrEqual(MINI_LOW.y);
          }
        }
    });

  for (const strategy of ['subtract_from_ten', 'subtract_subtract'] as const)
    for (const fill of fills)
      it(`2けた−1けた・2けた−2けた / ${strategy} / ${fill}`, () => {
        for (const t of ['borrow_2d1', 'borrow_2d2'] as const)
          for (const [m, s] of twoDigitPairs(t)) {
            const sc = borrow2Script(m, s, strategy, fill);
            const ws = scenesOf(sc).map((x) => countWorld(x.world));
            expect(ws[0]).toMatchObject({ kings: Math.floor(m / 10), ones: m % 10, opened: 0 });
            const last = ws[ws.length - 1];
            // のこりは 10のカード×10 と 1の部屋のばら。バスに のった分は ひく数の一の位
            expect(10 * last.kings + last.ones).toBe(m - s);
            expect(last).toMatchObject({ opened: 0, inBus: s % 10, overflow: 0, waiting: 0 });
            const [d1, d3] = decides(sc.steps);
            expect(d1).toMatchObject({ id: 'D1', target: 'bus', answer: strategy === 'subtract_from_ten' ? s % 10 : (s % 10) - (m % 10) });
            expect(d3).toMatchObject({ id: 'D3', target: 'total', answer: m - s });
            // ひらく前は、ひらく カード（K）が最後の1枚
            const k = sc.start.blobs.find((x) => x.id === 'K')!;
            expect(k).toMatchObject(cardPos(Math.floor(m / 10) - 1));
          }
      });
});

describe('v2.11 2けた: 出題とおまかせ進行', () => {
  it('どの課題・選択肢数でも、出題前の検証を通る', () => {
    for (const choiceCount of [2, 3, 4] as const)
      for (const task of TASKS)
        for (let i = 0; i < 40; i++) {
          const q = generateQuestion({ task, mode: 'mode_c_tenframe', stage: 'construct', settings: DEFAULT_SETTINGS, learning: { ...DEFAULT_LEARNING, choiceCount }, pick: { recentIds: [], priorDayIds: new Set() } });
          expect(validateQuestion(q)).toEqual([]);
          expect(q.distractors.length + 1).toBe(choiceCount);
          expect(q.expectedValue).toBe(twoDigitAnswer(task, q.operands));
        }
  });

  it('C のおまかせ進行は、今の課題のあとに 2けた＋1けた → 2けた−1けた → 2けた＋2けた → 2けた−2けた', () => {
    registerModes();
    const c = GameRegistry.get('mode_c_tenframe');
    const tail = stepsOf(c).slice(-4).map((s) => `${s.task}/${s.stage}`);
    expect(tail).toEqual(['carry_2d1/construct', 'borrow_2d1/construct', 'carry_2d2/construct', 'borrow_2d2/construct']);
    // 新しい記録がなければ、今までどおり いちばん はじめの課題から
    expect(currentStep(c, []).task).toBe('complement_10');
  });
});
