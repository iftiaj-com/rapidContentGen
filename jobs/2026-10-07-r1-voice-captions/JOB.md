# Job 2026-10-07-r1-voice-captions

- **Template:** vertical-1080x1920 (1080x1920)
- **Mode:** (b) Fully autonomous: plan, build, render, verify, then report.
- **Status:** done, verified (see report.md)

## Prompt

Regression R1: voiceover over b-roll with the four Phase 1 caption styles (tiktok, karaoke, kinetic, neon), two Kokoro voices, music bed under the voice.

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
