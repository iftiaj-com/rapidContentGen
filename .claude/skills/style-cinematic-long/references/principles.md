# The ten rules, adapted to an editor

Source: an article by a travel filmmaker on ten rules for cinematic videos, pasted by the user on
2026-10-14 (it goes with a tutorial video by the same author, which was not watched here). The article
is about shooting and editing. rcg only edits footage the user already shot, so each rule below says
what it means here: what code measures, what you judge, and which tool does the work. Both
`style-cinematic-long` and `style-cinematic-short` use this file.

The article's own idea runs through all ten: most of this is meant to go unnoticed. Good flow and good
sound design are not seen, but when they are wrong the viewer notices.

## 1. Make the shots flow

A sequence flows when its shots look as if they belong together and were placed on purpose.

**Ways to get flow, in order of preference:**

| Way | What it means | How here |
|---|---|---|
| Same screen direction | Consecutive shots move the same way (all left, all pushing in) | `shots.md` gives each shot's screen motion and speed. Order runs by it |
| Same subject | The next shot shows the same person, object or place from another view | Judge from the sheet. Group shots by subject before ordering |
| Continued action | An action carries over the cut: a step, a turn, a ball in flight, a door opening | Cut on the action. Set `in` / `out` so the motion carries over the cut. Check the two frames on either side of the cut |
| Matched speed | Neighbour shots move at a similar speed; a ramp bridges a change | Compare `%/s` in `shots.md`; set `speed` in prep, or `rcg ramp` (see rule 7) |

**Three fixes for a shot that does not fit a run** (from the article, with the checks that keep them
honest):

1. **Crop move.** Zoom into a still shot and move the crop in the run's direction.
   `rcg camera` with a pan or slow zoom preset on the shot's wrapper (`vc.pan_left_to_right`,
   `vc.pan_right_to_left`, `vc.slow_zoom_in`, `vc.ken_burns`). Needs zoom room: `shots.md` prints it per
   source (4K into 1080p gives 2x; 1080p into 1080p gives none, so the move upscales and softens the
   picture). The preset names do not say which way the picture content moves. Snapshot the start and
   end, or measure the render, before relying on it.
2. **Flip** (`"flip": true` in prep). It mirrors the shot, so its direction reverses. Do not flip a shot
   with readable text, signs, logos, number plates, a known landmark, a car's steering side, or a person
   whose handedness or parting shows. Look at the frame first.
3. **Reverse** (`"reverse": true` in prep). It plays the shot backwards. Do not reverse people walking,
   animals, water, waves, smoke, fire, falling things, traffic or anything that shows gravity. Reversing
   works best on drone shots, slow pans over still landscapes and slow push-ins (reversed, a push-in
   becomes a pull-out).

After a flip or reverse, `cine.mjs measure --src assets/cine/<id>.mp4` confirms the new direction.

**Flow of energy.** The article extends flow to emotion: keep one energy per section and change it at a
section edge. In the beat sheet, give each section a mood word and check every shot against it.

## 2. Sound design that sits under the picture

Sound design (not the music) makes the picture feel alive: impacts on big visual changes, whooshes on
fast moves, risers into a peak, ambience under everything. The article's example stacks five sound
layers under one ten-second drone shot. It also says sound design should never sound added on.
Details and levels: `sound-music.md`.

## 3. Music that matches the mood

The right music sets the tone and fits the energy of the shots. Change tracks (or sections of one track)
when the energy of the footage changes. Use only music the user supplied or has cleared. Never use a
popular song they have not cleared: it can get the video muted, flagged or demonetized. The article's
author says he did this until 2020. Details: `sound-music.md`.

## 4. Add movement, but not everywhere

Movement makes a shot more engaging. In the edit, a still shot can move by:

1. a crop move (rule 1);
2. a slow push in on the subject, which makes the moment feel dramatic (`vc.slow_zoom_in`, `dolly_in`);
3. a zoom with a slow roll, which makes an ordinary drone shot feel like an FPV flight
   (`vc.cinematic_zoom_pan`, `vc.dutch_angle_drift`). It needs zoom room, or the corners show.

