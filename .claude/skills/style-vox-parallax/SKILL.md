---
name: style-vox-parallax
description: Edit in the Vox-style 2.5D parallax look in rapidContentGen - still photos cut into foreground, midground and background layers (or a scene built from cut-out PNG props on a colour ground) and filmed by a virtual multiplane camera (push, pan, rise, drift), with a puppet-like sway on the subject, a word set inside the 3D scene behind the subject, depth blur, haze, grain, stepped motion, one finishing layer over the whole edit, orange highlighter labels, serif titles, photo cards on cardboard and archival plates. Use when the user asks for a Vox style, parallax, 2.5D, multiplane, "make photos look like video", documentary or archival explainer look, or drops photos with a prompt that matches it. Runs inside the video-job workflow.
---

# Vox Parallax (2.5D multiplane)

This skill owns the look. The `video-job` skill still owns intake, working mode, transcript,
voiceover, mix, render and report: follow it, and use this skill at its beat-sheet and build steps.

- Layers: `node tools/rcg.mjs layers` (MediaPipe detect + magic_touch cut-outs, OpenCV clean-up,
  occlusion stretch and background fill). Needs the image Python (`bin.imagePython`, OpenCV + Pillow).
- Pack: `library/styles/vox-parallax/` (`parallax`, `highlight`, `serif-title`, `board`,
  `photo-card`, `archive`, `finish`). Tool: `node tools/rcg.mjs style ...`. Captions: `rcg captions --style vox`.
- Learned from the user's reference Short "How Vox makes images look like videos" and an After
  Effects tutorial the user pasted (2026-10-10: gather a subject PNG and props, 3D layers on Z,
  Puppet Pin, a null-driven camera with 3D text, an adjustment layer with noise and Posterize
  Time). Technique only; no Vox wordmark, fonts or footage. Regression: `regression/R10/README.md`.

Read before planning: `references/multiplane.md` (the idea, layer prep, props, what the fill can and
cannot hide). Before motion: `references/camera.md`. For the finish and overlays: `references/finish.md`.

## The method (what makes it read as a shot, not a zoom)

The AE tutorial's five steps, and what does each one here:

| Step | In After Effects | Here |
|---|---|---|
| 1. Assets | subject PNG + props (buildings, clouds, flames, a flare) | `rcg layers` cuts a photo; `props` adds extra PNG/SVG cut-outs at any depth |
| 2. 3D scene | coloured solid, 3D camera, layers pushed apart on Z | `parallax`: `ground` colour, `depths`, lens `focal` |
| 3. Life in the subject | Puppet Pin | `sway: "mid:1.2"`: a slow seeded rock and breath around the subject's base |
| 4. Camera | a null parented to the camera; 3D text matched to it | `move` + `amount`; `word` puts text inside the scene, behind the subject by default |
| 5. Finish | adjustment layer: Noise ~10%, Posterize Time 16-17 fps | `finish` over the whole edit (grain 0.1, vignette, flicker, stepped); `fps` on each shot |

Every parallax shot needs all three of these, or it reads as a flat card zoom:

1. **Three planes or more.** Something in front (a table edge, leaves, a doorframe), the subject,
   and something far. A photo with no foreground gets one: a cut-out from another photo as a prop
   (`assets/layers/<other>/fg.png@-0.3`), a blurred prop near the bottom edge, or the `word` between
   background and subject. Today's two-plane shots (bg + subject only) were the weakest in the job
   reviewed on 2026-10-10.
2. **A camera move plus one motion of its own.** `object` (the thing that really moves: a cable
   car, a car) or `sway` (a person or a statue breathing). Not both on the same layer.
3. **A texture that steps.** Grain and motion on the same stepped clock (`fps`), then `finish`.

## Fast path: photos (or a clip) into a Vox-style edit

1. **Intake** (video-job steps 1-3). Photos can be passed with `rcg new-job --image`; a clip's frame
   works too (`--at`). Voiceover or transcript word times as usual. Pick the render fps now: it
   sets the step rate (below).
2. **Apply the pack:** `node tools/rcg.mjs style apply --job jobs/<id> --style vox-parallax`.
3. **Gather the pictures** (`style-info-graphics/references/assets.md` lists the approved sources):
   the user's photos first; then `rcg assets search met --q "<words>"` (public-domain art and
   archive photos, good for `archive` plates), Unsplash through its connector plus
   `rcg assets fetch unsplash`, and `rcg assets icon add <name> --weight fill` for simple props.
   Ask before each download (name, source, size: `--dry-run`). Credits go to `data/credits.json`
   and `report.md` only, never on screen. No real people in invented situations.
