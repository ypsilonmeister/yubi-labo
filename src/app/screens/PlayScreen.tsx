// 1つのモードで遊ぶ画面。プラグインは §10 の契約どおり mount / loadQuestion / showHint / undo / pause / resume / destroy だけで操作する。
// §8.2: 次の問題を自動で始めない。毎問「もういちど」「つぎへ」「おしまい」を選べる。中断・スキップ・戻るは常に使える。
// v2.2: おまかせ進行（auto）では、問題ごとに progression.currentStep で課題・段階を決める（適応型スキップ）。
// ラウンド（round）では、問題数と点を見せ、さいごに結果（植物・自分のランキング）を出す。点は減らない。

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AccessibilitySettings, GameContext, LearningSettings, LearningStage, ModeId, Question, Session, TaskCategory, Trial } from '../../core/types';
import { currentStep } from '../../core/engine/progression';
import { allTrials, countsInRound, rankOf, ranking, trialPoints } from '../../core/score';
import { Plant } from '../Plant';
import { RankingList } from './HomeScreens';
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
  /** v2.2: 課題・段階をおまかせで進める */
  auto?: boolean;
  /** v2.2: ラウンド（数問ひとまとまり） */
  round?: { id: string; length: number };
}

interface Props {
  spec: PlaySpec;
  engine: SessionEngine;
  settings: Readonly<AccessibilitySettings>;
  learning: Readonly<LearningSettings>;
  pickContext: () => PickContext;
  /** これまでの全セッション（古い順）。おまかせ進行とランキングに使う */
  sessions: () => Session[];
  /** これまでの合計点（v2.2） */
  totalPoints: () => number;
  onNewRound: (spec: PlaySpec) => void;
  onCraft: (value: number, parts: number[], mode: ModeId) => void;
  onExit: () => void;
  onTransfer: (spec: PlaySpec) => void;
}

export function PlayScreen({ spec, engine, settings, learning, pickContext, sessions, totalPoints, onNewRound, onCraft, onExit, onTransfer }: Props) {
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
  const [showResult, setShowResult] = useState(false);
  // ラウンドの結果で「まえの ランク」と比べるため、始めたときの合計点を覚えておく
  const pointsAtStart = useRef<number>(totalPoints());

  const stage = question?.learningStage ?? spec.stage;
  const decisionStage = stage !== 'explore' && stage !== 'observe';
  const task = question?.taskType ?? spec.task;

  const newQuestion = (stage: LearningStage): Question => {
    if (stage === 'explore') return exploreQuestion(spec.mode, spec.task);
    let t = spec.task;
    let base = stage === 'transfer' || stage === 'revisit' ? 'construct' : stage;
    if (spec.auto) {
      const step = currentStep(plugin, allTrials(sessions()));
      t = step.task;
      base = step.stage;
    }
    return generateQuestion({
      task: t,
      mode: spec.mode,
      stage: base as 'observe' | 'predict' | 'construct',
      settings: settingsRef.current,
      learning: learningRef.current,
      pick: pickContext(),
    });
  };

  const load = (q: Question) => {
    try {
      handle.current = engine.startTrial(spec.mode, q, (v, parts) => onCraft(v, parts, spec.mode), spec.round?.id);
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

  const transferTargets = useMemo(() => GameRegistry.transferTargets(task, spec.mode), [task, spec.mode]);
  const canTransfer = !!question && !!done && done.result?.outcome === 'completed' && decisionStage && transferTargets.length > 0;
  const trialOpen = !!question && !done;

  // ラウンドの進み具合（このセッションの、このラウンドの試行）
  const roundTrials = spec.round ? (engine.session?.trials ?? []).filter((t) => t.roundId === spec.round!.id && countsInRound(t)) : [];
  const roundPoints = roundTrials.reduce((a, t) => a + trialPoints(t), 0);
  const roundOver = !!spec.round && roundTrials.length >= spec.round.length;
  const lastPoints = done && spec.round ? trialPoints(done) : 0;

  return (
    <div className="play">
      <header className="play-header">
        <button type="button" className="btn-icon" onClick={onExit} aria-label="もどる">
          ←
        </button>
        <div className="play-title">
          <ModeIcon mode={spec.mode} s={settings} size={36} />
          <span>{stage === 'explore' ? STAGE_LABEL.explore : `${taskLabel(task, spec.mode)}・${STAGE_LABEL[stage]}`}</span>
        </div>
        {spec.round && (
          <div className="round-meter" aria-label={`${roundTrials.length} もんめ / ${spec.round.length} もん、${roundPoints} てん`}>
            <span className="round-leaves" aria-hidden>
              {Array.from({ length: spec.round.length }, (_, i) => (
                <span key={i} className={i < roundTrials.length ? 'leaf on' : 'leaf'} />
              ))}
            </span>
            <span className="round-points">
              <b>{roundPoints}</b> てん
            </span>
          </div>
        )}
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
          {spec.round && lastPoints > 0 && (
            <span className="points-chip" aria-label={`${lastPoints} てん`}>
              +{lastPoints} てん
            </span>
          )}
          {question && !roundOver && (
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
          {roundOver ? (
            <button type="button" className="btn-main" onClick={() => setShowResult(true)}>
              けっかを みる
            </button>
          ) : (
            spec.stage !== 'explore' && (
              <button type="button" className="btn-main" onClick={() => load(newQuestion(spec.stage))}>
                つぎへ
              </button>
            )
          )}
          {canTransfer &&
            !roundOver &&
            transferTargets.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn-soft transfer"
                onClick={() => onTransfer({ ...spec, mode: p.id, task, stage: 'transfer', question: retarget(question!, p.id, settings, learning) })}
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
      {showResult && spec.round && (
        <RoundResult
          roundId={spec.round.id}
          points={roundPoints}
          before={pointsAtStart.current}
          after={totalPoints()}
          list={ranking(sessions(), spec.round.length)}
          onAgain={() => onNewRound({ mode: spec.mode, task: spec.task, stage: spec.stage, auto: spec.auto, round: { id: '', length: spec.round!.length } })}
          onExit={onExit}
        />
      )}
    </div>
  );
}

/** ラウンドの結果: 点・植物（ランクが上がったら並べて見せる）・自分のランキング。自動では先へ進まない */
function RoundResult(props: { roundId: string; points: number; before: number; after: number; list: ReturnType<typeof ranking>; onAgain: () => void; onExit: () => void }) {
  const r0 = rankOf(props.before);
  const r1 = rankOf(props.after);
  const up = r1.level > r0.level;
  return (
    <div className="round-result" role="dialog" aria-label="ラウンドの けっか">
      <div className="round-result-card">
        <h2>
          <b className="round-result-points">{props.points}</b> てん
        </h2>
        <div className="round-result-plant">
          {up && (
            <>
              <Plant level={r0.level} size={90} label={r0.name} />
              <span className="grow-arrow" aria-hidden>
                →
              </span>
            </>
          )}
          <Plant level={r1.level} size={up ? 150 : 120} label={r1.name} />
        </div>
        <p className="round-result-rank">{up ? `${r1.name} に そだったよ！` : `いまは ${r1.name}（ぜんぶで ${props.after}てん）`}</p>
        <RankingList list={props.list} highlight={props.roundId} />
        <div className="round-result-actions">
          <button type="button" className="btn-main" onClick={props.onAgain}>
            もう 1ラウンド
          </button>
          <button type="button" className="btn-soft" onClick={props.onExit}>
            おしまい
          </button>
        </div>
      </div>
    </div>
  );
}
