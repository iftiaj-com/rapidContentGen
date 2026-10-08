# Recipes

A recipe turns "make it like a trailer" into a beat sheet that already sits on the music's beat
grid, with the build commands to go with it. Two files:

- `library/recipes/styles.json`: whole edits (cinematic-trailer, hype-reel, cosmic-promo,
  story-voiceover, photo-flythrough, glitch-storm). A style is a sequence of sections plus the look,
  text, voice and music choices.
- `library/recipes/sections.json`: building blocks. Six are learned from the Adits Advance recipes
  (suspense-build, beat-drop, whip-montage, reveal, cinematic-orbit, cool-down); three come from
  this project (card-flythrough, title-card, and the 3D form of cinematic-orbit).

Grades named in sections live in `library/recipes/grades.json` (trailer-cold, trailer-warm, mono, dark).

## Workflow

```
node tools/rcg.mjs recipe list
node tools/rcg.mjs recipe show cosmic-promo
node tools/rcg.mjs recipe plan --job jobs/<id> --recipe cosmic-promo --duration 14.5 [--seed 5] [--title "MOP STAR"]
# write the <PLACEHOLDERS>: beat words, titles, beat-flash words, data/vo-lines.json
node tools/rcg.mjs recipe build --job jobs/<id>        # or: recipe commands (print only)
node tools/rcg.mjs render jobs/<id> --fps 24 --workers 3
```

`plan` needs the limited music (`assets/song-limited.wav`) and a beat grid (`data/audiomap.json`
from `analyze-beatgrid.py`). It writes `beat-sheet.json` and `.md`, `data/vo-lines.json` for voiced
styles, and `data/flythrough-N.json` plus stills for card sections. The same seed gives the same plan.

`build` runs, in order: `voice say` + `level` (voiced styles), `assemble`, then each block
(`three`, `flythrough`, `shader`, `beatflash`, `title`, `captions`), `mix-check` and `hf check`. It
stops on a failing step (for example `MIX NEEDS WORK`). It refuses while placeholders remain.

## How plan places things

1. Section lengths follow the style weights; every section boundary snaps to a downbeat, and the
   end snaps to the downbeat nearest `--duration` (pass `--exact` to keep the exact length).
2. Inside a section, shot boundaries snap to beats. A `repeat` section (the whip montage) cycles its
   segments, one shot per `shotBeats` beats.
3. Footage shots pick a source range with the TimeRemap port (`tools/recipes/timeremap.mjs`):
   `random` (seeded, avoiding the previous pick) or `linear` (continue where the last shot stopped).
4. Camera templates become absolute `rcg camera` cues per wrapper; `kick: true` adds beat shake.
5. Flythrough sections cut stills from the footage, give each card at least two beats, snap to
   downbeats when a card lasts a bar or more (beats otherwise), and trim the last dwell so the
   flythrough ends on the section end.
6. Back-to-back sections on the same background shader share one shader block (its clock does not
   restart). A title stays up to its section end (at most 2.6 s).
7. Voiced styles get one voice slot per section (start + 0.25 s) with a word budget of about 2.6
   words per second; the music ducks under each line.

## Section fields

| Field | Meaning |
|---|---|
| `from`, `when`, `note` | Source and craft notes (kept from Adits where learned). |
| `bars` | Typical length; the style weight decides the actual share. |
| `block` | `footage` (default), `three`, `flythrough` or `black`. |
| `repeat`, `shotBeats` | Cycle the segments, one shot per N beats. |
| `kick` | Beat shake from the music on this section's camera. |
| `three` | `scene`, `base` cue, `downbeat` / `alternate` moves cued on each downbeat, `bg`. |
| `flythrough` | `cards`, `template`, `spacing`, `motion`, `paths[]`, `entrances[]`, `ratios[]`, `sound`, `background`. |
| `segments[]` | One shot (or one block span) each, below. |

Segment fields: `weight`; `camera` templates `layer@time:move[:opts]` where time is seconds from the
shot start or `end-X` (seconds before its end), e.g. `b@end-0.25:whip_pan_right:s=2`; `grade`;
`fx` (`flash@0`, `flash@end`); `sfx` (`{name, at: start|end|seconds, align: crest|start, volume}`);
`ramp` (`{min, max}` audio speed sync, at least 1x); `text` (`title`, `beatflash`); `timefx`
(`random`, `linear`, or `{mode: "fixed", seekSeconds}`).

## Style fields

`label`, `use`, `keywords` (to pick a style from a prompt), `from`, `needs` (`music`, `grid`,
`voice`), `sections[]` (`use`, `weight`, and per-use overrides such as `layout: "card"` and
`background: {shader}`), `text` (`title {preset, style}`, `captions {style, mode}`, `beatflash
{source, effect, style}`), `voice` (`voices[]`, `duck`, `lufs`, `ceiling`), `music` (`fadeIn`,
`fadeOut`, `volume`), `status` (`ready`, or `partial: ...` when a part waits for P6).

## Levels that held up (R5)

Voice, ducked music and transition sounds overlap. With music at 1.0, a 0.5 duck and SFX at 0.4-0.5
the R5 mix peaked at +1.4 dBTP. What passes: music `volume` 0.7, `duck` 0.43 (0.3 under the voice),
voice `lufs` -14 with `ceiling` -3.6, whooshes 0.2-0.3, and the drop impact (a -6.5 LUFS hit that
sustains 1.7 s) at 0.14 when a voice line sits on the drop.
