// 課題・モードの一覧（実行時に使う唯一の一覧）。registry の登録検証と、インポートの検証が同じものを見る。
// 新しい課題・モードを足したら、ここにも足す（足し忘れると、その記録を含むバックアップを読み込めない）。

import type { ModeId, TaskCategory } from './types';

export const ALL_TASKS: readonly TaskCategory[] = [
  'subitizing_678',
  'numeral_quantity',
  'synthesis_5',
  'complement_10',
  'carry_over',
  'borrow',
  'arrays',
  'balance',
  'doubling',
  'period',
  'halving',
  'shapes',
  'shape_right',
  'shape_triangle',
  'shape_rectangle',
  'array_multiply',
  'array_divide',
  'array_split',
  'carry_2d1',
  'borrow_2d1',
  'carry_2d2',
  'borrow_2d2',
  'array_divide_rem',
  'shape_square',
  'shape_isosceles',
  'shape_area',
];

export const ALL_MODES: readonly ModeId[] = [
  'mode_a_parity',
  'mode_b_rods',
  'mode_c_tenframe',
  'mode_d_exchange',
  'mode_e_tiles',
  'mode_f_seesaw',
  'mode_g_doubling',
  'mode_h_trains',
  'mode_i_halving',
  'mode_j_geoboard',
  'mode_k_shapemake',
  'mode_l_arrays',
];
