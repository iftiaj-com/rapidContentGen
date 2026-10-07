# Lessons learned

Each entry cost real time on a past job. Read before building.

## Audio

1. **Volume lanes are absolute.** A `data-automation` lane with `target: "volume"` sets the
   level directly and overrides `data-volume`. On the mop-star job, impacts with
   `data-volume="0.32"` and a lane starting at `v: 1` played at full level for two renders.
   Put the intended level in the lane values. `rcg mix-check` warns when both are set.
2. **Hot music forces a whole-mix cut.** Commercial songs can peak above 0 dBFS (Paper Rings:
   +0.4 dBTP). HyperFrames then lowers the ENTIRE mix to stay under -1 dBTP ("Audio lowered by
   X dB" in the render log). Limit music first: `rcg limit` (-2.5 dBTP ceiling, loudness
   changes about 0.1 LU).
3. **Check the mix before rendering.** `rcg mix-check` rebuilds the mix with ffmpeg in seconds.
   Validated against three real renders: predicted reduction 0 / 5.5 / 4.5 dB vs actual
   0 / 5.3 / 4.2 dB, and identical loudness and true peak on the final.
4. **SFX descriptions can be wrong.** HyperFrames' manifest says the riser peaks at its end; it
   crests from 2.97 to 3.60 s and is silent after 4.2 s. Use `library/sfx/manifest.json`
   (measured: onset, crest window, audible end, LUFS, true peak). Bass impacts hold a loud body
   for about 1.8 s; they are not short ticks.
5. **Do not trust `-ac 1` for levels.** ffmpeg's default stereo-to-mono downmix uses a -3 dB pan
   law and reads up to +3 dB hot on correlated stereo. `tools/lib/ffmpeg.mjs` averages channels.
6. **16-bit WAV hides overs.** A mix written as 16-bit clips at 0 dBFS and its true peak reads
   low. `mix-check` writes 32-bit float.
7. **The agent cannot listen.** Judge mixes by measurement (LUFS, true peak, per-section RMS) and
   say so in the report.

## Picture

8. **Slow motion stutters on 24 fps sources.** At 0.5625x, 23.976 fps footage showed about
   13.5 distinct frames per second in a 2-1-2-1 pattern. Use a freeze frame (`extractFrame`) with
   a push-in, or interpolate in a pre-pass.
9. **Flat text cards.** HyperFrames lint warns on nested timed structures. Put spans directly in
   the `.clip` div and animate `#id > span`. Never tween `visibility`/`autoAlpha` on a `.clip`.
10. **Safe zones on 9:16.** No text in the bottom 20% (y >= 1536) or right 180 px (x >= 900).
    The template's top band (y 220-420) and center card (y 660-1060) are inside the safe box.
11. **Grades must be visible.** The first cold grade measured only 5% less saturated than the
    source. Measure saturation/luma against a source frame; the tuned recipes are in
    `library/recipes/grades.json`.
12. **Bundled fonts.** HyperFrames embeds a fixed font set (EB Garamond, Montserrat, Oswald,
    League Gothic, Archivo Black, Playfair Display, etc.). Others are fetched at build time.

## Environment

13. PowerShell pipes add a UTF-8 BOM; parse JSON with `utf-8-sig` or write it from Node.
14. Git Bash `/tmp` is not Windows Python's `/tmp`. Use Windows paths or the scratchpad.
15. ffmpeg `drawtext` needs `fontfile=` (no fontconfig). Escape `:` as `\:` in the path.
16. `hyperframes usage` returns "unknown" here; do not report an allowance.
16a. Windows Python prints with cp1252: `print()` of characters like ☑ or emoji raises
     UnicodeEncodeError (after any file write already happened). Set `PYTHONIOENCODING=utf-8`
     or avoid printing such characters.
17. Renders take about 2-3 minutes for 17 s at 1080x1920 with 3 workers on this laptop
    (screenshot capture mode). Low free RAM (< 2.5 GB) risks failures; close apps first.

## Rights

18. Commercial songs (for example a Taylor Swift track) may be muted on Instagram when baked
    into the file. Offer a silent export so the user can add the song in-app.
19. GLB models from Adits have no license notes; keep them on Hold until the user clears them.
