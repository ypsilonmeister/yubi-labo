// v2.16 M 九九テストれんしゅう（§9.11・Issue #30 の受け入れ条件）
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { allKukuPairs, kukuAnchor, kukuHinted, kukuOrder, kukuReportOf, kukuResult, KUKU_REPORT, KUKU_REVEAL, newKukuRun, nextKukuPosition, type KukuRun } from '../core/math/kuku';
import { kukuQuestion, validateQuestion } from '../core/engine/questions';
import { currentStep } from '../core/engine/progression';
import { countsInRound, legacyTotalPoints, rankOf, totalPoints, trialPoints, trialPointsV1 } from '../core/score';
import { roundsTenths, totalTenths, type ModeLookup, type ScoreRules } from '../core/scoring';
import { allRows, isGraded, kukuStuck } from '../app/parent/analytics';
import { previewImport } from '../core/storage/dataio';
import { canReadAloud, pickLocalVoice, speak } from '../core/speech';
import { DEFAULT_LEARNING, DEFAULT_SETTINGS } from '../core/settings';
import { GameRegistry } from '../core/registry';
import { registerModes } from '../modes/index';
import { KukuBoard, type KukuBoardProps } from '../modes/kuku/KukuBoard';
import { KukuNextButton } from '../app/screens/PlayScreen';
import type { AppData, GameEvent, KukuForm, KukuJudge, Session, Trial, TrialResult } from '../core/types';

registerModes();
const modes: ModeLookup = (id) => GameRegistry.all().find((p) => p.id === id);

/** 乱数を固定する（線形合同法） */
const seeded = (seed: number) => () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const run = (form: KukuForm, dan: number, judge: KukuJudge = 'self', seed = 1) => newKukuRun({ id: 'k-1', form, dan, judge }, seeded(seed));

/** 「つぎへ」を押しつづけたときに出る式 */
function walk(start: KukuRun, limit: number) {
  const out: string[] = [];
  let pos: { run: KukuRun; index: number } | null = { run: start, index: 0 };
  const rng = seeded(99);
  while (pos && out.length < limit) {
    const q = kukuQuestion(pos.run, pos.index, DEFAULT_SETTINGS, DEFAULT_LEARNING);
    out.push(q.operands.join('×'));
    pos = nextKukuPosition(pos.run, pos.index, rng);
  }
  return out;
}

describe('出題順', () => {
  it('7の段・くだりは 7×9 から 7×1 の順で、そこで終わる', () => {
    expect(walk(run('down', 7), 20)).toEqual(['7×9', '7×8', '7×7', '7×6', '7×5', '7×4', '7×3', '7×2', '7×1']);
  });

  it('のぼりは ×1 から ×9 の順', () => {
    expect(walk(run('up', 3), 20)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => `3×${b}`));
  });

  it('バラバラは、どの段でも その段の9問が重複なく出る', () => {
    for (let dan = 1; dan <= 9; dan++)
      for (let seed = 1; seed <= 40; seed++) {
        const seen = walk(run('shuffle', dan, 'self', seed), 20);
        expect(seen).toHaveLength(9);
        expect(new Set(seen).size).toBe(9);
        expect(seen.every((x) => x.startsWith(`${dan}×`))).toBe(true);
      }
    // ならびは乱数で変わる
    expect(kukuOrder('shuffle', 7, seeded(1))).not.toEqual(kukuOrder('shuffle', 7, seeded(2)));
  });

  it('ぜんぶの段は 81問を重複なく出し、そのあとも本人が続けられる（同じ式は続けない）', () => {
    const seen = walk(run('mix', 1), 200);
    expect(seen).toHaveLength(200);
    expect(new Set(seen.slice(0, 81)).size).toBe(81);
    expect(new Set(seen.slice(81, 162)).size).toBe(81);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    // 並べなおした先頭が直前の式と同じになる乱数でも、続けては出さない
    const r = run('mix', 1);
    const rng = () => 0.999999; // 並べかえない（allKukuPairs の順のまま）
    const last: KukuRun = { ...r, order: [...allKukuPairs().slice(1), allKukuPairs()[0]] };
    const n = nextKukuPosition(last, 80, rng)!;
    expect(n.run.order[0]).not.toEqual(last.order[80]);
    expect(new Set(n.run.order.map(String)).size).toBe(81);
  });
});

