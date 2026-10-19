// v2.4: 場（field の SVG）が画面上で何倍に描かれているかを測る。
// 手札の棒・重りを、場にある棒と同じ長さ・太さで描くために使う（長さの違いを見比べやすくする）。

import { useLayoutEffect, useRef, useState } from 'react';

export function useFieldScale(viewW: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setScale(w / viewW);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewW]);
  return { ref, scale };
}
