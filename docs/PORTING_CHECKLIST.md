# Porting checklist

A box is ticked (☑) only after the item is ported AND verified in a phase's regression job. ☐ = not done yet. — = no work needed (HyperFrames covers it, or skipped). Copies and ports are logged with hashes in `docs/PROVENANCE.md`.

**Progress:** see the summary table at the end.

**Status key:**
- **Copy:** copied as is.
- **Port:** rewritten as an HF block or CLI.
- **HF:** HyperFrames already does it.
- **Learn:** reference only.
- **Hold:** waiting on a license check.
- **Defer:** a later phase.
- **Skip:** not needed.

### 1. Adits_Modular (`Adits_Modular/Adits`)

| ☐ | Feature | Source | Decision | Target | Phase |
|---|---|---|---|---|---|
| ☑ | Caption style presets: fonts, colors, pill, glow (tiktok, karaoke, neon, kinetic, motion3d, flying3d, flow, instagram, spotlight, kinetic_impact) | `shared/active-tracking-captions.js` (style table about line 1737+), `shared/smart-captions.js` | Port presets → `library/caption-styles.json` | — | P1 |
| ☑ | Caption styles rebuilt as seekable DOM+GSAP blocks; word / 2-word / line modes | same | Port (the Adits caption code is stateful, `flashAlpha *= 0.80` and voice-level guessing, so its logic is Learn only) | `library/blocks/captions/<style>/` | P1 |
| ☑ | Beat-flash captions | `shared/captions.js` | Port: per-frame states from the audio table, setter-driven | `tools/blocks/beatflash.mjs` | P2 |
| ☑ | SRT import | caption engines | Port | `tools/captions/srt-to-words.mjs` | P1 |
| ☑ | 46 camera moves (whip_pan, crash_zoom, dolly, orbit, drone…), all pure math | `core/anam/CameraMovements.js` lines 68-130, 308-327, 374-404 | Port, replacing the `performance.now()` clock with timeline time; adds layers, `from`/`rev`, `bars` beat sync, kick shake | `library/runtime/camera-moves.js`; `tools/blocks/camera.mjs` (CSS on footage), `tools/blocks/three.mjs` (3D) | P3 |
| ☑ | 2D camera presets (20, plus curve, zigzag, handheld, 6 audio-react modes, blurred fill) | `core/VirtualCamera.js` | Port into `camera-moves.js` as `vc.*`; 1440 sampled poses match the Adits code; fill from `drawBackground` | `library/runtime/camera-moves.js`, `tools/blocks/camera.mjs` | P3 |
| ☐ | GLB models (26) + planet textures | `assets/models3d/` | **Hold**: no license notes, "bandicoot" may be a third-party character, 5 look like duplicates. Use procedural geometry until cleared. | `library/models3d/` | P3 |
| ☐ | 3D environments: BlackHole, Clouds, SmokeEnv, TunnelCorridor, RainSystem, HoloSheen | `core/anam/*` | Port selectively into `three-scene` | `library/blocks/three-env/` | P6 |
| ☐ | GLSL footage effects: FrameTunnel, PixelStretch, RevealUnder, ReversePhi, SplitScreen; VJ deck 8 FX + 47 presets | `effects/video/*.js`, `effects/vj/` | Defer → offline footage pre-pass (frames → headless page → PNG → ffmpeg) | `tools/fx/prepass.mjs` | P6 |
| ☐ | About 29 WGSL (WebGPU) effects | `effects/video/*.js` | Defer (headless WebGPU unproven) | TypeGPU trial | P6 |
| ☐ | Voxels + Rapier physics, explode, 2D→3D relief, invisibility cloak, motion extraction | various | Defer | — | P6 |
| ☐ | Social frames, doodle overlay (rough.js) | `effects/frames/SocialFrames.js`, Doodle | Port | `library/blocks/frames/`, `doodle/` | P6 |
| ☑ | Advance JSON segment schema + prompt builder | `effects/auto/advance/` | Learn → shape of `beat-sheet.json` | `docs/job-spec.md` | P0 |
| ☑ | Presets: auto (18), VJ, Advance recipes (6); time-remap; speed sync | `auto-presets.js`, `vj-presets.js`, `advance/recipes.js`, `TimeRemap.js`, `core/main.js` Speed Sync | Learn → 6 styles + 8 sections (`rcg recipe`); TimeRemap ported (seeded); Speed Sync ported as a rate lane (`rcg ramp`, at least 1x). VJ presets wait for the P6 footage FX | `library/recipes/`, `tools/recipes/`, `tools/blocks/ramp.mjs` | P5 |
| — | Transitions: flash, glitch punch, zoom punch, crossfade | `effects/auto/Transitions.js` | HF (registry transition blocks) | — | — |
| — | Audio mixing; `AudioEngine.analyze()` | `core/audio-engine.js` | HF mixing; analysis replaced by the AditsStudio port | — | — |
| — | Grading, HSL, color mask; background removal (MediaPipe) | `AdvLightroom`, `ColorMask`, `SelfieMatte` | HF (`data-color-grading`, `remove-background`) | — | — |
| — | Face/hand tracking, MIDI, recorders, share links, Worker, UI, HEIC | various | Skip | — | — |

