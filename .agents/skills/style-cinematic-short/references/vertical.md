# Vertical: reframe, hook, pace and loop

## Reframing landscape footage to 9:16

A 9:16 window inside a 16:9 frame keeps about a third of the width. Choose it for each shot; a centred
crop is rarely the best one.

**Where the window sits** (`reframe.x` in `prep.json`, 0 = left edge, 1 = right edge):

- On the subject. When the subject moves inside the shot, set the window where it spends most of the
  shot, or pan with it.
- On the lines of the picture: a horizon or a road works best when it leads into the window, not when
  it is cut at the edge.
- Leave room on the side the subject faces or moves toward (lead room).

**Pan the window** (`reframe.x: [from, to]`, an eased move over the whole clip) when:

- the shot is still and the run needs motion in one direction (rule 1's crop move, done in prep);
- the subject crosses the frame slowly and the window can follow it.

A window moving right makes the content move left on screen. Pan in the run's direction, and keep the
pan slow: across the whole width in under about 2 s it reads as a whip.

**People:** use the face track instead of `reframe`, so the window follows the face:
1. prep the clip without `reframe` (trim, colour, stabilize as needed);
2. `rcg track --job jobs/<id> --src assets/cine/<id>.mp4 --debug --name <id>` and READ its sheet;
3. on the shot's wrapper: `rcg camera --job jobs/<id> --target "#w<n>" --track data/track-<id>.json
   --cue "<start>:face.follow:z=1.0:x=0.5:y=0.4:d=0"`. A 16:9 clip is reframed to 9:16 by the face cue.

**Sharpness:** prep notes the upscale of every reframe. About 1.8x (1080p landscape) is soft on a phone
but usable for fast cuts. Prefer the user's 4K or vertical shots for the hook and for long holds. Do not
add a zoom on top of an upscaled reframe.

## The hook (first 1-2 s)

- Open on motion or a striking picture, at full energy, with the music already playing. No fade in
  from black, no logo, no slow establishing shot. (The 2-frame black block before a graded first shot,
  SKILL.md step 8, is too short to read as a fade.)
- Options: the strongest shot; the peak moment shown first (a flash-forward), then build back to it;
  a close detail that makes the viewer ask "where is this?".
- A sound on the first cut (a soft impact or the music's downbeat) helps the hook land.
- If the user wants a word on screen, keep it short (one to four words), in the top band, on screen
  for at least about 1 s.

## Pace

- Cut on beats in the energetic stretches and on downbeats for big changes (`rcg beatgrid`).
- Starting shot lengths: about 0.8-2.5 s; a hero shot can hold about 3-4 s when it moves well. Adjust
  to the tempo: at a slow tempo, cut every two beats, not every beat.
- Hold variety tight: no two neighbour shots of the same size and angle on the same subject.
- Speed-ups (prep `speed`) suit transitions between places. Keep the blur.

## The loop

Short videos replay. A seamless loop keeps viewers for a second watch.

- End on a shot whose motion or subject leads into the first shot: the same direction, the same
  subject, or a match on action.
- End the music on a phrase that can run into the start, or cut at a downbeat that matches the first
  frame's energy. No fade to black at the end unless the user asks.
- Check: snapshot the last frame and the first frame side by side, and play the last 2 s into the first
  2 s in the preview.

## Safe zones (9:16)

Text never goes in the bottom 20% (y >= 1536), the right 180 px (x >= 900) or the top 192 px
(pitfall 7). Keep faces and the key action out of those zones too where you can: the app's buttons and
captions cover them.
