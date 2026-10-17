// Mode C：10フレーム（スライムのへや）（§9.3）
// 2行×5列。空席は静的に強調（点滅しない）。10のまとまりを開く操作は「ひらく」と言い、破壊表現を使わない。
// 各段階は単純な状態を1つずつ表示し、直前の状態を縮小表示で残す。途中停止・一手戻し・スロー再生に対応。

import { useMemo, useRef, useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, usePicker, type TrialCore } from '../kit/useTrialCore';
import { ChoiceTray, type ChoiceItem } from '../kit/ChoiceTray';
import { SplitPicker } from '../kit/SplitPicker';
import { HistoryStrip, ModeLayout, StepControls, successClass } from '../kit/ui';
import { numberColor, OUTLINE, SLOT_FILL, SLOT_STROKE, SLOT_STROKE_STRONG, inkOn } from '../../core/colors';
import { choicesOf } from '../../core/engine/questions';
import { makeDistractors, narrowToTwo, shuffle } from '../../core/math/choices';
import type { AccessibilitySettings } from '../../core/types';
import {
  BOX,
  BOX_R,
  BUS,
  FRAME,
  H,
  KING,
  TENS,
  W,
  boxPos,
  borrowScript,
  carryScript,
  complementScript,
  exploreAddScenes,
  exploreWorld,
  lerpWorld,
  pairPos,
  scenesOf,
  slotPos,
  type Blob,
  type Script,
  type Step,
  type Target,
  type World,
} from './scenes';

type S = Readonly<AccessibilitySettings>;

// ---------- 描画 ----------

function Slime({ b, s }: { b: Blob; s: S }) {
  if (b.opacity <= 0.01) return null;
  const color = numberColor(b.tone, s.colorScheme);
  const { x, y, r } = b;
  const body = `M${x - r} ${y + r * 0.7} Q${x - r} ${y - r} ${x} ${y - r} Q${x + r} ${y - r} ${x + r} ${y + r * 0.7} Z`;
  const ink = inkOn(color);
  return (
    <g opacity={b.opacity} pointerEvents="none">
      <path d={body} fill={color} stroke={OUTLINE} strokeWidth={b.king ? 4 : 2.5} />
      {r > 9 && (
        <>
          <circle cx={x - r * 0.33} cy={y - r * 0.15} r={r * 0.11} fill={ink} />
          <circle cx={x + r * 0.33} cy={y - r * 0.15} r={r * 0.11} fill={ink} />
        </>
      )}
      {b.king && (
        <>
          <path d={`M${x - 26} ${y - r - 2} L${x - 26} ${y - r - 26} L${x - 13} ${y - r - 12} L${x} ${y - r - 30} L${x + 13} ${y - r - 12} L${x + 26} ${y - r - 26} L${x + 26} ${y - r - 2} Z`} fill="#f6c343" stroke={OUTLINE} strokeWidth={3} />
          {/* おなかに 2行×5列 の点: 10 のまとまりの構造を見えるままにする */}
          {Array.from({ length: 10 }, (_, i) => {
            const p = pairPos(i, x - 36, y + 8, 18, 18);
            return <circle key={i} cx={p.x} cy={p.y} r={5} fill={ink} opacity={0.6} />;
          })}
        </>
      )}
    </g>
  );
}

function occupied(w: World, i: number, s: S): boolean {
  const p = slotPos(i, s.tenFrameFill);
  return w.blobs.some((b) => b.opacity > 0.5 && !b.king && Math.hypot(b.x - p.x, b.y - p.y) < 12);
}

interface FieldProps {
  world: World;
  s: S;
  /** ヒント L1 で強調する置き先 */
  emphasize?: Target | null;
  boxValue?: number | null;
  showBox?: boolean;
  glow?: boolean;
  onTarget?: (t: Target) => void;
  thumb?: boolean;
}

