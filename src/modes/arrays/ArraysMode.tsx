// Mode L：タイルの かけわり（v2.10・§9.10）。E タイル・リアクターの盤（TileField）を使う。E の自由探索は変えない。
// 課題（おまかせ進行の順）:
//   いくつ ある（array_multiply）: 行 × 列 にならんだタイルが、ぜんぶで いくつかを選ぶ。
//   わけて ならべる（array_divide）: ぜんぶの タイルを r れつに ならべると、1れつ なんこ かを選ぶ。選ぶと席にならぶ。
//   10と のこり（array_split）: 10の列と のこりの列に分けた 2けた×1けた の配列が、ぜんぶで いくつかを選ぶ。
//   あまりが でる（array_divide_rem、v2.13）: わけて ならべる の続き。1れつの数を選んだあと、あまりの数を選ぶ。
// 違う数を選んでも、選んだ数を同じ れつ にならべた形を見せるだけ（足りない席・のこった タイル）。赤・×・音・ゆれは使わない。
// 「れつ」は E と同じく、よこの ならび（行）のこと。数字は数字のふだ（numberLabels）に従う。

import { useMemo, useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, usePicker, type TrialCore } from '../kit/useTrialCore';
import { ChoiceTray, type ChoiceItem } from '../kit/ChoiceTray';
import { ModeLayout } from '../kit/ui';
import { PLACE_BG, PLACE_STROKE, SLOT_STROKE, SLOT_STROKE_STRONG, TILE } from '../../core/colors';
import { choicesOf } from '../../core/engine/questions';
import { arrayAnswer, arrayShape, remainderDistractors, remainderOf, splitParts } from '../../core/math/arrays';
import { shuffle } from '../../core/math/choices';
import { arrange } from '../../core/math/tiles';
import { NumberChoice as ChoiceNode } from '../shared/NumberChoice';
import { geometry, lerpPos, targets, TILE_AREA, TileField, type Pos } from '../shared/TileField';
import { TileLab } from '../tiles/TilesMode';

/** 列 k まで（0 始まりで k 列ぶん）を囲む枠 */
function ColumnsFrame({ n, rows, k, strong }: { n: number; rows: number; k: number; strong?: boolean }) {
  if (k <= 0) return null;
  const g = geometry(n, rows);
  return <rect x={g.x0 - 3} y={g.y0 - 3} width={k * g.cell + 6} height={rows * g.cell + 6} rx={8} fill="none" stroke={strong ? TILE.glow : SLOT_STROKE_STRONG} strokeWidth={strong ? 6 : 4} strokeDasharray={strong ? undefined : '10 7'} pointerEvents="none" />;
}

// ---------- いくつ ある・10と のこり ----------

