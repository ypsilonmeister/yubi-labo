// SPEC §4.4.3 — セッションタイマー。ゲームプレイ中のみ減算。
// 0秒到達で強制中断はしない: onEnd は「終了リクエスト」であり、
// 現在のレベルをキリの良い所まで続けてから終了画面へ遷移させる。

export class SessionTimer {
  readonly totalMs: number;
  private remainingMs: number;
  private running = false;
  private lastTick = 0;
  private intervalId: number | null = null;
  private warned = false;
  private ended = false;
  private subs = new Set<(remainingMs: number, ratio: number) => void>();

  onWarn: (() => void) | null = null; // 残り60秒
  onEnd: (() => void) | null = null; // 0秒（終了リクエスト）

  constructor(totalMs: number) {
    this.totalMs = totalMs;
    this.remainingMs = totalMs;
  }

  start(): void {
    if (this.running || this.ended) return;
    this.running = true;
    this.lastTick = performance.now();
    this.intervalId = window.setInterval(() => this.tick(), 250);
  }

  pause(): void {
    if (this.running) this.tick();
    this.running = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // 「+2分」延長（1回のみ提示、原則5）
  extend(ms: number): void {
    this.remainingMs += ms;
    this.ended = false;
    this.warned = false;
  }

  subscribe(cb: (remainingMs: number, ratio: number) => void): () => void {
    this.subs.add(cb);
    cb(this.remainingMs, this.remainingMs / this.totalMs);
    return () => this.subs.delete(cb);
  }

  get isEnded(): boolean {
    return this.ended;
  }

  private tick(): void {
    if (!this.running) return;
    const now = performance.now();
    this.remainingMs = Math.max(0, this.remainingMs - (now - this.lastTick));
    this.lastTick = now;

    if (!this.warned && this.remainingMs <= 60_000) {
      this.warned = true;
      this.onWarn?.();
    }
    if (!this.ended && this.remainingMs <= 0) {
      this.ended = true;
      this.pause();
      this.onEnd?.();
    }
    this.subs.forEach((cb) => cb(this.remainingMs, this.remainingMs / this.totalMs));
  }
}
