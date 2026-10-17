// 音は初期OFF（§8.2）。ONでも、成功時のやわらかい単音だけを鳴らす。誤答の音は存在しない。

import type { AccessibilitySettings } from './types';

let ctx: AudioContext | null = null;

export function softChime(s: Readonly<AccessibilitySettings>) {
  if (!s.soundEnabled || s.quietMode || s.effectLevel === 'none') return;
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    const notes = s.effectLevel === 'normal' ? [660, 880] : [660];
    notes.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.12 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.5);
      o.connect(g).connect(ctx!.destination);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.55);
    });
  } catch {
    // 音が出せない環境でも何もしない（音なしで全課題が完了できる）
  }
}
