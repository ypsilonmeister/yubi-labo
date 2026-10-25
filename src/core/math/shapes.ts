// v2.8 ジオボード（§9.8）の純粋関数。React に依存しない。
// 頂点は整数の格子点なので、直角・辺の長さの等しさは整数の計算だけで厳密に決まる（誤差がない）。

export interface Pt {
  x: number;
  y: number;
}

/** 点の並び（BOARD × BOARD こ） */
export const BOARD = 5;

export type ShapeClass = 'triangle' | 'right_triangle' | 'quadrilateral' | 'rectangle' | 'square' | 'polygon';

/** 図鑑（CraftKind 'shape'）に残す記号。parts = [SHAPE_CODE] */
export const SHAPE_CODE: Record<ShapeClass, number> = {
  triangle: 1,
  right_triangle: 2,
  quadrilateral: 3,
  rectangle: 4,
  square: 5,
  polygon: 6,
};

export const SHAPE_NAME: Record<ShapeClass, string> = {
  triangle: 'さんかく',
  right_triangle: 'ちょっかく さんかく',
  quadrilateral: 'しかく',
  rectangle: 'ちょうほうけい',
  square: 'せいほうけい',
  polygon: 'たかくけい',
};

const same = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len2 = (a: Pt, b: Pt) => dot(sub(a, b), sub(a, b));

/** b を頂点とする a-b-c の角が直角か（辺の長さが 0 のときは直角ではない） */
export function isRightAngle(a: Pt, b: Pt, c: Pt): boolean {
  const u = sub(a, b);
  const v = sub(c, b);
  return (u.x !== 0 || u.y !== 0) && (v.x !== 0 || v.y !== 0) && dot(u, v) === 0;
}

function onSegment(a: Pt, b: Pt, p: Pt): boolean {
  return cross(sub(b, a), sub(p, a)) === 0 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
}

