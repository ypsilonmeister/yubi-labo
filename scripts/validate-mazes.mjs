#!/usr/bin/env node
import fs from 'fs';

const [, , filePath] = process.argv;
if (!filePath) {
  console.error('Usage: node validate-mazes.mjs <path-to-json>');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
if (!Array.isArray(data)) {
  console.error('FAIL: Root must be an array');
  process.exit(1);
}

const widthBands = {
  '1-4': 120, '5-8': 100, '9-12': 80, '13-16': 60, '17-20': [40, 50]
};
const stopsBands = {
  '1-4': [0, 1], '5-8': [1, 1], '9-12': [1, 2], '13-16': [2, 2], '17-20': [2, 3]
};

function getBand(level) {
  if (level <= 4) return '1-4';
  if (level <= 8) return '5-8';
  if (level <= 12) return '9-12';
  if (level <= 16) return '13-16';
  return '17-20';
}
function dist(p1, p2) {
  return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
}
function arcLength(path) {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += dist(path[i - 1], path[i]);
  return len;
}

function validateLevel(level, idx) {
  const errors = [], warnings = [];
  const id = level.id;
  if (typeof id !== 'string') errors.push('id must be string');
  if (!Array.isArray(level.path)) errors.push('path must be array');
  else if (level.path.length < 5) errors.push('path must have ≥5 points');
  if (typeof level.width !== 'number') errors.push('width must be number');
  if (!Array.isArray(level.stops)) errors.push('stops must be array');
  if (!['soil', 'rock', 'water'].includes(level.theme)) errors.push('invalid theme');
  if (errors.length > 0) return { id, errors, warnings };
  if (!/^maze-\d{2}$/.test(id)) errors.push('id must match /^maze-\\d{2}$/');
  for (const [x, y] of level.path) {
    if (x < 100 || x > 1180 || y < 100 || y > 700) {
      errors.push(`point out of bounds: [${x},${y}]`);
      break;
    }
  }
  const levelNum = idx + 1;
  const band = getBand(levelNum);
  const widthSpec = widthBands[band];
  if (typeof widthSpec === 'number') {
    if (level.width !== widthSpec) errors.push(`width must be ${widthSpec} (level ${levelNum})`);
  } else {
    const [min, max] = widthSpec;
    if (level.width < min || level.width > max) errors.push(`width must be ${min}-${max} (level ${levelNum})`);
  }
  for (let i = 1; i < level.path.length; i++) {
    const d = dist(level.path[i - 1], level.path[i]);
    if (d < 10 || d > 80) {
      errors.push(`point spacing ${d.toFixed(1)}px out of [10,80]`);
      break;
    }
  }
  const arc = arcLength(level.path);
  if (arc < 500 || arc > 3000) errors.push(`arc length ${arc.toFixed(0)}px out of [500,3000]`);
  const [minStops, maxStops] = stopsBands[band];
  if (level.stops.length < minStops || level.stops.length > maxStops) {
    errors.push(`stops count ${level.stops.length} out of band [${minStops},${maxStops}]`);
  }
  if (level.stops.length > 0) {
    for (const s of level.stops) {
      if (s < 0.25 || s > 0.85) {
        errors.push(`stop value ${s} out of [0.25,0.85]`);
        break;
      }
    }
    const sorted = [...level.stops].sort((a, b) => a - b);
    if (JSON.stringify(sorted) !== JSON.stringify(level.stops)) {
      errors.push('stops not in ascending order');
    }
    for (let i = 1; i < level.stops.length; i++) {
      const gap = level.stops[i] - level.stops[i - 1];
      if (gap < 0.15) {
        errors.push(`stops gap ${gap.toFixed(3)} < 0.15`);
        break;
      }
    }
  }
  let maxViolation = null;
  for (let i = 0; i < level.path.length; i++) {
    for (let j = i + 4; j < level.path.length; j++) {
      const d = dist(level.path[i], level.path[j]);
      const threshold = level.width * 1.5;
      if (d < threshold && (!maxViolation || d < maxViolation.dist)) {
        maxViolation = { i, j, dist: d, threshold };
      }
    }
  }
  if (maxViolation) {
    warnings.push(`self-proximity: [${maxViolation.i},${maxViolation.j}] ${maxViolation.dist.toFixed(1)}px < ${maxViolation.threshold.toFixed(1)}px`);
  }
  return { id, errors, warnings };
}

const results = data.map((level, idx) => validateLevel(level, idx));
const idSet = new Set();
for (const r of results) {
  if (idSet.has(r.id)) r.errors.push('duplicate id');
  idSet.add(r.id);
}
let failCount = 0;
for (const r of results) {
  if (r.errors.length > 0) failCount++;
  const msg = r.errors.length === 0 ? 'PASS' : `FAIL: ${r.errors.join('; ')}`;
  console.log(`${r.id} ${msg}`);
  r.warnings.forEach(w => console.log(`${r.id} WARN: ${w}`));
}
console.log(failCount === 0 ? 'OK' : `FAILED (${failCount} levels)`);
process.exit(failCount > 0 ? 1 : 0);
