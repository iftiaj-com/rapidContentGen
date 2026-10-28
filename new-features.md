# New features plan for rcg

Date: 2026-10-12. Status: Features 1 (cut stage) and 2 (plan.json record mode) done; Feature 3 (learning-from-user-taste) done; Feature 4 (style-anti-ai) done; Feature 5 (style-long-video-to-clips) done; Feature 6 (agent delegation note) done; Part 2 is ideas only.

This plan adds six features to rcg and explains five more ideas. Only two of them change the core (the cut
stage and plan.json); the rest are skills or text (see "Core or skill"). The ideas come from studying the
ai-video-editor repo. Nothing in rcg will import, call or depend on that repo. Each feature is
written fresh in rcg's own style, and the design source is logged with
`rcg provenance record` (kind `learn`) as AGENTS.md asks.

## How to read this

- **VERIFIED** means it was read in a file. Paths are relative to the rcg repo root unless they say otherwise.
- **INFERRED** means it is a likely fact that still needs a check before building.
- **Judgment** means it is an opinion. Effort sizes are rough guesses, not measured.
- Numbers from ai-video-editor are that repo's own constants. They are a starting point to tune on rcg jobs, not
  proven values.

## Ground rules this plan keeps

These come from rcg's AGENTS.md and the user's global rules (VERIFIED):

- No frameworks and no build step. Tools are Node ES modules (`.mjs`). Audio and model work may use Python 3.11
  in the voice venv.
- No absolute paths in committed code. Every path and binary comes from `tools/lib/config.mjs`
  (`config/workspace.json` merged with the git-ignored `workspace.local.json`).
- New commands go in the `COMMANDS` map in `tools/rcg.mjs`, and each module also runs on its own through `isMain`.
- Skills are edited in `.agents/skills/` only, then copied with `rcg skills sync`.
- JSON is written from Node or Python, never through PowerShell redirection (the BOM breaks it).
- Ask before any install or download. A render counts only when the output is checked, not the exit code.
- HyperFrames stays the renderer, run only through `rcg hf` and `rcg render`.
- Style skills keep carrying the edit styles. New features feed the skills; they do not replace them.

## Core or skill

The rule: **core is what every job needs to run correctly. Everything optional, or that the agent chooses to use,
is a skill.** Fewer core changes mean less to break and less to learn.

How a skill carries code, so the core stays untouched:

- A skill may ship scripts in its own folder: `.agents/skills/<name>/scripts/*.mjs`, run with
  `node .agents/skills/<name>/scripts/<script>.mjs`. They are not added to `tools/rcg.mjs`.
- Skill scripts may import `tools/lib/*` (config, ffmpeg, lock), so paths still come from config and heavy work
  still takes the lock.
- Core code never imports skill code. Deleting a skill folder leaves rcg working.
- This is a new convention: rcg's own skills hold no scripts today (VERIFIED: style packs keep their code in
  `library/styles/<slug>/`). Add one line about it to AGENTS.md. INFERRED: check that `rcg skills sync` copies a
  `scripts/` folder and that `doctor`'s stale-copy check handles it.

| Feature | Where it lives | Why |
|---|---|---|
| Cut stage | **Core** (`rcg cut`) + one step in video-job | `cut.mp4` and the re-timed `words.json` feed every later step, and the encode needs the heavy lock |
| plan.json contract | **Core**, kept small (record mode first) | A contract only works if every block command writes it |
| Agent delegation note | **AGENTS.md text** (no code) | It must apply on every job. A skill only loads when called |
| learning-from-user-taste | **Skill** `/learning-from-user-taste` | Rules are text in skills, numbers are flags on existing commands. No core change |
| style-anti-ai | **Skill** `/style-anti-ai` | Optional review pass. Never blocks a render |
| style-long-video-to-clips | **Skill** `/style-long-video-to-clips` | A workflow on top of existing commands (`new-job`, `rcg cut`, `rcg track`) |
| Part 2: pinned installs | Core (setup, `doctor`) | Every install needs it |
| Part 2: CI and self-checks | Repo infrastructure (`.github/`, `--demo` flags) | Neither core nor skill |
| Part 2: render estimate | Core, very small (one log line per render, an `--estimate` flag) | The log must be written by `rcg render` |
| Part 2: export to editors | **Skill** `/export-to-editor` | Used only on request |
| Part 2: review page | **Skill** `/review-render` | Optional input for approvals and taste |

## Speed budget (applies to every feature)

The goal is to keep rcg fast. Each feature follows these rules (judgment):

1. **Check on paper before rendering.** Every new check runs on JSON (words, plan) first. A render is never the
   way to find a mistake that the plan can show.
2. **Cache by content hash.** Transcripts, cut renders, agent answer files and frame stats are stored under the job
   with the input's sha256. A re-run with the same input does no work.
3. **Compact inputs for judgment.** Code writes short summary files (candidates, shortlists, check results), so
   whichever agent decides reads little.
4. **Reuse frames already made.** Checks on rendered output reuse the frames `rcg verify` already extracts for
   its sheet, instead of decoding the video again.
5. **Respect the heavy lock.** Anything that encodes video takes a `heavySlot`, like `rcg render` does today
   (`tools/lib/lock.mjs`). Light work (transcribe, plan, checks) does not.
6. **No new required dependency.** Optional extras (a bigger Whisper model) stay optional, and rcg works
   without them. No model API, key or provider is added.

---

# Part 1: Features to build

## Where each feature sits in a job

```
CORE:   intake ─► CUT STAGE ─► analyze ─► beat sheet ─► PLAN.JSON (record) ─► blocks ─► render ─► verify
                    (new)                                   (new)

SKILLS (optional, the agent or user calls them):
  /learning-from-user-taste   saves the user's taste into the skills; applies on the next job
  /style-anti-ai              reviews compositions before render, the frame sheet after
  /style-long-video-to-clips  runs the cut stage and video-job once per chosen clip

AGENTS.md: agent delegation note, applies everywhere judgment is needed
```

## Build order

| Order | Feature | Where | Why this order | Effort (guess) |
|---|---|---|---|---|
| 1 | Agent delegation note (Feature 6) | AGENTS.md | Text only. The cut stage and clips skill refer to it | Small |
| 2 | Cut stage | Core | Biggest missing capability. Works on its own | Large |
| 3 | learning-from-user-taste | Skill | Text and flags only, no core change | Small to medium |
| 4 | style-long-video-to-clips | Skill | Needs the cut stage | Medium |
| 5 | style-anti-ai | Skill | Independent, optional | Medium |
| 6 | plan.json contract | Core | Most invasive change, so last, and record mode first | Large |

---

## Feature 1: Cut stage (retakes, false starts, pauses)

### Status: DONE 2026-10-12 (marked done by the user; the 3-take check below is still open)

