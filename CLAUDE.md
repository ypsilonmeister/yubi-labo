# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

All phases P0–P5 are implemented (shell/input/audio/storage, Mode A maze, Mode B kanji, hand tracking, Mode C moji, parent dashboard). v1.1 (SPEC §12) is implemented — it raises the difficulty ceiling after the child outperformed the v1.0 calibration: mazes extend to level 44 (generated) with skill-based adaptive narrowing plus memory/branch mechanics; kanji expand to 36 chars with a Lv4 tier (no-silhouette + decoy parts); moji gains a 拗音 stage and word-spelling stages 7–9; and a PhET-style kanji-synthesis lab (Mode D, `src/games/lab/`) lets the child freely combine part "atoms" into kanji and compounds. Guardrail #2 was relaxed (hiragana/kanji labels now allowed on child screens); all other §2 emotional guardrails are unchanged. Commands:

- `npm run dev` — Vite dev server. `?min=<minutes>` URL param overrides session length for quick testing (e.g. `?min=0.5`).
- `npm run build` — `tsc --noEmit` type check + Vite production build (this is the test gate; there is no separate test suite).
- `npm run validate` — all dataset validators (mazes, kanji, and any newer datasets); run after editing game data or generators. Individual: `node scripts/validate-mazes.mjs src/data/mazes.json`, `node scripts/validate-kanji.mjs src/data/kanji.json`. `scripts/validate-oneeuro.mjs` sanity-checks the One Euro Filter implementation.
- `node scripts/generate-mazes.mjs` — deterministic maze-level generator for levels 21+ (keeps 1–20 verbatim, writes src/data/mazes.json; run validate afterwards; running twice must produce zero diff).
- `npm install` runs `scripts/setup-mediapipe.mjs` (postinstall): copies MediaPipe wasm from `node_modules` into `public/mediapipe/wasm` (not committed). The model file `public/mediapipe/hand_landmarker.task` *is* committed for version pinning. If hand tracking fails to load, re-run the postinstall.
- **Deploy**: pushing to `main` publishes to GitHub Pages via `.github/workflows/deploy.yml` (the `GITHUB_PAGES` env var switches Vite `base` to `/yubi-labo/`). Treat `main` as live for the child.

`docs/SPEC.md` (Japanese) is the single source of truth and is written to be self-contained — read it in full before implementing anything. It is the spec for **"ゆびラボ" (Yubi Labo)**, a browser-based training-game app designed for one specific 7-year-old child with weak visuomotor integration and weak letter-to-sound decoding, but strong shape/verbal/sequential-memory skills. Do not treat this as a generic kids'-app project; every design decision in the spec is traced back to that child's cognitive assessment (Appendix A of SPEC.md).

## Privacy (non-negotiable)

The child's name and diagnostic details must never be written into code, commit messages, filenames, logs, or comments. `docs/SPEC.md` intentionally omits them — keep it that way. All app data (camera frames, session records) stays local; the spec explicitly forbids any analytics or external API calls (§2.8, §9).

## Design guardrails (§2 of SPEC.md — override everything else)

These 8 rules are fixed and take priority over any feature request or convenience shortcut. If a change conflicts with one of these, the guardrail wins:

1. **NO-FAIL**: never implement game-over, score deduction, ❌ marks, error sounds, lives, or time-up failure. Mistakes (e.g. going off-path) are shown only as a gentle visual fade — never a sound, stop, or rewind.
2. **Voice-first UI** (relaxed in v1.1, SPEC §12.2): hiragana/kanji *supplementary* text is now allowed on child-facing screens (labels, readings, spelling slots) — but voice guidance remains primary, and UI that *requires* reading to operate is still forbidden. Navigation stays icon + voice.
3. **Voice guidance is fully explicit language**, never deictic ("do this") — always names the object and action (see Appendix B scripts).
4. **Self-comparison only**: never show rankings, other-child comparisons, or averages. Only "past self."
5. **Short, good-feeling sessions**: default 5 min (3–10 configurable), visual countdown only (no numbers), always ends with highlight replay → praise → "see you tomorrow." Extension capped at +2 min, offered once.
6. **Never rush the child**: no countdown timers/sounds except the opt-in Challenge mode in mode C (§7.4), which the child must trigger themselves.
7. **Never blame the input device on the child**: hand-tracking loss/instability must be shown as a camera/device problem (icon + "camera can't see you" voice), never as if the child made a mistake.
8. **Local-only**: no external transmission of camera footage or records; no analytics.

Forbidden vocabulary in any child-facing voice line (Appendix B): 「ざんねん」「しっぱい」「まちがい」「だめ」「もったいない」「おしい」.

When in doubt about any feature, the spec's own tie-breaker (§11) is: *"would the 7-year-old, playing alone, ever feel bad?"* — if yes, don't ship it.

## Architecture (per SPEC.md §3–§4)

