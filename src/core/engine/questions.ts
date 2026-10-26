import type { AccessibilitySettings, LearningSettings, LearningStage, ModeId, Operation, Question, Strategy, TaskCategory, Trial } from '../types';
import { allBorrowPairs, allCarryPairs, isBorrowPair, isCarryPair } from '../math/tenframe';
import { hasSameParityDistractor, makeDistractors, shuffle, type Rng } from '../math/choices';
import { canHalve, halfOf, halvingDistractors, HALVING_MAX, pickStart, START_MAX, START_MIN, startValues } from '../math/halving';
import { areaTargets, goalEdges, goalOperands, GOAL_OF_CODE, parseGoalOperands, solveShape, type ShapeGoal } from '../math/shapes';
import { arrayAnswer, arrayDistractors, arrayPairs, isValidArrayOperands, SPLIT_MAX, FACTOR_MAX, type ArrayTask } from '../math/arrays';
import { isValidTwoDigit, twoDigitAnswer, twoDigitDistractors, twoDigitPairs, TWO_DIGIT_MAX, type TwoDigitTask } from '../math/twodigit';
import { uid } from '../time';

export const OPERATION_OF: Record<TaskCategory, Operation> = {
  subitizing_678: 'identify',
  numeral_quantity: 'match',
  synthesis_5: 'compose',
  complement_10: 'complement',
  carry_over: 'add',
  borrow: 'subtract',
  arrays: 'arrange',
  balance: 'balance',
  doubling: 'scale',
  period: 'cycle',
  halving: 'halve',
  shapes: 'draw',
  shape_right: 'draw',
  shape_triangle: 'draw',
  shape_rectangle: 'draw',
  array_multiply: 'multiply',
  array_divide: 'divide',
  array_split: 'multiply',
  carry_2d1: 'add',
  borrow_2d1: 'subtract',
  carry_2d2: 'add',
  borrow_2d2: 'subtract',
  array_divide_rem: 'divide',
  shape_square: 'draw',
  shape_isosceles: 'draw',
  shape_area: 'draw',
};

/** v2.11 2けたの繰り上がり・繰り下がり（§9.3 の拡張）の課題か */
export const isTwoDigitTask = (t: TaskCategory): t is TwoDigitTask => t === 'carry_2d1' || t === 'borrow_2d1' || t === 'carry_2d2' || t === 'borrow_2d2';

/** v2.10 タイルの かけわり（§9.10）の課題か */
export const isArrayTask = (t: TaskCategory): t is ArrayTask => t === 'array_multiply' || t === 'array_divide' || t === 'array_split' || t === 'array_divide_rem';

/** v2.9 かたちづくり: 課題ごとの目標（§9.9）。決定点は「目標の形をつくる」で、選択肢は使わない */
export const GOAL_OF_TASK: Partial<Record<TaskCategory, ShapeGoal>> = {
  shape_right: 'right',
  shape_triangle: 'triangle',
  shape_rectangle: 'rectangle',
  // v2.14
  shape_square: 'square',
  shape_isosceles: 'isosceles',
  shape_area: 'area',
};
export const isShapeGoalTask = (t: TaskCategory) => t in GOAL_OF_TASK;

export function strategyFor(task: TaskCategory, mode: ModeId, settings: Readonly<AccessibilitySettings>): Strategy {
  if (task === 'carry_over' || task === 'carry_2d1' || task === 'carry_2d2') return 'make_ten';
  // v2.11: 2けたの一の位は C と同じ方略（設定の減加法／減減法）
  if (task === 'borrow_2d1' || task === 'borrow_2d2') return mode === 'mode_d_exchange' ? 'count_up' : settings.borrowStrategy;
  if (task === 'borrow') return mode === 'mode_d_exchange' ? 'count_up' : settings.borrowStrategy;
  return 'none';
}

export function questionId(task: TaskCategory, operands: number[]): string {
  return `${task}:${operands.join(',')}`;
}

