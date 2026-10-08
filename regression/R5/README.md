# R5: one recipe, every capability group (Phase 5 regression)

`jobs/2026-10-08-r5-cosmic-promo`, 14.5 s, mode (b). The cosmic-promo recipe plans and builds a
voiced promo of `101066-video-1080.mp4` on the Paper Ring song (15.02 s, so the edit ends on the
14.49 s downbeat):

| Group | In R5 |
|---|---|
| Captions + kinetic text | neon 2-word captions on every voice line; stagger-up titles; beat-flash words |
| Voiceover | five Kokoro lines (af_heart, am_michael), leveled, music ducked under each |
| Shaders + 3D | `rcg three` orb intro; `billowing-plasma-nebula` behind the footage card for 6.85 s |
| Camera + beat sync | card flythrough snapped to beats; crash zooms, whips, handheld, drone pull-back with kick shake; audio speed ramp |

1. `rcg new-job --name r5-cosmic-promo --video <video> --audio <song> --mode b`; `rcg limit` the song.
2. Beat grid: `tools/voice/.venv/Scripts/python.exe <plugin>/skills/music-to-video/scripts/analyze-beatgrid.py assets/song-limited.wav -o data/audiomap.json`.
3. `rcg recipe plan --job $J --recipe cosmic-promo --duration 14.5 --seed 5 --title "MOP STAR"`.
4. Fill the placeholders: voice lines (vo1-vo5), end title "MOP STAR|NOW PLAYING", beat-flash
   words "CLEAN|SPIN|REPEAT" (see the job's `beat-sheet.json` and `data/vo-lines.json`).
5. `rcg recipe build --job $J` (voice, level, assemble, 3D, flythrough, shader, beat-flash, titles,
   captions, mix-check: MIX OK -15.6 LUFS / -1.8 dBTP, hf check passes).
6. `rcg render $J --fps 24 --workers 3`.

**Checks:**
- Two plans with the same seed are identical.
- Every montage cut continues its whip direction (the yaw sign flips across each cut).
- Flythrough landings are within 2 ms of the beats.
- Snapshots of every section, read: no stale layers after their windows (lessons 13w, 13x).
- The render passes all 11 verify checks.
