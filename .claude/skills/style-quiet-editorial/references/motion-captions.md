# Motion and captions

Ported from the Quiet Editorial UI skill (MIT). The components follow these timings; this is what
to choose and check.

## Motion

| Move | Timing | Where |
|---|---|---|
| Kicker rule and label | 0.32 s `power3.out` | `headline`, `list`, `progress` labels |
| Serif headline | lines rise out of a mask, 0.62 s `expo.out`, 0.08 s apart | `headline` |
| Underline emphasis | drawn left to right over 0.42 s after the line lands | `*word*` in `headline` |
| Primary entrance | 28 px rise, 0.5 s `power3.out` | cards, windows, the progress wrapper |
| Cursor travel | 0.72 s `power2.inOut`, then a 0.08 s press | `list` (`selectAt` is the click) |
| Selection response | 0.3 s `back.out(1.3)` | the selected row, pills, progress nodes |
| Exit | 0.18 s, 12 px lift | every component |

Order inside a beat: label, then the hero line, then the operational object. Start the operational
object 0.2-0.4 s after the headline (R9b: headline at +0.1, doc card at +0.4).

Rules: animate transforms, opacity, colours, borders, radius and clip only; never layout properties.
A cursor appears only when it selects, moves, groups or confirms. One success signal at a time.
Keep `selectAt` at least 0.92 s into a `list` so the cursor has room to travel (the tool checks).

## Captions

- `--style editorial`: Inter 700 on a warm near-white card with a hairline and soft shadow; rises in,
  lifts out. Use it over footage.
- `--style editorial-clean`: unboxed ink, no shadow; use it on the `canvas` or a clean wall.
- Default mode `2word` at 96 px, one line, groups never overlap in time.
- `--emphasis <word>` sets one word in EB Garamond. One per beat at most, the word the voice leans on.
- Captions go in after the style build so they stay on top. Keep the lane clear of cards while a
  caption is up; move the lane with `--y` rather than shrinking.

## Sound

Most editorial beats need none. The pack maps `select` (click-soft 0.3), `confirm` (chime 0.22) and
`pop` (pop 0.2); `--sfx` places them on the click, the check and the completed node.
