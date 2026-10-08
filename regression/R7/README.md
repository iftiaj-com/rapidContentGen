# R7: tracking, cut-outs, layers and transitions (Phase 7 regression)

`jobs/2026-10-08-r7-tracking-pnp`, 13.4 s, mode (b), on `videos/Video_for_testing.mp4` (the user's test
clip: 1920x1080, 23.976 fps, 14.43 s, no audio; a woman on a phone on a white wall). The edit follows
the user's reference talking-head ad (`Video-95971.mp4`, studied, not used as footage): face-tracked
zooms and punch-ins on 9:16, small word captions in front of the subject, big keywords behind the
subject, a faded copy of the subject beside her, and transitions at the cuts.

| Time | Shot (media) | What it exercises |
|---|---|---|
| 0-5 | w1 (0-5) | `flash_black` in; face follow 1.05x, face zoom to 1.7x at 2.4 s and back at 4.2 s (16:9 reframed to 9:16); "BIG NEWS" behind her head (aligned PNP p1); word captions switching behind to front per word (Adits depth position 0.5) |
| 5-9 | w2 (6-10) | `zoom_punch` cut; follow 1.3x; side copy p2 (her, 2 s earlier, grey, 60%, block build) behind an aligned cut-out p2a; captions in front |
| 9-11.4 | w3 (10-12.4) | `glitch_punch` cut; `face.punch` 1.9x; colour mask (white wall to purple) from 9.3 s with the aligned cut-out p3 restoring her white shirt; "NEW LOOK" behind her |
| 11.4-13.4 | w4 (12.4-14.4) | `crossfade` (0.5 s); slow face push; effect target: Blow Pixels on the background 11.4-12.4, on her only 12.4-13.4 |

Audio: four Kokoro lines (af_heart), leveled to -13.6 LUFS with a -2.5 dBTP ceiling; SFX by crest:
impact (0 s), riser peaking at 5 s, whoosh (5 s), sparkle (side copy), glitch (9 s), short whoosh (11.4 s).

**Steps:**
1. `rcg new-job --name r7-tracking-pnp --video videos/Video_for_testing.mp4 --mode b`.
2. `rcg track --job $J --src assets/Video_for_testing.mp4 --debug --name v1` (346 frames at 24 fps).
3. `rcg matte --job $J --src assets/Video_for_testing.mp4 --plate --sheet --choke 6 --name v1`.
4. `rcg fx` clips at source size: `color-mask` over 10-12.4 s (mode color, key #f4f4ee, tolerance 12,
   feather 10, invert, bg #2a1b4a) and `blow-pixels` over 12.4-14.4 s (intensity 0.35, audio off)
   with `--matte assets/matte/v1-fg.webm --apply both`.
5. Voice lines (`data/vo-lines.json`), `rcg voice say`, `rcg level --lufs -13.5 --ceiling -2.5`.
6. The composition: four shots from one take, cameras, PNP and fx layers, titles, captions, layers,
   transitions, in that order (lessons 13an). The job's `index.html` holds the result; the build
   commands are listed in the job's `report.md`.
7. `rcg mix-check`, `rcg hf --cwd $J check`, `rcg render $J --fps 24 --workers 3`.

**Checks:**
- Tracking: face found on every frame of the test clip (crop fallback for the small 16:9 face); boxes
  and hand skeletons read on the debug sheet.
- Reframe: in snapshots the face stays centred on 9:16 at every zoom (1.05x, 1.3x, 1.7x, 1.9x).
- PNP alignment: no doubled edges at 1.7x and 1.9x zooms; the keyword stays occluded by her head.
- Side copy sits behind the subject (her shoulder covers it), in a different pose (2 s earlier).
- Transitions: flash, zoom punch (blur + scale on the shot and its PNPs), glitch bands, crossfade.
- Colour mask: background swapped; the shirt (keyed too) restored by the cut-out; edge rim reduced by
  the 6 px choke.
- Effect target: Blow Pixels changes only the wall, then only her.
- Render: all 11 verify checks.
