// Mode D：ギルドの両替商（§9.4）
// 通貨は 1・10（100 は表示のみ）、5トークンは設定で ON/OFF。交換のルールは画面に絵で示す。
// 引き算は加数法（お釣り）: もっている お金（10 と 1）のうち 10 だけで はらう。ねだんにあと何を足すと 10 か（おつり）
// → おつりと、もったままの 1 を合わせたのが のこる お金。1 は はらわない（v2.2: 「4えんの ものに 12えん はらう」ように見えないように）。
// v2.2: 位ごとに色を分けた「へや」（10のへや＝青、1のへや＝黄、りょうがえマシン＝緑）と、1のへやの10の席で、
// 「10枚そろうと1枚の10になる」ことをパッと見て分かるようにした。ダイレクト操作では、もらうコインの「ちぎる位置」をタップする。

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, usePicker, type TrialCore } from '../kit/useTrialCore';
import { ChoiceTray, type ChoiceItem } from '../kit/ChoiceTray';
import { SplitPicker } from '../kit/SplitPicker';
import { HistoryStrip, ModeLayout, StepControls, successClass } from '../kit/ui';
import { numberColor, OUTLINE, PLACE_BG, PLACE_STROKE, SLOT_STROKE, SLOT_STROKE_STRONG, inkOn } from '../../core/colors';
import { choicesOf } from '../../core/engine/questions';
import { makeDistractors, narrowToTwo, shuffle } from '../../core/math/choices';
import { purseOf, purseValue, emptyPurse, type CoinValue, type Purse } from '../../core/math/coins';
import type { AccessibilitySettings } from '../../core/types';
import {
  ANSWER_BOX,
  CARD,
  CHANGE,
  CHANGE_BOX,
  H,
  INCOMING,
  ONES_TRAY,
  PAID,
  SLOT,
  TEN_TRAY,
  W,
  borrowScenes,
  borrowScript,
  cardSeat,
  carryDirectPlan,
  carryScenes,
  onePos,
  exploreAddScenes,
  lerpWorld,
  trayWorld,
  type BorrowStep,
  type Coin,
  type DWorld,
} from './scenes';

type S = Readonly<AccessibilitySettings>;
type Rect = { x: number; y: number; w: number; h: number };

// ---------- 描画 ----------

function coinColor(v: CoinValue, s: S) {
  return v === 100 ? '#e5c158' : numberColor(v, s.colorScheme);
}

function starPath(x: number, y: number, r: number) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.55 : r * 1.05;
    d += `${i ? 'L' : 'M'}${x + rr * Math.cos(a)} ${y + rr * Math.sin(a)}`;
  }
  return d + 'Z';
}

function hexPath(x: number, y: number, r: number) {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    d += `${i ? 'L' : 'M'}${x + r * Math.cos(a)} ${y + r * Math.sin(a)}`;
  }
  return d + 'Z';
}

/** 面積は同じ。形（円・星・六角・四角）と数字で価値を区別し、色だけに頼らない */
export function CoinShape({ c, s }: { c: Pick<Coin, 'value' | 'x' | 'y' | 'r' | 'opacity'>; s: S }) {
  if (c.opacity <= 0.01) return null;
  const fill = coinColor(c.value, s);
  const { x, y, r } = c;
  const shape =
    c.value === 1 ? (
      <circle cx={x} cy={y} r={r} />
    ) : c.value === 5 ? (
      <path d={starPath(x, y, r)} />
    ) : c.value === 10 ? (
      <path d={hexPath(x, y, r * 1.05)} />
    ) : (
      <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={r * 0.25} />
    );
  return (
    <g opacity={c.opacity} pointerEvents="none">
      <g fill={fill} stroke={OUTLINE} strokeWidth={r > 12 ? 3 : 1.5}>
        {shape}
      </g>
      {r > 9 && (
        <text x={x} y={y + r * 0.32} textAnchor="middle" fontSize={r * (c.value >= 10 ? 0.75 : 0.9)} fontWeight={700} fill={inkOn(fill)}>
          {c.value}
        </text>
      )}
    </g>
  );
}

function purseCoins(p: Purse): CoinValue[] {
  return [...Array(p[100]).fill(100), ...Array(p[10]).fill(10), ...Array(p[5]).fill(5), ...Array(p[1]).fill(1)];
}

/** 財布を枠の中に小さく並べる */
function PurseInRect({ p, rect, s, opacity = 1 }: { p: Purse; rect: Rect; s: S; opacity?: number }) {
  const list = purseCoins(p);
  const per = Math.max(3, Math.ceil(list.length / 2));
  const dx = Math.min(44, (rect.w - 30) / per);
  const r = Math.min(20, dx / 2 - 1);
  return (
    <g opacity={opacity}>
      {list.map((v, i) => (
        <CoinShape key={i} c={{ value: v, x: rect.x + 15 + dx / 2 + (i % per) * dx, y: rect.y + rect.h / 2 - 24 + Math.floor(i / per) * 50, r, opacity: 1 }} s={s} />
      ))}
    </g>
  );
}

