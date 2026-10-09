# Plan: `style-split-screen-edit`

Status: built 2026-10-08 (skill `.agents/skills/style-split-screen-edit`, regression R12). Written
the same day from the two reference videos `Video-94146.mp4` (split-screen explainer) and
`Video-2306.mp4` (single-presenter promo).

**As built, where it differs from this plan:**
- Decisions taken: montage pacing only (no `sync`), static presenter panel, hand-placed highlight
  boxes, `marketing-pro` reused for a-full. The seam stays at 62% (question 3 was not answered).
- No new style pack: b-full treatments (cover, fit, band), the handle and highlights live in the
  layout writer `tools/blocks/split.mjs`; titles and the CTA reuse marketing-pro `hero` / `cta`.
  Geometry is in `library/split-screen/layout.json`.
- `camera --box` was not needed: the split crop is static and solved at plan time.
- The face rule is split into hard (face clear of the shade) and soft (hair out of the seam), with a
  side-fill fallback for portrait presenters (section 5.3 was too strict on a close selfie).
- Hands are not tracked, so the "no cut mid-gesture" rule is not built.
- Only a 9:16 standing presenter was tested; a 16:9 seated presenter is still open.

Goal: a skill that takes **two videos**, a presenter (A-roll) and an informative video (B-roll),
and turns them into a 9:16 edit in the reference style. B-roll on top, the presenter below,
captions on the seam between them, and timed switches to full-frame presenter, full-frame
B-roll, cards and an end card. The presenter's face is never cut by the seam or the frame edge.

Technique only. The skill never copies people, logos, copy or footage from the references.

---

## 1. What the references do

Measurements were taken on the 720x1280 files and scaled to 1080x1920. The layout split comes
from a per-half-second classifier (bottom-strip match against a known split frame), so the
percentages are rough. Positions come from a 128-row brightness profile, so they carry about
plus or minus 1-2 % of frame height.

### Video-94146 (split screen, 112 s, 30 fps)

**Layout share (approximate):** split about 48 %, full-frame B-roll about 33 %, full-frame
presenter about 19 %. About 35 layout segments in 112 s, so the layout changes about every 3 s.

| Layout | Typical length | What is on screen |
|---|---|---|
| SPLIT | 4-7 s | B-roll top, presenter bottom, caption on the seam. The presenter shot stays continuous while the top panel hard-cuts every 1-2.5 s (scene detection found about 55 cuts in 112 s). |
| A-FULL | 1-4 s | Presenter full frame, face near y 0.35, two-tier title at chest height: a small sans lead line ("Here is how") over a large italic serif line ("it works"). Used on section openers, questions and the closing opinion. |
| B-FULL | 0.5-6.5 s | B-roll full frame: logo cards on white, a 3D-tilted price card on a coloured ground, an article screenshot with a marker highlight sweeping over the key line, a dark text document with one phrase boxed, product UI screens. |
| CARD | 2-4 s | A white horizontal band across the middle (about y 0.31-0.69) over dark grey bars, a logo that fades and scales in, caption in a dark pill inside the band. |
| END | 3-4 s | Call-to-action card (phone mock-up, "Link in bio" pill with a cursor click). |

**Seam geometry (estimated, 1080x1920):**

- B panel: full brightness from y 0 to about y 1000 (52 %).
- Fade to black from about y 1000 to y 1190 (52 % to 62 %). This gradient is what makes the seam
  look soft instead of a hard line.
- Caption band: about y 1190-1300; the caption centre sits near y 1230 (64 %).
- Presenter panel: visible from about y 1190 to 1920 (about 730 px). The presenter's face sits
  near y 1440 (75 %). The presenter was shot wide (desk, microphone, dark slatted wall), which is
  why the dark top of their background blends into the black fade.
- A 16:9 presenter clip scaled to 1080 wide is 608 px tall, so it nearly fills this panel
  uncropped. A 9:16 presenter clip must be cropped to a band around the face.

**Captions:** small white sans, 1-3 words at a time, centred on the seam. Over light
backgrounds (white cards, B-FULL screens) the same caption gets a dark rounded pill behind it.
Titles use the two-tier sans + italic serif pair; the serif word blurs in to sharp
(about 0.2-0.3 s).

**Transitions (sampled at 10 fps):**