export function expectedValueOf(task: TaskCategory, operands: number[]): number {
  switch (task) {
    case 'subitizing_678':
    case 'numeral_quantity':
      return operands[0];
    case 'synthesis_5':
    case 'carry_over':
      return operands[0] + operands[1];
    case 'complement_10':
      return 10 - operands[0];
    case 'borrow':
    case 'balance':
      return operands[0] - operands[1];
    case 'arrays':
    case 'doubling':
    case 'period':
    case 'shapes':
      // じっけんラボ・ジオボードは自由探索のみ（expectedValue は null で出す）
      return operands[0] ?? 0;
    case 'halving':
      // v2.7: 整数の半分（奇数は出題しないので割り切れる）
      return operands[0] / 2;
    case 'shape_right':
    case 'shape_triangle':
    case 'shape_rectangle':
    case 'shape_square':
    case 'shape_isosceles':
    case 'shape_area':
      // v2.9: 目標の記号（operands の先頭）
      return operands[0];
    case 'array_multiply':
    case 'array_divide':
    case 'array_split':
    case 'array_divide_rem':
      // v2.10: かけざん・10と のこりは 行 × 列、わりざんは 列（v2.13 あまりのある わりざんも 列）
      return arrayAnswer(task, operands);
    case 'carry_2d1':
    case 'borrow_2d1':
    case 'carry_2d2':
    case 'borrow_2d2':
      // v2.11: 決定点の答えは「ぜんぶで いくつ」
      return twoDigitAnswer(task, operands);
  }
}

/**
 * 主な決定点で本人が選ぶ値（ダミーはこの値のまわりに作る）。
 * 段階ごとに「何を選ぶか」が違うので、ここで一元的に決める。
 */
export function decisionValue(q: Pick<Question, 'taskType' | 'operands' | 'learningStage' | 'representation'>): number {
  const [a, b] = q.operands;
  switch (q.taskType) {
    case 'subitizing_678':
    case 'numeral_quantity':
      return a;
    case 'synthesis_5':
      // 予測: 合体後の形 / 本課題: 残りの枠を埋める部分
      return q.learningStage === 'predict' ? a + b : b;
    case 'complement_10':
      return 10 - a;
    case 'carry_over':
      // 一の位に残る数（10 のまとまりと残り）
      return a + b - 10;
    case 'borrow':
    case 'balance':
      // balance: 右の皿に足す重り（左の重さ − 右にある重り）
      return a - b;
    case 'arrays':
    case 'doubling':
    case 'period':
    case 'shapes':
      return a ?? 0;
    case 'halving':
      return a / 2;
    case 'shape_right':
    case 'shape_triangle':
    case 'shape_rectangle':
    case 'shape_square':
    case 'shape_isosceles':
    case 'shape_area':
      return a;
    case 'array_multiply':
    case 'array_divide':
    case 'array_split':
    case 'array_divide_rem':
      return arrayAnswer(q.taskType, q.operands);
    case 'carry_2d1':
    case 'borrow_2d1':
    case 'carry_2d2':
    case 'borrow_2d2':
      return twoDigitAnswer(q.taskType, q.operands);
  }
}

function distractorRange(task: TaskCategory, stage: LearningStage): { min: number; max: number } {
  if (task === 'subitizing_678' || task === 'numeral_quantity') return { min: 1, max: 10 };
  if (task === 'synthesis_5' && stage === 'predict') return { min: 2, max: 10 };
  return { min: 1, max: 9 };
}

