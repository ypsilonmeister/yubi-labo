// 図鑑・ふだに使う、形の小さな絵（1 さんかく・2 ちょっかく さんかく・3 しかく・4 ちょうほうけい・5 せいほうけい）。
// 色は TILE だけ。まっすぐな かどには、小さな四角の印をつける。

import { OUTLINE, TILE } from '../../core/colors';
import { SHAPE_CODE, type ShapeClass } from '../../core/math/shapes';

const GLYPH: Record<number, { pts: [number, number][]; marks: number[] }> = {
  [SHAPE_CODE.triangle]: { pts: [[4, 28], [36, 28], [16, 5]], marks: [] },
  [SHAPE_CODE.right_triangle]: { pts: [[6, 28], [36, 28], [6, 6]], marks: [0] },
  [SHAPE_CODE.quadrilateral]: { pts: [[4, 24], [30, 28], [37, 9], [11, 5]], marks: [] },
  [SHAPE_CODE.rectangle]: { pts: [[3, 8], [37, 8], [37, 26], [3, 26]], marks: [0, 1, 2, 3] },
  [SHAPE_CODE.square]: { pts: [[8, 4], [32, 4], [32, 28], [8, 28]], marks: [0, 1, 2, 3] },
};

export function shapeCodeOf(k: ShapeClass): number {
  return SHAPE_CODE[k];
}

export function ShapeGlyph({ code, size = 40 }: { code: number; size?: number }) {
  const g = GLYPH[code];
  if (!g) return null;
  const n = g.pts.length;
  return (
    <svg width={size} height={(size * 32) / 40} viewBox="0 0 40 32" aria-hidden>
      <path d={`M${g.pts.map((p) => p.join(' ')).join(' L')} Z`} fill={TILE.fill} fillOpacity={0.7} stroke={TILE.glow} strokeWidth={2.4} strokeLinejoin="round" />
      {g.marks.map((i) => {
        const v = g.pts[i];
        const a = g.pts[(i + n - 1) % n];
        const b = g.pts[(i + 1) % n];
        const u = unit(a, v);
        const w = unit(b, v);
        const s = 4.5;
        return <path key={i} d={`M${v[0] + u[0] * s} ${v[1] + u[1] * s} l${w[0] * s} ${w[1] * s} l${-u[0] * s} ${-u[1] * s}`} fill="none" stroke={OUTLINE} strokeWidth={1.2} />;
      })}
    </svg>
  );
}

function unit(a: [number, number], v: [number, number]): [number, number] {
  const dx = a[0] - v[0];
  const dy = a[1] - v[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}
