import type { AssistanceLevel, TrialResult } from '../../core/types';

/** §9.0: L1・L2 の後の正答は after_hint、L3（実演）の後は after_demo */
export function assistanceOf(solved: boolean, maxHintLevel: number): AssistanceLevel {
  if (!solved) return 'not_completed';
  if (maxHintLevel >= 3) return 'after_demo';
  if (maxHintLevel >= 1) return 'after_hint';
  return 'independent';
}

export function makeResult(o: { solved: boolean; mistakeCount: number; hintCount: number; maxHintLevel: number }): TrialResult {
  const assistanceLevel = assistanceOf(o.solved, o.maxHintLevel);
  return {
    outcome: 'completed',
    assistanceLevel,
    correctWithoutHint: o.solved && assistanceLevel === 'independent',
    mistakeCount: o.mistakeCount,
    hintCount: o.hintCount,
    maxHintLevel: Math.min(3, o.maxHintLevel) as 0 | 1 | 2 | 3,
  };
}

export function exploredResult(): TrialResult {
  return { outcome: 'explored', assistanceLevel: 'not_completed', correctWithoutHint: false, mistakeCount: 0, hintCount: 0, maxHintLevel: 0 };
}
