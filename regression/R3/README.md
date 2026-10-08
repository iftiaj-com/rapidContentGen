# R3: 3D camera + camera on footage (Phase 3 regression)

Two jobs on the song (limited to -2.5 dBTP) and `101066-video-1080.mp4`, cut on downbeats from the
librosa beat grid (136 BPM).

**R3 (`jobs/2026-10-07-r3-3d-camera`, 12 s):** a procedural orb (`rcg three`) with `orbit_cw` on
layer a and `crash_zoom_in/out` at i=0.5 on the downbeats on layer b, audio-reactive. Then footage
from 5.875 s in a `#w1` wrapper: `handheld` on layer a with kick shake, and a whip across the
9.311 s cut (`whip_pan_right`, then `whip_pan_left:from=0.5:rev`).

    rcg three --job $J --scene orb --bg "#05060a" --audio $J/assets/song-limited.wav --duration 5.875 --id three-orb --track 3 \
      --cue "a/0:orbit_cw" --cue "b/0.511:crash_zoom_in:i=0.5" --cue "b/2.392:crash_zoom_out:i=0.5" --cue "b/4.203:crash_zoom_in:i=0.5" --insert
    rcg camera --job $J --target "#w1" --kick $J/assets/song-limited.wav \
      --cue "a/5.875:handheld" --cue "b/8.811:whip_pan_right" --cue "b/9.311:whip_pan_left:from=0.5:rev"

**R3b (`jobs/2026-10-07-r3b-2d-presets`, 9.311 s):** the Adits Virtual Camera presets. `#w1`
(blurred fill): `vc.lean_sweep`, then `vc.dutch_angle_drift` with `react=bass_zoom`. `#w2`
(cover fill): `vc.cinematic_zoom_pan`, `vc.ken_burns` with handheld 40, `vc.warp_tilt` on a curve.

    rcg camera --job $J --target "#w1" --audio $J/assets/song-limited.wav \
      --cue "0:vc.lean_sweep" --cue "2.392:vc.dutch_angle_drift:react=bass_zoom:sens=0.6" --cue "4.203:static_shot"
    rcg camera --job $J --target "#w2" --fill cover \
      --cue "4.203:vc.cinematic_zoom_pan" --cue "5.875:vc.ken_burns:hh=40" --cue "7.546:vc.warp_tilt:curve=150"

Then `rcg hf --cwd $J check` (0 errors; R3b has one benign `duplicate_media_discovery_risk`
warning from the fill clones) and `rcg render $J --fps 24 --workers 3`.

**Unit and fidelity tests:**
- All 46 moves at 0/50/100 % progress give finite poses, valid CSS, a valid three.js camera, and the same result twice.
- The 20 presets match the Adits `VirtualCamera` table. 1440 sampled poses (6 times x 12 option sets x 20 presets) match `getCurrentParams` + `applyTransform` within 0.0001 px.
- Cover mode leaves no gap for any preset on 9:16 or 16:9.

**Determinism:** two snapshot runs of R3 at 1.6, 4.5, 7.5 and 9.32 s are pixel-identical. The
same frames are pixel-identical before and after the presets were added to the runtime.

**Edge band (fixed 2026-10-08):** the first renders failed `no dead edge band`. The PATH ffmpeg 8.1
blanks the right 8 px (lessons 16b), and the same bug drew a dark line along R3b's skewed footage
edge. With HyperFrames on ffmpeg 9.0.2 and a fresh frame cache, both renders pass all 11 checks and
the seam is gone.
