# Report: R3 3D camera + camera on footage

- **Render:** `renders/final.mp4`, 1080x1920, 24 fps, 12.0 s, rendered in 45 s; all 11 verify checks pass.
- **Audio:** -14.6 LUFS, -2.2 dBTP, no whole-mix gain reduction.
- **Layers:** procedural orb (`rcg three`, sphere + wireframe shell + seeded starfield, bass swell,
  kick shake) with `orbit_cw` on layer a and crash zooms (i=0.5) on the 0.511 / 2.392 / 4.203 s
  downbeats on layer b. Footage from 5.875 s in `#w1`: handheld + kick shake, whip across the 9.311 s cut.
- **Frame sheet:** orb small at 0.43 s, crash-zoomed at 1.29 and 2.14 s, out at 3.00-3.86 s, in again
  at 4.71-5.57 s; handheld footage from 6.43 s; whip cut lands by 9.86 s.
- **Determinism:** snapshots at 1.6 / 4.5 / 7.5 / 9.32 s are pixel-identical across two runs, and
  again after the 2D presets were added to the camera runtime.
- **Edge band:** the first render had a black 8 px strip down the right edge (PATH ffmpeg 8.1,
  lessons 16b). Re-rendered with HyperFrames on ffmpeg 9.0.2: the edge carries picture.
