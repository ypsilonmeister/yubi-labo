// Mode K：かたちづくり（v2.9・§9.9）。ジオボードの決定点。目標の形（まっすぐな かどだけ／さんかく／ちょうほうけい）をつくる。
// さいしょの1辺は かかっている（もどすでも消えない）。輪をとじた形が目標に合えばできあがり（決定点）。
// 目標とちがう形でとじても、形は残り、なまえを知らせるだけ（赤・×・音・ゆれは使わない）。もどす・さいしょから で続けられる。
// 自由探索（学習段階 explore）は J ジオボードと同じ盤で遊べる。時間では進まず、タップだけで完結する。

import { useMemo, useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, type TrialCore } from '../kit/useTrialCore';
import { ModeLayout } from '../kit/ui';
import { ShapeGlyph } from './ShapeGlyph';
import { Board } from './Board';
import { ExploreTask } from './GeoboardMode';
import { canExtend, classify, countWord, discoveryOf, doubledArea, isIsosceles, meetsGoal, needsDiagonal, parseGoalOperands, rightCorners, SHAPE_CODE, SHAPE_NAME, solveShape, type Pt, type ShapeClass, type ShapeGoal } from '../../core/math/shapes';
import { TILE, OUTLINE } from '../../core/colors';

const GOAL_TEXT: Record<ShapeGoal, string> = {
  right: 'まっすぐな かどだけの かたちを つくろう',
  triangle: 'さんかくを つくろう',
  rectangle: 'ちょうほうけいを つくろう',
  // v2.14
  square: 'せいほうけいを つくろう',
  isosceles: 'にとうへん さんかく（2つの へんが おなじ ながさ）を つくろう',
  area: 'めあての ますと おなじ ひろさの かたちを つくろう',
};

/** ヒント L1 で出す見本の絵（形の記号） */
const GOAL_GLYPH: Record<ShapeGoal, number> = {
  right: SHAPE_CODE.rectangle,
  triangle: SHAPE_CODE.triangle,
  rectangle: SHAPE_CODE.rectangle,
  square: SHAPE_CODE.square,
  isosceles: SHAPE_CODE.triangle,
  area: SHAPE_CODE.rectangle,
};

const GOAL_LABEL: Record<ShapeGoal, string> = {
  right: 'まっすぐな かどだけ',
  triangle: 'さんかく',
  rectangle: 'ちょうほうけい',
  square: 'せいほうけい',
  isosceles: 'にとうへん さんかく',
  area: 'ひろさ',
};

/** v2.14 ひろさ: ます（と はんぶん）を ならべた絵。doubled は面積の2倍 */
function AreaBar({ doubled, label }: { doubled: number; label: string }) {
  const full = Math.floor(doubled / 2);
  const half = doubled % 2 === 1;
  const per = 8;
  const c = 18;
  const count = full + (half ? 1 : 0);
  const cols = Math.min(per, Math.max(1, count));
  const rows = Math.max(1, Math.ceil(count / per));
  return (
    <span className="lab-row" style={{ gap: 6 }}>
      <span>{label}</span>
      <svg width={cols * (c + 3) + 4} height={rows * (c + 3) + 4} viewBox={`-2 -2 ${cols * (c + 3) + 4} ${rows * (c + 3) + 4}`} aria-hidden>
        {Array.from({ length: count }, (_, i) => {
          const x = (i % per) * (c + 3);
          const y = Math.floor(i / per) * (c + 3);
          const isHalf = half && i === count - 1;
          return isHalf ? (
            <path key={i} d={`M${x} ${y + c} L${x + c} ${y + c} L${x} ${y} Z`} fill={TILE.fill} stroke={OUTLINE} strokeWidth={1.2} />
          ) : (
            <rect key={i} x={x} y={y} width={c} height={c} rx={2} fill={TILE.fill} stroke={OUTLINE} strokeWidth={1.2} />
          );
        })}
      </svg>
    </span>
  );
}

const same = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;

interface Snapshot {
  path: Pt[];
  closed: boolean;
  wrong: ShapeClass | null;
}

