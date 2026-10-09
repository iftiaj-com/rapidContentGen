# Reference analysis

Source: the user's download `YTDown.com_Shorts_Media_fZIXlBGaIMs_Disney-vs-Mid-journey_001_1080p.mp4`
(YouTube Shorts fZIXlBGaIMs), analyzed on 2026-10-08 with ffprobe, ffmpeg contact sheets (1 frame a
second), a faster-whisper transcript (`rcg voice transcribe`) and pixel sampling. Technique only: no
footage, copy, characters or marks from it are used. Values marked "about" are estimates from
frames, not measurements.

## Measured

| What | Value |
|---|---|
| Format | 1080x1920, 25 fps, 87.9 s, stereo AAC 44.1 kHz |
| Loudness | -12.2 LUFS integrated, peak about +1.0 dBFS (hotter than this workspace allows; we use -14 / -1) |
| Speech | 233 words in about 85 s: 2.75 words a second, one narrator, continuous |
| Sentences | 31, from 1.3 s to 5.6 s long; most 2-4 s |
| Scenes | a new visual at almost every sentence; inside a sentence one part changes per clause |
| Caption | one word at a time, white on a near-black chip, about 34 px text at 1080 wide, centred at about y 1430 (74% of the height) |
| Grounds (sampled) | dark #191919 with a soft vignette; cream #fbf3e1; light grey #f5f5f5; white |
| Accent (sampled) | orange about #e4722a on dark, about #ea8450 on cream; the only accent colour |

## Structure (by time)

| Time | Sentence role | Visual device | Pack component |
|---|---|---|---|
| 0-3 s | hook: a contrarian "you" statement | a newspaper headline with a highlighted line | `post` / `photo` + `mark` |
| 3-9 s | the claim, in the viewer's terms | a 3D easel on a hill; a cursor types a prompt and clicks Generate; the painting becomes a house | `prompt` with `result` |
| 9-14 s | the turn, a joke | cartoon characters; "that's not a YOU problem." with a hand-drawn arrow; "Moral Outrage" label | `stack` (`heavy`, `arrow`) |
| 14-21 s | history | a museum wall of famous paintings in gilt frames; "Imagination" in an orange oblique | `collage` grid, `stack` `slant` |
| 21-28 s | "in other words" | a stone pyramid with orange labels per tier (laborers to masters) | `stack` + `pyramid` |
| 28-36 s | who decided | group portraits cut out, artworks around them; a portrait with an orange bar over the eyes and a plate whose year counts 1901 to 1923 | `collage` scatter, `photo` `mark` + `plate` |
| 36-39 s | "and then AI" | social posts sliding past, a word highlighted in orange | `post` |
| 39-54 s | "look at history" | orange stairs with tools on each step; a grey tower of eras with time values; 3D vignettes per era | `stairs` (stairs, tower) |
| 52-54 s | none of them made imagination obsolete | an orange disc, a black core "Imagination", tools orbiting | `orbit` |
| 54-64 s | what AI does and does not do | prompt cards stacking on cream around an "AI" badge | `prompt`, `post` (cards) |
| 64-71 s | definitions | "Slop ≠ [AI key cap]", "Low effort = Slop" | `equation` |
| 71-80 s | the fight | collages of drawings and protest photos, mono | `collage` scatter (`tone` mono) |
| 80-88 s | payoff | a gallery wall turning into a mosaic of thousands of images | `collage` mosaic |

## Motion and sound habits

- Type rises out of a blur word by word, each word on its spoken word. Lines stack with a stair
  offset (In / other / words). One word per scene is orange, sometimes heavier or oblique.
- Transitions are mostly hard cuts. Section turns use a curved arc sweep, a wipe or a soft iris.
- Objects pop with a small overshoot; lines and arrows draw on; highlight boxes sweep left to right.
- Sound (judged from the structure, not by listening): a quiet music bed under the voice, swipes on
  scene turns, clicks on UI actions, small pops as objects land.

## Not reproduced (and what stands in)

- Custom 3D renders and AI-generated illustrations (the easel scenes, the stone heads, cartoon
  characters): this workspace has no image generator. Stand-ins: procedural components, `rcg three`
  objects, shaders, the user's assets, or collected photos (with permission, `assets.md`).
- Archival footage and photos of real people: only with assets the user supplies or approves.
