// Mode H：ぼうの れっしゃ（v2.3・§19.4）。自由探索のみ（決定点なし）。
// うえ と した の列車の棒（いろぼう と同じ長さ・色）を選び、「のばす」をタップすると、短い方の列車に1両つながる。
// 端がそろったところには、印の線が残る（光った瞬間を覚えておく必要はない）。最初にそろうのが最小公倍数。
// 時間で自動に進むことはない（「どんどん のばす」も1両ずつ見せ、とめる・もどすが使える）。

import { useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, type TrialCore } from '../kit/useTrialCore';
import { ChoiceTray, type ChoiceItem } from '../kit/ChoiceTray';
import { ModeLayout, successClass } from '../kit/ui';
import { inkOn, numberColor, OUTLINE, ROD_GRID, SLOT_STROKE_STRONG, TILE } from '../../core/colors';
import type { AccessibilitySettings } from '../../core/types';
import { isPeriodDiscovery, lcm, meetingAt, stepTrains, TRACK, type Trains } from './scenes';

type S = Readonly<AccessibilitySettings>;

const W = 1000;
const H = 330;
const X0 = 50;
const U = 900 / TRACK;
const RH = 42;
const LANE = { A: 86, B: 184 };

function Train({ len, size, y, s }: { len: number; size: number; y: number; s: S }) {
  const color = numberColor(size, s.colorScheme);
  const ink = inkOn(color);
  const cars = len / size;
  return (
    <g>
      {Array.from({ length: cars }, (_, i) => {
        const x = X0 + i * size * U;
        return (
          <g key={i}>
            <rect x={x} y={y} width={size * U} height={RH} rx={6} fill={color} stroke={OUTLINE} strokeWidth={2.5} />
            {s.rodGrid &&
              Array.from({ length: size - 1 }, (_, k) => {
                const lx = x + (k + 1) * U;
                const five = (k + 1) % 5 === 0;
                return <line key={k} x1={lx} x2={lx} y1={y + (five ? 3 : 10)} y2={y + RH - (five ? 3 : 10)} stroke={ink} strokeWidth={five ? 3 : 1.5} opacity={five ? 0.7 : 0.35} />;
              })}
          </g>
        );
      })}
    </g>
  );
}

