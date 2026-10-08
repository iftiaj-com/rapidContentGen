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

13w. **Never set `visibility: visible` inside a sub-composition.** HyperFrames hides a finished
     sub-composition with visibility, and an explicit `visible` on a child overrides it: R5's last
     flythrough card stayed on top of every later section. Set `""` (inherit) or `hidden`.
13x. **Untimed decoration outlives its section.** R5's card-frame drop shadow stayed over the
     cool-down. A video may not sit inside a timed element (`video_nested_in_timed_element`), so the
     frame stays untimed and transparent and the shadow is its own timed clip.
13y. **Voice + SFX + music stack.** Leveled voices with -1.5 dBTP peaks, a 0.5 duck and SFX at
     0.4-0.5 peaked at +1.4 dBTP in R5. Recipe levels that pass: music 0.7, duck 0.43, voice -14 LUFS
     with a -3.6 dBTP ceiling, whooshes 0.2-0.3, an impact under a voice line at 0.14 (docs/recipes.md).
13z. **Whip pairs:** after a whip out to the right, the next shot comes in with `whip_pan_left`
     reversed (and the reverse). Check the yaw sign flips at each cut. Sub-second shots need s=2.
13aa. **Check the music length first.** The Paper Ring clip is 15.02 s; R5 had to be 14.5 s.

## Footage FX harness (`rcg fx`, P6)

13ab. **Tagged PNG frames are colour-managed by Chrome.** ffmpeg writes cICP, gAMA and cHRM chunks for
     a BT.709 source, and Chrome decoded them as gamma 2.4 into sRGB: shadows sank (16 to 4, 128 to
     121) in every fx clip. HyperFrames shows footage from untagged JPEGs, raw. `rcg fx` converts to
     RGB first, then drops the tags (`format=rgb24,setparams=...unknown`). Blow pixels at intensity 0
     now returns its input exactly (PSNR infinite).
13ac. **A `<video>` needs HTTP byte ranges to seek.** Without them Chrome fires `seeked` but snaps
     `currentTime` back to 0: FrameTunnel showed one frozen frame. The fx server answers ranges (206),
     and the harness fails any seek that lands more than 0.05 s from its target.
13ad. **WebGPU needs the installed Chrome.** HyperFrames' headless shell cannot create a device (no
     `dxil.dll`). The harness launches Chrome `--headless=new` with a temporary profile,
     `--no-sandbox` (else the GPU process crashes), ANGLE d3d11 and `--remote-allow-origins=*` (else
     the DevTools socket closes with 1006). Pages come from localhost: `navigator.gpu` needs a secure
     context, and ES modules do not load from `file://`.
13ae. **Match the Adits render loop.** Clear and reset the 2D context each frame; for GPU effects
     call `renderGPU` and draw the WebGPU canvas in the same synchronous block; use real range
     inputs so values clamp and snap as in the UI; link shaders synchronously (hide
     `KHR_parallel_shader_compile`), or an effect shows the plain frame for an unknown number of frames.
13af. **Stateful effects need pre-roll.** Ghost and Motion trail build on earlier frames; `rcg fx`
     renders `preroll` seconds before the range (ghost 2.5 s, trails 2 s) and drops them.
13ag. **Adits defaults can be strong on 9:16.** Smoke "Ambient, Thick" at 55% covers the whole
     frame; a 9:16 view shows about a third of the width a 16:9 view does, so a jet plume fills it
     edge to edge. Mist at 55% is faint (alpha about 0.13). Blow pixels at 0.5 can clear the upper
     half to black. Frame tunnel's default arch is a narrow column on 9:16 (about a third of the
     width, black around it). Read the sheet and set `--param` before using a clip.
13ah. **Page errors hide in the console.** A three.js shader compile error never reaches the
     harness state. `rcg fx` prints page console errors and warnings; read them.

## Tracking, mattes and PNP (`rcg track`, `rcg matte`, `rcg pnp`, P7)

