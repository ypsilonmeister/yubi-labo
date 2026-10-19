// Mode G：ばいばいラボ（v2.3・§19.3）。自由探索のみ（決定点なし）。
// ふえる: 「1にち すすむ」をタップするたびに ×2・×3・×10。64 匹までは1匹ずつ（親から分かれて出てくる）、
//   それより多いと 1・10・100・1000・10000 のまとまり（ブロック）で見せる。数字は出さない。「1にち もどる」で戻れる。
// わける: スライムをタップすると半分に分かれる（1/16 まで）。「がったい」で同じ大きさどうしが合わさり、元の大きさにもどる。
//   元の大きさの輪郭はいつも横に見えている（参照を消さない）。

import { useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, type TrialCore } from '../kit/useTrialCore';
import { HistoryStrip, ModeLayout, successClass } from '../kit/ui';
import { OUTLINE, SLOT_STROKE, TILE } from '../../core/colors';
import type { AccessibilitySettings } from '../../core/types';
import { canGrow, evenSplit, FACTORS, MAX_PARTS, mergeAll, placeBlocks, powerOf, SHOW_EACH_MAX, split, type Factor } from './scenes';

type S = Readonly<AccessibilitySettings>;

const W = 1000;
const H = 400;

function SlimeShape({ x, y, r, color, opacity = 1 }: { x: number; y: number; r: number; color: string; opacity?: number }) {
  if (opacity <= 0.01) return null;
  return (
    <g opacity={opacity}>
      <path d={`M${x - r} ${y + r * 0.7} Q${x - r} ${y - r} ${x} ${y - r} Q${x + r} ${y - r} ${x + r} ${y + r * 0.7} Z`} fill={color} stroke={OUTLINE} strokeWidth={Math.max(1, r / 10)} />
      {r > 7 && (
        <>
          <circle cx={x - r * 0.33} cy={y - r * 0.12} r={r * 0.11} fill={OUTLINE} />
          <circle cx={x + r * 0.33} cy={y - r * 0.12} r={r * 0.11} fill={OUTLINE} />
        </>
      )}
    </g>
  );
}

// ---------- ふえる ----------

interface Dot {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

function dotLayout(n: number): Dot[] {
  const cell = Math.min(120, Math.sqrt((900 * 340) / Math.max(1, n)) * 0.92);
  const cols = Math.max(1, Math.floor(900 / cell));
  const rows = Math.ceil(n / cols);
  const x0 = (W - Math.min(n, cols) * cell) / 2 + cell / 2;
  const y0 = (H - rows * cell) / 2 + cell / 2 + 8;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * cell, y: y0 + Math.floor(i / cols) * cell, r: cell * 0.4, opacity: 1 }));
}

/** 1・10・100・1000・10000 のブロック（位ごとに 3×3 までの並び） */
function Blocks({ n }: { n: number }) {
  const b = placeBlocks(n);
  const top = b.reduce((m, c, i) => (c ? i : m), 0);
  const sizes = [18, 46, 46, 62, 76];
  const widths = [18, 12, 46, 62, 76];
  const cols: { place: number; count: number; w: number }[] = [];
  for (let p = top; p >= 0; p--) cols.push({ place: p, count: b[p], w: 3 * (widths[p] + 8) });
  const totalW = cols.reduce((s, c) => s + c.w, 0) + (cols.length - 1) * 30;
  let x = (W - totalW) / 2;
  const out = cols.map((c) => {
    const x0 = x;
    x += c.w + 30;
    return (
      <g key={c.place}>
        {Array.from({ length: c.count }, (_, i) => {
          const gx = x0 + (i % 3) * (widths[c.place] + 8);
          const gy = 70 + Math.floor(i / 3) * (sizes[c.place] + 14);
          return <Block key={i} place={c.place} x={gx} y={gy} />;
        })}
        <line x1={x0 + c.w + 15} x2={x0 + c.w + 15} y1={50} y2={H - 30} stroke={SLOT_STROKE} strokeWidth={1.5} strokeDasharray="5 5" opacity={c.place ? 0.8 : 0} />
      </g>
    );
  });
  return <g>{out}</g>;
}

