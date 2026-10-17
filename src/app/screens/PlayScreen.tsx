// 1つのモードで遊ぶ画面。プラグインは §10 の契約どおり mount / loadQuestion / showHint / undo / pause / resume / destroy だけで操作する。
// §8.2: 次の問題を自動で始めない。毎問「もういちど」「つぎへ」「おしまい」を選べる。中断・スキップ・戻るは常に使える。

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AccessibilitySettings, GameContext, LearningSettings, LearningStage, ModeId, Question, TaskCategory, Trial } from '../../core/types';
import { GameRegistry } from '../../core/registry';
import type { SessionEngine, TrialHandle } from '../../core/engine/SessionEngine';
import { exploreQuestion, generateQuestion, retarget, type PickContext } from '../../core/engine/questions';
import { NumberView } from '../NumberView';
import { ModeIcon } from '../icons';
import { STAGE_LABEL, taskLabel } from '../labels';

export interface PlaySpec {
  mode: ModeId;
  task: TaskCategory;
  stage: LearningStage;
  /** 表現横断などで、最初の問題を指定するとき */
  question?: Question;
}

interface Props {
  spec: PlaySpec;
  engine: SessionEngine;
  settings: Readonly<AccessibilitySettings>;
  learning: Readonly<LearningSettings>;
  pickContext: () => PickContext;
  onCraft: (value: number, parts: number[], mode: ModeId) => void;
  onExit: () => void;
  onTransfer: (spec: PlaySpec) => void;
}

