# Report: 2026-10-08-r10-vox-parallax

R10 regression for the `vox-parallax` style pack and `rcg layers` (regression/R10/README.md).

- Built: one stock frame cut into three depth layers (room, person, table + chair) and filmed twice
  (a push, then a pan with the person moving on her own); a serif title on a paper strip with an
  arrow; two orange highlighter labels; a photo card on cardboard; an archival plate on paper; Vox
  captions; four Kokoro lines at -14 LUFS / -3.6 dBTP; soft swipe and slide sounds by crest.
- Render: `renders/final.mp4`, 1080x1920, 24 fps, 13.000 s, -14.5 LUFS, -2.7 dBTP, 51.5 MB.
  `rcg verify` 11/11 PASS. `hf check` passes (17/17 contrast).
- Checked by eye: the layer sheet, snapshots of every beat, the frame sheet and full-resolution
  crops (title, the occluded edge behind the chair). Stepped motion measured from the MP4.
- Deviations: the title tone moved from sky to slate on a paper strip for contrast.
- Not verified: the audio was judged by measurement only (no listening).
