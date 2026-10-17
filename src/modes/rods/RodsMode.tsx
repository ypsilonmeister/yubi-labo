// Mode B：カラーロッド（§9.2）
// 目盛りなしの色棒。長さの単位倍率は全問で一定（10本分が中央フレームの幅に収まる最大値）。
// 比較する棒は左端をそろえ、長さの終点を静的な枠で示す。誤答は、はみ出す／足りない様子で示す。

import { useMemo, useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, usePicker, type TrialCore } from '../kit/useTrialCore';
import { ChoiceTray, type ChoiceItem } from '../kit/ChoiceTray';
import { HistoryStrip, ModeLayout, Sparkles, StepControls, successClass } from '../kit/ui';
import { numberColor, OUTLINE, SLOT_FILL, SLOT_STROKE, SLOT_STROKE_STRONG } from '../../core/colors';
import { choicesOf, decisionValue } from '../../core/engine/questions';
import { narrowToTwo } from '../../core/math/choices';
import type { AccessibilitySettings } from '../../core/types';

const W = 1000;
const H = 360;
/** 単位長（全問で一定）。10本分 = 900 */
export const UNIT = 90;
const X0 = 50;
const RH = 56;

type S = Readonly<AccessibilitySettings>;

interface RodPose {
  key: string;
  value: number;
  x: number;
  y: number;
  opacity?: number;
}

function Rod({ p, s, className }: { p: RodPose; s: S; className?: string }) {
  return (
    <rect
      x={p.x}
      y={p.y}
      width={p.value * UNIT}
      height={RH}
      rx={8}
      fill={numberColor(p.value, s.colorScheme)}
      stroke={OUTLINE}
      strokeWidth={3}
      opacity={p.opacity ?? 1}
      className={className}
      pointerEvents="none"
    />
  );
}

/** 目標の枠: 左端と終点を静的に示す。上から重ねて描くと、はみ出しが見える */
function Frame({ length, y, strong, over }: { length: number; y: number; strong?: boolean; over?: boolean }) {
  const end = X0 + length * UNIT;
  if (over)
    return (
      <g pointerEvents="none">
        <rect x={X0} y={y} width={length * UNIT} height={RH} rx={8} fill="none" stroke={SLOT_STROKE_STRONG} strokeWidth={4} strokeDasharray="10 7" />
        <line x1={end} x2={end} y1={y - 22} y2={y + RH + 22} stroke={SLOT_STROKE_STRONG} strokeWidth={strong ? 8 : 5} />
      </g>
    );
  return (
    <g pointerEvents="none">
      <rect x={X0} y={y} width={length * UNIT} height={RH} rx={8} fill={SLOT_FILL} stroke={strong ? SLOT_STROKE_STRONG : SLOT_STROKE} strokeWidth={strong ? 5 : 3} strokeDasharray={strong ? undefined : '10 7'} />
      <line x1={X0} x2={X0} y1={y - 22} y2={y + RH + 22} stroke={SLOT_STROKE} strokeWidth={4} />
      <line x1={end} x2={end} y1={y - 22} y2={y + RH + 22} stroke={strong ? SLOT_STROKE_STRONG : SLOT_STROKE} strokeWidth={strong ? 8 : 5} />
    </g>
  );
}

function RodIcon({ n, s }: { n: number; s: S }) {
  const u = 13;
  return (
    <svg width={n * u + 6} height={26} viewBox={`-3 -3 ${n * u + 6} 26`} aria-hidden>
      <rect x={0} y={0} width={n * u} height={20} rx={4} fill={numberColor(n, s.colorScheme)} stroke={OUTLINE} strokeWidth={2} />
    </svg>
  );
}

function rodChoices(values: number[], s: S): ChoiceItem[] {
  return values.map((v, i) => ({ key: `r${i}-${v}`, value: v, label: 'ぼう', node: <RodIcon n={v} s={s} /> }));
}

function useChoiceValues(core: TrialCore, value: number): number[] {
  const all = useMemo(() => choicesOf(core.q), [core.q]);
  return core.hintLevel >= 2 ? all.filter((v) => narrowToTwo(value, core.q.distractors).includes(v)) : all;
}

