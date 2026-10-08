# Style system

Ported from the Tactile Paper Collage skill (MIT). Tokens live in
`library/styles/tactile-collage/style.json`; `rcg style apply` writes them into the job.

## Identity

Handmade paper craft plus editorial information design: physical, legible, playful and
deliberately assembled. Not childish, not distressed past readability, not covered in stickers.

## Colour roles

| Token | Role |
|---|---|
| `paper` | warm continuous ground (`paper-ground`) |
| `sheet` | lighter paper for cards, notes, documents |
| `ink` | structure, edges and primary copy |
| `primary` | the main explanatory accent (checklist titles, active caption word) |
| `signal` | warning, contradiction, urgency, stamps; text uses `signal-ink` |
| `spark` | emphasis and discovery: tape, highlight, file tags |
| `resolve` | completion, handoff, success; text uses `resolve-ink` |

No more than three accents in one frame. Brand colours may replace accents when contrast and role
stay clear. The `-ink` shades exist because the base signal and resolve fall under 3:1 as text
(measured by `hf check` in R9a); a remapped brand colour needs the same check.

## Type

- Permanent Marker (`marker`): short handwritten emphasis only, never a paragraph.
- Courier Prime Bold (`mono`): labels, files, checklists, captions.
- Archivo Black (`display`, bundled): large statements. An approved brand display face may replace it.
- At 1080 wide: headlines 54 px or more, operational copy 28 px or more, captions 42 px or more.
  The components' `min` params hold these floors.

## Surfaces and edges

- Flat paper fills; texture (dots, ruled lines, grid) only on the ground and at low contrast.
- 4 px ink edges; crisp offset shadows down-right, or a soft paper lift on notes. No glow, no blur.
- Resting tilt within -5 to 5 degrees (seeded); bigger angles only during entrances.
- Tape, stamps and edges explain attachment, approval, grouping or sequence.

## Failure signatures

- Random scrapbook decoration unrelated to the narration.
- Every object tilted, bouncing or outlined equally.
- Tiny desktop UI rebuilt inside a vertical frame.
- Texture that lowers contrast or makes the footage look dirty.
- Paper covering faces, gestures, captions, source UI or required logos.
- A vintage palette forced over an established brand.
