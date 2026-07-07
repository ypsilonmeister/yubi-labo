// SPEC §5.4 レベルスキーマ / §5.3 判定パラメータ / §12.3-12.4 v1.1拡張

export interface MazeLevel {
  id: string;
  path: [number, number][]; // 通路中心のポリライン（論理座標）
  width: number; // 通路の全幅(px)
  stops: number[]; // ストップポイント位置（弧長の割合 0-1）
  theme: 'soil' | 'rock' | 'water';
  holdRadius?: number; // レベル別ホールド半径（省略時 HOLD_RADIUS_TOUCH。ハンド時は HOLD_RADIUS_HAND で下支え）
  branches?: [number, number][][]; // 行き止まり枝（SPEC §12.4。通路判定のみ合算、進捗は主経路のみ）
  memory?: { previewGraceMs: number; echoMs: number }; // 記憶レベル（SPEC §12.4）
}

export interface MazeMetrics {
  outRatio: number; // 通路外時間 / 総時間（本人には見せない）
  stopsCompleted: number;
  stopsTotal: number;
  widthUsed: number; // 自動救済適用後の実効幅
  levelIndex: number;
  skill: number; // 上方適応の実力推定（SPEC §12.3）
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

// 上方適応（SPEC §12.3）: クリーンクリアで skill+1、高はみ出しで -1。
// 実効幅 = max(width - skill*SKILL_WIDTH_STEP + reliefBonus, 入力別最小幅)。
export const SKILL_MAX = 5;
export const SKILL_WIDTH_STEP = 4;
export const CLEAN_OUT_RATIO = 0.1;