function Block({ place, x, y }: { place: number; x: number; y: number }) {
  const f = TILE.fill;
  const st = TILE.stroke;
  if (place === 0) return <rect x={x} y={y} width={18} height={18} rx={3} fill={f} stroke={st} strokeWidth={1.5} />;
  if (place === 1)
    return (
      <g>
        <rect x={x} y={y} width={12} height={46} rx={2} fill={f} stroke={st} strokeWidth={1.5} />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1={x} x2={x + 12} y1={y + (i + 1) * 4.6} y2={y + (i + 1) * 4.6} stroke={st} strokeWidth={0.6} />
        ))}
      </g>
    );
  if (place === 2)
    return (
      <g>
        <rect x={x} y={y} width={46} height={46} rx={2} fill={f} stroke={st} strokeWidth={1.5} />
        {Array.from({ length: 9 }, (_, i) => (
          <g key={i} stroke={st} strokeWidth={0.5}>
            <line x1={x + (i + 1) * 4.6} x2={x + (i + 1) * 4.6} y1={y} y2={y + 46} />
            <line x1={x} x2={x + 46} y1={y + (i + 1) * 4.6} y2={y + (i + 1) * 4.6} />
          </g>
        ))}
      </g>
    );
  // 1000 は立方体、10000 は大きな箱（帯つき）
  const s = place === 3 ? 46 : 56;
  const d = s * 0.35;
  return (
    <g stroke={st} strokeWidth={1.5}>
      <path d={`M${x} ${y + d} L${x + d} ${y} L${x + s + d} ${y} L${x + s} ${y + d} Z`} fill="#c4dcf0" />
      <path d={`M${x + s} ${y + d} L${x + s + d} ${y} L${x + s + d} ${y + s} L${x + s} ${y + s + d} Z`} fill="#7fa9cc" />
      <rect x={x} y={y + d} width={s} height={s} fill={f} />
      {place === 4 && <rect x={x} y={y + d + s * 0.4} width={s} height={s * 0.18} fill={TILE.glow} stroke="none" opacity={0.85} />}
    </g>
  );
}

function FactorIcon({ f }: { f: Factor }) {
  if (f === 10)
    return (
      <svg width={74} height={30} viewBox="0 0 74 30" aria-hidden>
        <circle cx={8} cy={15} r={6} fill={TILE.fill} stroke={OUTLINE} strokeWidth={1.5} />
        <text x={20} y={20} fontSize={14} fill="#3a3226">→</text>
        <rect x={34} y={9} width={38} height={12} rx={2} fill={TILE.fill} stroke={OUTLINE} strokeWidth={1.5} />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1={34 + (i + 1) * 3.8} x2={34 + (i + 1) * 3.8} y1={9} y2={21} stroke={OUTLINE} strokeWidth={0.6} />
        ))}
      </svg>
    );
  return (
    <svg width={30 + f * 14} height={30} viewBox={`0 0 ${30 + f * 14} 30`} aria-hidden>
      <circle cx={8} cy={15} r={6} fill={TILE.fill} stroke={OUTLINE} strokeWidth={1.5} />
      <text x={20} y={20} fontSize={14} fill="#3a3226">→</text>
      {Array.from({ length: f }, (_, i) => (
        <circle key={i} cx={38 + i * 14} cy={15} r={6} fill={TILE.fill} stroke={OUTLINE} strokeWidth={1.5} />
      ))}
    </svg>
  );
}

function GrowField({ n, dots, s, thumb, glow }: { n: number; dots: Dot[] | null; s: S; thumb?: boolean; glow?: boolean }) {
  const color = TILE.fill;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={thumb ? undefined : 'field-svg'} width={thumb ? 150 : undefined} height={thumb ? (150 * H) / W : undefined} aria-hidden={thumb}>
      <rect x={20} y={14} width={W - 40} height={H - 28} rx={26} fill="#f6f1e6" stroke={SLOT_STROKE} strokeWidth={3} />
      <g className={successClass(s, !!glow)}>
        {n <= SHOW_EACH_MAX ? (dots ?? dotLayout(n)).map((d, i) => <SlimeShape key={i} x={d.x} y={d.y} r={d.r} color={color} opacity={d.opacity} />) : <Blocks n={n} />}
      </g>
    </svg>
  );
}

