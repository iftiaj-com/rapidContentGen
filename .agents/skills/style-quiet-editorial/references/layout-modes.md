# Layout modes and safe zones

Ported from the Quiet Editorial UI skill (github.com/audrey-560/quiet-editorial-ui, MIT) and merged
with this workspace's 9:16 rules. Choose the layout from the actual frames, not the media type.

## Mode selection

| Mode | Choose when | Treatment |
|---|---|---|
| `available-area` | A region stays clear for the whole beat and holds the whole idea, motion included | `headline` (and one small object) anchored in that region; footage untouched |
| `direct-overlay` | Footage fills the frame or the free region comes and goes | `headline` with `surface: card`, or a `doc-card` / `window`, in a bounded spot clear of faces and source text |
| `full-frame` | No footage, or the beat hands the frame to graphics | `canvas` first, one dominant `headline`, one operational object |

Do not switch modes inside a beat. Different beats may use different modes.

## Inspection pass

1. Snapshot early, middle and late in every beat (more where the person moves).
2. Mark face and mouth, logos, source UI, source text, captions and moving objects.
3. Keep only the regions that stay clear in all samples.
4. Reserve the caption lane (centre y 1344, about y 1290-1400 at 96 px) before anything else.
5. Use `available-area` only when the full motion fits: the headline rise (about 28 px), the
   cursor's travel path and the selected row's 1.03x scale.

## Safe area (9:16, 1080 x 1920)

| Zone | Pixels |
|---|---|
| Text-safe box (enforced by `rcg style`) | x 64-900, y 192-1536 |
| App header | y 0-192 |
| Bottom 20 % and right 180 px | y 1536 and below, x 900 and beyond: nothing load-bearing |
| Box centre | x 482 (not 540, because of the right edge) |

## Collision priority

1. Face and mouth.
2. Required source UI and source text.
3. Logos and identity marks.
4. Captions.
5. Editorial overlays.
6. Decoration.

## Aspect behaviour

| Format | Behaviour |
|---|---|
| 9:16 | Vertical stack: kicker, headline, then the object below; do not assume a speaker split |
| 16:9 | An asymmetric split when the person holds one side; else a low, wide overlay |
| 1:1 | A compact stack with fewer objects |

## Existing design specs

`rcg style apply` keeps an existing `frame.md` once as `frame.pre-quiet-editorial.md`, never a backup
of a backup. Record retained brand exceptions under "Approved Entities" in the new `frame.md`.
