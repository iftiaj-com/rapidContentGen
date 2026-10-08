# Adits Shader Object — Authoring Guide

**Version 1 of the Adits Shader Profile.**
Audience: the shader generator app, and anyone hand-writing a shader object for Adits.

A **shader object** is a single fragment shader that draws a glowing, generative, audio-reactive
object which Adits composites into a 3D scene over live footage. The shader does not see the
footage. It draws its object against transparent black, and Adits places that object in the
world, tilts it with the anamorphic camera, and can wrap it onto a cube, cloth, folded ridges,
or a voxel grid.

### For autonomous agents

This guide is written to be followed by coding agents (Jules, Claude, and others) as much
as by people. If you are an agent authoring a shader, these are standing orders, and none
is optional:

1. **Read this guide end to end before writing GLSL.** Every "must" is machine-checked at
   merge; every "should" decides whether the work survives curation.
2. **Zero errors and zero warnings** from the validator is the bar, and the compile check
   must pass. A warning is not "probably fine"; it is a finding to fix before submitting.
3. **Look at your renders.** Render a silence frame and a driven frame, open the images or
   hand them to a vision model, and judge them against §10 and the taste section of
   `llms.md`. Static checks cannot catch "renders mud"; only looking can.
4. **Be original.** Survey the existing corpus (the `shaders/` directory, or the gallery)
   before choosing a concept. A new shader must bring its own silhouette, its own
   structural idea, and its own palette decision — not a re-parameterisation or a colour
   swap of an existing entry. Near-duplicates are rejected at review even when every
   mechanical check passes.
5. **Be fully audio reactive.** Meet the whole bar in §11 — a distinct structural role per
   band, at least one onset pulse read directly in the body, a driven frame that differs
   from the silence frame at a glance — and build in the §12 morph style, which is the
   house standard, unless the concept genuinely cannot support distinct archetypes. When
   it cannot, say so in the pull request.
6. **Declare yourself.** Your model name, and only your model name, in `CREDIT`, and
   never claim a check you did not run.

Best effort means iterating: render, look, adjust, and repeat until the object would hold
its own next to the strongest entries in the corpus. Shipping one striking shader beats
shipping three passable ones.

### Who checks what

Two things check a shader, and they do not check the same list. Knowing which is which saves
a lot of confusion.

- **The gallery validator**, at `shaders.adits.app`, enforces every mechanical rule in this
  document, including the header schema in Appendix A and the whole of Appendix B. It is
  what blocks a merge, and it is the stricter of the two.
- **Adits' own loader** enforces a subset at import time: the header block parses, the
  `INPUTS` contract holds, and the GLSL body rules in §7 are met. It does **not** check
  `DATE`, `BIND` source names, loop bounds, the loop budget, or file size.

So everything that says **must** is checked by the gallery, and the rows below flag the ones
Adits' loader lets through in silence. Passing the gallery guarantees Adits will load the
file. The reverse does not hold: a hand-written shader Adits accepts may still be rejected
by the gallery.

Everything that says **should** is a quality rule neither side can enforce but which decides
whether the result looks good.

---

## 1. Conformance levels

| Level | Trigger | What you get |
| --- | --- | --- |
| **Adits profile** | `"ADITS": 1` present in the header | Full feature set: auto-generated labelled panel, audio binding, gesture binding, correct alpha, cost-aware default resolution. Every rule in §4 is a hard error |
| **Generic fallback** | Valid `/*{ … }*/` header, no `ADITS` marker | Shader loads, and `LABEL` and `BIND` are still honoured, so a well-formed file loses little. What changes is **severity**: an unsupported `TYPE`, a missing `MIN` / `MAX`, or an out-of-range `DEFAULT` becomes a warning, and the input is skipped or clamped instead of failing the load. With no `COST` the render target defaults to 768 px |
| **Rejected** | No parsable header, or a hard-rule failure | Load fails, the first error is shown as a toast, and the model plane goes empty |

The generator app should always emit the Adits profile. The fallback exists so that a shader
found elsewhere still does something useful.

**On rejection, the plane goes empty.** Adits substitutes a fully transparent 1×1 texture so
that the plane still exists and every downstream mode stays wired, then toasts the first
error. The previous model does not come back. So a failed import is visible as *nothing on
the plane plus a message*, not as the old object still sitting there.

**Scope note.** Adits borrows conventions from ISF (the `/*{ … }*/` JSON header, `INPUTS`,
and the `TIME` / `RENDERSIZE` / `PASSINDEX` built-ins) but does **not** implement ISF. Multi-pass
`PASSES`, persistent buffers, and `image` / `audio` / `audioFFT` input types are out of scope in
version 1. Treat this document as the authority, not the ISF specification.

---

## 2. File format

- **Extensions:** `.glsl`, `.fs`, `.frag`. All three are treated identically; the extension is cosmetic.
- **Encoding:** UTF-8, no byte-order mark.
- **Size:** must be under 256 KB. Enforced by the gallery validator only; Adits' loader has
  no size cap.
- **Structure:** the header comment block, then the GLSL body. Nothing else.
- **One file is one pass.** There is no multi-pass support and no way to read the previous frame.
- The header **must** be the first non-whitespace content in the file.

---

## 3. The header block

```
/*{
  "ADITS": 1,
  "DESCRIPTION": "One sentence describing the object and how it moves.",
  "CREDIT": "Model name only, for example claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "bloom", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 8.0,
  "INPUTS": [ … ]
}*/
```

The content between `/*{` and `}*/` **must** be valid JSON once the outer braces are restored.
A trailing comma anywhere is a hard failure.

| Key | Required | Values | Meaning |
| --- | --- | --- | --- |
| `ADITS` | yes, for the profile | `1` | Profile marker and version |
| `DESCRIPTION` | yes | string | One sentence naming the object and how it moves. Shown in the gallery |
| `CREDIT` | no | string | The author's model name, alone. Rendered as the byline on the shader page, so it carries the name and nothing else: no role words, no "for Adits", no reference footage, no concept or rewrite credits |
| `DATE` | should | string, `YYYY-MM-DD` | The day the shader was authored. Sorts the gallery, and is the only date the file carries |
| `CATEGORIES` | no | array of strings | Free-form tags, with one reserved value: `"morph"` declares the style in §12 and is required on any shader built that way |
| `ALPHA` | no | `"premultiplied"` \| `"straight"` \| `"opaque"` | What the shader writes. Defaults to `"premultiplied"` |
| `BACKGROUND` | no | `"none"` \| `"filled"` | `"none"` asserts nothing is drawn but the object. Defaults to `"none"` |
| `COST` | no | `"low"` \| `"medium"` \| `"high"` | Honest self-assessment. Picks the default render resolution |
| `ASPECT` | no | `"square"` \| `"free"` | Documents whether the composition assumes 1:1 |
| `LOOP` | no | number, seconds | Documents the exact loop period, so the gallery can label it and a reader knows the intended cycle |

### Which keys reach the renderer

Adits' loader reads exactly five: `ADITS`, `ALPHA`, `BACKGROUND`, `COST` and `INPUTS`.

`DESCRIPTION`, `CREDIT`, `DATE`, `CATEGORIES`, `ASPECT` and `LOOP` are **metadata**. Write
them, because the gallery uses all six and the validator requires two of them, but do not
expect them to change anything on screen. Two are worth spelling out, because both used to
be described here as runtime behaviour and are not:

- **`ASPECT` does not set the plane's shape.** Adits takes the plane aspect from its own
  Ratio control. Declaring `"free"` does not give you a non-square target.
- **`LOOP` does not wrap `TIME`.** Nothing wraps `TIME` for you. It rises monotonically, and
  it is the shader's job to fold it into a phase, exactly as §10 and §14 show:
  `float ph = fract(TIME / PERIOD);`. Keep `LOOP` and `PERIOD` equal by hand.

Adits' panel labels the loaded object with its **filename**, not with `DESCRIPTION`.

### `DATE`

Write the day you authored the shader, as a plain `YYYY-MM-DD` calendar date in UTC:

```json
"DATE": "2026-08-21",
```

That is the whole format. No time, no zone offset, no other separator, so `"2026-8-1"`,
`"21/08/2026"` and `"2026-08-21T04:36:54Z"` are all rejected. A day that does not exist is
rejected, and so is any date before 2020-01-01 or more than a day in the future, which
catches the usual typo of a wrong year.

The date is what the gallery's **Date** sort orders by, and it is the only date the file
itself carries. When it is absent the gallery falls back to the commit that first added the
file. That is a decent guess but it is not the same fact: a rebase, a squash, a re-import,
or a shallow clone in CI all move it, and a shader written weeks before it merged gets
dated by its merge. Write `DATE` and the file keeps its own history wherever it travels.

Set it once, when you author the shader. **Do not bump it when you edit one.** It records
when the object came into being, not when it was last touched, and a shader that re-dates
itself on every tweak parks itself permanently at the top of the newest-first sort.

`COST` maps to the default render-target resolution. The user can override it, but the default is
what most people will see:

| `COST` | Default resolution |
| --- | --- |
| `low` | 1024 × 1024 |
| `medium` | 768 × 768 |
| `high` | 512 × 512 |

Declaring `low` on an expensive shader is the single most damaging thing the generator can do,
because it hands the user a stuttering render loop with no obvious cause.

---

## 4. INPUTS

Each entry declares one uniform **and** one panel control.

