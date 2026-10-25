// モード・課題のアイコン（色は colorScheme に従う）

import type { AccessibilitySettings, ModeId, TaskCategory } from '../core/types';
import { numberColor, OUTLINE, PLACE_BG, PLACE_STROKE, TILE } from '../core/colors';
import { PlateCells, Silhouette } from '../modes/shared/Plate';
import { plateCells } from '../core/math/parity';

type S = Readonly<AccessibilitySettings>;

/** 小さな四角いタイル（v2.4: スライムの形はやめた） */
function TileMark({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const side = r * 1.7;
  return <rect x={x - side / 2} y={y - side / 2} width={side} height={side} rx={side * 0.18} fill={color} stroke={OUTLINE} strokeWidth={1.5} />;
}

export function ModeIcon({ mode, s, size = 96 }: { mode: ModeId; s: S; size?: number }) {
  const c = (n: number) => numberColor(n, s.colorScheme);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      {mode === 'mode_a_parity' && (
        <>
          <g transform="translate(10 18)">
            <PlateCells cells={plateCells(7)} cell={16} color={c(7)} />
          </g>
          <g transform="translate(10 58)">
            <PlateCells cells={plateCells(6)} cell={16} color={c(6)} />
          </g>
        </>
      )}
      {mode === 'mode_b_rods' && (
        <>
          {[3, 5, 8].map((n, i) => (
            <rect key={n} x={8} y={18 + i * 24} width={n * 10.5} height={16} rx={3} fill={c(n)} stroke={OUTLINE} strokeWidth={2} />
          ))}
        </>
      )}
      {mode === 'mode_c_tenframe' && (
        <>
          <rect x={6} y={30} width={88} height={40} rx={5} fill="#fffaf0" stroke={OUTLINE} strokeWidth={2} />
          {Array.from({ length: 8 }, (_, i) => (
            <TileMark key={i} x={15 + Math.floor(i / 2) * 17.5} y={42 + (i % 2) * 18} r={7} color={c(8)} />
          ))}
        </>
      )}
      {mode === 'mode_i_halving' && <HalvingIcon />}
      {mode === 'mode_j_geoboard' && <GeoboardIcon />}
      {mode === 'mode_k_shapemake' && <GeoboardIcon triangle />}
      {mode === 'mode_l_arrays' && <ArraysIcon kind="split" />}
      {(mode === 'mode_e_tiles' || mode === 'mode_f_seesaw' || mode === 'mode_g_doubling' || mode === 'mode_h_trains') && <LabIcon mode={mode} c={c} />}
      {mode === 'mode_d_exchange' && (
        <>
          <polygon points="50,14 72,26 72,50 50,62 28,50 28,26" fill={c(10)} stroke={OUTLINE} strokeWidth={2} />
          <text x={50} y={44} textAnchor="middle" fontSize={16} fontWeight={700} fill="#3a3226">
            10
          </text>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <circle cx={24 + i * 26} cy={80} r={11} fill={c(1)} stroke={OUTLINE} strokeWidth={2} />
              <text x={24 + i * 26} y={85} textAnchor="middle" fontSize={12} fontWeight={700} fill="#3a3226">
                1
              </text>
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

/** v2.7 はんぶんチャレンジ: 千のかたまり・百の板・十の棒を、左右に同じだけ分けた形（色は使わない） */
function HalvingIcon() {
  const f = TILE.fill;
  const cube = (x: number, y: number) => (
    <g key={`c${x}`} stroke={OUTLINE} strokeWidth={1.5}>
      <path d={`M${x} ${y + 6} L${x + 6} ${y} L${x + 24} ${y} L${x + 18} ${y + 6} Z`} fill="#c4dcf0" />
      <path d={`M${x + 18} ${y + 6} L${x + 24} ${y} L${x + 24} ${y + 18} L${x + 18} ${y + 24} Z`} fill="#7fa9cc" />
      <rect x={x} y={y + 6} width={18} height={18} fill={f} />
    </g>
  );
  const side = (x0: number) => (
    <g>
      {cube(x0, 22)}
      <rect x={x0} y={54} width={18} height={18} rx={1} fill={f} stroke={OUTLINE} strokeWidth={1.5} />
      <rect x={x0 + 24} y={52} width={6} height={22} rx={1} fill={f} stroke={OUTLINE} strokeWidth={1.5} />
    </g>
  );
  return (
    <g>
      {side(8)}
      <line x1={50} x2={50} y1={16} y2={84} stroke={OUTLINE} strokeWidth={2} strokeDasharray="5 5" />
      {side(60)}
    </g>
  );
}

/** v2.8 ジオボード: 点のならびと、ゴムでつくった長方形と、まっすぐな かどの印（色は使わない） */
function GeoboardIcon({ triangle }: { triangle?: boolean }) {
  const dots = [0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3].map((j) => ({ x: 20 + i * 20, y: 20 + j * 20 })));
  return (
    <g>
      <rect x={8} y={8} width={84} height={84} rx={8} fill="#f6f1e6" stroke={OUTLINE} strokeWidth={2} />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={3} fill="#8c7c64" />
      ))}
      {triangle ? (
        <>
          <path d="M20 80 L60 80 L20 40 Z" fill={TILE.fill} fillOpacity={0.55} stroke={TILE.glow} strokeWidth={4} strokeLinejoin="round" />
          <path d="M20 72 h8 v8" fill="none" stroke={OUTLINE} strokeWidth={2} />
        </>
      ) : (
        <>
          <path d="M20 40 L60 40 L60 80 L20 80 Z" fill={TILE.fill} fillOpacity={0.55} stroke={TILE.glow} strokeWidth={4} strokeLinejoin="round" />
          <path d="M20 40 h8 v8 M60 40 v8 h-8" fill="none" stroke={OUTLINE} strokeWidth={2} />
        </>
      )}
    </g>
  );
}

