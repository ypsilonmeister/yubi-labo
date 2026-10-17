// 受け入れテスト12: C の分解は、全組み合わせで「画面に見えている数」が数学的に正しい
import { describe, expect, it } from 'vitest';
import { allBorrowPairs, allCarryPairs, carryPlan } from '../core/math/tenframe';
import { borrowScript, carryScript, complementScript, countWorld, scenesOf } from '../modes/tenframe/scenes';
import * as D from '../modes/exchange/scenes';
import { purseValue, isNormalized } from '../core/math/coins';

const fills = ['pairs', 'fives'] as const;

describe('Mode C 繰り上がり（全36通り × 先に入れる数 × 埋め方）', () => {
  for (const first of ['larger', 'first'] as const)
    for (const fill of fills)
      it(`${first} / ${fill}`, () => {
        for (const [a, b] of allCarryPairs()) {
          const sc = carryScript(a, b, first, fill);
          const p = carryPlan(a, b, first);
          const ws = scenesOf(sc).map((x) => countWorld(x.world));
          // はじめ: フレームに first、下に second
          expect(ws[0]).toMatchObject({ kings: 0, ones: p.first, waiting: p.second, overflow: 0 });
          // 分けたあとも数は変わらない
          expect(ws[1]).toMatchObject({ ones: p.first, waiting: p.second });
          // 空席に 10−first が入って 10 になる
          expect(ws[2]).toMatchObject({ kings: 0, ones: 10, waiting: p.rest, overflow: 0 });
          // 10 のまとまりになって 10 の部屋へ
          expect(ws[3]).toMatchObject({ kings: 1, ones: 0, waiting: p.rest });
          // 残りが 1 の部屋へ: 10 と rest
          expect(ws[4]).toMatchObject({ kings: 1, ones: p.rest, waiting: 0, overflow: 0 });
          expect(10 * ws[4].kings + ws[4].ones).toBe(a + b);
          // 違う数を選んだときは、はみ出す／足りない様子になる
          const d1 = sc.steps[0];
          if (d1.kind !== 'decide' || !d1.mismatch) throw new Error('D1 がない');
          for (let k = 1; k <= p.second; k++) {
            const c = countWorld(d1.mismatch(k));
            expect(c.ones).toBe(p.first + Math.min(k, p.toFill));
            expect(c.overflow).toBe(Math.max(0, k - p.toFill));
          }
        }
      });
});

describe('Mode C 繰り下がり（全36通り × 方略 × 埋め方）', () => {
  for (const strategy of ['subtract_from_ten', 'subtract_subtract'] as const)
    for (const fill of fills)
      it(`${strategy} / ${fill}`, () => {
        for (const [m, b] of allBorrowPairs()) {
          const sc = borrowScript(m, b, strategy, fill);
          const u = m % 10;
          const start = countWorld(sc.start);
          expect(start).toMatchObject({ kings: 1, ones: u, inBus: 0 });
          const ws = scenesOf(sc).map((x) => countWorld(x.world));
          // どの場面でも、10 の部屋・1 の部屋・バスの合計は m のまま
          for (const c of ws) expect(10 * c.kings + c.opened + c.ones + c.inBus + c.waiting + c.overflow).toBe(m);
          const last = ws[ws.length - 1];
          expect(last).toMatchObject({ kings: 0, opened: 0, ones: m - b, inBus: b, overflow: 0, waiting: 0 });
          if (strategy === 'subtract_from_ten') {
            // 10 を開いたら 10 匹、そのうち b 匹がバスへ、10−b と u を合わせる
            expect(ws[1]).toMatchObject({ kings: 0, opened: 10, ones: u });
            expect(ws[2]).toMatchObject({ opened: 10 - b, inBus: b, ones: u });
          } else {
            // 先に u 匹がバスへ、10 を開いて b−u 匹がバスへ
            expect(ws[1]).toMatchObject({ kings: 1, ones: 0, inBus: u });
            expect(ws[2]).toMatchObject({ kings: 0, opened: 10, inBus: u });
            expect(ws[3]).toMatchObject({ opened: 10 - (b - u), inBus: b });
          }
        }
      });
});

