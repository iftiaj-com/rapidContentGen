---
name: Info-graphics Essay
styleAuthority: presentation
pack: library/styles/info-graphics
principle: one idea per sentence · one orange word · every visual lands on a spoken word
---

# Info-graphics Essay: design specification

Written by `rcg style apply --style info-graphics`. A voice-led video essay look, learned from a
reference Short (technique only, nothing copied): the voice carries the argument, and a new
visual metaphor arrives with each sentence. Workflow and judgment:
`.agents/skills/style-info-graphics/SKILL.md`.

## Tokens

```css
:root {
  --dark: #191919;        /* the main ground; a soft vignette on top */
  --dark-2: #262626;      /* cards on the dark ground */
  --cream: #fbf3e1;       /* warm ground for calm, explanatory beats */
  --paper: #f5f5f5;       /* light grey ground for charts and timelines */
  --ink: #161616;         /* text on light grounds */
  --white: #ffffff;       /* text on dark grounds, cards */
  --muted: #6e6a63;       /* secondary text on light grounds */
  --muted-dark: #a3a3a3;  /* secondary text on dark grounds */
  --orange: #e4722a;      /* the accent: one word per beat, discs, steps, highlight boxes */
  --orange-deep: #b4500f; /* the accent as text on cream, paper or white (orange is 2.7:1 there) */
  --orange-soft: #f6c9a6;
  --chip: #101010;        /* caption chip, key caps, orbit core */
  --line: #d9d2c3;        /* hairlines on light grounds */
  --shadow: rgba(0, 0, 0, 0.18);
}
```

## Type

- Inter (bundled) only. Display 700 for lines and numbers, 400 for body, 900 for the one shouted
  word. Tight tracking (-0.03 em) on display lines.
- Accent: exactly one word or phrase per beat in orange (`*word*`). On light grounds the pack uses
  `orange-deep` for text automatically.
- Oblique (`slant`) for reflective words (imagination, different, enough). Not for whole scenes.
- Captions: one spoken word at a time on a small black chip, low centre
  (`rcg captions --style info-chip --mode word --y 1440`). The chip is the only caption.

## Rhythm

- A sentence is a scene: a ground, then one hero object. A clause adds or changes one part of it
  (a word, a step, a chip, a highlight). Scenes last 1.5 to 5 s.
- Every entrance lands on a spoken word (`times`, anchors in `rcg infographics resolve`).
- Grounds alternate so cuts read: dark, then cream or paper, then dark. The arc, wipe and iris
  entrances are for section turns; plain cuts are the default.
- Motion: words rise 34 px out of a 10 px blur in 0.34 s; objects pop with a small overshoot;
  lines draw in 0.5 s; exits fade in 0.2 s.

## Safe area (this workspace, 9:16)

Text box x 64-900, y 192-1536. Grounds and collages are full frame; everything else is checked by
`rcg style`. The caption chip sits at y 1440, so keep hero objects above y 1360.

## Approved entities

None by default. Record supplied logos, names and brand colours here. Never imitate a real
account, outlet or brand in posts, prompt bars or plates.