function Field({ world, s, emphasize, boxValue, showBox, glow, onTarget, thumb }: FieldProps) {
  const emptyStrong = s.highlightEmptySlots;
  const bus = world.bus;
  const busW = bus ? Math.ceil(bus.seats / 2) * 56 + 20 : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={thumb ? undefined : 'field-svg'} width={thumb ? 150 : undefined} height={thumb ? (150 * H) / W : undefined} aria-hidden={thumb}>
      {/* 10の部屋 */}
      <rect x={TENS.x} y={TENS.y} width={TENS.w} height={TENS.h} rx={20} fill="#f3ecdf" stroke={emphasize === 'king' ? SLOT_STROKE_STRONG : SLOT_STROKE} strokeWidth={emphasize === 'king' ? 6 : 3} />
      {!thumb && (
        <text x={TENS.x + 14} y={TENS.y + 28} fontSize={20} fontWeight={700} fill="#7a6e5c">
          10の へや
        </text>
      )}
      {world.mini &&
        Array.from({ length: 10 }, (_, i) => {
          const col = Math.floor(i / 2);
          const row = i % 2;
          return <rect key={i} x={30 + col * 42} y={119 + row * 42} width={42} height={42} fill="none" stroke={SLOT_STROKE} strokeWidth={2} />;
        })}
      {/* 1の部屋（10フレーム） */}
      {!thumb && (
        <text x={FRAME.x + 6} y={FRAME.y - 10} fontSize={20} fontWeight={700} fill="#7a6e5c">
          1の へや
        </text>
      )}
      {Array.from({ length: 10 }, (_, i) => {
        const p = slotPos(i, s.tenFrameFill);
        const empty = !occupied(world, i, s);
        const strong = (emptyStrong && empty) || (emphasize === 'frame' && empty);
        return (
          <rect
            key={i}
            x={p.x - FRAME.cell / 2 + 4}
            y={p.y - FRAME.cell / 2 + 4}
            width={FRAME.cell - 8}
            height={FRAME.cell - 8}
            rx={14}
            fill={empty ? (strong ? '#fffdf6' : SLOT_FILL) : '#efe7d6'}
            stroke={emphasize === 'frame' && empty ? SLOT_STROKE_STRONG : strong ? '#8c7c64' : SLOT_STROKE}
            strokeWidth={emphasize === 'frame' && empty ? 6 : strong ? 4 : 2}
          />
        );
      })}
      <rect x={FRAME.x} y={FRAME.y} width={FRAME.cell * 5} height={FRAME.cell * 2} rx={16} fill="none" stroke={OUTLINE} strokeWidth={4} />
      {/* バス（減数の席の数だけ席がある） */}
      {bus && (
        <g transform={`translate(${bus.dx} 0)`}>
          <rect x={BUS.x} y={BUS.y} width={busW} height={BUS.h} rx={18} fill="#e7f0f6" stroke={emphasize === 'bus' ? SLOT_STROKE_STRONG : '#6f8aa0'} strokeWidth={emphasize === 'bus' ? 6 : 3} />
          {Array.from({ length: bus.seats }, (_, j) => {
            const p = pairPos(j, BUS.x + 30, 352, 56, 52);
            return <circle key={j} cx={p.x} cy={p.y} r={22} fill="#fff" stroke="#6f8aa0" strokeWidth={2.5} strokeDasharray="5 4" />;
          })}
          <circle cx={BUS.x + 30} cy={BUS.y + BUS.h + 8} r={10} fill="#6f8aa0" />
          <circle cx={BUS.x + busW - 30} cy={BUS.y + BUS.h + 8} r={10} fill="#6f8aa0" />
        </g>
      )}
      {/* ？の箱 */}
      {showBox && (
        <g>
          <rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} rx={18} fill="#f6f1e6" stroke={emphasize === 'box' ? SLOT_STROKE_STRONG : SLOT_STROKE} strokeWidth={emphasize === 'box' ? 6 : 3} strokeDasharray="12 8" />
          {boxValue == null ? (
            <text x={BOX.x + BOX.w / 2} y={BOX.y + 82} textAnchor="middle" fontSize={56} fill={SLOT_STROKE}>
              ?
            </text>
          ) : (
            Array.from({ length: boxValue }, (_, j) => <Slime key={j} b={{ id: `bx${j}`, ...boxPos(j), r: BOX_R, tone: boxValue, opacity: 1 }} s={s} />)
          )}
        </g>
      )}
      <g className={successClass(s, !!glow)}>
        {world.blobs.map((b) => (
          <Slime key={b.id} b={b} s={s} />
        ))}
      </g>
      {/* 置き先（上に透明な面を重ねる） */}
      {onTarget && (
        <>
          <rect data-drop="frame" x={FRAME.x} y={FRAME.y} width={FRAME.cell * 5} height={FRAME.cell * 2} fill="transparent" onClick={() => onTarget('frame')} style={{ cursor: 'pointer' }} />
          {bus && <rect data-drop="bus" x={BUS.x + bus.dx - 10} y={BUS.y - 10} width={Math.max(busW, 200) + 20} height={BUS.h + 30} fill="transparent" onClick={() => onTarget('bus')} style={{ cursor: 'pointer' }} />}
          {showBox && <rect data-drop="box" x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} fill="transparent" onClick={() => onTarget('box')} style={{ cursor: 'pointer' }} />}
          <circle data-drop="king" cx={KING.x} cy={KING.y} r={KING.r + 30} fill="transparent" onClick={() => onTarget('king')} style={{ cursor: 'pointer' }} />
        </>
      )}
    </svg>
  );
}

