// JSON エクスポート/インポート、匿名化、CSV、v1 からの移行（§11.3, §11.4）
// すべて純粋関数。IndexedDB には触らない（db.ts が使う）

import type { AccessibilitySettings, AppData, CraftEntry, GameEvent, LearningSettings, ModeId, Session, TaskCategory, TrialResult } from '../types';
import { DEFAULT_LEARNING, DEFAULT_SETTINGS } from '../settings';
import { OPERATION_OF, expectedValueOf, questionId, strategyFor } from '../engine/questions';
import { computeMetrics } from '../engine/metrics';
import { isoWithOffset, jstDateKey } from '../time';
import { ALL_MODES, ALL_TASKS } from '../ids';

export const MODE_IDS: readonly ModeId[] = ALL_MODES;
export const TASKS: readonly TaskCategory[] = ALL_TASKS;

export function emptyAppData(): AppData {
  return {
    schemaVersion: '2.1',
    profile: { playerLabel: 'プレイヤー', settings: { ...DEFAULT_SETTINGS }, learning: { ...DEFAULT_LEARNING } },
    sessions: [],
    craftBook: [],
  };
}

export function withDefaults(profile: Partial<AppData['profile']> | undefined): AppData['profile'] {
  return {
    playerLabel: typeof profile?.playerLabel === 'string' ? profile.playerLabel : 'プレイヤー',
    settings: { ...DEFAULT_SETTINGS, ...cleanFields(profile?.settings, SETTINGS_RULES).clean } as AccessibilitySettings,
    learning: { ...DEFAULT_LEARNING, ...cleanFields(profile?.learning, LEARNING_RULES).clean } as LearningSettings,
    ...(validBaseline(profile?.scoreBaseline) ? { scoreBaseline: profile!.scoreBaseline } : {}),
    ...(validBaseline(profile?.scoreRules) && profile!.scoreRules!.version === 'v2.15' ? { scoreRules: profile!.scoreRules } : {}),
  };
}

function validBaseline(b: unknown): b is { points: number; at: string } {
  return !!b && typeof (b as { points: unknown }).points === 'number' && typeof (b as { at: unknown }).at === 'string' && !Number.isNaN(new Date((b as { at: string }).at).getTime());
}

// ---------- 匿名化 ----------

/** §11.3: playerLabel と自由記述欄を除く */
export function anonymize(data: AppData): AppData {
  return {
    ...data,
    profile: { ...data.profile, playerLabel: '' },
    sessions: data.sessions.map((s) => {
      const { parentObservation, ...rest } = s;
      if (!parentObservation) return { ...rest };
      const { conditionNote: _c, note: _n, ...keep } = parentObservation;
      return { ...rest, parentObservation: keep };
    }),
  };
}

// ---------- 検証 ----------

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isCount = (x: unknown): x is number => isNum(x) && Number.isInteger(x) && x >= 0;
const isDate = (x: unknown): boolean => typeof x === 'string' && !Number.isNaN(new Date(x).getTime());
const oneOf = (...vs: unknown[]) => (x: unknown) => vs.includes(x);
const isBool = (x: unknown) => typeof x === 'boolean';

type Rules = Record<string, (x: unknown) => boolean>;

