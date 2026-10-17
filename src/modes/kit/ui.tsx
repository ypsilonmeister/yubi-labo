import type { ReactNode } from 'react';
import { effectiveEffect, motionReduced } from '../../core/settings';
import type { AccessibilitySettings } from '../../core/types';

export function ModeLayout(props: { prompt?: ReactNode; field: ReactNode; history?: ReactNode; tray?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mode">
      {props.prompt && <div className="mode-prompt">{props.prompt}</div>}
      <div className="mode-field">{props.field}</div>
      {props.history}
      {props.aside}
      {props.tray && <div className="mode-tray">{props.tray}</div>}
    </div>
  );
}

/** §8.3: 分解・合体の各段階を1つずつ表示し、直前の状態を縮小表示で残す */
export function HistoryStrip({ items }: { items: { key: string; node: ReactNode }[] }) {
  if (!items.length) return null;
  return (
    <div className="history" aria-label="まえの ようす">
      {items.map((it, i) => (
        <div key={it.key} className="history-item">
          {i > 0 && <span className="history-arrow" aria-hidden>→</span>}
          <div className="history-thumb">{it.node}</div>
        </div>
      ))}
    </div>
  );
}

/** 成功演出（effectLevel を超えない。§8.2） */
export function successClass(s: Readonly<AccessibilitySettings>, on: boolean): string {
  if (!on) return '';
  const lvl = effectiveEffect(s);
  if (lvl === 'none') return '';
  return lvl === 'normal' ? 'fx-glow-normal' : 'fx-glow-calm';
}

/** normal のときだけ、小さな星を1回だけ出す（繰り返さない・強めない） */
export function Sparkles({ s, on, x, y, w }: { s: Readonly<AccessibilitySettings>; on: boolean; x: number; y: number; w: number }) {
  if (!on || effectiveEffect(s) !== 'normal' || motionReduced(s)) return null;
  const pts = [0.1, 0.5, 0.9].map((f, i) => ({ cx: x + w * f, cy: y - 18 - (i % 2) * 14 }));
  return (
    <g className="sparkles" aria-hidden>
      {pts.map((p, i) => (
        <path
          key={i}
          d={`M${p.cx} ${p.cy - 10} L${p.cx + 3} ${p.cy - 3} L${p.cx + 10} ${p.cy} L${p.cx + 3} ${p.cy + 3} L${p.cx} ${p.cy + 10} L${p.cx - 3} ${p.cy + 3} L${p.cx - 10} ${p.cy} L${p.cx - 3} ${p.cy - 3} Z`}
          fill="#f6c343"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </g>
  );
}

/** 観察段階のステップ操作（つぎ／まえ）。判定はしない */
export function StepControls(props: { index: number; count: number; onNext: () => void; onPrev: () => void; disabled?: boolean }) {
  const last = props.index >= props.count - 1;
  return (
    <div className="step-controls">
      <button type="button" className="btn-soft" onClick={props.onPrev} disabled={props.disabled || props.index === 0} aria-label="まえの ようす">
        ◀ まえ
      </button>
      <span className="step-dots" aria-hidden>
        {Array.from({ length: props.count }, (_, i) => (
          <span key={i} className={i <= props.index ? 'dot on' : 'dot'} />
        ))}
      </span>
      <button type="button" className="btn-soft" onClick={props.onNext} disabled={props.disabled} aria-label={last ? 'みおわった' : 'つぎの ようす'}>
        {last ? 'みた！' : 'つぎ ▶'}
      </button>
    </div>
  );
}

export const transition = (ms: number) => (ms > 0 ? `transform ${ms}ms ease-in-out, opacity ${ms}ms ease` : 'none');
