// v2.11 Mode D の2けた（§9.4 の拡張）。C と同じ4課題を、10円・1円とお店（お釣り）で見せる。5トークンは使わない。
// 決定点: D1 1のへやに入れる1円の枚数（たし算）／お釣りの枚数（ひき算）。D3 ぜんぶで いくら（選んでから仕組みを見る。ダイレクト操作でも省かない）。
// 違う枚数は、席が のこる／はみ出す 様子で見せる。違う金額は、仕組みを最後まで見せて箱と見比べる。赤・×・音は使わない。

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TrialCore } from '../kit/useTrialCore';
import { usePicker } from '../kit/useTrialCore';
import { ChoiceTray, type ChoiceItem } from '../kit/ChoiceTray';
import { SplitPicker } from '../kit/SplitPicker';
import { HistoryStrip, ModeLayout } from '../kit/ui';
import { numberColor, OUTLINE, SLOT_STROKE, SLOT_STROKE_STRONG } from '../../core/colors';
import { choicesOf } from '../../core/engine/questions';
import { makeDistractors, narrowToTwo, shuffle } from '../../core/math/choices';
import { emptyPurse, purseOf } from '../../core/math/coins';
import type { AccessibilitySettings } from '../../core/types';
import { ANSWER_BOX, CARD, CHANGE, CHANGE_BOX, INCOMING, ONES_TRAY, PAID, SLOT, TEN_TRAY, cardSeat, lerpWorld, type DWorld } from './scenes';
import { borrow2Exchange, carry2Exchange, type XStep, type XTarget } from './twoDigitScenes';
import { ArrowDefs, CoinToken, DField, FlowArrows, MachineRule, OnesSeats, PurseInRect, ZoneBox, purseChoices, type Rect } from './draw';

type S = Readonly<AccessibilitySettings>;

/** 箱の中の金額（コイン＋数字のふだ ON なら数字） */
function BoxValue({ v, rect, s }: { v: number; rect: Rect; s: S }) {
  return (
    <g pointerEvents="none">
      <PurseInRect p={purseOf(v, false)} rect={{ ...rect, y: rect.y + 22, h: rect.h - 50 }} s={s} />
      {s.numberLabels && (
        <text x={rect.x + rect.w / 2} y={rect.y + rect.h - 12} textAnchor="middle" fontSize={26} fontWeight={800} fill="#3a3226">
          {v}
        </text>
      )}
    </g>
  );
}

function BoxContent({ v, rect, s }: { v: number | null; rect: Rect; s: S }) {
  if (v !== null) return <BoxValue v={v} rect={rect} s={s} />;
  return (
    <text x={rect.x + rect.w / 2} y={rect.y + rect.h / 2 + 22} textAnchor="middle" fontSize={50} fill={SLOT_STROKE} pointerEvents="none">
      ?
    </text>
  );
}

function CarryBack({ s, emphasize, boxValue, onTarget }: { s: S; emphasize: XTarget | null; boxValue: number | null; onTarget: (t: XTarget) => void }) {
  return (
    <>
      <ArrowDefs />
      <ZoneBox rect={TEN_TRAY} zone="tens" title="10の へや" icon={10} s={s} />
      <ZoneBox rect={ONES_TRAY} zone="ones" title="1の へや" icon={1} s={s} strong={emphasize === 'ones'} drop="ones" onTap={() => onTarget('ones')}>
        <OnesSeats strong={emphasize === 'ones'} />
      </ZoneBox>
      <ZoneBox rect={SLOT} zone="machine" title="りょうがえ" s={s}>
        <MachineRule s={{ ...s, fiveToken: false }} />
      </ZoneBox>
      <FlowArrows />
      <ZoneBox rect={INCOMING} zone="plain" title="もらう" s={s} dashed />
      <ZoneBox rect={ANSWER_BOX} zone="plain" title="ぜんぶで？" s={s} strong={emphasize === 'box'} drop="box" onTap={() => onTarget('box')}>
        <BoxContent v={boxValue} rect={ANSWER_BOX} s={s} />
      </ZoneBox>
    </>
  );
}

