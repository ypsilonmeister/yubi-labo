// v2.16（§9.11）式の読み上げ（任意・初期OFF）。Web Speech API の端末内（ローカル）音声だけを使う。
// 端末内の日本語の声がないときは何も読み上げない（既定の声は外部サーバー経由のことがあるので使わない）。

import type { AccessibilitySettings } from './types';

/** 「読み上げ」と「音」が ON で、静かなモードでないときだけ */
export function canReadAloud(s: Readonly<AccessibilitySettings>): boolean {
  return s.readAloud && s.soundEnabled && !s.quietMode;
}

export function pickLocalVoice<T extends { localService: boolean; lang: string }>(voices: readonly T[]): T | null {
  return voices.find((v) => v.localService === true && /^ja([-_]|$)/i.test(v.lang)) ?? null;
}

export function speechApi(): SpeechSynthesis | null {
  return typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined' ? null : speechSynthesis;
}

/** 読み上げたら true */
export function speak(text: string, s: Readonly<AccessibilitySettings>): boolean {
  if (!canReadAloud(s)) return false;
  try {
    const api = speechApi();
    const voice = api && pickLocalVoice(api.getVoices());
    if (!api || !voice) return false;
    api.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    api.speak(u);
    return true;
  } catch {
    // 読み上げできない環境でも何もしない（音なしで全課題が完了できる）
    return false;
  }
}

export function stopSpeaking() {
  speechApi()?.cancel();
}
