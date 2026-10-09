# Camera rules (measured from the reference ad)

Reference: the user's `Video-2306.mp4` (720x1280, 30 fps, 44 s, one person, several setups). Measured
with ORB feature matching (global scale and shift between frames at 15 Hz), Haar face size, and a
local transcript.

| Trait | Measured | Rule in `RULES` (tools/recipes/marketing-pro.mjs) |
|---|---|---|
| Eased zooms | 12 in 44 s, about 0.27 s each, x1.33-1.42 in / x0.69-0.76 out, speed peaks mid-move | `zoomD 0.27`, `zoomEase power2` |
| Levels | wide face ~0.09-0.10 of frame height, tight ~0.13-0.15 | `wide 1.0`, `base 1.3` (alternating) |
| Hard punches | about x1.6 at strong sentence starts | `punch 1.6`, at most one per `punchEvery 8` s |
| Event timing | every cut / punch <= 0.15 s before a sentence or clause start | events at the onset minus `lead 0.1` |
| Spacing | an event every ~1.5-2.5 s | `minGap 1.4`, `maxGap 3.2` (a mid event fills longer gaps) |
| Drift | zoom 2-11 %/s, pan 10-75 px/s at 720 wide | `drift 3-6 %` per segment, `driftX 0.02`, `driftY 0.015` (seeded) |
| Framing | face centre x 0.48-0.52, y 0.35-0.39 | `subject x 0.5 y 0.37`, follow k 1 |

## How the plan builds the camera

1. **Beats.** Words split at , ; : . ? !, at audio silences, before a conjunction once a clause is
   >= 1.0 s, and long clauses (> 3.2 s) at their best word gap (never right after "a/the/this").
   Clauses group into 1.5-4 s beats. Clause starts snap to the speech onset (largest energy rise
   within +-0.15 s) because Whisper word times drift.
2. **Events** at beat and clause starts minus 0.1 s, spacing 1.4-3.2 s. Levels alternate base and
   wide; a punch (d 0) on a strong beat start: a stat, negation or contrast hero, the CTA, else the
   best-scoring beat (hero score >= 2.5) per 8 s. Never the opening beat.
3. **Cues** (rcg camera face cues, `library/runtime/face-reframe.js` unchanged): an opening cue sets
   z, x, y and k (the runtime starts at k 0, y 0.4), a slow push before the first word, then per
   event an eased zoom and a LINEAR drift cue that starts when the zoom ends (a drift starting
   earlier would cut the zoom short, `stateAt` eases from wherever the last cue got to).
4. **Reach.** The plan simulates `reframe()` per frame with the real track. On base/punch segments
   where the clamp keeps the face more than 3% of the frame from its target on over 15% of speech
   frames, the segment's zoom rises in 0.05 steps (at most +0.2). The rest is reported.
5. **Upscale** = z x max(W/srcW, H/srcH) on the original source. Prep's lanczos upscale adds no
   detail. R11 (478x850): 2.26x wide, 2.94x base, 3.62x punch.

## Clamp facts (9:16 output)

- z is relative to the cover fit. A 9:16 source has no pan room at 1.0: the face stays where it is.
- At 1.3 a 9:16 source has +-162 px sideways and +-288 px (0.15 H) of vertical room: a face at
  y 0.22 can just reach 0.37.
- A 16:9 source is uncropped: +-1166 px of sideways room at 1.0, none vertically.

## Measuring a render (the reference method)

The analysis script used on the reference (ORB affine at 15 Hz) can be pointed at any render:
events show as scale steps (x1.3 in a few frames), drift as a slow scale/shift between them. R11's
render: see `regression/R11/README.md`.

## Later phase: two people

`rcg track --faces 2` would add `faces[]` (ids matched by last position; the two largest,
longest-present faces) and a mouth-movement signal; the planner would pick the active speaker per
beat from mouth movement vs the speech envelope and write a composite single-face "focus track"
that camera.mjs reads unchanged. Not built; R11 is one person.