export function distractorsFor(q: Pick<Question, 'taskType' | 'operands' | 'learningStage' | 'representation'>, count: number, rng: Rng): number[] {
  // v2.7: 半分は、理由のある間違い（ひらかずに分けた・半分を2回・2倍）を候補にする（§22）
  if (q.taskType === 'halving') return halvingDistractors(q.operands[0], count, rng);
  // v2.9: かたちづくりは、選択肢ではなく「つくる」決定点（ダミーなし）
  if (isShapeGoalTask(q.taskType)) return [];
  // v2.10: かけわりは、理由のある間違い（たした・1列ずれた・のこりを かけわすれた など）を候補にする（§9.10）
  if (isArrayTask(q.taskType)) return arrayDistractors(q.taskType, q.operands, count, rng);
  // v2.11: 2けたは、くりあがりを わすれた・ひらいた 10を へらしわすれた などの理由のある間違い（§9.3）
  if (isTwoDigitTask(q.taskType)) return twoDigitDistractors(q.taskType, q.operands, count, rng);
  const v = decisionValue(q);
  const range = distractorRange(q.taskType, q.learningStage);
  return makeDistractors(v, count, { ...range, sameParity: q.taskType === 'subitizing_678' }, rng);
}

export interface PickContext {
  /** 直近の問題ID（すぐに同じ問題を出さない） */
  recentIds: string[];
  /** 以前の日に完了した問題ID（後日再確認 revisit の候補） */
  priorDayIds: Set<string>;
}

function candidateOperands(task: TaskCategory, learning: Readonly<LearningSettings>): number[][] {
  switch (task) {
    case 'subitizing_678':
      return [[6], [7], [8]];
    case 'numeral_quantity':
      return [5, 6, 7, 8, 9].map((n) => [n]);
    case 'synthesis_5': {
      const out: number[][] = [];
      for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) if (a + b >= 3 && a + b <= learning.synthesisMax) out.push([a, b]);
      return out;
    }
    case 'complement_10':
      return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((a) => [a]);
    case 'carry_over':
      return allCarryPairs();
    case 'borrow':
      return allBorrowPairs();
    case 'balance':
      return balancePairs();
    case 'arrays':
    case 'doubling':
    case 'period':
    case 'shapes':
      return [];
    case 'halving':
      // 新しい列の出発値（4けた・32の倍数）。続きの問題は nextInChain で作る
      return startValues().map((n) => [n]);
    case 'shape_right':
    case 'shape_triangle':
    case 'shape_rectangle':
    case 'shape_square':
    case 'shape_isosceles':
    case 'shape_area': {
      // v2.9: 最初の1辺（見本の解がある辺だけ）。v2.14 ひろさは 辺と ます n こぶん の組
      const goal = GOAL_OF_TASK[task]!;
      if (goal === 'area') return areaTargets().map((t) => goalOperands('area', t.edge, t.n));
      return goalEdges(goal).map((e) => goalOperands(goal, e));
    }
    case 'array_multiply':
    case 'array_divide':
    case 'array_split':
    case 'array_divide_rem':
      return arrayPairs(task);
    case 'carry_2d1':
    case 'borrow_2d1':
    case 'carry_2d2':
    case 'borrow_2d2':
      return twoDigitPairs(task);
  }
}

/** v2.3 釣り合い: 左の重さ t（6〜18。10をこえたら 10 と のこり の2つ）、右にある重り c（1〜9）、足す重り t−c（1〜9） */
export function balancePairs(): number[][] {
  const out: number[][] = [];
  for (let t = 6; t <= 18; t++) for (let c = 1; c <= 9; c++) if (t - c >= 1 && t - c <= 9 && t - c !== c) out.push([t, c]);
  return out;
}

const DIFFICULTY: Record<TaskCategory, number> = {
  subitizing_678: 1,
  numeral_quantity: 1,
  synthesis_5: 1,
  complement_10: 2,
  carry_over: 3,
  borrow: 4,
  arrays: 0,
  balance: 3,
  doubling: 0,
  period: 0,
  halving: 5,
  shapes: 0,
  shape_right: 2,
  shape_triangle: 3,
  shape_rectangle: 3,
  array_multiply: 3,
  array_divide: 4,
  array_split: 5,
  carry_2d1: 5,
  borrow_2d1: 6,
  carry_2d2: 6,
  borrow_2d2: 7,
  array_divide_rem: 6,
  shape_square: 3,
  shape_isosceles: 4,
  shape_area: 4,
};

