#!/usr/bin/env node
import fs from 'fs';

const [, , filePath] = process.argv;
if (!filePath) {
  console.error('Usage: node validate-kanji.mjs <path-to-json>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
if (!Array.isArray(data)) {
  console.error('FAIL: Root must be an array');
  process.exit(1);
}

const REQUIRED_CHARS = ['林', '森', '休', '本', '田', '男', '音', '早', '明', '岩', '花', '草'];
const FORBIDDEN_WORDS = ['ざんねん', 'しっぱい', 'まちがい', 'だめ', 'もったいない', 'おしい'];

function rectOverlap(r1, r2) {
  const ox = Math.max(0, Math.min(r1.x + r1.w, r2.x + r2.w) - Math.max(r1.x, r2.x));
  const oy = Math.max(0, Math.min(r1.y + r1.h, r2.y + r2.h) - Math.max(r1.y, r2.y));
  return ox * oy;
}

function validateEntry(entry, idx) {
  const errors = [], warnings = [];
  const id = entry.id;

  // Schema checks
  if (typeof id !== 'string') errors.push('id must be string');
  if (typeof entry.char !== 'string') errors.push('char must be string');
  if (typeof entry.reading !== 'string') errors.push('reading must be string');
  if (typeof entry.storyText !== 'string') errors.push('storyText must be string');
  if (typeof entry.grade !== 'number') errors.push('grade must be number');
  if (!Array.isArray(entry.meaningEmoji)) errors.push('meaningEmoji must be array');
  if (!Array.isArray(entry.parts)) errors.push('parts must be array');

  if (errors.length > 0) return { id: id || `entry-${idx}`, errors, warnings };

  // labOnly (optional, SPEC §12.7): 合成ラボ専用の発見対象
  if (entry.labOnly !== undefined && typeof entry.labOnly !== 'boolean') {
    errors.push('labOnly must be boolean');
  }

  // meaningEmoji: exactly 2 strings
  if (entry.meaningEmoji.length !== 2 || !entry.meaningEmoji.every(e => typeof e === 'string')) {
    errors.push('meaningEmoji must be exactly 2 strings');
  }

  // parts length 2-4
  if (entry.parts.length < 2 || entry.parts.length > 4) {
    errors.push(`parts length ${entry.parts.length} not in [2,4]`);
  } else {
    for (const p of entry.parts) {
      if (typeof p.glyph !== 'string') errors.push('part.glyph must be string');
      if (typeof p.spokenName !== 'string') errors.push('part.spokenName must be string');
      if (!p.zone || typeof p.zone.x !== 'number' || typeof p.zone.y !== 'number' ||
          typeof p.zone.w !== 'number' || typeof p.zone.h !== 'number') {
        errors.push('part.zone must have numeric x,y,w,h');
      }
    }
  }

  if (errors.length > 0) return { id, errors, warnings };

  // id format
  if (!/^kanji-[a-z]+$/.test(id)) errors.push('id must match /^kanji-[a-z]+$/');

  // reading and storyText non-empty
  if (entry.reading.length === 0) errors.push('reading must be non-empty');
  if (entry.storyText.length === 0) errors.push('storyText must be non-empty');

  // Forbidden words
  for (const word of FORBIDDEN_WORDS) {
    if (entry.reading.includes(word)) errors.push(`reading contains forbidden: ${word}`);
    if (entry.storyText.includes(word)) errors.push(`storyText contains forbidden: ${word}`);
  }
  if (entry.storyText.includes('です') || entry.storyText.includes('ます')) {
    errors.push('storyText must not contain です or ます');
  }

  // Glyph: exactly 1 code point
  for (const p of entry.parts) {
    if ([...p.glyph].length !== 1) errors.push('part.glyph must be exactly 1 code point');
  }

  // Zone validation: bounds, sizes, overlaps, coverage
  const zones = entry.parts.map(p => p.zone);
  for (const z of zones) {
    if (z.x < 0 || z.x > 1 || z.y < 0 || z.y > 1 || z.w < 0 || z.w > 1 || z.h < 0 || z.h > 1) {
      errors.push('zone x,y,w,h not in [0,1]');
    }
    if (z.x + z.w > 1.001) errors.push(`zone x+w ${(z.x + z.w).toFixed(3)} > 1.001`);
    if (z.y + z.h > 1.001) errors.push(`zone y+h ${(z.y + z.h).toFixed(3)} > 1.001`);
    if (z.w < 0.15) errors.push(`zone w ${z.w.toFixed(3)} < 0.15`);
    if (z.h < 0.15) errors.push(`zone h ${z.h.toFixed(3)} < 0.15`);
  }

  // Zone overlap — WARN only: 囲み系の字（田 = 口の中に十）では完全な重なりが正しい
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const overlap = rectOverlap(zones[i], zones[j]);
      if (overlap > 0.02) {
        warnings.push(`zones ${i}-${j} overlap ${overlap.toFixed(4)} > 0.02 (intentional for enclosure kanji)`);
      }
    }
  }

  // Zone coverage
  const totalArea = zones.reduce((sum, z) => sum + z.w * z.h, 0);
  if (totalArea < 0.5) {
    warnings.push(`zone coverage ${totalArea.toFixed(3)} < 0.5`);
  }

  return { id, char: entry.char, errors, warnings };
}

const results = data.map((e, i) => validateEntry(e, i));

// Check required chars present (v1.1: ≥12 with the original 12 always included)
const charSet = new Set();
for (const r of results) {
  if (charSet.has(r.char)) r.errors.push('duplicate char');
  charSet.add(r.char);
}
if (charSet.size < 12) {
  console.log(`FAIL: at least 12 chars required, found ${charSet.size}`);
  process.exit(1);
}
for (const char of REQUIRED_CHARS) {
  if (!charSet.has(char)) {
    console.log(`FAIL: required char missing: ${char}`);
    process.exit(1);
  }
}

// Part-multiset uniqueness (SPEC §12.7): no two entries may share the same
// multiset of part glyphs, or the ごうせいラボ recipe lookup becomes ambiguous.
const multisetOwners = new Map();
for (const e of data) {
  if (!Array.isArray(e.parts)) continue;
  const key = e.parts.map((p) => p.glyph).sort().join('+');
  if (multisetOwners.has(key)) {
    const other = multisetOwners.get(key);
    const r = results.find((rr) => rr.id === e.id);
    if (r) r.errors.push(`part-multiset {${key}} collides with ${other}`);
  } else {
    multisetOwners.set(key, e.id);
  }
}

// Check id uniqueness
const idSet = new Set();
for (const r of results) {
  if (idSet.has(r.id)) r.errors.push('duplicate id');
  idSet.add(r.id);
}

// Output results
let failCount = 0;
for (const r of results) {
  if (r.errors.length > 0) failCount++;
  const msg = r.errors.length === 0 ? 'PASS' : `FAIL: ${r.errors.join('; ')}`;
  console.log(`${r.id} (${r.char}) ${msg}`);
  r.warnings.forEach(w => console.log(`${r.id} WARN: ${w}`));
}
console.log(failCount === 0 ? 'OK' : `FAILED (${failCount})`);
process.exit(failCount > 0 ? 1 : 0);