### 2. AditsShaders

| ☐ | Feature | Source | Decision | Target | Phase |
|---|---|---|---|---|---|
| ☑ | 166 GLSL shader objects (2.2 MB) | `shaders/` | Copy. CREDIT headers checked: all AI-authored; 6 rebuild a Shadertoy technique (flagged) | `library/adits-shaders/shaders/` + `library/shaders-catalog.json` | P2 |
| ☑ | Header parse / validate core | `src/lib/shader-core/{header,parse,validate}.mjs` | Copy | `library/adits-shaders/src/lib/shader-core/` (mirrored layout, imports unchanged) | P2 |
| ☑ | Plain-JS WebGL runtime, any W×H | `scripts/lib/offline-shader.mjs` `PAGE_GL_RUNTIME` lines 145-255 | Port: compile once at init, draw on each seek. Do not use `renderer.ts`, which forces a square canvas. | `tools/blocks/shader.mjs` (generates the layer; runtime inlined per job) | P2 |
| ☑ | Audio Drive flywheel (TIME follows the music) | `src/lib/audio.ts` `AudioSpeed.update` lines 65-87 | Port: integrate in Node at a fixed `dt = 1/fps` into a `shaderTime[]` column, so the output is the same on every render | `tools/audio/analyze.mjs` | P2 |
| ☑ | validate, compile-check, render-frames | `scripts/` | Copy | `library/adits-shaders/scripts/` (run in place) | P2 |
| ☑ | shader-guide, skill, llms docs | `public/` | Copy | `library/adits-shaders/public/` + `docs/shaders/README.md` | P2 |
| — | React gallery, posters (18 MB), SEO, Worker, training media | `src/`, `public/posters`, etc. | Skip | — | — |

### 3. AditsStudio (helpers only)

| ☐ | Feature | Source | Decision | Target | Phase |
|---|---|---|---|---|---|
| ☑ | Music → per-frame AUDIO_* table (pure FFT) | `server/lib/audio-analysis.mjs` `analyseTrack()` line 121 | Port: ffmpeg path from config instead of `ffmpeg-static` | `tools/audio/analyze.mjs` | P2 |
| ☑ | Probe, loudnorm, faststart | `server/lib/ffmpeg.mjs` | Port | `tools/lib/ffmpeg.mjs` | P0 |
| — | Extras (caption, intro/outro, logo) | `server/lib/extras.mjs` | Learn | — | — |
| — | Publishing adapters, queue, DB, UI | `server/`, `ui/` | Skip (posting stays a manual step you approve) | — | — |

### 4. flowEditor

| ☐ | Feature | Source | Decision | Target | Phase |
|---|---|---|---|---|---|
| ☑ | 6 path styles, 8 entrances, Ken Burns dwell (pure GSAP, no imports) | `src/features/sequence/motionStyles.js` | Copy; inlined into each flythrough composition with the `export` keywords stripped | `library/flow/motionStyles.js` | P4 |
| ☑ | 9 layouts + 3 arrangements | `src/features/templates/templateRegistry.js` | Copy (plus `core/constants.js`: ratios, base width, even spread) | `library/flow/templateRegistry.js`, `library/flow/constants.js` | P4 |
| ☑ | Trim, fades, auto-duck, clip windows | `src/features/audio/audioClipUtils.js` | Copy → HF volume lane (envelope × duck × volume); duck depth optional (`"duck": 0.5`) | `library/flow/audioClipUtils.js`, `tools/blocks/flythrough.mjs` | P4 |
| ☑ | Camera flythrough over cards (`board` and `cards` modes, stack arrangement) | `useOfflineRender.js` + `renderFrame.js` (`useSequence.js` learn) | Port as an HF sub-composition, with the fix: `object-fit: cover`, not stretch (`renderFrame.js:343`); video cards show their first frame until arrival | `tools/blocks/flythrough.mjs` (`rcg flythrough`) | P4 |
| ☑ | Snap arrivals to beats | `useSoundtrackAnalysis.js` `snapArrivalsToBeats` line 142 | Copy (pure function, verbatim). Beats come from `analyze-beatgrid.py`; `detectBeats` is Learn only. R4 landings within 6 ms of the downbeats | `library/flow/beatSnap.js` | P4 |
| ☑ | Per-card transition sounds | `transitionAudios`, `renderAudioMix` | Port: library SFX by name, crest on the landing (`"align": "flow"` fires 0.1 s before, as flowEditor) | `tools/blocks/flythrough.mjs` | P4 |
| ☐ | Newspaper background | `src/features/board/renderNewspaper.js` (+2 imports) | Port | `library/blocks/newspaper-bg/` | P6 |
| ☐ | `.flow` import | `src/features/project/projectIO.js` | Port (optional) | `tools/import/flow-to-hf.mjs` | P6 |
| — | Live music-reactive speed, recorders, React UI, IndexedDB, analytics | various | Skip | — | — |

