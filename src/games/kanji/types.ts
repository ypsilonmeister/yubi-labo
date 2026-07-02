// SPEC §6.3 漢字データスキーマ（meaningAudioKey は TTS 直読みのため storyText で代替）

export interface KanjiZone {
  x: number;
  y: number;
  w: number;
  h: number; // 完成枠内の正規化位置 (0-1)
}

export interface KanjiPart {
  glyph: string; // 単体表示可能な1文字（例 "木", "亻", "⺾"）
  zone: KanjiZone;
  spokenName: string; // "にんべん" "き" など音声ヒント用
}

export interface KanjiEntry {
  id: string;
  char: string;
  reading: string; // 音声用よみ
  storyText: string; // 成り立ちの言語化（音声原稿）
  grade: 1 | 2;
  meaningEmoji: [string, string]; // 意味アニメ: クロスフェード前→後
  parts: KanjiPart[]; // 組み立て順 = シーケンス提示順
}

export interface KanjiMetrics {
  char: string;
  level: 1 | 2 | 3;
  misplacements: number;
  hintUsed: boolean;
  firstComplete: boolean;
  recallCorrect?: boolean;
  [key: string]: unknown;
}

// SPEC §6.4 難易度段階ごとの進行状況（漢字ごとに独立）
export interface KanjiProgress {
  level: 1 | 2 | 3;
  completions: number;
  mastered: boolean; // Lv3をノーヒント完成 = 図鑑で金の分子マーク
  recallStar: boolean; // 想起チェック正解 = ✨
  dueAt: number; // 間隔反復の再出題時刻
}

export const SNAP_RADIUS = 80; // SPEC §6.2-3
export const HINT_AFTER_MISSES = 3;
export const RECALL_EVERY = 3; // 3問に1回
// 間隔反復: 最終正解から 1日→3日→7日（SPEC §6.4）
export const REVIEW_INTERVALS_MS = [1, 3, 7].map((d) => d * 24 * 60 * 60 * 1000);
