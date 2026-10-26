// v2.15 くり返しで点を集めにくくする（同じ日の同じ問題は「れんしゅう」、もう できた ところは 10分の1）
import { describe, expect, it } from 'vitest';
import { roundsTenths, scoreAll, splitTenths, totalTenths, type ModeLookup, type ScoreRules } from '../core/scoring';
import { countsInRound, POINTS, rankOf, totalPoints } from '../core/score';
import { stepMastered } from '../core/engine/progression';
import { buildQuestion } from '../core/engine/questions';
import { DEFAULT_LEARNING, DEFAULT_SETTINGS } from '../core/settings';
import { GameRegistry } from '../core/registry';
import { registerModes } from '../modes/index';
import type { LearningStage, ModeId, Session, TaskCategory, Trial, TrialResult } from '../core/types';

registerModes();
const modes: ModeLookup = (id) => GameRegistry.all().find((p) => p.id === id);

const FIRST: TrialResult = { outcome: 'completed', assistanceLevel: 'independent', correctWithoutHint: true, mistakeCount: 0, hintCount: 0, maxHintLevel: 0 };
const TRIED: TrialResult = { outcome: 'completed', assistanceLevel: 'independent', correctWithoutHint: false, mistakeCount: 1, hintCount: 0, maxHintLevel: 0 };

let seq = 0;
function trial(o: { mode: ModeId; task: TaskCategory; ops: number[]; at: string; result?: TrialResult; stage?: LearningStage; roundId?: string }): Trial {
  const q = buildQuestion(o.task, o.ops, o.mode, o.stage ?? 'construct', DEFAULT_SETTINGS, DEFAULT_LEARNING);
  return { trialId: `t${seq++}`, orderInSession: seq, modeId: o.mode, question: q, settingsSnapshot: DEFAULT_SETTINGS, events: [], result: o.result ?? FIRST, startedAt: o.at, ...(o.roundId ? { roundId: o.roundId } : {}) };
}
const session = (trials: Trial[], at: string): Session => ({ sessionId: `s${seq++}`, startedAt: at, trials }) as unknown as Session;
const D1 = '2026-11-01T10:00:00+09:00';
const D1b = '2026-11-01T10:05:00+09:00';
const D2 = '2026-11-02T10:00:00+09:00';
const shape = (goal: number) => [goal, 0, 0, 1, 0];

describe('v2.15 ルール1: 同じ日の同じ問題は「れんしゅう」（0点）', () => {
  it('同じ日・同じモード・同じ問題の2回目は 0点。別の日は満点', () => {
    // 段が1つだけ（いつも今の挑戦の段）の はんぶんチャレンジで、ルール1だけを確かめる
    const a = trial({ mode: 'mode_i_halving', task: 'halving', ops: [1024], at: D1 });
    const b = trial({ mode: 'mode_i_halving', task: 'halving', ops: [1024], at: D1b });
    const c = trial({ mode: 'mode_i_halving', task: 'halving', ops: [1024], at: D2 });
    const s = scoreAll([session([a, b], D1), session([c], D2)], modes);
    expect(s.map((x) => x.tenths)).toEqual([POINTS.firstTry * 10, 0, POINTS.firstTry * 10]);
    expect(s[1].practice).toBe(true);
  });

  it('べつの せかい（表現横断。モードがちがう）は くり返しに数えず、ボーナスも入る', () => {
    const a = trial({ mode: 'mode_c_tenframe', task: 'borrow', ops: [13, 5], at: D1 });
    const t = trial({ mode: 'mode_d_exchange', task: 'borrow', ops: [13, 5], at: D1b, stage: 'transfer' });
    const s = scoreAll([session([a, t], D1)], modes);
    expect(s[1].practice).toBe(false);
    expect(s[1].tenths).toBe((POINTS.firstTry + POINTS.transferBonus) * 10);
  });

  it('点が入らなかった試行（スキップなど）のあとは、解き直すと点が入る', () => {
    const skipped: TrialResult = { outcome: 'skipped', assistanceLevel: 'not_completed', correctWithoutHint: false, mistakeCount: 0, hintCount: 0, maxHintLevel: 0 };
    const a = trial({ mode: 'mode_c_tenframe', task: 'carry_over', ops: [8, 5], at: D1, result: skipped });
    const b = trial({ mode: 'mode_c_tenframe', task: 'carry_over', ops: [8, 5], at: D1b });
    expect(scoreAll([session([a, b], D1)], modes).map((x) => x.tenths)).toEqual([0, POINTS.firstTry * 10]);
  });
});

