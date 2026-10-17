import { useState } from 'react';
import type { AccessibilitySettings, LearningSettings, LearningStage, ModeId, TaskCategory } from '../../core/types';
import { GameRegistry } from '../../core/registry';
import { ModeIcon, TaskIcon } from '../icons';
import { STAGE_LABEL, taskLabel } from '../labels';

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

export function HomeScreen(props: { s: S; learning: Readonly<LearningSettings>; onMode: (m: ModeId) => void; onCraft: () => void; onEnd: () => void }) {
  return (
    <div className="screen">
      <div className="tile-grid">
        {GameRegistry.all().map((p) => (
          <button key={p.id} type="button" className="tile" onClick={() => props.onMode(p.id)} aria-label={p.title}>
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
      <div className="home-foot">
        <button type="button" className="btn-soft" onClick={props.onEnd}>
          きょうは おしまい
        </button>
      </div>
    </div>
  );
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
        {plugin.supportedTasks.map((t) => (
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
