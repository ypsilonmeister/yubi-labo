import type { LearningStage, ModeId, TaskCategory } from '../core/types';

// 子ども向けの表示名（ひらがな）。事実の描写だけにする（§8.2）
export const TASK_LABEL: Record<TaskCategory, string> = {
  subitizing_678: 'かたち みわけ',
  numeral_quantity: 'すうじと かたち',
  synthesis_5: 'あわせて つくる',
  complement_10: '10を つくる',
  carry_over: 'あふれて 10',
  borrow: '10を ひらく',
};

export function taskLabel(task: TaskCategory, mode: ModeId): string {
  if (task === 'borrow' && mode === 'mode_d_exchange') return 'おつり';
  if (task === 'carry_over' && mode === 'mode_d_exchange') return 'りょうがえ';
  return TASK_LABEL[task];
}

export const STAGE_LABEL: Record<LearningStage, string> = {
  explore: 'じゆうに あそぶ',
  observe: 'みる',
  predict: 'よそう',
  construct: 'つくる',
  transfer: 'べつの せかい',
  revisit: 'つくる',
};

// 保護者向け
export const TASK_LABEL_PARENT: Record<TaskCategory, string> = {
  subitizing_678: '6・7・8の識別',
  numeral_quantity: '数字と量の対応',
  synthesis_5: '合成（5まで／10まで）',
  complement_10: '10の補数',
  carry_over: '繰り上がり',
  borrow: '繰り下がり',
};

export const MODE_LABEL_PARENT: Record<ModeId, string> = {
  mode_a_parity: 'A 偶奇パズル',
  mode_b_rods: 'B カラーロッド',
  mode_c_tenframe: 'C 10フレーム',
  mode_d_exchange: 'D 両替商',
};

export const STAGE_LABEL_PARENT: Record<LearningStage, string> = {
  explore: '自由探索',
  observe: '観察',
  predict: '予測',
  construct: '本課題',
  transfer: '表現横断',
  revisit: '後日再確認',
};
