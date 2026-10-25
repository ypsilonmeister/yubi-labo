// v2.8 ジオボード（§9.8）の純粋関数
import { describe, expect, it } from 'vitest';
import { boardPoints, BOARD, canExtend, classify, corners, discoveryOf, givenEdges, goalOperands, isRightAngle, meetsGoal, needsDiagonal, parseGoalOperands, rightCorners, SHAPE_CODE, segmentsTouch, solveShape, type Pt, type ShapeGoal } from '../core/math/shapes';
import { generateQuestion, validateQuestion, GOAL_OF_TASK } from '../core/engine/questions';
import { currentStep, stepsOf } from '../core/engine/progression';
import { DEFAULT_LEARNING, DEFAULT_SETTINGS } from '../core/settings';
import { GameRegistry } from '../core/registry';
import { registerModes } from '../modes/index';
import type { TaskCategory } from '../core/types';

const P = (x: number, y: number): Pt => ({ x, y });

describe('v2.8 ジオボード: 直角と形', () => {
  it('直角は整数の内積で決まる（たて・よこも、ななめも）', () => {
    expect(isRightAngle(P(0, 0), P(2, 0), P(2, 3))).toBe(true);
    expect(isRightAngle(P(0, 0), P(1, 1), P(2, 0))).toBe(true); // ななめの直角
    expect(isRightAngle(P(0, 0), P(2, 0), P(3, 3))).toBe(false);
    expect(isRightAngle(P(0, 0), P(0, 0), P(1, 0))).toBe(false); // 長さ0
  });

  it('形の種類', () => {
    expect(classify([P(0, 0), P(3, 0), P(0, 2)])).toBe('right_triangle');
    expect(classify([P(0, 0), P(2, 0), P(1, 2)])).toBe('triangle');
    expect(classify([P(0, 0), P(3, 0), P(3, 2), P(0, 2)])).toBe('rectangle');
    expect(classify([P(0, 0), P(2, 0), P(2, 2), P(0, 2)])).toBe('square');
    expect(classify([P(0, 0), P(2, 1), P(1, 2), P(0, 1)])).toBe('quadrilateral');
    expect(classify([P(1, 0), P(2, 1), P(1, 2), P(0, 1)])).toBe('square'); // ななめの正方形
    expect(classify([P(0, 0), P(2, 0), P(2, 1), P(1, 1), P(1, 2), P(0, 2)])).toBe('polygon');
  });

  it('一直線上の途中の点は、かどに数えない', () => {
    const rect = [P(0, 0), P(1, 0), P(2, 0), P(2, 1), P(2, 2), P(0, 2)];
    expect(corners(rect)).toHaveLength(4);
    expect(classify(rect)).toBe('square');
    expect(rightCorners(rect)).toEqual([true, true, true, true]);
  });

  it('図鑑に残る発見は、多角形を除く。1〜5 の記号', () => {
    expect(discoveryOf([P(0, 0), P(3, 0), P(3, 2), P(0, 2)])).toEqual({ value: 4, parts: [SHAPE_CODE.rectangle] });
    expect(discoveryOf([P(0, 0), P(3, 0), P(0, 2)])).toEqual({ value: 3, parts: [SHAPE_CODE.right_triangle] });
    expect(discoveryOf([P(0, 0), P(2, 0), P(2, 1), P(1, 1), P(1, 2), P(0, 2)])).toBeNull();
  });

  it('へこんだかど（内角 270°）は直角に数えない。向きが逆まわりでも同じ', () => {
    const L = [P(0, 0), P(2, 0), P(2, 1), P(1, 1), P(1, 2), P(0, 2)];
    expect(rightCorners(L)).toEqual([true, true, true, false, true, true]);
    expect(rightCorners([...L].reverse()).filter(Boolean)).toHaveLength(5);
    expect(classify(L)).toBe('polygon');
  });

  it('長方形は 5×5 のどの置き方でも、4つの直角がある', () => {
    let n = 0;
    for (let x0 = 0; x0 < BOARD; x0++)
      for (let y0 = 0; y0 < BOARD; y0++)
        for (let x1 = x0 + 1; x1 < BOARD; x1++)
          for (let y1 = y0 + 1; y1 < BOARD; y1++) {
            const poly = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
            expect(rightCorners(poly).every(Boolean)).toBe(true);
            expect(classify(poly)).toBe(x1 - x0 === y1 - y0 ? 'square' : 'rectangle');
            n++;
          }
    expect(n).toBe(100); // C(5,2)^2
  });
});

