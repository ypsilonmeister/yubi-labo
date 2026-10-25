// Mode I：はんぶんチャレンジ（v2.7・§22。本人の希望「大きい数から、半分・また半分」）。
// 4けたの数を、1000・100・10・1 のまとまりで見せ、その半分を選ぶ（決定点）。
// 選べたら、上の位から順に、左右の おさら へ同じ数ずつ分ける様子を1つずつ見せる。
// 奇数の位は、1つを ひらいて 下の位の 10 こにする（10を ひらく と同じ考え方）。
// 違う数を選んだときは、その数を2つ おさら に置き、もとの数と合わない位を点線のわくで示す（赤・×・音は使わない）。
// 1回「半分を選ぶ」が1試行。つぎの半分へ進むか、新しい4けたにするかは、本人が選ぶ（シェルの「もう はんぶん」）。

import { useMemo, useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, usePicker, type TrialCore } from '../kit/useTrialCore';
import { ChoiceTray, type ChoiceItem } from '../kit/ChoiceTray';
import { HistoryStrip, ModeLayout, successClass } from '../kit/ui';
import { OUTLINE, SLOT_STROKE } from '../../core/colors';
import { choicesOf } from '../../core/engine/questions';
import type { AccessibilitySettings } from '../../core/types';
import { canHalve, chainOf, digits5, halvingPlan, mismatchPlaces, narrowHalving, sidesAfter } from '../../core/math/halving';
import { columnHeight, Columns, columnsWidth, PlaceDividers } from './Blocks';

type S = Readonly<AccessibilitySettings>;

const W = 1000;
const H = 470;
const TOP = { x: 40, y: 14, w: W - 80, h: 190 };
const THUMB_W = 120;
const PLATE = { y: 236, h: 220, w: 446, gap: 28 };
const PLACES4 = [3, 2, 1, 0];
const PLACES5 = [4, 3, 2, 1, 0];

/** 場の状態: k は分け終わった位の数（0 = まだ分けていない） */
type Shown = { kind: 'idle' } | { kind: 'split'; k: number; ghost?: boolean } | { kind: 'wrong'; chosen: number };

function Field(props: { n: number; shown: Shown; s: S; hint: number; ok: boolean; thumb?: boolean; onTap?: () => void }) {
  const { n, shown, s, hint, ok, thumb } = props;
  const plan = halvingPlan(n)!;
  const steps = plan.steps.length;
  const k = shown.kind === 'split' ? shown.k : 0;
  const state = sidesAfter(n, k);
  const middle = shown.kind === 'split' ? [...state.middle, 0] : [...digits5(n).slice(0, 4), 0];
  // 下の位へ ひらいて来た分（ひらいた印で描く）
  const opened = [0, 0, 0, 0, 0];
  if (shown.kind === 'split') for (let i = 0; i < Math.min(k, steps); i++) if (plan.steps[i].opens && plan.steps[i].place > 0) opened[plan.steps[i].place - 1] = 10;
  const mark = shown.kind === 'wrong' ? mismatchPlaces(n, shown.chosen) : undefined;

  const topW = columnsWidth(middle, PLACES4, true);
  const topX = TOP.x + (TOP.w - topW) / 2 + (s.numberLabels && !thumb ? 60 : 0);
  const topY = TOP.y + 44;

  // おさらの中身
  let plateCounts: number[] | null = null;
  let platePlaces = PLACES4;
  let plateOpacity = 1;
  if (shown.kind === 'split' && k > 0) {
    plateCounts = [...state.each, 0];
    plateOpacity = shown.ghost ? 0.45 : 1;
  } else if (shown.kind === 'wrong') {
    plateCounts = digits5(shown.chosen);
    if (plateCounts[4] > 0) platePlaces = PLACES5;
  }
  const plateW = plateCounts ? columnsWidth(plateCounts, platePlaces, true) : 0;
  // おさらの丸いふちに かからないよう、内側に余白をとる
  const scale = plateW ? Math.min(0.75, (PLATE.w - 56) / plateW) : 1;
  const plateX = (i: number) => (W - 2 * PLATE.w - PLATE.gap) / 2 + i * (PLATE.w + PLATE.gap);
  const plateValue = shown.kind === 'wrong' ? shown.chosen : shown.kind === 'split' && k >= steps && !shown.ghost ? plan.half : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={thumb ? undefined : 'field-svg'} width={thumb ? THUMB_W : undefined} height={thumb ? (THUMB_W * H) / W : undefined} aria-hidden={thumb} onClick={props.onTap}>
      {/* もとの数（いつも見えている） */}
      <rect x={TOP.x} y={TOP.y} width={TOP.w} height={TOP.h} rx={22} fill="#f6f1e6" stroke={SLOT_STROKE} strokeWidth={3} />
      {s.numberLabels && !thumb && (
        <text x={TOP.x + 26} y={TOP.y + 112} fontSize={56} fontWeight={800} fill="#3a3226">
          {n}
        </text>
      )}
      {hint >= 1 && !thumb && <PlaceDividers counts={middle} x={topX} y={TOP.y + 14} h={TOP.h - 28} places={PLACES4} fixed />}
      <Columns counts={middle} opened={opened} x={topX} y={topY} places={PLACES4} fixed mark={mark} labels={hint >= 1 && !thumb ? { names: [], digits: s.numberLabels && shown.kind !== 'split' } : null} />
      {/* ふたつの おさら */}
      <rect data-drop="plates" x={0} y={PLATE.y - 8} width={W} height={PLATE.h + 16} fill="transparent" />
      <g className={successClass(s, ok && !thumb)}>
        {[0, 1].map((i) => (
          <g key={i} pointerEvents="none">
            <rect x={plateX(i)} y={PLATE.y} width={PLATE.w} height={PLATE.h} rx={60} fill="#fffaf0" stroke={plateCounts ? OUTLINE : SLOT_STROKE} strokeWidth={3} strokeDasharray={plateCounts ? undefined : '10 8'} />
            {plateCounts && (
              <g transform={`translate(${plateX(i) + (PLATE.w - plateW * scale) / 2} ${PLATE.y + 40}) scale(${scale})`}>
                <Columns counts={plateCounts} x={0} y={0} places={platePlaces} fixed opacity={plateOpacity} />
              </g>
            )}
            {s.numberLabels && plateValue !== null && !thumb && (
              <text x={plateX(i) + PLATE.w / 2} y={PLATE.y + PLATE.h - 18} textAnchor="middle" fontSize={34} fontWeight={800} fill="#3a3226">
                {plateValue}
              </text>
            )}
          </g>
        ))}
      </g>
      {shown.kind === 'wrong' && s.numberLabels && !thumb && (
        <text x={W / 2} y={TOP.y + TOP.h + 20} textAnchor="middle" fontSize={20} fill="#5a4f40">
          ふたつ あわせると {shown.chosen * 2}
        </text>
      )}
    </svg>
  );
}