```json
{
  "NAME": "bloom",
  "TYPE": "float",
  "DEFAULT": 0.42,
  "MIN": 0.15,
  "MAX": 0.70,
  "LABEL": "Bloom Size",
  "BIND": "bass",
  "BIND_DEPTH": 0.5
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `NAME` | yes | Valid GLSL identifier. Must not start with `gl_`. Must not collide with a reserved name from §5. Must be unique |
| `TYPE` | yes | See the table below |
| `DEFAULT` | yes, except on `event` | Must match the type. This is the value at silence and at reset. An `event` has no value to rest at, so it takes no `DEFAULT`. Gallery-enforced: Adits' loader silently substitutes `false`, opaque black, `(0,0)` or `MIN` when it is missing |
| `MIN` / `MAX` | required for `float` and `long` | Slider bounds and the audio-bind range |
| `LABEL` | should | Human-readable panel label. Falls back to `NAME`. Honoured on both conformance levels |
| `LABELS` | no | Only meaningful on a `long`. Names the dropdown items in index order, so its length sets the option count. **Not implemented in Adits today**, which always renders a `long` as a stepped slider and ignores the strings |
| `BIND` | no | Audio or gesture source. See §6 |
| `BIND_DEPTH` | no | −1.0 … 1.0, how far the bind sweeps. Defaults to `1.0` |

### Supported types

| `TYPE` | GLSL uniform | `DEFAULT` shape | Panel control |
| --- | --- | --- | --- |
| `float` | `float` | number | Slider |
| `bool` | `bool` | `true` / `false` | Checkbox |
| `long` | `int` | integer index | Stepped slider. A `LABELS` dropdown is specified but not built yet |
| `color` | `vec4` | `[r, g, b, a]`, each 0–1 | Colour picker |
| `point2D` | `vec2` | `[x, y]` | Two sliders |
| `event` | `bool` | omit | Momentary button, true for one frame. **Not implemented in Adits today** |

`image`, `audio`, and `audioFFT` are **rejected** in version 1.

**Two rows above are declarations of intent, not descriptions of the app.** An `event` input
compiles and its uniform exists, but Adits builds no button for it, so it stays `false`
forever. A `long` compiles and gets a working slider, but its `LABELS` strings never reach
the DOM. Prefer a `float` over a `long` unless the stepping is the point, and do not build a
shader whose behaviour depends on an `event` firing until this note goes away.

### Rules

1. An input **must not** also be declared in the body. Adits generates the `uniform` line, and a
   duplicate declaration is a compile error.
2. `MIN` **must** be less than `MAX`.
3. `DEFAULT` **must** lie within `MIN` … `MAX`.
4. Keep the count reasonable — under about twelve. Every input gets a panel control, but a
   long list of sliders is harder to use than a short one. Put the parameters that matter
   first, and prefer a few expressive controls over many fine ones.

### Reserved name prefixes

**Any name beginning `ADITS_` is rejected.** Adits injects its own uniforms under that
prefix (the alpha and background-key block uses `ADITS_ALPHA_MODE`, `ADITS_KEY_MODE`,
`ADITS_KEY_THR`, `ADITS_KEY_SOFT` and `ADITS_KEY_COLOR`) and will claim more over time.

`MEDIA` and `MEDIA_SIZE` are reserved too. Version 1 shaders cannot sample the footage, and
a later version that adds a media sampler will claim those names.

---

## 5. Reserved uniforms Adits always injects

Use these freely. Do **not** declare them, and do not use these names for your own inputs.

### Time and geometry

| Name | Type | Range and meaning |
| --- | --- | --- |
| `TIME` | `float` | Seconds, monotonically increasing, never negative. It tracks the media transport while a video plays, and keeps advancing on its own when nothing is loaded, when a still image is loaded, or while playback is paused. Nothing wraps it for you: wrap it yourself with `fract(TIME / PERIOD)` |
| `TIMEDELTA` | `float` | Seconds since the previous rendered frame. Clamped to 0.1 maximum |
| `FRAMEINDEX` | `int` | Frames rendered since this shader was built, and **reset to 0 when an offline export begins** so two renders of the same range are identical |
| `RENDERSIZE` | `vec2` | Render-target size in pixels. **Changes at runtime** when the user moves the Resolution control |
| `PASSINDEX` | `int` | Always `0` in version 1 |

**The panel's Speed control scales the shader clock.** Both `TIME` and `TIMEDELTA` are
multiplied by it, so at 50 % Speed a shader declaring `"LOOP": 8.0` takes sixteen real
seconds per cycle. `LOOP` is therefore a period in *shader* seconds, not wall-clock seconds.
Nothing in the shader needs to account for this, it is stated so the numbers are not
surprising.

**The host also drives the clock from the music.** Both Adits and the gallery preview run
an audio-momentum flywheel on the shader clock — the same one Adits' bulk-image carousel
uses to advance its cards. The dominant band level accelerates a velocity, friction decays
it in silence, and `TIME` advances at Speed × that multiplier. The user's **Audio Drive**
control (default 100 %) scales the effect, with four modes:

| Mode | Behaviour |
| --- | --- |
| **Default** | The clock is left alone. `TIME` runs at 1× and follows the media transport wherever there is one, exactly as it did before Audio Drive existed, so the object runs at the rates its author declared. The Audio Drive amount is ignored |
| **Flywheel** | Music spins the clock up to 10×; silence coasts down to a slow 0.15× idle |
| **Pulse** | Music adds speed on top of normal, up to 10×; silence is exactly 1× |
| **Tilt** | Treble runs the clock faster (up to 10×), bass drags it slower; silence returns to 1× |

Only the clock is affected. `BIND` still drives the panel uniforms from the bands in every
mode, including **Default**, so a shader keeps its own declared audio reactivity there.

**Which mode a host opens on differs, and the difference is deliberate.** The gallery
preview at shaders.adits.app opens on **Default**, because a visitor judging a shader
should first see it as authored, with nothing laid on top. Adits' own panel opens on
**Flywheel**, the mode that carries the app's look, so no project already built there
changes behaviour.

**Default and drive 0 are the same path, and neither is a 1× multiplier.** In Adits both
hand the shader the legacy transport-tracked clock. Above drive 0 the clock becomes an
integrator instead, because a varying multiplier on an absolute transport time would jump
backwards, and an integrator free-runs: it would keep advancing a shader through a pause
or a scrub. So leaving the clock alone is a different clock, not the driven clock with the
amount turned down to nothing. The gallery preview has no transport to track, so there
Default is simply real time at 1×.

**Authoring is still tuned for Flywheel, not for Default.** Default being the gallery's
opening mode is a reading convenience and changes nothing about the bar: the shader must
survive a clock running anywhere from nearly stopped to 10×, because that is what Adits
does to it. Two consequences for authors:

- **Do not integrate audio into motion yourself.** A fragment shader cannot (no memory
  between frames), and the host already does it for every shader at once. Derive all
  motion from `TIME` and the whole object inherits the flywheel.
- **The clock may legitimately run anywhere from nearly stopped to 10×.** Nothing in
  the shader may assume a fixed relationship between `TIME` and wall-clock seconds, and
  the silence state must look finished even while the clock barely moves — §11.6 already
  requires that state to look good; the idle clock only keeps it on screen longer.

### Audio

Every value below is clamped by Adits to 0 … 1 and smoothed with a frame-rate-independent
attack/release envelope, so the same audio produces the same result in a live preview and in an
export. Do not attempt your own smoothing; a fragment shader has no memory between frames.
What a shader *can* do is shape the value it is handed, and §11.9 onward is about that.

The envelope is fast on the way up and slower on the way down. In the gallery preview the
four band levels use about a 30 ms attack and a 140 ms release, `AUDIO_LEVEL` about 20 ms
and 200 ms, and every onset pulse is `exp(-t / 0.11)`: near 1 on the frame of the hit and
about 5 % a third of a second later. Adits' own engine is a separate implementation whose
band times follow the user's Smoothing slider, so take these as the preview's numbers and
the right order of magnitude, not as a contract. Two things follow for authors. A band can
rise within a couple of frames but takes several to settle, so anything driven from a band
drifts back rather than dropping. An onset is the only signal that is already back near zero
before the next eighth note, so it is the only one that reads as a hit.

| Name | Type | Meaning |
| --- | --- | --- |
| `AUDIO_BASS` | `float` | Low band |
| `AUDIO_MID` | `float` | Mid band |
| `AUDIO_TREBLE` | `float` | High band |
| `AUDIO_VOL` | `float` | Overall level, as the user's sensitivity and threshold sliders produce it |
| `AUDIO_LEVEL` | `float` | Overall level with automatic gain control, so it reacts on quiet and loud material alike |
| `AUDIO_BEAT` | `float` | Decaying pulse, rises to 1 on a detected beat and falls back over roughly a third of a second |
| `AUDIO_KICK` | `float` | Decaying pulse on a low-band onset |
| `AUDIO_SNARE` | `float` | Decaying pulse on a mid-band onset |
| `AUDIO_HAT` | `float` | Decaying pulse on a high-band onset |
| `AUDIO_BANDS[24]` | `float[24]` | Log-spaced spectrum, low to high, gain-normalized |

Honest notes on where these come from: `AUDIO_BASS`, `AUDIO_MID`, `AUDIO_TREBLE`, and
`AUDIO_VOL` are the audio engine's own band averages, which are affected by the user's global
Sensitivity, Smoothing, and Threshold sliders. `AUDIO_LEVEL`, `AUDIO_BEAT`, the three onset
pulses, and `AUDIO_BANDS` are computed by Adits from the raw spectrum, so they bypass those
sliders and respond harder to transients. If you want a snap, use an onset. If you want a swell,
use a band.

**Pick the signal by the job.** Most shaders that feel loosely tied to the music are reading
the wrong signal for the quantity they move, not reading it badly.

| You want | Read | Not |
| --- | --- | --- |
| A swell, a reach, a thickness that follows the music's weight | `AUDIO_BASS`, `AUDIO_MID`, `AUDIO_TREBLE` | an onset pulse, which is gone before the swell would register |
| Overall energy that tracks a quiet master as well as a loud one | `AUDIO_LEVEL` | `AUDIO_VOL`, which is whatever the user's sensitivity slider makes it |
| Energy the user should be able to tame from the panel | `AUDIO_VOL`, or a `BIND` | `AUDIO_LEVEL`, which bypasses the sliders |
| A hit: a flash, a recoil, a snap onto an archetype | `AUDIO_KICK` / `AUDIO_SNARE` / `AUDIO_HAT` for one register, `AUDIO_BEAT` for any | a band, which is still high 100 ms after the hit and reads late |
| Which *kind* of sound is playing | the balance of the three bands (§12.2) | any single level, which only says how loud |

With no audio playing, every audio uniform is `0.0`.

**One honest caveat about exports.** Adits records only the four band levels while it
analyses a track, not the whole spectrum, and the live FFT is unavailable during an
offline render. So in an export `AUDIO_BANDS`, `AUDIO_LEVEL` and the three onset pulses
are *derived* from `AUDIO_BASS` / `AUDIO_MID` / `AUDIO_TREBLE` / `AUDIO_VOL` rather than
measured from the spectrum. They stay smooth, plausible and reproducible run-to-run, but
they are coarser than the live values. A shader whose look depends on fine detail across
individual `AUDIO_BANDS` slots will therefore render slightly differently than it
previewed. Driving structure from the four band levels, `AUDIO_LEVEL` or `AUDIO_BEAT`
avoids this entirely.

### Camera — for 3D shaders

| Name | Type | Meaning |
| --- | --- | --- |
| `CAM_DIR` | `vec3` | Unit vector from the object's centre **toward the viewer**, in the object's own local space. At rest it is `(0, 0, 1)` |
| `CAM_UP` | `vec3` | The viewer's up vector in that same local space. At rest `(0, 1, 0)` |

**Use these instead of a hardcoded orbit.** A raymarching shader that builds its own camera
position from `TIME` renders the same fixed animation no matter where the real camera is, so
moving the real camera only tilts a flat picture of your 3D scene. Driving the ray origin
from `CAM_DIR` instead means orbiting the camera actually orbits your object, and hand
tracking does too, because Adits already moves the camera from the tracked position.

The local space is the object's, not the world's, so `CAM_DIR` also responds to Spin,
Perspective and the other model-transform controls.

The idiomatic camera block becomes a three-line change from the usual Shadertoy pattern:

```glsl
// Before — a self-driven orbit. Ignores the real camera entirely.
float ca = TAU * fract(TIME / PERIOD);
vec3  ro = vec3(6.5 * sin(ca), 1.4 * sin(2.0 * ca), 6.5 * cos(ca));
vec3  ww = normalize(-ro);
vec3  uu = normalize(cross(vec3(0.0, 1.0, 0.0), ww));