`rcg cut` is in `tools/cut/` (registered in `tools/rcg.mjs`), plus `voice_cli.py transcribe-cut`, a doctor
check for the cached Whisper model, config `cut`, video-job step 1b, docs and provenance (kind `port`, since the
logic was rewritten closely; ai-video-editor's MIT license is kept in `tools/cut/LICENSE-ai-video-editor`).

Tested (VERIFIED in this session):
- `rcg cut demo`: offline self-check, all pass in about 5 s.
- The `difflib` port matches Python's on 400 random cases.
- `Alma.mp4` (41 s, no retakes) and a test take spliced from it with a real restart (38 s): both run end to end and
  pass verify. On Alma with the original settings, `build` gives the same kept frames and re-timed words as
  ai-video-editor's `build_timeline.py`.

Changes from this plan and from the ai-video-editor design, each found on those takes:
- **Silence is found by window peak**, like ffmpeg's `silencedetect`. RMS windows cut the quiet ends of words
  (3 clipped words, 18.4 s instead of 21.2 s on Alma).
- **Voiced gaps are transcribed again.** Whisper `base` skipped 18 s of speech on the spliced take. A stretch of
  1.5 s or more with no words and 1 s or more of voiced sound is transcribed on its own. Words go in only between
  two words and when the median confidence is 0.5 or more; an intro or outro is only marked (Whisper invented
  "I'm sorry" over the TikTok end card at 0.29 median).
- **A two-clause line said twice is one cut.** The design flagged each clause, and cutting both removed the
  keeper's first clause.
- **Zero-length word labels** count as kept only if their moment is kept (the paper edit showed a cut "So,").
- **Verify reports MISSING only near a join.** A cut changes audio only there; other unheard words are listed as
  transcriber variance. Without this, `base`'s mishearings buried the one real error.
- **Word-gap threshold 15 dB, not 12** (`cut.gapQuietDb`). At 12, a soft "okay" was trimmed into a 0.14 s
  "pause" and verify could not hear it; at 15 both takes pass. Tuned on one speaker only.
- `decisions.in.json` uses `"extra"` for spans the code missed, so `spans.json` stays generated.
- Not built: hook variants (`lead.json`), the HTML review page, `--demo` on `build` alone (it is `rcg cut demo`).

Still to do before "Done when": 3 real takes with marked retakes (only one real take was available).

### What rcg had before (VERIFIED)

- `rcg voice transcribe` (tools/voice/voice_cli.py) runs faster-whisper with `word_timestamps=True` and writes
  `{audio, language, words:[{text,start,end,probability}]}`. It does not use `vad_filter`.
- marketing-pro trims only head and tail dead air (`--trim`). `speechEnvelope` finds quiet runs but only to break
  clauses.
- There is no cutting inside source footage, no retake or filler removal, and no concat helper in
  `tools/lib/ffmpeg.mjs`.

### What it adds

A clean cut of the user's raw take, before any graphics, plus word timings re-timed to that cut. Every later
step (captions, beats, camera, plan) works from the cut, not the raw file.

### Commands

| Command | Does | Heavy slot |
|---|---|---|
| `rcg cut transcribe <job> [--src assets/x.mp4] [--model base]` | Words with timings, with the cut settings below. Keeps fillers where Whisper allows | No |
| `rcg cut propose <job>` | Finds candidates in code and writes `transcript.txt` and `candidates.md` for the agent to decide (Feature 6) | No |
| `rcg cut apply <job>` | Reads the agent's decisions (`decisions.in.json`), writes `spans.json` and `review.md` | No |
| `rcg cut build <job> [--max-pause 0.15] [--dry-run]` | Turns spans and pauses into kept ranges, writes `paper-edit.md` | No |
| `rcg cut render <job>` | Encodes `assets/cut/<name>.mp4` | Yes |
| `rcg cut verify <job>` | Transcribes the cut again and compares it with the kept words | No |
| `rcg cut fix <job> old=new` | Fixes a misheard word everywhere, keeps timings, saves to `fixes.json` | No |

### Files in the job

```
jobs/<id>/data/cut/
  words.raw.json      transcript of the raw take (cached by source sha256)
  transcript.txt      one line per phrase, [start-end], (+N.Ns) pause markers  <- what the agent reads
  candidates.md       every place code flagged, numbered, with a few words of context each
  decisions.in.json   the agent's answer per candidate: cut | keep | unsure, plus which take to keep
  spans.json          what to remove, quoted from the transcript
  review.md           the items marked unsure, for the user
  decisions.json      kept source ranges, in seconds and frames
  paper-edit.md       the cut as text, <<n>> at each join, CLIPPED warnings
  verify.json         MISSING / SURVIVED / HEARD DIFFERENTLY / DOUBLED
  fixes.json          old=new word fixes, re-applied to every later transcript
jobs/<id>/assets/cut/<name>.mp4
jobs/<id>/data/words.json   re-timed to the cut (what captions and beats use)
```

`spans.json` shape (quote based, so the agent never types a timestamp):

```json
[
  {"text": "so the thing about", "kind": "false_start", "after": 12.4, "confidence": "high", "note": "restarts at 13.1s"},
  {"text": "wait sorry", "kind": "meta"}
]
```

`kind` is one of `retake`, `false_start`, `filler`, `meta`, `redundant`, `alt_hook`. A phrase that appears more
than once needs `after` (the first match at or after that second) or `occurrence`. Two spans may not overlap.

### How it works

**1. Transcribe.** Reuse `voice_cli.py`'s faster-whisper setup, with a new cut mode that copies ai-video-editor's
transcription settings (VERIFIED in its `skills/cut/scripts/transcribe.py`):
- **Model `base`** (decided 2026-10-12). It is already cached on this machine, so nothing is downloaded. `small`
  stays an optional `--model small`, and downloading it needs the user's yes.
- `initial_prompt` with fillers ("Um, uh, so, like...") so Whisper writes them down.
- `vad_filter=True` with `min_silence_duration_ms: 500`. Without it, word times drift after a long silence.
- `condition_on_previous_text=False`. With it on, Whisper tends to merge a repeated line into one, and repeated
  lines are the retakes.
- `beam_size=5`.
- **Re-check pass:** a word label that holds far more speech than one word (measured from loudness, the same
  helper as step 4) is transcribed again on its own with `clip_timestamps`. More words back replace the label.
  None back marks it as unheard speech in `transcript.txt`.
- The plain `voice_cli.py` transcribe stays as it is, so voiceover alignment does not change.
- Cache by source sha256 in `data/cut/words.raw.json`.

**Model test (VERIFIED in this session, one 41 s take, `Alma.mp4`, no retakes in it):**

| Run | Words | Time | Code flags | Cuts after judgment |
|---|---|---|---|---|
| rcg `base`, plain settings | 75 | 11 s | 2 | 1 |
| ai-video-editor settings, `base` | 78 | 9 s | 5 | 1 |
| ai-video-editor settings, `small` | 78 | 23 s | 7 | 1 |

- `small` heard more words correctly where context can judge ("it's already 4", "not even asleep", a name said
  three times). `base` with the editor settings caught a word plain `base` missed ("JJ" where `small` heard
  "Chee Chee").
- `small` raised one false retake (two different sentences sharing the name) that would have cut about 7 s of
  good content. The judgment step caught it.
- All three ended with the same cut. The take has no real restarts, so whether `small` catches retakes better
  is still unknown. Re-test on a take with real retakes before the "Done when" check, and switch the default
  only if `base` misses retakes that `small` catches.

**2. Find candidates in code.** All in one Node module, `tools/cut/candidates.mjs`. The starting constants below
come from ai-video-editor's `retakes.py` and must be tuned on rcg takes:
- Split phrases at a gap of 0.5 s or more, or at `. ? !`. Split clauses further at `, ; :` and after um/uh.
- **Restart, same opening:** a clause whose first words (up to 6, fillers dropped) fuzzily match an earlier clause
  within 40 s. A word "matches" at a similarity ratio of 0.75 or more. Needs at least 2 matched words and at least
  60% of the shorter opening.
- **Restart, repeated run:** the same 2+ word run repeated within 30 words, but not a list ("X and X").
- A restart is a `false_start` when the first try is 4 words or fewer and the gap is under 1 s, else a `retake`.
  The last take wins.
- **Fragment:** a phrase of 8 words or fewer that does not end a sentence and is followed by another phrase.
- **Meta:** "wait", "sorry", "hold on", "let me start again", "take two" and similar.
- **Hard fillers** (um, uh, erm): cut without asking, unless the learned setting `cut.keep_fillers` is true.
- **Soft fillers** ("you know", "I mean", "like"): only when set off by a 0.3 s pause, a comma, or after
  "and / so / but / was". Listed as candidates, never cut by code alone.
- **Alternate hooks:** a take of the opening line said again near the end (more than 40 s later, 30 words or
  fewer). Cut as `alt_hook`, listed in `hooks.json` so the user can swap hooks later.

A small fuzzy matcher (a similarity ratio like Python's difflib) is about 40 lines in Node, so no package is
needed.

**3. Decide.** The agent answers every candidate in `candidates.md` in one pass, following the delegation note
(Feature 6): it may do it itself or hand the list to a sub-agent, and it checks the result either way. For each
candidate: is this a retry, and which attempt stays. `rcg cut apply` turns the answers into spans:

| Answer | Action |
|---|---|
| cut, last take stays | Cut |
| cut, but the first take is better | Never cut by code. Goes to `review.md` for the user |
| unsure | Not cut. Goes to `review.md` |
| keep | Not cut |

Quality rule: when in doubt, keep. A wrong cut loses a line; a missed retake is caught by verify (SURVIVED) or by the
user.

**4. Tighten pauses.** In `tools/cut/build.mjs`, using ffmpeg to decode the audio to raw PCM (existing `decode`
helper):
- Measure loudness in 20 ms windows. Speech level = the 99th percentile. Floor = the most common 1 dB bin more than
  10 dB below speech. Silence threshold = max(speech − 26, floor + 6).
- If speech is less than 20 dB above the floor, assume a music bed and trim only gaps between words.
- Any silence longer than `max-pause` (default 0.15 s) is shortened to 2/3 of it (0.10 s). Keep 0.10 s of pad
  around words and a 0.25 s run-in before a very short word.
- **Move joins off speech:** if a join lands where both sides are loud, slide it up to 0.6 s toward the removed
  side to a quiet frame. Report any join that cannot move.
- **CLIPPED check:** a word with no span asking for it, that no longer plays, is listed in `paper-edit.md`.
- Snap to frames: cut start floored, end ceiled, kept slivers under 0.2 s dropped, 0.4 s kept after the last word.

**5. Render.** In `tools/cut/render.mjs`:
- Re-encode each kept range (never `-c copy`, which snaps to keyframes and can land up to 2 s off). Encode ranges
  in parallel within one heavy slot, then concat.
- Count frames per range and after joining. A mismatch is an error.
- Cut audio in one pass with 8 ms fades at each join, then mux.
- Keep the source fps in `cut.mp4`. INFERRED: the HyperFrames composition runs at the template fps (24 by default
  in workspace.json), so the plan step must convert seconds, never frame numbers, between the two.
- Use `bin.hfFfmpeg` (9.0.2) or check edges with `rcg verify`'s dead-edge test, because AGENTS.md records that
  ffmpeg 8.1 blanks the right edge of 1080-wide output. INFERRED: that bug was seen in HyperFrames renders; whether
  it hits a plain x264 encode is not known.

**6. Verify.** Transcribe `cut.mp4` again and diff it with the kept words (word order plus a 0.25 s time window):
- **MISSING:** a kept word is not heard. Raise the pad or narrow a span, rebuild.
- **SURVIVED:** a removed word is still heard. Add a span.
- **HEARD DIFFERENTLY** and **DOUBLED** ("very, very"): reported, no rebuild.
One fix round, then show the user what is left.

**7. Approve.** The user reads `paper-edit.md` (or the review page, Part 2 item 5) and approves. Only then does
the job continue.

### Changes to existing files

- `tools/rcg.mjs`: register `cut`.
- `.agents/skills/video-job/SKILL.md`: a new step "1b. Cut", run when the job's footage is the user's own
  talking take. Steps 3 onward use `assets/cut/<name>.mp4` and the re-timed `data/words.json`.
- `tools/jobs/doctor.mjs`: check that the chosen Whisper model is cached (today doctor does not check this,
  VERIFIED).
- `docs/capabilities.md` and AGENTS.md command list.

### Done when

- On 3 real takes, every retake, false start and "wait, sorry" a person marks by hand is cut, and no kept line is
  lost (verify shows 0 MISSING).
- A 3-minute take goes from raw to verified cut with the agent reading only `transcript.txt`, `candidates.md`,
  `review.md` and `paper-edit.md`, never the raw word JSON.
- `rcg cut build --demo` runs on a synthetic clip in seconds with no network.

---

## Feature 2: plan.json as the contract between planner and renderer

### Status: DONE 2026-10-12 (marked done by the user; migration step 1, record mode, plus check, apply and diff)

`tools/plan/` (`rcg plan check|apply|diff|show|demo`), one hook in `tools/rcg.mjs`, and two
`split-screen build` steps (`layout`, `clamp`) now run through `rcg` so they are recorded.

Tested (VERIFIED in this session):
- `rcg plan demo`: 12 checks pass in about 2 s, no network.
- A copy of the real job `2026-10-09-r15-mp-reference-looks`, built with its own `marketing-pro build`: all 14
  steps recorded, `plan check` 0 fail and 0 warn in 0.26 s, and `plan apply` rebuilt the page from `plan.json`
  alone in 4.6 s with `index.html` and every composition byte-identical. Identical files give an identical
  render, so no render comparison was needed.

Changes from this plan:
- **Recording is one hook in `rcg.mjs`, not a change in each block command.** It records any command named in
  `kinds.mjs` that edits a job's page. The 17 block files are untouched. A block run without `rcg` (its module
  called directly) is not recorded; the next recorded step sees the change as drift.
- **An item is the command and its exact arguments** (the job path written as `{job}`), not the `tracks` object
  with typed props sketched above. Items keep their order in one list (layering depends on it) and carry a
  `track` field. Typed props per kind belong to planner mode.
- **Studio and hand edits:** when the page changed outside recorded steps, that page becomes the new base and
  the earlier items are marked `inBase` (checked, not replayed), so `apply` never undoes an outside edit.
  `apply` also refuses to run over unrecorded changes unless `--force`. `diff` shows them.
- **Text boxes come from the compositions' CSS.** Captions use their generator's own extent (center ± 1.6 x
  size): their layout box is four lines tall and gave a false FAIL.
- **Face check skips blocks layered behind a PNP cut-out** (they sit under the subject).
- Not built: planner mode (step 2), apply mode as the agent's way of editing (step 3), `plan init`.

### What rcg has today (VERIFIED)

- `beat-sheet.json` is the source of truth for the story (schema in `docs/job-spec.md`).
- Each style keeps its own plan file with no shared shape: `data/mp-plan.json`, `split-plan.json`,
  `style-plan.json`, `mm-plan.json`, `info-plan.json`, `flythrough.json`.
- Block commands write straight into `index.html` (host `<div>`s and `<!-- rcg:<kind> -->` marker regions).

So nothing describes the whole edit in one checkable file. A mistake shows up only after a render.

### What it adds

One file, `jobs/<id>/data/plan.json`, that lists everything that will be on screen and in the mix, with times
in seconds. Planners write it. `rcg plan apply` turns it into `index.html` by calling the existing block commands.
Checks read it before anything renders.

### Shape (version 1)

```json
{
  "version": 1,
  "format": {"width": 1080, "height": 1920, "fps": 24, "duration": 42.5},
  "source": {"video": "assets/cut/take.mp4", "words": "data/words.json"},
  "style": "marketing-pro",
  "safeZones": "from beat-sheet",
  "tracks": {
    "captions": [{"id": "cap", "style": "flash", "chunks": [{"text": "SO I'M", "start": 0.1, "end": 0.6}]}],
    "camera":   [{"id": "cam1", "move": "push-in", "start": 7.9, "end": 10.9, "scale": 1.2, "ease": "sine.inOut"}],
    "blocks":   [{"id": "t1", "kind": "title", "start": 0.0, "duration": 2.0, "props": {"text": "..."}, "box": [10, 8, 80, 12]}],
    "effects":  [{"id": "fx1", "kind": "shader", "name": "beat-flash", "start": 12.0, "duration": 4.0}],
    "audio":    [{"id": "vo", "src": "assets/vo.wav", "start": 0, "gainDb": 0}, {"id": "sfx1", "src": "library/sfx/pop.wav", "start": 3.2}]
  },
  "checks": {"lastRun": null}
}
```

### The contract, so planner and renderer cannot drift

- One module, `tools/plan/kinds.mjs`, maps every block `kind` to: its props, its validator and the existing
  command that applies it (for example `title` → `tools/blocks/title.mjs`).
- `rcg plan check` and `rcg plan apply` both import that one map. A kind with no handler fails the check.
- Lesson from ai-video-editor (VERIFIED by the study): its planner and renderer each had their own copy of the
  shape, and no test compared them. One shared map avoids that.

### Commands

| Command | Does |
|---|---|
| `rcg plan init <job>` | Builds a first plan from the beat sheet, words and the style's defaults |
| `rcg plan check <job>` | Validates shape and rules: safe zones, caption timing against words, blocks over the face (from `data/track-*.json`), overlaps. Writes `data/plan-check.json`. Exit 1 on FAIL |
| `rcg plan apply <job>` | Runs the block commands for every item, in order, idempotent (marker regions are regenerated, never edited) |
| `rcg plan diff <job>` | What changed since the last apply, so only those blocks are rebuilt |

### Migration (no big bang)

1. **Record mode.** Each block command also appends or updates its item in `plan.json` when it runs. Nothing
   changes for the user. `plan check` can already run.
2. **Planner mode.** Style planners (marketing-pro, split, style, mix-media, info) write `plan.json` items instead
   of their own plan files. Their old files become views of it.
3. **Apply mode.** `rcg plan apply` builds `index.html`. The agent edits `plan.json`, not HTML.

**Risk: hand edits in HyperFrames Studio.** Studio writes the composition files directly (VERIFIED in the
hyperframes-studio skill), so after a Studio session `index.html` and `plan.json` can disagree. Before apply mode,
decide one of: `rcg plan diff` imports Studio's changes back into `plan.json`, or `rcg plan apply` refuses to run
when `index.html` changed since the last apply and says which blocks differ.

### Speed

- `plan check` reads JSON only: milliseconds to a second (INFERRED).
- `plan diff` means a one-word caption fix rebuilds one block, not the whole page.

### Done when

- Every block kind in `tools/blocks/` has a handler in `kinds.mjs`.
- A regression job rebuilt from `plan.json` alone matches its current `index.html` render (frame sheet compared
  by eye, then by `rcg verify`).
- `rcg plan check --demo` passes with no network.

---

## Feature 3: learning-from-user-taste

### Status: DONE 2026-10-12 (marked done by the user)

`.agents/skills/learning-from-user-taste/` (SKILL.md, `references/limits.md`, `scripts/learn.mjs`: add | list |
forget | check | effective), video-job intake step 4 (read the learned rules, send reactions to the skill), and two
AGENTS.md lines (taste lives in the skills; skills may carry scripts). No core change.

Tested (VERIFIED in this session):
- `rcg skills sync` copies the skill's `scripts/` folder and doctor's stale-copy check covers it (it compares every
  file), so the INFERRED question above is answered.
- Refusals name the reason: caption y 1500 (pitfall 7), a 2.0x zoom (the cropped-face take), a style that does not
  exist, and caption size 160 at a saved y 1300 (the text would reach y 1556).
- A second value for the same setting in the same scope is refused (clash) until `--replace`. A job-scope rule goes
  to `JOB.md`, and `effective` merges every job, style and job rules in order. After add, replace and forget, the
  real video-job SKILL.md was byte-identical to before.
- `learn check`: all lines parse, values within limits, no user rule left outside a learned section.

The 8 user-rule lines are 4 rules, now one line each (no two homes):

| Rule | Scope | Lines it replaced |
|---|---|---|
| Credits never appear in the video | every job | info-graphics SKILL.md and assets.md, mix-media SKILL.md |
| Negative captions go behind the subject, white, heavy, 1.3x, no pill (R14) | every job | video-job SKILL.md |
| Voices at 1.3x with skip silences (`apply: rcg voice say --speed 1.3`) | style info-graphics | info-graphics SKILL.md step 3 and script-writing.md |
| Negative text only behind the head | style marketing-pro | marketing-pro SKILL.md and captions-heroes.md |

The old places keep their procedure text and point to the learned line. The rules were kept close to word for word
rather than moved verbatim: several sat inside workflow steps that still need their commands.

Open:
- My memory notes say the 1.3x voice rule is for every voice, but the skill files only state it for info-graphics.
  It is saved with the info-graphics scope; widen it with `learn add --scope every ... --setting voice-speed` if the
  user wants it everywhere.
- Hard limits for cut pause (0.08-0.5 s) and voice speed (0.8-1.5) are judgment, not measured.
- Paths 2 (approval stops) and 3 (review page) are instructions only; the review page does not exist yet.

### Is it useless next to "Known pitfalls" and lessons.md?

No, but it overlaps in one place and could conflict in three. The check, against AGENTS.md lines 170-185 and
`.agents/skills/video-job/references/lessons.md` (344 lines, VERIFIED):

| | Known pitfalls and lessons.md | learning-from-user-taste |
|---|---|---|
| What it holds | Technical facts that broke a render: volume lanes are absolute, music peaks over 0 dBFS, 24 fps slow motion stutters, ffmpeg 8.1 blanks the right edge, safe zones | Taste: how the user likes an edit to look and feel (caption size, pace, number of camera moves, keep my ums) |
| True for | Every job and every user. A fact about the tools | This user, sometimes only one style or one job |
| Comes from | A failed or wasted render, then a measurement | The user reacting to a result ("too slow", "captions too small") |
| Enforced by | Mostly code: `mix-check`, `verify`, `doctor`, the caption generator | Rules in the skills, applied by the agent as command flags |
| Changes | Rarely, and only with new evidence | Whenever the user changes their mind |

So the pitfalls do not make learning useless: none of the 10 pitfalls is a taste preference.

**The overlap.** rcg already stores taste by hand: 8 lines marked "(user rule, ...)" sit in skill files (VERIFIED:
video-job SKILL.md:112, style-info-graphics SKILL.md:18 and :47, its references/assets.md:39 and
script-writing.md:9, style-marketing-pro SKILL.md:127 and references/captions-heroes.md:68, style-mix-media
SKILL.md:120). learning-from-user-taste is that same habit, made consistent, as a skill.

**The possible conflicts, and how this design avoids them.**

1. **Two homes for user rules.** A separate rules file next to those 8 skill lines would drift apart. Fix: no
   separate store. Learned rules live in the skills, where the user rules already are, in one marked section.
2. **Taste breaking a pitfall.** "Captions lower" could push text into the bottom 20% of a 9:16 frame (pitfall 7).
   "Music louder" could undo the -2.5 dBTP limit (pitfall 2). Fix: pitfalls and safe zones always win. Each
   setting has a hard limit, the skill refuses or clamps a value past it and says why, and the existing core
   checks (`rcg style build` safe areas, `rcg mix-check`, `rcg verify`) still catch anything that slips.
3. **A bug filed as taste.** "The right edge is black" is a pitfall, not a preference. Fix: the skill sorts each
   correction first. If it is a technical fault or a measured fact, it goes to lessons.md (and a code check where
   possible), not into learning.
4. **A new rule contradicting an old one.** A rule asking for a caption stroke would contradict video-job
   SKILL.md:112 ("no pill, stroke, glow or shadow (user rule, R14)"). Fix: the skill searches the existing
   user-rule lines first. On a clash it asks the user which wins and replaces the old line, never keeps both.

### What it adds

A correction given once is saved in the right place and applied on the next job, without the user saying it
again. The style skills carry the style, as they do today.

### How taste reaches it (no review page needed)

The feature does not depend on the review page. It needs only the user's reaction and a place to save it. Three
input paths, in build order:

| Path | When | How the correction is captured | Build |
|---|---|---|---|
| 1. Chat (default) | The user watches the render, the frame sheet or a Studio preview, then types a reaction ("captions too small", "too many zooms") | The skill decides bug or taste, asks the scope once, saves the rule, then redoes the edit | With this feature |
| 2. Approval questions | At the existing video-job stops (beat sheet, preview, before the final render) | When the user changes something at a stop, the skill asks once: "keep this for next time?" | With this feature |
| 3. Review page notes (optional, later) | After a render, if the review page (Part 2 item 5) is built | Each note has a time and a frame still. On Send, the agent sorts each note: one-off fix, taste, or bug. Only taste notes are saved | When the review page is built |

A fourth path is possible but not planned: reading the user's hand edits in HyperFrames Studio as taste signals.
INFERRED: it would need `plan diff` (Feature 2) to compare the files before and after a Studio session, and most
Studio edits are one-off fixes, not taste. Not worth building first.

**Why chat is enough to start.** Every taste rule in rcg today (the 8 "(user rule, ...)" lines) came from chat.
The review page makes reactions more precise (an exact time and a picture instead of "around the middle"), but it
does not change what gets saved.

**The one rule for all paths:** not every reaction is taste. "Move this title, it covers her face" is a one-off
fix for this job. "Titles always clear the face" is taste. When it is unclear, the skill asks the user once, with
"just this job" as the recommended answer, so one-off fixes do not pile up as rules.

### Where a rule is saved (no new store, no core change)

| Scope | Where the rule goes |
|---|---|
| Every job | `.agents/skills/video-job/SKILL.md`, in a `<!-- rcg:learned begin/end -->` section |
| One style | `.agents/skills/style-<slug>/SKILL.md`, same marked section |
| One job | `jobs/<id>/JOB.md` |

Skills are already read on every job, so a saved rule applies without any extra step. Each line keeps today's
user-rule format, plus the exact command flag that applies it when there is one:

`- Captions sit at y 1400 on 9:16 (user rule, 2026-10-12; apply: rcg captions --y 1400)`

Numbers are not stored in a new settings file. They are flags on commands rcg already has. VERIFIED: style packs'
`style.json` hold the caption style and mode, not size or position, and positions are passed as flags (the
character-lighting pack notes `--y 950`). INFERRED: the exact flag for each setting below must be confirmed in each
command's help before building.

The 8 existing user-rule lines move into the marked sections once, word for word.

### Settings and their hard limits

| The user says | Applied as | Hard limit (from) |
|---|---|---|
| Cut too slow / too tight | `rcg cut build --max-pause` | 0.08 to 0.5 s (judgment) |
| Keep my ums | `rcg cut propose --keep-fillers` | none |
| Captions too small / big | caption size flag | must fit the safe box |
| Captions higher / lower | `rcg captions --y` | never in the bottom 20% or the right 180 px on 9:16 (pitfall 7) |
| More / fewer words on screen | caption mode or words flag | groups never overlap in time (lessons 13c) |
| Caption or highlight colour | caption style or colour flag | brand first, then `/style-anti-ai` if used |
| Fewer / more camera moves, zoom too tight | camera flags of the style's planner | the face stays in frame |
| No sound effects / quieter music | sfx placement, music level | music limited to -2.5 dBTP, mix to -14 LUFS and -1 dBTP (pitfall 2, workspace defaults) |
| Anything else | a word rule the agent follows | pitfalls still win |

The zoom limit is here because a creator's measured ×2.0 zoom cropped a face in this session, and the other app had
no setting to fix it (VERIFIED, seen in ai-video-editor).

Order when rules meet: style pack defaults < every job < one style < one job. The hard limits always win, and the
existing core checks (`rcg style build` safe areas, `rcg mix-check`, `rcg verify`) still catch anything that slips.

### Skill folder

```
.agents/skills/learning-from-user-taste/
  SKILL.md               when the user reacts: bug or taste, one-off or rule, which scope; then save and redo
  references/limits.md   the hard-limit table above, with the pitfall each one comes from
  scripts/learn.mjs      add | list | forget: writes the marked sections, checks limits, finds clashes, then runs
                         rcg skills sync
```

### Done when

- A correction given once is applied on the next job without being repeated.
- A value that would break a pitfall is refused with the pitfall named.
- The 8 existing user-rule lines live in marked sections, and no two rules contradict each other.
- Removing the skill folder leaves the saved rules in place and the rest of rcg unchanged.

---

## Feature 4: style-anti-ai (skill `/style-anti-ai`)

### Status: DONE 2026-10-12 (marked done by the user)

`.agents/skills/style-anti-ai/` (SKILL.md; `references/rules.md` and `style-allowances.md`, each with a JSON block
as the one source; `scripts/check.mjs`: `<job> [--frames]`, `calibrate`, `demo`), one routing line in video-job,
one row in AGENTS.md, provenance kind `learn`. No core change.

Tested (VERIFIED in this session):
- `check.mjs calibrate --frames` over all 36 jobs in `jobs/` in about 13 s. With the calibrated levels no past job
  raises a BAN.
- `check.mjs demo`: a scratch job with titles made by `rcg title` reports `emoji` and `multiplier-stat` (BAN) and
  `slop-copy` (WARN) on the title block, `slop-icon` on the icon block, nothing on a plain title, and an allowance
  moves a finding to the allowed list.
- On `2026-10-09-r15-mp-reference-looks`: 0 BAN, 4 WARN (Inter display, 6 whooshes for 4 blocks), purple and the
  zoom rate allowed for marketing-pro.

Changes from this plan:
- 24 rules, not the 12 in the table above: the table's rules plus `slop-structure`, `multiplier-stat`,
  `big-number`, `em-dash`, `title-case`, `one-accent-word`, `preset-captions`, `bounce-ease` from the source list.
- Calibration (rules.md): every rule started WARN; only `emoji` and `multiplier-stat` became BAN. `slop-icon`
  and `slop-copy` stay WARN because each fired on a past job. **All 36 jobs were treated as approved**, which is
  an assumption.
- The first calibration run showed detectors firing on rcg's own design, so they were changed: text over footage
  or a photo (also a CSS background photo) is not a text-only card; title case is judged per line; bounce counts
  only when most blocks overshoot; a camera move is a short zoom or punch, not the drift that follows it.
- Allowances added from the packs' own descriptions and the calibration: info-graphics and info-collage (type
  cards, one accent word, counters, cream), tactile-collage and mix-media (cream paper), marketing-pro (purple,
  the measured zoom rate), character-lighting (neon on black), `shader` and `fx` (neon, glow).
