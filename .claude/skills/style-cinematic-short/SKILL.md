---
name: style-cinematic-short
description: Edit the user's footage into a short cinematic video in rapidContentGen (9:16, 10 s to 1 minute) - a hook shot in the first second, shots that flow (same screen direction, same subject, matched action and speed) cut tight to the music, landscape footage reframed to vertical with crop pans that follow the action, movement added only to still shots, shot variety, steady or stabilized shots, motion blur on speed-ups, matched colour and one grade, quiet sound design and an ending that loops back to the start. Same cinematic rules as style-cinematic-long, tuned for Reels, Shorts and TikTok. Use for cinematic, film-look, travel, B-roll, montage, event or "make my clips look cinematic" requests for a short or vertical video. Other ratios when the prompt asks. Runs inside the video-job workflow.
---

# Cinematic (short form, 9:16)

The same cinematic edit as `style-cinematic-long`, cut for a phone screen and a short attention span.
This skill owns what changes for short form: the hook, the pace, the vertical reframe, the loop and the
safe zones. Everything else comes from the long skill: read its `references/principles.md` (the ten
rules), `references/shot-prep.md` (the `cine.mjs` tool), `references/sound-music.md` and
`references/look.md`. The `video-job` skill still owns intake, the working mode, voice, mix, render and
the report.

- Default output: **1080x1920 (9:16), 10-60 s.** The default template (`vertical-1080x1920`). Other
  ratios and lengths on request (below).
- Tool: `node .agents/skills/style-cinematic-long/scripts/cine.mjs measure | prep` (it lives in the long
  skill; both skills use it). Reframing and pacing for vertical: `references/vertical.md`.
- Learned from the same article as the long skill (2026-10-14). Its point that variety matters more on
  social media, where attention spans are short, is the main reason this skill exists.

## What changes from long form

| | Long (16:9, > 1 min) | Short (9:16, 10-60 s) |
|---|---|---|
| Opening | an establishing wide, held | a hook: the most striking shot, within the first second |
| Sections | several, 15-60 s each | one arc, or two or three short beats |
| Shot length | about 3-6 s calm, 1-2.5 s at peaks | about 0.8-2.5 s; a hero shot up to about 3-4 s |
| Music | one or more tracks, changes by section | one track, its best 10-60 s, from the first frame |
| Text | a title, place cards | at most a word or a short line; often none |
| Ending | the music's ending | a loop: the last shot leads back into the first |
| Footage | landscape fills the frame | landscape is reframed to vertical (crop and pan) |

The shot lengths are starting values to adjust to the track's tempo, not measured norms.

## Fast path

1. **Intake** (video-job steps 1-2): `rcg new-job --name <slug> --video <a> --video <b> ... [--audio <music>] --mode <a|b|c>`.
   Look at the intake sheets. Ask for the music if none came with the prompt.
2. **Measure:** `node .agents/skills/style-cinematic-long/scripts/cine.mjs measure jobs/<id>`. READ
   `data/cine/shots.md` and the sheets. The zoom room per source says how a reframe will look: 1080p
   landscape footage in a 1080x1920 frame is upscaled about 1.8x (soft), and 4K landscape has a little
   room (about 1.1x). Tell the user when most of the footage will be soft.
3. **Pick the hook, the arc and the length.** The hook is the shot with the most striking picture or
   motion, or a flash of the peak moment (then the edit builds back to it). Set the length from the
   music (a phrase or a section that ends cleanly, inside 10-60 s) and the footage (enough strong
   shots).