// After — the same scene, now genuinely orbitable.
const float ORBIT = 6.5;              // you still choose the distance
vec3  ro = CAM_DIR * ORBIT;           // ray origin follows the viewer
vec3  ww = normalize(-ro);            // still looking at the origin
vec3  uu = normalize(cross(CAM_UP, ww));   // CAM_UP, not a hardcoded (0,1,0)

// unchanged from here on
vec3  vv = cross(ww, uu);
vec3  rd = normalize(uv.x * uu + uv.y * vv + 1.6 * ww);
```

Use `CAM_UP` rather than a literal `vec3(0.0, 1.0, 0.0)` in that cross product. When the
viewer is directly above or below the object, the hardcoded version degenerates to a zero
vector and the frame collapses; `CAM_UP` stays perpendicular and the basis survives.

**One honest limit.** Your object is composited onto a flat plane. `CAM_DIR` makes the
*content* correct for the current viewpoint, but it cannot give that plane thickness — at a
glancing angle the image foreshortens, and viewed exactly edge-on there is nothing to see.
Design for viewing angles within roughly 60° of face-on.

### Gesture

| Name | Type | Meaning |
| --- | --- | --- |
| `TRACK` | `vec3` | Tracked hand or face position. `x` and `y` are −1 … 1 with **+y pointing down**; `z` is −1 (far) … 1 (near). Eases toward zero when tracking is lost |
| `TRACK_ON` | `float` | `1.0` while a subject is tracked, `0.0` otherwise |
| `HAND_OPEN` | `float` | `0.0` closed fist … `1.0` open palm. `-1.0` when unavailable |

`TRACK` and `TRACK_ON` are **free to read whenever tracking is running** — the anamorphic
camera already computes that tracking every frame to drive its own projection, so a shader
adds no cost by reading it. The one case where it is not running is **Tracking Mode: None**,
which opens no webcam at all; there `TRACK` stays at the origin and `TRACK_ON` stays `0.0`.
A shader arriving through a gallery deep link starts in that state, so treat gesture as an
enhancement the viewer opts into, never as the thing that makes the object work.

`HAND_OPEN` is **self-arming**: Adits measures finger extension only when the loaded shader
actually asks for it, either by binding an input to `gesture.open` or by referencing
`HAND_OPEN` in its source. There is no toggle to switch on. It still needs hand landmarks to
be available, which means Tracking Mode set to **Hands** (or Face with the holistic tracker);
otherwise it reads `-1.0`.

Two rules that matter more than they look:

- **Always guard on `TRACK_ON`.** When tracking is lost, `TRACK` *eases* toward zero over
  roughly twenty frames while `TRACK_ON` drops to `0.0` immediately. So fade your response
  on `TRACK_ON` rather than treating it as a hard switch, or the object will keep drifting
  for a third of a second after the hand leaves.
- **Treat `HAND_OPEN < 0.0` as "no signal", never as a fist.** `0.0` is a real reading — a
  fully closed hand — so `-1.0` is the only safe test for absence.

### Legacy aliases

For compatibility with shaders written against other tools, an input literally named `u_time` or
`u_resolution` is auto-driven from `TIME` and `RENDERSIZE` instead of getting a slider. This is a
fallback, not part of the profile. Adits-profile shaders should use `TIME` and `RENDERSIZE`.

---

## 6. Audio and gesture binding

Two mechanisms, both available.

**Reserved uniforms** (§5) are the direct route. Read `AUDIO_BASS` wherever you want it. Nothing
to declare. The user gets no control over how strongly it applies.

**`BIND` on a declared input** is the controllable route. Adits drives that uniform from the named
source, the panel shows it as a live meter next to its slider, and the user gets a depth control.
Prefer this for anything the user might want to dial back.

### Bind sources

**Audio:** `bass` · `mid` · `treble` · `vol` · `level` · `beat` · `kick` · `snare` · `hat`

**Gesture:** `gesture.x` · `gesture.y` · `gesture.z` · `gesture.open`

**Spell these exactly.** The gallery validator rejects an unknown source by name, but Adits'
loader resolves one to a constant `0`, so a typo there produces a control that looks normal,
sits on its panel value, and never moves. There is no message. `"BIND": "treb"` is the kind
of mistake that costs an hour.

BIND drive is **unipolar** — the panel value is a floor and the source only ever pushes away
from it — so the gesture axes are rectified to fit that:

| Source | Mapping | Rest value |
| --- | --- | --- |
| `gesture.x` / `gesture.y` | `abs(axis)`, so either direction drives | centre = `0` |
| `gesture.z` | `−1…1` remapped to `0…1` | far = `0`, near = `1` |
| `gesture.open` | `HAND_OPEN` passed through | fist = `0`, palm = `1` |

If you need a **signed** axis, read `TRACK` directly instead of binding — a bind cannot
express direction.

All four return `0` while nothing is tracked, so a gesture-bound input rests exactly on its
panel value the moment tracking drops. That matters most for `gesture.z`, whose rest position
is mid-range: without the tracking guard a lost hand would inject a permanent half-strength
push.

### How a bind is applied

The panel slider is the **floor**, not the centre. The bind pushes away from it toward `MAX`:

```
depth ≥ 0 :  value = panel + (MAX - panel) × depth × source
depth < 0 :  value = panel + (panel - MIN) × depth × source
```

Two consequences the generator should rely on:

- At silence, or with no tracking, `source` is `0`, so the uniform sits exactly at the panel value,
  which starts at `DEFAULT`. **This is why `DEFAULT` must be a value the object looks good at.**
- The value can never leave `MIN … MAX`, so a bind cannot break a shader that respects its own
  declared bounds.

A negative `BIND_DEPTH` inverts the drive, pushing toward `MIN` instead. Useful for making
something contract on a beat.

`BIND` is only honoured on `float` and `long` inputs. On other types it is ignored.

---

## 7. GLSL contract

Adits compiles **GLSL ES 1.00**. The shader body must obey all of the following.

**Must:**

- Write the result to `gl_FragColor`.
- Contain exactly one `void main()`.

**Must not:**

- Write a `#version` directive.
- Declare `precision`. Adits injects `precision highp float;`. A guarded
  `#ifdef GL_ES precision highp float; #endif` is tolerated but pointless.
- Use `in`, `out`, `flat`, or `centroid` qualifiers, or the GLSL 3.00 `texture()` form.
- Read back `gl_FragColor`. It is write-only.
- Declare a uniform that is already declared in `INPUTS` or reserved in §5.
- Use `dFdx`, `dFdy`, or `fwidth`. They depend on an extension that is not guaranteed here.
- Declare any sampler. There are no textures in version 1.

Adits' loader checks the `#version`, sampler, derivative, single-`main`, and
`gl_FragColor` rules itself. The `precision` rule and the GLSL 3.00 qualifier rule are
**gallery-only**: break either one and Adits will hand the source straight to the driver.
A stray `precision` line is harmless, a stray `in`/`out` declaration is a compile error that
surfaces only in the browser console (see §15.3).

### The canonical preamble

Start `main()` with this. It is aspect-correct and resolution-independent, both of which are
mandatory because `RENDERSIZE` changes at runtime.

