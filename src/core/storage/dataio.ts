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
    settings: { ...DEFAULT_SETTINGS, ...(profile?.settings ?? {}) } as AccessibilitySettings,
    learning: { ...DEFAULT_LEARNING, ...(profile?.learning ?? {}) } as LearningSettings,
    ...(validBaseline(profile?.scoreBaseline) ? { scoreBaseline: profile!.scoreBaseline } : {}),
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

export function validateAppData(x: unknown): string[] {
  const errs: string[] = [];
  if (!isObj(x)) return ['JSON のトップがオブジェクトではありません'];
  if (x.schemaVersion !== '2.1') errs.push(`schemaVersion が "2.1" ではありません（${String(x.schemaVersion)}）`);
  if (!isObj(x.profile)) errs.push('profile がありません');
  if (!Array.isArray(x.sessions)) return [...errs, 'sessions が配列ではありません'];
  x.sessions.forEach((s, i) => {
    if (errs.length > 20) return;
    if (!isObj(s)) return void errs.push(`sessions[${i}] がオブジェクトではありません`);
    if (typeof s.sessionId !== 'string') errs.push(`sessions[${i}].sessionId がありません`);
    if (typeof s.startedAt !== 'string' || Number.isNaN(new Date(s.startedAt).getTime())) errs.push(`sessions[${i}].startedAt が日時ではありません`);
    if (!Array.isArray(s.trials)) return void errs.push(`sessions[${i}].trials が配列ではありません`);
    s.trials.forEach((t, j) => {
      if (!isObj(t)) return void errs.push(`sessions[${i}].trials[${j}] が不正`);
      if (typeof t.trialId !== 'string') errs.push(`sessions[${i}].trials[${j}].trialId がありません`);
      if (!MODE_IDS.includes(t.modeId as ModeId)) errs.push(`sessions[${i}].trials[${j}].modeId が不明`);
      const q = t.question;
      if (!isObj(q) || typeof q.id !== 'string' || !TASKS.includes(q.taskType as TaskCategory) || !Array.isArray(q.operands))
        errs.push(`sessions[${i}].trials[${j}].question が不正`);
      if (!Array.isArray(t.events) || !t.events.every((e) => isObj(e) && typeof e.type === 'string' && typeof e.timestampMs === 'number'))
        errs.push(`sessions[${i}].trials[${j}].events が不正`);
    });
  });
  if (x.craftBook !== undefined && !Array.isArray(x.craftBook)) errs.push('craftBook が配列ではありません');
  return errs;
}

export interface ImportPreview {
  format: 'v2.1' | 'v1';
  errors: string[];
  data: AppData | null;
  sessionCount: number;
  trialCount: number;
  duplicateSessionIds: string[];
  duplicateTrialIds: string[];
  migration?: MigrationReport;
}

export function previewImport(text: string, current: AppData): ImportPreview {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { format: 'v2.1', errors: ['JSON として読み込めません'], data: null, sessionCount: 0, trialCount: 0, duplicateSessionIds: [], duplicateTrialIds: [] };
  }
  let data: AppData | null = null;
  let format: 'v2.1' | 'v1' = 'v2.1';
  let errors: string[] = [];
  let migration: MigrationReport | undefined;
  if (isObj(raw) && Array.isArray(raw.logs) && raw.schemaVersion === undefined) {
    format = 'v1';
    const m = migrateV1(raw);
    errors = m.errors;
    migration = m.report;
    data = m.errors.length ? null : m.data;
  } else {
    errors = validateAppData(raw);
    if (!errors.length) {
      const d = raw as unknown as AppData;
      data = { ...d, profile: withDefaults(d.profile), craftBook: d.craftBook ?? [] };
    }
  }
  const existing = new Set(current.sessions.map((s) => s.sessionId));
  const existingTrials = new Set(current.sessions.flatMap((s) => s.trials.map((t) => t.trialId)));
  const seenTrials = new Set<string>();
  const dupTrials: string[] = [];
  for (const s of data?.sessions ?? [])
    for (const t of s.trials) {
      if (seenTrials.has(t.trialId) || existingTrials.has(t.trialId)) dupTrials.push(t.trialId);
      seenTrials.add(t.trialId);
    }
  return {
    format,
    errors,
    data,
    sessionCount: data?.sessions.length ?? 0,
    trialCount: data?.sessions.reduce((n, s) => n + s.trials.length, 0) ?? 0,
    duplicateSessionIds: (data?.sessions ?? []).filter((s) => existing.has(s.sessionId)).map((s) => s.sessionId),
    duplicateTrialIds: dupTrials,
    migration,
  };
}

/** 既存に無いセッションだけを足す。図鑑は (value, parts) で重複を除く */
export function mergeData(current: AppData, incoming: AppData): AppData {
  const ids = new Set(current.sessions.map((s) => s.sessionId));
  const sessions = [...current.sessions, ...incoming.sessions.filter((s) => !ids.has(s.sessionId))];
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

