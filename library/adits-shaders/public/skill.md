---
name: adits-shaders
description: Author, validate, preview, and publish Adits shader objects for shaders.adits.app. Use when the user wants a new shader for Adits, wants a shader checked against the Adits profile, or wants one published to the gallery. All rendering and validation happen locally in the repo; publishing is a git commit.
---

# Adits Shaders: make and publish shader objects

[shaders.adits.app](https://shaders.adits.app) is the public gallery of **Adits shader
objects**: single-file, audio-reactive, generative objects that the Adits video engine
composites into a 3D scene over live footage. Every shader on the site can be previewed
live, orbited with the camera, and downloaded as one file that drops straight into Adits.

Three documents matter, in this order of authority:

1. **`shader-guide.md`** is the law. Every "must" in it is machine-checked, every
   "should" decides whether the result looks good. Read it in full before writing
   a single line of GLSL. Served at `https://shaders.adits.app/shader-guide.md`.
2. **`llms.md`** is the reference: format primer, reserved uniforms, the visual taste
   the gallery is curated toward, and the publishing flow.
3. **This file** is the workflow.

## The loop

1. **Read the guide.** `shader-guide.md`, all of it. The alpha section and the
   performance section are where generated shaders usually fail.

2. **Pick a concept the corpus does not already have, then write it** at
   `shaders/<slug>.glsl` in the gallery repo. List `shaders/` and read the existing
   descriptions first: a new shader must bring its own silhouette, its own structural
   idea, and its own palette decision. A near-duplicate is rejected at review even when
   every check passes. Kebab-case slug that collides with nothing, one object per file.
   The file is a `/*{ ... }*/` JSON header with `"ADITS": 1`, then a GLSL ES 1.00 body
   that writes premultiplied alpha to `gl_FragColor`. Draw one centered object against
   transparent black. The footage is not visible to the shader and nothing may be painted
   outside the object's silhouette. Build it in the morph style (guide §12) — the house
   standard: three to five archetypes under a spectral selector, `"morph"` declared in
   `CATEGORIES` — unless the concept genuinely cannot support archetypes, and say so in
   the PR when it cannot.

3. **Validate and compile-check. Both gates are mandatory.**

   ```bash
   npm run check                                      # validate + real WebGL compile
   node scripts/validate.mjs shaders/my-object.glsl   # rules only, just yours
   node scripts/compile-check.mjs shaders/my-object.glsl
   ```

   `validate` implements Appendix B of the guide and must PASS with **zero errors and
   zero warnings** (`--json` for machine-readable output). It does not parse GLSL, so
   `compile-check` assembles the shader exactly as the runtime does and compiles it in
   a headless browser: that is what catches a missing `.0`, a call before its
   definition, or a swizzle mistake. Neither can judge how the shader looks.

4. **Render it and look at it. This is not optional.**

   ```bash
   npm run render -- my-object --time 2.0 --audio 0     # silence
   npm run render -- my-object --time 5.5 --audio 0.85  # driven
   npm run render -- my-object --checker                # alpha leak check
   ```

   PNGs land in `preview-frames/`. **Open them.** If you cannot see images, hand them
   to a vision model or a human. "Compiles and validates but renders mud" is the
   number one miss, and only looking catches it.

   The command also prints coverage numbers, which catch failures the eye can miss:

   - **`edge` must be 0.** Anything above about `0.02` means the object or its glow is
     being cut by the frame border.
   - **`mean alpha` above ~0.6** is the full-frame veil failure.
   - **`lit` above ~55%** means the object is eating the footage.
   - **`lit` below ~0.5%** means almost nothing was drawn.

   Judge the silence frame first: the object must be complete and attractive with no
   audio at all. Most bad shaders only look right with the beat.

   Then put the silence frame and the driven frame **side by side**. They must differ at
   a glance — in form, reach, or light, not merely in brightness. If which is which is
   not obvious, the shader fails the audio bar (guide §11.8): rework it before touching
   anything else.

5. **Then check it interactively.**

   ```bash
   npm run dev        # then open http://localhost:3000/shader/<slug>
   ```

   The site runs the same host contract Adits does. Check:

   - **Orbit.** Drag the preview. The composition must survive off-axis viewing.
   - **Backdrops.** Flip through *Night street*, *Daylight sky*, and *Checker*. The
     object must read on all of them.
   - **Key stays on "Keep".** If the preview only looks right under Luma Key, the
     shader is writing wrong alpha; fix the shader, not the key.
   - **Demo beat, a full cycle, Drive mode set to Flywheel.** The preview opens on
     **Default**, which pins the clock at 1×, so this check is skipped unless the mode is
     switched. Do switch it: the host flywheel runs the clock at up to 10× on the hits
     (guide §5). The object should surge and coast with the pattern; if it strobes, its
     base rates are tuned too fast — slow them at 1× and let the drive supply the energy.
     A morph should visibly change identity as the pattern's balance shifts.
   - **Then back to Default.** Same demo beat, plain 1× clock. This isolates the shader's
     own `BIND` reactivity from the clock's, and it is the reading a visitor gets first.
     An object that only looks alive with the flywheel on has borrowed its energy.

6. **Publish.** Commit the one new file and open a pull request. The build runs the
   checks again and fails the deploy on any error. Merge publishes it: the gallery
   picks up every file in `shaders/` automatically, with the preview, controls panel,
   download, and **Open in Adits** link generated from the header. No manifest, no
   registration step.

7. **Confirm it in Adits itself.** Open `https://adits.app/?shader=<slug>`, the same link
   the gallery card and the shader page use. It loads the shader straight into the
   Anamorphic 3D scene, with no download and no import menu.

   The gallery preview runs the same host contract, so this rarely disagrees, but it is the
   only place you see the real thing. Two differences worth knowing:

   - The link arrives with **Tracking Mode: None**, so no webcam is opened and `TRACK_ON`
     reads `0.0`. Switch it to Hands to exercise gesture bindings.
   - A **compile failure produces no message** in Adits (§15.3 of the guide). If the object
     is missing and the panel looks clean, open the browser console.

   Then use it as a real scene: load footage behind it, add an audio track, and record. That
   is what the object is for, and it is the fastest way to notice a shader that reads well
   on the gallery's flat backdrop and disappears over busy video.

## The look

The gallery is curated toward one taste, distilled from the owner's reference set
(dark AR-style composites of generative objects filmed into real places). Full detail
with implementation notes lives in `llms.md`. The invariants:

- **One centered object** with a strong, legible silhouette. Radial or bilateral
  symmetry. It should read as a physical presence floating in the scene, roughly
  one to three meters tall, not as a screen effect.
- **Organic-mechanical hybrids**: insectoid, botanical, skeletal, gyroscopic,
  crystalline. Detail comes from self-similar repetition, not from noise.
- Four color families are welcome: near-black glossy biomech with bright rim light,
  silvery chrome filaments, additive neon light armatures (cyan, violet, magenta,
  acid green), and hyper-saturated chroma-split psychedelia.
- **Motion is slow, hypnotic, and seamlessly looping**: breathing, unfolding, precession.
  Derive motion from `float phase = fract(TIME / PERIOD) * TAU;` using strict integer harmonic
  multipliers ($k \in \mathbb{Z}$) on `phase`. Avoid fractional multipliers that cause jumps at cycle
  boundaries. Audio adds punch on top of a design that is finished in silence. Tune rates at 1×;
  the host clock reaches 10× on loud material.
- **Morph is the house standard** (guide §12): three to five distinct archetypes, a
  spectral selector, per-element stagger, `"morph"` in `CATEGORIES`. The whole corpus
  is built this way; depart only when the concept truly cannot support archetypes.
- **Nothing outside the object.** No background wash, starfield, vignette, fog,
  or full-frame tone map. The footage is the background.

## Frame geometry: the number that actually bounds your object

With the canonical preamble on a square render, `uv` runs `-0.5 … 0.5` on both axes.
So the visible frame reaches **0.5 along the axes** and only `0.707` at the corners.

Guide §10 carries the rule, and it names two radii: the `0.75` bounds the composite plane,
the frame itself stops at `0.5`. Anything past `0.5` in the horizontal or vertical
direction is cut by a straight line at the frame edge.
Two rules follow, and both are easy to miss because they only bite at certain angles or
certain slider values:

- **Design to 0.5, not to 0.75.** Keep the silhouette inside about `0.46` and every bounding
  `smoothstep` reaching zero by about `0.48`, so glows fade out rather than getting sliced.
- **Check the whole reachable range, not just the defaults.** A `MIN … MAX` slider and a
  `BIND` both move geometry. Compute the largest value the bind can produce
  (`panel + (MAX − panel) × depth`) and make sure the object still fits there. If it does
  not, lower `MAX` rather than hoping nobody turns the slider up.

## Failure modes to check before every submit

| Failure | Symptom | Fix |
| --- | --- | --- |
| Edge clip | A straight cut across the object or its glow | Design to 0.5, and check the bind maximum, not just the default |
| Alpha veil | Checker backdrop dims everywhere | Every `alpha +=` term needs the same spatial falloff its color uses |
| Opaque rectangle | Object sits in a black box | Never write `vec4(col, 1.0)`; derive alpha from coverage, premultiply |
| Mud | Renders, but grey and shapeless | Raise contrast, separate hue from density, keep peak emissives near 1.0-1.5 |
| Loop pop / jump | Visible seam or jump each cycle | Strict integer harmonic multipliers ($k \in \mathbb{Z}$) on `phase`; avoid fractional multipliers (e.g. `phase * 1.5`, `phase * 0.125`) |
| Cost lie | Stutters at default resolution | Declare `COST` honestly; a raymarch is never "low" |
| Beat-only design | Ugly at silence | `DEFAULT` values are the silence look; tune them first |
| Deaf shader | Silence and driven frames look the same | 3-4 binds with distinct band roles, an onset pulse in the body, a spectral morph selector |
| Strobe at drive | Frantic under the demo beat | The host clock reaches 10×; tune base rates slow at 1× |
| Corpus clone | Looks like an existing gallery entry | Survey `shaders/` first; bring a new silhouette and idea, not a palette swap |

## Rules

- GLSL ES 1.00 only: `gl_FragColor`, no `#version`, no `precision` line, no samplers,
  no `dFdx`/`dFdy`/`fwidth`, constant loop bounds, 200-iteration budget, raymarch
  64 steps (96 hard ceiling) with 4-tap normals.
- Never declare the reserved uniforms (`TIME`, `RENDERSIZE`, `AUDIO_*`, `CAM_*`,
  `TRACK*`, `HAND_OPEN`) or your own `INPUTS`; the host injects both.
- At most 12 inputs, and prefer 3 to 5 expressive ones, each with a `LABEL` and a
  considered `DEFAULT`. Bind three or four of them, each audio band with a distinct
  structural role.
- Do not smooth audio in the shader; the host's envelopes already did it.
- The host drives the clock speed from the music (an audio-momentum flywheel; guide
  section 5). Derive all motion from `TIME` and it inherits that for free — never try to
  integrate audio into motion inside the shader. The gallery preview opens with that
  flywheel off (Drive mode **Default**, a flat 1× clock), but Adits applies it, so tune
  base rates for the 10× case regardless of what the preview shows on arrival.
- **Seamless continuous looping**: declare `LOOP` when the design cycles, and ensure all
  harmonic rates and rotations use strict integer multipliers ($k \cdot \text{phase}$) so the
  start ($t=0$) and end ($t=\text{PERIOD}$) frames match 100% seamlessly.
- Every shader is fully audio reactive: distinct band roles, at least one onset pulse
  read directly in the body, and a driven render that differs from the silence render at
  a glance. Build morphs (guide §12) by default and declare `"morph"` in `CATEGORIES`.
- Be original against the corpus: survey `shaders/` before choosing a concept, and do not
  submit a near-duplicate of an existing entry.
- Only publish work you have the right to publish, and declare your model honestly
  in `CREDIT`, as the model name alone (for example `CREDIT: "claude-fable-5"`). Nothing
  else goes in that field: no role words, no "for Adits", no reference or concept notes.