describe('v2.15 ルール2: もう できた ところは 10分の1', () => {
  it('済んだ段に、今の段ではないのに戻ると 10分の1。今の挑戦の段は満点', () => {
    const k: ModeId = 'mode_k_shapemake';
    const r1 = trial({ mode: k, task: 'shape_right', ops: shape(1), at: D1 });
    const r2 = trial({ mode: k, task: 'shape_right', ops: [1, 0, 1, 1, 1], at: D1 }); // 2回続けて ぴったり → 済み
    const t1 = trial({ mode: k, task: 'shape_triangle', ops: shape(2), at: D1 }); // 今の挑戦
    const back = trial({ mode: k, task: 'shape_right', ops: [1, 0, 2, 1, 2], at: D1 }); // 自分で選んで戻った
    const s = scoreAll([session([r1, r2, t1, back], D1)], modes);
    expect(s.map((x) => x.tenths)).toEqual([100, 100, 100, 10]);
    expect(s[3].easier).toBe(true);
    // ためしてから当たった 3点 は 0.3点（小さな点 3こ）
    const back2 = trial({ mode: k, task: 'shape_right', ops: [1, 0, 3, 1, 3], at: D1, result: TRIED });
    expect(scoreAll([session([r1, r2, t1, back2], D1)], modes)[3].tenths).toBe(3);
  });

  it('全部の段を済ませたあとの最後の段（くり返し出る段）は満点のまま', () => {
    const i: ModeId = 'mode_i_halving';
    const q1 = trial({ mode: i, task: 'halving', ops: [1024], at: D1 });
    const q2 = trial({ mode: i, task: 'halving', ops: [512], at: D1 });
    const q3 = trial({ mode: i, task: 'halving', ops: [256], at: D1 });
    const s = scoreAll([session([q1, q2, q3], D1)], modes);
    expect(s.map((x) => x.tenths)).toEqual([100, 100, 100]);
  });

  it('後日の確認（revisit）は、済んだ段でも満点', () => {
    const k: ModeId = 'mode_k_shapemake';
    const r1 = trial({ mode: k, task: 'shape_right', ops: shape(1), at: D1 });
    const r2 = trial({ mode: k, task: 'shape_right', ops: [1, 0, 1, 1, 1], at: D1 });
    const rv = trial({ mode: k, task: 'shape_right', ops: [1, 0, 2, 1, 2], at: D2, stage: 'revisit' });
    expect(scoreAll([session([r1, r2], D1), session([rv], D2)], modes)[2].tenths).toBe(100);
  });

  it('済んだかどうかの判定は、おまかせ進行（progression.stepMastered）と同じ', () => {
    // ランダムな記録で、各試行の直前の「済み」が一致することを確かめる
    let r = 7;
    const rnd = () => (r = (r * 48271) % 2147483647) / 2147483647;
    const k: ModeId = 'mode_k_shapemake';
    const tasks: TaskCategory[] = ['shape_right', 'shape_triangle', 'shape_rectangle'];
    const trials: Trial[] = [];
    for (let n = 0; n < 60; n++) {
      const task = tasks[Math.floor(rnd() * 3)];
      trials.push(trial({ mode: k, task, ops: [tasks.indexOf(task) + 1, 0, n % 5, 1, n % 5], at: `2026-11-${String(1 + (n % 9)).padStart(2, '0')}T10:00:00+09:00`, result: rnd() < 0.6 ? FIRST : TRIED }));
    }
    const s = scoreAll([session(trials, D1)], modes);
    for (let n = 0; n < trials.length; n++) {
      const prior = trials.slice(0, n);
      const step = { task: trials[n].question.taskType, stage: 'construct' as const };
      const done = stepMastered(step, prior);
      if (!done) expect(s[n].easier).toBe(false);
    }
  });
});

describe('v2.15 合計・ラウンド・切り替え', () => {
  it('10分の1が10回たまると、ちょうど1てん増える。小さな点は 0〜9', () => {
    expect(splitTenths(37)).toEqual({ points: 3, dots: 7 });
    const k: ModeId = 'mode_k_shapemake';
    const ts = [trial({ mode: k, task: 'shape_right', ops: shape(1), at: D1 }), trial({ mode: k, task: 'shape_right', ops: [1, 0, 1, 1, 1], at: D1 })];
    for (let y = 2; y <= 4; y++) for (let x = 0; x <= 3; x++) if (ts.length < 12) ts.push(trial({ mode: k, task: 'shape_right', ops: [1, x, y, x + 1, y], at: D1 }));
    const rules: ScoreRules = { version: 'v2.15', at: '2026-10-01T00:00:00+09:00', points: 0 };
    // 済む前の2回 = 20てん、そのあと 自分で戻った10回 = 10 × 0.1 = 1てん（今の段ではないので）
    const total = totalTenths({ sessions: [session(ts, D1)], craftBook: [] }, rules, modes);
    expect(total).toBe(200 + 10 * 10);
  });

  it('切り替えたときの点を基準にするので、合計点とランクが下がらない', () => {
    const a = trial({ mode: 'mode_c_tenframe', task: 'carry_over', ops: [8, 5], at: D1 });
    const b = trial({ mode: 'mode_c_tenframe', task: 'carry_over', ops: [8, 5], at: D1b });
    const data = { sessions: [session([a, b], D1)], craftBook: [] };
    const before = totalPoints(data, { points: 0, at: '2026-10-01T00:00:00+09:00' });
    expect(before).toBe(20); // v2.5 では2回とも10点
    const rules: ScoreRules = { version: 'v2.15', at: '2026-11-01T11:00:00+09:00', points: before };
    const after = splitTenths(totalTenths(data, rules, modes)).points;
    expect(after).toBe(before);
    expect(rankOf(after).level).toBe(rankOf(before).level);
  });

  it('ラウンドの点も新しい付け方。切り替えより前は、そのときの点のまま', () => {
    const a = trial({ mode: 'mode_c_tenframe', task: 'carry_over', ops: [8, 5], at: D1, roundId: 'r1' });
    const b = trial({ mode: 'mode_c_tenframe', task: 'carry_over', ops: [8, 5], at: D1b, roundId: 'r1' });
    const sessions = [session([a, b], D1)];
    const newRules: ScoreRules = { version: 'v2.15', at: '2026-10-01T00:00:00+09:00', points: 0 };
    expect(roundsTenths(sessions, newRules, null, modes, countsInRound)[0]).toMatchObject({ tenths: 100, points: 10, count: 2 });
    const oldRules: ScoreRules = { version: 'v2.15', at: '2026-12-01T00:00:00+09:00', points: 0 };
    expect(roundsTenths(sessions, oldRules, { points: 0, at: '2026-10-01T00:00:00+09:00' }, modes, countsInRound)[0]).toMatchObject({ tenths: 200, points: 20 });
  });
});
