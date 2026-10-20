import { describe, expect, it } from 'vitest';
import { anonymize, craftKey, emptyAppData, mergeCraft, withDefaults, eventsCsv, mergeData, migrateV1, previewImport, sessionsCsv, toJstIso, trialsCsv, validateAppData } from '../core/storage/dataio';
import { buildQuestion } from '../core/engine/questions';
import { DEFAULT_LEARNING, DEFAULT_SETTINGS } from '../core/settings';
import type { AppData } from '../core/types';
import { isoWithOffset } from '../core/time';

function sample(): AppData {
  const d = emptyAppData();
  d.profile.playerLabel = 'テスト';
  const q = buildQuestion('carry_over', [8, 5], 'mode_c_tenframe', 'construct', DEFAULT_SETTINGS, DEFAULT_LEARNING);
  d.sessions.push({
    sessionId: 's1',
    startedAt: '2026-10-17T07:23:10+09:00',
    timeOfDay: 'morning',
    endReason: 'child_chose_end',
    trials: [
      {
        trialId: 't1',
        orderInSession: 1,
        modeId: 'mode_c_tenframe',
        question: q,
        settingsSnapshot: DEFAULT_SETTINGS,
        events: [
          { type: 'question_shown', timestampMs: 0 },
          { type: 'input_enabled', timestampMs: 10 },
          { type: 'decision_made', timestampMs: 2000, payload: { value: 2, note: 'a,"b"' } },
          { type: 'completed', timestampMs: 2500 },
        ],
        result: { outcome: 'completed', assistanceLevel: 'independent', correctWithoutHint: true, mistakeCount: 0, hintCount: 0, maxHintLevel: 0 },
      },
    ],
    parentObservation: { enjoyment: 'positive', conditionNote: 'よく寝た', note: '自分から続けた' },
  });
  return d;
}

describe('§11.3 エクスポート・インポート', () => {
  it('受け入れテスト23: 匿名化エクスポートに playerLabel と自由記述欄が含まれない', () => {
    const a = anonymize(sample());
    const text = JSON.stringify(a);
    expect(a.profile.playerLabel).toBe('');
    expect(text).not.toContain('テスト');
    expect(text).not.toContain('よく寝た');
    expect(text).not.toContain('自分から続けた');
    expect(a.sessions[0].parentObservation?.enjoyment).toBe('positive');
  });

  it('受け入れテスト6: 不正なJSONは検証で弾き、データを作らない', () => {
    const cur = sample();
    expect(previewImport('{oops', cur).data).toBeNull();
    expect(previewImport(JSON.stringify({ schemaVersion: '2.1', profile: {}, sessions: [{ sessionId: 1 }] }), cur).errors.length).toBeGreaterThan(0);
    expect(validateAppData(sample())).toEqual([]);
  });

  it('重複IDを検出し、マージでは新しいセッションだけ足す', () => {
    const cur = sample();
    const inc = sample();
    inc.sessions.push({ ...inc.sessions[0], sessionId: 's2', trials: [] });
    const pv = previewImport(JSON.stringify(inc), cur);
    expect(pv.errors).toEqual([]);
    expect(pv.duplicateSessionIds).toEqual(['s1']);
    expect(pv.duplicateTrialIds).toEqual(['t1']);
    const merged = mergeData(cur, pv.data!);
    expect(merged.sessions.map((s) => s.sessionId)).toEqual(['s1', 's2']);
  });

  it('CSV はセッション・試行・イベントを別に出し、引用符を正しく扱う', () => {
    const d = sample();
    expect(sessionsCsv(d).split('\r\n')[1]).toContain('s1');
    const trials = trialsCsv(d, 10000);
    expect(trials).toContain('carry_over:8,5'.replace(',', ','));
    expect(trials.split('\r\n')[1]).toContain('8|5');
    const ev = eventsCsv(d);
    expect(ev).toContain('"{""value"":2,""note"":""a,\\""b\\""""}"');
  });
});

