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
| ☑ | Offline footage FX harness: runs Adits effects and environments unmodified, frame by frame, deterministic (frame-time clock, seeded random, one rAF per frame), Adits render-loop parity, pre-roll for stateful effects, side B, WebGPU | Adits render loop (`core/main.js`), UI defaults and ranges (`index.html`), presets (`core/main.js`) | Port: headless Chrome over the DevTools protocol (no dependencies); defaults, ranges and presets extracted as data | `tools/fx/` (`rcg fx`), `library/fx/harness.*`, `library/fx/effects.json`, `library/fx/shims/` | P6 |
| ☑ | 3D environments: SmokeEnv (ambient, jet, mist), RainSystem (wind, colour modes, splashes), HoloSheen | `core/anam/{SmokeEnv,RainSystem,HoloSheen,anam-utils}.js`, `assets/visuals/smoke.png`, three.js r184 (MIT) | Copy (unmodified), plus host shims that rebuild AnamorphicCamera's scene (camera 35° at z 5, ACES, transparent clear); rendered over footage by `rcg fx`. `smoke.png`: license not documented in Adits | `library/adits-fx/core/anam/`, `library/fx/shims/env-*.js` | P6 |
| ☐ | 3D environments: BlackHole, Clouds, TunnelCorridor | `core/anam/*` | Defer (not in the P6 selection; the env host shim is ready) | `rcg fx` | later |
| ☑ | GLSL footage effects: FrameTunnel (30 presets), RevealUnder (5 presets), SplitScreen (linear split or 10 mask shapes) with side B from a second clip | `effects/video/{FrameTunnel,RevealUnder,SplitScreen}.js`, `shared/{BaseEffect,gl-link}.js`, `assets/visuals/{bird.gif,flower.png,leaf.png}` | Copy (unmodified); offline pre-pass (`rcg fx`). Mask images: license not documented in Adits | `library/adits-fx/effects/video/` | P6 |
| ☐ | GLSL footage effects: PixelStretch, ReversePhi; VJ deck 8 FX + 47 presets | `effects/video/*.js`, `effects/vj/` | Defer (not in the P6 selection; the harness is ready) | `rcg fx` | later |
| ☑ | WGSL (WebGPU) effects: HeatHaze, BlowPixels | `effects/video/{HeatHaze,BlowPixels}.js` | Copy (unmodified). WebGPU runs in the installed Chrome (`--headless=new`); HyperFrames' headless shell cannot create a device (no `dxil.dll`) | `rcg fx` | P6 |
| ☐ | About 27 more WGSL (WebGPU) effects | `effects/video/*.js` | Defer (the WebGPU path is proven) | `rcg fx` | later |
| ☑ | Canvas footage effects: Motion Trail (MotionTrails), Ghost (AdvGhost), Origami | `effects/video/{MotionTrails,AdvGhost,Origami}.js` | Copy (unmodified); pre-roll builds the history of the stateful ones (ghost 2.5 s, trails 2 s) | `rcg fx` | P6 |
| ☐ | Voxels + Rapier physics, explode, 2D→3D relief, invisibility cloak, motion extraction | various | Defer | — | P6 |
| ☐ | Social frames, doodle overlay (rough.js) | `effects/frames/SocialFrames.js`, Doodle | Port | `library/blocks/frames/`, `doodle/` | P6 |
| ☑ | Advance JSON segment schema + prompt builder | `effects/auto/advance/` | Learn → shape of `beat-sheet.json` | `docs/job-spec.md` | P0 |
| ☑ | Presets: auto (18), VJ, Advance recipes (6); time-remap; speed sync | `auto-presets.js`, `vj-presets.js`, `advance/recipes.js`, `TimeRemap.js`, `core/main.js` Speed Sync | Learn → 6 styles + 8 sections (`rcg recipe`); TimeRemap ported (seeded); Speed Sync ported as a rate lane (`rcg ramp`, at least 1x). VJ presets wait for the P6 footage FX | `library/recipes/`, `tools/recipes/`, `tools/blocks/ramp.mjs` | P5 |
| ☑ | Transitions: flash white/black, glitch punch, zoom punch, crossfade | `effects/auto/Transitions.js` | Port: same curves and constants; timeline time and a seeded glitch instead of `performance.now()` / `Math.random()`; the crossfade works (Adits blends a frame with itself); punch and bands move the footage layers and any PNP following them | `tools/blocks/transition.mjs` (`rcg transition`) | P7 |
| — | Audio mixing; `AudioEngine.analyze()` | `core/audio-engine.js` | HF mixing; analysis replaced by the AditsStudio port | — | — |
| — | Grading, HSL | `AdvLightroom` | HF (`data-color-grading`) | — | — |
| ☑ | Color mask (Global Color Mask: chroma key, modes media / effect / color, tolerance, feather, invert) | `core/ColorMask.js` | Copy (unmodified, WebGPU path); run by `rcg fx --effect color-mask` (shim); side B = other media or an effect clip | `library/adits-fx/core/ColorMask.js`, `library/fx/shims/color-mask.js` | P7 |
| ☑ | Background removal, pre-baked (MediaPipe selfie segmenter) | `core/ARBackgroundRemoval.js`, `core/BakedBackgroundRemoval.js`, `core/lib/mediapipe-wasm/`, `mediapipe-models/selfie_segmenter.tflite` | Port: every source frame at the source rate, VP9-alpha cut-out + hole-cut plate; adds threshold, temporal blend, feather and choke (Adits has no refinement). MediaPipe files copied, git-ignored (`models/mediapipe/`) | `tools/track/matte.mjs` (`rcg matte`), `library/vision/` | P7 |
| ☑ | Face and hand tracking (FaceLandmarker, HandLandmarker; Adits gesture fallback, pinch, palm open, ROI crop pass) | `core/VisionEngine.js`, `core/GestureEngine.js`, `face_landmarker.task`, `hand_landmarker.task` | Port: every frame on frame time (Adits: 15 fps on wall time), crop fallback for small faces, One-Euro on frame time, gesture events (120 ms hold) | `tools/track/track.mjs` (`rcg track`) | P7 |
| ☑ | Camera moves that follow the tracked subject (zoom, punch, follow; landscape to 9:16 reframe) | new (Adits has no face-follow camera; its tracking drives 3D parallax and gesture zoom) | New: `face.*` cues on the camera block, subject path from the track, uncropped layout so the camera can pan the whole source | `library/runtime/face-reframe.js`, `tools/blocks/camera.mjs` | P7 |
| ☑ | PNP mode: the same media again on top with its background removed; plus offset / side copy, another moment, filters, show windows, block build | `core/main.js` 9146-9216 (pnpToggle, pnpRemoveBgToggle, pnpOpacitySlider) | Port: a cut-out layer that follows the shot's camera; Adits has no position, scale or entrance controls for PnP | `tools/blocks/pnp.mjs` (`rcg pnp`) | P7 |
| ☑ | Captions "BG Vid to PNP Vid" and back (depth position per caption line) | `core/main.js` 9138-9144 (atcBgToPnpToggle, atcBgToPnpSlider) | Port: any block (captions, titles) behind or in front of a PNP; timed switches, or Adits' depth rule per caption group | `tools/blocks/layer.mjs` (`rcg layer`) | P7 |
| ☑ | Effects Target (background / foreground), switchable during the edit | `core/main.js` 8679, 9147-9206 (pnpApplyTo) | Port: `rcg fx --matte --apply both` writes the effect clip and its subject-only alpha twin; `rcg target` places them by time window (bg: effect under the clean cut-out; fg: masked effect on top) | `tools/fx/fx.mjs`, `tools/blocks/target.mjs` | P7 |
| — | MIDI, recorders, share links, Worker, UI, HEIC | various | Skip | — | — |

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

