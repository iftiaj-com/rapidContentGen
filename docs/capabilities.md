# Capabilities

What this workspace can do today, how to call it, and what is still coming. The agent reads this
before planning a job. Status: **ready** (built and verified in a regression job), **built** (built,
not yet regression-verified), **planned** (phase in `PORTING_CHECKLIST.md`).

## Workspace tools (`node tools/rcg.mjs <command>`)

| Command | What it does | Status |
|---|---|---|
| `doctor` | Checks config, ffmpeg, HyperFrames plugin, Python 3.11, voice venv, Kokoro weights, sources, provenance | ready |
| `new-job` | Creates `jobs/<date>-<slug>/` from a template; copies media; probe + safe-zone sheet; `JOB.md` | ready |
| `beat-sheet validate\|md` | Validates `beat-sheet.json` (overlaps, no-text zones) and writes the approval table | ready |
| `probe` | Streams, fps, duration, loudness, true peak, plus intake notes (no audio, low fps, hot peaks) | ready |
| `sheet` | Labeled contact sheet; `--safe` draws the 9:16 no-text zones | ready |
| `limit` | Peak-limits audio at 4x oversampling to a true-peak ceiling (default -2.5 dBTP) | ready |
| `mix-check` | Rebuilds a composition's mix offline; predicts HyperFrames' whole-mix gain cut within about 0.3 dB | ready |
| `measure-sfx` | Measures onset, crest window, audible end, LUFS and true peak for `library/sfx` | ready |
| `render` | mix-check, HyperFrames render (log saved), then `verify` with a frame sheet | ready |
| `verify` | Dimensions, fps, duration, audio present and not silent, LUFS, true peak, silence windows, "Audio lowered" in the log | ready |
| `hf` | Runs the HyperFrames CLI via the plugin launcher (`--cwd <job>`) | ready |
| `provenance copy\|record\|check\|render` | Copies or records material from source projects with commit and sha256 | ready |

## HyperFrames built-ins (via `rcg hf --cwd <job> ...`)

| Capability | Command / mechanism | Notes |
|---|---|---|
| Composition check | `check` (lint, runtime, layout, motion, WCAG contrast) | Must pass before render |
| Snapshots | `snapshot --at t1,t2 --describe false --output snapshots/x` | Writes a contact sheet; read it |
| Studio preview | `preview --background` / `--stop` | For mode (c) preview approval |
| Transcription | `transcribe <file>` (whisper.cpp, `whisper-cli` on PATH) | Word timestamps |
| Beats | `beats <audio>` | Beat grid for cuts |
| Color grading | `data-color-grading` JSON on `<video>`/`<img>` | Recipes: `library/recipes/grades.json` |
| Background removal | `remove-background` | Instead of Adits' MediaPipe |
| Registry blocks | `catalog --query "<look>" --json`, `add <name>` | ~400 blocks: transitions, captions (23 `caption-*`), overlays, grain |
| Three.js scenes | `three` adapter, `hf-seek` time | Basis for Phase 3 3D |
| Speed / slow motion | `data-playback-rate`, `rate` lanes | 24 fps footage below 1x stutters |
| TTS (built in) | `tts` (Kokoro ONNX) | Phase 1 adds the TTS app's voices and effects |

## Library

| Item | Path | Status |
|---|---|---|
| Measured SFX (19 sounds, Pixabay license) | `library/sfx/manifest.json` | ready |
| Grades: `trailer-cold`, `trailer-warm` | `library/recipes/grades.json` | ready (mop-star) |
| Vertical 9:16 template | `templates/vertical-1080x1920/` | ready (R0) |

## Coming next (see `PORTING_CHECKLIST.md`)

| Phase | Adds |
|---|---|
| P1 | Voice CLI (Kokoro 54 voices, Edge voices, 33 voice effects, word timestamps), caption-style presets from Adits, caption blocks (tiktok, karaoke, kinetic, neon), kinetic title card |
| P2 | 166 AditsShaders shaders as an audio-reactive `shader-layer` block; per-frame audio table; beat-flash captions |
| P3 | 46 Adits camera moves for footage (`camera-move`) and 3D (`three-scene`) |
| P4 | flowEditor camera flythrough over cards, layouts, entrances, Ken Burns, beat snap |
| P5 | Recipes, end-to-end job using everything |
| P6 | Footage FX pre-pass (Adits GLSL effects, VJ deck), WGSL trial, 3D environments, newspaper background, `.flow` import |