- SPLIT to A-FULL at a section start: a 2-3 frame tinted light flash (yellow, pink, orange tint
  over the outgoing frame), then the presenter.
- A-FULL to SPLIT and every B-roll cut inside the top panel: hard cut.
- CARD: logo fade and scale-in; band appears on a cut.

**Camera:** the presenter panel is static in split. A-FULL uses cut-in punches (closer framing on
the emphasis line, for example 1:42 to 1:44) and slow push-ins. B-roll gets slow scale-ins and
the occasional tilted screenshot.

**Other:** a channel handle top right for the first 3 s. I could not judge the music or SFX by
ear; that part is unknown.

### Video-2306 (single presenter, 44 s, 30 fps)

This look is already measured and ported as the uncommitted `marketing-pro` pack
(`library/styles/marketing-pro/`, `tools/recipes/marketing-pro.mjs`, R11 not yet rendered).
What this skill reuses from it, for the A-FULL beats:

- Hero keyword by meaning: serif caps, italic serif, neon number, red strike-through on
  negations, focus pull on contrast words.
- Text behind the subject (the "LET ME" title sits behind her hair: matte + PNP + `layer --behind`).
- Eased zoom ladder (1.0 / 1.3 / 1.6) with face-anchored cues, and hard punches.
- White bloom flash on some cuts (`transition --style flash_bloom` exists).
- Pill tags with a yellow ring that pop in and slide.
- Two-tier body caption (`mp-body`).

---

## 2. Skill scope

**Inputs**

- `presenter`: the talking-head clip (any aspect; 16:9 and 9:16 both supported). Its audio is
  the master track and sets the edit length.
- `info`: the informative video (screen recording, product demo, stock montage, slides). One
  file is the base case; a folder of clips also works.
- Optional: prompt, brand colours and logo, handle text, CTA text, music bed, mode (a/b/c).

