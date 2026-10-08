---
name: skill-info-graphics
description: Make a voice-led info-graphics video (video essay, explainer, faceless Short) in rapidContentGen from a topic alone (the agent writes the script, voices it, designs the motion graphics and the sound) or from the user's script plus imported assets (the agent keeps the words, places the assets, then collects or creates the rest). The look is a new visual every sentence on dark, cream or light-grey grounds - kinetic type with one orange word, equations, stairs and pyramids, social posts, prompt bars with a clicking cursor, orbits, counters, photo plates and collages - every entrance landing on a spoken word, with a one-word black caption chip. Use when the user asks for an infographic, info-graphics, explainer, video essay, faceless or topic-only video, "make a video about X", "here is my script", or names this style. Runs inside the video-job workflow.
---

# Info-graphics essay

This skill owns the script, the scene plan, the assets and the look. The `video-job` skill still
owns intake, the working mode, the mix rules, render, report and the final send.

- Pack: `library/styles/info-graphics/` (tokens, `frame.md`, 12 components). Fonts: Inter and
  JetBrains Mono, both bundled by HyperFrames. Captions: `rcg captions --style info-chip`.
- Assets: `node tools/rcg.mjs assets icon | search | fetch | credit | credits` (`tools/media/assets.mjs`),
  only the approved sources in `references/assets.md` (Phosphor, Unsplash, Pixabay, Pexels by hand,
  Poly Haven, The Met), every file credited in `data/credits.json`.
- Timing tool: `node tools/rcg.mjs infographics scaffold | place-voice | resolve`
  (`tools/blocks/infographics.mjs`). Every visual is planned against a spoken word, not a second.
- Learned from the user's reference Short "Disney vs Midjourney" (YouTube Shorts fZIXlBGaIMs, read
  for technique only, nothing copied). What was measured: `references/reference-analysis.md`.
- Regression: `regression/R13/README.md` (gallery of every component) and the first real job,
  `jobs/2026-10-08-opus-5-5-made-this` (topic mode, 10 s).

Read before writing a script: `references/script-writing.md`. Before planning scenes:
`references/scene-grammar.md`. Before collecting anything: `references/assets.md`.

## Two ways in

| The user gives | The agent makes | The agent keeps |
|---|---|---|
| **A topic** (and maybe a length, a tone, an audience) | the script, the voice (Kokoro), the scene plan, every graphic, the sound design, the captions | facts it can source; anything unsourced is cut or framed as opinion |
| **A script** + some assets (photos, clips, logos, a voice recording, music) | the scene plan, the graphics around the assets, the missing assets (generated or collected with permission), the voice if none was given, the sound | the script word for word, the user's assets, their brand colours (record them in `frame.md` under Approved entities) |

If the request does not say which, it is topic mode when there is no script text. Ask for the mode
(a / b / c) as the video-job skill says, unless the user already said to go ahead.

## Fast path

1. **Job:** `node tools/rcg.mjs new-job --name <slug> [--image <asset> ...] [--video <clip> ...] [--prompt-file <brief>] --mode <a|b|c>`,
   then `node tools/rcg.mjs infographics scaffold --job jobs/<id> --duration <s>` (graphics only) and
   `node tools/rcg.mjs style apply --job jobs/<id> --style info-graphics`.
