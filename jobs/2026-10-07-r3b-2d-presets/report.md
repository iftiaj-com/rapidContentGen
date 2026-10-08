# Report: R3b Adits Virtual Camera presets

- **Render:** `renders/final.mp4`, 1080x1920, 24 fps, 9.31 s, rendered in 46 s; all 11 verify checks pass.
- **Audio:** -14.7 LUFS, -2.2 dBTP, no whole-mix gain reduction.
- **Shots (cut on downbeats):** `#w1`, blurred fill: `vc.lean_sweep` (0-2.392 s), then
  `vc.dutch_angle_drift` + `react=bass_zoom` (to 4.203 s). `#w2`, cover fill:
  `vc.cinematic_zoom_pan` (fixed scale 2.0), `vc.ken_burns` + handheld 40 (1.15), `vc.warp_tilt`
  on a curve (1.54).
- **Frame sheet:** skew sweep with the blurred fill visible at 0.33-1.0 s, tilted bass-zoom shot at
  3.0-3.67 s, zoom-pan from 4.33 s, ken burns from 5.9 s, warp tilt from 7.67 s. All read as intended.
- **Defects found (both fixed):**
  1. A dark line along the skewed footage's right edge.
  2. A black 8 px strip down the frame's right edge.

  Both come from the PATH ffmpeg 8.1 yuv420p -> gbrp bug, which HyperFrames uses for frame
  extraction and encoding (lessons 16b). Every earlier render had the strip too. Fixed by running
  HyperFrames on ffmpeg 9.0.2 with a frame cache per ffmpeg build (the first re-render reused the
  bad cached frames).
- **Change made here:** the blurred fill's overscan went from 28 to 72 px per side, after the frame
  border darkened from the CSS blur's edge fade.
- **Result:** the skewed edge blends into the blurred fill and both frame edges carry picture.
