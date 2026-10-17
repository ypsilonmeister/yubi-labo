// 分解・合体の演出を段階ごとに進める。
// - アニメーション中は input_disabled（§8.1: 操作不能時間を反応時間から除く）
// - ポーズ中は次の段階へ進まない（途中停止）
// - 速さ設定・動き軽減を反映。動きを止めた場合も、状態は1つずつ切り替えて見せる

import type { ModeBridge } from './bridge';
import { durationFactor } from '../../core/settings';

class Cancelled extends Error {}

/** 動き軽減時に、状態を切り替えてから次へ進むまでの最短の間 */
const STILL_HOLD_MS = 450;

export class Animator {
  private alive = true;
  busy = false;
  constructor(private bridge: ModeBridge) {}

  cancel() {
    this.alive = false;
  }

  /** StrictMode などで一度外れて付け直されたとき用 */
  revive() {
    this.alive = true;
  }

  factor(): number {
    return durationFactor(this.bridge.state.settings);
  }

  /** CSS transition に渡す時間 */
  ms(base: number): number {
    return Math.round(base * this.factor());
  }

  async wait(base: number): Promise<void> {
    const total = this.factor() === 0 ? STILL_HOLD_MS : base * this.factor();
    let left = total;
    let last = performance.now();
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (!this.alive) return reject(new Cancelled());
        const now = performance.now();
        if (!this.bridge.state.paused && !document.hidden) left -= now - last;
        last = now;
        if (left <= 0) resolve();
        else setTimeout(tick, Math.min(50, Math.max(10, left)));
      };
      setTimeout(tick, Math.min(50, total));
    });
  }

  /**
   * 0→1 の補間を毎フレーム渡す。ポーズ中・非表示中は時間が進まない。
   * 動き軽減時は途中を飛ばして最終状態にし、少し間をおく。
   */
  async tween(base: number, onFrame: (t: number) => void): Promise<void> {
    if (this.factor() === 0) {
      onFrame(1);
      await this.wait(0);
      return;
    }
    const total = base * this.factor();
    let elapsed = 0;
    let last = performance.now();
    await new Promise<void>((resolve, reject) => {
      const frame = (now: number) => {
        if (!this.alive) return reject(new Cancelled());
        if (!this.bridge.state.paused && !document.hidden) elapsed += now - last;
        last = now;
        const t = Math.min(1, elapsed / total);
        onFrame(t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
        if (t >= 1) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  /**
   * 一連の演出を実行する。終わったら input_enabled を出す（keepDisabled なら出さない）。
   * 取り消された（View が外れた）ときは何もせず終わる。
   */
  async run(name: string, body: () => Promise<void>, opts: { keepDisabled?: boolean } = {}): Promise<boolean> {
    const ctx = this.bridge.ctx;
    this.busy = true;
    ctx.emit({ type: 'input_disabled', payload: { reason: name } });
    ctx.emit({ type: 'animation_started', payload: { name } });
    try {
      await body();
    } catch (e) {
      if (e instanceof Cancelled) return false;
      throw e;
    } finally {
      this.busy = false;
    }
    ctx.emit({ type: 'animation_ended', payload: { name } });
    if (!opts.keepDisabled) ctx.emit({ type: 'input_enabled' });
    return true;
  }
}
