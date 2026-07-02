import { LOGICAL_W, LOGICAL_H } from '../coords';

// SPEC §4.1 — ゲームロジックは入力方式を区別してはならない
export interface PointerState {
  x: number;
  y: number; // 論理座標 (0-1280, 0-800)
  active: boolean; // 「押している/掴んでいる」状態
  confidence: number; // 0-1。マウス/タッチは常に1
  timestamp: number;
}

export interface PointerSource {
  readonly kind: 'mouse' | 'touch' | 'hand';
  subscribe(cb: (s: PointerState) => void): () => void;
  start(): Promise<void>;
  stop(): void;
}

// マウス/タッチ共通の Pointer Events 実装（ハンドは P3 で追加）
export class PointerEventSource implements PointerSource {
  readonly kind: 'mouse' | 'touch';
  private el: HTMLElement;
  private subs = new Set<(s: PointerState) => void>();
  private active = false;
  private abort: AbortController | null = null;

  constructor(el: HTMLElement, kind: 'mouse' | 'touch') {
    this.el = el;
    this.kind = kind;
  }

  async start(): Promise<void> {
    if (this.abort) return;
    this.abort = new AbortController();
    const opt = { signal: this.abort.signal };
    this.el.addEventListener(
      'pointerdown',
      (e) => {
        this.active = true;
        this.el.setPointerCapture(e.pointerId);
        this.emit(e);
      },
      opt,
    );
    this.el.addEventListener('pointermove', (e) => this.emit(e), opt);
    const release = (e: PointerEvent) => {
      this.active = false;
      this.emit(e);
    };
    this.el.addEventListener('pointerup', release, opt);
    this.el.addEventListener('pointercancel', release, opt);
  }

  stop(): void {
    this.abort?.abort();
    this.abort = null;
  }

  subscribe(cb: (s: PointerState) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private emit(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    const s: PointerState = {
      x: (e.clientX - r.left) * (LOGICAL_W / r.width),
      y: (e.clientY - r.top) * (LOGICAL_H / r.height),
      active: this.active,
      confidence: 1,
      timestamp: performance.now(),
    };
    this.subs.forEach((cb) => cb(s));
  }
}

export function detectPointerKind(): 'mouse' | 'touch' {
  return window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
}
