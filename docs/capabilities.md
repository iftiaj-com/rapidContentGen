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
| `voice voices\|effects\|say\|transcribe\|selftest` | Local Kokoro voiceover (54 voices, 9 languages), 33 voice effects + EQ/ambiance/normalize chain, faster-whisper word times aligned to the script, `audio_meta.json` + SRT. Python 3.11 venv; nothing downloads | ready (R1) |
| `level` | Sets integrated loudness as heard (mono is made dual-mono first), then limits peaks; `--dir` for a folder of lines | ready (R1) |
| `captions` | Word timings (audio_meta.json, words JSON or SRT) -> caption sub-composition in an Adits style (tiktok, karaoke, neon, kinetic, modern, subtitle, glitch, retro, earthquake, vertical_ghost); word / 2word / phrase modes; fits the safe box | ready (R1: tiktok, karaoke, kinetic, neon) |
| `title` | Kinetic title card sub-composition: slam, stagger-up, kinetic-pop, type-on; trailer serif or any caption style | ready (R1b) |
| `hf` | Runs the HyperFrames CLI via the plugin launcher (`--cwd <job>`). Auto-handles graded footage at t=0: render gets `--browser-timeout 180`, check/snapshot run on a grade-free mirror | ready |
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
| TTS (built in) | `tts` (Kokoro ONNX) | Prefer `rcg voice` (same voices plus 33 effects and script-aligned word times); HF's would download its own model copy |

## Library

| Item | Path | Status |
|---|---|---|
| Measured SFX (19 sounds, Pixabay license) | `library/sfx/manifest.json` | ready |
| Grades: `trailer-cold`, `trailer-warm` | `library/recipes/grades.json` | ready (mop-star) |
| Vertical 9:16 template | `templates/vertical-1080x1920/` | ready (R0) |
| Caption style presets (10, from Adits) | `library/caption-styles.json` | ready (R1) |
| Kokoro weights (git-ignored) | `models/` | ready |

## Coming next (see `PORTING_CHECKLIST.md`)

| Phase | Adds |
|---|---|
| P2 | 166 AditsShaders shaders as an audio-reactive `shader-layer` block; per-frame audio table; beat-flash captions |
| P3 | 46 Adits camera moves for footage (`camera-move`) and 3D (`three-scene`) |
| P4 | flowEditor camera flythrough over cards, layouts, entrances, Ken Burns, beat snap |
| P5 | Recipes, end-to-end job using everything |
| P6 | Footage FX pre-pass (Adits GLSL effects, VJ deck), WGSL trial, 3D environments, newspaper background, `.flow` import |