function GrowLab({ core }: { core: TrialCore }) {
  const s = core.settings;
  const [n, setN] = useState(1);
  const [factor, setFactor] = useState<Factor>(2);
  const [steps, setSteps] = useState<number[]>([]);
  const [dots, setDots] = useState<Dot[] | null>(null);
  const [found, setFound] = useState(false);

  const grow = async () => {
    if (core.anim.busy || !canGrow(n, factor)) return;
    const next = n * factor;
    const nextSteps = [...steps, factor];
    core.ctx.emit({ type: 'attempt', payload: { grow: factor } });
    setSteps(nextSteps);
    if (next <= SHOW_EACH_MAX) {
      // 親から分かれて出てくる
      const from = dotLayout(n);
      const to = dotLayout(next);
      await core.anim.run('grow', () =>
        core.anim.tween(700, (t) =>
          setDots(
            to.map((q, i) => {
              const p = from[i] ?? { ...from[i % n], opacity: 0.2 };
              return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, r: p.r + (q.r - p.r) * t, opacity: p.opacity + (q.opacity - p.opacity) * t };
            }),
          ),
        ),
      );
    } else await core.anim.run('grow', () => core.anim.wait(300));
    setDots(null);
    setN(next);
    const p = powerOf(nextSteps);
    setFound(!!p);
    if (p) core.ctx.craft(p.value, [p.factor, p.days], 'power');
  };
  const back = () => {
    if (core.anim.busy || !steps.length) return;
    core.ctx.emit({ type: 'undo' });
    const f = steps[steps.length - 1];
    setSteps(steps.slice(0, -1));
    setN(n / f);
    setFound(!!powerOf(steps.slice(0, -1)));
  };
  core.onUndo(back);
  const reset = () => {
    if (core.anim.busy) return;
    setN(1);
    setSteps([]);
    setFound(false);
  };

  // 直前の日を縮小表示で残す
  const prev: number[] = [];
  let v = n;
  for (let i = steps.length - 1; i >= 0 && prev.length < 4; i--) {
    v = v / steps[i];
    prev.unshift(v);
  }

  return (
    <ModeLayout
      prompt={!canGrow(n, factor) ? 'もう はこに はいりきらないよ！ もどるか、さいしょから' : found ? 'ばいばいで ふえた！ どこまで ふえるかな' : 'ふえかたを えらんで「1にち すすむ」を おしてみよう'}
      field={<GrowField n={n} dots={dots} s={s} glow={found} />}
      history={<HistoryStrip items={prev.map((p, i) => ({ key: `${i}-${p}`, node: <GrowField n={p} dots={null} s={s} thumb /> }))} />}
      tray={
        <div className="lab-tray">
          <div className="lab-row" role="group" aria-label="ふえかた">
            {FACTORS.map((f) => (
              <button key={f} type="button" className={`choice${factor === f ? ' is-selected' : ''}`} aria-pressed={factor === f} onClick={() => setFactor(f)} aria-label={`${f}ばいに ふえる`}>
                <FactorIcon f={f} />
              </button>
            ))}
          </div>
          <div className="lab-row">
            <button type="button" className="btn-soft" onClick={back} disabled={!steps.length}>
              ☾ 1にち もどる
            </button>
            <button type="button" className="btn-main" onClick={() => void grow()} disabled={!canGrow(n, factor)}>
              ☀ 1にち すすむ
            </button>
            <button type="button" className="btn-soft" onClick={reset}>
              さいしょから
            </button>
          </div>
          {steps.length > 0 && (
            <div className="days" aria-label="すすんだ ひ">
              {steps.slice(-20).map((f, i) => (
                <span key={`${i}-${f}`} className="day">
                  ☀
                </span>
              ))}
            </div>
          )}
        </div>
      }
    />
  );
}

// ---------- わける ----------

const R1 = 120;
const REF = { x: 150, y: 210 };

function pieceLayout(pieces: number[]): { x: number; y: number; r: number }[] {
  // 大きい順に、右側の場所へ左から並べる（行がいっぱいなら次の行）
  const out: { x: number; y: number; r: number }[] = [];
  let x = 330;
  let y = 90;
  let rowH = 0;
  for (const d of pieces) {
    const r = R1 / Math.sqrt(d);
    if (x + 2 * r > W - 30) {
      x = 330;
      y += rowH + 12;
      rowH = 0;
    }
    out.push({ x: x + r, y: y + r, r });
    x += 2 * r + 12;
    rowH = Math.max(rowH, 2 * r);
  }
  return out;
}

