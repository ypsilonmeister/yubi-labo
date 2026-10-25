// Mode D（りょうがえや）の描画部品。ExchangeMode と、v2.11 の2けた（TwoDigitExchange）で共通に使う。

import type { ReactNode } from 'react';
import { numberColor, OUTLINE, PLACE_BG, PLACE_STROKE, SLOT_STROKE, SLOT_STROKE_STRONG, inkOn } from '../../core/colors';
import type { CoinValue, Purse } from '../../core/math/coins';
import type { AccessibilitySettings } from '../../core/types';
import type { ChoiceItem } from '../kit/ChoiceTray';
import { successClass } from '../kit/ui';
import { H, ONES_TRAY, SLOT, TEN_TRAY, W, onePos, type Coin, type DWorld } from './scenes';

type S = Readonly<AccessibilitySettings>;
export type Rect = { x: number; y: number; w: number; h: number };

// ---------- 描画 ----------

export function coinColor(v: CoinValue, s: S) {
  return v === 100 ? '#e5c158' : numberColor(v, s.colorScheme);
}

function starPath(x: number, y: number, r: number) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.55 : r * 1.05;
    d += `${i ? 'L' : 'M'}${x + rr * Math.cos(a)} ${y + rr * Math.sin(a)}`;
  }
  return d + 'Z';
}

function hexPath(x: number, y: number, r: number) {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    d += `${i ? 'L' : 'M'}${x + r * Math.cos(a)} ${y + r * Math.sin(a)}`;
  }
  return d + 'Z';
}

/** 面積は同じ。形（円・星・六角・四角）と数字で価値を区別し、色だけに頼らない */
export function CoinShape({ c, s }: { c: Pick<Coin, 'value' | 'x' | 'y' | 'r' | 'opacity'>; s: S }) {
  if (c.opacity <= 0.01) return null;
  const fill = coinColor(c.value, s);
  const { x, y, r } = c;
  const shape =
    c.value === 1 ? (
      <circle cx={x} cy={y} r={r} />
    ) : c.value === 5 ? (
      <path d={starPath(x, y, r)} />
    ) : c.value === 10 ? (
      <path d={hexPath(x, y, r * 1.05)} />
    ) : (
      <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={r * 0.25} />
    );
  return (
    <g opacity={c.opacity} pointerEvents="none">
      <g fill={fill} stroke={OUTLINE} strokeWidth={r > 12 ? 3 : 1.5}>
        {shape}
      </g>
      {r > 9 && (
        <text x={x} y={y + r * 0.32} textAnchor="middle" fontSize={r * (c.value >= 10 ? 0.75 : 0.9)} fontWeight={700} fill={inkOn(fill)}>
          {c.value}
        </text>
      )}
    </g>
  );
}

export const DENOMS: CoinValue[] = [100, 10, 5, 1];

/** 金種ごとの列の幅（枚数）。手札どうしで列がそろうよう、選択肢の中の最大枚数で決める */
export type Columns = Partial<Record<CoinValue, number>>;

export function columnsOf(purses: Purse[]): Columns {
  const c: Columns = {};
  for (const v of DENOMS) {
    const max = Math.max(0, ...purses.map((p) => p[v]));
    if (max > 0) c[v] = max;
  }
  return c;
}

/**
 * 財布を金種ごとの列に分けて並べる（v2.2）。大きい金種が左。各列は 2行（ペアの並び）。
 * 列の幅は cols で固定し、金種のあいだに すきま と うすい仕切り線 をおく（10 と 1 が混ざって見えないように）。
 */
export function PurseColumns({ p, cols, s, x0, y0, d, r }: { p: Purse; cols: Columns; s: S; x0: number; y0: number; d: number; r: number }) {
  const gap = d * 0.7;
  let x = x0;
  const out: ReactNode[] = [];
  DENOMS.forEach((v) => {
    const max = cols[v];
    if (!max) return;
    const w = Math.ceil(max / 2) * d;
    if (x > x0) out.push(<line key={`sep${v}`} x1={x - gap / 2} x2={x - gap / 2} y1={y0 - r} y2={y0 + d + r} stroke={SLOT_STROKE} strokeWidth={1.5} strokeDasharray="4 4" />);
    for (let i = 0; i < p[v]; i++) out.push(<CoinShape key={`${v}-${i}`} c={{ value: v, x: x + d / 2 + Math.floor(i / 2) * d, y: y0 + (i % 2) * d, r, opacity: 1 }} s={s} />);
    x += w + gap;
  });
  return <g>{out}</g>;
}