/** 線分 ab と cd が（端点でふれるだけでも）交わるか */
export function segmentsTouch(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o1 = Math.sign(cross(sub(b, a), sub(c, a)));
  const o2 = Math.sign(cross(sub(b, a), sub(d, a)));
  const o3 = Math.sign(cross(sub(d, c), sub(a, c)));
  const o4 = Math.sign(cross(sub(d, c), sub(b, c)));
  if (o1 !== o2 && o3 !== o4) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

/** 点を打つ場所の一覧（左上から、行ごと） */
export function boardPoints(n = BOARD): Pt[] {
  const out: Pt[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.push({ x, y });
  return out;
}

/**
 * path の最後の点から p へ、ゴムをかけられるか。
 * - 同じ点・すでに使った点（さいしょの点は、3つ以上つないだあとなら「とじる」）は不可
 * - 斜めを使わないときは、たて・よこの線だけ
 * - ほかの線と交わる・重なる・来た道をもどる線は不可（形が1つの輪になるように）
 */
export function canExtend(path: Pt[], p: Pt, allowDiagonal: boolean): boolean {
  if (!path.length) return true;
  const last = path[path.length - 1];
  if (same(last, p)) return false;
  const closing = path.length >= 3 && same(path[0], p);
  if (!closing && path.some((q) => same(q, p))) return false;
  if (!allowDiagonal && last.x !== p.x && last.y !== p.y) return false;
  const n = path.length;
  // 来た道をもどる（直前の線に重なる）
  if (n >= 2) {
    const prev = path[n - 2];
    if (cross(sub(last, prev), sub(p, last)) === 0 && dot(sub(last, prev), sub(p, last)) < 0) return false;
  }
  for (let i = 0; i < n - 1; i++) {
    if (i === n - 2) continue; // 直前の線は last を共有（上でもどり線は除いた）
    const a = path[i];
    const b = path[i + 1];
    if (closing && i === 0) {
      // さいしょの線は p を共有する。重なる向きだけ不可
      if (cross(sub(b, p), sub(last, p)) === 0 && dot(sub(b, p), sub(last, p)) > 0) return false;
      continue;
    }
    if (segmentsTouch(last, p, a, b)) return false;
  }
  return true;
}

/** 一直線上にならんだ途中の点を取りのぞく（かどではないので頂点に数えない） */
export function corners(poly: Pt[]): Pt[] {
  const n = poly.length;
  return poly.filter((v, i) => cross(sub(v, poly[(i + n - 1) % n]), sub(poly[(i + 1) % n], v)) !== 0);
}

/**
 * 各かどが（輪の内側で）直角か。corners(poly) と同じ順。
 * 辺の内積が 0 でも、へこんだかど（内角 270°）は直角に数えない。向きは符号つき面積で決める。
 */
export function rightCorners(poly: Pt[]): boolean[] {
  const c = corners(poly);
  const n = c.length;
  let area2 = 0;
  for (let i = 0; i < n; i++) area2 += cross(c[i], c[(i + 1) % n]);
  return c.map((v, i) => {
    const a = c[(i + n - 1) % n];
    const b = c[(i + 1) % n];
    const convex = Math.sign(cross(sub(v, a), sub(b, v))) === Math.sign(area2);
    return convex && isRightAngle(a, v, b);
  });
}

/** 輪の形の種類。頂点は3つ以上で、1周の輪になっていること */
export function classify(poly: Pt[]): ShapeClass {
  const c = corners(poly);
  const n = c.length;
  const right = rightCorners(c);
  if (n === 3) return right.some(Boolean) ? 'right_triangle' : 'triangle';
  if (n === 4) {
    if (right.every(Boolean)) return len2(c[0], c[1]) === len2(c[1], c[2]) ? 'square' : 'rectangle';
    return 'quadrilateral';
  }
  return 'polygon';
}

/** 図鑑に残す発見（多角形は残さない） */
export function discoveryOf(poly: Pt[]): { value: number; parts: number[] } | null {
  const k = classify(poly);
  if (k === 'polygon') return null;
  return { value: corners(poly).length, parts: [SHAPE_CODE[k]] };
}

const COUNT_WORD = ['ゼロ', 'ひとつ', 'ふたつ', 'みっつ', 'よっつ', 'いつつ', 'むっつ', 'ななつ', 'やっつ', 'ここのつ'];
export const countWord = (n: number) => COUNT_WORD[n] ?? `${n}こ`;

// ---------- K かたちづくり（v2.9・§9.9）: 目標と、最初の1辺 ----------

/** 目標（課題ごとに1つ）。Question の operands の先頭に入れる記号 */
export type ShapeGoal = 'right' | 'triangle' | 'rectangle';
export const GOAL_CODE: Record<ShapeGoal, number> = { right: 1, triangle: 2, rectangle: 3 };
export const GOAL_OF_CODE: Record<number, ShapeGoal> = { 1: 'right', 2: 'triangle', 3: 'rectangle' };

/** 目標に合う形か。right は「かどがぜんぶ まっすぐ」、rectangle は せいほうけい も 長方形の仲間として受け入れる */
export function meetsGoal(goal: ShapeGoal, poly: Pt[]): boolean {
  const k = classify(poly);
  if (goal === 'triangle') return k === 'triangle' || k === 'right_triangle';
  return k === 'rectangle' || k === 'square';
}

/** 三角形は斜めの線がないと作れない。その課題は、斜めを最初からONにする */
export const needsDiagonal = (goal: ShapeGoal) => goal === 'triangle';

export type Edge = [Pt, Pt];

/** 最初にかけておく1辺（たて・よこ、長さ 1〜3。a は左上側）。5×5 で 90 通り */
export function givenEdges(): Edge[] {
  const out: Edge[] = [];
  for (let y = 0; y < BOARD; y++)
    for (let x = 0; x < BOARD; x++)
      for (let len = 1; len <= 3; len++) {
        if (x + len < BOARD) out.push([{ x, y }, { x: x + len, y }]);
        if (y + len < BOARD) out.push([{ x, y }, { x, y: y + len }]);
      }
  return out;
}

/**
 * 見本の解（ヒント L3 の実演に使う）。最初の1辺の続きを、きまった手順で返す。
 * - right / rectangle: 辺に垂直に 1 だけ（盤にはみ出すなら反対側へ）ふくらませた長方形
 * - triangle: 辺の左（上）はしの真上（または真下）の点を頂点とする三角形（ななめの線を1本つかう）
 * 返す点の並びは、最初の2点が与えられた辺で、とじるまえの輪（さいしょの点にもどる点は含まない）。
 */
export function solveShape(goal: ShapeGoal, edge: Edge): Pt[] {
  const [a, b] = edge;
  const horizontal = a.y === b.y;
  const off = (v: number) => (v + 1 < BOARD ? 1 : -1);
  if (goal === 'triangle') {
    return horizontal ? [a, b, { x: a.x, y: a.y + off(a.y) }] : [a, b, { x: a.x + off(a.x), y: a.y }];
  }
  if (horizontal) {
    const d = off(a.y);
    return [a, b, { x: b.x, y: b.y + d }, { x: a.x, y: a.y + d }];
  }
  const d = off(a.x);
  return [a, b, { x: b.x + d, y: b.y }, { x: a.x + d, y: a.y }];
}

/** 出題の operands = [目標の記号, x0, y0, x1, y1] */
export function goalOperands(goal: ShapeGoal, e: Edge): number[] {
  return [GOAL_CODE[goal], e[0].x, e[0].y, e[1].x, e[1].y];
}

export function parseGoalOperands(ops: number[]): { goal: ShapeGoal; edge: Edge } | null {
  const goal = GOAL_OF_CODE[ops[0]];
  if (!goal || ops.length !== 5) return null;
  const [, x0, y0, x1, y1] = ops;
  const inb = (v: number) => Number.isInteger(v) && v >= 0 && v < BOARD;
  if (![x0, y0, x1, y1].every(inb)) return null;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = dx + dy;
  const axis = (dx === 0) !== (dy === 0);
  if (!axis || dx < 0 || dy < 0 || len < 1 || len > 3) return null;
  return { goal, edge: [{ x: x0, y: y0 }, { x: x1, y: y1 }] };
}
