# Job 2026-10-08-r7-tracking-pnp

- **Template:** vertical-1080x1920 (1080x1920)
- **Mode:** (b) Fully autonomous: plan, build, render, verify, then report.
- **Status:** done 2026-10-08, render verified (11/11)

## Prompt

R7 regression (Phase 7), on videos/Video_for_testing.mp4 (the user's test clip): an edit in the style of the user's reference talking-head ad: face-tracked reframe to 9:16 with zooms and punch-ins, small word captions in front of the subject, big keywords behind the subject (matte + PNP), a side PNP copy of the subject, Adits transitions (flash, glitch punch, zoom punch, crossfade), colour mask, and an effect switched between background and foreground.

## Media

- video: `assets/Video_for_testing.mp4`, 14.43 s, 1920x1080 @ 23.976 fps, no audio (sheet: `data/intake-Video_for_testing.png`)
  - No audio track: there are no spoken words to transcribe.
  - Source is 23.976 fps: slowing it below 1x will stutter. Use a freeze frame or interpolation instead.

## Stages

- [x] Intake
- [x] Mode confirmed
- [x] Analysis (transcript, beats, safe-zone review)
- [-] Beat sheet: not used (a fixed regression edit; shot list in regression/R7/README.md)
- [x] Pre-production audio (4 Kokoro lines leveled to -13.6 LUFS / -2.5 dBTP, SFX by crest, mix-check MIX OK)
- [x] Build
- [x] Check + snapshots (hf check passes; snapshots of the reframe, PNP, transitions read)
- [x] Render
- [x] Verify
- [x] Report (report.md)

## Mode

Mode (b), set by the request. The HyperFrames render gate is overridden by that choice.
