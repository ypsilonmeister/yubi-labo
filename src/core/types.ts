// SPEC §10 / §11.1 の契約。名前・形はできるだけ仕様書どおりに保つ。
// 仕様からの拡張は「実装拡張」とコメントし、docs/SPEC.md §17 にも記載する。

export type TaskCategory =
  | 'subitizing_678'
  | 'numeral_quantity'
  | 'synthesis_5'
  | 'complement_10'
  | 'carry_over'
  | 'borrow'
  // 実装拡張（v2.3・§19 じっけんラボ）
  | 'arrays'
  | 'balance'
  | 'doubling'
  | 'period';

export type ModeId =
  | 'mode_a_parity'
  | 'mode_b_rods'
  | 'mode_c_tenframe'
  | 'mode_d_exchange'
  // 実装拡張（v2.3・§19 じっけんラボ）
  | 'mode_e_tiles'
  | 'mode_f_seesaw'
  | 'mode_g_doubling'
  | 'mode_h_trains';

// 実装拡張: "construct"（本課題）。§9.0 の表で「本課題・transfer」とされる決定点を、
// 初回の表現で行う段階として明示する。transfer / revisit は同じ決定点を別表現・別日に行う。
export type LearningStage = 'explore' | 'observe' | 'predict' | 'construct' | 'transfer' | 'revisit';

export type Operation = 'identify' | 'match' | 'compose' | 'complement' | 'add' | 'subtract' | 'arrange' | 'balance' | 'scale' | 'cycle';

export type Strategy = 'none' | 'make_ten' | 'subtract_from_ten' | 'subtract_subtract' | 'count_up';

export interface Question {
  id: string; // 同一の数量関係なら表現が違っても同じID
  taskType: TaskCategory;
  operation: Operation;
  operands: number[]; // 引き算は [被減数, 減数] の順
  expectedValue: number | null; // explore では null
  representation: ModeId;
  strategy: Strategy;
  distractors: number[]; // 主な決定点の選択肢として出すダミー
  difficulty: number;
  variantId: string;
  learningStage: LearningStage;
}

export interface AccessibilitySettings {
  quietMode: boolean;
  soundEnabled: boolean;
  reducedMotion: boolean;
  inputMethod: 'tap' | 'drag';
  showEquationOnRequest: boolean;
  highlightEmptySlots: boolean;
  animationSpeed: 'slow' | 'normal' | 'instant';
  effectLevel: 'none' | 'calm' | 'normal';
  colorScheme: 'cuisenaire' | 'unified' | 'mono';
  tenFrameFill: 'pairs' | 'fives';
  carryFirstOperand: 'larger' | 'first';
  borrowStrategy: 'subtract_from_ten' | 'subtract_subtract';
  fiveToken: boolean;
  /** 実装拡張（v2.2）: 手札で選んで置き先をタップする代わりに、1タップで置き先へ吸い込む／ちぎる位置をタップする */
  directManipulation: boolean;
  /** 実装拡張（v2.2・§18.6）: いろぼうに目盛り線と1ずつの区切り（5は太く）を描く */
  rodGrid: boolean;
  /** 実装拡張（v2.4・§20・本人の希望）: むれ・へや・手札に数字のふだを出す */
  numberLabels: boolean;
}

// 実装拡張: 出題・分析まわりの保護者設定（AccessibilitySettings とは別に保存）
export interface LearningSettings {
  choiceCount: 2 | 3 | 4;
  synthesisMax: 5 | 10;
  minTrialsForComparison: number;
  minDaysForComparison: number;
  idleThresholdMs: number;
  selfReportEnabled: boolean;
  craftBookEnabled: boolean;
  /** 実装拡張（v2.2・保護者判断）: てんすう・ランク・ラウンド・植物の成長を子ども画面に出す */
  scoreEnabled: boolean;
  /** 1ラウンドの問題数 */
  roundLength: 5 | 10 | 15;
  /** ホームから課題・段階を自分で選べるようにする（初期OFF＝モードをタップするとすぐ始まる） */
  freeChoice: boolean;
}

export type GameEventType =
  | 'question_shown'
  | 'input_enabled'
  | 'input_disabled'
  | 'item_selected'
  | 'item_deselected'
  | 'attempt'
  | 'undo'
  | 'prediction_made'
  | 'decision_made'
  | 'hint_requested'
  | 'animation_started'
  | 'animation_ended'
  | 'paused'
  | 'resumed'
  | 'visibility_hidden'
  | 'visibility_visible'
  | 'settings_changed'
  | 'completed'
  | 'skipped'
  | 'abandoned';

