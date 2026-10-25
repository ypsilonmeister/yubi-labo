// Mode E：タイル・リアクター（v2.3・§19.1）。自由探索のみ（決定点なし）。
// タイルをタップで入れ、「ならべるボタン（1〜6行）」をタップすると、列ごとに上から並び直す。
// 割り切れると欠けのない長方形（結晶）になって縁が光り、割り切れないと最後の列が欠ける（欠けた席は点線で残す）。
// 6行まで全部ためして、どれも長方形にならない数は「1列にしか並ばない特別な石（素数）」として図鑑に残る。
// 「スープ」の画面では、材料（たて）× トッピング（よこ）の組み合わせが格子に並ぶ（掛け算 = 長方形の面積）。
// 数字は出さない（かずで みる は自由探索では出ない）。演出は effectLevel を超えない。

import { useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore, type TrialCore } from '../kit/useTrialCore';
import { HistoryStrip, ModeLayout } from '../kit/ui';
import { OUTLINE, SOUP, TILE } from '../../core/colors';
import { isRectangle, primeFound, ROWS_MAX, TILE_MAX } from '../../core/math/tiles';
import { lerpPos, targets, TileField, type Pos } from '../shared/TileField';

/** 「k 行に ならべる」ボタンの絵（k 本の行。数字は書かない） */
function RowsIcon({ k }: { k: number }) {
  const c = 7;
  return (
    <svg width={3 * c + 4} height={k * c + 4} viewBox={`-2 -2 ${3 * c + 4} ${k * c + 4}`} aria-hidden>
      {Array.from({ length: k * 3 }, (_, i) => (
        <rect key={i} x={(i % 3) * c} y={Math.floor(i / 3) * c} width={c - 1.5} height={c - 1.5} rx={1} fill={TILE.fill} stroke={TILE.stroke} strokeWidth={0.8} />
      ))}
    </svg>
  );
}

function AddIcon({ k, minus }: { k: number; minus?: boolean }) {
  const c = 10;
  return (
    <svg width={k * (c + 2) + 18} height={c + 6} viewBox={`-2 -3 ${k * (c + 2) + 18} ${c + 6}`} aria-hidden>
      <text x={4} y={c} fontSize={16} fontWeight={800} textAnchor="middle" fill="#3a3226">
        {minus ? '−' : '+'}
      </text>
      {Array.from({ length: k }, (_, i) => (
        <rect key={i} x={12 + i * (c + 2)} y={0} width={c} height={c} rx={2} fill={TILE.fill} stroke={TILE.stroke} strokeWidth={1} opacity={minus ? 0.5 : 1} />
      ))}
    </svg>
  );
}

interface Snapshot {
  n: number;
  rows: number;
  tried: number[];
  history: number[];
}

function TileLab({ core }: { core: TrialCore }) {
  const s = core.settings;
  const [n, setN] = useState(6);
  const [rows, setRows] = useState(1);
  const [tried, setTried] = useState<number[]>([]);
  const [history, setHistory] = useState<number[]>([]); // この数で ためした行（縮小表示で残す）
  const [tiles, setTiles] = useState<Pos[]>(() => targets(6, 1));
  const [found, setFound] = useState<'rect' | 'prime' | null>(null);
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const prime = primeFound(n, tried);

  const move = async (nextN: number, nextRows: number) => {
    const from = tiles.slice(0, nextN);
    const to = targets(nextN, nextRows);
    await core.anim.run('arrange', () => core.anim.tween(520, (t) => setTiles(lerpPos(from, to, t))));
  };

  const remember = () => setUndoStack((u) => [...u, { n, rows, tried, history }].slice(-30));

  const add = async (k: number) => {
    if (core.anim.busy) return;
    const next = Math.max(0, Math.min(TILE_MAX, n + k));
    if (next === n) return;
    core.ctx.emit({ type: 'attempt', payload: { tiles: next } });
    remember();
    setN(next);
    setTried([]);
    setHistory([]);
    setFound(null);
    await move(next, rows);
  };

  const pickRows = async (r: number) => {
    if (core.anim.busy || n === 0) return;
    core.ctx.emit({ type: 'attempt', payload: { rows: r } });
    remember();
    setRows(r);
    const nextTried = tried.includes(r) ? tried : [...tried, r];
    setTried(nextTried);
    if (rows !== r) setHistory((h) => [...h.filter((x) => x !== rows), rows].slice(-5));
    await move(n, r);
    if (isRectangle(n, r)) {
      core.ctx.emit({ type: 'decision_made', payload: { rectangle: [r, n / r] } });
      core.ctx.craft(n, [r, n / r], 'product');
      setFound('rect');
    } else if (primeFound(n, nextTried)) {
      core.ctx.emit({ type: 'decision_made', payload: { prime: n } });
      core.ctx.craft(n, [n], 'prime');
      setFound('prime');
      // 特別な石は 1列にもどして見せる
      setRows(1);
      await core.anim.run('stone', () => core.anim.tween(600, (t) => setTiles(lerpPos(targets(n, r), targets(n, 1), t))));
    } else setFound(null);
  };

  core.onUndo(() => {
    if (core.anim.busy || !undoStack.length) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(undoStack.slice(0, -1));
    core.ctx.emit({ type: 'undo' });
    setN(last.n);
    setRows(last.rows);
    setTried(last.tried);
    setHistory(last.history);
    setFound(null);
    setTiles(targets(last.n, last.rows));
  });

  const prompt =
    found === 'prime'
      ? 'どう ならべても 1れつ… とくべつな いしが できた！'
      : found === 'rect'
        ? 'ぴったりの ながしかく！ ほかの ならべかたも ためして みよう'
        : n === 0
          ? 'タイルを いれて みよう'
          : 'ならべる ボタンで、ながしかくに なるか ためして みよう';

  return (
    <ModeLayout
      prompt={prompt}
      field={<TileField n={n} rows={rows} tiles={tiles} s={s} prime={prime && found === 'prime'} />}
      history={<HistoryStrip items={history.map((r) => ({ key: String(r), node: <TileField n={n} rows={r} tiles={targets(n, r)} s={s} thumb /> }))} />}
      tray={
        <div className="lab-tray">
          <div className="lab-row" role="group" aria-label="タイルを いれる">
            <button type="button" className="choice" onClick={() => void add(1)} disabled={n >= TILE_MAX} aria-label="1こ いれる">
              <AddIcon k={1} />
            </button>
            <button type="button" className="choice" onClick={() => void add(5)} disabled={n >= TILE_MAX} aria-label="5こ いれる">
              <AddIcon k={5} />
            </button>
            <button type="button" className="choice" onClick={() => void add(-1)} disabled={n <= 0} aria-label="1こ へらす">
              <AddIcon k={1} minus />
            </button>
          </div>
          <div className="lab-row" role="group" aria-label="ならべる">
            {Array.from({ length: ROWS_MAX }, (_, i) => i + 1).map((r) => (
              <button key={r} type="button" className={`choice${rows === r ? ' is-selected' : ''}${tried.includes(r) ? ' is-tried' : ''}`} onClick={() => void pickRows(r)} aria-pressed={rows === r} aria-label={`${r}れつに ならべる`}>
                <RowsIcon k={r} />
              </button>
            ))}
          </div>
        </div>
      }
    />
  );
}