// 設定・学習設定の列挙値と範囲。ここに無いキーは取り込まない
const SETTINGS_RULES: Rules = {
  quietMode: isBool,
  soundEnabled: isBool,
  reducedMotion: isBool,
  inputMethod: oneOf('tap', 'drag'),
  showEquationOnRequest: isBool,
  highlightEmptySlots: isBool,
  animationSpeed: oneOf('slow', 'normal', 'instant'),
  effectLevel: oneOf('none', 'calm', 'normal'),
  colorScheme: oneOf('cuisenaire', 'unified', 'mono'),
  tenFrameFill: oneOf('pairs', 'fives'),
  carryFirstOperand: oneOf('larger', 'first'),
  borrowStrategy: oneOf('subtract_from_ten', 'subtract_subtract'),
  fiveToken: isBool,
  directManipulation: isBool,
  rodGrid: isBool,
  numberLabels: isBool,
};
const LEARNING_RULES: Rules = {
  choiceCount: oneOf(2, 3, 4),
  synthesisMax: oneOf(5, 10),
  // 画面（SettingsPanel）の入力範囲に合わせる。画面は小数も保存できるので整数には限らない
  minTrialsForComparison: (x) => isNum(x) && x >= 1 && x <= 100,
  minDaysForComparison: (x) => isNum(x) && x >= 1 && x <= 30,
  idleThresholdMs: (x) => isNum(x) && x >= 1000 && x <= 120000,
  selfReportEnabled: isBool,
  craftBookEnabled: isBool,
  scoreEnabled: isBool,
  roundLength: oneOf(5, 10, 15),
  freeChoice: isBool,
};

/** 規則に合う項目だけを残す。合わない（または知らない）キーは bad に入れる */
function cleanFields(x: unknown, rules: Rules): { clean: Record<string, unknown>; bad: string[] } {
  const clean: Record<string, unknown> = {};
  const bad: string[] = [];
  if (!isObj(x)) return { clean, bad };
  for (const [k, v] of Object.entries(x)) {
    if (!rules[k]) continue; // 知らないキーは黙って捨てる（既定値の補完は withDefaults）
    if (rules[k](v)) clean[k] = v;
    else bad.push(k);
  }
  return { clean, bad };
}

const CRAFT_KINDS = ['sum', 'product', 'prime', 'balance', 'power', 'fraction', 'period', 'shape'];
const OUTCOMES = ['completed', 'skipped', 'abandoned', 'explored'];
const TIMES_OF_DAY = ['morning', 'midday', 'evening', 'night'];
const EVENT_TYPES = ['question_shown', 'input_enabled', 'input_disabled', 'item_selected', 'item_deselected', 'attempt', 'undo', 'prediction_made', 'decision_made', 'hint_requested', 'animation_started', 'animation_ended', 'paused', 'resumed', 'visibility_hidden', 'visibility_visible', 'settings_changed', 'completed', 'skipped', 'abandoned'];
const ASSISTANCE = ['independent', 'after_hint', 'after_demo', 'not_completed'];

/** 試行ひとつの問題点（空なら正常） */
function trialProblems(t: unknown): string[] {
  if (!isObj(t)) return ['不正'];
  const p: string[] = [];
  if (typeof t.trialId !== 'string') p.push('trialId がありません');
  if (!MODE_IDS.includes(t.modeId as ModeId)) p.push('modeId が不明');
  const q = t.question;
  if (!isObj(q) || typeof q.id !== 'string' || !TASKS.includes(q.taskType as TaskCategory) || !Array.isArray(q.operands)) p.push('question が不正');
  else {
    if (!q.operands.every(isNum)) p.push('question.operands に数値でないものがあります');
    if (q.expectedValue !== null && q.expectedValue !== undefined && !isNum(q.expectedValue)) p.push('question.expectedValue が数値ではありません');
  }
  if (!Array.isArray(t.events) || !t.events.every((e) => isObj(e) && EVENT_TYPES.includes(e.type as string) && isNum(e.timestampMs)))
    p.push('events が不正');
  // 旧スナップショットは後から増えた項目が欠けていてよい。オブジェクトであることだけ確かめる
  if (!isObj(t.settingsSnapshot)) p.push('settingsSnapshot が不正');
  if (t.startedAt !== undefined && !isDate(t.startedAt)) p.push('startedAt が日時ではありません');
  if (t.timeOfDay !== undefined && !TIMES_OF_DAY.includes(t.timeOfDay as string)) p.push('timeOfDay が不明');
  if (t.result !== undefined) {
    const r = t.result;
    if (!isObj(r) || !OUTCOMES.includes(r.outcome as string) || !ASSISTANCE.includes(r.assistanceLevel as string) || typeof r.correctWithoutHint !== 'boolean' ||
      !isCount(r.mistakeCount) || !isCount(r.hintCount) || ![0, 1, 2, 3].includes(r.maxHintLevel as number))
      p.push('result が不正');
  }
  return p;
}

