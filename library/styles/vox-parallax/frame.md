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
- At least three planes: something in front, the subject, something far. A photo with no
  foreground gets a prop or a word between the planes.
- The camera always moves: slow push, pan, rise or drift. One thing moves on its own: an object on
  a path (a cable car along its wire) or a slow sway (a person breathing), so it never reads as a
  flat card zoom.
- A scene can also be built from cut-out props on a colour ground (`props`, `ground`).
- One key word may sit inside the scene, behind the subject (`word`).
- Depth of field: foreground and far background blurred, the subject sharp.
- Finish: haze between far and near layers, fine grain, vignette, optional dust, light leak and
  paper texture. Motion stepped to 12 fps on a 24 fps timeline (15 on 30) for the archival,
  hand-made feel. One `finish` layer (grain, vignette, flicker) over the whole edit.

## Safe area (this workspace, 9:16)

Text box x 64-900, y 192-1536. The parallax scene and boards are full frame; labels, titles and
cards are checked by `rcg style`.

## Approved entities

None by default. Record supplied logos, names and brand colours here.