13ai. **`object-fit: cover` crops a clip of another aspect inside its element.** A 16:9 clip on 9:16
     keeps only its middle third, so a camera could never pan to the subject. Face cues on
     `rcg camera` lay the tracked clip out at its full cover size ("uncrop"); the canvas crops.
13aj. **Small faces are missed.** The landmarker shrinks its input to about 256 px: a face in a
     full-body 9:16 frame or a wide 16:9 frame is often not found. `rcg track` retries on square
     crops (around the last face, then tiles); look at `--debug` (orange boxes came from crops).
13ak. **The selfie segmenter is a mid-shot model.** On a talking head it holds hair and hands; on
     full-body action it drops legs and lets furniture in. Its edge band carries a rim of the old
     background (a white wall became a white halo on purple at a 1.9x punch-in): `--choke 6`
     removes most of it. Keep the matte at source resolution; a reframe enlarges it 3x.
13al. **Gesture labels are geometric.** A hand gripping a phone or cup reads as Thumb_Up or Pinch
     for seconds. Check `--debug` frames before cueing anything on a gesture event.
13am. **An aligned cut-out shares its base clip's timing** (start and media start); a later
     start lands a frame off. An offset copy uses its show windows instead: two cut-outs with the
     same src, start and duration trip `duplicate_media_discovery_risk`.
13an. **Build order: cameras, PNP, blocks, layers, transitions.** PNP layers read the camera pose
     (`window.RCGCamPoses`); a zoom punch wraps the shot and its PNP layers, so regenerating a
     PNP after the transition drops the wrapper (re-run the transition). Re-run `rcg layer` after
     regenerating a title or caption block (it marks the block's text as covered on purpose:
     HyperFrames' `text_occluded` check reads `data-layout-allow-occlusion` on the text itself).
13ao. **VP9 alpha looks like yuv420p to ffprobe.** Check the `alpha_mode` tag, decode with
     `-c:v libvpx-vp9`, and run `alphaextract` before any scaling (scaling first can pick a
     format without the alpha plane: no frames written).
13ap. **A colour key on white footage keys white clothes too.** Put the aligned cut-out over the
     keyed clip: the background swap stays, the subject comes back whole.
13aq. **Pick effects that change the background you have.** Ghost on a white wall is a pale wash,
     invisible as a background-only effect; Blow Pixels or smoke show clearly.
13ar. **ffmpeg must not read stdin** when started from a background shell: a stalled mix-check
     held `data/mix-check.wav` open and failed the next render. Every runner passes `-nostdin`.

## Voxels and anamorphic models (`rcg fx`, P8)

13as. **Adits' model shaders darken the footage, by design of the code, not of the port.** VoxelDrop
     (drop, hole, magnet, flip, grow) and MagicCarpet sample the sRGB media texture (decoded to linear)
     and write the result without re-encoding: a flat full-frame plane measured `1.015 x linear(in)`,
     so mid-grey 128 shows as about 56 and the R6 room reads dim next to its own background. Voxel Art
     and Particles take raw byte colours and are not darkened. Tone mapping does not touch these
     ShaderMaterials. Keep it in mind when the model sits over the same footage.
13at. **Per-call easing and physics need the display rate.** Adits eases, springs and steps Rapier once
     per composite() (60 Hz live, at most one physics step per 1/60 s). Ticking once per 24 fps output
     frame would run the drop at 0.4x. The anamorphic shims tick the host at 60 Hz on the frame clock and
     render per output frame; 24 and 30 fps renders agree at the same time (53-55 dB).
13au. **Particle size is in canvas pixels.** Adits renders 9:16 at 1080x1920 too, and its default cloud
     (15000 points, size 30) is sparse and dim there; 40000 at size 50 reads as an image. Raising
     `anamScale` spreads the same points thinner. The flat cloud is square: the default `stretch`
     squeezes a 9:16 frame, `anamImageFit=fill` crops the centre square. The cloud keeps the first
     frame's colours (Adits); `rcgLiveColor=true` follows the footage.
13av. **Adits' analyser pins bass on loud masters.** With its threshold 50, the R6 song holds bass near
     0.8: bass-driven modes (flip, grow, tunnel, voxel audio trigger above 0.75) sit near full. Drive them
     from the mid band. Particle `flow` on such a song dissolves the cloud; `wave` keeps it legible.
13aw. **Brightness is height.** Grow and Voxel Art extrude bright pixels: a white studio wall becomes a
     block of tall white columns. Use them on mid-toned footage. Grow's heights are sampled once, from the
     first frame (Adits).
13ax. **The followed point is the subject, in screen space.** Adits follows the viewer's hand on a
     mirrored webcam and also moves the camera with it. Offline the point is the hand or face in the
     footage (`--track`) or a keyframed point (`--point`), converted so the effect lands on that point on
     screen; `anamMagnetHold` defaults on so the camera stays still. A Drop needs time: the ripple takes
     about 2 s before cubes fall, so press it in the pre-roll (`--preroll 1.3 --param rcgDropAt=-1.2`).
13ay. **Map the head's whole travel before placing graphics.** In R9a and R9b the test clip's head rose
     to y 330-380 later in the clip, so the only clear band was y 192-450; headlines placed from the
     first frame covered the face. Snapshot the bare footage across the clip and note the highest point.
13az. **Reference palettes are not contrast-checked.** The collage reference's signal red (2.0:1 on its own
     yellow tape) and resolve green (2.7:1 on paper) and the editorial success green (2.8:1 on the canvas)
     fail as text. The packs keep them for fills and use `-ink` / `-deep` shades for text; `hf check`
     measures every text node, so check a remapped brand colour the same way.