/** 手札: 数字（数字のふだ ON）と、位のまとまりの小さな絵 */
function ChoiceNode({ v, s }: { v: number; s: S }) {
  const counts = digits5(v);
  const places = counts[4] > 0 ? PLACES5 : PLACES4;
  const w = Math.max(40, columnsWidth(counts, places));
  const h = Math.max(12, ...places.filter((p) => counts[p] > 0).map((p) => columnHeight(p, counts[p])));
  const sc = Math.min(0.5, 170 / w);
  return (
    <span className="halving-choice">
      {s.numberLabels && <span className="numeral-card">{v}</span>}
      <svg width={Math.max(60, w * sc + 8)} height={h * sc + 8} viewBox={`-4 -4 ${w + 8} ${h + 8}`} aria-hidden>
        <Columns counts={counts} x={0} y={0} places={places} />
      </svg>
    </span>
  );
}

/** これまでの列（出発値から今の数まで）。何回半分にできたかが見える */
function ChainRow({ initial, step, done, s }: { initial: number; step: number; done: number | null; s: S }) {
  const vals = chainOf(initial).slice(0, step + 1);
  if (done !== null) vals.push(done);
  return (
    <div className="halving-chain" aria-label={`${vals.length - 1}かい はんぶんに した`}>
      {vals.map((v, i) => (
        <span key={`${i}-${v}`} className={`halving-chip${i === step ? ' now' : ''}`}>
          {i > 0 && <span className="history-arrow" aria-hidden>→</span>}
          {s.numberLabels ? <b>{v}</b> : <span className="halving-dot" aria-hidden />}
        </span>
      ))}
      {done === null && (
        <span className="halving-chip">
          <span className="history-arrow" aria-hidden>→</span>
          <b>？</b>
        </span>
      )}
    </div>
  );
}