- **Stack**: Vite + TypeScript + React 18. React is a shell only (screen routing, overlays, parent screen) — there is no state library; all shell state lives in `src/app/App.tsx` via `useState`/refs. Game rendering happens on an HTML5 Canvas *outside* React's render tree (`requestAnimationFrame`, 60fps target / 30fps floor). Hand tracking via MediaPipe Tasks Vision `HandLandmarker`. IndexedDB (`idb`) for persistence.
- **Layout (as implemented)**:

  ```text
  src/
    app/         # React shell: App.tsx (screen state machine + hand-mode wiring),
                 # Stage, VisualTimer, HighlightPlayer, HandCursorRing,
                 # screens/ (Start, Home, Farm, Zukan, Parent, Calibration, End)
    core/
      coords.ts    # LOGICAL_W/H — see coordinate system below
      input/       # PointerSource.ts (interface + mouse/touch impl),
                   # inputProvider.ts (mode switch), HandPointerSource.ts
      tracking/    # HandTracker.ts (MediaPipe), OneEuroFilter.ts, calibration.ts
      audio/       # AudioGuide.ts — all voice-line scripts live here
      storage/     # db.ts — the entire IndexedDB layer + export/import
      engine/      # SessionTimer, ReplayRecorder, highlights (きのうのきみ selection)
    games/
      maze|kanji|moji/  # one <Mode>Game.tsx each + types.ts (tuning constants),
                        # data/scheduler/geometry helpers alongside
    data/        # mazes.json, kanji.json (validated by scripts/)
  public/mediapipe/  # wasm (postinstall-copied) + hand_landmarker.task (committed)
  ```

- **Coordinate system**: everything — games, input events, replay samples, calibration — operates in the logical 1280×800 space defined in `src/core/coords.ts`; `Stage` scales it to the viewport. Never use raw client pixels in game logic.
- **Input abstraction is mandatory**: all three games must consume input only through the `PointerSource` interface (§4.1) — game logic must never branch on mouse vs. touch vs. hand. `active` means "held/gripped" (mouse button / touch contact / pinch-or-dwell for hand). Concretely: a game calls `createPointerSource(el)` from `core/input/inputProvider.ts` and nothing else. `App.tsx` registers the hand factory via `enableHandMode()`; the hand source additionally exposes `getDwellProgress()` so the *shell* (not games) draws the dwell ring (`HandCursorRing`).
- **Game component pattern**: each mode is a single React component (`MazeGame.tsx` etc.) with props `{ endRequested, onPlay, onFinish }` that owns its canvas + rAF loop and records replays via `ReplayRecorder`. Tuning constants (hold durations, relief thresholds, stuck-assist timing) live in that mode's `types.ts`. The shell owns everything cross-cutting: session timer, lost/found camera overlays, the 90s-hand-use → 10s rest break, and highlight playback.
- **MediaPipe is lazy-loaded**: `HandTracker`/calibration/`HandPointerSource` are dynamic `import()`s triggered on first hand-mode enable — keep it that way so the main bundle stays free of MediaPipe.
- **Hand tracking (P3)**: landmark 8 (index tip) = cursor, landmark 4 (thumb tip) = pinch. Dwell-to-activate is the *default* grab gesture (800ms hold within 30px, release after 500ms outside or on tracking loss) because pinch mis-fires frustrate this child — see §4.2.4 for exact thresholds. One Euro Filter smoothing is required (§4.2.3 has starting params). Camera video is never rendered to the child (only a small status icon) — do not add a video preview.
- **Audio**: `AudioGuide.speak(key)` resolves key → `/audio/{key}.mp3` → `speechSynthesis` (ja-JP, 0.9× rate) fallback (§3.2, §4.3). No mp3s exist yet, so everything currently speaks via Web Speech. All voice-line scripts are the `SCRIPTS` map in `AudioGuide.ts` — new child-facing lines go there (and must respect the forbidden-vocabulary list; don't even write those words in that file).
- **Persistence schema** (IndexedDB, §4.5): `core/storage/db.ts` is the entire layer — DB `yubilab` v1 with stores `sessions` (with nested `PlayRecord[]` and thinned `ReplaySample[]` replay trails, 30ms interval, 2000-sample cap), `progress`, `settings`, plus full JSON export/import for the parent screen.
- **"きのうのきみ" highlight feature (§4.6) is core, not optional** — it replays yesterday's actual play trace (from `replay` samples) because this child forgets positive experiences quickly but retains negative ones. Do not deprioritize or cut this even under time pressure.
- **Mode-specific engines are decoupled and each has its own difficulty/adaptation logic** (§8): consecutive success → silently increase difficulty; struggle signals (defined per-mode, e.g. `outRatio > 0.35` twice in a row for mode A) → silently decrease difficulty. Difficulty changes are never announced to the child. 90+ seconds stuck triggers semi-automated assistance per mode (never leave a session ending in "couldn't do it").
- **Mode A ↔ Mode C link**: kanji "mastered" in mode B (§6.4 Lv3) are automatically added to mode C's quiz pool (§7.3) — this cross-mode dependency is intentional, not incidental coupling.

## Implementation order (§10)

P0 (shell/input/audio/storage skeleton) → P1 (Mode A maze, must be shown to the parent once complete — real-world checkpoint tied to a 2026-09-05 clinical session) → P2 (Mode B kanji) → P3 (hand tracking) → P4 (Mode C moji) → P5 (parent dashboard). Each phase must be a complete, shippable-to-the-child experience on its own — don't show icons for unimplemented modes on the home screen.

## Orchestration workflow

あなた（Fable）はオーケストレーターです。計画、分解、統合を行います。

- 推論の重いフェーズ → deep-reasoner
- 機械的な作業 → fast-worker
- Codex（`/codex:rescue --background`）は、deep-reasoner に匹敵する優秀なエンジニアで、異なる視点から。レビュアーではなくピアとして扱います。
- 高リスクの決定：同じ問題で Opus + Codex を並行してタスクし、両者の最高の部分を統合し、互いの回答を見せずに。自分のコンテキストを軽く保つ。