function MakeTask({ core, goal, edge, areaN }: { core: TrialCore; goal: ShapeGoal; edge: [Pt, Pt]; areaN: number }) {
  const forced = needsDiagonal(goal);
  const given = useMemo<Pt[]>(() => [edge[0], edge[1]], [edge]);
  // 見本の解（出題前の検証で、解がある問題だけが出る）
  const sol = useMemo(() => solveShape(goal, edge, areaN) ?? given, [goal, edge, areaN, given]);
  const [path, setPath] = useState<Pt[]>(given);
  const [closed, setClosed] = useState(false);
  const [wrong, setWrong] = useState<ShapeClass | null>(null);
  const [ok, setOk] = useState(false);
  const [allowDiagonal, setAllowDiagonal] = useState(forced);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const push = () => setPast((p) => [...p, { path, closed, wrong }].slice(-60));

  const decide = (loop: Pt[]) => {
    const kind = classify(loop);
    const correct = meetsGoal(goal, loop, areaN);
    core.ctx.emit({ type: 'attempt', payload: { closed: true, shape: SHAPE_CODE[kind] } });
    core.ctx.emit({ type: 'decision_made', payload: { shape: SHAPE_CODE[kind], correct } });
    setClosed(true);
    if (!correct) {
      core.mistakes.current++;
      setWrong(kind);
      return;
    }
    setWrong(null);
    setOk(true);
    const found = discoveryOf(loop);
    if (found) core.ctx.craft(found.value, found.parts, 'shape');
    core.finish(true);
  };

  const onPoint = (p: Pt) => {
    if (core.anim.busy || ok || closed) return;
    setNote(null);
    if (!canExtend(path, p, allowDiagonal)) {
      const last = path[path.length - 1];
      if (!allowDiagonal && last.x !== p.x && last.y !== p.y && !path.some((q) => same(q, p))) setNote('たてか よこに すすめるよ。「ななめも つかう」も ためせるよ');
      else setNote('ほかの てんを えらんで みよう');
      return;
    }
    push();
    core.ctx.emit({ type: 'attempt', payload: { x: p.x, y: p.y } });
    if (path.length >= 3 && same(path[0], p)) decide(path);
    else setPath([...path, p]);
  };

  const closeNow = () => {
    if (core.anim.busy || ok || closed || path.length < 3 || !canExtend(path, path[0], allowDiagonal)) return;
    push();
    decide(path);
  };

  const reset = () => {
    if (core.anim.busy || ok || path.length <= given.length) return;
    push();
    setPath(given);
    setClosed(false);
    setWrong(null);
    setNote(null);
  };

  core.onUndo(() => {
    if (core.anim.busy || ok || !past.length) return;
    const last = past[past.length - 1];
    setPast(past.slice(0, -1));
    core.ctx.emit({ type: 'undo' });
    setPath(last.path);
    setClosed(last.closed);
    setWrong(last.wrong);
    setNote(null);
  });
  core.onHint((lvl) => {
    if (lvl === 3) void core.runDemo();
  });

  // ヒント L2: 見本の道すじの つぎの点と、もう1つだけに絞る（道すじからはずれているときは絞らない）
  const onTrack = path.length <= sol.length && path.every((p, i) => same(p, sol[i]));
  const nextTarget = onTrack ? (path.length < sol.length ? sol[path.length] : sol[0]) : null;
  const rings = useMemo(() => {
    if (core.hintLevel < 2 || !nextTarget) return null;
    const other = [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 4, y: 0 }].find((p) => !same(p, nextTarget) && canExtend(path, p, allowDiagonal));
    return other ? [nextTarget, other] : [nextTarget];
  }, [core.hintLevel, nextTarget, path, allowDiagonal]);

  const n = path.length;
  const kind = closed ? classify(path) : null;
  const rightN = closed ? rightCorners(path).filter(Boolean).length : 0;
  const canClose = !closed && !ok && n >= 3 && canExtend(path, path[0], allowDiagonal);
  const canToggle = !forced && n === given.length && !closed && !ok;

  const prompt = note
    ? note
    : ok
      ? goal === 'area'
        ? `ひろさ ぴったり！ ${SHAPE_NAME[kind!]} が できた`
        : goal === 'isosceles'
          ? 'にとうへん さんかく が できた！ 2つの へんが おなじ ながさ'
          : `${SHAPE_NAME[kind!]} が できた！${rightN > 0 ? `　まっすぐな かどが ${countWord(rightN)}` : ''}`
      : wrong
        ? goal === 'area'
          ? 'できた ひろさと、めあての ひろさを くらべて みよう。もどすか、ほかの かたちを つくって みよう'
          : goal === 'isosceles' && (wrong === 'triangle' || wrong === 'right_triangle')
            ? `${SHAPE_NAME[wrong]} が できたよ。へんの ながさを くらべて みよう。もどすか、ほかの かたちを つくって みよう`
            : `${SHAPE_NAME[wrong]} が できたよ。もどすか、ほかの かたちを つくって みよう`
        : n === given.length
          ? `${GOAL_TEXT[goal]}。さいしょの せんは かかっているよ`
          : GOAL_TEXT[goal];

  return (
    <ModeLayout
      prompt={prompt}
      field={
        <Board
          path={path}
          closed={closed}
          allowDiagonal={allowDiagonal}
          glow={ok}
          s={core.settings}
          onPoint={onPoint}
          lockedCount={given.length}
          grid={goal === 'area'}
          rings={rings}
          ghost={core.demo === 'place' ? sol : null}
          emphasis={core.demo === 'pick' ? sol : null}
        />
      }
      aside={
        <>
          {/* v2.14 ひろさ: めあての ひろさ（ます）は いつも見せる。とじたら、できた ひろさも ならべて くらべる */}
          {goal === 'area' && (
            <div className="lab-row" aria-live="polite">
              <AreaBar doubled={2 * areaN} label={core.settings.numberLabels ? `めあて ${areaN}` : 'めあて'} />
              {closed && <AreaBar doubled={doubledArea(path)} label={core.settings.numberLabels ? `できた ${doubledArea(path) / 2}` : 'できた'} />}
            </div>
          )}
          {goal !== 'area' && (closed || core.hintLevel >= 1) ? (
            <div className="lab-row" aria-live="polite">
              {closed && kind ? (
                <>
                  {kind !== 'polygon' && <ShapeGlyph code={SHAPE_CODE[kind]} size={56} />}
                  <strong>{goal === 'isosceles' && isIsosceles(path) ? 'にとうへん さんかく' : SHAPE_NAME[kind]}</strong>
                </>
              ) : (
                <>
                  <ShapeGlyph code={GOAL_GLYPH[goal]} size={56} />
                  <strong>{GOAL_LABEL[goal]}</strong>
                </>
              )}
            </div>
          ) : null}
        </>
      }
      tray={
        <div className="lab-tray">
          <div className="lab-row">
            <button type="button" className="btn-main" onClick={closeNow} disabled={!canClose}>
              とじる
            </button>
            <button type="button" className="btn-soft" onClick={reset} disabled={ok || n <= given.length}>
              さいしょから
            </button>
            {!forced && (
              <button type="button" className="btn-soft" aria-pressed={allowDiagonal} onClick={() => setAllowDiagonal((v) => !v)} disabled={!canToggle}>
                {allowDiagonal ? '✓ ななめも つかう' : 'ななめも つかう'}
              </button>
            )}
          </div>
        </div>
      }
    />
  );
}

