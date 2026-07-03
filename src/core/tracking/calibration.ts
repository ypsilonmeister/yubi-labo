import { LOGICAL_W, LOGICAL_H } from '../coords';
import { getSetting, setSetting } from '../storage/db';

// SPEC §4.2.2 — 5点キャリブレーション。カメラ正規化座標(u,v) → 論理座標(x,y) を
// アフィン変換で対応付ける。結果は settings に保存し、セッションを跨いで再利用。
// ※ サンプルは x ミラー反転後の座標で取得する前提（HandTracker と一貫）。
//
// 3点の厳密解だと、着座姿勢では指先の実際のカメラ画角内移動量が小さく
// なりがちで、サンプル3点がほぼ同じ座標に近いと変換行列の倍率が異常に
// 大きくなり（わずかな入力差が画面全体に引き伸ばされ）、結果としてカーソルが
// キャリブレーション点を結ぶ線分付近でしか動かない現象が起きる。
// 点数を増やし最小二乗フィットにすることで、外れ値1点の影響を減らし安定させる。

export interface CalibrationMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

// キャリブレーション標的（論理座標）: 右上・左下・中央・左上・右下
export const CALIB_TARGETS: Array<{ x: number; y: number }> = [
  { x: 1120, y: 160 },
  { x: 160, y: 640 },
  { x: 640, y: 400 },
  { x: 160, y: 160 },
  { x: 1120, y: 640 },
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

// N点（N>=3）の最小二乗フィット。x行・y行それぞれ正規方程式 (MᵀM)p = Mᵀr を
// 3x3 連立としてクラメルの公式で解く。全点がほぼ同一/共線（MᵀM が特異）なら例外。
export function solveAffine(
  samples: Array<{ cam: { x: number; y: number }; logical: { x: number; y: number } }>,
): CalibrationMatrix {
  if (samples.length < 3) {
    throw new Error('solveAffine requires at least 3 samples');
  }
  // 係数行列（同次項付き）: 各行 [u_i, v_i, 1]
  const M: [number, number, number][] = samples.map((s) => [s.cam.x, s.cam.y, 1]);
  const xr = samples.map((s) => s.logical.x);
  const yr = samples.map((s) => s.logical.y);

  // 正規方程式の係数 MᵀM（3x3）と MᵀX / MᵀY（3x1）
  const MtM: [number, number, number][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const MtX: [number, number, number] = [0, 0, 0];
  const MtY: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < M.length; i++) {
    const row = M[i];
    for (let r = 0; r < 3; r++) {
      MtX[r] += row[r] * xr[i];
      MtY[r] += row[r] * yr[i];
      for (let c = 0; c < 3; c++) {
        MtM[r][c] += row[r] * row[c];
      }
    }
  }

  const det = det3(MtM);
  if (Math.abs(det) < 1e-9) {
    throw new Error('calibration points are degenerate (normal-equation determinant ~ 0)');
  }
  const [a, b, c] = cramer(MtM, MtX, det);
  const [d, e, f] = cramer(MtM, MtY, det);
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
