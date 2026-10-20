// 実装拡張（v2.2）: ランクに合わせて育つ植物。level 0（たね）〜 9（もり）。
// v2.5: その先 10 おおきな もり → 11 もりの しま → 12 みどりの ほし → 13 ほしと つき → 14 ぎんが（宇宙が好きなので）
// 点滅・揺れはしない。育ったときだけ、effectLevel の範囲でふわっと切り替える（CSS 側）。

import { PLANT } from '../core/colors';

function Leaf({ x, y, size, flip, dark }: { x: number; y: number; size: number; flip?: boolean; dark?: boolean }) {
  const d = flip ? -1 : 1;
  return (
    <path
      d={`M${x} ${y} Q${x + d * size * 0.9} ${y - size * 0.9} ${x + d * size * 1.6} ${y - size * 0.2} Q${x + d * size * 0.8} ${y + size * 0.35} ${x} ${y} Z`}
      fill={dark ? PLANT.leafDark : PLANT.leaf}
      stroke={PLANT.leafDark}
      strokeWidth={2}
    />
  );
}

function Flower({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i * Math.PI) / 3;
        return <circle key={i} cx={x + Math.cos(a) * r} cy={y + Math.sin(a) * r} r={r * 0.75} fill={PLANT.petal} stroke="#d07a98" strokeWidth={1.5} />;
      })}
      <circle cx={x} cy={y} r={r * 0.7} fill={PLANT.center} stroke="#c99a1e" strokeWidth={1.5} />
    </g>
  );
}

function Tree({ x, base, h, crown }: { x: number; base: number; h: number; crown: number }) {
  return (
    <g>
      <path d={`M${x - crown * 0.14} ${base} L${x - crown * 0.08} ${base - h} L${x + crown * 0.08} ${base - h} L${x + crown * 0.14} ${base} Z`} fill={PLANT.trunk} stroke="#5e3b1c" strokeWidth={2} />
      <circle cx={x} cy={base - h - crown * 0.35} r={crown * 0.62} fill={PLANT.leaf} stroke={PLANT.leafDark} strokeWidth={2.5} />
      <circle cx={x - crown * 0.45} cy={base - h + crown * 0.05} r={crown * 0.42} fill={PLANT.leaf} stroke={PLANT.leafDark} strokeWidth={2.5} />
      <circle cx={x + crown * 0.45} cy={base - h + crown * 0.05} r={crown * 0.42} fill={PLANT.leaf} stroke={PLANT.leafDark} strokeWidth={2.5} />
    </g>
  );
}

export function Plant({ level, size = 160, label }: { level: number; size?: number; label?: string }) {
  const W = 200;
  const H = 220;
  const soil = 170;
  const lv = Math.max(0, Math.min(14, level));
  if (lv >= 10) return <Beyond lv={lv} size={size} label={label} />;
  const stemH = [0, 22, 40, 62, 82, 96, 104, 0, 0, 0][lv];
  const top = soil - stemH;
  return (
    <svg className="plant" width={size} height={(size * H) / W} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label ?? 'しょくぶつ'}>
      {lv <= 6 && (
        <g>
          {stemH > 0 && <path d={`M100 ${soil} C96 ${soil - stemH * 0.4} 104 ${soil - stemH * 0.7} 100 ${top}`} stroke={PLANT.stem} strokeWidth={6} fill="none" strokeLinecap="round" />}
          {lv >= 1 && <Leaf x={100} y={top + 4} size={lv === 1 ? 12 : 18} />}
          {lv >= 1 && <Leaf x={100} y={top + 4} size={lv === 1 ? 12 : 18} flip />}
          {lv >= 3 && <Leaf x={100} y={top + 34} size={22} dark />}
          {lv >= 3 && <Leaf x={100} y={top + 50} size={22} flip dark />}
          {lv >= 5 && <Leaf x={100} y={top + 70} size={20} />}
          {lv === 4 && <ellipse cx={100} cy={top - 8} rx={9} ry={13} fill={PLANT.petal} stroke="#d07a98" strokeWidth={2} />}
          {lv === 5 && <Flower x={100} y={top - 10} r={11} />}
          {lv === 6 && (
            <>
              <Flower x={100} y={top - 10} r={10} />
              <circle cx={78} cy={top + 30} r={9} fill={PLANT.fruit} stroke="#a33a31" strokeWidth={2} />
              <circle cx={124} cy={top + 46} r={9} fill={PLANT.fruit} stroke="#a33a31" strokeWidth={2} />
            </>
          )}
        </g>
      )}
      {lv === 7 && <Tree x={100} base={soil} h={60} crown={90} />}
      {lv === 8 && (
        <g>
          <Tree x={100} base={soil} h={72} crown={112} />
          <circle cx={70} cy={70} r={8} fill={PLANT.fruit} />
          <circle cx={128} cy={58} r={8} fill={PLANT.fruit} />
          <circle cx={104} cy={92} r={8} fill={PLANT.fruit} />
        </g>
      )}
      {lv === 9 && (
        <g>
          <Tree x={48} base={soil} h={40} crown={64} />
          <Tree x={152} base={soil} h={40} crown={64} />
          <Tree x={100} base={soil} h={66} crown={96} />
        </g>
      )}
      {/* はち */}
      <path d={`M48 ${soil} L60 ${H - 6} L140 ${H - 6} L152 ${soil} Z`} fill={PLANT.pot} stroke={PLANT.potRim} strokeWidth={3} />
      <rect x={42} y={soil - 8} width={116} height={16} rx={5} fill={PLANT.potRim} />
      <ellipse cx={100} cy={soil - 8} rx={54} ry={5} fill={PLANT.soil} />
      {lv === 0 && <ellipse cx={100} cy={soil - 18} rx={13} ry={9} fill="#a77b4f" stroke="#6b4a32" strokeWidth={2.5} />}
    </svg>
  );
}