/** セッション自体（試行を除く）の問題点 */
function sessionProblems(s: unknown): string[] {
  if (!isObj(s)) return ['オブジェクトではありません'];
  const p: string[] = [];
  if (typeof s.sessionId !== 'string') p.push('sessionId がありません');
  if (!isDate(s.startedAt)) p.push('startedAt が日時ではありません');
  if (s.endedAt !== undefined && !isDate(s.endedAt)) p.push('endedAt が日時ではありません');
  if (s.timeOfDay !== undefined && !TIMES_OF_DAY.includes(s.timeOfDay as string)) p.push('timeOfDay が不明');
  if (!Array.isArray(s.trials)) p.push('trials が配列ではありません');
  return p;
}

function craftProblems(c: unknown): string[] {
  if (!isObj(c)) return ['オブジェクトではありません'];
  const p: string[] = [];
  if (!isNum(c.value)) p.push('value が数値ではありません');
  if (!Array.isArray(c.parts) || !c.parts.every(isNum)) p.push('parts が数値の配列ではありません');
  if (!isDate(c.firstMadeAt)) p.push('firstMadeAt が日時ではありません');
  if (c.modeId !== undefined && !MODE_IDS.includes(c.modeId as ModeId)) p.push('modeId が不明');
  if (c.kind !== undefined && !CRAFT_KINDS.includes(c.kind as string)) p.push('kind が不明');
  return p;
}

/** ファイル全体として読めない問題（これがあると何も取り込まない） */
function fatalProblems(x: unknown): string[] {
  if (!isObj(x)) return ['JSON のトップがオブジェクトではありません'];
  const errs: string[] = [];
  if (x.schemaVersion !== '2.1') errs.push(`schemaVersion が "2.1" ではありません（${String(x.schemaVersion)}）`);
  if (!isObj(x.profile)) errs.push('profile がありません');
  if (!Array.isArray(x.sessions)) errs.push('sessions が配列ではありません');
  if (x.craftBook !== undefined && !Array.isArray(x.craftBook)) errs.push('craftBook が配列ではありません');
  return errs;
}

/** 厳密な検証。項目の問題もすべて列挙する（取り込みは sanitizeAppData を使う） */
export function validateAppData(x: unknown): string[] {
  const errs = fatalProblems(x);
  if (!isObj(x) || !Array.isArray(x.sessions)) return errs;
  x.sessions.forEach((s, i) => {
    if (errs.length > 20) return;
    const sp = sessionProblems(s);
    sp.forEach((m) => errs.push(`sessions[${i}].${m}`));
    if (isObj(s) && Array.isArray(s.trials))
      s.trials.forEach((t, j) => trialProblems(t).forEach((m) => errs.push(`sessions[${i}].trials[${j}].${m}`)));
  });
  if (Array.isArray(x.craftBook)) x.craftBook.forEach((c, i) => craftProblems(c).forEach((m) => errs.push(`craftBook[${i}].${m}`)));
  if (isObj(x.profile)) {
    cleanFields(x.profile.settings, SETTINGS_RULES).bad.forEach((k) => errs.push(`profile.settings.${k} が不正`));
    cleanFields(x.profile.learning, LEARNING_RULES).bad.forEach((k) => errs.push(`profile.learning.${k} が不正`));
  }
  return errs;
}

export interface RejectedCounts {
  /** 取り込まないセッション（自体が不正、または試行がすべて不正） */
  sessions: number;
  trials: number;
  craft: number;
  /** 不正で既定値に戻した設定のキー */
  settingKeys: string[];
}

