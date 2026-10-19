import type { AccessibilitySettings, LearningSettings } from './types';

export const DEFAULT_SETTINGS: AccessibilitySettings = {
  quietMode: false,
  soundEnabled: false, // §8.2: 音は初期OFF
  reducedMotion: false,
  inputMethod: 'tap',
  showEquationOnRequest: true,
  highlightEmptySlots: true,
  animationSpeed: 'normal',
  effectLevel: 'calm',
  colorScheme: 'cuisenaire',
  tenFrameFill: 'pairs',
  carryFirstOperand: 'larger',
  borrowStrategy: 'subtract_from_ten',
  fiveToken: false,
  directManipulation: true,
  rodGrid: true,
  numberLabels: true,
};

export const DEFAULT_LEARNING: LearningSettings = {
  choiceCount: 3,
  synthesisMax: 5,
  minTrialsForComparison: 10, // §7.4 の暫定値
  minDaysForComparison: 3,
  idleThresholdMs: 10000,
  selfReportEnabled: false, // §8.5: 初期OFF
  craftBookEnabled: true,
  scoreEnabled: true,
  roundLength: 10,
  freeChoice: false,
};

export function osPrefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 実際に動きを抑えるか（設定 or OS） */
export function motionReduced(s: Readonly<AccessibilitySettings>): boolean {
  return s.reducedMotion || osPrefersReducedMotion();
}

/** アニメーション時間の倍率。0 は「動かさず状態だけ切り替える」 */
export function durationFactor(s: Readonly<AccessibilitySettings>): number {
  if (motionReduced(s) || s.animationSpeed === 'instant') return 0;
  return s.animationSpeed === 'slow' ? 2 : 1;
}

/** quietMode は演出を calm 以下に抑える（§8.2） */
export function effectiveEffect(s: Readonly<AccessibilitySettings>): AccessibilitySettings['effectLevel'] {
  if (s.quietMode && s.effectLevel === 'normal') return 'calm';
  return s.effectLevel;
}
