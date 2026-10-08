# Job 2026-10-08-r6-fx-reel

- **Template:** vertical-1080x1920 (1080x1920)
- **Mode:** (b) Fully autonomous: plan, build, render, verify, then report.
- **Status:** done 2026-10-08, render verified (11/11)

## Prompt

R6 regression (Phase 6 subset): a labelled reel of every ported Adits footage effect and 3D environment, rendered offline with rcg fx, 1.5 s each, over the R5 music.

## Media

- video: `assets/101066-video-1080.mp4`, 12.80 s, 1080x1920 @ 23.976 fps, no audio (sheet: `data/intake-101066-video-1080.png`)
  - No audio track: there are no spoken words to transcribe.
  - Source is 23.976 fps: slowing it below 1x will stutter. Use a freeze frame or interpolation instead.
- audio: `assets/song-limited.wav`, 15.02 s, no video, pcm_s16le, -14.6 LUFS, TP -2.5

## Stages

- [x] Intake
- [x] Mode confirmed
- [x] Analysis (transcript, beats, safe-zone review)
- [-] Beat sheet: not used (a fixed regression reel; shot list in regression/R6/README.md)
- [x] Pre-production audio (music already limited in R5; mix-check MIX OK)
- [x] Build
- [x] Check (hf check passes; no HF snapshots taken: each fx sheet and the render sheet were read)
- [x] Render
- [x] Verify
- [x] Report (report.md)

## Mode

Mode (b), set by the request. The HyperFrames render gate is overridden by that choice.