// ---------- スープ（材料 × トッピング） ----------

function Topping({ k, x, y, r }: { k: number; x: number; y: number; r: number }) {
  const fill = '#fffaf0';
  if (k === 0) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      d += `${i ? 'L' : 'M'}${x + rr * Math.cos(a)} ${y + rr * Math.sin(a)}`;
    }
    return <path d={d + 'Z'} fill={fill} stroke={OUTLINE} strokeWidth={2} />;
  }
  if (k === 1) return <path d={`M${x + r * 0.3} ${y - r} A${r} ${r} 0 1 0 ${x + r * 0.3} ${y + r} A${r * 0.75} ${r * 0.75} 0 1 1 ${x + r * 0.3} ${y - r} Z`} fill={fill} stroke={OUTLINE} strokeWidth={2} />;
  if (k === 2)
    return (
      <g>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={x + Math.cos(a) * r * 0.6} y1={y + Math.sin(a) * r * 0.6} x2={x + Math.cos(a) * r} y2={y + Math.sin(a) * r} stroke={OUTLINE} strokeWidth={2} />;
        })}
        <circle cx={x} cy={y} r={r * 0.5} fill={fill} stroke={OUTLINE} strokeWidth={2} />
      </g>
    );
  return <path d={`M${x} ${y + r * 0.8} C${x - r * 1.3} ${y - r * 0.2} ${x - r * 0.5} ${y - r * 1.1} ${x} ${y - r * 0.35} C${x + r * 0.5} ${y - r * 1.1} ${x + r * 1.3} ${y - r * 0.2} ${x} ${y + r * 0.8} Z`} fill={fill} stroke={OUTLINE} strokeWidth={2} />;
}

/** 材料の液体。色だけでなく模様（なし・点・しま・なみ）でも見分けられるようにする */
function Liquid({ k, x, y, w, h, id }: { k: number; x: number; y: number; w: number; h: number; id: string }) {
  const L = SOUP.liquids[k];
  const clip = `soup-${id}`;
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <path d={`M${x} ${y} H${x + w} Q${x + w} ${y + h} ${x + w / 2} ${y + h} Q${x} ${y + h} ${x} ${y} Z`} />
        </clipPath>
      </defs>
      <path d={`M${x} ${y} H${x + w} Q${x + w} ${y + h} ${x + w / 2} ${y + h} Q${x} ${y + h} ${x} ${y} Z`} fill={L} stroke={OUTLINE} strokeWidth={2} />
      <g clipPath={`url(#${clip})`} stroke={OUTLINE} strokeWidth={1.5} fill={OUTLINE} opacity={0.45}>
        {k === 1 && Array.from({ length: 6 }, (_, i) => <circle key={i} cx={x + w * (0.15 + (i % 3) * 0.35)} cy={y + h * (0.3 + Math.floor(i / 3) * 0.35)} r={2.5} stroke="none" />)}
        {k === 2 && Array.from({ length: 5 }, (_, i) => <line key={i} x1={x + i * (w / 4)} y1={y} x2={x + i * (w / 4) - h} y2={y + h} />)}
        {k === 3 && [0.35, 0.7].map((f) => <path key={f} d={`M${x} ${y + h * f} q${w / 8} -6 ${w / 4} 0 t${w / 4} 0 t${w / 4} 0 t${w / 4} 0`} fill="none" />)}
      </g>
    </g>
  );
}

