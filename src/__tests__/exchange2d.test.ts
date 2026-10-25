// v2.11 Mode D の2けた（10円・1円。お釣りは加数法）
import { describe, expect, it } from 'vitest';
import { twoDigitPairs } from '../core/math/twodigit';
import { borrow2Exchange, carry2Exchange, changeValue, trayValue, xScenes, type XStep } from '../modes/exchange/twoDigitScenes';
import { CARD, CHANGE, INCOMING, ONES_TRAY, PAID, TEN_TRAY, onesSeated, onesSpilled, cardFill } from '../modes/exchange/scenes';
import { generateQuestion, retarget, strategyFor, validateQuestion } from '../core/engine/questions';
import { stepsOf } from '../core/engine/progression';
import { DEFAULT_LEARNING, DEFAULT_SETTINGS } from '../core/settings';
import { GameRegistry } from '../core/registry';
import { registerModes } from '../modes/index';

const decides = (steps: XStep[]) => steps.filter((x): x is Extract<XStep, { kind: 'decide' }> => x.kind === 'decide');
const inside = (p: { x: number; y: number; r: number }, r: { x: number; y: number; w: number; h: number }) => p.x - p.r >= r.x - 1 && p.x + p.r <= r.x + r.w + 1 && p.y - p.r >= r.y - 1 && p.y + p.r <= r.y + r.h + 1;

describe('v2.11 D 2けたの たし算（両替）', () => {
  it('全組み合わせで、はじめと終わりの金額が正しく、決定点は D1（入れる枚数）と D3（ぜんぶで いくら）', () => {
    for (const t of ['carry_2d1', 'carry_2d2'] as const)
      for (const [a, b] of twoDigitPairs(t)) {
        const sc = carry2Exchange(a, b);
        const ws = xScenes(sc);
        expect(trayValue(ws[0])).toBe(a);
        expect(trayValue(ws[ws.length - 1])).toBe(a + b);
        const [d1, d3] = decides(sc.steps);
        expect(d1).toMatchObject({ id: 'D1', target: 'ones', answer: 10 - (a % 10) });
        expect(d3).toMatchObject({ id: 'D3', target: 'box', answer: a + b });
        // 違う枚数: 席が のこる／はみ出す
        for (let k = 1; k <= b % 10; k++) {
          const w = d1.mismatch!(k);
          expect(onesSeated(w)).toBe(Math.min(10, (a % 10) + k));
          expect(onesSpilled(w)).toBe(Math.max(0, (a % 10) + k - 10));
        }
        // 10円は10のへやに、もらうコインは「もらう」の中におさまる
        const last = ws[ws.length - 1];
        for (const c of last.coins.filter((x) => x.opacity > 0.5 && x.value === 10)) expect(inside(c, TEN_TRAY)).toBe(true);
        for (const c of ws[0].coins.filter((x) => x.id.startsWith('b'))) expect(inside(c, INCOMING)).toBe(true);
        for (const c of last.coins.filter((x) => x.opacity > 0.5 && x.value === 1)) expect(inside(c, ONES_TRAY)).toBe(true);
      }
  });
});

describe('v2.11 D 2けたの ひき算（お釣り・加数法）', () => {
  it('全組み合わせで、のこる お金が m − s になり、決定点は D1（お釣りの枚数）と D3（のこる お金）', () => {
    for (const t of ['borrow_2d1', 'borrow_2d2'] as const)
      for (const [m, s] of twoDigitPairs(t)) {
        const sc = borrow2Exchange(m, s);
        const ws = xScenes(sc);
        const last = ws[ws.length - 1];
        expect(changeValue(last)).toBe(m - s);
        const [d1, d3] = decides(sc.steps);
        expect(d1).toMatchObject({ id: 'D1', target: 'card', answer: 10 - (s % 10) });
        expect(d3).toMatchObject({ id: 'D3', target: 'box', answer: m - s });
        // お釣りの枚数どおりにカードの席が うまる
        for (let k = 1; k <= 9; k++) expect(cardFill(d1.mismatch!(k))).toBe(Math.min(k, 10 - (s % 10)));
        // はじめの お金は「もっている お金」の中、のこる お金は「のこる お金」の中
        for (const c of ws[0].coins) expect(inside(c, PAID)).toBe(true);
        for (const c of last.coins.filter((x) => x.opacity > 0.5 && !(x.id.startsWith('mt-') && inside(x, { ...CARD, w: CARD.w + 30, y: CARD.y - 30, h: CARD.h + 30 })))) expect(inside(c, CHANGE)).toBe(true);
      }
  });
});

describe('v2.11 D 2けた: 出題・方略・表現横断', () => {
  it('D でも4課題の出題が検証を通り、ひき算の方略は加数法（count_up）', () => {
    for (const task of ['carry_2d1', 'borrow_2d1', 'carry_2d2', 'borrow_2d2'] as const)
      for (let i = 0; i < 30; i++) {
        const q = generateQuestion({ task, mode: 'mode_d_exchange', stage: 'construct', settings: DEFAULT_SETTINGS, learning: DEFAULT_LEARNING, pick: { recentIds: [], priorDayIds: new Set() } });
        expect(validateQuestion(q)).toEqual([]);
      }
    expect(strategyFor('borrow_2d2', 'mode_d_exchange', DEFAULT_SETTINGS)).toBe('count_up');
    expect(strategyFor('borrow_2d2', 'mode_c_tenframe', DEFAULT_SETTINGS)).toBe(DEFAULT_SETTINGS.borrowStrategy);
  });

  it('C の2けたの問題を D へ表現横断でき、数量関係（ID・答え）を保つ', () => {
    registerModes();
    expect(GameRegistry.transferTargets('borrow_2d2', 'mode_c_tenframe').map((p) => p.id)).toContain('mode_d_exchange');
    const q = generateQuestion({ task: 'borrow_2d2', mode: 'mode_c_tenframe', stage: 'construct', settings: DEFAULT_SETTINGS, learning: DEFAULT_LEARNING, pick: { recentIds: [], priorDayIds: new Set() } });
    const t = retarget(q, 'mode_d_exchange', DEFAULT_SETTINGS, DEFAULT_LEARNING);
    expect(t.id).toBe(q.id);
    expect(t.expectedValue).toBe(q.expectedValue);
    expect(t.strategy).toBe('count_up');
    expect(validateQuestion(t)).toEqual([]);
  });

  it('D のおまかせ進行は、今の課題のあとに2けたの4課題', () => {
    registerModes();
    const d = GameRegistry.get('mode_d_exchange');
    expect(stepsOf(d).slice(-4).map((s) => s.task)).toEqual(['carry_2d1', 'borrow_2d1', 'carry_2d2', 'borrow_2d2']);
  });
});
