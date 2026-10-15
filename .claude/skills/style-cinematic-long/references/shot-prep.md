# Shot measuring and prep (`cine.mjs`)

`node .agents/skills/style-cinematic-long/scripts/cine.mjs <measure|prep|demo>`. Used by both cinematic
skills. It imports `tools/lib` only, and calls `tools/media/camera_motion.py` (the image Python,
`bin.imagePython`) and ffmpeg. Code measures; you judge.

## measure

```
node .agents/skills/style-cinematic-long/scripts/cine.mjs measure jobs/<id> [--src assets/a.mp4,assets/b.mp4] [--hz 10] [--format 1920x1080] [--out name]
```

- Sources: every video in `data/intake.json`, or `--src` (paths relative to the job). It also works on a
  render (`--src renders/final.mp4`) to check the flow of the finished edit.
- Output name: `shots` for source footage. A render (`renders/...`) writes `render-flow.*` and a
  prepped clip (`assets/cine/...`) writes `prep-flow.*`, so `shots.json`, which prep reads, keeps the
  source measurements. `--out <name>` sets another name.
- Format: the job page's root size (`index.html`), or `--format`. It sets the zoom room.
- Time: the motion pass reads every frame at 360 px wide. Expect a long source to take a while, and run
  it in the background for long footage.

**What it does, per source:**

1. Motion rows at 10 Hz (`camera_motion.py --rows`): ORB feature matches between steps, the global
   shift and scale, the frame difference, the largest frontal face.
2. Hard cuts: a step where the matches are lost AND the picture changes (a large difference, or one
   well above the steps around it). Each cut is then placed on the exact frame with ffmpeg's scene
   score. A "shot" under 0.5 s merges into the one before.
3. Per shot: screen motion (trimmed means of the steps, which drop a step that locked onto a moving
   subject), shake (median step-to-step jitter after a 0.6 s moving median), rough size (face height /
   frame height), and colour from up to 8 sampled frames: Y mean with its 5th-95th percentile, saturation
   (mean chroma distance), warmth (mean V minus mean U).

**Outputs** in `data/cine/`: `shots.json` (everything), `shots.md` (the table you read), and
`shots-<n>.png` (48 labelled middle frames per sheet). With another output name, the same three files
carry that name (`render-flow.md`, `render-flow-1.png`).

**Reading `shots.md`:**

| Column | Meaning |
|---|---|
| screen motion | where the picture content moves: `left`, `right`, `up`, `down`, `in` (it grows: push or zoom in), `out`, `still`, `n/a` (not enough texture or too much blur to measure). A camera panning right makes the content move left |
| %/s | speed of that motion, % of the frame per second (zoom: % scale per second) |
| shake | jitter in % of frame width per step: `steady` < 0.4, `light` < 1.0, `shaky` above |
| size | `close` (face >= 30% of height), `medium` (>= 12%), `wide+face`, `wide/none`. Rough: a back view or a landscape reads as wide |
| Y (lo-hi) | mean luma and its 5th-95th percentile (0-255) |
| sat, warm | saturation; warmth (+ warmer, - cooler) |
| flags | darker / brighter (> 10 levels from the median), warmer / cooler (> 5), sat (x < 0.8 or > 1.25), shaky, still with or without zoom room, very short |

Zoom room per source: how far a crop can zoom before it upscales (cover fit of the source into the
output). Under 1.0x the shot is already upscaled to fill the frame (soft).

All thresholds are starting values (`T` at the top of `cine.mjs`). They were tested on synthetic clips
and one real clip with added shake. Every flag needs a look at the sheet before you act on it.

## prep

```
node .agents/skills/style-cinematic-long/scripts/cine.mjs prep jobs/<id> [--plan data/cine/prep.json] [--fps 24] [--room 1.33]
```

Runs in the heavy-work slot. Writes `assets/cine/<id>.mp4` (H.264, CRF 16, yuv420p, 1 s GOP, at the
render fps, no audio unless asked) and `data/cine/prep.out.json` (the format and room, then every item:
range, operations, size cap, colour before / after / target, shake before / after, notes).

**Size cap (`room`).** A clip keeps at most `room` times the job's format (cover fit), so a camera move
or a push-in still has pixels to crop into. The default is 4/3: a 1920x1080 job keeps up to 2560x1440,
so 4K drone footage comes out 2560x1440 (lanczos). Smaller sources are never upscaled. Set `room` at the
top of the plan, per item, or with `--room`; `false` keeps the source size. Raise it (for example 1.5 or
2) only for a clip with a deep push-in, and expect a slower render. Why: full-size 4K clips made
HyperFrames frame extraction time out on a 21-clip, 2-minute job (VIDEO_SOURCE_UNRENDERABLE, lessons
13bv). A `reframe` item already comes out at the format size, so the cap does not apply to it.

### Plan shape: `data/cine/prep.json`

