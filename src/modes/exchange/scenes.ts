// Mode D の場面（コインの位置）を作る純粋関数。React に依存しない。
// 繰り上がり: トレイの 1 が 10 枚になったら両替スロットで 10 に（5トークンONでは 1×5→5、5×2→10）。
// 繰り下がり: 加数法（お釣り）。もっている お金のうち 10 だけで はらう。ねだん b のカードの空席（10−b）を おつりで埋め、
// もったままの 1（u 枚）と合わせて「のこる お金」にする。

import { countUpPlan, normalize, purseOf, type CoinValue, type Purse } from '../../core/math/coins';
import { carryPlan } from '../../core/math/tenframe';

export const W = 1000;
export const H = 440;
export const COIN_R = 30;

// 繰り上がりの配置
export const TEN_TRAY = { x: 20, y: 40, w: 210, h: 200 };
export const ONES_TRAY = { x: 250, y: 40, w: 520, h: 200 };
export const SLOT = { x: 790, y: 40, w: 190, h: 200 };
export const INCOMING = { x: 250, y: 262, w: 520, h: 160 };
export const ANSWER_BOX = { x: 790, y: 262, w: 190, h: 160 };

// 繰り下がりの配置
export const CARD = { x: 40, y: 44, w: 420, h: 168 };
export const PAID = { x: 490, y: 44, w: 490, h: 168 };
export const CHANGE = { x: 40, y: 250, w: 660, h: 172 };
export const CHANGE_BOX = { x: 720, y: 250, w: 260, h: 172 };

export interface Coin {
  id: string;
  value: CoinValue;
  x: number;
  y: number;
  r: number;
  opacity: number;
}

export interface DWorld {
  coins: Coin[];
}

const pair = (j: number, x0: number, y0: number, dx: number, dy: number) => ({ x: x0 + Math.floor(j / 2) * dx, y: y0 + (j % 2) * dy });

export const tenPos = (i: number) => ({ x: TEN_TRAY.x + TEN_TRAY.w / 2, y: TEN_TRAY.y + 80 + i * 85 });
export const fivePos = (i: number) => ({ x: ONES_TRAY.x + 45, y: ONES_TRAY.y + 58 + i * 56 });
export const onePos = (i: number) => pair(i, ONES_TRAY.x + 130, ONES_TRAY.y + 55, 76, 90);
const slotPos = (i: number) => ({ x: SLOT.x + SLOT.w / 2 + ((i % 5) - 2) * 16, y: SLOT.y + SLOT.h / 2 + (Math.floor(i / 5) - 0.5) * 30 });
const slotCenter = () => ({ x: SLOT.x + SLOT.w / 2, y: SLOT.y + SLOT.h / 2 });
const inFive = (i: number) => ({ x: INCOMING.x + 45, y: INCOMING.y + 45 + i * 70 });
const inOne = (i: number) => pair(i, INCOMING.x + 130, INCOMING.y + 42, 76, 78);
export const answerPos = (i: number, n: number) => {
  // 答えの箱: 小さめのコインを並べる
  const per = Math.max(2, Math.ceil(n / 2));
  const dx = Math.min(36, (ANSWER_BOX.w - 40) / per);
  return { x: ANSWER_BOX.x + 30 + (i % per) * dx, y: ANSWER_BOX.y + 55 + Math.floor(i / per) * 60 };
};

export const cardSeat = (i: number) => pair(i, CARD.x + 52, CARD.y + 58, 76, 76);
const paidTen = () => ({ x: PAID.x + 60, y: PAID.y + 84 });
const paidOne = (i: number) => pair(i, PAID.x + 160, PAID.y + 46, 70, 76);
/** お釣りトレイ: 1つ目の群（10 にするぶん）と 2つ目の群（もったままの 1）を1列あけて並べる */
export const changePos = (i: number, colShift = 0) => pair(i + colShift * 2, CHANGE.x + 50, CHANGE.y + 64, 64, 74);
const cardOverflow = (j: number) => ({ x: CARD.x + CARD.w + 2 + (j % 2) * 2, y: CARD.y + 30 + j * 34 });

const coin = (id: string, value: CoinValue, p: { x: number; y: number }, opacity = 1, r = COIN_R): Coin => ({ id, value, ...p, r, opacity });

export function lerpWorld(a: DWorld, b: DWorld, t: number): DWorld {
  return {
    coins: b.coins.map((q) => {
      const p = a.coins.find((x) => x.id === q.id) ?? { ...q, opacity: 0 };
      return { ...q, x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, r: p.r + (q.r - p.r) * t, opacity: p.opacity + (q.opacity - p.opacity) * t };
    }),
  };
}