describe('問題と登録', () => {
  it('81の式すべてが出題前の検証を通り、問題IDは式だけで決まる（形式が違っても同じ）', () => {
    const r = run('mix', 1, 'parent');
    r.order.forEach((_, i) => expect(validateQuestion(kukuQuestion(r, i, DEFAULT_SETTINGS, DEFAULT_LEARNING))).toEqual([]));
    const down = kukuQuestion(run('down', 7), 1, DEFAULT_SETTINGS, DEFAULT_LEARNING);
    expect(down).toMatchObject({ id: 'kuku_rehearsal:7,8', expectedValue: 56, distractors: [], variantId: 'kuku/down', learningStage: 'construct' });
    expect(down.rehearsal).toEqual({ runId: 'k-1', form: 'down', index: 1, judge: 'self' });
    expect(validateQuestion({ ...down, operands: [7, 10], expectedValue: 70 }).length).toBeGreaterThan(0);
  });

  it('M は登録されていて、ほかのモードの表現横断・おまかせ進行に混ざらない', () => {
    expect(GameRegistry.get('mode_m_kuku').supportedTasks).toEqual(['kuku_rehearsal']);
    for (const p of GameRegistry.all()) if (p.id !== 'mode_m_kuku') expect(p.supportedTasks).not.toContain('kuku_rehearsal');
    expect(GameRegistry.transferTargets('kuku_rehearsal', 'mode_m_kuku')).toEqual([]);
    const l = GameRegistry.get('mode_l_arrays');
    expect(currentStep(l, [trial(7, 8, true), trial(7, 8, true)])).toEqual(currentStep(l, []));
  });
});

// ---------- 記録 ----------

let seq = 0;
interface TrialOpts {
  judge?: KukuJudge;
  hint?: 'before' | 'after';
  /** 申告せずにとばした */
  skipped?: boolean;
  /** 申告までの時間（ミリ秒） */
  took?: number;
}
/** KukuMode と同じ順でイベントをならべた試行 */
function trial(dan: number, b: number, said: boolean, o: TrialOpts = {}): Trial {
  const judge = o.judge ?? 'self';
  const q = kukuQuestion({ id: 'k-1', form: 'up', dan, judge, order: [[dan, b]] }, 0, DEFAULT_SETTINGS, DEFAULT_LEARNING);
  const events: GameEvent[] = [{ type: 'question_shown', timestampMs: 0 }, { type: 'input_enabled', timestampMs: 1 }];
  if (o.hint === 'before') events.push({ type: 'hint_requested', timestampMs: 2, payload: { level: 1 } });
  events.push({ type: 'attempt', timestampMs: 3, payload: { action: KUKU_REVEAL } });
  if (o.hint === 'after') events.push({ type: 'hint_requested', timestampMs: 4, payload: { level: 1 } });
  if (!o.skipped) events.push({ type: 'decision_made', timestampMs: o.took ?? 5, payload: { action: KUKU_REPORT, said, judgedBy: judge } });
  const result: TrialResult = o.skipped
    ? { outcome: 'skipped', assistanceLevel: 'not_completed', correctWithoutHint: false, mistakeCount: 0, hintCount: 0, maxHintLevel: 0 }
    : kukuResult(said, o.hint === 'before');
  return { trialId: `t-${seq}`, orderInSession: ++seq, modeId: 'mode_m_kuku', question: q, settingsSnapshot: DEFAULT_SETTINGS, events, result, startedAt: '2026-11-20T10:00:00+09:00' };
}
const sessionOf = (trials: Trial[]): Session => ({ sessionId: 's-kuku', startedAt: '2026-11-20T10:00:00+09:00', timeOfDay: 'morning', trials });
const dataOf = (sessions: Session[]): AppData => ({ schemaVersion: '2.1', profile: { playerLabel: 'x', settings: DEFAULT_SETTINGS, learning: DEFAULT_LEARNING }, sessions, craftBook: [] });