## Ported so far, by source

Counts are checklist rows (one row can hold several features). "Waiting" means not ported yet;
"No work needed" means HyperFrames covers it, it is learn-only, or it was skipped.

| Source | Ported ☑ | Waiting ☐ | On hold | No work needed |
|---|---|---|---|---|
| Adits_Modular | 21 | 5 | 1 (GLB models) | 3 |
| AditsShaders | 6 | 0 | 0 | 1 |
| AditsStudio | 2 | 0 | 0 | 2 |
| flowEditor | 6 | 2 | 0 | 1 |
| TTS app | 6 | 1 | 0 | 2 |
| mop-star lessons | 2 | 0 | 0 | 0 |
| **Total** | **43** | **8** | **1** | **9** |

**Adits effects in `library/adits-fx/` (copied unmodified, run by `rcg fx`), 11 of them:**
- Footage, canvas: Ghost (`AdvGhost`), Motion Trail (`MotionTrails`), Origami.
- Footage, WebGPU: Heat Haze (`HeatHaze`), Blow Pixels (`BlowPixels`).
- Footage, GLSL: Frame Tunnel (`FrameTunnel`), Reveal Under (`RevealUnder`), Split Screen (`SplitScreen`).
- 3D environments: Smoke (`SmokeEnv`), Rain (`RainSystem`), Holo Sheen (`HoloSheen`).

