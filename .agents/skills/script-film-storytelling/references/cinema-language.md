# The language of cinema: what each choice means

A shot is a sentence. Its size, angle, movement and length say something, and the cut between two shots
says something neither says alone. These meanings are conventions taught in film schools and
grammar-of-film books (for example Daniel Arijon, *Grammar of the Film Language*). They are tendencies,
not laws: context can flip any of them.

The rcg column names the tool when the footage already exists. In footage mode, shot size and angle are
fixed by the source: choose shots by what they already are, and use crops and camera cues only within
the source's zoom room (`shots.md` prints it).

## Shot size: how close we are, emotionally

| Size | Shows | Says | Use on | rcg |
|---|---|---|---|---|
| Extreme wide (EWS) | the world, the person tiny | scale, isolation, place | openings, endings, a character alone against something big | the source; `rcg cinema` bars for scope |
| Wide (WS) | whole body and setting | where we are, who is where | establishing a scene, blocking, physical action | the source |
| Medium (MS) | waist up | conversation, neutral attention | most dialogue coverage | crop from a wide if the room allows |
| Medium close (MCU) | chest up | engagement, starting to feel | rising tension | crop, `face.follow` |
| Close-up (CU) | the face | what they feel, now | turns, reactions, decisions | `face.zoom`, a measured crop |
| Extreme close (ECU) | eyes, a hand, an object | the detail that matters | setups and payoffs (the stamp, the ring) | a detail shot, or a crop with room |
| Insert | an object or text | information the plot needs | setups, clues | the source |

Rule: the closer the shot, the more it costs. Save close-ups for the moments that matter; a film shot
entirely in close-ups has no way to raise the emotion.

## Angle: power and point of view

| Angle | Says | Use |
|---|---|---|
| Eye level | equal, neutral | default |
| Low (looking up) | power, threat, heroism | an opponent at their strongest; the hero after the choice |
| High (looking down) | weakness, being watched, smallness | the hero at the low point |
| Overhead / top-down | fate, pattern, a god's view | a map of the situation; a ritual |
| Dutch (tilted) | unease, a world off balance | sparingly; it reads as a style quickly |
| Point of view (POV) | we are the character | a discovery: show what they see, then their reaction |
| Over the shoulder (OTS) | a relationship, two people in one frame | dialogue; who is in whose way |

## Movement: only with a motive

A move must be motivated by a character (we follow them), the action (we keep up), or the story (we
push in because a decision is happening). An unmotivated move is decoration and is the most common
"AI film" tell.

| Move | Says | rcg cue (`rcg camera --list`) |
|---|---|---|
| Static (locked off) | observe, let the action play | `static_shot` |
| Slow push in | we go inside a thought; something is being decided | `slow_zoom_in`, `dolly_in`, `vc.dolly_push`, `face.zoom` |
| Pull out | reveal context, loneliness, an ending | `slow_zoom_out`, `dolly_out`, `drone_pull_back` |
| Pan / tilt | look from one thing to a related thing; connects them | `pan_left`, `pan_right`, `tilt_up`, `tilt_down` |
| Tracking / follow | we go with them; momentum | `tracking_shot`, `follow_shot`, `side_tracking` |
| Handheld | presence, urgency, instability | `handheld` (add, do not stack on shake) |
| Crane up / down | leave or arrive at a scale; an ending | `crane_up`, `crane_down` |
| Arc / orbit | a moment held still while the world turns; a realization | `arc_left`, `arc_right`, `orbit_cw` |
| Whip pan | sudden attention, a link between two places | `whip_pan_left`, `whip_pan_right`, `rcg transition --style mirror_whip` |
| Crash zoom | shock, comic emphasis | `crash_zoom_in` (rarely; reads as promo or comedy) |

In footage mode, a source shot that already moves keeps its own move. Add a cue only to a still shot,
and only one move per shot (`style-cinematic-long`, rule on added movement).

## Space: keep the audience oriented

- **The 180-degree line.** In a scene with two people (or a person and a goal), keep the camera on one
  side of the line between them, so each looks the same way on screen in every shot. Cross it only on
  purpose (a shift in power), or on a move the audience sees.
