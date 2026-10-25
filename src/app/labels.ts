import type { LearningStage, ModeId, TaskCategory } from '../core/types';

// 子ども向けの表示名（ひらがな）。事実の描写だけにする（§8.2）
export const TASK_LABEL: Record<TaskCategory, string> = {
  subitizing_678: 'かたち みわけ',
  numeral_quantity: 'すうじと かたち',
  synthesis_5: 'あわせて つくる',
  complement_10: '10を つくる',
  carry_over: 'あふれて 10',
  borrow: '10を ひらく',
  arrays: 'ならべる',
  balance: 'つりあわせる',
  doubling: 'ふえる・わける',
  period: 'れっしゃ',
  halving: 'はんぶん',
  shapes: 'かたち づくり',
  shape_right: 'まっすぐな かど',
  shape_triangle: 'さんかく',
  shape_rectangle: 'ちょうほうけい',
  array_multiply: 'いくつ ある',
  array_divide: 'わけて ならべる',
  array_split: '10と のこり',
  carry_2d1: '2けたで あふれて 10',
  borrow_2d1: '2けたで 10を ひらく',
  carry_2d2: '2けた どうしで あふれて 10',
  borrow_2d2: '2けた どうしで 10を ひらく',
};

export function taskLabel(task: TaskCategory, mode: ModeId): string {
  if (task === 'borrow' && mode === 'mode_d_exchange') return 'おかいもの';
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
  arrays: '長方形・約数・素数（探索）',
  balance: '釣り合い（等号）',
  doubling: '倍と半分（探索）',
  period: '周期・公倍数（探索）',
  halving: '4けたから半分（連続）',
  shapes: '図形（直角・三角形・四角形・探索）',
  shape_right: '直角だけの形をつくる',
  shape_triangle: '三角形をつくる',
  shape_rectangle: '長方形をつくる',
  array_multiply: '掛け算（タイルの配列）',
  array_divide: '割り算（割り切れる）',
  array_split: '2けた×1けた（10と残りに分ける）',
  carry_2d1: '2けた＋1けたの繰り上がり',
  borrow_2d1: '2けた−1けたの繰り下がり',
  carry_2d2: '2けた＋2けたの繰り上がり',
  borrow_2d2: '2けた−2けたの繰り下がり',
};

export const MODE_LABEL_PARENT: Record<ModeId, string> = {
  mode_a_parity: 'A 偶奇パズル',
  mode_b_rods: 'B カラーロッド',
  mode_c_tenframe: 'C 10フレーム',
  mode_d_exchange: 'D 両替商',
  mode_e_tiles: 'E タイル・リアクター',
  mode_f_seesaw: 'F シーソー',
  mode_g_doubling: 'G ばいばいラボ',
  mode_h_trains: 'H ぼうの れっしゃ',
  mode_i_halving: 'I はんぶんチャレンジ',
  mode_j_geoboard: 'J ジオボード',
  mode_k_shapemake: 'K かたちづくり',
  mode_l_arrays: 'L タイルの かけわり',
};

export const STAGE_LABEL_PARENT: Record<LearningStage, string> = {
  explore: '自由探索',
  observe: '観察',
  predict: '予測',
  construct: '本課題',
  transfer: '表現横断',
  revisit: '後日再確認',
};
