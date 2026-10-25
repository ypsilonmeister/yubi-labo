// Mode C の場面（スライムの位置）を作る純粋関数。React に依存しない。
// §9.3 の一般規則（繰り上がり・減加法・減減法）をそのまま場面の列に落とす。
// countWorld() は「画面上でどこに何匹見えているか」を数えるので、テストで全組み合わせを検証できる。

import { borrowPlan, carryPlan, frameSlot, type FillOrder } from '../../core/math/tenframe';

export const W = 1000;
export const H = 460;

// 10の部屋（左）
export const TENS = { x: 20, y: 40, w: 230, h: 250 };
export const KING = { x: 135, y: 165, r: 62 };
const MINI = { x0: 51, y0: 140, cell: 42, r: 17 };
// 1の部屋（10フレーム）
export const FRAME = { x: 280, y: 40, cell: 120 };
const SLIME_R = 44;
// 下の段: 待っているスライム／バス
const WAIT = { x0: 320, y0: 352, dx: 56, dy: 52, r: 22 };
export const BUS = { x: 296, y: 318, h: 112 };
/** 出発したバスは左（10の部屋の下）へ寄る。参照を消さないよう画面内に残す */
export const BUS_DEPART = -270;
// 「？」の箱
export const BOX = { x: 700, y: 315, w: 280, h: 130 };
const BOX_SLOT = { x0: 728, y0: 352, dx: 50, dy: 52, r: 20 };

export interface Blob {
  id: string;
  x: number;
  y: number;
  r: number;
  /** 色を決める数（colorScheme で色にする） */
  tone: number;
  opacity: number;
  king?: boolean;
}

export interface World {
  blobs: Blob[];
  bus: { seats: number; dx: number } | null;
  mini: boolean; // 10を開いた小さいフレームを出すか
  /** v2.11: 開いた10の小さいフレームを 10の部屋の下側に出す（10のカードが何枚もあるとき） */
  miniLow?: boolean;
}

export const slotPos = (i: number, fill: FillOrder) => {
  const { col, row } = frameSlot(i, fill);
  return { x: FRAME.x + FRAME.cell / 2 + col * FRAME.cell, y: FRAME.y + FRAME.cell / 2 + row * FRAME.cell };
};
const miniPos = (i: number, fill: FillOrder) => {
  const { col, row } = frameSlot(i, fill);
  return { x: MINI.x0 + col * MINI.cell, y: MINI.y0 + row * MINI.cell };
};
/** 2列のペア配置（A のプレートと同じ並び） */
export const pairPos = (j: number, x0: number, y0: number, dx: number, dy: number) => ({ x: x0 + Math.floor(j / 2) * dx, y: y0 + (j % 2) * dy });
const waitPos = (j: number, colShift = 0) => pairPos(j + colShift * 2, WAIT.x0, WAIT.y0, WAIT.dx, WAIT.dy);
const seatPos = (j: number, dx = 0) => {
  const p = pairPos(j, BUS.x + 30, WAIT.y0, WAIT.dx, WAIT.dy);
  return { x: p.x + dx, y: p.y };
};
/** フレームからあふれた分（フレームの右の外） */
const overflowPos = (j: number) => ({ x: 920 + (j % 2) * 45, y: 70 + Math.floor(j / 2) * 55 });
export const boxPos = (j: number) => pairPos(j, BOX_SLOT.x0, BOX_SLOT.y0, BOX_SLOT.dx, BOX_SLOT.dy);
export const BOX_R = BOX_SLOT.r;

const blob = (id: string, p: { x: number; y: number }, r: number, tone: number, opacity = 1, king = false): Blob => ({ id, ...p, r, tone, opacity, king });
const kingBlob = (opacity: number) => blob('K', KING, KING.r, 10, opacity, true);

function cloneWorld(w: World, patch: Partial<World> = {}): World {
  return { blobs: w.blobs.map((b) => ({ ...b })), bus: w.bus ? { ...w.bus } : null, mini: w.mini, ...(w.miniLow ? { miniLow: true } : {}), ...patch };
}

function moveBlobs(w: World, f: (b: Blob) => Partial<Blob> | null): World {
  const n = cloneWorld(w);
  n.blobs = n.blobs.map((b) => {
    const p = f(b);
    return p ? { ...b, ...p } : b;
  });
  return n;
}

