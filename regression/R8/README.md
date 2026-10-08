# R8: Adits voxels with Rapier physics and the anamorphic models (Phase 8 regression)

`jobs/2026-10-08-r8-anam-voxel-reel`, 14.0 s, mode (b). A labelled reel of every effect ported in
P8, each rendered offline with `rcg fx` and cut every 1.4 s over the Paper Ring music (already
limited, from R5/R6). Footage: `101066-video-1080.mp4` (9:16, from R6) and the user's
`Video_for_testing.mp4` (16:9, from R7) with its R7 hand track (`data/track-v1.json`).

| Shot | `rcg fx` effect | Adits source | Clip, range (s) | Options |
|---|---|---|---|---|
| 1 | `voxel-art` | `core/anam/VoxelArt.js` | R6, 2-3.5 | `--audio` (offset 0), `anamVoxelArtAudio=true` |
| 2 | `voxel-drop` | `core/anam/VoxelDrop.js` + Rapier | R6, 3-4.5 | `--preroll 1.3`, `rcgDropAt=-1.2` (pressed 0.1 s into the pre-roll) |
| 3 | `voxel-drop --preset bursts` | same | R6, 5-6.5 | `--preroll 0.6`, `rcgDropAt=-0.5` |
| 4 | `voxel-hole` | same | R6, 4-5.5 | `--preroll 1` |
| 5 | `voxel-magnet` | same | R7, 5-6.5 | `--track data/track-v1.json --anchor hand`, `anamVoxelMagnetRange=25` |
| 6 | `voxel-flip` | same | R6, 6-7.5 | `--audio` (offset 7), `anamFlipAudio=true anamFlipAudioMode=mid` |
| 7 | `voxel-grow` | same | R6, 8-9.5 | `--point "0:0.35,0.4;1.4:0.6,0.55"`, `anamVoxelGrowRange=50` |
| 8 | `particles` | `core/anam/ParticleSystem.js` | R6, 7-8.5 | `--audio` (offset 9.8), `anamParticleAudioEnabled=true anamParticleAudioMotion=wave anamParticleCount=40000 anamParticleSize=50 anamImageFit=fill rcgLiveColor=true rcgBackground=black` |
| 9 | `cutout --preset shattered` | `core/anam/CutoutCollage.js` | R6, 9-10.5 | `--audio` (offset 11.2), `cutoutAudio=true` |
| 10 | `magic-carpet --preset flag` | `core/anam/MagicCarpet.js` | R6, 10-11.5 | defaults |

1. `rcg new-job --name r8-anam-voxel-reel --video <R6 clip> --video <R7 clip> --audio <limited song> --mode b`,
   then copy R7's `data/track-v1.json` (made from the same clip).
2. For each row: `rcg fx --job $J --src assets/<clip> --start <s> --duration 1.5 --effect <name> [options] --sheet --out assets/fx/<shot>.mp4`.
   Read every sheet.
3. `index.html`: R6's head and label styles, one `.shot` per clip (1.4 s each, media start 0), a flat
   label card per shot in the top text band on alternating tracks 10/11, the music at level 1 with
   0.04 s / 0.6 s fades.
4. `rcg mix-check` (MIX OK, -14.8 LUFS, -2.5 dBTP), `rcg hf --cwd $J check` (passes; the same 2
   track-density lint warnings as R6, contrast 8/8), `rcg render $J --fps 24 --workers 3`.

**Checks:**
- Mapping and colour: a flat, full-frame `voxel-drop` (`anamPerspAngle=0 anamScale=158
  anamToneMapping=none rcgBackground=black`, no drop) fits `out = 1.014-1.020 x linear(in)` within
  1.0-1.5/255 on 3 frames (predicted 1.015 from the shader's ambient 0.95 + diffuse 0.1 x 0.65); a
  plain `out = k x in` fit is 7-8.5/255 off. So the UVs, crop and flip are right, and the darker model
  is Adits' own: its shaders sample the sRGB texture as linear and never re-encode (lessons 13as).
- Determinism: `voxel-drop` (Rapier physics, seeded random) rendered twice: 36/36 decoded frames
  identical. `particles` with the flow dance on music, twice: 18/18 identical.
- Clock: the same `voxel-drop` at 24 and 30 fps agrees at the same timeline time (52.8 dB PSNR at
  0.5 s, 54.9 dB at 1.0 s), so the 60 Hz host clock makes motion independent of the output fps.
- Audio: `voxel-flip` in audio mode without `--audio` equals the plain grid exactly (PSNR inf); with
  the music it differs (25.7 dB average), the tiles flip.
- Live colour: `particles` frame 0 is byte-identical with `rcgLiveColor` on and off.
- Point: `voxel-magnet` with the R7 hand track: the point is present on 36/36 frames and the swelling
  cubes sit on the tracked hand (the one holding the cup) in the sheet.
- The render passes all 11 verify checks.
