# The multiplane idea and layer prep

## Why it works

Walt Disney Productions' multiplane camera (used on *Snow White and the Seven Dwarfs*) put painted
artwork on glass sheets at different distances from the camera. When the camera moves, near
sheets shift and grow more than far ones, so a flat painting reads as space. The Vox look does the
same digitally: one photo cut into depth layers, a virtual camera moving through them.

Here the "glass sheets" are the PNG layers from `rcg layers`, and the stage is a CSS 3D scene
(`parallax` component): each layer sits at a depth z and is pre-scaled by (P + z) / P, so the still
frame looks exactly like the photo until the camera moves.

## Choosing photos

- A clear subject separate from its background (a cable car against the sky, a person in a room).
- Something in front if possible (rocks, a table edge, leaves): the foreground sells the depth most.
- Simple space around the subject: the background fill is rebuilt from nearby pixels.
- Portrait 9:16 or larger. A landscape photo is cover-cropped; set `focusX`/`focusY` (0-1) on the
  `parallax` component to keep the subject in the crop.

## `rcg layers`

```
node tools/rcg.mjs layers --job jobs/<id> --src assets/<photo|clip> [--at <s>] --detect
node tools/rcg.mjs layers --job jobs/<id> --src assets/<photo|clip> [--at <s>] --name s1 \
  --layer "mid:person" --layer "fg:dining table,chair" [--pad 14] [--extend 60] [--feather 1.2]
```

What happens (measured in R10 on a 1080x1920 frame, CPU):

1. MediaPipe EfficientDet lists objects (about 0.2 s). `--detect` stops here and prints them.
2. One MediaPipe magic_touch cut-out per item (about 0.3 s each), clicked at the label's box centre,
   a click point `@x,y` (0-1 or pixels) or the centre of `box=x,y,w,h`. People also get the selfie
   mask near the cut-out (hair, fingers).
3. OpenCV keeps the piece under the click (plus pieces inside the box), closes pinholes, gives each
   pixel to its front-most layer and feathers the edge.
4. **Occlusion stretch** (`--extend`, px): where a front layer hides part of a layer (legs behind a
   chair), the layer is extended straight behind it by copying its own pixels along the same row or
   column, so a moving foreground uncovers continuing fabric, not a hard cut. R10 tried Telea (a pale
   smear) and a round nearest-pixel fill (a radial fan with wings past the silhouette) first.
5. **Background fill**: every cut-out (dilated by `--pad`) is filled with OpenCV Telea at half size
   and softened. Good in the band a camera move uncovers; smeary in the middle of a big hole, which
   stays behind the cut-out.

The R10 benchmark (`regression/R10/README.md`) chose this over OpenCV GrabCut (7.7 s per object at
full size, took in the sofa) and MediaPipe DeepLab (jagged, labelled the sofa as table).

Outputs: `assets/layers/<name>/bg.png` + one RGBA PNG per layer (full frame size, aligned),
`data/layers-<name>.json` (the manifest) and `data/layers-<name>.png` (the check sheet: READ it).

## Your own layers (Photoshop)

For hero shots, hand-made layers with a real content-aware fill beat the automatic fill. Export
full-size, aligned PNGs (background opaque, others with transparency) into
`assets/layers/<name>/` and write `data/layers-<name>.json`:

```json
{
  "version": 1, "width": 1080, "height": 1920, "dir": "assets/layers/s1",
  "order": ["bg", "mid", "fg"],
  "layers": {
    "bg": { "file": "bg.png" },
    "mid": { "file": "mid.png", "touches": { "left": false, "right": false, "top": false, "bottom": false } },
    "fg": { "file": "fg.png", "touches": { "left": true, "right": true, "top": false, "bottom": true } }
  }
}
```

`touches` says which frame edges a layer reaches; those layers are scaled up as needed so a move
never shows their edge.
