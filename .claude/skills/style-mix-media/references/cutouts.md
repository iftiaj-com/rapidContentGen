# Cut-outs: the person, objects and prints

All made by `node tools/rcg.mjs mix-media ...` from the job's own media. Results and their sizes
go in `data/mm-prep.json`; `data/mm-cutouts.png` shows them on a checkerboard (READ it).

## The person

1. **Matte:** `prep` runs `rcg matte` (MediaPipe selfie segmenter, every source frame) unless
   `assets/matte/<name>-fg.webm` exists. Good on mid shots and on a white wall; white objects in
   the hand can drop out in some frames. Full-body action leaks (then ask about HyperFrames'
   `remove-background`, a one-time 168 MB model download).
2. **Live cut-out:** the matte re-cut every frame at 12 fps (stop-motion "on twos" at 24 fps),
   cropped to the subject's box over the whole clip, with a hand-torn cream paper border made
   fresh each frame (the edge boils like re-cut paper): `assets/mm/live-<name>.webm` (VP9 alpha).
   Options: `--live-fps 12`, `--border 16`, `--paper cream|white` (white = the references' sticker
   look), `--max-h 1280`, `--no-live`.
3. **Poses:** `--times 1.5,4.5,8.9` cuts the source frame plus the matte's alpha at each time,
   with a torn border: `assets/mm/pose-<k>.png`. One more later: `mix-media pose --at <s> --name <n>`.
   Without `--times`, `--poses N` picks distinct silhouettes (farthest-point on the matte shapes,
   sharpest frame nearby): useful to survey, but it can miss the pose a line needs.
   Choose poses with a clear face, no motion blur, hands visible.

The torn edge: distance from the subject, irregular width (0.68-1.32 of `--border`), a fine jag,
a lighter fibrous rim, paper grain. No outline and no drop shadow (the guide).

## Objects from the frames

- `prep --objects "cup,cell phone,book"` asks MediaPipe EfficientDet (COCO labels) at a few times
  (`--object-at`) and cuts each found object at its best frame with `rcg layers`.
- Missed objects (small, or the same colour as the wall): `mix-media object --at <s> --box x,y,w,h
  --name cup` runs GrabCut inside the box. Find the box on a gridded crop of the frame.
- Every object gets the vintage-sticker treatment by default: upscaled when small, smoothed,
  posterized to five muted colours, speckle removed, inked outline, grain, white die-cut border.
  `--plain` keeps it photographic (then it is not a guide-style prop: use only when asked).
- Below about 200 px in the source the result is rough; a drawn `sticker` kind reads better.

## Prints and collected images

`mix-media sticker --in assets/img/<file> --name <n>` turns an image into a sticker:
`--cut light` lifts a drawing or print off light paper (ink and paint kept, pale stains dropped,
holes filled), `--cut none` keeps the whole rectangle (a card, a stamp), `--edge die|paper|none`.
Crop to one subject first (`ffmpeg -vf crop=...`): a crop line through a neighbouring drawing
leaves a straight cut. Fetch only from the approved sources (`rcg assets`, credits recorded).

## Stills for photo props

`ffmpeg -ss <t> -i assets/<clip> -frames:v 1 -vf "crop=330:330:x:y" -q:v 2 assets/stills/<n>.jpg`:
a tight square on the face for a polaroid, a taller crop for the oval frame. Check the crop.