- `--frames` reads the frame sheet as a whole (colour shares), not per card.
- Brand colours and fonts come from an optional `jobs/<id>/data/brand.json`; rcg had no brand kit.

### What it is

An optional skill that reviews an edit for looks that read as generic AI output, and suggests fixes. It is **not**
part of the core: no hook in `rcg plan check`, `rcg verify` or `rcg render`, and it never blocks a render. The
agent runs it when the user asks, or when a style skill lists it as a companion.

### Why a skill, not core

rcg ships 166 shaders, VJ effects and neon-friendly styles on purpose. A core rule like "no neon on black" would
fight real styles, and every exception would spread through core code. As a skill, the rules, the exceptions and
the judgment stay in one folder that can be changed or removed alone.

### Naming note

Like style-long-video-to-clips, it is not a look. video-job's routing gets one line: style-anti-ai is a companion
check that may run with any pack and is never offered as the look.

### Skill folder

```
.agents/skills/style-anti-ai/
  SKILL.md                         when to run, how to read the report, how to fix, when to ask the user
  references/rules.md              the rule list: id, level (BAN | WARN), what it looks like, why it reads as AI
  references/style-allowances.md   per style pack, which rules do not apply and why
                                   (for example: neon is the point of the VJ and global-visuals looks)
  scripts/check.mjs                the detectors
```

