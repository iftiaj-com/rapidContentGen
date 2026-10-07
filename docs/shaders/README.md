# Shaders in rapidContentGen

166 AditsShaders objects, copied from the AditsShaders repo into
`library/adits-shaders/` (mirrored layout, so the copied validator, compile check and frame
renderer run in place). Logged in `docs/PROVENANCE.md`.

## Pick a shader

```
node tools/shaders/catalog.mjs --find "nebula gold"      # search descriptions and slugs
```

`library/shaders-catalog.json` lists every shader with its description, categories, alpha mode,
audio bindings and input count. Rebuild it after adding shaders: `node tools/shaders/catalog.mjs`.

## Put one in a job

```
node tools/rcg.mjs shader --job jobs/<id> --shader billowing-plasma-nebula \
  --audio jobs/<id>/assets/song-limited.wav [--audio-offset 0] \
  --fit fill|square [--size 760 --x 540 --y 860] [--scale 0.5] \
  [--clock default|pulse|flywheel|tilt] [--drive 0.35] [--inputs '{"NAME":0.5}'] \
  [--opacity 1] [--blend screen] --start 0 --duration 15 --id sh-bg --insert
```

- **Objects, not wallpapers.** AditsShaders objects are authored square and transparent, centered.
  `fill` gives a full-frame canvas with the object in the middle; leave room around foreground
  footage (R2 used a 640 px card so the nebula frames it). `square` places the object as a square.
- **Audio.** `--audio` analyzes the music into a per-frame table (`data/<id>.audio.json`): the same
  bands, onsets and BIND drive Adits uses. Without it the shader runs silent (all audio uniforms 0).
- **Clock.** `default` = the author's speeds. `pulse` (default) rests at 1x and speeds up with the
  music; `flywheel` coasts to 0.15x in silence; `tilt` speeds up on treble and slows on bass.
  `--drive` scales the music's effect; loud masters at drive 1 run about 5-6x real time.
- **Cost.** `fill` renders at `--scale 0.5` (540x960) and is upscaled; raise it for sharper edges at
  a longer render. Heavy ray-marched shaders may slow renders.
- **Z-order.** Hosts are inserted at the end of the root; give the host id a `z-index` in the job CSS
  (for example `#sh-bg { z-index: 0; }` and the footage card above it).

## Checks

```
cd library/adits-shaders
node scripts/validate.mjs        # rules from shader-guide.md (166/166 pass)
node scripts/compile-check.mjs   # real WebGL compile in headless Chrome (166/166 pass, ~17 s)
```

## Licence notes

Every shader's CREDIT names an AI model as author. Six describe themselves as rebuilding a widely
shared Shadertoy technique (new code, not a copy, per their descriptions):
abyssal-frond-bouquet, argent-corner-bloom, kleinian-fractal-orb, nova-spiral-shroud,
orbital-ring-station, rose-flagellate-polyp. `rcg shader` warns when one of these is used; check
them before commercial use.

## Normative reference

`library/adits-shaders/public/shader-guide.md` (the shader object format, reserved uniforms, BIND,
alpha rules). `skill.md` and `llms.md` are the authoring workflow and quick reference.