**Ported in P7 (tracking and layers), from Adits:** MediaPipe face and hand tracking (`rcg track`),
background removal with the selfie segmenter (`rcg matte`), PNP mode (`rcg pnp`), captions BG Vid to
PNP Vid (`rcg layer`), Effects Target bg/fg (`rcg target`), the four cut transitions
(`rcg transition`), the Global Color Mask (`rcg fx --effect color-mask`), plus new face-anchored
camera cues (`rcg camera --track`). MediaPipe wasm and 3 models are copied but git-ignored
(`models/mediapipe/`, like the Kokoro weights).

**Still waiting (rows marked ☐ above):**
- Adits: BlackHole, Clouds and TunnelCorridor environments; PixelStretch, ReversePhi and the VJ
  deck; about 27 more WGSL effects; voxels/physics and the other heavy effects; social frames and
  doodle.
- flowEditor: newspaper background; `.flow` import.
- TTS app: pyttsx3, gTTS, Piper, Melo engines.
- On hold: the 26 Adits GLB models (no license notes).

## Progress summary

| Phase | Scope | Regression job | Status |
|---|---|---|---|
| P0 Foundation | tools, config, template, docs, provenance | R0 mop-star rebuild | ☑ done 2026-10-07: all verify checks pass, PSNR 72 dB vs reference |
| P1 Voice + captions | voice venv, voice CLI, caption blocks, title cards | R1 + R1b | ☑ done 2026-10-08: R1 -14.5 LUFS (mix-check -14.4), 4 caption styles; R1b 4 title presets |
| P2 Shaders + audio | audio table, shader-layer block, 166 shaders, beat-flash | R2 + smoke | ☑ done 2026-10-08: 166/166 validate + compile; shader snapshots identical across runs; music vs silence 15-18 dB |
| P3 3D + camera | camera moves, three-scene, camera-move | R3 + R3b | ☑ done 2026-10-08: 46 moves and 20 presets pass unit and fidelity tests (1440 poses match Adits); 3D snapshots identical across runs; R3 -14.6 LUFS, R3b -14.7 LUFS, all 11 verify checks pass |
| P4 Flythrough | flowEditor modules, flythrough block | R4 + R4b | ☑ done 2026-10-08: R4 8 cards (board, star) snapped to downbeats within 6 ms, -15.8 LUFS, 11/11 verify; R4b cards motion, silent, 8/8; stack arrangement checked by snapshot |
| P5 Integration | recipes, all-in-one job | R5 | ☑ done 2026-10-08: cosmic-promo recipe planned and built in one command (3D, flythrough, shader, beat-flash, camera, ramp, voice, captions, titles); 14.5 s, -15.7 LUFS, 11/11 verify |
| P6 Optional (selected subset) | `rcg fx` harness; Ghost, Motion Trail, Origami, Heat Haze, Blow Pixels, FrameTunnel, RevealUnder, SplitScreen; SmokeEnv, RainSystem, HoloSheen | R6 | ☑ subset done 2026-10-08: 11 effects rendered offline into a 13.75 s reel, -14.8 LUFS, 11/11 verify; Blow Pixels at intensity 0 returns its input exactly; 3 effects byte-identical across two runs |
| P7 Tracking + PNP | MediaPipe face/hand tracking, face-anchored camera, background removal, PNP, layers, transitions, colour mask, effect target | R7 | ☑ done 2026-10-08: a 13.4 s 9:16 edit of the user's 16:9 test clip: face found on 346/346 frames (tracking identical on two runs of a 2 s range), keywords behind the subject, side copy, 4 transitions, colour mask, Blow Pixels switched bg to fg; -14.4 LUFS, 11/11 verify |
| P6 remainder | other footage FX and environments, newspaper background, frames/doodle, `.flow` import, extra TTS engines | none yet | not started |

**Note (2026-10-08):** renders made before this date (mop-star, R0-R3b) had a black 8 px strip down the right edge from an ffmpeg 8.1 conversion bug (lessons 16b). HyperFrames now uses ffmpeg 9.0.2, and R0, R1, R1b, R2 (final + repeat, 51.7 dB apart), R3 and R3b were re-rendered: all pass verify, including the new edge check. The mop-star trailer in `videos/` still has the strip.
