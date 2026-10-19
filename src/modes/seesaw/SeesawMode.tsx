// Mode F：重力のシーソー（v2.3・§19.2）。「＝」を「左右の重さが釣り合っている状態」として見せる。
// 重りは いろぼう と同じ長さ・色（1目盛りずつの区切り、5で太線）。皿に置くとシーソーが傾き、同じ重さで水平になる。
// 本課題（つりあわせる）: 左の皿の重さ t（10をこえたら 10 と のこり）、右の皿に c。右に足す重りを選ぶ（決定点）。
//   違う重りなら、傾いたまま（形で見せる）。もどす か ほかの重りで置きかえられる。
// 自由探索: 左右の皿に好きな重りを置く（皿の上の重りをタップすると下ろせる）。釣り合いを見つけると図鑑に残る。
// 揺れつづける演出はしない（傾きは1回だけ、ゆっくり変わる）。

import { useMemo, useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, usePicker, type TrialCore } from '../kit/useTrialCore';
import { ChoiceTray, type ChoiceItem } from '../kit/ChoiceTray';
import { ModeLayout, successClass } from '../kit/ui';
import { inkOn, numberColor, OUTLINE, SLOT_STROKE, SLOT_STROKE_STRONG, TILE } from '../../core/colors';
import { choicesOf, decisionValue } from '../../core/engine/questions';
import { narrowToTwo } from '../../core/math/choices';
import type { AccessibilitySettings } from '../../core/types';
import { balanceParts, isDiscovery, leftWeights, PAN_MAX_WEIGHTS, sum, tiltOf } from './physics';

type S = Readonly<AccessibilitySettings>;

const W = 1000;
const H = 440;
const PIVOT = { x: 500, y: 330 };
const BEAM = { half: 430, h: 14 };
const PAN = { off: 250, w: 360, h: 10 };
const UNIT = 33;
const WH = 30; // 重り1つの高さ

type Side = 'L' | 'R';

function Weight({ n, x, y, s, ghost, onTap }: { n: number; x: number; y: number; s: S; ghost?: boolean; onTap?: () => void }) {
  const color = numberColor(n, s.colorScheme);
  const w = n * UNIT;
  const ink = inkOn(color);
  return (
    <g opacity={ghost ? 0.45 : 1} onClick={onTap} style={onTap ? { cursor: 'pointer' } : undefined}>
      <rect x={x - w / 2} y={y - WH} width={w} height={WH - 2} rx={6} fill={color} stroke={OUTLINE} strokeWidth={2.5} />
      {Array.from({ length: n - 1 }, (_, i) => {
        const k = i + 1;
        const lx = x - w / 2 + k * UNIT;
        return <line key={k} x1={lx} x2={lx} y1={y - WH + (k % 5 ? 8 : 3)} y2={y - (k % 5 ? 10 : 5)} stroke={ink} strokeWidth={k % 5 ? 2 : 4} opacity={k % 5 ? 0.4 : 0.75} pointerEvents="none" />;
      })}
    </g>
  );
}