describe('Mode C 10の補数', () => {
  for (const fill of fills)
    it(fill, () => {
      for (let a = 1; a <= 9; a++) {
        const ws = scenesOf(complementScript(a, fill)).map((x) => countWorld(x.world));
        expect(ws[0]).toMatchObject({ ones: a, kings: 0 });
        expect(ws[2]).toMatchObject({ ones: 10, overflow: 0 });
        expect(ws[3]).toMatchObject({ kings: 1, ones: 0 });
      }
    });
});

describe('Mode D 両替（全組み合わせ × 5トークン）', () => {
  for (const five of [false, true]) {
    it(`繰り上がり five=${five}`, () => {
      for (const first of ['larger', 'first'] as const)
        for (const [a, b] of allCarryPairs()) {
          const r = D.carryScenes(a, b, first, five);
          expect(purseValue(r.final)).toBe(a + b);
          expect(r.final[10]).toBe(1);
          expect(isNormalized(r.final, five)).toBe(true);
          // どの場面でも、見えているコインの合計は a+b
          for (const w of r.scenes) expect(purseValue(D.purseIn(w, { x: 0, y: 0, w: D.W, h: D.H }))).toBe(a + b);
        }
    });
    it(`お釣り（加数法） five=${five}`, () => {
      for (const [m, b] of allBorrowPairs()) {
        const sc = D.borrowScript(m, b, five);
        expect(purseValue(sc.finalChange)).toBe(m - b);
        expect(sc.toTen).toBe(10 - b);
        const d1 = sc.steps.find((s) => s.kind === 'decide' && s.id === 'D1');
        if (!d1 || d1.kind !== 'decide' || !d1.mismatch) throw new Error('D1 がない');
        expect(D.cardFill(d1.mismatch(sc.toTen))).toBe(10 - b);
        expect(isNormalized(sc.finalChange, five)).toBe(true);
      }
    });
  }
});

describe('v2.2 ダイレクト操作: D 繰り上がりの「ちぎる位置」（全36通り × 先に入れる数）', () => {
  for (const first of ['larger', 'first'] as const)
    it(first, () => {
      for (const [a, b] of allCarryPairs()) {
        const plan = D.carryDirectPlan(a, b, first);
        const p = carryPlan(a, b, first);
        expect(plan.second).toBe(p.second);
        expect(D.onesSeated(plan.start)).toBe(p.first);
        // ちぎる位置は、ぴったり 10 になる1か所だけ。ほかは すきまが残るか、はみ出す
        for (let k = 1; k <= p.second; k++) {
          const w = plan.fill(k);
          expect(D.onesSeated(w)).toBe(p.first + Math.min(k, p.toFill));
          expect(D.onesSpilled(w)).toBe(Math.max(0, k - p.toFill));
          const exact = D.onesSeated(w) === 10 && D.onesSpilled(w) === 0;
          expect(exact).toBe(k === p.toFill);
          // 入れたコインと残りのコインの合計は変わらない
          expect(D.purseIn(w, { x: 0, y: 0, w: D.W, h: D.H })[1]).toBe(a + b);
        }
        // ぴったりのあとは、10 が1枚と のこり rest 枚になる
        const last = plan.after[plan.after.length - 1];
        const tray = D.purseIn(last, { x: D.TEN_TRAY.x, y: D.TEN_TRAY.y, w: D.ONES_TRAY.x + D.ONES_TRAY.w - D.TEN_TRAY.x, h: D.TEN_TRAY.h });
        expect(tray[10]).toBe(1);
        expect(tray[1]).toBe(p.rest);
        // はじめの最初の場面は、ぴったり入れた場面と同じ位置から続く
        expect(plan.fill(p.toFill).coins.map((c) => [c.id, c.x, c.y])).toEqual(D.carryScenes(a, b, first, false).scenes[1].coins.map((c) => [c.id, c.x, c.y]));
      }
    });
});