export function columnsWidth(cols: Columns, d: number): number {
  const groups = DENOMS.filter((v) => cols[v]);
  return groups.reduce((w, v) => w + Math.ceil(cols[v]! / 2) * d, 0) + Math.max(0, groups.length - 1) * d * 0.7;
}

/** 財布を枠の中に、金種ごとの列で並べる */
export function PurseInRect({ p, rect, s, opacity = 1 }: { p: Purse; rect: Rect; s: S; opacity?: number }) {
  const cols = columnsOf([p]);
  const d0 = 44;
  const w0 = columnsWidth(cols, d0);
  const d = Math.min(d0, (d0 * (rect.w - 24)) / Math.max(1, w0));
  const r = Math.min(20, d / 2 - 1);
  const x0 = rect.x + (rect.w - columnsWidth(cols, d)) / 2;
  return (
    <g opacity={opacity}>
      <PurseColumns p={p} cols={cols} s={s} x0={x0} y0={rect.y + rect.h / 2 - d / 2} d={d} r={r} />
    </g>
  );
}

export function PurseIcon({ p, cols, s }: { p: Purse; cols: Columns; s: S }) {
  const d = 26;
  const w = columnsWidth(cols, d);
  return (
    <svg width={w + 6} height={d * 2 + 6} viewBox={`-3 -3 ${w + 6} ${d * 2 + 6}`} aria-hidden>
      <PurseColumns p={p} cols={cols} s={s} x0={0} y0={d / 2} d={d} r={11.5} />
    </svg>
  );
}

export function purseChoices(values: number[], toPurse: (v: number) => Purse, s: S): ChoiceItem[] {
  const cols = columnsOf(values.map(toPurse));
  return values.map((v, i) => ({ key: `c${i}-${v}`, value: v, label: 'コイン', node: <PurseIcon p={toPurse(v)} cols={cols} s={s} /> }));
}

/** 交換のルールを絵で示す（§9.4） */
export function RuleCard({ s }: { s: S }) {
  const row = (from: CoinValue, n: number, to: CoinValue) => (
    <div className="rule-row" key={`${from}-${to}`}>
      <svg width={Math.ceil(n / 2) * 24 + 6} height={52} viewBox={`-3 -3 ${Math.ceil(n / 2) * 24 + 6} 52`} aria-hidden>
        {Array.from({ length: n }, (_, i) => (
          <CoinShape key={i} c={{ value: from, x: 11 + Math.floor(i / 2) * 24, y: 11 + (i % 2) * 24, r: 10.5, opacity: 1 }} s={s} />
        ))}
      </svg>
      <span aria-hidden>→</span>
      <svg width={30} height={30} viewBox="-15 -15 30 30" aria-hidden>
        <CoinShape c={{ value: to, x: 0, y: 0, r: 13, opacity: 1 }} s={s} />
      </svg>
    </div>
  );
  return <div className="rule-card" aria-label="りょうがえの きまり">{s.fiveToken ? [row(1, 5, 5), row(5, 2, 10)] : [row(1, 10, 10)]}</div>;
}

export function DField({ world, s, children, glow, thumb }: { world: DWorld; s: S; children?: ReactNode; glow?: boolean; thumb?: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={thumb ? undefined : 'field-svg'} width={thumb ? 150 : undefined} height={thumb ? (150 * H) / W : undefined} aria-hidden={thumb}>
      {children}
      <g className={successClass(s, !!glow)}>
        {world.coins.map((c) => (
          <CoinShape key={c.id} c={c} s={s} />
        ))}
      </g>
    </svg>
  );
}

// ---------- 位ごとの「へや」（v2.2） ----------

export type Zone = 'tens' | 'ones' | 'machine' | 'plain';

export function MiniCoin({ v, x, y, r, s }: { v: CoinValue; x: number; y: number; r: number; s: S }) {
  return <CoinShape c={{ value: v, x, y, r, opacity: 1 }} s={s} />;
}