function GroupIcon({ n, s }: { n: number; s: S }) {
  const cols = Math.ceil(n / 2);
  const color = numberColor(n, s.colorScheme);
  return (
    <svg width={cols * 22 + 6} height={50} viewBox={`-3 -3 ${cols * 22 + 6} 50`} aria-hidden>
      {Array.from({ length: n }, (_, j) => {
        const p = pairPos(j, 11, 12, 22, 22);
        return <path key={j} d={`M${p.x - 9} ${p.y + 6} Q${p.x - 9} ${p.y - 9} ${p.x} ${p.y - 9} Q${p.x + 9} ${p.y - 9} ${p.x + 9} ${p.y + 6} Z`} fill={color} stroke={OUTLINE} strokeWidth={1.5} />;
      })}
    </svg>
  );
}

/** ちぎる手札のスライム1匹 */
function SlimeToken({ tone, s }: { tone: number; s: S }) {
  const color = numberColor(tone, s.colorScheme);
  return (
    <svg width={40} height={40} viewBox="-20 -20 40 40" aria-hidden>
      <path d="M-16 11 Q-16 -16 0 -16 Q16 -16 16 11 Z" fill={color} stroke={OUTLINE} strokeWidth={2} />
      <circle cx={-5} cy={-3} r={2} fill={inkOn(color)} />
      <circle cx={5} cy={-3} r={2} fill={inkOn(color)} />
    </svg>
  );
}

/** v2.2 ダイレクト操作: ちぎる手札に出すむれ（数と色） */
function splitSource(core: TrialCore, target: Target): { n: number; tone: number; label: string } {
  const [a, b] = core.q.operands;
  if (target === 'bus') return { n: 10, tone: 10, label: 'ひらいた 10' };
  if (core.q.taskType === 'carry_over') {
    const second = core.settings.carryFirstOperand === 'larger' ? Math.min(a, b) : b;
    return { n: second, tone: second, label: 'まっている むれ' };
  }
  return { n: 9, tone: 1, label: 'スライム' };
}

/** 決定点の前に、ちぎる手札と同じむれを場面から隠す（同じものが2か所に見えないように） */
function hideWaiting(w: World): World {
  return { ...w, blobs: w.blobs.map((b) => (b.id.startsWith('w') ? { ...b, opacity: 0 } : b)) };
}

function groupChoices(values: number[], s: S): ChoiceItem[] {
  return values.map((v, i) => ({ key: `g${i}-${v}`, value: v, label: 'スライムの むれ', node: <GroupIcon n={v} s={s} /> }));
}

function scriptFor(core: TrialCore): Script {
  const { q, settings: s } = core;
  const fill = s.tenFrameFill;
  if (q.taskType === 'carry_over') return carryScript(q.operands[0], q.operands[1], s.carryFirstOperand, fill);
  if (q.taskType === 'borrow') return borrowScript(q.operands[0], q.operands[1], q.strategy === 'subtract_subtract' ? 'subtract_subtract' : 'subtract_from_ten', fill);
  return complementScript(q.operands[0], fill);
}

const PROMPT: Record<string, string> = {
  carry_D1: 'あいている ところに はいるのは どの むれかな',
  complement_D1: 'あいている ところに はいるのは どの むれかな',
  borrow_D1: 'バスの せきに のるのは どの むれかな',
  borrow_D2: 'のこりを あわせると どの むれに なるかな',
  tapKing: '10の へやの キングを タップすると ひらくよ',
  carry_predict: 'あふれて 1の へやに のこるのは どの むれかな',
  complement_predict: 'あいている ところに はいるのは どの むれかな',
  borrow_predict: 'さいごに 1の へやに のこるのは どの むれかな',
};

