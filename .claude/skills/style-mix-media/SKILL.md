---
name: style-mix-media
description: Make a Mix Media video in rapidContentGen - a handmade cork-board scrapbook built piece by piece in stop-motion (the user's Hi.Boly director's bible and reference videos Video-84385 / Video-41225). The person from the user's video becomes a real photo cut-out with a torn cream paper edge (still poses and a moving 12 fps cut-out), objects from the frames become vintage stickers, every word is handwritten on torn notebook paper, illustrated vintage props pop in with pins and tape, a diary voiceover (MeloTTS or Kokoro) carries the story. Use when the user asks for mix media, mixed media, cork board, scrapbook, paper doll, stop-motion collage, diary or journal style, "Hi.Boly" / "Boly", or a video like those references. Runs inside the video-job workflow.
---

# Mix Media (cork-board scrapbook)

This skill owns the script, the cut-outs, the scene plan and the look. The `video-job` skill still
owns intake, the working mode, the mix rules, render, report and the final send.

- Pack: `library/styles/mix-media/` (tokens, Caveat font, `frame.md`, 7 components, 25 drawn
  vintage stickers in `stickers.mjs`). Captions (optional): `rcg captions --style mm-slip`.
- Cut-out tool: `node tools/rcg.mjs mix-media prep | boards | pose | object | sticker | sheet`
  (`tools/recipes/mix-media.mjs`, image work in `tools/media/mixmedia_art.py`).
- Timing: `rcg infographics place-voice` and `resolve` (word anchors; a `board` opens a scene).
- Sounds: `paper-place`, `pin-click`, `tape-peel`, `sticker-press`, `pencil-scribble` in
  `library/sfx/` (made here by `tools/audio/paper_sfx.py`, no third-party rights).
- Voice: `rcg voice say --engine melo` (MeloTTS through `bin.meloPython`) or the Kokoro default.
- Learned from the user's guide and two reference videos, technique only: `references/reference-analysis.md`.
- Test job: `jobs/2026-10-11-mix-media-test` (Video_for_testing.mp4, MeloTTS, 32.7 s, 8 scenes).

Read before planning: `references/scene-grammar.md`. Before cutting anything:
`references/cutouts.md`. Before timing, sound or render: `references/motion-sound.md`. Before
writing a script or voicing it: `references/script-voice.md`.

## The look in one paragraph

Every frame is a cork board with a thin wooden frame. Each scene changes only the overlay on it
(bare, newspaper clippings, kraft paper, a gingham swatch, watercolor paper; `mat` is the green
cutting mat of the reference videos). The person is the only character: a real photo cut-out with an
irregular torn cream paper edge, never illustrated, no outline, no shadow. Every word is handwritten
in black ink (Caveat) on a torn piece of paper that is pinned or taped. Props are illustrated
vintage stickers with a white die-cut border. Nothing slides or fades: pieces pop in on discrete
frames, one per beat, on the spoken words. Scenes change by hard cut.

## Fast path

1. **Job:** `node tools/rcg.mjs new-job --name <slug> --video <clip> --mode <a|b|c> [--prompt-file <brief>]`,
   then `node tools/rcg.mjs infographics scaffold --job jobs/<id> --duration <s>` (graphics only)
   and `node tools/rcg.mjs style apply --job jobs/<id> --style mix-media`.
2. **Look at the footage** (the intake sheet, then frames every second). Note each distinct pose and
   what the body says (on the phone, laughing, reading, waving, holding a cup) and the objects in
   hand. Write them in `JOB.md`.
3. **Cut-outs** (run in the background; matte about 0.5 s per source frame on CPU):
   `node tools/rcg.mjs mix-media prep --job jobs/<id> --src assets/<clip> --times 1.5,4.5,8.9,13.3 --objects "cup,cell phone"`.
   Without `--times` it picks distinct silhouettes, which can miss the poses the story needs: give
   the times from step 2. READ `data/mm-cutouts.png` and name the poses in `JOB.md`. Objects the
   detector misses: `mix-media object --at <s> --box x,y,w,h --name <name>` (GrabCut in the box).
