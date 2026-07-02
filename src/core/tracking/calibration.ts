import { LOGICAL_W, LOGICAL_H } from '../coords';
import { getSetting, setSetting } from '../storage/db';

// SPEC §4.2.2 — 3点キャリブレーション。カメラ正規化座標(u,v) → 論理座標(x,y) を
// アフィン変換で対応付ける。結果は settings に保存し、セッションを跨いで再利用。
// ※ サンプルは x ミラー反転後の座標で取得する前提（HandTracker と一貫）。

export interface CalibrationMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

// キャリブレーション標的（論理座標）: 右上・左下・中央
export const CALIB_TARGETS: [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
] = [
  { x: 1120, y: 160 },
  { x: 160, y: 640 },
  { x: 640, y: 400 },
];

const SETTING_KEY = 'hand.calibration';

// x = a*u + b*v + c / y = d*u + e*v + f
export function applyCalibration(
  m: CalibrationMatrix,
  u: number,
  v: number,
): { x: number; y: number } {
  const x = m.a * u + m.b * v + m.c;
  const y = m.d * u + m.e * v + m.f;
  return {
    x: clamp(x, 0, LOGICAL_W),
    y: clamp(y, 0, LOGICAL_H),
  };
}

// 素のスケール変換（キャリブ未実施時のフォールバック）
export function defaultCalibration(): CalibrationMatrix {
  return { a: LOGICAL_W, b: 0, c: 0, d: 0, e: LOGICAL_H, f: 0 };
}

// 3点の厳密解。x 行・y 行それぞれ 3×3 連立をクラメルの公式で解く。
// 3点が共線（行列式≈0）なら例外。
export function solveAffine(
  samples: Array<{ cam: { x: number; y: number }; logical: { x: number; y: number } }>,
): CalibrationMatrix {
  if (samples.length !== 3) {
    throw new Error('solveAffine requires exactly 3 samples');
  }
  const [s0, s1, s2] = samples;
  // 係数行列（同次項付き）: [[u0,v0,1],[u1,v1,1],[u2,v2,1]]
  const M: [number, number, number][] = [
    [s0.cam.x, s0.cam.y, 1],
    [s1.cam.x, s1.cam.y, 1],
    [s2.cam.x, s2.cam.y, 1],
  ];
  const det = det3(M);
  if (Math.abs(det) < 1e-9) {
    throw new Error('calibration points are collinear (determinant ~ 0)');
  }
  const xr = [s0.logical.x, s1.logical.x, s2.logical.x];
  const yr = [s0.logical.y, s1.logical.y, s2.logical.y];
  const [a, b, c] = cramer(M, xr, det);
  const [d, e, f] = cramer(M, yr, det);
  return { a, b, c, d, e, f };
}

export async function loadCalibration(): Promise<CalibrationMatrix | null> {
  const v = await getSetting<CalibrationMatrix | null>(SETTING_KEY, null);
  return v;
}

export async function saveCalibration(m: CalibrationMatrix): Promise<void> {
  await setSetting(SETTING_KEY, m);
}

// --- 内部ヘルパ ---

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function det3(m: [number, number, number][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

// クラメルの公式で M·[p,q,r]^T = rhs を解く
function cramer(
  M: [number, number, number][],
  rhs: number[],
  det: number,
): [number, number, number] {
  const col = (i: number): [number, number, number] => {
    const cp: [number, number, number][] = [
      [...M[0]],
      [...M[1]],
      [...M[2]],
    ];
    cp[0][i] = rhs[0];
    cp[1][i] = rhs[1];
    cp[2][i] = rhs[2];
    return [det3(cp) / det, 0, 0] as [number, number, number];
  };
  return [col(0)[0], col(1)[0], col(2)[0]];
}
