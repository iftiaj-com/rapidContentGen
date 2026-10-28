---
name: style-character-lighting
description: Light a character on purpose in rapidContentGen, so the light says who they are. Twelve setups, each with a meaning - front (innocence), split (secrecy), under (threat), top (unreadable eyes), blue backlight (coldness), three-point (heroism), Rembrandt (depth), loop (approachable), butterfly (idealised), noir (guilt), dual colour (conflict), silhouette (the unknown). They are applied to real footage after the shoot as shadows, light pools, a background drop and a rim light that follow the tracked face, plus a top-down light-plot card and a mood tag. Use when the user asks for character lighting, cinematic or dramatic lighting, relighting a clip, a lighting explainer or comparison ("light him like this and he's innocent"), split, side, Rembrandt, rim, back, under or monster light, noir, silhouette, low key or high key, a light plot or lighting diagram, or wants a character's mood to change through light. Also the lighting rules for any rcg content that shows a character (3D scenes, cut-outs, graphics). Runs inside the video-job workflow.
---

# Character Lighting

**Lighting is not just about being seen. It tells the story.** The same face reads as innocent, as hiding
something, as dangerous, unreadable, cold or heroic. Nothing changes but where the light falls and how hard
it is. This skill teaches rcg to choose a light for what it says, to apply it to footage, and to explain it.

This skill owns the lighting choices, the setups and the look. The `video-job` skill still owns intake,
working mode, transcript, voiceover, mix, render and report: follow it, and use this skill at its
beat-sheet and build steps.

- Pack: `library/styles/character-lighting/` (`relight`, `light-plot`, `mood-tag`; tokens; `frame.md`).
  Tool: `node tools/rcg.mjs style ...`. Captions: `rcg captions --style cl-seam`.
- Inputs it needs: a face track (`rcg track`) for every relight, and a subject matte (`rcg matte`) for the
  background drop, the subject's exposure and the rim light. `back-blue` and `silhouette` refuse to build
  without the matte.
- Learned from the user's reference Short Video-9968 and the user's own breakdown of what each setup
  communicates (2026-10-11). This is technique only: no footage, character, voice or copy is taken. Test job:
  `jobs/2026-10-11-character-lighting-test` (all 12 setups, both layouts).

Read before choosing setups: `references/setups.md` (the catalogue: what each one says, where the light is,
when to use it and when not). For lighting judgment: `references/principles.md`. Before building a relight:
`references/relight-footage.md` (how it works, what footage works, tuning, checks). For a lighting explainer
like the reference: `references/reference-9968.md` (the measured layout, timing and script pattern).

## The six core setups (the user's breakdown)

| Setup (`setup=`) | What it says | Why it works |
|---|---|---|
| Front, `front` | **Innocence** | Even, direct light on the face: nothing hidden, open and trustworthy |
| Split / side, `split` | **Mystery, secrecy** | One half lit, one half in shadow: the character is hiding something |
| Low-angle, `under` | **Danger, threat** | Light from below throws shadows upward, against nature: "monster lighting" |
| Top, `top` | **Emotional opacity** | The brow shades the eyes: you cannot read their thoughts |
| Blue backlight, `back-blue` | **Coldness, detachment** | A cool light behind, the face dark: distance, an aloof mood |
| Balanced three-point, `three-point` | **Heroism** | Key, fill and back light: even, cinematic, confident |

Six more in `references/setups.md`: `rembrandt` (depth, a past), `loop` (approachable, everyday),
`butterfly` (idealised, the star), `noir` (guilt, moral ambiguity), `dual` (inner conflict),
`silhouette` (the unknown, before the reveal).

## Pick the mode

