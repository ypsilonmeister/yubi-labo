// 位ごとのまとまり（1・10・100・1000・10000）を列に並べて描く。はんぶんチャレンジの場・おさら・手札で共通に使う。
// 色は TILE だけ（数の色は使わない）。大きさ・形で位が分かる。一度に描くのは各位 19 こまで（数千このタイルは描かない）。

import { OUTLINE, SLOT_STROKE, TILE } from '../../core/colors';

/** 位ごとの1こ分の描画の大きさ（左上からの幅・高さ）と、1行に並べる数 */
const CELL = [
  { w: 26, h: 26, perRow: 5 }, // 一: 小さな四角（スマホ幅でも見えるよう、百・千よりは小さいまま大きめにとる）
  { w: 16, h: 52, perRow: 10 }, // 十: 棒
  { w: 30, h: 30, perRow: 5 }, // 百: 板
  { w: 46, h: 46, perRow: 3 }, // 千: かたまり
  { w: 58, h: 58, perRow: 2 }, // 万: 大きな箱（2倍の誤答を2つ合わせたときだけ）
] as const;

const GAP = 26;

export function columnWidth(place: number, count: number): number {
  const c = CELL[place];
  return Math.min(Math.max(count, 1), c.perRow) * c.w;
}

export function columnHeight(place: number, count: number): number {
  const c = CELL[place];
  return Math.ceil(Math.max(count, 1) / c.perRow) * c.h;
}

function Unit({ place, x, y, opened }: { place: number; x: number; y: number; opened?: boolean }) {
  const f = TILE.fill;
  const st = opened ? TILE.glow : TILE.stroke;
  const sw = opened ? 2.5 : 1.5;
  if (place === 0) return <rect x={x + 1} y={y + 1} width={CELL[0].w - 2} height={CELL[0].h - 2} rx={4} fill={f} stroke={st} strokeWidth={sw} />;
  if (place === 1)
    return (
      <g>
        <rect x={x + 1} y={y + 1} width={CELL[1].w - 2} height={CELL[1].h - 2} rx={2} fill={f} stroke={st} strokeWidth={sw} />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1={x + 1} x2={x + CELL[1].w - 1} y1={y + 1 + (i + 1) * ((CELL[1].h - 2) / 10)} y2={y + 1 + (i + 1) * ((CELL[1].h - 2) / 10)} stroke={TILE.stroke} strokeWidth={0.5} />
        ))}
      </g>
    );
  if (place === 2)
    return (
      <g>
        <rect x={x + 1} y={y + 1} width={27} height={27} rx={2} fill={f} stroke={st} strokeWidth={sw} />
        {Array.from({ length: 4 }, (_, i) => (
          <g key={i} stroke={TILE.stroke} strokeWidth={0.5}>
            <line x1={x + 1 + (i + 1) * 5.4} x2={x + 1 + (i + 1) * 5.4} y1={y + 1} y2={y + 28} />
            <line x1={x + 1} x2={x + 28} y1={y + 1 + (i + 1) * 5.4} y2={y + 1 + (i + 1) * 5.4} />
          </g>
        ))}
      </g>
    );
  const s = place === 3 ? 32 : 40;
  const d = s * 0.3;
  return (
    <g stroke={st} strokeWidth={sw}>
      <path d={`M${x} ${y + d} L${x + d} ${y} L${x + s + d} ${y} L${x + s} ${y + d} Z`} fill="#c4dcf0" />
      <path d={`M${x + s} ${y + d} L${x + s + d} ${y} L${x + s + d} ${y + s} L${x + s} ${y + s + d} Z`} fill="#7fa9cc" />
      <rect x={x} y={y + d} width={s} height={s} fill={f} />
      {place === 4 && <rect x={x} y={y + d + s * 0.4} width={s} height={s * 0.18} fill={TILE.glow} stroke="none" opacity={0.85} />}
    </g>
  );
}

export interface ColumnsProps {
  /** 位ごとの数（[一, 十, 百, 千, 万]。足りない位は 0） */
  counts: number[];
  /** 位ごとに「上の位からひらいて来た」こ数（その位の最後の何こを、ひらいた印で描く） */
  opened?: number[];
  /** 描く左上 */
  x: number;
  y: number;
  /** 描く位（左から。初期は 千・百・十・一） */
  places?: number[];
  /** 違いを示す位（点線のわく） */
  mark?: boolean[];
  /** 位の名前と数字を、列の下に出す（L1 ヒント） */
  labels?: { names: string[]; digits: boolean } | null;
  /** 列の幅をそろえる（場で使う。手札では詰める） */
  fixed?: boolean;
  opacity?: number;
}

const NAME = ['いち', 'じゅう', 'ひゃく', 'せん', 'まん'];

/** 位の列の幅（fixed のときは、その位の最大のこ数で幅を決める） */
function widthOf(place: number, count: number, fixed?: boolean): number {
  return fixed ? CELL[place].perRow * CELL[place].w : columnWidth(place, count);
}

export function columnsWidth(counts: number[], places = [3, 2, 1, 0], fixed?: boolean): number {
  const used = places.filter((p) => fixed || (counts[p] ?? 0) > 0);
  if (!used.length) return 0;
  return used.reduce((s, p) => s + widthOf(p, counts[p] ?? 0, fixed), 0) + (used.length - 1) * GAP;
}

export function Columns({ counts, opened, x, y, places = [3, 2, 1, 0], mark, labels, fixed, opacity = 1 }: ColumnsProps) {
  let cx = x;
  const out = places
    .filter((p) => fixed || (counts[p] ?? 0) > 0)
    .map((p) => {
      const n = counts[p] ?? 0;
      const c = CELL[p];
      const w = widthOf(p, n, fixed);
      const x0 = cx;
      cx += w + GAP;
      const op = opened?.[p] ?? 0;
      const h = Math.max(columnHeight(p, n), c.h);
      return (
        <g key={p}>
          {Array.from({ length: n }, (_, i) => (
            <Unit key={i} place={p} x={x0 + (i % c.perRow) * c.w} y={y + Math.floor(i / c.perRow) * c.h} opened={i >= n - op} />
          ))}
          {mark?.[p] && <rect x={x0 - 6} y={y - 6} width={Math.max(w, c.w) + 12} height={h + 12} rx={8} fill="none" stroke={SLOT_STROKE} strokeWidth={3} strokeDasharray="8 6" />}
          {labels && (
            <text x={x0 + w / 2} y={y - 12} textAnchor="middle" fontSize={18} fill="#5a4f40" fontWeight={700}>
              {labels.names[p] ?? NAME[p]}
              {labels.digits ? `  ${n}` : ''}
            </text>
          )}
        </g>
      );
    });
  return <g opacity={opacity}>{out}</g>;
}

/** 位と位のあいだの縦線（L1 ヒント。位の区切りを強く見せる） */
export function PlaceDividers({ counts, x, y, h, places = [3, 2, 1, 0], fixed }: { counts: number[]; x: number; y: number; h: number; places?: number[]; fixed?: boolean }) {
  const used = places.filter((p) => fixed || (counts[p] ?? 0) > 0);
  let cx = x;
  const lines: number[] = [];
  used.forEach((p, i) => {
    cx += widthOf(p, counts[p] ?? 0, fixed);
    if (i < used.length - 1) lines.push(cx + GAP / 2);
    cx += GAP;
  });
  return (
    <g>
      {lines.map((lx) => (
        <line key={lx} x1={lx} x2={lx} y1={y} y2={y + h} stroke={OUTLINE} strokeWidth={2} strokeDasharray="6 6" />
      ))}
    </g>
  );
}
