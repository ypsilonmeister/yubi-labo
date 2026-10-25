// 数の手札: 数字（数字のふだ ON）と、位のまとまり（千・百・十・一）の小さな絵。L タイルの かけわり・C の2けたで使う。
// 数字のふだ OFF では絵だけ（数字を読まなくても選べる）。

import { digits5 } from '../../core/math/halving';
import type { AccessibilitySettings } from '../../core/types';
import { columnHeight, Columns, columnsWidth } from './PlaceBlocks';

const PLACES4 = [3, 2, 1, 0];

export function NumberChoice({ v, s }: { v: number; s: Readonly<AccessibilitySettings> }) {
  const counts = digits5(v);
  const w = Math.max(40, columnsWidth(counts, PLACES4));
  const h = Math.max(12, ...PLACES4.filter((p) => counts[p] > 0).map((p) => columnHeight(p, counts[p])));
  const sc = Math.min(0.5, 170 / w);
  return (
    <span className="halving-choice">
      {s.numberLabels && <span className="numeral-card">{v}</span>}
      <svg width={Math.max(60, w * sc + 8)} height={h * sc + 8} viewBox={`-4 -4 ${w + 8} ${h + 8}`} aria-hidden>
        <Columns counts={counts} x={0} y={0} places={PLACES4} />
      </svg>
    </span>
  );
}