| Mode | When | Layout |
|---|---|---|
| **A. Lighting explainer** | "Show how lighting changes a character", setup comparisons, a lesson (the reference) | Stage: footage in the top box, captions on the seam, the light plot below; one setup per line, cut on the cue word |
| **B. Story relight** | A talking head or scene whose mood should turn: a confession, a reveal, a threat, a triumph | Full frame: the setup changes with the character's arc; at most a mood tag on the turn |
| **C. Lighting rules for other content** | Any rcg edit with a character: 3D scenes (`rcg three`), cut-outs (mix-media, vox-parallax), graphics | No relight component: apply `references/principles.md` (one key direction, motivated colour, shadows opposite the key) |

## Fast path A: a lighting explainer

1. **Intake** (video-job steps 1-3). A clip of one person, face to camera, ideally evenly lit against a
   plain background. For a pure comparison, hold a neutral frame so only the light changes
   (`references/reference-9968.md`, "Hold everything else still").
2. **Script** (when the user has none): the reference pattern is one line per setup, `[how it's lit], [who
   they become].` Example: "From below, he's dangerous." Open with the premise, end with the payoff.
   Use the voice tools (`rcg voice say`, user defaults) and word times.
3. **Track and matte** the clip (heavy runs, one at a time):
   ```
   node tools/rcg.mjs track --job jobs/<id> --src assets/<clip> --name main
   node tools/rcg.mjs matte --job jobs/<id> --src assets/<clip> --plate --sheet --name main
   ```
   READ `assets/matte/main-fg-sheet.png`. The rim and the background drop are only as clean as the matte.
4. **Apply the pack:** `node tools/rcg.mjs style apply --job jobs/<id> --style character-lighting`.
5. **Plan** `data/style-plan.json`: for each setup line, a `relight` (stage `rect`) and a `light-plot`
   that both start on the cue word, then `light-plot` chained with `from` (shape below). Build:
   `node tools/rcg.mjs style build --job jobs/<id> --spec jobs/<id>/data/style-plan.json --insert`.
   Read the whole output, including each relight's report lines (small face, missing frames, no matte).
6. **Captions** on the seam: `rcg captions --job jobs/<id> --words <words> --voice vo1 --style cl-seam --mode phrase --y 950 --start <s> --id cap-vo1 --insert`.
7. **Check, look, render** (video-job steps 7-8). Snapshot the middle of every setup. READ each frame for these:
   the light sits on the face; the split line runs down the nose; rims only on the light's side; no halo
   round the matte; the plot matches the frame (the key on the side the face is lit).

## Fast path B: a story relight

1. Intake, transcript, track and matte as above. Read the transcript for the **turns**: where the
   character changes (a lie, a threat, a confession, a decision, a win).
2. **Light map** in the beat sheet: one setup per stretch, changed only on a turn. Write why for each
   (character state -> setup -> motivating source). Example: the calm intro in `loop` at amount 0.6;
   "but I never told anyone" -> `split`; "so I made them pay" -> `under`; "and I won" -> `three-point`.
   Most of a talking-head edit should stay quiet (loop or three-point at amount 0.5-0.7). Save the
   strong setups for the turns.