function Task({ bridge }: { bridge: ModeBridge }) {
  const core = useTrialCore(bridge);
  const parsed = core.q.learningStage === 'explore' ? null : parseGoalOperands(core.q.operands);
  // 自由探索（ホームで「じゆうに あそぶ」を選んだとき）は J ジオボードと同じ盤
  if (!parsed) return <ExploreTask core={core} />;
  return <MakeTask core={core} goal={parsed.goal} edge={parsed.edge} areaN={parsed.n} />;
}

function View({ bridge }: { bridge: ModeBridge }) {
  const st = useBridge(bridge);
  if (!st.question) return null;
  return <Task key={st.qKey} bridge={bridge} />;
}

export const ShapeMakeMode = createReactPlugin(
  {
    id: 'mode_k_shapemake',
    title: 'かたちづくり',
    description: 'ジオボードで、目標の形（まっすぐな かどだけ・さんかく・ちょうほうけい）をつくる。さいしょの1辺はかかっている。違う形でも、形はそのまま残り、もどして つくりなおせる。',
    // v2.14: せいほうけい・にとうへん さんかく・ひろさ は、今の課題のあと
    supportedTasks: ['shape_right', 'shape_triangle', 'shape_rectangle', 'shape_square', 'shape_isosceles', 'shape_area'],
    supportedStrategies: ['none'],
    stages: { shape_right: ['construct'], shape_triangle: ['construct'], shape_rectangle: ['construct'], shape_square: ['construct'], shape_isosceles: ['construct'], shape_area: ['construct'] },
    group: 'core',
  },
  View,
);