13ba. **The render can drop whitespace nodes that snapshots keep.** Words built as inline-block spans
     with `" "` text nodes between them rendered as "bigidea" in the R9a MP4 while the snapshot was fine.
     `rcg style` now spaces words with a measured margin (`.w + .w { margin-left: var(--sp) }`). After a
     render, extract one full-resolution frame of the densest text; the frame sheet is too small to show it.
13bb. **Do not pipe a multi-item build through `tail`.** `rcg style build` writes the items it can and
     prints `ERROR` for the rest (an item outside the safe area keeps its old file). R9b rendered a
     stale headline because `| tail -1` hid the error.
13bc. **Style SFX need the voice ceiling at -3.6 dBTP.** Voices at -13.5 LUFS / -1.5 dBTP plus the
     collage stamp (a 2 s bass tail) and a pop under one line peaked at -0.5 dBTP and `rcg render`
     refused. Voices at -14 / -3.6 (recipes.md) and the stamp at 0.12 gave -2.5 dBTP, MIX OK.

13bd. **Cutting photo layers: MediaPipe cuts, OpenCV cleans.** On the R10 frame magic_touch (a click
     point) cut a table and a person cleanly in 0.3 s each; GrabCut (a box) took 7.7 s and took in the
     sofa; DeepLab was jagged. EfficientDet boxes give the click points. Keep only the clicked piece:
     magic_touch also returned a blob of hair for the chair. OpenCV inpainting is only good near edges.
13be. **Occluded edges need a straight stretch.** A push slid the chair down and uncovered the cut
     bottom of the person behind it. Telea filled that band with a pale smear and a round nearest-pixel
     fill with a radial fan and wings past the silhouette; copying the layer's own pixels straight along
     the row or column (`rcg layers --extend`) reads as fabric continuing.
13bf. **The contrast audit samples inside each word's box.** A soft wash in a sibling element made the
     R10 title measure 3.4:1 in the rendered pixels, yet `hf check` still read about 2:1. Put the backing
     on the text element itself (`serif-title --scrim`); then it passes.
13bg. **Grain costs file size.** R10 with animated grain: 51.5 MB for 13 s (R9a without grain: 11.8 MB
     for 12 s). Lower `grain` if the file must be small; the platforms recompress anyway.
13bh. **ffmpeg `noise` on a colour source adds colour noise.** Generated paper and cardboard showed
     rainbow speckle; convert to grey first (`format=gray,noise=...`), then tone.
