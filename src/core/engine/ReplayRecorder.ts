import type { ReplaySample } from '../storage/db';

// SPEC §4.5 — replay は30ms間隔に間引き、1プレイ最大2000サンプル。
const SAMPLE_INTERVAL_MS = 30;
const MAX_SAMPLES = 2000;

export class ReplayRecorder {
  private samples: ReplaySample[] = [];
  private startAt = 0;
  private lastAt = -Infinity;

  start(): void {
    this.samples = [];
    this.startAt = performance.now();
    this.lastAt = -Infinity;
  }

  record(x: number, y: number, active: boolean): void {
    const now = performance.now();
    if (now - this.lastAt < SAMPLE_INTERVAL_MS) return;
    if (this.samples.length >= MAX_SAMPLES) return;
    this.lastAt = now;
    this.samples.push({ t: Math.round(now - this.startAt), x, y, active });
  }

  finish(): ReplaySample[] {
    return this.samples;
  }
}