function HalvingTask({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const n = q.operands[0];
  const plan = useMemo(() => halvingPlan(n)!, [n]);
  const answer = plan.half;
  const [shown, setShown] = useState<Shown>({ kind: 'idle' });
  const [ok, setOk] = useState(false);
  const [thumbs, setThumbs] = useState<number[]>([]);
  const pick = usePicker(core);
  const all = useMemo(() => choicesOf(q), [q]);
  const values = core.hintLevel >= 2 ? all.filter((v) => narrowHalving(n, q.distractors).includes(v)) : all;
  const items: ChoiceItem[] = values.map((v) => ({ key: `h-${v}`, value: v, label: s.numberLabels ? `${v}` : 'この かず', node: <ChoiceNode v={v} s={s} /> }));
  const steps = plan.steps.length;

  core.onUndo(() => {
    if (core.anim.busy || ok) return;
    if (shown.kind === 'wrong') {
      core.ctx.emit({ type: 'undo' });
      setShown({ kind: 'idle' });
    } else pick.clear();
  });

  // L2: いちばん上の位だけ、分けたところを薄く見せる／L3: 全部の位を順に分けて見せ、元にもどす（そのあと本人が選ぶ）
  core.onHint((lvl) => {
    if (lvl === 2 && shown.kind !== 'wrong') setShown({ kind: 'split', k: 1, ghost: true });
    if (lvl === 3)
      void core.anim.run('demo', async () => {
        setShown({ kind: 'idle' });
        for (let k = 1; k <= steps; k++) {
          setShown({ kind: 'split', k, ghost: true });
          await core.anim.wait(900);
        }
        await core.anim.wait(900);
        setShown({ kind: 'idle' });
      });
  });

  const place = async (item: ChoiceItem | undefined) => {
    if (!item || core.anim.busy || ok) return;
    pick.clear();
    const v = item.value;
    const correct = v === answer;
    core.ctx.emit({ type: 'attempt', payload: { value: v } });
    core.ctx.emit({ type: 'decision_made', payload: { value: v, correct, chainId: q.chain?.id, step: q.chain?.step } });
    if (!correct) {
      core.mistakes.current++;
      setShown({ kind: 'wrong', chosen: v });
      return;
    }
    // 上の位から1つずつ分ける。前の状態は縮小表示で残す
    const done = await core.anim.run('split', async () => {
      setThumbs([]);
      for (let k = 1; k <= steps; k++) {
        setShown({ kind: 'split', k });
        if (k < steps) setThumbs((t) => [...t, k]);
        await core.anim.wait(800);
      }
    });
    if (!done) return;
    setOk(true);
    core.finish(true);
  };

  const more = canHalve(answer);
  const prompt = ok
    ? s.numberLabels
      ? more
        ? `${answer} が ふたつで ${n}！`
        : `${answer} が ふたつで ${n}！ ${answer} は はんぶんに すると はんぱが でるので、ここまで`
      : more
        ? 'おなじ ふたつに わかれた！'
        : 'おなじ ふたつに わかれた！ これより さきは はんぱが でるので、ここまで'
    : shown.kind === 'wrong'
      ? 'ふたつ あわせると、もとの かずと ちがうね。もどすか、ほかのを えらんで みよう'
      : s.numberLabels
        ? `${n} の はんぶんは どれかな？ おさらに おなじだけ わけよう`
        : 'はんぶんは どれかな？ ふたつの おさらに おなじだけ わけよう';

  return (
    <ModeLayout
      prompt={prompt}
      aside={q.chain ? <ChainRow initial={q.chain.initial} step={q.chain.step} done={ok ? answer : null} s={s} /> : undefined}
      field={
        <Field
          n={n}
          shown={shown}
          s={s}
          hint={core.hintLevel}
          ok={ok}
          // ダイレクト操作 OFF のとき: 手札を選んでから、場（おさら）をタップして置く
          onTap={() => {
            if (pick.selected) void place(items.find((i) => i.key === pick.selected));
          }}
        />
      }
      history={<HistoryStrip items={thumbs.slice(-3).map((k) => ({ key: `k${k}`, node: <Field n={n} shown={{ kind: 'split', k }} s={s} hint={0} ok={false} thumb /> }))} />}
      tray={
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          snap={core.snap('plates')}
          onDrop={(it) => void place(it)}
          demoKey={core.anim.busy && shown.kind === 'split' && shown.ghost ? `h-${answer}` : null}
          disabled={ok}
        />
      }
    />
  );
}

function Task({ bridge }: { bridge: ModeBridge }) {
  const core = useTrialCore(bridge);
  return <HalvingTask core={core} />;
}

function View({ bridge }: { bridge: ModeBridge }) {
  const st = useBridge(bridge);
  if (!st.question) return null;
  return <Task key={st.qKey} bridge={bridge} />;
}

export const HalvingMode = createReactPlugin(
  {
    id: 'mode_i_halving',
    title: 'はんぶん チャレンジ',
    description:
      '4けたの数を 1000・100・10・1 のまとまりで見せ、その半分を選ぶ（決定点）。選べたら上の位から左右へ同じ数ずつ分け、奇数の位は1つを下の位の10こにひらく。選んだ半分がつぎの数になり、整数の半分ができなくなるまで続けられる。',
    supportedTasks: ['halving'],
    supportedStrategies: ['none'],
    stages: { halving: ['construct'] },
    group: 'core',
  },
  View,
);
