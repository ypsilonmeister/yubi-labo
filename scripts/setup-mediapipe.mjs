#!/usr/bin/env node
// wasm は npm パッケージから再現できるためコミットせず、install 時にコピーする。
// モデル (hand_landmarker.task) はバージョン固定のためリポジトリにコミット済み。
import fs from 'fs';
import path from 'path';

const src = path.resolve('node_modules/@mediapipe/tasks-vision/wasm');
const dest = path.resolve('public/mediapipe/wasm');

if (!fs.existsSync(src)) {
  console.error('setup-mediapipe: @mediapipe/tasks-vision not installed yet — skipped');
  process.exit(0);
}
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(src)) {
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
}
console.log(`setup-mediapipe: copied ${fs.readdirSync(dest).length} files to public/mediapipe/wasm`);