export interface GenerateOptions {
  task: TaskCategory;
  mode: ModeId;
  stage: Exclude<LearningStage, 'explore' | 'transfer' | 'revisit'>;
  settings: Readonly<AccessibilitySettings>;
  learning: Readonly<LearningSettings>;
  pick: PickContext;
  rng?: Rng;
}

/** 問題を1問つくる。本課題で前日以前に解いた問題を選んだときは learningStage を revisit にする */
export function generateQuestion(o: GenerateOptions): Question {
  const rng = o.rng ?? Math.random;
  if (o.task === 'halving') return newHalvingChain(o, rng);
  const all = candidateOperands(o.task, o.learning);
  const fresh = all.filter((ops) => !o.pick.recentIds.slice(-3).includes(questionId(o.task, ops)));
  const pool = fresh.length ? fresh : all;
  let operands: number[];
  let stage: LearningStage = o.stage;
  const revisitPool = o.stage === 'construct' ? pool.filter((ops) => o.pick.priorDayIds.has(questionId(o.task, ops))) : [];
  // 3回に1回くらい、前日以前の問題をもう一度出す（後日再現の確認 §7.2）
  if (revisitPool.length && rng() < 0.34) {
    operands = revisitPool[Math.floor(rng() * revisitPool.length)];
    stage = 'revisit';
  } else {
    operands = pool[Math.floor(rng() * pool.length)];
  }
  return buildQuestion(o.task, operands, o.mode, stage, o.settings, o.learning, rng);
}

export function buildQuestion(
  task: TaskCategory,
  operands: number[],
  mode: ModeId,
  stage: LearningStage,
  settings: Readonly<AccessibilitySettings>,
  learning: Readonly<LearningSettings>,
  rng: Rng = Math.random,
): Question {
  const base = { taskType: task, operands, learningStage: stage, representation: mode };
  let variantId = `${task}/${stage}`;
  if (task === 'numeral_quantity') variantId = rng() < 0.5 ? 'numeral_to_quantity' : 'quantity_to_numeral';
  if (task === 'subitizing_678') variantId = 'silhouette';
  return {
    id: questionId(task, operands),
    taskType: task,
    operation: OPERATION_OF[task],
    operands,
    expectedValue: expectedValueOf(task, operands),
    representation: mode,
    strategy: strategyFor(task, mode, settings),
    distractors: distractorsFor(base, learning.choiceCount - 1, rng),
    difficulty: DIFFICULTY[task],
    variantId,
    learningStage: stage,
  };
}

// ---------- v2.7 はんぶんチャレンジ（§22）: 連続する問題 ----------

/** 新しい列を始める（出発値は 4けた・32の倍数から。直近の出発値は避ける）。前日以前の出発値で始めたときは revisit */
function newHalvingChain(o: GenerateOptions, rng: Rng): Question {
  const recentStarts = o.pick.recentIds.slice(-10).map((id) => Number(id.split(':')[1])).filter((n) => n >= START_MIN);
  const priorStarts = startValues().filter((n) => o.pick.priorDayIds.has(questionId('halving', [n])) && !recentStarts.includes(n));
  let start: number;
  let stage: LearningStage = o.stage;
  if (o.stage === 'construct' && priorStarts.length && rng() < 0.2) {
    start = priorStarts[Math.floor(rng() * priorStarts.length)];
    stage = 'revisit';
  } else start = pickStart(rng, recentStarts);
  return halvingQuestion(start, { id: uid('c-'), initial: start, step: 0 }, o.mode, stage, o.learning, rng);
}

