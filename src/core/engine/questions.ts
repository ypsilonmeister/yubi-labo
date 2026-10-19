import type { AccessibilitySettings, LearningSettings, LearningStage, ModeId, Operation, Question, Strategy, TaskCategory } from '../types';
import { allBorrowPairs, allCarryPairs, isBorrowPair, isCarryPair } from '../math/tenframe';
import { hasSameParityDistractor, makeDistractors, shuffle, type Rng } from '../math/choices';

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
};

export function strategyFor(task: TaskCategory, mode: ModeId, settings: Readonly<AccessibilitySettings>): Strategy {
  if (task === 'carry_over') return 'make_ten';
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
      // じっけんラボは自由探索のみ（expectedValue は null で出す）
      return operands[0] ?? 0;
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
      return a ?? 0;
  }
}

function distractorRange(task: TaskCategory, stage: LearningStage): { min: number; max: number } {
  if (task === 'subitizing_678' || task === 'numeral_quantity') return { min: 1, max: 10 };
  if (task === 'synthesis_5' && stage === 'predict') return { min: 2, max: 10 };
  return { min: 1, max: 9 };
}

export function distractorsFor(q: Pick<Question, 'taskType' | 'operands' | 'learningStage' | 'representation'>, count: number, rng: Rng): number[] {
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
      return [];
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
  const inRange = (v: number) => Number.isInteger(v) && v >= 0 && v <= 20;
  if (!q.operands.every(inRange)) errs.push('operands が 0〜20 の範囲外');
  if (q.expectedValue === null || !inRange(q.expectedValue)) errs.push('expectedValue が 0〜20 の範囲外');
  if (q.expectedValue !== expectedValueOf(q.taskType, q.operands)) errs.push('expectedValue が operands と一致しない');
  const [a, b] = q.operands;
  if (q.taskType === 'carry_over' && !isCarryPair(a, b)) errs.push('繰り上がりの範囲外（1〜9、和11〜18）');
  if (q.taskType === 'borrow' && !isBorrowPair(a, b)) errs.push('繰り下がりの範囲外（被減数11〜18、減数2〜9、一の位<減数）');
  if (q.taskType === 'balance' && !(a >= 6 && a <= 18 && b >= 1 && b <= 9 && a - b >= 1 && a - b <= 9)) errs.push('釣り合いの範囲外（左6〜18、右1〜9、足す重り1〜9）');
  const choices = q.distractors.length + 1;
  if (choices < 2 || choices > 4) errs.push('選択肢は2〜4個');
  const dv = decisionValue(q);
  if (q.distractors.includes(dv)) errs.push('ダミーに正答が含まれる');
  if (new Set(q.distractors).size !== q.distractors.length) errs.push('ダミーが重複');
  if (q.taskType === 'subitizing_678' && !hasSameParityDistractor(dv, q.distractors)) errs.push('識別課題に同偶奇のダミーがない');
  return errs;
}

export function choicesOf(q: Question, rng: Rng = Math.random): number[] {
  return shuffle([decisionValue(q), ...q.distractors], rng);
}
