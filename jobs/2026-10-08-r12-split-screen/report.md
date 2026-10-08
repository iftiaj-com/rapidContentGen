# Report: R12 split-screen regression

Render: `renders/final.mp4` (1080x1920, 30 fps, 12.267 s, -14.2 LUFS, -3.4 dBTP true peak).
`rcg render` verify: 11/11 pass. MIX OK, SPLIT CHECK OK, hf check passed.

## Built

- w1 0-6.23 s split: B-roll top panel (woman on white, dance, code page), presenter bottom panel
  with a static face-safe crop (1.0x, face 244 px), seam captions (`split-seam`), handle "@rcg.test"
  for 3 s. The presenter's bright background is darkened through a cut-out.
- w2 6.23-8.98 s b-full: the test card as a white band card with a pop and pill captions.
- w3 8.98-12.26 s a-full: light leak into the presenter full frame, face camera (punch to 1.65,
  ease to 1.35), title "to / use this system" (italic serif).

## Deviations

- No hook title: the first line has no strong key word.
- B-full share 0.22 and a-full share 0.27 sit outside the soft targets; the clip has only 3 beats.

## Not verified

- I cannot listen to audio; the mix was judged by measurement.
- The cut-out still shows a faint fringe on the curly hair at full size.