// ---------- 数える（テスト・判定用） ----------

export interface Counts {
  /** 10の部屋のまとまり（キング）の数 */
  kings: number;
  /** 10の部屋の小さいフレームにいる数（開いた10） */
  opened: number;
  /** 1の部屋（10フレーム）の中の数 */
  ones: number;
  /** フレームの外にあふれている数 */
  overflow: number;
  /** バスに乗っている数 */
  inBus: number;
  /** 下で待っている数 */
  waiting: number;
}

/** 見えている1つのむれ（ブロブ）がどこにいるか。見えていなければ null。10 のまとまりは 'kings' */
export function zoneOf(w: World, b: Blob): keyof Counts | null {
  if (b.opacity < 0.5) return null;
  if (b.king) return 'kings';
  const busX0 = BUS.x + (w.bus?.dx ?? 0);
  const busW = w.bus ? Math.ceil(w.bus.seats / 2) * WAIT.dx + 20 : 0;
  if (b.x >= TENS.x && b.x <= TENS.x + TENS.w && b.y >= TENS.y && b.y <= TENS.y + TENS.h) return 'opened';
  if (b.x >= FRAME.x && b.x <= FRAME.x + 5 * FRAME.cell && b.y >= FRAME.y && b.y <= FRAME.y + 2 * FRAME.cell) return 'ones';
  if (b.x > FRAME.x + 5 * FRAME.cell && b.y < FRAME.y + 2 * FRAME.cell + 20) return 'overflow';
  if (w.bus && b.y > BUS.y && b.x >= busX0 && b.x <= busX0 + busW) return 'inBus';
  return 'waiting';
}

export function countWorld(w: World): Counts {
  const c: Counts = { kings: 0, opened: 0, ones: 0, overflow: 0, inBus: 0, waiting: 0 };
  for (const b of w.blobs) {
    const z = zoneOf(w, b);
    if (z) c[z]++;
  }
  return c;
}

// ---------- 台本 ----------

/** total（v2.11）: ？の箱で「ぜんぶで いくつ」を選ぶ（2けた。選んでから仕組みを見る） */
export type Target = 'frame' | 'bus' | 'box' | 'king' | 'total';

export type Step =
  | { kind: 'scene'; world: World; ms: number; label: string }
  /** 本人がキングをタップして「ひらく」のを待つ（判定しない操作） */
  | { kind: 'tapKing' }
  /** 決定点。answer と違う値のときの場面は mismatch(k) で作る（null なら場面は変えず比べるだけ） */
  | { kind: 'decide'; id: 'D1' | 'D2' | 'D3'; answer: number; target: Target; min: number; max: number; mismatch: ((k: number) => World) | null };

export interface Script {
  start: World;
  steps: Step[];
  /** 予測段階で選ぶ値（§9.0: 空席に入る数／あふれて残る数） */
  predictAnswer: number;
  /** 最終的な数（テスト用） */
  result: number;
}

