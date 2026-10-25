// v2.8 ジオボード（§9.8）の純粋関数
import { describe, expect, it } from 'vitest';
import { boardPoints, BOARD, canExtend, classify, corners, discoveryOf, isRightAngle, rightCorners, SHAPE_CODE, segmentsTouch, type Pt } from '../modes/geoboard/shapes';

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