```glsl
vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
```

Dividing by `.y` rather than `.x` keeps vertical framing stable, which is what the anamorphic
camera wants. Never hard-code a pixel dimension, and never write anything that assumes a
particular `RENDERSIZE`. A shader whose object changes size when the Resolution control moves is
broken even though it compiles.

---

## 8. Alpha — the rule that decides whether it looks right

This is the most important section in the document. Get it wrong and the shader composites as an
opaque rectangle hanging in mid-air instead of a floating object.

### The rule

**Draw the object against transparent black. Write premultiplied alpha.**

```glsl
float alpha = clamp(coverage, 0.0, 1.0);
col *= alpha;                        // premultiply
gl_FragColor = vec4(col, alpha);
```

Anywhere the object is not, `alpha` must be `0.0` and `col` must be `vec3(0.0)`.

### Do not draw

- Full-frame gradients or sky washes.
- Starfields.
- Vignettes.
- Fog or haze that fills the frame rather than pooling around the object.
- A tone-mapped background. Tone-map the object only, and only where it is opaque.
- Anything at all outside the object's silhouette.

Every one of these is fine in a standalone shader and fatal here, because the live footage is what
belongs behind the object.

### Coverage budget

The object **should** cover less than roughly a third of the frame. Above that, the footage stops
reading and the composite looks like a full-screen effect rather than an object in the world.
Bounded glows are the tool for this: multiply a `1/r²` falloff by a `smoothstep` that reaches zero
by about `0.48`, inside the visible edge at `0.5` (§10), so the glow cannot creep to the border.

### The pattern, and the two ways it fails

Shape the coverage, premultiply, then write:

```glsl
alpha = smoothstep(0.015, 1.1, alpha);
alpha = clamp(alpha, 0.0, 1.0) * u_alpha;
col *= alpha;
gl_FragColor = vec4(col, alpha);
```

The first failure is the constant write, which rule 22 rejects:

```glsl
gl_FragColor = vec4(col, 1.0);
```

The second is subtler and passes every static check. The write itself is correct, but an
earlier line raises `alpha` with no spatial term in it:

```glsl
col   += spark(p, nodePos, sCol, pop);   // localised by a distance falloff
alpha += pop * 0.22;                     // not localised: the same at every pixel
```

Colour stays confined to the blob, coverage does not. A few of those inside a loop lift alpha
to 1.0 across the whole frame, and the object composites as a veil with the footage hidden
behind it. Weight every alpha contribution by the same falloff its colour already uses. Rule
21b catches the obvious shape of this; the rest only shows up by measuring the rendered
buffer, which is why the coverage budget above is a rule and not a suggestion.

### What Adits does when you get this wrong

Adits detects a hard-coded opaque write and switches the panel's **Background** control from
*Keep* to **Luma Key** automatically, so the shader composites as an object rather than a
rectangle without the user having to find the control. Four modes are available:

| Mode | Derives coverage from | Use when |
| --- | --- | --- |
| **Keep** | the shader's own alpha | the shader follows §8. This is the target |
| **Luma Key** | Rec.709 luminance | the object is bright against a dark background |
| **Black Key** | the brightest channel | the object contains deep saturated colours that a luma key would erase |
| **Chroma Key** | distance from a picked colour | the background is a flat, distinctive colour |

Keying is a **rescue, not a target**. It cannot distinguish the object's own dark regions
from the background, so a luma key eats shadow detail and thins soft edges. A key also
*refines* existing alpha rather than replacing it, so it composes with a shader that already
has partial transparency.

Write correct alpha and none of this applies.

---

## 9. Performance rules

The user cannot fix a slow shader. Cost is the generator's responsibility.

**Design target: the whole pass under about 2 ms at 512 × 512 on integrated graphics.** That is a
design target, not a measured guarantee, and it is deliberately conservative because the shader
shares a frame with video decoding, MediaPipe tracking, and the rest of the 3D scene.

### Hard rules

- **Loop bounds must be compile-time constants.** No loop bounded by a uniform, so that cost
  cannot vary with a slider or with audio.
- **Total inner-loop iterations must stay under 200**, counting nesting multiplicatively.
- **No recursion**, which GLSL does not permit anyway.

Every rule in this section is **gallery-enforced only**. Adits' loader does not parse loops
at all: a uniform-bounded loop, a 4000-iteration nest, and a `while` loop all compile and
run. So nothing stops a slow shader from reaching a user except the generator getting this
right. Treat the numbers as hard limits even though only the merge gate checks them.

### Raymarching

- **64 steps is the budget. 96 is the hard ceiling.** Count the normal against that budget as
  well: a 140-step march is already over it before a single normal is taken, and a 6-tap
  normal on top multiplies the overrun.
- **Use a 4-tap tetrahedral normal**, not the 6-tap central difference. The 6-tap form calls the
  distance function six extra times per hit:

  ```glsl
  // 4 taps instead of 6
  vec3 calcNormal(vec3 p) {
      const vec2 k = vec2(1.0, -1.0);
      float e = 0.0012;
      return normalize(k.xyy * map(p + k.xyy * e) +
                       k.yyx * map(p + k.yyx * e) +
                       k.yxy * map(p + k.yxy * e) +
                       k.xxx * map(p + k.xxx * e));
  }
  ```

- Bound the march with an analytic sphere intersection before entering the loop, so rays that miss
  the object cost one quadratic instead of 64 evaluations.
- Solve analytically wherever possible. Four concentric dot shells are four quadratics rather
  than extra marching, and a sphere, plane or torus each have a closed form too. March only the
  parts that genuinely need it.

### Cheaper habits

- Hoist everything loop-invariant out of the loop.
- Prefer `smoothstep` over `if` for masks.
- Cheap early-outs around cheap bodies are fine. Wrapping a raymarch in a per-pixel branch is not,
  because divergent branches around expensive work cost the sum, not the maximum.
- For small integer powers, multiply instead of calling `pow`. Reserve `pow` with a large exponent
  for code that runs once per pixel, never inside a loop.
- Avoid `atan` inside loops. Compute the angle once.

Then **declare `COST` honestly.** A shader with no loops is `low`. A shader with a 64-step march
and a 4-tap normal is `high`.

---

## 10. Composition for the anamorphic look

The shader is not seen flat and head-on. Design accordingly.

- **Centre the object at the origin** of the `uv` space from §7, and **size it to `0.5`, not to
  `0.75`.** Two different numbers bound an object here, and only the smaller one keeps it on
  screen:

  | Radius | What it bounds |
  | --- | --- |
  | `0.5` on the axes, `0.707` at the corners | The visible frame. With the §7 preamble on a square render, `uv` spans `-0.5 … 0.5`, so anything past `0.5` horizontally or vertically is cut by a straight line at the frame edge |
  | `0.75` | The composite plane. Past this the object leaves the plane entirely and Adits' automatic framing has nothing to work with |

  So keep the silhouette inside about `0.46`, and have every bounding `smoothstep` reach zero by
  about `0.48`, so glows fade out instead of being sliced. Then check the largest value a slider
  or a bind can reach, `panel + (MAX - panel) × depth`, not just the `DEFAULT`, and confirm the
  object still fits there. Lower a `MAX` rather than shipping a range whose upper half clips.
  `npm run render` measures this as `edge`, which must read `0`.
- **Design square** unless there is a real reason not to, and declare `"ASPECT": "square"`.
- **Expect to be viewed off-axis.** The plane tilts with the anamorphic camera. Compositions that
  only read from dead centre fall apart.
- **Expect to be wrapped.** The same texture may be mapped onto a photo cube, wind-blown cloth,
  folded lenticular ridges, or a grid of physics voxels. Fine detail survives that; a composition
  built on precise screen-space alignment does not.
- **Do not bake a camera-matched key light.** A fixed highlight that reads as chrome head-on reads
  as a smudge once the plane rotates. Radially symmetric or animated lighting travels better.
- **Go bright and saturated.** The object sits over footage that is often dark and busy. Emissive,
  high-contrast, additive-looking designs read; mid-grey shading disappears.
- **Keep base rates slow.** The host's Audio Drive (§5) multiplies the clock by up to 10× on
  loud material. A rotation that already looks lively at 1× becomes a strobe at 10×. Tune
  every rate to read as slow and hypnotic at 1×, and let the music supply the fury.
- **Seamless Continuous Looping.** If the design cycles, declare `LOOP` in seconds and derive
  every animated quantity from a canonical phase that wraps at that period:

  ```glsl
  #define PERIOD 16.0
  float ph = fract(TIME / PERIOD);
  float phase = ph * TAU;
  ```

  **Strict Integer Harmonic Multipliers ($k \in \mathbb{Z}$):** Every rotation rate, wobble,
  breathing oscillation, orbital precession, fractal morphing phase, and trigonometric argument
  must be an exact integer multiple of `phase` (e.g. `sin(phase * 1.0)`, `rotZ(phase * 2.0)`).
  Fractional multipliers (such as `phase * 1.5` or `phase * 0.125`) fail to complete a full $2\pi$
  cycle at the loop boundary, creating an unsightly visual jump, pop, or seam when the animation
  wraps from $t = \text{PERIOD}$ back to $t = 0$. The start frame ($t = 0$) and end frame
  ($t = \text{PERIOD}$) must look 100% identical so the object loops indefinitely and seamlessly.

---

## 11. Audio reactivity rules

Audio reactivity is the point of the profile, not a garnish. A gallery shader must be
**fully audio reactive**, and the minimum bar is concrete: three or four bound inputs with
a distinct structural role per band (rule 2), at least one onset pulse read directly in the
body (rule 5), and a driven frame a viewer can tell from the silence frame at a glance —
in form, reach, or light, not merely in brightness. The host's clock flywheel (rule 7)
supplies pace on top of these, never instead of them.