/** v2.2 ダイレクト操作の問いかけ（「ちぎる位置」をタップする） */
const DIRECT_PROMPT: Record<string, string> = {
  carry_D1: 'どこで ちぎると、あいている ところに ぴったり はいるかな',
  complement_D1: 'どこまで いれると、ぴったり うまるかな',
  borrow_D1: 'ひらいた 10から、どこまで バスに のせるかな',
};

function taskKey(core: TrialCore): 'carry' | 'borrow' | 'complement' {
  return core.q.taskType === 'carry_over' ? 'carry' : core.q.taskType === 'borrow' ? 'borrow' : 'complement';
}

/** 本人がクラフト図鑑に残すもの（作ったもの） */
function craftOf(core: TrialCore) {
  const [a, b] = core.q.operands;
  if (core.q.taskType === 'carry_over') core.ctx.craft(a + b, [a, b]);
  else if (core.q.taskType === 'complement_10') core.ctx.craft(10, [a, 10 - a]);
  else if (core.q.strategy === 'subtract_from_ten') core.ctx.craft(a - b, [10 - b, a - 10]);
}

// ---------- 本課題 ----------

function ConstructTask({ core }: { core: TrialCore }) {
  const s = core.settings;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const script = useMemo(() => scriptFor(core), [core.q]);
  const [world, setWorld] = useState<World>(script.start);
  const [idx, setIdx] = useState(0); // 次に処理する step
  const [history, setHistory] = useState<World[]>([]);
  const [boxValue, setBoxValue] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [mismatch, setMismatch] = useState<number | null>(null);
  const [ok, setOk] = useState(false);
  const preDecision = useRef<World>(script.start);
  const pick = usePicker(core);
  const step: Step | undefined = script.steps[idx];
  const decide = step?.kind === 'decide' ? step : null;
  // v2.2 ダイレクト操作: 置く決定（フレーム・バス）は「ちぎる位置」をタップ。？の箱を選ぶ決定は省き、置き終わったらそのまま最後まで見せる
  const direct = core.direct;
  const skipStep = (x: Step) => direct && x.kind === 'decide' && x.target === 'box';
  const showBox = script.steps.some((x) => x.kind === 'decide' && x.target === 'box' && !skipStep(x));
  const splitting = direct && !!decide && (decide.target === 'frame' || decide.target === 'bus');
  const [placed, setPlaced] = useState(false);
  const base = (w: World) => (direct ? hideWaiting(w) : w);

  const choices = useMemo(() => {
    if (!decide) return [];
    const ds = makeDistractors(decide.answer, core.ctx.learning.choiceCount - 1, { min: decide.min, max: decide.max });
    return shuffle([decide.answer, ...ds]);
  }, [decide, core.ctx.learning.choiceCount]);
  const values = core.hintLevel >= 2 && decide ? choices.filter((v) => narrowToTwo(decide.answer, choices.filter((c) => c !== decide.answer)).includes(v)) : choices;
  const items = groupChoices(values, s);

  /** 決定点または「ひらく」まで場面を自動で進める */
  const playFrom = async (from: number, base: World) => {
    let w = base;
    let i = from;
    const hist: World[] = [];
    const ran = await core.anim.run(
      'scenes',
      async () => {
        for (; i < script.steps.length; i++) {
          const st = script.steps[i];
          if (skipStep(st)) continue;
          if (st.kind !== 'scene') break;
          hist.push(w);
          setHistory((h) => [...h, w].slice(-4));
          const fromW = w;
          await core.anim.tween(st.ms, (t) => setWorld(lerpWorld(fromW, st.world, t)));
          w = st.world;
          await core.anim.wait(200);
        }
      },
      { keepDisabled: from < script.steps.length && script.steps.slice(from).every((x) => x.kind === 'scene' || skipStep(x)) },
    );
    if (!ran) return;
    preDecision.current = w;
    setIdx(i);
    if (i >= script.steps.length) {
      setOk(true);
      craftOf(core);
      core.finish(true);
    }
  };

  core.onUndo(() => {
    if (core.anim.busy || ok) return;
    if (mismatch !== null) {
      setWorld(preDecision.current);
      setMismatch(null);
      setPlaced(false);
      core.ctx.emit({ type: 'undo' });
    } else if (boxValue !== null && !revealed) {
      setBoxValue(null);
      core.ctx.emit({ type: 'undo' });
    } else pick.clear();
  });
  core.onHint((lvl) => {
    if (lvl === 3) void core.runDemo();
  });

  const onTarget = async (t: Target) => {
    if (core.anim.busy || ok || !step) return;
    if (step.kind === 'tapKing') {
      if (t !== 'king') return;
      core.ctx.emit({ type: 'attempt', payload: { open: true } });
      return void playFrom(idx + 1, world);
    }
    if (step.kind !== 'decide' || t !== step.target) return;
    const item = items.find((i) => i.key === pick.selected);
    if (!item) return;
    pick.clear();
    await decideWith(item.value);
  };

  const decideWith = async (k: number) => {
    if (!decide) return;
    const correct = k === decide.answer;
    core.ctx.emit({ type: 'attempt', payload: { step: decide.id, value: k } });
    core.ctx.emit({ type: 'decision_made', payload: { step: decide.id, value: k, correct } });
    if (decide.target === 'box') {
      // 選んでから、仕組みを再生して比べる（再生は1回だけ）
      setBoxValue(k);
      if (!correct) core.mistakes.current++;
      if (!revealed) {
        setRevealed(true);
        let w = world;
        let i = idx + 1;
        await core.anim.run('reveal', async () => {
          for (; i < script.steps.length && script.steps[i].kind === 'scene'; i++) {
            const st = script.steps[i] as Extract<Step, { kind: 'scene' }>;
            setHistory((h) => [...h, w].slice(-4));
            const fromW = w;
            await core.anim.tween(st.ms, (tt) => setWorld(lerpWorld(fromW, st.world, tt)));
            w = st.world;
          }
        }, { keepDisabled: correct });
      }
      if (correct) {
        setOk(true);
        craftOf(core);
        core.finish(true);
      }
      return;
    }
    // フレーム・バスへ置く決定: 違うときは、はみ出し／足りない様子のまま止める（一手戻しで取り消せる）
    setPlaced(true);
    if (!correct) {
      core.mistakes.current++;
      setMismatch(k);
      const target = decide.mismatch ? decide.mismatch(k) : world;
      const fromW = base(preDecision.current);
      await core.anim.run('mismatch', () => core.anim.tween(800, (tt) => setWorld(lerpWorld(fromW, target, tt))));
      return;
    }
    setMismatch(null);
    await playFrom(idx + 1, base(preDecision.current));
  };

  // ヒント L3: 正しい群を示し、置いた様子を半透明で見せる
  const demoWorld = core.demo === 'place' && decide?.mismatch ? decide.mismatch(decide.answer) : null;
  const prompt =
    step?.kind === 'tapKing' ? PROMPT.tapKing : decide ? (splitting ? DIRECT_PROMPT : PROMPT)[`${taskKey(core)}_${decide.id}`] ?? PROMPT[`${taskKey(core)}_${decide.id}`] : '';
  const emphasize = core.hintLevel >= 1 ? (step?.kind === 'tapKing' ? 'king' : decide?.target ?? null) : step?.kind === 'tapKing' ? 'king' : null;

  return (
    <ModeLayout
      prompt={prompt}
      field={
        <div style={{ position: 'relative', width: '100%' }}>
          <Field world={splitting && !placed ? base(world) : world} s={s} emphasize={emphasize} boxValue={core.demo === 'place' && decide?.target === 'box' ? decide.answer : boxValue} showBox={showBox} glow={ok} onTarget={(t) => void onTarget(t)} />
          {demoWorld && (
            <div style={{ position: 'absolute', inset: 0, opacity: 0.45, pointerEvents: 'none' }}>
              <Field world={demoWorld} s={s} />
            </div>
          )}
        </div>
      }
      history={<HistoryStrip items={history.map((h, i) => ({ key: String(i), node: <Field world={h} s={s} thumb showBox={showBox} /> }))} />}
      tray={
        splitting && decide ? (
          <SplitPicker
            key={`${idx}`}
            n={splitSource(core, decide.target).n}
            label={splitSource(core, decide.target).label}
            token={() => <SlimeToken tone={splitSource(core, decide.target).tone} s={s} />}
            snap={core.snap(decide.target)}
            onSelect={(k) => core.ctx.emit({ type: 'item_selected', payload: { split: k } })}
            onPick={(k) => void decideWith(k)}
            allowed={core.hintLevel >= 2 ? values : null}
            demoK={core.demo === 'pick' ? decide.answer : null}
            disabled={ok}
          />
        ) : decide ? (
          <ChoiceTray
            items={items}
            selected={pick.selected}
            onTap={(it) => pick.toggle(it.key, it.value)}
            drag={s.inputMethod === 'drag'}
            onDrop={(it, id) => {
              if (id === decide.target) {
                pick.clear();
                void decideWith(it.value);
              }
            }}
            demoKey={core.demo === 'pick' ? items.find((i) => i.value === decide.answer)?.key : null}
            disabled={ok}
          />
        ) : undefined
      }
    />
  );
}

