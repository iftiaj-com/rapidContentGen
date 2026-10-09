# Layering and safe zones

Ported from the Tactile Paper Collage skill (MIT) and merged with this workspace's 9:16 rules
(lessons 10 and 13an in the video-job skill).

## Layout modes

Pick the first mode that works for the whole beat. Do not switch modes inside a beat.

### Direct overlay (default for talking heads)

Footage stays intact; bounded paper objects sit only in regions that stay clear for the whole beat.
Find those regions from snapshots across the clip, not from the first frame. If no region stays
clear, use a short full-frame beat instead of chasing the speaker with moving overlays.

### Behind subject

Paper sits between the footage and a cut-out of the person, so the person overlaps it.

1. `rcg matte --job jobs/<id> --src assets/<clip> --plate --sheet --choke 6 --name v1` and READ the sheet.
2. `rcg pnp --job jobs/<id> --base "#v1" --cutout assets/matte/v1-fg.webm --id p1 --show <a-b>`.
3. `rcg style build ...` (or `add`), then `rcg layer --job jobs/<id> --id <item> --behind p1`.
4. Items that must stay in front of the person: `rcg layer --id <item> --z 40`. Captions too.
5. Re-run step 3 and 4 after any rebuild of those items (the build replaces the generated files).

Stack, back to front: footage, paper ground and texture, load-bearing paper objects, the cut-out,
front labels and handoff objects, captions. Keep the face, mouth, microphone and active gestures
clear: big type behind the head reads well (R9a "SHIP IT"), small type does not.

### Full frame

`paper-ground` first, then one hero object and one support (path, label or evidence). The footage
underneath keeps playing but is hidden. Not a dense scrapbook page.

## Collision priority

1. Face and mouth.
2. Gestures and held objects.
3. Source UI or text that carries meaning.
4. Logos and identity marks.
5. Captions.
6. Collage objects.
7. Texture.

Move or remove the lower item first.

## Safe area (9:16, 1080 x 1920)

| Zone | Pixels | Rule |
|---|---|---|
| Text-safe box | x 64-900, y 192-1536 | every component box, tilt included (`rcg style` enforces it) |
| App header | y 0-192 | nothing load-bearing |
| Bottom 20 % | y 1536-1920 | nothing load-bearing (app UI, captions of the platform) |
| Right edge | x 900-1080 | nothing load-bearing (app buttons) |
| Caption lane | centre y 1344 (default), about y 1260-1430 at phrase size 60 | reserve it before placing paper |

The box centre is x 482, not 540, because the right 180 px are reserved. Footage and `paper-ground`
may bleed to every edge. For other frame sizes the template's `template.json` safe zones are read.

## Frame inspection

Inspect the beginning, middle and end of every beat, plus extra samples where the person moves,
gestures widen or a paper object overshoots. Check the render, not just the snapshots: extract one
full-resolution frame of the densest text from the MP4.
