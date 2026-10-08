---
name: Quiet Editorial UI
styleAuthority: presentation
pack: library/styles/quiet-editorial
principle: one clear idea · editorial hierarchy · operational precision
---

# Quiet Editorial UI

Written by `rcg style apply --style quiet-editorial`. Ported from the Quiet Editorial UI skill
(github.com/audrey-560/quiet-editorial-ui, MIT). Calm, editorial frames from a literary serif,
precise interface copy, warm paper-like surfaces and observable state changes. The frame should
feel authored, not decorated.

## Tokens

```css
:root {
  --canvas: #f7f7f6;        /* the graphic ground */
  --ink: #0d0d0d;           /* hierarchy */
  --muted: #6b6b6b;         /* metadata, de-emphasized copy */
  --border: #d9d9d6;        /* hairlines */
  --quiet: #f5f5f3;         /* supporting surfaces */
  --active: #ffffff;        /* the selected / foreground surface */
  --success: #10a37f;       /* complete, confirmed, ready, passed: once at a time */
  --success-deep: #0c8066;  /* success as text or a filled pill (contrast) */
  --shadow-soft: rgba(0, 0, 0, 0.06);
  --shadow-raised: rgba(0, 0, 0, 0.12);
}
```

## Typography

- Display: EB Garamond 400 (bundled), sentence case, tracking about -0.035em. It stands in for
  the reference's Georgia. No italic is bundled: emphasis is a drawn ink underline, at most once per beat.
- Everything operational: Inter. Labels Inter 700 uppercase, tracked 0.16em.
- The display line is at least three times the size of the nearest label.
- At 1080 px wide: labels 24 px, UI 30 px, body 34 px, captions 96 px and one line.

## Colour

- Canvas as ground, ink for hierarchy, active white for the foreground card, quiet for chrome.
- Green only for a genuinely complete, confirmed, ready or passed state. Never decoration.
- Brand colours only on the brand entity or its semantic state. No second decorative accent.

## Depth and shape

- 2 px hairlines, 16-26 px radii, black shadows at 6-12 % with broad falloff.
- Full pills only for compact labels, actions and status.
- No glass blur, gradients, neon, glow, thick outlines or particles. Let the canvas show.

## Layout modes

- `available-area`: one headline and one operational object inside a stable empty region.
- `direct-overlay`: a bounded warm-white card over footage, after mapping faces, text and logos.
- `full-frame`: the canvas, one dominant headline, one secondary object (`canvas` first).

## Safe area (this workspace, 9:16)

Text box x 64-900, y 192-1536. `rcg style add` refuses a box outside it unless `--allow-edge`.

## Motion

Label, then hero, then operational object. Entrances 0.35-0.62 s with 12-42 px of travel
(`power3.out`, `expo.out` for display). Cursor travel 0.55-0.9 s, and only when it selects,
moves, groups or confirms something. Selection response 0.18-0.42 s. Exits 0.12-0.22 s.
Opacity supports motion; it is never the whole choreography.

## Approved Entities

No names, logos, products, vendors, claims or brand colours are approved by default. Add only
entities supplied or approved for this job.

## Pre-render audit

- Hierarchy obvious; italic not faked; one emphasis per beat.
- Palette: declared neutrals, one success state, approved exceptions only.
- Every cursor action has a visible consequence; no floaty fade sequences.
- Captions one line, safe lane, hard exits. Footage, copy, timing and audio intact.
