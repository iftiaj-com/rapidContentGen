# Job 2026-10-08-r10-vox-parallax

- **Template:** vertical-1080x1920 (1080x1920)
- **Mode:** (b) Fully autonomous: plan, build, render, verify, then report.
- **Style:** Vox Parallax (`vox-parallax`): skill `.claude/skills/style-vox-parallax/SKILL.md`, spec `frame.md`
- **Status:** intake done

## Prompt

R10 regression: Vox-style 2.5D parallax pack (rcg layers + vox-parallax components) on stills from the stock clip.

## Media

- video: `assets/101066-video-1080.mp4`, 12.80 s, 1080x1920 @ 23.976 fps, no audio (sheet: `data/intake-101066-video-1080.png`)
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
