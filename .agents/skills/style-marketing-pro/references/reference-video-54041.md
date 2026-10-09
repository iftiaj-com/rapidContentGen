# Reference Video-54041 (an event promo, five speakers)

Measured on 2026-10-09 (`camera_motion.py`, frame sheets at 2 fps, a transcript). Nothing is
copied: not the people, the words, the event, the brand or the photos. The planner learned the
devices below; R15 (`regression/R15/README.md`) is their regression.

## What it is

- **Format:** 720x1280, 30 fps, 35.6 s, -14.1 LUFS.
- **Speech:** about 25 s, spread over five speakers. Each speaker walks toward the camera in a
  different location.
- **Music:** the first 3.8 s carry no speech but play at -16 LUFS, so a music bed very likely runs
  under the voice. I can't listen to confirm.
- **Pacing:** a new speaker or location about every 2.5-3.5 s, on sentence breaks. There are about
  ten transitions, each 0.2-0.4 s long (68 cut frames in clusters of 3 to 7).
- **Framing:** faces are 0.04-0.10 of the frame height, so full-body walking shots. R11 was 0.17-0.20.
  There are no punch zooms; the size changes come from the subject walking toward the lens.

## Devices, and what the planner does with them

| Reference | Here | Status |
|---|---|---|
| Five vertical strips, one speaker each, cut in left to right 0.53 s apart over black; at the end they flash and drop out | `rcg strips --mode open\|close`; plan `--strips` with prep `--intro` / `--outro` | built (R15) |
| A slide with a mirrored edge and heavy motion blur at the cuts; some zoom blurs | `rcg transition --style mirror_whip` (`--dir`), `zoom_blur`; plan `--whips N` at sentence starts | built (R15) |
| Big keywords filled with a texture or photo (gold texture, a city photo), a purple-pink gradient, or solid red for scarcity | hero look `fill`; plan `--fill-heroes --fills gold=,pink=,photo=` | built (R15) |
| A small italic lead above the keyword, small bold words below it, split left and right of the head | hero `lead` / `tail` / `gap` / `textAt` / `tailAt`; plan `--clusters` (these words leave the body caption) | built (R15) |
| A photo of the named thing on a rounded card that flips in with a 3D tilt | `card` component; plan `--cards "word:img"` | built (R15) |
| A music bed under the voice and a whoosh on each transition | plan `--music` (looped when short, ducked under each sentence); a whoosh per whip, clicks on the strips | built (R15) |
| "comment X" call to action as a big quoted fill word | not built (the CTA is still the pill) | open |
| Five speakers, a clip per sentence | not built (one clip per edit) | open |
| A walking camera (no zoom ladder, wide full-body frame) | not built | open |

## Numbers used

- **Strips:** stagger 0.53 s (measured: 0.6, 1.13, 1.67 s). Closer: 0.08 s in, 0.14 s out.
- **Mirror whip:** 0.32 s, centred on the cut, a 55% slide, blur sigma 40 px at 1920 high.
- **Fill drift:** the fill slides across the letters for the hero window (gradients 0% to 100%,
  photos 30% to 70%).
- **Card:** 340x420, 30 px radius, flips in from -75° over 0.6 s, holds at -8°, 2.4 s on screen.