function Seesaw(props: { left: number[]; right: number[]; angle: number; s: S; strong?: Side | null; ghostRight?: number | null; onRemove?: (side: Side, i: number) => void; onPan?: (side: Side) => void; glow?: boolean }) {
  const { left, right, angle, s } = props;
  const level = sum(left) === sum(right) && (left.length > 0 || right.length > 0);
  const pan = (side: Side, list: number[], ghost?: number | null) => {
    const cx = PIVOT.x + (side === 'L' ? -PAN.off : PAN.off);
    const top = PIVOT.y - BEAM.h - PAN.h;
    return (
      <g>
        <rect data-drop={side} x={cx - PAN.w / 2} y={top - WH * PAN_MAX_WEIGHTS - 10} width={PAN.w} height={WH * PAN_MAX_WEIGHTS + 10 + PAN.h} fill="transparent" onClick={() => props.onPan?.(side)} style={props.onPan ? { cursor: 'pointer' } : undefined} />
        <rect x={cx - PAN.w / 2} y={top} width={PAN.w} height={PAN.h} rx={4} fill="#d9cdb8" stroke={props.strong === side ? SLOT_STROKE_STRONG : OUTLINE} strokeWidth={props.strong === side ? 5 : 2.5} />
        {list.map((n, i) => (
          <Weight key={`${side}${i}`} n={n} x={cx} y={top - i * WH} s={s} onTap={props.onRemove ? () => props.onRemove!(side, i) : undefined} />
        ))}
        {ghost != null && <Weight n={ghost} x={cx} y={top - list.length * WH} s={s} ghost />}
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
      {/* 水平の目じるし（いつも見えている） */}
      <line x1={40} x2={W - 40} y1={PIVOT.y - BEAM.h / 2} y2={PIVOT.y - BEAM.h / 2} stroke={level ? TILE.glow : SLOT_STROKE} strokeWidth={level ? 4 : 2} strokeDasharray={level ? undefined : '10 8'} />
      <path d={`M${PIVOT.x} ${PIVOT.y} L${PIVOT.x - 46} ${H - 20} L${PIVOT.x + 46} ${H - 20} Z`} fill="#c9bca5" stroke={OUTLINE} strokeWidth={3} />
      <g transform={`rotate(${angle} ${PIVOT.x} ${PIVOT.y})`} className={successClass(s, !!props.glow)}>
        <rect x={PIVOT.x - BEAM.half} y={PIVOT.y - BEAM.h} width={BEAM.half * 2} height={BEAM.h} rx={6} fill="#8c7c64" stroke={OUTLINE} strokeWidth={2.5} />
        {pan('L', left)}
        {pan('R', right, props.ghostRight)}
      </g>
      <circle cx={PIVOT.x} cy={PIVOT.y - BEAM.h / 2} r={9} fill="#fffaf0" stroke={OUTLINE} strokeWidth={2.5} />
    </svg>
  );
}

function WeightIcon({ n, s }: { n: number; s: S }) {
  const u = 9;
  const color = numberColor(n, s.colorScheme);
  return (
    <svg width={n * u + 6} height={24} viewBox={`-3 -3 ${n * u + 6} 24`} aria-hidden>
      <rect x={0} y={0} width={n * u} height={18} rx={3} fill={color} stroke={OUTLINE} strokeWidth={1.5} />
      {n >= 5 && <line x1={5 * u} x2={5 * u} y1={2} y2={16} stroke={inkOn(color)} strokeWidth={2.5} opacity={0.7} />}
    </svg>
  );
}

const weightItems = (values: number[], s: S, prefix = 'w'): ChoiceItem[] => values.map((v, i) => ({ key: `${prefix}${i}-${v}`, value: v, label: 'おもり', node: <WeightIcon n={v} s={s} /> }));

/** 傾きを今の角度から目標の角度へ、ゆっくり1回だけ変える */
function useTilt(core: TrialCore, initial: number) {
  const [angle, setAngle] = useState(initial);
  const to = async (target: number) => {
    const from = angle;
    if (from === target) return;
    await core.anim.run('tilt', () => core.anim.tween(650, (t) => setAngle(from + (target - from) * t)));
  };
  return { angle, to, setAngle };
}

// ---------- 本課題: つりあわせる ----------

function BalanceTask({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const [t, c] = q.operands;
  const left = useMemo(() => leftWeights(t), [t]);
  const answer = decisionValue(q);
  const [placed, setPlaced] = useState<number | null>(null);
  const [ok, setOk] = useState(false);
  const tilt = useTilt(core, tiltOf(left, [c]));
  const pick = usePicker(core);
  const all = useMemo(() => choicesOf(q), [q]);
  const values = core.hintLevel >= 2 ? all.filter((v) => narrowToTwo(answer, q.distractors).includes(v)) : all;
  const items = weightItems(values, s);

  core.onUndo(() => {
    if (core.anim.busy || ok) return;
    if (placed !== null) {
      setPlaced(null);
      core.ctx.emit({ type: 'undo' });
      void tilt.to(tiltOf(left, [c]));
    } else pick.clear();
  });
  core.onHint((lvl) => {
    if (lvl === 3) void core.runDemo();
  });

  const place = async (item: ChoiceItem | undefined) => {
    if (!item || core.anim.busy || ok) return;
    pick.clear();
    const x = item.value;
    const correct = x === answer;
    core.ctx.emit({ type: 'attempt', payload: { value: x } });
    core.ctx.emit({ type: 'decision_made', payload: { value: x, correct } });
    setPlaced(x);
    await tilt.to(tiltOf(left, [c, x]));
    if (!correct) {
      core.mistakes.current++;
      return;
    }
    setOk(true);
    core.ctx.craft(t, balanceParts(left, [c, x]), 'balance');
    core.finish(true);
  };

  return (
    <ModeLayout
      prompt={ok ? 'つりあった！' : placed !== null ? 'もどすか、ほかの おもりに かえて みよう' : 'みぎの さらに どの おもりを のせると つりあうかな'}
      field={
        <Seesaw
          left={left}
          right={placed !== null ? [c, placed] : [c]}
          angle={tilt.angle}
          s={s}
          strong={core.hintLevel >= 1 ? 'R' : null}
          ghostRight={core.demo === 'place' && placed === null ? answer : null}
          glow={ok}
          onPan={(side) => side === 'R' && void place(items.find((i) => i.key === pick.selected))}
        />
      }
      tray={
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          snap={core.snap('R')}
          onDrop={(it) => void place(it)}
          demoKey={core.demo === 'pick' ? items.find((i) => i.value === answer)?.key : null}
          disabled={ok}
        />
      }
    />
  );
}

// ---------- 自由探索 ----------

function ExploreTask({ core }: { core: TrialCore }) {
  const s = core.settings;
  const [left, setLeft] = useState<number[]>([8]);
  const [right, setRight] = useState<number[]>([]);
  const [history, setHistory] = useState<{ left: number[]; right: number[] }[]>([]);
  const tilt = useTilt(core, tiltOf([8], []));
  const [found, setFound] = useState(false);
  const pickL = usePicker(core);
  const pickR = usePicker(core);
  const palette = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const apply = async (l: number[], r: number[]) => {
    setHistory((h) => [...h, { left, right }].slice(-30));
    setLeft(l);
    setRight(r);
    await tilt.to(tiltOf(l, r));
    const disc = isDiscovery(l, r);
    setFound(disc);
    if (disc) {
      core.ctx.emit({ type: 'decision_made', payload: { balance: [l, r] } });
      core.ctx.craft(sum(l), balanceParts(l, r), 'balance');
    }
  };
  const add = (side: Side, n: number) => {
    if (core.anim.busy) return;
    const list = side === 'L' ? left : right;
    if (list.length >= PAN_MAX_WEIGHTS) return;
    core.ctx.emit({ type: 'attempt', payload: { side, value: n } });
    void (side === 'L' ? apply([...left, n], right) : apply(left, [...right, n]));
  };
  const remove = (side: Side, i: number) => {
    if (core.anim.busy) return;
    core.ctx.emit({ type: 'attempt', payload: { side, remove: i } });
    void (side === 'L' ? apply(left.filter((_, j) => j !== i), right) : apply(left, right.filter((_, j) => j !== i)));
  };
  core.onUndo(() => {
    if (core.anim.busy || !history.length) return;
    const last = history[history.length - 1];
    setHistory(history.slice(0, -1));
    core.ctx.emit({ type: 'undo' });
    setLeft(last.left);
    setRight(last.right);
    setFound(isDiscovery(last.left, last.right));
    void tilt.to(tiltOf(last.left, last.right));
  });

  const tray = (side: Side, pick: ReturnType<typeof usePicker>) => {
    const items = weightItems(palette, s, side).map((it) => ({ ...it, disabled: (side === 'L' ? left : right).length >= PAN_MAX_WEIGHTS }));
    return (
      <div className="seesaw-side">
        <span className="seesaw-side-label" aria-hidden>
          {side === 'L' ? '◀ ひだり' : 'みぎ ▶'}
        </span>
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          snap={core.snap(side)}
          onDrop={(it, id) => id === side && add(side, it.value)}
        />
      </div>
    );
  };

  return (
    <ModeLayout
      prompt={found ? 'つりあった！ ほかの くみあわせも ためして みよう' : 'さらに おもりを のせて、つりあう くみあわせを さがそう（のせた おもりは タップで おろせる）'}
      field={
        <Seesaw
          left={left}
          right={right}
          angle={tilt.angle}
          s={s}
          onRemove={remove}
          glow={found}
          onPan={(side) => {
            const p = side === 'L' ? pickL : pickR;
            const v = p.selected ? Number(p.selected.split('-')[1]) : null;
            if (v) add(side, v);
          }}
        />
      }
      tray={
        <div className="seesaw-trays">
          {tray('L', pickL)}
          {tray('R', pickR)}
        </div>
      }
    />
  );
}

function Task({ bridge }: { bridge: ModeBridge }) {
  const core = useTrialCore(bridge);
  if (core.q.learningStage === 'explore') return <ExploreTask core={core} />;
  return <BalanceTask core={core} />;
}

function View({ bridge }: { bridge: ModeBridge }) {
  const st = useBridge(bridge);
  if (!st.question) return null;
  return <Task key={st.qKey} bridge={bridge} />;
}

export const SeesawMode = createReactPlugin(
  {
    id: 'mode_f_seesaw',
    title: 'シーソー',
    description: '「＝」を左右の重さの釣り合いとして見せる。重りは いろぼう と同じ長さ・色。本課題は右の皿に足す重りを選ぶ（決定点）。自由探索で釣り合う組み合わせを見つける。',
    supportedTasks: ['balance'],
    supportedStrategies: ['none'],
    stages: { balance: ['construct'] },
    group: 'lab',
  },
  View,
);