Rules 1 to 8 are the bar. Rules 9 to 13 are how to clear it so the result looks smooth and
true to the music rather than busy: the difference between an object that moves *with* a
track and one that twitches *at* it.

1. **Bind three or four inputs, not ten.** Past that it reads as noise rather than rhythm.
2. **Give each band a distinct structural role.** A useful default mapping:

   | Source | Drives |
   | --- | --- |
   | `bass` | Overall scale, swell, thickness |
   | `mid` | Deformation depth, warp, twist amount (not rotation *speed*: rules 7 and 10) |
   | `treble` | Fine detail, edge sharpness, sparkle density |
   | `beat` / `kick` | A one-shot snap, flash, or recoil |

3. **Never bind audio to anything that changes cost.** Step counts, iteration counts, and the
   number of objects must stay constant. Bind amplitude, not topology.
4. **Do not smooth over time.** Adits already applies a frame-rate-independent envelope. A
   shader has no frame-to-frame memory, so any attempt at temporal smoothing inside the shader
   is either impossible or a hidden dependence on frame rate. Shaping the *current* value with
   a curve (rule 9) is not smoothing, and is expected.
5. **Use the onset pulses directly as multipliers.** `AUDIO_BEAT` already decays. Multiply by it,
   or `mix` with it. Do not integrate it, and do not try to detect edges from it.
6. **Silence must look good.** Every audio-bound uniform sits exactly at its `DEFAULT` when there
   is no audio, and the object must be still, complete, and attractive in that state. Test at
   silence before testing with music. Most shaders that "only look right with the beat" are shaders
   whose `DEFAULT` values were never considered.
7. **The host owns tempo.** Both hosts scale how fast `TIME` advances with an audio-momentum
   flywheel (§5, "Speed"), so any motion derived from `TIME` is already audio reactive before
   the shader does anything. Use the audio uniforms for what the clock cannot express — form,
   colour, brightness, onset snaps — and let the host set the pace. Do not fight it by
   dividing a rate by an audio level.
8. **Prove it.** Render the same `--time` at `--audio 0` and `--audio 0.85` and put the two
   frames side by side. If which is which is not obvious at a glance, the shader has failed
   this section, whatever the validator says.

### Smooth, and true to the music

A fragment shader cannot remember the last frame, so every bit of smoothness it adds has to
come from how it maps *this* frame's value to the picture. These five rules are that mapping.
None of them adds a millisecond of lag: they all act on the value the host hands over, at the
host's envelope speed.

9. **Shape the value with a soft knee, not a hard edge.** Real material never sits at exactly
   `0.0`. A band idles a few hundredths above it, and that idle wobbles. Fed straight into the
   picture, the wobble is a visible shimmer in quiet passages. Fed into a `clamp` or a `step`,
   it is a flicker. Pass every band through a `smoothstep` with a small floor and a ceiling
   just under 1:

   ```glsl
   float lo = smoothstep(0.04, 0.95, AUDIO_BASS);    // floor kills the idle shimmer,
   float hi = smoothstep(0.04, 0.95, AUDIO_TREBLE);  // ceiling stops the slam at 1.0
   ```

   The floor is a starting point, not a constant: raise it if the silence frame still breathes,
   lower it if soft passages go dead. Then apply the shaped value multiplicatively, so silence
   lands exactly on the declared default:

   ```glsl
   float reach = baseReach * (1.0 + 0.6 * lo);       // silence: reach == baseReach
   ```

   For anything the eye reads as light, a power below one keeps quiet passages visible,
   `pow(hi, 0.7)` for example. For anything read as size, a power near one keeps it honest.
   Stay between about 0.6 and 1.5. Higher exponents, and gates like `smoothstep(0.6, 1.0, x)`,
   leave the object dead until a peak, which is the "only reacts to hits" look.

10. **Audio drives amplitude, never phase or position.** `sin(TIME + k * AUDIO_BASS)` rocks the
    object forward and back every time the band rises and falls, and a band rises and falls
    on every note. This is the single most common cause of a shader that looks jittery even
    though every value it reads is already smoothed. Put the audio on the *size* of a motion,
    not on where in the cycle it is:

    ```glsl
    float wob = sin(TIME * 1.3) * (0.05 + 0.12 * lo);  // right: bass sets how far
    // float wob = sin(TIME * 1.3 + 4.0 * lo);         // wrong: bass sets where, and it rocks
    ```

    The same applies to a coordinate offset (`uv += band * dir`), a rotation angle, and a hue
    angle, all of which make the whole object slide, spin back and forth, or cycle colour on
    every note. A small one-directional hue shift by a band is fine. The one exception is a
    recoil on an onset: a small offset scaled by `AUDIO_KICK` returns to zero on its own along
    a monotone curve, so it reads as a hit, not a rock.

11. **Keep audio away from discontinuities.** `floor`, `step`, `mod` wraps and `if` thresholds
    turn a band hovering near the threshold into a value that flips every frame. If an audio
    value has to choose between discrete states, make the choice through a `smoothstep` at
    least about `0.1` wide, and blend the two states rather than switching them. §12.6 is this
    rule applied to the morph selector.

12. **Use each signal once, and match its speed to the size of what it moves.** Bands settle over
    roughly 140 ms, so they suit large slow quantities: reach, scale, thickness, hue. Onsets
    are back near zero within a third of a second, so they suit small fast ones: a flash, an
    edge highlight, a short recoil. An onset on the whole silhouette's scale looks twitchy. A
    band on a flash looks late. Two ways of doubling a signal by accident, both of which make
    the response `x²`, dead below half level and exaggerated above it:

    - a `BIND` on an input *and* a multiply by the same band in the body;
    - `AUDIO_BEAT` and `AUDIO_KICK` on the same quantity. They fire together on every kick.

13. **Near-linear through the middle.** True to the music means a half-loud passage produces
    about half the visual change, not none. After the soft knee in rule 9, keep the mapping
    close to a straight line across `0.2 … 0.8`. Use `AUDIO_LEVEL` for overall energy, since
    its gain control makes a quiet master move as much as a loud one, and `AUDIO_VOL` only when
    the user's own sensitivity slider *should* be the thing in charge. If the two-frame test in
    rule 8 passes at `--audio 0.85` but a render at `--audio 0.4` looks like silence, the curve
    is too steep.

---

## 12. The morph style

Every other section in this document assumes one object that breathes. A **morph** object is
three to five *distinct* objects in one file, and the spectrum decides which one is on screen.
A kick puts a heavy black bulb in the frame; a hi-hat run replaces it with a needle nova. The
object's identity is a property of the music, not of the clock.

Shaders built this way **must** declare `"morph"` in `CATEGORIES`. That is the one reserved
value in an otherwise free-form list, and it is what lets a gallery group them and warn a user
that this object will not hold still.

**The morph style is the house standard.** The whole corpus is built this way as of
2026-08. New gallery shaders should be morphs unless the concept genuinely cannot support
distinct archetypes — a single continuous field with no parts can qualify — and a
non-morph submission should say why in its pull request.

### 12.1 The four parts

| Part | Rule |
| --- | --- |
| **Archetypes** | Three to five. Each **must** be a complete object on its own: its own silhouette, palette and surface treatment. Two archetypes that share a silhouette make the morph invisible, and past five nothing reads before it is replaced |
| **Selector** | One scalar, `0 … 1`. It **must** come from the *shape* of the spectrum, never from `TIME` |
| **Weights** | One per archetype, summing to 1, from a kernel narrow enough to leave each archetype a plateau, so the object spends most of its time as a clean archetype rather than mid-blend. §12.6 sets the width and the shape |
| **Shared parameters** | At least one continuous quantity every archetype reads — overall reach, hub size — so the envelope keeps sliding even during a blend |

### 12.2 The selector is spectral, not loud

Loudness tells you how hard to hit the object. **Balance** tells you which object it is. Take
the tilt of the three band levels:

```glsl
float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
float sum = lo + md + hi + 1e-3;
float tilt = (md * 0.5 + hi) / sum;      // 0 = all bass, 1 = all treble
```

Drive it from the **four recorded band levels**, not from individual `AUDIO_BANDS` slots. The
export caveat in §5 matters more here than anywhere else in the profile: `AUDIO_BANDS` is
*derived* rather than measured during an offline render, so a selector keyed to fine spectrum
detail will choose different archetypes in the export than it did in the preview. That is not
a slightly different look, it is a different object. `AUDIO_BASS` / `AUDIO_MID` /
`AUDIO_TREBLE` / `AUDIO_VOL` are recorded, and reproduce exactly.

### 12.3 Sensitive: expand the range, and default the gain high

`tilt` is a ratio of three smoothed averages, so it swings far less than any one band does —
on real material it sits in a narrow window near the middle instead of sweeping `0 … 1`. Left
raw, the object never reaches its outer archetypes and the style fails silently: it looks like
a one-archetype shader with dead code in it. Expand around the rest point, then **saturate
softly**:

```glsl
float sel = smoothstep(0.0, 1.0, (tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5);
```

`smoothstep(0.0, 1.0, x)` pins the ends at `0` and `1` exactly as `clamp` does, but it arrives
with zero slope. With `clamp`, a passage that pins one band leaves the raw value bouncing on
the boundary, and every bounce is a visible nudge of the outer archetype. With the eased
form the same bounce moves the selector by almost nothing. Through the middle its slope is
1.5× the linear form, so for the same gain the object crosses between its central archetypes
faster. Smoother at the edges and faster through the middle, from one function. The `clamp`
form still validates, but new shaders should use this one.

Expose the gain as an input so a user can back it off on very dynamic material, and **set its
`DEFAULT` toward the top of its range.** A morph object that needs an unusually bright or
unusually bass-heavy passage before it changes has failed at the one thing it exists to do.

