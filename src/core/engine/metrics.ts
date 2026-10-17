import type { GameEvent, GameEventType, Trial } from '../types';

// §11.2 指標の定義。時間はすべて「入力可能・ポーズなし・表示中」の区間だけを数える

export const INPUT_EVENTS: GameEventType[] = [
  'item_selected',
  'item_deselected',
  'attempt',
  'undo',
  'prediction_made',
  'decision_made',
  'hint_requested',
];

export interface TrialMetrics {
  firstActionLatencyMs: number | null;
  activeInteractionMs: number;
  animationDurationMs: number;
  idleDurationMs: number;
}

export function computeMetrics(events: GameEvent[], idleThresholdMs: number): TrialMetrics {
  const evs = events.slice().sort((x, y) => x.timestampMs - y.timestampMs);
  let enabled = false;
  let paused = false;
  let hidden = false;
  let lastT: number | null = null;
  let active = 0;
  let firstEnabledActive: number | null = null;
  let firstAction: number | null = null;
  let animStart: number | null = null;
  let animTotal = 0;
  let lastInputActive: number | null = null;
  let idle = 0;
  let animHidden = 0;
  let hiddenSince: number | null = null;

  const countsNow = () => enabled && !paused && !hidden;
  const closeIdleGap = (nowActive: number) => {
    if (lastInputActive !== null) {
      const gap = nowActive - lastInputActive;
      if (gap > idleThresholdMs) idle += gap;
    }
  };

  for (const e of evs) {
    if (lastT !== null && countsNow()) active += e.timestampMs - lastT;
    lastT = e.timestampMs;
    switch (e.type) {
      case 'input_enabled':
        if (!enabled) {
          enabled = true;
          if (firstEnabledActive === null) firstEnabledActive = active;
          // 入力可能になった時点から無操作を測りはじめる
          if (lastInputActive === null) lastInputActive = active;
        }
        break;
      case 'input_disabled':
        if (enabled) {
          closeIdleGap(active);
          lastInputActive = null;
        }
        enabled = false;
        break;
      case 'paused':
        paused = true;
        break;
      case 'resumed':
        paused = false;
        break;
      case 'visibility_hidden':
        if (!hidden) hiddenSince = e.timestampMs;
        hidden = true;
        break;
      case 'visibility_visible':
        if (hidden && hiddenSince !== null && animStart !== null) animHidden += e.timestampMs - hiddenSince;
        hidden = false;
        hiddenSince = null;
        break;
      case 'animation_started':
        if (animStart === null) {
          animStart = e.timestampMs;
          animHidden = 0;
        }
        break;
      case 'animation_ended':
        if (animStart !== null) animTotal += Math.max(0, e.timestampMs - animStart - animHidden);
        animStart = null;
        break;
      case 'completed':
      case 'skipped':
      case 'abandoned':
        if (enabled) closeIdleGap(active);
        enabled = false;
        lastInputActive = null;
        break;
      default:
        break;
    }
    if (INPUT_EVENTS.includes(e.type)) {
      if (firstAction === null && firstEnabledActive !== null) firstAction = active - firstEnabledActive;
      if (enabled) {
        closeIdleGap(active);
        lastInputActive = active;
      }
    }
  }
  return {
    firstActionLatencyMs: firstAction,
    activeInteractionMs: Math.round(active),
    animationDurationMs: Math.round(animTotal),
    idleDurationMs: Math.round(idle),
  };
}

export function trialMetrics(t: Trial, idleThresholdMs: number): TrialMetrics {
  return computeMetrics(t.events, idleThresholdMs);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