function BorrowBack({ so, s, emphasize, boxValue, onTarget }: { so: number; s: S; emphasize: XTarget | null; boxValue: number | null; onTarget: (t: XTarget) => void }) {
  const price = numberColor(Math.max(1, so), s.colorScheme);
  return (
    <>
      <ArrowDefs />
      <ZoneBox rect={CARD} zone="machine" title="ねだん カード" s={s} strong={emphasize === 'card'} drop="card" onTap={() => onTarget('card')}>
        {Array.from({ length: 10 }, (_, i) => {
          const p = cardSeat(i);
          return i < so ? (
            <circle key={i} cx={p.x} cy={p.y} r={26} fill={price} stroke={OUTLINE} strokeWidth={2.5} pointerEvents="none" />
          ) : (
            <circle key={i} cx={p.x} cy={p.y} r={28} fill="#fff" stroke={emphasize === 'card' ? SLOT_STROKE_STRONG : SLOT_STROKE} strokeWidth={emphasize === 'card' ? 4 : 2.5} strokeDasharray="6 5" pointerEvents="none" />
          );
        })}
      </ZoneBox>
      <ZoneBox rect={PAID} zone="tens" title="もっている お金" s={s} />
      <ZoneBox rect={CHANGE} zone="ones" title="のこる お金" s={s} />
      <ZoneBox rect={CHANGE_BOX} zone="plain" title="のこる お金は？" s={s} strong={emphasize === 'box'} drop="box" onTap={() => onTarget('box')}>
        <BoxContent v={boxValue} rect={CHANGE_BOX} s={s} />
      </ZoneBox>
    </>
  );
}

const PROMPT = {
  carry_D1: '1の へやに いれると ぴったり 10まいに なる コインは どれかな',
  carry_D1_direct: 'どこで ちぎると、1の へやが ぴったり 10まいに なるかな',
  carry_D3: 'ぜんぶで いくらに なるかな',
  borrow_pay: '10円で はらうよ（1円は もった まま）',
  borrow_D1: 'おみせの おつり: ねだんの カードの あいている ところに はいる コインは どれかな',
  borrow_D1_direct: 'おみせの おつりは どこまで？ ねだんの カードが ぴったり 10に なるまで',
  borrow_D3: 'のこる お金は ぜんぶで いくらかな',
};

