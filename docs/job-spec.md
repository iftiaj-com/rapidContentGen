# Job spec: `beat-sheet.json`

The beat sheet is the plan the user approves. `beat-sheet.json` is the source of truth;
`beat-sheet.md` (the table shown to the user) is generated from it:

```
node tools/rcg.mjs beat-sheet validate jobs/<id>/beat-sheet.json
node tools/rcg.mjs beat-sheet md jobs/<id>/beat-sheet.json jobs/<id>/beat-sheet.md
```

The rules follow the Adits "Advance" timeline (`effects/auto/advance/timeline.js`, learned, not
copied): times are absolute seconds, `start >= 0`, `end > start`, rows are sorted, overlaps are
rejected, and problems are reported rather than silently dropped.

## Shape

```json
{
  "version": 1,
  "title": "MOP STAR",
  "mode": "a",
  "format": { "width": 1080, "height": 1920, "fps": 24, "duration": 16.88 },
  "summary": "One or two sentences on the idea.",
  "safeZones": { "noTextBottomFrom": 1536, "noTextRightFrom": 900, "headerClearTo": 192 },
  "beats": [
    {
      "start": 0,
      "end": 1.6,
      "words": "None (silent clip)",
      "onScreen": "Black card",
      "text": [ { "content": "IN A WORLD OF ENDLESS CHORES", "position": "black-card", "at": 0.15 } ],
      "sound": "Riser starts quietly",
      "build": { "notes": "optional machine hints: source ranges, blocks, grades" }
    }
  ],
  "notes": ["Song limited to -2.5 dBTP before mixing."]
}
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Output size, fps and total duration. |
| `mode` | no | `a`, `b` or `c` (see the video-job skill). |
| `safeZones` | no | Defaults: bottom 20% and right 180 px are no-text; top 192 px is the app header. |
| `beats[].start`, `end` | yes | Absolute seconds. No overlaps. Gaps produce a warning. |
| `beats[].words` | no | Exact spoken words in this beat (from the transcript or the voiceover script). Never song lyrics. |
| `beats[].onScreen` | yes | What the viewer sees: shot, source range, action, treatment. |
| `beats[].text[]` | no | On-screen text: `content`, `position`, optional `at` (seconds) and `box`. |
| `beats[].sound` | yes | Music, voice, SFX or `"none"`. |
| `beats[].build` | no | Free-form hints for the build step. Not shown in the table. |

## Text positions

| Position | Where |
|---|---|
| `none` | No text |
| `top-band` | y 220-420, centered in the safe box (x 64-900) |
| `center` | y 660-1060, centered in the safe box |
| `black-card` | Full-frame black card, centered in the safe box |
| `captions` | Caption line above the bottom 20%, clear of the right edge |
| `custom` | Give `box: {x, y, w, h}`; validation rejects boxes that reach a no-text zone |

## Card flythrough: `data/flythrough.json` (`rcg flythrough`)

The cards a flythrough flies over, written in the job before
`node tools/rcg.mjs flythrough --job jobs/<id> --insert --fit-root`. Paths are relative to the job.
Options for each field: `node tools/rcg.mjs flythrough --list` and `docs/capabilities.md`.

```json
{ "id": "fly-main",
  "settings": { "motion": "board", "arrangement": "none", "template": "star", "spacing": 800,
                "cardScale": 0.8, "radius": 24, "background": "none" },
  "snap": { "beats": "data/audiomap.json", "grid": "downbeats", "offset": 0 },
  "music": { "src": "assets/song-limited.wav", "volume": 1, "offset": 0, "fadeIn": 0, "fadeOut": 1, "duck": 0.5 },
  "cards": [
    { "src": "assets/cards/still-1.jpg", "ratio": "9:16", "arrivalTime": 0.8, "duration": 1,
      "pathStyle": "smooth", "entrance": "fade", "zoom": 1,
      "sound": { "sfx": "whoosh-short", "volume": 0.45, "align": "crest" } }
  ] }
```

- `motion`: `board` (the camera flies across a still board) or `cards` (the board stays still and
  each card flies to the centre).
- `snap` moves the arrivals onto the beat grid (`grid`: `beats` or `downbeats`); leave it out to
  keep the `arrivalTime` values as written.
- Video cards show their first frame until they arrive, then play and loop.
