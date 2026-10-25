// Mode J：ジオボード（v2.8・§9.8）。自由探索のみ（決定点なし）。
// 点（5×5）を順にタップするとゴムがかかり、さいしょの点にもどると輪がとじて、形のなまえが出る。
// まっすぐな かど（直角）には、小さな四角の印がつく。かどが まっすぐでないときは、何も出さない（印はよい知らせだけ）。
// はじめは たて・よこの線だけ。「ななめも つかう」は本人が選ぶ。時間では進まず、タップだけで完結する。

import { useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, type TrialCore } from '../kit/useTrialCore';
import { ModeLayout, successClass } from '../kit/ui';
import { OUTLINE, SLOT_STROKE, TILE } from '../../core/colors';
import type { AccessibilitySettings } from '../../core/types';
import { ShapeGlyph } from './ShapeGlyph';
import { BOARD, boardPoints, canExtend, classify, corners, countWord, discoveryOf, isRightAngle, rightCorners, SHAPE_CODE, SHAPE_NAME, type Pt } from './shapes';

const W = 560;
const M = 60;
const SP = (W - 2 * M) / (BOARD - 1);
const px = (p: Pt) => ({ x: M + p.x * SP, y: M + p.y * SP });
const PTS = boardPoints();

interface Snapshot {
  path: Pt[];
  closed: boolean;
}

function unit(a: Pt, v: Pt) {
  const dx = a.x - v.x;
  const dy = a.y - v.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

/** かどが まっすぐなら、小さな四角の印 */
function RightMark({ a, v, b }: { a: Pt; v: Pt; b: Pt }) {
  const A = px(a);
  const V = px(v);
  const B = px(b);
  const u = unit(A, V);
  const w = unit(B, V);
  const s = 20;
  return <path d={`M${V.x + u.x * s} ${V.y + u.y * s} l${w.x * s} ${w.y * s} l${-u.x * s} ${-u.y * s}`} fill="none" stroke={OUTLINE} strokeWidth={4} strokeLinejoin="round" />;
}

function Board({ path, closed, allowDiagonal, glow, s, onPoint }: { path: Pt[]; closed: boolean; allowDiagonal: boolean; glow: boolean; s: AccessibilitySettings; onPoint: (p: Pt) => void }) {
  const n = path.length;
  const last = path[n - 1];
  const loop = closed ? path : null;
  const marks: { a: Pt; v: Pt; b: Pt }[] = [];
  if (loop) {
    const c = corners(loop);
    c.forEach((v, i) => {
      const a = c[(i + c.length - 1) % c.length];
      const b = c[(i + 1) % c.length];
      if (isRightAngle(a, v, b)) marks.push({ a, v, b });
    });
  } else {
    for (let i = 1; i < n - 1; i++) if (isRightAngle(path[i - 1], path[i], path[i + 1])) marks.push({ a: path[i - 1], v: path[i], b: path[i + 1] });
  }
  const outline = path.map((p) => `${px(p).x} ${px(p).y}`);
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className="field-svg geo-field" style={{ maxWidth: 520, margin: '0 auto', display: 'block' }}>
      <rect x={14} y={14} width={W - 28} height={W - 28} rx={26} fill="#f6f1e6" stroke={SLOT_STROKE} strokeWidth={3} />
      {closed && <path d={`M${outline.join(' L')} Z`} fill={TILE.fill} fillOpacity={0.55} className={successClass(s, glow)} />}
      {n >= 2 && <path d={`M${outline.join(' L')}${closed ? ' Z' : ''}`} fill="none" stroke={TILE.glow} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />}
      {marks.map((m, i) => (
        <RightMark key={i} {...m} />
      ))}
      {PTS.map((p) => {
        const c = px(p);
        const used = path.some((q) => q.x === p.x && q.y === p.y);
        const reach = !closed && n > 0 && canExtend(path, p, allowDiagonal);
        const isStart = n >= 1 && path[0].x === p.x && path[0].y === p.y;
        const isLast = !closed && n >= 1 && last.x === p.x && last.y === p.y;
        return (
          <g key={`${p.x},${p.y}`} onClick={() => onPoint(p)} style={{ cursor: closed ? 'default' : 'pointer' }}>
            {/* 指で押しやすい大きさ（見えない） */}
            <circle cx={c.x} cy={c.y} r={SP * 0.46} fill="transparent" />
            {reach && <circle cx={c.x} cy={c.y} r={17} fill="none" stroke={isStart && n >= 3 ? TILE.glow : SLOT_STROKE} strokeWidth={isStart && n >= 3 ? 4 : 2} opacity={0.75} />}
            <circle cx={c.x} cy={c.y} r={used ? 11 : 8} fill={used ? (isStart ? '#fffaf0' : TILE.glow) : '#8c7c64'} stroke={used ? OUTLINE : 'none'} strokeWidth={3} />
            {isLast && <circle cx={c.x} cy={c.y} r={19} fill="none" stroke={OUTLINE} strokeWidth={2.5} />}
          </g>
        );
      })}
    </svg>
  );
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
