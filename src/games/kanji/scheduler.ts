import { getProgress, getSetting, setProgress, setSetting } from '../../core/storage/db';
import { KANJI_ENTRIES } from './data';
import { REVIEW_INTERVALS_MS, type KanjiEntry, type KanjiProgress } from './types';

// SPEC §6.4 出題アルゴリズム: 未習1 : 復習2 で混ぜる（間隔反復の簡易版）。

export type KanjiProgressMap = Record<string, KanjiProgress>;

const KEY = 'kanji.progress';
const ENABLED_KEY = 'kanji.enabledIds'; // 保護者画面の出題範囲（SPEC §4.7-⑤）

// 出題範囲。未設定（null）= 全字有効。
export async function loadEnabledKanjiIds(): Promise<string[] | null> {
  return getSetting<string[] | null>(ENABLED_KEY, null);
}

export async function saveEnabledKanjiIds(ids: string[] | null): Promise<void> {
  await setSetting(ENABLED_KEY, ids);
}

export function enabledEntries(enabledIds: string[] | null): KanjiEntry[] {
  if (!enabledIds) return KANJI_ENTRIES;
  const set = new Set(enabledIds);
  const filtered = KANJI_ENTRIES.filter((e) => set.has(e.id));
  // 全部オフは事故（出題ゼロ）なので全字にフォールバック
  return filtered.length > 0 ? filtered : KANJI_ENTRIES;
}

export async function loadKanjiProgress(): Promise<KanjiProgressMap> {
  return getProgress<KanjiProgressMap>(KEY, {});
}

export async function saveKanjiProgress(map: KanjiProgressMap): Promise<void> {
  await setProgress(KEY, map);
}

export function defaultProgress(): KanjiProgress {
  return { level: 1, completions: 0, mastered: false, recallStar: false, dueAt: 0 };
}

// 完成時の進行更新: レベルは1段階ずつ上がり、Lv3ノーヒント完成でマスター
export function advanceProgress(p: KanjiProgress, hintUsed: boolean, now: number): KanjiProgress {
  const mastered = p.mastered || (p.level === 3 && !hintUsed);
  const level = (p.level < 3 ? p.level + 1 : 3) as 1 | 2 | 3;
  const interval = REVIEW_INTERVALS_MS[Math.min(p.completions, REVIEW_INTERVALS_MS.length - 1)];
  return {
    ...p,
    level,
    mastered,
    completions: p.completions + 1,
    dueAt: now + interval,
  };
}

// 次の出題を選ぶ。reviewStreak: 直近の連続復習回数（2で未習を挟む）。
export function pickNext(
  map: KanjiProgressMap,
  reviewStreak: number,
  now: number,
  excludeId?: string,
  pool: KanjiEntry[] = KANJI_ENTRIES,
): { entry: KanjiEntry; isReview: boolean } | null {
  const unseen = pool.filter((e) => !map[e.id] && e.id !== excludeId);
  const seen = pool.filter((e) => map[e.id] && e.id !== excludeId);
  const due = seen.filter((e) => map[e.id].dueAt <= now);

  const wantNew = reviewStreak >= 2 || due.length === 0;
  if (wantNew && unseen.length > 0) {
    return { entry: unseen[0], isReview: false };
  }
  if (due.length > 0) {
    // 期限を過ぎているものから順に
    due.sort((a, b) => map[a.id].dueAt - map[b.id].dueAt);
    return { entry: due[0], isReview: true };
  }
  if (unseen.length > 0) {
    return { entry: unseen[0], isReview: false };
  }
  if (seen.length > 0) {
    // すべて習得済み・期限前: いちばん古いものを復習
    seen.sort((a, b) => map[a.id].dueAt - map[b.id].dueAt);
    return { entry: seen[0], isReview: true };
  }
  return null;
}

// 想起チェック用のダミー選択肢2つ
export function pickDistractors(target: KanjiEntry): KanjiEntry[] {
  // 出題範囲外でも「見分ける」だけなので全字から選んでよい
  const others = KANJI_ENTRIES.filter((e) => e.id !== target.id);
  const shuffled = [...others].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}
