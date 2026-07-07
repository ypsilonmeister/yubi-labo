#!/usr/bin/env node
// 決定論的迷路レベルジェネレータ（SPEC §12.4、レベル21以降）。
// 使い方: node scripts/generate-mazes.mjs
// - 既存の maze-01〜20 は一切変更しない（v1.0 の手作りレベルを保持）。
// - 21以降を毎回同じシードから再生成して src/data/mazes.json に書き戻す。
//   2回実行して diff が出ないこと（決定論）が検証条件。
// - 生成後は必ず `npm run validate` を通すこと。

import fs from 'fs';
import path from 'path';

const FILE = path.resolve('src/data/mazes.json');
const KEEP = 20; // maze-01..20 は不変

// バンド定義（SPEC §12.4 の表と validate-mazes.mjs に一致させる）
const BANDS = [
  { from: 21, to: 26, width: 36, holdRadius: 40, stops: [2, 3], kind: 'curves' },
  { from: 27, to: 32, width: 32, holdRadius: 36, stops: [3, 3], kind: 'switchback', branch: [30, 31, 32] },
  { from: 33, to: 38, width: 28, holdRadius: 32, stops: [3, 4], kind: 'spiralmix', memory: [34, 37] },
  { from: 39, to: 44, width: 24, holdRadius: 30, stops: [3, 4], kind: 'all', memory: [40, 43], branch: [39, 40, 41, 42, 43, 44] },
];
const THEMES = ['soil', 'rock', 'water'];
const BOUNDS = { x0: 110, x1: 1170, y0: 110, y1: 690 }; // バリデータ [100,1180]×[100,700] より一回り内側
const SPACING = 45; // リサンプル間隔（バリデータの点間隔 [10,80] 内）

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ── タートル: (長さ, 曲率[rad/px]) ブロック列から細かい点列を生成 ──
function turtle(blocks, step = 6) {
  let x = 0;
  let y = 0;
  let heading = 0;
  const pts = [[0, 0]];
  for (const b of blocks) {
    const n = Math.max(1, Math.round(b.len / step));
    const k0 = b.k0 ?? b.k ?? 0;
    const k1 = b.k1 ?? b.k ?? 0;
    for (let i = 0; i < n; i++) {
      const k = k0 + ((k1 - k0) * i) / n;
      heading += k * step;
      x += Math.cos(heading) * step;
      y += Math.sin(heading) * step;
      pts.push([x, y]);
    }
  }
  return pts;
}

// ブロック・ビルダー
const line = (len) => ({ len, k: 0 });
const arc = (r, deg, dir) => ({ len: (Math.abs(deg) * Math.PI * r) / 180, k: dir / r });
const ramp = (len, kFrom, kTo) => ({ len, k0: kFrom, k1: kTo });

function jitter(rng, v, ratio = 0.15) {
  return v * (1 + (rng() * 2 - 1) * ratio);
}

// ── レシピ（バンド別の形状アーキタイプ） ──
function recipeCurves(rng) {
  // 長いS字＋渦の入口＋フック
  const d = rng() < 0.5 ? 1 : -1;
  return [
    line(jitter(rng, 110)),
    arc(jitter(rng, 170), jitter(rng, 140), d),
    line(jitter(rng, 90)),
    arc(jitter(rng, 130), jitter(rng, 170), -d),
    line(jitter(rng, 70)),
    arc(jitter(rng, 95), jitter(rng, 150), d),
    line(jitter(rng, 90)),
    arc(jitter(rng, 120), jitter(rng, 110), -d),
    line(jitter(rng, 60)),
  ];
}

function recipeSwitchback(rng) {
  // 折返し密集: 直線レッグ + 180°ターンの繰り返し
  const legs = 4 + Math.floor(rng() * 2); // 4-5
  const blocks = [line(jitter(rng, 90)), arc(jitter(rng, 110), 80, rng() < 0.5 ? 1 : -1)];
  let dir = rng() < 0.5 ? 1 : -1;
  for (let i = 0; i < legs; i++) {
    blocks.push(line(jitter(rng, 250, 0.2)));
    blocks.push(arc(jitter(rng, 56, 0.1), 180, dir));
    dir = -dir;
  }
  blocks.push(line(jitter(rng, 130)));
  return blocks;
}

