import { describe, expect, it } from 'vitest';
import { allBorrowPairs, allCarryPairs, borrowPlan, carryPlan, frameSlot } from '../core/math/tenframe';
import { cellKey, combinePlates, placedCells, plateCells } from '../core/math/parity';
import { countUpPlan, isNormalized, normalize, purseOf, purseValue } from '../core/math/coins';

describe('§9.0 数の範囲', () => {
  it('繰り上がりは 1〜9 ＋ 1〜9、和 11〜18 の全組み合わせ（36通り）', () => {
    const ps = allCarryPairs();
    expect(ps.length).toBe(36);
    for (const [a, b] of ps) expect(a + b).toBeGreaterThanOrEqual(11);
  });
  it('繰り下がりは被減数11〜18、減数2〜9、一の位<減数', () => {
    const ps = allBorrowPairs();
    for (const [m, b] of ps) {
      expect(m % 10).toBeLessThan(b);
      expect(m - b).toBeGreaterThanOrEqual(2);
    }
    expect(ps.length).toBe(36);
  });
});

describe('§9.3 繰り上がりの一般規則（受け入れテスト12）', () => {
  for (const first of ['larger', 'first'] as const)
    it(`全組み合わせで「10−a」と「a+b−10」に分ける（${first}）`, () => {
      for (const [a, b] of allCarryPairs()) {
        const p = carryPlan(a, b, first);
        expect(p.first + p.toFill).toBe(10);
        expect(p.toFill + p.rest).toBe(p.second);
        expect(10 + p.rest).toBe(a + b);
        expect(p.toFill).toBeGreaterThan(0);
        expect(p.rest).toBeGreaterThan(0);
        if (first === 'larger') expect(p.first).toBe(Math.max(a, b));
        else expect(p.first).toBe(a);
      }
    });
});

describe('§9.3 繰り下がりの一般規則（受け入れテスト12）', () => {
  it('減加法: 10 を b と 10−b に分け、10−b と u を合わせる', () => {
    for (const [m, b] of allBorrowPairs()) {
      const p = borrowPlan(m, b, 'subtract_from_ten');
      expect(p.needsOpen).toBe(true);
      expect(p.split).toEqual([b, 10 - b]);
      expect(p.split[1] + p.ones).toBe(m - b);
      expect(p.result).toBe(m - b);
    }
  });
  it('減減法: b を u と b−u に分け、10 から b−u を取る', () => {
    for (const [m, b] of allBorrowPairs()) {
      const p = borrowPlan(m, b, 'subtract_subtract');
      expect(p.split[0]).toBe(m % 10);
      expect(p.split[0] + p.split[1]).toBe(b);
      expect(10 - p.split[1]).toBe(m - b);
      expect(p.result).toBe(m - b);
    }
  });
  it('u ≥ b なら 10 を開かない', () => {
    expect(borrowPlan(15, 3, 'subtract_from_ten').needsOpen).toBe(false);
  });
});

describe('§9.3 埋め方 tenFrameFill', () => {
  it('pairs は左の列から上下1組ずつ、fives は上段5個のあと下段', () => {
    expect([0, 1, 2, 3].map((i) => frameSlot(i, 'pairs'))).toEqual([
      { col: 0, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 0 },
      { col: 1, row: 1 },
    ]);
    expect(frameSlot(4, 'fives')).toEqual({ col: 4, row: 0 });
    expect(frameSlot(5, 'fives')).toEqual({ col: 0, row: 1 });
  });
  it('どちらの埋め方でも 10 マスが重ならない', () => {
    for (const f of ['pairs', 'fives'] as const) {
      const keys = new Set(Array.from({ length: 10 }, (_, i) => JSON.stringify(frameSlot(i, f))));
      expect(keys.size).toBe(10);
    }
  });
});

describe('§9.1 偶奇プレート', () => {
  it('2行×n列、奇数の余りは最終列の上段（6・7・8）', () => {
    expect(plateCells(6).map(cellKey).sort()).toEqual(['0:0', '0:1', '1:0', '1:1', '2:0', '2:1']);
    const seven = plateCells(7);
    expect(seven.length).toBe(7);
    expect(seven.find((c) => c.col === 3)).toEqual({ col: 3, row: 0 });
    expect(plateCells(8).every((c) => c.col <= 3)).toBe(true);
  });
  it('どの組み合わせでも、合体した形は a+b のプレートと一致し、重ならない', () => {
    for (let a = 1; a <= 10; a++)
      for (let b = 1; b <= 10; b++) {
        const plan = combinePlates(a, b);
        const cells = [...placedCells(plan.left), ...placedCells(plan.right)].map(cellKey);
        expect(new Set(cells).size).toBe(cells.length);
        expect(cells.sort()).toEqual(plateCells(a + b).map(cellKey).sort());
        expect(plan.rotateSecond).toBe(a % 2 === 1 && b % 2 === 1);
        // 偶数＋任意では、偶数が左に来る
        if (!plan.rotateSecond && (a % 2 === 0 || b % 2 === 0)) expect(plan.left.value % 2 === 0).toBe(true);
      }
  });
});

describe('§9.4 両替の正規化', () => {
  it('5トークンOFF/ON とも価値を保ち、正規形になる', () => {
    for (const five of [false, true])
      for (let ones = 0; ones < 120; ones++)
        for (let fives = 0; fives < 4; fives++) {
          const p = { 1: ones, 5: fives, 10: 0, 100: 0 };
          const n = normalize(p, five).purse;
          expect(purseValue(n)).toBe(purseValue(p));
          expect(isNormalized(n, five)).toBe(true);
        }
  });
  it('5トークンONでは 1 が5枚で 5、5 が2枚で 10。OFFでは 1 が10枚で 10', () => {
    expect(purseOf(13, false)).toEqual({ 1: 3, 5: 0, 10: 1, 100: 0 });
    expect(purseOf(13, true)).toEqual({ 1: 3, 5: 0, 10: 1, 100: 0 });
    expect(purseOf(8, true)).toEqual({ 1: 3, 5: 1, 10: 0, 100: 0 });
    expect(purseOf(8, false)).toEqual({ 1: 8, 5: 0, 10: 0, 100: 0 });
  });
  it('加数法: 8 にあと 2 で 10、残りの 3 と合わせて 5（13−8）。全組み合わせで差に一致', () => {
    expect(countUpPlan(13, 8)).toMatchObject({ toTen: 2, paidOnes: 3, change: 5 });
    for (const [m, b] of allBorrowPairs()) expect(countUpPlan(m, b).change).toBe(m - b);
  });
});