- **Screen direction.** A journey that goes left to right keeps going left to right; a change of
  direction reads as a turn back. `cine.mjs measure` prints each shot's motion direction; flip only when
  the frame has no text, logos or known landmarks (`style-cinematic-long` boundaries).
- **Eyelines.** If she looks off screen left, the thing she sees must be shot from her right side, so
  the looks connect across the cut.
- **Establish, then go close.** Show where we are before we go into faces, unless disorientation is the
  point. Re-establish after a big jump in time or place.
- **Continuity of the person.** The same character keeps the same face, clothes, hair, props and light
  direction from shot to shot. Generated clips break this often: compare every shot of each character on
  the frame sheet before the paper edit.

## Cuts: meaning between shots

- **Juxtaposition (the Kuleshov principle).** Shot A + shot B makes a meaning in neither. A face, then a
  closed door: loss. The same face, then a child running in: relief. Plan pairs, not single shots.
- **Cut on action.** Cut in the middle of a movement (a turn, a reach, a sit) to hide the cut and keep
  momentum.
- **Match cut.** Two shots alike in shape, movement or sound, joined to link two times or places (the
  candle, then the sunrise). `MATCH CUT TO:` in the script.
- **Smash cut.** An abrupt cut from loud to quiet or calm to chaos, for shock or comedy.
- **Cross-cutting.** Two lines of action cut together, so each raises the other's tension (she runs;
  the bag is being sealed). The classic suspense engine.
- **Jump cut.** A visible skip within one shot: time passing, a restless mind. On purpose only.
- **Ellipsis.** Leave out what the audience can infer. Cut from the decision to the consequence, and
  skip the travel in between.
- **J and L cuts.** The next scene's sound starts before its picture (J), or this scene's sound runs
  over the next picture (L). They make cuts feel like thought.
- **Hold.** Not cutting is a choice. A held shot after a turn lets the audience feel it.
- **Dip to black.** The end of a section, or time passing. `black` beats in the beat sheet.

**What wins when cut rules conflict.** Walter Murch (*In the Blink of an Eye*) ranks the reasons for a
cut: emotion first, then story, rhythm, eye-trace, the two-dimensional screen plane and, last,
three-dimensional continuity. He gives each a percentage (emotion 51%), which he presents as a playful
weighting, not a measurement. The ranking is the useful part: when a cut is right for the emotion and
breaks continuity, keep the emotion.

## Sound: half the film

- **Room tone and natural sound** make a place real. Keep the footage's own sound under the music where
  it carries the scene (`style-cinematic-long/references/sound-music.md`).
- **Off-screen sound** extends the world and plants setups (a train horn before we see the station).
- **Silence** is the strongest sound cue: drop the music and the room tone at a turn.
- **Music** tells the audience how to feel; use it to support a turn, not to replace one. A scene that
  only works with music has not been written yet. Change music sections on turns, not in the middle of
  a scene.
- **Voiceover** carries thought, memory or contradiction. When the voice and the picture disagree (she
  says "I was fine", we see her alone in the car), the gap is the story.

## Light, colour and the image system

- **Light says who the character is** (front light open, side light divided, back light hidden). Use
  `style-character-lighting` when the film needs it.
- **One grade for the film**, after matching shots (`style-cinematic-long/references/look.md`). A grade
  change is a story change (the past, a dream, after the turn); make it at a section edge only.
- **Image system.** Pick one or two motifs that repeat and change meaning (a closed window, the colour
  red, hands). Plant them in the opening, vary them in the middle, resolve them in the final image. List
  them in `story.md`.
- **Frame within a frame.** Doorways, windows and mirrors trap or separate characters without a line of
  dialogue.
- **Negative space.** Empty frame beside a character reads as absence, waiting, or something about to
  enter.

## Time and the frame

- **Shot length is emphasis.** Hold what matters; cut fast through what does not. A turn often gets the
  longest hold in its scene.
- **Aspect ratio.** 2.39:1 bars (`rcg cinema`) read as cinema, but they hide the top and bottom of every
  frame: check framing on the snapshots. In 9:16, compose for one subject and vertical movement
  (`style-cinematic-short`).
- **Opening image and closing image.** Plan them together, as a pair that shows what changed.
