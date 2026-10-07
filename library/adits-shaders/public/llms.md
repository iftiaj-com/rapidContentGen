# Adits Shaders

[shaders.adits.app](https://shaders.adits.app) is the gallery of **Adits shader objects**:
single-file, audio-reactive generative objects for the Adits video engine. Adits composites
each object into a 3D scene over live footage, tilts it with the anamorphic camera, drives it
from music and hand tracking, and can wrap it onto a cube, cloth, folded ridges, or a voxel
grid. Every shader on the site is previewed live in the browser and downloadable as one file
that drops straight into Adits.

The normative specification is **`shader-guide.md`** (served at
`https://shaders.adits.app/shader-guide.md`). This file is the working reference: the format
in brief, the visual taste the gallery is curated toward, and how reading, authoring, and
publishing work. Where this file and the guide disagree, the guide wins.

## Choose your path

- **Browse / download / study the corpus**: the site itself, plus raw file URLs (next
  section). No account, no API key; the site is fully static.
- **Author and publish a shader (agents)**: work in the gallery repository. Write one file,
  run the validator, preview in the local renderer, open a pull request. The whole flow is
  under "Authoring" and in `skill.md` (`https://shaders.adits.app/skill.md`).
- **Use a shader in Adits (humans)**: press Download on any shader page, then drop the file
  onto the Adits shader panel. The labelled controls, audio binding, and gesture binding
  come from the file's own header.

## Reading the corpus

The site is static and rebuilt from the repository on every merge. There is no write API;
publishing is git.

- Gallery: `https://shaders.adits.app/` with search, sort, category, and cost filters.
- One shader: `https://shaders.adits.app/shader/<slug>`. Each shader page is prerendered
  with its own title, description and social card, all built from the header.
- Raw source: `https://shaders.adits.app/shaders/<slug>.glsl`. This is the exact file the
  Download button hands out.
- Open in Adits: `https://adits.app/?shader=<slug>`. Opens the app with that shader already
  compiled into its Anamorphic 3D scene, so no download and no import step is needed. The
  parameter is a slug, never source and never a URL: Adits maps it back to the raw path
  above with the origin fixed server side, which is what stops the link being rewritten
  into "compile this arbitrary GLSL". Emitted by the gallery card, the shader page, and the
  prerendered fallback.
- Docs: `/shader-guide.md`, `/skill.md`, `/llms.md`.

In the repository, the corpus is the `shaders/` directory: one `.glsl` (or `.fs` / `.frag`)
file per object. The gallery, previews, controls, and downloads are all generated from the
files' headers at build time. There is no manifest to update.

## The format in brief

A shader object is a JSON header comment, then a GLSL ES 1.00 fragment shader:

```glsl
/*{
  "ADITS": 1,
  "DESCRIPTION": "One sentence describing the object and how it moves.",
  "CREDIT": "model name only, for example claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 8.0,
  "INPUTS": [
    { "NAME": "bloom", "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.15, "MAX": 0.70,
      "LABEL": "Bloom Size", "BIND": "bass", "BIND_DEPTH": 0.5 }
  ]
}*/

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;  // canonical preamble
    // ... draw ONE object centred at the origin, inside radius 0.46 ...
    float alpha = clamp(coverage, 0.0, 1.0);
    col *= alpha;                       // premultiply
    gl_FragColor = vec4(col, alpha);    // 0.0 everywhere the object is not
}
```

Key facts, with the guide as authority for all of them:

- **`"ADITS": 1`** marks the Adits profile: labelled panel, audio and gesture binding,
  correct alpha, cost-aware default resolution. Without it a valid header still loads on a
  generic fallback path with unlabelled sliders.
- **Input types**: `float`, `bool`, `long`, `color`, `point2D`, `event`. `image`, `audio`,
  and `audioFFT` are rejected in version 1. Every input becomes an injected uniform plus a
  panel control; never declare it yourself. `MIN < MAX`, `MIN <= DEFAULT <= MAX`, at most
  12 inputs, and the taste budget is 3 to 5.
- **Reserved, always-injected uniforms** (never declare them, never reuse the names):
  - Time and geometry: `TIME`, `TIMEDELTA`, `FRAMEINDEX`, `RENDERSIZE` (changes at
    runtime), `PASSINDEX` (always 0). The host scales how fast `TIME` advances with an
    audio-momentum flywheel (Speed x Audio Drive; guide section 5), so all TIME-derived
    motion is already audio reactive — derive motion from `TIME`, never integrate audio
    into position yourself.
  - Audio, each clamped 0..1 and pre-smoothed: `AUDIO_BASS`, `AUDIO_MID`, `AUDIO_TREBLE`,
    `AUDIO_VOL`, `AUDIO_LEVEL` (auto-gain), `AUDIO_BEAT`, `AUDIO_KICK`, `AUDIO_SNARE`,
    `AUDIO_HAT` (decaying onset pulses), `AUDIO_BANDS[24]` (log-spaced spectrum). With no
    audio, all are 0.0. Never smooth them again in the shader.
  - Camera, for 3D work: `CAM_DIR`, `CAM_UP` (object-local, rest values `(0,0,1)` and
    `(0,1,0)`). Drive the ray origin from `CAM_DIR` instead of a hardcoded orbit so the
    real camera, and hand tracking, actually orbit the object.
  - Gesture: `TRACK` (x, y in -1..1 with +y down; z in -1..1), `TRACK_ON`, `HAND_OPEN`
    (-1.0 means "no signal", never "fist"). Guard responses on `TRACK_ON`.
  - `ADITS_*`, `MEDIA`, `MEDIA_SIZE` are reserved for the host.
- **`BIND`** on a `float` or `long` input lets the host drive it from
  `bass · mid · treble · vol · level · beat · kick · snare · hat` or
  `gesture.x · gesture.y · gesture.z · gesture.open`. The panel value is the floor; the
  source pushes toward `MAX` (or toward `MIN` with a negative `BIND_DEPTH`). At silence the
  uniform sits exactly at `DEFAULT`, which is why the defaults must be the finished look.
- **Alpha is the rule that decides everything**: draw against transparent black, write
  premultiplied alpha, keep alpha 0.0 outside the object, no full-frame gradients,
  starfields, vignettes, fog, or tone-mapped backgrounds. A hard-coded opaque write gets
  rescued by an automatic luma key, which eats shadow detail; correct alpha needs no rescue.
- **Performance**: design target of about 2 ms at 512x512 on integrated graphics. Constant
  loop bounds, 200 total iterations, raymarch budget 64 steps (96 hard ceiling), 4-tap
  tetrahedral normals, and an honest `COST` (`low` maps to a 1024 default resolution,
  `medium` 768, `high` 512).
- **GLSL ES 1.00**: write `gl_FragColor`; no `#version`, no `precision` line, no samplers,
  no derivatives (`dFdx`/`dFdy`/`fwidth`), no `in`/`out`/`flat`/`centroid` globals.

## The Adits look

The gallery is curated toward one visual identity, distilled from the owner's reference
set: phone-filmed real places (night streets, parks, daylight sky, empty interiors) with a
single generative object composited in as if it were physically there. Aim every shader at
that fiction. The invariants:

- **One object, centered, strongly silhouetted.** Radial or bilateral symmetry. If the
  silhouette does not read at a glance, the shader fails regardless of detail quality.
- **Believable physical presence.** The object should feel one to three meters tall,
  hovering at chest height in a real scene. Coverage under about a third of the frame; the
  footage must stay legible around it.
- **Organic-mechanical hybrids.** Insectoid limbs, botanical fans, skeletal lattices,
  gyroscopic rings, crystalline spines. Structure comes from self-similar repetition
  (angular `mod`, mirrored folds, nested rings), not from noise textures.
- **Slow, hypnotic motion & Seamless Continuous Looping.** Breathing, unfolding, precession,
  counter-rotation. Declare `LOOP` and wrap every rate as a strict integer multiple of the loop
  phase (`float phase = fract(TIME / PERIOD) * TAU;`). Avoid fractional phase multipliers that cause
  pops or stutter at the loop boundary. Audio adds recoil, flash, and swell on top of a design that
  is complete in silence. Tune every base rate at 1×: the host's audio flywheel (guide §5) runs the
  clock at up to 10× on loud material, so a rate that is already busy at 1× strobes when the music hits.

**Two radii bound the object, and only the smaller one keeps it on screen.** With the
canonical preamble on a square render, `uv` spans `-0.5 … 0.5`, so the visible edge sits
at `0.5` along the axes and `0.707` only at the corners. The `0.75` in guide §10 bounds
the composite plane, not the frame: anything past `0.5` horizontally or vertically
is cut by a straight line. Design the silhouette to about `0.46`, have every bounding
`smoothstep` reach zero by about `0.48`, and check the largest value a slider or a bind can
reach (`panel + (MAX − panel) × depth`), not just the default. Lower a `MAX` rather than
shipping a range whose upper half clips.

Four color families recur in the reference set. Pick one deliberately:

| Family | Body | Light | Reads best over |
| --- | --- | --- | --- |
| **Obsidian biomech** | Near-black, glossy, wet (rgb 0.02-0.06) | Thin bright specular rims on every edge | Bright daytime footage |
| **Chrome filament** | Thin silvery wires and arcs, semi-translucent | Traveling sparkle glints | Dusk and night |
| **Neon armature** | Dark or absent; the light is the object | Additive cyan/violet/magenta strokes with tight bounded glow | Night footage |
| **Chroma-split psychedelia** | Dense scalloped bands, acid green/magenta/blue | Deliberate RGB fringe (sample the field at three phase offsets) | Bright sky |

Anti-taste, rejected on sight: full-frame plasma or tunnel effects, screen-space noise
washes, mid-grey soft shading, centered "wallpaper" mandalas with no silhouette, anything
that reads as a filter on the footage rather than an object in it, and glow that touches
the frame edge.

## The audio-reactive bar

Every gallery shader is **fully audio reactive**, on two layers, and both must be present:

- **The host layer comes free.** Both Adits and the gallery preview advance `TIME` through
  an audio-momentum flywheel (Speed × Audio Drive, up to 10×; guide §5), so all
  TIME-derived motion already follows the music. The preview's Drive mode opens on
  **Default**, which pins that clock at 1× for a plain reading; Adits applies the flywheel,
  so author for it. Derive every rate from `TIME`, keep base
  rates slow, and never try to integrate audio into motion inside the shader — a fragment
  shader has no memory between frames, and the host does it better for every shader at once.
- **The shader layer is yours.** Three or four `BIND`s with a distinct structural role per
  band (bass = swell and scale, mid = warp and deformation, treble = detail and sparkle,
  kick or beat = a one-shot snap), at least one onset pulse used directly in the body, and
  defaults that look finished in silence. A driven render must differ from the silence
  render at a glance — in form, reach, or light, not merely brightness (guide §11.8).
- **The house standard is the morph style** (guide §12): three to five distinct archetypes
  under a spectral selector, so the music decides which object is on screen. The whole
  corpus is built this way. Depart from it only when the concept genuinely cannot support
  archetypes, and say so in the pull request.

## Originality

The gallery is small and curated, so repetition shows immediately. Before writing, list
the `shaders/` directory or browse the gallery and read the descriptions. A new shader
must bring its own silhouette, its own structural idea, and its own palette decision. A
near-duplicate — the same silhouette re-coloured, the same structure with one parameter
moved — is rejected at review even when every mechanical check passes. If the strongest
concept available overlaps an existing entry, pick a different concept.

## Authoring (agents)

The full step-by-step loop lives in `skill.md`. In outline:

1. Read `shader-guide.md` end to end.
2. Survey the corpus for originality (section above), then write `shaders/<slug>.glsl` in
   the repository. One object per file, kebab-case slug that collides with nothing already
   in `shaders/`.
3. Check: `npm run check`, which runs two gates. `validate` applies the guide's Appendix B
   (zero errors and zero warnings is the bar; `--json` for machine output).
   `compile-check` assembles the shader the way the runtime does and compiles it in a
   headless browser, which is the only thing that catches a genuine GLSL error, since the
   validator does not parse GLSL. There is no CI: a human re-runs both locally
   (`npm run preflight`) before merging, so a skipped or failed gate must be reported
   in the pull request, never left to be discovered downstream.
4. Render and look: `npm run render -- <slug> --time 2.0 --audio 0` writes a PNG to
   `preview-frames/` and prints coverage numbers (`edge` must be 0, `mean alpha` under
   about 0.6, `lit` between roughly 1% and 55%). Repeat with `--audio 0.85` and
   `--checker`. Open the images, or hand them to a vision model or a human. Static checks
   cannot catch "renders mud"; only looking can. Put the silence frame and the driven
   frame side by side: if which is which is not obvious, the shader fails the audio bar
   (guide §11.8) and needs rework before anything else.
5. Preview interactively: `npm run dev`, open `http://localhost:3000/shader/<slug>`. The
   local site is the same host contract as Adits: injected uniforms, BIND drive with live
   meters, the alpha/key pipeline, orbit via `CAM_DIR` (drag), audio in three modes
   (silence, a deterministic demo beat, microphone), simulated hand tracking, and
   footage-like backdrops. Drive mode opens on **Default**, a flat 1× clock, so the object
   is read as authored. Switch it to **Flywheel** and watch a full demo-beat cycle: the
   flywheel runs the clock hard on the hits, and an object that strobes there has base
   rates tuned too fast. That check is only reached by switching the mode.
6. Publish: commit the file, open a pull request, merge. The gallery regenerates from
   `shaders/` automatically.

Honesty rules for agents: declare your model in `CREDIT`, and write the model name and
nothing else (for example `"CREDIT": "claude-fable-5"` or `"CREDIT": "jules"`) — no role
words, no "for Adits", no reference footage or concept credits. Never publish a
shader whose validator output you have not seen, and never claim a preview was checked when
it was not. If you cannot render locally, say so in the pull request and ask for a visual
check; the Cloudflare preview deployment renders the site for any reviewer.

Best effort is part of the contract: iterate render → look → adjust until the object would
hold its own next to the strongest entries in the corpus. One striking shader beats three
passable ones, and "compiles, validates, technically reacts" is the floor, not the goal.

## The three tools, exactly

**`scripts/validate.mjs`** checks every mechanical rule from the guide's Appendix B: header
present, first, and valid JSON; the header and input schemas, including unknown keys, which
would otherwise let a misspelled `BIND` silently drop; input bounds; reserved and duplicate
names; `#version`, samplers, derivatives, GLSL 3.00 qualifiers; exactly one `main`;
`gl_FragColor` written and never read; constant loop bounds (`while` and `do` are refused,
`#define` and `const int` bounds are resolved, and the increment is counted, so a
fractional step cannot hide a thousand iterations); the 200-iteration budget across nesting,
braced or not; the 96-step raymarch ceiling and the 4-tap normal warning; the canonical
preamble; premultiply, judged against the alpha expression the shader actually writes;
unlocalised `alpha +=` accumulation (the full-frame veil bug); the hard-coded opaque write;
`LOOP` consistency; silence-safe defaults; and the 256 KB size cap. It does not parse GLSL.

**`scripts/compile-check.mjs`** assembles each shader exactly as the site's runtime does,
then compiles and links it in a headless Chrome or Edge. This is what catches real GLSL
errors: a missing `.0` in a float expression, a function used before its definition, a bad
swizzle. It skips itself with exit 0 when no browser is installed.

**`scripts/render.mjs`** renders a frame to PNG at a chosen `--time` and `--audio` level and
reports mean alpha, lit percentage, opaque percentage, and border alpha. Border alpha above
about `0.02` means the frame edge is cutting the object; a mean alpha near 1.0 is the veil
failure. Neither number replaces looking at the image.

Together these are the honest limit of automation: they prove a shader is well formed,
compiles, and covers a sane share of the frame. Whether it looks good is a human or
vision-model judgement, and it stays mandatory.

## How the site renders (for anyone reimplementing)

The preview is a WebGL 1 context with `premultipliedAlpha: true` on a transparent canvas
over a CSS backdrop, so a conformant shader composites exactly as it would over footage.
The host injects `precision highp float;`, all reserved uniforms, and one uniform per
declared input; applies BIND on the CPU using the guide's floor-plus-depth formula; and
wraps the body so the declared `ALPHA` mode and the four Background modes (Keep, Luma Key,
Black Key, Chroma Key) run as a post stage. A shader whose only hard failure is the opaque
write still previews, auto-rescued by the luma key with a visible notice, mirroring what
Adits itself does; every other validator error leaves the entry visible but not runnable.
Note the gallery is deliberately stricter than Adits' own loader here: Adits rejects a
smaller set of rules, and on rejection it empties the model plane and toasts the first
error rather than restoring the previous model. See §15 of the guide for both lists.

## Rules

- The gallery is curated: matching the taste section above is a merge requirement, not a
  suggestion.
- Originality and the full audio-reactive bar (both sections above) are merge requirements
  too: no near-duplicates of existing entries, and no shader whose driven frame cannot be
  told from its silence frame.
- One file, one object. No multipass, no feedback buffers, no textures in version 1.
- Only publish work you have the right to publish. Provenance goes in `CREDIT`.
- Licensing of the corpus is set by the repository owner; do not republish shaders from
  other sites here unless their license and the owner's policy both allow it.
