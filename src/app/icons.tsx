// モード・課題のアイコン（色は colorScheme に従う）

import type { AccessibilitySettings, ModeId, TaskCategory } from '../core/types';
import { numberColor, OUTLINE, TILE } from '../core/colors';
import { PlateCells, Silhouette } from '../modes/shared/Plate';
import { plateCells } from '../core/math/parity';

type S = Readonly<AccessibilitySettings>;

function Slime({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <g>
      <path d={`M${x - r} ${y + r * 0.6} Q${x - r} ${y - r} ${x} ${y - r} Q${x + r} ${y - r} ${x + r} ${y + r * 0.6} Z`} fill={color} stroke={OUTLINE} strokeWidth={2} />
      <circle cx={x - r * 0.35} cy={y - r * 0.1} r={r * 0.12} fill={OUTLINE} />
      <circle cx={x + r * 0.35} cy={y - r * 0.1} r={r * 0.12} fill={OUTLINE} />
    </g>
  );
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
            <Slime key={i} x={15 + Math.floor(i / 2) * 17.5} y={42 + (i % 2) * 18} r={7} color={c(8)} />
          ))}
        </>
      )}
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
        <Slime x={18} y={56} r={9} color={c(1)} />
        <text x={33} y={60} fontSize={14} fill="#3a3226">→</text>
        <Slime x={52} y={50} r={7} color={c(2)} />
        <Slime x={52} y={68} r={7} color={c(2)} />
        <text x={64} y={60} fontSize={14} fill="#3a3226">→</text>
        {[0, 1, 2, 3].map((i) => (
          <Slime key={i} x={84} y={34 + i * 14} r={5.5} color={c(4)} />
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
