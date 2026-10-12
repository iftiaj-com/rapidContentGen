# Character lighting principles

These are standard cinematography practices, written for rcg. They apply to a relight, and also to
any rcg content with a character in it: a 3D scene, a cut-out, an illustration, a graphic. Where a
number appears, it is a common rule of thumb, not a measurement.

## 1. Light is a story choice

Every light makes five decisions. Each one changes how the character reads:

| Decision | Options | What it does |
|---|---|---|
| **Direction** | front, 45 degrees, side (90), behind, above, below | where the shadows fall: which parts of the face we can read |
| **Quality** | hard (small or far source) or soft (large or close source) | crisp shadow edges feel tense, honest or harsh; soft edges feel gentle and kind |
| **Contrast** | key against fill: low (bright, even) to high (deep shadows) | low contrast reads light and open; high contrast reads dramatic, serious or dangerous |
| **Colour** | warm (tungsten, fire, sunset) or cool (moon, screens, daylight shade), or mixed | warm reads intimate and safe; cool reads distant and cold; mixed reads tension |
| **What stays dark** | the eyes, half the face, the background | what we cannot see is what the character hides |

Choose the read first ("she is hiding something"), then the setup that makes it (`split`), then the
source that justifies it (a window to her side).

## 2. The three roles of light

- **Key:** the main light. Its direction sets the mood.
- **Fill:** softer and weaker, on the other side. It controls how dark the shadows are. With no fill,
  the result is drama; with a lot, the result is flat and bright.
- **Back (rim / hair) light:** behind the subject. It draws an edge and separates the character from
  the background. With no back light, the character melts into the world, which is useful for
  isolation or despair.

In rcg: `depth` is the inverse of fill (a deeper shadow means less fill). `bg` is how far the world
drops away, and the rim is the back light.

## 3. Contrast: high key and low key

- **High key:** bright, few shadows, low contrast. Comedy, innocence, commercials, the "before".
- **Low key:** mostly dark, strong shadows, high contrast. Drama, noir, horror, secrets.
- Common rough ratios from key side to shadow side are about 2:1 (bright, even), about 4:1 (dramatic but
  natural) and 8:1 or more (strong low key). In rcg, `depth` around 0.3-0.45 reads as low ratio,
  0.5-0.6 as moderate, and 0.8-0.95 as hard low key. That mapping is approximate.

## 4. Motivate every light

A light feels true when the audience can believe where it comes from. Name the source in the beat
sheet, then match its colour and behaviour:

| Source | Colour | Behaviour | Setup it suits |
|---|---|---|---|
| Window by day | neutral to cool white | soft, from the side | loop, rembrandt, split |
| Window blinds at night | cool white | hard stripes | noir |
| Table lamp, tungsten bulb | warm (`key-warm`) | soft-medium, low or side | rembrandt, three-point |
| Bare ceiling bulb | warm-neutral | hard, overhead | top |
| Fire, candle | warm orange | `flicker: 0.15-0.3` | under, rembrandt |
| Phone or laptop screen | cool blue-white | soft, from below or front | under (low), front (close) |
| Moon, night street | cool blue (`rim-blue`) | from behind or high | back-blue |
| Neon sign | saturated colour | side | dual |
| Sunset, sky behind | bright backdrop | from behind | silhouette, three-point rim |

## 5. Eyes

- Catchlights (small reflections of the light in the eyes) make a character feel alive and present.
- Taking the light out of the eyes (top light, back light, silhouette) makes the character unreadable,
  distant or not quite human. Use it only when that is the point.
- In a relight, the eye band (`top`) is the strongest single cue. Do not use it on a line where the
  audience must trust the speaker.

## 6. Broad and short lighting (head turned)

When the face is turned a little away from the camera:

- **Short lighting:** the key lights the side of the face turned away from the camera, and the near side
  is in shadow. It slims the face and adds drama.
- **Broad lighting:** the key lights the side turned toward the camera. It widens the face and feels
  open and plain.

The rcg track has no yaw (it cannot tell which way the head is turned). Read the frames and set `side`
yourself: for short lighting, put the key on the side the face turns toward.

## 7. Continuity

- Inside a scene, keep the key on the same side of the frame. A key that swaps sides between cuts
  looks like a mistake, unless the change is the story.
- Change the setup only on a turn in the story: a new fact, a decision, a threat, a win. Then hold it.
  Lights that change every few seconds read as a gimmick, except in an explainer that compares setups
  on purpose (the reference).
- Match colour across shots of the same moment.

## 8. Lighting arcs

Treat the light as part of the character's arc. Plan it in the beat sheet as a row: beat, character
state, setup, source, amount. A good arc moves in one direction (toward the light, or away from it)
and lands on its strongest setup at the climax. Examples are in `setups.md`, "Arcs that read well".

## 9. Restraint

- One strong setup per turn. The baseline of a talking-head edit stays quiet (`loop` or `three-point`
  at amount 0.5-0.7).
- Subtle is stronger than total: `amount` 0.6-0.8 often reads better than 1.0 on real footage.
- Leave something in shadow. A fully lit frame has nothing to discover.

## 10. Readability

- Text on dark relit frames needs its own ground. The `cl-seam` caption has a dark pill, and mood tags
  sit on dark cards. `hf check` measures contrast; fix every failure.
- Do not drop a speaking face into near black for longer than a line or two unless hiding is the point.
- Light changes are visual beats: in the reference they land on the cue word, as a hard cut. Do not put
  a transition effect on top of a light change.

## 11. Lighting in other rcg content (mode C)

When the edit has no relight but shows a character or object, the same rules make it feel lit, not
pasted:

- **One key direction per scene** for every element: the drop shadows of cut-outs, stickers and cards
  fall on the side opposite the key, at the same angle.
- **Highlights on the key side:** a gradient or sheen on a 3D object or card gets brighter toward the key.
- **Motivated colour:** glows, rims and grades take the colour of the scene's source (warm lamp, cool
  screen).
- **3D scenes** (`rcg three`): set the scene's key, fill and rim to match the setup that fits the beat.
  Under light on a product reads as threat too.
- **Cut-outs over footage** (mix-media, vox-parallax, PNP): match the footage's key side and softness.
  A cut-out lit from the left on a plate lit from the right never sits in the scene.
