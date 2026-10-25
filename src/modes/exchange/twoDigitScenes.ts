// v2.11 Mode D の2けた（10円・1円）の場面を作る純粋関数。React に依存しない。5トークンは使わない（10円と1円だけ）。
// たし算 a + b: 1のへやの10の席に1円がそろうと、りょうがえマシンで10円1枚になって10のへやへ（今の D と同じ）。
// ひき算 m − s（加数法・お釣り）: ねだんの十の位は10円で はらい、一の位のぶんは10円をもう1枚出して、お釣り（10 − sの一の位）を もらう。
//   のこる お金 ＝ はらわなかった10円 ＋ お釣り ＋ もったままの1円。今の D の「10円で はらって お釣り」をそのまま2けたに広げた形。
// 決定点は C と同じく D1（1のへやに入れる枚数／お釣りの枚数）と D3（ぜんぶで いくら。選んでから仕組みを見る）。

import { CARD, CHANGE, COIN_R, INCOMING, ONES_TRAY, PAID, SLOT, TEN_TRAY, cardSeat, onePos, purseIn, spillPos, type Coin, type DWorld } from './scenes';
import type { CoinValue } from '../../core/math/coins';

export type XTarget = 'ones' | 'card' | 'box';

export type XStep =
  | { kind: 'scene'; world: DWorld; ms: number; label: string }
  | { kind: 'decide'; id: 'D1' | 'D3'; answer: number; target: XTarget; max: number; mismatch: ((k: number) => DWorld) | null };

export interface XScript {
  start: DWorld;
  steps: XStep[];
  result: number;
}

const coin = (id: string, value: CoinValue, p: { x: number; y: number }, r: number, opacity = 1): Coin => ({ id, value, ...p, r, opacity });
const pair = (j: number, x0: number, y0: number, dx: number, dy: number) => ({ x: x0 + Math.floor(j / 2) * dx, y: y0 + (j % 2) * dy });
const move = (w: DWorld, f: (c: Coin) => Partial<Coin> | null): DWorld => ({ coins: w.coins.map((c) => ({ ...c, ...(f(c) ?? {}) })) });
const idx = (id: string) => Number(id.slice(id.lastIndexOf('-') + 1));

// ---------- たし算の配置 ----------
export const TEN_R2 = 22;
/** 10のへやの10円（3枚ずつ、3段。9枚まで） */
export const tenPos2 = (i: number) => ({ x: TEN_TRAY.x + 42 + (i % 3) * 63, y: TEN_TRAY.y + 62 + Math.floor(i / 3) * 56 });
/** もらう1円（右側） */
const inOne2 = (j: number) => pair(j, INCOMING.x + 260, INCOMING.y + 48, 58, 70);
/** もらう10円（左側） */
const inTen2 = (j: number) => pair(j, INCOMING.x + 50, INCOMING.y + 48, 52, 70);
const slotPos2 = (i: number) => ({ x: SLOT.x + SLOT.w / 2 + ((i % 5) - 2) * 16, y: SLOT.y + SLOT.h / 2 + (Math.floor(i / 5) - 0.5) * 30 });
const slotCenter = { x: SLOT.x + SLOT.w / 2, y: SLOT.y + SLOT.h / 2 };

/** 10のへや と 1のへや（トレイ）の金額（判定・テスト用） */
export function trayValue(w: DWorld): number {
  const p = purseIn(w, { x: TEN_TRAY.x, y: TEN_TRAY.y, w: ONES_TRAY.x + ONES_TRAY.w - TEN_TRAY.x, h: TEN_TRAY.h });
  return p[10] * 10 + p[1];
}

export function carry2Exchange(a: number, b: number): XScript {
  const at = Math.floor(a / 10);
  const ao = a % 10;
  const bt = Math.floor(b / 10);
  const bo = b % 10;
  const toFill = 10 - ao;
  const s0: DWorld = {
    coins: [
      ...Array.from({ length: at }, (_, i) => coin(`at-${i}`, 10, tenPos2(i), TEN_R2)),
      ...Array.from({ length: ao }, (_, i) => coin(`ao-${i}`, 1, onePos(i), COIN_R)),
      ...Array.from({ length: bt }, (_, j) => coin(`bt-${j}`, 10, inTen2(j), TEN_R2)),
      ...Array.from({ length: bo }, (_, j) => coin(`bo-${j}`, 1, inOne2(j), 26)),
      coin('x-0', 10, slotCenter, TEN_R2, 0),
    ],
  };
  const fill = (k: number) =>
    move(s0, (c) => {
      if (!c.id.startsWith('bo-')) return null;
      const j = idx(c.id);
      if (j >= k) return null;
      const seat = ao + j;
      return seat < 10 ? { ...onePos(seat), r: COIN_R } : { ...spillPos(seat - 10), r: 20 };
    });
  const s1 = fill(toFill);
  const inTen = (c: Coin) => c.id.startsWith('ao-') || (c.id.startsWith('bo-') && idx(c.id) < toFill);
  // 10枚が りょうがえマシンへ
  const order = s1.coins.filter(inTen).map((c) => c.id);
  const s2 = move(s1, (c) => (inTen(c) ? { ...slotPos2(order.indexOf(c.id)), r: 20 } : null));
  // マシンの中で10円1枚に
  const s3 = move(s2, (c) => (inTen(c) ? { ...slotCenter, r: 6, opacity: 0 } : c.id === 'x-0' ? { opacity: 1 } : null));
  // 10円は10のへやへ、のこりの1円は1のへやの席へ
  const s4 = move(s3, (c) => {
    if (c.id === 'x-0') return { ...tenPos2(at), r: TEN_R2 };
    if (c.id.startsWith('bo-') && idx(c.id) >= toFill) return { ...onePos(idx(c.id) - toFill), r: COIN_R };
    return null;
  });
  // もらった10円も10のへやへ
  const s5 = move(s4, (c) => (c.id.startsWith('bt-') ? { ...tenPos2(at + 1 + idx(c.id)) } : null));
  const steps: XStep[] = [
    { kind: 'decide', id: 'D1', answer: toFill, target: 'ones', max: bo, mismatch: fill },
    { kind: 'scene', world: s1, ms: 800, label: 'ぴったり 10まい' },
    { kind: 'decide', id: 'D3', answer: a + b, target: 'box', max: 99, mismatch: null },
    { kind: 'scene', world: s2, ms: 700, label: 'りょうがえ' },
    { kind: 'scene', world: s3, ms: 700, label: '10円に なる' },
    { kind: 'scene', world: s4, ms: 900, label: '10の へやへ' },
  ];
  if (bt > 0) steps.push({ kind: 'scene', world: s5, ms: 900, label: '10円も あわせる' });
  return { start: s0, steps, result: a + b };
}

