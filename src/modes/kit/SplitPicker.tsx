// 実装拡張（v2.2）: 「ちぎる位置」をタップする手札。
// むれ（スライム・コイン）を 2行の並び（A のプレート・10フレームと同じ並び）で大きく出し、
// j 番目をタップすると、はじめから j 番目までの k = j+1 個がちぎれて置き先へ吸い込まれる。
// 決定点は「いくつ入れるか」。違う数のときは、置いた先で はみ出す／すきまが残る ことで見える（§8.2）。

import { useRef, useState, type ReactNode } from 'react';
import { findDrop, flyTo, type Snap } from './snap';

interface Props {
  n: number;
  token: (i: number) => ReactNode;
  /** タップした瞬間（反応時間の記録用） */
  onSelect?: (k: number) => void;
  /** 飛び終わったあと（k 個を置く） */
  onPick: (k: number) => void;
  snap?: Snap;
  disabled?: boolean;
  /** ヒント L2: えらべる k を2つにしぼる */
  allowed?: number[] | null;
  /** ヒント L3: この k を示す */
  demoK?: number | null;
  label: string;
}

export function SplitPicker({ n, token, onSelect, onPick, snap, disabled, allowed, demoK, label }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [flying, setFlying] = useState<number | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const lit = flying ?? demoK ?? hover;
  const tap = async (j: number) => {
    if (disabled || flying !== null) return;
    const k = j + 1;
    onSelect?.(k);
    setFlying(k);
    const sources = refs.current.slice(0, k).filter((x): x is HTMLButtonElement => !!x);
    const fly = () => flyTo(sources, snap && sources[0] ? findDrop(sources[0], snap.to) : null, snap?.ms ?? 0);
    const ok = snap ? await snap.run(fly) : true;
    setFlying(null);
    setHover(null);
    if (ok) onPick(k);
  };
  return (
    <div className="split-picker" role="group" aria-label={label}>
      <div className="split-grid" style={{ gridTemplateColumns: `repeat(${Math.ceil(n / 2)}, auto)` }}>
        {Array.from({ length: n }, (_, j) => {
          const k = j + 1;
          const off = !!allowed && !allowed.includes(k);
          const on = lit !== null && k <= lit;
          return (
            <button
              key={j}
              ref={(el) => {
                refs.current[j] = el;
              }}
              type="button"
              className={`split-token${on ? ' is-lit' : ''}${demoK === k ? ' is-demo' : ''}${flying !== null && k <= flying ? ' is-flying' : ''}`}
              style={{ gridColumn: Math.floor(j / 2) + 1, gridRow: (j % 2) + 1 }}
              aria-label={`ここまで（${k}こ）`}
              disabled={disabled || off}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(j + 1)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(j + 1)}
              onBlur={() => setHover(null)}
              onClick={() => void tap(j)}
            >
              {token(j)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
