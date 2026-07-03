import { useEffect } from 'react';
import { createPointerSource, getInputMode } from '../core/input/inputProvider';
import type { PointerState } from '../core/input/PointerSource';
import { LOGICAL_W, LOGICAL_H } from '../core/coords';

// ホーム/はたけ/ぶんしずかん等、canvas を持たない <button> ベースの画面向け。
// マウス/タッチは既存の onClick がそのまま機能するため、ここではハンドモード
// （dwell/pinch）の時だけ PointerSource を購読し、active の立ち上がりエッジで
// カーソル位置の <button> をクリックする（§4.1: 画面ロジックは入力方式を区別しない）。
export function useNonGamePointerSelect(
  containerRef: React.RefObject<HTMLElement>,
  inputMode: 'pointer' | 'hand',
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || inputMode !== 'hand' || getInputMode() !== 'hand') return;

    const source = createPointerSource(container);
    let prevActive = false;
    let disposed = false;

    const unsub = source.subscribe((s: PointerState) => {
      if (disposed) return;
      const downEdge = s.active && !prevActive;
      prevActive = s.active;
      if (!downEdge) return;

      const rect = container.getBoundingClientRect();
      const clientX = rect.left + (s.x / LOGICAL_W) * rect.width;
      const clientY = rect.top + (s.y / LOGICAL_H) * rect.height;
      const el = document.elementFromPoint(clientX, clientY);
      const target = el?.closest('button');
      if (target && container.contains(target)) {
        (target as HTMLButtonElement).click();
      }
    });
    void source.start();

    return () => {
      disposed = true;
      unsub();
      source.stop();
    };
  }, [containerRef, inputMode]);
}
