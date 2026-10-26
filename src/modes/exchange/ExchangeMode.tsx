// Mode D：ギルドの両替商（§9.4）
// 通貨は 1・10（100 は表示のみ）、5トークンは設定で ON/OFF。交換のルールは画面に絵で示す。
// 引き算は加数法（お釣り）: もっている お金（10 と 1）のうち 10 だけで はらう。ねだんにあと何を足すと 10 か（おつり）
// → おつりと、もったままの 1 を合わせたのが のこる お金。1 は はらわない（v2.2: 「4えんの ものに 12えん はらう」ように見えないように）。
// v2.2: 位ごとに色を分けた「へや」（10のへや＝青、1のへや＝黄、りょうがえマシン＝緑）と、1のへやの10の席で、
// 「10枚そろうと1枚の10になる」ことをパッと見て分かるようにした。ダイレクト操作では、もらうコインの「ちぎる位置」をタップする。

import { useEffect, useMemo, useRef, useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, usePicker, type TrialCore } from '../kit/useTrialCore';
import { ChoiceTray, type ChoiceItem } from '../kit/ChoiceTray';
import { SplitPicker } from '../kit/SplitPicker';
import { HistoryStrip, ModeLayout, StepControls } from '../kit/ui';
import { numberColor, OUTLINE, SLOT_STROKE, SLOT_STROKE_STRONG } from '../../core/colors';
import { choicesOf } from '../../core/engine/questions';
import { makeDistractors, narrowToTwo, shuffle } from '../../core/math/choices';
import { purseOf, purseValue, emptyPurse, type CoinValue, type Purse } from '../../core/math/coins';
import type { AccessibilitySettings } from '../../core/types';
import {
  ANSWER_BOX,
  CARD,
  CHANGE,
  CHANGE_BOX,
  INCOMING,
  ONES_TRAY,
  PAID,
  SLOT,
  TEN_TRAY,
  borrowScenes,
  borrowScript,
  cardSeat,
  carryDirectPlan,
  carryScenes,
  exploreAddScenes,
  lerpWorld,
  trayWorld,
  type BorrowStep,
  type DWorld,
} from './scenes';

import {
  ArrowDefs,
  CoinShape,
  CoinToken,
  DField,
  FlowArrows,
  MachineRule,
  OnesSeats,
  PurseInRect,
  RuleCard,
  ZoneBox,
  purseChoices,
} from './draw';
import { TwoDigitExchange } from './TwoDigitExchange';

type S = Readonly<AccessibilitySettings>;

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
  // v2.11: 2けた（10円・1円。お釣りは加数法）
  if (q.taskType === 'carry_2d1' || q.taskType === 'borrow_2d1' || q.taskType === 'carry_2d2' || q.taskType === 'borrow_2d2') return <TwoDigitExchange core={core} />;
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
    description: '1・10（5トークンは任意）のコインと両替の規則で位取りを扱う。引き算はお店の会計とお釣り（加数法）として見せる。v2.11 で2けた（10円・1円）を足した。',
    // v2.11: 2けたの課題は、今の課題のあと（C と同じ4課題。表現横断でつながる）
    supportedTasks: ['carry_over', 'borrow', 'carry_2d1', 'borrow_2d1', 'carry_2d2', 'borrow_2d2'],
    supportedStrategies: ['make_ten', 'count_up'],
    stages: {
      carry_over: ['observe', 'predict', 'construct'],
      borrow: ['observe', 'predict', 'construct'],
      carry_2d1: ['construct'],
      borrow_2d1: ['construct'],
      carry_2d2: ['construct'],
      borrow_2d2: ['construct'],
    },
  },
  View,
);
