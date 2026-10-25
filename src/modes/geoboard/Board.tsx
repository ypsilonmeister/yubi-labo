// ジオボードの盤（J ジオボード・K かたちづくり で共通）。点・ゴム・直角の印を描き、点のタップを返すだけ。
// 判定は shapes.ts の純粋関数が行う。

import { SLOT_STROKE, OUTLINE, TILE } from '../../core/colors';
import type { AccessibilitySettings } from '../../core/types';
import { successClass } from '../kit/ui';
import { BOARD, boardPoints, canExtend, corners, isRightAngle, rightCorners, type Pt } from '../../core/math/shapes';

export const BOARD_W = 560;
const M = 60;
const SP = (BOARD_W - 2 * M) / (BOARD - 1);
export const px = (p: Pt) => ({ x: M + p.x * SP, y: M + p.y * SP });
const PTS = boardPoints();
const same = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;

function unit(a: Pt, v: Pt) {
  const dx = a.x - v.x;
  const dy = a.y - v.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

/** かどが まっすぐなら、小さな四角の印 */
function RightMark({ a, v, b }: { a: Pt; v: Pt; b: Pt }) {
  const A = px(a);
  const V = px(v);
  const B = px(b);
  const u = unit(A, V);
  const w = unit(B, V);
  const s = 20;
  return <path d={`M${V.x + u.x * s} ${V.y + u.y * s} l${w.x * s} ${w.y * s} l${-u.x * s} ${-u.y * s}`} fill="none" stroke={OUTLINE} strokeWidth={4} strokeLinejoin="round" />;
}

export interface BoardProps {
  path: Pt[];
  closed: boolean;
  allowDiagonal: boolean;
  glow: boolean;
  s: AccessibilitySettings;
  onPoint: (p: Pt) => void;
  /** さいしょから かかっている点の数（K の「さいしょの 1辺」）。ほかの線とは色を変えて描く */
  lockedCount?: number;
  /** ヒント L2: うすい輪を出す点をこれだけに絞る（null なら、引ける点すべて） */
  rings?: Pt[] | null;
  /** 実演（L3）: 見本の形をうすく重ねる */
  ghost?: Pt[] | null;
  /** 実演（L3）: 見本の点を太く示す */
  emphasis?: Pt[] | null;
}

export function Board({ path, closed, allowDiagonal, glow, s, onPoint, lockedCount = 0, rings = null, ghost = null, emphasis = null }: BoardProps) {
  const n = path.length;
  const last = path[n - 1];
  const marks: { a: Pt; v: Pt; b: Pt }[] = [];
  if (closed) {
    const c = corners(path);
    const rc = rightCorners(path);
    c.forEach((v, i) => {
      if (rc[i]) marks.push({ a: c[(i + c.length - 1) % c.length], v, b: c[(i + 1) % c.length] });
    });
  } else {
    for (let i = 1; i < n - 1; i++) if (isRightAngle(path[i - 1], path[i], path[i + 1])) marks.push({ a: path[i - 1], v: path[i], b: path[i + 1] });
  }
  const outline = path.map((p) => `${px(p).x} ${px(p).y}`);
  const given = lockedCount >= 2 ? path.slice(0, lockedCount).map((p) => `${px(p).x} ${px(p).y}`) : null;
  return (
    <svg viewBox={`0 0 ${BOARD_W} ${BOARD_W}`} className="field-svg geo-field" style={{ maxWidth: 520, margin: '0 auto', display: 'block' }}>
      <rect x={14} y={14} width={BOARD_W - 28} height={BOARD_W - 28} rx={26} fill="#f6f1e6" stroke={SLOT_STROKE} strokeWidth={3} />
      {ghost && ghost.length >= 3 && <path d={`M${ghost.map((p) => `${px(p).x} ${px(p).y}`).join(' L')} Z`} fill={TILE.fill} fillOpacity={0.35} stroke={TILE.glow} strokeWidth={6} strokeDasharray="14 10" strokeLinejoin="round" />}
      {closed && <path d={`M${outline.join(' L')} Z`} fill={TILE.fill} fillOpacity={0.55} className={successClass(s, glow)} />}
      {n >= 2 && <path d={`M${outline.join(' L')}${closed ? ' Z' : ''}`} fill="none" stroke={TILE.glow} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />}
      {given && <path d={`M${given.join(' L')}`} fill="none" stroke={OUTLINE} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />}
      {marks.map((m, i) => (
        <RightMark key={i} {...m} />
      ))}
      {PTS.map((p) => {
        const c = px(p);
        const idx = path.findIndex((q) => same(q, p));
        const used = idx >= 0;
        const locked = used && idx < lockedCount;
        const ringed = rings ? rings.some((q) => same(q, p)) : true;
        const reach = !closed && n > 0 && ringed && canExtend(path, p, allowDiagonal);
        const isStart = n >= 1 && same(path[0], p);
        const isLast = !closed && n >= 1 && same(last, p);
        const hot = emphasis?.some((q) => same(q, p));
        return (
          <g key={`${p.x},${p.y}`} onClick={() => onPoint(p)} style={{ cursor: closed ? 'default' : 'pointer' }}>
            {/* 指で押しやすい大きさ（見えない） */}
            <circle cx={c.x} cy={c.y} r={SP * 0.46} fill="transparent" />
            {reach && <circle cx={c.x} cy={c.y} r={17} fill="none" stroke={isStart && n >= 3 ? TILE.glow : SLOT_STROKE} strokeWidth={isStart && n >= 3 ? 4 : 2} opacity={0.75} />}
            {hot && <circle cx={c.x} cy={c.y} r={22} fill="none" stroke={TILE.glow} strokeWidth={5} />}
            <circle cx={c.x} cy={c.y} r={used ? 11 : 8} fill={used ? (locked ? '#8c7c64' : isStart ? '#fffaf0' : TILE.glow) : '#8c7c64'} stroke={used ? OUTLINE : 'none'} strokeWidth={3} />
            {isLast && <circle cx={c.x} cy={c.y} r={19} fill="none" stroke={OUTLINE} strokeWidth={2.5} />}
          </g>
        );
      })}
    </svg>
  );
}
