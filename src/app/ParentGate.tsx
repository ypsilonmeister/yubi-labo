// §8.4 保護者画面への入り口: 画面上の左右2隅を同時に長押し（計算は使わない）。
// マウスなど同時押しできない環境向けに「左上を長押し→3秒以内に右上を長押し」も受け付ける。
// これはセキュリティではなく誤操作防止。

import { useEffect, useRef, useState } from 'react';

const HOLD_MS = 1500;
const SEQ_WINDOW_MS = 3000;

export function ParentGate({ onOpen }: { onOpen: () => void }) {
  const held = useRef<{ L: number | null; R: number | null }>({ L: null, R: null });
  const leftDoneAt = useRef<number | null>(null);
  const [progress, setProgress] = useState<{ L: number; R: number }>({ L: 0, R: 0 });
  const raf = useRef<number | null>(null);

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);

  const loop = () => {
    const now = performance.now();
    const { L, R } = held.current;
    const pl = L ? Math.min(1, (now - L) / HOLD_MS) : 0;
    const pr = R ? Math.min(1, (now - R) / HOLD_MS) : 0;
    setProgress({ L: pl, R: pr });
    if (pl >= 1 && pr >= 1) return finish();
    if (pl >= 1 && !R) leftDoneAt.current = now;
    if (pr >= 1 && leftDoneAt.current && now - leftDoneAt.current < SEQ_WINDOW_MS + HOLD_MS) return finish();
    if (L || R) raf.current = requestAnimationFrame(loop);
    else raf.current = null;
  };
  const finish = () => {
    held.current = { L: null, R: null };
    leftDoneAt.current = null;
    setProgress({ L: 0, R: 0 });
    raf.current = null;
    onOpen();
  };
  const down = (side: 'L' | 'R') => (e: React.PointerEvent) => {
    e.preventDefault();
    held.current[side] = performance.now();
    if (!raf.current) raf.current = requestAnimationFrame(loop);
  };
  const up = (side: 'L' | 'R') => () => {
    held.current[side] = null;
  };
  return (
    <>
      {(['L', 'R'] as const).map((side) => (
        <div
          key={side}
          className={`gate-corner gate-${side}`}
          onPointerDown={down(side)}
          onPointerUp={up(side)}
          onPointerCancel={up(side)}
          onPointerLeave={up(side)}
          onContextMenu={(e) => e.preventDefault()}
          aria-hidden
        >
          {progress[side] > 0 && <div className="gate-progress" style={{ transform: `scale(${progress[side]})` }} />}
        </div>
      ))}
    </>
  );
}
