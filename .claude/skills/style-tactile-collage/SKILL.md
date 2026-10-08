---
name: style-tactile-collage
description: Edit a video in the Tactile Paper Collage style in rapidContentGen - warm paper, cut-out cards, ink edges, tape, stamps, dotted routes, checklists and marker emphasis over talking-head or full-frame footage. Use when the user asks for a paper collage, scrapbook, notebook, mixed-media, cut-out, zine, handmade or analog look, names this style, or drops a video with a prompt that matches it. Runs inside the video-job workflow.
---

# Tactile Paper Collage

This skill owns the look. The `video-job` skill still owns intake, working mode, transcript,
voiceover, mix, render and report: follow it, and use this skill at its beat-sheet and build steps.

- Pack: `library/styles/tactile-collage/` (tokens, fonts, `frame.md`, `components.mjs`).
- Tool: `node tools/rcg.mjs style ...` (`list`, `show`, `apply`, `add`, `build`).
- Captions: `rcg captions --style collage` (Courier Prime card, marker emphasis).
- Ported from github.com/audrey-560/hyperframes-tactile-collage (MIT), see `docs/PROVENANCE.md`.
- Regression: `regression/R9/README.md` (job `jobs/2026-10-08-r9a-style-collage`).

Read before planning: `references/scene-grammar.md` (which paper object for which beat) and
`references/layering-safe-zones.md`. Before motion, captions or sound: `references/motion-captions-audio.md`.
For visual judgment: `references/style-system.md`.

## Fast path: a new video in this style

1. **Intake** (video-job steps 1-3): `rcg new-job`, mode, transcript or voiceover word times.
2. **Apply the pack:** `node tools/rcg.mjs style apply --job jobs/<id> --style tactile-collage`.
   It copies the two fonts into `assets/fonts/`, writes `frame.md` (keeps an old one once as
   `frame.pre-tactile-collage.md`), adds tokens and `@font-face` to `index.html`, and a Style line to
   `JOB.md`. If the user gave brand colours or logos, record them under "Approved entities" in
   `frame.md` and remap the accents there (keep the roles; no more than three accents per frame).
3. **Map the footage before placing anything.** Snapshot the bare footage at 4-6 times across the clip
   (`rcg hf --cwd jobs/<id> snapshot --at ...`) and READ it. Write down in `JOB.md`: where the face and
   head travel (the highest point the head reaches matters most), gestures and held objects, and the
   regions that stay clear for the whole clip. In R9a the head rose to y 380 late in the clip, so the
   clear band was only y 192-450. A clear first frame proves nothing about the rest.
4. **Beat sheet** (video-job step 4): one dominant idea per beat. For each beat pick the narrative
   function and its construction from `references/scene-grammar.md`, and one layout mode:
   `direct-overlay` (paper objects in clear regions), `behind-subject` (needs a cut-out) or
   `full-frame` (`paper-ground` first). Record the components in each beat's `build` notes.
5. **Write `data/style-plan.json`** (shape below) and build everything in one step:
   `node tools/rcg.mjs style build --job jobs/<id> --spec jobs/<id>/data/style-plan.json --sfx --insert`.
   It refuses any box outside the text-safe area (x 64-900, y 192-1536, tilt included); move or
   shrink the item rather than reaching for `--allow-edge`.
6. **Behind the subject** (optional): `rcg matte` and `rcg pnp` (video-job step 6), then AFTER every
   `style build`: `rcg layer --job jobs/<id> --id <item> --behind p1` for paper behind the subject and
   `--z 40` for items that must stay in front. A rebuild wipes the layer marks; re-run them.
7. **Captions** per voice line: `rcg captions --job jobs/<id> --words <audio_meta.json|words.json>
   --voice vo1 --style collage --mode phrase --start <voice start> --id cap-vo1 --emphasis <one word> --insert`.
8. **Audio:** with style SFX placed, level voices to `--lufs -14 --ceiling -3.6` (R9a: -1.5 dBTP voices
   plus SFX peaked over the ceiling and `rcg render` refused). Then `rcg mix-check` must say `MIX OK`.
