// SPEC §7 モードC「もじさがし」型定義（デコーディング自動化）。
// ひらがな/カタカナ/漢字は本モードの学習内容そのものなので、
// 子ども画面への文字表示は §2 テキストレスUI原則の明示的な例外（§7.2）。

export type MojiKind = 'hiragana' | 'katakana' | 'kanji';

export interface MojiChar {
  char: string; // 画面に出す・答えになる文字（漢字も可）
  reading: string; // 音声で読む「音」（ひらがなは字＝音、カタカナ/漢字はその読み）
  kind: MojiKind;
}

// §7.3 記録メトリクス
export interface MojiMetrics {
  char: string;
  correct: boolean; // 初回タップで正解したか
  reactionMs: number; // 出題音声〜正解タップまで
  distractors: string[];
  stage: number;
  cardCount: number;
  challenge: boolean;
  word?: string; // ことばモード（SPEC §12.6）
  steps?: number; // 単語の文字数
  [key: string]: unknown;
}

export interface MojiCharStat {
  attempts: number;
  correct: number;
  reactionSum: number;
}

// 永続化（IndexedDB progress, key 'moji.progress'）
export interface MojiProgress {
  stage: number; // 出題段階 0-9（§7.3 / §12.6）
  setsCompleted: number; // ききとりセット完了数（星コレクション＆チャレンジ解禁）
  stars: number; // 集めた星の数（コレクション）
  challengeBest: number; // チャレンジ自己ベスト（枚数、旧: 互換のため保持）
  challengeBestByStage?: Record<number, number>; // §12.6 段階別ベスト
  charStats: Record<string, MojiCharStat>;
}

export const QUESTIONS_PER_SET = 8; // §7.2-4 8問で1セット
export const MIN_CARDS = 4; // §7.2-1 / §7.3
export const MAX_CARDS = 9;
export const WORD_MAX_CARDS = 12; // §12.6 単語ステージのカード上限
export const START_CARDS = 5;

export const CHALLENGE_MS = 60_000; // §7.4 60秒
export const SETS_TO_UNLOCK_CHALLENGE = 3; // §7.4 3セットで⚡出現

export const STUCK_MS = 90_000; // §8 90秒停滞→半自動化（正解カードがゆっくり点滅）
export const SLOW_SEARCH_MS = 20_000; // §8 苦戦兆候: 探索20秒超
export const SLOW_SEARCH_STREAK = 3; // §8 同一文字3回連続の遅延で易化

export const LOW_ACC_THRESHOLD = 0.6; // §7.3 正答率<60%→出題頻度up・4枚に
export const HIGH_ACC_THRESHOLD = 0.9; // §7.3 >90%かつ速い→間引く
export const RECENT_WINDOW = 20; // §7.3 直近20問で適応