const visible = (w: DWorld) => w.coins.filter((c) => c.opacity > 0.5);
const inRect = (c: Coin, r: { x: number; y: number; w: number; h: number }) => c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h;

/** 指定した枠の中に見えているコインの財布 */
export function purseIn(w: DWorld, r: { x: number; y: number; w: number; h: number }): Purse {
  const p: Purse = { 1: 0, 5: 0, 10: 0, 100: 0 };
  for (const c of visible(w)) if (inRect(c, r)) p[c.value]++;
  return p;
}

// ---------- 繰り上がり ----------

/** トレイ（10・5・1 の並び）を持ち、場面を記録していく小さなシミュレーション */
class TraySim {
  tens: string[] = [];
  fives: string[] = [];
  ones: string[] = [];
  coins = new Map<string, Coin>();
  scenes: DWorld[] = [];
  private seq = 0;

  add(value: CoinValue, pos: { x: number; y: number }, prefix: string): string {
    const id = `${prefix}${this.seq++}`;
    this.coins.set(id, coin(id, value, pos));
    return id;
  }
  listOf(v: CoinValue) {
    return v === 10 ? this.tens : v === 5 ? this.fives : this.ones;
  }
  layout() {
    this.tens.forEach((id, i) => Object.assign(this.coins.get(id)!, tenPos(i), { r: COIN_R, opacity: 1 }));
    this.fives.forEach((id, i) => Object.assign(this.coins.get(id)!, fivePos(i), { r: COIN_R, opacity: 1 }));
    this.ones.forEach((id, i) => Object.assign(this.coins.get(id)!, onePos(i), { r: COIN_R, opacity: 1 }));
  }
  snap() {
    this.scenes.push({ coins: [...this.coins.values()].map((c) => ({ ...c })) });
  }
  /** count 枚の from を両替スロットへ → 1 枚の to になって、そのトレイへ */
  exchange(from: CoinValue, count: number, to: CoinValue) {
    const list = this.listOf(from);
    const moving = list.splice(list.length - count, count);
    moving.forEach((id, i) => Object.assign(this.coins.get(id)!, slotPos(i), { r: 20 }));
    this.snap();
    moving.forEach((id) => Object.assign(this.coins.get(id)!, slotCenter(), { r: 6, opacity: 0 }));
    const nid = this.add(to, slotCenter(), 'x');
    this.coins.get(nid)!.opacity = 1;
    this.snap();
    this.listOf(to).push(nid);
    this.layout();
    this.snap();
  }
}

export interface CarryScenes {
  scenes: DWorld[];
  /** 最終的なトレイ（10 のまとまりと残り） */
  final: Purse;
  rest: number;
}

/**
 * 繰り上がり a + b。トレイに先に入っているのは first（設定）。
 * 5トークンOFF: もらった 1 のうち (10 − first) 枚でトレイが 10 枚になった瞬間に両替し、残りを置く。
 * 5トークンON: もらったコインを置いてから、正規化の規則を1つずつ適用する。
 */
export function carryScenes(a: number, b: number, firstOperand: 'larger' | 'first', fiveToken: boolean): CarryScenes {
  const p = carryPlan(a, b, firstOperand);
  const sim = new TraySim();
  const pa = purseOf(p.first, fiveToken);
  const pb = purseOf(p.second, fiveToken);
  for (let i = 0; i < pa[5]; i++) sim.fives.push(sim.add(5, { x: 0, y: 0 }, 'a'));
  for (let i = 0; i < pa[1]; i++) sim.ones.push(sim.add(1, { x: 0, y: 0 }, 'a'));
  sim.layout();
  const inc: string[] = [];
  for (let i = 0; i < pb[5]; i++) inc.push(sim.add(5, inFive(i), 'b'));
  for (let i = 0; i < pb[1]; i++) inc.push(sim.add(1, inOne(i), 'b'));
  sim.snap();
  if (!fiveToken) {
    const fillIds = inc.slice(0, p.toFill);
    sim.ones.push(...fillIds);
    sim.layout();
    sim.snap(); // トレイがちょうど 10 枚
    sim.exchange(1, 10, 10);
    sim.ones.push(...inc.slice(p.toFill));
    sim.layout();
    sim.snap();
  } else {
    for (const id of inc) sim.listOf(sim.coins.get(id)!.value).push(id);
    sim.layout();
    sim.snap();
    const { steps } = normalize({ 1: sim.ones.length, 5: sim.fives.length, 10: sim.tens.length, 100: 0 }, true);
    for (const st of steps) sim.exchange(st.from, st.count, st.to);
  }
  const last = sim.scenes[sim.scenes.length - 1];
  return { scenes: sim.scenes, final: purseIn(last, { x: TEN_TRAY.x, y: TEN_TRAY.y, w: ONES_TRAY.x + ONES_TRAY.w - TEN_TRAY.x, h: TEN_TRAY.h }), rest: p.rest };
}