describe('v2.8 ジオボード: ゴムのかけ方', () => {
  it('斜めを使わないときは、たて・よこだけ', () => {
    expect(canExtend([P(0, 0)], P(3, 0), false)).toBe(true);
    expect(canExtend([P(0, 0)], P(1, 1), false)).toBe(false);
    expect(canExtend([P(0, 0)], P(1, 1), true)).toBe(true);
  });

  it('同じ点・使った点・来た道をもどる線は使えない。3つ以上つないだら、さいしょの点でとじられる', () => {
    expect(canExtend([P(0, 0), P(2, 0)], P(2, 0), true)).toBe(false);
    expect(canExtend([P(0, 0), P(2, 0), P(2, 2)], P(2, 0), true)).toBe(false);
    expect(canExtend([P(0, 0), P(2, 0)], P(1, 0), true)).toBe(false); // もどる
    expect(canExtend([P(0, 0), P(2, 0)], P(0, 0), true)).toBe(false); // 2点ではとじられない
    expect(canExtend([P(0, 0), P(2, 0), P(2, 2)], P(0, 0), true)).toBe(true);
  });

  it('ほかの線と交わる・ふれる線は使えない', () => {
    const path = [P(0, 0), P(3, 0), P(3, 3), P(1, 3)];
    expect(canExtend(path, P(1, 0), true)).toBe(false); // 最初の線に ふれる
    expect(canExtend(path, P(1, 2), true)).toBe(true);
    expect(segmentsTouch(P(0, 0), P(2, 2), P(0, 2), P(2, 0))).toBe(true);
    expect(segmentsTouch(P(0, 0), P(1, 0), P(2, 0), P(3, 0))).toBe(false);
  });

  it('どんな順でも、とじた輪は交わらず、classify できる（ランダムな経路）', () => {
    // ゴムがかけられる点だけを選んで進め、とじられたら classify が例外なく答える
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const pts = boardPoints();
    for (let t = 0; t < 400; t++) {
      const allow = rnd() < 0.5;
      const path: Pt[] = [pts[Math.floor(rnd() * pts.length)]];
      for (let k = 0; k < 8; k++) {
        const opts = pts.filter((p) => canExtend(path, p, allow));
        if (!opts.length) break;
        const p = opts[Math.floor(rnd() * opts.length)];
        const closing = path.length >= 3 && p.x === path[0].x && p.y === path[0].y;
        if (closing) {
          expect(['triangle', 'right_triangle', 'quadrilateral', 'rectangle', 'square', 'polygon']).toContain(classify(path));
          break;
        }
        path.push(p);
      }
    }
  });
});

