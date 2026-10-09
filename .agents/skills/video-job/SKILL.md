---
name: video-job
description: Turn a user's video(s) + prompt into a finished edit in rapidContentGen. Use for any request to edit, cut, caption, voice over, add titles/motion graphics/shaders/3D, beat-sync, or restyle footage, whether the media arrives in chat or in inbox/. Covers intake, the per-job working mode, beat sheet, audio prep, build, render, verification and report.
---

# Video job workflow

Work from the repo root. Tools: `node tools/rcg.mjs <command>` (run with no command for the list).
Capabilities and how to call them: `docs/capabilities.md`. Pitfalls: `references/lessons.md`.

## 0. Pick the path

Before starting a full job, check whether a fast path fits:

| Request | Path |
|---|---|
| Trim, concat, mute, loudness fix, one static text overlay | Plain ffmpeg (explicit `fontfile`), then `rcg verify`. No HyperFrames project. |
| Captions on talking-head footage, nothing else | HyperFrames `/embedded-captions` workflow inside a job folder |
| Montage cut purely to a music track | HyperFrames `/music-to-video`, verified with `rcg verify` |
| Anything with designed motion graphics, titles, grading, voiceover, shaders, 3D, camera moves | The full workflow below |

## 1. Intake

1. Find the media and prompt: chat attachments/paths, or `inbox/<folder>/` (`prompt.md` + media).
2. Create the job: `node tools/rcg.mjs new-job --name <slug> --video <file> [--audio <file>] [--image <file>] [--prompt-file <file> | --prompt "..."] [--mode a|b|c]`.
   This copies media into `jobs/<id>/assets/`, probes it, writes `data/intake.json`, a safe-zone
   contact sheet per video, and `JOB.md`.
   When the user asks for a video like an earlier one, add `--like jobs/<old-id>`: the old edit
   (index.html, compositions/, lib/, beat sheet, data/*.json, assets/fonts, assets/sfx) is copied
   instead of the template, without footage, voice, music or renders. `JOB.md` lists the assets the
   copied edit references, and data/ timings still describe the old footage, so re-measure first.
3. Read `JOB.md` notes and LOOK at each intake sheet. Notes flag: no audio, low fps, hot peaks.

## 2. Working mode (ask if not given)

If `prompt.md` or the chat did not set a mode, ask the user (with your tool's question prompt if it has one, else in chat):

- **(a) Beat sheet first:** present the beat sheet, wait for OK, then build, check, render and verify with no further stops.
- **(b) Fully autonomous:** plan, build, render, verify, report. No stops.
- **(c) Every stage:** stop for approval after the beat sheet, after the preview (snapshots / Studio), and before the final render.

Record the mode in `JOB.md`. HyperFrames' own workflow asks before rendering; in modes (a) and (b)
that gate is overridden by the user's mode choice (state this in `JOB.md`).

## 3. Analyze (fast, in parallel)

- `rcg probe` output is already in `data/intake.json`.
- Speech? Transcribe for word timestamps (`rcg hf --cwd <job> transcribe <file>` uses whisper.cpp; faster-whisper is in the voice venv from Phase 1).
- Music? Beats: `rcg hf --cwd <job> beats <audio>`; levels: `rcg probe`.
- Look at the frames: where are faces and important action? Plan text around them.
- Footage fps < 30 and the plan needs slow motion: plan a freeze frame or interpolation.

## 4. Beat sheet

**Named looks (style packs, `docs/styles.md`).** If the prompt names or matches a pack
(`rcg style list` prints keywords), load its skill and follow its fast path for steps 4-8:
paper collage, scrapbook, notebook, cut-out, handmade -> `style-tactile-collage`; quiet, editorial,
minimal, premium, product UI -> `style-quiet-editorial`; Vox, parallax, 2.5D, "make photos move",
documentary or archival explainer -> `style-vox-parallax`; promo, ad, personal-brand or testimonial
talking head (one person) -> `style-marketing-pro`; split screen, presenter plus B-roll or an info
video, "two videos", top and bottom -> `skill-split-screen-edit`; infographic, explainer, video essay,
faceless or topic-only video, "make a video about X", or a script plus assets -> `skill-info-graphics`. Style packs are built for speech-led edits
(talking heads, voiceover explainers); recipes below cut to music. Using both in one job is untested.

For a styled edit, start from a recipe (`docs/recipes.md`): `rcg recipe list`, pick the style that
matches the prompt (its `keywords`), then `rcg recipe plan --job jobs/<id> --recipe <style>
--duration <s> --seed <n>`. It writes the beat sheet on the beat grid with `<PLACEHOLDERS>` for the
spoken words, titles and beat-flash words (and `data/vo-lines.json`). Write those, regenerate the
table, then `rcg recipe build --job jobs/<id>` does steps 5-7 (voice, assemble, blocks, mix-check,
check). Read its mix-check: when a voice line overlaps SFX, lower the SFX or the voice ceiling in the
recipe, not by hand in index.html, and re-plan (the same seed gives the same plan).

Write `jobs/<id>/beat-sheet.json` (schema: `docs/job-spec.md`), then generate the table:
`node tools/rcg.mjs beat-sheet md jobs/<id>/beat-sheet.json jobs/<id>/beat-sheet.md`.
Fix every ERROR it prints (overlaps, text in no-text zones). Show the table (start/end, spoken
words, on screen, text position, sound). Gate for modes (a) and (c).

Never quote song lyrics in the beat sheet. Describe sections by time instead.

## 5. Pre-production audio (before any render)

- Music: `rcg limit <in> jobs/<id>/assets/<name>-limited.wav` (ceiling -2.5 dBTP). Loudness barely changes.
- SFX: copy from `library/sfx/` into `jobs/<id>/assets/sfx/`. Place each by `crestStartS` from
  `library/sfx/manifest.json` (line the crest start up with the visual hit). Hits are about
  -6.5 LUFS hot; start them low (lane value 0.2-0.35) and check.
- Voiceover (local Kokoro, 54 voices, 9 languages; 33 voice effects):
  1. Write `jobs/<id>/data/vo-lines.json`: `[{"id":"vo1","text":"...","voice":"af_heart"}, ...]`
     (optional per line: `lang`, `speed`, `effects`). `rcg voice voices` / `rcg voice effects` list options.
  2. `node tools/rcg.mjs voice say --lines jobs/<id>/data/vo-lines.json --out-dir jobs/<id>/assets/voice [--effect cinematic]`
     writes `<id>.wav`, `<id>.srt` and `audio_meta.json` (word times aligned to the script; check
     `alignment.matched_fraction`, below 0.8 means the words need a look).
  3. `node tools/rcg.mjs level --dir jobs/<id>/assets/voice --lufs -13.5 --ceiling -1.5`
     (writes stereo; the target is the level as heard in the render).
  4. Place each line as `<audio id="vo1" src="assets/voice/vo1.wav" data-start=".." data-duration="<duration_s>">`.
     Give voice clips their real `data-duration` (lint treats open-ended clips as overlapping).
  5. Duck music under speech with its volume lane (about 0.3 under voice, 0.7 in gaps over 1 s).
- Negative captions (`--negative`, inverted text) always go behind the subject: `rcg matte` and
  `rcg pnp` first, then `--negative --insert --behind p1`, at a height where the background shows
  around the subject (beside the head, not across a body that fills the width). The tool forces
  white, heavy, 1.3x and no pill, stroke, glow or shadow (user rule, R14).
- Captions from voiceover or transcript words (Adits styles: tiktok, karaoke, neon, kinetic,
  modern, subtitle, glitch, retro, earthquake, vertical_ghost):
  `node tools/rcg.mjs captions --job jobs/<id> --words jobs/<id>/assets/voice/audio_meta.json --voice vo1 --style tiktok --mode word|2word|phrase --start <voice data-start> --id cap-vo1 --insert`
  For footage speech, transcribe first: `rcg voice transcribe <file> --out words.json` and pass `--words words.json`.
- Music structure for cuts: `node tools/rcg.mjs beatgrid <music> -o jobs/<id>/data/audiomap.json`
  and cut on `grid.downbeats_sec` (bars) or `grid.beats_sec`.
- Audio-reactive visuals: `rcg shader` (pick with `node tools/shaders/catalog.mjs --find "<look>"`) and
  `rcg beatflash`. Both analyze the music themselves; pass the LIMITED music file and the right
  `--audio-offset` (seconds into the file where the block's t = 0 sits). Shaders are centered objects:
  leave room around foreground footage, and set host z-index in the job CSS. See `docs/shaders/README.md`.
- Volume: use a `data-automation` volume lane; its values ARE the level. Do not also set `data-volume`.
- Run `node tools/rcg.mjs mix-check jobs/<id>/index.html` after the audio is placed. It must print
  `MIX OK` (no predicted gain reduction). Read the per-clip levels: SFX should sit 1-4 dB above
  the music, not 10.

## 6. Build

- Start from the template in the job (`index.html`). Keep the safe-zone conventions.
- Reuse library pieces before hand-building (see `docs/capabilities.md`); search the HyperFrames
  catalog for named looks (`rcg hf catalog --query "<look>" --json`).
- Grades: `library/recipes/grades.json` (`data-color-grading` payloads).
- Text cards flat: spans inside the `.clip`, GSAP animates `#id > span`.
- Camera on footage: put the clips in an untimed `.shot` wrapper that nothing else tweens, then
  `node tools/rcg.mjs camera --job jobs/<id> --target "#w1" --cue "a/0:handheld" --cue "b/5.5:whip_pan_right" [--kick <music>]`.
  Moves (`whip_pan_left`, `crash_zoom_in`, `orbit_cw`...) and Adits presets (`vc.ken_burns`,
  `vc.dutch_angle_drift`...; `--list` prints all). A preset's default duration runs to the next
  cue on its layer, so end it with a cue such as `<cut>:static_shot`. Perspective, spin and whip
  presets reveal edges on 9:16: keep the default `--fill blur` there (`cover` zooms 1.5-2.3x).
  Audio-react presets (`:react=bass_zoom`) need `--audio <limited music>`.
- Card flythrough (photos or clips flown through on a board, flowEditor style): write
  `jobs/<id>/data/flythrough.json` (shape: `docs/job-spec.md`), then
  `node tools/rcg.mjs flythrough --job jobs/<id> --insert --fit-root`. Snap arrivals to the beat grid
  (`"snap": {"beats": "data/audiomap.json", "grid": "downbeats"}`) and read the landing report (beat
  error per card). Whoosh sounds land their crest on the arrival. Duck the music at 0.5, not
  flowEditor's 0.25, when sounds are frequent (R4 hit -16 LUFS at 0.25). `punch` overshoots far on
  long trips; use it between nearby cards.
- 3D: `node tools/rcg.mjs three --job jobs/<id> --scene orb|knot|crystal|rings --cue "a/0:orbit_cw" --cue "b/<downbeat>:crash_zoom_in:i=0.5" [--audio <music>] --duration <s> --id three-x --track <n> --insert`,
  then set the host's z-index in the job CSS. Cue on downbeats from the beat grid.
- Footage effects from Adits (ghost, motion-trails, origami, heat-haze, blow-pixels, frame-tunnel,
  reveal-under, split-screen) and 3D environments over footage (smoke, rain, holo-sheen): render the
  range to a new clip first, then place that clip as a normal shot:
  `node tools/rcg.mjs fx --job jobs/<id> --effect <name> --src assets/<clip> --start <s> --duration <s> [--param id=value] [--preset <name>] [--src2 assets/<b> --start2 <s>] [--audio <limited music> --audio-offset <s>] --sheet --out assets/fx/<name>.mp4`
  (`--list` prints the names; presets and defaults are in `library/fx/effects.json`). READ the sheet
  and any "page console" lines. Some Adits defaults are strong on 9:16 (lessons 13ag): smoke
  ambient covers the frame (use `--preset jet`, or `anamSmokeCount=30 anamSmokeIntensity=25`).
- The footage as an Adits 3D model (voxels with Rapier physics, particles, magic carpet) or cut into a
  collage: the same `rcg fx` call with `voxel-art`, `voxel-drop` (`--preset orbit|tunnel|bursts`,
  `rcgDropAt`), `voxel-hole`, `voxel-magnet`, `voxel-flip`, `voxel-grow`, `particles`, `magic-carpet`
  or `cutout`. Magnet / Grow / Flip / Particles follow `--track data/track-v1.json --anchor hand` or
  `--point "0:0.3,0.4;1.5:0.7,0.6"`. Read lessons 13as-13ax first (the model reads darker, Adits'
  tilt and 63% framing, sparse particles, pinned bass, pressing Drop in the pre-roll).
- Suspense, transition and accent moments (Adits Global Visuals and Video Jockey): the same `rcg fx`
  call with `global-visuals` (`--param fxBnwMode=true`, `fxNegativeMode`, `fxFisheyeEnabled` +
  `fxFisheyeIntensity`, `globalOpacityEnabled` + `globalOpacitySlider`, `fxRgbColors` / `fxNeonMode`
  with `--audio`) or a VJ FX with an Adits preset: `vj-scan`, `vj-lights`, `vj-lightshow`,
  `vj-beatwash` `--preset <key>` (keys in `docs/capabilities.md`). Give audio presets
  `--audio <limited music> --audio-offset <the shot's start in the edit>` so hits land on the music.
  Letterbox / pillarbox bars: `rcg cinema --job jobs/<id> --ud --pos 12 --curve 35 --show a-b`
  (`--behind p1` puts them under the cut-out). Read lessons 13bs-13bu.
- Subject tracking, cut-outs and layers (talking heads, "text behind the subject"). Build order
  matters (lessons 13an): cameras, then PNP / fx layers, then titles and captions, then layers,
  then transitions.
  1. `rcg track --job jobs/<id> --src assets/<clip> --debug --name v1` and READ the debug sheet
     (orange boxes came from the crop pass; gesture labels need checking, lessons 13al).
  2. `rcg matte --job jobs/<id> --src assets/<clip> --plate --sheet --choke 6 --name v1` and READ the
     sheet. Good on mid shots; full-body action leaks (then ask about HyperFrames' u2net download).
  3. Face-anchored camera per shot wrapper: `rcg camera --job jobs/<id> --target "#w1" --track data/track-v1.json
     --cue "0:face.follow:z=1.05:x=0.5:y=0.35:d=0" --cue "2.4:face.zoom:z=1.7:d=0.3" --cue "4.2:face.zoom:z=1.05"`
     (`face.punch` = instant; a 16:9 clip is reframed to 9:16 automatically).
  4. `rcg pnp --job jobs/<id> --base "#v1" --cutout assets/matte/v1-fg.webm --id p1` (aligned: text can go
     between), or a side copy: `--x -0.3 --scale 0.85 --opacity 0.6 --media-offset -2 --show 5.6-8.6
     --enter blocks --z 25` with an aligned PNP at z 30 over it so the copy sits behind the subject.
  5. Text behind the subject: `rcg title ... --color "#3b1f4a" --position top-band --id kw1 --insert`, then
     `rcg layer --job jobs/<id> --id kw1 --behind p1`. Captions: `rcg layer --id cap-vo1 --behind p1
     --depth 0.5` (behind for the first half of each word or group, then in front) or `--z 40` (front).
  6. Effects on the background or the subject: `rcg fx ... --size <source WxH> --matte assets/matte/v1-fg.webm
     --apply both --out assets/fx/x.mp4`, then `rcg target --job jobs/<id> --base "#v4" --fx assets/fx/x.mp4
     --fx-start <s> --cutout assets/matte/v1-fg.webm --windows "a-b:bg,b-c:fg"`.
  7. Cuts: `rcg transition --job jobs/<id> --at 5 --style zoom_punch|glitch_punch|crossfade|flash_white|flash_black
     --to "#w2" [--from "#w1"]` (Adits defaults: 0.25 s).
- Root `data-duration` must equal the plan.

## 7. Check

- `node tools/rcg.mjs hf --cwd jobs/<id> check`: must pass (lint, runtime, layout, motion, contrast).
- Snapshots at beat midpoints: `rcg hf --cwd jobs/<id> snapshot --at <t1,t2,...> --describe false --output snapshots/beats`, then READ the contact sheet.
- Mode (c): stop here for preview approval (offer `rcg hf --cwd jobs/<id> preview --background`).

## 8. Render + verify

`node tools/rcg.mjs render jobs/<id> --fps <fps> --workers 3 [--silence a-b]`

It runs mix-check, renders, saves `renders/final.log`, and verifies (dimensions, fps, duration,
no dead strip at a frame edge, audio present and not silent, loudness, true peak, no "Audio lowered by"), then writes
`renders/final-sheet.png`. READ the sheet. A failed verify means the job is not done.
Mode (c): ask before this final render.

If verification fails, fix the cause, not the symptom. Each render costs about 2-3 minutes.

## 9. Report

Write `jobs/<id>/report.md`: what was built, the render path, measured specs (duration, fps,
loudness, true peak), deviations from the beat sheet and why, and anything left open. Tick the
stages in `JOB.md`. Give the user the video: attach it if your tool can send files, else give the path to `renders/final.mp4`. In the chat reply, be brief and honest:
say what was verified and what was not (for example: "I cannot listen to audio; the mix was
judged by measurement").
