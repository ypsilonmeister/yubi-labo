// Mode A：偶奇・対称パズル（§9.1）
// プレートは 2行×n列（横向き）。奇数の余りは最終列の上段。識別課題では回転しない。
// 奇数＋奇数は、2枚目をシステムが見える形で180°回転させ、1列左へずらしてかみ合わせる。

import { useMemo, useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, usePicker, type TrialCore } from '../kit/useTrialCore';
import { ChoiceTray, type ChoiceItem } from '../kit/ChoiceTray';
import { HistoryStrip, ModeLayout, Sparkles, StepControls, successClass } from '../kit/ui';
import { PlateCells, PlateIcon, Silhouette, SilhouetteOutline } from '../shared/Plate';
import { cellKey, combinePlates, placedCells, plateCells, plateCols, type PlacedPlate } from '../../core/math/parity';
import { numberColor, SLOT_STROKE, SLOT_STROKE_STRONG } from '../../core/colors';
import { choicesOf, decisionValue } from '../../core/engine/questions';
import { narrowToTwo } from '../../core/math/choices';
import type { AccessibilitySettings } from '../../core/types';

const W = 760;
const H = 330;
const CELL = 50;

// ---------- 場面（シーン）: プレートの位置・回転の集合。観察・予測・合体の演出で共通 ----------

interface PlatePose {
  key: string;
  value: number;
  x: number;
  y: number;
  rot: number;
}

interface Scene {
  plates: PlatePose[];
  merged?: { value: number; x: number; y: number };
}

function lerpScene(a: Scene, b: Scene, t: number): Scene {
  return {
    plates: b.plates.map((p) => {
      const q = a.plates.find((x) => x.key === p.key) ?? p;
      return { ...p, x: q.x + (p.x - q.x) * t, y: q.y + (p.y - q.y) * t, rot: q.rot + (p.rot - q.rot) * t };
    }),
    merged: t >= 1 ? b.merged : a.merged,
  };
}

/** a と b を並べてから、§9.1 の規則で合体させるまでの場面の列 */
function combineScenes(a: number, b: number, ox: number, oy: number): Scene[] {
  const plan = combinePlates(a, b);
  const apart = (first: number) => ox + (plateCols(first) + 1) * CELL;
  const s0: Scene = { plates: [pose('a', a, ox, oy, 0), pose('b', b, apart(a), oy, 0)] };
  const out: Scene[] = [s0];
  if (plan.rotateSecond) {
    out.push({ plates: [pose('a', a, ox, oy, 0), pose('b', b, apart(a), oy, 180)] });
    out.push({ plates: [pose('a', a, ox, oy, 0), pose('b', b, ox + plan.right.offsetCol * CELL, oy, 180)] });
  } else if (plan.swapped) {
    // 本人（または出題）が奇数を左に置いた: 偶数を左へ並べ替えてからつなぐ
    out.push({ plates: [pose('b', b, ox, oy, 0), pose('a', a, apart(b), oy, 0)] });
    out.push({ plates: [pose('b', b, ox, oy, 0), pose('a', a, ox + plan.right.offsetCol * CELL, oy, 0)] });
  } else {
    out.push({ plates: [pose('a', a, ox, oy, 0), pose('b', b, ox + plan.right.offsetCol * CELL, oy, 0)] });
  }
  const last = out[out.length - 1];
  out.push({ plates: last.plates, merged: { value: a + b, x: ox, y: oy } });
  return out;
}

const pose = (key: string, value: number, x: number, y: number, rot: number): PlatePose => ({ key, value, x, y, rot });

function SceneLayer({ scene, s, glow }: { scene: Scene; s: Readonly<AccessibilitySettings>; glow?: boolean }) {
  const color = (n: number) => numberColor(n, s.colorScheme);
  if (scene.merged) {
    const m = scene.merged;
    return (
      <g transform={`translate(${m.x} ${m.y})`} className={successClass(s, !!glow)}>
        <PlateCells cells={plateCells(m.value)} cell={CELL} color={color(m.value)} />
      </g>
    );
  }
  return (
    <g>
      {scene.plates.map((p) => (
        <g key={p.key} transform={`translate(${p.x} ${p.y}) rotate(${p.rot} ${(plateCols(p.value) * CELL) / 2} ${CELL})`}>
          <PlateCells cells={plateCells(p.value)} cell={CELL} color={color(p.value)} />
        </g>
      ))}
    </g>
  );
}