/** 繰り上がり a + b: 大きい方（設定）を先にフレームへ。b を「10−a」と「a+b−10」に分ける */
export function carryScript(a: number, b: number, firstOperand: 'larger' | 'first', fill: FillOrder): Script {
  const p = carryPlan(a, b, firstOperand);
  const s0: World = {
    blobs: [
      kingBlob(0),
      ...Array.from({ length: p.first }, (_, i) => blob(`f${i}`, slotPos(i, fill), SLIME_R, p.first)),
      ...Array.from({ length: p.second }, (_, j) => blob(`w${j}`, waitPos(j), WAIT.r, p.second)),
    ],
    bus: null,
    mini: false,
  };
  const split = (k: number) =>
    moveBlobs(s0, (bl) => {
      if (!bl.id.startsWith('w')) return null;
      const j = Number(bl.id.slice(1));
      return j < k ? waitPos(j) : waitPos(j - k, Math.ceil(k / 2) + 1);
    });
  const fillWith = (k: number) =>
    moveBlobs(split(k), (bl) => {
      if (!bl.id.startsWith('w')) return null;
      const j = Number(bl.id.slice(1));
      if (j >= k) return null;
      return j < p.toFill ? { ...slotPos(p.first + j, fill), r: SLIME_R } : { ...overflowPos(j - p.toFill), r: 20 };
    });
  const s1 = split(p.toFill);
  const s2 = fillWith(p.toFill);
  const s3 = moveBlobs(s2, (bl) => {
    if (bl.king) return { opacity: 1 };
    const inTen = bl.id.startsWith('f') || (bl.id.startsWith('w') && Number(bl.id.slice(1)) < p.toFill);
    return inTen ? { x: KING.x, y: KING.y, r: 6, opacity: 0 } : null;
  });
  const s4 = moveBlobs(s3, (bl) => {
    if (!bl.id.startsWith('w')) return null;
    const j = Number(bl.id.slice(1));
    return j >= p.toFill ? { ...slotPos(j - p.toFill, fill), r: SLIME_R } : null;
  });
  return {
    start: s0,
    predictAnswer: p.rest,
    result: p.result,
    steps: [
      { kind: 'decide', id: 'D1', answer: p.toFill, target: 'frame', min: 1, max: p.second, mismatch: (k) => fillWith(k) },
      { kind: 'scene', world: s1, ms: 800, label: 'わける' },
      { kind: 'scene', world: s2, ms: 900, label: 'あいている ところへ' },
      { kind: 'scene', world: s3, ms: 1000, label: '10の まとまり' },
      { kind: 'scene', world: s4, ms: 800, label: 'のこり' },
    ],
  };
}

/** 10の補数: a があるフレームの空席を埋める */
export function complementScript(a: number, fill: FillOrder): Script {
  const need = 10 - a;
  const s0: World = {
    blobs: [kingBlob(0), ...Array.from({ length: a }, (_, i) => blob(`f${i}`, slotPos(i, fill), SLIME_R, a))],
    bus: null,
    mini: false,
  };
  const appear = (k: number): World => {
    const n = cloneWorld(s0);
    n.blobs.push(...Array.from({ length: k }, (_, j) => blob(`g${j}`, waitPos(j), WAIT.r, k)));
    return n;
  };
  const fillWith = (k: number) =>
    moveBlobs(appear(k), (bl) => {
      if (!bl.id.startsWith('g')) return null;
      const j = Number(bl.id.slice(1));
      return j < need ? { ...slotPos(a + j, fill), r: SLIME_R } : { ...overflowPos(j - need), r: 20 };
    });
  const s2 = fillWith(need);
  const s3 = moveBlobs(s2, (bl) => (bl.king ? { opacity: 1 } : { x: KING.x, y: KING.y, r: 6, opacity: 0 }));
  return {
    start: s0,
    predictAnswer: need,
    result: 10,
    steps: [
      { kind: 'decide', id: 'D1', answer: need, target: 'frame', min: 1, max: 9, mismatch: (k) => fillWith(k) },
      { kind: 'scene', world: appear(need), ms: 500, label: 'くる' },
      { kind: 'scene', world: s2, ms: 900, label: 'あいている ところへ' },
      { kind: 'scene', world: s3, ms: 1000, label: '10の まとまり' },
    ],
  };
}