describe('v2.9 かたちづくり: 目標・最初の1辺・見本の解', () => {
  const GOALS: ShapeGoal[] = ['right', 'triangle', 'rectangle'];

  it('最初の1辺は 5×5 で 90 通り（たて 45・よこ 45）。かさならない', () => {
    const es = givenEdges();
    expect(es).toHaveLength(90);
    expect(new Set(es.map((e) => `${e[0].x},${e[0].y},${e[1].x},${e[1].y}`)).size).toBe(90);
  });

  it('どの目標・どの1辺でも、見本の解は線の規則を守り、目標に合い、図鑑に残る', () => {
    for (const goal of GOALS)
      for (const e of givenEdges()) {
        const sol = solveShape(goal, e);
        expect(sol.slice(0, 2)).toEqual(e);
        const diag = needsDiagonal(goal);
        // 1点ずつ、ゴムをかけられる点だけでつなげる
        for (let i = 1; i < sol.length; i++) expect(canExtend(sol.slice(0, i), sol[i], diag)).toBe(true);
        // さいしょの点でとじられる
        expect(canExtend(sol, sol[0], diag)).toBe(true);
        expect(meetsGoal(goal, sol)).toBe(true);
        expect(discoveryOf(sol)).not.toBeNull();
        // 全部の点が盤の中
        for (const p of sol) expect(p.x >= 0 && p.x < BOARD && p.y >= 0 && p.y < BOARD).toBe(true);
      }
  });

  it('三角形はたて・よこだけでは作れず、斜めが要る。見本は斜めの線を1本使う', () => {
    expect(needsDiagonal('triangle')).toBe(true);
    expect(needsDiagonal('rectangle')).toBe(false);
    const sol = solveShape('triangle', givenEdges()[0]);
    const axisOnly = sol.every((p, i) => p.x === sol[(i + 1) % sol.length].x || p.y === sol[(i + 1) % sol.length].y);
    expect(axisOnly).toBe(false);
  });

  it('目標の判定: せいほうけいも 長方形の仲間。ちがう形は合わない', () => {
    const sq = [P(0, 0), P(2, 0), P(2, 2), P(0, 2)];
    const rc = [P(0, 0), P(3, 0), P(3, 2), P(0, 2)];
    const tri = [P(0, 0), P(3, 0), P(0, 2)];
    const quad = [P(0, 0), P(2, 1), P(1, 2), P(0, 1)];
    const L = [P(0, 0), P(2, 0), P(2, 1), P(1, 1), P(1, 2), P(0, 2)];
    for (const g of ['right', 'rectangle'] as const) {
      expect(meetsGoal(g, sq)).toBe(true);
      expect(meetsGoal(g, rc)).toBe(true);
      expect(meetsGoal(g, tri)).toBe(false);
      expect(meetsGoal(g, quad)).toBe(false);
      expect(meetsGoal(g, L)).toBe(false); // へこんだかどは直角ではない
    }
    expect(meetsGoal('triangle', tri)).toBe(true);
    expect(meetsGoal('triangle', rc)).toBe(false);
  });

  it('operands の作り方と読み取りが往復し、範囲外・斜め・長すぎる辺は読み取れない', () => {
    for (const goal of GOALS) for (const e of givenEdges()) expect(parseGoalOperands(goalOperands(goal, e))).toEqual({ goal, edge: e });
    expect(parseGoalOperands([1, 0, 0, 1, 1])).toBeNull(); // ななめ
    expect(parseGoalOperands([1, 0, 0, 4, 0])).toBeNull(); // 長さ4
    expect(parseGoalOperands([1, 0, 0, 5, 0])).toBeNull(); // 盤の外
    expect(parseGoalOperands([9, 0, 0, 1, 0])).toBeNull(); // 目標がない
  });
});


describe('v2.9 かたちづくり: 出題とおまかせ進行', () => {
  const TASKS: TaskCategory[] = ['shape_right', 'shape_triangle', 'shape_rectangle'];

  it('どの課題・段階でも、出題前の検証を通り、選択肢（ダミー）は使わない。目標は課題と合う', () => {
    for (const task of TASKS)
      for (const stage of ['observe', 'predict', 'construct'] as const)
        for (let i = 0; i < 60; i++) {
          const q = generateQuestion({ task, mode: 'mode_k_shapemake', stage, settings: DEFAULT_SETTINGS, learning: DEFAULT_LEARNING, pick: { recentIds: [], priorDayIds: new Set() } });
          expect(validateQuestion(q)).toEqual([]);
          expect(q.distractors).toEqual([]);
          expect(parseGoalOperands(q.operands)?.goal).toBe(GOAL_OF_TASK[task]);
        }
  });

  it('検証は、課題と合わない目標・斜めや長すぎる1辺を弾く', () => {
    const q = generateQuestion({ task: 'shape_triangle', mode: 'mode_k_shapemake', stage: 'construct', settings: DEFAULT_SETTINGS, learning: DEFAULT_LEARNING, pick: { recentIds: [], priorDayIds: new Set() } });
    expect(validateQuestion({ ...q, operands: [3, 0, 0, 1, 0], expectedValue: 3 }).length).toBeGreaterThan(0);
    expect(validateQuestion({ ...q, operands: [2, 0, 0, 1, 1], expectedValue: 2 }).length).toBeGreaterThan(0);
  });

  it('おまかせ進行は 「まっすぐな かど → さんかく → ちょうほうけい」の順。J は決定点なし（自由探索のまま）', () => {
    registerModes();
    const k = GameRegistry.get('mode_k_shapemake');
    expect(stepsOf(k).map((s) => `${s.task}/${s.stage}`)).toEqual(['shape_right/construct', 'shape_triangle/construct', 'shape_rectangle/construct']);
    expect(currentStep(k, []).task).toBe('shape_right');
    expect(stepsOf(GameRegistry.get('mode_j_geoboard'))).toEqual([]);
  });
});
