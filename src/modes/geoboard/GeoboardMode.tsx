// Mode J：ジオボード（v2.8・§9.8）。自由探索のみ（決定点なし）。
// 点（5×5）を順にタップするとゴムがかかり、さいしょの点にもどると輪がとじて、形のなまえが出る。
// まっすぐな かど（直角）には、小さな四角の印がつく。かどが まっすぐでないときは、何も出さない（印はよい知らせだけ）。
// はじめは たて・よこの線だけ。「ななめも つかう」は本人が選ぶ。時間では進まず、タップだけで完結する。

import { useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, type TrialCore } from '../kit/useTrialCore';
import { ModeLayout } from '../kit/ui';
import { ShapeGlyph } from './ShapeGlyph';
import { Board } from './Board';
import { canExtend, classify, countWord, discoveryOf, isRightAngle, rightCorners, SHAPE_CODE, SHAPE_NAME, type Pt } from './shapes';

interface Snapshot {
  path: Pt[];
  closed: boolean;
}

function ExploreTask({ core }: { core: TrialCore }) {
  const [path, setPath] = useState<Pt[]>([]);
  const [closed, setClosed] = useState(false);
  const [allowDiagonal, setAllowDiagonal] = useState(false);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [glow, setGlow] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const push = () => setPast((p) => [...p, { path, closed }].slice(-60));

  const close = (loop: Pt[]) => {
    const k = classify(loop);
    const found = discoveryOf(loop);
    if (found) core.ctx.craft(found.value, found.parts, 'shape');
    core.ctx.emit({ type: 'attempt', payload: { closed: true, shape: SHAPE_CODE[k] } });
    setClosed(true);
    setGlow(true);
  };

  const onPoint = (p: Pt) => {
    if (core.anim.busy || closed) return;
    setNote(null);
    if (!path.length) {
      push();
      setPath([p]);
      core.ctx.emit({ type: 'attempt', payload: { x: p.x, y: p.y } });
      return;
    }
    if (!canExtend(path, p, allowDiagonal)) {
      // せめない。やさしく、つぎの てがかりを出すだけ
      const last = path[path.length - 1];
      if (!allowDiagonal && last.x !== p.x && last.y !== p.y && !path.some((q) => q.x === p.x && q.y === p.y)) setNote('たてか よこに すすめるよ。「ななめも つかう」も ためせるよ');
      else setNote('ほかの てんを えらんで みよう');
      return;
    }
    push();
    const closing = path.length >= 3 && path[0].x === p.x && path[0].y === p.y;
    core.ctx.emit({ type: 'attempt', payload: { x: p.x, y: p.y } });
    if (closing) close(path);
    else setPath([...path, p]);
  };

  const closeNow = () => {
    if (core.anim.busy || closed || path.length < 3 || !canExtend(path, path[0], allowDiagonal)) return;
    push();
    close(path);
  };

  const reset = () => {
    if (core.anim.busy || !path.length) return;
    push();
    setPath([]);
    setClosed(false);
    setGlow(false);
    setNote(null);
  };

  core.onUndo(() => {
    if (core.anim.busy || !past.length) return;
    const last = past[past.length - 1];
    setPast(past.slice(0, -1));
    core.ctx.emit({ type: 'undo' });
    setPath(last.path);
    setClosed(last.closed);
    setGlow(false);
    setNote(null);
  });

  const n = path.length;
  const rightN = (closed ? rightCorners(path) : path.slice(1, -1).map((v, i) => isRightAngle(path[i], v, path[i + 2]))).filter(Boolean).length;
  const kind = closed ? classify(path) : null;
  const canClose = !closed && n >= 3 && canExtend(path, path[0], allowDiagonal);
  const rightText = rightN > 0 ? `　まっすぐな かどが ${countWord(rightN)}` : closed ? '　まっすぐな かどは ないよ' : '';

  const prompt = note
    ? note
    : closed
      ? `${SHAPE_NAME[kind!]} が できた！${rightText}`
      : n === 0
        ? 'てんを タップして、ゴムを かけよう'
        : n < 3
          ? 'つぎの てんを タップして、ゴムを のばそう'
          : `つぎの てんへ。さいしょの てんを タップすると とじるよ${rightText}`;

  return (
    <ModeLayout
      prompt={prompt}
      field={<Board path={path} closed={closed} allowDiagonal={allowDiagonal} glow={glow} s={core.settings} onPoint={onPoint} />}
      aside={
        closed ? (
          <div className="lab-row" aria-live="polite">
            {kind !== 'polygon' && <ShapeGlyph code={SHAPE_CODE[kind!]} size={56} />}
            <strong>{SHAPE_NAME[kind!]}</strong>
          </div>
        ) : null
      }
      tray={
        <div className="lab-tray">
          <div className="lab-row">
            <button type="button" className="btn-main" onClick={closeNow} disabled={!canClose}>
              とじる
            </button>
            <button type="button" className="btn-soft" onClick={reset} disabled={!n}>
              さいしょから
            </button>
            <button type="button" className="btn-soft" aria-pressed={allowDiagonal} onClick={() => setAllowDiagonal((v) => !v)} disabled={n > 0 && !closed}>
              {allowDiagonal ? '✓ ななめも つかう' : 'ななめも つかう'}
            </button>
          </div>
        </div>
      }
    />
  );
}

function Task({ bridge }: { bridge: ModeBridge }) {
  const core = useTrialCore(bridge);
  return <ExploreTask core={core} />;
}

function View({ bridge }: { bridge: ModeBridge }) {
  const st = useBridge(bridge);
  if (!st.question) return null;
  return <Task key={st.qKey} bridge={bridge} />;
}

export const GeoboardMode = createReactPlugin(
  {
    id: 'mode_j_geoboard',
    title: 'ジオボード',
    description: '5×5 の点にゴムをかけて、形（三角形・四角形・長方形・正方形）をつくる。まっすぐな かど（直角）に印がつく。タップで完結し、時間では進まない。自由探索のみ。',
    supportedTasks: ['shapes'],
    supportedStrategies: ['none'],
    stages: {},
    group: 'lab',
  },
  View,
);