describe('点数', () => {
  const trials = () => [trial(7, 8, true), trial(7, 9, true, { hint: 'before' }), trial(7, 6, false), trial(2, 2, true, { judge: 'parent' }), trial(3, 3, true, { skipped: true })];

  it('M の試行は どの結果でも 0点', () => {
    for (const t of trials()) {
      expect(trialPoints(t)).toBe(0);
      expect(trialPointsV1(t)).toBe(0);
    }
  });

  it('M を遊んでも合計点・ランク・ラウンドの点が変わらない', () => {
    // 点が入っている記録（はんぶんチャレンジ）に M を足して比べる
    const other: Trial = {
      ...trial(7, 8, true),
      trialId: 't-other',
      modeId: 'mode_i_halving',
      question: { ...trial(7, 8, true).question, taskType: 'halving', id: 'halving:1024', operands: [1024], representation: 'mode_i_halving' },
      roundId: 'r-1',
    };
    const before = dataOf([sessionOf([other])]);
    const after = dataOf([sessionOf([other, ...trials()])]);
    const rules: ScoreRules = { version: 'v2.15', at: '2026-11-01T00:00:00+09:00', points: 95 };
    expect(totalPoints(before)).toBeGreaterThan(0);
    expect(totalPoints(after)).toBe(totalPoints(before));
    expect(legacyTotalPoints(after)).toBe(legacyTotalPoints(before));
    expect(totalTenths(after, rules, modes)).toBe(totalTenths(before, rules, modes));
    expect(rankOf(Math.floor(totalTenths(after, rules, modes) / 10))).toEqual(rankOf(Math.floor(totalTenths(before, rules, modes) / 10)));
    expect(roundsTenths(after.sessions, rules, null, modes, countsInRound)).toEqual(roundsTenths(before.sessions, rules, null, modes, countsInRound));
  });

  it('「まだ」は間違いに数えず、親判定は自己確認と区別して残る', () => {
    expect(kukuResult(false, false)).toMatchObject({ outcome: 'completed', assistanceLevel: 'not_completed', correctWithoutHint: false, mistakeCount: 0 });
    expect(kukuResult(true, true)).toMatchObject({ assistanceLevel: 'after_hint', correctWithoutHint: false, maxHintLevel: 1 });
    expect(kukuReportOf(trial(7, 8, true, { judge: 'parent' }))).toEqual({ said: true, judgedBy: 'parent' });
    expect(kukuReportOf(trial(7, 8, false))).toEqual({ said: false, judgedBy: 'self' });
    expect(kukuReportOf(trial(7, 8, false, { skipped: true }))).toBeNull();
  });
});

describe('詰まった式の集計（保護者画面）', () => {
  const rowsOf = (trials: Trial[]) => allRows(dataOf([sessionOf(trials)]), DEFAULT_LEARNING.idleThresholdMs);

  it('「まだ」と、答えを見る前のヒント使用を式ごとに数える', () => {
    const list = kukuStuck(
      rowsOf([
        trial(7, 8, false),
        trial(7, 8, false, { judge: 'parent' }),
        trial(7, 8, true),
        trial(6, 7, true, { hint: 'before' }),
        trial(6, 7, false, { hint: 'before' }),
        trial(4, 8, true, { hint: 'before', skipped: true }),
        trial(2, 3, true),
        trial(9, 9, true, { hint: 'after' }),
        trial(5, 5, false, { skipped: true }),
      ]),
    );
    expect(list.map((x) => [x.dan, x.multiplier, x.notYet, x.notYetByParent, x.hinted, x.reported])).toEqual([
      [7, 8, 2, 1, 0, 3],
      [6, 7, 1, 0, 2, 2],
      [4, 8, 0, 0, 1, 0],
    ]);
    expect(list[0].lastDay).toBe('2026-11-20');
  });

  it('反応時間が長いだけの式は出さない', () => {
    expect(kukuStuck(rowsOf([trial(8, 8, true, { took: 600000 })]))).toEqual([]);
  });

  it('ヒントは答えを見る前だけを数える', () => {
    expect(kukuHinted(trial(7, 8, true, { hint: 'before' }))).toBe(true);
    expect(kukuHinted(trial(7, 8, true, { hint: 'after' }))).toBe(false);
  });

  it('自己申告の結果は、機械が判定した成績の集計に混ぜない', () => {
    expect(rowsOf([trial(7, 8, true), trial(7, 9, false)]).some(isGraded)).toBe(false);
  });

  it('M の記録を含むバックアップを読み込める（schemaVersion は 2.1 のまま）', () => {
    const data = dataOf([sessionOf([trial(7, 8, false, { judge: 'parent', hint: 'before' })])]);
    data.profile.settings = { ...DEFAULT_SETTINGS, readAloud: true };
    const p = previewImport(JSON.stringify(data), dataOf([]));
    expect(p.errors).toEqual([]);
    expect(p.trialCount).toBe(1);
    expect(p.data!.schemaVersion).toBe('2.1');
    expect(p.data!.profile.settings.readAloud).toBe(true);
    expect(p.data!.sessions[0].trials[0].question.rehearsal?.judge).toBe('parent');
  });
});

