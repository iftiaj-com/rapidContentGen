# R12: split-screen edit (presenter + info video)

`jobs/2026-10-08-r12-split-screen`, 12.27 s, 30 fps, mode (b). Skill `skill-split-screen-edit`,
learned from the user's reference Video-94146 (measured, nothing copied).

Inputs:
- presenter: the user's raw clip `WhatsApp Video 2026-10-08 at 19.27.12.mp4` (478x850, VFR 29.3 fps,
  one person standing, close selfie, bright doors behind; the same clip as R11);
- info (montage library): `videos/Video_for_testing.mp4` (1920x1080, a woman on white),
  `videos/mop-star-trailer/assets/dance.mp4` (1080x1920), and two synthetic clips made with ffmpeg for
  this test: `test-card.mp4` (1080x1080 white card "42% TEST CARD", slow zoom) and `test-ui.mp4`
  (1920x1080 dark code page scrolling). They exercise the `card` and `ui` classes.

## Steps

1. `rcg new-job --name r12-split-screen --video <presenter> --video <info...> --mode b`
2. `rcg split-screen prep --job $J --presenter assets/<presenter> --info assets/Video_for_testing.mp4
   --info assets/test-card.mp4 --info assets/dance.mp4 --info assets/test-ui.mp4 --trim`:
   presenter 1080x1920 CFR 30, voice -14.9 LUFS, trim 2.02-14.28 s; shots b1 footage, b2 card,
   b3 footage, b4 ui (all four correct by eye). Transcript kept as heard (same as R11).
3. `rcg split-screen plan --job $J --handle "@rcg.test"`: 3 windows.
   - w1 split 0-6.23: top panel b1 -> b3 -> b4; presenter crop 1.0x, face 244 px, 7/187 frames over
     (the walk-in at the start).
   - w2 b-full 6.23-8.98: b2 as a band card (rhythm rule after 5.6 s of split).
   - w3 a-full 8.98-12.26 (closing line): face camera punch to 1.65, title "to / use this system".
   - Shares split 0.51, b-full 0.22, a-full 0.27. No hook title (first line scored 0.58).
   - Presenter background luma 170: darkened through a cut-out (`rcg matte`).
4. `rcg split-screen build --job $J`, then `rcg render $J --fps 30 --workers 3`.

## Checks

- MIX OK; SPLIT CHECK OK; hf check passed.
- Render: 11/11 verify (1080x1920, 30 fps, 12.267 s, -14.2 LUFS, -3.4 dBTP, no dead edge band).
- Read by eye: `renders/final-sheet.png`, snapshots at every layout change, a full-size seam frame
  at 3.0 s (caption above the hair on the shade; small hair fringe from the cut-out) and the a-full
  frame at 9.2 s (no seam caption left over).

## What R12 fixed (each one cost a rebuild)

1. The first crop rule kept the whole head (hair included) below the shade: nothing passed on this
   close selfie, every window went full frame. Now: the face stays clear (hard), the hair only has to
   stay out of the seam (soft), found by a grid search, with a side-fill fallback.
2. The rhythm rule ran before the a-full cap: split ran 9 s with no break. The cap runs first now.
3. The montage read one long clip in order: no visible cuts. Pieces now rotate across shots.
4. Captions and titles were invisible: an attribute selector for the hosts' z-index did not hold
   after HyperFrames mounted them, so every host sat at z 0 under the panels. Id rules from the plan.
5. A b-full pill caption showed over the a-full window: `rcg captions` holds its last group past the
   last word. `split-screen clamp` ends each caption host with its window; split-check enforces it.
6. A blurred darkened background put a dark ring around the cut-out hair. No blur; matte choke 10,
   feather 3, temporal 0.3.

## Open

- A 16:9 seated presenter on a dark wall (the reference's own case) has not been run.
- Real informative footage (a screen recording with a narration that matches) has not been run.