```json
{
  "fps": 24,
  "match": "median",
  "items": [
    { "id": "c01", "shot": "s04" },
    { "id": "c02", "shot": "s07", "flip": true },
    { "id": "c03", "src": "assets/drone.mp4", "in": 12.4, "out": 18.0, "reverse": true },
    { "id": "c04", "shot": "s11", "speed": 2 },
    { "id": "c05", "shot": "s15", "stabilize": true },
    { "id": "c06", "shot": "s16", "stabilize": { "engine": "deshake" } },
    { "id": "c07", "shot": "s20", "match": false },
    { "id": "c08", "shot": "s21", "speed": 0.5 },
    { "id": "c09", "src": "assets/talk.mp4", "in": 3, "out": 9, "audio": true },
    { "id": "c10", "shot": "s22", "reframe": { "x": 0.35 } },
    { "id": "c11", "shot": "s23", "reframe": { "x": [0.2, 0.7] } }
  ]
}
```

| Field | Meaning |
|---|---|
| `fps` | output frame rate (also `--fps`). Use the render fps |
| `format` | output size for `reframe` and the size cap, `"1080x1920"`; default: the job page's size |
| `room` (top) | size cap, a multiple of `format` (cover fit): default `1.33` (4/3); `false` keeps the source size. Also `--room` |
| `match` (top) | colour target for all items: `"median"` (default: the median of the items being prepped, the shots that will be in the edit), an item or shot id (`"c01"`, `"s04"`: a hero shot), `{ "Y": 120, "sat": 40, "warm": 6 }`, or `false` (no matching) |
| `id` | output name, `assets/cine/<id>.mp4` |
| `shot` | a shot id from `shots.json`: sets `src`, `in` and `out`, one frame inside each cut |
| `src`, `in`, `out` | or give the source range in source seconds |
| `speed` | `2` = twice as fast (output lasts half). Above 1 the frames are blended into motion blur (`blur: false` turns it off). Below 1 is refused unless the source frame rate covers it (`srcFps / speed >= fps`: 60 fps footage can play at 0.5x in a 30 fps edit, 24 fps footage cannot) |
| `reverse` | play backwards (buffers every frame: keep the range short, under about 20 s) |
| `flip` | mirror left to right |
| `stabilize` | `true` (vidstab, two passes, smoothing 12, zooms in to hide edges), `{ "engine": "deshake" }`, or `{ "shakiness": 6, "smoothing": 12 }` |
| `match` (item) | `false` skips matching for this item; an id or `{Y, sat, warm}` sets its own target |
| `audio` | keep the source audio; only with speed 1 and no reverse |
| `room` (item) | this item's size cap (`2` for a deep push-in, `false` for the source size) |
| `reframe` | crop to the output's shape (the largest crop the source allows) and scale to `format` with lanczos. `x`, `y`: where the crop sits, 0 = left / top, 1 = right / bottom, default 0.5. `[from, to]` pans the crop across the clip with an ease (a crop move). Prep notes how much the crop is upscaled. Used mostly for 9:16 from landscape footage (`style-cinematic-short`) |

Order inside one item: trim, stabilize, size cap, reverse, flip, reframe, colour, motion blur, speed, fps.

A reframe pan from left to right (`x: [0.2, 0.8]`) moves the window right, so the content moves left on
screen. Add it in the same direction as the run, and check the result with `measure`.

### How the colour match works

From up to 10 sampled frames of the item's range, prep solves three corrections and applies them with
one `lutyuv` filter:

- exposure: a gamma curve on Y, chosen so the mean Y meets the target (blacks and whites stay put),
  limited to gamma 0.6-1.6;
- saturation: a chroma gain, limited to x0.7-1.4;
- warmth: a shift on the two chroma planes (V up and U down for warmer), limited to 24 levels.

Small differences (Y under 2, warmth under 1, saturation under 4%) are left alone. After encoding, prep
measures the clip again and prints `before -> after (target)`. It adds a note when the result misses the
target by more than 4 Y or 3 warmth levels, or when a limit stopped it. That means the shot is too far
off: pick another shot, or accept the difference on purpose.

Prep does the correction. The look (grade) goes on in the page, the same grade on every shot
(`look.md`).

### Motion blur on speed-ups

At speed `k`, each output frame stands for `srcFps x k / fps` source frames. Prep blends that many
consecutive frames (`tmix`, 2-8) before it drops frames. That is the blur a real shutter would have
recorded. Under 1.5 source frames per output frame (for example 1.2x), there is too little to blend, and
the note says so.

## demo

```
node .agents/skills/style-cinematic-long/scripts/cine.mjs demo
```

A self-check on synthetic clips (a textured still filmed by a moving crop, no user media, no network):
the cut is found, the directions read left and right, the shaky clip reads shaky, the darker shot is
flagged, 2x gives half the length with blur, the match moves Y to the target, reverse and flip both turn
"right" into "left", stabilization is re-measured (deshake must cut shake by 30% or more), and a 9:16
reframe with a crop pan comes out 1080x1920 and moves faster in the run's direction, measuring a
prepped clip leaves `shots.json` alone, and the size cap downsizes 1280x720 to 854x480 for a 640x360
format (`room: false` and `room: 2` keep 1280x720). Run it
after any change to `cine.mjs` or `camera_motion.py`. Set `CINE_KEEP=1` to keep the temporary folder.

Results on 2026-10-14: all checks passed. On the synthetic clip, shake went from 2.64 to 1.26 with
vidstab and to 0.68 with deshake. On a real dance clip with added shake, both cut shake by about a third.
On 2026-10-15, with the size cap and the measure output names: all checks passed again.
