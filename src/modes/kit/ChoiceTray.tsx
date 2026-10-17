// 手札（選択肢）。標準はタップで選ぶ→置き先をタップ（§8.1）。
// inputMethod が drag のときは、置き先へドラッグして離しても置ける（タップも引き続き使える）。

import { useRef, useState, type ReactNode } from 'react';

export interface ChoiceItem {
  key: string;
  value: number;
  /** 読み上げ用の説明（スクリーンリーダー） */
  label: string;
  node: ReactNode;
  disabled?: boolean;
}

interface Props {
  items: ChoiceItem[];
  selected: string | null;
  onTap: (item: ChoiceItem) => void;
  drag?: boolean;
  onDrop?: (item: ChoiceItem, dropId: string) => void;
  /** L3 実演中に示す選択肢 */
  demoKey?: string | null;
  disabled?: boolean;
}

export function ChoiceTray({ items, selected, onTap, drag, onDrop, demoKey, disabled }: Props) {
  const [ghost, setGhost] = useState<{ item: ChoiceItem; x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; id: number; item: ChoiceItem; moved: boolean } | null>(null);

  const down = (e: React.PointerEvent, item: ChoiceItem) => {
    if (!drag || disabled || item.disabled) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, item, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const st = start.current;
    if (!st || st.id !== e.pointerId) return;
    if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) st.moved = true;
    if (st.moved) setGhost({ item: st.item, x: e.clientX, y: e.clientY });
  };
  const up = (e: React.PointerEvent) => {
    const st = start.current;
    start.current = null;
    setGhost(null);
    if (!st || !st.moved) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const drop = el?.closest('[data-drop]')?.getAttribute('data-drop');
    if (drop && onDrop) onDrop(st.item, drop);
  };

  return (
    <div className="choice-tray" role="group">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          className={`choice${selected === it.key ? ' is-selected' : ''}${demoKey === it.key ? ' is-demo' : ''}`}
          aria-pressed={selected === it.key}
          aria-label={it.label}
          disabled={disabled || it.disabled}
          onClick={() => {
            if (start.current?.moved) return;
            onTap(it);
          }}
          onPointerDown={(e) => down(e, it)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => {
            start.current = null;
            setGhost(null);
          }}
        >
          {it.node}
        </button>
      ))}
      {ghost && (
        <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden>
          {ghost.item.node}
        </div>
      )}
    </div>
  );
}