9. **Check, look, render:** `rcg hf ... check`, snapshots at the start, middle and end of every beat,
   fix collisions, then `rcg render`. Read `renders/final-sheet.png` AND extract one full-resolution
   frame of the densest text from the MP4 (`ffmpeg -ss <t> -i renders/final.mp4 -frames:v 1 x.png`):
   in R9a the render dropped word spaces that the snapshot showed (fixed in the tool since).

## Plan file

```json
{ "style": "tactile-collage", "items": [
  { "component": "headline", "id": "h1", "start": 0.2, "duration": 2.8, "text": "Every big idea starts *messy*", "y": 320, "h": 240, "size": 92, "highlight": true },
  { "component": "paper-card", "id": "n1", "start": 3.1, "duration": 3.2, "variant": "note", "text": "Write it *all* down|on paper first", "y": 340, "w": 680, "h": 250, "size": 60 },
  { "component": "paper-ground", "id": "g1", "start": 6.3, "duration": 3.15, "texture": "dots" },
  { "component": "checklist", "id": "cl1", "start": 6.45, "duration": 2.95, "title": "Three small steps", "items": "Pick one idea|Make it small|Ship it today", "times": "0.75,1.25,1.75", "y": 650 },
  { "component": "route", "id": "r1", "start": 8.0, "duration": 1.4, "x1": 300, "y1": 960, "x2": 560, "y2": 1080, "bend": -0.5, "draw": 0.5, "sfx": false },
  { "component": "stamp", "id": "st1", "start": 8.45, "duration": 0.95, "text": "DONE", "x": 620, "y": 1150, "w": 420, "h": 190, "colour": "resolve" }
]}
```

`x`, `y` are the item's CENTRE in output pixels (x defaults to the safe-box centre, 482); `w`, `h` its
box. In text: `|` breaks a line, `*word*` is marker emphasis. `times` inside a component are local
(seconds from the item's start). `"sfx": false` on an item skips its sound. Items stack in plan
order, later on top: put a `scribble` after the thing it circles (R9c hid a circle under its card). Every param:
`node tools/rcg.mjs style show tactile-collage`.

| Component | Use it for | Sound |
|---|---|---|
| `paper-ground` | full-frame paper world (dots, ruled, grid, plain); first in a full-frame beat | none |
| `paper-card` | one statement; `variant: note` = ruled notebook paper in marker | place |
| `headline` | a big statement straight on the frame; words land in spoken order | place |
| `stamp` | verdict, status, chapter change | stamp |
| `checklist` | ordered work; rows appear and get checked | one per check |
| `route` | dotted path between two points: transfer, learning, dependency | draw |
| `file-tag` | a named artifact handed along (`from` = direction of travel) | tag |
| `scribble` | underline, circle, arrow, cross, box drawn once for emphasis | none |
| `taped-photo` | evidence: a still (`assets/...`) on a taped sheet with a caption | place |

Stills for `taped-photo`: `ffmpeg -ss <t> -i assets/<clip> -frames:v 1 -q:v 2 assets/stills/s1.jpg`.

## Boundaries

- Keep the story, cuts, narration, timing, claims and copy. Change them only when asked.
- Protect, in order: face and mouth, gestures and held objects, source UI and text, logos,
  captions, collage objects, texture. Move or remove the lower item.
- One hero object and at most one support object per beat. No decorative clutter, no stickers that
  do not explain anything, no cartoon characters the story does not need.
- Do not force the default palette over approved brand colours. Text uses the `-ink` shades of
  signal and resolve (contrast); keep that rule when remapping.
- Never copy people, screenshots, palettes or story ideas from a reference video.
- No `--allow-edge` for load-bearing text. Nothing load-bearing in the bottom 20 % or right 180 px.

## Known gaps

- The SFX library has no paper sounds (paper slide, tape, stamp thud). The pack maps to the closest
  measured sounds at low volume. Ask before downloading real ones.
- No transcript-to-plan generator: the plan is written by hand from the beat sheet (it is short).
