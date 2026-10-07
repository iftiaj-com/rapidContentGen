# Report: R2 shader + beat cuts

- **Render:** `renders/final.mp4` (and `renders/repeat.mp4`), 1080x1920, 24 fps, 15.0 s. 77 s / 56 s.
- **Audio:** -14.9 LUFS, -2.2 dBTP, no whole-mix gain reduction (mix-check predicted -14.7).
- **Layers:** billowing-plasma-nebula (fill, pulse clock, drive 0.35) behind a 640x1138 card cut on
  9 downbeats with a 1.045x punch per cut; beat-flash CLEAN/SPIN (bands; bass 192, mid 168 frames).
- **Determinism:** shader snapshots pixel-identical across runs; renders 51 dB PSNR apart (local
  pipeline variance, not the shader). Music vs silence on the shader: 15-18 dB PSNR (clearly driven).
- **Design notes:** AditsShaders objects sit centered, so a full-size card hid the shader; a smaller
  card lets it frame the footage. Onset-driven flash flickered (hats, 45 onsets in 15 s); bands
  alternate the bass and mid words about 3 times a second.
