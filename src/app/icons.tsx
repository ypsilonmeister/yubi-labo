// モード・課題のアイコン（色は colorScheme に従う）

import type { AccessibilitySettings, ModeId, TaskCategory } from '../core/types';
import { numberColor, OUTLINE } from '../core/colors';
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
