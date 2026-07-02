import type { PointerSource, PointerState } from './PointerSource';
import type { HandTracker, HandFrame } from '../tracking/HandTracker';
import { applyCalibration, type CalibrationMatrix } from '../tracking/calibration';
import { OneEuroFilter } from '../tracking/OneEuroFilter';
import { LOGICAL_W, LOGICAL_H } from '../coords';

// SPEC §4.2 — HandFrame → キャリブレーション → 1€フィルタ → 掴みジェスチャ判定
// → PointerState を発行。ゲームロジックは PointerSource しか知らない（§4.1）。

export type GestureMode = 'dwell' | 'pinch';

// §4.2.4 DWELL パラメータ（論理px / ms）
const DWELL_RADIUS = 30;
const DWELL_HOLD_MS = 800; // 静止で active=true
const DWELL_RELEASE_MS = 500; // 静止で active=false（ドロップ）

// §4.2.4 PINCH パラメータ（handScale 比、ヒステリシス）
const PINCH_ON_RATIO = 0.35;
const PINCH_OFF_RATIO = 0.55;

// §4.2.3 信頼度しきい値／§4.2.5 ロスト判定
const CONFIDENCE_MIN = 0.5;
const LOSS_MS = 500;

export class HandPointerSource implements PointerSource {
  readonly kind = 'hand';

  private readonly tracker: HandTracker;
  private readonly calib: CalibrationMatrix;
  private readonly mode: GestureMode;

  private readonly subs = new Set<(s: PointerState) => void>();
  private unsub: (() => void) | null = null;

  private readonly fx = new OneEuroFilter();
  private readonly fy = new OneEuroFilter();

  // 直近発行状態（低信頼/ロスト時はここへフォールバック＝ジャンプ禁止）
  private prev: PointerState = {
    x: LOGICAL_W / 2,
    y: LOGICAL_H / 2,
    active: false,
    confidence: 0,
    timestamp: 0,
  };

  private lastValidTime = 0;
  private lost = false;
  private hasPos = false;

  // --- DWELL 状態機械 ---
  private anchor = { x: 0, y: 0 };
  private anchorTime = 0;
  private exited = true; // アンカー半径外に出たか（連続再掴み防止）
  private dwellProgress = 0;

  // --- PINCH 状態 ---
  private pinchOn = false;

  constructor(tracker: HandTracker, calib: CalibrationMatrix, mode: GestureMode) {
    this.tracker = tracker;
    this.calib = calib;
    this.mode = mode;
  }

  // シェルがトラッカー本体を所有。ここは購読のみ管理。
  async start(): Promise<void> {
    if (this.unsub) return;
    this.unsub = this.tracker.subscribe((f) => this.onFrame(f));
  }

  stop(): void {
    this.unsub?.();
    this.unsub = null;
  }

  subscribe(cb: (s: PointerState) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  getDwellProgress(): number {
    return this.mode === 'dwell' ? this.dwellProgress : 0;
  }

  private onFrame(f: HandFrame | null): void {
    const now = performance.now();

    // フレーム欠落：ロスト猶予を判定。500ms 継続でドロップ＋フィルタ初期化。
    if (f === null) {
      if (!this.lost && now - this.lastValidTime >= LOSS_MS) {
        this.handleLoss();
      }
      this.emit({ ...this.prev, confidence: 0, timestamp: now });
      return;
    }

    // 低信頼：座標を更新せず前回位置を維持（§4.2.3）
    if (f.confidence < CONFIDENCE_MIN) {
      if (!this.lost && now - this.lastValidTime >= LOSS_MS) {
        this.handleLoss();
      }
      this.emit({ ...this.prev, confidence: f.confidence, timestamp: now });
      return;
    }

    // 有効フレーム。ロストから復帰した場合はフィルタが既に初期化済み。
    this.lastValidTime = now;
    this.lost = false;

    // カメラ座標 → 論理座標 → 軸ごとに 1€ フィルタ
    const mapped = applyCalibration(this.calib, f.indexTip.x, f.indexTip.y);
    const x = this.fx.filter(mapped.x, f.timestamp);
    const y = this.fy.filter(mapped.y, f.timestamp);

    if (!this.hasPos) {
      this.hasPos = true;
      this.anchor = { x, y };
      this.anchorTime = now;
      this.exited = true;
    }

    const active =
      this.mode === 'dwell'
        ? this.updateDwell(x, y, now)
        : this.updatePinch(f);

    this.emit({ x, y, active, confidence: f.confidence, timestamp: now });
  }

  // §4.2.5 ロスト：掴みを解除しフィルタ履歴を破棄（再取得時にスルーしない）
  private handleLoss(): void {
    this.lost = true;
    this.hasPos = false;
    this.fx.reset();
    this.fy.reset();
    this.dwellProgress = 0;
    this.exited = true;
    this.pinchOn = false;
    this.prev = { ...this.prev, active: false };
  }

  // §4.2.4-1 DWELL 状態機械
  private updateDwell(x: number, y: number, now: number): boolean {
    const dist = Math.hypot(x - this.anchor.x, y - this.anchor.y);
    if (dist > DWELL_RADIUS) {
      // 半径外へ移動：アンカー更新＆タイマ再始動、離脱フラグを立てる
      this.anchor = { x, y };
      this.anchorTime = now;
      this.exited = true;
    }

    if (!this.prev.active) {
      // 掴みチャージ中。ただし前回リリース後は一度半径外へ出る必要がある。
      if (this.exited) {
        this.dwellProgress = Math.min(1, (now - this.anchorTime) / DWELL_HOLD_MS);
        if (now - this.anchorTime >= DWELL_HOLD_MS) {
          this.anchorTime = now; // リリースタイマ用に再始動
          this.dwellProgress = 0;
          return true;
        }
      } else {
        this.dwellProgress = 0;
      }
      return false;
    }

    // 掴み中：移動は自由。静止 500ms でドロップ。
    this.dwellProgress = Math.min(1, (now - this.anchorTime) / DWELL_RELEASE_MS);
    if (now - this.anchorTime >= DWELL_RELEASE_MS) {
      this.dwellProgress = 0;
      this.exited = false; // 再掴みには半径外への離脱を要求
      this.anchorTime = now;
      return false;
    }
    return true;
  }

  // §4.2.4-2 PINCH（カメラ空間距離＋ヒステリシス）
  private updatePinch(f: HandFrame): boolean {
    const handScale = Math.hypot(
      f.wrist.x - f.middleMcp.x,
      f.wrist.y - f.middleMcp.y,
    );
    if (handScale <= 1e-6) return this.pinchOn; // スケール不定時は現状維持
    const pinch = Math.hypot(
      f.thumbTip.x - f.indexTip.x,
      f.thumbTip.y - f.indexTip.y,
    );
    const ratio = pinch / handScale;
    if (!this.pinchOn && ratio < PINCH_ON_RATIO) {
      this.pinchOn = true;
    } else if (this.pinchOn && ratio > PINCH_OFF_RATIO) {
      this.pinchOn = false;
    }
    return this.pinchOn;
  }

  private emit(s: PointerState): void {
    this.prev = s;
    this.subs.forEach((cb) => cb(s));
  }
}
