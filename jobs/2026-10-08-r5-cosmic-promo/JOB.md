# Job 2026-10-08-r5-cosmic-promo

- **Template:** vertical-1080x1920 (1080x1920)
- **Mode:** (b) Fully autonomous: plan, build, render, verify, then report.
- **Status:** done (render verified; mode (b): the HyperFrames render gate is overridden by the user's mode choice)

## Prompt

Regression R5 (Phase 5): a ~24 s voiced promo of the mop-dance clip with the Paper Ring song that uses every capability group: a 3D orb intro with the title, a beat-snapped card flythrough, the footage as a card over an audio-reactive shader with a drop and whip cuts, beat-flash words, voiceover with captions, and an end title. Built with the cosmic-promo recipe (rcg recipe plan / build). Mode (b).

## Media

- video: `assets/101066-video-1080.mp4`, 12.80 s, 1080x1920 @ 23.976 fps, no audio (sheet: `data/intake-101066-video-1080.png`)
  - No audio track: there are no spoken words to transcribe.
  - Source is 23.976 fps: slowing it below 1x will stutter. Use a freeze frame or interpolation instead.
- audio: `assets/Paper_ring_-_taylor_swift.mp3`, 15.02 s, no video, mp3, -14.5 LUFS, TP 0.4
  - True peak 0.4 dBTP is above -1: limit it before mixing (tools/audio/limit.mjs).

## Stages

- [x] Intake
- [x] Mode confirmed
- [x] Analysis (transcript, beats, safe-zone review)
- [x] Beat sheet (beat-sheet.md + beat-sheet.json)
- [x] Pre-production audio (TTS, limiting, SFX placement, mix-check)
- [x] Build
- [x] Check + snapshots
- [x] Render
- [x] Verify
- [x] Report (report.md)