describe('§11.4 v1 からの移行', () => {
  const v1 = {
    profile: { playerName: 'プレイヤー', preferredMode: 'mode_a_numicon', settings: { soundEnabled: true, highlightEmptySlots: true, autoSplitAnimationSpeed: 'normal' } },
    logs: [
      { id: 'a', timestamp: '2026-10-16T22:30:00.000Z', modeId: 'mode_c_slime_rpg', taskCategory: 'carry_over', problemKey: '8+5', numbers: [8, 5], targetAnswer: 13, isCorrect: true, mistakeCount: 0, usedHint: false, responseTimeMs: 3240, fatigueWarning: false },
      { id: 'b', timestamp: '2026-10-16T23:00:00.000Z', modeId: 'mode_a_numicon', taskCategory: 'synthesis_5', problemKey: '2+3', numbers: [2, 3], targetAnswer: 5, isCorrect: true, mistakeCount: 1, usedHint: true, responseTimeMs: 9000, fatigueWarning: true },
      { id: 'c', timestamp: '2026-10-17T16:00:00.000Z', modeId: 'mode_b_rods', taskCategory: 'complement_10', problemKey: '8', numbers: [8], targetAnswer: 2, isCorrect: false, mistakeCount: 2, usedHint: false, responseTimeMs: 12000, fatigueWarning: true },
    ],
  };
  it('日付（日本時間）ごとにセッションにまとめ、結果を4区分に変換する', () => {
    const { data, report } = migrateV1(v1);
    expect(report).toMatchObject({ logCount: 3, trialCount: 3, sessionCount: 2, droppedFatigueWarnings: 2 });
    // 2026-10-16T22:30Z = 日本時間 10/17 07:30 → 最初の2件は同じ日
    expect(data.sessions[0].trials.length).toBe(2);
    expect(data.sessions[0].startedAt).toBe('2026-10-17T07:30:00+09:00');
    expect(data.sessions[0].endReason).toBe('unknown');
    const [t1, t2] = data.sessions[0].trials;
    expect(t1.result?.assistanceLevel).toBe('independent');
    expect(t2.result?.assistanceLevel).toBe('after_hint');
    expect(data.sessions[1].trials[0].result).toMatchObject({ outcome: 'completed', assistanceLevel: 'not_completed' });
    expect(t1.question).toMatchObject({ representation: 'mode_c_tenframe', taskType: 'carry_over', operands: [8, 5], expectedValue: 13 });
    expect(t1.events[0].payload?.legacyResponseTimeMs).toBe(3240);
  });
  it('受け入れテスト17: fatigueWarning はどこにも残らない', () => {
    const { data } = migrateV1(v1);
    expect(JSON.stringify(data)).not.toMatch(/fatigue/i);
  });
  it('v1 ファイルをインポートのプレビューで受け付ける', () => {
    const pv = previewImport(JSON.stringify(v1), emptyAppData());
    expect(pv.format).toBe('v1');
    expect(pv.trialCount).toBe(3);
    expect(pv.migration?.droppedFatigueWarnings).toBe(2);
  });
});

describe('受け入れテスト18: 時刻', () => {
  it('オフセット付きISO8601で保存する', () => {
    expect(isoWithOffset(new Date())).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    expect(toJstIso('2026-10-16T22:30:00.000Z')).toBe('2026-10-17T07:30:00+09:00');
  });
});

describe('v2.2 の設定（古いデータの読み込み）', () => {
  it('v2.1 の設定には新しい項目がないので、初期値で補う', () => {
    const settings = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).filter(([k]) => k !== 'directManipulation' && k !== 'rodGrid' && k !== 'numberLabels'));
    const p = withDefaults({ playerLabel: 'x', settings, learning: { choiceCount: 3 } } as never);
    expect(p.settings.directManipulation).toBe(true);
    expect(p.settings.rodGrid).toBe(true);
    expect(p.settings.numberLabels).toBe(true);
    expect(p.learning).toMatchObject({ scoreEnabled: true, roundLength: 10, freeChoice: false, choiceCount: 3 });
  });

  it('ラウンドの roundId は検証・匿名化を通っても残る', () => {
    const d = sample();
    d.sessions[0].trials[0].roundId = 'r-1';
    expect(validateAppData(d)).toEqual([]);
    expect(anonymize(d).sessions[0].trials[0].roundId).toBe('r-1');
  });
});

describe('v2.3 図鑑の種類', () => {
  it('合成（種類なし）は前と同じキー。ほかの種類は同じ数・同じ部品でも別の記録', () => {
    expect(craftKey({ value: 12, parts: [3, 4] })).toBe('12=3+4');
    expect(craftKey({ value: 12, parts: [3, 4], kind: 'sum' })).toBe('12=3+4');
    const at = '2026-10-19T10:00:00+09:00';
    const merged = mergeCraft(
      [{ value: 12, parts: [3, 4], firstMadeAt: at, modeId: 'mode_a_parity' }],
      [
        { value: 12, parts: [3, 4], firstMadeAt: at, modeId: 'mode_e_tiles', kind: 'product' },
        { value: 12, parts: [3, 4], firstMadeAt: at, modeId: 'mode_h_trains', kind: 'period' },
      ],
    );
    expect(merged).toHaveLength(3);
  });
});

describe('v2.5 基準点', () => {
  it('正しい基準点は読み込みで残り、こわれた基準点は捨てる', () => {
    const ok = withDefaults({ playerLabel: 'x', settings: DEFAULT_SETTINGS, learning: DEFAULT_LEARNING, scoreBaseline: { points: 2100, at: '2026-10-20T12:00:00+09:00' } });
    expect(ok.scoreBaseline).toEqual({ points: 2100, at: '2026-10-20T12:00:00+09:00' });
    const bad = withDefaults({ playerLabel: 'x', settings: DEFAULT_SETTINGS, learning: DEFAULT_LEARNING, scoreBaseline: { points: 'x', at: 'y' } } as never);
    expect(bad.scoreBaseline).toBeUndefined();
  });
});