### How it runs

1. **Before render (cheap):** `node .agents/skills/style-anti-ai/scripts/check.mjs <job>` reads the composition
   files (on-screen text, fonts, colours, entrances, transitions), `data/*-plan.json` and `plan.json` if they
   exist, and the audio elements. No video is decoded.
2. **After render (optional):** `check.mjs <job> --frames` reads the frame sheet `rcg render` already writes
   (`renders/<name>-sheet.png`) through ffmpeg as raw RGB. No extra full decode, no image package.
3. It writes `jobs/<id>/data/anti-ai.json` and a short summary. **BAN** means "fix this unless the user wants it".
   **WARN** means "worth a look". The agent proposes fixes. The user's brand colours and the style's allowances
   are never flagged.

### Starting rule set

Taken from ai-video-editor's list as a starting point (VERIFIED it has 32 rules, 15 of them BAN). Every rule starts
as WARN until it has been run on the user's past jobs. A rule that fires on a job the user approved stays WARN or is
added to that style's allowances.

| Rule | Read from | Detected by | Suggested level |
|---|---|---|---|
| emoji and slop icons (sparkles, wand, rocket, bot) | composition text, icon names | text and names | BAN |
| text-only cards / big stat on a plain ground | compositions | a block with only a number or heading and no real media | BAN |
| slop copy ("unlock", "supercharge", "leverage", "game-changer") | on-screen text | word list | BAN |
| purple-blue accent | colours, frames | HSV hue 225-295, saturation ≥ 0.4 on large areas | WARN |
| neon on black | frames | dark ground plus a few very saturated bright colours | WARN, style allowance |
| glass panel / glow halo | frames | blurred semi-transparent box, ring of light around text | WARN |
| cream paper ground | frames | hue 20-60, saturation 4-30%, value ≥ 78% over half the frame | WARN (tactile-collage may want it) |
| same entrance on 4+ blocks in a row | compositions | entrance names | WARN |
| same transition on 3+ scenes | compositions | transition names | WARN |
| more than 15 camera moves a minute | compositions or plan | count per minute | WARN |
| one sfx file on over half the cues, or a whoosh on every block | audio elements | file names and times | WARN |
| default grotesk display font | fonts | font list | WARN |

