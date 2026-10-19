# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

The repository (still named `yubi-labo`, deployed at `/yubi-labo/`) now hosts **さんすうクラフト**, an implementation of the math-craft spec v2.1 (`docs/SPEC.md`). The previous app (ゆびラボ: maze/kanji/moji/hand tracking) was fully cleared by the child and removed. All four modes (A 偶奇パズル, B カラーロッド, C 10フレーム, D 両替商), the craft book, and the parent dashboard are implemented. v2.2 (SPEC §18) added direct manipulation, auto progression with adaptive skip (`src/core/engine/progression.ts`), and scores/ranks/rounds. v2.3 (SPEC §19) added the じっけんラボ modes E–H (`src/modes/tiles|seesaw|doubling|trains`, `group: 'lab'`) and craft-book kinds. Implementation-time judgment calls are recorded in `docs/SPEC.md` §17.

Commands:

- `npm run dev` — Vite dev server.
- `npm test` — vitest: math rules, all carry/borrow combinations rendered by modes C/D (acceptance test 12), question validation, metrics, engine, import/export/migration, scores/ranks/rounds and auto progression (`score.test.ts`), lab-mode pure logic (`lab.test.ts`).
- `npm run build` — `tsc --noEmit` + Vite production build. Run both `npm test` and `npm run build` before pushing.
- **Deploy**: pushing to `main` publishes to GitHub Pages via `.github/workflows/deploy.yml` (runs `npm test`, then builds with `GITHUB_PAGES` set so Vite `base` is `/yubi-labo/`). Treat `main` as live for the child.

`docs/SPEC.md` (Japanese) is the single source of truth. **Part II (§7 onward) overrides Part I**; never implement from Part I directly (see §15). Every design decision traces back to one specific child; do not treat this as a generic kids' app.

## Privacy (non-negotiable)

The child's name and diagnostic details (test names/scores) must never be written into code, commit messages, filenames, logs, or comments. `docs/SPEC.md` was sanitized for this — keep it that way. All data stays on the device (IndexedDB); no analytics, no external transmission (§11.3).

## Guardrails (SPEC §0, §8 — override convenience)

- **No forced equations.** Formulas/numbers appear only via the child's 「かずで みる」 button, and answers only after the trial ends. School notation (さくらんぼ) only on request.
- **No timers or countdowns.** Reaction times are measured silently by the engine only, and are an auxiliary metric — never interpreted as fatigue/counting.
- **Neutral mistakes.** No red ×, buzzer, shake, 「ざんねん」. A wrong choice is shown as the shape not fitting (overflow / gap / spill) and can be undone or replaced.
- **Capped fun.** `effectLevel` (default `calm`) is never exceeded and never escalates; no streaks or combo multipliers. No 「がんばれ」「あと少し」「早く」.
- **Scores / ranks / rounds (v2.2, parent decision — SPEC §18.3).** Points, rank (a growing plant), 10-question rounds and a ranking of the child's *own* past rounds are allowed on child screens (`scoreEnabled`, default on). Points never decrease (no deductions for mistakes/skips/exits) and never depend on speed; scores are derived from trial results (`src/core/score.ts`), not stored.
- **Sound off by default**; every task must be completable silently.
- **Tap-first.** Every task completes with taps (≥48px targets). With `directManipulation` (default on, SPEC §18.1) one tap on a tray item snaps it into the destination, and C/D placement decisions are made by tapping where to break off a group (`SplitPicker`); off = "tap item → tap destination". Drag is optional (`inputMethod: 'drag'`).
- **Never auto-advance.** After each trial: もういちど / つぎへ / べつのせかいでもみる / おしまい. Skip/undo/pause/exit always available and never treated as failure.
- **Keep references visible.** Target frames and comparison objects stay on screen; decomposition is shown one simple state at a time with previous states as thumbnails. No show-then-hide memory tasks.
- **Yawning is not a negative signal**; never add fields/labels that interpret behaviour (e.g. fatigue). Parent observations are free text.
- **Dashboard**: comparisons are observations, not controlled experiments; hide rates below the min trials/days threshold; never auto-judge "this mode fits". Parent gate uses a two-corner long press, never a math question.

## Architecture

- **Stack**: Vite + TypeScript + React 18, SVG rendering, IndexedDB via `idb`. No state library.
- **Plugin contract (§10)** lives in `src/core/types.ts`. Modes register in `src/modes/index.ts` via `GameRegistry.register()` (`src/core/registry.ts` validates IDs, tasks, stages, methods). The shell only calls `mount / loadQuestion / showHint / undo / pause / resume / applySettings / destroy`.
- `src/modes/kit/`: `createReactPlugin` adapts a React view to the plugin contract (each mount gets its own root element); `useTrialCore` (per-question state, hints, demo, finish); `Animator` (rAF tweens that respect pause/speed/reduced-motion and emit `input_disabled`/`animation_*`/`input_enabled` so animation time is excluded from reaction time); `ChoiceTray` (tap or drag).
- **Engine** `src/core/engine/`: `SessionEngine` owns sessions/trials and is the only place timestamps are assigned (`complete()` is once-only; visibility events recorded). `questions.ts` generates/validates questions (§9.0 ranges, same-parity distractors, revisit, `retarget` for transfer). `metrics.ts` computes §11.2 metrics from events.
- **Pure math** `src/core/math/` (parity plates, ten-frame carry/borrow rules, coin normalization, distractors) and pure scene builders `src/modes/tenframe/scenes.ts`, `src/modes/exchange/scenes.ts` — keep these React-free so tests can verify every combination geometrically.
- **Storage** `src/core/storage/`: `db.ts` (IndexedDB `math_craft_app_data_v2`, one-time v1 localStorage migration, never auto-deletes), `dataio.ts` (validation, preview, merge, anonymized export, CSV ×3, v1 migration).
- **Shell** `src/app/`: `App.tsx` (screen state), `screens/` (home, mode, play, craft book, end), `NumberView.tsx`, `ParentGate.tsx`, `parent/` (dashboard: analytics, compare, heatmap, history/observations, settings, data).
- **Colors** come only from `src/core/colors.ts` via the shared `colorScheme`; never per-mode palettes. Every task must be solvable by shape/length alone (`mono`).

## Orchestration workflow

あなた（Fable）はオーケストレーターです。計画、分解、統合を行います。

- 推論の重いフェーズ → deep-reasoner
- 機械的な作業 → fast-worker
- Codex（`/codex:rescue --background`）は、deep-reasoner に匹敵する優秀なエンジニアで、異なる視点から。レビュアーではなくピアとして扱います。
- 高リスクの決定：同じ問題で Opus + Codex を並行してタスクし、両者の最高の部分を統合し、互いの回答を見せずに。自分のコンテキストを軽く保つ。
