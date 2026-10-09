# R16: Adits Global Visuals and four Video Jockey FX (regression, 2026-10-09)

`jobs/2026-10-08-r15-adits-vj-globals`, 15.0 s, mode (b). A labelled reel of everything ported from the
Adits Global Visuals card and the Video Jockey deck (Depth Scan, Lights, Lightshow, Beat Wash), cut every
1.25 s over the limited Paper Ring music (from R8). Footage: `101066-video-1080.mp4` (9:16, R6) and the
user's `Video_for_testing.mp4` (16:9, R7) with its R7 cut-out `assets/matte/v1-fg.webm`.

Each `rcg fx` shot: `--duration 1.25 --audio assets/song-limited.wav --audio-offset <shot start> --sheet`,
so the beat-driven looks hit on the music of the edit.

| Shot | Start | `rcg fx` effect / block | Clip, start (s) | Options |
|---|---|---|---|---|
| 1 | 0 | `global-visuals` + `rcg cinema cf1` | R6, 1 | `fxBnwMode=true`; cinema `--ud --pos 12 --curve 35 --show 0-1.25` |
| 2 | 1.25 | `global-visuals` | R6, 2.5 | `fxFisheyeEnabled=true fxFisheyeIntensity=0.8` |
| 3 | 2.5 | `global-visuals` | R6, 4 | `fxNegativeMode=true globalOpacityEnabled=true globalOpacitySlider=0.6` |
| 4 | 3.75 | `global-visuals` | R6, 5 | `fxRgbColors=true` |
| 5 | 5 | `global-visuals` + `rcg cinema cf2` | R6, 6.5 | `fxNeonMode=true`; cinema `--lr --lr-pos 7 --lr-color "#14001f" --show 5-6.25` |
| 6 | 6.25 | `vj-scan --preset pulse_scan` | R6, 7.5 | |
| 7 | 7.5 | `vj-scan --preset ghost_edges` | R6, 9 | `fxBnwMode=true` (BnW runs before the deck, as in Adits) |
| 8 | 8.75 | `vj-scan --preset subject_reveal` | R7, 3 | `--subject assets/matte/v1-fg.webm --point "0:0.5,1;1.25:0.5,0.82"` |
| 9 | 10 | `vj-lights --preset lit_cathedral` | R6, 10.5 | |
| 10 | 11.25 | `vj-lightshow --preset ls_ignition` | R6, 0 | |
| 11 | 12.5 | `vj-beatwash --preset red_alert` | R6, 2 | |
| 12 | 13.75 | plain R7 clip (media start 6) + `rcg pnp p1` + `rcg cinema cf3` | | pnp `--show 13.75-15 --enter none --exit none`; cinema `--ud --pos 24 --curve -40 --show 13.75-15 --behind p1` (Midground) |

1. `rcg new-job --name r15-adits-vj-globals --video <R6 clip> --video <R7 clip> --audio <limited song> --mode b`,
   then copy R7's `assets/matte/v1-fg.webm` and `data/track-v1.json`.
2. The 26-preset sweep: every preset of the four FX, 2 s at 540x960 over the music (R6 at 3 s, audio
   offset 5; Subject Reveal on R7 with `--subject` and `--track data/track-v1.json --anchor hand`), each
   with a sheet in `assets/fx/sweep/`. Read every sheet.
3. The 11 shots above at 1080x1920 (13-23 s each), then `index.html` (R8's head and label cards, one
   `.shot` per clip), `rcg pnp`, the three `rcg cinema` blocks.
4. `rcg mix-check` (MIX OK, -14.7 LUFS, -2.5 dBTP), `rcg hf --cwd $J check` (passes; R8's two
   track-density lint warnings, contrast 8/8), `rcg render $J --fps 24 --workers 3`.

**Checks:**
- All 26 presets render without a page error (Depth Scan 7, Lights 10, Lightshow 5, Beat Wash 4).
- Formulas, on 3 frames each (540x960, `--keep-frames`): BnW = Rec.601 luma (0.299, 0.587, 0.114),
  mean error 0.25/255, max 0.6; Negative = 255 - input exactly; Fisheye 0.8 = the WGSL mapping with
  bilinear sampling, mean 0.2, max 0.7; Global Opacity 0.4 = 0.4 x input, max 0.4; BnW + Fisheye =
  fisheye(round(luma)), max 1.6/255.
- Adits' post chain (BnW + Fisheye with the deck off) first gave the input untouched: a WebGPU
  validation error (lessons 13bs). The shim runs the two passes standalone; that is the result above.
- RGB Colors: without `--audio` the output equals the input (Adits gates it on bass or treble > 0.05);
  with the music the overlay steps red, blue, green, yellow every 100 ms (2-3 frames at 24 fps).
- Determinism: `vj-lightshow ls_flash` (strobe, onset patterns, music) rendered twice: 36/36 frames
  byte-identical.
- Clock: `vj-scan pulse_scan` at 24 and 30 fps: identical at 0.5 s and 1.0 s, 45 dB at 1.25 s.
- Gesture: Subject Reveal reads the hand from the stand-in vision results (handsCount 1, the scan
  position follows the point height); the band lights the matted subject, not the wall.
- Cinema bars in the render: shot 1 top bar ends at y 230 at the edges and 260 at the centre (path:
  230.4 and 260.6), bottom bar 1689 / 1659; shot 5 pillarbox inner edges at x 76 and 1003 (75.6,
  1004.4), colour #14001f read as (17, 0, 30); shot 12 bars at 460 at the edges, the subject in front.
- The render passes all 11 verify checks: 1080x1920, 24 fps, 15.000 s, -14.9 LUFS, -2.2 dBTP.
