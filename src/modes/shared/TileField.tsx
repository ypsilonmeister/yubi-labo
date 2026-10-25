// タイルを r 行に並べた盤（E タイル・リアクターから共通化。v2.10 の L でも使う）。
// 列ごとに上から並べ、割り切れないと最後の列が欠ける（欠けた席は点線で残す）。長方形・素数の石の縁は光る。
// 並びの計算は core/math/tiles.ts の純粋関数。演出は effectLevel を超えない。

import type { ReactNode } from 'react';
import { SLOT_STROKE, TILE } from '../../core/colors';
import type { AccessibilitySettings } from '../../core/types';
import { arrange, colsOf, gaps, isRectangle } from '../../core/math/tiles';
import { successClass } from '../kit/ui';

type S = Readonly<AccessibilitySettings>;

export const TILE_FIELD_W = 1000;
const W = TILE_FIELD_W;
export const TILE_FIELD_H = 420;
const H = TILE_FIELD_H;
export const TILE_AREA = { x: 30, y: 16, w: 940, h: 388 };
const AREA = TILE_AREA;

export interface Pos {
  x: number;
  y: number;
  size: number;
  opacity: number;
}

export function geometry(n: number, rows: number) {
  const cols = colsOf(n, rows);
  const cell = Math.min(66, (AREA.w - 40) / cols, (AREA.h - 40) / rows);
  return { cols, cell, x0: AREA.x + (AREA.w - cols * cell) / 2, y0: AREA.y + (AREA.h - rows * cell) / 2 };
}

export function targets(n: number, rows: number): Pos[] {
  const g = geometry(n, rows);
  return arrange(n, rows).map((c) => ({ x: g.x0 + c.col * g.cell, y: g.y0 + c.row * g.cell, size: g.cell, opacity: 1 }));
}

export function lerpPos(a: Pos[], b: Pos[], t: number): Pos[] {
  return b.map((q, i) => {
    // 新しいタイルは上から落ちてくる
    const p = a[i] ?? { ...q, y: AREA.y - q.size, opacity: 0 };
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, size: p.size + (q.size - p.size) * t, opacity: p.opacity + (q.opacity - p.opacity) * t };
  });
}

export interface TileFieldProps {
  n: number;
  rows: number;
  tiles: Pos[];
  s: S;
  prime?: boolean;
  thumb?: boolean;
  /** 縮小表示の幅（初期 150） */
  thumbWidth?: number;
  /** 縁を光らせるか（初期: 長方形か素数の石のとき。L では正しく選べたときだけ） */
  glow?: boolean;
  /** タイルの下に描くもの（席・区切りなど） */
  under?: ReactNode;
  /** タイルの上に描くもの（ヒントの枠など） */
  over?: ReactNode;
}

export function TileField({ n, rows, tiles, s, prime, thumb, thumbWidth = 150, glow, under, over }: TileFieldProps) {
  const g = geometry(n, rows);
  const rect = isRectangle(n, rows);
  const lit = glow ?? (rect || !!prime);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={thumb ? undefined : 'field-svg'} width={thumb ? thumbWidth : undefined} height={thumb ? (thumbWidth * H) / W : undefined} aria-hidden={thumb}>
      <rect x={AREA.x} y={AREA.y} width={AREA.w} height={AREA.h} rx={26} fill="#f6f1e6" stroke={SLOT_STROKE} strokeWidth={3} />
      {under}
      {gaps(n, rows).map((c) => (
        <rect key={`g${c.col}-${c.row}`} x={g.x0 + c.col * g.cell + 3} y={g.y0 + c.row * g.cell + 3} width={g.cell - 6} height={g.cell - 6} rx={6} fill={TILE.empty} stroke={SLOT_STROKE} strokeWidth={2.5} strokeDasharray="7 5" />
      ))}
      <g className={successClass(s, lit)}>
        {tiles.map((p, i) => (
          <rect key={i} x={p.x + 2} y={p.y + 2} width={p.size - 4} height={p.size - 4} rx={Math.min(8, p.size / 6)} fill={prime ? TILE.prime : TILE.fill} stroke={prime ? TILE.primeStroke : TILE.stroke} strokeWidth={2} opacity={p.opacity} />
        ))}
        {lit && n > 0 && (
          <rect x={g.x0 - 4} y={g.y0 - 4} width={g.cols * g.cell + 8} height={rows * g.cell + 8} rx={10} fill="none" stroke={prime ? TILE.primeStroke : TILE.glow} strokeWidth={5} />
        )}
      </g>
      {over}
    </svg>
  );
}