4. **Plan the depth per beat.** Name the planes: in front, subject, far. Prefer photos with a clear
   subject and simple space around it: the fill behind a cut-out is good only near its edges.
5. **Cut the layers** per photo, back to front:
   ```
   node tools/rcg.mjs layers --job jobs/<id> --src assets/<photo> --detect
   node tools/rcg.mjs layers --job jobs/<id> --src assets/<photo> --name s1 --layer "mid:person" --layer "fg:dining table,chair"
   ```
   Items are detector labels, click points `@x,y` (0-1) or `box=x,y,w,h`. READ `data/layers-s1.png`:
   every outline on the right object, nothing extra; the filled background acceptable near the edges.
   Fix a wrong cut with a click point or a box instead of a label. To reuse a cut-out as a prop in
   another scene, crop it to its `bbox` from the manifest (keeps the alpha):
   `ffmpeg -i assets/layers/s1/mid.png -vf "crop=<w>:<h>:<x>:<y>" -pix_fmt rgba assets/props/s1-mid.png`.
6. **Plan file** `data/style-plan.json` (shape below), then
   `node tools/rcg.mjs style build --job jobs/<id> --spec jobs/<id>/data/style-plan.json --sfx --insert`.
   Read the whole output: each `parallax` prints its depths, how much a layer was scaled up to keep
   the frame covered (`over`) and any `warnings` (a prop pulling inside a frame edge).
7. **Captions:** `rcg captions --job jobs/<id> --words <words> --voice vo1 --style vox --start <s> --id cap-vo1 --insert`.
8. **Check, look, render** (video-job steps 7-8). Snapshot the start, middle and end of every
   parallax shot: the end of a push is where an occluded edge or the fill shows, and the peak of a
   sway is where the fill shows around the subject. Read the render's sheet and one
   full-resolution frame.

## Plan file

```json
{ "style": "vox-parallax", "items": [
  { "component": "parallax", "id": "px1", "start": 0, "duration": 4.2, "layers": "data/layers-room.json", "move": "push", "amount": 0.6,
    "sway": "mid:1.2", "word": "HOME", "wordFont": "caption", "wordY": 700, "wordSize": 190, "grain": 0 },
  { "component": "highlight", "id": "hl1", "start": 1.6, "duration": 2.5, "text": "Multiplane", "y": 1200 },
  { "component": "parallax", "id": "px2", "start": 4.2, "duration": 3.8, "ground": "sky", "move": "drift", "amount": 0.6, "grain": 0, "haze": 0,
    "props": "assets/props/buildings.png@1.2:540,900,1500;assets/props/s1-mid.png@0:540,1000,520:30,0;assets/layers/room/fg.png@-0.3",
    "sway": "prop2:1.5", "word": "Built from parts", "wordY": 520, "wordSize": 120, "wordZ": 0.5, "seed": 3 },
  { "component": "board", "id": "bd1", "start": 8.0, "duration": 2.5, "texture": "cardboard" },
  { "component": "photo-card", "id": "pc1", "start": 8.0, "duration": 2.5, "src": "assets/stills/s0.jpg", "y": 800, "w": 700 },
  { "component": "board", "id": "bd2", "start": 10.5, "duration": 2.5, "texture": "paper" },
  { "component": "archive", "id": "ar1", "start": 10.5, "duration": 2.5, "src": "assets/stills/s1.jpg", "y": 760, "w": 720 },
  { "component": "highlight", "id": "hl2", "start": 11.0, "duration": 2.0, "text": "Archive, 2026", "y": 1170 },
  { "component": "finish", "id": "fin", "start": 0, "duration": 13 }
]}
```

Items stack in plan order (later on top): the `parallax` or `board` first, then titles and labels,
`finish` last (captions stay above it). `x`, `y` are centres in output pixels; `|` breaks a line;
`*word*` is emphasis. Every param: `node tools/rcg.mjs style show vox-parallax`.

