# What was learned, and from where

Sources the user gave on 2026-10-11 (all in `D:/Video/mix media edits/`, read for technique only;
no people, footage, copy, brand marks or screenshots were copied into the pack):

- `HiBoly_Directors.pdf`, "Hi.Boly Director's Bible: Visual Language System for Agent One" (8 pages),
  the same text as the "Mix Media Guide" the user pasted. It is the authority for the look.
- `Video-84385.mp4` (92.5 s, 720x1280, 30 fps) and `Video-41225.mp4` (42.1 s, 720x1280, 30 fps):
  two finished mix media Reels.
- `steps.md.txt` (Canva Magic Grab: cut the subject out of a photo, layer it, text behind it,
  stickers, paper texture), `intro.md.txt` (one word per text box, Pop or Wiggle, about 0.3 s
  stagger), `logic.md.txt` (brief, locked roles and brand context, iterate).

## The guide (rules the pack enforces)

| Area | Rule | Where it lives |
|---|---|---|
| World | cork board, thin wooden frame, in every scene; only the overlay layer changes (bare, newspaper, kraft, fabric, watercolor) | `board`, `rcg mix-media boards` |
| Character | real photo cut-out, irregular cream/yellow torn paper edge, no outline, no shadow, never illustrated | `mixmedia_art.py torn` / `live`, `cutout` |
| Pose arc | assign poses by emotion; repeat a pose to echo (scene 1 and the close) | `scene-grammar.md` |
| Text | handwritten black ink on torn lined notebook paper, never floating, paper size follows the text | `note` |
| Props | illustrated vintage stickers, 4-6 per scene, two textures or more, tangible | `sticker`, `stickers.mjs` |
| Attachment | pins, scotch, washi, masking, binder clips, paperclips, glue; two or three methods per scene | `attach` param |
| Palette | base cork, cream, tan; warm and cool pastel accents; vintage sepia, faded red, old gold; mood by temperature | `style.json` tokens, `board mood`, `tone` |
| Motion | stop-motion pops, 1 beat = 1 element (about 1 s), synced to the voice; board first, character in beat 1-2 | `motion` in `style.json`, anchors |
| Sound | paper placing, pin click, tape peel, sticker press; lo-fi, acoustic or soft piano | `library/sfx` paper sounds, beds |
| Transitions | hard cuts, or the last piece hints at the next scene | `"end": "scene"` |
| Camera | straight-on, flat, elements tilted 2-5 degrees, frame filled; slow push-in optional | tilt defaults (push-in not built) |
| Story | hook 0-3 s, build, turn (palette or composition shifts), close; first person, short sentences | `script-voice.md` |

## The two reference videos (measured)

Contact sheets at 1 frame per second and 1 per 1.5 s, scene cuts by ffmpeg scene score
(Video-41225: 24.0, 26.9, 31.6 s; Video-84385: 12.8, 19.2, 29.9, 42.4, 50.0, 61.7, 72.2, 90.4 s).

- **World:** both use a sage-green self-healing cutting mat with a white 1 cm grid, heavier lines
  every 5 cm and cm rulers on the edges, not cork. Constant for the whole video. The pack keeps cork
  as the default (the guide says so) and offers the mat as `overlay: mat`.
- **Character:** the narrator's talking head is a moving cut-out with a thick white sticker border,
  often pasted on a still body (sitting cross-legged with a laptop): a paper doll with a live head.
  Full-body still poses (standing with a laptop, at a desk, with binoculars) carry a white border
  and a slight tilt. The pack does both: `live` (12 fps re-cut, torn cream edge) and `cutout`.
- **Text:** words appear one at a time, typed letter by letter with an underscore cursor
  ("whil_"), in a typewriter serif with a white outline; some words on pink or cyan torn tape
  labels; a one-word caption chip on a white slip under the narrator's chin. The guide forbids
  typewriter text, so the pack keeps the rhythm (one word per spoken word, on paper) in Caveat, and
  offers the chip as the `mm-slip` caption preset.
- **Props:** black-and-white halftone hands (holding a phone, typing, pointing), retro TV, iMac,
  iBook, typewriter, magnifier, folder, alarm clock in coloured pencil, a desk in coloured pencil,
  clouds with rain for a sad beat, halftone lips with speech bubbles, article screenshots printed on
  grainy paper with yellow highlighter and cyan source tags. Pieces pop in about 0.3 s apart and
  build up; the board resets at each scene change.
- **Pace:** a new piece roughly every 0.5-1.5 s; scenes of 5-12 s.

## What the test showed (jobs/2026-10-11-mix-media-test)

- The selfie matte held a white shirt on a white wall, but the white cup in her hand drops out in
  some frames.
- Pose cut-outs at 1920x1080 give about 600x920 px pieces: sharp at 950 px tall on screen.
- The torn edge reads best at 16-18 px border on a 900 px tall cut-out.
- Objects of 80-140 px in the frame (cup, phone) make rough illustrated stickers; drawn stickers
  read better.
- HyperFrames' occlusion check probes the glyph boxes of each word; Caveat letters overhang their
  boxes, so the note text box is padded (`ex`, `exX` in `note`).
