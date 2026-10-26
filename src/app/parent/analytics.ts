// 保護者ダッシュボードの集計（§11.3）。純粋関数。
// 速さの順位ではなく、独力達成・ヒント依存・表現横断・後日再現・本人の選好を中心に出す。
// 「正答率が高い＝合っている」とは判定しない。

import type { AppData, LearningStage, ModeId, Session, TaskCategory, TimeOfDay, Trial } from '../../core/types';
import { computeMetrics, median, type TrialMetrics } from '../../core/engine/metrics';
import { jstDateKey } from '../../core/time';

/** 決定点のある段階（explore・observe は成績に入れない §7.3） */
export const GRADED_STAGES: LearningStage[] = ['predict', 'construct', 'transfer', 'revisit'];

export interface Row {
  session: Session;
  trial: Trial;
  day: string;
  tod: TimeOfDay;
  m: TrialMetrics;
  at: number;
}

export function allRows(data: AppData, idleMs: number): Row[] {
  const out: Row[] = [];
  for (const s of data.sessions)
    for (const t of s.trials) {
      const iso = t.startedAt ?? s.startedAt;
      out.push({ session: s, trial: t, day: jstDateKey(iso), tod: t.timeOfDay ?? s.timeOfDay, m: computeMetrics(t.events, idleMs), at: new Date(iso).getTime() });
    }
  return out.sort((a, b) => a.at - b.at);
}

export const isGraded = (r: Row) => GRADED_STAGES.includes(r.trial.question.learningStage) && r.trial.result?.outcome !== 'explored';

export interface Agg {
  /** 完了した試行（決定まで行った） */
  n: number;
  days: number;
  independent: number;
  afterHint: number;
  afterDemo: number;
  notCompleted: number;
  skipped: number;
  abandoned: number;
  medianActiveMs: number | null;
  medianFirstMs: number | null;
}

export function aggregate(rows: Row[]): Agg {
  const done = rows.filter((r) => r.trial.result?.outcome === 'completed');
  const lvl = (k: string) => done.filter((r) => r.trial.result?.assistanceLevel === k).length;
  return {
    n: done.length,
    days: new Set(done.map((r) => r.day)).size,
    independent: lvl('independent'),
    afterHint: lvl('after_hint'),
    afterDemo: lvl('after_demo'),
    notCompleted: lvl('not_completed'),
    skipped: rows.filter((r) => r.trial.result?.outcome === 'skipped').length,
    abandoned: rows.filter((r) => r.trial.result?.outcome === 'abandoned').length,
    medianActiveMs: median(done.map((r) => r.m.activeInteractionMs)),
    medianFirstMs: median(done.map((r) => r.m.firstActionLatencyMs).filter((x): x is number => x !== null)),
  };
}

export interface TransferStats {
  /** 別表現で初めて取り組んだ（問題ID×表現）の数 */
  firstAttempts: number;
  /** そのうち初回で自力 */
  firstIndependent: number;
  /** 方略が同じ／違う表現間の初回自力（§9.5） */
  sameStrategy: { n: number; independent: number };
  diffStrategy: { n: number; independent: number };
  /** 同じモード内の反復（同じ問題IDを同じ表現で2回目以降） */
  repeats: { n: number; independent: number };
  /** 後日再確認 */
  revisit: { n: number; independent: number };
}

export function transferStats(rows: Row[]): TransferStats {
  const graded = rows.filter((r) => isGraded(r) && r.trial.result?.outcome === 'completed');
  const seen = new Set<string>();
  const st: TransferStats = {
    firstAttempts: 0,
    firstIndependent: 0,
    sameStrategy: { n: 0, independent: 0 },
    diffStrategy: { n: 0, independent: 0 },
    repeats: { n: 0, independent: 0 },
    revisit: { n: 0, independent: 0 },
  };
  for (const r of graded) {
    const q = r.trial.question;
    const key = `${q.id}@${q.representation}`;
    const ind = r.trial.result?.assistanceLevel === 'independent';
    if (q.learningStage === 'transfer' && !seen.has(key)) {
      st.firstAttempts++;
      if (ind) st.firstIndependent++;
      // 直前に別表現で同じ問題を解いた試行の方略と比べる
      const src = [...graded].reverse().find((x) => x.at < r.at && x.trial.question.id === q.id && x.trial.question.representation !== q.representation);
      const bucket = src && src.trial.question.strategy !== q.strategy ? st.diffStrategy : st.sameStrategy;
      bucket.n++;
      if (ind) bucket.independent++;
    } else if (seen.has(key)) {
      st.repeats.n++;
      if (ind) st.repeats.independent++;
    }
    if (q.learningStage === 'revisit') {
      st.revisit.n++;
      if (ind) st.revisit.independent++;
    }
    seen.add(key);
  }
  return st;
}