Do not move every shot. Moving shot after moving shot tires the viewer. As a starting point, leave about
one shot in three as shot (still or with its own camera move), and never add a move to a shot that
already moves (`shots.md` says which ones do). Added moves are slow: they should feel like a camera
operator, not an effect.

## 5. Variety

Flow gives continuity; variety keeps it from getting dull. Show the same subject from different
distances, angles and details: wide (where we are), medium (who or what), close (the face, the hands),
detail (texture, an object), plus a different angle (high, low, over the shoulder, a drone).

- `shots.md` gives a rough size per shot (from a face detector). Confirm sizes on the sheet.
- Avoid two neighbour shots of the same subject at the same size and angle: it reads as a jump cut.
- A strong run often goes wide, medium, close, detail, then back out.
- In short-form edits variety matters more: viewers there have less patience (the article's point).
- When the footage lacks a size (no close-ups at all), say so in the report. A punch-in crop on a wide
  shot can stand in for a close-up only when there is zoom room.

## 6. Stable shots

The article's ways to get stable shots are about filming: drones, gimbals, a slow bent-knee walk, and
three points of contact. In the edit they become:

1. **Choose the steady takes.** When there are several takes, prefer the one `shots.md` marks steady.
2. **Trim to the steady part.** Shake is often worst at the start and end of a take.
3. **Stabilize lightly** (`"stabilize": true` in prep: vidstab, or `{"engine": "deshake"}`). Prep
   measures shake before and after. Strong stabilization on big shakes warps the picture (the article
   warns about this): check the frame for wobbling edges, and drop the shot if it warps.
4. **Slow it down,** but only when the source was shot at a high frame rate (prep refuses otherwise).
   Slowing smooths every small shake.
5. **Leave a little life in it.** The article notes that modern series keep some intended handheld
   motion as a style choice. Light shake on a handheld scene can stay. Strong, jerky shake cannot.

Shooting notes: when the footage was weak (much shake, no close-ups, no shots with motion), add two or
three short tips to the report for the next shoot: a gimbal or a stable rest point, the slow bent-knee
walk, more angles of each subject, and holding each shot for a few seconds.

## 7. Edits that do not look edited

- **Motion blur on every sped-up shot.** A sped-up shot without blur gives away an amateur edit.
  Prep blends the source frames that collapse into each output frame (`tmix`). That is the shutter
  blur a real camera would have recorded at that speed.
- **No fake slow motion** from 24, 25 or 30 fps footage (lessons 5).
- **Crop moves inside the zoom room**, at a slow, steady speed, with no edge showing.
- **Ramps:** `rcg ramp` changes speed inside HyperFrames without blur. Keep ramps short, or prep the
  fast part with blur and cut to it.
- **Cuts over effects.** Hard cuts, match cuts and dips to black. Effects only on request.

## 8. Correct first, then grade

- **Colour correction** has a right answer: shots of the same scene should match in exposure, white
  balance and saturation, especially across cameras or times of day. Prep does this by measurement
  (`"match"` in `prep.json`) toward the median of the shots in the edit, or toward a chosen hero shot.
- **Colour grading** is taste: one look over the whole edit (`look.md`). Popular looks such as teal and
  orange (`teal-orange`) are a choice, not a requirement. With no instruction, use `natural-film`.
- Grading never hides a bad match: match first, then put one grade on every shot.
- A shot that is meant to look different (night, a flashback) gets `"match": false` and a reason in the
  beat sheet.

## 9. Do not get married to shots

Include a shot because it serves this story and this music, not because it is good. Ask of every shot:
"Is it needed in this video?" The article's author says he uses at most about 60% of his good shots.
That is his habit, not a target. With mixed footage, plan to leave out a lot.

- Write the kept list and the left-out list (with a one-line reason each) into the beat sheet notes and
  the report, so the user can ask for a shot back.
- In modes (a) and (c), the user sees and approves the selection with the beat sheet.

## 10. Break the rules on purpose

These rules are defaults. When the story needs a break (a sudden still frame, a jarring cut, a shaky
shot for panic), make it and write down why. The user's prompt always wins over these defaults.
