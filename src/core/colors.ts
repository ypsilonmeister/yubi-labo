import type { AccessibilitySettings } from './types';

type Scheme = AccessibilitySettings['colorScheme'];

// §4 案B の標準配色（キュイゼネール）
const CUISENAIRE: Record<number, string> = {
  1: '#f7f4ec',
  2: '#d9342b',
  3: '#8cc63f',
  4: '#e86aa6',
  5: '#f5c518',
  6: '#1f7a3a',
  7: '#2b2b2b',
  8: '#8b5a2b',
  9: '#2f6fd6',
  10: '#f08a24',
};

// 独自の共通配色: 隣り合う数の明度差を大きくとり、赤緑の対比に頼らない
const UNIFIED: Record<number, string> = {
  1: '#ffe9a8',
  2: '#4c7cf0',
  3: '#f2a33a',
  4: '#7a4fd1',
  5: '#2fb8a6',
  6: '#e0607e',
  7: '#355070',
  8: '#c9a227',
  9: '#5aa9e6',
  10: '#b5651d',
};

const MONO = '#7d93b2';

export function numberColor(n: number, scheme: Scheme): string {
  if (scheme === 'mono') return MONO;
  const table = scheme === 'cuisenaire' ? CUISENAIRE : UNIFIED;
  const k = n >= 1 && n <= 10 ? n : n > 10 ? 10 : 1;
  return table[k];
}

/** 色の上に描く文字・穴の色（明るい色なら暗く） */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#222';
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? '#3a3226' : '#fffaf0';
}

export const OUTLINE = '#4a4036';
export const SLOT_FILL = '#ece6da';
export const SLOT_STROKE = '#9c8f7c';
export const SLOT_STROKE_STRONG = '#3d342a';

// 実装拡張（v2.2）: 植物（ランク）と位取りの区画。数の色（numberColor）とは別系統で、数の手がかりにはしない
export const PLANT = { pot: '#c8794a', potRim: '#a85f36', soil: '#6b4a32', stem: '#4f8a3c', leaf: '#6dbb4a', leafDark: '#3f7f34', petal: '#f4a6c0', center: '#f6c343', fruit: '#e2574c', trunk: '#8b5a2b' };
/** 位取りの区画の背景（10の位・1の位）。D の両替と C の部屋で共通に使う */
export const PLACE_BG = { tens: '#dceaf7', ones: '#fdf0d5', machine: '#eef3e2' };
export const PLACE_STROKE = { tens: '#5b86b0', ones: '#c99a3e', machine: '#7f9a5a' };
/** v2.2: いろぼうの背景の目盛り（5のまとまりの帯・1ずつの線・5と10の線） */
export const ROD_GRID = { band: '#f1ead9', one: '#c9bca5', five: '#8c7c64' };
