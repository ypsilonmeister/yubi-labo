// 実装拡張（v2.2・保護者判断）: てんすう・ランク・ラウンド・植物の成長。
// 記録（試行の結果）から毎回計算する純粋関数。保存するのは試行の roundId だけ。
// 守ること: 点は減らない（間違い・スキップで引かない）／速さで点を変えない／連続正解の倍率やコンボを付けない。
// v2.5: あてずっぽうで当てても点が伸びないよう、1回目でぴったりを一番高くした。付け方を変える前の点は基準点（ScoreBaseline）として残す。

import type { AppData, CraftEntry, Session, Trial } from './types';

/**
 * v2.5 の点（2026-10-20 から）。あてずっぽうで当てても点が伸びないように、
 * 「ためしてから当たった」ときだけ低くする。ほかは v2.2 と同じ（楽しく進めることは変えない）。
 * 間違いで点を「引く」ことはしない（0 より下にならない）。速さでは変えない。
 */
export const POINTS = {
  /** ヒントなし・1回目でぴったり */
  firstTry: 10,
  /** ためしてから当たった（ヒントのあとも同じ） */
  foundByTrying: 3,
  /** ヒントのあと、1回目でぴったり */
  afterHintFirstTry: 6,
  /** 実演を見たあと */
  afterDemo: 4,
  /** 予測が外れた（最後まで見た） */
  tried: 2,
  /** 観察を最後まで見た */
  observed: 2,
  /** 別の世界（表現横断）でも 1回目でぴったり */
  transferBonus: 5,
  /** 図鑑に新しい発見が増えた */
  newCraft: 5,
} as const;

/** v2.2〜v2.4 の点（基準点 baseline に入っている分の計算と、それ以前のラウンドの点に使う） */
export const POINTS_V1 = { independent: 10, after_hint: 6, after_demo: 4, tried: 2, observed: 2, transferBonus: 5, newCraft: 5 } as const;

/**
 * 観察・探索を本人が「みた！」まで進めたか。
 * 途中で離れた観察もエンジンは explored で閉じる（§17）ので、終わりまで見たかは finished の合図で見分ける。
 */
export function exploredToEnd(t: Pick<Trial, 'result' | 'events'>): boolean {
  return t.result?.outcome === 'explored' && t.events.some((e) => e.type === 'input_disabled' && e.payload?.reason === 'finished');
}

/** 1回目でぴったり（ヒントなし・間違いなし） */
export function isFirstTry(t: Pick<Trial, 'result'>): boolean {
  const r = t.result;
  return !!r && r.outcome === 'completed' && r.assistanceLevel === 'independent' && r.mistakeCount === 0;
}

/** 1問の点（v2.5。0以上） */
export function trialPoints(t: Pick<Trial, 'question' | 'result' | 'events'>): number {
  const r = t.result;
  if (!r) return 0;
  if (r.outcome === 'explored') return t.question.learningStage === 'observe' && exploredToEnd(t) ? POINTS.observed : 0;
  if (r.outcome !== 'completed') return 0;
  const clean = r.mistakeCount === 0;
  let p: number;
  switch (r.assistanceLevel) {
    case 'independent':
      p = clean ? POINTS.firstTry : POINTS.foundByTrying;
      break;
    case 'after_hint':
      p = clean ? POINTS.afterHintFirstTry : POINTS.foundByTrying;
      break;
    case 'after_demo':
      p = POINTS.afterDemo;
      break;
    default:
      p = POINTS.tried;
  }
  if (t.question.learningStage === 'transfer' && isFirstTry(t)) p += POINTS.transferBonus;
  return p;
}

/** v2.2〜v2.4 の1問の点 */
export function trialPointsV1(t: Pick<Trial, 'question' | 'result' | 'events'>): number {
  const r = t.result;
  if (!r) return 0;
  if (r.outcome === 'explored') return t.question.learningStage === 'observe' && exploredToEnd(t) ? POINTS_V1.observed : 0;
  if (r.outcome !== 'completed') return 0;
  const p = r.assistanceLevel === 'independent' ? POINTS_V1.independent : r.assistanceLevel === 'after_hint' ? POINTS_V1.after_hint : r.assistanceLevel === 'after_demo' ? POINTS_V1.after_demo : POINTS_V1.tried;
  return p + (t.question.learningStage === 'transfer' && r.assistanceLevel !== 'not_completed' ? POINTS_V1.transferBonus : 0);
}

export function allTrials(sessions: Session[]): Trial[] {
  return sessions.flatMap((s) => s.trials);
}

/**
 * 点の付け方を変えたときの基準点（profile に1回だけ保存する）。
 * at より前の記録は points にまとめて入っていて、at 以後の記録だけを v2.5 の点で足す。
 * 点の付け方を変えても、それまでに取った点・ランクが下がらないようにするため。
 */
export interface ScoreBaseline {
  points: number;
  at: string;
}

const ms = (iso: string | undefined) => (iso ? new Date(iso).getTime() : 0);
const startOf = (t: Trial, s: Session) => t.startedAt ?? s.startedAt;

/** v2.2〜v2.4 の付け方での合計点（基準点を作るときに使う） */
export function legacyTotalPoints(data: Pick<AppData, 'sessions' | 'craftBook'>): number {
  return allTrials(data.sessions).reduce((sum, t) => sum + trialPointsV1(t), 0) + (data.craftBook?.length ?? 0) * POINTS_V1.newCraft;
}

/** 図鑑の発見の点（since 以後に増えた分） */
export function craftPoints(book: CraftEntry[], since = 0): number {
  return book.filter((e) => ms(e.firstMadeAt) >= since).length * POINTS.newCraft;
}

/** これまでの合計点。基準点があれば、それ以後の記録だけ v2.5 の点で足す */
export function totalPoints(data: Pick<AppData, 'sessions' | 'craftBook'>, baseline?: ScoreBaseline | null): number {
  const since = baseline ? ms(baseline.at) : 0;
  let sum = baseline ? baseline.points : 0;
  for (const s of data.sessions) for (const t of s.trials) if (ms(startOf(t, s)) >= since) sum += trialPoints(t);
  return sum + craftPoints(data.craftBook ?? [], since);
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
  // v2.5: もりの先（ここからは のびが ゆっくり）。宇宙が好きなので、森 → 島 → 星 → 銀河へ
  { level: 10, name: 'おおきな もり', min: 3000 },
  { level: 11, name: 'もりの しま', min: 4500 },
  { level: 12, name: 'みどりの ほし', min: 6500 },
  { level: 13, name: 'ほしと つき', min: 9000 },
  { level: 14, name: 'ぎんが', min: 12000 },
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

export function roundsOf(sessions: Session[], baseline?: ScoreBaseline | null): RoundRecord[] {
  const since = baseline ? ms(baseline.at) : 0;
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
        // 基準点より前のラウンドは、そのときの付け方の点で残す
        r.points += ms(startOf(t, s)) >= since ? trialPoints(t) : trialPointsV1(t);
      }
    }
  return [...map.values()];
}

/** 自分の記録のランキング（さいごまでやったラウンドだけ・点の高い順・同点は新しい方が上） */
export function ranking(sessions: Session[], roundLength: number, limit = 5, baseline?: ScoreBaseline | null): RoundRecord[] {
  return roundsOf(sessions, baseline)
    .filter((r) => r.count >= roundLength)
    .sort((a, b) => b.points - a.points || new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
}
