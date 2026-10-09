# Face-safe framing in the presenter panel

The presenter panel (y 1190-1920, 1080 wide) shows a static crop of the presenter per split
window. The crop is `screen = s * source + (tx, ty)` in output px, solved at plan time from the
MediaPipe face track (`data/track-a.json`, `rcg track`). Code: `faceFrame`, `faceOverrun` and
`solveCrop` in `tools/recipes/split-screen.mjs`; the same functions run in `split-check`.

## The rule

Per tracked frame, in source px:

- face box: the track's face box, widened by `sides` (0.3) of the face width on each side, the chin
  extended by `chinDown` (0.3) of the face height;
- hair top: `hairUp` (0.45) of the face height above the forehead.

A frame overruns when, after the crop:

- hard: the face box leaves x 20-1060 or y 1330-1900 (clear of the seam shade, above the bottom edge);
- soft: the hair top goes above y 1210 (into the seam and the B-roll). Hair under the shade is fine.

A window passes when at most 5% (`maxOut`) of its face frames overrun by more than 2 px.

The first version demanded the whole head box (hair included) below the shade. On the R12 selfie
clip (face about 240 px tall at the smallest scale that still covers the panel width, and a person
who sways and walks in) nothing passed, and every split window turned full frame. The face is what
must stay clear; hair under the dark shade reads as natural, as in the reference.

## The search

1. Scales from the target face size (`faceH` 170 px, never below a cover fit, at most 2.5x cover)
   down to a cover fit, in 6% steps. For each scale, offsets on a grid (ty in 3 px steps, tx in
   6 px steps, capped). The cover range keeps the panel filled. Cost: overrunning frames first, then
   the median face's distance from (540, 1480).
2. The first scale that passes wins (the largest face that passes).
3. When no cover crop passes: smaller scales down to `fitMin` (0.6) of cover, with the source inside
   the panel width over a blurred, darkened cover copy (`fill: true`, edges feathered 36 px).
4. When nothing passes, the planner changes the window's layout (a-full when 4 s or less, else b-full)
   and says so.

Typical R12 result: scale 1.0, face 244 px, 7 of 187 frames over (the walk-in at the start).

## Darkening a bright background

The reference's dark wall blends into the seam. When the presenter's background is bright (median
luma of the panel's top strip over 110, `--darken auto`), the plan darkens it: the panel shows the
presenter at `brightness(0.55) saturate(0.7)` with the `rcg matte` cut-out on top at the same crop.

Findings from R12:
- Blur on the darkened copy spread the dark hair outward into a ring around the cut-out. No blur.
- The selfie segmenter leaves a light fringe on curly hair. Matte with `--choke 10 --feather 3
  --temporal 0.3` (`presenter.matte` in layout.json) made it small; it is still visible at full size.
- `--darken off` keeps the shot as it is; the shade alone keeps the caption band dark.

## Checks (split-check)

Per split window: the crop covers the panel (or sits inside it with a side fill), and the overrun
share is at most 5%. It prints the worst overrun in px. For a-full windows it simulates the face
camera (marketing-pro `simulator`) and fails any title box that touches the face box.
