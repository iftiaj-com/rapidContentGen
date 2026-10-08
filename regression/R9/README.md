# R9: style packs (Tactile Paper Collage, Quiet Editorial UI)

Two jobs on the user's test clip `Video_for_testing.mp4` (16:9, 23.976 fps, no audio, from R7),
shown cover-cropped to 9:16. Each uses every component of one pack, the pack's caption preset and
its SFX map. Voice: Kokoro `af_heart` lines from `data/vo-lines.json` (`rcg voice say`), leveled to
-14 LUFS / -3.6 dBTP. Plans: `data/style-plan.json` in each job.

## R9a: `jobs/2026-10-08-r9a-style-collage`, 12.0 s, mode (b)

| Beat | Time | Mode | Components |
|---|---|---|---|
| 1 | 0-3 | direct overlay (wall above the head) | `headline` with `*messy*` highlight |
| 2 | 3.1-6.3 | direct overlay | `paper-card` note |
| 3 | 6.3-9.45 | full frame | `paper-ground` dots, `checklist` (3 timed checks), `route`, `stamp` (resolve) |
| 4 | 9.45-12 | behind subject (R7 matte, `rcg pnp --show 9.4-12`) | `headline` "SHIP IT" behind p1, `file-tag` in front (z 40) |

Captions: `--style collage --mode phrase`, one `--emphasis` word per line, `cap-vo4` at z 40.

## R9b: `jobs/2026-10-08-r9b-style-editorial`, 14.4 s, mode (b)

| Beat | Time | Mode | Components |
|---|---|---|---|
| 1 | 0.1-3 | available area (wall above the head) | `headline` with kicker and `*clear*.` underline |
| 2 | 3-6 | full frame | `canvas`, `headline`, `doc-card` (neutral pill) |
| 3 | 6-9 | full frame | `headline`, `list` (cursor selects row 3 at +1.5 s, green check) |
| 4 | 9-12 | full frame | `window` (3 lines), `progress` (3 steps, last green) |
| 5 | 12.2-14.3 | direct overlay | `status` success pill |

Captions: `--style editorial` over footage, `editorial-clean` on the canvas, `2word`, one emphasis word.

## R9c: `jobs/2026-10-08-r9c-style-extras`, 4 s, snapshots only

`paper-ground` (ruled), `taped-photo` (a still from the clip, `assets/stills/s1.jpg`), `paper-card`,
and `scribble` circle, arrow and underline. `hf check` passes (22/22 contrast; one
`rotation_pivot_drift` warning on the photo's tape wrappers, harmless). Snapshots at 0.4, 3.2 and
3.88 s read: tape lands after the photo, marks draw once. The circle sat under the card because it
came first in the plan: items stack in plan order.

## Steps

1. `rcg new-job --name r9a-style-collage --video <R7 clip> --mode b` (and `r9b-style-editorial`).
2. `rcg voice say` + `rcg level --lufs -14 --ceiling -3.6`; `index.html`: one `.shot` with the clip, the voice lines.
3. `rcg style apply --job $J --style <pack>`.
4. R9a only: copy R7's `assets/matte/v1-fg.webm`, `rcg pnp --job $J --base "#v1" --cutout assets/matte/v1-fg.webm --id p1 --show 9.4-12 --enter none --exit none`.
5. `rcg style build --job $J --spec $J/data/style-plan.json --sfx --insert` (read the whole output).
6. R9a only, after every build: `rcg layer --id h2 --behind p1`, `rcg layer --id tg1 --z 40`.
7. Captions per line (see above), `rcg mix-check`, `rcg hf --cwd $J check`, snapshots per beat,
   `rcg render $J --fps 24 --workers 3`, read the frame sheet and a full-resolution text frame.

## Checks

- Caption presets: the 30 existing style x mode outputs of `buildCaptionHtml` are byte-identical
  before and after the style-pack fields were added.
- `hf check` passes on both, with every text node at WCAG AA (R9a 43/43, R9b 49/49).
- Safe area: `rcg style` refused two first placements (a tilted note reaching y 179; a headline
  reaching y 190); both moved inside y 192-1536.
- Mix: MIX OK, R9a -14.7 LUFS / -2.5 dBTP, R9b -14.5 / -3.5. No SFX lane overlaps (lint clean).
- Determinism: rebuilding either plan gives byte-identical compositions and `index.html`.
- Both renders pass all 11 verify checks. Frames read: no text on a face, behind-subject headline
  occluded by the cut-out as intended, word gaps present at full resolution (lessons 13ba).

## Found and fixed while building

- Contrast of the reference accents (lessons 13az): `-ink` / `-deep` text shades.
- Two SFX on one audio track (lint `duplicate_audio_track`): free-lane pick 40-47.
- Word gaps lost in the render, not in snapshots (lessons 13ba): measured margins.
- Punctuation after emphasis (`*clear*.`) became a separate word: glued to the word.
- Voices at -1.5 dBTP plus style SFX peaked at -0.5 dBTP (lessons 13bc).
