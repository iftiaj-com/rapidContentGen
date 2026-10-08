# Capabilities

What this workspace can do today, how to call it, and what is still coming. The agent reads this
before planning a job. Status: **ready** (built and verified in a regression job), **built** (built,
not yet regression-verified), **planned** (phase in `PORTING_CHECKLIST.md`).

## Workspace tools (`node tools/rcg.mjs <command>`)

| Command | What it does | Status |
|---|---|---|
| `doctor` | Checks config, ffmpeg (including the edge test for the ffmpeg HyperFrames uses), HyperFrames plugin, Python 3.11, voice venv, Kokoro weights, sources, provenance | ready |
| `new-job` | Creates `jobs/<date>-<slug>/` from a template; copies media; probe + safe-zone sheet; `JOB.md` | ready |
| `beat-sheet validate\|md` | Validates `beat-sheet.json` (overlaps, no-text zones) and writes the approval table | ready |
| `probe` | Streams, fps, duration, loudness, true peak, plus intake notes (no audio, low fps, hot peaks) | ready |
| `sheet` | Labeled contact sheet; `--safe` draws the 9:16 no-text zones | ready |
| `limit` | Peak-limits audio at 4x oversampling to a true-peak ceiling (default -2.5 dBTP) | ready |
| `mix-check` | Rebuilds a composition's mix offline; predicts HyperFrames' whole-mix gain cut within about 0.3 dB | ready |
| `measure-sfx` | Measures onset, crest window, audible end, LUFS and true peak for `library/sfx` | ready |
| `render` | mix-check, HyperFrames render (log saved), then `verify` with a frame sheet | ready |
| `verify` | Dimensions, fps, duration, no dead (black) strip at a frame edge, audio present and not silent, LUFS, true peak, silence windows, "Audio lowered" in the log | ready |
| `voice voices\|effects\|say\|transcribe\|selftest` | Local Kokoro voiceover (54 voices, 9 languages), 33 voice effects + EQ/ambiance/normalize chain, faster-whisper word times aligned to the script, `audio_meta.json` + SRT. Python 3.11 venv; nothing downloads | ready (R1) |
| `level` | Sets integrated loudness as heard (mono is made dual-mono first), then limits peaks; `--dir` for a folder of lines | ready (R1) |
| `captions` | Word timings (audio_meta.json, words JSON or SRT) -> caption sub-composition in an Adits style (tiktok, karaoke, neon, kinetic, modern, subtitle, glitch, retro, earthquake, vertical_ghost); word / 2word / phrase modes; fits the safe box | ready (R1: tiktok, karaoke, kinetic, neon) |
| `title` | Kinetic title card sub-composition: slam, stagger-up, kinetic-pop, type-on; trailer serif or any caption style | ready (R1b) |
| `analyze` | Music -> per-frame audio table (bass/mid/treble/vol/level, kick/snare/hat, 24 bands), kick times, and a seekable shader clock (default / pulse / flywheel / tilt). Pure function: same table every run | ready (R2) |
| `shader` | Any of the 166 AditsShaders objects as an audio-reactive layer (fill or square), driven by the audio table; BIND inputs follow their bands | ready (R2) |
| `beatflash` | Adits beat-flash words: one word per band (or kick/snare/hat) flashes and pulses on hits; effects none/neon/shadow/rgb/vertical_ghost/shake | ready (R2) |
| Beat grid | `tools/voice/.venv/Scripts/python.exe <plugin>/skills/music-to-video/scripts/analyze-beatgrid.py <music> -o data/audiomap.json` (tempo, beats, downbeats, phases). HyperFrames `beats` only reads a project's own music clip | ready (R2) |
| `camera` | Camera on footage: an element (usually a `.shot` wrapper) follows cues from the 46 Adits camera moves (whip pans, crash zooms, handheld, orbit, drone...) and the 20 Adits Virtual Camera presets (`vc.ken_burns`, `vc.lean_sweep`, `vc.dutch_angle_drift`...). Layers combine (`a/` handheld + `b/` whips); `bars=N` with `--bpm` syncs to the beat; `--kick` adds beat shake; presets take `d=`, `curve=`, `zigzag=`, `hh=` (handheld) and `react=` (bass_zoom, bass_shake, mid_sway, treble_tilt, jitter_stutter, audio_speed, needs `--audio`). `--fill blur` (default on footage: blurred copy behind revealed edges, the Adits look), `cover` (one fixed zoom per cue) or `none`. `--list` prints every name | ready (R3, R3b) |
| `three` | Procedural three.js scene sub-composition (orb, knot, crystal, rings + seeded starfield) with the 3D camera driven by the same 46 moves; optional audio-reactive bass swell and kick shake. Moves only (presets are 2D) | ready (R3) |
| Shader catalog | `node tools/shaders/catalog.mjs --find "<look>"` searches `library/shaders-catalog.json` | ready |
| `hf` | Runs the HyperFrames CLI via the plugin launcher (`--cwd <job>`). Passes `bin.hfFfmpeg` / `bin.hfFfprobe` and a per-ffmpeg frame cache folder. Auto-handles graded footage at t=0: render gets `--browser-timeout 180`, check/snapshot run on a grade-free mirror | ready |
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
| Three.js scenes | `three` adapter, `hf-seek` time | Used by `rcg three` (three@0.181.2 from jsDelivr, imported inside the sub-composition) |
| Speed / slow motion | `data-playback-rate`, `rate` lanes | 24 fps footage below 1x stutters |
| TTS (built in) | `tts` (Kokoro ONNX) | Prefer `rcg voice` (same voices plus 33 effects and script-aligned word times); HF's would download its own model copy |

## Library

| Item | Path | Status |
|---|---|---|
| Measured SFX (19 sounds, Pixabay license) | `library/sfx/manifest.json` | ready |
| Grades: `trailer-cold`, `trailer-warm` | `library/recipes/grades.json` | ready (mop-star) |
| Vertical 9:16 template | `templates/vertical-1080x1920/` | ready (R0) |
| Caption style presets (10, from Adits) | `library/caption-styles.json` | ready (R1) |
| AditsShaders (166 objects + validator, compile check, frame renderer, guide) | `library/adits-shaders/` (see `docs/shaders/README.md`) | ready (R2: 166/166 validate + compile) |
| Kokoro weights (git-ignored) | `models/` | ready |
| Camera runtime: 46 Adits moves + 20 Virtual Camera presets, pure functions of time | `library/runtime/camera-moves.js` (copied into each job's `lib/` by `rcg camera`) | ready (R3, R3b) |

## Coming next (see `PORTING_CHECKLIST.md`)

| Phase | Adds |
|---|---|
| P4 | flowEditor camera flythrough over cards, layouts, entrances, Ken Burns, beat snap |
| P5 | Recipes, end-to-end job using everything |
| P6 | Footage FX pre-pass (Adits GLSL effects, VJ deck), WGSL trial, 3D environments, newspaper background, `.flow` import |