function Track({ t, meets, s, glow }: { t: Trains | null; meets: number[]; s: S; glow?: boolean }) {
  const y0 = 50;
  const y1 = 270;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
      {Array.from({ length: TRACK + 1 }, (_, i) => {
        const x = X0 + i * U;
        const five = i % 5 === 0;
        const ten = i % 10 === 0;
        return <line key={i} x1={x} x2={x} y1={y0} y2={y1} stroke={five ? ROD_GRID.five : ROD_GRID.one} strokeWidth={ten ? 3 : five ? 2 : 1} strokeDasharray={five ? undefined : '4 6'} opacity={five ? 0.8 : 0.6} />;
      })}
      <line x1={X0} x2={X0 + TRACK * U} y1={y1} y2={y1} stroke={ROD_GRID.five} strokeWidth={2.5} />
      {/* 線路のかべ */}
      <rect x={X0 + TRACK * U} y={y0 - 10} width={10} height={y1 - y0 + 20} rx={3} fill="#8c7c64" />
      {t && (
        <g>
          <Train len={t.lenA} size={t.a} y={LANE.A} s={s} />
          <Train len={t.lenB} size={t.b} y={LANE.B} s={s} />
        </g>
      )}
      {/* そろったところの印（残る） */}
      <g className={successClass(s, !!glow)}>
        {meets.map((m) => {
          const x = X0 + m * U;
          return (
            <g key={m}>
              <line x1={x} x2={x} y1={y0 - 6} y2={y1 + 6} stroke={TILE.glow} strokeWidth={5} />
              <path d={`M${x} ${y0 - 26} l5 10 l11 1 l-8 7 l3 11 l-11 -6 l-11 6 l3 -11 l-8 -7 l11 -1 z`} fill={TILE.glow} stroke={SLOT_STROKE_STRONG} strokeWidth={1.5} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function RodIcon({ n, s }: { n: number; s: S }) {
  const u = 8;
  return (
    <svg width={n * u + 6} height={22} viewBox={`-3 -3 ${n * u + 6} 22`} aria-hidden>
      <rect x={0} y={0} width={n * u} height={16} rx={3} fill={numberColor(n, s.colorScheme)} stroke={OUTLINE} strokeWidth={1.5} />
    </svg>
  );
}

function ExploreTask({ core }: { core: TrialCore }) {
  const s = core.settings;
  const [t, setT] = useState<Trains>({ a: 3, b: 4, lenA: 0, lenB: 0 });
  const [meets, setMeets] = useState<number[]>([]);
  const [past, setPast] = useState<{ t: Trains; meets: number[] }[]>([]);
  const [glow, setGlow] = useState(false);
  const next = stepTrains(t);

  const choose = (lane: 'a' | 'b', n: number) => {
    if (core.anim.busy) return;
    core.ctx.emit({ type: 'attempt', payload: { [lane]: n } });
    setPast((p) => [...p, { t, meets }].slice(-60));
    setT({ ...t, [lane]: n, lenA: 0, lenB: 0 });
    setMeets([]);
    setGlow(false);
  };

  /** 1両すすめる。そろったら印を残す */
  const stepOnce = (cur: Trains, curMeets: number[]): { t: Trains; meets: number[] } | null => {
    const n = stepTrains(cur);
    if (!n) return null;
    const m = meetingAt(n);
    const nextMeets = m !== null ? [...curMeets, m] : curMeets;
    if (m !== null && curMeets.length === 0 && isPeriodDiscovery(n.a, n.b)) core.ctx.craft(lcm(n.a, n.b), [Math.min(n.a, n.b), Math.max(n.a, n.b)], 'period');
    return { t: n, meets: nextMeets };
  };

  const extend = async () => {
    if (core.anim.busy) return;
    const r = stepOnce(t, meets);
    if (!r) return;
    core.ctx.emit({ type: 'attempt', payload: { extend: true } });
    setPast((p) => [...p, { t, meets }].slice(-60));
    await core.anim.run('extend', () => core.anim.wait(150));
    setT(r.t);
    setMeets(r.meets);
    setGlow(r.meets.length > meets.length);
  };

  const extendAll = async () => {
    if (core.anim.busy) return;
    core.ctx.emit({ type: 'attempt', payload: { extendAll: true } });
    setPast((p) => [...p, { t, meets }].slice(-60));
    let cur = t;
    let curMeets = meets;
    await core.anim.run('extend-all', async () => {
      for (;;) {
        const r = stepOnce(cur, curMeets);
        if (!r) break;
        cur = r.t;
        curMeets = r.meets;
        setT(cur);
        setMeets(curMeets);
        await core.anim.wait(260);
      }
    });
    setGlow(curMeets.length > 0);
  };

  core.onUndo(() => {
    if (core.anim.busy || !past.length) return;
    const last = past[past.length - 1];
    setPast(past.slice(0, -1));
    core.ctx.emit({ type: 'undo' });
    setT(last.t);
    setMeets(last.meets);
    setGlow(false);
  });

  const reset = () => {
    if (core.anim.busy) return;
    setPast((p) => [...p, { t, meets }].slice(-60));
    setT({ ...t, lenA: 0, lenB: 0 });
    setMeets([]);
    setGlow(false);
  };

  const items = (lane: 'a' | 'b'): ChoiceItem[] => Array.from({ length: 10 }, (_, i) => i + 1).map((n) => ({ key: `${lane}${n}`, value: n, label: 'ぼう', node: <RodIcon n={n} s={s} /> }));
  const prompt = !next
    ? meets.length
      ? 'かべまで きたよ。ほかの ぼうでも ためして みよう'
      : 'かべまでに そろわなかった！ ほかの ぼうでも ためして みよう'
    : meets.length
      ? 'はしが そろった！ つぎは どこで そろうかな'
      : 'うえと したの ぼうを えらんで「のばす」。はしが そろうのは どこかな';

  return (
    <ModeLayout
      prompt={prompt}
      field={<Track t={t} meets={meets} s={s} glow={glow} />}
      tray={
        <div className="lab-tray">
          <div className="seesaw-trays">
            <div className="seesaw-side">
              <span className="seesaw-side-label">▲ うえ</span>
              <ChoiceTray items={items('a')} selected={`a${t.a}`} onTap={(it) => choose('a', it.value)} />
            </div>
            <div className="seesaw-side">
              <span className="seesaw-side-label">▼ した</span>
              <ChoiceTray items={items('b')} selected={`b${t.b}`} onTap={(it) => choose('b', it.value)} />
            </div>
          </div>
          <div className="lab-row">
            <button type="button" className="btn-main" onClick={() => void extend()} disabled={!next}>
              のばす
            </button>
            <button type="button" className="btn-soft" onClick={() => void extendAll()} disabled={!next}>
              どんどん のばす
            </button>
            <button type="button" className="btn-soft" onClick={reset} disabled={t.lenA === 0 && t.lenB === 0}>
              さいしょから
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

export const TrainsMode = createReactPlugin(
  {
    id: 'mode_h_trains',
    title: 'ぼうの れっしゃ',
    description: '2本の列車に同じ長さの棒をつないでいき、端がそろう位置（公倍数）を印で残す。タップで1両ずつ進む（時間では進まない）。自由探索のみ。',
    supportedTasks: ['period'],
    supportedStrategies: ['none'],
    stages: {},
    group: 'lab',
  },
  View,
);