function PurseIcon({ p, s }: { p: Purse; s: S }) {
  const list = purseCoins(p);
  const per = Math.max(1, Math.ceil(list.length / 2));
  return (
    <svg width={per * 26 + 6} height={56} viewBox={`-3 -3 ${per * 26 + 6} 56`} aria-hidden>
      {list.map((v, i) => (
        <CoinShape key={i} c={{ value: v, x: 13 + (i % per) * 26, y: 12 + Math.floor(i / per) * 26, r: 11.5, opacity: 1 }} s={s} />
      ))}
    </svg>
  );
}

function purseChoices(values: number[], toPurse: (v: number) => Purse, s: S): ChoiceItem[] {
  return values.map((v, i) => ({ key: `c${i}-${v}`, value: v, label: 'コイン', node: <PurseIcon p={toPurse(v)} s={s} /> }));
}

/** 交換のルールを絵で示す（§9.4） */
function RuleCard({ s }: { s: S }) {
  const row = (from: CoinValue, n: number, to: CoinValue) => (
    <div className="rule-row" key={`${from}-${to}`}>
      <svg width={Math.ceil(n / 2) * 24 + 6} height={52} viewBox={`-3 -3 ${Math.ceil(n / 2) * 24 + 6} 52`} aria-hidden>
        {Array.from({ length: n }, (_, i) => (
          <CoinShape key={i} c={{ value: from, x: 11 + Math.floor(i / 2) * 24, y: 11 + (i % 2) * 24, r: 10.5, opacity: 1 }} s={s} />
        ))}
      </svg>
      <span aria-hidden>→</span>
      <svg width={30} height={30} viewBox="-15 -15 30 30" aria-hidden>
        <CoinShape c={{ value: to, x: 0, y: 0, r: 13, opacity: 1 }} s={s} />
      </svg>
    </div>
  );
  return <div className="rule-card" aria-label="りょうがえの きまり">{s.fiveToken ? [row(1, 5, 5), row(5, 2, 10)] : [row(1, 10, 10)]}</div>;
}

function DField({ world, s, children, glow, thumb }: { world: DWorld; s: S; children?: ReactNode; glow?: boolean; thumb?: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={thumb ? undefined : 'field-svg'} width={thumb ? 150 : undefined} height={thumb ? (150 * H) / W : undefined} aria-hidden={thumb}>
      {children}
      <g className={successClass(s, !!glow)}>
        {world.coins.map((c) => (
          <CoinShape key={c.id} c={c} s={s} />
        ))}
      </g>
    </svg>
  );
}

// ---------- 位ごとの「へや」（v2.2） ----------

type Zone = 'tens' | 'ones' | 'machine' | 'plain';

function MiniCoin({ v, x, y, r, s }: { v: CoinValue; x: number; y: number; r: number; s: S }) {
  return <CoinShape c={{ value: v, x, y, r, opacity: 1 }} s={s} />;
}

