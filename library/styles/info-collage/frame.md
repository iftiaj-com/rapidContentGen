---
name: Info-graphics in Paper Collage
styleAuthority: presentation
pack: library/styles/info-collage
principle: numbers and diagrams made of paper · one accent per beat · every entrance on a spoken word
---

# Info-graphics in Paper Collage: design specification

The info-graphics components (`library/styles/info-graphics`) in the Tactile Paper Collage world
(`library/styles/tactile-collage`). Use both packs in one plan: collage paper grounds, cards,
stamps, tape and routes; info-graphics counters, equations, gauges (`range`), icons and word-timed
stacks re-skinned with these tokens.

## Tokens

| Role | Value | Use |
|---|---|---|
| cream / paper ground | `#f3e8cc` | the page (collage `paper-ground` tone paper) |
| white / sheet | `#fffaf0` | cards, knobs, chips on dark |
| ink | `#25231f` | text, ink edges, the key-cap chip |
| orange (signal) | `#d95b45` | the one warning or emphasis per beat (fills) |
| orange-deep (signal-ink) | `#b8432f` | that accent as text on paper |
| good (resolve) | `#58aa8d` | the right answer, a sweet spot (fills) |
| good-deep (resolve-ink) | `#2f7a60` | resolve as text |
| muted | `#6b6252` | labels and notes on paper |

## Type

Archivo Black for numbers, equation terms and stack lines; Courier Prime Bold for labels, notes and
captions; Permanent Marker for the one emphasis word (`*word*` in a stack with `heavy: true`).

## Safe area

Text box x 64-900, y 192-1536. In a split screen the top panel shows y 0-1000 clearly and fades to
black by y 1190: keep top-panel graphics in y 200-960.
