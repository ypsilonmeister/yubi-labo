// 偶奇プレート（2行×n列）の描画。A モード・図鑑・C の手札で共通に使う

import { cellKey, plateCells, plateCols, type Cell } from '../../core/math/parity';
import { OUTLINE, SLOT_FILL, SLOT_STROKE, SLOT_STROKE_STRONG, inkOn } from '../../core/colors';

/** マスの集合の外周だけを線で結ぶ（1枚の板に見えるように） */
export function outlinePath(cells: Cell[], cell: number): string {
  const set = new Set(cells.map(cellKey));
  const has = (c: number, r: number) => set.has(`${c}:${r}`);
  let d = '';
  for (const { col, row } of cells) {
    const x = col * cell;
    const y = row * cell;
    if (!has(col, row - 1)) d += `M${x} ${y}H${x + cell}`;
    if (!has(col, row + 1)) d += `M${x} ${y + cell}H${x + cell}`;
    if (!has(col - 1, row)) d += `M${x} ${y}V${y + cell}`;
    if (!has(col + 1, row)) d += `M${x + cell} ${y}V${y + cell}`;
  }
  return d;
}

interface PlateProps {
  cells: Cell[];
  cell: number;
  color: string;
  /** 穴（ドット）を描くか */
  holes?: boolean;
  opacity?: number;
  className?: string;
}

export function PlateCells({ cells, cell, color, holes = true, opacity = 1, className }: PlateProps) {
  const ink = inkOn(color);
  return (
    <g opacity={opacity} className={className}>
      {cells.map((c) => (
        <rect key={cellKey(c)} x={c.col * cell} y={c.row * cell} width={cell} height={cell} fill={color} />
      ))}
      {holes &&
        cells.map((c) => (
          <circle key={`h${cellKey(c)}`} cx={c.col * cell + cell / 2} cy={c.row * cell + cell / 2} r={cell * 0.26} fill={ink} opacity={0.28} />
        ))}
      <path d={outlinePath(cells, cell)} stroke={OUTLINE} strokeWidth={3} fill="none" strokeLinecap="square" />
    </g>
  );
}

/** 目標のシルエット（静的な輪郭。ヒント L1 で輪郭を濃くする） */
export function Silhouette({ cells, cell, strong }: { cells: Cell[]; cell: number; strong?: boolean }) {
  return (
    <g>
      {cells.map((c) => (
        <rect key={cellKey(c)} x={c.col * cell} y={c.row * cell} width={cell} height={cell} fill={SLOT_FILL} />
      ))}
      {cells.map((c) => (
        <circle key={`h${cellKey(c)}`} cx={c.col * cell + cell / 2} cy={c.row * cell + cell / 2} r={cell * 0.26} fill={SLOT_STROKE} opacity={0.25} />
      ))}
      <path
        d={outlinePath(cells, cell)}
        stroke={strong ? SLOT_STROKE_STRONG : SLOT_STROKE}
        strokeWidth={strong ? 6 : 3}
        strokeDasharray={strong ? undefined : '8 6'}
        fill="none"
      />
    </g>
  );
}

/** 手札などに置く小さなプレート（単独の SVG） */
export function PlateIcon({ n, color, cell = 18 }: { n: number; color: string; cell?: number }) {
  const cols = Math.max(1, plateCols(n));
  const pad = 3;
  return (
    <svg width={cols * cell + pad * 2} height={2 * cell + pad * 2} viewBox={`${-pad} ${-pad} ${cols * cell + pad * 2} ${2 * cell + pad * 2}`} aria-hidden>
      <PlateCells cells={plateCells(n)} cell={cell} color={color} />
    </svg>
  );
}

/** 置いたプレートの上に、目標の輪郭だけをもう一度描く（はみ出し・足りなさが見えるように） */
export function SilhouetteOutline({ cells, cell }: { cells: Cell[]; cell: number }) {
  return <path d={outlinePath(cells, cell)} stroke={SLOT_STROKE_STRONG} strokeWidth={4} strokeDasharray="9 6" fill="none" pointerEvents="none" />;
}