/** 項目単位で検証し、正常な項目だけの AppData を返す。ファイル全体が読めないときは data が null */
export function sanitizeAppData(raw: unknown): { fatal: string[]; data: AppData | null; rejected: RejectedCounts } {
  const rejected: RejectedCounts = { sessions: 0, trials: 0, craft: 0, settingKeys: [] };
  const fatal = fatalProblems(raw);
  if (fatal.length) return { fatal, data: null, rejected };
  const d = raw as Record<string, unknown>;
  const sessions: Session[] = [];
  for (const s of d.sessions as unknown[]) {
    if (sessionProblems(s).length) {
      rejected.sessions++;
      continue;
    }
    const src = s as unknown as Session;
    const trials = src.trials.filter((t) => !trialProblems(t).length);
    rejected.trials += src.trials.length - trials.length;
    if (src.trials.length > 0 && trials.length === 0) {
      rejected.sessions++;
      continue;
    }
    sessions.push(trials.length === src.trials.length ? src : { ...src, trials });
  }
  const craftBook: CraftEntry[] = [];
  for (const c of (d.craftBook as unknown[] | undefined) ?? []) {
    if (craftProblems(c).length) rejected.craft++;
    else craftBook.push(c as CraftEntry);
  }
  const prof = d.profile as Record<string, unknown>;
  rejected.settingKeys = [...cleanFields(prof.settings, SETTINGS_RULES).bad, ...cleanFields(prof.learning, LEARNING_RULES).bad];
  const profile = withDefaults(prof as unknown as Partial<AppData['profile']>);
  return { fatal, data: { ...(d as unknown as AppData), profile, sessions, craftBook }, rejected };
}

export interface ImportPreview {
  format: 'v2.1' | 'v1';
  errors: string[];
  data: AppData | null;
  sessionCount: number;
  trialCount: number;
  /** 既存データとの重複 */
  duplicateSessionIds: string[];
  duplicateTrialIds: string[];
  /** ファイルの中での重複（マージでは最初の1件だけ取り込む） */
  internalDuplicateSessionIds: string[];
  internalDuplicateTrialIds: string[];
  /** 項目単位で取り込まないもの */
  rejected: RejectedCounts;
  migration?: MigrationReport;
}

const NO_REJECTED = (): RejectedCounts => ({ sessions: 0, trials: 0, craft: 0, settingKeys: [] });

function duplicatesIn(ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

export function previewImport(text: string, current: AppData): ImportPreview {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { format: 'v2.1', errors: ['JSON として読み込めません'], data: null, sessionCount: 0, trialCount: 0, duplicateSessionIds: [], duplicateTrialIds: [], internalDuplicateSessionIds: [], internalDuplicateTrialIds: [], rejected: NO_REJECTED() };
  }
  let data: AppData | null = null;
  let format: 'v2.1' | 'v1' = 'v2.1';
  let errors: string[] = [];
  let migration: MigrationReport | undefined;
  let rejected = NO_REJECTED();
  if (isObj(raw) && Array.isArray(raw.logs) && raw.schemaVersion === undefined) {
    format = 'v1';
    const m = migrateV1Checked(raw);
    errors = m.errors;
    migration = m.report;
    if (!m.errors.length) {
      data = m.data;
      rejected = m.rejected;
    }
  } else {
    const r = sanitizeAppData(raw);
    errors = r.fatal;
    data = r.data;
    rejected = r.rejected;
  }
  const existing = new Set(current.sessions.map((s) => s.sessionId));
  const existingTrials = new Set(current.sessions.flatMap((s) => s.trials.map((t) => t.trialId)));
  const sessions = data?.sessions ?? [];
  const trialIds = sessions.flatMap((s) => s.trials.map((t) => t.trialId));
  return {
    format,
    errors,
    data,
    sessionCount: sessions.length,
    trialCount: trialIds.length,
    duplicateSessionIds: sessions.filter((s) => existing.has(s.sessionId)).map((s) => s.sessionId),
    duplicateTrialIds: trialIds.filter((id) => existingTrials.has(id)),
    internalDuplicateSessionIds: duplicatesIn(sessions.map((s) => s.sessionId)),
    internalDuplicateTrialIds: duplicatesIn(trialIds),
    rejected,
    migration,
  };
}