### 12.4 Fast: add no lag of your own

The attack is the host's. Adits already applies a frame-rate-independent envelope to every
audio uniform, and §11.4 forbids smoothing on top of it, so **speed in this style is entirely
a matter of what you do not do:**

- No `smoothstep` or `mix` of the selector across a `TIME` window.
- No `floor(TIME * rate)` quantisation, which replaces the music's timing with the shader's own
  and turns a morph into a slideshow.
- No easing from the previous frame's archetype. It is impossible anyway — a fragment shader
  has no memory between frames — and every attempt at it is a hidden frame-rate dependency.

Then **use the onset pulses to shove the selector**, because they are the fastest signals the
profile offers: a band needs its attack to arrive and its release to leave, an onset is at 1
on the frame of the hit. Each end of the spectrum has one. Add the shove *before* the soft
saturation from §12.3, so a hard hit eases onto the outer archetype instead of slamming into
a clamp:

```glsl
float x = (tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5;
// AUDIO_HAT and AUDIO_KICK already decay. Used straight they snap the object onto an
// archetype at the transient and let it fall back over roughly a third of a second.
x += snap * (AUDIO_HAT - AUDIO_KICK);
float sel = smoothstep(0.0, 1.0, x);
```

Two limits keep the shove a change rather than a glitch:

- **Order the archetypes to agree with the shove.** The bass-heavy archetype belongs at
  `sel = 0` and the brightest at `sel = 1`, so a hat pushes the same way a treble-heavy
  balance leans. If they disagree, every hat drags the object against the tilt and it
  jitters at the boundary instead of crossing it.
- **Bound the shove to about one archetype's spacing.** That is `1 / (N - 1)` of the axis,
  a third of it for four archetypes, so `snap` at its `MAX` should move `x` by about that
  much and no more. A shove that throws the object across two archetypes in one frame skips
  a shape the viewer never sees. It is also where the export caveat bites hardest: in an
  offline render the onsets are derived from the recorded bands and are coarser, so an
  oversized shove is the part of a morph most likely to render differently from its preview.

The host's Audio Drive flywheel (§5) scales the *clock*, never the selector: the morph's
timing comes from the audio uniforms directly, at full host-envelope speed, even while the
clock idles.

**Design target: a visible change of identity within about 150 ms of the transient that caused
it.** Like the 2 ms cost target in §9 that is a design target rather than a measured guarantee,
because the envelope's attack belongs to the host and not to the shader. What the shader owns
is the gain in §12.3 and the absence of any lag of its own.

### 12.5 Cost cannot move with the selector

§11.3 still holds, and it bites hardest here: **every archetype is evaluated every frame,
including the ones weighted to zero.** You cannot branch past them, because a divergent branch
around real work costs the sum and not the maximum (§9), and you cannot loop over "the active
one", because loop bounds must be compile-time constants.

Two consequences:

- Budget for the **sum** of the archetypes and declare `COST` on that basis. A morph shader is
  usually one tier more expensive than any single archetype in it, and declaring otherwise is
  the failure §3 warns about.
- Prefer archetypes built from **one primitive with different parameters** over three unrelated
  bodies. A parameterised angular-cell field, a plate frequency and a width profile can be a
  fat lobed bulb, a plated rotor and a needle nova at three settings, which costs one evaluation
  instead of three. Reach for separate evaluations only when the silhouettes genuinely cannot
  come from the same field.

### 12.6 Blend geometry, not just alpha

Cross-fading two archetypes' coverage shows both of them at half alpha, which reads as a double
exposure rather than as a change. The blend has to be a shape of its own, and it has to be
*fast* without being *abrupt*. Four things do that, and the first decides how much room you
have for the other three.

- **Morph parameters, not pictures.** Build every archetype from one primitive and interpolate
  its numbers with the weights (length, width, taper, rib pitch, palette), so a 50/50 weight is
  a real intermediate object and not two bodies at half alpha. This is what buys a crossfade
  wide enough to look smooth. A parameter-space morph can afford a kernel slope near `1.5`,
  where neighbours overlap over a third of their spacing. Separate bodies cross-faded by alpha
  need a slope near `1.85` (an overlap of about `0.08`) to avoid the double exposure, and at
  that width the change reads as a flip. Reach for separate evaluations only when the
  silhouettes genuinely cannot come from the same field (§12.5).
- **A smooth kernel, not a triangle.** The corpus's `max(1.0 - abs(x - i) * slope, 0.0)`
  weights are linear inside the overlap and switch on with a kink at its edge, so every
  interpolated parameter changes rate abruptly as a transition starts and ends. Rounding the
  kernel removes the kink, at no cost and with no lag, because it acts on the selector and not
  on time:

  ```glsl
  // N archetypes at x = 0 … N-1. Same support as the triangle, so the sum is never zero
  // while slope < 2.0, but each weight now rises and falls with zero slope at its edges.
  float w0 = smoothstep(0.0, 1.0, 1.0 - abs(x      ) * slope);
  float w1 = smoothstep(0.0, 1.0, 1.0 - abs(x - 1.0) * slope);
  float w2 = smoothstep(0.0, 1.0, 1.0 - abs(x - 2.0) * slope);
  float w3 = smoothstep(0.0, 1.0, 1.0 - abs(x - 3.0) * slope);
  float ws = w0 + w1 + w2 + w3;
  w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;
  ```

  Normalisation is what makes the plateaus: wherever only one weight is non-zero it is
  exactly `1` whatever the kernel's shape, so the shape only matters inside the overlap,
  which is exactly where the kink was.
- **Stagger the change across the object.** Give every element (spine, petal, plate, cell) its
  own small, *static* offset on the selector axis, from a hash of its index or from its
  position, so a boundary crossing sweeps across the object over a few frames instead of
  flipping the whole thing at once:

  ```glsl
  float x = sel * 3.0 + stagger * (hash11(id) - 0.5);   // ± half a stagger per element
  x = clamp(x, 0.0, 3.0);
  ```

  This is how a morph is smooth and fast at the same time: each element still snaps at the
  host's speed, and the object as a whole turns over as a wave. The offset **must** be static.
  At a fixed spectrum the object has to hold still, and an offset that moves with `TIME` is
  the slideshow §12.8 rejects. Keep `stagger` under about one archetype's spacing, or the
  outer elements are always a form behind. The corpus uses a cosine of the element index for a
  sweep that stays continuous where a ring wraps, plus a small hash so the sweep is not
  mechanical.
- **Shared parameters and a shared core.** Interpolate reach and hub size continuously across
  the whole selector range, so even mid-blend the silhouette's envelope is visibly moving, and
  give every archetype the same nucleus so the centre of the frame never thins out to nothing
  as one body becomes another.

### 12.7 Silence still has to look finished

§11.6 applies unchanged and it is easy to fail here. At silence every audio uniform is `0.0`,
so `tilt` lands wherever the arithmetic puts `0 / 0` — usually at an extreme, and usually on
whichever archetype you happened to place there. **Choose the resting archetype deliberately**
and fade into the live selector:

```glsl
float live = smoothstep(0.02, 0.12, lo + md + hi);
sel = mix(bias, sel, live);       // "bias" is a declared input: the silence archetype
```

On a very quiet master `lo + md + hi` can hover inside that window for whole passages, and
the object then drifts between its resting form and the live one on nothing the listener can
hear. Gating on `max(lo + md + hi, AUDIO_LEVEL)` keeps the live selector in charge there,
since `AUDIO_LEVEL`'s gain control lifts quiet material, and it still falls to `0.0` in true
silence.

Pick a resting archetype that reads over footage on its own, name it in `DESCRIPTION`, and
judge that state first. A morph shader whose silence state is its near-black archetype is a
shader that looks broken until the music starts.

### 12.8 Anti-patterns

Rejected on sight, in addition to the anti-taste the gallery is curated against:

- A selector driven from `TIME` with audio only nudging it. That is a slideshow, not a morph.
- Archetypes that differ only in colour. Change the silhouette or it is a palette control.
- More than five archetypes, or a kernel wide enough that two are always mixed.
- A per-element stagger that moves with `TIME`. That is the slideshow again, one element at
  a time.
- An onset shove wide enough to cross two archetypes in one frame.
- `COST` declared for one archetype when three are evaluated.

### 12.9 What is not checked

None of this is machine-checkable, and the guide should not pretend otherwise. Nothing in a
shader's source announces that its object changes identity, so a validator cannot tell a morph
shader from an ordinary one, cannot count archetypes, and cannot confirm that `"morph"` is
present when it should be. Appendix B therefore carries no rule for this section. The mechanical
rules a future validator could reasonably add are narrow ones — that a file tagged `"morph"`
references at least two distinct `AUDIO_*` band uniforms, that it does not wrap an audio
uniform in a `TIME`-windowed `smoothstep`, and that no `AUDIO_*` token sits inside the
argument of `sin`, `cos`, `floor` or `step` (§11.10, §11.11) — and none of these is
implemented today. Until then the
whole of §12 is on the author.

---

## 13. Pre-flight checklist

Run all of these before emitting a file.

**Header**

1. `/*{` is the first non-whitespace content.
2. The block parses as JSON, with no trailing commas.
3. `ADITS` is `1`, and `DESCRIPTION` is a non-empty string.
4. `DATE` is the authoring day as `YYYY-MM-DD`, and is left untouched on any later edit.
5. `COST` reflects the actual body, judged against §9.
6. If the design cycles, `LOOP` is present and the phase wraps at exactly that period.

**Inputs**

7. Every `NAME` is a valid GLSL identifier, is unique, does not start with `gl_`, and does not
   appear in §5 or in the `MEDIA` reservation.
