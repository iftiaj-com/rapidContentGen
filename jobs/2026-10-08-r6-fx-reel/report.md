# Report: R6 fx reel (Phase 6 subset: Adits footage effects and 3D environments)

- **Render:** `renders/final.mp4`, 1080x1920, 24 fps, 13.75 s, rendered in 1 min 15 s; all 11 verify checks pass.
- **Audio:** -14.8 LUFS, -2.2 dBTP, no whole-mix gain reduction (mix-check predicted -14.7 / -2.5).
- **How it was built:** each shot is a clip that `rcg fx` rendered offline from the source footage
  with the unmodified Adits code (1.5 s each, 19-27 s per clip). The composition cuts them every
  1.25 s, with a label per shot and the R5 music. Shot list and options: `regression/R6/README.md`.

| Time | Shot | Look in the render |
|---|---|---|
| 0-1.25 | Ghost (AdvGhost) | cyan ghost copies trailing the subject, pink tint (the effect's own grade) |
| 1.25-2.5 | Motion trail (MotionTrails) | darkening smears behind movement |
| 2.5-3.75 | Origami | crease lines, then the frame folds in from the edges |
| 3.75-5 | Heat haze (WebGPU) | wavy warp on edges (coat rack, painting) |
| 5-6.25 | Blow pixels (WebGPU) | pixels blow upward and fade, upper frame darkens |
| 6.25-7.5 | Frame tunnel | arch of sampled frames; the front frame follows the clip |
| 7.5-8.75 | Reveal under (take two) | grid tiles flip to side B (the clip at 8 s) |
| 8.75-10 | Split screen (bird mask) | side B inside a large bird silhouette |
| 10-11.25 | Smoke (jet) | a dense plume over the footage |
| 11.25-12.5 | Rain | streaks over the footage |
| 12.5-13.75 | Holo sheen | magenta/cyan foil band and glitter over a tilting plane |

**Fixes found while building (all in the tools):**
1. The harness input PNGs carried BT.709 colour tags, and Chrome colour-managed them: shadows sank in
   every effect (16 to 4, 128 to 121). Frames are now written untagged; Blow pixels at intensity 0
   returns its input exactly (lessons 13ab).
2. The fx server had no HTTP byte ranges, so Chrome could not seek the `<video>` that FrameTunnel
   uses: the earlier FrameTunnel test showed one frozen frame. The server now answers ranges, and a
   seek that misses its target stops the run (lessons 13ac).
3. `--alpha` from the command line reached the page but not the encoder (it wrote H.264); fixed.
4. Page console errors and warnings are now printed (none appeared in R6).

**Open points:**
- Adits defaults that are strong on 9:16 were kept as they are (lessons 13ag): smoke ambient covers
  the whole frame, mist is faint, the frame tunnel is a narrow column with black around it.
- HyperFrames check passes with two advisory lint warnings (5-6 timed labels per track).
- Parity with the live Adits app was judged from the code paths and the frame sheets, not by
  recording Adits itself side by side.
- The mask and smoke images (`bird.gif`, `flower.png`, `leaf.png`, `smoke.png`) have no license notes
  in Adits.
