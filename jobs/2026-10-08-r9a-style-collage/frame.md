---
name: Tactile Paper Collage
styleAuthority: presentation
pack: library/styles/tactile-collage
---

# Design specification

Written by `rcg style apply --style tactile-collage`. Ported from the Tactile Paper Collage
skill (github.com/audrey-560/hyperframes-tactile-collage, MIT).

## Intent

Turn each narrative beat into one legible physical metaphor assembled from paper, ink and
restrained editorial type. Keep the supplied footage recognizable and keep approved identity assets.

## Semantic colour roles

```css
:root {
  --paper: #f3e8cc;   /* warm continuous ground */
  --sheet: #fffaf0;   /* lighter foreground paper: cards, documents */
  --ink: #25231f;     /* structure and primary copy */
  --primary: #3159c8; /* the main explanatory accent */
  --signal: #d95b45;  /* warning, contradiction, urgency, stamps */
  --spark: #e2b93f;   /* emphasis, discovery, tape */
  --resolve: #58aa8d; /* completion, handoff, success */
  --shadow: rgba(37, 35, 31, 0.22);
}
```

Neutral defaults, not a brand palette. Remap accents to approved brand colours and keep the roles.
No more than three accents in one frame.

## Type

- Handwritten emphasis: Permanent Marker (`TPC Marker`), short phrases only.
- Labels, files, checklists, captions: Courier Prime Bold (`TPC Courier`).
- Display statements: Archivo Black (bundled heavy sans), unless the project has an approved one.
- At 1080 px wide: headlines at least 54 px, operational copy at least 28 px, captions at least 42 px.

## Geometry

- Ink edges 3-6 px (components use 4 px). Resting tilt within -5 to 5 degrees.
- One shadow direction: down and to the right.
- Texture only on the ground, at low contrast, never over load-bearing copy.
- One hero object per beat; supporting objects explain sequence, evidence, grouping or state.

## Layout modes

- `behind-subject`: paper objects between the footage and the cut-out subject (rcg matte + pnp + layer).
- `direct-overlay`: bounded paper objects in stable negative space over intact footage.
- `full-frame`: the paper world owns the beat (`paper-ground` first).

## Safe area (this workspace, 9:16)

Text box x 64-900, y 192-1536. Nothing load-bearing in the bottom 20 % or the right 180 px.
`rcg style add` refuses a component box outside it unless `--allow-edge`.

## Approved entities

Record retained logos, exact copy, brand colours, protected source UI and identity constraints
here before building. None are approved by default.

## Motion

Placed, drawn, passed, opened, stacked, checked and stamped. Cards 0.42-0.75 s `power3.out`;
stamps and stickers 0.32-0.58 s `back.out(1.25-1.5)`; routes and scribbles draw over 0.5-1.2 s;
exits 0.16-0.3 s and they move with a reason. One hero move, one support move, a quiet ground.
Everything deterministic and seek-safe.