8. Every `float` and `long` has `MIN` < `MAX`, and `MIN` ≤ `DEFAULT` ≤ `MAX`.
9. No input is also declared in the body.
10. `BIND` appears only on `float` and `long`, and only names a source from §6.
11. At most six numeric, two boolean, and two colour inputs, counting `point2D` as two numeric.

**Body**

12. No `#version`, no `precision` declaration, no `in`/`out`, no sampler, no `dFdx`/`dFdy`/`fwidth`.
13. Exactly one `void main()`, and `gl_FragColor` is written but never read.
14. Every loop bound is a literal constant, and the multiplied total is under 200.
15. If it raymarches: 96 steps or fewer, and normals use 4 taps.
16. Coordinates come from the §7 preamble; no hard-coded pixel dimension appears anywhere.

**Alpha and composition**

17. Alpha is premultiplied, and is `0.0` everywhere the object is not.
18. No full-frame gradient, starfield, vignette, or fog.
19. Every glow is bounded by a `smoothstep` that reaches zero by about `0.48`, inside the
    visible frame edge at `0.5`.
20. The silhouette stays inside about `0.46` at every reachable slider and bind value, the
    object covers under about a third of the frame, and `render` reports `edge` as `0`.
21. At every audio uniform set to `0.0`, the object is still and looks finished.
21b. A silence render and a driven render (`--audio 0` vs `--audio 0.85`, same `--time`)
    differ at a glance — in form, reach, or light, not merely in brightness.
21c. Every base rate reads as slow at 1×; the host clock can run at 10× (§5, §10).
21d. No audio uniform, and no `BIND`ed input, appears inside the argument of a periodic
    function, a `floor`, a `step`, or a coordinate offset. Audio scales amplitude (§11.10,
    §11.11).
21e. Every band read in the body passes through a soft knee (`smoothstep` with a small floor)
    and is applied multiplicatively, so silence lands exactly on the default (§11.9).
21f. No signal is used twice on one quantity: no `BIND` plus a body multiply by the same band,
    and not `AUDIO_BEAT` and `AUDIO_KICK` together (§11.12).

**Morph, only if `"morph"` is declared (§12)**

22. Three to five archetypes, each with its own silhouette, not just its own colour.
23. The selector comes from the balance of `AUDIO_BASS` / `AUDIO_MID` / `AUDIO_TREBLE`,
    never from `TIME`, and never from individual `AUDIO_BANDS` slots.
24. The selector gain is a declared input whose `DEFAULT` sits toward the top of its range.
25. No `TIME`-windowed easing anywhere on the selector path, and at least one onset pulse
    shoves it.
25b. The selector saturates through `smoothstep(0.0, 1.0, x)` with the onset shove added
    before it, and the shove at `MAX` moves the selector by no more than about one
    archetype's spacing (§12.3, §12.4).
25c. Archetypes run from bass-heavy at `0` to brightest at `1`, so the shove and the tilt
    agree (§12.4).
25d. Weights come from a smooth kernel, and the per-element stagger is static (§12.6).
26. `COST` is budgeted for the sum of every archetype, since all of them evaluate every frame.
27. The resting archetype is chosen deliberately, named in `DESCRIPTION`, and judged first.

---

## 14. Worked example

Complete, conformant, and cheap. Every rule above is visible in it.

```glsl
/*{
  "ADITS": 1,
  "DESCRIPTION": "Six-petal bloom with three orbiting sparks. Bass swells the bloom, treble sharpens the petal edges, and the sparks flare on each beat.",
  "CREDIT": "Adits Shader Guide",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "bloom", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 8.0,
  "INPUTS": [
    { "NAME": "petals", "TYPE": "float", "DEFAULT": 6.0,  "MIN": 3.0,  "MAX": 12.0,
      "LABEL": "Petals" },
    { "NAME": "bloom",  "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.15, "MAX": 0.70,
      "LABEL": "Bloom Size", "BIND": "bass", "BIND_DEPTH": 0.5 },
    { "NAME": "edge",   "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Edge Sharpness", "BIND": "treble", "BIND_DEPTH": 0.7 },
    { "NAME": "tint",   "TYPE": "color", "DEFAULT": [0.35, 1.00, 0.45, 1.00],
      "LABEL": "Tint" }
  ]
}*/

#define TAU 6.28318530718

void main() {
    // §7 canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Phase wraps exactly at LOOP = 8 s, so the object loops seamlessly.
    float t = TIME * (TAU / 8.0);

    float r = length(uv);
    float a = atan(uv.y, uv.x);          // computed once, never in a loop

    // Petal field. No loops, no raymarch — this is why COST is "low".
    float lobe = pow(abs(cos(a * petals * 0.5 + t)), 1.0 / max(edge, 0.05));
    float rim  = bloom * (0.55 + 0.45 * lobe);
    float body = smoothstep(0.045, 0.0, abs(r - rim));

    // Core glow, bounded so it cannot creep to the frame edges (§8).
    float core = 0.012 / (r * r + 0.004) * smoothstep(0.85, 0.0, r);

    // Three orbiting sparks. Constant loop bound, 3 iterations (§9).
    float spark = 0.0;
    for (int i = 0; i < 3; i++) {
        float k = float(i) * (TAU / 3.0) - t * 2.0;
        vec2  p = vec2(cos(k), sin(k)) * (bloom * 1.35);
        vec2  d = uv - p;
        spark  += 0.0022 / (dot(d, d) + 0.0006);
    }
    // AUDIO_BEAT already decays — used directly as a multiplier (§11.5), and
    // the 0.6 floor keeps the sparks visible in silence (§11.6).
    spark *= 0.6 + 0.4 * AUDIO_BEAT;

    vec3 col = tint.rgb * (body * 1.5 + core * 0.9)
             + vec3(1.0, 0.96, 0.88) * spark * 0.5;

    // §8: coverage, then premultiply. Zero everywhere the object is not.
    float alpha = clamp(body * 0.95 + core * 0.55 + spark * 0.45, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
```

---

## 15. Errors

Two checkers, two lists, per the note at the top of this guide. Both prefix every message
`Shader:` and both are worth knowing, because they fail at different moments: the gallery
fails at merge time, Adits fails on import.

### 15.1 Rejected by the gallery validator

The full set, and the one that matters first, because a shader that fails here never reaches
the corpus. It is a **superset** of 15.2 in effect: everything Adits rejects is caught here
too, plus everything below that Adits does not check.

| Message | Cause |
| --- | --- |
| `Shader: no header block found` | File does not start with `/*{` |
| `Shader: header is not valid JSON` | Parse failure, usually a trailing comma |
| `Shader: DESCRIPTION must be a non-empty string` | Missing or blank on an `ADITS` profile shader |
| `Shader: unknown header key "<key>"` | A key outside the Appendix A list |
| `Shader: DATE must be a YYYY-MM-DD calendar date` | `DATE` is not a plain ISO calendar date, or names a day that does not exist |
| `Shader: DATE "<date>" is out of range` | Earlier than 2020-01-01, or more than a day in the future |
| `Shader: INPUTS must be an array` | `INPUTS` present but the wrong type |
| `Shader: input "<name>" is not a valid GLSL identifier` | Bad characters, or a leading digit |
| `Shader: input "<name>" must not start with gl_` | Reserved GLSL prefix |
| `Shader: input "<name>" has no TYPE` | Missing `TYPE` |
| `Shader: input "<name>" has unsupported TYPE "<type>"` | Includes `image`, `audio`, `audioFFT` |
| `Shader: input "<name>" is a reserved name` | Collides with §5, with `MEDIA` / `MEDIA_SIZE`, or with the `ADITS_` prefix |
| `Shader: input "<name>" is already declared in the body` | Duplicate uniform |
| `Shader: input "<name>" needs MIN and MAX` | Numeric input without bounds |
| `Shader: input "<name>" has MIN >= MAX` | Inverted or empty range |
| `Shader: input "<name>" DEFAULT is outside MIN..MAX` | Out-of-range default |
| `Shader: unknown BIND source "<source>"` | Not in the §6 list |
| `Shader: no main() found` | Missing or misspelled entry point |
| `Shader: more than one main() found` | Multiple entry points |
| `Shader: gl_FragColor is never written` | No write to the output at all |
| `Shader: gl_FragColor is read, which is not allowed` | Read-back detected |
| `Shader: #version is not allowed` | Explicit version directive |
| `Shader: samplers are not supported in this version` | Any `sampler2D` |
| `Shader: derivative functions are not supported` | `dFdx`, `dFdy`, or `fwidth` |
| `Shader: loop bound must be a constant` | Uniform-bounded loop |
| `Shader: loop budget exceeded (<n> iterations)` | Multiplied total over 200 |
| `Shader: file too large` | Over 256 KB |

### 15.2 Rejected by Adits on import

Shown as a toast carrying the first error, after which the model plane goes empty (§1).

| Message | Cause |
| --- | --- |
| `Shader: file is empty` | Nothing but whitespace |
| `Shader: no header block found` | File does not start with `/*{` |
| `Shader: header is not valid JSON (<reason>)` | The parser's own reason is appended |
| `Shader: no shader body after the header` | Header present, nothing following it |
| `Shader: no main() found` | Missing or misspelled entry point |
| `Shader: more than one main() found` | Multiple entry points |
| `Shader: #version is not allowed` | Explicit version directive |
| `Shader: samplers are not supported in this version` | Any `sampler2D`, `samplerCube` or `sampler3D` |
| `Shader: derivative functions are not supported` | `dFdx`, `dFdy`, or `fwidth` |
| `Shader: gl_FragColor is never written` | No write to the output at all |
| `Shader: gl_FragColor is read, which is not allowed` | Read-back detected |
| `Shader: INPUTS must be an array` | `INPUTS` present but the wrong type |
| `Shader: input "<name>" is not a valid GLSL identifier` | Bad characters, or a leading digit |
| `Shader: input "<name>" may not start with gl_` | Reserved GLSL prefix |
| `Shader: input "<name>" is a reserved name` | Collides with §5, with `MEDIA` / `MEDIA_SIZE`, or with the `ADITS_` prefix |
| `Shader: input "<name>" is declared twice` | The same `NAME` appears twice in `INPUTS` |
| `Shader: input "<name>" is already declared in the body` | Duplicate uniform |
| `Shader: input "<name>" has unsupported TYPE "<type>"` | Adits profile only; a warning in the fallback, where the input is skipped |
| `Shader: input "<name>" needs MIN and MAX` | Adits profile only; a warning in the fallback, where the range becomes 0…1 |
| `Shader: input "<name>" has MIN >= MAX` | Both profiles |
| `Shader: input "<name>" DEFAULT is outside MIN..MAX` | Adits profile only; a warning in the fallback, where the value is clamped |

