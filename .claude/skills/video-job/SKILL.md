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
- Voiceover: Phase 1 voice tools (see `docs/capabilities.md`).
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
- Root `data-duration` must equal the plan.

## 7. Check

- `node tools/rcg.mjs hf --cwd jobs/<id> check`: must pass (lint, runtime, layout, motion, contrast).
- Snapshots at beat midpoints: `rcg hf --cwd jobs/<id> snapshot --at <t1,t2,...> --describe false --output snapshots/beats`, then READ the contact sheet.
- Mode (c): stop here for preview approval (offer `rcg hf --cwd jobs/<id> preview --background`).

## 8. Render + verify

`node tools/rcg.mjs render jobs/<id> --fps <fps> --workers 3 [--silence a-b]`

It runs mix-check, renders, saves `renders/final.log`, and verifies (dimensions, fps, duration,
audio present and not silent, loudness, true peak, no "Audio lowered by"), then writes
`renders/final-sheet.png`. READ the sheet. A failed verify means the job is not done.
Mode (c): ask before this final render.

If verification fails, fix the cause, not the symptom. Each render costs about 2-3 minutes.

## 9. Report

Write `jobs/<id>/report.md`: what was built, the render path, measured specs (duration, fps,
loudness, true peak), deviations from the beat sheet and why, and anything left open. Tick the
stages in `JOB.md`. Send the video with SendUserFile. In the chat reply, be brief and honest:
say what was verified and what was not (for example: "I cannot listen to audio; the mix was
judged by measurement").