// ---------- 予測: 選んでから仕組みを見る ----------

function PredictTask({ core }: { core: TrialCore }) {
  const s = core.settings;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const script = useMemo(() => scriptFor(core), [core.q]);
  const scenes = useMemo(() => scenesOf(script), [script]);
  const answer = script.predictAnswer;
  const [world, setWorld] = useState<World>(script.start);
  const [history, setHistory] = useState<World[]>([]);
  const [pred, setPred] = useState<number | null>(null);
  const [doneAll, setDoneAll] = useState(false);
  const pick = usePicker(core);
  const all = useMemo(() => choicesOf(core.q), [core.q]);
  const values = core.hintLevel >= 2 ? all.filter((v) => narrowToTwo(answer, core.q.distractors).includes(v)) : all;
  const items = groupChoices(values, s);

  core.onUndo(() => {
    if (pred === null) pick.clear();
  });
  core.onHint((lvl) => {
    if (lvl === 3) void core.runDemo();
  });
  const choose = async (k: number) => {
    if (pred !== null || core.anim.busy) return;
    const correct = k === answer;
    core.ctx.emit({ type: 'prediction_made', payload: { value: k, correct } });
    core.ctx.emit({ type: 'decision_made', payload: { value: k, correct } });
    setPred(k);
    if (!correct) core.mistakes.current++;
    await core.anim.run(
      'mechanism',
      async () => {
        await core.anim.wait(400);
        for (let i = 1; i < scenes.length; i++) {
          setHistory(scenes.slice(Math.max(0, i - 4), i).map((x) => x.world));
          const from = scenes[i - 1].world;
          const to = scenes[i].world;
          await core.anim.tween(scenes[i].ms, (t) => setWorld(lerpWorld(from, to, t)));
          await core.anim.wait(200);
        }
        setDoneAll(true);
      },
      { keepDisabled: true },
    );
    core.finish(correct);
  };
  const onTarget = (t: Target) => {
    if (t !== 'box') return;
    const it = items.find((i) => i.key === pick.selected);
    if (!it) return;
    pick.clear();
    void choose(it.value);
  };
  return (
    <ModeLayout
      prompt={PROMPT[`${taskKey(core)}_predict`]}
      field={<Field world={world} s={s} emphasize={core.hintLevel >= 1 ? 'box' : null} boxValue={core.demo === 'place' ? answer : pred} showBox glow={doneAll && pred === answer} onTarget={onTarget} />}
      history={<HistoryStrip items={history.map((h, i) => ({ key: String(i), node: <Field world={h} s={s} thumb /> }))} />}
      tray={
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          snap={core.snap('box')}
          onDrop={(it, id) => id === 'box' && void choose(it.value)}
          demoKey={core.demo === 'pick' ? items.find((i) => i.value === answer)?.key : null}
          disabled={pred !== null}
        />
      }
    />
  );
}

