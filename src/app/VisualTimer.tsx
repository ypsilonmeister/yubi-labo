// SPEC §4.4.2 — 残り時間の視覚タイマー。円が欠けていく。数字は出さない。
export function VisualTimer({ ratio, blink }: { ratio: number; blink: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg
      className={`visual-timer${blink ? ' blink' : ''}`}
      width="64"
      height="64"
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="rgba(255,214,110,0.85)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, ratio)))}
        transform="rotate(-90 32 32)"
      />
    </svg>
  );
}
