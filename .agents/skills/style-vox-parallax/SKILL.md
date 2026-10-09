---
name: style-vox-parallax
description: Edit in the Vox-style 2.5D parallax look in rapidContentGen - still photos cut into foreground, midground and background layers and filmed by a virtual multiplane camera (push, pan, rise, drift) with depth blur, haze, grain, stepped 12 fps motion, orange highlighter labels, serif titles, photo cards on cardboard and archival plates. Use when the user asks for a Vox style, parallax, 2.5D, multiplane, "make photos look like video", documentary or archival explainer look, or drops photos with a prompt that matches it. Runs inside the video-job workflow.
---

# Vox Parallax (2.5D multiplane)

This skill owns the look. The `video-job` skill still owns intake, working mode, transcript,
voiceover, mix, render and report: follow it, and use this skill at its beat-sheet and build steps.

- Layers: `node tools/rcg.mjs layers` (MediaPipe detect + magic_touch cut-outs, OpenCV clean-up,
  occlusion stretch and background fill). Needs the image Python (`bin.imagePython`, OpenCV + Pillow).
- Pack: `library/styles/vox-parallax/` (`parallax`, `highlight`, `serif-title`, `board`,
  `photo-card`, `archive`). Tool: `node tools/rcg.mjs style ...`. Captions: `rcg captions --style vox`.
- Learned from the user's reference Short "How Vox makes images look like videos" (technique only;
  no Vox wordmark, fonts or footage) and the user's brief. Regression: `regression/R10/README.md`.

Read before planning: `references/multiplane.md` (the idea, layer prep, what the fill can and cannot
hide). Before motion: `references/camera.md`. For the finish and overlays: `references/finish.md`.

## Fast path: photos (or a clip) into a Vox-style edit

1. **Intake** (video-job steps 1-3). Photos can be passed with `rcg new-job --image`; a clip's frame
   works too (`--at`). Voiceover or transcript word times as usual.
2. **Apply the pack:** `node tools/rcg.mjs style apply --job jobs/<id> --style vox-parallax`.
3. **Pick the photos and plan the depth.** For each photo beat, name its planes: what is in front
   (rocks, a table), the subject (a cable car, a person), and what is far (sky, a wall). Prefer photos
   with a clear subject and simple space around it: the fill behind a cut-out is only good near edges.
4. **Cut the layers** per photo, back to front:
   ```
   node tools/rcg.mjs layers --job jobs/<id> --src assets/<photo> --detect
   node tools/rcg.mjs layers --job jobs/<id> --src assets/<photo> --name s1 --layer "mid:person" --layer "fg:dining table,chair"
   ```
   Items are detector labels, click points `@x,y` (0-1) or `box=x,y,w,h`. READ `data/layers-s1.png`:
   every outline on the right object, nothing extra; the filled background acceptable near the edges.
   Fix a wrong cut with a click point or a box instead of a label.
5. **Plan file** `data/style-plan.json` (shape below), then
   `node tools/rcg.mjs style build --job jobs/<id> --spec jobs/<id>/data/style-plan.json --sfx --insert`.
   Read the whole output: each `parallax` prints its lens, depths and how much a layer was scaled
   up to keep the frame covered (`over`).
6. **Captions:** `rcg captions --job jobs/<id> --words <words> --voice vo1 --style vox --start <s> --id cap-vo1 --insert`.
7. **Check, look, render** (video-job steps 7-8). Snapshot the start, middle and end of every
   parallax shot: the end of a push is where an occluded edge or the fill shows. Read the render's
   sheet and one full-resolution frame.

## Plan file (R10)

```json
{ "style": "vox-parallax", "items": [
  { "component": "parallax", "id": "px1", "start": 0, "duration": 4.2, "layers": "data/layers-room.json", "move": "push", "amount": 0.6 },
  { "component": "serif-title", "id": "t1", "start": 0.25, "duration": 3.9, "text": "One photo,|not a *video*", "y": 300, "h": 210, "size": 88, "tone": "slate", "accent": "orange-deep", "scrim": 0.8, "arrow": "660,290>600,470", "bend": 0.5 },
  { "component": "highlight", "id": "hl1", "start": 1.6, "duration": 2.5, "text": "Multiplane", "y": 1200 },
  { "component": "parallax", "id": "px2", "start": 4.2, "duration": 3.8, "layers": "data/layers-room.json", "move": "pan-left", "amount": 0.6, "object": "mid:40,0", "dust": 30, "leak": 0.45, "paper": 0.12, "seed": 3 },
  { "component": "board", "id": "bd1", "start": 8.0, "duration": 2.5, "texture": "cardboard" },
  { "component": "photo-card", "id": "pc1", "start": 8.0, "duration": 2.5, "src": "assets/stills/s0.jpg", "y": 800, "w": 700 },
  { "component": "board", "id": "bd2", "start": 10.5, "duration": 2.5, "texture": "paper" },
  { "component": "archive", "id": "ar1", "start": 10.5, "duration": 2.5, "src": "assets/stills/s1.jpg", "y": 760, "w": 720 },
  { "component": "highlight", "id": "hl2", "start": 11.0, "duration": 2.0, "text": "Archive, 2026", "y": 1170 }
]}
```

Items stack in plan order (later on top): the `parallax` or `board` first, then titles and labels.
`x`, `y` are centres in output pixels; `|` breaks a line; `*word*` is emphasis. Every param:
`node tools/rcg.mjs style show vox-parallax`.

| Component | Use it for | Key params |
|---|---|---|
| `parallax` | a photo as a moving shot | `layers`, `move` (push, pull, pan-left, pan-right, rise, fall, drift, still), `amount` 0-1, `focal` 35/50, `object` ("mid:dx,dy"), `blur` ("fg:6,bg:2.5"), `haze`, `dust`, `grain`, `vignette`, `leak`, `paper`, `lens`, `fps` (12; 0 = smooth) |
| `highlight` | one key word, name or date on an orange swipe | `text`, `y`, `w`, `size` |
| `serif-title` | a serif statement, optional hand-drawn arrow | `text`, `tone`/`accent`, `scrim` (paper strip), `arrow` "x1,y1>x2,y2", `bend` |
| `board` | cardboard or archival paper ground | `texture` |
| `photo-card` | a photo as a tilted print on the board | `src`, `w`, `ratio`, `rotate` |
| `archive` | an aged, toned photo on the paper board | `src`, `tint` sepia/mono, `shape` soft/oval |

## Boundaries

- Keep the story, narration, timing and claims. Change them only when asked.
- No Vox wordmark, logo, fonts or footage, and no frames from a reference video. The look is
  technique: depth, motion, texture, labels.
- Over a photo, titles in `sky` usually fail contrast: use `scrim` (a paper strip) or `slate`.
  `hf check` measures every text node.
- One moving object per shot at most; it uncovers its own hole in the background fill, so keep its
  path short or over simple background.
- Do not push so far that a front layer fills the frame (the tool caps a push at 42% of the way to
  the front layer).
- Ask before downloading anything (a better inpainting model, a depth model): none is installed.

## Known gaps

- The background fill is OpenCV Telea, softened: fine in the band a camera move uncovers, smeary in
  the middle of a large hole (always behind the cut-out at rest). A cleaner fill needs the user's own
  Photoshop layers (drop them in and write the manifest by hand, `references/multiplane.md`) or a
  downloaded inpainting model.
- Lens distortion (barrel) is not reproduced; `lens` blurs the corners and `vignette` darkens them.
- The detector knows the 80 COCO labels only; anything else needs a click point or a box.
