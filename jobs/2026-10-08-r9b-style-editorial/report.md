# Report: 2026-10-08-r9b-style-editorial

R9 regression for the `quiet-editorial` style pack (regression/R9/README.md).

- Built: an available-area headline, three canvas beats (doc card, cursor list, window plus progress), a success pill over footage; editorial and editorial-clean captions with one emphasis word per line; four or five Kokoro voice
  lines at -14 LUFS / -3.6 dBTP; style SFX placed by crest (`rcg style build --sfx`).
- Render: `renders/final.mp4`, 1080x1920, 24 fps, 14.417 s, -14.5 LUFS, -3.5 dBTP. `rcg verify` 11/11 PASS.
- Checked by eye: the frame sheet and full-resolution crops of the headline text.
- Plan: `data/style-plan.json`. Deviations and fixes found while building are listed in the R9 README.
- Not verified: the audio was judged by measurement only (no listening).