function lerp(a: RodPose[], b: RodPose[], t: number): RodPose[] {
  return b.map((p) => {
    const q = a.find((x) => x.key === p.key) ?? { ...p, opacity: 0 };
    return { ...p, x: q.x + (p.x - q.x) * t, y: q.y + (p.y - q.y) * t, opacity: (q.opacity ?? 1) + ((p.opacity ?? 1) - (q.opacity ?? 1)) * t };
  });
}

function Thumb({ rods, s, extra }: { rods: RodPose[]; s: S; extra?: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={150} height={(150 * H) / W} aria-hidden>
      {extra}
      {rods.map((p) => (
        <Rod key={p.key} p={p} s={s} />
      ))}
    </svg>
  );
}

function DropArea({ onTap }: { onTap: () => void }) {
  return <rect data-drop="slot" x={0} y={0} width={W} height={H} fill="transparent" onClick={onTap} style={{ cursor: 'pointer' }} />;
}

// ---------- 識別: 枠の長さと同じ棒を選ぶ（長さだけで解ける） ----------

function IdentifyTask({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const n = q.operands[0];
  const pick = usePicker(core);
  const [placed, setPlaced] = useState<number | null>(null);
  const [ok, setOk] = useState(false);
  const items = rodChoices(useChoiceValues(core, n), s);
  const y = 130;

  core.onUndo(() => {
    if (ok) return;
    if (placed !== null) {
      setPlaced(null);
      core.ctx.emit({ type: 'undo' });
    } else pick.clear();
  });
  core.onHint((lvl) => {
    if (lvl === 3) void core.runDemo();
  });
  const place = (item: ChoiceItem | undefined) => {
    if (!item || ok || core.anim.busy) return;
    const correct = item.value === n;
    core.ctx.emit({ type: 'attempt', payload: { value: item.value } });
    core.ctx.emit({ type: 'decision_made', payload: { value: item.value, correct } });
    setPlaced(item.value);
    pick.clear();
    if (correct) {
      setOk(true);
      core.finish(true);
    } else core.mistakes.current++;
  };
  return (
    <ModeLayout
      prompt="わくと おなじ ながさの ぼうは どれかな"
      field={
        <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
          <DropArea onTap={() => place(items.find((i) => i.key === pick.selected))} />
          <Frame length={n} y={y} strong={core.hintLevel >= 1} />
          {placed !== null && <Rod p={{ key: 'p', value: placed, x: X0, y }} s={s} className={successClass(s, ok)} />}
          {placed !== null && !ok && <Frame length={n} y={y} over strong={core.hintLevel >= 1} />}
          {core.demo === 'place' && <Rod p={{ key: 'd', value: n, x: X0, y, opacity: 0.5 }} s={s} />}
          <Sparkles s={s} on={ok} x={X0} y={y} w={n * UNIT} />
        </svg>
      }
      tray={
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          snap={core.snap('slot')}
          onDrop={(it) => place(it)}
          demoKey={core.demo === 'pick' ? items.find((i) => i.value === n)?.key : null}
          disabled={ok}
        />
      }
    />
  );
}

// ---------- 合成・10の補数: 隙間を埋める棒を選ぶ ----------

function ComposeTask({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const a = q.operands[0];
  const total = q.taskType === 'complement_10' ? 10 : q.operands[0] + q.operands[1];
  const need = decisionValue(q);
  const y = 70;
  const stageY = 220;
  const pick = usePicker(core);
  const [rod, setRod] = useState<RodPose | null>(null);
  const [ok, setOk] = useState(false);
  const [history, setHistory] = useState<RodPose[][]>([]);
  const items = rodChoices(useChoiceValues(core, need), s);
  const aRod: RodPose = { key: 'a', value: a, x: X0, y };

  core.onUndo(() => {
    if (ok || core.anim.busy) return;
    if (rod) {
      setRod(null);
      setHistory([]);
      core.ctx.emit({ type: 'undo' });
    } else pick.clear();
  });
  core.onHint((lvl) => {
    if (lvl === 3) void core.runDemo();
  });

  const place = async (item: ChoiceItem | undefined) => {
    if (!item || ok || core.anim.busy) return;
    pick.clear();
    const x = item.value;
    const correct = x === need;
    core.ctx.emit({ type: 'attempt', payload: { value: x } });
    core.ctx.emit({ type: 'decision_made', payload: { value: x, correct } });
    const from: RodPose = { key: 'x', value: x, x: X0 + a * UNIT, y: stageY };
    const to: RodPose = { ...from, y };
    setRod(from);
    setHistory([[aRod, from]]);
    await core.anim.run(
      'place',
      async () => {
        await core.anim.tween(700, (t) => setRod(lerp([from], [to], t)[0]));
        if (correct) {
          await core.anim.wait(300);
          setOk(true);
          await core.anim.wait(300);
        }
      },
      { keepDisabled: correct },
    );
    if (correct) {
      core.ctx.craft(total, [a, need]);
      core.finish(true);
    } else core.mistakes.current++;
  };

  return (
    <ModeLayout
      prompt={q.taskType === 'complement_10' ? '10の ながさに なるように、すきまに はいる ぼうは どれかな' : 'すきまに ぴったり はいる ぼうは どれかな'}
      field={
        <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
          <DropArea onTap={() => void place(items.find((i) => i.key === pick.selected))} />
          <Frame length={total} y={y} strong={core.hintLevel >= 1} />
          {ok ? (
            <Rod p={{ key: 'm', value: total, x: X0, y }} s={s} className={successClass(s, true)} />
          ) : (
            <>
              <Rod p={aRod} s={s} />
              {rod && <Rod p={rod} s={s} />}
              {rod && <Frame length={total} y={y} over strong={core.hintLevel >= 1} />}
            </>
          )}
          {core.demo === 'place' && <Rod p={{ key: 'd', value: need, x: X0 + a * UNIT, y, opacity: 0.5 }} s={s} />}
          <Sparkles s={s} on={ok} x={X0} y={y} w={total * UNIT} />
        </svg>
      }
      history={
        <HistoryStrip
          items={history.map((h, i) => ({
            key: String(i),
            node: <Thumb rods={h} s={s} extra={<Frame length={total} y={y} />} />,
          }))}
        />
      }
      tray={
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          snap={core.snap('slot')}
          onDrop={(it) => void place(it)}
          demoKey={core.demo === 'pick' ? items.find((i) => i.value === need)?.key : null}
          disabled={ok}
        />
      }
    />
  );
}

// ---------- 予測・観察で使う場面 ----------

function connectScenes(a: number, b: number): RodPose[][] {
  const y1 = 60;
  const y2 = 200;
  return [
    [
      { key: 'a', value: a, x: X0, y: y1 },
      { key: 'b', value: b, x: X0, y: y2 },
    ],
    [
      { key: 'a', value: a, x: X0, y: y1 },
      { key: 'b', value: b, x: X0 + a * UNIT, y: y1 },
    ],
    [
      { key: 'a', value: a, x: X0, y: y1 },
      { key: 'b', value: b, x: X0 + a * UNIT, y: y1 },
      { key: 'c', value: a + b, x: X0, y: y2 },
    ],
    [
      { key: 'm', value: a + b, x: X0, y: y1 },
      { key: 'c', value: a + b, x: X0, y: y2 },
    ],
  ];
}

function PredictTask({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const [a, b] = q.operands;
  const answer = decisionValue(q);
  const y1 = 60;
  const y2 = 200;
  const pick = usePicker(core);
  const [pred, setPred] = useState<number | null>(null);
  const [merged, setMerged] = useState(false);
  const items = rodChoices(useChoiceValues(core, answer), s);
  const connected: RodPose[] = [
    { key: 'a', value: a, x: X0, y: y1 },
    { key: 'b', value: b, x: X0 + a * UNIT, y: y1 },
  ];

  core.onUndo(() => {
    if (pred === null) pick.clear();
  });
  core.onHint((lvl) => {
    if (lvl === 3) void core.runDemo();
  });
  const place = async (item: ChoiceItem | undefined) => {
    if (!item || pred !== null || core.anim.busy) return;
    pick.clear();
    const correct = item.value === answer;
    core.ctx.emit({ type: 'prediction_made', payload: { value: item.value, correct } });
    core.ctx.emit({ type: 'decision_made', payload: { value: item.value, correct } });
    setPred(item.value);
    if (!correct) core.mistakes.current++;
    await core.anim.run(
      'mechanism',
      async () => {
        await core.anim.wait(900);
        setMerged(true);
        await core.anim.wait(500);
      },
      { keepDisabled: true },
    );
    core.finish(correct);
  };
  const shown = core.demo === 'place' ? answer : pred;
  return (
    <ModeLayout
      prompt="つないだ ながさと おなじ ぼうは どれかな"
      field={
        <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
          <DropArea onTap={() => void place(items.find((i) => i.key === pick.selected))} />
          {merged ? (
            <Rod p={{ key: 'm', value: a + b, x: X0, y: y1 }} s={s} className={successClass(s, pred === answer)} />
          ) : (
            connected.map((p) => <Rod key={p.key} p={p} s={s} />)
          )}
          <rect x={X0} y={y2} width={10 * UNIT} height={RH} rx={8} fill="#f6f1e6" stroke={core.hintLevel >= 1 ? SLOT_STROKE_STRONG : SLOT_STROKE} strokeWidth={core.hintLevel >= 1 ? 5 : 3} strokeDasharray="10 7" pointerEvents="none" />
          <line x1={X0} x2={X0} y1={y1 - 20} y2={y2 + RH + 20} stroke={SLOT_STROKE} strokeWidth={4} pointerEvents="none" />
          {shown === null ? (
            <text x={X0 + 5 * UNIT} y={y2 + 42} textAnchor="middle" fontSize={40} fill={SLOT_STROKE} pointerEvents="none">
              ?
            </text>
          ) : (
            <Rod p={{ key: 'p', value: shown, x: X0, y: y2, opacity: core.demo === 'place' ? 0.5 : 1 }} s={s} />
          )}
          {merged && (
            // 終点を上下に通して、長さの一致・不一致を見えるようにする
            <line x1={X0 + (a + b) * UNIT} x2={X0 + (a + b) * UNIT} y1={y1 - 20} y2={y2 + RH + 20} stroke={SLOT_STROKE_STRONG} strokeWidth={5} strokeDasharray="10 7" pointerEvents="none" />
          )}
        </svg>
      }
      tray={
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          snap={core.snap('slot')}
          onDrop={(it) => void place(it)}
          demoKey={core.demo === 'pick' ? items.find((i) => i.value === answer)?.key : null}
          disabled={pred !== null}
        />
      }
    />
  );
}

function ObserveTask({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const [a, b] = q.taskType === 'complement_10' ? [q.operands[0], 10 - q.operands[0]] : q.operands;
  const scenes = useMemo(() => connectScenes(a, b), [a, b]);
  const [idx, setIdx] = useState(0);
  const [rods, setRods] = useState<RodPose[]>(scenes[0]);
  const prev = () => {
    if (idx === 0 || core.anim.busy) return;
    core.ctx.emit({ type: 'undo', payload: { step: idx - 1 } });
    setIdx(idx - 1);
    setRods(scenes[idx - 1]);
  };
  core.onUndo(prev);
  const next = async () => {
    if (core.anim.busy) return;
    if (idx >= scenes.length - 1) return core.finishExplored();
    core.ctx.emit({ type: 'item_selected', payload: { step: idx + 1 } });
    const from = scenes[idx];
    const to = scenes[idx + 1];
    await core.anim.run('step', () => core.anim.tween(900, (t) => setRods(lerp(from, to, t))));
    setIdx(idx + 1);
  };
  return (
    <ModeLayout
      prompt="「つぎ」を おすと うごくよ"
      field={
        <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
          <line x1={X0} x2={X0} y1={40} y2={280} stroke={SLOT_STROKE} strokeWidth={4} />
          {rods.map((p) => (
            <Rod key={p.key} p={p} s={s} className={successClass(s, p.key === 'm')} />
          ))}
        </svg>
      }
      history={<HistoryStrip items={scenes.slice(0, idx).map((h, i) => ({ key: String(i), node: <Thumb rods={h} s={s} /> }))} />}
      tray={<StepControls index={idx} count={scenes.length} onNext={() => void next()} onPrev={prev} />}
    />
  );
}

// ---------- 自由探索: 棒をつないで、同じ長さの1本とくらべる ----------

function ExploreTask({ core }: { core: TrialCore }) {
  const s = core.settings;
  const pick = usePicker(core);
  const [row, setRow] = useState<number[]>([]);
  const [compared, setCompared] = useState(false);
  const used = row.reduce((x, y) => x + y, 0);
  const items = rodChoices([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], s).map((it) => ({ ...it, disabled: used + it.value > 10 }));
  const y1 = 70;
  const y2 = 200;
  core.onUndo(() => {
    if (compared) setCompared(false);
    else if (row.length) setRow(row.slice(0, -1));
    else pick.clear();
    core.ctx.emit({ type: 'undo' });
  });
  const add = (item: ChoiceItem | undefined) => {
    if (!item || compared || used + item.value > 10) return;
    core.ctx.emit({ type: 'attempt', payload: { value: item.value } });
    setRow([...row, item.value]);
    pick.clear();
  };
  const compare = () => {
    if (row.length < 2) return;
    core.ctx.emit({ type: 'decision_made', payload: { compare: row } });
    setCompared(true);
    core.ctx.craft(used, row);
  };
  let x = X0;
  return (
    <ModeLayout
      prompt="ぼうを つないで、おなじ ながさの 1ぽんと くらべて みよう"
      field={
        <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
          <rect data-drop="row" x={X0} y={y1} width={10 * UNIT} height={RH} rx={8} fill="#f6f1e6" stroke={SLOT_STROKE} strokeWidth={3} strokeDasharray="10 7" onClick={() => add(items.find((i) => i.key === pick.selected))} style={{ cursor: 'pointer' }} />
          {row.map((v, i) => {
            const p = { key: String(i), value: v, x, y: y1 };
            x += v * UNIT;
            return <Rod key={i} p={p} s={s} />;
          })}
          {compared && (
            <>
              <Rod p={{ key: 'c', value: used, x: X0, y: y2 }} s={s} className={successClass(s, true)} />
              <line x1={X0 + used * UNIT} x2={X0 + used * UNIT} y1={y1 - 20} y2={y2 + RH + 20} stroke={SLOT_STROKE_STRONG} strokeWidth={4} strokeDasharray="10 7" />
            </>
          )}
        </svg>
      }
      tray={
        <>
          <div className="explore-actions">
            <button type="button" className="btn-main" disabled={row.length < 2 || compared} onClick={compare}>
              くらべる
            </button>
            <button
              type="button"
              className="btn-soft"
              onClick={() => {
                setRow([]);
                setCompared(false);
              }}
            >
              さいしょから
            </button>
          </div>
          <ChoiceTray items={items} selected={pick.selected} onTap={(it) => pick.toggle(it.key, it.value)} drag={s.inputMethod === 'drag'} snap={core.snap('row')} onDrop={(it) => add(it)} disabled={compared} />
        </>
      }
    />
  );
}

function Task({ bridge }: { bridge: ModeBridge }) {
  const core = useTrialCore(bridge);
  const q = core.q;
  if (q.learningStage === 'explore') return <ExploreTask core={core} />;
  if (q.learningStage === 'observe') return <ObserveTask core={core} />;
  if (q.taskType === 'subitizing_678') return <IdentifyTask core={core} />;
  if (q.learningStage === 'predict') return <PredictTask core={core} />;
  return <ComposeTask core={core} />;
}

function View({ bridge }: { bridge: ModeBridge }) {
  const st = useBridge(bridge);
  if (!st.question) return null;
  return <Task key={st.qKey} bridge={bridge} />;
}

export const RodsMode = createReactPlugin(
  {
    id: 'mode_b_rods',
    title: 'いろぼう',
    description: '目盛りのない色棒の長さで、合成・10の補数・6/7/8の見分けを扱う。左端をそろえ、終点を枠で示す。色だけでなく長さで解ける。',
    supportedTasks: ['subitizing_678', 'synthesis_5', 'complement_10'],
    supportedStrategies: ['none'],
    stages: {
      subitizing_678: ['construct'],
      synthesis_5: ['observe', 'predict', 'construct'],
      complement_10: ['observe', 'construct'],
    },
  },
  View,
);
