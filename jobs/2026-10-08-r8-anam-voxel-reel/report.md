# Report: R8 reel (Phase 8: Adits voxels with Rapier physics and the anamorphic models)

- **Render:** `renders/final.mp4`, 1080x1920, 24 fps, 14.0 s, rendered in 1 min 7 s; all 11 verify checks pass.
- **Audio:** -14.8 LUFS, -2.2 dBTP, no whole-mix gain reduction (mix-check predicted -14.8 / -2.5).
- **How it was built:** each shot is a clip that `rcg fx` rendered offline with the unmodified Adits
  code and a host shim that rebuilds AnamorphicCamera around it (1.5 s each, 17-22 s per clip). The
  composition cuts them every 1.4 s, with a label per shot and the R6 music. Shot list and options:
  `regression/R8/README.md`.

| Time | Shot | Look in the render |
|---|---|---|
| 0-1.4 | Voxel art (audio depth) | the room as stacked grey cubes with toon bands and outlines, the dancer popping out, earthy base rows |
| 1.4-2.8 | Voxel drop | the ripple voxelizes the tilted plane with the RGB glitch, then the cubes rain down and bounce |
| 2.8-4.2 | Voxel bursts | the cubes fly outward and tumble into a debris field over the footage |
| 4.2-5.6 | Infinite hole | centre cubes drop through the plane and tumble below it, on a loop |
| 5.6-7.0 | Magnet (tracked hand) | cubes around the hand holding the cup swell and reach out toward it |
| 7.0-8.4 | Flip (mid band) | tiles flip on the music, many showing their dark backs on the loud passages |
| 8.4-9.8 | Grow (moving point) | tiles extrude into columns around a point moving down and right |
| 9.8-11.2 | Particles (wave) | the footage as a dense point cloud, a sine ripple travelling through it, over black |
| 11.2-12.6 | Cutout (shattered) | the frame broken into tilted glass shards with cracks and facet shading |
| 12.6-14.0 | Magic carpet (flag) | the footage as a flag pinned on the left, waving, gold hem and torn edge |

**Fixes found while building (in the new code):**
1. `rcgLiveColor` first sampled single columns on the flat cloud (every point has z = 0, so the face
   picker chose the wrong axes). Fixed; frame 0 is now byte-identical with the option on and off.
2. A frame could get no host tick above 60 fps; Cutout would then leave it blank. The ticker now
   reports the tick count and Cutout redraws.

**Checks** (details in `regression/R8/README.md`): mapping and colour fit of a flat voxel plane,
determinism of the physics and the particles, 24 vs 30 fps agreement, the audio drive on and off,
live colour, and the tracked point.

**Open points:**
- The darker model in the voxel, hole, magnet, flip, grow and carpet shots is Adits' own behaviour
  (its shaders write linear colour), kept as it is (lessons 13as).
- Particles were tuned for the reel (40000 points, size 50, square crop, live colour, black
  background); the Adits default cloud is sparse at 1080x1920 (lessons 13au).
- Parity with the live Adits app was judged from the code paths, the numeric checks and the frame
  sheets, not by recording Adits itself side by side.
- Not ported: Voxel Cubes and Pyramorphic (same panel, the voxel shim is ready), the Cutout Gesture
  trigger, Reveal Wipe's Solid Model half, the particle Transform styles.
- HyperFrames check passes with two advisory lint warnings (5 timed labels per track).
