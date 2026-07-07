#!/usr/bin/env node
// 熟語データ検証（SPEC §12.7 ごうせいラボ）。
// 使い方: node scripts/validate-jukugo.mjs src/data/jukugo.json [src/data/kanji.json]
import fs from 'fs';

const [, , filePath, kanjiPath = 'src/data/kanji.json'] = process.argv;
if (!filePath) {
  console.error('Usage: node validate-jukugo.mjs <jukugo.json> [kanji.json]');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const kanji = JSON.parse(fs.readFileSync(kanjiPath, 'utf8'));
const kanjiChars = new Set(kanji.map((e) => e.char));

const FORBIDDEN = ['ざんねん', 'しっぱい', 'まちがい', 'だめ', 'もったいない', 'おしい'];

let fail = 0;
const seen = new Map();
for (const [i, e] of data.entries()) {
  const errors = [];
  const id = e.word ?? `entry-${i}`;
  if (!Array.isArray(e.chars) || e.chars.length < 2 || e.chars.length > 3) {
    errors.push('chars must be array of 2-3');
  } else {
    for (const c of e.chars) {
      if (!kanjiChars.has(c)) errors.push(`char ${c} not in kanji.json`);
    }
  }
  if (typeof e.word !== 'string' || e.word.length === 0) errors.push('word must be non-empty');
  if (typeof e.story !== 'string' || e.story.length === 0) errors.push('story must be non-empty');
  for (const w of FORBIDDEN) {
    if ((e.word ?? '').includes(w) || (e.story ?? '').includes(w)) errors.push(`forbidden: ${w}`);
  }
  // 文字マルチセットの一意性（レシピ照合のため）
  if (Array.isArray(e.chars)) {
    const key = [...e.chars].sort().join('+');
    if (seen.has(key)) errors.push(`char-multiset {${key}} collides with ${seen.get(key)}`);
    else seen.set(key, id);
  }
  if (errors.length > 0) fail++;
  console.log(`${id} ${errors.length === 0 ? 'PASS' : 'FAIL: ' + errors.join('; ')}`);
}
console.log(fail === 0 ? 'OK' : `FAILED (${fail})`);
process.exit(fail > 0 ? 1 : 0);
