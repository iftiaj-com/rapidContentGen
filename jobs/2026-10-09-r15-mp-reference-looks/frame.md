---
name: Marketing Pro
styleAuthority: presentation
pack: library/styles/marketing-pro
principle: the camera never rests · one keyword per sentence · captions follow the voice
---

# Marketing Pro: design specification

Written by `rcg style apply --style marketing-pro`. A promo talking-head look measured from the
user's reference ad. Technique only: no footage, copy, logos or people from the reference.

## Camera (planned by `rcg marketing-pro plan`)

- Zoom ladder: 1.0 wide, 1.3 base, 1.6 punch (of the cover fit). Never below 1.0 (no edges).
- Eased zooms of 0.27 s (power2, in and out) at clause starts, 1.4-3.2 s apart; hard punches to 1.6
  on strong sentence starts (at most one per 8 s); every event 0.1 s before the clause starts.
- Between events the camera drifts: zoom x1.03-1.06 and a small pan across the segment.
- The face sits at x 0.5, y 0.37 when the zoom leaves room.

## Tokens

```css
:root {
  --purple: #7f51b6;   /* serif caps, accent words */
  --teal: #3aa6bd;     /* accent words in italic heroes */
  --neon-a: #ff7bf5;   /* neon gradient start (stats) */
  --neon-b: #9ef9ff;   /* neon gradient end */
  --neon-glow: #ff3fd8;
  --strike: #ed4940;   /* the strikethrough line */
  --white: #ffffff;
  --ink: #111111;
  --pill: rgba(17,17,17,0.82);
  --ring: #f2c230;     /* tag outlines and markers */
}
```

Remap purple / teal to approved brand colours per job (record them below).

## Type

- Hero looks: Playfair Display 700 caps (serif-caps); Playfair Display Italic (italic, downloaded,
  OFL); Montserrat 900 (neon, strike) and 700 (wide caps); Inter 700 (focus pull, tags, CTA).
- Body caption: Inter 400 lead line over Inter 700 rolling words (`rcg captions --style mp-body`).

## Hero looks by meaning

| Role | Look |
|---|---|
| number, %, money | `neon` (pink-to-cyan gradient, glow) |
| negation (not, never, no) | `strike` (white caps, red line drawn through) |
| contrast word (but, however, yet) | `focus` (white bold, blur-to-sharp focus pull) |
| opener, name, place | `serif-caps` (purple serif caps, word by word) |
| emotion, closing | `italic` (italic serif, one coloured word) |
| anything else | `wide` (wide-tracked caps with a small lead line) |

Never the same look twice in a row. One hero per sentence, upper third, behind the head when the
cut-out is clean.

## Safe area (9:16)

Text box x 64-900, y 192-1536. Heroes stay above the eyes; the body caption sits at chest height.

## Approved entities

None by default. Record supplied logos, names, offers and brand colours here.
