import type { TimeOfDay } from './types';

const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');

/** オフセット付きISO8601（例: 2026-10-17T07:23:10+09:00） */
export function isoWithOffset(d: Date = new Date()): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

/** 端末のローカル時刻から時間帯を出す（境界は docs/SPEC.md §17） */
export function timeOfDayOf(d: Date = new Date()): TimeOfDay {
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 16) return 'midday';
  if (h >= 16 && h < 19) return 'evening';
  return 'night';
}

export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  morning: '朝',
  midday: '昼',
  evening: '夕方',
  night: '夜',
};

/** 日本標準時での表示（§11.3） */
export function formatJst(iso: string, withTime = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** 日本時間の日付キー（YYYY-MM-DD） */
export function jstDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  return j.toISOString().slice(0, 10);
}

export function uid(prefix = ''): string {
  const c = globalThis.crypto;
  const core = c && 'randomUUID' in c ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return prefix + core;
}