function Bowl({ liquid, topping, size, id }: { liquid: number; topping: number | null; size: number; id: string }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 100 80" aria-hidden>
      <Liquid k={liquid} x={8} y={22} w={84} h={50} id={id} />
      {topping !== null && <Topping k={topping} x={50} y={24} r={15} />}
    </svg>
  );
}

function SoupLab({ core }: { core: TrialCore }) {
  const [liq, setLiq] = useState<number[]>([0]);
  const [top, setTop] = useState<number[]>([0]);
  const toggle = (list: number[], set: (v: number[]) => void, k: number, kind: string) => {
    const next = list.includes(k) ? list.filter((x) => x !== k) : [...list, k].sort();
    core.ctx.emit({ type: 'attempt', payload: { [kind]: next } });
    set(next);
    const r = kind === 'liquid' ? next.length : liq.length;
    const c = kind === 'topping' ? next.length : top.length;
    if (r >= 2 && c >= 2) core.ctx.craft(r * c, [r, c], 'product');
  };
  const size = Math.min(110, 560 / Math.max(1, top.length + 1));
  return (
    <ModeLayout
      prompt="ざいりょうと トッピングを えらぶと、つくれる スープが ならぶよ"
      field={
        <div className="soup-grid" style={{ gridTemplateColumns: `auto repeat(${Math.max(1, top.length)}, auto)` }}>
          <span />
          {top.map((t) => (
            <span key={`h${t}`} className="soup-head">
              <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden>
                <Topping k={t} x={22} y={22} r={16} />
              </svg>
            </span>
          ))}
          {liq.map((l) => (
            <SoupRow key={l} l={l} top={top} size={size} />
          ))}
        </div>
      }
      tray={
        <div className="lab-tray">
          <div className="lab-row" role="group" aria-label="ざいりょう">
            {SOUP.liquids.map((_, k) => (
              <button key={k} type="button" className={`choice${liq.includes(k) ? ' is-selected' : ''}`} aria-pressed={liq.includes(k)} onClick={() => toggle(liq, setLiq, k, 'liquid')} aria-label="ざいりょう">
                <Bowl liquid={k} topping={null} size={64} id={`btn-l${k}`} />
              </button>
            ))}
          </div>
          <div className="lab-row" role="group" aria-label="トッピング">
            {[0, 1, 2, 3].map((k) => (
              <button key={k} type="button" className={`choice${top.includes(k) ? ' is-selected' : ''}`} aria-pressed={top.includes(k)} onClick={() => toggle(top, setTop, k, 'topping')} aria-label="トッピング">
                <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden>
                  <Topping k={k} x={22} y={22} r={16} />
                </svg>
              </button>
            ))}
          </div>
        </div>
      }
    />
  );
}

function SoupRow({ l, top, size }: { l: number; top: number[]; size: number }) {
  return (
    <>
      <span className="soup-head">
        <Bowl liquid={l} topping={null} size={56} id={`row-${l}`} />
      </span>
      {top.length ? top.map((t) => <Bowl key={t} liquid={l} topping={t} size={size} id={`c-${l}-${t}`} />) : <Bowl liquid={l} topping={null} size={size} id={`c-${l}`} />}
    </>
  );
}

// ---------- 切り替え ----------

function ExploreTask({ core }: { core: TrialCore }) {
  const [view, setView] = useState<'tiles' | 'soup'>('tiles');
  const body = view === 'tiles' ? <TileLab core={core} /> : <SoupLab core={core} />;
  return (
    <div className="lab">
      <div className="lab-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'tiles'} className={view === 'tiles' ? 'on' : ''} onClick={() => setView('tiles')}>
          <RowsIcon k={3} /> タイル
        </button>
        <button type="button" role="tab" aria-selected={view === 'soup'} className={view === 'soup' ? 'on' : ''} onClick={() => setView('soup')}>
          <Bowl liquid={1} topping={0} size={36} id="tab" /> スープ
        </button>
      </div>
      {body}
    </div>
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

export const TilesMode = createReactPlugin(
  {
    id: 'mode_e_tiles',
    title: 'タイル・リアクター',
    description: 'タイルを1〜6行に並べ直し、長方形（約数）と、1列にしか並ばない数（素数）を見つける。材料×トッピングの組み合わせ（掛け算）も格子で見る。自由探索のみ。',
    supportedTasks: ['arrays'],
    supportedStrategies: ['none'],
    stages: {},
    group: 'lab',
  },
  View,
);