/** 繰り下がり m − b（u < b）。減加法／減減法（§9.3） */
export function borrowScript(m: number, b: number, strategy: 'subtract_from_ten' | 'subtract_subtract', fill: FillOrder): Script {
  const p = borrowPlan(m, b, strategy);
  const u = p.ones;
  const s0: World = {
    blobs: [
      kingBlob(1),
      ...Array.from({ length: 10 }, (_, i) => blob(`t${i}`, KING, 6, 10, 0)),
      ...Array.from({ length: u }, (_, i) => blob(`f${i}`, slotPos(i, fill), SLIME_R, u)),
    ],
    bus: { seats: b, dx: 0 },
    mini: false,
  };
  const open = (w: World) =>
    moveBlobs(cloneWorld(w, { mini: true }), (bl) => {
      if (bl.king) return { opacity: 0 };
      if (bl.id.startsWith('t')) return { ...miniPos(Number(bl.id.slice(1)), fill), r: MINI.r, opacity: 1 };
      return null;
    });
  /** 開いた10から k 匹をバスの seat0 番目以降へ（席が足りなければバスの横に立つ） */
  const boardFromTen = (w: World, k: number, seat0: number) =>
    moveBlobs(w, (bl) => {
      if (!bl.id.startsWith('t')) return null;
      const i = Number(bl.id.slice(1));
      if (i >= k) return null;
      const seat = seat0 + i;
      return seat < b ? { ...seatPos(seat), r: WAIT.r } : { ...seatPos(seat + 2), r: WAIT.r };
    });
  const depart = (w: World) => {
    const n = moveBlobs(w, (bl) => {
      const onBus = bl.y > BUS.y && bl.opacity > 0.5 && !bl.king && bl.x >= BUS.x && bl.x < BOX.x;
      return onBus ? { x: bl.x + BUS_DEPART, opacity: 0.55 } : null;
    });
    n.bus = { seats: b, dx: BUS_DEPART };
    return n;
  };

  if (strategy === 'subtract_from_ten') {
    const s1 = open(s0);
    const s2 = boardFromTen(s1, b, 0);
    const s3 = depart(s2);
    const s4 = moveBlobs(s3, (bl) => {
      if (!bl.id.startsWith('t')) return null;
      const i = Number(bl.id.slice(1));
      return i >= b ? { ...slotPos(u + (i - b), fill), r: SLIME_R } : null;
    });
    return {
      start: s0,
      predictAnswer: p.result,
      result: p.result,
      steps: [
        { kind: 'tapKing' },
        { kind: 'scene', world: s1, ms: 900, label: 'ひらく' },
        { kind: 'decide', id: 'D1', answer: b, target: 'bus', min: 1, max: 9, mismatch: (k) => boardFromTen(s1, k, 0) },
        { kind: 'scene', world: s2, ms: 900, label: 'のる' },
        { kind: 'scene', world: s3, ms: 800, label: 'おでかけ' },
        { kind: 'decide', id: 'D2', answer: p.result, target: 'box', min: 1, max: 9, mismatch: null },
        { kind: 'scene', world: s4, ms: 900, label: 'あわせる' },
      ],
    };
  }
  // 減減法: b を u と b−u に分ける → u を取る → 10 から b−u を取る
  const rest = b - u;
  const s1 = moveBlobs(s0, (bl) => (bl.id.startsWith('f') ? { ...seatPos(Number(bl.id.slice(1))), r: WAIT.r } : null));
  const s2 = open(s1);
  const s3 = boardFromTen(s2, rest, u);
  const s4 = depart(s3);
  const s5 = moveBlobs(s4, (bl) => {
    if (!bl.id.startsWith('t')) return null;
    const i = Number(bl.id.slice(1));
    return i >= rest ? { ...slotPos(i - rest, fill), r: SLIME_R } : null;
  });
  return {
    start: s0,
    predictAnswer: p.result,
    result: p.result,
    steps: [
      { kind: 'scene', world: s1, ms: 900, label: 'ばらが のる' },
      { kind: 'tapKing' },
      { kind: 'scene', world: s2, ms: 900, label: 'ひらく' },
      { kind: 'decide', id: 'D1', answer: rest, target: 'bus', min: 1, max: 9, mismatch: (k) => boardFromTen(s2, k, u) },
      { kind: 'scene', world: s3, ms: 900, label: 'のる' },
      { kind: 'scene', world: s4, ms: 800, label: 'おでかけ' },
      { kind: 'decide', id: 'D2', answer: p.result, target: 'box', min: 1, max: 9, mismatch: null },
      { kind: 'scene', world: s5, ms: 900, label: 'のこり' },
    ],
  };
}

/** 2つの場面のあいだを補間する（id でそろえる） */
export function lerpWorld(a: World, b: World, t: number): World {
  return {
    ...(b.miniLow ? { miniLow: true } : {}),
    bus: b.bus ? { seats: b.bus.seats, dx: (a.bus?.dx ?? 0) + (b.bus.dx - (a.bus?.dx ?? 0)) * t } : null,
    mini: t >= 0.5 ? b.mini : a.mini,
    blobs: b.blobs.map((q) => {
      const p = a.blobs.find((x) => x.id === q.id) ?? { ...q, opacity: 0 };
      return {
        ...q,
        x: p.x + (q.x - p.x) * t,
        y: p.y + (q.y - p.y) * t,
        r: p.r + (q.r - p.r) * t,
        opacity: p.opacity + (q.opacity - p.opacity) * t,
      };
    }),
  };
}

