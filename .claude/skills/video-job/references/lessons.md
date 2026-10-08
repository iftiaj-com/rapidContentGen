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

13a. **Graded footage at t = 0 stalls the hardware GPU path.** `data-color-grading` on a video or
     image that is on screen in the first frame made HyperFrames' page load exceed its 10 s
     limit (check, snapshot) on this laptop's GTX 1650. SwiftShader (`--no-browser-gpu`) loads
     it fine. `rcg hf` and `rcg render` add the flag automatically when they detect it.
     Software rendering is slower; budget more time for check and render on such jobs.
13b. **Measure text with canvas metrics, not layout.** A sub-composition slot that is not on
     screen at load has no layout, so `offsetWidth` reads 0. The caption generator measures
     with `CanvasRenderingContext2D.measureText` after `document.fonts.load()`.
13c. **Never let caption groups overlap in time.** A minimum display time can push a short word
     past the next word's start. Groups end at the next group's start, no later.
13d. **Regex edits of HTML: strip comments first.** A comment that mentioned `<video>` let a
     regex replacement swallow the real video element into the comment. Lint cannot see it.
     Template comments no longer contain literal tags; tools strip comments before parsing.
13e. **Generated scripts are compiled before writing.** A quoting slip inside a JS template
     string broke four caption files at once. `captions.mjs` now compiles its output with
     `vm.Script` and fails fast.
13f. **Voice level, and mono plays 3 dB louder than it measures.** Kokoro writes MONO files.
     HyperFrames plays a mono file at full level in BOTH channels, which is 3 LU louder than the
     mono file measures (and ffmpeg's default mono->stereo upmix is 3 dB quieter still). On R1 this
     hid 3 dB: mix-check predicted no gain cut, the render was lowered 1.1 dB. `rcg level` now
     writes dual-mono stereo and measures that, and `mix-check` upmixes mono at full level
     (re-validated: predicted 0.9 dB vs actual 1.1 dB). Use
     `rcg level --dir <voice folder> --lufs -13.5 --ceiling -1.5`; with music ducked about 10 dB
     under speech the mix lands near -14.4 LUFS.
13g. **Temp and job folders can be on different drives** (C: vs E:). Use `shutil.move` /
     copy, never `os.replace`, across them.
13h. **Edit JS with the Edit tool or a Node script, not Python string literals.** Escapes such as
     `\b` and `\n` inside Python strings became control characters (backspace) in JS regexes.

13i. **Local renders are not byte-identical.** Two renders of R2 agreed at 51 dB PSNR (invisible)
     but not bit for bit, in footage-only regions too: capture and encode vary. Shader snapshots
     ARE pixel-identical across runs. For byte-identical output HyperFrames documents
     `render --docker`. Regression criteria use PSNR >= 45 dB between renders.
13j. **AditsShaders are centered objects, not wallpapers.** A full-size footage card hid the nebula;
     a 640 px card let it frame the footage. Plan layout around the object.
13k. **Onset-driven beat flash flickers on busy hats** (45 hat onsets in 15 s). Bands alternate the
     bass/mid words at about 3 per second. Loud masters pin bass near 1; pick words accordingly.
13l. **Loud masters saturate the audio table** (bass/mid near 1.0) and push the flywheel clock to
     5-6x. `rcg shader` defaults to the pulse clock at drive 0.35 (about 2.5x on loud music).
13m. **HyperFrames `beats` only reads the project's own music clip.** For a loose file, run
     `analyze-beatgrid.py` with the voice venv (librosa is installed there).
13n. **Camera cues hold.** A one-shot move or preset keeps its end framing until the next cue on
     its layer. Run continuous moves on layer `a` and one-shots on `b`. A whip across a cut:
     `b/<cut-0.5>:whip_pan_right`, then `b/<cut>:whip_pan_left:from=0.5:rev`. End a preset at a cut
     with `<cut>:static_shot` (its default duration runs to that cue).
13o. **Portrait 3D needs its own framing.** The orb filled the 9:16 frame at landscape settings.
     `rcg three` uses fov 50 on portrait and frames the narrow axis, with a starfield for depth.
13p. **Large inline runtimes trip `composition_file_too_large`.** Keep runtimes in a job `lib/` file
     loaded with `<script src>` from index.html; sub-compositions inline a comment-stripped copy.
13q. **WebGL canvases need `data-layout-allow-overflow`**, or check reports `canvas_content_at_edge`.
     three.js loads inside a sub-composition through a module import from jsDelivr; register the
     timeline after the scene is built.
13r. **Perspective and spin presets reveal edges on 9:16.** To cover the frame, lean_sweep needs
     2.3x zoom, whip_pan and dynamic_spin 2.0x, dramatic_3d_tilt 1.8x. Keep `--fill blur` (a blurred
     copy behind the footage, the Adits look). Its clones trigger HyperFrames'
     `duplicate_media_discovery_risk` warning, which its docs call benign; R3b renders both layers.
13s. **CSS blur fades an element's own edges** over about 3x the radius. The blurred fill needs
     72 px overscan per side at blur(22px); at 28 px (the Adits value) the frame border went dark.
13t. **Media inside a sub-composition uses local time.** HyperFrames rebases a nested video's
     `data-start` by its host's start; mark it `data-hf-media-start-basis="local"` to say so
     (otherwise check warns `nested_media_start_basis_ambiguous`). A timed video is hidden before
     its start, so flythrough video cards show an extracted first-frame still until they arrive.
13u. **Ducking costs loudness.** flowEditor's duck (music to 0.25 for each transition sound plus
     ramps) under four whooshes in 14 s took R4 to -16.1 LUFS. A 0.5 duck gave -15.8.
