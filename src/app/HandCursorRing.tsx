import { useEffect, useRef } from 'react';
import { getActiveHandSource } from '../core/input/inputProvider';
import type { PointerState } from '../core/input/PointerSource';

// SPEC §4.2.4 — ドウェル進捗リング。ゲームの上に重ねる入力フィードバックで、
// ゲームロジック側は一切関知しない（§4.1）。
export function HandCursorRing() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let subscribedTo: ReturnType<typeof getActiveHandSource> = null;
    let unsub: (() => void) | null = null;
    let last: PointerState | null = null;

    const loop = () => {
      const src = getActiveHandSource();
      if (src !== subscribedTo) {
        unsub?.();
        subscribedTo = src;
        last = null;
        unsub = src
          ? src.subscribe((s) => {
              last = s;
            })
          : null;
      }
      const el = ref.current;
      if (el) {
        const p = src?.getDwellProgress() ?? 0;
        if (src && last && p > 0.03) {
          el.style.display = 'block';
          el.style.transform = `translate(${last.x - 34}px, ${last.y - 34}px)`;
          el.style.background = `conic-gradient(rgba(180, 235, 190, 0.9) ${p * 360}deg, rgba(255, 255, 255, 0.1) 0deg)`;
        } else {
          el.style.display = 'none';
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      unsub?.();
    };
  }, []);

  return <div ref={ref} className="dwell-ring" aria-hidden="true" />;
}