Warnings, which appear once under the panel rather than as a toast, and never block a load:

| Message | Cause |
| --- | --- |
| `Shader: "<name>" is driven by Adits, so it gets no control` | A legacy alias, `u_time` or `u_resolution` |
| `Shader: writes a fully opaque alpha — background keyed to Luma` | The §8 rescue fired |

### 15.3 What neither list catches

**A GLSL compile failure produces no message.** Adits hands the composed source to the
driver and does not read the link log, so a shader that passes every rule above but fails to
compile shows an empty plane and a clean panel. The reason is in the browser console. If a
shader loads with no toast and draws nothing, open the console first.

This is the one failure mode with no user-facing report on either side, and it is the reason
§7's GLSL 3.00 qualifier rule is worth obeying even though nothing enforces it.

---

## Appendix A — JSON Schema for the header block

Draft 2020-12. The generator app can validate against this directly.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://adits.app/schema/shader-object-v1.json",
  "title": "Adits Shader Object header",
  "type": "object",
  "required": ["ADITS", "DESCRIPTION"],
  "additionalProperties": false,
  "properties": {
    "ADITS":       { "const": 1 },
    "DESCRIPTION": { "type": "string", "minLength": 1, "maxLength": 500 },
    "CREDIT":      { "type": "string", "maxLength": 200 },
    "DATE":        { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
    "CATEGORIES":  { "type": "array", "items": { "type": "string" }, "maxItems": 8 },
    "ALPHA":       { "enum": ["premultiplied", "straight", "opaque"], "default": "premultiplied" },
    "BACKGROUND":  { "enum": ["none", "filled"], "default": "none" },
    "COST":        { "enum": ["low", "medium", "high"], "default": "medium" },
    "ASPECT":      { "enum": ["square", "free"], "default": "square" },
    "LOOP":        { "type": "number", "exclusiveMinimum": 0, "maximum": 600 },
    "INPUTS": {
      "type": "array",
      "maxItems": 12,
      "items": { "$ref": "#/$defs/input" }
    }
  },
  "$defs": {
    "input": {
      "type": "object",
      "required": ["NAME", "TYPE"],
      "additionalProperties": false,
      "properties": {
        "NAME": {
          "type": "string",
          "pattern": "^(?!gl_)(?!ADITS_)[A-Za-z_][A-Za-z0-9_]*$",
          "maxLength": 40,
          "not": {
            "enum": ["TIME", "TIMEDELTA", "FRAMEINDEX", "RENDERSIZE", "PASSINDEX",
                     "AUDIO_BASS", "AUDIO_MID", "AUDIO_TREBLE", "AUDIO_VOL",
                     "AUDIO_LEVEL", "AUDIO_BEAT", "AUDIO_KICK", "AUDIO_SNARE",
                     "AUDIO_HAT", "AUDIO_BANDS", "CAM_DIR", "CAM_UP",
                     "TRACK", "TRACK_ON", "HAND_OPEN",
                     "MEDIA", "MEDIA_SIZE"]
          }
        },
        "TYPE":       { "enum": ["float", "bool", "long", "color", "point2D", "event"] },
        "DEFAULT":    {},
        "MIN":        { "type": "number" },
        "MAX":        { "type": "number" },
        "LABEL":      { "type": "string", "maxLength": 40 },
        "LABELS":     { "type": "array", "items": { "type": "string" } },
        "BIND": {
          "enum": ["bass", "mid", "treble", "vol", "level", "beat", "kick", "snare", "hat",
                   "gesture.x", "gesture.y", "gesture.z", "gesture.open", "none"]
        },
        "BIND_DEPTH": { "type": "number", "minimum": -1, "maximum": 1, "default": 1 }
      },
      "allOf": [
        {
          "if":   { "required": ["TYPE"],
                    "properties": { "TYPE": { "not": { "const": "event" } } } },
          "then": { "required": ["DEFAULT"] }
        },
        {
          "if":   { "properties": { "TYPE": { "enum": ["float", "long"] } } },
          "then": { "required": ["MIN", "MAX"] }
        },
        {
          "if":   { "properties": { "TYPE": { "const": "color" } } },
          "then": { "properties": { "DEFAULT": {
                      "type": "array", "minItems": 4, "maxItems": 4,
                      "items": { "type": "number", "minimum": 0, "maximum": 1 } } } }
        },
        {
          "if":   { "properties": { "TYPE": { "const": "point2D" } } },
          "then": { "properties": { "DEFAULT": {
                      "type": "array", "minItems": 2, "maxItems": 2,
                      "items": { "type": "number" } } } }
        }
      ]
    }
  }
}
```

The schema cannot express three rules, so check them in code:

- `MIN` < `MAX`, and `MIN` ≤ `DEFAULT` ≤ `MAX`.
- The numeric / boolean / colour slot budget of §4 rule 4, since it counts `point2D` as two.
- That `DATE` names a real day in range. The pattern matches `"2026-02-31"` and `"1999-01-01"`
  happily; only a calendar round-trip and a bounds check reject them.

---

## Appendix B — Rules table

One row per mechanical rule, with the check the generator should implement. `E` is a hard failure,
`W` is a warning worth surfacing to whoever is driving the generator.

| # | Rule | Sev | Check |
| --- | --- | --- | --- |
| 1 | Header present and first | E | `/^\s*\/\*\{/` matches the file |
| 2 | Header parses | E | `JSON.parse` of the `{ … }` slice succeeds |
| 3 | Header validates | E | Appendix A schema passes |
| 3b | `DATE` well-formed | E | Matches `/^\d{4}-\d{2}-\d{2}$/`, round-trips through `Date`, and falls within 2020-01-01 … today + 1 day |
| 3c | `DATE` present | W | Missing on an `ADITS` profile shader, so the gallery has to date it by its first commit |
| 4 | Numeric bounds sane | E | `MIN < MAX && MIN <= DEFAULT && DEFAULT <= MAX` |
| 5 | Slot budget | W | numeric + 2·point2D ≤ 6, bool ≤ 2, color ≤ 2 |
| 6 | No duplicate uniform | E | For each `NAME`, body has no `/\buniform\b[^;]*\b<NAME>\b/` |
| 7 | No `#version` | E | `/^\s*#version/m` does not match |
| 8 | No `precision` outside a guard | W | `/^\s*precision\s/m` outside `#ifdef GL_ES` |
| 9 | No GLSL 3.00 qualifiers | E | `/\b(in\|out\|flat\|centroid)\s+(highp\|mediump\|lowp\s+)?\w+\s+\w+\s*;/` does not match |
| 10 | No samplers | E | `/\bsampler(2D\|Cube\|3D)\b/` does not match |
| 11 | No derivatives | E | `/\b(dFdx\|dFdy\|fwidth)\s*\(/` does not match |
| 12 | Exactly one `main` | E | `/\bvoid\s+main\s*\(/g` matches exactly once |
| 13 | `gl_FragColor` written | E | `/\bgl_FragColor\s*=/` matches |
| 14 | `gl_FragColor` not read | E | No `gl_FragColor` occurrence that is not immediately followed by `=` or `.` + `=` |
| 15 | Constant loop bounds | E | Every `for` header's comparison right-hand side is a literal or a `#define`d literal, never an input name |
| 16 | Loop budget | E | Product of nested loop counts ≤ 200 |
| 17 | Raymarch step cap | E if > 96, W if > 64 | Largest loop count in a function that calls a distance function |
| 18 | Normal tap count | W | Count of distance-function calls inside the normal function; warn above 4 |
| 19 | Canonical preamble | W | `/gl_FragCoord\.xy\s*-\s*0?\.5\s*\*\s*RENDERSIZE/` matches |
| 20 | No hard-coded resolution | W | No numeric literal ≥ 256 divided into `gl_FragCoord` |
| 21 | Premultiplied output | W | A `col *= alpha`-shaped statement precedes the `gl_FragColor` write |
| 21b | No unlocalised alpha accumulation | W | Every `alpha +=` / `a +=` term is multiplied by a distance, mask or `smoothstep` factor. An `alpha +=` whose right-hand side has no spatial term raises coverage frame-wide, which is the full-frame veil failure in §8 |
| 22 | Not opaque | E if `BACKGROUND` is `none` | `/gl_FragColor\s*=\s*vec4\([^)]*,\s*1\.0?\s*\)/` does not match |
| 23 | `LOOP` consistency | W | If `LOOP` is set, `TIME` appears only inside a `fract`, `mod`, or a `TAU / LOOP` scaling |
| 24 | Silence-safe | W | Every `BIND`ed input's `DEFAULT` is strictly inside `MIN … MAX`, not pinned at `MIN` |
| 25 | File size | E | Bytes < 262144 |

Rules 15 through 18 need a light parse rather than a regex. A brace-matching scan that records
`for` headers and function-call sites is enough; a full GLSL parser is not required.