4. **Select and order shots** (long skill's `principles.md`, rules 1, 5 and 9). Be stricter than in long
   form: in a 20 s edit, a weak shot is 10% of the video. Keep runs of the same screen direction,
   cut on the beat, and change direction or energy on a downbeat. Plan the loop: the last shot's motion
   or subject should lead into the first.
5. **Reframe plan** (`references/vertical.md`): for each landscape shot, where the 9:16 window sits
   (`x`) and whether it pans (`x: [from, to]`) in the run's direction. People: use the face track
   instead.
6. **Beat sheet** (`docs/job-spec.md`; shape as in the long skill's `look.md`, "Assembly", with
   `format` 1080x1920 and the template's safe zones). Run `rcg beat-sheet md`, fix every ERROR. Modes
   (a)/(c): show it and wait for the OK.
7. **Prep:** `data/cine/prep.json` with `"format": "1080x1920"` and a `reframe` on every landscape
   item, plus trim, stabilize, flip, reverse, speed and colour match as needed. Then
   `cine.mjs prep jobs/<id>`. READ its before/after lines and every "reframe upscales" note.
8. **Build:** `rcg assemble --job jobs/<id>`. Open with a `black` block of 0.083 s (2 frames at 24 fps)
   before the hook: a graded shot on the very first frame makes the render fail (lessons 13a), and two
   frames do not weaken the hook. Then a title or word if any (`rcg title`), then
   `rcg plan check`, `rcg mix-check`, `rcg hf --cwd jobs/<id> check`.
9. **Look, render, verify** (video-job steps 7-8): snapshot the hook frame, each cut on a downbeat and
   the last frame next to the first (the loop). Render (`rcg render jobs/<id> --fps <24|25|30>
   --workers 3`), read the sheet and one full frame of the hook. Measure the render's flow:
   `cine.mjs measure jobs/<id> --src renders/final.mp4` (writes `data/cine/render-flow.md`).
10. **Report** (video-job step 9): the shot selection, every reframe and its upscale, flips, reverses,
    speed changes, the colour target, and shooting notes if the footage was weak (for vertical: shoot
    some shots in vertical, or in 4K, so a crop stays sharp).

## Other ratios and requests

- **16:9 or over 60 s:** use `style-cinematic-long`.
- **A 90 s Reel or a longer Short:** this skill still applies. Use two or three sections, each with its
  own energy, and change tracks or sections between them (the long skill's `sound-music.md`).
- **1:1 or 4:5:** no template yet. Tell the user and offer 9:16, or a new template (copy
  `templates/vertical-1080x1920/`, change the sizes and the safe zones). `reframe` already follows the
  `format` in `prep.json`.
- **Keep the whole landscape frame:** the landscape shot fitted inside the vertical frame, with a
  blurred, darkened copy of it filling the frame behind. It shows everything but reads less cinematic.
  Offer it only when a crop would lose the subject, and only for that shot. There is no one-step tool
  for it: build it by hand as two video elements of the same clip in one wrapper (the back one
  `object-fit: cover` with a CSS blur, the front one `object-fit: contain`), and snapshot it. Not tested
  yet.
- **Speech or voiceover:** follow video-job for voice and captions. Write the voiceover with
  `script-modern-storytelling` (peaks every 10-15 s) and put the strongest shots on its peaks. For a
  narrative short (a character who wants something), plan the story with `script-film-storytelling`.
  Captions stay out of the bottom 20% and the right 180 px (pitfall 7).

## Boundaries

All the boundaries of `style-cinematic-long` apply (cleared music only, no flips or reverses that show,
no fake slow motion, no zoom past the room without saying so, no credits on screen, the user's prompt
wins). In addition:

- Text stays inside the 9:16 safe box: not in the bottom 20%, not in the right 180 px, not in the top
  192 px (pitfall 7). `rcg plan check` and `rcg beat-sheet md` report a breach.
- Do not stack a camera move on a reframe pan. One move per shot.
- A hook that misleads (a shot that is not in the story, or a fake peak) is not a hook. Use real
  footage from this video.

## Known gaps

- Everything in the long skill's "Known gaps" (thresholds tested on synthetic clips, rough shot sizes,
  the limits of the colour match and stabilization, no blur on `rcg ramp`, no approved ambience library).
- `reframe` sets the window by hand (`x`, or a straight eased pan). It does not track a moving object
  that is not a face. For a person, use the face track (`references/vertical.md`). For a fast object
  that crosses the frame, prefer a shot where it stays inside the 9:16 window, or keep the whole
  landscape frame (above).
- No vertical cinematic edit has been rendered end to end with this skill yet. The tool steps were
  tested (`cine.mjs demo`), the full job was not.
