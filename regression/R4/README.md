# R4: flowEditor camera flythrough (Phase 4 regression)

**R4 (`jobs/2026-10-08-r4-flythrough`, 13.72 s):** eight cards on flowEditor's `star` layout
(radius 1000 board units), `board` motion. The cards are six stills (cut from `101066-video-1080.mp4`
at 1.0 / 2.5 / 4.6 / 7.0 / 9.6 / 11.6 s) and two video cards (media start 3 s and 8 s), in five
ratios: 9:16, 1:1, 3:4, 16:9 and 2:3. Path styles cover all six; entrances are fade, slide-up,
pop, scale and slide-left. Arrivals are snapped to the song's downbeats (librosa grid, 136 BPM).
Four cards have `whoosh-short` with its crest on the landing, and the music ducks to 0.5 under each.

1. `rcg new-job --name r4-flythrough --video <video> --audio <song> --mode b`; `rcg limit` the song.
2. Copy R3's `data/audiomap.json` (same song) or run `analyze-beatgrid.py` on it.
3. Stills: `ffmpeg -ss <t> -i assets/101066-video-1080.mp4 -frames:v 1 -q:v 2 assets/cards/still-N.jpg`.
4. Strip the template's demo shot, letterbox and text card. Write `data/flythrough.json` (in the job).
5. `rcg flythrough --job $J --insert --fit-root --track 2`, then `rcg hf --cwd $J check`
   (passes, 0 warnings).
6. `rcg render $J --fps 24 --workers 3`.

Spec shape (abridged from the job's `data/flythrough.json`):

    { "id": "fly-r4",
      "settings": { "motion": "board", "arrangement": "none", "template": "star", "spacing": 800,
                    "cardScale": 0.8, "radius": 24, "background": "none" },
      "snap": { "beats": "data/audiomap.json", "grid": "downbeats", "offset": 0 },
      "music": { "src": "assets/song-limited.wav", "volume": 1, "offset": 0, "fadeIn": 0, "fadeOut": 1, "duck": 0.5 },
      "cards": [ { "src": "assets/cards/still-1.jpg", "ratio": "9:16", "arrivalTime": 0.8, "duration": 1,
                   "pathStyle": "smooth", "entrance": "fade", "zoom": 1,
                   "sound": { "sfx": "whoosh-short", "volume": 0.45, "align": "crest" } }, ... ] }

**R4b (`jobs/2026-10-08-r4b-cards-motion`, 8.7 s, silent):** four cards on the `right` layout,
`cards` motion. The board stays still; each card flies to the centre (arc, whip, kenburns, punch)
while the previous one travels home. Kraft background. The `stack` arrangement (board motion,
`left-right`) was checked with snapshots in a scratch copy: one card visible at a time, and the
previous card hides when the next arrival starts.

**Checks:**
- Beat snap: every R4 landing is within 6 ms of its downbeat (one frame is 41.7 ms).
- Snapshots taken twice in the same order are pixel-identical.
- Snapshots in reverse order are identical at 5.4, 8.4 and 12.28 s, and 75 dB PSNR at 1.9 s (float rounding).
- Media is cover-cropped (flowEditor's canvas renderer stretched it).
- Video cards show a still of their first frame until they arrive, then play and loop.
