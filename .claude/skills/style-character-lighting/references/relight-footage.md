# Relighting footage with `relight`

## What it does (and does not do)

A real light shapes a face in 3D: the nose casts a shadow, the brow shades the eyes. `relight` cannot
see 3D. It shapes light in 2D, in face units that follow the face track every frame:

1. **Its own copy of the clip** (`src`, by default the tracked clip) in the box (`rect`). Every blend
   happens inside the component, so it works over anything, and anything planned before it is covered.
2. **Background drop** (with the matte): a dark layer over the whole box, then the subject redrawn
   from the matte on top, at its own brightness, contrast and saturation (`cut` in the setup).
3. **Rim light** (with the matte): an SVG filter at the end of the subject's filter chain. The matte's
   alpha is shifted away from the light and cut out of itself, so only the edges that face the light get
   a band. A threshold drops the faint band a feathered matte leaves elsewhere, and it is
   screen-blended over the subject.
4. **Shadows** (normal blend, black, in a rig that moves, turns and scales with the face): fall-off
   ellipse, half shadow (split line, soft edge, tilt, Rembrandt cheek patch), shadow from above (under
   light), shadow from below (top and butterfly), eye band (top), window blinds (noir).
5. **Light pools** (positioned each frame, not in the rig, so they can blend). `soft-light` shapes
   midtones. `color-dodge` with a dark tint is an exposure gain that leaves black black: it lights the
   face without painting the dark background.
6. **Grade:** a soft-light colour wash and a saturation cut.
7. **Envelope:** `in` cut, fade or flicker, and `flicker` (a fire or a failing bulb) as a seeded step table.

So: no true cast shadows, no light that turns with a head in profile, and no change to the light on the
background wall beyond darkening it. It reads well on a face that is front-on or three-quarter, and 150 px
wide or more.

## Prerequisites

```
node tools/rcg.mjs track --job jobs/<id> --src assets/<clip> --name main             # data/track-main.json
node tools/rcg.mjs matte --job jobs/<id> --src assets/<clip> --plate --sheet --name main   # assets/matte/main-fg.webm
```

- `track` and `matte` are `auto` by default: the one `data/track-*.json` and the one
  `assets/matte/*-fg.webm` in the job. With several, name them.
- Without a matte, the front, split, under, top, three-point, rembrandt, loop, butterfly, noir and dual
  setups still work: shadows and pools only, with no background drop and no rim. `back-blue` and
  `silhouette` refuse to build.
- `face: "cx,cy,w"` (fractions of the box) lights a still subject with no track. Roll is 0.

## Footage that relights well

| Good | Weak |
|---|---|
| One person, face to camera or three-quarter | Profile, the face turning away, two people |
| Even, soft light in the source (the relight adds the drama) | Hard light already in the source on the "wrong" side |
| Face 150 px wide or more in the box (`zoom` helps in the stage layout) | A small face in a wide shot (the tool reports under 90 px) |
| Plain or dark background, clean matte | Busy background, hair against a similar colour, motion blur |
| Steady head | Fast moves (the track is smoothed; light can trail a quick turn) |

## Parameters worth tuning

| Param | Default | Change it when |
|---|---|---|
| `amount` | 1 | The setup is too strong for the moment. 0.5-0.7 for a baseline, 0.8 for most turns, 1.0-1.2 for the peak |
| `side` | per setup | The key should come from the other side: match a window in the shot, keep continuity, or for short lighting on a turned head |
| `depth` | per setup | The shadow side needs more fill (lower) or none (higher) |
| `soft` | per setup | The split edge should be harder (2-4) or the key softer (25-40). In face units: 100 = face width |
| `bg` | per setup | The world should fall away more (0.9) or stay (0.3); needs the matte |
| `keyColor` | per setup | The motivating source: `key-warm` lamp, `key-white` bulb, `rim-blue` moon or screen, any CSS colour |
| `rimColor` | per setup | A warm rim for a sunset, a blue one for night |
| `grade` | per setup | The colour wash is too strong or too weak |
| `flicker` | 0 | A fire, candle or failing bulb motivates the light: 0.15-0.3 |
| `rect`, `zoom`, `focus` | full frame | The stage layout: the box, how close, where the face sits (default 0.5,0.4 of the box) |
| `mediaStart` | the item's start | The relight shows another part of the clip than the timeline time, or a held clip (0) |
| `matteOffset` | 0 | The matte runs a frame early or late against the footage (an edge shimmer that moves) |
| `in` | cut | `fade` for a light dimming up, `flicker` for a bulb switching on |
| `click` | false | A light switch sound on a reveal (`--sfx` on the build) |

## Checks (look, do not trust the exit code)

Snapshot the start, middle and end of every relight, and READ them:

- **The light sits on the face:** the split line on the nose, the eye band on the eyes, the chin pool
  on the chin. If it lags, the track is off: check `data/track-*.json` against the frames (roll and
  centre), or use a steadier stretch.
- **Matte edge:** no light halo round the hair, no background showing inside the subject. A shimmering
  edge that moves means the matte is out of step (`matteOffset` of plus or minus 1/30 s).
- **Rim:** only on the light's side. A rim all the way round reads as a cut-out sticker: lower
  `rimColor` brightness or the setup's amount.
- **Background:** dark areas stay dark (no glowing ellipse round the head). If a pool shows on the
  background, lower `amount` or `bg`.
- **Skin:** no clipped colour patches (red lips or beard blowing out). Pools must stay tints; lower
  `amount` if a face clips.
- **Words:** captions and tags pass `hf check` contrast on the darkest setup.
- The render's own sheet (`renders/final-sheet.png`) and one full-resolution frame of the darkest setup.

## The test job

`jobs/2026-10-11-character-lighting-test`: the R11b talking clip (one person, a black T-shirt, a wooden
door behind them, flat indoor light) with its track and matte. 0-6 s: front, split, under, top,
back-blue and three-point in the stage layout, with a chained light plot. 6-12 s: rembrandt, loop,
butterfly, noir, dual and silhouette full frame, with mood tags. It rendered with `RENDER OK` (all
checks passed) on 2026-10-11. Bugs found and fixed while building it:

- **Rim around the whole outline** (an erode makes a band on every edge). Fix: a shift-and-cut rim
  plus a threshold.
- **Screen pools painted the black background.** Fix: dark-tint color-dodge.
- **A near-white color-dodge clipped lips and beard to red.** Fix: tint at 0.42.
- **The stage crop framed on the whole clip's median face.** Fix: the median of the item's own window.
- **The matte drawn twice tripped the duplicate-media lint.** Fix: the rim joined the subject's filter
  chain.
