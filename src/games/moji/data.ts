import { KANJI_ENTRIES } from '../kanji/data';
import type { KanjiProgressMap } from '../kanji/scheduler';
import type { MojiChar } from './types';

// SPEC §7.3 文字セット段階。清音（易）→清音全体→紛らわしいペア→濁音→カタカナ→既習漢字。

function hira(s: string): MojiChar[] {
  return [...s].map((c) => ({ char: c, reading: c, kind: 'hiragana' as const }));
}

// §7.3-1 形の差が大きい清音の組（あ行・か行）
const SEION_EASY = 'あいうえおかきくけこ';
// §7.3-2 清音46字
const SEION_ALL =
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
// §7.3-4 濁音・半濁音
const DAKUON = 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ';

// §7.3-5 カタカナ（音＝対応するひらがな。字→音の結合を強化）
const KATA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
const KATA_READ =
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';

function kata(): MojiChar[] {
  return [...KATA].map((c, i) => ({ char: c, reading: KATA_READ[i]!, kind: 'katakana' as const }));
}

// §7.3-3 形が紛らわしいペア（意図的に選択肢へ混ぜる）
export const CONFUSABLE: Record<string, string[]> = {
  ね: ['わ', 'れ'],
  わ: ['ね', 'れ'],
  れ: ['ね', 'わ'],
  は: ['ほ'],
  ほ: ['は'],
  ぬ: ['め'],
  め: ['ぬ'],
  る: ['ろ'],
  ろ: ['る'],
  き: ['さ'],
  さ: ['き'],
};

// §7.3-6 モードB↔C連携: モードBで「マスター」した漢字を出題対象へ自動追加。
export function masteredKanji(map: KanjiProgressMap): MojiChar[] {
  return KANJI_ENTRIES.filter((e) => map[e.id]?.mastered).map((e) => ({
    char: e.char,
    reading: e.reading,
    kind: 'kanji' as const,
  }));
}

// 出題ターゲットの母集団（段階ごと）
export function stagePool(stage: number, kanjiProgress: KanjiProgressMap): MojiChar[] {
  switch (stage) {
    case 0:
      return hira(SEION_EASY);
    case 1:
    case 2:
      return hira(SEION_ALL);
    case 3:
      return hira(DAKUON);
    case 4:
      return kata();
    case 5:
      return masteredKanji(kanjiProgress);
    default:
      return hira(SEION_ALL);
  }
}

// ダミー（他の選択肢）の母集団。弁別強化のため段階により母集団を広げる。
export function distractorSource(stage: number, kanjiProgress: KanjiProgressMap): MojiChar[] {
  switch (stage) {
    case 3:
      // 濁音の弁別に清音も混ぜる
      return [...hira(DAKUON), ...hira(SEION_ALL)];
    case 5:
      // 漢字が少なくてもカードが埋まるようカタカナで補う
      return [...masteredKanji(kanjiProgress), ...kata()];
    default:
      return stagePool(stage, kanjiProgress);
  }
}

// §7.3-3: 段階2以降は紛らわしいペアを優先的に選択肢へ混ぜる
export function stageUsesConfusable(stage: number): boolean {
  return stage >= 2;
}