/** v2.10 タイルの かけわり: 配列（かけざん）／左の山から右の れつへ（わりざん）／10の列と のこり（10と のこり） */
function ArraysIcon({ kind }: { kind: 'multiply' | 'divide' | 'split' }) {
  const tile = (x: number, y: number, k: string, size = 9) => <rect key={k} x={x} y={y} width={size} height={size} rx={1.5} fill={TILE.fill} stroke={TILE.stroke} strokeWidth={1} />;
  if (kind === 'multiply')
    return <g>{Array.from({ length: 12 }, (_, i) => tile(24 + (i % 4) * 13, 30 + Math.floor(i / 4) * 13, `m${i}`, 11))}</g>;
  if (kind === 'divide')
    return (
      <g>
        {Array.from({ length: 6 }, (_, i) => tile(8 + (i % 3) * 10, 40 + Math.floor(i / 3) * 10, `p${i}`))}
        <text x={46} y={54} fontSize={14} fill="#3a3226">→</text>
        {Array.from({ length: 6 }, (_, i) => tile(62 + Math.floor(i / 2) * 11, 36 + (i % 2) * 14, `g${i}`))}
      </g>
    );
  return (
    <g>
      <rect x={6} y={30} width={62} height={34} rx={4} fill={PLACE_BG.tens} stroke={PLACE_STROKE.tens} strokeWidth={1.5} />
      <rect x={70} y={30} width={24} height={34} rx={4} fill={PLACE_BG.ones} stroke={PLACE_STROKE.ones} strokeWidth={1.5} />
      {Array.from({ length: 30 }, (_, i) => tile(8 + Math.floor(i / 3) * 6, 33 + (i % 3) * 10, `t${i}`, 5))}
      {Array.from({ length: 9 }, (_, i) => tile(73 + Math.floor(i / 3) * 6.5, 33 + (i % 3) * 10, `o${i}`, 5))}
    </g>
  );
}