function recipeSpiralMix(rng) {
  // 渦（巻き込み→巻き戻し）+ S字
  const d = rng() < 0.5 ? 1 : -1;
  const kIn = 1 / jitter(rng, 150);
  const kTight = 1 / jitter(rng, 68, 0.1);
  return [
    line(jitter(rng, 100)),
    ramp(jitter(rng, 420, 0.2), d * kIn, d * kTight),
    ramp(jitter(rng, 300, 0.2), -d * kTight, -d * kIn),
    line(jitter(rng, 90)),
    arc(jitter(rng, 100), jitter(rng, 160), d),
    line(jitter(rng, 70)),
    arc(jitter(rng, 80), jitter(rng, 130), -d),
    line(jitter(rng, 60)),
  ];
}

function recipeAll(rng) {
  // 全部乗せ: 渦 + 折返し + フック
  const d = rng() < 0.5 ? 1 : -1;
  const kTight = 1 / jitter(rng, 62, 0.1);
  const blocks = [
    line(jitter(rng, 90)),
    ramp(jitter(rng, 340, 0.2), d / 160, d * kTight),
    ramp(jitter(rng, 240, 0.2), -d * kTight, -d / 140),
    line(jitter(rng, 80)),
  ];
  let dir = -d;
  for (let i = 0; i < 3; i++) {
    blocks.push(line(jitter(rng, 220, 0.2)));
    blocks.push(arc(jitter(rng, 54, 0.1), 180, dir));
    dir = -dir;
  }
  blocks.push(line(jitter(rng, 80)));
  blocks.push(arc(jitter(rng, 90), jitter(rng, 120), d));
  blocks.push(line(jitter(rng, 60)));
  return blocks;
}

const RECIPES = {
  curves: recipeCurves,
  switchback: recipeSwitchback,
  spiralmix: recipeSpiralMix,
  all: recipeAll,
};

// ── 後処理 ──
function rotate(pts, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

function fitToBounds(pts, rng) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const boxW = BOUNDS.x1 - BOUNDS.x0;
  const boxH = BOUNDS.y1 - BOUNDS.y0;
  const scale = Math.min(boxW / w, boxH / h, 1.25);
  const ox = BOUNDS.x0 + (boxW - w * scale) * rng();
  const oy = BOUNDS.y0 + (boxH - h * scale) * rng();
  return pts.map(([x, y]) => [(x - minX) * scale + ox, (y - minY) * scale + oy]);
}

function resample(pts, spacing) {
  const out = [pts[0]];
  let prev = pts[0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let cur = pts[i];
    let d = dist(prev, cur);
    while (acc + d >= spacing && d > 0) {
      const t = (spacing - acc) / d;
      const nx = prev[0] + (cur[0] - prev[0]) * t;
      const ny = prev[1] + (cur[1] - prev[1]) * t;
      out.push([nx, ny]);
      prev = [nx, ny];
      d = dist(prev, cur);
      acc = 0;
    }
    acc += d;
    prev = cur;
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) >= 12) out.push(last);
  return out.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}

function arcLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

function selfProximityOk(pts, width) {
  const threshold = width * 1.5 + 10;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 4; j < pts.length; j++) {
      if (dist(pts[i], pts[j]) < threshold) return false;
    }
  }
  return true;
}

function inBounds(pts) {
  return pts.every(([x, y]) => x >= 100 && x <= 1180 && y >= 100 && y <= 700);
}