### 5. TTS app (`tts_app modular`)

| ☐ | Feature | Source | Decision | Target | Phase |
|---|---|---|---|---|---|
| ☑ | Kokoro, 54 voices, 9 languages (ONNX path only) | `engines/{base,kokoro_engine}.py` | Copy, with a small `core/paths.py` shim (`bundle_dir`, `user_dir`, `ascii_path`, `FROZEN`) | `tools/voice/engines/` | P1 |
| ☑ | Kokoro weights 325 MB + 28 MB | repo root | Copy (git-ignored) | `models/` | P1 |
| — | Edge TTS, 9 voices (cloud; text goes to Microsoft) | `engines/edge_engine.py` | Skipped: user declined Edge TTS at install (2026-10-07) | `tools/voice/engines/` | P1 |
| ☑ | 33 voice effects | `effects/{audio_effects,registry}.py` | Copy | `tools/voice/effects/` | P1 |
| ☑ | Post chain: silence removal → speed → effect → EQ → ambiance → normalize −3 dB | `ui/app.py` `_generate_worker` | Port into one function (no UI import) | `tools/voice/pipeline.py` | P1 |
| ☑ | Word timestamps | `core/subtitles.py` | Port as new code without torch: faster-whisper words aligned to the script, written in HF `audio_meta.json` shape `voices[].{id,path,duration_s,words[]}` plus SRT | `tools/voice/voice_cli.py` | P1 |
| ☑ | Audio I/O, constants, self-test | `core/{audio_io,constants,selftest}.py` | Copy / port | `tools/voice/` | P1 |
| ☐ | pyttsx3, gTTS, Piper, Melo | `engines/*` | Defer | — | P6 |
| — | GUI, pygame, PyInstaller and installer | `ui/`, `build_exe.py`, `installer.iss` | Skip | — | — |

### 6. Lessons from the mop-star-trailer job

| ☐ | Item | Target |
|---|---|---|
| ☑ | Vertical template: letterbox, safe-zone text cards, cold/warm grades, audio lanes | `templates/vertical-1080x1920/` (from `videos/mop-star-trailer/index.html`) |
| ☑ | Known pitfalls: lane overrides `data-volume`; the riser's real peak is at 3.04 s; limit music to −1 dBTP first; fail the job on "Audio lowered by"; check the mix offline before rendering; footage below 1x speed stutters (freeze frame or `minterpolate`); PowerShell BOM (write JSON from Node); Windows paths, never `/tmp`; ffmpeg `fontfile` | `CLAUDE.md` + `.claude/skills/video-job/references/lessons.md` |

---

## Progress summary

| Phase | Scope | Regression job | Status |
|---|---|---|---|
| P0 Foundation | tools, config, template, docs, provenance | R0 mop-star rebuild | ☑ done 2026-10-07: all verify checks pass, PSNR 72 dB vs reference |
| P1 Voice + captions | voice venv, voice CLI, caption blocks, title cards | R1 + R1b | ☑ done 2026-10-08: R1 -14.5 LUFS (mix-check -14.4), 4 caption styles; R1b 4 title presets |
| P2 Shaders + audio | audio table, shader-layer block, 166 shaders, beat-flash | R2 + smoke | ☑ done 2026-10-08: 166/166 validate + compile; shader snapshots identical across runs; music vs silence 15-18 dB |
| P3 3D + camera | camera moves, three-scene, camera-move | R3 + R3b | ☑ done 2026-10-08: 46 moves and 20 presets pass unit and fidelity tests (1440 poses match Adits); 3D snapshots identical across runs; R3 -14.6 LUFS, R3b -14.7 LUFS, all 11 verify checks pass |
| P4 Flythrough | flowEditor modules, flythrough block | R4 + R4b | ☑ done 2026-10-08: R4 8 cards (board, star) snapped to downbeats within 6 ms, -15.8 LUFS, 11/11 verify; R4b cards motion, silent, 8/8; stack arrangement checked by snapshot |
| P5 Integration | recipes, all-in-one job | R5 | ☑ done 2026-10-08: cosmic-promo recipe planned and built in one command (3D, flythrough, shader, beat-flash, camera, ramp, voice, captions, titles); 14.5 s, -15.7 LUFS, 11/11 verify |
| P6 Optional | footage FX pre-pass, WGSL, extras | — | not started |

**Note (2026-10-08):** renders made before this date (mop-star, R0-R3b) had a black 8 px strip down the right edge from an ffmpeg 8.1 conversion bug (lessons 16b). HyperFrames now uses ffmpeg 9.0.2, and R0, R1, R1b, R2 (final + repeat, 51.7 dB apart), R3 and R3b were re-rendered: all pass verify, including the new edge check. The mop-star trailer in `videos/` still has the strip.