export function halvingQuestion(
  current: number,
  chain: NonNullable<Question['chain']>,
  mode: ModeId,
  stage: LearningStage,
  learning: Readonly<LearningSettings>,
  rng: Rng = Math.random,
): Question {
  return {
    id: questionId('halving', [current]),
    taskType: 'halving',
    operation: 'halve',
    operands: [current],
    expectedValue: current / 2,
    representation: mode,
    strategy: 'none',
    distractors: halvingDistractors(current, learning.choiceCount - 1, rng),
    difficulty: DIFFICULTY.halving,
    variantId: `chain/step${chain.step}`,
    learningStage: stage,
    chain,
  };
}

/** 半分を選べた試行のつぎ（選んだ半分が新しい基準）。整数の半分ができないときは null（その列はおしまい） */
export function nextInChain(q: Question, learning: Readonly<LearningSettings>, rng: Rng = Math.random): Question | null {
  if (q.taskType !== 'halving' || !q.chain) return null;
  const h = halfOf(q.operands[0]);
  if (h === null || !canHalve(h)) return null;
  return halvingQuestion(h, { ...q.chain, step: q.chain.step + 1 }, q.representation, 'construct', learning, rng);
}

/** 試行が終わったあとに出す、つぎの選び方（課題ごと）。null なら従来の「つぎへ」 */
export interface Continuation {
  key: 'more' | 'new_chain';
  question?: Question;
}

export function continuationsOf(trial: Pick<Trial, 'question' | 'result'>, learning: Readonly<LearningSettings>, rng: Rng = Math.random): Continuation[] | null {
  const q = trial.question;
  if (q.taskType !== 'halving') return null;
  const out: Continuation[] = [];
  // 本人が半分を選べたときだけ、つぎの半分へ進める（スキップでは進めない。自動で続けない）
  const solved = trial.result?.outcome === 'completed' && trial.result.assistanceLevel !== 'not_completed';
  const next = solved ? nextInChain(q, learning, rng) : null;
  if (next) out.push({ key: 'more', question: next });
  out.push({ key: 'new_chain' });
  return out;
}

/** §9.5 表現横断: 数量関係（id・operands・expectedValue）を保ったまま表現だけ変える */
export function retarget(q: Question, mode: ModeId, settings: Readonly<AccessibilitySettings>, learning: Readonly<LearningSettings>, rng: Rng = Math.random): Question {
  const stage: LearningStage = 'transfer';
  const base = { taskType: q.taskType, operands: q.operands, learningStage: stage, representation: mode };
  return {
    ...q,
    representation: mode,
    learningStage: stage,
    strategy: strategyFor(q.taskType, mode, settings),
    distractors: distractorsFor(base, learning.choiceCount - 1, rng),
  };
}

export function exploreQuestion(mode: ModeId, task: TaskCategory): Question {
  return {
    id: `explore:${mode}`,
    taskType: task,
    operation: OPERATION_OF[task],
    operands: [],
    expectedValue: null,
    representation: mode,
    strategy: 'none',
    distractors: [],
    difficulty: 0,
    variantId: 'sandbox',
    learningStage: 'explore',
  };
}

