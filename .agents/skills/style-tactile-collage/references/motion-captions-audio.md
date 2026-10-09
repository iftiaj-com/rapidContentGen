# Motion, captions and audio

Ported from the Tactile Paper Collage skill (MIT). The components already follow the motion
rules; this is what to choose and what to check.

## Motion language

Paper objects are placed, drawn, passed, opened, stacked, checked or stamped.

| Move | Timing | Where it lives |
|---|---|---|
| Card, note, photo entrance | 0.55 s `power3.out`, settling from 6 degrees off its resting tilt | `paper-card`, `taped-photo`, `checklist` (`from`: drop, below, left, right) |
| Stamp, sticker | 0.34 s `back.out(1.4)` from 1.9x | `stamp`, route label |
| Route, scribble | drawn once over 0.5-1.2 s (`draw`) | `route`, `scribble` |
| Handoff | 0.45 s slide in, leaves the way it was going | `file-tag` |
| Exit | 0.18-0.3 s, lifted off or passed on, not a fade in place | every component (`exit: cut` to skip) |
| Headline | words land in spoken order, stagger up to 0.09 s | `headline` |

Choose `from` with a reason: `left`/`right` when something is handed along, `drop` when it is set
down on the page, `below` when it comes up from the speaker. Keep one hero move per beat.

Tilts are seeded (`--seed`, default 1): the same plan renders the same frame every time. To vary
the look between items, give items different seeds or an explicit `rotate`.

## Captions

`rcg captions --style collage --mode phrase` gives the reference's caption: Courier Prime on a sheet
card with a 4 px ink edge, a hard offset shadow and a 1 degree tilt; the spoken word turns primary
blue; `--emphasis <word>` sets one word in marker red.

1. Use word times: `audio_meta.json` from `rcg voice say`, or `rcg voice transcribe` for footage speech.
   Read and correct the words first.
2. One emphasis word per line at most; the same word the beat emphasises on screen.
3. Keep the lane (centre y 1344) free of paper objects while a caption is up. If a caption collides,
   move the paper object or pass `--y` to another clear lane; do not shrink below the phrase size.
4. Captions go in after the style build (they are inserted last, so they stay on top). In
   behind-subject beats give them `rcg layer --id cap-voN --z 40`.

## Audio

- Keep the narration. Music, if any: a quiet bed under the voice (video-job step 5 ducking rules).
- `--sfx` on `rcg style build` places one sound per causal event, with its peak on the landing
  (`library/sfx/manifest.json` crests), each on a free lane 40-47. Pack levels (`style.json` sfx):
  place 0.18, stamp 0.12, check 0.35, draw 0.14, tag 0.2.
- Not every entrance needs a sound. Turn one off with `"sfx": false` on the item (R9a: the route's
  draw sound doubled the first checklist click).
- With SFX placed, level voices to -14 LUFS / -3.6 dBTP. Run `rcg mix-check`; it must say `MIX OK`.
  A stamp's long bass tail under a voice line is the usual peak; lower it before the voice.
