import { beforeAll, describe, expect, it } from 'vitest';
import { buildQuestion, decisionValue, generateQuestion, retarget, validateQuestion } from '../core/engine/questions';
import { computeMetrics } from '../core/engine/metrics';
import { DEFAULT_LEARNING, DEFAULT_SETTINGS } from '../core/settings';
import type { GameEvent, LearningStage, ModeId, TaskCategory, Trial } from '../core/types';
import { hasSameParityDistractor } from '../core/math/choices';

const MODES: Record<ModeId, TaskCategory[]> = {
  mode_a_parity: ['subitizing_678', 'numeral_quantity', 'synthesis_5', 'complement_10'],
  mode_b_rods: ['subitizing_678', 'synthesis_5', 'complement_10'],
  mode_c_tenframe: ['complement_10', 'carry_over', 'borrow'],
  mode_d_exchange: ['carry_over', 'borrow'],
  mode_e_tiles: [],
  mode_f_seesaw: ['balance'],
  mode_g_doubling: [],
  mode_h_trains: [],
  mode_i_halving: ['halving'],
  mode_j_geoboard: [],
};

describe('出題エンジン（§9.0・§10）', () => {
  it('どの課題・段階・選択肢数でも、出題前の検証を通る', () => {
    for (const choiceCount of [2, 3, 4] as const)
      for (const [mode, tasks] of Object.entries(MODES) as [ModeId, TaskCategory[]][])
        for (const task of tasks)
          for (const stage of ['observe', 'predict', 'construct'] as const)
            for (let i = 0; i < 60; i++) {
              const q = generateQuestion({
                task,
                mode,
                stage,
                settings: DEFAULT_SETTINGS,
                learning: { ...DEFAULT_LEARNING, choiceCount, synthesisMax: i % 2 ? 10 : 5 },
                pick: { recentIds: [], priorDayIds: new Set() },
              });
              expect(validateQuestion(q)).toEqual([]);
              expect(q.distractors.length + 1).toBe(choiceCount);
            }
  });

  it('受け入れテスト13: 識別課題の選択肢に同じ偶奇の数が必ず含まれる', () => {
    for (let i = 0; i < 300; i++) {
      const q = generateQuestion({ task: 'subitizing_678', mode: 'mode_a_parity', stage: 'construct', settings: DEFAULT_SETTINGS, learning: { ...DEFAULT_LEARNING, choiceCount: 2 }, pick: { recentIds: [], priorDayIds: new Set() } });
      expect(hasSameParityDistractor(q.operands[0], q.distractors)).toBe(true);
    }
  });

  it('同偶奇のダミーがない識別課題は検証で弾く', () => {
    const q = buildQuestion('subitizing_678', [7], 'mode_a_parity', 'construct', DEFAULT_SETTINGS, DEFAULT_LEARNING);
    expect(validateQuestion({ ...q, distractors: [6, 8] })).toContain('識別課題に同偶奇のダミーがない');
  });

  it('範囲外の繰り上がり・繰り下がりは検証で弾く', () => {
    const q = buildQuestion('carry_over', [8, 5], 'mode_c_tenframe', 'construct', DEFAULT_SETTINGS, DEFAULT_LEARNING);
    expect(validateQuestion({ ...q, operands: [5, 4], expectedValue: 9 }).length).toBeGreaterThan(0);
    const r = buildQuestion('borrow', [13, 5], 'mode_c_tenframe', 'construct', DEFAULT_SETTINGS, DEFAULT_LEARNING);
    expect(validateQuestion({ ...r, operands: [15, 3], expectedValue: 12 }).length).toBeGreaterThan(0);
  });

  it('§9.5 表現横断: ID・operands・expectedValue を保ち、表現と方略だけ変える', () => {
    const q = buildQuestion('borrow', [13, 5], 'mode_c_tenframe', 'construct', DEFAULT_SETTINGS, DEFAULT_LEARNING);
    const t = retarget(q, 'mode_d_exchange', DEFAULT_SETTINGS, DEFAULT_LEARNING);
    expect(t.id).toBe(q.id);
    expect(t.operands).toEqual(q.operands);
    expect(t.expectedValue).toBe(8);
    expect(t.representation).toBe('mode_d_exchange');
    expect(t.learningStage).toBe('transfer');
    expect(q.strategy).toBe('subtract_from_ten');
    expect(t.strategy).toBe('count_up');
    expect(validateQuestion(t)).toEqual([]);
  });

  it('前日以前に解いた問題は、ときどき revisit として出る', () => {
    const prior = new Set(['complement_10:3']);
    let seen = false;
    let i = 0;
    const rng = () => [0.1, 0.0, 0.5][i++ % 3];
    for (let k = 0; k < 10 && !seen; k++) {
      const q = generateQuestion({ task: 'complement_10', mode: 'mode_a_parity', stage: 'construct', settings: DEFAULT_SETTINGS, learning: DEFAULT_LEARNING, pick: { recentIds: [], priorDayIds: prior }, rng });
      if (q.learningStage === 'revisit') {
        expect(q.id).toBe('complement_10:3');
        seen = true;
      }
    }
    expect(seen).toBe(true);
  });

  it('予測と本課題で、決める値が変わる（合成）', () => {
    const base = { taskType: 'synthesis_5' as TaskCategory, operands: [2, 3], representation: 'mode_a_parity' as ModeId };
    expect(decisionValue({ ...base, learningStage: 'predict' as LearningStage })).toBe(5);
    expect(decisionValue({ ...base, learningStage: 'construct' as LearningStage })).toBe(3);
  });
});

