# Camera and motion

## The virtual camera

`parallax` turns the lens into a CSS perspective: P = focal / 36 x frame width (35 mm on a
1080-wide frame: P = 1050 px; 50 mm: 1500 px). A longer lens flattens the depth (less parallax for
the same move); 35 mm is the documentary default, 50 mm for calmer, more compressed shots.

Default depths, in units of P (override with `depths: "bg:1.6,mid:0.1,fg:-0.35"`):

| Layer | Depth | Meaning |
|---|---|---|
| `bg` | 1.4 | far back: shifts and grows least |
| back-most cut-out | 0.15 | near the focus plane (one cut-out: 0) |
| front-most cut-out | -0.3 | in front of the focus plane: shifts and grows most |

Every layer is pre-scaled by (P + z) / P, so at rest the frame matches the photo. Depths closer
than 0.2 P to the camera are refused.

## Moves

| `move` | What the camera does | Feel |
|---|---|---|
| `push` | dollies in (z) | the default: slow discovery |
| `pull` | starts close, dollies out | reveal, context |
| `pan-left` / `pan-right` | slides sideways with a slight push | travel, following |
| `rise` / `fall` | slides up or down with a slight push | height, a reveal from below |
| `drift` | slow seeded wander in x and y plus a gentle push | a hand-held, breathing still |
| `still` | no move (objects can still move) | a held beat |

`amount` (0-1) scales the move; 0.5-0.6 reads clearly on a phone, 0.8+ is dramatic. A push is
capped at 42% of the distance to the front layer. Moves ease in and out (sine).

The tool computes the whole path in Node, once per output step, and scales any layer that touches
a frame edge up just enough that no edge comes into frame (blur margin included). The `over`
values it prints show how much: above about 1.15 the crop is getting tight; lower `amount`.

## Object motion

`object: "mid:40,0"` moves a cut-out by (dx, dy) output pixels over `objectIn`-`objectOut` (default:
the whole shot), eased. Use it for the thing that really moves (a cable car along its wire, a car on
a road, a bird). Combined with the camera it stops the shot reading as a flat card zoom. The object
uncovers its own hole in the background fill, so keep paths short or over simple background.

## Stepped frame rate

`fps: 12` (default) holds each camera step for two frames of the 24 fps timeline: the hand-made,
archival documentary cadence. `fps: 0` moves smoothly. Grain changes on the same steps.

## Timing a sequence

- 3-5 s per parallax shot; cut on a voice phrase, not mid-word.
- Alternate moves (push, then pan, then drift) so consecutive shots do not feel like one zoom.
- A photo card or archive plate between parallax shots resets the eye (R10: two parallax shots, a
  card, an archive plate).
