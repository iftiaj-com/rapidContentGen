# Style system

Ported from the Quiet Editorial UI skill (MIT). Tokens: `library/styles/quiet-editorial/style.json`.

## Identity

Literary display type plus precise software-interface structure: composed, calm, useful and
tactile, never nostalgic or ornamental.

## Hierarchy

- One dominant sentence, object or state change per beat.
- EB Garamond for display language, Inter for everything operational.
- Labels in Inter 700 uppercase, tracked 0.12-0.18em.
- Size and serif/sans contrast before colour or weight. The display line is at least 3x the label.
- Generous negative space. Do not fill every open region.

## Colour semantics

| Token | Meaning |
|---|---|
| `canvas` | the warm graphic ground |
| `ink` | hierarchy, active borders, filled progress nodes |
| `muted` | metadata and de-emphasized copy |
| `border` | hairlines, quiet rows |
| `quiet` / `active` | supporting surfaces / the selected or foreground surface |
| `success` / `success-deep` | complete, confirmed, ready, passed; `success-deep` for text and filled pills |

`success` measures 2.76:1 as text on the canvas, so text and pills use `success-deep` (4.2:1 on the
canvas, white on it about 4.9:1). A real object colour (a file type, a status) may appear on that
object only. A required brand colour stays on the brand entity.

## Surfaces

- Canvas continuous across graphic-only beats.
- 2 px hairlines, 16-26 px radii, pills only for compact labels and status.
- Black shadows at 6-12 % with broad falloff. No gradients, glass, neon, glow, thick outlines, particles.

## Components

- Headline: big EB Garamond, sentence case, optional underline emphasis, kicker with a short rule.
- Document card: white, hairline, soft shadow, label row, serif title, ruled lines.
- Window: quiet toolbar with a centred label, thin divider, no ornamental chrome.
- List: quiet rows; selection changes border, scale and shadow, not a glow.
- Progress: ink hairline, numbered nodes, one green completed node.
- Cursor: crisp black pointer with a white edge, only when it causes a change.

## Failure signatures

- Generic SaaS dashboard grids or rows of equal-weight cards.
- Every headline emphasized.
- Green used decoratively.
- Tiny interface copy that only reads at desktop zoom.
- Fade-only sequences with no causal action.
- Footage covered just because an overlay fits.