export function PlayScreen({ spec, engine, settings, learning, pickContext, onCraft, onExit, onTransfer }: Props) {
  const plugin = GameRegistry.get(spec.mode);
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<TrialHandle | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const learningRef = useRef(learning);
  learningRef.current = learning;
  const [question, setQuestion] = useState<Question | null>(null);
  const [done, setDone] = useState<Trial | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decisionStage = spec.stage !== 'explore' && spec.stage !== 'observe';

  const newQuestion = (stage: LearningStage): Question => {
    if (stage === 'explore') return exploreQuestion(spec.mode, spec.task);
    const base = stage === 'transfer' || stage === 'revisit' ? 'construct' : stage;
    return generateQuestion({
      task: spec.task,
      mode: spec.mode,
      stage: base as 'observe' | 'predict' | 'construct',
      settings: settingsRef.current,
      learning: learningRef.current,
      pick: pickContext(),
    });
  };

  const load = (q: Question) => {
    try {
      handle.current = engine.startTrial(spec.mode, q, (v, parts) => onCraft(v, parts, spec.mode));
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setQuestion(q);
    setDone(null);
    setHintLevel(0);
    setPaused(false);
    plugin.loadQuestion(q);
  };

  // プラグインには「いまの試行」へ中継する context を一度だけ渡す
  useEffect(() => {
    const relay: GameContext = {
      emit: (e) => handle.current?.context.emit(e),
      complete: (r) => handle.current?.context.complete(r),
      craft: (v, p) => handle.current?.context.craft(v, p),
      get settings() {
        return settingsRef.current;
      },
      get learning() {
        return learningRef.current;
      },
    };
    engine.onTrialDone = (t) => {
      if (t.result?.outcome !== 'abandoned') setDone(t);
    };
    plugin.mount(host.current!, relay);
    load(spec.question ?? newQuestion(spec.stage));
    return () => {
      handle.current?.close('abandoned');
      handle.current = null;
      engine.onTrialDone = null;
      plugin.destroy();
    };
    // spec ごとに PlayScreen は作り直される（key）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    plugin.applySettings(settings);
  }, [plugin, settings]);

  const hint = () => {
    if (!handle.current || handle.current.isDone()) return;
    const lvl = Math.min(3, hintLevel + 1) as 1 | 2 | 3;
    setHintLevel(lvl);
    engine.emitShell({ type: 'hint_requested', payload: { level: lvl } });
    plugin.showHint(lvl);
  };
  const togglePause = () => {
    if (paused) {
      engine.emitShell({ type: 'resumed' });
      plugin.resume();
    } else {
      engine.emitShell({ type: 'paused' });
      plugin.pause();
    }
    setPaused(!paused);
  };
  const skip = () => {
    if (paused) togglePause();
    handle.current?.close('skipped');
  };
  const toggleNumbers = () => {
    engine.emitShell({ type: 'settings_changed', payload: { numberView: !showNumbers } });
    setShowNumbers(!showNumbers);
  };

  const transferTargets = useMemo(() => GameRegistry.transferTargets(spec.task, spec.mode), [spec.task, spec.mode]);
  const canTransfer = !!question && !!done && done.result?.outcome === 'completed' && decisionStage && transferTargets.length > 0;
  const trialOpen = !!question && !done;

  return (
    <div className="play">
      <header className="play-header">
        <button type="button" className="btn-icon" onClick={onExit} aria-label="もどる">
          ←
        </button>
        <div className="play-title">
          <ModeIcon mode={spec.mode} s={settings} size={36} />
          <span>{spec.stage === 'explore' ? STAGE_LABEL.explore : `${taskLabel(spec.task, spec.mode)}・${STAGE_LABEL[question?.learningStage ?? spec.stage]}`}</span>
        </div>
      </header>

      <div className="play-frame">
        {error && <div className="notice">この もんだいは だせませんでした。もどって えらびなおしてね。</div>}
        <div ref={host} className={`plugin-host${paused ? ' is-paused' : ''}`} />
        {paused && (
          <button type="button" className="paused-overlay" onClick={togglePause}>
            ▶ つづける
          </button>
        )}
        {showNumbers && question && <NumberView key={`${question.id}-${!!done}`} q={question} revealed={!!done && done.result?.outcome !== 'skipped'} s={settings} />}
      </div>

      {!done ? (
        <nav className="controls" aria-label="そうさ">
          <button type="button" className="ctl" onClick={() => plugin.undo()} disabled={!trialOpen}>
            <span aria-hidden>↩</span>
            <small>もどす</small>
          </button>
          {decisionStage && (
            <button type="button" className="ctl" onClick={hint} disabled={!trialOpen || hintLevel >= 3}>
              <span aria-hidden>💡</span>
              <small>ヒント</small>
            </button>
          )}
          <button type="button" className="ctl" onClick={togglePause} disabled={!trialOpen} aria-pressed={paused}>
            <span aria-hidden>{paused ? '▶' : '⏸'}</span>
            <small>{paused ? 'つづける' : 'とめる'}</small>
          </button>
          {settings.showEquationOnRequest && spec.stage !== 'explore' && (
            <button type="button" className="ctl" onClick={toggleNumbers} aria-pressed={showNumbers}>
              <span aria-hidden>🔢</span>
              <small>かずで みる</small>
            </button>
          )}
          {spec.stage !== 'explore' && (
            <button type="button" className="ctl" onClick={skip} disabled={!trialOpen}>
              <span aria-hidden>⏭</span>
              <small>とばす</small>
            </button>
          )}
          <button type="button" className="ctl" onClick={onExit}>
            <span aria-hidden>🏠</span>
            <small>おしまい</small>
          </button>
        </nav>
      ) : (
        <nav className="after" aria-label="つぎに すること">
          {question && (
            <button
              type="button"
              className="btn-soft"
              onClick={() =>
                load({ ...question, learningStage: question.learningStage === 'revisit' || question.learningStage === 'transfer' ? 'construct' : question.learningStage })
              }
            >
              もういちど
            </button>
          )}
          {spec.stage !== 'explore' && (
            <button type="button" className="btn-main" onClick={() => load(newQuestion(spec.stage))}>
              つぎへ
            </button>
          )}
          {canTransfer &&
            transferTargets.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn-soft transfer"
                onClick={() => onTransfer({ mode: p.id, task: spec.task, stage: 'transfer', question: retarget(question!, p.id, settings, learning) })}
                aria-label="べつの せかいでも みる"
              >
                <ModeIcon mode={p.id} s={settings} size={32} />
                <span>べつの せかいでも みる</span>
              </button>
            ))}
          <button type="button" className="btn-soft" onClick={onExit}>
            おしまい
          </button>
        </nav>
      )}
    </div>
  );
}