describe('§11.2 指標', () => {
  const ev = (type: GameEvent['type'], t: number): GameEvent => ({ type, timestampMs: t });
  it('アニメーション中・非表示中・ポーズ中は数えない', () => {
    const events = [
      ev('question_shown', 0),
      ev('input_enabled', 100),
      ev('visibility_hidden', 300),
      ev('visibility_visible', 5300), // 5秒の非表示は除く
      ev('item_selected', 1000 + 5000), // 有効時間: 200 + 700 = 900
      ev('input_disabled', 6200),
      ev('animation_started', 6200),
      ev('animation_ended', 7200),
      ev('input_enabled', 7200),
      ev('paused', 7400),
      ev('resumed', 9400),
      ev('decision_made', 9600),
      ev('completed', 9600),
    ];
    const m = computeMetrics(events, 10000);
    expect(m.firstActionLatencyMs).toBe(900);
    expect(m.animationDurationMs).toBe(1000);
    // 100→300 (200) + 5300→6200 (900) + 7200→7400 (200) + 9400→9600 (200)
    expect(m.activeInteractionMs).toBe(1500);
    expect(m.idleDurationMs).toBe(0);
  });
  it('閾値を超えた無操作だけを idle に数える', () => {
    const events = [ev('input_enabled', 0), ev('item_selected', 3000), ev('attempt', 15000), ev('completed', 15500)];
    expect(computeMetrics(events, 10000).idleDurationMs).toBe(12000);
  });
  it('入力がなければ firstActionLatencyMs は null', () => {
    expect(computeMetrics([ev('input_enabled', 0), ev('abandoned', 500)], 10000).firstActionLatencyMs).toBeNull();
  });
});

// ---------- SessionEngine（DOM を最小限だけ用意する） ----------

describe('SessionEngine', () => {
  beforeAll(() => {
    const target = { addEventListener() {}, removeEventListener() {}, hidden: false };
    Object.assign(globalThis, { document: target, window: target });
  });

  it('complete() は各問1回のみ有効。時刻はエンジンが付与し単調増加', async () => {
    const { SessionEngine } = await import('../core/engine/SessionEngine');
    const saved: unknown[] = [];
    const store = { saveSession: (s: unknown) => saved.push(s), flush: async () => {} };
    const done: Trial[] = [];
    const engine = new SessionEngine(store as never, () => DEFAULT_SETTINGS, () => DEFAULT_LEARNING);
    engine.onTrialDone = (t) => done.push(t);
    const q = buildQuestion('carry_over', [8, 5], 'mode_c_tenframe', 'construct', DEFAULT_SETTINGS, DEFAULT_LEARNING);
    const h = engine.startTrial('mode_c_tenframe', q, () => {});
    h.context.emit({ type: 'input_enabled' });
    h.context.emit({ type: 'decision_made', payload: { value: 2 } });
    const r = { outcome: 'completed' as const, assistanceLevel: 'independent' as const, correctWithoutHint: true, mistakeCount: 0, hintCount: 0, maxHintLevel: 0 as const };
    h.context.complete(r);
    h.context.complete({ ...r, assistanceLevel: 'after_hint' });
    h.context.emit({ type: 'attempt' });
    expect(done.length).toBe(1);
    expect(h.trial.result?.assistanceLevel).toBe('independent');
    expect(h.trial.events.filter((e) => e.type === 'completed').length).toBe(1);
    expect(h.trial.events.some((e) => e.type === 'attempt')).toBe(false);
    const ts = h.trial.events.map((e) => e.timestampMs);
    expect(ts).toEqual(ts.slice().sort((a, b) => a - b));
    expect(h.trial.startedAt).toMatch(/[+-]\d\d:\d\d$/);
  });

  it('スキップ・中断は誤答と区別され、探索は explored で閉じる', async () => {
    const { SessionEngine } = await import('../core/engine/SessionEngine');
    const store = { saveSession() {}, flush: async () => {} };
    const engine = new SessionEngine(store as never, () => DEFAULT_SETTINGS, () => DEFAULT_LEARNING);
    const q = buildQuestion('complement_10', [3], 'mode_a_parity', 'construct', DEFAULT_SETTINGS, DEFAULT_LEARNING);
    const h1 = engine.startTrial('mode_a_parity', q, () => {});
    h1.close('skipped');
    expect(h1.trial.result).toMatchObject({ outcome: 'skipped', assistanceLevel: 'not_completed' });
    const h2 = engine.startTrial('mode_a_parity', { ...q, learningStage: 'explore', expectedValue: null, operands: [], distractors: [] }, () => {});
    h2.close('abandoned');
    expect(h2.trial.result?.outcome).toBe('explored');
    const h3 = engine.startTrial('mode_a_parity', q, () => {});
    engine.endSession('child_chose_end');
    expect(h3.trial.result?.outcome).toBe('abandoned');
    expect(engine.session?.endReason).toBe('child_chose_end');
  });

  it('不正な問題は出題しない', async () => {
    const { SessionEngine } = await import('../core/engine/SessionEngine');
    const engine = new SessionEngine({ saveSession() {}, flush: async () => {} } as never, () => DEFAULT_SETTINGS, () => DEFAULT_LEARNING);
    const q = buildQuestion('carry_over', [8, 5], 'mode_c_tenframe', 'construct', DEFAULT_SETTINGS, DEFAULT_LEARNING);
    expect(() => engine.startTrial('mode_c_tenframe', { ...q, operands: [3, 4], expectedValue: 7 }, () => {})).toThrow();
  });
});
