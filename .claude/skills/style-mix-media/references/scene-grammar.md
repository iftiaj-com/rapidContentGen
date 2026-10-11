# Scene grammar

A video is a sequence of cork-board scenes. Each scene is one board with one overlay, built up
piece by piece on the voice, then a hard cut to the next board.

## Story arc to scenes

| Part | Share | What the board does |
|---|---|---|
| Hook (0-3 s) | one short scene | board, the person pops in on beat 1, one note with the hook words, one prop |
| Build | 2-4 scenes | pieces accumulate: notes on key words, props that explain, a pose that fits each line |
| Turn | 1-2 scenes | the mood changes: `board mood` and `tone` cool (sad, lost) or a new composition |
| Close | the last scene | warm or golden; the final line on the biggest note; a pose that echoes the hook |

One scene per line or per two short lines. Scenes of 2.5-6 s at about 3 words a second.

## Overlays

Rotate them so no two neighbouring scenes share one: bare, newspaper, kraft, fabric, watercolor.
A sixth scene repeats one as a variant (`kraft-2`, `bare-2`): same material, new layout. Match
the material to the line when you can: newspaper for busy or outside-world lines, kraft for plain
practical beats, fabric for home and family, watercolor for memories and dreams, bare for quiet or
sad beats. `mat` (green cutting mat) is for a reference-style video when the user asks for it;
then use it for every scene.

## The person

- The person pops in during the first one or two beats of a scene, usually lower centre
  (`y` 1290-1320, `h` 940-1000), the head in the upper middle third of the frame.
- Choose the pose by what the line says: on the phone for a call, reading for "the emails",
  laughing for joy, smiling with a cup for calm. A `live` cut-out when the footage itself acts the
  line (a laugh), still poses elsewhere.
- Pose arc: the close echoes the hook (the same pose or the same action, grown: reluctant on the
  phone, then laughing on the phone).
- A pose swap inside a scene is a stop-motion replacement: same place, the next pose on a word.
- `tone` on a still (cool, golden) follows the scene's mood.

## Notes (the words)

- One note per line, carrying its key words (not always every word), each word popping on its
  spoken time. One highlighted word (`*word*`) per note at most.
- Paper by role: `lined` for the main statement, `slip` for a short aside, `postit` for a number or
  a fact, `masking` for a label next to a prop, `grid` for a question, `kraft` for a memory.
- Notes stay in the text-safe box (x 64-900, y 192-1536); keep them above the person's head band.
- Wrap long lines with `w` (the paper grows taller, not wider).

## Props

- 4-6 per scene, each popping on the word it explains. Mix materials (paper, fabric star, metal
  clip, photo, map). Repeat a kind across scenes only for a reason (envelopes = the emails).
- Drawn kinds: star (gingham, glitter), heart, flower, pressed flower, sparkle, camera, boat,
  plane, balloon, map, stamp, ticket, polaroid, postcard, film, envelope, clock, cup, phone,
  oval frame, label, calendar, flag, cloud (rain), butterfly.
- Image stickers: objects cut from the footage (`mix-media object`) and public-domain prints made
  into stickers (`mix-media sticker --cut light`). The Met (CC0) has trade cards, botanical sheets
  and maps; skip any print that shows another person's face (one character only).
- Stills of the same person go inside polaroids and oval frames (`img`): her "old photos".
- `wiggle` (1.5-3.5 degrees) on a few small pieces per scene: a buzzing phone, a star.

## Attachments

Per scene, two or three methods: a pinned note, a taped polaroid, a washi strip, a clipped kraft
card, a sticker glued flat (`attach: none`). The tool keeps every attachment off the words.

## Doodles

One or two per scene at most: a cross over a word the speaker takes back ("busy"), a sparkle at a
buzzing phone, a heart at the close. Put a doodle after the thing it marks in the plan.

## Layout map (1080x1920)

| Zone | y | Use |
|---|---|---|
| header (app UI) | 0-192 | board only |
| note band | 220-780 | notes, the props that explain them |
| side columns | x 100-260 and 760-900 | small props beside the person |
| person | 740-1780 | the cut-out (decor may enter the bottom 20 %) |
| caption slip (optional) | about 1460 | `mm-slip` captions over the person's waist |