**Output:** `jobs/<id>/renders/final.mp4`, 1080x1920, 30 fps (or the presenter's rate), verified
by `rcg render`, plus `report.md`.

**Out of scope for v1:** more than two sources mixed per frame, OCR-driven highlights, AI-made
B-roll, posting.

---

## 3. Layout system (1080x1920)

All geometry lives in one place, `library/styles/split-screen/style.json`, so it can be tuned
once after the first render.

| Layout | Geometry | Presenter | B-roll | Caption anchor |
|---|---|---|---|---|
| `split` | B panel y 0-1190, fade 1000-1190; caption band 1190-1300; A panel 1190-1920 | face-safe crop, static (optional slow drift) | cover crop with focus point, Ken Burns 1.00-1.06 | seam, y 1230, plain |
| `a-full` | full frame | face camera (marketing-pro ladder) | hidden | chest, two-tier title / `mp-body` |
| `b-full` | full frame | hidden (voice continues) | cover, or fit + blurred fill for UI recordings | y 1230, pill when bright |
| `card` | white band y 600-1320 over dark grey | hidden | logo or still in the band | inside band, pill |
| `end` | full frame CTA | optional small PNP | none | per CTA |

Variants worth having, off by default:

- `split-flip`: presenter on top, B-roll below (some creators prefer it).
- `split-pop`: the presenter's cut-out head crosses the seam into the B panel for one beat
  (matte + PNP above the seam). Not in the reference; use at most once.
- `split-ratio`: seam at 50 % or 70 % instead of 62 % when the presenter shot is tight.

---

## 4. Pipeline (inside the `video-job` workflow)

The `video-job` skill still owns intake, mode, render and report. This skill owns steps 3-7.

1. **Intake.** `rcg new-job --name <slug> --video <presenter> --video <info> [--audio <music>]`.
   Read both intake sheets.
2. **Prep** (new, `rcg split-screen prep`):
   - Presenter: CFR at the output rate, upscale if under 1080 wide, denoise and level the voice
     (reuse `marketing-pro prep` logic), transcript to `data/words.json`. CORRECT the transcript
     before planning.
   - Info: mute by default; scene-cut list, per-segment stats and a contact sheet
     (`data/broll.json`, `data/broll-sheet.png`), see section 5.
3. **Track and matte the presenter** (existing):
   - `rcg track --job jobs/<id> --src assets/<presenter> --debug --name a` and READ the debug sheet.
   - `rcg matte --job jobs/<id> --src assets/<presenter> --plate --sheet --choke 6 --name a` only
     when the plan needs it (section 6).
4. **Plan** (new, `rcg split-screen plan`): writes `data/split-plan.json`, `beat-sheet.json`,
   per-segment caption word files and the build command list. Rules in section 7.
   Gate here in modes (a) and (c): show the beat-sheet table with a layout column.
5. **Build** (new `rcg split-screen build`, which mostly calls existing blocks in this order,
   per lessons 13an): split layout block, cameras, PNP layers, titles and heroes, captions,
   layer marks, transitions, SFX, mix-check, `hf check`.
6. **Check:** `rcg split-check` (new, section 8), then snapshots at every layout change and READ them.
7. **Render and verify:** `rcg render jobs/<id> --fps 30 --workers 3`, READ `final-sheet.png`,
   extract one full-size frame per layout from the MP4 and look at it.

---

## 5. New code

Each item names the file, what it reuses, and the size of the change. Everything else is a call
to an existing block.

### 5.1 `tools/recipes/split-screen.mjs` (new, main tool)

Same shape as `marketing-pro.mjs`: `prep | plan | commands | build`, registered in `tools/rcg.mjs`
as `split-screen`. Reuses `lib/runner.mjs`, `Reframe` / `subjectPath` from `blocks/camera.mjs`,
`validateBeatSheet`, and imports the marketing-pro planner for A-FULL beats (heroes, zoom ladder)
instead of copying it.

### 5.2 `tools/blocks/split.mjs` (new block)

Writes the layout into `index.html`:

- Two panel wrappers, `#pB` (top) and `#pA` (bottom), each `overflow: hidden` with an untimed
  `.shot` wrapper inside so the camera block can target them.
- The seam: a gradient element (transparent to black over the fade range) above `#pB`.
- Layout switches as timed class or clip changes at the planned times (hard cuts by default).
- One `<video>` element per B segment with `data-media-start`, so each top-panel cut is a new clip.
- The presenter `<video>` placed once per layout window with the same media timeline, so the
  voice and lips never drift across layout changes.

### 5.3 Face-safe framing in a panel (change to `tools/blocks/camera.mjs`)

Today the face map uses the root size (`root.width`, `root.height`, line about 230). Add
`--box WxH` so face cues frame inside a panel. `face-reframe.js` already reads the element's own
size at runtime and needs no change. Small, contained change; covered by a check on R7 that the
default path is unchanged.

The static crop for `split` is solved at plan time from the track, per segment:

1. Head box per frame: the face box from `rcg track`, grown up by 0.45 x face height (hair) and
   down by 0.25 x (chin and neck).
2. Union of the head boxes over the segment, plus a 40 px margin.
3. Pick the scale (never below a cover fit of the panel) and the offset that put the face centre
   at 0.42 of the visible panel height, with the whole union box inside the visible panel and
   below the fade.
4. If no static crop fits (the presenter leans or stands), switch that segment to `face.follow`
   with `k=0.6` inside the panel; if that still clips, the planner changes the segment to `a-full`.

### 5.4 B-roll analysis (`tools/media/broll.mjs`, new)

For the info video: scene cuts (ffmpeg `scene` > 0.25, minimum 0.6 s), and per segment its mean
brightness, motion (frame difference), an edge-density "text or UI" score, and the dominant
colour. Writes `data/broll.json` and a labelled sheet. These scores drive layout choice:

| Segment looks like | Use as |
|---|---|
| Bright, low motion, high text score (slide, logo, article) | `b-full` or `card` |
| UI screen recording (high text score, 16:9) | `b-full` fit + blurred fill, or `split` with a focus point |
| Footage with motion | `split` top panel |
| Very short (< 0.6 s) or near black | merge or skip |

Optional: if the info video has speech, transcribe it and match its segments to presenter
sentences by shared keywords. Without speech, segments run in source order.

Two pacing modes, chosen at intake:

- `--b-mode montage` (default): segments are cut to the presenter's sentence and clause
  boundaries; the info video is a source of shots.
- `--b-mode sync`: the info video plays on the same clock as the presenter (screen recording made
  during the talk). Only the layout changes; no B re-cutting.

### 5.5 Captions (two presets in `library/caption-styles.json`)

- `split-seam`: white sans (Inter 500, about 40 px, estimated from the reference), soft shadow,
  `2word` or `phrase` mode, centred at y 1230.
- `split-pill`: the same text in a dark rounded pill, for `b-full` and `card` segments.

The planner splits the word list at layout changes and emits one `rcg captions` call per segment
with that segment's style and `--y`. No change to `captions.mjs` (it already takes `--y`,
`--position` and `--start`). A-FULL segments use `mp-body` or the two-tier title instead.