### Done when

- Running it on every approved regression job raises no BAN.
- A test job with each banned item reports the rule id and the composition that holds it.
- Removing the skill folder changes nothing else in rcg.

---

## Feature 5: style-long-video-to-clips (skill `/style-long-video-to-clips`)

### Status: DONE 2026-10-12 (marked done by the user)

`.agents/skills/style-long-video-to-clips/` (SKILL.md, `references/ranking.md`, `scripts/clips.mjs`: find |
shortlist | trim | jobs | demo), routing lines in video-job and AGENTS.md, provenance kind `learn`. No core change.

Tested (VERIFIED in this session) on a 273 s "talk" made from 66 of the project's own voice-overs (1280x720, real
Kokoro speech, no download):
- `rcg cut transcribe` took 54 s (about 0.2x the length, re-check included); `clips find --len 20-40` took 0.5 s:
  85 sentences, 385 candidate runs, the best 11 that do not overlap.
- The agent scores (written by hand here) gave a 6-clip shortlist with no overlap; candidates that drift between two
  voice-overs scored 0 on `self` and fell out, as intended.
- `clips jobs --pick k8,k7 --style marketing-pro` trimmed both picks with the pads (21.77 s, 27.93 s) and made a job for
  each through `rcg new-job`. On the k8 job the cut stage ran end to end: render checked, verify 66 of 66 words. The
  two test jobs were moved out of `jobs/` afterwards.
