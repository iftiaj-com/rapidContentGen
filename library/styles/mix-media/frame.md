---
name: Mix Media (cork-board scrapbook)
styleAuthority: presentation
pack: library/styles/mix-media
---

# Design specification

Written by `rcg style apply --style mix-media`. Learned from the user's Hi.Boly director's bible
(the "Mix Media Guide") and two reference videos (Video-84385, Video-41225), technique only.

## Intent

Every frame is a miniature collage scene on a cork board: someone builds a small story piece by
piece, like opening a personal scrapbook. Intimate, soft, whimsical, nostalgic, diary-like.
Never corporate, loud, over-polished, generic or 3D-rendered.

## The four pillars (nothing else appears in frame)

| Pillar | Look | Rule |
|---|---|---|
| Board | warm cork, thin wooden frame | the cork never changes; the overlay changes per scene (bare, newspaper, kraft, fabric, watercolor) |
| Character | real photo cut-out, irregular torn cream paper edge | always photographic, never illustrated, no outline, no drop shadow |
| Text | handwritten black ink on torn notebook paper | text always lives on a physical paper piece, pinned or taped |
| Props | illustrated vintage collage stickers | never photorealistic; 4-6 per scene; at least two textures |

## Semantic colour roles

```css
:root {
  --cork: #a8784a;      /* the world */
  --cream: #f3e9cc;     /* torn paper edges, tape */
  --notebook: #fdfbf4;  /* note paper */
  --rule: #9ab3d6;      /* notebook lines */
  --margin: #e3a0a0;    /* notebook margin */
  --ink: #22201c;       /* every word */
  --pink: #eaa5b2; --butter: #f2d06b; --peach: #f0b089;     /* warm accents: stickers, washi, stars */
  --mint: #9fcfb4; --dusty: #8eadd0; --lavender: #b7a5d9;   /* cool accents: flags, highlights, outfit */
  --sepia: #a47d55; --faded-red: #c45a4b; --old-gold: #c9a24c; /* vintage: stamps, tickets, frames, maps */
}
```

Mood by palette temperature, one per scene (`board mood`, `tone`): warm = happy or nostalgic,
cool and desaturated = sad or lost, golden = present or grateful.

## Type

- Every message: Caveat Medium (`MM Caveat` 500), black ink, on paper. One emphasised word per
  note in Caveat Bold with a pastel highlighter band.
- Not typewriter, not bold serif, not marker, not a digital display face, never floating.
- EB Garamond only as printed matter inside props (ticket, stamp value, calendar).
- At 1080 px wide: note words at least 56 px; caption slip words 64 px.

## Geometry

- Straight-on, flat: a board on a wall. No perspective, no 3D depth, no dramatic angles.
- Every element tilted 2-5 degrees; nothing perfectly aligned. The frame stays filled.
- Attachments: at least two methods per scene (push pin, scotch tape, washi, masking tape,
  binder clip, paperclip, glued flat).
- Shadows only as a small contact shadow under paper and props; none on the character.

## Motion

- Stop-motion. One beat (about a second, or one spoken key word) = one new element.
- A piece pops in on discrete frames (12 fps steps): never slides, never fades.
- Board first, then the character in the first one or two beats, then words and props build up.
- Scene change = hard cut to the next board (or the last piece of a scene hints at the next).
- Optional: a slow stepped push-in is NOT built (the board stays still; the guide's default).

## Sound

- One soft, tactile sound per placed piece: paper placing, pin click, tape peel, sticker press,
  pencil scribble for doodles. ASMR-adjacent, quieter than the voice.
- Music: lo-fi, acoustic or soft piano, never overpowering; ducked under the voice.

## Safe area (this workspace, 9:16)

Text (notes, caption slips) inside x 64-900, y 192-1536; `rcg style` refuses a note outside it.
The character and props may reach the frame edges and the bottom 20 % (decoration), but never put
the face or a key prop under the right-side app buttons.

## Scrapbook test

Could this frame be a page in a handmade diary? If not, remove what fails it.

## Approved entities

(none yet: record the user's own name, brand colours or logo here when given)
