---
name: Vox Parallax
styleAuthority: presentation
pack: library/styles/vox-parallax
principle: a still photo becomes a shot · depth sells it · archival finish
---

# Vox Parallax: design specification

Written by `rcg style apply --style vox-parallax`. A documentary look in the manner of Vox
explainers: still photos cut into depth layers and filmed by a virtual multiplane camera (the
Disney multiplane idea), finished with optical and archival texture. Technique only: no Vox
wordmark, fonts or footage.

## Tokens

```css
:root {
  --orange: #f0500d;      /* highlighter labels: one key word or name per beat */
  --orange-deep: #e42806; /* label mottling */
  --slate: #405a64;       /* title emphasis */
  --sky: #5f8fab;         /* light serif title lines */
  --ink: #22201d;         /* hand-drawn arrows */
  --paper: #d6cdbb;       /* archival paper ground */
  --cardboard: #a5825a;   /* photo-card board */
  --white: #ffffff;
}
```

## Type

- Serif (EB Garamond, bundled) for titles and labels. Light lines in `sky`, emphasis in bold `slate`.
- Highlighter labels: white serif on an orange swipe with a mottled, ragged edge.
- Captions: Oswald 700 uppercase on a dark warm pill (`rcg captions --style vox`).

## The shot

- Every photo beat is a multiplane scene: background far back, subject near the focus plane,
  foreground in front of it. A 35 mm or 50 mm virtual lens.
- The camera always moves: slow push, pan, rise or drift. One object may move on its own path
  (a cable car along its wire) so it never reads as a flat card zoom.
- Depth of field: foreground and far background blurred, the subject sharp.
- Finish: haze between far and near layers, fine grain, vignette, optional dust, light leak and
  paper texture. Motion stepped to 12 fps on the 24 fps timeline for the archival, hand-made feel.

## Safe area (this workspace, 9:16)

Text box x 64-900, y 192-1536. The parallax scene and boards are full frame; labels, titles and
cards are checked by `rcg style`.

## Approved entities

None by default. Record supplied logos, names and brand colours here.