/** 既存に無いセッションだけを足す。図鑑は (value, parts) で重複を除く */
export function mergeData(current: AppData, incoming: AppData): AppData {
  const ids = new Set(current.sessions.map((s) => s.sessionId));
  const sessions = [...current.sessions];
  const seenTrials = new Set<string>();
  for (const s of incoming.sessions) {
    if (ids.has(s.sessionId)) continue;
    ids.add(s.sessionId); // ファイル内で同じIDが続いても最初の1件だけ
    // 試行IDもファイルの中では最初の1件だけ（既存データとの重複は従来どおり）
    const trials = s.trials.filter((t) => !seenTrials.has(t.trialId) && !!seenTrials.add(t.trialId));
    sessions.push(trials.length === s.trials.length ? s : { ...s, trials });
  }
  sessions.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  return { ...current, sessions, craftBook: mergeCraft(current.craftBook ?? [], incoming.craftBook ?? []) };
}

export function craftKey(e: Pick<CraftEntry, 'value' | 'parts' | 'kind'>): string {
  // sum（v2.1 の記録には kind がない）は前と同じキー。ほかの種類は種類名を前につけて区別する
  const head = e.kind && e.kind !== 'sum' ? `${e.kind}:` : '';
  return `${head}${e.value}=${e.parts.join('+')}`;
}

export function mergeCraft(a: CraftEntry[], b: CraftEntry[]): CraftEntry[] {
  const map = new Map<string, CraftEntry>();
  for (const e of [...a, ...b]) {
    const k = craftKey(e);
    const prev = map.get(k);
    if (!prev || new Date(e.firstMadeAt) < new Date(prev.firstMadeAt)) map.set(k, e);
  }
  return [...map.values()];
}

// ---------- v1 からの移行（§11.4） ----------

export interface MigrationReport {
  logCount: number;
  trialCount: number;
  sessionCount: number;
  skipped: number;
  /** fatigueWarning は移行しない。件数だけ残す */
  droppedFatigueWarnings: number;
}

function v1Mode(id: unknown): ModeId | null {
  const s = String(id ?? '');
  if (s.startsWith('mode_a')) return 'mode_a_parity';
  if (s.startsWith('mode_b')) return 'mode_b_rods';
  if (s.startsWith('mode_c')) return 'mode_c_tenframe';
  if (s.startsWith('mode_d')) return 'mode_d_exchange';
  return null;
}

/** UTC の時刻を日本時間のオフセット付きISO8601にする */
export function toJstIso(utc: string): string {
  const d = new Date(utc);
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  return j.toISOString().replace(/\.\d{3}Z$/, '+09:00');
}

function jstHourTimeOfDay(iso: string): Session['timeOfDay'] {
  const h = Number(toJstIso(iso).slice(11, 13));
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 16) return 'midday';
  if (h >= 16 && h < 19) return 'evening';
  return 'night';
}

