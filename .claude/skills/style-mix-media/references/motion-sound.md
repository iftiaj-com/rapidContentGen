# Motion, sound and checks

## Stop-motion

- Every entrance is three discrete frames on a 12 fps grid (2 frames each at 24 fps): a little big
  and tilted (scale 1.08, +1.6 degrees), a little small, at rest. No tweens anywhere.
- Attachments land two steps (0.17 s) after their paper, with their own sound.
- Note words pop one by one on their `times` (spoken word starts); default 0.3 s apart.
- `wiggle` steps a sticker's tilt at 6 fps; doodles draw in 3 steps, then alternate two jittered
  versions at 6 fps (line boil); `tone` flickers the exposure by up to 2.5 % at 8 fps.
- The live cut-out plays at 12 fps, so the person moves on twos like the paper around them.
- Nothing exits: a scene's pieces stay until the hard cut to the next board.

## Timing on the voice

- Beat = a spoken key word. Pop the paper 0.06-0.1 s before its first word.
- The person pops at the scene start (the board's own frame) or on the first word.
- Scenes start 0.12 s before their first word (`@vo2:It-0.12`), so the cut leads the voice.

## Sound

| Role | File | Use | Pack volume |
|---|---|---|---|
| place | `paper-place` | a note, a cut-out, a sheet | 0.4 |
| pin | `pin-click` | pin, binder clip, paperclip | 0.45 |
| tape | `tape-peel` | tape, washi, masking; a masking note | 0.45 |
| sticker | `sticker-press` | a sticker glued flat | 0.5 |
| scribble | `pencil-scribble` | a doodle | 0.22 |

`style build --sfx` places one per piece with its crest on the landing, on free lanes 40-47. The
two shortest files measure -70 LUFS integrated only because they are under 400 ms; their true
peaks are about -4 to -6 dBTP. Voices at -14 LUFS with a -3.6 dBTP ceiling leave room for them
(the test mixed at -14.7 LUFS, -1.8 dBTP, MIX OK).

Music: a calm bed by measurement when nobody can listen (low spectral centroid, little percussive
energy, a major key for a warm story; `bg-music-is-this-the-end` in the test), leveled to -18 LUFS,
0.5 in gaps, ducked to 0.28 x 0.5 under speech.

## Checks that caught real problems in the test

- `style build` ERROR: a note wider than the text-safe box (fix: `w` to wrap).
- `hf check` `text_occluded`: washi corner strips over the first word (fixed in the tool: tapes
  sit above the first line), and Caveat glyphs reaching past their boxes (fixed: padded text box).
- Snapshots: a heavy grain filter on photo props looked dirty (fixed: no grain on `img` props).
- Full-resolution crops: check the torn edges, die-cut borders and pin positions there, not on
  the contact sheet.