function SplitLab({ core }: { core: TrialCore }) {
  const s = core.settings;
  const [pieces, setPieces] = useState<number[]>([1]);
  const [undoStack, setUndoStack] = useState<number[][]>([]);
  const color = TILE.fill;
  const even = evenSplit(pieces);

  const apply = (next: number[]) => {
    setUndoStack((u) => [...u, pieces].slice(-30));
    setPieces(next);
    const d = evenSplit(next);
    if (d) core.ctx.craft(1, [d], 'fraction');
  };
  const tap = async (i: number) => {
    if (core.anim.busy || pieces[i] * 2 > MAX_PARTS) return;
    core.ctx.emit({ type: 'attempt', payload: { split: pieces[i] } });
    await core.anim.run('split', () => core.anim.wait(120));
    apply(split(pieces, i));
  };
  const merge = async () => {
    if (core.anim.busy) return;
    const next = mergeAll(pieces);
    if (next.join() === pieces.join()) return;
    core.ctx.emit({ type: 'attempt', payload: { merge: true } });
    await core.anim.run('merge', () => core.anim.wait(200));
    apply(next);
  };
  core.onUndo(() => {
    if (core.anim.busy || !undoStack.length) return;
    core.ctx.emit({ type: 'undo' });
    setPieces(undoStack[undoStack.length - 1]);
    setUndoStack(undoStack.slice(0, -1));
  });
  const layout = pieceLayout(pieces);
  return (
    <ModeLayout
      prompt={pieces.length === 1 ? 'スライムを タップすると はんぶんに わかれるよ' : even ? 'ぜんぶ おなじ おおきさ！「がったい」で もとに もどるかな' : 'もっと わけたり、「がったい」したり してみよう'}
      field={
        <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
          <rect x={20} y={14} width={W - 40} height={H - 28} rx={26} fill="#f6f1e6" stroke={SLOT_STROKE} strokeWidth={3} />
          {/* 元の大きさ（いつも見えている） */}
          <circle cx={REF.x} cy={REF.y} r={R1} fill="none" stroke={SLOT_STROKE} strokeWidth={3} strokeDasharray="10 8" />
          <text x={REF.x} y={REF.y + R1 + 26} textAnchor="middle" fontSize={18} fill="#7a6e5c">
            もとの おおきさ
          </text>
          <g className={successClass(s, !!even)}>
            {layout.map((p, i) => (
              <g key={`${i}-${pieces[i]}`} onClick={() => void tap(i)} style={{ cursor: pieces[i] * 2 <= MAX_PARTS ? 'pointer' : 'default' }}>
                <circle cx={p.x} cy={p.y} r={Math.max(p.r, 24)} fill="transparent" />
                <circle cx={p.x} cy={p.y} r={p.r} fill={color} stroke={OUTLINE} strokeWidth={2.5} />
                <circle cx={p.x - p.r * 0.32} cy={p.y - p.r * 0.15} r={p.r * 0.1} fill={OUTLINE} />
                <circle cx={p.x + p.r * 0.32} cy={p.y - p.r * 0.15} r={p.r * 0.1} fill={OUTLINE} />
              </g>
            ))}
          </g>
        </svg>
      }
      tray={
        <div className="lab-row">
          <button type="button" className="btn-main" onClick={() => void merge()} disabled={mergeAll(pieces).join() === pieces.join()}>
            がったい
          </button>
          <button type="button" className="btn-soft" onClick={() => apply([1])} disabled={pieces.length === 1}>
            さいしょから
          </button>
        </div>
      }
    />
  );
}

function ExploreTask({ core }: { core: TrialCore }) {
  const [view, setView] = useState<'grow' | 'split'>('grow');
  return (
    <div className="lab">
      <div className="lab-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'grow'} className={view === 'grow' ? 'on' : ''} onClick={() => setView('grow')}>
          <FactorIcon f={2} /> ふえる
        </button>
        <button type="button" role="tab" aria-selected={view === 'split'} className={view === 'split' ? 'on' : ''} onClick={() => setView('split')}>
          ◐ わける
        </button>
      </div>
      {view === 'grow' ? <GrowLab core={core} /> : <SplitLab core={core} />}
    </div>
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

export const DoublingMode = createReactPlugin(
  {
    id: 'mode_g_doubling',
    title: 'ばいばいラボ',
    description: '1日ごとに ×2・×3・×10 でふえる様子を、64までは1匹ずつ、それより多いと 1・10・100・1000・10000 のまとまりで見せる。1 を半分ずつ分け、同じ大きさどうしを合体して元にもどす（分数）。自由探索のみ。',
    supportedTasks: ['doubling'],
    supportedStrategies: ['none'],
    stages: {},
    group: 'lab',
  },
  View,
);
