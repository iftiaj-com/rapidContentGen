# Job 2026-10-08-r12-split-screen

- **Template:** vertical-1080x1920 (1080x1920)
- **Mode:** (b) Fully autonomous: plan, build, render, verify, then report.
- **Status:** intake done

## Prompt

R12 regression: skill-split-screen-edit. Presenter = the user's WhatsApp clip (standing, 9:16). Info = Video_for_testing (16:9) + dance (9:16) as a shot library (montage mode). Split screen in the style of reference Video-94146: B-roll top, presenter bottom, captions on the seam, full-frame presenter and B-roll beats.

## Media

- video: `assets/WhatsApp_Video_2026-10-08_at_19.27.12.mp4`, 15.73 s, 478x850 @ 29.305 fps, aac, -36.6 LUFS, TP -18.4 (sheet: `data/intake-WhatsApp_Video_2026-10-08_at_19.27.12.png`)
  - Source is 29.305 fps: slowing it below 1x will stutter. Use a freeze frame or interpolation instead.
- video: `assets/Video_for_testing.mp4`, 14.43 s, 1920x1080 @ 23.976 fps, no audio (sheet: `data/intake-Video_for_testing.png`)
  - No audio track: there are no spoken words to transcribe.
  - Source is 23.976 fps: slowing it below 1x will stutter. Use a freeze frame or interpolation instead.
- video: `assets/dance.mp4`, 12.80 s, 1080x1920 @ 23.976 fps, no audio (sheet: `data/intake-dance.png`)
  - No audio track: there are no spoken words to transcribe.
  - Source is 23.976 fps: slowing it below 1x will stutter. Use a freeze frame or interpolation instead.

## Stages

- [x] Intake
- [ ] Mode confirmed
- [ ] Analysis (transcript, beats, safe-zone review)
- [ ] Beat sheet (beat-sheet.md + beat-sheet.json)
- [ ] Pre-production audio (TTS, limiting, SFX placement, mix-check)
- [ ] Build
- [ ] Check + snapshots
- [ ] Render
- [ ] Verify
- [ ] Report (report.md)
