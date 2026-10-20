import { describe, expect, it } from 'vitest';
import { POINTS, POINTS_V1, RANKS, legacyTotalPoints, nextRank, rankOf, ranking, roundsOf, totalPoints, trialPoints, trialPointsV1 } from '../core/score';
import { currentStep, stepMastered, stepsOf, type ModeShape } from '../core/engine/progression';
import { DEFAULT_SETTINGS } from '../core/settings';
import type { LearningStage, Session, TaskCategory, Trial, TrialResult } from '../core/types';

let seq = 0;
function trial(o: { task?: TaskCategory; stage?: LearningStage; result?: Partial<TrialResult> | null; roundId?: string; mode?: Trial['modeId']; left?: boolean }): Trial {
  const result: TrialResult | undefined =
    o.result === null
      ? undefined
      : { outcome: 'completed', assistanceLevel: 'independent', correctWithoutHint: true, mistakeCount: 0, hintCount: 0, maxHintLevel: 0, ...(o.result ?? {}) };
  return {
    trialId: `t${seq++}`,
    orderInSession: seq,
    modeId: o.mode ?? 'mode_c_tenframe',
    question: {
      id: 'q',
      taskType: o.task ?? 'carry_over',
      operation: 'add',
      operands: [8, 5],
      expectedValue: 13,
      representation: o.mode ?? 'mode_c_tenframe',
      strategy: 'make_ten',
      distractors: [2, 4],
      difficulty: 3,
      variantId: 'v',
      learningStage: o.stage ?? 'construct',
    },
    settingsSnapshot: DEFAULT_SETTINGS,
    // 本人が終わりまで進めた試行には finished の合図がある（left: 途中で離れた）
    events: o.left ? [] : [{ type: 'input_disabled', timestampMs: 1, payload: { reason: 'finished' } }],
    startedAt: '2026-10-17T10:00:00+09:00',
    ...(o.roundId ? { roundId: o.roundId } : {}),
    ...(result ? { result } : {}),
  };
}
const session = (trials: Trial[], startedAt = '2026-10-17T10:00:00+09:00'): Session => ({ sessionId: `s${seq++}`, startedAt, timeOfDay: 'morning', trials });