13bi. **Under CSS perspective, an in-plane offset shrinks with depth.** A crop offset in `left/top`
     projects by P / (P + z), so layers at different depths drifted apart at rest. Scale every in-plane
     offset by (P + z) / P (the parallax component does).

13bj. **Continuous speech has no silences to cut on.** R11's 12 s clip had no gap of 0.15 s, 15 dB under
     the median: beats came from punctuation, conjunctions (split once a clause is >= 1.0 s) and a
     long-clause split at the best word gap, never right after "a / the / this".
13bk. **Face cues: drift starts when the zoom ends, and the first cue sets k.** face-reframe.js eases each
     cue from wherever the previous one got to, so a drift cue that starts mid-zoom cuts the zoom
     short; the runtime's identity is k 0 / y 0.4, so the opening cue must set z, x, y and k.
13bl. **Simulate the clamp before trusting a framing target.** A face high in a 9:16 source cannot reach
     y 0.37 at 1.3 when he moves; R11's plan measured 42% of base speech frames off target and the
     reach fix (zoom +0.05 steps, at most +0.2) brought one segment from 38% to 7%.
13bm. **hf lint refuses animated letter-spacing** (`gsap_non_transform_motion`: it snaps to pixels and
     stutters under seek-by-frame capture). Spread text with scaleX (and a short blur) instead.
13bn. **A denoiser cannot remove room echo.** R11 (+23 dB of gain on a quiet phone clip): the floor
     between words stayed -26 dBFS at afftdn nr 0, 12 and 24. Report it; offer a re-record or voiceover.
13bp. **A revealing ground needs the old scene under it, and the new scene inside it.** A ground that
     wipes, arcs or irises in only clips itself: if the outgoing scene ends at the same moment the reveal
     opens onto the black root (v1 of Opus 5.5 made this, 7.50 s), and the incoming parts float over the
     outgoing scene. `rcg infographics resolve` holds the outgoing scene through the entrance (`"end":
     "scene"` / `"#g4"`) and sets `reveal` on the incoming parts. Also: a child `z-index` escapes a style
     host (the prompt cursor sat over the next scene); keep z-index out of components.
13bq. **An untimed wrapper with a background covers the whole edit.** split.mjs put `background: #000`
     on each untimed b-full wrapper; untimed elements stay on screen for the whole composition, so the
     last wrapper painted every other window black (the presenter, the panels) and `rcg verify` passed
     (it checks size, audio and edge bands, not content). The backing is now a timed clip. Read the
     sheet before trusting a pass; a file far smaller than expected (14.5 MB for 78 s here) is a hint.
13br. **An edited presenter clip is not a talking head throughout.** Script 1L had cutaways (stock
     B-roll, title cards) for 60% of its length and burned-in captions: `split-screen plan --onscreen`
     keeps the presenter panel to the on-camera ranges, `--drop` frames a close-up with little
     headroom, and `presenter.maskBelow` / `maskAfull` / `maskStyle: paper` cover burned-in captions
     (a blur left 90 px text readable). Map the source at 1 fps and with cut detection first.
13bo. **A caption block may run past the root.** Captions hold 0.35 s after the last word plus 0.1 s;
     trim 0.5 s after the last word (lint `clip_ends_past_root_duration` at 0.35 s).

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
16d. **Patch generated-JS templates by line, not with sed or nested template literals.** GNU sed reads
     `\s` in a pattern as whitespace (it rewrote every space in six lines), and a backtick string turns
     `\b` into a backspace character. For tools that emit JS inside template literals, edit with the
     Edit tool or a script using `String.raw`, then `node --check` and a real `import()`.
17. Renders take about 2-3 minutes for 17 s at 1080x1920 with 3 workers on this laptop
    (screenshot capture mode). Low free RAM (< 2.5 GB) risks failures; close apps first.

## Rights

18. Commercial songs (for example a Taylor Swift track) may be muted on Instagram when baked
    into the file. Offer a silent export so the user can add the song in-app.
19. GLB models from Adits have no license notes; keep them on Hold until the user clears them.
