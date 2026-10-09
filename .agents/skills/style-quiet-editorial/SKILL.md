---
name: style-quiet-editorial
description: Edit a video in the Quiet Editorial UI style in rapidContentGen - a large serif line, tracked Inter labels, warm near-white canvas, hairline cards, a cursor that selects, progress paths and one green completed state. Use when the user asks for a quiet, editorial, minimal, calm, refined, premium, clean software or product-UI look, names this style, or drops a video with a prompt that matches it. Runs inside the video-job workflow.
---

# Quiet Editorial UI

This skill owns the look. The `video-job` skill still owns intake, working mode, transcript,
voiceover, mix, render and report: follow it, and use this skill at its beat-sheet and build steps.

- Pack: `library/styles/quiet-editorial/` (tokens, `frame.md`, `components.mjs`). All fonts are bundled.
- Tool: `node tools/rcg.mjs style ...` (`list`, `show`, `apply`, `add`, `build`).
- Captions: `rcg captions --style editorial` (card, for busy footage) or `editorial-clean` (unboxed
  ink, for the canvas or a clean wall).
- Ported from github.com/audrey-560/quiet-editorial-ui (MIT), see `docs/PROVENANCE.md`.
- Regression: `regression/R9/README.md` (job `jobs/2026-10-08-r9b-style-editorial`).

Read before planning: `references/layout-modes.md`. Before motion and captions:
`references/motion-captions.md`. For visual judgment: `references/style-system.md`.

## Differences from the reference skill

- **Display face:** EB Garamond 400 (bundled by HyperFrames) instead of licensed Georgia, by the
  user's choice on 2026-10-08. Nothing to install, renders offline.
- **No italic:** no italic cut is bundled, and a synthesized slant looks cheap. `*word*` draws an ink
  underline under the word instead; caption `--emphasis` sets the word in upright EB Garamond.
- **Sizes for phones:** labels 24 px, UI 30 px, body 34 px at 1080 wide (the reference used about 19-28).

## Fast path: a new video in this style

1. **Intake** (video-job steps 1-3): `rcg new-job`, mode, transcript or voiceover word times.
2. **Apply the pack:** `node tools/rcg.mjs style apply --job jobs/<id> --style quiet-editorial`
   (writes `frame.md`, tokens in `index.html`, a Style line in `JOB.md`). Brand colours and logos go
   under "Approved Entities" in `frame.md`, used only on the brand entity or its state.
3. **Map the footage.** Snapshot the bare footage at 4-6 times, READ it, and write down where the face
   travels (its highest point), any source UI or text, and the regions that stay clear for the whole
   clip. In R9b the head reached y 330 in the first second, so the opening headline had to fit in
   y 200-400.
4. **Beat sheet:** one dominant idea per beat; for each, a layout mode (`available-area`,
   `direct-overlay`, `full-frame`) and its objects: one headline plus at most one operational object.
5. **Write `data/style-plan.json`** (shape below), then
   `node tools/rcg.mjs style build --job jobs/<id> --spec jobs/<id>/data/style-plan.json --sfx --insert`.
   Read the WHOLE output: an item that fails the safe-area check prints `ERROR` and keeps its old
   file (R9b lost a fix that way behind `| tail -1`).
6. **Captions** per voice line: `rcg captions --job jobs/<id> --words <audio_meta.json|words.json>
   --voice vo1 --style editorial|editorial-clean --start <voice start> --id cap-vo1 [--emphasis <word>] --insert`.
   2-word groups, one line, 96 px.
7. **Audio:** most beats need no sound. With style SFX placed, level voices to `--lufs -14 --ceiling -3.6`;
   `rcg mix-check` must say `MIX OK`.
8. **Check, look, render:** `rcg hf ... check`, snapshots at every beat, fix, `rcg render`, read
   `renders/final-sheet.png` and one full-resolution frame of the densest text from the MP4.

## Plan file

```json
{ "style": "quiet-editorial", "items": [
  { "component": "headline", "id": "h1", "start": 0.1, "duration": 2.9, "kicker": "One clear idea", "text": "Make the complex feel *clear*.", "y": 300, "h": 200, "size": 70 },
  { "component": "canvas", "id": "c1", "start": 3.0, "duration": 9.0 },
  { "component": "headline", "id": "h2", "start": 3.1, "duration": 2.9, "kicker": "Step one", "text": "One focused draft.", "y": 410, "h": 330, "size": 96 },
  { "component": "doc-card", "id": "d1", "start": 3.4, "duration": 2.6, "label": "Draft", "meta": "02", "title": "Launch notes", "lines": "Collect the notes|Pick one priority|Share by Friday", "status": "In review", "y": 960 },
  { "component": "list", "id": "l1", "start": 6.1, "duration": 2.9, "items": "Collected notes|Focused draft|Ready to review", "selectAt": 1.5, "y": 820, "h": 520 },
  { "component": "progress", "id": "pg1", "start": 9.2, "duration": 2.8, "label": "Path", "steps": "Plan|Draft|Ship", "times": "0.6,1.3,2.0", "y": 1130 },
  { "component": "status", "id": "st1", "start": 12.2, "duration": 2.1, "text": "Ready to review", "tone": "success", "y": 400 }
]}
```

`x`, `y` are the item's CENTRE in output pixels (x defaults to 482, the safe-box centre); `w`, `h` its
box. Text: `|` breaks a line, `*word*` gets the drawn underline. Times inside a component (`selectAt`,
`statusAt`, `times`) are seconds from the item's start. Items stack in plan order, later on top
(`canvas` first). Every param:
`node tools/rcg.mjs style show quiet-editorial`.

| Component | Use it for | Sound |
|---|---|---|
| `canvas` | the warm ground of a full-frame beat; first in the beat | none |
| `headline` | kicker rule + label, the serif line, optional body; `surface: card` over busy footage | none |
| `doc-card` | a document: label, meta, serif title, lines, a status pill | confirm, only for a success pill |
| `list` | selection: a cursor moves to a row, clicks, the row becomes active, `done` confirms | select, confirm |
| `progress` | numbered steps on a hairline; the last completes in deep green | confirm |
| `status` | a compact pill: `success` only for a real completed state, `neutral` otherwise | confirm or pop |
| `window` | quiet app chrome around lines or an image (`src`, e.g. a still) | none |

## Boundaries

- Keep the story, cuts, narration, timing, claims and copy. Change them only when asked.
- Do not assume a talking head, a speaker size or a fixed split; read the frames.
- Green means complete, confirmed, ready or passed, once at a time. Never a brand accent.
- A cursor only moves when it causes a visible change. No floaty fade-only sequences.
- No product names, logos, toggles, prompts or interface copies from any reference source.
- Do not fill every empty area, and do not cover footage just because there is room.
- Captions stay one line; if a phrase does not fit, shorten the group or move the lane, never shrink
  below the floor.
