# Job 2026-10-08-r9b-style-editorial

- **Template:** vertical-1080x1920 (1080x1920)
- **Mode:** (b) Fully autonomous: plan, build, render, verify, then report.
- **Style:** Quiet Editorial UI (`quiet-editorial`): skill `.claude/skills/style-quiet-editorial/SKILL.md`, spec `frame.md`
- **Status:** intake done

## Prompt

R9b regression: Quiet Editorial UI style pack on the test clip (available area, full frame canvas, every component), editorial captions in card and clean modes.

## Media

- video: `assets/Video_for_testing.mp4`, 14.43 s, 1920x1080 @ 23.976 fps, no audio (sheet: `data/intake-Video_for_testing.png`)
  - No audio track: there are no spoken words to transcribe.
  - Source is 23.976 fps: slowing it below 1x will stutter. Use a freeze frame or interpolation instead.

## Stages

- [x] Intake
- [x] Mode confirmed
- [x] Analysis (transcript, beats, safe-zone review)
- [-] Beat sheet: not used (a fixed regression edit; plan in data/style-plan.json)
- [x] Pre-production audio (TTS, limiting, SFX placement, mix-check)
- [x] Build
- [x] Check + snapshots
- [x] Render
- [x] Verify
- [x] Report (report.md)