/** 色つきのへや。見出しにコインの絵を添えて、どの位のへやかを形でも示す */
export function ZoneBox(props: { rect: Rect; zone: Zone; title: string; icon?: CoinValue; s: S; strong?: boolean; dashed?: boolean; drop?: string; onTap?: () => void; children?: ReactNode }) {
  const { rect, zone } = props;
  const fill = zone === 'plain' ? '#fbf6ea' : PLACE_BG[zone];
  const stroke = props.strong ? SLOT_STROKE_STRONG : zone === 'plain' ? SLOT_STROKE : PLACE_STROKE[zone];
  return (
    <g>
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={18} fill={fill} stroke={stroke} strokeWidth={props.strong ? 6 : 3.5} strokeDasharray={props.dashed ? '12 8' : undefined} />
      {props.icon && <MiniCoin v={props.icon} x={rect.x + 18} y={rect.y + 17} r={10} s={props.s} />}
      <text x={rect.x + (props.icon ? 34 : 12)} y={rect.y + 23} fontSize={17} fontWeight={800} fill={zone === 'plain' ? '#7a6e5c' : PLACE_STROKE[zone]}>
        {props.title}
      </text>
      {props.children}
      {props.drop && <rect data-drop={props.drop} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" onClick={props.onTap} style={{ cursor: 'pointer' }} />}
    </g>
  );
}

/** 1のへやの10の席（5トークンOFFのとき）。10枚そろうと両替されることを席の数で見せる */
export function OnesSeats({ strong }: { strong?: boolean }) {
  return (
    <g pointerEvents="none">
      {Array.from({ length: 10 }, (_, i) => {
        const p = onePos(i);
        return <circle key={i} cx={p.x} cy={p.y} r={33} fill="#fffaf0" stroke={strong ? SLOT_STROKE_STRONG : PLACE_STROKE.ones} strokeWidth={strong ? 4 : 2.5} strokeDasharray="7 5" />;
      })}
    </g>
  );
}

/** りょうがえマシンの中に、きまりを絵で描く（1が10枚 → 10が1枚） */
export function MachineRule({ s }: { s: S }) {
  const x0 = SLOT.x + 22;
  const y0 = SLOT.y + 70;
  if (s.fiveToken)
    return (
      <g pointerEvents="none">
        {Array.from({ length: 5 }, (_, i) => (
          <MiniCoin key={i} v={1} x={x0 + i * 17} y={y0} r={8} s={s} />
        ))}
        <text x={x0 + 96} y={y0 + 6} fontSize={18} fill={PLACE_STROKE.machine}>
          →
        </text>
        <MiniCoin v={5} x={x0 + 130} y={y0} r={13} s={s} />
        <MiniCoin v={5} x={x0 + 10} y={y0 + 56} r={11} s={s} />
        <MiniCoin v={5} x={x0 + 36} y={y0 + 56} r={11} s={s} />
        <text x={x0 + 60} y={y0 + 62} fontSize={18} fill={PLACE_STROKE.machine}>
          →
        </text>
        <MiniCoin v={10} x={x0 + 100} y={y0 + 56} r={15} s={s} />
      </g>
    );
  return (
    <g pointerEvents="none">
      {Array.from({ length: 10 }, (_, i) => (
        <MiniCoin key={i} v={1} x={x0 + 8 + Math.floor(i / 2) * 19} y={y0 + (i % 2) * 19} r={8.5} s={s} />
      ))}
      <path d={`M${SLOT.x + SLOT.w / 2} ${y0 + 36} v26`} stroke={PLACE_STROKE.machine} strokeWidth={4} markerEnd="url(#d-arrow)" />
      <MiniCoin v={10} x={SLOT.x + SLOT.w / 2} y={y0 + 92} r={20} s={s} />
    </g>
  );
}

export function ArrowDefs() {
  return (
    <defs>
      <marker id="d-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 Z" fill={PLACE_STROKE.machine} />
      </marker>
    </defs>
  );
}

/** 流れの矢印: 1のへや → マシン → 10のへや */
export function FlowArrows() {
  const midY = TEN_TRAY.y + TEN_TRAY.h / 2;
  return (
    <g pointerEvents="none" fill="none" stroke={PLACE_STROKE.machine} strokeWidth={4} strokeDasharray="10 7" opacity={0.85}>
      <path d={`M${ONES_TRAY.x + ONES_TRAY.w - 4} ${midY} H${SLOT.x + 4}`} markerEnd="url(#d-arrow)" />
      <path d={`M${SLOT.x + SLOT.w / 2} ${SLOT.y + 2} C${SLOT.x + SLOT.w / 2} 6, ${TEN_TRAY.x + TEN_TRAY.w / 2} 6, ${TEN_TRAY.x + TEN_TRAY.w / 2} ${TEN_TRAY.y + 2}`} markerEnd="url(#d-arrow)" />
    </g>
  );
}


/** ちぎる手札のコイン1枚 */
export function CoinToken({ v, s }: { v: CoinValue; s: S }) {
  return (
    <svg width={42} height={42} viewBox="-21 -21 42 42" aria-hidden>
      <CoinShape c={{ value: v, x: 0, y: 0, r: 18, opacity: 1 }} s={s} />
    </svg>
  );
}

