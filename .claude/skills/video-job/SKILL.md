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
3. Read `JOB.md` notes and LOOK at each intake sheet. Notes flag: no audio, low fps, hot peaks.

## 2. Working mode (ask if not given)

If `prompt.md` or the chat did not set a mode, ask with AskUserQuestion:

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
- Captions from voiceover or transcript words (Adits styles: tiktok, karaoke, neon, kinetic,
  modern, subtitle, glitch, retro, earthquake, vertical_ghost):
  `node tools/rcg.mjs captions --job jobs/<id> --words jobs/<id>/assets/voice/audio_meta.json --voice vo1 --style tiktok --mode word|2word|phrase --start <voice data-start> --id cap-vo1 --insert`
  For footage speech, transcribe first: `rcg voice transcribe <file> --out words.json` and pass `--words words.json`.
- Music structure for cuts: run `analyze-beatgrid.py` with the voice venv (see `docs/capabilities.md`)
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
  `jobs/<id>/data/flythrough.json` (shape: `regression/R4/README.md`), then
  `node tools/rcg.mjs flythrough --job jobs/<id> --insert --fit-root`. Snap arrivals to the beat grid
  (`"snap": {"beats": "data/audiomap.json", "grid": "downbeats"}`) and read the landing report (beat
  error per card). Whoosh sounds land their crest on the arrival. Duck the music at 0.5, not
  flowEditor's 0.25, when sounds are frequent (R4 hit -16 LUFS at 0.25). `punch` overshoots far on
  long trips; use it between nearby cards.
- 3D: `node tools/rcg.mjs three --job jobs/<id> --scene orb|knot|crystal|rings --cue "a/0:orbit_cw" --cue "b/<downbeat>:crash_zoom_in:i=0.5" [--audio <music>] --duration <s> --id three-x --track <n> --insert`,
  then set the host's z-index in the job CSS. Cue on downbeats from the beat grid.
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
stages in `JOB.md`. Send the video with SendUserFile. In the chat reply, be brief and honest:
say what was verified and what was not (for example: "I cannot listen to audio; the mix was
judged by measurement").
