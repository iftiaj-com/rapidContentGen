# Report: Opus 5.5 made this (v2)

Render: `renders/final.mp4` (frame sheet `renders/final-sheet.png`, handover check `renders/check-handover.png`).

## What was built

A rebuild of `jobs/2026-10-08-opus-5-5-made-this` (v1) with the approved asset sources, the
`icon` component and the pack upgrades. Topic mode: the agent wrote the script, chose the voice,
found and downloaded the footage (with the user's OK), built the graphics, placed the sound and
rendered. No credit text appears on screen (user rule).

| Time | Words | On screen |
|---|---|---|
| 0.00-1.34 | One prompt. | Pixabay keyboard clip, blurred and darkened under a 60% dark scrim, slow push; "One *prompt.*"; the prompt bar types "Video: Opus 5.5 made this" and the cursor clicks Generate after "prompt" |
| 1.34-7.45 | Opus 5.5 wrote the script, picked the voice, found the footage, built every frame, and timed every sound. | Cream ground with a faint Poly Haven wall grain arcs in, carrying the orbit with it; Phosphor icon chips Script, Voice, Footage, Frames, Sound pop on their words |
| 4.14-5.40 | (found the footage, built) | Cutaway: four Unsplash photos and Van Gogh's Sunflowers (The Met, public domain) drop onto a dark ground; a magnifying-glass disc pops on "footage"; the orbit is hidden under it and returns as "Frames" lands |
| 7.45-8.57 | No human editor. | Light grey textured ground wipes in with the equation: *Editor* = [Opus 5.5] |
| 8.57-10.00 | Just this. | Dark ground irises in: "Opus 5.5 / made / *this.*", arrow down to the video |

Captions: one word at a time on the black `info-chip`, y 1440.

## Measured (rcg render / verify)

- 1080x1920, 30.000 fps, 10.000 s, h264 + AAC 48 kHz stereo, 5.4 MB, rendered in 41.5 s.
- Loudness -14.5 LUFS integrated, true peak -2.9 dBTP; no whole-mix gain reduction.
- `hf check`: passed; contrast 35/35 WCAG AA. 23 layout notes, all expected: outgoing text
  covered during a scene handover, and one chip's pop overshoot.

## Changes from v1, and why

- New clause "found the footage": true this time, since the job collected footage.
- "No editing app. No human editor." became "No human editor." to keep 10 s with the new clause.
- The vo1 line reads back as "1 prompt" (same words); vo2 alignment 0.89 ("5.5" heard as words).

## Fixed while building (tools, not only this job)

- **Black frames at scene changes** (v1 had them too): a ground that wipes, arcs or irises in
  reveals what is under it, but the outgoing scene had already ended, so the reveal opened onto the
  black root (7.50 s here). `rcg infographics resolve` now holds an outgoing scene until the next
  ground has finished entering, and `"end": "#g4"` hands over to a named ground past a cutaway.
- **Incoming content floated over the outgoing scene** during a reveal (the orbit over the footage
  at 1.5 s). Every pack component now has `reveal`, which rides the ground's clip; `resolve` sets it.
- **The prompt cursor stayed on top of the next scene** (its z-index escaped its layer); removed.
- **Covered orbit text** under the cutaway failed the contrast audit; the orbit is now hidden for
  exactly the cutaway window.
- Pack additions: `ground` `opacity` (scrim) and `texture`; `orbit` `icons`; `at` is anchorable.

## Audio

- Voice: Kokoro `af_heart`, speeds 1.05 / 1.22 / 1.08 / 1.0, leveled to -14 LUFS, -3.6 dBTP.
- Music: the v1 bed (`library/sfx/bg-music-daily-mail.mp3`, looped, -18 LUFS, lane 0.6, duck 0.4).
  Its licence is still not recorded: confirm it before posting.
- SFX from the library: typing, click, swipes on the arc / wipe / iris, pops and ticks on the orbit
  chips, five quick pops as the photos land, a tick and a pop on the equation. Judged by measurement
  only; the agent cannot listen.

## Open

- The keyboard clip shows a blurred word on the mouse pad ("REVOLT", likely a brand). It is
  blurred past reading in the render (checked in the frames), but Pixabay's licence bars
  commercial use of recognizable brands. Swap the clip before a paid or commercial post.
- The bed's licence, as above.

## Credits

| File | Source | Author | Note | Page | Licence |
|---|---|---|---|---|---|
| `assets/video/kb-vertical.mp4` | pixabay | Darioguzben | 2160x4096, 13 s | <https://pixabay.com/videos/id-180776/> | Pixabay Content License (free, no attribution required; no standalone resale) |
| `assets/img/camera.jpg` | unsplash | Alexander Andrews |  | <https://unsplash.com/photos/soLEw77Napo> | Unsplash License (free, no attribution required; no resale without significant modification) |
| `assets/img/mic.jpg` | unsplash | Leo Wieling |  | <https://unsplash.com/photos/bG8U3kaZltE> | Unsplash License (free, no attribution required; no resale without significant modification) |
| `assets/img/city.jpg` | unsplash | dominik hofbauer |  | <https://unsplash.com/photos/AaceTp_LRAM> | Unsplash License (free, no attribution required; no resale without significant modification) |
| `assets/img/summit.jpg` | unsplash | Boris Baldinger |  | <https://unsplash.com/photos/eUFfY6cwjSU> | Unsplash License (free, no attribution required; no resale without significant modification) |
| `assets/img/sunflowers.jpg` | met | Vincent van Gogh | Sunflowers, 1887 (Rogers Fund, 1949) | <https://www.metmuseum.org/art/collection/search/436524> | CC0 (The Metropolitan Museum of Art Open Access, public domain) |
| `assets/tex/wall.jpg` | polyhaven | Dimitrios Savva, Rico Cilliers | Beige Wall 001 | <https://polyhaven.com/a/beige_wall_001> | CC0 (Poly Haven; credit Poly Haven as their API asks) |
