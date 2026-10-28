---
name: video-job
description: Turn a user's video(s) + prompt into a finished edit in rapidContentGen. Use for any request to edit, cut, caption, voice over, add titles/motion graphics/shaders/3D, beat-sync, or restyle footage, whether the media arrives in chat or in inbox/. Covers intake, the per-job working mode, beat sheet, audio prep, build, render, verification and report.
---

# Video job workflow

Work from the repo root. Tools: `node tools/rcg.mjs <command>` (run with no command for the list).
Capabilities and how to call them: `docs/capabilities.md`. Pitfalls: `references/lessons.md`.

**Judgment and sub-agents** (AGENTS.md, "Delegation"): code measures, you judge from the compact
files each step writes (`transcript.txt`, `candidates.md`, `review.md`, `paper-edit.md`,
`plan-check.json`), never from raw word JSON or frames. You may hand a bounded list (cut candidates,
clip scores, one clip's plan in a batch) to a sub-agent with one compact file, its rules and the fixed
answer file; check its answer against your own reading and the code checks before using it. Keep the
story, the beat sheet, the style choice and anything the user approves. For a short list, do it yourself.

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
   Other agent sessions may be working in this workspace. For the inbox, run `rcg inbox list` and take
   only the folder the user named, or a `free` one. `new-job` claims the folder (`.rcg-claim.json`) and
   refuses one another job holds: tell the user, do not pass `--reclaim` unless they ask. Folders
   ending in `-Complete` are finished jobs: ignore them (`inbox list` hides them; `new-job` refuses them).
2. Create the job: `node tools/rcg.mjs new-job --name <slug> --video <file> [--audio <file>] [--image <file>] [--prompt-file <file> | --prompt "..."] [--mode a|b|c] [--template horizontal-1920x1080]`
   (9:16 by default; `--template horizontal-1920x1080` for a 16:9 edit).
   This copies media into `jobs/<id>/assets/`, probes it, writes `data/intake.json`, a safe-zone
   contact sheet per video, and `JOB.md`.
   When the user asks for a video like an earlier one, add `--like jobs/<old-id>`: the old edit
   (index.html, compositions/, lib/, beat sheet, data/*.json, assets/fonts, assets/sfx) is copied
   instead of the template, without footage, voice, music or renders. `JOB.md` lists the assets the
   copied edit references, and data/ timings still describe the old footage, so re-measure first.
3. Read `JOB.md` notes and LOOK at each intake sheet. Notes flag: no audio, low fps, hot peaks.
4. Follow the user's learned rules: the "Learned rules" section at the end of this skill (every job),
   the one in the style skill you use, and the one in `JOB.md`. To see them in order with each
   setting's value: `node .agents/skills/learning-from-user-taste/scripts/learn.mjs effective --style <slug> --job jobs/<id>`.
   A setting is passed as the flag its line names. When the user reacts to a result ("captions too
   small", "too many zooms") or changes something at an approval stop, follow the
   `learning-from-user-taste` skill: it sorts bug, one-off and taste, and saves only taste.

## 1b. Cut (the user's own raw talking take)

Run it when the footage is the user's own recording of themself talking, raw (retakes, false starts,
"um", long pauses), and the user did not say it is already cut. Skip it for stock or B-roll footage,
an already edited clip, or music-only edits. Every later step works from the cut:
`assets/cut/<name>.mp4` and the re-timed `data/words.json`.

1. `rcg cut transcribe jobs/<id> [--src assets/<take>]` (Whisper `base`, cached; about a quarter of the take's length).
2. `rcg cut propose jobs/<id>`, then read only `data/cut/transcript.txt` and `data/cut/candidates.md`
   (never `words.raw.json`). Answer every candidate in `data/cut/decisions.in.json`: `cut`, `keep` or
   `unsure`; for a restart, `cut` removes the EARLIER attempt (last take wins), and an earlier take that
   is better is `{"answer": "cut", "keep": "first"}` (goes to the user). Rules: when in doubt, keep; a
   quotative "like" ("my brain is like, okay") stays; a clean repeat for emphasis stays. A long list can
   go to a sub-agent with this file as its only input; check its answers against `transcript.txt`.
   Spans the code missed go in `"extra"`.
3. `rcg cut apply jobs/<id>` -> `spans.json` + `review.md` (what the user decides).
4. `rcg cut build jobs/<id>`, then read `paper-edit.md` straight through as the viewer will hear it.
   CLIPPED words or joins "still in speech" are listed there.
5. `rcg cut render jobs/<id>` (heavy-work slot), then `rcg cut verify jobs/<id>`. MISSING (a kept word
   lost at a join) or SURVIVED (a removed word still heard): one fix round (`--pad`, `--gap-quiet-db`,
   a span in `"extra"`), then show the user what is left. NOT HEARD far from a join and HEARD
   DIFFERENTLY are transcriber variance, not cut errors.
6. A misheard name: `rcg cut fix jobs/<id> old=new` (kept in `fixes.json` for later transcripts).
7. Show the user `paper-edit.md` and `review.md` (and the cut), and continue only after they approve
   it. In mode (b) state the cut in the report instead.

## 2. Working mode (ask if not given)

If `prompt.md` or the chat did not set a mode, ask the user (with your tool's question prompt if it has one, else in chat):

- **(a) Beat sheet first:** present the beat sheet, wait for OK, then build, check, render and verify with no further stops.
- **(b) Fully autonomous:** plan, build, render, verify, report. No stops.
- **(c) Every stage:** stop for approval after the beat sheet, after the preview (snapshots / Studio), and before the final render.

Record the mode in `JOB.md`. HyperFrames' own workflow asks before rendering; in modes (a) and (b)
that gate is overridden by the user's mode choice (state this in `JOB.md`).

## 3. Analyze (fast, in parallel)

- `rcg probe` output is already in `data/intake.json`.
- Speech? After step 1b the words are already in `data/words.json`, timed to the cut. Otherwise
  transcribe for word timestamps (`rcg voice transcribe <file> --out data/words.json`, faster-whisper in the voice venv).
- Music? Beats: `rcg hf --cwd <job> beats <audio>`; levels: `rcg probe`.
- Look at the frames: where are faces and important action? Plan text around them.
- Footage fps < 30 and the plan needs slow motion: plan a freeze frame or interpolation.

## 4. Beat sheet

**Script first.** When the edit needs spoken words the user did not supply in full (a voiceover, a
script the user will record, or a request to improve their script), follow `script-modern-storytelling`
before the beat sheet: it writes the peak map (`data/script.md`) and `data/vo-lines.json`, and each
peak gets the biggest visual change of its stretch. The style skill keeps its tone and visuals.
When the edit is a story with a character (a short film, a screenplay, a narrated story, or "make my
footage a story"), follow `script-film-storytelling` instead: it writes the premise, scene cards,
screenplay and shot list (`data/film/`), and the cinematic skills cut what it plans.

**Named looks (style packs, `docs/styles.md`).** If the prompt names or matches a pack
(`rcg style list` prints keywords), load its skill and follow its fast path for steps 4-8:
paper collage, scrapbook, notebook, cut-out, handmade -> `style-tactile-collage`; quiet, editorial,
minimal, premium, product UI -> `style-quiet-editorial`; Vox, parallax, 2.5D, "make photos move",
documentary or archival explainer -> `style-vox-parallax`; promo, ad, personal-brand or testimonial
talking head (one person) -> `style-marketing-pro`; split screen, presenter plus B-roll or an info
video, "two videos", top and bottom -> `style-split-screen-edit`; infographic, explainer, video essay,
faceless or topic-only video, "make a video about X", or a script plus assets -> `style-info-graphics`; mix media,
cork board, scrapbook, paper doll, stop-motion collage, diary, Hi.Boly -> `style-mix-media`; character
lighting, relight, cinematic or dramatic lighting, split, Rembrandt, rim, back, under or monster light, noir,
silhouette, a lighting explainer or light plot -> `style-character-lighting`; cinematic edit, film look, travel or
documentary film, B-roll montage, event or brand film, "make my footage cinematic" -> `style-cinematic-long` (16:9 or
over 1 minute, template `horizontal-1920x1080`) or `style-cinematic-short` (9:16, 10-60 s). "Cinematic lighting" means
`style-character-lighting`, not these. Style packs are built for speech-led edits
(talking heads, voiceover explainers); recipes below cut to music. Using both in one job is untested.
`style-anti-ai` is not a look: it is a companion check that may run with any pack (when the user
asks whether an edit looks AI-made or generic, or asks for an anti-AI pass). Never offer it as the style.
`style-long-video-to-clips` is not a look either: it is the workflow for clips, shorts or highlights from a long
video (podcast, talk, stream). It makes one job per clip, each edited with a style pack the user picks.

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
- Negative captions (`--negative`, inverted text): `rcg matte` and `rcg pnp` first, then
  `--negative --insert --behind p1`. Placement and look: the learned rules at the end of this skill.
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

- `node tools/rcg.mjs plan check jobs/<id>` first (milliseconds, JSON and HTML only): every block command
  run through rcg is recorded in `data/plan.json`, and this checks the whole edit on paper (missing
  inputs, blocks past the end, captions vs their words and voice, captions timed to an `rcg cut` the
  page does not play, text in no-text zones, overlapping text, text over the tracked face). Fix every
  FAIL before rendering; read the WARNs. Always run blocks through `node tools/rcg.mjs`, so they are recorded.
  After a HyperFrames Studio session, `rcg plan diff` shows what Studio changed; `rcg plan apply`
  rebuilds the page from the plan (it refuses to overwrite Studio edits without `--force`).
- `node tools/rcg.mjs hf --cwd jobs/<id> check`: must pass (lint, runtime, layout, motion, contrast).
- Snapshots at beat midpoints: `rcg hf --cwd jobs/<id> snapshot --at <t1,t2,...> --describe false --output snapshots/beats`, then READ the contact sheet.
- Mode (c): stop here for preview approval (offer `rcg hf --cwd jobs/<id> preview --background`).

## 8. Render + verify

`node tools/rcg.mjs render jobs/<id> --fps <fps> --workers 3 [--silence a-b]`

Only one heavy run (`rcg render`, `fx`, `matte`, `track`, `layers`, `hf snapshot`) runs at a time on the machine. If another
session holds the slot, the command prints `Waiting for the heavy-work slot ...` and starts when that
run ends, so run it in the background rather than under a short tool timeout.

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

If the job came from `inbox/`, mark it finished once the verified render is delivered:
`node tools/rcg.mjs inbox done --job jobs/<id>` renames the folder to `<folder>-Complete`, so no agent
starts it again. Revisions later still work: the job has its own copy of the media. If the rename fails
because a file in the folder is open, ask the user to close it and run the command again.

<!-- rcg:learned begin -->
## Learned rules

The user's taste, saved with the `learning-from-user-taste` skill. Follow every line. Change them only with
`node .agents/skills/learning-from-user-taste/scripts/learn.mjs` (it checks the hard limits and clashes).
Order: style pack defaults < every job (video-job) < one style < one job (JOB.md). Pitfalls and safe zones still win.

- Credits never appear in the video: no photographer, source, licence or "courtesy of" text on screen, no end card of credits; credits are records only, in `data/credits.json` and `report.md` (user rule, 2026-10-08)
- Negative captions (`--negative`, inverted text) always go behind the subject, at a height where the background shows around the subject (beside the head, not across a body that fills the width); white, heavy, 1.3x and no pill, stroke, glow or shadow (R14) (user rule, 2026-10-09)
<!-- rcg:learned end -->