2. **Script** (topic mode: write it; script mode: split the user's text into lines). One line per
   sentence or two in `data/vo-lines.json`. Budget about 2.6 words a second of finished video
   (10 s = 23-26 words). Facts: `references/script-writing.md`.
3. **Voice:** `node tools/rcg.mjs voice say --lines jobs/<id>/data/vo-lines.json --out-dir jobs/<id>/assets/voice`.
   Read `alignment.matched_fraction` per line (a digit heard as a word, "1" for "One", is fine). Too
   long? Raise `speed` per line (Kokoro 1.0-1.25 reads well) or cut words, then re-voice.
   Level for style SFX: `node tools/rcg.mjs level --dir jobs/<id>/assets/voice --lufs -14 --ceiling -3.6`.
4. **Music bed** (optional): `rcg level <bed> jobs/<id>/assets/bed-limited.wav --lufs -18 --ceiling -2.5`.
   A bed shorter than the video: loop it first with an ffmpeg `acrossfade` of itself.
5. **Place the voice:** `node tools/rcg.mjs infographics place-voice --job jobs/<id> --lead 0.25 --gap 0.3 [--gaps "vo3:0.4"] [--music assets/bed-limited.wav --music-volume 0.6 --duck 0.4] --duration <s>`.
   It prints each line's start and where its speech ends.
6. **Plan** `data/info-plan.json` with word anchors (shape below; grammar in `references/scene-grammar.md`), then
   `node tools/rcg.mjs infographics resolve --job jobs/<id> --plan jobs/<id>/data/info-plan.json` (writes
   `data/style-plan.json` and prints each item's start word) and
   `node tools/rcg.mjs style build --job jobs/<id> --spec jobs/<id>/data/style-plan.json --sfx --insert`.
   Read the whole build output (lesson 13bb).
7. **Captions** per line, at that line's start from step 5:
   `node tools/rcg.mjs captions --job jobs/<id> --words jobs/<id>/assets/voice/audio_meta.json --voice vo1 --style info-chip --mode word --y 1440 --start <s> --id cap-vo1 --insert`.
8. **Beat sheet** `beat-sheet.json` (one beat per scene, `custom` text boxes, absolute `at`) and
   `rcg beat-sheet md`. Gate here in modes (a) and (c).
9. **Check:** `rcg mix-check` (MIX OK), `rcg hf --cwd jobs/<id> check` (the odometer and collage
   overflow notes are intentional; contrast warnings on a photo plate's `-num` digits while it counts
   are clipped digits measured against the photo, not visible text), then snapshots at the end of each scene and READ them. A
   caption `content_overlap` between two lines means the gap before the second line is too short:
   widen it in step 5 and re-run 5-7 (anchors keep the plan valid).
10. **Credits:** every collected file is in `data/credits.json`; paste `rcg assets credits --job jobs/<id>`
    into `report.md`.
11. **Render:** `node tools/rcg.mjs render jobs/<id> --fps 30 --workers 3`, read `renders/final-sheet.png`
    and one full-resolution frame of the densest text (lesson 13ba). Report as the video-job skill says.

## Plan file

```json
{ "style": "info-graphics", "duration": 10, "items": [
  { "component": "ground", "id": "g1", "start": 0, "end": "scene", "tone": "dark" },
  { "component": "stack", "id": "k1", "start": 0, "end": "scene", "text": "One *prompt.*", "align": "center", "y": 600, "h": 220, "size": 132, "times": "@vo1:One,@vo1:prompt" },
  { "component": "prompt", "id": "pr1", "start": 0, "end": "scene", "text": "Video: Opus 5.5 made this", "y": 960, "cps": 32, "clickAt": "@vo1:prompt$+0.08" },
  { "component": "ground", "id": "g2", "start": "@vo2:Opus", "end": "scene", "tone": "cream", "enter": "arc" },
  { "component": "orbit", "id": "o1", "start": "@vo2:Opus", "end": "scene", "label": "Opus 5.5", "items": "Script|Voice|Frames|Sound", "on": "light", "times": "@vo2:script,@vo2:voice,@vo2:frame,@vo2:sound" }
]}
```

Anchors: `@vo1:word` (start of the first match in line vo1), `#2` (second match), `$` (its end),
`@vo1.4` (fifth word), `+0.1` / `-0.12` offsets. `start` and `end` are composition seconds;
`times` and the cue params (`markAt`, `clickAt`, `typeAt`, `countAt`, `arrowAt`, `plateAt`) become
seconds from the item's start. `"end": "scene"` ends an item where the next `ground` starts. Plain
numbers pass through. `x`, `y` are the item's centre (x defaults to 482, the safe-box centre). Text:
`|` breaks a line, `*word*` is the orange accent. Every param: `node tools/rcg.mjs style show info-graphics`.

| Component | Use it for | Sound (`--sfx`) |
|---|---|---|
| `ground` | the scene's ground: `dark`, `cream`, `paper`, `orange`, `white`; enter `cut`, `fade`, `wipe-up`, `wipe-left`, `arc`, `iris` | swipe on a wipe, arc or iris |
| `stack` | kinetic type, words rising from a blur one per `times`; stair offset; `heavy`, `slant`; hand-drawn `arrow` | `sound` param (default none) |
| `equation` | contrast or identity: left, a drawn `= ≠ > < → + ×`, right; `chip` makes a key cap | tick, pop |
| `stairs` | progression or history: `layout` stairs or tower, `steps` "Name:Value|..." | tick per step |
| `pyramid` | hierarchy, class, cost or effort ladders | tick per tier |
| `photo` | one image: frames, mono tone, push, an orange `mark` bar, a `plate` bar whose year can count | swipe, tick |
| `collage` | many examples: scatter, gallery grid or mosaic wall (full frame, no text) | pop per card |
| `post` | a statement as a social post with highlighted words (invented, generic account) | swipe |
| `prompt` | a tool or a request: typing, a cursor click, an optional result image | typing, click, pop |
| `orbit` | one idea with many parts, chips popping on words | pop, tick per chip |
| `counter` | one real, sourced number rolling up | tick |
| `icon` | a Phosphor icon (`rcg assets icon add`) with badge `none`, `disc`, `chip` or `ring` and a label; beside the word it names, or in a row | `sound` param (default pop) |

## Boundaries

- Every claim is true, sourced or clearly opinion. No invented statistics, quotes, dates or
  "studies". Numbers on screen (counter, plate, stairs values) need a source in `report.md`, or they
  are labelled as illustrative. Organization instructions apply to the script too.
- Posts, prompt bars and plates never imitate a real person, account, outlet, product UI or brand.
  Use invented generic names (or the user's own, when given) and your own copy.
- In script mode, the user's words are not edited. A change (length, a fact that looks wrong) is a
  question for the user, not a silent fix.
- Ask before every download (stock photos, archive images, music, fonts), as the workspace rules
  say. Record the source and licence of each collected file in `report.md`.
- One orange word per scene. One hero object per scene; a clause changes one part of it.
- Keep hero objects above y 1360 so the caption chip at y 1440 stays clear; no text in the bottom
  20% or the right 180 px (the pack refuses boxes outside the safe area).
- Never publish or post. Rendering is local.
