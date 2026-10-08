---
name: skill-split-screen-edit
description: Turn two videos, a presenter (talking head) and an informative video (screen recording, product demo, stock or explainer footage), into a 9:16 split-screen explainer in rapidContentGen - B-roll in a top panel that fades to black, the presenter in a bottom panel with a face-safe static crop (MediaPipe), small captions on the dark seam, and timed switches to a full-frame presenter (two-tier title, face camera), full-frame B-roll (cover, fit, white band card) and back. Use when the user asks for split screen, top and bottom, presenter plus B-roll, "two videos", picture over talking head, news or tech explainer style, or drops a presenter clip with an info clip. Runs inside the video-job workflow.
---

# Split-screen edit (presenter + info video)

This skill owns the layout, the planner and the checks. The `video-job` skill still owns intake,
the working mode, render, report and the final send; use this skill from its analysis step on.

- Planner: `node tools/rcg.mjs split-screen prep | plan | layout | commands | build | clamp | check`
  (`tools/recipes/split-screen.mjs`). Layout writer `tools/blocks/split.mjs`; checker
  `tools/jobs/split-check.mjs`; info-video analysis `node tools/rcg.mjs broll` (`tools/media/broll.mjs`).
- Geometry and pacing: `library/split-screen/layout.json` (change numbers there, not in the tools).
- Captions `split-seam` / `split-pill`; transition `light_leak`. Full-frame presenter beats reuse the
  `marketing-pro` camera and its `hero` component (skill `style-marketing-pro`).
- Learned from the user's reference Video-94146 (measured, nothing copied). Regression:
  `regression/R12/README.md`.

Read before planning: `references/layout-and-rules.md` (what the reference does, the numbers and why).
Before changing the crop or a check: `references/face-safe-framing.md`. For the info video:
`references/broll-montage.md`.

## Fast path

1. **Intake** (video-job steps 1-2): `rcg new-job --name <slug> --video <presenter> --video <info> [--video <info2>] --mode <a|b|c>`.
   The presenter's audio is the master track and sets the length. The info video is muted.
2. **Prep**:
   ```
   node tools/rcg.mjs split-screen prep --job jobs/<id> --presenter assets/<presenter> --info assets/<info> [--info assets/<info2>] [--trim]
   ```
   The presenter goes through marketing-pro prep (name `a`: CFR 30, upscale, denoised and leveled
   voice, transcript). Each info clip becomes `assets/b<n>-prep.mp4` (CFR 30, short GOPs), and
   `rcg broll` scores its shots. READ the printed transcript and correct `data/words.json`. READ
   `data/broll-sheet.png`; fix a wrong class (`card`, `ui`, `footage`, `dark`) in `data/broll.json`.
3. **Plan**:
   ```
   node tools/rcg.mjs split-screen plan --job jobs/<id> [--handle "@name"] [--cta "Link in bio"] [--darken auto|on|off]
   ```
   It tracks the face once (`data/track-a.json`), splits speech into beats (marketing-pro), picks a
   layout per beat, cuts the B-roll montage, solves the presenter crop per split window, plans the
   a-full camera and titles, captions per window, light leaks and sounds. READ its report:
   - windows: layout, reason, B pieces (`panel`, `cover`, `fit`, `band`), presenter crop
     (scale, face size, share of frames where the face leaves the panel);
   - shares (soft targets split 0.40-0.55, b-full 0.25-0.35, a-full 0.15-0.25; short clips miss them);
   - presenter background luma and whether it is darkened through a cut-out;
   - warnings (no hook title, reused B-roll, a window that changed layout because the head left the panel).
   Mode (a)/(c): show `beat-sheet.md` and wait for the OK here. Edits go in `data/split-plan.json`
   (layouts, shots, `highlights`) and `data/style-plan.json` (titles); build never re-plans.
4. **Build**: `node tools/rcg.mjs split-screen build --job jobs/<id>` (matte when darkening, layout,
   a-full cameras, titles, captions per window, clamp, light leaks, mix-check, split-check, hf check).
   `commands` prints the steps only.
5. **Look and render** (video-job steps 7-8): snapshot every layout change and the middle of each
   window; READ them. Then `rcg render jobs/<id> --fps 30 --workers 3`, read the sheet, and extract one
   full-resolution frame of the seam from the MP4 (`ffmpeg -ss <t> -i renders/final.mp4 -frames:v 1
   -vf "crop=1080:900:0:850" seam.png`) to judge the cut-out edge and the caption.

## Manual extras

- **Highlights** on full-frame B-roll (article lines, prices): add boxes in output px to a b-full
  window in `data/split-plan.json`, then build:
  `"highlights": [{ "at": 7.1, "d": 1.6, "x": 120, "y": 880, "w": 620, "h": 70 }]` (marker yellow,
  multiply blend, sweeps in over 0.35 s). Find the box on a snapshot of that window. No OCR yet.
- **Hook title**: the planner adds one only when the first line has a strong key word (a name,
  number or power word). Add or change it in `data/style-plan.json` (`"id": "title-hook"`, look
  `italic`, y about 930, on the B panel) and rebuild.
- **Logos, tags, CTA**: marketing-pro components (`logo`, `tag`, `cta`) in `data/style-plan.json`.
  Logos only when the user supplies or approves them.

## Boundaries

- Keep the words, order and meaning. `--trim` only removes dead air at the ends.
- The presenter's face is never under the seam shade or past a frame edge: split-check fails the
  build when it is on more than 5% of a window's frames. Fix the plan (layout, crop) rather than the check.
- The presenter panel is static by design (the user chose the reference look). Do not add follow
  moves there; a moving presenter gets a smaller scale with a blurred side fill, then a layout change.
- Text stays in the safe box (x 64-900, y 192-1536). Seam captions at y 1236; titles at x 482.
- Info-video audio stays muted unless the user asks for it.
- No copying the reference's people, copy, logos, brands or channel name.

## Known gaps

- Pacing is montage only: the info video is a shot library cut to the speech. A screen recording
  made in sync with the talk (`sync` mode) is not built.
- The seam sits at 62% of the height for every job (the user did not choose an adaptive seam).
- B-roll classes come from brightness, motion and edge density; they misfire on some footage. The
  sheet and a hand edit of `data/broll.json` are the fix.
- The cut-out used to darken a bright presenter background leaves a faint fringe on curly hair
  (R12; choke 10 and feather 3 in `layout.json` made it small). `--darken off` keeps the shot as is.
- The a-full title lead line uses the italic serif (marketing-pro `hero`); the reference uses a
  small sans lead.
- Highlights need hand-placed boxes (no OCR; installing Tesseract needs the user's OK).
- Only one 9:16 standing presenter has been tested (R12). A 16:9 seated presenter, the case the
  reference shows, still needs a regression run.
