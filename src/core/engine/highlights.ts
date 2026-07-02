import { getAllSessions, type PlayRecord, type SessionRecord } from '../storage/db';

// SPEC §4.6 — ハイライト「きのうのきみ」選定。
// 優先順: ①初完成の漢字（P2以降） ②自己ベスト更新の迷路 ③最後にクリアしたレベル。

export interface Highlight {
  play: PlayRecord;
  reason: 'first-kanji' | 'self-best' | 'last-clear';
}

function mazeOutRatio(p: PlayRecord): number | null {
  const v = p.metrics['outRatio'];
  return typeof v === 'number' ? v : null;
}

function levelNumber(p: PlayRecord): number {
  const m = /(\d+)/.exec(p.levelId);
  return m ? parseInt(m[1], 10) : 0;
}

export function selectHighlights(
  target: SessionRecord,
  history: SessionRecord[], // target より前のセッション群
  max = 3,
): Highlight[] {
  const picks: Highlight[] = [];
  const completed = target.plays.filter((p) => p.completed && p.replay && p.replay.length > 10);
  if (completed.length === 0) return picks;

  const pastPlays = history.flatMap((s) => s.plays).filter((p) => p.completed);

  // ①初完成の漢字（モードB）: 初めて組み上がった瞬間を最優先で見せる
  const firstKanji = completed.filter(
    (p) => p.game === 'kanji' && p.metrics['firstComplete'] === true,
  );
  for (const p of firstKanji) {
    if (picks.length < max) picks.push({ play: p, reason: 'first-kanji' });
  }

  // ②自己ベスト: 過去より低い outRatio、または過去最高レベルの更新
  const pastBestOut = Math.min(
    ...pastPlays.map((p) => mazeOutRatio(p) ?? Infinity),
    Infinity,
  );
  const pastMaxLevel = Math.max(...pastPlays.map(levelNumber), 0);

  const bestOutPlay = completed
    .filter((p) => mazeOutRatio(p) !== null && mazeOutRatio(p)! < pastBestOut)
    .sort((a, b) => mazeOutRatio(a)! - mazeOutRatio(b)!)[0];
  const newLevelPlay = completed
    .filter((p) => levelNumber(p) > pastMaxLevel)
    .sort((a, b) => levelNumber(b) - levelNumber(a))[0];

  const selfBest = newLevelPlay ?? bestOutPlay;
  if (selfBest && !picks.some((h) => h.play === selfBest)) {
    picks.push({ play: selfBest, reason: 'self-best' });
  }

  // ③最後にクリアしたレベル
  const last = completed[completed.length - 1];
  if (last && !picks.some((h) => h.play === last)) {
    picks.push({ play: last, reason: 'last-clear' });
  }

  return picks.slice(0, max);
}

// 翌回起動用: 直近の終了済みセッションからハイライトを選ぶ
export async function selectLaunchHighlights(): Promise<Highlight[]> {
  const sessions = (await getAllSessions())
    .filter((s) => s.endedAt > 0)
    .sort((a, b) => a.startedAt - b.startedAt);
  const latest = sessions[sessions.length - 1];
  if (!latest) return [];
  return selectHighlights(latest, sessions.slice(0, -1), 2);
}