// ストップ: 曲がりの強い点（曲率極大）から選ぶ。足りなければ等間隔で補完。
function pickStops(pts, count, rng) {
  const total = arcLength(pts);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const cands = [];
  for (let i = 2; i < pts.length - 2; i++) {
    const a1 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const a2 = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    let turn = Math.abs(a2 - a1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    const s = cum[i] / total;
    if (s >= 0.28 && s <= 0.82) cands.push({ s, turn });
  }
  cands.sort((a, b) => b.turn - a.turn);
  const picked = [];
  for (const c of cands) {
    if (picked.length >= count) break;
    if (picked.every((p) => Math.abs(p - c.s) >= 0.16)) picked.push(c.s);
  }
  // 補完: 等間隔スロット
  let guard = 0;
  while (picked.length < count && guard++ < 50) {
    const s = 0.3 + rng() * 0.5;
    if (picked.every((p) => Math.abs(p - s) >= 0.16)) picked.push(s);
  }
  return picked.sort((a, b) => a - b).map((s) => Math.round(s * 100) / 100);
}

// 行き止まり枝（SPEC §12.4）: 主経路上のアンカーから横へ逸れる短い袋小路。
// 終端はゴールから離し、起点付近以外は主経路と十分なクリアランスを保つ。
function makeBranch(path, rng, width) {
  const goal = path[path.length - 1];
  const clearance = width * 1.5 + 10;
  for (let attempt = 0; attempt < 30; attempt++) {
    const idx = Math.floor(path.length * (0.3 + rng() * 0.4));
    const anchor = path[idx];
    const prev = path[Math.max(0, idx - 1)];
    const next = path[Math.min(path.length - 1, idx + 1)];
    const tangent = Math.atan2(next[1] - prev[1], next[0] - prev[0]);
    const side = rng() < 0.5 ? 1 : -1;
    let heading = tangent + side * (Math.PI / 2) * (0.8 + rng() * 0.4);
    const len = 200 + rng() * 200;
    const curve = (rng() * 2 - 1) * 0.004;
    const fine = [anchor];
    let [x, y] = anchor;
    const step = 6;
    for (let i = 0; i < Math.round(len / step); i++) {
      heading += curve * step;
      x += Math.cos(heading) * step;
      y += Math.sin(heading) * step;
      fine.push([x, y]);
    }
    const br = resample(fine, SPACING);
    if (br.length < 3) continue;
    if (!inBounds(br)) continue;
    if (dist(br[br.length - 1], goal) < 160) continue;
    let ok = true;
    for (let i = 1; i < br.length && ok; i++) {
      if (dist(br[i], anchor) <= clearance) continue; // 起点付近は主経路と接して当然
      for (const p of path) {
        if (dist(br[i], p) < clearance) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;
    return br;
  }
  return null;
}

// ── レベル生成（リトライ付き） ──
function generateLevel(levelNum, band) {
  const idx = levelNum - band.from;
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = mulberry32(1000 + levelNum * 7919 + attempt * 104729);
    const blocks = RECIPES[band.kind](rng);
    let pts = turtle(blocks);
    pts = rotate(pts, rng() * Math.PI * 2);
    pts = fitToBounds(pts, rng);
    const path = resample(pts, SPACING);
    const arc = arcLength(path);
    if (path.length < 5) continue;
    if (arc < 1100 || arc > 4300) continue;
    if (!inBounds(path)) continue;
    if (!selfProximityOk(path, band.width)) continue;
    const [minStops, maxStops] = band.stops;
    const stopCount = minStops + Math.floor(rng() * (maxStops - minStops + 1));
    const stops = pickStops(path, stopCount, rng);
    if (stops.length < minStops) continue;
    const level = {
      id: `maze-${String(levelNum).padStart(2, '0')}`,
      path,
      width: band.width,
      stops,
      theme: THEMES[(levelNum - 1) % THEMES.length],
      holdRadius: band.holdRadius,
    };
    if (band.memory?.includes(levelNum)) {
      level.memory = { previewGraceMs: 4000, echoMs: 2500 };
    }
    if (band.branch?.includes(levelNum)) {
      const br = makeBranch(path, rng, band.width);
      if (br) level.branches = [br];
    }
    return level;
  }
  throw new Error(`level ${levelNum}: no valid layout found after 60 attempts`);
}

// ── メイン ──
const existing = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const kept = existing.slice(0, KEEP);
if (kept.length !== KEEP) {
  console.error(`FAIL: expected at least ${KEEP} existing levels, found ${kept.length}`);
  process.exit(1);
}

const generated = [];
for (const band of BANDS) {
  for (let n = band.from; n <= band.to; n++) {
    generated.push(generateLevel(n, band));
  }
}

const all = [...kept, ...generated];
fs.writeFileSync(FILE, JSON.stringify(all) + '\n');
console.log(`OK: wrote ${all.length} levels (${KEEP} kept + ${generated.length} generated) to ${FILE}`);
