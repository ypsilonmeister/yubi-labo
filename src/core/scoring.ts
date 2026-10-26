// 実装拡張（v2.15・保護者判断と本人の案）: くり返しで点を集めにくくする。記録から毎回計算する純粋関数（点は保存しない）。
//
// ルール1（同じ問題のくり返し）: 同じ日（JST）に、同じモードで、同じ問題（問題ID）を すでに点をもらって解いていたら、0点（「れんしゅう」）。
//   別の日の解き直し（後日の確認）と、べつの せかい（表現横断。モードがちがう）は くり返しに数えない。
// ルール2（もう できた ところ）: おまかせ進行で済んだ段（2回続けてぴったり）を、今のおまかせ進行の段ではないのに遊んだら、点は 10分の1。
//   本人の案「やさしい ところの 10てんで、ちょうせんの 1てん」。今の挑戦の段（全部済んだあとの最後の段も）と、後日の確認は満点のまま。
// 10分の1 の点を正確に数えるため、中では 10分の1点（tenths）の単位で足す。見せるときは「てん」と、つぎの 1てんまでの小さな点（0〜9）。
// 守ること（v2.2 から変えない）: 点は減らない（0 はあっても引かない）／速さで変えない／連続正解の倍率やコンボを付けない。

import { stepsOf, type ModeShape, type Step } from './engine/progression';
import { exploredToEnd, trialPoints, trialPointsV1, craftPoints, type ScoreBaseline } from './score';
import { jstDateKey } from './time';
import type { AppData, ModeId, Session, Trial } from './types';

/** v2.15 の付け方に切り替えた記録（profile に1回だけ保存する） */
export interface ScoreRules {
  version: 'v2.15';
  /** 切り替えた時刻。これより前の記録は points にまとめて入っている */
  at: string;
  /** 切り替えたときの合計点（それまでの点・ランクを下げないため） */
  points: number;
}

export type ModeLookup = (id: ModeId) => ModeShape | undefined;

export interface ScoredTrial {
  trial: Trial;
  /** 10分の1点の単位 */
  tenths: number;
  /** ルール1: 同じ日の同じ問題のくり返し（0点） */
  practice: boolean;
  /** ルール2: もう できた ところ（10分の1） */
  easier: boolean;
}

const ms = (iso: string | undefined) => (iso ? new Date(iso).getTime() : 0);
const startOf = (t: Trial, s: Session) => t.startedAt ?? s.startedAt;
const stepKey = (s: Pick<Step, 'task' | 'stage'>) => `${s.task}/${s.stage}`;
const clean = (t: Trial) => t.result?.outcome === 'completed' && t.result.assistanceLevel === 'independent' && t.result.mistakeCount === 0;

/** 試行がどのステップのものか（progression と同じ。後日再確認は本課題、表現横断・自由探索は数えない） */
function stepOfTrial(t: Trial): Step | null {
  const s = t.question.learningStage;
  if (s === 'explore' || s === 'transfer') return null;
  return { task: t.question.taskType, stage: s === 'revisit' ? 'construct' : s };
}

/** 記録を古い順に並べる（セッションの開始順 → セッションの中の順） */
export function trialsInOrder(sessions: Session[]): { trial: Trial; session: Session }[] {
  return [...sessions]
    .sort((a, b) => ms(a.startedAt) - ms(b.startedAt))
    .flatMap((s) => [...s.trials].sort((a, b) => a.orderInSession - b.orderInSession).map((trial) => ({ trial, session: s })));
}

/**
 * すべての試行の点を、それまでの記録を見て決める。
 * 済んだ段の判定は progression.stepMastered と同じ（その段の、中断以外の試行で、2回続けてヒントなし・間違いなし。観察は最後まで見たら済み）。
 */
