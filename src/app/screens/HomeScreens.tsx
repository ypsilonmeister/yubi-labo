import { useState } from 'react';
import type { AccessibilitySettings, LearningSettings, LearningStage, ModeId, TaskCategory } from '../../core/types';
import { GameRegistry } from '../../core/registry';
import { ModeIcon, TaskIcon } from '../icons';
import { STAGE_LABEL, taskLabel } from '../labels';
import { Plant } from '../Plant';
import { nextRank, rankOf, type RoundRecord } from '../../core/score';

type S = Readonly<AccessibilitySettings>;

export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="screen center">
      <h1 className="app-title">さんすう クラフト</h1>
      <button type="button" className="btn-main big" onClick={onStart}>
        はじめる
      </button>
    </div>
  );
}

export interface ScoreView {
  points: number;
  /** v2.15: つぎの 1てんまでの小さな点（0〜9） */
  dots?: number;
}

/** 植物とランク（v2.2・保護者判断で表示） */
export function PlantCard({ points, dots = 0, onRanking }: { points: number; dots?: number; onRanking?: () => void }) {
  const rank = rankOf(points);
  const next = nextRank(points);
  return (
    <div className="plant-card">
      <Plant level={rank.level} size={120} label={`${rank.name} の しょくぶつ`} />
      <div className="plant-info">
        <div className="plant-rank">
          ランク <b>{rank.level + 1}</b>　{rank.name}
        </div>
        <div className="plant-points">
          <b>{points}</b> てん
        </div>
        {dots > 0 && (
          // v2.15: 10分の1の点（小さな点）が 10こ たまると 1てん
          <div className="plant-dots" aria-label={`つぎの 1てんまで ちいさな てん ${dots}こ`}>
            <span>つぎの 1てんまで</span>
            <span aria-hidden>{'●'.repeat(dots) + '○'.repeat(10 - dots)}</span>
          </div>
        )}
        {next && (
          <div className="plant-next">
            <span>つぎは</span>
            <Plant level={next.level} size={36} label={next.name} />
            <span>
              {next.name}（{next.min}てん）
            </span>
          </div>
        )}
      </div>
      {onRanking && (
        <button type="button" className="btn-soft small plant-rank-btn" onClick={onRanking}>
          🏆 きろく
        </button>
      )}
    </div>
  );
}

export function HomeScreen(props: {
  s: S;
  learning: Readonly<LearningSettings>;
  score: ScoreView | null;
  onMode: (m: ModeId) => void;
  onCraft: () => void;
  onRanking: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="screen">
      {props.score && <PlantCard points={props.score.points} dots={props.score.dots} onRanking={props.onRanking} />}
      <div className="tile-grid home-grid">
        {GameRegistry.all()
          .filter((p) => p.group !== 'lab')
          .map((p) => (
            <button key={p.id} type="button" className="tile tile-mode" onClick={() => props.onMode(p.id)} aria-label={p.title}>
              <ModeIcon mode={p.id} s={props.s} />
              <span>{p.title}</span>
            </button>
          ))}
        {props.learning.craftBookEnabled && (
          <button type="button" className="tile tile-book" onClick={props.onCraft} aria-label="クラフト ずかん">
            <span className="book-icon" aria-hidden>
              📖
            </span>
            <span>つくった もの</span>
          </button>
        )}
      </div>
      {GameRegistry.all().some((p) => p.group === 'lab') && (
        <>
          <h2 className="home-section">🔬 じっけん ラボ</h2>
          <div className="tile-grid home-grid">
            {GameRegistry.all()
              .filter((p) => p.group === 'lab')
              .map((p) => (
                <button key={p.id} type="button" className="tile tile-mode tile-lab" onClick={() => props.onMode(p.id)} aria-label={p.title}>
                  <ModeIcon mode={p.id} s={props.s} />
                  <span>{p.title}</span>
                </button>
              ))}
          </div>
        </>
      )}
      <div className="home-foot">
        <button type="button" className="btn-soft" onClick={props.onEnd}>
          きょうは おしまい
        </button>
      </div>
    </div>
  );
}

/** 自分の記録のランキング（ほかの人とは比べない） */
export function RankingScreen({ list, points, onBack }: { list: RoundRecord[]; points: number; onBack: () => void }) {
  return (
    <div className="screen">
      <header className="screen-header">
        <button type="button" className="btn-icon" onClick={onBack} aria-label="もどる">
          ←
        </button>
        <h2>🏆 きろく</h2>
      </header>
      <PlantCard points={points} />
      <RankingList list={list} />
    </div>
  );
}

export function RankingList({ list, highlight }: { list: RoundRecord[]; highlight?: string }) {
  if (!list.length) return <p className="muted center-text">ラウンドを さいごまで やると、ここに のこるよ</p>;
  return (
    <ol className="ranking">
      {list.map((r, i) => (
        <li key={r.roundId} className={r.roundId === highlight ? 'is-now' : undefined}>
          <span className="ranking-pos">{i + 1}</span>
          <ModeIconById mode={r.modeId} />
          <span className="ranking-points">
            <b>{r.points}</b> てん
          </span>
          <span className="ranking-date">{shortDate(r.startedAt)}</span>
        </li>
      ))}
    </ol>
  );
}

function ModeIconById({ mode }: { mode: ModeId }) {
  return <span className="ranking-mode">{GameRegistry.get(mode).title}</span>;
}

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[2])}/${Number(m[3])}` : '';
}

export function ModeScreen(props: { s: S; mode: ModeId; onPlay: (task: TaskCategory, stage: LearningStage) => void; onBack: () => void }) {
  const plugin = GameRegistry.get(props.mode);
  const [openTask, setOpenTask] = useState<TaskCategory | null>(null);
  const stagesOf = (t: TaskCategory) => plugin.stagesFor(t).filter((x) => x !== 'transfer' && x !== 'revisit');
  const tapTask = (t: TaskCategory) => {
    const st = stagesOf(t);
    if (st.length === 1) props.onPlay(t, st[0]);
    else setOpenTask(openTask === t ? null : t);
  };
  return (
    <div className="screen">
      <header className="screen-header">
        <button type="button" className="btn-icon" onClick={props.onBack} aria-label="もどる">
          ←
        </button>
        <ModeIcon mode={props.mode} s={props.s} size={40} />
        <h2>{plugin.title}</h2>
      </header>
      <div className="tile-grid">
        <button type="button" className="tile tile-explore" onClick={() => props.onPlay(plugin.supportedTasks[0], 'explore')}>
          <ModeIcon mode={props.mode} s={props.s} size={64} />
          <span>{STAGE_LABEL.explore}</span>
        </button>
        {plugin.supportedTasks.filter((t) => stagesOf(t).length > 0).map((t) => (
          <div key={t} className={`tile-wrap${openTask === t ? ' open' : ''}`}>
            <button type="button" className="tile" onClick={() => tapTask(t)} aria-expanded={openTask === t}>
              <TaskIcon task={t} s={props.s} />
              <span>{taskLabel(t, props.mode)}</span>
            </button>
            {openTask === t && (
              <div className="stage-pick">
                {stagesOf(t).map((st) => (
                  <button key={st} type="button" className="btn-soft" onClick={() => props.onPlay(t, st)}>
                    {STAGE_LABEL[st]}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