/** 縮小表示: プレートのある範囲だけを切り出す（extraBox は目標の枠など） */
function Thumb({ scene, s, extra, extraBox }: { scene: Scene; s: Readonly<AccessibilitySettings>; extra?: React.ReactNode; extraBox?: { x: number; y: number; w: number; h: number } }) {
  const boxes = scene.plates.map((p) => ({ x: p.x, y: p.y, w: plateCols(p.value) * CELL, h: 2 * CELL }));
  if (scene.merged) boxes.push({ x: scene.merged.x, y: scene.merged.y, w: plateCols(scene.merged.value) * CELL, h: 2 * CELL });
  if (extraBox) boxes.push(extraBox);
  const x0 = Math.min(...boxes.map((b) => b.x)) - 16;
  const y0 = Math.min(...boxes.map((b) => b.y)) - 16;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + 16;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + 16;
  const vw = Math.max(x1 - x0, 200);
  const vh = Math.max(y1 - y0, 120);
  return (
    <svg viewBox={`${x0} ${y0} ${vw} ${vh}`} width={130} height={(130 * vh) / vw} aria-hidden>
      {extra}
      <SceneLayer scene={scene} s={s} />
    </svg>
  );
}

// ---------- 共通の小物 ----------

function plateChoices(values: number[], s: Readonly<AccessibilitySettings>): ChoiceItem[] {
  return values.map((v, i) => ({ key: `p${i}-${v}`, value: v, label: 'プレート', node: <PlateIcon n={v} color={numberColor(v, s.colorScheme)} /> }));
}

function useChoiceValues(core: TrialCore, value: number): number[] {
  const all = useMemo(() => choicesOf(core.q), [core.q]);
  return core.hintLevel >= 2 ? all.filter((v) => narrowToTwo(value, core.q.distractors).includes(v)) : all;
}

function DropZone(props: { x: number; y: number; w: number; h: number; onTap: () => void; strong?: boolean; dashed?: boolean; id?: string }) {
  return (
    <rect
      data-drop={props.id ?? 'slot'}
      x={props.x}
      y={props.y}
      width={props.w}
      height={props.h}
      rx={14}
      fill="transparent"
      stroke={props.dashed === false ? 'none' : props.strong ? SLOT_STROKE_STRONG : SLOT_STROKE}
      strokeWidth={props.strong ? 5 : 2.5}
      strokeDasharray={props.strong ? undefined : '10 8'}
      onClick={props.onTap}
      style={{ cursor: 'pointer' }}
    />
  );
}

// ---------- 識別（6・7・8）: シルエットにはまるプレートを選ぶ。回転しない ----------

