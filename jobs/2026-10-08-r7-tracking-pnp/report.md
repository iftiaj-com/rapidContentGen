# Report: R7 tracking, cut-outs, layers and transitions (Phase 7)

- **Render:** `renders/final.mp4`, 1080x1920, 24 fps, 13.4 s, rendered in 1 min 39 s; all 11 verify checks pass.
- **Audio:** -14.4 LUFS, -1.7 dBTP, no whole-mix gain reduction (mix-check predicted -14.3 / -1.6).
- **Source:** `videos/Video_for_testing.mp4` (1920x1080, 23.976 fps, no audio), cut into four shots.
- **Style:** after the user's reference talking-head ad (studied frame by frame, not used as footage).

| Time | What happens |
|---|---|
| 0-5 | flash from black; the 16:9 take reframed to 9:16 on her face; zoom to 1.7x and back; "BIG NEWS" behind her head; word captions that start behind her and come forward (Adits depth position) |
| 5-9 | zoom punch; a grey copy of her from 2 s earlier builds in with blocks behind her; captions in front |
| 9-11.4 | glitch punch; punch-in to 1.9x; the white wall turns purple (Adits colour mask) and the cut-out restores her white shirt; "NEW LOOK" behind her |
| 11.4-13.4 | crossfade; slow push; Blow Pixels on the background, then on her only |

**Built with:** `rcg track` (346/346 frames with a face), `rcg matte --choke 6`, `rcg fx` (colour mask;
Blow Pixels with `--matte --apply both`), `rcg voice` + `rcg level --ceiling -2.5`, then:

```bash
J=jobs/2026-10-08-r7-tracking-pnp; T="--track data/track-v1.json"; CUT=assets/matte/v1-fg.webm
rcg camera --job $J --target "#w1" $T --cue "0:face.follow:z=1.05:x=0.5:y=0.34:d=0" --cue "2.4:face.zoom:z=1.7:d=0.3" --cue "4.2:face.zoom:z=1.05:d=0.25"
rcg camera --job $J --target "#w2" $T --cue "5:face.follow:z=1.3:x=0.5:y=0.36:d=0" --cue "7:face.zoom:z=1.05:d=0.4"
rcg camera --job $J --target "#w3" $T --cue "9:face.punch:z=1.9:x=0.5:y=0.38:k=1"
rcg camera --job $J --target "#w4" $T --cue "11.4:face.follow:z=1.05:x=0.5:y=0.36:d=0" --cue "12.4:face.zoom:z=1.35:d=1:ease=sine"
rcg pnp --job $J --base "#v1" --cutout $CUT --id p1 --enter none --exit none
rcg pnp --job $J --base "#v2" --cutout $CUT --id p2 --z 25 --x -0.3 --scale 0.85 --opacity 0.6 --filter "grayscale(0.6) brightness(0.92)" --media-offset -2 --show 5.6-8.6 --enter blocks --enter-d 0.5 --exit fade
rcg pnp --job $J --base "#v2" --cutout $CUT --id p2a --show 5.6-8.6 --enter none --exit none
rcg pnp --job $J --base "#v3" --cutout assets/fx/cmask-s3.mp4 --matte-start 10 --id fx3 --z 5 --show 9.3-11.4 --enter fade --enter-d 0.3 --exit none
rcg pnp --job $J --base "#v3" --cutout $CUT --id p3 --show 9.3-11.4 --enter none --exit none
rcg target --job $J --base "#v4" --fx assets/fx/blow-s4.mp4 --fx-start 12.4 --cutout $CUT --windows "11.4-12.4:bg,12.4-13.4:fg" --id t4
rcg title --job $J --text "BIG|NEWS" --preset slam --style kinetic --color "#3b1f4a" --position top-band --size 230 --start 0.6 --duration 4.0 --id kw1 --insert
rcg title --job $J --text "NEW|LOOK" --preset slam --style kinetic --color "#f4efe4" --position top-band --size 230 --start 9.4 --duration 1.95 --id kw3 --insert
rcg captions --job $J --words $J/assets/voice/audio_meta.json --voice vo1 --style tiktok --mode word --start 0.5 --y 1050 --size 74 --id cap-vo1 --insert   # vo2 5.35, vo3 9.3, vo4 11.5
rcg layer --job $J --id kw1 --behind p1;  rcg layer --job $J --id kw3 --behind p3
rcg layer --job $J --id cap-vo1 --behind p1 --depth 0.5;  rcg layer --job $J --id cap-vo2 --z 40   # cap-vo3, cap-vo4 the same
rcg transition --job $J --at 0 --style flash_black --d 0.4 --id tx0
rcg transition --job $J --at 5 --style zoom_punch --to "#w2" --id tx1
rcg transition --job $J --at 9 --style glitch_punch --to "#w3" --d 0.3 --seed 3 --id tx2
rcg transition --job $J --at 11.4 --style crossfade --from "#w3" --to "#w4" --d 0.5 --id tx3
```

**Fixes found while building (all in the tools):**
1. A 16:9 clip in a 9:16 shot is cropped by `object-fit: cover`, so a camera could not pan to her:
   face cues now lay the tracked clip out uncropped (lessons 13ai).
2. The face is small in the wide frame; the landmarker missed it. A crop pass now finds it on
   346/346 frames (lessons 13aj).
3. The matte was 1080 px wide (soft after a 3x reframe); it now keeps the source size. Its edge
   held a rim of the white wall (a halo on purple at 1.9x): `--choke 6` removes most of it.
4. Text behind the subject tripped HyperFrames' `text_occluded` check; `rcg layer` marks the text
   as covered on purpose. Dark keyword text (`rcg title --color`) for the light footage.
5. Two cut-outs with the same timing tripped `duplicate_media_discovery_risk`; offset copies now use
   their show windows. Seven identical glitch-band clones are now 1 ms apart.
6. A stalled background ffmpeg locked the mix-check file and failed a render: every ffmpeg runner
   now passes `-nostdin`.
7. Ghost on a white wall was invisible as a background-only effect; Blow Pixels shows the switch.

**Checks:** tracking gives identical data on two runs (CPU); snapshots keep the face centred at
1.05x-1.9x; no doubled edges between footage and cut-out through zooms and the zoom punch; the side
copy sits behind her; the colour-mask frame shows the background swapped and the shirt whole.

**Open points:**
- A thin jagged sliver can show at the shirt edge in the colour-mask shot (the key eats into the
  shirt and the choke trims the cut-out edge).
- Gesture events are noisy on this clip (a hand holding a phone or cup reads as Thumb_Up / Pinch),
  so no cue here is driven by a gesture.
- The selfie segmenter suits mid shots; full-body action footage would need HyperFrames' u2net model
  (a 168 MB download, not installed).
- The index.html is 618 lines (HyperFrames' size warning): the per-frame face path is embedded in
  each camera block.