// ---------- 観察 ----------

function ObserveTask({ core }: { core: TrialCore }) {
  const s = core.settings;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const script = useMemo(() => scriptFor(core), [core.q]);
  const scenes = useMemo(() => scenesOf(script), [script]);
  const [idx, setIdx] = useState(0);
  const [world, setWorld] = useState<World>(scenes[0].world);
  const prev = () => {
    if (idx === 0 || core.anim.busy) return;
    core.ctx.emit({ type: 'undo', payload: { step: idx - 1 } });
    setIdx(idx - 1);
    setWorld(scenes[idx - 1].world);
  };
  core.onUndo(prev);
  const next = async () => {
    if (core.anim.busy) return;
    if (idx >= scenes.length - 1) return core.finishExplored();
    core.ctx.emit({ type: 'item_selected', payload: { step: idx + 1 } });
    const from = scenes[idx].world;
    const to = scenes[idx + 1];
    await core.anim.run('step', () => core.anim.tween(to.ms * 1.3, (t) => setWorld(lerpWorld(from, to.world, t))));
    setIdx(idx + 1);
  };
  return (
    <ModeLayout
      prompt="「つぎ」を おすと うごくよ"
      field={<Field world={world} s={s} />}
      history={<HistoryStrip items={scenes.slice(Math.max(0, idx - 4), idx).map((h, i) => ({ key: String(i), node: <Field world={h.world} s={s} thumb /> }))} />}
      tray={<StepControls index={idx} count={scenes.length} onNext={() => void next()} onPrev={prev} />}
    />
  );
}

