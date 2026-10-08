# R10: Vox-style 2.5D parallax (rcg layers + vox-parallax)

`jobs/2026-10-08-r10-vox-parallax`, 13.0 s, mode (b). The look is learned from the user's reference
Short "How Vox makes images look like videos" (technique only, no frames used) and the user's brief.
Test photo: the R6 stock clip at 5.49 s (a table and chair in front, a woman in the middle, the room
behind) plus two stills from the same clip. Voice: four Kokoro lines, -14 LUFS / -3.6 dBTP.

## Layer-cut benchmark (chose the method)

One 1080x1920 frame, CPU, this laptop. Masks compared by eye in an overlay grid.

| Method | Hint | Time per object | Result |
|---|---|---|---|
| OpenCV GrabCut, full / half size | box | 7.7 s / 1.9 s | took in the sofa, hard box edge |
| MediaPipe magic_touch | click point | 0.3 s (model load 0.2 s) | clean table and person; chair mask had a stray hair blob (removed by keeping the clicked piece) |
| MediaPipe selfie | none | 0.1 s | good person, people only |
| MediaPipe DeepLab v3 | none | 0.7 s (load 1.8 s) | jagged, sofa labelled as table |
| MediaPipe EfficientDet / SSD | none | 0.2 s | boxes only: person 0.84, chair 0.55, table 0.45, couch |
| OpenCV Telea / NS fill | mask | 1.7 s / 2.0 s full, 0.4-0.5 s half | smeary in the middle of a 43% hole |

Chosen: EfficientDet boxes -> magic_touch per object -> OpenCV clean-up and fill.

## Plan (`data/style-plan.json`)

| Time | Components |
|---|---|
| 0-4.2 | `parallax` push 0.6 (layers `room`: bg, mid person, fg table + chair), `serif-title` on a paper strip with an arrow, `highlight` "Multiplane" |
| 4.2-8 | `parallax` pan-left 0.6, the person moving 40 px on her own, dust 30, leak 0.45, paper 0.12 |
| 8-10.5 | `board` cardboard + `photo-card` (still at 0.0 s) |
| 10.5-13 | `board` paper + `archive` (still at 9.15 s, sepia, soft) + `highlight` "Archive, 2026" |

Captions: `--style vox`, 2-word groups.

## Steps

1. `rcg new-job --name r10-vox-parallax --video <R6 clip> --mode b`; stills with ffmpeg into `assets/stills/`.
2. `rcg layers --job $J --src assets/101066-video-1080.mp4 --at 5.49 --name room --layer "mid:person" --layer "fg:dining table,chair"`, READ `data/layers-room.png`.
3. `rcg style apply --job $J --style vox-parallax`; voice; `index.html` with the root and the voice lines only.
4. `rcg style build --job $J --spec $J/data/style-plan.json --sfx --insert`; captions; `rcg hf check`; snapshots; `rcg render`.

## Checks

- `rcg layers`: vision about 4 s, OpenCV 3-5 s; fill covers 36.5% of the frame; mid 13.4%, fg 21.6%.
- Parallax report: lens 35 mm (P 1050 px), depths bg 1.4 / mid 0.15 / fg -0.3 P; coverage scale bg
  1.018 and fg 1.037 for the push, bg 1.063 and fg 1.191 for the pan with object motion.
- `hf check` passes, 17/17 text nodes at WCAG AA (32 layout infos: the planes overflow on purpose).
- Stepped motion: in the pan shot, held frame pairs differ by 0.25 grey levels (encoding noise),
  frames across a step by 5.47: 12 fps holds on the 24 fps timeline.
- Render passes 11/11 verify checks: -14.5 LUFS, -2.7 dBTP. File 51.5 MB (grain compresses poorly).

## Found and fixed while building

- Crop focus offset in CSS left/top would misalign layers at rest under perspective: moved into the
  per-layer translate, scaled by depth (the coverage maths already assumed that).
- The push uncovered the hard bottom edge of the person behind the chair: `--extend` now stretches
  each layer straight behind its front layers (Telea gave a pale smear, a round nearest fill a fan).
- ffmpeg `noise` on an RGB source gave rainbow speckle in the textures: grey first.
- Title in sky blue on the grey wall: 1.6:1. A separate wash behind it measured 3.4:1 in the pixels
  but the HyperFrames audit (sampling inside each word's box) still read about 2:1; the backing is now
  a paper strip on the text element itself (`scrim`), which passes.