describe('てんすう（v2.5）', () => {
  it('1回目でぴったりが一番高く、ためしてから当たると低い。0より下にはならない', () => {
    expect(trialPoints(trial({}))).toBe(POINTS.firstTry);
    expect(trialPoints(trial({ result: { mistakeCount: 2 } }))).toBe(POINTS.foundByTrying);
    expect(trialPoints(trial({ result: { assistanceLevel: 'after_hint' } }))).toBe(POINTS.afterHintFirstTry);
    expect(trialPoints(trial({ result: { assistanceLevel: 'after_hint', mistakeCount: 3 } }))).toBe(POINTS.foundByTrying);
    expect(trialPoints(trial({ result: { assistanceLevel: 'after_demo' } }))).toBe(POINTS.afterDemo);
    expect(trialPoints(trial({ result: { assistanceLevel: 'not_completed', correctWithoutHint: false } }))).toBe(POINTS.tried);
    expect(trialPoints(trial({ result: { outcome: 'skipped', assistanceLevel: 'not_completed' } }))).toBe(0);
    expect(trialPoints(trial({ result: { outcome: 'abandoned', assistanceLevel: 'not_completed' } }))).toBe(0);
    expect(trialPoints(trial({ result: null }))).toBe(0);
    expect(POINTS.firstTry).toBeGreaterThan(POINTS.foundByTrying);
  });

  it('前の付け方（v2.2〜v2.4）では、ためしてから当たっても満点だった', () => {
    expect(trialPointsV1(trial({ result: { mistakeCount: 5 } }))).toBe(POINTS_V1.independent);
  });

  it('観察は見おわると少し、別の世界でも1回目でぴったりならおまけ', () => {
    expect(trialPoints(trial({ stage: 'observe', result: { outcome: 'explored', assistanceLevel: 'not_completed' } }))).toBe(POINTS.observed);
    expect(trialPoints(trial({ stage: 'explore', result: { outcome: 'explored', assistanceLevel: 'not_completed' } }))).toBe(0);
    // 途中で離れた観察は点にならない
    expect(trialPoints(trial({ stage: 'observe', left: true, result: { outcome: 'explored', assistanceLevel: 'not_completed' } }))).toBe(0);
    expect(trialPoints(trial({ stage: 'transfer' }))).toBe(POINTS.firstTry + POINTS.transferBonus);
    expect(trialPoints(trial({ stage: 'transfer', result: { mistakeCount: 1 } }))).toBe(POINTS.foundByTrying);
  });

  it('合計点は試行の点と図鑑の数から計算する（図鑑の点に上限はない）', () => {
    const book = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, parts: [i + 1], firstMadeAt: '2026-10-20T10:00:00+09:00', modeId: 'mode_e_tiles' as const, kind: 'prime' as const }));
    const data = { sessions: [session([trial({}), trial({ result: { assistanceLevel: 'after_hint' } })])], craftBook: book };
    expect(totalPoints(data)).toBe(POINTS.firstTry + POINTS.afterHintFirstTry + 12 * POINTS.newCraft);
  });

  it('基準点: 付け方を変える前の点は下がらず、それ以後の記録だけ新しい付け方で足す', () => {
    const before = trial({ result: { mistakeCount: 4 } }); // 2026-10-17
    const after = { ...trial({ result: { mistakeCount: 4 } }), startedAt: '2026-10-21T10:00:00+09:00' };
    const oldCraft = { value: 6, parts: [2, 3], firstMadeAt: '2026-10-17T10:00:00+09:00', modeId: 'mode_e_tiles' as const, kind: 'product' as const };
    const newCraft = { ...oldCraft, parts: [3, 2], firstMadeAt: '2026-10-21T10:00:00+09:00' };
    const before_ = { sessions: [session([before])], craftBook: [oldCraft] };
    const legacy = legacyTotalPoints(before_);
    expect(legacy).toBe(POINTS_V1.independent + POINTS_V1.newCraft);
    const baseline = { points: legacy, at: '2026-10-20T12:00:00+09:00' };
    // 基準点を作った直後は、点がそのまま
    expect(totalPoints(before_, baseline)).toBe(legacy);
    // そのあとの記録は v2.5 の点で足される
    const later = { sessions: [session([before, after])], craftBook: [oldCraft, newCraft] };
    expect(totalPoints(later, baseline)).toBe(legacy + POINTS.foundByTrying + POINTS.newCraft);
  });

  it('ランクは合計点で上がり、もりの先は ぎんが まで', () => {
    expect(rankOf(0).name).toBe('たね');
    expect(rankOf(29).level).toBe(0);
    expect(rankOf(30).level).toBe(1);
    expect(rankOf(2000).name).toBe('もり');
    expect(nextRank(2000)?.name).toBe('おおきな もり');
    expect(rankOf(999999).name).toBe('ぎんが');
    expect(nextRank(0)?.min).toBe(30);
    expect(nextRank(999999)).toBeNull();
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].min).toBeGreaterThan(RANKS[i - 1].min);
  });

  it('ラウンド: 中断した試行は数えず、さいごまでやったラウンドだけがランキングに入る', () => {
    const full = Array.from({ length: 10 }, (_, i) => trial({ roundId: 'r1', result: i < 8 ? {} : { assistanceLevel: 'after_hint' } }));
    const short = [trial({ roundId: 'r2' }), trial({ roundId: 'r2', result: { outcome: 'abandoned', assistanceLevel: 'not_completed' } })];
    const best = Array.from({ length: 10 }, () => trial({ roundId: 'r3' }));
    const sessions = [session([...full, ...short]), session(best, '2026-10-18T10:00:00+09:00')];
    const rounds = roundsOf(sessions);
    expect(rounds.find((r) => r.roundId === 'r1')).toMatchObject({ count: 10, points: 8 * POINTS.firstTry + 2 * POINTS.afterHintFirstTry });
    expect(rounds.find((r) => r.roundId === 'r2')).toMatchObject({ count: 1 });
    expect(ranking(sessions, 10).map((r) => r.roundId)).toEqual(['r3', 'r1']);
  });

  it('ラウンド: 基準点より前のラウンドは前の付け方の点で残る', () => {
    const guessed = Array.from({ length: 10 }, () => trial({ roundId: 'old', result: { mistakeCount: 2 } }));
    const sessions = [session(guessed)];
    expect(roundsOf(sessions, { points: 0, at: '2026-10-20T00:00:00+09:00' })[0].points).toBe(10 * POINTS_V1.independent);
    expect(roundsOf(sessions)[0].points).toBe(10 * POINTS.foundByTrying);
  });
});