// ---------- 自由探索: むれを入れると、10でまとまる ----------

function ExploreTask({ core }: { core: TrialCore }) {
  const s = core.settings;
  const fill = s.tenFrameFill;
  const pick = usePicker(core);
  const [ones, setOnes] = useState(0);
  const [king, setKing] = useState(false);
  const [world, setWorld] = useState<World>(exploreWorld(0, false, fill));
  const [history, setHistory] = useState<World[]>([]);
  const items = groupChoices([1, 2, 3, 4, 5, 6, 7, 8, 9], s).map((it) => ({ ...it, disabled: king && ones + it.value >= 10 }));

  const reset = () => {
    if (core.anim.busy) return;
    setOnes(0);
    setKing(false);
    setWorld(exploreWorld(0, false, fill));
    setHistory([]);
  };
  core.onUndo(() => {
    if (core.anim.busy) return;
    core.ctx.emit({ type: 'undo' });
    reset();
  });
  const add = async (k: number) => {
    if (core.anim.busy || (king && ones + k >= 10)) return;
    core.ctx.emit({ type: 'attempt', payload: { value: k } });
    const ws = exploreAddScenes(ones, k, king, fill);
    await core.anim.run('add', async () => {
      for (let i = 1; i < ws.length; i++) {
        setHistory((h) => [...h, ws[i - 1]].slice(-4));
        const from = ws[i - 1];
        await core.anim.tween(800, (t) => setWorld(lerpWorld(from, ws[i], t)));
      }
    });
    const total = ones + k;
    if (ones > 0) core.ctx.craft(total, [ones, k]);
    const nk = king || total >= 10;
    const no = total >= 10 ? total - 10 : total;
    setKing(nk);
    setOnes(no);
    setWorld(exploreWorld(no, nk, fill));
  };
  return (
    <ModeLayout
      prompt="むれを えらんで 1の へやに いれて みよう"
      field={
        <Field
          world={world}
          s={s}
          onTarget={(t) => {
            if (t !== 'frame') return;
            const it = items.find((i) => i.key === pick.selected);
            if (it && !it.disabled) {
              pick.clear();
              void add(it.value);
            }
          }}
        />
      }
      history={<HistoryStrip items={history.map((h, i) => ({ key: String(i), node: <Field world={h} s={s} thumb /> }))} />}
      tray={
        <>
          <div className="explore-actions">
            <button type="button" className="btn-soft" onClick={reset}>
              さいしょから
            </button>
          </div>
          <ChoiceTray items={items} selected={pick.selected} onTap={(it) => pick.toggle(it.key, it.value)} drag={s.inputMethod === 'drag'} snap={core.snap('frame')} onDrop={(it, id) => id === 'frame' && void add(it.value)} />
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
  if (q.learningStage === 'predict') return <PredictTask core={core} />;
  return <ConstructTask core={core} />;
}

function View({ bridge }: { bridge: ModeBridge }) {
  const st = useBridge(bridge);
  if (!st.question) return null;
  return <Task key={st.qKey} bridge={bridge} />;
}

export const TenFrameMode = createReactPlugin(
  {
    id: 'mode_c_tenframe',
    title: 'スライムの へや',
    description: '2行×5列の10フレーム。空席を静的に示し、繰り上がりは「10をつくる」、繰り下がりは減加法（設定で減減法）で、分解・合体を1段階ずつ見せる。',
    supportedTasks: ['complement_10', 'carry_over', 'borrow'],
    supportedStrategies: ['make_ten', 'subtract_from_ten', 'subtract_subtract'],
    stages: {
      complement_10: ['observe', 'predict', 'construct'],
      carry_over: ['observe', 'predict', 'construct'],
      borrow: ['observe', 'predict', 'construct'],
    },
  },
  View,
);