/** 場面の列（台本の scene だけを順に）。観察段階と予測段階の再生に使う */
export function scenesOf(sc: Script): { world: World; ms: number; label: string }[] {
  return [{ world: sc.start, ms: 0, label: 'はじめ' }, ...sc.steps.filter((s): s is Extract<Step, { kind: 'scene' }> => s.kind === 'scene')];
}

/** 自由探索: いまのフレーム（ones 匹、キングの有無）に k 匹を足す場面の列 */
export function exploreAddScenes(ones: number, k: number, king: boolean, fill: FillOrder): World[] {
  if (ones > 0 && ones + k > 10) return scenesOf(carryScript(ones, k, 'first', fill)).map((x) => x.world);
  if (ones > 0 && ones + k === 10) return scenesOf(complementScript(ones, fill)).map((x) => x.world);
  const s0: World = {
    blobs: [kingBlob(king ? 1 : 0), ...Array.from({ length: ones }, (_, i) => blob(`f${i}`, slotPos(i, fill), SLIME_R, ones))],
    bus: null,
    mini: false,
  };
  const s1 = cloneWorld(s0);
  s1.blobs.push(...Array.from({ length: k }, (_, j) => blob(`g${j}`, waitPos(j), WAIT.r, k)));
  const s2 = moveBlobs(s1, (bl) => (bl.id.startsWith('g') ? { ...slotPos(ones + Number(bl.id.slice(1)), fill), r: SLIME_R } : null));
  return [s0, s1, s2];
}

/** 自由探索の静止状態 */
export function exploreWorld(ones: number, king: boolean, fill: FillOrder): World {
  return {
    blobs: [kingBlob(king ? 1 : 0), ...Array.from({ length: ones }, (_, i) => blob(`f${i}`, slotPos(i, fill), SLIME_R, ones))],
    bus: null,
    mini: false,
  };
}

// ---------- v2.11 2けた（十の位は「10」のカード） ----------

/** 10のカードの小さい大きさ（4枚ずつ、3段まで。9枚まで入る） */
export const CARD_R = 20;
/** i 枚目の10のカードの位置（10の部屋の中） */
export const cardPos = (i: number) => ({ x: TENS.x + 45 + (i % 4) * 50, y: TENS.y + 60 + Math.floor(i / 4) * 46 });
/** 開いた10の小さいフレーム（10の部屋の下側。カードの2段目より下） */
export const MINI_LOW = { x: 30, y: 214, cell: 38, r: 15 };
const miniLowPos = (i: number, fill: FillOrder) => {
  const { col, row } = frameSlot(i, fill);
  return { x: MINI_LOW.x + MINI_LOW.cell / 2 + col * MINI_LOW.cell, y: MINI_LOW.y + MINI_LOW.cell / 2 + row * MINI_LOW.cell };
};
/** たす数の10のカードが待つ場所（左下。4枚ずつ2段） */
const cardWaitPos = (j: number) => ({ x: TENS.x + 45 + (j % 4) * 50, y: 360 + Math.floor(j / 4) * 46 });
const card = (id: string, p: { x: number; y: number }, opacity = 1) => blob(id, p, CARD_R, 10, opacity, true);

/**
 * 2けたの繰り上がり a + b（b は 1けた か 2けた）。一の位は今の C と同じ「10をつくる」:
 * フレームに a の一の位、下に b の一の位。b の一の位を「10−(aの一の位)」と のこりに分ける → 空席に入って 10 → 10のカードが1枚ふえる。
 * b の10のカードは左下で待ち、さいごに 10の部屋へ入る。決定点: D1（空席に入れる数）と D3（ぜんぶで いくつ。選んでから仕組みを見る）。
 */