/** v2.3 じっけんラボのアイコン */
function LabIcon({ mode, c }: { mode: ModeId; c: (n: number) => string }) {
  if (mode === 'mode_e_tiles')
    return (
      <g>
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={20 + (i % 4) * 15} y={26 + Math.floor(i / 4) * 15} width={14} height={14} rx={2} fill={TILE.fill} stroke={OUTLINE} strokeWidth={1.5} />
        ))}
        <rect x={18} y={24} width={64} height={49} rx={4} fill="none" stroke={TILE.glow} strokeWidth={3} />
      </g>
    );
  if (mode === 'mode_f_seesaw')
    return (
      <g>
        <path d="M50 58 L40 84 L60 84 Z" fill="#c9bca5" stroke={OUTLINE} strokeWidth={2} />
        <rect x={10} y={52} width={80} height={6} rx={3} fill="#8c7c64" stroke={OUTLINE} strokeWidth={1.5} />
        <rect x={14} y={38} width={8 * 3.4} height={12} rx={2} fill={c(8)} stroke={OUTLINE} strokeWidth={1.5} />
        <rect x={56} y={38} width={5 * 3.4} height={12} rx={2} fill={c(5)} stroke={OUTLINE} strokeWidth={1.5} />
        <rect x={56} y={24} width={3 * 3.4} height={12} rx={2} fill={c(3)} stroke={OUTLINE} strokeWidth={1.5} />
      </g>
    );
  if (mode === 'mode_g_doubling')
    return (
      <g>
        <TileMark x={18} y={56} r={9} color={c(1)} />
        <text x={33} y={60} fontSize={14} fill="#3a3226">→</text>
        <TileMark x={52} y={50} r={7} color={c(2)} />
        <TileMark x={52} y={68} r={7} color={c(2)} />
        <text x={64} y={60} fontSize={14} fill="#3a3226">→</text>
        {[0, 1, 2, 3].map((i) => (
          <TileMark key={i} x={84} y={34 + i * 14} r={5.5} color={c(4)} />
        ))}
      </g>
    );
  return (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <rect key={`a${i}`} x={8 + i * 21} y={34} width={20} height={11} rx={2} fill={c(3)} stroke={OUTLINE} strokeWidth={1.5} />
      ))}
      {[0, 1, 2].map((i) => (
        <rect key={`b${i}`} x={8 + i * 28} y={52} width={27} height={11} rx={2} fill={c(4)} stroke={OUTLINE} strokeWidth={1.5} />
      ))}
      <line x1={92} x2={92} y1={26} y2={72} stroke={TILE.glow} strokeWidth={3} />
    </g>
  );
}

export function TaskIcon({ task, s, size = 72 }: { task: TaskCategory; s: S; size?: number }) {
  const c = (n: number) => numberColor(n, s.colorScheme);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      {task === 'subitizing_678' && (
        <g transform="translate(18 30)">
          <Silhouette cells={plateCells(7)} cell={16} />
        </g>
      )}
      {task === 'numeral_quantity' && (
        <>
          <text x={24} y={66} textAnchor="middle" fontSize={44} fontWeight={700} fill="#3a3226">
            7
          </text>
          <g transform="translate(46 34)">
            <PlateCells cells={plateCells(7)} cell={12} color={c(7)} />
          </g>
        </>
      )}
      {task === 'synthesis_5' && (
        <>
          <g transform="translate(10 34)">
            <PlateCells cells={plateCells(2)} cell={14} color={c(2)} />
          </g>
          <text x={44} y={58} fontSize={20} fill="#3a3226">
            +
          </text>
          <g transform="translate(60 34)">
            <PlateCells cells={plateCells(3)} cell={14} color={c(3)} />
          </g>
        </>
      )}
      {task === 'complement_10' && (
        <g transform="translate(10 30)">
          <Silhouette cells={plateCells(10)} cell={16} />
          <PlateCells cells={plateCells(8)} cell={16} color={c(8)} />
        </g>
      )}
      {task === 'carry_over' && (
        <>
          <g transform="translate(4 30)">
            <PlateCells cells={plateCells(10)} cell={13} color={c(10)} />
          </g>
          <g transform="translate(74 30)">
            <PlateCells cells={plateCells(3)} cell={13} color={c(3)} />
          </g>
        </>
      )}
      {task === 'balance' && <LabIcon mode="mode_f_seesaw" c={c} />}
      {task === 'arrays' && <LabIcon mode="mode_e_tiles" c={c} />}
      {task === 'doubling' && <LabIcon mode="mode_g_doubling" c={c} />}
      {task === 'period' && <LabIcon mode="mode_h_trains" c={c} />}
      {task === 'halving' && <HalvingIcon />}
      {(task === 'shapes' || task === 'shape_right' || task === 'shape_rectangle') && <GeoboardIcon />}
      {task === 'shape_triangle' && <GeoboardIcon triangle />}
      {task === 'array_multiply' && <ArraysIcon kind="multiply" />}
      {task === 'array_divide' && <ArraysIcon kind="divide" />}
      {task === 'array_split' && <ArraysIcon kind="split" />}
      {task === 'borrow' && (
        <>
          <g transform="translate(4 18)">
            <PlateCells cells={plateCells(5)} cell={13} color={c(5)} />
          </g>
          <g transform="translate(48 18)" opacity={0.35}>
            <PlateCells cells={plateCells(5)} cell={13} color={c(5)} />
          </g>
          <g transform="translate(4 58)">
            <PlateCells cells={plateCells(3)} cell={13} color={c(3)} />
          </g>
        </>
      )}
    </svg>
  );
}