export function TwoDigitExchange({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const [a, b] = q.operands;
  const carry = q.taskType === 'carry_2d1' || q.taskType === 'carry_2d2';
  const script = useMemo(() => (carry ? carry2Exchange(a, b) : borrow2Exchange(a, b)), [a, b, carry]);
  const [world, setWorld] = useState<DWorld>(script.start);
  const [idx, setIdx] = useState(0);
  const [history, setHistory] = useState<DWorld[]>([]);
  const [boxValue, setBoxValue] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [mismatch, setMismatch] = useState<number | null>(null);
  const [placed, setPlaced] = useState(false);
  const [ok, setOk] = useState(false);
  const pre = useRef<DWorld>(script.start);
  const pick = usePicker(core);
  const step: XStep | undefined = script.steps[idx];
  const decide = step?.kind === 'decide' ? step : null;
  const direct = core.direct;
  const splitting = direct && !!decide && decide.target !== 'box';
  // ダイレクト操作のたし算: ちぎる手札と同じ「もらう1円」は、場面から隠す（同じものが2か所に見えないように）
  const base = (w: DWorld): DWorld => (direct && carry ? { coins: w.coins.map((c) => (c.id.startsWith('bo-') ? { ...c, opacity: 0 } : c)) } : w);

  const choices = useMemo(() => {
    if (!decide) return [];
    if (decide.target === 'box') return choicesOf(q);
    return shuffle([decide.answer, ...makeDistractors(decide.answer, core.ctx.learning.choiceCount - 1, { min: 1, max: decide.max })]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decide, core.ctx.learning.choiceCount]);
  const values =
    core.hintLevel >= 2 && decide
      ? decide.target === 'box'
        ? choices.filter((v) => v === decide.answer || v === q.distractors[0])
        : choices.filter((v) => narrowToTwo(decide.answer, choices.filter((c) => c !== decide.answer)).includes(v))
      : choices;
  const items: ChoiceItem[] =
    decide?.target === 'box'
      ? purseChoices(values, (v) => purseOf(v, false), s).map((it) => ({
          ...it,
          label: s.numberLabels ? `${it.value}` : 'この お金',
          node: s.numberLabels ? (
            <span className="halving-choice">
              <span className="numeral-card">{it.value}</span>
              {it.node}
            </span>
          ) : (
            it.node
          ),
        }))
      : purseChoices(values, (v) => ({ ...emptyPurse(), 1: v }), s);

  /** 決定点まで場面を自動で進める。最後まで行ったら できあがり */
  const playFrom = async (from: number, w0: DWorld) => {
    let w = w0;
    let i = from;
    const ran = await core.anim.run(
      'scenes',
      async () => {
        for (; i < script.steps.length; i++) {
          const st = script.steps[i];
          if (st.kind !== 'scene') break;
          setHistory((h) => [...h, w].slice(-4));
          const fromW = w;
          await core.anim.tween(st.ms, (t) => setWorld(lerpWorld(fromW, st.world, t)));
          w = st.world;
          await core.anim.wait(150);
        }
      },
      { keepDisabled: script.steps.slice(from).every((x) => x.kind === 'scene') && from > 0 },
    );
    if (!ran) return;
    pre.current = w;
    setIdx(i);
    if (i >= script.steps.length) finishOk();
  };

  const finishOk = () => {
    setOk(true);
    if (carry) core.ctx.craft(a + b, [a, b]);
    core.finish(true);
  };

  useEffect(() => {
    if (script.steps[0]?.kind === 'scene') void playFrom(0, script.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  core.onUndo(() => {
    if (core.anim.busy || ok) return;
    if (mismatch !== null) {
      setWorld(pre.current);
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

  const decideWith = async (k: number) => {
    if (!decide || core.anim.busy || ok) return;
    const correct = k === decide.answer;
    core.ctx.emit({ type: 'attempt', payload: { step: decide.id, value: k } });
    core.ctx.emit({ type: 'decision_made', payload: { step: decide.id, value: k, correct } });
    if (decide.target === 'box') {
      // 選んでから、のこりの仕組みを再生して比べる（再生は1回だけ）
      setBoxValue(k);
      if (!correct) core.mistakes.current++;
      if (!revealed) {
        setRevealed(true);
        let w = world;
        await core.anim.run(
          'reveal',
          async () => {
            for (let i = idx + 1; i < script.steps.length; i++) {
              const st = script.steps[i];
              if (st.kind !== 'scene') break;
              setHistory((h) => [...h, w].slice(-4));
              const fromW = w;
              await core.anim.tween(st.ms, (t) => setWorld(lerpWorld(fromW, st.world, t)));
              w = st.world;
            }
          },
          { keepDisabled: correct },
        );
      }
      if (correct) finishOk();
      return;
    }
    // 1のへや・ねだんカードへ置く決定: 違うときは、席が のこる／はみ出す 様子のまま止める（もどすで取り消せる）
    setPlaced(true);
    if (!correct) {
      core.mistakes.current++;
      setMismatch(k);
      const target = decide.mismatch ? decide.mismatch(k) : world;
      const fromW = base(pre.current);
      await core.anim.run('mismatch', () => core.anim.tween(700, (t) => setWorld(lerpWorld(fromW, target, t))));
      return;
    }
    setMismatch(null);
    await playFrom(idx + 1, base(pre.current));
  };

  const onTarget = (t: XTarget) => {
    if (!decide || t !== decide.target || core.anim.busy) return;
    const it = items.find((i) => i.key === pick.selected);
    if (!it) return;
    pick.clear();
    void decideWith(it.value);
  };

  const key = carry ? 'carry' : 'borrow';
  const prompt = ok
    ? carry
      ? 'ぴったり！ 10円と 1円で できあがり'
      : 'これが のこる お金！'
    : mismatch !== null
      ? 'もどすか、ほかの まいすうを えらんで みよう'
      : decide
        ? decide.target === 'box'
          ? PROMPT[`${key}_D3`]
          : PROMPT[`${key}_D1${splitting ? '_direct' : ''}` as keyof typeof PROMPT]
        : carry
          ? ''
          : PROMPT.borrow_pay;
  const emphasize = core.hintLevel >= 1 ? (decide?.target ?? null) : null;
  const shownBox = core.demo === 'place' && decide?.target === 'box' ? decide.answer : boxValue;
  const demoWorld = core.demo === 'place' && decide?.mismatch ? decide.mismatch(decide.answer) : null;
  const backdrop = carry ? (
    <CarryBack s={s} emphasize={emphasize} boxValue={shownBox} onTarget={onTarget} />
  ) : (
    <BorrowBack so={b % 10} s={s} emphasize={emphasize} boxValue={shownBox} onTarget={onTarget} />
  );

  return (
    <ModeLayout
      prompt={prompt}
      field={
        <div style={{ position: 'relative', width: '100%' }}>
          <DField world={splitting && !placed ? base(world) : world} s={s} glow={ok}>
            {backdrop}
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
        splitting && decide ? (
          <SplitPicker
            key={`${idx}-${mismatch === null ? 'fresh' : 'again'}`}
            n={carry ? b % 10 : 9}
            label={carry ? 'もらう コイン' : '1の コイン'}
            token={() => <CoinToken v={1} s={s} />}
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
            snap={decide.target === 'box' ? core.snap('box') : undefined}
            onDrop={(it, id) => id === decide.target && void decideWith(it.value)}
            demoKey={core.demo === 'pick' ? items.find((i) => i.value === decide.answer)?.key : null}
            disabled={ok}
          />
        ) : undefined
      }
    />
  );
}