export function carry2Script(a: number, b: number, fill: FillOrder): Script {
  const at = Math.floor(a / 10);
  const ao = a % 10;
  const bt = Math.floor(b / 10);
  const bo = b % 10;
  const toFill = 10 - ao;
  const result = a + b;
  const s0: World = {
    blobs: [
      ...Array.from({ length: at }, (_, i) => card(`A${i}`, cardPos(i))),
      card('K', cardPos(at), 0),
      ...Array.from({ length: bt }, (_, j) => card(`B${j}`, cardWaitPos(j))),
      ...Array.from({ length: ao }, (_, i) => blob(`f${i}`, slotPos(i, fill), SLIME_R, ao)),
      ...Array.from({ length: bo }, (_, j) => blob(`w${j}`, waitPos(j), WAIT.r, bo)),
    ],
    bus: null,
    mini: false,
  };
  const split = (k: number) =>
    moveBlobs(s0, (bl) => {
      if (!bl.id.startsWith('w')) return null;
      const j = Number(bl.id.slice(1));
      return j < k ? waitPos(j) : waitPos(j - k, Math.ceil(k / 2) + 1);
    });
  const fillWith = (k: number) =>
    moveBlobs(split(k), (bl) => {
      if (!bl.id.startsWith('w')) return null;
      const j = Number(bl.id.slice(1));
      if (j >= k) return null;
      return j < toFill ? { ...slotPos(ao + j, fill), r: SLIME_R } : { ...overflowPos(j - toFill), r: 20 };
    });
  const s1 = split(toFill);
  const s2 = fillWith(toFill);
  const kp = cardPos(at);
  const s3 = moveBlobs(s2, (bl) => {
    if (bl.id === 'K') return { opacity: 1 };
    const inTen = bl.id.startsWith('f') || (bl.id.startsWith('w') && Number(bl.id.slice(1)) < toFill);
    return inTen ? { x: kp.x, y: kp.y, r: 6, opacity: 0 } : null;
  });
  const s4 = moveBlobs(s3, (bl) => {
    if (!bl.id.startsWith('w')) return null;
    const j = Number(bl.id.slice(1));
    return j >= toFill ? { ...slotPos(j - toFill, fill), r: SLIME_R } : null;
  });
  const s5 = moveBlobs(s4, (bl) => (bl.id.startsWith('B') ? cardPos(at + 1 + Number(bl.id.slice(1))) : null));
  const steps: Step[] = [
    { kind: 'decide', id: 'D1', answer: toFill, target: 'frame', min: 1, max: bo, mismatch: (k) => fillWith(k) },
    { kind: 'scene', world: s1, ms: 800, label: 'わける' },
    { kind: 'decide', id: 'D3', answer: result, target: 'total', min: 1, max: 99, mismatch: null },
    { kind: 'scene', world: s2, ms: 900, label: 'あいている ところへ' },
    { kind: 'scene', world: s3, ms: 1000, label: '10の まとまり' },
    { kind: 'scene', world: s4, ms: 800, label: 'のこり' },
  ];
  if (bt > 0) steps.push({ kind: 'scene', world: s5, ms: 900, label: '10の カードも あわせる' });
  return { start: s0, steps, predictAnswer: result, result };
}

/**
 * 2けたの繰り下がり m − s（s は 1けた か 2けた。m の一の位 ＜ s の一の位）。一の位は今の C と同じ（減加法／減減法）。
 * 10のカードの最後の1枚（K）を本人がタップして「ひらく」。s の10のカードの分は、さいごに うすくなって「とった」ことを残す。
 * 決定点: D1（バスに のせる数）と D3（ぜんぶで いくつ のこるか。選んでから仕組みを見る）。
 */