// ---------- ひき算（お釣り）の配置 ----------
export const PAID_TEN_R = 19;
/** もっている お金の10円（3枚ずつ、3段） */
export const paidTen2 = (i: number) => ({ x: PAID.x + 36 + (i % 3) * 46, y: PAID.y + 50 + Math.floor(i / 3) * 42 });
/** もっている お金の1円 */
const paidOne2 = (i: number) => pair(i, PAID.x + 200, PAID.y + 70, 60, 70);
/** ねだんの十の位として はらった10円（カードの上のふち） */
const cardTen = (i: number) => ({ x: CARD.x + 210 + i * 30, y: CARD.y + 22 });
/** 一の位のぶんとして はらった10円（カードの右上。今の D と同じ） */
const cardCorner = { x: CARD.x + CARD.w - 10, y: CARD.y + 6 };
const cardOverflow = (j: number) => ({ x: CARD.x + CARD.w + 2 + (j % 2) * 2, y: CARD.y + 30 + j * 34 });
/** のこる お金の10円（左側） */
export const changeTen = (i: number) => ({ x: CHANGE.x + 30 + (i % 3) * 44, y: CHANGE.y + 56 + Math.floor(i / 3) * 44 });
/** のこる お金の1円（お釣りの群と、もったままの1円の群を1列あけて並べる） */
const changeOne = (i: number, colShift = 0) => pair(i + colShift * 2, CHANGE.x + 210, CHANGE.y + 64, 52, 74);

/** のこる お金（判定・テスト用） */
export function changeValue(w: DWorld): number {
  const p = purseIn(w, CHANGE);
  return p[10] * 10 + p[1];
}

export function borrow2Exchange(m: number, s: number): XScript {
  const mt = Math.floor(m / 10);
  const u = m % 10;
  const st = Math.floor(s / 10);
  const so = s % 10;
  const toTen = 10 - so;
  const keep = mt - st - 1; // はらわない10円
  const s0: DWorld = {
    coins: [...Array.from({ length: mt }, (_, i) => coin(`mt-${i}`, 10, paidTen2(i), PAID_TEN_R)), ...Array.from({ length: u }, (_, i) => coin(`u-${i}`, 1, paidOne2(i), 24))],
  };
  // はらう: うしろの st 枚は ねだんの十の位へ、さいごの1枚は一の位のぶんとしてカードの右上へ
  const s1 = move(s0, (c) => {
    if (!c.id.startsWith('mt-')) return null;
    const k = idx(c.id) - keep;
    if (k < 0) return null;
    return k < st ? { ...cardTen(k), r: 13 } : { ...cardCorner, r: COIN_R };
  });
  const fillCard = (k: number): DWorld => ({
    coins: [...s1.coins.map((c) => ({ ...c })), ...Array.from({ length: k }, (_, j) => coin(`c-${j}`, 1, so + j < 10 ? cardSeat(so + j) : cardOverflow(so + j - 10), so + j < 10 ? 26 : 16))],
  });
  const s2 = fillCard(toTen);
  const s3 = move(s2, (c) => (c.id.startsWith('c-') ? { ...changeOne(idx(c.id)), r: 24 } : null));
  const shift = Math.ceil(toTen / 2) + 1;
  const s4 = move(s3, (c) => {
    if (c.id.startsWith('u-')) return { ...changeOne(idx(c.id), shift), r: 24 };
    if (c.id.startsWith('mt-') && idx(c.id) < keep) return { ...changeTen(idx(c.id)) };
    return null;
  });
  return {
    start: s0,
    result: m - s,
    steps: [
      { kind: 'scene', world: s1, ms: 900, label: '10円で はらう' },
      { kind: 'decide', id: 'D1', answer: toTen, target: 'card', max: 9, mismatch: fillCard },
      { kind: 'scene', world: s2, ms: 700, label: 'おつり' },
      { kind: 'decide', id: 'D3', answer: m - s, target: 'box', max: 99, mismatch: null },
      { kind: 'scene', world: s3, ms: 900, label: 'おつりを もらう' },
      { kind: 'scene', world: s4, ms: 900, label: 'のこる お金' },
    ],
  };
}

/** 場面の列（台本の scene だけ） */
export function xScenes(sc: XScript): DWorld[] {
  return [sc.start, ...sc.steps.filter((x): x is Extract<XStep, { kind: 'scene' }> => x.kind === 'scene').map((x) => x.world)];
}