- `clips demo` passes.

Changes from this plan:
- `trim` is joined by `jobs` (trim, then `rcg new-job` per pick with a prompt naming the clip, the style, the cut stage
  and the reframe) and `shortlist` (the agent's scores to the 8 best with no overlap).
- Candidates for the agent: the best 15 by code score with at most 30% overlap between any two, so the list is not 15
  shifts of one passage.

Not done or not tested:
- The "Done when" items were met only in part: no 30-minute talk was available (only 4.6 minutes), and a picked clip
  ended in a verified cut render, not a full styled render (video-job does that per clip, as for any job). The 9:16
  reframe on a face was not run: the test talk has no speaker.
- The render estimate before a batch (Part 2 item 3) does not exist yet.
- Found while testing, then fixed in the cut stage (2026-10-12): bare "wait", "sorry", "again" and "hold on" were
  flagged as talk-to-self in ordinary sentences ("the inbox can wait", "we were 17 again"); now only when they open
  a clause or sit next to another cue. A dense TTS voice-over read as a music bed; now digital silence in the pauses
  rules a bed out. On the k8 clip: 3 false candidates gone, 1.33 s of pauses tightened instead of 0.03 s, verify 66 of
  66. Alma and the spliced retake take: same candidates, identical kept frames.

### What it adds

A skill that turns a long video (podcast, talk, stream, 16:9) into a few short vertical clips, each edited with a
chosen rcg style pack.

### Naming note

rcg's video-job routes `style-*` skills as style packs, with a matching `library/styles/<slug>/` folder
(VERIFIED in docs/styles.md). This skill is a workflow, not a look. Plan: keep the requested name, give it no
`library/styles` entry, and add one line to video-job's routing so it is never offered as a look.

### Flow

1. **Source.** Only files the user adds (decided 2026-10-12). No link downloader.
2. **Transcribe** with the cut stage's transcriber (`base`, cached by sha256). For a 1-hour file this is the
   slowest step on CPU. INFERRED: `base` took 9 s for a 41 s take here (model load included). If that scales
   evenly, an hour is about 13 minutes or less; measure it.
3. **Find candidates** (`node .agents/skills/style-long-video-to-clips/scripts/clips.mjs find <job> --len 20-40|40-60|60-90`):
   - Sentences end on `. ? !` or a 1.2 s silence.
   - A candidate is a run of whole sentences inside the length range, starting on a sentence of 4+ words, ending
     on a finished sentence of 3+ words.
   - Code features: words per minute, loudness against the median, words in the first 3 s, numbers, names,
     laughs, not starting on "and / so / but". Combined into one score.
4. **Rank.** Code ranks by features and writes the top 15 to `data/clips/candidates.md`, each with its text and
   numbers. The agent scores them on four questions: does the first sentence hook on its own, is it
   self-contained, does it pay off, is it concrete. It may hand the 15 to sub-agents (Feature 6) and checks their
   scores before using them.
5. **Shortlist.** Top 8 with no overlap in `data/clips/shortlist.md`, each with one line on why it works. The user
   picks clips and a style in the question box.
6. **Trim** (`clips.mjs trim`): re-encode each pick with 0.12 s before and 0.35 s after, taking the heavy lock.
7. **Per clip:** the existing `rcg new-job`, with the trimmed clip as its media, makes one job per clip (it already
   copies media into `assets/`, VERIFIED). Each job then runs the cut stage, reframes 16:9 to 9:16 with rcg's
   existing face tracking (`rcg track`, `lib/face-reframe.js`), and runs video-job with the chosen style.

### Skill folder (no core change)

```
.agents/skills/style-long-video-to-clips/
  SKILL.md               the flow above, the questions to ask, the delegation per clip
  references/ranking.md  the features, the four questions, how to write the shortlist
  scripts/clips.mjs      find | trim
```

### Speed

- Planning per clip can run in parallel (one agent per clip where the host allows it).
- Rendering is serialized by the heavy lock (`heavySlots: 1`). From rcg's own logs, a 32.7 s render took 2 min
  24 s and a 68.3 s render 2 min 46 s to 4 min 24 s (VERIFIED in `renders/final.log` files). So 5 clips of about
  45 s are likely about 12 to 20 minutes of render time (INFERRED from those logs).
- A render estimate (Part 2 item 3) is shown before the batch starts.

### Done when

- From a 30-minute talk, 8 non-overlapping candidates are listed in under the transcription time plus one minute.
- Each picked clip ends as a verified render in its own job.

---

## Feature 6: Agent delegation note (code measures, the agent decides who judges)

### Status: DONE 2026-10-12 (marked done by the user)

A section "Delegation: code measures, the agent decides who judges" in AGENTS.md (the six points, with the real
compact files and answer files the built features write) and a short paragraph at the top of the video-job skill.
No code.

Tested (VERIFIED in this session) with real sub-agents, each given only one compact file, its rules and the answer
file, on copies of jobs the main agent had answered itself:
- **Cut stage** (the spliced retake take, 5 candidates; Alma, 6): the sub-agent's answers matched the main agent's
  on all 11, including "unsure" on Alma's "JJ, so". `rcg cut apply`, `build`, `render` and `verify` then gave
  identical spans and identical kept frames, and both renders passed verify.
- **Clips** (the 4.6-minute test talk, 11 candidates): the scores differed by 0.27 points per answer on average
  (0-3 scale). The shortlists shared 5 of 6 and the same top four. The sixth differed: the sub-agent's k5 runs
  across two topics (it scored it 0 on self itself) where the main agent's k9 stays on one. That is the gap the
  "check every delegated answer" step is for; after that check the shortlist is the same.

So the "Done when" holds for the cut stage exactly, and for clips after the main agent's check, which the note
requires anyway. Judgment of clip quality is not deterministic; two readers agree closely, not exactly.

### What it is

A note, not a tool. No code, no model API, no key, no provider setting. It goes into AGENTS.md and the video-job
skill, so the main agent (Antigravity, Claude Code or any other) uses its own sub-agents well. The agent decides
when and how to delegate. rcg only makes sure the inputs are small and the outputs can be checked.

### The note (text to add to AGENTS.md)

1. **Code measures.** Anything countable (silences, repeats, loudness, faces, colours, rates, timings) comes from
   a script. Never read raw transcripts, word JSON or frames when a script can summarize them.
2. **Read the compact files.** Each step writes a short file for judgment: `transcript.txt`, `candidates.md`,
   `review.md`, `paper-edit.md`, `shortlist.md`, `plan-check.json`. Decide from those.
3. **Delegate only bounded, checkable work.** A sub-agent gets one compact file, one clear question and a fixed
   answer shape (for example `decisions.in.json`). Good fits: answering a candidate list, scoring 15 clip
   candidates, looking at one frame sheet, planning one clip of a batch.
4. **Keep the final calls.** The main agent keeps the story, the beat sheet, the style choice, anything the user
   approves, and any change to a style skill. It never forwards a sub-agent's answer without checking it.
5. **Check every delegated answer.** Spot-check against the source (the transcript line, the frame), and run the
   code checks (`rcg cut verify`, `rcg plan check`, `rcg verify`). If a check fails, the main agent redoes that part
   itself.
6. **Quality over savings.** When the work is small, when the host has no sub-agents, or when a sub-agent's
   answers keep failing checks, the main agent does the work itself. Delegation is used to go faster and keep the
   main context clean, never at the cost of the result.

### What rcg tools do to support it

- Every judgment step writes its compact file and reads a fixed answer file, so the same flow works whether the
  main agent or a sub-agent fills it in.
- Code-made files carry the source ranges and quotes, so any answer can be checked against the source.
- Nothing in `tools/` calls a model.

### Where each decision goes

| Decision | Code | Sub-agent (if the agent chooses) | Main agent |
|---|---|---|---|
| Silences, pause tightening, join placement | Yes | | |
| Repeat and filler candidates | Yes | | |
| Is it a retry, which take to keep | | Can answer `candidates.md` | Checks the answers, owns `review.md` |
| Clip candidates and features | Yes | | |
| Clip hook and payoff scores | | Can score the top 15 | Checks, then picks with the user |
| Plan checks, `/style-anti-ai` report (if used) | Yes | | Fixes FAILs, proposes fixes |
| Planning one clip in a batch | | One sub-agent per clip | Reviews each plan |
| Story, beat sheet, style choice | | | Yes |
| What a correction means and its scope | | | Yes (asks the user) |

### Done when

- AGENTS.md and the video-job skill carry the note.
- The cut stage and clips skill produce the same result whether the main agent or a sub-agent fills the answer
  file, and both pass the same checks.

---

# Part 2: The five ideas explained

## 1. Pinned, hashed installs and sha256-checked models

**Where it lives:** core (setup and `doctor`). Every install needs it.

**What it is.** A lock file lists the exact version of every package and the sha256 of every download. The
installer refuses anything that does not match. Model files (Whisper, Kokoro, MediaPipe) get the same treatment: a
manifest holds each file's URL and sha256, and a wrong file is deleted and fetched again.

**How rcg stands (VERIFIED).** HyperFrames is pinned at 0.8.143. The voice venv uses `tools/voice/requirements.txt`
(numpy, soundfile, pydub, scipy, librosa, onnxruntime, kokoro-onnx, faster-whisper). Whether those lines carry
versions and hashes was not checked. Models (about 380 MB) are downloaded by hand.

**Real use cases.**
- You set rcg up on a new laptop in six months. `pip` pulls a newer numpy or onnxruntime, and kokoro-onnx breaks.
  With a lock, the new laptop gets the exact set that works today.
- A model download stops at 90%. Without a hash, Kokoro or MediaPipe fails later with a confusing error. With a
  hash, `doctor` says "kokoro model corrupt, re-download" right away.
- A model repo is updated upstream and the voice sounds different. A hash pinned to a fixed commit keeps the old
  one.

**How it would work in rcg.**
- `tools/voice/requirements.lock` made with hashes (`pip-compile --generate-hashes` or `uv pip compile`; either tool
  is an install, so it needs your yes), installed with `pip install --require-hashes`.
- `config/models.json`: name, URL at a fixed commit, sha256, size. `rcg models fetch` and `rcg models verify`.
- `rcg doctor --deep` checks hashes. A plain `doctor` stays fast and only checks sizes.

**Cost and speed.** Nothing at render time. Hashing about 380 MB of models takes seconds on an SSD (INFERRED, not
measured), and only in `doctor --deep`.

## 2. CI on several systems, self-check demos, fresh-install test

**Where it lives:** repo infrastructure (`.github/` and a `--demo` flag per tool), neither core logic nor a skill.

**What it is.**
- **Self-check demo:** each tool gets `--demo`, which makes a tiny synthetic input (a 4 s test clip with a tone or
  spoken words), runs itself on it, and checks the result. No network, no keys, seconds each.
- **CI:** GitHub Actions runs all demos on every push. rcg's remote is on GitHub (VERIFIED), and it has no CI and no
  tests for its own tools today (VERIFIED).
- **Fresh-install test:** set rcg up from zero on a clean runner, run it a second time (nothing should change), then
  break something on purpose and check that `doctor` catches it.

**Real use cases.**
- You upgrade ffmpeg and the right-edge bug comes back. `rcg verify --demo` fails on the push, before a client job.
- A change to `captions.mjs` shifts captions by one frame. The caption demo compares timings and fails.
- You want rcg on a Mac someday. A macOS runner shows what breaks, without owning a Mac.

**Limits for rcg (judgment).**
- Full HyperFrames renders in CI would be slow, since runners have no GPU and AGENTS.md records a software-render
  check that took 20 minutes. So CI runs demos and checks, not full renders. Full renders stay a local
  `rcg selftest --render`.
- The 750 MB voice venv and 380 MB of models are too large to download on every run. Cache them, or run voice demos
  only weekly.
- Start with a Windows runner, since Windows 11 is the only tested system.

**Cost and speed.** Free on public repos, and private repos get free minutes each month (check GitHub's current
allowance). No cost to local rcg speed.

## 3. Render estimate before choosing a target

**Where it lives:** core, very small. `rcg render` appends one log line, and `rcg render --estimate` reads it.

**What it means in rcg.** rcg renders locally only, so there is no "which cloud" choice and no money cost. The value
is time: knowing a render's length before you start it, and seeing a queue's length when several jobs wait for the
heavy lock.

**Why simple math does not work (VERIFIED from rcg's logs).** Time does not follow length:

| Video length | Render time |
|---|---|
| 8 s | 21 s |
| 12.3 s | 1 min 31 s |
| 16.9 s | 2 min 14 s |
| 32.7 s | 2 min 24 s |
| 68.3 s | 2 min 46 s (graphics) to 4 min 24 s (split screen) |
| 78.2 s | 4 min 35 s to 4 min 54 s |

Capture is most of the time, and it depends on how many compositions, video layers, shaders and 3D scenes are on
screen.

**How it would work.**
1. Every `rcg render` appends one line to `.cache/render-history.jsonl`: frames, fps, number of compositions,
   effect kinds, workers, quality, and the capture, extract and encode times (already printed in `final.log`).
2. `rcg render --estimate` finds the closest past renders by those features and gives a range, for example
   "about 3 to 4 minutes".
3. Optional: a short timed snapshot of a few frames from the middle for a job unlike any before. INFERRED: about
   10 to 30 s.
4. If a render runs more than 2× its estimate, rcg warns. That often means something went wrong, such as falling
   back to software rendering.

**Real use cases.**
- Before rendering 6 clips, rcg says "about 18 to 25 minutes, one at a time".
- Pick a quick draft render to check timing, then the final.
- Two agent sessions want to render. The second one sees "1 render ahead, about 4 minutes" instead of waiting
  blind.

**Cost and speed.** Reading a small history file takes milliseconds. Renders are not slowed.

## 4. Export to other editors

**Where it lives:** a skill, `/export-to-editor`, with its writer in `scripts/export.mjs`. Used only on request,
so the core is untouched.

**What it makes.** A project file that opens in another editor, plus the media it points to:
- **The cut:** an edit list (EDL, FCPXML for Final Cut and Resolve, Premiere XML) that points at your **original**
  footage with the in and out points from `decisions.json`. Nothing is re-encoded.
- **Captions:** an SRT file. rcg already writes SRT (VERIFIED).
- **Graphics:** overlays rendered as video with a transparent background, one file per layer, placed on upper tracks
  at the right times.

**Are the files edited?** No. Export is a one-way snapshot. The editor reads the files and you work in the
editor. Your source footage is never changed. Changes made in Premiere or Resolve do not come back into rcg.

**What cannot export as editable.** Shaders, footage effects, camera moves and 3D scenes have no equivalent inside
those editors. They come out as rendered video layers, not as editable effects. Only the cut and the captions stay
fully editable there.

**Does it add load or render time?**
- Normal rcg renders: no change. Export runs only when asked.
- Cut plus captions: text files, written in under a second (INFERRED).
- Graphics layers: an extra render per layer with a transparent background. ai-video-editor measured 11 minutes for
  8 cards as ProRes 4444 (VERIFIED in its render notes). INFERRED: whether HyperFrames can render with a transparent
  background must be checked first. If it cannot, layers would need a keyed or matte pass, which is slower.

**Real use cases.**
- A client wants to nudge one cut in Premiere. Send them the FCPXML plus footage, not a flat MP4.
- A colourist grades your footage in Resolve under rcg's graphics.
- You finish captions on your phone in CapCut. CapCut import is limited, so ai-video-editor ships a how-to there,
  not a project file (VERIFIED).

## 5. Review page with timeline notes and rounds

**Where it lives:** a skill, `/review-render`, with its small server in `scripts/review.mjs`. It is an optional way
to approve and to feed `/learning-from-user-taste`.

**What it is.** A local web page (Node's built-in `http` server on 127.0.0.1, with a random token, no packages)
that shows:
- The render, playable.
- The transcript with removed words struck out.
- Tracks from `plan.json` (captions, camera, blocks, audio) under the timeline.
- A notes box: pause the video, type a note, and it saves with the exact time and a frame still.
- **Send notes** or **Approve**. Each send is one round. Notes and rounds save in `jobs/<id>/review.json`.

The agent runs `rcg review wait <job>` in the background. It returns when you press Send or Approve, with the notes
as compact text.

**Impact compared with reviewing in chat today.**

| | In chat now | Review page |
|---|---|---|
| Pointing at a moment | You describe it ("around the middle, the title") | Exact time and a frame still, saved |
| Agent tokens per round | It reads the contact sheet image each round. ai-video-editor estimates a sheet at about 1,600 image tokens (VERIFIED in its stills tool output) | It reads a few lines of notes. It opens a frame only when a note needs it |
| Several notes at once | One chat message, easy to lose one | A list, each resolved and checked off |
| History | Scattered across chat | `review.json`, rounds kept with the job |
| Learning | Manual | A note can be turned into a learned rule (Feature 3) |

**Performance.**
- Render time: not affected. The page is used after a render.
- The server: idle almost all the time. Video is served from disk with range requests. A note's frame still is one
  ffmpeg frame grab, a fraction of a second (INFERRED).
- The real cost is waiting time, not CPU: the agent sits in `review wait` until you act. That is the same wait as
  in chat.
- Not a replacement for `rcg hf preview` (HyperFrames Studio), which is for building. The review page is for
  approving a render.

**Risk.** One more small server to maintain. INFERRED: whether Antigravity can keep a background `wait` command
running the way Claude Code does must be checked. If not, a "check notes" command run on demand works instead.

---

# Decisions (2026-10-12)

1. **Whisper model:** the cut stage uses `base` with ai-video-editor's transcription settings (Feature 1, step 1).
   `base` is already cached (VERIFIED: `models--Systran--faster-whisper-base` in the Hugging Face cache, about
   142 MB; `small` is not cached for rcg). Nothing to download. `small` (about 486 MB) stays optional and needs
   the user's yes.
2. **Clips source:** only files the user adds. No link downloader.

# Sources

- rcg: AGENTS.md, SETUP.md, docs/job-spec.md, docs/styles.md, docs/capabilities.md, tools/rcg.mjs,
  tools/lib/config.mjs, tools/lib/lock.mjs, tools/lib/ffmpeg.mjs, tools/voice/voice_cli.py, tools/jobs/render.mjs,
  tools/jobs/new-job.mjs, tools/media/verify.mjs, tools/audio/mix-check.mjs, renders/final.log files in jobs/.
- ai-video-editor (design reference only): plugins/ai-editor/PRINCIPLES.md, skills/cut/scripts/retakes.py,
  build_timeline.py, render.py, verify_cut.py, skills/style-edit/scripts/plan.py, check.py, ai_tells.py, edit.py,
  export_nle.py, skills/clips/scripts/clips.py, lib/ai_editor/taste.py, review.py, models.py,
  .github/workflows/check.yml.
- This session: running ai-video-editor on one 41 s take (the face-cropping zoom, the missing zoom setting, the
  review transcript gap).
- Model test, 2026-10-12: `Alma.mp4` transcribed by rcg `base`, and by ai-video-editor's `transcribe.py` with
  `small` and with `base`; candidates from its `retakes.py` (code only, no TypeSafe call). Sizes: `small`
  `model.bin` 483.5 MB from the Hugging Face file list for `Systran/faster-whisper-small`.