// ---------- アンカーヒント ----------

describe('アンカーヒント', () => {
  it('7×8 は 7×7=49 から ＋7', () => {
    expect(kukuAnchor(7, 8)).toEqual({ multiplier: 7, value: 49, steps: 1 });
  });
  it('6×6（四角い数そのもの）は 6×5=30 から ＋6', () => {
    expect(kukuAnchor(6, 6)).toEqual({ multiplier: 5, value: 30, steps: 1 });
  });
  it('どの式でも、手がかりは別の式で、段の数を2回まで たす／ひくと答えになる', () => {
    for (const [dan, m] of allKukuPairs()) {
      const a = kukuAnchor(dan, m);
      if (m === 1) {
        expect(a).toBeNull();
        continue;
      }
      expect(a!.multiplier).not.toBe(m);
      expect(a!.value + a!.steps * dan).toBe(dan * m);
      expect(Math.abs(a!.steps)).toBeGreaterThan(0);
      expect(Math.abs(a!.steps)).toBeLessThanOrEqual(2);
    }
  });
});

// ---------- 画面 ----------

const noop = () => {};
const board = (o: Partial<KukuBoardProps>) =>
  renderToStaticMarkup(<KukuBoard pair={[7, 8]} form="down" judge="self" revealed={false} reported={false} skipped={false} hint={false} sequence onReveal={noop} onReport={noop} onToggleSequence={noop} {...o} />);
/** 数のふだと答えの欄に出ている数（式そのもの・「−7」のような差は除く） */
const shownValues = (html: string) => [...html.matchAll(/<span class="kuku-(?:chip(?: now)?|answer)"[^>]*>(?:= )?([^<]*)<\/span>/g)].map((m) => m[1]);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ');