### 5.6 Transition: `light_leak` (change to `tools/blocks/transition.mjs`)

A tinted flash (2-4 frames, warm tint ramp, seeded hue) for split to a-full at section openers.
Built next to the existing `flash_bloom`. Everything else uses hard cuts or the existing styles.

### 5.7 B-FULL components (style pack `library/styles/split-screen/`, new)

Through the existing `rcg style add|build` machinery:

| Component | What it does | v1? |
|---|---|---|
| `title-2tier` | small sans lead + italic serif hero, serif blurs in | yes |
| `card-band` | white band over dark grey, logo or still scales in, pill caption | yes |
| `tilt-card` | a still or frame as a 3D-tilted card with shadow on a colour ground, slow scale-in | yes |
| `handle` | channel handle for the first 3 s (top left or top centre, kept out of the right 180 px) | yes |
| `end-cta` | end card: headline, phone or screen mock with a still, "Link in bio" pill, cursor click | yes |
| `highlight-sweep` | marker bar sweeping over a line in a screenshot; boxes given by hand in the plan | yes, manual boxes |
| `highlight-ocr` | find the line automatically | later, needs Tesseract (ask first) |

### 5.8 `tools/jobs/split-check.mjs` (new verifier, run by `build` and before `render`)

Using the track and the planned transforms, at every frame:

- the head box of the presenter is inside its visible area and not under the seam fade;
- no caption box overlaps the face box;
- the B panel never shows an empty edge (cover check after Ken Burns);
- every layout segment is at least 0.6 s, and the voice track runs unbroken.

Writes `snapshots/split-check.png` with the seam lines and face boxes drawn. Fails loudly.

---

## 6. MediaPipe and background removal: when and why

| Need | Tool | When |
|---|---|---|
| Keep the face inside the bottom panel | `rcg track` (face) + section 5.3 | always |
| Face camera in `a-full` | `rcg camera --track ... face.zoom / face.punch` | always in a-full |
| Presenter background is bright or busy, so the seam fade shows a hard edge | `rcg matte --plate`, then replace the background with a dark blurred copy of the plate or a brand colour | when the top 15 % of the presenter panel is brighter than about 25 % luma (measured in prep) |
| Text behind the subject in `a-full` | `rcg pnp` + `rcg layer --behind` | for openers, max 2 per video |
| `split-pop` head over the seam | `rcg pnp` with the cut-out above the seam | optional, once |
| Full-body or fast motion where the selfie segmenter leaks | HyperFrames `remove-background` (u2net, 168 MB download) | only after asking |

Hand tracking (already in `rcg track`) is used for one thing: avoid cutting to a new B segment
in the middle of a big gesture in `a-full`.

---

## 7. Planner rules (from the measurements)

- Start in `split` with a hook title on the B panel (italic serif name or claim, small sans
  subline at the seam), handle visible for 3 s.
- `a-full` on: section openers ("here is", "but", "so", "one more thing"), questions, the
  closing opinion, and after pauses over 0.6 s. Length 1-4 s. Two-tier title on its key phrase.
- `b-full` or `card` when the B segment scores as a card (bright, low motion, text) or the
  sentence has a number, price, percentage or brand name. Length 1-6.5 s.
- `split` everywhere else, 4-7 s per window, top panel cut every 1-2.5 s on clause boundaries.
- Never more than 7 s without a layout change or a top-panel cut. Never the same full-frame
  layout twice in a row.
- Every layout change lands 0.1 s before the word that motivates it.
- `end` for the last 3-4 s if a CTA was given.
- Target shares, as a soft check: split 40-55 %, b-full 25-35 %, a-full 15-25 %.

Audio: presenter voice leveled to -14 LUFS; info audio muted (option: -24 dB bed); optional music
limited to -2.5 dBTP and ducked to about 0.3 under speech; `whoosh-short` under `light_leak`,
`pop` under card and pill entrances, placed by crest. `rcg mix-check` must say `MIX OK`.