function CountTask({ core, task }: { core: TrialCore; task: 'array_multiply' | 'array_split' }) {
  const { q, settings: s } = core;
  const { rows, cols } = arrayShape(task, q.operands);
  const n = rows * cols;
  const answer = arrayAnswer(task, q.operands);
  const split = task === 'array_split';
  const parts = split ? splitParts(rows, cols) : null;
  const tiles = useMemo(() => targets(n, rows), [n, rows]);
  const g = geometry(n, rows);
  const [wrong, setWrong] = useState<number | null>(null);
  const [ok, setOk] = useState(false);
  const [demoCols, setDemoCols] = useState(0);
  const pick = usePicker(core);
  const all = useMemo(() => choicesOf(q), [q]);
  const values = core.hintLevel >= 2 ? all.filter((v) => v === answer || v === q.distractors[0]) : all;
  const items: ChoiceItem[] = values.map((v) => ({ key: `a-${v}`, value: v, label: s.numberLabels ? `${v}` : 'この かず', node: <ChoiceNode v={v} s={s} /> }));

  core.onUndo(() => {
    if (core.anim.busy || ok) return;
    if (wrong !== null) {
      core.ctx.emit({ type: 'undo' });
      setWrong(null);
    } else pick.clear();
  });
  // L3: 1列ずつ（10と のこり では 10の列 → のこりの列）囲みを広げて見せてから、元にもどす
  core.onHint((lvl) => {
    if (lvl !== 3) return;
    void core.anim.run('demo', async () => {
      const stops = split ? [10, cols] : Array.from({ length: cols }, (_, i) => i + 1);
      for (const k of stops) {
        setDemoCols(k);
        await core.anim.wait(split ? 1100 : 420);
      }
      await core.anim.wait(700);
      setDemoCols(0);
    });
  });

  const place = (item: ChoiceItem | undefined) => {
    if (!item || core.anim.busy || ok) return;
    pick.clear();
    const v = item.value;
    const correct = v === answer;
    core.ctx.emit({ type: 'attempt', payload: { value: v } });
    core.ctx.emit({ type: 'decision_made', payload: { value: v, correct } });
    if (!correct) {
      core.mistakes.current++;
      setWrong(v);
      return;
    }
    setWrong(null);
    setOk(true);
    core.ctx.craft(n, [rows, cols], 'product');
    core.finish(true);
  };

  const under = (
    <g>
      <rect data-drop="array" x={TILE_AREA.x} y={TILE_AREA.y} width={TILE_AREA.w} height={TILE_AREA.h} fill="transparent" />
      {split && (
        <g pointerEvents="none">
          <rect x={g.x0 - 8} y={g.y0 - 8} width={10 * g.cell + 8} height={rows * g.cell + 16} rx={10} fill={PLACE_BG.tens} stroke={PLACE_STROKE.tens} strokeWidth={2} />
          <rect x={g.x0 + 10 * g.cell} y={g.y0 - 8} width={(cols - 10) * g.cell + 8} height={rows * g.cell + 16} rx={10} fill={PLACE_BG.ones} stroke={PLACE_STROKE.ones} strokeWidth={2} />
        </g>
      )}
    </g>
  );
  const over = (
    <g>
      {split && <line x1={g.x0 + 10 * g.cell} x2={g.x0 + 10 * g.cell} y1={g.y0 - 14} y2={g.y0 + rows * g.cell + 14} stroke={SLOT_STROKE_STRONG} strokeWidth={4} strokeDasharray="10 7" pointerEvents="none" />}
      {/* L1: 1列ぶんを囲む（1列に いくつ あるか） */}
      {core.hintLevel >= 1 && demoCols === 0 && !ok && <ColumnsFrame n={n} rows={rows} k={1} />}
      {demoCols > 0 && <ColumnsFrame n={n} rows={rows} k={demoCols} strong />}
    </g>
  );

  const prompt = ok
    ? s.numberLabels
      ? split
        ? `${parts!.tens} と ${parts!.ones} で ${answer}！`
        : `${cols} こずつ ${rows} れつで ${answer}！`
      : 'ぴったり！'
    : wrong !== null
      ? 'えらんだ かずを おなじ れつで ならべると、かたちが ちがうね。もどすか、ほかのを えらんで みよう'
      : split
        ? 'タイルは ぜんぶで いくつ？ 10の ところと、のこりに わけて みよう'
        : 'タイルは ぜんぶで いくつ？';

  return (
    <ModeLayout
      prompt={prompt}
      field={
        <div
          style={{ width: '100%' }}
          onClick={() => {
            if (pick.selected) place(items.find((i) => i.key === pick.selected));
          }}
        >
          <TileField n={n} rows={rows} tiles={tiles} s={s} glow={ok} under={under} over={over} />
        </div>
      }
      history={
        wrong !== null ? (
          <div className="lab-row" aria-live="polite">
            <span>えらんだ かずを {rows > 0 && s.numberLabels ? `${rows} ` : ''}れつに ならべると</span>
            <TileField n={wrong} rows={rows} tiles={targets(wrong, rows)} s={s} glow={false} thumb thumbWidth={300} />
          </div>
        ) : undefined
      }
      tray={
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          snap={core.snap('array')}
          onDrop={(it) => place(it)}
          demoKey={demoCols > 0 && demoCols === cols ? `a-${answer}` : null}
          disabled={ok}
        />
      }
    />
  );
}

// ---------- わけて ならべる ----------

const PILE = { x: TILE_AREA.x + 24, w: 400 };
const GRID = { x: TILE_AREA.x + 470, w: 450 };

/** ぜんぶの タイル（左がわに 10こずつ よこに ならべる） */
function pilePositions(n: number): Pos[] {
  const rowsN = Math.ceil(n / 10);
  const cell = Math.min(38, PILE.w / 10, (TILE_AREA.h - 40) / Math.max(1, rowsN));
  const y0 = TILE_AREA.y + (TILE_AREA.h - rowsN * cell) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: PILE.x + (i % 10) * cell, y: y0 + Math.floor(i / 10) * cell, size: cell, opacity: 1 }));
}