/** 色つきのへや。見出しにコインの絵を添えて、どの位のへやかを形でも示す */
function ZoneBox(props: { rect: Rect; zone: Zone; title: string; icon?: CoinValue; s: S; strong?: boolean; dashed?: boolean; drop?: string; onTap?: () => void; children?: ReactNode }) {
  const { rect, zone } = props;
  const fill = zone === 'plain' ? '#fbf6ea' : PLACE_BG[zone];
  const stroke = props.strong ? SLOT_STROKE_STRONG : zone === 'plain' ? SLOT_STROKE : PLACE_STROKE[zone];
  return (
    <g>
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={18} fill={fill} stroke={stroke} strokeWidth={props.strong ? 6 : 3.5} strokeDasharray={props.dashed ? '12 8' : undefined} />
      {props.icon && <MiniCoin v={props.icon} x={rect.x + 18} y={rect.y + 17} r={10} s={props.s} />}
      <text x={rect.x + (props.icon ? 34 : 12)} y={rect.y + 23} fontSize={17} fontWeight={800} fill={zone === 'plain' ? '#7a6e5c' : PLACE_STROKE[zone]}>
        {props.title}
      </text>
      {props.children}
      {props.drop && <rect data-drop={props.drop} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" onClick={props.onTap} style={{ cursor: 'pointer' }} />}
    </g>
  );
}

/** 1のへやの10の席（5トークンOFFのとき）。10枚そろうと両替されることを席の数で見せる */
function OnesSeats({ strong }: { strong?: boolean }) {
  return (
    <g pointerEvents="none">
      {Array.from({ length: 10 }, (_, i) => {
        const p = onePos(i);
        return <circle key={i} cx={p.x} cy={p.y} r={33} fill="#fffaf0" stroke={strong ? SLOT_STROKE_STRONG : PLACE_STROKE.ones} strokeWidth={strong ? 4 : 2.5} strokeDasharray="7 5" />;
      })}
    </g>
  );
}

/** りょうがえマシンの中に、きまりを絵で描く（1が10枚 → 10が1枚） */
function MachineRule({ s }: { s: S }) {
  const x0 = SLOT.x + 22;
  const y0 = SLOT.y + 70;
  if (s.fiveToken)
    return (
      <g pointerEvents="none">
        {Array.from({ length: 5 }, (_, i) => (
          <MiniCoin key={i} v={1} x={x0 + i * 17} y={y0} r={8} s={s} />
        ))}
        <text x={x0 + 96} y={y0 + 6} fontSize={18} fill={PLACE_STROKE.machine}>
          →
        </text>
        <MiniCoin v={5} x={x0 + 130} y={y0} r={13} s={s} />
        <MiniCoin v={5} x={x0 + 10} y={y0 + 56} r={11} s={s} />
        <MiniCoin v={5} x={x0 + 36} y={y0 + 56} r={11} s={s} />
        <text x={x0 + 60} y={y0 + 62} fontSize={18} fill={PLACE_STROKE.machine}>
          →
        </text>
        <MiniCoin v={10} x={x0 + 100} y={y0 + 56} r={15} s={s} />
      </g>
    );
  return (
    <g pointerEvents="none">
      {Array.from({ length: 10 }, (_, i) => (
        <MiniCoin key={i} v={1} x={x0 + 8 + Math.floor(i / 2) * 19} y={y0 + (i % 2) * 19} r={8.5} s={s} />
      ))}
      <path d={`M${SLOT.x + SLOT.w / 2} ${y0 + 36} v26`} stroke={PLACE_STROKE.machine} strokeWidth={4} markerEnd="url(#d-arrow)" />
      <MiniCoin v={10} x={SLOT.x + SLOT.w / 2} y={y0 + 92} r={20} s={s} />
    </g>
  );
}

function ArrowDefs() {
  return (
    <defs>
      <marker id="d-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 Z" fill={PLACE_STROKE.machine} />
      </marker>
    </defs>
  );
}

/** 流れの矢印: 1のへや → マシン → 10のへや */
function FlowArrows() {
  const midY = TEN_TRAY.y + TEN_TRAY.h / 2;
  return (
    <g pointerEvents="none" fill="none" stroke={PLACE_STROKE.machine} strokeWidth={4} strokeDasharray="10 7" opacity={0.85}>
      <path d={`M${ONES_TRAY.x + ONES_TRAY.w - 4} ${midY} H${SLOT.x + 4}`} markerEnd="url(#d-arrow)" />
      <path d={`M${SLOT.x + SLOT.w / 2} ${SLOT.y + 2} C${SLOT.x + SLOT.w / 2} 6, ${TEN_TRAY.x + TEN_TRAY.w / 2} 6, ${TEN_TRAY.x + TEN_TRAY.w / 2} ${TEN_TRAY.y + 2}`} markerEnd="url(#d-arrow)" />
    </g>
  );
}

// ---------- 繰り上がり: もらうとトレイはどうなる？ ----------

function CarryBackdrop({ strongBox, box, s, onBox, showBox = true, strongOnes, onesDrop }: { strongBox?: boolean; box: Purse | null; s: S; onBox?: () => void; showBox?: boolean; strongOnes?: boolean; onesDrop?: boolean }) {
  return (
    <>
      <ArrowDefs />
      <ZoneBox rect={TEN_TRAY} zone="tens" title="10の へや" icon={10} s={s} />
      <ZoneBox rect={ONES_TRAY} zone="ones" title="1の へや" icon={1} s={s} strong={strongOnes} drop={onesDrop ? 'ones' : undefined}>
        {!s.fiveToken && <OnesSeats strong={strongOnes} />}
      </ZoneBox>
      <ZoneBox rect={SLOT} zone="machine" title="りょうがえ" s={s}>
        <MachineRule s={s} />
      </ZoneBox>
      <FlowArrows />
      <ZoneBox rect={INCOMING} zone="plain" title="もらう" s={s} dashed />
      {showBox && (
        <ZoneBox rect={ANSWER_BOX} zone="plain" title="こうなる？" s={s} strong={strongBox} drop={onBox ? 'box' : undefined} onTap={onBox}>
          {box ? (
            <PurseInRect p={box} rect={{ ...ANSWER_BOX, y: ANSWER_BOX.y + 20, h: ANSWER_BOX.h - 20 }} s={s} />
          ) : (
            <text x={ANSWER_BOX.x + ANSWER_BOX.w / 2} y={ANSWER_BOX.y + 105} textAnchor="middle" fontSize={50} fill={SLOT_STROKE} pointerEvents="none">
              ?
            </text>
          )}
        </ZoneBox>
      )}
    </>
  );
}

/** ちぎる手札のコイン1枚 */
function CoinToken({ v, s }: { v: CoinValue; s: S }) {
  return (
    <svg width={42} height={42} viewBox="-21 -21 42 42" aria-hidden>
      <CoinShape c={{ value: v, x: 0, y: 0, r: 18, opacity: 1 }} s={s} />
    </svg>
  );
}

const hideIncoming = (w: DWorld): DWorld => ({ coins: w.coins.map((c) => (c.id.startsWith('b') ? { ...c, opacity: 0 } : c)) });

/**
 * v2.2 ダイレクト操作の繰り上がり（5トークンOFF）。
 * もらうコインの「ちぎる位置」をタップ → 1のへやの空席へ入る。ぴったり10枚になると、マシンで10に両替されて10のへやへ。
 * 違う枚数のときは、空席が残る／へやからはみ出す様子のまま止まり、もどす か ほかの位置を選びなおせる。
 */
function CarryDirect({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const [a, b] = q.operands;
  const plan = useMemo(() => carryDirectPlan(a, b, s.carryFirstOperand), [a, b]); // eslint-disable-line react-hooks/exhaustive-deps
  const [world, setWorld] = useState<DWorld>(() => hideIncoming(plan.start));
  const [history, setHistory] = useState<DWorld[]>([]);
  const [mismatch, setMismatch] = useState<number | null>(null);
  const [ok, setOk] = useState(false);
  const choices = useMemo(
    () => shuffle([plan.toFill, ...makeDistractors(plan.toFill, core.ctx.learning.choiceCount - 1, { min: 1, max: plan.second })]),
    [plan, core.ctx.learning.choiceCount],
  );
  const allowed = core.hintLevel >= 2 ? narrowToTwo(plan.toFill, choices.filter((c) => c !== plan.toFill)) : null;

  core.onUndo(() => {
    if (core.anim.busy || ok || mismatch === null) return;
    setWorld(hideIncoming(plan.start));
    setMismatch(null);
    core.ctx.emit({ type: 'undo' });
  });
  core.onHint((lvl) => {
    if (lvl === 3) void core.runDemo();
  });

  const pick = async (k: number) => {
    if (core.anim.busy || ok) return;
    const correct = k === plan.toFill;
    core.ctx.emit({ type: 'attempt', payload: { value: k } });
    core.ctx.emit({ type: 'decision_made', payload: { value: k, correct } });
    const from = hideIncoming(plan.start);
    if (!correct) {
      core.mistakes.current++;
      setMismatch(k);
      await core.anim.run('mismatch', () => core.anim.tween(700, (t) => setWorld(lerpWorld(from, plan.fill(k), t))));
      return;
    }
    setMismatch(null);
    const seq = [plan.fill(k), ...plan.after];
    await core.anim.run(
      'exchange',
      async () => {
        let prev = from;
        for (const next of seq) {
          const p0 = prev;
          await core.anim.tween(750, (t) => setWorld(lerpWorld(p0, next, t)));
          setHistory((h) => [...h, p0].slice(-4));
          await core.anim.wait(180);
          prev = next;
        }
      },
      { keepDisabled: true },
    );
    setOk(true);
    core.ctx.craft(a + b, [a, b]);
    core.finish(true);
  };

  const demoWorld = core.demo === 'place' ? plan.fill(plan.toFill) : null;
  return (
    <ModeLayout
      prompt={ok ? 'ぴったり 10まい → 10の コインに なったよ' : mismatch !== null ? 'もどすか、ほかの ところで ちぎって みよう' : 'どこで ちぎると、1の へやが ぴったり 10まいに なるかな'}
      field={
        <div style={{ position: 'relative', width: '100%' }}>
          <DField world={world} s={s} glow={ok}>
            <CarryBackdrop s={s} box={null} showBox={false} strongOnes={core.hintLevel >= 1} onesDrop />
          </DField>
          {demoWorld && (
            <div style={{ position: 'absolute', inset: 0, opacity: 0.45, pointerEvents: 'none' }}>
              <DField world={demoWorld} s={s} />
            </div>
          )}
        </div>
      }
      history={<HistoryStrip items={history.map((h, i) => ({ key: String(i), node: <DField world={h} s={s} thumb /> }))} />}
      tray={
        <SplitPicker
          key={mismatch === null ? 'fresh' : 'again'}
          n={plan.second}
          label="もらう コイン"
          token={() => <CoinToken v={1} s={s} />}
          snap={core.snap('ones')}
          onSelect={(k) => core.ctx.emit({ type: 'item_selected', payload: { split: k } })}
          onPick={(k) => void pick(k)}
          allowed={allowed}
          demoK={core.demo === 'pick' ? plan.toFill : null}
          disabled={ok}
        />
      }
    />
  );
}

function CarryTask({ core, retry }: { core: TrialCore; retry: boolean }) {
  const { q, settings: s } = core;
  const [a, b] = q.operands;
  const plan = useMemo(() => carryScenes(a, b, s.carryFirstOperand, s.fiveToken), [a, b]); // eslint-disable-line react-hooks/exhaustive-deps
  const rest = plan.rest;
  const [world, setWorld] = useState<DWorld>(plan.scenes[0]);
  const [history, setHistory] = useState<DWorld[]>([]);
  const [box, setBox] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [ok, setOk] = useState(false);
  const pick = usePicker(core);
  const all = useMemo(() => choicesOf(q), [q]);
  const values = core.hintLevel >= 2 ? all.filter((v) => narrowToTwo(rest, q.distractors).includes(v)) : all;
  const toPurse = (r: number) => ({ ...purseOf(r, s.fiveToken), 10: 1 });
  const items = purseChoices(values, toPurse, s);

  core.onUndo(() => {
    if (!revealed && box !== null) {
      setBox(null);
      core.ctx.emit({ type: 'undo' });
    } else pick.clear();
  });
  core.onHint((lvl) => {
    if (lvl === 3) void core.runDemo();
  });

  const choose = async (r: number) => {
    if (core.anim.busy || ok || (revealed && !retry)) return;
    const correct = r === rest;
    core.ctx.emit({ type: retry ? 'attempt' : 'prediction_made', payload: { value: r, correct } });
    core.ctx.emit({ type: 'decision_made', payload: { value: r, correct } });
    setBox(r);
    if (!correct) core.mistakes.current++;
    if (!revealed) {
      setRevealed(true);
      await core.anim.run(
        'exchange',
        async () => {
          await core.anim.wait(300);
          for (let i = 1; i < plan.scenes.length; i++) {
            setHistory(plan.scenes.slice(Math.max(0, i - 4), i));
            const from = plan.scenes[i - 1];
            const to = plan.scenes[i];
            await core.anim.tween(800, (t) => setWorld(lerpWorld(from, to, t)));
            await core.anim.wait(150);
          }
        },
        { keepDisabled: correct || !retry },
      );
    }
    if (correct || !retry) {
      setOk(correct);
      if (correct) core.ctx.craft(a + b, [a, b]);
      core.finish(correct);
    }
  };
  const tapBox = () => {
    const it = items.find((i) => i.key === pick.selected);
    if (!it) return;
    pick.clear();
    void choose(it.value);
  };
  return (
    <ModeLayout
      prompt="コインを もらうと、へやは どうなるかな"
      field={
        <DField world={world} s={s} glow={ok}>
          <CarryBackdrop strongBox={core.hintLevel >= 1} box={core.demo === 'place' ? toPurse(rest) : box !== null ? toPurse(box) : null} s={s} onBox={tapBox} />
        </DField>
      }
      history={<HistoryStrip items={history.map((h, i) => ({ key: String(i), node: <DField world={h} s={s} thumb /> }))} />}
      tray={
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          snap={core.snap('box')}
          onDrop={(it, id) => id === 'box' && void choose(it.value)}
          demoKey={core.demo === 'pick' ? items.find((i) => i.value === rest)?.key : null}
          disabled={ok || (revealed && !retry)}
        />
      }
    />
  );
}

// ---------- 繰り下がり（お釣り・加数法） ----------

function BorrowBackdrop({ b, s, emphasize, boxValue, onTarget, showBox = true }: { b: number; s: S; emphasize: 'card' | 'box' | null; boxValue: number | null; onTarget?: (t: 'card' | 'box') => void; showBox?: boolean }) {
  const price = numberColor(b, s.colorScheme);
  return (
    <>
      <ArrowDefs />
      <ZoneBox rect={CARD} zone="machine" title="ねだん カード" s={s} strong={emphasize === 'card'} drop={onTarget ? 'card' : undefined} onTap={() => onTarget?.('card')}>
        {Array.from({ length: 10 }, (_, i) => {
          const p = cardSeat(i);
          return i < b ? (
            <circle key={i} cx={p.x} cy={p.y} r={26} fill={price} stroke={OUTLINE} strokeWidth={2.5} pointerEvents="none" />
          ) : (
            <circle key={i} cx={p.x} cy={p.y} r={28} fill="#fff" stroke={emphasize === 'card' ? SLOT_STROKE_STRONG : SLOT_STROKE} strokeWidth={emphasize === 'card' ? 4 : 2.5} strokeDasharray="6 5" pointerEvents="none" />
          );
        })}
      </ZoneBox>
      <ZoneBox rect={PAID} zone="tens" title="もっている お金" s={s} />
      <ZoneBox rect={CHANGE} zone="ones" title="のこる お金" icon={1} s={s} />
      {showBox && (
      <ZoneBox rect={CHANGE_BOX} zone="plain" title="わたす" s={s} strong={emphasize === 'box'} drop={onTarget ? 'box' : undefined} onTap={() => onTarget?.('box')}>
        {boxValue !== null ? (
          <PurseInRect p={purseOf(boxValue, s.fiveToken)} rect={{ ...CHANGE_BOX, y: CHANGE_BOX.y + 20, h: CHANGE_BOX.h - 20 }} s={s} />
        ) : (
          <text x={CHANGE_BOX.x + CHANGE_BOX.w / 2} y={CHANGE_BOX.y + 110} textAnchor="middle" fontSize={50} fill={SLOT_STROKE} pointerEvents="none">
            ?
          </text>
        )}
      </ZoneBox>
      )}
    </>
  );
}

function BorrowConstruct({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const [m, b] = q.operands;
  const script = useMemo(() => borrowScript(m, b, s.fiveToken), [m, b]); // eslint-disable-line react-hooks/exhaustive-deps
  const [world, setWorld] = useState<DWorld>(script.start);
  const [idx, setIdx] = useState(0);
  const [history, setHistory] = useState<DWorld[]>([]);
  const [boxValue, setBoxValue] = useState<number | null>(null);
  const [mismatch, setMismatch] = useState<number | null>(null);
  const [ok, setOk] = useState(false);
  const pre = useRef<DWorld>(script.start);
  const pick = usePicker(core);
  const step: BorrowStep | undefined = script.steps[idx];
  const decide = step?.kind === 'decide' ? step : null;

  const choices = useMemo(() => {
    if (!decide) return [];
    return shuffle([decide.answer, ...makeDistractors(decide.answer, core.ctx.learning.choiceCount - 1, { min: 1, max: 9 })]);
  }, [decide, core.ctx.learning.choiceCount]);
  const values = core.hintLevel >= 2 && decide ? choices.filter((v) => narrowToTwo(decide.answer, choices.filter((c) => c !== decide.answer)).includes(v)) : choices;
  const toPurse = (v: number) => (decide?.id === 'D1' ? { ...emptyPurse(), 1: v } : purseOf(v, s.fiveToken));
  const items = purseChoices(values, toPurse, s);
  // v2.2 ダイレクト操作: カードへ入れる枚数は「ちぎる位置」をタップ。のこる お金を選ぶ手順は省き、最後まで見せて終わる
  const direct = core.direct;
  const skipStep = (x: BorrowStep) => direct && x.kind === 'decide' && x.target === 'box';
  const splitting = direct && decide?.target === 'card';

  const playFrom = async (from: number, base: DWorld) => {
    let w = base;
    let i = from;
    const toEnd = script.steps.slice(from).every((x) => x.kind === 'scene' || skipStep(x));
    const ran = await core.anim.run('scenes', async () => {
      for (; i < script.steps.length; i++) {
        const st = script.steps[i];
        if (skipStep(st)) continue;
        if (st.kind !== 'scene') break;
        setHistory((h) => [...h, w].slice(-4));
        const fromW = w;
        await core.anim.tween(st.ms, (t) => setWorld(lerpWorld(fromW, st.world, t)));
        w = st.world;
        await core.anim.wait(150);
      }
    }, { keepDisabled: toEnd && from > 0 });
    if (!ran) return;
    pre.current = w;
    setIdx(i);
    if (i >= script.steps.length) {
      setOk(true);
      core.ctx.craft(script.change, [script.toTen, m - 10]);
      core.finish(true);
    }
  };

  // 最初の「10 で はらう」は自動で見せる
  useEffect(() => {
    void playFrom(0, script.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  core.onUndo(() => {
    if (core.anim.busy || ok) return;
    if (mismatch !== null) {
      setWorld(pre.current);
      setMismatch(null);
      core.ctx.emit({ type: 'undo' });
    } else pick.clear();
  });
  core.onHint((lvl) => {
    if (lvl === 3) void core.runDemo();
  });

  const decideWith = async (k: number) => {
    if (!decide || core.anim.busy || ok) return;
    const correct = k === decide.answer;
    core.ctx.emit({ type: 'attempt', payload: { step: decide.id, value: k } });
    core.ctx.emit({ type: 'decision_made', payload: { step: decide.id, value: k, correct } });
    if (decide.target === 'box') {
      setBoxValue(k);
      if (correct) {
        setOk(true);
        core.ctx.craft(script.change, [script.toTen, m - 10]);
        core.finish(true);
      } else core.mistakes.current++;
      return;
    }
    if (!correct) {
      core.mistakes.current++;
      setMismatch(k);
      const target = decide.mismatch ? decide.mismatch(k) : world;
      const fromW = pre.current;
      await core.anim.run('mismatch', () => core.anim.tween(700, (t) => setWorld(lerpWorld(fromW, target, t))));
      return;
    }
    setMismatch(null);
    await playFrom(idx + 1, pre.current);
  };
  const onTarget = (t: 'card' | 'box') => {
    if (!decide || t !== decide.target) return;
    const it = items.find((i) => i.key === pick.selected);
    if (!it) return;
    pick.clear();
    void decideWith(it.value);
  };
  const demoWorld = core.demo === 'place' && decide?.mismatch ? decide.mismatch(decide.answer) : null;
  return (
    <ModeLayout
      prompt={
        decide
          ? splitting
            ? mismatch !== null
              ? 'もどすか、ほかの ところで ちぎって みよう'
              : 'おみせの おつりは どこまで？ ねだんの カードが ぴったり 10に なるまで'
            : decide.id === 'D1'
              ? 'おみせの おつり: ねだんの カードの あいている ところに はいる コインは どれかな'
              : 'のこる お金は どれかな'
          : ok
            ? 'これが のこる お金！'
            : '10の コインで はらうよ（1の コインは もった まま）'
      }
      field={
        <div style={{ position: 'relative', width: '100%' }}>
          <DField world={world} s={s} glow={ok}>
            <BorrowBackdrop b={b} s={s} showBox={!direct} emphasize={core.hintLevel >= 1 ? decide?.target ?? null : null} boxValue={core.demo === 'place' && decide?.target === 'box' ? decide.answer : boxValue} onTarget={onTarget} />
          </DField>
          {demoWorld && (
            <div style={{ position: 'absolute', inset: 0, opacity: 0.45, pointerEvents: 'none' }}>
              <DField world={demoWorld} s={s} />
            </div>
          )}
        </div>
      }
      aside={s.fiveToken ? <RuleCard s={s} /> : undefined}
      history={<HistoryStrip items={history.map((h, i) => ({ key: String(i), node: <DField world={h} s={s} thumb /> }))} />}
      tray={
        splitting && decide ? (
          <SplitPicker
            key={mismatch === null ? 'fresh' : 'again'}
            n={9}
            label="1の コイン"
            token={() => <CoinToken v={1} s={s} />}
            snap={core.snap('card')}
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
            onDrop={(it, id) => id === decide.target && void decideWith(it.value)}
            demoKey={core.demo === 'pick' ? items.find((i) => i.value === decide.answer)?.key : null}
            disabled={ok}
          />
        ) : undefined
      }
    />
  );
}

function BorrowPredict({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const [m, b] = q.operands;
  const script = useMemo(() => borrowScript(m, b, s.fiveToken), [m, b]); // eslint-disable-line react-hooks/exhaustive-deps
  const scenes = useMemo(() => borrowScenes(script), [script]);
  const [world, setWorld] = useState<DWorld>(script.start);
  const [history, setHistory] = useState<DWorld[]>([]);
  const [pred, setPred] = useState<number | null>(null);
  const [doneAll, setDoneAll] = useState(false);
  const pick = usePicker(core);
  const answer = script.change;
  const all = useMemo(() => choicesOf(q), [q]);
  const values = core.hintLevel >= 2 ? all.filter((v) => narrowToTwo(answer, q.distractors).includes(v)) : all;
  const items = purseChoices(values, (v) => purseOf(v, s.fiveToken), s);
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
        for (let i = 1; i < scenes.length; i++) {
          setHistory(scenes.slice(Math.max(0, i - 4), i).map((x) => x.world));
          const from = scenes[i - 1].world;
          const to = scenes[i].world;
          await core.anim.tween(scenes[i].ms, (t) => setWorld(lerpWorld(from, to, t)));
          await core.anim.wait(150);
        }
        setDoneAll(true);
      },
      { keepDisabled: true },
    );
    core.finish(correct);
  };
  return (
    <ModeLayout
      prompt="かいものの あと、のこる お金は どれかな"
      field={
        <DField world={world} s={s} glow={doneAll && pred === answer}>
          <BorrowBackdrop
            b={b}
            s={s}
            emphasize={core.hintLevel >= 1 ? 'box' : null}
            boxValue={core.demo === 'place' ? answer : pred}
            onTarget={(t) => {
              if (t !== 'box') return;
              const it = items.find((i) => i.key === pick.selected);
              if (it) {
                pick.clear();
                void choose(it.value);
              }
            }}
          />
        </DField>
      }
      aside={s.fiveToken ? <RuleCard s={s} /> : undefined}
      history={<HistoryStrip items={history.map((h, i) => ({ key: String(i), node: <DField world={h} s={s} thumb /> }))} />}
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
  const { q, settings: s } = core;
  const [a, b] = q.operands;
  const borrow = q.taskType === 'borrow';
  const scenes = useMemo(
    () => (borrow ? borrowScenes(borrowScript(a, b, s.fiveToken)) : carryScenes(a, b, s.carryFirstOperand, s.fiveToken).scenes.map((w) => ({ world: w, ms: 800 }))),
    [a, b], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [idx, setIdx] = useState(0);
  const [world, setWorld] = useState<DWorld>(scenes[0].world);
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
    await core.anim.run('step', () => core.anim.tween(Math.max(700, to.ms) * 1.3, (t) => setWorld(lerpWorld(from, to.world, t))));
    setIdx(idx + 1);
  };
  return (
    <ModeLayout
      prompt="「つぎ」を おすと うごくよ"
      field={
        <DField world={world} s={s}>
          {borrow ? (
            <BorrowBackdrop b={b} s={s} emphasize={null} boxValue={null} />
          ) : (
            <CarryBackdrop s={s} box={null} showBox={false} />
          )}
        </DField>
      }
      aside={borrow && s.fiveToken ? <RuleCard s={s} /> : undefined}
      history={<HistoryStrip items={scenes.slice(Math.max(0, idx - 4), idx).map((h, i) => ({ key: String(i), node: <DField world={h.world} s={s} thumb /> }))} />}
      tray={<StepControls index={idx} count={scenes.length} onNext={() => void next()} onPrev={prev} />}
    />
  );
}

// ---------- 自由探索 ----------

const EXPLORE_MAX = 20;

function ExploreTask({ core }: { core: TrialCore }) {
  const s = core.settings;
  const pick = usePicker(core);
  const [purse, setPurse] = useState<Purse>(emptyPurse());
  const [world, setWorld] = useState<DWorld>(trayWorld(emptyPurse()));
  const [history, setHistory] = useState<DWorld[]>([]);
  const total = purseValue(purse);
  const bank: CoinValue[] = s.fiveToken ? [1, 5, 10] : [1, 10];
  const items: ChoiceItem[] = bank.map((v) => ({
    key: `bank${v}`,
    value: v,
    label: `${v} の コイン`,
    node: (
      <svg width={52} height={52} viewBox="-26 -26 52 52" aria-hidden>
        <CoinShape c={{ value: v, x: 0, y: 0, r: 22, opacity: 1 }} s={s} />
      </svg>
    ),
    disabled: total + v > EXPLORE_MAX,
  }));
  const reset = () => {
    if (core.anim.busy) return;
    setPurse(emptyPurse());
    setWorld(trayWorld(emptyPurse()));
    setHistory([]);
  };
  core.onUndo(() => {
    if (core.anim.busy) return;
    core.ctx.emit({ type: 'undo' });
    reset();
  });
  const add = async (v: CoinValue) => {
    if (core.anim.busy || total + v > EXPLORE_MAX) return;
    core.ctx.emit({ type: 'attempt', payload: { value: v } });
    const r = exploreAddScenes(purse, v, s.fiveToken);
    await core.anim.run('add', async () => {
      setWorld(r.scenes[0]);
      for (let i = 1; i < r.scenes.length; i++) {
        if (i > 1) setHistory((h) => [...h, r.scenes[i - 1]].slice(-4));
        const from = r.scenes[i - 1];
        await core.anim.tween(600, (t) => setWorld(lerpWorld(from, r.scenes[i], t)));
      }
    });
    setPurse(r.purse);
    setWorld(trayWorld(r.purse));
  };
  const tapTray = () => {
    const it = items.find((i) => i.key === pick.selected);
    if (it && !it.disabled) void add(it.value as CoinValue); // 選んだコインは選んだまま（続けて置ける）
  };
  return (
    <ModeLayout
      prompt="コインを えらんで へやに おいて みよう"
      field={
        <DField world={world} s={s}>
          <ArrowDefs />
          <ZoneBox rect={TEN_TRAY} zone="tens" title="10の へや" icon={10} s={s} />
          <ZoneBox rect={ONES_TRAY} zone="ones" title="1の へや" icon={1} s={s} drop="tray" onTap={tapTray}>
            {!s.fiveToken && <OnesSeats />}
          </ZoneBox>
          <ZoneBox rect={SLOT} zone="machine" title="りょうがえ" s={s}>
            <MachineRule s={s} />
          </ZoneBox>
          <FlowArrows />
          <ZoneBox rect={INCOMING} zone="plain" title="おく" s={s} dashed />
          <rect data-drop="tray" x={TEN_TRAY.x} y={TEN_TRAY.y} width={ONES_TRAY.x + ONES_TRAY.w - TEN_TRAY.x} height={TEN_TRAY.h} fill="transparent" onClick={tapTray} style={{ cursor: 'pointer' }} />
        </DField>
      }
      history={<HistoryStrip items={history.map((h, i) => ({ key: String(i), node: <DField world={h} s={s} thumb /> }))} />}
      tray={
        <>
          <div className="explore-actions">
            <button type="button" className="btn-soft" onClick={reset}>
              さいしょから
            </button>
          </div>
          <ChoiceTray items={items} selected={pick.selected} onTap={(it) => pick.toggle(it.key, it.value)} drag={s.inputMethod === 'drag'} snap={core.snap('tray')} onDrop={(it, id) => id === 'tray' && void add(it.value as CoinValue)} />
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
  if (q.taskType === 'carry_over' && q.learningStage !== 'predict' && core.direct && !core.settings.fiveToken) return <CarryDirect core={core} />;
  if (q.taskType === 'carry_over') return <CarryTask core={core} retry={q.learningStage !== 'predict'} />;
  if (q.learningStage === 'predict') return <BorrowPredict core={core} />;
  return <BorrowConstruct core={core} />;
}

function View({ bridge }: { bridge: ModeBridge }) {
  const st = useBridge(bridge);
  if (!st.question) return null;
  return <Task key={st.qKey} bridge={bridge} />;
}

export const ExchangeMode = createReactPlugin(
  {
    id: 'mode_d_exchange',
    title: 'りょうがえや',
    description: '1・10（5トークンは任意）のコインと両替の規則で位取りを扱う。引き算はお店の会計とお釣り（加数法）として見せる。',
    supportedTasks: ['carry_over', 'borrow'],
    supportedStrategies: ['make_ten', 'count_up'],
    stages: {
      carry_over: ['observe', 'predict', 'construct'],
      borrow: ['observe', 'predict', 'construct'],
    },
  },
  View,
);