export function scoreAll(sessions: Session[], modes: ModeLookup): ScoredTrial[] {
  const out: ScoredTrial[] = [];
  const earned = new Set<string>(); // 日付|モード|問題ID
  // モードごと・段ごとの「済んだか」と「ひとつ前が きれいだったか」
  const mastered = new Map<ModeId, Set<string>>();
  const prevClean = new Map<string, boolean>();

  for (const { trial: t, session: s } of trialsInOrder(sessions)) {
    if (!t.result) {
      out.push({ trial: t, tenths: 0, practice: false, easier: false });
      continue;
    }
    const base = trialPoints(t);
    const stage = t.question.learningStage;
    const key = `${jstDateKey(startOf(t, s))}|${t.modeId}|${t.question.id}`;
    const step = stepOfTrial(t);
    let tenths = base * 10;
    let practice = false;
    let easier = false;
    if (base > 0 && earned.has(key)) {
      tenths = 0;
      practice = true;
    } else if (base > 0 && step && stage !== 'revisit') {
      const shape = modes(t.modeId);
      const done = mastered.get(t.modeId);
      if (shape && done?.has(stepKey(step))) {
        // 今のおまかせ進行の段（済んでいない最初の段。全部済んだら最後の段）
        const steps = stepsOf(shape);
        const current = steps.find((x) => !done.has(stepKey(x))) ?? steps[steps.length - 1];
        if (!current || stepKey(current) !== stepKey(step)) {
          tenths = base;
          easier = true;
        }
      }
    }
    if (base > 0) earned.add(key);
    out.push({ trial: t, tenths, practice, easier });

    // この試行で段が済んだか（progression.stepMastered と同じ規則）
    if (step && t.result.outcome !== 'abandoned') {
      const set = mastered.get(t.modeId) ?? new Set<string>();
      mastered.set(t.modeId, set);
      const k = `${t.modeId}|${stepKey(step)}`;
      if (step.stage === 'observe') {
        if (exploredToEnd(t)) set.add(stepKey(step));
      } else {
        const c = clean(t);
        if (c && prevClean.get(k)) set.add(stepKey(step));
        prevClean.set(k, c);
      }
    }
  }
  return out;
}

/** 合計（10分の1点の単位）。切り替えの前は rules.points、あとは新しい付け方。図鑑の新しい発見は今までどおり */
export function totalTenths(data: Pick<AppData, 'sessions' | 'craftBook'>, rules: ScoreRules, modes: ModeLookup): number {
  const since = ms(rules.at);
  let sum = rules.points * 10;
  const byId = new Map(data.sessions.flatMap((s) => s.trials.map((t) => [t.trialId, startOf(t, s)] as const)));
  for (const x of scoreAll(data.sessions, modes)) if (ms(byId.get(x.trial.trialId)) >= since) sum += x.tenths;
  return sum + craftPoints(data.craftBook ?? [], since) * 10;
}

/** 見せる形: 「てん」と、つぎの 1てんまでの小さな点（0〜9） */
export const splitTenths = (tenths: number) => ({ points: Math.floor(tenths / 10), dots: tenths % 10 });

export interface RoundTenths {
  roundId: string;
  modeId: ModeId;
  startedAt: string;
  tenths: number;
  points: number;
  count: number;
}

/**
 * ラウンドの点（10分の1点の単位）。v2.15 に切り替えたあとの試行は新しい付け方、
 * それより前は、そのときの付け方（v2.5 の基準点のあとは v2.5、その前は v2.2〜v2.4）で残す。
 */
export function roundsTenths(sessions: Session[], rules: ScoreRules, baseline: ScoreBaseline | null, modes: ModeLookup, countsInRound: (t: Trial) => boolean): RoundTenths[] {
  const since = ms(rules.at);
  const v25 = baseline ? ms(baseline.at) : 0;
  const scored = new Map(scoreAll(sessions, modes).map((x) => [x.trial.trialId, x.tenths] as const));
  const map = new Map<string, RoundTenths>();
  for (const { trial: t, session: s } of trialsInOrder(sessions)) {
    if (!t.roundId) continue;
    let r = map.get(t.roundId);
    if (!r) {
      r = { roundId: t.roundId, modeId: t.modeId, startedAt: startOf(t, s), tenths: 0, points: 0, count: 0 };
      map.set(t.roundId, r);
    }
    if (!countsInRound(t)) continue;
    r.count++;
    const at = ms(startOf(t, s));
    r.tenths += at >= since ? scored.get(t.trialId) ?? 0 : (at >= v25 && baseline ? trialPoints(t) : trialPointsV1(t)) * 10;
    r.points = Math.floor(r.tenths / 10);
  }
  return [...map.values()];
}

/** 自分の記録のランキング（新しい付け方。さいごまでやったラウンドだけ・点の高い順・同点は新しい方が上） */
export function rankingTenths(sessions: Session[], roundLength: number, limit: number, rules: ScoreRules, baseline: ScoreBaseline | null, modes: ModeLookup, countsInRound: (t: Trial) => boolean): RoundTenths[] {
  return roundsTenths(sessions, rules, baseline, modes, countsInRound)
    .filter((r) => r.count >= roundLength)
    .sort((a, b) => b.tenths - a.tenths || ms(b.startedAt) - ms(a.startedAt))
    .slice(0, limit);
}