describe('画面', () => {
  it('「こたえを みる」を押すまで、どの式でも答えが出ない（並び・ヒントを出していても）', () => {
    for (const pair of allKukuPairs())
      for (const form of ['up', 'down', 'shuffle', 'mix'] as const) {
        const html = board({ pair, form, hint: true });
        expect(html).not.toContain('kuku-answer');
        expect(shownValues(html)).not.toContain(String(pair[0] * pair[1]));
        expect(html).toContain('こたえを みる');
        expect(text(html)).not.toContain('いえた　');
        expect(html).not.toContain('kuku-report');
      }
  });

  it('押したあとは答えと「いえた／まだ」が同じ見た目で出る', () => {
    const html = board({ revealed: true });
    expect(html).toMatch(/kuku-answer[^>]*>= 56</);
    expect(html.match(/<button type="button" class="btn-soft kuku-report">/g)).toHaveLength(2);
    expect(html).not.toContain('こたえを みる');
  });

  it('くだりの並びは表示・非表示を切り替えられ、段の数ずつ減る', () => {
    // 7×7 の時点: すぎた 63・56、いまは ？、このあとは出さない
    expect(shownValues(board({ pair: [7, 7] }))).toEqual(['63', '56', '？', '・', '・', '・', '・', '・', '・']);
    expect(shownValues(board({ pair: [7, 7], revealed: true })).slice(0, 4)).toEqual(['63', '56', '49', '・']);
    expect(board({})).toContain('ならびを かくす');
    const off = board({ sequence: false });
    expect(off).not.toContain('kuku-sequence"');
    expect(off).toContain('ならびを みる');
    for (const form of ['up', 'shuffle', 'mix'] as const) expect(board({ form })).not.toContain('kuku-sequence');
  });

  it('点・合否・順位・タイマー・急かす言葉・残念な表現を出さない', () => {
    for (const o of [{}, { revealed: true }, { revealed: true, reported: true }, { skipped: true }, { hint: true, judge: 'parent' as const }]) {
      const t = text(board(o));
      for (const bad of ['てん', '点', 'ごうかく', 'ランク', 'びょう', '秒', 'タイム', 'ざんねん', 'がんばれ', 'あと すこし', 'はやく', '✕', '×印']) expect(t).not.toContain(bad);
    }
  });

  it('申告のあとは、どちらを押したかを画面に残さない', () => {
    const html = board({ revealed: true, reported: true });
    expect(text(html)).not.toContain('まだ');
    expect(text(html)).not.toContain('いえた');
    expect(html).toContain('きろく したよ');
  });

  it('とばした式は答えを開けるが申告はできず、「きろく したよ」を出さない', () => {
    for (const judge of ['self', 'parent'] as const)
      for (const revealed of [false, true]) {
        const html = board({ judge, revealed, skipped: true });
        expect(html.includes('こたえを みる')).toBe(!revealed);
        expect(html).not.toContain('kuku-report');
        expect(html).not.toContain('きろく したよ');
        expect(html).toContain('この しきは とばしたよ');
        // 出していた答えはそのまま。見ていない答えは出さない
        expect(html.includes('kuku-answer')).toBe(revealed);
      }
  });

  const next = (done: Trial, o: { answerShown?: boolean; ended?: boolean } = {}) =>
    text(renderToStaticMarkup(<KukuNextButton done={done} answerShown={false} ended={false} onNext={noop} {...o} />)).trim();
  const skippedTrial = () => trial(7, 8, true, { skipped: true });

  it('とばした式は、答えを見ずに次へ進めない（段の終わりの「はじめから」も出ない）', () => {
    for (const ended of [false, true]) expect(next(skippedTrial(), { ended })).toBe('');
  });

  it('とばした式は、答えを開けば申告なしで「つぎへ」が出る（記録は skipped のまま）', () => {
    const t = skippedTrial();
    expect(next(t, { answerShown: true })).toBe('つぎへ');
    expect(next(t, { answerShown: true, ended: true })).toBe('はじめから');
    expect(t.result?.outcome).toBe('skipped');
    expect(kukuReportOf(t)).toBeNull();
  });

  it('申告した式は「つぎへ」、段の終わりは「はじめから」', () => {
    for (const said of [true, false]) {
      expect(next(trial(7, 8, said))).toBe('つぎへ');
      expect(next(trial(7, 8, said), { ended: true })).toBe('はじめから');
    }
  });
});

// ---------- 読み上げ ----------

describe('読み上げ', () => {
  afterEach(() => vi.unstubAllGlobals());
  const on = { ...DEFAULT_SETTINGS, readAloud: true, soundEnabled: true };
  const voice = (lang: string, localService: boolean) => ({ lang, localService, name: `${lang}-${localService}` });
  function stub(voices: ReturnType<typeof voice>[]) {
    const api = { getVoices: () => voices, speak: vi.fn(), cancel: vi.fn() };
    vi.stubGlobal('speechSynthesis', api);
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
    return api;
  }

  it('初期はOFF。音がOFF・静かなモードでは読み上げない', () => {
    expect(DEFAULT_SETTINGS.readAloud).toBe(false);
    expect(canReadAloud(DEFAULT_SETTINGS)).toBe(false);
    expect(canReadAloud({ ...on, soundEnabled: false })).toBe(false);
    expect(canReadAloud({ ...on, quietMode: true })).toBe(false);
    expect(canReadAloud(on)).toBe(true);
  });

  it('端末内の日本語の声だけを選ぶ', () => {
    expect(pickLocalVoice([voice('ja-JP', false), voice('en-US', true)])).toBeNull();
    expect(pickLocalVoice([voice('ja-JP', false), voice('ja_JP', true)])).toEqual(voice('ja_JP', true));
  });

  it('端末内の声がなければ何も読み上げない（既定の声を使わない）', () => {
    const remote = stub([voice('ja-JP', false)]);
    expect(speak('7 かける 8', on)).toBe(false);
    expect(remote.speak).not.toHaveBeenCalled();
    const local = stub([voice('ja-JP', false), voice('ja-JP', true)]);
    expect(speak('7 かける 8', DEFAULT_SETTINGS)).toBe(false);
    expect(speak('7 かける 8', on)).toBe(true);
    expect(local.speak).toHaveBeenCalledTimes(1);
    expect(local.speak.mock.calls[0][0].voice.localService).toBe(true);
  });
});
