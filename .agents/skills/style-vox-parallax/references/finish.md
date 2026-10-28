# Finish and overlays

## Selling the realism (the `parallax` params)

| Param | Default | What it does |
|---|---|---|
| `blur` | bg 2.5, front-most cut-out 6 | depth of field: the subject sharp, the far plane soft, the near plane softer. "fg:8,bg:3,mid:0" overrides |
| `haze` | 0.15 | a light veil between the background and the cut-outs (`hazeColor`), stronger at the top: air between planes |
| `dust` | 0 | number of seeded motes floating in front of the subject (20-40 reads; they parallax with the camera) |
| `grain` | 0.28 | fine film grain (four seeded tiles, overlay blend), changing on each stepped frame |
| `vignette` | 0.35 | darker corners |
| `lens` | 3 | corner softness (px) like a real lens; 0 turns it off |
| `leak` | 0 | a warm light leak at the top-left, breathing slowly (0.3-0.5 is plenty) |
| `paper` | 0 | archival paper texture multiplied over the shot (0.1-0.2) |
| `fps` | 12 | stepped motion (see camera.md) |

Textures (grain, paper, cardboard) are generated once per job into `assets/textures/` with ffmpeg
from fixed seeds, so renders repeat exactly.

## The finishing layer (`finish`)

The AE tutorial ends with one adjustment layer over everything: Noise about 10% and Posterize Time.
`finish` is that layer: full frame, placed last in the plan and spanning the whole edit, so titles,
labels, boards, cards and parallax shots share one grain. It sits under the captions.

| Param | Default | What it does |
|---|---|---|
| `grain` | 0.1 | overlay grain from the same seeded tiles, changing on each step. 0.1 is faint; 0.15-0.2 if the render looks clean |
| `vignette` | 0.2 | a light darkening of the corners over every shot |
| `flicker` | 0.03 | a seeded exposure flicker per step (old film); 0 turns it off |
| `fps` | 12 | the step rate: match the parallax shots (camera.md) |

With `finish` on, set `grain: 0` on each `parallax` (its grain would double) and keep that shot's
`vignette` lower (0.2) or the corners go heavy. The overlay blend reaches across sub-compositions:
checked in testing (2026-10-10) with grain 0.6 over an archive plate.

## The word in the scene (`parallax` `word`)

The tutorial's "3D text matched to the camera": text set on a plane inside the stage, at depth
`wordZ` (units of P), so it parallaxes with the photo and the subject passes in front of it.

- `word` one line (fitted into the safe width), `wordY` its centre, `wordSize` the starting size
  (shrinks to fit, down to `wordMin`). `wordFont: "caption"` (Oswald caps) for a bold noun,
  `"serif"` for a phrase. `wordTone` any token or CSS colour; white with a soft shadow by default.
- Place it where the subject covers part of it at rest (a head over the middle letters reads at
  once: "H_ME"). Keep the most important letters clear, and check it in a snapshot.
- `hf check` would flag the hidden letters as occluded text; the component marks them as
  intended. Contrast is still measured: it passed in testing on a grey wall and a sky ground.
- `blur: "word:1"` softens it slightly when it sits far back.
- One or two per edit. It replaces the title or label for that beat, not adds to it.

## Overlays

- **`highlight`**: the orange highlighter label (#f0500d, mottled, ragged ends), white serif text,
  wiped in left to right and out to the right. One per beat: a key word, a name, a date. Default
  78 px text in a 600 x 150 box.
- **`serif-title`**: EB Garamond lines; light words in `sky`, `*emphasis*` words bold in `slate`
  (or any token via `tone`/`accent`). On a photo, add `scrim: 0.8` (a soft paper strip, slightly
  tilted) or use `tone: "slate"`; R10's sky-on-grey-wall title measured 1.6:1 and failed `hf check`.
  `arrow: "x1,y1>x2,y2"` draws a thin hand-drawn arrow after the words; point it at the subject.
- **`board`** + **`photo-card`**: the photo as a tilted white-bordered print on cardboard,
  settling in from below and slowly pushing closer.
- **`board texture=paper`** + **`archive`**: the photo toned sepia or mono, soft or oval edges,
  multiplied onto aged paper, fading in and pushing slowly.

## Captions

`rcg captions --style vox`: Oswald 700 uppercase, white on a dark warm pill, 2-word groups at 58 px,
no pop. Keep the default lane (y 1344) clear of labels while a caption is up (R10 moved a label from
y 1250 to 1170).

## Sound

Vox-style edits ride on voice and music. The pack only places a soft swipe on highlighter labels
and a light slide on photo cards (`--sfx`). With SFX, level voices to -14 LUFS / -3.6 dBTP.