export function borrow2Script(m: number, s: number, strategy: 'subtract_from_ten' | 'subtract_subtract', fill: FillOrder): Script {
  const mt = Math.floor(m / 10);
  const u = m % 10;
  const st = Math.floor(s / 10);
  const so = s % 10;
  const result = m - s;
  const kp = cardPos(mt - 1);
  const s0: World = {
    blobs: [
      ...Array.from({ length: mt - 1 }, (_, i) => card(`M${i}`, cardPos(i))),
      card('K', kp, 1),
      ...Array.from({ length: 10 }, (_, i) => blob(`t${i}`, kp, 6, 10, 0)),
      ...Array.from({ length: u }, (_, i) => blob(`f${i}`, slotPos(i, fill), SLIME_R, u)),
    ],
    bus: { seats: so, dx: 0 },
    mini: false,
    miniLow: true,
  };
  const open = (w: World) =>
    moveBlobs(cloneWorld(w, { mini: true }), (bl) => {
      if (bl.id === 'K') return { opacity: 0 };
      if (bl.id.startsWith('t')) return { ...miniLowPos(Number(bl.id.slice(1)), fill), r: MINI_LOW.r, opacity: 1 };
      return null;
    });
  const boardFromTen = (w: World, k: number, seat0: number) =>
    moveBlobs(w, (bl) => {
      if (!bl.id.startsWith('t')) return null;
      const i = Number(bl.id.slice(1));
      if (i >= k) return null;
      const seat = seat0 + i;
      return seat < so ? { ...seatPos(seat), r: WAIT.r } : { ...seatPos(seat + 2), r: WAIT.r };
    });
  const depart = (w: World) => {
    const n = moveBlobs(w, (bl) => {
      const onBus = bl.y > BUS.y && bl.opacity > 0.5 && !bl.king && bl.x >= BUS.x && bl.x < BOX.x;
      return onBus ? { x: bl.x + BUS_DEPART, opacity: 0.55 } : null;
    });
    n.bus = { seats: so, dx: BUS_DEPART };
    return n;
  };
  /** ひく数の10のカードの分（のこっているカードの うしろから st 枚）を、うすくして「とった」ことを残す */
  const takeTens = (w: World) =>
    moveBlobs(w, (bl) => {
      if (!bl.id.startsWith('M')) return null;
      const i = Number(bl.id.slice(1));
      return i >= mt - 1 - st ? { opacity: 0.3 } : null;
    });

  const steps: Step[] = [];
  if (strategy === 'subtract_from_ten') {
    const s1 = open(s0);
    const s2 = boardFromTen(s1, so, 0);
    const s3 = depart(s2);
    const s4 = moveBlobs(s3, (bl) => {
      if (!bl.id.startsWith('t')) return null;
      const i = Number(bl.id.slice(1));
      return i >= so ? { ...slotPos(u + (i - so), fill), r: SLIME_R } : null;
    });
    steps.push(
      { kind: 'tapKing' },
      { kind: 'scene', world: s1, ms: 900, label: 'ひらく' },
      { kind: 'decide', id: 'D1', answer: so, target: 'bus', min: 1, max: 9, mismatch: (k) => boardFromTen(s1, k, 0) },
      { kind: 'scene', world: s2, ms: 900, label: 'のる' },
      { kind: 'scene', world: s3, ms: 800, label: 'おでかけ' },
      { kind: 'decide', id: 'D3', answer: result, target: 'total', min: 1, max: 99, mismatch: null },
      { kind: 'scene', world: s4, ms: 900, label: 'あわせる' },
    );
    if (st > 0) steps.push({ kind: 'scene', world: takeTens(s4), ms: 900, label: '10の カードを とる' });
  } else {
    const rest = so - u;
    const s1 = moveBlobs(s0, (bl) => (bl.id.startsWith('f') ? { ...seatPos(Number(bl.id.slice(1))), r: WAIT.r } : null));
    const s2 = open(s1);
    const s3 = boardFromTen(s2, rest, u);
    const s4 = depart(s3);
    const s5 = moveBlobs(s4, (bl) => {
      if (!bl.id.startsWith('t')) return null;
      const i = Number(bl.id.slice(1));
      return i >= rest ? { ...slotPos(i - rest, fill), r: SLIME_R } : null;
    });
    steps.push(
      { kind: 'scene', world: s1, ms: 900, label: 'ばらが のる' },
      { kind: 'tapKing' },
      { kind: 'scene', world: s2, ms: 900, label: 'ひらく' },
      { kind: 'decide', id: 'D1', answer: rest, target: 'bus', min: 1, max: 9, mismatch: (k) => boardFromTen(s2, k, u) },
      { kind: 'scene', world: s3, ms: 900, label: 'のる' },
      { kind: 'scene', world: s4, ms: 800, label: 'おでかけ' },
      { kind: 'decide', id: 'D3', answer: result, target: 'total', min: 1, max: 99, mismatch: null },
      { kind: 'scene', world: s5, ms: 900, label: 'のこり' },
    );
    if (st > 0) steps.push({ kind: 'scene', world: takeTens(s5), ms: 900, label: '10の カードを とる' });
  }
  return { start: s0, steps, predictAnswer: result, result };
}
