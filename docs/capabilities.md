# Capabilities

What this workspace can do today, how to call it, and what is still coming. The agent reads this
before planning a job. Status: **ready** (built and verified in a regression job), **built** (built,
not yet regression-verified), **planned** (phase in `PORTING_CHECKLIST.md`).

## Workspace tools (`node tools/rcg.mjs <command>`)

| Command | What it does | Status |
|---|---|---|
| `doctor` | Checks config, ffmpeg (including the edge test for the ffmpeg HyperFrames uses), HyperFrames plugin, Python 3.11, voice venv, Kokoro weights, the MediaPipe files, the browser `rcg fx` will use (WebGPU needs an installed Chrome), sources, provenance | ready |
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
| `title` | Kinetic title card sub-composition: slam, stagger-up, kinetic-pop, type-on; trailer serif or any caption style; `--color` for dark text on light footage, `--y` for any height | ready (R1b) |
| `analyze` | Music -> per-frame audio table (bass/mid/treble/vol/level, kick/snare/hat, 24 bands), kick times, and a seekable shader clock (default / pulse / flywheel / tilt). Pure function: same table every run | ready (R2) |
| `shader` | Any of the 166 AditsShaders objects as an audio-reactive layer (fill or square), driven by the audio table; BIND inputs follow their bands | ready (R2) |
| `beatflash` | Adits beat-flash words: one word per band (or kick/snare/hat) flashes and pulses on hits; effects none/neon/shadow/rgb/vertical_ghost/shake | ready (R2) |
| Beat grid | `tools/voice/.venv/Scripts/python.exe <plugin>/skills/music-to-video/scripts/analyze-beatgrid.py <music> -o data/audiomap.json` (tempo, beats, downbeats, phases). HyperFrames `beats` only reads a project's own music clip | ready (R2) |
| `camera` | Camera on footage: an element (usually a `.shot` wrapper) follows cues from the 46 Adits camera moves (whip pans, crash zooms, handheld, orbit, drone...) and the 20 Adits Virtual Camera presets (`vc.ken_burns`, `vc.lean_sweep`, `vc.dutch_angle_drift`...). Layers combine (`a/` handheld + `b/` whips); `bars=N` with `--bpm` syncs to the beat; `--kick` adds beat shake; presets take `d=`, `curve=`, `zigzag=`, `hh=` (handheld) and `react=` (bass_zoom, bass_shake, mid_sway, treble_tilt, jitter_stutter, audio_speed, needs `--audio`). `--fill blur` (default on footage: blurred copy behind revealed edges, the Adits look), `cover` (one fixed zoom per cue) or `none`. Subject-anchored cues with `--track` (rcg track): `face.zoom`, `face.punch`, `face.follow`, `face.off` (`z=` zoom, `x=/y=` where the subject sits, `k=` follow, `d=`, `ease=`), `--anchor face|eyes|hand`; a clip of another aspect is laid out uncropped so the camera can reframe it (16:9 to 9:16). `--list` prints every name | ready (R3, R3b; face cues R7) |
| `three` | Procedural three.js scene sub-composition (orb, knot, crystal, rings + seeded starfield) with the 3D camera driven by the same 46 moves; optional audio-reactive bass swell and kick shake. Moves only (presets are 2D) | ready (R3) |
| `flythrough` | flowEditor camera flythrough as a sub-composition. A JSON spec (`data/flythrough.json`) lists cards (image or video, ratio, arrival, dwell, zoom, `pathStyle` smooth/linear/arc/whip/punch/kenburns, `entrance` fade/slide-*/scale/pop, optional transition `sound`) and settings (`motion` board/cards, `arrangement` none/stack, `template` left/right/up/down/star/left-right/..., spacing, card scale, radius, background colour/texture/image). `snap` lands arrivals on the beat grid; `music` adds the song with fades, clip windows and auto-duck as a volume lane. Media is cover-cropped. `--list` prints the names | ready (R4, R4b) |
| `recipe list|show|plan|commands|build` | Edit recipes (`docs/recipes.md`): `plan` drafts a beat sheet from a style (sections snapped to downbeats, shots to beats, seeded source picks, camera cues, sounds, voice slots, flythrough specs with stills) and leaves placeholders for words and titles; `build` runs voice, assemble and every block, then mix-check and check | ready (R5) |
| `assemble` | Builds index.html from the beat sheet: shots in camera wrappers (full frame or a card over a background), black cards, music with fades and a duck under the voice, voice lines, SFX by crest, white flashes, layer order; then camera cues and ramps | ready (R5) |
| `ramp` | Speed ramp on a footage clip as a rate lane: Adits audio speed sync (`--min/--max`) or explicit points; refuses below 1x; checks the source does not run out | ready (R5) |
| `fx` | Adits footage effects and 3D environments rendered offline over a range of a clip into a new clip, placed like any footage. The unmodified Adits code runs in headless Chrome (the installed Chrome, for WebGPU) with a frame-time clock, seeded random and the Adits render loop, so the same inputs give the same clip. Effects: `ghost`, `motion-trails`, `origami`, `heat-haze` and `blow-pixels` (WebGPU), `frame-tunnel` (30 presets), `reveal-under` (5 presets), `split-screen` (linear or 10 mask shapes), `color-mask` (Adits chroma key: modes media / effect / color); the last three take side B from `--src2`. `--matte <cut-out> --apply both` also writes `<clip>-fg.webm`, the effect on the subject only (for `rcg target`). Environments: `smoke` (presets `ambient`, `jet`, `mist`), `rain`, `holo-sheen`. `--param id=value` sets any Adits UI control, `--preset`, `--audio` (+ `--audio-offset`) drives audio-reactive controls, `--alpha` writes ProRes 4444 with alpha, `--sheet` writes a frame sheet. About 20-45 s per 1.5 s at 1080x1920. `--list` prints the names | ready (R6) |
| `track` | MediaPipe face and hand tracking (Adits' FaceLandmarker / HandLandmarker, local models) on every frame, on frame time: per-frame face box, eye centre, roll and size; hands (palm, size, pinch, open, Adits gesture labels); gesture events held 120 ms. Crop fallback for small faces. One-Euro smoothing. `--debug` draws boxes, points and hand skeletons to a clip and sheet | ready (R7) |
| `matte` | Background removal with MediaPipe's selfie segmenter (Adits' pre-baked removal): every source frame at the source rate, `assets/matte/<name>-fg.webm` (VP9 alpha) and `--plate` (hole-cut background). `--lo/--hi` threshold, `--temporal`, `--feather`, `--choke` (erode the edge rim). Best on mid shots; full-body action leaks | ready (R7) |
| `pnp` | A PNP layer (Adits PNP Mode): the footage again on top with its background removed. Aligned (text can sit between) or an offset copy (`--x/--y/--scale/--rotate/--flip`, `--media-offset` for another moment, `--filter`, `--opacity`), show windows with fade, scale or block-build entrances; follows the shot's camera | ready (R7) |
| `layer` | Puts a block (captions, title) behind or in front of a PNP (text behind the subject), with timed switches or Adits' depth rule per caption group (`--depth 0.5`: behind for the first half of each group, then in front) | ready (R7) |
| `transition` | Adits cut transitions at a cut: `flash_white`, `flash_black`, `glitch_punch`, `zoom_punch`, `crossfade`; Adits curves, seeded, frame-exact; the punch moves the shot and its PNP layers together | ready (R7) |
| `target` | Effect target (Adits Effects Target), switchable by time window: `bg` = the effect clip under the clean cut-out, `fg` = the effect on the subject only (`rcg fx --matte <cut-out> --apply both` makes both clips) | ready (R7) |
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
| Background removal | `remove-background` (u2net_human_seg, a one-time 168 MB download, not installed yet) | `rcg matte` (MediaPipe, local) is the default; try this for full-body footage, after asking |
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
| Recipes: 6 styles, 8 sections, 4 grades | `library/recipes/styles.json`, `sections.json`, `grades.json` (schema `docs/recipes.md`) | ready (R5) |
| flowEditor modules: motion styles, templates, audio clip utils, constants (copied), beat snap | `library/flow/` (used by `rcg flythrough`) | ready (R4) |
| Camera runtime: 46 Adits moves + 20 Virtual Camera presets, pure functions of time | `library/runtime/camera-moves.js` (copied into each job's `lib/` by `rcg camera`) | ready (R3, R3b) |
| MediaPipe tasks-vision 0.10.35 WASM + face, hand and selfie-segmenter models (copied from Adits, git-ignored) | `models/mediapipe/`; harness `library/vision/` (served by the fx server at `/models/`) | ready (R7) |
| Face-reframe runtime: subject-anchored zoom / follow, pure function of time | `library/runtime/face-reframe.js` (copied into each job's `lib/` by `rcg camera`) | ready (R7) |
| Adits footage effects (8 + colour mask) and 3D environments (3), copied unmodified, with three.js r184 and the mask/smoke images | `library/adits-fx/` (mirrors the Adits layout); registry of UI defaults, ranges and presets `library/fx/effects.json`; harness page and host shims `library/fx/` | ready (R6) |

## Coming next (see `PORTING_CHECKLIST.md`)

| Phase | Adds |
|---|---|
| Later (P6 remainder) | More footage effects through `rcg fx` (PixelStretch, ReversePhi, about 27 more WGSL effects, VJ deck), BlackHole, Clouds and TunnelCorridor environments, newspaper background, social frames and doodle, `.flow` import, extra TTS engines |
