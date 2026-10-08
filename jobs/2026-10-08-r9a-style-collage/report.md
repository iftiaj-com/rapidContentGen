# Report: 2026-10-08-r9a-style-collage

R9 regression for the `tactile-collage` style pack (regression/R9/README.md).

- Built: direct overlay headline and note, a full-frame paper beat (checklist, route, stamp), a behind-subject "SHIP IT" with a file tag in front; collage captions with one emphasis word per line; four or five Kokoro voice
  lines at -14 LUFS / -3.6 dBTP; style SFX placed by crest (`rcg style build --sfx`).
- Render: `renders/final.mp4`, 1080x1920, 24 fps, 12.000 s, -14.8 LUFS, -2.5 dBTP. `rcg verify` 11/11 PASS.
- Checked by eye: the frame sheet and full-resolution crops of the headline text.
- Plan: `data/style-plan.json`. Deviations and fixes found while building are listed in the R9 README.
- Not verified: the audio was judged by measurement only (no listening).
