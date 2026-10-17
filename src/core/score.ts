// 実装拡張（v2.2・保護者判断）: てんすう・ランク・ラウンド・植物の成長。
// 記録（試行の結果）から毎回計算する純粋関数。保存するのは試行の roundId だけ。
// 守ること: 点は減らない（間違い・スキップで引かない）／速さで点を変えない／連続正解の倍率やコンボを付けない。

import type { AppData, Session, Trial } from './types';

export const POINTS = {
  independent: 10,
  after_hint: 6,
  after_demo: 4,
  /** 予測が外れても、最後まで見たら */
  tried: 2,
  /** 観察を最後まで見た */
  observed: 2,
  /** 別の世界（表現横断）でもできた */
  transferBonus: 5,
  /** 図鑑に新しい組み合わせが増えた */
  newCraft: 5,
} as const;

/**
 * 観察・探索を本人が「みた！」まで進めたか。
 * 途中で離れた観察もエンジンは explored で閉じる（§17）ので、終わりまで見たかは finished の合図で見分ける。
 */
export function exploredToEnd(t: Pick<Trial, 'result' | 'events'>): boolean {
  return t.result?.outcome === 'explored' && t.events.some((e) => e.type === 'input_disabled' && e.payload?.reason === 'finished');
}

/** 1問の点（0以上） */
export function trialPoints(t: Pick<Trial, 'question' | 'result' | 'events'>): number {
  const r = t.result;
  if (!r) return 0;
  if (r.outcome === 'explored') return t.question.learningStage === 'observe' && exploredToEnd(t) ? POINTS.observed : 0;
  if (r.outcome !== 'completed') return 0;
  let p: number;
  switch (r.assistanceLevel) {
    case 'independent':
      p = POINTS.independent;
      break;
    case 'after_hint':
      p = POINTS.after_hint;
      break;
    case 'after_demo':
      p = POINTS.after_demo;
      break;
    default:
      p = POINTS.tried;
  }
  if (t.question.learningStage === 'transfer' && r.assistanceLevel !== 'not_completed') p += POINTS.transferBonus;
  return p;
}

export function allTrials(sessions: Session[]): Trial[] {
  return sessions.flatMap((s) => s.trials);
}

/** これまでの合計点 */
export function totalPoints(data: Pick<AppData, 'sessions' | 'craftBook'>): number {
  return allTrials(data.sessions).reduce((sum, t) => sum + trialPoints(t), 0) + (data.craftBook?.length ?? 0) * POINTS.newCraft;
}

// ---------- ランク（植物の成長） ----------

export interface Rank {
  level: number;
  name: string;
  /** このランクになる合計点 */
  min: number;
}

export const RANKS: Rank[] = [
  { level: 0, name: 'たね', min: 0 },
  { level: 1, name: 'めばえ', min: 30 },
  { level: 2, name: 'ふたば', min: 100 },
  { level: 3, name: 'わかば', min: 200 },
  { level: 4, name: 'つぼみ', min: 350 },
  { level: 5, name: 'はな', min: 550 },
  { level: 6, name: 'み', min: 800 },
  { level: 7, name: 'き', min: 1100 },
  { level: 8, name: 'おおきな き', min: 1500 },
  { level: 9, name: 'もり', min: 2000 },
];

export function rankOf(points: number): Rank {
  let r = RANKS[0];
  for (const x of RANKS) if (points >= x.min) r = x;
  return r;
}

/** つぎのランク（最後のランクなら null） */
export function nextRank(points: number): Rank | null {
  return RANKS.find((x) => x.min > points) ?? null;
}

// ---------- ラウンド ----------

export interface RoundRecord {
  roundId: string;
  modeId: Trial['modeId'];
  startedAt: string;
  points: number;
  /** 数に入る試行（中断 abandoned 以外） */
  count: number;
}

/** ラウンドの試行として数えるか（途中で離れた試行は数えない） */
export function countsInRound(t: Trial): boolean {
  if (!t.result || t.result.outcome === 'abandoned') return false;
  return t.result.outcome !== 'explored' || exploredToEnd(t);
}

export function roundsOf(sessions: Session[]): RoundRecord[] {
  const map = new Map<string, RoundRecord>();
  for (const s of sessions)
    for (const t of s.trials) {
      if (!t.roundId) continue;
      let r = map.get(t.roundId);
      if (!r) {
        r = { roundId: t.roundId, modeId: t.modeId, startedAt: t.startedAt ?? s.startedAt, points: 0, count: 0 };
        map.set(t.roundId, r);
      }
      if (countsInRound(t)) {
        r.count++;
        r.points += trialPoints(t);
      }
    }
  return [...map.values()];
}

/** 自分の記録のランキング（さいごまでやったラウンドだけ・点の高い順・同点は新しい方が上） */
export function ranking(sessions: Session[], roundLength: number, limit = 5): RoundRecord[] {
  return roundsOf(sessions)
    .filter((r) => r.count >= roundLength)
    .sort((a, b) => b.points - a.points || new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
}
