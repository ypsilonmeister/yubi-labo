// 実装拡張（v2.2）: おまかせ進行と適応型スキップ。
// モードごとに「課題 × 段階」のステップを順に並べ、同じステップを
// ヒントなし・間違いなしで2回続けて解けたら、そのステップは済んだものとして次へ進む。
// 反応時間は使わない（CLAUDE.md: 反応時間は補助指標で、判断に使わない）。
// できなかったときに前のステップへ戻すことはしない。

import type { LearningStage, ModeId, TaskCategory, Trial } from '../types';
import { exploredToEnd } from '../score';

export interface Step {
  task: TaskCategory;
  stage: Exclude<LearningStage, 'explore' | 'transfer' | 'revisit'>;
}

export interface ModeShape {
  id: ModeId;
  supportedTasks: TaskCategory[];
  stagesFor(task: TaskCategory): LearningStage[];
}

/** 本人が操作する段階の並び。観察（みる）は一度見れば済む */
const ORDER: Step['stage'][] = ['observe', 'predict', 'construct'];

export function stepsOf(mode: ModeShape): Step[] {
  const out: Step[] = [];
  for (const task of mode.supportedTasks) {
    const st = mode.stagesFor(task);
    for (const stage of ORDER) if (st.includes(stage)) out.push({ task, stage });
  }
  return out;
}

/** 試行がどのステップのものか（後日再確認は本課題、表現横断は数えない） */
function stepOfTrial(t: Trial): Step | null {
  const s = t.question.learningStage;
  if (s === 'explore' || s === 'transfer') return null;
  return { task: t.question.taskType, stage: s === 'revisit' ? 'construct' : s };
}

const same = (a: Step, b: Step) => a.task === b.task && a.stage === b.stage;

const clean = (t: Trial) => t.result?.outcome === 'completed' && t.result.assistanceLevel === 'independent' && t.result.mistakeCount === 0;

/** そのステップが済んでいるか（trials は古い順） */
export function stepMastered(step: Step, trials: Trial[]): boolean {
  const mine = trials.filter((t) => {
    const s = stepOfTrial(t);
    return s && same(s, step) && t.result && t.result.outcome !== 'abandoned';
  });
  if (step.stage === 'observe') return mine.some(exploredToEnd);
  for (let i = 1; i < mine.length; i++) if (clean(mine[i - 1]) && clean(mine[i])) return true;
  return false;
}

/**
 * いま出すステップ。まだ済んでいない最初のステップ。
 * 全部済んでいたら、最後のステップ（いちばん難しい本課題）をくり返す。
 */
export function currentStep(mode: ModeShape, trials: Trial[]): Step {
  const mine = trials.filter((t) => t.modeId === mode.id);
  const steps = stepsOf(mode);
  return steps.find((s) => !stepMastered(s, mine)) ?? steps[steps.length - 1];
}
