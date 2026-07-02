// SPEC §5.4 レベルスキーマ / §5.3 判定パラメータ

export interface MazeLevel {
  id: string;
  path: [number, number][]; // 通路中心のポリライン（論理座標）
  width: number; // 通路の全幅(px)
  stops: number[]; // ストップポイント位置（弧長の割合 0-1）
  theme: 'soil' | 'rock' | 'water';
}

export interface MazeMetrics {
  outRatio: number; // 通路外時間 / 総時間（本人には見せない）
  stopsCompleted: number;
  stopsTotal: number;
  widthUsed: number; // 自動救済適用後の実効幅
  levelIndex: number;
  [key: string]: unknown;
}

// 判定パラメータ（SPEC §5.3）
export const HOLD_RADIUS_TOUCH = 45;
export const HOLD_RADIUS_HAND = 60;
export const HOLD_DURATION_MS = 3000;
export const MIN_WIDTH_TOUCH = 40;
export const MIN_WIDTH_HAND = 70;
export const STUCK_ASSIST_MS = 90_000; // SPEC §8
export const RELIEF_WIDTH_BONUS = 20; // SPEC §5.4 自動救済
export const RELIEF_OUT_RATIO = 0.35;