13v. **Forward and backward seeks can differ by a pixel level.** R4 at 1.9 s reached by a forward
     jump vs a backward seek: 75 dB PSNR (invisible float rounding), all other times identical.

## Environment

13. PowerShell pipes add a UTF-8 BOM; parse JSON with `utf-8-sig` or write it from Node.
14. Git Bash `/tmp` is not Windows Python's `/tmp`. Use Windows paths or the scratchpad.
15. ffmpeg `drawtext` needs `fontfile=` (no fontconfig). Escape `:` as `\:` in the path.
16. `hyperframes usage` returns "unknown" here; do not report an allowance.
16a. Windows Python prints with cp1252: `print()` of characters like ☑ or emoji raises
     UnicodeEncodeError (after any file write already happened). Set `PYTHONIOENCODING=utf-8`
     or avoid printing such characters.
16b. **ffmpeg 8.1 (gyan.dev full build) blanks the last 8 columns** when it converts 1080-wide
     yuv420p or yuvj420p to gbrp. Widths that are multiples of 16 convert correctly, and so do
     yuv444p and rgb24 sources; `-cpuflags 0` avoids it. HyperFrames runs this conversion when it
     extracts video frames and again when it encodes. So every render up to 2026-10-08 (mop-star,
     R0-R3b) has a black 8 px strip down the right edge, and skewed footage shows a dark line on
     its right edge. Found on R3b. `verify` now fails it and `doctor` tests the binary. Fix: point
     `bin.hfFfmpeg` / `bin.hfFfprobe` (workspace.local.json) at an ffmpeg without the bug;
     HyperFrames reads them as HYPERFRAMES_FFMPEG_PATH / HYPERFRAMES_FFPROBE_PATH. Applied
     2026-10-08: gyan.dev 9.0.2 essentials in `tools/bin/` (git-ignored) converts correctly.
     HyperFrames also caches extracted frames without the ffmpeg build in the key, so the first
     re-render reused the bad frames. `rcg hf` now gives each ffmpeg binary its own cache folder
     (HYPERFRAMES_EXTRACT_CACHE_DIR). The old cache (`%TEMP%/hyperframes-extract-cache-u`) is unused.
16c. **Line endings are frozen.** `.gitattributes` sets `* -text`: git never converts LF/CRLF.
     With `core.autocrlf=true` a fresh clone failed 143 of 205 provenance hashes. New files keep the
     endings they are written with (the tools write LF).
17. Renders take about 2-3 minutes for 17 s at 1080x1920 with 3 workers on this laptop
    (screenshot capture mode). Low free RAM (< 2.5 GB) risks failures; close apps first.

## Rights

18. Commercial songs (for example a Taylor Swift track) may be muted on Instagram when baked
    into the file. Offer a silent export so the user can add the song in-app.
19. GLB models from Adits have no license notes; keep them on Hold until the user clears them.