/** r れつ × c の席（列ごとに上から。E と同じ並び） */
function gridGeom(r: number, c: number) {
  const cell = Math.min(60, GRID.w / Math.max(1, c), (TILE_AREA.h - 40) / r);
  return { cell, x0: GRID.x + (GRID.w - c * cell) / 2, y0: TILE_AREA.y + (TILE_AREA.h - r * cell) / 2 };
}
function seatPositions(r: number, c: number): Pos[] {
  const g = gridGeom(r, c);
  return arrange(r * c, r).map((p) => ({ x: g.x0 + p.col * g.cell, y: g.y0 + p.row * g.cell, size: g.cell, opacity: 1 }));
}

/** 選んだ 1れつの数 c で、タイルを席へ。席より多い分は左に のこる */
function layout(n: number, r: number, c: number | null): Pos[] {
  const pile = pilePositions(n);
  if (c === null) return pile;
  const seats = seatPositions(r, c);
  return pile.map((p, i) => seats[i] ?? p);
}

function DivideTask({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const [n, r] = q.operands;
  const answer = arrayAnswer('array_divide', q.operands);
  const [chosen, setChosen] = useState<number | null>(null);
  const [tiles, setTiles] = useState<Pos[]>(() => layout(n, r, null));
  const [ok, setOk] = useState(false);
  const pick = usePicker(core);
  const all = useMemo(() => choicesOf(q), [q]);
  const values = core.hintLevel >= 2 ? all.filter((v) => v === answer || v === q.distractors[0]) : all;
  const items: ChoiceItem[] = values.map((v) => ({ key: `d-${v}`, value: v, label: s.numberLabels ? `${v}` : 'この かず', node: <ChoiceNode v={v} s={s} /> }));

  const moveTo = async (c: number | null) => {
    const from = tiles;
    const to = layout(n, r, c);
    return core.anim.run('arrange', () => core.anim.tween(560, (t) => setTiles(lerpPos(from, to, t))));
  };

  core.onUndo(() => {
    if (core.anim.busy || ok) return;
    if (chosen !== null) {
      core.ctx.emit({ type: 'undo' });
      setChosen(null);
      setTiles(layout(n, r, null));
    } else pick.clear();
  });
  // L3: 正しい数で席に ならべて見せてから、元にもどす
  core.onHint((lvl) => {
    if (lvl !== 3) return;
    void core.anim.run('demo', async () => {
      setChosen(answer);
      setTiles(layout(n, r, answer));
      await core.anim.wait(1800);
      setChosen(null);
      setTiles(layout(n, r, null));
    });
  });

  const place = async (item: ChoiceItem | undefined) => {
    if (!item || core.anim.busy || ok) return;
    pick.clear();
    const c = item.value;
    const correct = c === answer;
    core.ctx.emit({ type: 'attempt', payload: { value: c } });
    core.ctx.emit({ type: 'decision_made', payload: { value: c, correct } });
    setChosen(c);
    const done = await moveTo(c);
    if (!done) return;
    if (!correct) {
      core.mistakes.current++;
      return;
    }
    setOk(true);
    core.ctx.craft(n, [r, answer], 'product');
    core.finish(true);
  };

  // 席（まだ決めていないときは、r 本の れつの しるし）
  const seatsN = chosen !== null ? r * chosen : 0;
  const empty = chosen !== null && seatsN > n ? seatPositions(r, chosen).slice(n) : [];
  const left = chosen !== null && n > seatsN ? n - seatsN : 0;
  const lanes = chosen === null ? Array.from({ length: r }, (_, i) => i) : [];
  const laneH = (TILE_AREA.h - 40) / Math.max(r, 1);
  const laneCell = Math.min(60, laneH);
  const under = (
    <g>
      <rect data-drop="array" x={TILE_AREA.x} y={TILE_AREA.y} width={TILE_AREA.w} height={TILE_AREA.h} fill="transparent" />
      <line x1={GRID.x - 24} x2={GRID.x - 24} y1={TILE_AREA.y + 24} y2={TILE_AREA.y + TILE_AREA.h - 24} stroke={SLOT_STROKE} strokeWidth={2} strokeDasharray="6 8" pointerEvents="none" />
      {lanes.map((i) => {
        const y = TILE_AREA.y + (TILE_AREA.h - r * laneCell) / 2 + i * laneCell;
        return <rect key={i} x={GRID.x} y={y + 3} width={GRID.w} height={laneCell - 6} rx={8} fill={TILE.empty} stroke={core.hintLevel >= 1 ? SLOT_STROKE_STRONG : SLOT_STROKE} strokeWidth={core.hintLevel >= 1 ? 3 : 2} strokeDasharray="8 6" pointerEvents="none" />;
      })}
      {empty.map((p, i) => (
        <rect key={`e${i}`} x={p.x + 3} y={p.y + 3} width={p.size - 6} height={p.size - 6} rx={6} fill={TILE.empty} stroke={SLOT_STROKE} strokeWidth={2.5} strokeDasharray="7 5" pointerEvents="none" />
      ))}
    </g>
  );
  const g = chosen !== null ? gridGeom(r, chosen) : null;
  const over = ok && g ? <rect x={g.x0 - 4} y={g.y0 - 4} width={answer * g.cell + 8} height={r * g.cell + 8} rx={10} fill="none" stroke={TILE.glow} strokeWidth={5} pointerEvents="none" /> : null;

  const prompt = ok
    ? s.numberLabels
      ? `1れつに ${answer} こずつ、ぴったり！`
      : 'ぴったり ならんだ！'
    : chosen !== null && !core.anim.busy
      ? left > 0
        ? 'のこった タイルが あるね。もどすか、ほかのを えらんで みよう'
        : 'あいた せきが あるね。もどすか、ほかのを えらんで みよう'
      : s.numberLabels
        ? `${n} この タイルを ${r} れつに ならべると、1れつ なんこ？`
        : 'タイルを みぎの れつに おなじだけ ならべると、1れつ なんこ？';

  return (
    <ModeLayout
      prompt={prompt}
      field={
        <div
          style={{ width: '100%' }}
          onClick={() => {
            if (pick.selected) void place(items.find((i) => i.key === pick.selected));
          }}
        >
          <TileField n={0} rows={1} tiles={tiles} s={s} glow={false} under={under} over={over} />
        </div>
      }
      tray={
        <ChoiceTray
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          snap={core.snap('array')}
          onDrop={(it) => void place(it)}
          demoKey={core.anim.busy && chosen === answer && !ok ? `d-${answer}` : null}
          disabled={ok}
        />
      }
    />
  );
}

// ---------- あまりが でる（v2.13） ----------

/** あまりの タイルを置く場所（左がわの まんなかに 1れつ） */
const REM_CELL = 44;
function remPositions(d: number): Pos[] {
  const x0 = PILE.x + (PILE.w - d * REM_CELL) / 2;
  const y = TILE_AREA.y + TILE_AREA.h / 2 - REM_CELL / 2;
  return Array.from({ length: d }, (_, j) => ({ x: x0 + j * REM_CELL, y, size: REM_CELL - 4, opacity: 1 }));
}

/** 正しい1れつの数で席に ならべ、のこりを「あまり」の場所へ */
function layoutRem(n: number, r: number, c: number): Pos[] {
  const seats = seatPositions(r, c);
  const rem = remPositions(n - r * c);
  return pilePositions(n).map((p, i) => seats[i] ?? rem[i - r * c] ?? p);
}

/**
 * あまりのある わりざん（array_divide_rem）。決定点は2つ:
 * D1 1れつの数（多いと あいた 席、少ないと のこりで もう1こずつ ならべられる）。正しいと、のこりは「あまり」の場所へ。
 * D2 あまりは いくつ（のこった タイルは見えている。あまりは いつも れつの数より少ない）。
 */
function DivideRemTask({ core }: { core: TrialCore }) {
  const { q, settings: s } = core;
  const [n, r] = q.operands;
  const answer = arrayAnswer('array_divide_rem', q.operands);
  const rem = remainderOf(q.operands);
  const [chosen, setChosen] = useState<number | null>(null);
  const [tiles, setTiles] = useState<Pos[]>(() => layout(n, r, null));
  const [stage, setStage] = useState<'cols' | 'rem'>('cols');
  const [remPick, setRemPick] = useState<number | null>(null);
  const [ok, setOk] = useState(false);
  const pick = usePicker(core);
  const colChoices = useMemo(() => choicesOf(q), [q]);
  const remChoices = useMemo(() => shuffle([rem, ...remainderDistractors(q.operands, core.ctx.learning.choiceCount - 1)]), [q, rem, core.ctx.learning.choiceCount]);
  const all = stage === 'cols' ? colChoices : remChoices;
  const firstWrong = stage === 'cols' ? q.distractors[0] : remChoices.find((v) => v !== rem);
  const target = stage === 'cols' ? answer : rem;
  const values = core.hintLevel >= 2 ? all.filter((v) => v === target || v === firstWrong) : all;
  const items: ChoiceItem[] = values.map((v) => ({ key: `${stage}-${v}`, value: v, label: s.numberLabels ? `${v}` : 'この かず', node: <ChoiceNode v={v} s={s} /> }));

  const moveTo = async (to: Pos[]) => {
    const from = tiles;
    return core.anim.run('arrange', () => core.anim.tween(560, (t) => setTiles(lerpPos(from, to, t))));
  };

  core.onUndo(() => {
    if (core.anim.busy || ok) return;
    if (stage === 'cols' && chosen !== null) {
      core.ctx.emit({ type: 'undo' });
      setChosen(null);
      setTiles(layout(n, r, null));
    } else if (stage === 'rem' && remPick !== null) {
      core.ctx.emit({ type: 'undo' });
      setRemPick(null);
    } else pick.clear();
  });
  // L3: 1れつの数では、正しい数で席に ならべて見せてから元にもどす。あまりでは、正しい数のカードを示す
  core.onHint((lvl) => {
    if (lvl !== 3) return;
    if (stage === 'rem') return void core.runDemo();
    void core.anim.run('demo', async () => {
      setTiles(layoutRem(n, r, answer));
      await core.anim.wait(1800);
      setTiles(chosen !== null ? layout(n, r, chosen) : layout(n, r, null));
    });
  });

  const place = async (item: ChoiceItem | undefined) => {
    if (!item || core.anim.busy || ok) return;
    pick.clear();
    const v = item.value;
    if (stage === 'cols') {
      const correct = v === answer;
      core.ctx.emit({ type: 'attempt', payload: { step: 'D1', value: v } });
      core.ctx.emit({ type: 'decision_made', payload: { step: 'D1', value: v, correct } });
      setChosen(v);
      const done = await moveTo(correct ? layoutRem(n, r, v) : layout(n, r, v));
      if (!done) return;
      if (!correct) {
        core.mistakes.current++;
        return;
      }
      setStage('rem');
      return;
    }
    const correct = v === rem;
    core.ctx.emit({ type: 'attempt', payload: { step: 'D2', value: v } });
    core.ctx.emit({ type: 'decision_made', payload: { step: 'D2', value: v, correct } });
    setRemPick(v);
    if (!correct) {
      core.mistakes.current++;
      return;
    }
    setOk(true);
    core.finish(true);
  };

  const seatsN = chosen !== null ? r * chosen : 0;
  const empty = stage === 'cols' && chosen !== null && seatsN > n ? seatPositions(r, chosen).slice(n) : [];
  const leftOver = stage === 'cols' && chosen !== null && n > seatsN ? n - seatsN : 0;
  const lanes = chosen === null ? Array.from({ length: r }, (_, i) => i) : [];
  const laneCell = Math.min(60, (TILE_AREA.h - 40) / Math.max(r, 1));
  const remBox = stage === 'rem' ? remPositions(rem) : [];
  const under = (
    <g>
      <rect data-drop="array" x={TILE_AREA.x} y={TILE_AREA.y} width={TILE_AREA.w} height={TILE_AREA.h} fill="transparent" />
      <line x1={GRID.x - 24} x2={GRID.x - 24} y1={TILE_AREA.y + 24} y2={TILE_AREA.y + TILE_AREA.h - 24} stroke={SLOT_STROKE} strokeWidth={2} strokeDasharray="6 8" pointerEvents="none" />
      {lanes.map((i) => {
        const y = TILE_AREA.y + (TILE_AREA.h - r * laneCell) / 2 + i * laneCell;
        return <rect key={i} x={GRID.x} y={y + 3} width={GRID.w} height={laneCell - 6} rx={8} fill={TILE.empty} stroke={core.hintLevel >= 1 ? SLOT_STROKE_STRONG : SLOT_STROKE} strokeWidth={core.hintLevel >= 1 ? 3 : 2} strokeDasharray="8 6" pointerEvents="none" />;
      })}
      {empty.map((p, i) => (
        <rect key={`e${i}`} x={p.x + 3} y={p.y + 3} width={p.size - 6} height={p.size - 6} rx={6} fill={TILE.empty} stroke={SLOT_STROKE} strokeWidth={2.5} strokeDasharray="7 5" pointerEvents="none" />
      ))}
      {remBox.length > 0 && (
        <g pointerEvents="none">
          <rect x={remBox[0].x - 14} y={remBox[0].y - 40} width={rem * REM_CELL + 24} height={REM_CELL + 54} rx={12} fill={PLACE_BG.ones} stroke={core.hintLevel >= 1 ? SLOT_STROKE_STRONG : PLACE_STROKE.ones} strokeWidth={core.hintLevel >= 1 ? 5 : 3} strokeDasharray="10 6" />
          <text x={remBox[0].x - 4} y={remBox[0].y - 14} fontSize={22} fontWeight={800} fill={PLACE_STROKE.ones}>
            あまり
          </text>
        </g>
      )}
    </g>
  );
  const g = chosen !== null ? gridGeom(r, chosen) : null;
  const over = ok && g ? <rect x={g.x0 - 4} y={g.y0 - 4} width={answer * g.cell + 8} height={r * g.cell + 8} rx={10} fill="none" stroke={TILE.glow} strokeWidth={5} pointerEvents="none" /> : null;

  const prompt = ok
    ? s.numberLabels
      ? `1れつに ${answer} こずつ、あまりは ${rem}！`
      : 'ぴったり わけて、あまりも かぞえた！'
    : stage === 'rem'
      ? remPick !== null
        ? 'あまりの タイルを かぞえて、もう いちど えらんで みよう'
        : 'あまりは いくつ？ あまりの タイルを かぞえよう'
      : chosen !== null && !core.anim.busy
        ? leftOver > 0
          ? 'のこりで、どの れつにも もう 1こずつ ならべられるね。もどすか、ほかのを えらんで みよう'
          : 'あいた せきが あるね。もどすか、ほかのを えらんで みよう'
        : s.numberLabels
          ? `${n} この タイルを ${r} れつに おなじだけ ならべると、1れつ なんこ？`
          : 'タイルを みぎの れつに おなじだけ ならべると、1れつ なんこ？';

  return (
    <ModeLayout
      prompt={prompt}
      field={
        <div
          style={{ width: '100%' }}
          onClick={() => {
            if (pick.selected) void place(items.find((i) => i.key === pick.selected));
          }}
        >
          <TileField n={0} rows={1} tiles={tiles} s={s} glow={false} under={under} over={over} />
        </div>
      }
      tray={
        <ChoiceTray
          key={stage}
          items={items}
          selected={pick.selected}
          onTap={(it) => pick.toggle(it.key, it.value)}
          drag={s.inputMethod === 'drag'}
          snap={core.snap('array')}
          onDrop={(it) => void place(it)}
          demoKey={core.demo === 'pick' ? `${stage}-${target}` : null}
          disabled={ok}
        />
      }
    />
  );
}

function Task({ bridge }: { bridge: ModeBridge }) {
  const core = useTrialCore(bridge);
  const t = core.q.taskType;
  // 自由探索（ホームで「じゆうに あそぶ」を選んだとき）は E タイル・リアクターと同じ
  if (core.q.learningStage === 'explore') return <TileLab core={core} />;
  if (t === 'array_divide') return <DivideTask core={core} />;
  if (t === 'array_divide_rem') return <DivideRemTask core={core} />;
  return <CountTask core={core} task={t === 'array_split' ? 'array_split' : 'array_multiply'} />;
}

function View({ bridge }: { bridge: ModeBridge }) {
  const st = useBridge(bridge);
  if (!st.question) return null;
  return <Task key={st.qKey} bridge={bridge} />;
}

export const ArraysMode = createReactPlugin(
  {
    id: 'mode_l_arrays',
    title: 'タイルの かけわり',
    description:
      'タイルの配列で、掛け算（ぜんぶで いくつ）・割り算（r れつに ならべると 1れつ なんこ）・2けた×1けた（10の列と のこりの列）を選ぶ。違う数でも、その数を同じ れつ にならべた形を見せるだけ。E タイル・リアクターの盤を使い、E の自由探索は変えない。',
    // v2.13: あまりのある わりざんは、今の課題のあと
    supportedTasks: ['array_multiply', 'array_divide', 'array_split', 'array_divide_rem'],
    supportedStrategies: ['none'],
    stages: { array_multiply: ['construct'], array_divide: ['construct'], array_split: ['construct'], array_divide_rem: ['construct'] },
    group: 'core',
  },
  View,
);
