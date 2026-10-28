---
name: style-cinematic-long
description: Edit the user's footage into a long-form cinematic video in rapidContentGen (16:9, over 1 minute) - shots chosen for the story and cut into sequences that flow (same screen direction, same subject, matched action, matched speed), added movement only where a shot is still, shot variety (wide, medium, close, detail), shaky shots stabilized or cut, sped-up shots with motion blur, colour corrected so shots match and then one grade, music that fits each section's mood, and quiet sound design (natural sound, whooshes, impacts, risers). Code measures each shot's motion direction, shake, exposure and colour; the agent judges flow, variety and what stays. Use for cinematic, film-look, travel film, documentary, vlog-to-film, B-roll montage, event film, brand film or "make my footage look cinematic" requests that run longer than a minute or ask for 16:9, YouTube or landscape. Other ratios when the prompt asks. Runs inside the video-job workflow.
---

# Cinematic (long form, 16:9)

This skill owns the cinematic edit: shot choice, flow, movement, variety, stability, colour, music and
sound design. The `video-job` skill still owns intake, the working mode, voiceover, mix, render and the
report: follow it, and use this skill from its analysis step on. For 9:16 short form use
`style-cinematic-short`, which builds on this skill.

- Default output: **1920x1080 (16:9), longer than 60 s.** Template `horizontal-1920x1080`
  (`rcg new-job --template horizontal-1920x1080`). The user's prompt may ask for another ratio or
  length: see "Other ratios" below.
- Measuring and shot prep: `node .agents/skills/style-cinematic-long/scripts/cine.mjs measure | prep | demo`
  (`references/shot-prep.md`). Assembly: `rcg assemble` from the beat sheet. Camera: `rcg camera`.
  Grades: `library/recipes/grades.json` (`natural-film`, `teal-orange`, plus the trailer grades).
  Letterbox: `rcg cinema`. Music: `rcg limit`, `rcg beatgrid`. SFX: `library/sfx/`.
- Learned from a filmmaker's article on ten rules for cinematic travel videos, which the user pasted
  (2026-10-14). The rules are taken as principles and adapted to an editor that works on footage the
  user already shot. Nothing is copied from the author's videos.

Read before planning: `references/principles.md` (the ten rules, what code measures, what you judge,
which tool does it). Before prep: `references/shot-prep.md`. Before the mix: `references/sound-music.md`.
Before the grade, titles and the finish: `references/look.md`.

## What makes it read as cinematic

1. **Flow.** Each sequence looks planned: shots move the same way, follow the same subject, continue an
   action, or keep the same speed. A change of direction or energy happens on purpose, at a section edge.
2. **A purpose for every shot.** Pick the shots that serve this story and this music, and leave out
   good shots that do not. The author of the article uses at most about 60% of his good shots.
3. **Polish nobody notices.** Matched colour, motion blur on sped-up shots, no jerks, sound that sits
   inside the picture. When it is done well, nobody notices it. When it is missing, it looks amateur.

## Fast path

1. **Intake** (video-job steps 1-2):
   `rcg new-job --name <slug> --template horizontal-1920x1080 --video <a> --video <b> ... [--audio <music>] --mode <a|b|c>`.
   Look at every intake sheet. Ask for the music if none came with the prompt (`references/sound-music.md`).
2. **Measure the footage:**
   ```
   node .agents/skills/style-cinematic-long/scripts/cine.mjs measure jobs/<id>
   ```
   It splits every video at its hard cuts and writes `data/cine/shots.md` (one line per shot: screen
   motion and speed, shake, rough shot size, exposure, saturation, warmth, flags) and
   `data/cine/shots-<n>.png` (the middle frame of each shot, labelled). READ both. Judge from these
   files, never from raw frames. A long shot list (dozens of shots) can go to a sub-agent with
   `shots.md`, the sheet and one question, such as "group these into scenes by subject". Check its
   answer against the sheet (AGENTS.md, "Delegation").