/** 小さな星（5つの角） */
function Star({ x, y, r }: { x: number; y: number; r: number }) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += `${i ? 'L' : 'M'}${x + rr * Math.cos(a)} ${y + rr * Math.sin(a)}`;
  }
  return <path d={d + 'Z'} fill={PLANT.star} />;
}

/** 木の生えた みどりの星（中心 x, y、半径 r） */
function GreenPlanet({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={PLANT.planetSea} stroke="#2d5f93" strokeWidth={2.5} />
      <path d={`M${x - r * 0.8} ${y - r * 0.2} Q${x - r * 0.3} ${y - r * 0.75} ${x + r * 0.2} ${y - r * 0.35} Q${x + r * 0.7} ${y - r * 0.1} ${x + r * 0.55} ${y + r * 0.45} Q${x} ${y + r * 0.8} ${x - r * 0.5} ${y + r * 0.4} Z`} fill={PLANT.leaf} stroke={PLANT.leafDark} strokeWidth={2} />
      <Tree x={x - r * 0.1} base={y - r * 0.55} h={r * 0.22} crown={r * 0.42} />
      <Tree x={x + r * 0.35} base={y - r * 0.3} h={r * 0.18} crown={r * 0.34} />
    </g>
  );
}

/** もりの先のランク（10〜14） */
function Beyond({ lv, size, label }: { lv: number; size: number; label?: string }) {
  const W = 200;
  const H = 220;
  const space = lv >= 12;
  return (
    <svg className="plant" width={size} height={(size * H) / W} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label ?? 'しょくぶつ'}>
      {space && <rect x={4} y={4} width={W - 8} height={H - 8} rx={24} fill={PLANT.sky} />}
      {space &&
        [
          [30, 30],
          [170, 40],
          [40, 180],
          [160, 190],
          [100, 22],
          [20, 110],
          [182, 120],
        ].map(([x, y], i) => <Star key={i} x={x} y={y} r={i % 2 ? 4 : 6} />)}
      {lv === 10 && (
        <g>
          <ellipse cx={100} cy={176} rx={92} ry={14} fill={PLANT.leafDark} opacity={0.35} />
          <Tree x={36} base={168} h={34} crown={52} />
          <Tree x={164} base={168} h={34} crown={52} />
          <Tree x={68} base={176} h={52} crown={74} />
          <Tree x={132} base={176} h={52} crown={74} />
          <Tree x={100} base={184} h={72} crown={96} />
        </g>
      )}
      {lv === 11 && (
        <g>
          <ellipse cx={100} cy={176} rx={96} ry={30} fill={PLANT.sea} />
          <path d="M22 178 Q100 112 178 178 Z" fill={PLANT.leaf} stroke={PLANT.leafDark} strokeWidth={2.5} />
          <Tree x={64} base={160} h={30} crown={50} />
          <Tree x={136} base={160} h={30} crown={50} />
          <Tree x={100} base={148} h={48} crown={70} />
        </g>
      )}
      {lv === 12 && <GreenPlanet x={100} y={118} r={70} />}
      {lv === 13 && (
        <g>
          <GreenPlanet x={92} y={126} r={62} />
          <circle cx={164} cy={58} r={20} fill={PLANT.moon} stroke="#b9b29c" strokeWidth={2} />
          <circle cx={158} cy={52} r={4} fill="#cfc8b2" />
          <circle cx={170} cy={64} r={3} fill="#cfc8b2" />
        </g>
      )}
      {lv === 14 && (
        <g>
          {Array.from({ length: 60 }, (_, i) => {
            const arm = i % 2;
            const t = Math.floor(i / 2) / 30;
            const a = t * Math.PI * 3 + arm * Math.PI;
            const rr = 10 + t * 78;
            return <circle key={i} cx={100 + Math.cos(a) * rr} cy={112 + Math.sin(a) * rr * 0.62} r={1.6 + (1 - t) * 2.4} fill={PLANT.star} opacity={0.5 + (1 - t) * 0.5} />;
          })}
          <circle cx={100} cy={112} r={12} fill={PLANT.star} />
          <GreenPlanet x={150} y={168} r={26} />
        </g>
      )}
    </svg>
  );
}