/** 本人の選好の手がかり: モードごとに本人が始めた試行数（探索を含む）と、その日最初に選んだ回数 */
export function preference(rows: Row[]): Record<ModeId, { trials: number; firstOfSession: number; exploreTrials: number }> {
  const out = {} as Record<ModeId, { trials: number; firstOfSession: number; exploreTrials: number }>;
  const ensure = (m: ModeId) => (out[m] ??= { trials: 0, firstOfSession: 0, exploreTrials: 0 });
  for (const r of rows) {
    const e = ensure(r.trial.modeId);
    e.trials++;
    if (r.trial.question.learningStage === 'explore') e.exploreTrials++;
    if (r.trial.orderInSession === 1) e.firstOfSession++;
  }
  return out;
}

/** 本人に特に希望がない日の最初のモード案（日替わり。§7.4） */
export function dayRotation(modes: ModeId[], dayKey: string): ModeId {
  const days = Math.floor(new Date(`${dayKey}T00:00:00Z`).getTime() / 86400000);
  return modes[((days % modes.length) + modes.length) % modes.length];
}

// ---------- ヒートマップ ----------

export interface HeatAxis {
  rows: number[];
  cols: number[] | null; // null なら1次元
  rowLabel: string;
  colLabel: string;
  valid: (r: number, c: number | null) => boolean;
  key: (r: number, c: number | null) => string;
}

export function heatAxis(task: TaskCategory, synthesisMax: number): HeatAxis {
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  switch (task) {
    case 'carry_over':
      return { rows: range(1, 9), cols: range(1, 9), rowLabel: 'たされる数', colLabel: 'たす数', valid: (a, b) => b !== null && a + b >= 11, key: (a, b) => `${a},${b}` };
    case 'borrow':
      return { rows: range(11, 18), cols: range(2, 9), rowLabel: 'ひかれる数', colLabel: 'ひく数', valid: (m, b) => b !== null && m % 10 < b, key: (m, b) => `${m},${b}` };
    case 'synthesis_5':
      return { rows: range(1, 9), cols: range(1, 9), rowLabel: 'a', colLabel: 'b', valid: (a, b) => b !== null && a + b >= 3 && a + b <= Math.max(10, synthesisMax), key: (a, b) => `${a},${b}` };
    case 'complement_10':
      return { rows: range(1, 9), cols: null, rowLabel: 'フレームの数', colLabel: '', valid: () => true, key: (a) => `${a}` };
    case 'subitizing_678':
      return { rows: [6, 7, 8], cols: null, rowLabel: '数', colLabel: '', valid: () => true, key: (a) => `${a}` };
    case 'numeral_quantity':
      return { rows: range(5, 9), cols: null, rowLabel: '数', colLabel: '', valid: () => true, key: (a) => `${a}` };
    case 'balance':
      return { rows: range(6, 18), cols: range(1, 9), rowLabel: '左の重さ', colLabel: '右にある重り', valid: (t, c) => c !== null && t - c >= 1 && t - c <= 9, key: (t, c) => `${t},${c}` };
    case 'array_multiply':
      return { rows: range(2, 9), cols: range(2, 9), rowLabel: '行', colLabel: '列', valid: () => true, key: (r, c) => `${r},${c}` };
    case 'array_split':
      return { rows: range(2, 9), cols: range(11, 19), rowLabel: '行', colLabel: '列', valid: () => true, key: (r, c) => `${r},${c}` };
    case 'carry_2d1':
    case 'borrow_2d1':
    case 'carry_2d2':
    case 'borrow_2d2':
      // v2.11: 組が多く、表にならない（課題別の集計表で見る）
      return { rows: [], cols: null, rowLabel: '', colLabel: '', valid: () => false, key: (a) => `${a}` };
    case 'array_divide_rem':
    case 'array_divide':
      // v2.10: operands は [ぜんぶの数, 行]。表にせず、課題別の集計表で見る
      return { rows: [], cols: null, rowLabel: '', colLabel: '', valid: () => false, key: (a) => `${a}` };
    case 'halving':
      // v2.7: 出発値が 281 通りあり、表にならない（課題別の集計表で見る）
      return { rows: [], cols: null, rowLabel: '', colLabel: '', valid: () => false, key: (a) => `${a}` };
    case 'arrays':
    case 'doubling':
    case 'period':
    case 'shapes':
    case 'shape_right':
    case 'shape_triangle':
    case 'shape_rectangle':
      // じっけんラボ（自由探索のみ）は正誤の集計がない
      return { rows: [], cols: null, rowLabel: '', colLabel: '', valid: () => false, key: (a) => `${a}` };
  }
}

export function heatCells(rows: Row[], task: TaskCategory): Map<string, Agg> {
  const by = new Map<string, Row[]>();
  for (const r of rows) {
    if (!isGraded(r) || r.trial.question.taskType !== task) continue;
    const k = r.trial.question.operands.join(',');
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const out = new Map<string, Agg>();
  for (const [k, rs] of by) out.set(k, aggregate(rs));
  return out;
}

/** 単色（青）の順序スケール。明るい＝0、濃い＝1（参照パレットの sequential blue） */
const BLUE = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'];
export function seqColor(ratio: number): { fill: string; ink: string } {
  const i = Math.min(BLUE.length - 1, Math.floor(ratio * BLUE.length));
  return { fill: BLUE[i], ink: i >= 2 ? '#ffffff' : '#1f2a37' };
}
export const SEQ_STEPS = BLUE;
