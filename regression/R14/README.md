# R14: Adits Active Tracking Caption text controls

`jobs/2026-10-08-r14-atc-text`, 11.2 s, silent, on `videos/Video_for_testing.mp4` (bright white
background, so outline and shadow problems show). Words: `vo2` of the R7 voiceover
(`jobs/2026-10-08-r7-tracking-pnp/assets/voice/audio_meta.json`), placed three times.

Ported from `Adits/shared/active-tracking-captions.js` into `tools/blocks/captions.mjs`:
Hollow Text, RGB Highlight, Negative FX and Text Shadow (the ATC panel's `atcHollowText`,
`atcRgbHighlight`, `atcNegative`, `atcShadowEnabled` / `atcShadowAngle` / `atcShadowDist`).

## Steps

1. `rcg new-job --name ... --video videos/Video_for_testing.mp4 --mode b`; index.html: the clip full
   frame for 11.2 s, no bars, no title card.
2. Seven caption blocks (`rcg captions ... --words <R7 audio_meta> --voice vo2 --insert`):

   | id | start | preset, mode, y | controls |
   |---|---|---|---|
   | c-hollow | 0 | modern 2word 1300 | `--hollow` |
   | c-rgb | 0 | tiktok 2word 900 | `--rgb` |
   | c-neg | 0 | modern word 560 | `--negative --behind p1` |
   | c-shadow | 3.1 | karaoke phrase 900 | `--shadow --shadow-angle 45 --shadow-dist 14` |
   | c-neg-neon | 3.1 | neon word 560 | `--negative --behind p1` |
   | c-tier-shadow | 3.1 | mp-body (tier) 2word 1300 | `--shadow --shadow-angle 135 --shadow-dist 10 --rgb` |
   | c-kin | 6.1 | kinetic | `--hollow --rgb --shadow` |

   PNP `p1`: R7's cut-out of the same clip (`assets/matte/v1-fg.webm`, copied) over `#v1`
   (`rcg pnp --base "#v1" --id p1`). The negative blocks sit behind it; the others are put in front
   with `rcg layer --front p1`.
3. `rcg hf --cwd <job> check`, snapshots, `rcg render <job> --fps 24 --workers 3`.

## Result (2026-10-09)

- hf check passed: 0 errors, 4 contrast warnings (thin outlines and the tier lead on the white
  background; expected for hollow text on a bright frame). The first run had 5.
- Render: 1080x1920, 24 fps, 11.208 s, 7/7 verify checks (silent, so no loudness checks).
- RGB: the colour read from the rendered frame at 1.6 s is rgb(120,15,228), the formula's value
  exactly (a key); at 0.65 s, between keys, it is within 2 of 255.
- Hollow: the footage shows through the letters. Overlapping contours in a font's glyphs show as
  extra lines inside letters (Montserrat P, Y); Adits' `strokeText` draws them too.

## Found and fixed during the run

- hf check `text_not_painted` failed hollow text: it reads the fill and not the stroke. The text
  leaves now carry `background-clip: text` with an empty gradient, the check's own allowance for an
  intentional transparent fill. It is not set on `.box`, where it would clip the pill to the glyphs.
- A `text-shadow` is cast from the whole glyph, so it filled hollow letters dark. Hollow text now
  drops its text-shadows and the caption layer casts them with `filter: drop-shadow`, from the
  painted stroke only, as Adits' canvas shadow does. The flash-driven glow pulse has no layer
  equivalent in hollow mode; its resting blur is kept.
- Negative must sit on the caption host, not inside the sub-composition: the host gets a z-index,
  so an inner blend would only see the host's own empty backdrop.

## Differences from Adits

- Hollow uses the text colour for the outline at 5% of the font size (Adits' lyric renderer). Adits'
  motion-path renderer outlines in the preset's stroke colour at 9%; that renderer is not ported.
- Negative blends the whole caption (stroke, glow and pill); Adits blends the fill and its glow,
  and draws the stroke and the pill normally.
- RGB is keyed every 0.2 s on the main-timeline clock and eased linearly between keys.

## Negative made readable (2026-10-09, user feedback)

The first run's negative captions were hard to see: a modern caption with its shadow went muddy,
and the neon one (pill, glow, thin hollow outline) became a pink box with a red smear. The user's
rule: no background, bold and bigger, and behind the subject. `--negative` now forces the look in
`caption-styles.json` `negative`: pure white (the strongest inversion), a heavy face (the preset's
when it has a heavy cut: Inter 900, Montserrat 900, Archivo Black; otherwise Inter 900), 1.3x the
size, and no pill, stroke, glow or shadow. `--shadow` is ignored with it, `--hollow` warns, and a
missing `--behind` warns. `--behind p1` layers the block between the footage and the cut-out.

Placement matters: at y 900-1300 the subject fills nearly the whole width, so the line behind her
was almost fully hidden. At head height (y 560) the wall shows on both sides of the head and the
inverted words read in solid black, with the head covering the middle letters. A short word can
still hide almost entirely behind the head ("subject" at 1.2 s shows only its last letter).
Re-render: 11.208 s, 7/7 verify, hf check 0 errors.