/** v2.2 ダイレクト操作: 1のへやに入りきらなかったコイン（へやの右のふちに はみ出す） */
export const spillPos = (j: number) => ({ x: ONES_TRAY.x + ONES_TRAY.w, y: ONES_TRAY.y + 34 + j * 44 });

export interface CarryDirectPlan {
  /** はじめ（もらうコインは「もらう」に並んでいる） */
  start: DWorld;
  /** もらうコインのうち、はじめの k 枚を 1のへやの空席へ（入りきらない分は はみ出す） */
  fill: (k: number) => DWorld;
  /** ぴったり10枚になったあとの場面（両替して10のへやへ → のこりを1のへやへ） */
  after: DWorld[];
  toFill: number;
  second: number;
  rest: number;
}

/**
 * v2.2 ダイレクト操作の繰り上がり（5トークンOFFのみ）。
 * 決定点は「もらうコインを何枚 1のへやへ入れるか」。ぴったり 10−first 枚なら両替が起きる。
 */
export function carryDirectPlan(a: number, b: number, firstOperand: 'larger' | 'first'): CarryDirectPlan {
  const p = carryPlan(a, b, firstOperand);
  const sc = carryScenes(a, b, firstOperand, false);
  const s0 = sc.scenes[0];
  const inc = s0.coins.filter((c) => c.id.startsWith('b')).map((c) => c.id);
  const fill = (k: number): DWorld => ({
    coins: s0.coins.map((c) => {
      const j = inc.indexOf(c.id);
      if (j < 0 || j >= k) return { ...c };
      const seat = p.first + j;
      return seat < 10 ? { ...c, ...onePos(seat) } : { ...c, ...spillPos(seat - 10), r: 20 };
    }),
  });
  return { start: s0, fill, after: sc.scenes.slice(2), toFill: p.toFill, second: p.second, rest: p.rest };
}

/** 1のへやの席に座っているコイン（判定・テスト用） */
export function onesSeated(w: DWorld): number {
  return visible(w).filter((c) => c.value === 1 && Array.from({ length: 10 }, (_, i) => onePos(i)).some((q) => Math.hypot(q.x - c.x, q.y - c.y) < 4)).length;
}

/** 1のへやから はみ出しているコイン（判定・テスト用） */
export function onesSpilled(w: DWorld): number {
  return visible(w).filter((c) => Array.from({ length: 10 }, (_, j) => spillPos(j)).some((q) => Math.hypot(q.x - c.x, q.y - c.y) < 4)).length;
}

/** 自由探索: トレイ（財布）にコインを1枚足して正規化する場面 */
export function exploreAddScenes(p: Purse, add: CoinValue, fiveToken: boolean): { scenes: DWorld[]; purse: Purse } {
  const sim = new TraySim();
  for (let i = 0; i < p[10]; i++) sim.tens.push(sim.add(10, { x: 0, y: 0 }, 't'));
  for (let i = 0; i < p[5]; i++) sim.fives.push(sim.add(5, { x: 0, y: 0 }, 'f'));
  for (let i = 0; i < p[1]; i++) sim.ones.push(sim.add(1, { x: 0, y: 0 }, 'o'));
  sim.layout();
  const id = sim.add(add, add === 5 ? inFive(0) : add === 10 ? { x: INCOMING.x + 300, y: INCOMING.y + 80 } : inOne(0), 'n');
  sim.snap();
  sim.listOf(add).push(id);
  sim.layout();
  sim.snap();
  const counts = { 1: sim.ones.length, 5: sim.fives.length, 10: sim.tens.length, 100: 0 };
  const { steps, purse } = normalize(counts, fiveToken);
  for (const st of steps) if (st.to !== 100) sim.exchange(st.from, st.count, st.to);
  return { scenes: sim.scenes, purse };
}

export function trayWorld(p: Purse): DWorld {
  const sim = new TraySim();
  for (let i = 0; i < p[10]; i++) sim.tens.push(sim.add(10, { x: 0, y: 0 }, 't'));
  for (let i = 0; i < p[5]; i++) sim.fives.push(sim.add(5, { x: 0, y: 0 }, 'f'));
  for (let i = 0; i < p[1]; i++) sim.ones.push(sim.add(1, { x: 0, y: 0 }, 'o'));
  sim.layout();
  return { coins: [...sim.coins.values()] };
}

