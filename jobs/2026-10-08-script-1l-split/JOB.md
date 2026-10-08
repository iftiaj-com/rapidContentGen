# Job 2026-10-08-script-1l-split

- **Template:** vertical-1080x1920 (1080x1920)
- **Mode:** (b) Fully autonomous: plan, build, render, verify, then report (user choice 2026-10-08). HyperFrames' pre-render question is overridden by this mode.
- **Style:** Tactile Paper Collage (`tactile-collage`): skill `.claude/skills/style-tactile-collage/SKILL.md`, spec `frame.md`
- **Status:** done, render verified (`renders/final.mp4`)

## Prompt

Split-screen edit (skill-split-screen-edit) of the presenter clip: the person talking stays in the bottom panel. The top panel and full-frame graphics windows are newly generated info-graphics (skill-info-graphics) with top-notch motion and a Tactile Paper Collage feel (style-tactile-collage). No info video was supplied: sync mode.

## Media

- video: `assets/Script_1L_FINAL.mp4`, 94.74 s, 1920x1080 @ 29.970 fps, aac, -17 LUFS, TP -1 (sheet: `data/intake-Script_1L_FINAL.png`)
  - Source is 29.970 fps: slowing it below 1x will stutter. Use a freeze frame or interpolation instead.

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