export function migrateV1(raw: Record<string, unknown>): { data: AppData; report: MigrationReport; errors: string[] } {
  const logs = Array.isArray(raw.logs) ? (raw.logs as Record<string, unknown>[]) : [];
  const report: MigrationReport = { logCount: logs.length, trialCount: 0, sessionCount: 0, skipped: 0, droppedFatigueWarnings: 0 };
  const errors: string[] = [];
  const p = isObj(raw.profile) ? raw.profile : {};
  const ps = isObj(p.settings) ? p.settings : {};
  const settings: AccessibilitySettings = {
    ...DEFAULT_SETTINGS,
    ...(typeof ps.soundEnabled === 'boolean' ? { soundEnabled: ps.soundEnabled } : {}),
    ...(typeof ps.highlightEmptySlots === 'boolean' ? { highlightEmptySlots: ps.highlightEmptySlots } : {}),
    ...(ps.autoSplitAnimationSpeed === 'slow' || ps.autoSplitAnimationSpeed === 'normal' ? { animationSpeed: ps.autoSplitAnimationSpeed } : {}),
  };
  const byDay = new Map<string, Session>();
  const sorted = logs
    .filter((l) => isObj(l) && typeof l.timestamp === 'string' && !Number.isNaN(new Date(l.timestamp).getTime()))
    .sort((a, b) => new Date(String(a.timestamp)).getTime() - new Date(String(b.timestamp)).getTime());
  report.skipped += logs.length - sorted.length;
  for (const l of sorted) {
    if (l.fatigueWarning === true) report.droppedFatigueWarnings++;
    const mode = v1Mode(l.modeId);
    const task = TASKS.includes(l.taskCategory as TaskCategory) ? (l.taskCategory as TaskCategory) : null;
    const numbers = Array.isArray(l.numbers) ? (l.numbers as unknown[]).filter((n): n is number => typeof n === 'number') : [];
    if (!mode || !task) {
      report.skipped++;
      continue;
    }
    const ts = String(l.timestamp);
    const day = jstDateKey(ts);
    let s = byDay.get(day);
    if (!s) {
      s = { sessionId: `v1-${day}`, startedAt: toJstIso(ts), timeOfDay: jstHourTimeOfDay(ts), endReason: 'unknown', trials: [] };
      byDay.set(day, s);
    }
    const isCorrect = l.isCorrect === true;
    const usedHint = l.usedHint === true;
    const result: TrialResult = {
      outcome: 'completed',
      assistanceLevel: isCorrect ? (usedHint ? 'after_hint' : 'independent') : 'not_completed',
      correctWithoutHint: isCorrect && !usedHint,
      mistakeCount: typeof l.mistakeCount === 'number' ? l.mistakeCount : 0,
      hintCount: usedHint ? 1 : 0,
      maxHintLevel: usedHint ? 1 : 0,
    };
    const expected = typeof l.targetAnswer === 'number' ? l.targetAnswer : numbers.length ? expectedValueOf(task, numbers) : null;
    const legacyEvent: GameEvent = {
      type: 'completed',
      timestampMs: 0,
      payload: { legacy: true, ...(typeof l.responseTimeMs === 'number' ? { legacyResponseTimeMs: l.responseTimeMs } : {}) },
    };
    s.trials.push({
      trialId: typeof l.id === 'string' ? `v1-${l.id}` : `v1-${day}-${s.trials.length}`,
      orderInSession: s.trials.length + 1,
      modeId: mode,
      question: {
        id: numbers.length ? questionId(task, numbers) : `${task}:${String(l.problemKey ?? '')}`,
        taskType: task,
        operation: OPERATION_OF[task],
        operands: numbers,
        expectedValue: expected,
        representation: mode,
        strategy: strategyFor(task, mode, settings),
        distractors: [],
        difficulty: 0,
        variantId: `legacy:${String(l.problemKey ?? '')}`,
        learningStage: 'construct',
      },
      settingsSnapshot: settings,
      events: [legacyEvent],
      result,
      startedAt: toJstIso(ts),
      timeOfDay: jstHourTimeOfDay(ts),
    });
    report.trialCount++;
  }
  const sessions = [...byDay.values()];
  report.sessionCount = sessions.length;
  const data: AppData = {
    schemaVersion: '2.1',
    profile: withDefaults({ playerLabel: typeof p.playerName === 'string' ? p.playerName : 'プレイヤー', settings }),
    sessions,
    craftBook: [],
  };
  return { data, report, errors };
}

/**
 * v1 を移行し、v2.1 と同じ項目検証を通す。ファイル取り込みと起動時の自動移行の共通入口。
 * 除外された試行は移行レポートの trialCount から引き、skipped に加える。
 */
