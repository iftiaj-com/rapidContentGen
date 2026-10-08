# Job 2026-10-08-r4-flythrough

- **Template:** vertical-1080x1920 (1080x1920)
- **Mode:** (b) Fully autonomous: plan, build, render, verify, then report.
- **Status:** done (regression job; no beat sheet)

## Prompt

Regression R4: flowEditor camera flythrough. Eight cards (stills and two video cards in five aspect ratios) on a star layout;
the camera flies to each card with a different path style and entrance, arrivals snapped to the song's downbeats,
whoosh transition sounds with the music ducked under them.

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
- [ ] Beat sheet (beat-sheet.md + beat-sheet.json)
- [x] Pre-production audio (TTS, limiting, SFX placement, mix-check)
- [x] Build
- [x] Check + snapshots
- [x] Render
- [x] Verify
- [x] Report (report.md)