/** §10: エンジンは出題前に数の範囲と識別課題の同偶奇ダミーを検証する */
export function validateQuestion(q: Question): string[] {
  const errs: string[] = [];
  if (q.learningStage === 'explore') {
    if (q.expectedValue !== null) errs.push('explore の expectedValue は null');
    return errs;
  }
  // v2.7: 数の範囲は課題ごと（§9.0）。はんぶんチャレンジ以外は 0〜20 のまま
  const r = valueRange(q.taskType);
  const inRange = (v: number) => Number.isInteger(v) && v >= r.min && v <= r.max;
  if (!q.operands.every(inRange)) errs.push(`operands が ${r.min}〜${r.max} の範囲外`);
  if (q.expectedValue === null || !inRange(q.expectedValue)) errs.push(`expectedValue が ${r.min}〜${r.max} の範囲外`);
  if (q.expectedValue !== expectedValueOf(q.taskType, q.operands)) errs.push('expectedValue が operands と一致しない');
  const [a, b] = q.operands;
  if (q.taskType === 'carry_over' && !isCarryPair(a, b)) errs.push('繰り上がりの範囲外（1〜9、和11〜18）');
  if (q.taskType === 'borrow' && !isBorrowPair(a, b)) errs.push('繰り下がりの範囲外（被減数11〜18、減数2〜9、一の位<減数）');
  if (q.taskType === 'halving') {
    if (q.operands.length !== 1 || !canHalve(a)) errs.push('はんぶん: 2 以上の偶数を1つ');
    if (!q.chain) errs.push('はんぶん: 列（chain）がない');
    else {
      if (q.chain.initial < START_MIN || q.chain.initial > START_MAX) errs.push('はんぶん: 出発値が 4けたでない');
      // 今の数は、出発値を step 回半分にした数
      if (q.chain.initial / 2 ** q.chain.step !== a) errs.push('はんぶん: 今の数が出発値と step に合わない');
    }
  }
  if (isShapeGoalTask(q.taskType)) {
    const g = parseGoalOperands(q.operands);
    if (!g) errs.push('かたちづくり: 目標と最初の1辺（たて・よこ、長さ1〜3、盤の中）が正しくない');
    else if (GOAL_OF_CODE[q.operands[0]] !== GOAL_OF_TASK[q.taskType]) errs.push('かたちづくり: 目標が課題と合わない');
    else if (!solveShape(g.goal, g.edge, g.n)) errs.push('かたちづくり: 最初の1辺から作れる見本の形がない');
    return errs;
  }
  if (isArrayTask(q.taskType) && !isValidArrayOperands(q.taskType, q.operands)) errs.push('かけわり: 行・列が範囲外か、割り切れない');
  if (isTwoDigitTask(q.taskType) && !isValidTwoDigit(q.taskType, q.operands)) errs.push('2けた: 一の位で くりあがり／くりさがりがない、または答えが範囲外');
  if (q.taskType === 'balance' && !(a >= 6 && a <= 18 && b >= 1 && b <= 9 && a - b >= 1 && a - b <= 9)) errs.push('釣り合いの範囲外（左6〜18、右1〜9、足す重り1〜9）');
  const choices = q.distractors.length + 1;
  if (choices < 2 || choices > 4) errs.push('選択肢は2〜4個');
  const dv = decisionValue(q);
  if (q.distractors.includes(dv)) errs.push('ダミーに正答が含まれる');
  if (new Set(q.distractors).size !== q.distractors.length) errs.push('ダミーが重複');
  if (q.taskType === 'subitizing_678' && !hasSameParityDistractor(dv, q.distractors)) errs.push('識別課題に同偶奇のダミーがない');
  return errs;
}

/** 課題ごとの数の範囲（出題・答え・選択肢の元になる値） */
export function valueRange(task: TaskCategory): { min: number; max: number } {
  if (task === 'halving') return { min: 1, max: HALVING_MAX };
  // v2.9: 目標の記号と盤の座標（0〜4）
  // v2.14: ひろさの n は 16 まで
  if (isShapeGoalTask(task)) return { min: 0, max: 16 };
  // v2.10: 行・列は 2〜19、答え（ぜんぶの数）は 19 × 9 まで
  if (isArrayTask(task)) return { min: 2, max: SPLIT_MAX * FACTOR_MAX };
  // v2.11: 2けたは 99 まで（100 は Phase 5）
  if (isTwoDigitTask(task)) return { min: 1, max: TWO_DIGIT_MAX };
  return { min: 0, max: 20 };
}

export function choicesOf(q: Question, rng: Rng = Math.random): number[] {
  return shuffle([decisionValue(q), ...q.distractors], rng);
}