4. **Script** (topic or brief: write it; the user's script: keep it word for word): diary voice,
   short sentences, hook / build / turn / close, 30-60 s, about 3 words a second. Fit the script to
   what the footage shows. `references/script-voice.md`. Lines in `data/vo-lines.json`.
5. **Voice:** `node tools/rcg.mjs voice say --engine melo --lines jobs/<id>/data/vo-lines.json --out-dir jobs/<id>/assets/voice --speed 1.0 --skip-silences`
   (Melo loads for 80-150 s, run it in the background). Check every line: `alignment.matched_fraction`
   under 0.8, then transcribe it and read what Whisper heard. Re-take or rephrase misheard words
   (`references/script-voice.md`). Level: `node tools/rcg.mjs level --dir jobs/<id>/assets/voice --lufs -14 --ceiling -3.6`.
6. **Music** (lo-fi, acoustic or soft piano; pick by measurement when nobody can listen):
   `node tools/rcg.mjs level <bed> jobs/<id>/assets/bed-limited.wav --lufs -18 --ceiling -2.5`, then
   `node tools/rcg.mjs infographics place-voice --job jobs/<id> --lead 0.55 --gap 0.4 --gaps "vo8:0.8" --tail 1.8 --music assets/bed-limited.wav --music-volume 0.5 --duck 0.28`.
   Longer gaps at scene turns give the voice room to breathe.
7. **Boards** for the scenes (one per scene; a repeated overlay takes a variant):
   `node tools/rcg.mjs mix-media boards --job jobs/<id> --overlays bare,newspaper,kraft,fabric,watercolor,bare-2`.
8. **Plan** `data/mm-plan.json` with word anchors (shape below, grammar in `references/scene-grammar.md`), then
   `node tools/rcg.mjs infographics resolve --job jobs/<id> --plan jobs/<id>/data/mm-plan.json` and
   `node tools/rcg.mjs style build --job jobs/<id> --spec jobs/<id>/data/style-plan.json --sfx --insert`.
   Read the whole build output: a note outside the text-safe area is an ERROR (narrow it with `w`).
9. **Captions** (optional; the notes already carry the key words): per line,
   `rcg captions --job jobs/<id> --words jobs/<id>/assets/voice/audio_meta.json --voice vo1 --style mm-slip --mode word --y 1460 --start <line start> --id cap-vo1 --insert`.
10. **Check:** `rcg mix-check` (MIX OK), `rcg hf --cwd jobs/<id> check` (0 errors), snapshots at
    the end of every scene and one full-resolution crop of the densest scene. READ them.
11. **Render:** `node tools/rcg.mjs render jobs/<id> --fps 24 --workers 3`, read
    `renders/final-sheet.png`, report as the video-job skill says. Credits for collected files
    (`rcg assets credits`) go in `report.md`, never on screen.

## Plan file

```json
{ "style": "mix-media", "duration": 32.66, "items": [
  { "component": "board", "id": "s1-board", "start": 0, "end": "scene", "overlay": "bare" },
  { "component": "live", "id": "s1-boly", "start": 0, "end": "scene", "mediaStart": 0.6, "x": 600, "y": 1290, "h": 1000, "at": 0.12 },
  { "component": "note", "id": "s1-note", "start": 0, "end": "scene", "text": "I almost didn't *answer*", "w": 600, "x": 460, "y": 400, "size": 80, "attach": "pin",
    "at": "@vo1:I-0.08", "times": "@vo1:I,@vo1:almost,@vo1:didn't,@vo1:answer" },
  { "component": "sticker", "id": "s1-phone", "start": 0, "end": "scene", "kind": "phone", "x": 820, "y": 690, "size": 190, "at": "@vo1:call-0.05", "wiggle": 3 },
  { "component": "tone", "id": "s1-tone", "start": 0, "end": "scene", "mood": "warm", "amount": 0.6 },
  { "component": "board", "id": "s2-board", "start": "@vo2:It-0.12", "end": "scene", "overlay": "newspaper" },
  { "component": "cutout", "id": "s2-boly", "start": "@vo2:It-0.12", "end": "scene", "src": "assets/mm/pose-5.png", "x": 640, "y": 1300, "h": 960, "at": "@vo2:It-0.12" }
]}
```

Every item of a scene starts with its board and ends with `"end": "scene"` (the next board: a hard
cut). `at` is when the piece pops in (an anchor or local seconds); `times` are the note's word pops.
Anchors: `@vo1:word`, `@vo1:word#2`, `@vo1:word$` (its end), `@vo1.3`, `+0.1` / `-0.08`. `x`, `y` are
the centre; later items stack on top. A pose swap inside a scene (stop-motion replacement): end one
`cutout` at `"@vo4:picked"` and start the next there. Every param: `node tools/rcg.mjs style show mix-media`.

| Component | Use it for | Sound |
|---|---|---|
| `board` | the scene's world: `overlay` bare, newspaper, kraft, fabric, watercolor, mat (or a variant such as `kraft-2`); `mood` warm, neutral, cool, golden | none |
| `live` | the person moving (laugh, gesture): the 12 fps torn-paper cut-out from `mediaStart` | place |
| `cutout` | a still pose (`assets/mm/pose-<n>.png`), `tone` none, cool, golden, sepia | place (+ attach) |
| `note` | every word: `paper` lined, plain, grid, kraft, postit, masking, slip; `attach` pin, tape, washi, masking, clip, paperclip, none; `*word*` highlighted | place or tape (+ attach) |
| `sticker` | a drawn vintage prop (`kind`, 25 kinds) or an image sticker (`src`: an object or collected print); `img` for polaroid, stamp, oval; `wiggle` | sticker, pin or tape |
| `doodle` | a marker mark: circle, underline, arrow, sparkle, heart, star, cross, route, squiggle; drawn in steps, line boil | scribble |
| `tone` | last item of a scene: the mood veil (cool = sad or lost, golden = grateful), vignette, exposure flicker | none |

## Boundaries (the guide's standing rules)

- Text never floats: every word is on a paper piece. No motion-graphics text, no UI overlays.
- The person is always a real photo cut-out with a torn paper edge, never illustrated or AI-styled.
  Do not run `--illustrate` on the person. They are the only character: no portraits or faces
  inside props other than stills of the same person (polaroids, oval frames).
- Props are illustrated vintage stickers, never photorealistic. An object cut from the footage
  goes through the sticker treatment (`mix-media object`, illustrated by default).
- The cork board is always the base world; only the overlay changes. 9:16 always.
- Stop-motion pops only: never slides, fades or eases. Scene changes are hard cuts.
- 4-6 props per scene, at least two textures, at least two attachment methods. Vary overlays,
  attachments and props between scenes. Every frame passes the scrapbook test.
- Keep the user's story, script and claims. Facts in a script are true or clearly personal.
- "Hi.Boly" and "Boly" are names from the user's guide. Do not write them on screen unless the user
  says the video is for that brand; the character is the person in the user's footage.
- Credits never appear on screen: a learned rule in `video-job` (every job).
- Ask before downloads and installs, as the workspace rules say, unless the user already allowed them.

## Known gaps

- Objects under about 200 px in the source (a cup in a hand at 1080p) become rough stickers after
  the illustration pass. Prefer the drawn sticker of the same object, or show the object held by
  the person in a pose cut-out.
- The selfie matte loses white objects on a white background in some frames (the cup in the test).
- No camera move (the guide's slow push-in is optional; the board stays still).
- No typewriter type-on of the reference videos: the guide forbids typewriter text. Words pop in.
- MeloTTS mispronounces some words (the test: "laughed" heard as "left", "unread emails" as
  "unready meals"); check with Whisper and rephrase.
- The person speaking in the source clip (a talking head) is untested here: their own audio would
  be the narration (transcribe it for anchors) and `live` `mediaStart` must follow the same clock.
