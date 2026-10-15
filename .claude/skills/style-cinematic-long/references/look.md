# Look, text and assembly

## Grade (rule 8, after the colour match)

One grade on every shot, so the whole edit reads as one film. Grades live in
`library/recipes/grades.json` and go on each shot through `build.grade` in the beat sheet.

| Grade | Use |
|---|---|
| `natural-film` | the default: the footage's own colours, a touch of contrast, soft vignette, light grain |
| `teal-orange` | the blockbuster look: teal shadows, warm highlights. Good on skin and sunsets, harsh on green landscapes |
| `trailer-warm` | warm and punchy for an energetic section |
| `trailer-cold` | cool and muted for a tense or sombre section |
| `mono` | black and white, for a memory or a held breath |

- `natural-film` and `teal-orange` were added on 2026-10-14 and rendered once, in a 6 s 16:9 test job
  on a white studio clip: both render cleanly. There, `teal-orange` showed mostly as its vignette,
  because a bright shot has few shadows to tint. Its look on darker footage has not been seen yet:
  snapshot one shot before you rely on it.
- Two grades in one edit only at a section edge, and only on purpose (a flashback in `mono`).
- **Never start a graded shot at t = 0.** With HyperFrames 0.8.143 a render with graded video on the
  first frame failed, whatever the grade (lessons 13a). Put a `black` block first, so the first shot
  starts at 0.083 s or later (2 frames at 24 fps): `{ "start": 0, "end": 0.083, "onScreen": "black",
  "sound": "music", "build": { "block": "black" } }`. A long-form opening can use a longer fade from
  black (about 0.25-1 s).
- For a look not in the table, HyperFrames can build one (the `media-use` skill, "grading": wheels,
  curves, LUTs). Add it to `grades.json` with a `use` line, so the next job can reuse it.

## Finish

- Grain and vignette come with the grade. Do not add a second grain layer.
- Letterbox only when the user asks for a widescreen or "film" look (`rcg cinema`, see SKILL.md). It
  cuts the frame, so frame faces and horizons for it.
- Keep horizons level. A roll move (`vc.dutch_angle_drift`) is a choice for one shot, not a habit.

## Text

A cinematic edit carries little text. The picture tells the story.

- Title: one at the start or after the first sequence. Serif or wide caps, small, centred or lower
  third, a slow fade (`rcg title --style trailer --preset stagger-up`; `--y` for the height). On 16:9
  keep it inside the safe box (x 96-1824, y 54-950).
- Place and chapter cards: a short line (a place, a date, a chapter name) at the start of a section,
  2-3 s, then gone.
- Captions only when someone speaks and the user wants them (video-job step 5). Use a quiet style
  (`subtitle` or `modern`), small, in the lower part of the safe box.
- No emoji, stickers, arrows or bright boxes. No credit or source text (workspace rule).
- `style-anti-ai` can check the edit for generic looks when the user asks.

## Frame rate

Render at the rate the footage was shot at, so pans do not judder:

- 24 (or 23.976), 48, 96 or 120 fps sources: render at 24.
- 25 or 50 fps sources: render at 25.
- 30 (or 29.97) or 60 fps sources: render at 30.
- Mixed sources: the rate most of the edit's screen time uses. Prep converts every clip to it
  (`"fps"` in `prep.json`).

## Assembly (`rcg assemble`)

Point every shot at its prepped clip. Minimal shape (full schema: `docs/job-spec.md`):

```json
{
  "version": 1,
  "title": "Harbour at dawn",
  "mode": "a",
  "format": { "width": 1920, "height": 1080, "fps": 24, "duration": 92.5 },
  "safeZones": { "noTextBottomFrom": 950, "noTextRightFrom": 1824, "headerClearTo": 54 },
  "summary": "Three sections: quiet harbour, the market waking, the boats leaving.",
  "build": {
    "music": { "src": "assets/music-limited.wav", "offset": 0, "fadeIn": 1.5, "fadeOut": 3, "volume": 0.8 },
    "wrappers": {
      "w1": { "cues": ["0:vc.slow_zoom_in:d=6.2"] },
      "w4": { "cues": ["18.6:vc.pan_right_to_left:d=4.0"] }
    }
  },
  "beats": [
    { "start": 0, "end": 6.2, "onScreen": "s03 harbour wide, still, slow push in", "sound": "music intro; natural water",
      "build": { "shot": { "wrapper": "w1", "src": "assets/cine/c01.mp4", "mediaStart": 0 }, "grade": "natural-film",
                 "sfx": [] } },
    { "start": 6.2, "end": 9.0, "onScreen": "s07 boat, moving left (flipped)", "sound": "music intro",
      "build": { "shot": { "wrapper": "w2", "src": "assets/cine/c02.mp4", "mediaStart": 0 }, "grade": "natural-film",
                 "sfx": [{ "name": "whoosh-short", "landing": 6.25, "volume": 0.2 }] } }
  ],
  "notes": ["Kept 14 of 31 shots. Left out: s05 (repeats s03), s12 (shaky), ..."]
}
```

- One wrapper per shot (`w1`, `w2`, ...), unless several shots share one camera move.
- Camera cue times are seconds on the edit timeline (the same syntax as `rcg camera`). End a preset with
  `d=<seconds>`, or a later `static_shot` cue, so it does not run into the next shot.
- The safe zones in `beat-sheet.json` must be the 16:9 ones above. The beat-sheet tool otherwise uses
  the 9:16 defaults.
- `rcg assemble` writes between its markers and can be run again after any change to the beat sheet.