---

## 8. Input edge cases

| Input | Handling |
|---|---|
| Presenter 16:9 | split: fits the panel nearly uncropped, vertical offset only. a-full: existing 16:9 to 9:16 reframe. |
| Presenter 9:16 | split: face-band crop (section 5.3). a-full: native. |
| Presenter stands or moves a lot | `face.follow` in the panel; failing that, more `a-full`. |
| Info 16:9 | split: cover crop to about 0.9 aspect with a focus point (default centre; UI recordings use the text-score centroid). b-full: fit + blurred fill. |
| Info 9:16 | split: cover crop of the top part; b-full: native. |
| Info shorter than needed | reuse segments with a different crop and Ken Burns direction; never loop visibly back to back. |
| Info longer | choose segments by score and keyword match, in source order. |
| Low-res or variable frame rate | CFR + lanczos upscale in prep (as marketing-pro does). |
| Presenter below 30 fps | no slow motion (lesson 5); freeze frames only. |

---

## 9. Skill files

```
.agents/skills/style-split-screen-edit/
  SKILL.md                         fast path, commands, boundaries, known gaps
  references/
    layout-geometry.md             the 1080x1920 numbers and how they were measured
    planner-rules.md               section 7 with the reasons
    face-safe-framing.md           section 5.3 and the split-check rules
    broll-selection.md             section 5.4 scores and the two pacing modes
    lessons.md                     filled in during R12
library/styles/split-screen/       style.json, frame.md, components.mjs, fonts/
```

`SKILL.md` description should trigger on: split screen, split-screen, presenter and B-roll,
"two videos", top and bottom, explainer with screen recording, news-explainer style, picture
over talking head. It points to `video-job` for intake, mode, render and report, and to
`marketing-pro` for the full-frame presenter look. Add one row to the "Named looks" list in
`video-job/SKILL.md` and a line to `docs/capabilities.md` and `docs/styles.md`. Log any copied
code in `docs/PROVENANCE.md` via `rcg provenance`.

---

## 10. Build order and acceptance

| Phase | Work | Done when |
|---|---|---|
| 0 | Finish and commit `marketing-pro` (R11), because a-full depends on it | R11 renders and verifies |
| 1 | `split.mjs` block, `camera --box`, `split-seam` / `split-pill` captions, `split-check` | a hand-written plan renders a split-only 20 s clip; face never under the fade; split-check passes |
| 2 | `broll.mjs` analysis and sheet | the sheet labels card / UI / footage segments correctly by eye on both test inputs |
| 3 | `split-screen.mjs` prep / plan / build, `light_leak`, layout switching | full edit from two raw videos in mode (b), layout shares inside the soft targets |
| 4 | style pack components (title-2tier, card-band, tilt-card, end-cta, handle, highlight-sweep) | each renders in R12 and passes `hf check` contrast |
| 5 | Skill files, docs, regression `regression/R12/README.md` | a second, different input pair runs end to end without hand edits |

**R12 regression:** two pairs. Pair 1: a 16:9 seated presenter + a 16:9 screen recording.
Pair 2: a 9:16 standing presenter + 9:16 stock footage. Both must pass `rcg render` verify,
`split-check`, and a manual read of one frame per layout.

---

## 11. Open decisions (need the user)

1. **Pacing default:** are the two inputs usually separate (B-roll as a shot library, `montage`)
   or recorded together (screen recording synced with the talk, `sync`)?
2. **Presenter panel motion:** static like the reference, or a slow drift?
3. **Seam position:** keep the measured 62 % or let the planner move it per job?
4. **OCR highlights:** stay with hand-placed boxes, or ask to install Tesseract later?
5. **Phase 0:** finish R11 (`marketing-pro`) first, or build the split layout without the a-full
   heroes and add them after?

## 12. Known risks

- The layout shares and seam numbers are estimates from a 720p reference; plan to tune them in
  `style.json` after the first R12 render.
- `rcg matte` leaks on full-body motion (lessons); standing presenters may need the u2net download.
- B-roll "card" detection by brightness and edge density will misfire on some footage; the
  planner output is a beat sheet the user can edit before build (modes a and c).
- Many short `<video>` clips from one source can slow HyperFrames seeking; if render time jumps,
  pre-cut B segments to small files in prep.