export function migrateV1Checked(raw: Record<string, unknown>): { data: AppData; report: MigrationReport; errors: string[]; rejected: RejectedCounts } {
  const m = migrateV1(raw);
  if (m.errors.length) return { ...m, rejected: NO_REJECTED() };
  const r = sanitizeAppData(m.data);
  const data = r.data ?? m.data;
  const kept = data.sessions.reduce((n, s) => n + s.trials.length, 0);
  const dropped = m.report.trialCount - kept;
  const report = { ...m.report, trialCount: kept, sessionCount: data.sessions.length, skipped: m.report.skipped + dropped };
  return { data, report, errors: m.errors, rejected: r.rejected };
}

// ---------- CSV（§11.3: セッション・試行・イベントを別出力） ----------

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  // Excel で文字化けしないよう BOM を付ける
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function sessionsCsv(data: AppData): string {
  const header = ['sessionId', 'startedAt', 'endedAt', 'timeOfDay', 'endReason', 'trialCount', 'childSelfReport', 'enjoyment', 'conditionNote', 'note'];
  return toCsv(
    header,
    data.sessions.map((s) => [
      s.sessionId,
      s.startedAt,
      s.endedAt,
      s.timeOfDay,
      s.endReason,
      s.trials.length,
      s.childSelfReport,
      s.parentObservation?.enjoyment,
      s.parentObservation?.conditionNote,
      s.parentObservation?.note,
    ]),
  );
}

export function trialsCsv(data: AppData, idleThresholdMs: number): string {
  const header = [
    'sessionId', 'trialId', 'orderInSession', 'startedAt', 'timeOfDay', 'modeId', 'questionId', 'taskType', 'operation', 'operands',
    'expectedValue', 'strategy', 'learningStage', 'variantId', 'difficulty', 'outcome', 'assistanceLevel', 'correctWithoutHint',
    'mistakeCount', 'hintCount', 'maxHintLevel', 'firstActionLatencyMs', 'activeInteractionMs', 'animationDurationMs', 'idleDurationMs',
    'colorScheme', 'inputMethod', 'tenFrameFill', 'borrowStrategy', 'fiveToken', 'effectLevel', 'animationSpeed', 'quietMode',
  ];
  const rows: unknown[][] = [];
  for (const s of data.sessions)
    for (const t of s.trials) {
      const m = computeMetrics(t.events, idleThresholdMs);
      const r = t.result;
      const st = t.settingsSnapshot;
      rows.push([
        s.sessionId, t.trialId, t.orderInSession, t.startedAt ?? s.startedAt, t.timeOfDay ?? s.timeOfDay, t.modeId, t.question.id,
        t.question.taskType, t.question.operation, t.question.operands.join('|'), t.question.expectedValue, t.question.strategy,
        t.question.learningStage, t.question.variantId, t.question.difficulty, r?.outcome, r?.assistanceLevel, r?.correctWithoutHint,
        r?.mistakeCount, r?.hintCount, r?.maxHintLevel, m.firstActionLatencyMs, m.activeInteractionMs, m.animationDurationMs,
        m.idleDurationMs, st.colorScheme, st.inputMethod, st.tenFrameFill, st.borrowStrategy, st.fiveToken, st.effectLevel,
        st.animationSpeed, st.quietMode,
      ]);
    }
  return toCsv(header, rows);
}

export function eventsCsv(data: AppData): string {
  const header = ['sessionId', 'trialId', 'seq', 'type', 'timestampMs', 'payload'];
  const rows: unknown[][] = [];
  for (const s of data.sessions)
    for (const t of s.trials) t.events.forEach((e, i) => rows.push([s.sessionId, t.trialId, i, e.type, Math.round(e.timestampMs), e.payload ?? '']));
  return toCsv(header, rows);
}

export function exportFileName(kind: string, ext: string): string {
  const stamp = isoWithOffset().slice(0, 16).replace(/[:T]/g, '-');
  return `math-craft-${kind}-${stamp}.${ext}`;
}

