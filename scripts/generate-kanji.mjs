#!/usr/bin/env node
// 漢字データ生成（SPEC §12.5）。使い方: node scripts/generate-kanji.mjs
// - 既存の先頭12字は verbatim 保持（v1.0 の手作りデータ）。
// - kanji-source.mjs の追加字を後ろに展開して src/data/kanji.json に書き戻す。
// - 決定論的（乱数なし）。2回実行して diff ゼロ。
// - 生成後は必ず `node scripts/validate-kanji.mjs src/data/kanji.json` を通すこと。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(HERE, '../src/data/kanji.json');
const KEEP = 12;

const { NEW_KANJI } = await import('./kanji-source.mjs');

// 既存ファイルと同じ整形で書き出すシリアライザ（先頭12字を byte-identical に保つ）。
function ser(entry) {
  const z = (zone) => `{ "x": ${zone.x}, "y": ${zone.y}, "w": ${zone.w}, "h": ${zone.h} }`;
  const part = (p) => `      { "glyph": ${JSON.stringify(p.glyph)}, "zone": ${z(p.zone)}, "spokenName": ${JSON.stringify(p.spokenName)} }`;
  const lines = [];
  lines.push('  {');
  lines.push(`    "id": ${JSON.stringify(entry.id)},`);
  lines.push(`    "char": ${JSON.stringify(entry.char)},`);
  lines.push(`    "reading": ${JSON.stringify(entry.reading)},`);
  lines.push(`    "storyText": ${JSON.stringify(entry.storyText)},`);
  lines.push(`    "grade": ${entry.grade},`);
  lines.push(`    "meaningEmoji": [${entry.meaningEmoji.map((e) => JSON.stringify(e)).join(', ')}],`);
  if (entry.labOnly) lines.push(`    "labOnly": true,`);
  lines.push('    "parts": [');
  lines.push(entry.parts.map(part).join(',\n'));
  lines.push('    ]');
  lines.push('  }');
  return lines.join('\n');
}

const existing = JSON.parse(fs.readFileSync(FILE, 'utf8'));
if (existing.length < KEEP) {
  console.error(`FAIL: expected at least ${KEEP} existing entries, found ${existing.length}`);
  process.exit(1);
}
const kept = existing.slice(0, KEEP);
const all = [...kept, ...NEW_KANJI];

const out = '[\n' + all.map(ser).join(',\n') + '\n]\n';
fs.writeFileSync(FILE, out);
console.log(`OK: wrote ${all.length} kanji (${KEEP} kept + ${NEW_KANJI.length} new) to ${FILE}`);