function IdentifyTask({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const n = q.operands[0];
  const pick = usePicker(core);
  const [placed, setPlaced] = useState<number | null>(null);
  const [ok, setOk] = useState(false);
  const values = useChoiceValues(core, n);
  const items = plateChoices(values, s);
  const ox = (W - plateCols(10) * CELL) / 2;
  const oy = 90;

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
  const tapSlot = () => place(items.find((i) => i.key === pick.selected));
  const demoKey = core.demo === 'pick' ? items.find((i) => i.value === n)?.key : null;

  return (
    <ModeLayout
      prompt="この かたちに ぴったり はまる プレートは どれかな"
      field={
        <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
          <g transform={`translate(${ox} ${oy})`}>
            <Silhouette cells={plateCells(n)} cell={CELL} strong={core.hintLevel >= 1} />
            {placed !== null && (
              <g className={successClass(s, ok)}>
                <PlateCells cells={plateCells(placed)} cell={CELL} color={numberColor(placed, s.colorScheme)} />
              </g>
            )}
            {placed !== null && !ok && <SilhouetteOutline cells={plateCells(n)} cell={CELL} />}
            {core.demo === 'place' && <PlateCells cells={plateCells(n)} cell={CELL} color={numberColor(n, s.colorScheme)} opacity={0.5} />}
            <Sparkles s={s} on={ok} x={0} y={0} w={plateCols(n) * CELL} />
          </g>
          <DropZone x={ox - 30} y={oy - 30} w={plateCols(10) * CELL + 60} h={2 * CELL + 60} onTap={tapSlot} dashed={false} />
        </svg>
      }
      tray={
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          onDrop={(it) => place(it)}
          demoKey={demoKey}
          disabled={ok}
        />
      }
    />
  );
}

// ---------- 数字と量の対応（H6）: 数字→プレート／プレート→数字 ----------

function NumeralTask({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const n = q.operands[0];
  const toQuantity = q.variantId === 'numeral_to_quantity';
  const pick = usePicker(core);
  const [placed, setPlaced] = useState<number | null>(null);
  const [ok, setOk] = useState(false);
  const values = useChoiceValues(core, n);
  const items: ChoiceItem[] = toQuantity
    ? plateChoices(values, s)
    : values.map((v, i) => ({ key: `n${i}-${v}`, value: v, label: `すうじ ${v}`, node: <span className="numeral-card">{v}</span> }));

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
  const demoKey = core.demo === 'pick' ? items.find((i) => i.value === n)?.key : null;
  const shown = core.demo === 'place' ? n : placed;

  // 左: 提示（数字カード or プレート）、右: 置き場
  const leftX = 90;
  const rightX = 400;
  const top = 80;
  return (
    <ModeLayout
      prompt={toQuantity ? 'この すうじの プレートは どれかな' : 'この プレートの すうじは どれかな'}
      field={
        <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
          {toQuantity ? (
            <g>
              <rect x={leftX} y={top - 20} width={200} height={170} rx={20} fill="#fffaf0" stroke="#4a4036" strokeWidth={3} />
              <text x={leftX + 100} y={top + 100} textAnchor="middle" fontSize={120} fontWeight={700} fill="#3a3226">
                {n}
              </text>
            </g>
          ) : (
            <g transform={`translate(${leftX} ${top + 15})`}>
              <PlateCells cells={plateCells(n)} cell={CELL * 0.62} color={numberColor(n, s.colorScheme)} />
            </g>
          )}
          <g className={successClass(s, ok)}>
            <rect
              data-drop="slot"
              x={rightX}
              y={top - 20}
              width={toQuantity ? 320 : 200}
              height={170}
              rx={20}
              fill="#f6f1e6"
              stroke={ok ? '#4a4036' : core.hintLevel >= 1 ? SLOT_STROKE_STRONG : SLOT_STROKE}
              strokeWidth={ok || core.hintLevel >= 1 ? 5 : 3}
              strokeDasharray={ok ? undefined : '12 9'}
              onClick={() => place(items.find((i) => i.key === pick.selected))}
              style={{ cursor: 'pointer' }}
            />
            {shown !== null &&
              (toQuantity ? (
                <g transform={`translate(${rightX + 20} ${top + 15})`} opacity={core.demo === 'place' ? 0.5 : 1} pointerEvents="none">
                  <PlateCells cells={plateCells(shown)} cell={CELL * 0.62} color={numberColor(shown, s.colorScheme)} />
                </g>
              ) : (
                <text x={rightX + 100} y={top + 100} textAnchor="middle" fontSize={120} fontWeight={700} fill="#3a3226" opacity={core.demo === 'place' ? 0.4 : 1} pointerEvents="none">
                  {shown}
                </text>
              ))}
          </g>
          {ok && <path d={`M${leftX + 210} ${top + 65} H${rightX - 10}`} stroke="#4a4036" strokeWidth={5} strokeLinecap="round" />}
        </svg>
      }
      tray={
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          onDrop={(it) => place(it)}
          demoKey={demoKey}
          disabled={ok}
        />
      }
    />
  );
}

// ---------- 合成・10の補数（本課題）: 残りの枠を埋めるプレートを選ぶ ----------

function ComposeTask({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const a = q.operands[0];
  const total = q.taskType === 'complement_10' ? 10 : q.operands[0] + q.operands[1];
  const need = decisionValue(q);
  const plan = combinePlates(a, need);
  const aPlaced: PlacedPlate = plan.swapped ? plan.right : plan.left;
  const aOnRight = plan.swapped;
  const ox = (W - plateCols(total) * CELL) / 2;
  const oy = 40;
  const stageY = oy + 2 * CELL + 50;

  const pick = usePicker(core);
  const [scene, setScene] = useState<Scene | null>(null); // 動かしている／置いたプレート
  const [placedValue, setPlacedValue] = useState<number | null>(null);
  const [ok, setOk] = useState(false);
  const [history, setHistory] = useState<Scene[]>([]);
  const values = useChoiceValues(core, need);
  const items = plateChoices(values, s);

  /** 選んだ x を置く位置（不一致でもそのまま見せる） */
  const targetFor = (x: number): { offsetCol: number; rotated: boolean } => {
    const aOdd = a % 2 === 1;
    if (!aOnRight) {
      if (aOdd && x % 2 === 1) return { offsetCol: plateCols(a) - 1, rotated: true };
      return { offsetCol: plateCols(a), rotated: false };
    }
    // a が右にある（a が奇数で、残りが偶数の形）: x は a の左に右端をそろえて置く
    return { offsetCol: aPlaced.offsetCol - plateCols(x), rotated: false };
  };

  core.onUndo(() => {
    if (ok || core.anim.busy) return;
    if (placedValue !== null) {
      setScene(null);
      setPlacedValue(null);
      setHistory([]);
      core.ctx.emit({ type: 'undo' });
    } else pick.clear();
  });
  core.onHint((lvl) => {
    if (lvl === 3) void core.runDemo();
  });

  const place = async (item: ChoiceItem | undefined) => {
    if (!item || ok || core.anim.busy) return;
    const x = item.value;
    pick.clear();
    core.ctx.emit({ type: 'attempt', payload: { value: x } });
    const correct = x === need;
    core.ctx.emit({ type: 'decision_made', payload: { value: x, correct } });
    setPlacedValue(x);
    const tgt = targetFor(x);
    const start: Scene = { plates: [pose('x', x, ox + tgt.offsetCol * CELL, stageY, 0)] };
    const steps: Scene[] = [start];
    if (tgt.rotated) steps.push({ plates: [pose('x', x, ox + tgt.offsetCol * CELL, stageY, 180)] });
    steps.push({ plates: [pose('x', x, ox + tgt.offsetCol * CELL, oy, tgt.rotated ? 180 : 0)] });
    setHistory([]);
    setScene(start);
    await core.anim.run('place', async () => {
      for (let i = 1; i < steps.length; i++) {
        const from = steps[i - 1];
        const to = steps[i];
        setHistory(steps.slice(0, i));
        await core.anim.tween(to.plates[0].rot !== from.plates[0].rot ? 1100 : 700, (t) => setScene(lerpScene(from, to, t)));
      }
      setHistory(steps.slice(0, steps.length - 1));
      if (correct) {
        await core.anim.wait(250);
        setOk(true);
        await core.anim.wait(300);
      }
    }, { keepDisabled: correct });
    if (correct) {
      core.ctx.craft(total, [a, need]);
      core.finish(true);
    } else core.mistakes.current++;
  };

  const tapSlot = () => void place(items.find((i) => i.key === pick.selected));
  const demoKey = core.demo === 'pick' ? items.find((i) => i.value === need)?.key : null;
  const aCells = placedCells(aPlaced);
  const demoTgt = targetFor(need);

  return (
    <ModeLayout
      prompt={q.taskType === 'complement_10' ? '10の わくの あいている ところに はまる プレートは どれかな' : 'あいている ところに はまる プレートは どれかな'}
      field={
        <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
          <g transform={`translate(${ox} ${oy})`}>
            <Silhouette cells={plateCells(total)} cell={CELL} strong={core.hintLevel >= 1} />
            {!ok && <PlateCells cells={aCells} cell={CELL} color={numberColor(a, s.colorScheme)} />}
          </g>
          {ok ? (
            <SceneLayer scene={{ plates: [], merged: { value: total, x: ox, y: oy } }} s={s} glow />
          ) : (
            scene && <SceneLayer scene={scene} s={s} />
          )}
          {!ok && scene && (
            <g transform={`translate(${ox} ${oy})`}>
              <SilhouetteOutline cells={plateCells(total)} cell={CELL} />
            </g>
          )}
          {core.demo === 'place' && (
            <g opacity={0.5} pointerEvents="none">
              <SceneLayer scene={{ plates: [pose('demo', need, ox + demoTgt.offsetCol * CELL, oy, demoTgt.rotated ? 180 : 0)] }} s={s} />
            </g>
          )}
          <Sparkles s={s} on={ok} x={ox} y={oy} w={plateCols(total) * CELL} />
          <DropZone x={20} y={10} w={W - 40} h={H - 20} onTap={tapSlot} dashed={false} />
        </svg>
      }
      history={
        <HistoryStrip
          items={history.map((h, i) => ({
            key: String(i),
            node: (
              <Thumb
                scene={h}
                s={s}
                extraBox={{ x: ox, y: oy, w: plateCols(total) * CELL, h: 2 * CELL }}
                extra={
                  <g transform={`translate(${ox} ${oy})`}>
                    <Silhouette cells={plateCells(total)} cell={CELL} />
                    <PlateCells cells={aCells} cell={CELL} color={numberColor(a, s.colorScheme)} />
                  </g>
                }
              />
            ),
          }))}
        />
      }
      tray={
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          onDrop={(it) => void place(it)}
          demoKey={demoKey}
          disabled={ok}
        />
      }
    />
  );
}

// ---------- 予測: 合体後の形を候補から選ぶ → 正誤に関係なく仕組みを見る ----------

function PredictTask({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const [a, b] = q.taskType === 'complement_10' ? [q.operands[0], 10 - q.operands[0]] : q.operands;
  const total = a + b;
  const answer = decisionValue(q);
  const scenes = useMemo(() => combineScenes(a, b, 60, 30), [a, b]);
  const pick = usePicker(core);
  const [pred, setPred] = useState<number | null>(null);
  const [scene, setScene] = useState<Scene>(scenes[0]);
  const [history, setHistory] = useState<Scene[]>([]);
  const [shownAll, setShownAll] = useState(false);
  const values = useChoiceValues(core, answer);
  const items = plateChoices(values, s);
  const boxY = 30 + 2 * CELL + 60;

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
    await core.anim.run('mechanism', async () => {
      await core.anim.wait(500);
      for (let i = 1; i < scenes.length; i++) {
        setHistory(scenes.slice(0, i));
        const from = scenes[i - 1];
        const to = scenes[i];
        const rotating = to.plates.some((p) => p.rot !== (from.plates.find((x) => x.key === p.key)?.rot ?? 0));
        await core.anim.tween(rotating ? 1200 : 800, (t) => setScene(lerpScene(from, to, t)));
        await core.anim.wait(250);
      }
      setShownAll(true);
    }, { keepDisabled: true });
    core.finish(correct);
  };

  const demoKey = core.demo === 'pick' ? items.find((i) => i.value === answer)?.key : null;
  const shownPred = core.demo === 'place' ? answer : pred;
  return (
    <ModeLayout
      prompt="ふたつを くっつけると どんな かたちに なるかな"
      field={
        <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
          <SceneLayer scene={scene} s={s} glow={shownAll && pred === answer} />
          <rect
            data-drop="slot"
            x={40}
            y={boxY - 20}
            width={plateCols(10) * CELL + 40}
            height={2 * CELL + 40}
            rx={16}
            fill="#f6f1e6"
            stroke={core.hintLevel >= 1 ? SLOT_STROKE_STRONG : SLOT_STROKE}
            strokeWidth={core.hintLevel >= 1 ? 5 : 3}
            strokeDasharray="12 9"
            onClick={() => void place(items.find((i) => i.key === pick.selected))}
            style={{ cursor: 'pointer' }}
          />
          {shownPred === null ? (
            <text x={60 + (plateCols(10) * CELL) / 2} y={boxY + CELL + 18} textAnchor="middle" fontSize={56} fill={SLOT_STROKE} pointerEvents="none">
              ?
            </text>
          ) : (
            <g transform={`translate(60 ${boxY})`} opacity={core.demo === 'place' ? 0.5 : 1} pointerEvents="none">
              <PlateCells cells={plateCells(shownPred)} cell={CELL} color={numberColor(shownPred, s.colorScheme)} />
            </g>
          )}
          {shownAll && (
            // 上の合体結果と下の予測を同じ左端で比べられるよう、上の形の輪郭を下にも薄く重ねる
            <g transform={`translate(60 ${boxY})`} pointerEvents="none">
              {plateCells(total).map((c) => (
                <rect key={cellKey(c)} x={c.col * CELL} y={c.row * CELL} width={CELL} height={CELL} fill="none" stroke="#3d342a" strokeWidth={2} strokeDasharray="4 4" />
              ))}
            </g>
          )}
        </svg>
      }
      history={<HistoryStrip items={history.map((h, i) => ({ key: String(i), node: <Thumb scene={h} s={s} /> }))} />}
      tray={
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          onDrop={(it) => void place(it)}
          demoKey={demoKey}
          disabled={pred !== null}
        />
      }
    />
  );
}

// ---------- 観察: 判定なし。つぎ／まえ で1段階ずつ ----------

function ObserveTask({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const [a, b] = q.taskType === 'complement_10' ? [q.operands[0], 10 - q.operands[0]] : q.operands;
  const scenes = useMemo(() => combineScenes(a, b, 60, 60), [a, b]);
  const [idx, setIdx] = useState(0);
  const [scene, setScene] = useState<Scene>(scenes[0]);

  const prev = () => {
    if (idx === 0 || core.anim.busy) return;
    core.ctx.emit({ type: 'undo', payload: { step: idx - 1 } });
    setIdx(idx - 1);
    setScene(scenes[idx - 1]);
  };
  core.onUndo(prev);
  const next = async () => {
    if (core.anim.busy) return;
    if (idx >= scenes.length - 1) {
      core.finishExplored();
      return;
    }
    core.ctx.emit({ type: 'item_selected', payload: { step: idx + 1 } });
    const from = scenes[idx];
    const to = scenes[idx + 1];
    await core.anim.run('step', async () => {
      const rotating = to.plates.some((p) => p.rot !== (from.plates.find((x) => x.key === p.key)?.rot ?? 0));
      await core.anim.tween(rotating ? 1400 : 900, (t) => setScene(lerpScene(from, to, t)));
    });
    setIdx(idx + 1);
  };

  return (
    <ModeLayout
      prompt="「つぎ」を おすと うごくよ"
      field={
        <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
          <SceneLayer scene={scene} s={s} glow={!!scene.merged} />
        </svg>
      }
      history={<HistoryStrip items={scenes.slice(0, idx).map((h, i) => ({ key: String(i), node: <Thumb scene={h} s={s} /> }))} />}
      tray={<StepControls index={idx} count={scenes.length} onNext={() => void next()} onPrev={prev} />}
    />
  );
}

// ---------- 自由探索: 好きな2枚をおいて、くっつけてみる。判定なし ----------

function ExploreTask({ core }: { core: TrialCore }) {
  const s = core.settings;
  const pick = usePicker(core);
  const [left, setLeft] = useState<number | null>(null);
  const [right, setRight] = useState<number | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [history, setHistory] = useState<Scene[]>([]);
  const items = plateChoices([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], s);
  const oy = 60;
  const ox = 40;
  const slotW = plateCols(10) * CELL + 20;

  const reset = () => {
    if (core.anim.busy) return;
    setLeft(null);
    setRight(null);
    setScene(null);
    setHistory([]);
  };
  core.onUndo(() => {
    if (core.anim.busy) return;
    if (scene?.merged) reset();
    else if (right !== null) setRight(null);
    else if (left !== null) setLeft(null);
    else pick.clear();
    core.ctx.emit({ type: 'undo' });
  });

  const put = (side: 'L' | 'R', item: ChoiceItem | undefined) => {
    if (!item || core.anim.busy || scene) return;
    core.ctx.emit({ type: 'attempt', payload: { side, value: item.value } });
    if (side === 'L') setLeft(item.value);
    else setRight(item.value);
    pick.clear();
  };

  const combine = async () => {
    if (left === null || right === null || core.anim.busy) return;
    core.ctx.emit({ type: 'decision_made', payload: { combine: [left, right] } });
    const scenes = combineScenes(left, right, ox, oy);
    setScene(scenes[0]);
    await core.anim.run('combine', async () => {
      for (let i = 1; i < scenes.length; i++) {
        setHistory(scenes.slice(0, i));
        const from = scenes[i - 1];
        const to = scenes[i];
        const rotating = to.plates.some((p) => p.rot !== (from.plates.find((x) => x.key === p.key)?.rot ?? 0));
        await core.anim.tween(rotating ? 1200 : 800, (t) => setScene(lerpScene(from, to, t)));
        await core.anim.wait(200);
      }
    });
    core.ctx.craft(left + right, [left, right]);
  };

  const sel = items.find((i) => i.key === pick.selected);
  return (
    <ModeLayout
      prompt="すきな プレートを ふたつ おいて、くっつけて みよう"
      field={
        <svg viewBox={`0 0 ${W} ${H}`} className="field-svg">
          {scene ? (
            <SceneLayer scene={scene} s={s} glow={!!scene.merged} />
          ) : (
            <>
              <rect data-drop="L" x={ox - 10} y={oy - 10} width={slotW - 10} height={2 * CELL + 20} rx={14} fill="#f6f1e6" stroke={SLOT_STROKE} strokeWidth={3} strokeDasharray="10 8" onClick={() => put('L', sel)} style={{ cursor: 'pointer' }} />
              <rect data-drop="R" x={ox - 10} y={oy + 2 * CELL + 30} width={slotW - 10} height={2 * CELL + 20} rx={14} fill="#f6f1e6" stroke={SLOT_STROKE} strokeWidth={3} strokeDasharray="10 8" onClick={() => put('R', sel)} style={{ cursor: 'pointer' }} />
              {left !== null && (
                <g transform={`translate(${ox} ${oy})`} pointerEvents="none">
                  <PlateCells cells={plateCells(left)} cell={CELL} color={numberColor(left, s.colorScheme)} />
                </g>
              )}
              {right !== null && (
                <g transform={`translate(${ox} ${oy + 2 * CELL + 40})`} pointerEvents="none">
                  <PlateCells cells={plateCells(right)} cell={CELL} color={numberColor(right, s.colorScheme)} />
                </g>
              )}
            </>
          )}
        </svg>
      }
      history={<HistoryStrip items={history.map((h, i) => ({ key: String(i), node: <Thumb scene={h} s={s} /> }))} />}
      tray={
        <>
          <div className="explore-actions">
            <button type="button" className="btn-main" disabled={left === null || right === null || !!scene} onClick={() => void combine()}>
              くっつける
            </button>
            <button type="button" className="btn-soft" onClick={reset}>
              さいしょから
            </button>
          </div>
          <ChoiceTray
            items={items}
            selected={pick.selected}
            onTap={(it) => pick.toggle(it.key, it.value)}
            drag={s.inputMethod === 'drag'}
            onDrop={(it, id) => put(id === 'R' ? 'R' : 'L', it)}
            disabled={!!scene}
          />
        </>
      }
    />
  );
}

// ---------- 振り分け ----------

function Task({ bridge }: { bridge: ModeBridge }) {
  const core = useTrialCore(bridge);
  const q = core.q;
  if (q.learningStage === 'explore') return <ExploreTask core={core} />;
  if (q.learningStage === 'observe') return <ObserveTask core={core} />;
  if (q.taskType === 'subitizing_678') return <IdentifyTask core={core} />;
  if (q.taskType === 'numeral_quantity') return <NumeralTask core={core} />;
  if (q.learningStage === 'predict') return <PredictTask core={core} />;
  return <ComposeTask core={core} />;
}

function View({ bridge }: { bridge: ModeBridge }) {
  const st = useBridge(bridge);
  if (!st.question) return null;
  return <Task key={st.qKey} bridge={bridge} />;
}

export const ParityMode = createReactPlugin(
  {
    id: 'mode_a_parity',
    title: 'かたちパズル',
    description: '2列のプレート（偶数は長方形、奇数は1つ出っぱり）で、6・7・8の見分けや合成・10の補数を形として扱う。奇数＋奇数は回転してかみ合う様子を見せる。',
    supportedTasks: ['subitizing_678', 'numeral_quantity', 'synthesis_5', 'complement_10'],
    supportedStrategies: ['none'],
    stages: {
      subitizing_678: ['construct'],
      numeral_quantity: ['construct'],
      synthesis_5: ['observe', 'predict', 'construct'],
      complement_10: ['observe', 'construct'],
    },
  },
  View,
);