// ---------- 繰り下がり（加数法・お釣り） ----------

export type BorrowStep =
  | { kind: 'scene'; world: DWorld; ms: number }
  | { kind: 'decide'; id: 'D1' | 'D2'; answer: number; target: 'card' | 'box'; mismatch: ((k: number) => DWorld) | null };

export interface BorrowScript {
  start: DWorld;
  steps: BorrowStep[];
  change: number;
  toTen: number;
  /** 最後のお釣りトレイの中身 */
  finalChange: Purse;
}

export function borrowScript(m: number, b: number, fiveToken: boolean): BorrowScript {
  const p = countUpPlan(m, b);
  const s0: DWorld = {
    coins: [coin('T', 10, paidTen()), ...Array.from({ length: p.paidOnes }, (_, i) => coin(`u${i}`, 1, paidOne(i)))],
  };
  // 10 で はらう: 10 のコインがねだんのカードの右上へ
  const s1: DWorld = { coins: s0.coins.map((c) => (c.id === 'T' ? { ...c, x: CARD.x + CARD.w - 10, y: CARD.y + 6 } : { ...c })) };
  const fillCard = (k: number): DWorld => ({
    coins: [
      ...s1.coins.map((c) => ({ ...c })),
      ...Array.from({ length: k }, (_, j) => coin(`c${j}`, 1, b + j < 10 ? cardSeat(b + j) : cardOverflow(b + j - 10), 1, j + b < 10 ? 26 : 16)),
    ],
  });
  const s2 = fillCard(p.toTen);
  // 10 にしたぶんがお釣りトレイへ
  const s3: DWorld = { coins: s2.coins.map((c) => (c.id.startsWith('c') ? { ...c, ...changePos(Number(c.id.slice(1))), r: COIN_R } : { ...c })) };
  // もったままの 1 も「のこる お金」へ（1列あけて別の群として）
  const shift = Math.ceil(p.toTen / 2) + 1;
  const s4: DWorld = { coins: s3.coins.map((c) => (c.id.startsWith('u') ? { ...c, ...changePos(Number(c.id.slice(1)), shift) } : { ...c })) };
  const steps: BorrowStep[] = [
    { kind: 'scene', world: s1, ms: 900 },
    { kind: 'decide', id: 'D1', answer: p.toTen, target: 'card', mismatch: (k) => fillCard(k) },
    { kind: 'scene', world: s2, ms: 700 },
    { kind: 'scene', world: s3, ms: 900 },
    { kind: 'scene', world: s4, ms: 900 },
  ];
  let last = s4;
  if (fiveToken && p.change >= 5) {
    // 5トークンON: お釣りの 1 が 5 枚そろったら 5 にまとめる（§9.4 の正規化）
    const ones = last.coins.filter((c) => c.id.startsWith('c') || c.id.startsWith('u'));
    const take = ones.slice(0, 5).map((c) => c.id);
    const gather: DWorld = { coins: last.coins.map((c) => (take.includes(c.id) ? { ...c, ...changePos(0), r: 12, opacity: 0 } : { ...c })) };
    const remain = ones.filter((c) => !take.includes(c.id));
    const merged: DWorld = {
      coins: [
        ...gather.coins.map((c) => {
          const i = remain.findIndex((r) => r.id === c.id);
          return i >= 0 ? { ...c, ...changePos(i, 1) } : c;
        }),
        coin('F', 5, changePos(0)),
      ],
    };
    steps.push({ kind: 'scene', world: merged, ms: 900 });
    last = merged;
  }
  steps.push({ kind: 'decide', id: 'D2', answer: p.change, target: 'box', mismatch: null });
  return { start: s0, steps, change: p.change, toTen: p.toTen, finalChange: purseIn(last, CHANGE) };
}

export function borrowScenes(sc: BorrowScript): { world: DWorld; ms: number }[] {
  return [{ world: sc.start, ms: 0 }, ...sc.steps.filter((s): s is Extract<BorrowStep, { kind: 'scene' }> => s.kind === 'scene')];
}

/** ねだんのカードに入っているコインの数（判定・テスト用） */
export function cardFill(w: DWorld): number {
  return visible(w).filter((c) => c.id.startsWith('c') && inRect(c, { x: CARD.x, y: CARD.y, w: CARD.w - 20, h: CARD.h })).length;
}