describe('おまかせ進行・適応型スキップ（v2.2）', () => {
  const C: ModeShape = {
    id: 'mode_c_tenframe',
    supportedTasks: ['complement_10', 'carry_over'],
    stagesFor: (t) => (t === 'complement_10' ? ['predict', 'construct'] : ['observe', 'predict', 'construct']),
  };

  it('ステップは課題の順に 観察→予測→本課題', () => {
    expect(stepsOf(C)).toEqual([
      { task: 'complement_10', stage: 'predict' },
      { task: 'complement_10', stage: 'construct' },
      { task: 'carry_over', stage: 'observe' },
      { task: 'carry_over', stage: 'predict' },
      { task: 'carry_over', stage: 'construct' },
    ]);
  });

  it('ヒントなし・間違いなしで2回続けて解けたら次のステップへ', () => {
    const t = (o: Parameters<typeof trial>[0]) => trial({ task: 'complement_10', stage: 'predict', ...o });
    expect(currentStep(C, [t({})])).toEqual({ task: 'complement_10', stage: 'predict' });
    expect(currentStep(C, [t({}), t({})])).toEqual({ task: 'complement_10', stage: 'construct' });
  });

  it('ヒント・間違い・スキップが間にあると、続けてとは数えない', () => {
    const t = (o: Parameters<typeof trial>[0]) => trial({ task: 'complement_10', stage: 'predict', ...o });
    expect(stepMastered({ task: 'complement_10', stage: 'predict' }, [t({}), t({ result: { assistanceLevel: 'after_hint' } }), t({})])).toBe(false);
    expect(stepMastered({ task: 'complement_10', stage: 'predict' }, [t({}), t({ result: { mistakeCount: 1 } }), t({})])).toBe(false);
    expect(stepMastered({ task: 'complement_10', stage: 'predict' }, [t({}), t({ result: { outcome: 'skipped', assistanceLevel: 'not_completed' } }), t({})])).toBe(false);
  });

  it('途中で離れた試行（abandoned）は間に入っても数えない', () => {
    const t = (o: Parameters<typeof trial>[0]) => trial({ task: 'complement_10', stage: 'predict', ...o });
    expect(stepMastered({ task: 'complement_10', stage: 'predict' }, [t({}), t({ result: { outcome: 'abandoned', assistanceLevel: 'not_completed' } }), t({})])).toBe(true);
  });

  it('観察は1回見れば済む。後日再確認は本課題として数える。ほかのモードの記録は数えない', () => {
    const done = [
      trial({ task: 'complement_10', stage: 'predict' }),
      trial({ task: 'complement_10', stage: 'predict' }),
      trial({ task: 'complement_10', stage: 'construct' }),
      trial({ task: 'complement_10', stage: 'revisit' }),
    ];
    expect(currentStep(C, done)).toEqual({ task: 'carry_over', stage: 'observe' });
    const left = [...done, trial({ task: 'carry_over', stage: 'observe', left: true, result: { outcome: 'explored', assistanceLevel: 'not_completed' } })];
    expect(currentStep(C, left)).toEqual({ task: 'carry_over', stage: 'observe' });
    const observed = [...done, trial({ task: 'carry_over', stage: 'observe', result: { outcome: 'explored', assistanceLevel: 'not_completed' } })];
    expect(currentStep(C, observed)).toEqual({ task: 'carry_over', stage: 'predict' });
    const other = [...observed, trial({ mode: 'mode_d_exchange', stage: 'predict' }), trial({ mode: 'mode_d_exchange', stage: 'predict' })];
    expect(currentStep(C, other)).toEqual({ task: 'carry_over', stage: 'predict' });
  });

  it('全部済んだら、最後の本課題をくり返す', () => {
    const all = stepsOf(C).flatMap((s) => [trial({ task: s.task, stage: s.stage, result: s.stage === 'observe' ? { outcome: 'explored', assistanceLevel: 'not_completed' } : {} }), trial({ task: s.task, stage: s.stage })]);
    expect(currentStep(C, all)).toEqual({ task: 'carry_over', stage: 'construct' });
  });
});
