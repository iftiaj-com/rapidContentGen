# R6: Adits footage effects and 3D environments (Phase 6 subset regression)

`jobs/2026-10-08-r6-fx-reel`, 13.75 s, mode (b). A labelled reel of every effect ported in the P6
subset, each rendered offline with `rcg fx` from `101066-video-1080.mp4` and cut every 1.25 s over the
Paper Ring music (already limited, from R5).

| Shot | `rcg fx` effect | Adits source | Range (s) | Options |
|---|---|---|---|---|
| 1 | `ghost` | `effects/video/AdvGhost.js` | 3-4.5 | defaults (2.5 s pre-roll) |
| 2 | `motion-trails` | `effects/video/MotionTrails.js` | 4.5-6 | defaults (2 s pre-roll) |
| 3 | `origami` | `effects/video/Origami.js` | 1-2.5 | defaults |
| 4 | `heat-haze` | `effects/video/HeatHaze.js` (WebGPU) | 6-7.5 | defaults |
| 5 | `blow-pixels` | `effects/video/BlowPixels.js` (WebGPU) | 7.5-9 | defaults |
| 6 | `frame-tunnel` | `effects/video/FrameTunnel.js` | 9-10.5 | defaults (real seeked `<video>`) |
| 7 | `reveal-under` | `effects/video/RevealUnder.js` | 2-3.5 | `--preset take_two`, side B from 8 s |
| 8 | `split-screen` | `effects/video/SplitScreen.js` | 5-6.5 | `splitMode=shape splitMaskShape=bird splitMaskSize=1`, side B from 10 s |
| 9 | `smoke` | `core/anam/SmokeEnv.js` | 0.5-2 | `--preset jet` |
| 10 | `rain` | `core/anam/RainSystem.js` | 10-11.5 | defaults |
| 11 | `holo-sheen` | `core/anam/HoloSheen.js` | 11-12.5 | defaults |

1. `rcg new-job --name r6-fx-reel --video <video> --audio <limited song> --mode b`.
2. For each row: `rcg fx --job $J --src assets/101066-video-1080.mp4 --start <s> --duration 1.5 --effect <name> [options] --sheet --out assets/fx/<name>.mp4`,
   with `--src2 assets/101066-video-1080.mp4 --start2 <s>` for side B. Read every sheet.
3. `index.html`: the template with one `.shot` per clip (1.25 s each, media start 0), a flat label
   card per shot in the top text band on alternating tracks 10/11 (dark pill behind the text for
   contrast), and the music at level 1 with 0.04 s / 0.6 s fades. Edit the job's `index.html` directly
   to change it.
4. `rcg mix-check` (MIX OK, -14.7 LUFS, -2.5 dBTP), `rcg hf --cwd $J check` (passes; 2 track-density
   lint warnings, contrast 8/8), `rcg render $J --fps 24 --workers 3`.

**Checks:**
- Identity: `blow-pixels` at `advBlowIntensity=0` returns its input exactly (PSNR infinite on every
  frame). This checks the crop, UV mapping and colour handling of the WebGPU path.
- Colour: the harness input frames carry no colour tags, so Chrome does not colour-manage them
  (lessons 13ab). Chrome's `<video>` decode of the source matches ffmpeg at 45 dB PSNR.
- Seeks: FrameTunnel's front frame changes with time (a failed seek now stops the run, lessons 13ac).
- Side B: every SplitScreen output pixel matches side A or side B (0% neither), with B unscaled.
- Determinism: ghost (stateful, pre-roll), rain (seeded random) and heat-haze (WebGPU) rendered twice:
  12/12 output frames byte-identical each.
- Environments over footage: smoke (ambient, jet, mist, thin ambient), rain, holo-sheen sheets read;
  mist renders (alpha about 0.13 at the default intensity) but is faint.
- The render passes all 11 verify checks.