| Component | Use it for | Key params |
|---|---|---|
| `parallax` | a photo, or a built scene, as a moving shot | `layers`, `move` (push, pull, pan-left, pan-right, rise, fall, drift, still), `amount` 0-1, `focal` 35/50, `object` ("mid:dx,dy"), `sway` ("mid:1.2", degrees; `swayHz`), `props` ("src@z[:x,y,w[:dx,dy]]"), `ground`, `word` (+ `wordZ`, `wordY`, `wordSize`, `wordFont` serif/caption, `wordTone`, `wordIn`), `blur` ("fg:6,bg:2.5,word:1"), `haze`, `dust`, `grain`, `vignette`, `leak`, `paper`, `lens`, `fps` |
| `highlight` | one key word, name or date on an orange swipe | `text`, `y`, `w`, `size` |
| `serif-title` | a serif statement, optional hand-drawn arrow | `text`, `tone`/`accent`, `scrim` (paper strip), `arrow` "x1,y1>x2,y2", `bend` |
| `board` | cardboard or archival paper ground | `texture` |
| `photo-card` | a photo as a tilted print on the board | `src`, `w`, `ratio`, `rotate` |
| `archive` | an aged, toned photo on the paper board | `src`, `tint` sepia/mono, `shape` soft/oval |
| `finish` | the adjustment layer over the whole edit | `grain` (0.1), `vignette` (0.2), `flicker` (0.03), `fps` |

## Pacing and text budget

- One idea per shot, 3-5 s, cut on a voice phrase. Alternate moves (push, pan, drift, rise).
  A long beat (6 s or more) is two shots: a second move on the same photo, or a card or plate.
- On screen at once: the caption plus **one** other text element (a `word`, a `serif-title` or a
  `highlight`). The 2026-10-10 job put a title, a label and a caption on every beat; it read as a
  slide deck. Rotate: word-in-scene, then label, then title, then nothing (picture and caption only).
- The `word` is the hero move: one or two per edit, on the beat's key noun, set behind the subject.
- `highlight` stays at least 120 px above the caption lane (y 1344) while a caption is up.
- Do not reuse a photo for a second beat unless the move and framing change clearly.

## Step rate (Posterize Time)

`fps` on each `parallax` and on `finish` should divide the render fps, so every hold is the same
length: **12 at 24 fps, 15 at 30 fps** (2-frame holds). The tutorial's 16-17 fps on a 24 fps
timeline gives uneven 1-2 frame holds; use it only if the user asks for that exact feel. The
2026-10-10 job rendered at 30 fps with the default 12: uneven 2-3 frame holds. Use the same rate on
every shot and on `finish`. `fps: 0` moves smoothly (a calm, modern variant).

## Boundaries

- Keep the story, narration, timing and claims. Change them only when asked.
- No Vox wordmark, logo, fonts or footage, and no frames from a reference video. The look is
  technique: depth, motion, texture, labels.
- Over a photo, titles in `sky` usually fail contrast: use `scrim` (a paper strip) or `slate`.
  `hf check` measures every text node. The `word` is white with a soft dark shadow; on a pale sky
  set `wordTone: "ink"` or `"slate"`.
- One moving object per shot at most; it uncovers its own hole in the background fill, so keep its
  path short or over simple background. `sway` 0.8-1.5 degrees: at 3 degrees the fill showed beside
  the subject in testing.
- Do not push so far that a front layer fills the frame (the tool caps a push at 42% of the way to
  the front-most plane, props and the word included).
- With `finish` on, set `grain: 0` on the parallax shots, or the grain doubles there.
- Ask before downloading anything (a better inpainting model, a depth model, background removal):
  none is installed.

## Known gaps

- The background fill is OpenCV Telea, softened: fine in the band a camera move uncovers, smeary in
  the middle of a large hole (always behind the cut-out at rest). A cleaner fill needs the user's own
  Photoshop layers (drop them in and write the manifest by hand, `references/multiplane.md`) or a
  downloaded inpainting model.
- `sway` is a rigid rock and breath of the whole cut-out, not a mesh warp like Puppet Pin: arms and
  head do not move on their own.
- Props are not scaled to cover the frame. A prop that crosses the left or right edge is checked
  and reported; a full-frame prop (no box) is not checked, so snapshot the end of the move.
- The `word` is one line, with no per-letter animation.
- Lens distortion (barrel) is not reproduced; `lens` blurs the corners and `vignette` darkens them.
- The detector knows the 80 COCO labels only; anything else needs a click point or a box.
- There is no image generator in this workspace (`assets.md`). Use generated pictures only when the
  user supplies them or asks for that route.