3. **Story and sections.** When the film should tell a story (a character, a want, a change), plan it
   first with `script-film-storytelling` (footage mode) and cut its shot list. Otherwise decide the
   arc (open, build, peak, release). Split it into sections of about 15-60 s, each with one mood. Map the music to them: one track per mood, or one track with
   clear changes (`rcg beatgrid`; cut on downbeats, change sections on a phrase).
4. **Select and order shots** (`references/principles.md`, rules 1, 5 and 9). For each section, choose
   shots that serve it. Order them so each run flows. Plan a fix for every shot that breaks a run:
   a crop move, a flip, a reverse or a speed match. Fill the variety gaps (wide, medium, close,
   detail). Write down every good shot you leave out and why (it goes in the report).
5. **Beat sheet** (`docs/job-spec.md`): one beat per shot. `onScreen` names the shot id, the source
   range, its screen direction and the treatment (for example "s07 harbour, moving left, flipped; slow
   push in"). `sound` names the music section and every sound layer. Put the `build.shot`,
   `build.grade` and `build.sfx` hints in each beat, and `build.music` and `build.wrappers` (camera cues)
   at the top (shape: `references/look.md`, "Assembly"). Run `rcg beat-sheet md`, fix every ERROR.
   Modes (a)/(c): show it and wait for the OK.
6. **Prep the shots:** write `data/cine/prep.json` (trim, stabilize, reverse, flip, speed with motion
   blur, colour match), then
   ```
   node .agents/skills/style-cinematic-long/scripts/cine.mjs prep jobs/<id>
   ```
   READ its before/after lines: colour within target, shake lower, durations right. Every prepped clip
   lands in `assets/cine/<id>.mp4`; the beat sheet points at those.
7. **Build:** `rcg assemble --job jobs/<id>` (shots, music with its fades and duck, SFX by crest,
   camera cues). The first beat is a `black` block of at least 0.083 s (a fade from black): a graded
   shot on the very first frame makes the render fail (lessons 13a, `references/look.md`). Then titles
   if any (`rcg title`, `references/look.md`), letterbox if chosen (`rcg cinema`), then
   `rcg plan check`, `rcg mix-check` and `rcg hf --cwd jobs/<id> check`. Over light footage, make the
   title dark (`--color`): `hf check` fails light text on a white wall.
8. **Look, render, verify** (video-job steps 7-8): snapshot a frame from each section and every
   transition, READ them. Render in the background (long renders take a while):
   `rcg render jobs/<id> --fps <24|25|30> --workers 3`. Read the sheet and one full frame per section.
   Then check the flow in the render itself: `cine.mjs measure jobs/<id> --src renders/final.mp4`
   (it writes `data/cine/render-flow.md`; `shots.md` keeps the source measurements) and compare each
   shot's screen direction with the beat sheet.
9. **Report** (video-job step 9): add the shot selection (kept, left out, why), every flip, reverse and
   speed change, the colour target, and any shooting notes for next time (`references/principles.md`,
   rule 6).

## Pacing (starting values, not rules)

These are starting points to adjust to the music and the footage, not measured norms.

- Average shot length in a calm section: about 3-6 s. In a peak section: about 1-2.5 s, on the beat.
- Hold an establishing wide shot longer (about 4-8 s) at the start of a section, so the viewer can
  take in the place.
- Change energy at section edges, not in the middle of a run. One emotional line at a time
  (the article: "you can't be all over the place with the energy").
- Cut on the beat or the downbeat in music-led sections. In calm sections, cut on a phrase or on an
  action (a step, a turn, a wave breaking), not on every beat.
- Transitions: mostly hard cuts and match cuts. Use a dip to black between big sections. Use a whoosh
  with a short whip (`rcg transition --style mirror_whip`) only where the camera already moves fast.
  Glitch, flash and zoom punches read as a promo, not a film: use them only when the user asks.

## Other ratios and requests

- **9:16 or under 60 s:** use `style-cinematic-short`.
- **2.39:1 widescreen look:** stay on the 16:9 template and add bars with
  `rcg cinema --job jobs/<id> --ud --pos 12.8 --curve 0 --show 0-<end>` (each bar is 12.8% of the
  height, which leaves a 1920x803 picture, about 2.39:1). Keep titles inside the picture area, not on
  the bars. The bars hide the top and bottom of every shot: check the framing in the snapshots.
- **1:1 or 4:5:** there is no template yet. Tell the user, and offer 16:9 or 9:16, or a new template
  (a small task: copy `templates/horizontal-1920x1080/`, change the sizes and the safe zones).
- **Voiceover or a talking presenter in the film:** follow video-job for voice and captions. Write the
  narration with `script-modern-storytelling`, or with `script-film-storytelling` when the film tells
  a story with a character. Duck the music under the voice. B-roll still follows the
  flow rules.
- **A named look** (moody, warm, black and white, vintage): pick the grade in `references/look.md`.
  The rules on flow, selection and sound stay the same.

## Boundaries

- Work only with the user's footage and music they supplied or cleared. Never use a popular song
  they have not cleared. Ask before any download (stock footage, sounds, music).
- Keep real events real. Do not flip shots with readable text, signs, logos, number plates or a known
  landmark, and do not reverse people, animals, water, smoke, fire or traffic where it shows. Look at
  the frame first, every time (`references/principles.md`, rule 1).
- Never slow footage below its frame rate (lessons 5: `cine.mjs prep` refuses). Slow motion needs
  high-frame-rate source footage.
- Never zoom a crop past the source's room without saying so: `shots.md` prints the zoom room per
  source, and 1080p footage in a 1080p edit has none (1.0x).
- No credit or source text on screen (workspace rule). No text in the no-text zones of the template.
- Rule 10 ("break the rules"): the user's prompt wins over every default here. Record each deliberate
  break in the beat sheet with its reason.

## Known gaps

- The thresholds in `cine.mjs` (motion, shake, colour flags) are starting values. They were tested on
  synthetic clips and one real clip with added shake, not on a range of real footage. Check every flag
  against the frame sheet.
- "Screen motion" is the dominant motion in the frame. A subject that fills the frame (a dancer, a
  passing bus) can outweigh the camera. Shot size comes from a rough frontal-face detector, so
  landscapes and back views read as "wide".
- Colour matching evens out average exposure, saturation and warmth, not contrast or individual hues.
  It cannot rescue a blown sky or crushed shadows.
- Stabilization (vidstab, or deshake) reduced shake by about a third to two thirds in tests. Heavy
  walking shake or a frame-filling moving subject may need a slower speed, a tighter crop or a cut.
- `rcg ramp` speed ramps have no motion blur. For a fast stretch over about 1.5x, prep that stretch as
  its own clip with blur instead (`references/shot-prep.md`).
- No ambience sound library is approved. Use the footage's own natural sound, or ask the user for
  sounds (`references/sound-music.md`).
- Long renders: several minutes of 1080p take much longer than a 15 s short. Run them in the
  background. Tested so far: a 6 s pipeline job on the 16:9 template
  (`jobs/2026-10-14-cinematic-long-test`: measure, prep with a 2x blur, assemble, a title, both new
  grades, render verified) and a 2-minute, 21-clip edit of 4K drone footage
  (`jobs/2026-10-15-drone-travel-cinematic`), which rendered and passed verify once its clips were
  scaled down by hand.
- Prep caps each clip at 4/3 of the format (2560x1440 for a 1080p job, `room` in
  `references/shot-prep.md`), because full-size 4K clips made HyperFrames frame extraction time out
  (lessons 13bv). The cap is new (2026-10-15): it passed the demo but has not yet been through a
  full-length render. A clip given more room (`room: 2`) costs render time; keep that for push-ins.