3. Full-frame `relight` items (no `rect`) cut on the turn word, and an optional `mood-tag` on the first
   strong setup only. Build, caption (`cl-seam` or the job's caption style), check, render.

## Plan file

```json
{ "style": "character-lighting", "items": [
  { "component": "relight", "id": "rl1", "start": 3.74, "duration": 2.26, "setup": "front", "rect": "0,0,1080,960", "zoom": 1.7 },
  { "component": "relight", "id": "rl2", "start": 6.0, "duration": 2.82, "setup": "split", "rect": "0,0,1080,960", "zoom": 1.7 },
  { "component": "relight", "id": "rl3", "start": 8.82, "duration": 2.32, "setup": "under", "rect": "0,0,1080,960", "zoom": 1.7, "click": true },
  { "component": "light-plot", "id": "lp1", "start": 3.74, "duration": 2.26, "setup": "front", "title": "Front light", "exit": false },
  { "component": "light-plot", "id": "lp2", "start": 6.0, "duration": 2.82, "setup": "split", "from": "front", "title": "Split light", "exit": false },
  { "component": "light-plot", "id": "lp3", "start": 8.82, "duration": 2.32, "setup": "under", "from": "split", "title": "Under light" },
  { "component": "relight", "id": "rl9", "start": 14.2, "duration": 3.1, "setup": "rembrandt", "amount": 0.8 },
  { "component": "mood-tag", "id": "mt9", "start": 14.3, "duration": 2.2, "setup": "rembrandt", "y": 300 }
]}
```

Put `relight` items first: each draws its own copy of the clip, so anything planned before it is
covered. `x`, `y` are centres in output pixels. Every param: `node tools/rcg.mjs style show character-lighting`.

| Component | Use it for | Key params |
|---|---|---|
| `relight` | the character under a named setup, for its duration | `setup`, `side` (left/right: the key's side from the camera), `amount` 0-1.5, `rect` + `zoom` + `focus` (stage box, framed on the face), `depth` (shadow), `soft` (shadow edge), `bg` (background drop, matte), `keyColor`, `rimColor`, `grade`, `flicker` (fire, failing bulb), `in` cut/fade/flicker, `mediaStart`, `matteOffset`, `track`, `matte`, `src`, `face` (a still subject without a track), `click` (switch sound) |
| `light-plot` | the top-down diagram of the setup | `setup` or `lights` ("role:az:dist[:kind[:colour[:above/below]]];..."), `from` (slide from that setup), `title`, `labels`, `enter`, `exit`, `x`, `y`, `w`, `h` |
| `mood-tag` | the setup name and what it says | `setup` or `label` + `text`, `accent`, `y` |

## Timing (measured on the reference)

- **Cut the light on the cue word.** In Video-9968 each setup appears 0.0 to 0.33 s after the first word
  of its line (median about 0.1 s), as a hard cut, with the plot changing on the same frame.
- **Hold each setup about 2-3 s:** the cue phrase, a short pause, then the verdict ("...he's cold."). The
  reference holds 2.1 to 2.7 s. The last setup (the hero) holds through the closing line (5.7 s).
- **Opener:** the reference flashes through setups about every 0.25 s for the first 1.5 s, then settles.
  Build it from short `relight` items (0.25 s each) and no plot.
- `in: fade` or `flicker` only for a light switching on inside a shot (someone turns on a lamp), never for
  a setup change in an explainer.

## Boundaries

- Keep the user's story, words and timing. The light serves the character's arc; do not change lights
  for variety alone.
- One setup at a time on a character, and one change per turn. Two dramatic setups in a row cancel out.
- Do not hide the face for long while the character delivers a key line, unless hiding is the point
  (`back-blue`, `silhouette`, `noir`). Captions carry the words then.
- Every light should have a believable source in the world (window, lamp, screen, fire, moon); pick
  `keyColor` and `flicker` to match it (`references/principles.md`).
- Explain honestly: a relight is a post-production simulation. When the user is learning to light a real
  shoot, say which parts are the real setup (the plot, the meaning) and which are the 2D approximation.
- No credits or source text on screen (workspace rule). Ask before any download or install.

## Known gaps

- 2D light shaping, not real 3D relighting: there are no true cast shadows from the nose or brow. The split
  line is straight, the Rembrandt triangle is a placed patch, and the under-light shadows are a gradient.
  It reads well on a face 150 px wide or more, facing the camera. In profile the light does not turn
  with the head (the track has roll, not yaw).
- A relight draws its own copy of the clip, so it does not follow an `rcg camera` move on the base video.
  Do not put camera moves under a relight; reframe with `rect`, `zoom` and `focus` instead.
- The stage crop (`rect` + `zoom`) is fixed for each item, framed on the face's median place in that
  item's time. A subject who moves a lot inside one item can leave the box (the test clip at 1.0 s):
  use a lower `zoom`, shorter items or a steadier stretch.
- Rim and background drop need a clean matte. Hair and motion blur give a soft or patchy rim.
- No real 3D head like the reference's: the character is the user's footage (or a still held as a clip).
