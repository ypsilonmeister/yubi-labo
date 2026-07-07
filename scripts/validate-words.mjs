#!/usr/bin/env node
// ことばモード（SPEC §12.6）の単語データ検証。
// 使い方: node scripts/validate-words.mjs src/data/words.json
import fs from 'fs';

const [, , filePath] = process.argv;
if (!filePath) {
  console.error('Usage: node validate-words.mjs <path-to-json>');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
if (!Array.isArray(data)) {
  console.error('FAIL: Root must be an array');
  process.exit(1);
}

const FORBIDDEN = ['ざんねん', 'しっぱい', 'まちがい', 'だめ', 'もったいない', 'おしい'];

// カード1枚に載る要素の妥当性。清音/濁音/半濁音の基字 + 任意の小書きゃゅょ、
// または促音っ・長音ー。カタカナ語は同じ規則のカタカナ版。
const HIRA = /^[ぁ-ん][ゃゅょ]?$|^っ$|^ー$/u;
const KATA = /^[ァ-ン][ャュョ]?$|^ッ$|^ー$/u;

function validate(entry, idx) {
  const errors = [];
  const id = entry.word ?? `entry-${idx}`;
  if (typeof entry.word !== 'string' || entry.word.length === 0) errors.push('word must be non-empty string');
  if (!Array.isArray(entry.kana)) errors.push('kana must be array');
  if (typeof entry.emoji !== 'string' || entry.emoji.length === 0) errors.push('emoji must be non-empty string');
  if (errors.length > 0) return { id, errors };

  if (entry.kana.length < 2 || entry.kana.length > 4) {
    errors.push(`kana length ${entry.kana.length} not in [2,4]`);
  }
  if (entry.kana.join('') !== entry.word) {
    errors.push(`kana.join !== word ("${entry.kana.join('')}" vs "${entry.word}")`);
  }
  const re = entry.kata ? KATA : HIRA;
  for (const k of entry.kana) {
    if (typeof k !== 'string' || !re.test(k)) {
      errors.push(`invalid kana element "${k}" (${entry.kata ? 'katakana' : 'hiragana'})`);
    }
  }
  for (const w of FORBIDDEN) {
    if (entry.word.includes(w)) errors.push(`word contains forbidden: ${w}`);
  }
  if (entry.kata !== undefined && typeof entry.kata !== 'boolean') errors.push('kata must be boolean');
  if (entry.hard !== undefined && typeof entry.hard !== 'boolean') errors.push('hard must be boolean');
  return { id, errors };
}

const results = data.map(validate);
const wordSet = new Set();
for (const e of data) {
  if (wordSet.has(e.word)) {
    const r = results.find((rr) => rr.id === e.word);
    if (r) r.errors.push('duplicate word');
  }
  wordSet.add(e.word);
}

let fail = 0;
for (const r of results) {
  if (r.errors.length > 0) fail++;
  console.log(`${r.id} ${r.errors.length === 0 ? 'PASS' : 'FAIL: ' + r.errors.join('; ')}`);
}
// 段階ごとに1セット(8問)分の語彙があるか
const counts = {
  7: data.filter((w) => !w.kata && !w.hard).length,
  8: data.filter((w) => w.kata).length,
  9: data.filter((w) => w.hard && !w.kata).length,
};
console.log(`stage7=${counts[7]} stage8=${counts[8]} stage9=${counts[9]}`);
for (const [s, n] of Object.entries(counts)) {
  if (n < 8) { console.log(`FAIL: stage ${s} has ${n} words (<8)`); fail++; }
}
console.log(fail === 0 ? 'OK' : `FAILED (${fail})`);
process.exit(fail > 0 ? 1 : 0);
