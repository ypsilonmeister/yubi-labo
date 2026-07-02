import {
  PointerEventSource,
  detectPointerKind,
  type PointerSource,
} from './PointerSource';

// 入力方式の切替点（SPEC §4.1 / §4.4.2）。
// ゲームは createPointerSource() だけを呼び、方式を一切知らない。
// ハンド側はバンドル分離のため動的 import で有効化される（App が factory を登録）。

export type InputMode = 'pointer' | 'hand';

export interface HandSourceLike extends PointerSource {
  getDwellProgress(): number; // ドウェルリング描画用（0-1）
}

let mode: InputMode = 'pointer';
let handFactory: (() => HandSourceLike) | null = null;
let activeHand: HandSourceLike | null = null;

export function enableHandMode(factory: () => HandSourceLike): void {
  handFactory = factory;
  mode = 'hand';
}

export function disableHandMode(): void {
  mode = 'pointer';
  handFactory = null;
  activeHand = null;
}

export function getInputMode(): InputMode {
  return mode;
}

export function createPointerSource(el: HTMLElement): PointerSource {
  if (mode === 'hand' && handFactory) {
    activeHand = handFactory();
    return activeHand;
  }
  return new PointerEventSource(el, detectPointerKind());
}

// シェルがドウェルリングを重ね描きするための参照
export function getActiveHandSource(): HandSourceLike | null {
  return mode === 'hand' ? activeHand : null;
}

export function currentInputKind(): 'mouse' | 'touch' | 'hand' {
  return mode === 'hand' ? 'hand' : detectPointerKind();
}