export interface GameEvent {
  type: GameEventType;
  timestampMs: number;
  payload?: Record<string, unknown>;
}

export type AssistanceLevel = 'independent' | 'after_hint' | 'after_demo' | 'not_completed';

export interface TrialResult {
  outcome: 'completed' | 'skipped' | 'abandoned' | 'explored';
  assistanceLevel: AssistanceLevel;
  correctWithoutHint: boolean;
  mistakeCount: number;
  hintCount: number;
  maxHintLevel: 0 | 1 | 2 | 3;
}

export interface GameContext {
  emit(event: Omit<GameEvent, 'timestampMs'>): void;
  complete(result: TrialResult): void;
  /** 実装拡張: クラフト図鑑への記録（§8.5）。図鑑OFFなら何もしない。kind は v2.3 の発見の種類（省略時は sum） */
  craft(value: number, parts: number[], kind?: CraftKind): void;
  settings: Readonly<AccessibilitySettings>;
  learning: Readonly<LearningSettings>;
}

export interface GameModePlugin {
  id: ModeId;
  title: string;
  description: string;
  supportedTasks: TaskCategory[];
  supportedStages: LearningStage[];
  supportedStrategies: Strategy[];
  /** 実装拡張: 課題ごとに選べる段階（explore はモード単位なので含めない） */
  stagesFor(task: TaskCategory): LearningStage[];
  /** 実装拡張（v2.3）: ホームでの段。lab は「じっけんラボ」 */
  group?: 'core' | 'lab';
  mount(container: HTMLElement, context: GameContext): void;
  loadQuestion(question: Question): void;
  showHint(level: 1 | 2 | 3): void;
  undo(): void;
  pause(): void;
  resume(): void;
  applySettings(settings: Readonly<AccessibilitySettings>): void;
  destroy(): void;
}

export type TimeOfDay = 'morning' | 'midday' | 'evening' | 'night';

export interface Session {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  timeOfDay: TimeOfDay;
  endReason?: 'child_chose_end' | 'parent_ended' | 'app_closed' | 'unknown';
  trials: Trial[];
  childSelfReport?: 'good' | 'so_so' | 'tough' | 'no_answer';
  parentObservation?: {
    enjoyment?: 'positive' | 'neutral' | 'negative' | 'unknown';
    conditionNote?: string;
    note?: string;
  };
}

export interface Trial {
  trialId: string;
  orderInSession: number;
  modeId: ModeId;
  question: Question;
  settingsSnapshot: AccessibilitySettings;
  events: GameEvent[];
  result?: TrialResult;
  /** 実装拡張: 試行の開始時刻（オフセット付きISO8601）と時間帯 */
  startedAt?: string;
  timeOfDay?: TimeOfDay;
  /** 実装拡張（v2.2）: ラウンド（既定10問）の識別子。ラウンド外の試行にはない */
  roundId?: string;
}

/**
 * 実装拡張（v2.3）: 図鑑に残る発見の種類。
 * sum: parts を合わせた（v2.1 から）／product: parts=[行, 列] の長方形／prime: 1列にしか並ばない石（parts=[n]）／
 * balance: 釣り合い（parts は 左の重り…, 0, 右の重り…）／power: parts=[倍率, 日数]／fraction: value=1 を parts=[いくつに] わけた／
 * period: parts=[a, b] の列車の端がそろった
 */
export type CraftKind = 'sum' | 'product' | 'prime' | 'balance' | 'power' | 'fraction' | 'period';

export interface CraftEntry {
  value: number;
  parts: number[];
  kind?: CraftKind;
  firstMadeAt: string;
  modeId: ModeId;
}

export interface AppData {
  schemaVersion: '2.1';
  profile: {
    playerLabel: string;
    settings: AccessibilitySettings;
    learning?: LearningSettings; // 実装拡張
    /** 実装拡張（v2.5）: 点の付け方を変えたときの基準点（それまでの点が下がらないように。score.ts） */
    scoreBaseline?: { points: number; at: string };
  };
  sessions: Session[];
  craftBook?: CraftEntry[];
}
