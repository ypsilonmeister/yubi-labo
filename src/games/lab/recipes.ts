import { KANJI_ENTRIES } from '../kanji/data';
import rawJukugo from '../../data/jukugo.json';
import type { KanjiEntry } from '../kanji/types';

// SPEC §12.7 ごうせいラボのレシピ。パーツ・マルチセット → 漢字、漢字・マルチセット → 熟語。

export interface JukugoEntry {
  chars: string[];
  word: string;
  story: string;
}

export const JUKUGO_ENTRIES: JukugoEntry[] = rawJukugo as JukugoEntry[];

function multisetKey(glyphs: string[]): string {
  return [...glyphs].sort().join('+');
}

// パーツ構成 → 漢字（labOnly 含む発見対象）
export const KANJI_BY_PARTS = new Map<string, KanjiEntry>();
for (const e of KANJI_ENTRIES) {
  KANJI_BY_PARTS.set(multisetKey(e.parts.map((p) => p.glyph)), e);
}

// 完成漢字の組 → 熟語
export const JUKUGO_BY_CHARS = new Map<string, JukugoEntry>();
for (const j of JUKUGO_ENTRIES) {
  JUKUGO_BY_CHARS.set(multisetKey(j.chars), j);
}

// パレットに並べる原子（全エントリのパーツ glyph、重複なし）
export const PALETTE_GLYPHS: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of KANJI_ENTRIES) {
    for (const p of e.parts) {
      if (!seen.has(p.glyph)) {
        seen.add(p.glyph);
        out.push(p.glyph);
      }
    }
  }
  return out;
})();

// 原子のグリフ → 音声ヒント名（spokenName）。パレットのタップ読み上げ用。
export const GLYPH_SPOKEN = new Map<string, string>();
for (const e of KANJI_ENTRIES) {
  for (const p of e.parts) {
    if (!GLYPH_SPOKEN.has(p.glyph)) GLYPH_SPOKEN.set(p.glyph, p.spokenName);
  }
}

export function kanjiFromParts(glyphs: string[]): KanjiEntry | undefined {
  return KANJI_BY_PARTS.get(multisetKey(glyphs));
}

export function jukugoFromChars(chars: string[]): JukugoEntry | undefined {
  return JUKUGO_BY_CHARS.get(multisetKey(chars));
}
