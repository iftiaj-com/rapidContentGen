---
name: script-modern-storytelling
description: Write the spoken script for a short-form social video (Reel, Short, TikTok, 15-90 s) in rapidContentGen with the Modern Story Arc - drop in at high intensity, hit a first peak within seconds, then stack a new mini-peak every 10-15 s (peak, release, peak) up to a payoff that was written first. Covers voiceover scripts the agent writes (topic mode), shoot scripts the user will record on camera, and audits of the user's own script or transcript (suggestions only, their words stay). Outputs a peak map in data/script.md, data/vo-lines.json, and the peak times the edit hits with its biggest visual changes. Use when a video needs a script, voiceover, hook, story or rewrite; when the user asks for storytelling, a better hook, retention, "make it engaging" or a social media script; or when they name this skill. Runs inside the video-job workflow, before the voice and the beat sheet; the style skills keep their own tone and visuals.
---

# Modern Story Arc scripts

This skill owns the words and the peak map. The `video-job` skill still owns intake, the working
mode, audio, build, render, report and the final send. The style skill (`style-info-graphics`,
`style-mix-media`, `style-marketing-pro` and the rest) still owns the tone, the visuals and its own
length notes.

- When a style skill and this skill disagree on **tone** (the mix-media diary voice, the
  info-graphics essay voice), the style wins. On **structure** (where the hook and the peaks land,
  how lines connect), this skill wins. The style's own section names (info-graphics: hook, claim,
  evidence, turn, payoff; mix-media: hook, build, turn, close) still work: this skill decides where
  the peaks sit inside them.
- A story with a character who wants something (a short film, a narrative edit of footage) goes to
  `script-film-storytelling`; this skill is for talk, explainer and promo scripts.
- No tool code: this is a writing method. Timing comes from the existing tools (`rcg voice say`,
  `rcg infographics place-voice`, transcripts).

Read before writing: `references/framework.md` (the arc and its principles, and which parts are
rules of thumb). Before mapping peaks: `references/arc-templates.md` (timing and word budgets per
length). Before filling slots: `references/peak-devices.md` (hooks, peaks, releases, connectors,
and what each style does on a peak). For worked scripts: `references/examples.md`.

## The arc in one paragraph

The classic five-act arc (setup, rising action, climax, falling action, resolution) builds too
slowly for a feed: viewers swipe before the rising action. The Modern Story Arc starts at about
70 out of 100, as if the story is already underway, spikes to about 90 within the next few seconds,
releases to about 30 to explain, then re-peaks every 10-15 seconds until the payoff. There is no
single climax. There is a chain of mini-peaks, each one a new reason to stay. The engine under it is
**expectation vs reality**: each peak gives the viewer more than they predicted. When the video
gives less than the hook promised, they leave. The 0-100 numbers are a planning score for
comparing beats, not a measurement.

## Ways in

| The user gives | The agent makes | The agent keeps |
|---|---|---|
| **A topic or brief** (a voiceover video: info-graphics, mix-media, vox-parallax, faceless) | the brief, the peak map, the full script, `data/vo-lines.json` | facts it can source; anything unsourced is cut or framed as opinion |
| **A plan to record** (the user will talk to camera: marketing-pro, split-screen presenter) | a shoot script in the user's voice, `data/shoot-script.md`, with the peaks marked so they can stress them | the user's own claims and stories, only as they told them |
| **Their own script** | a peak map of their words and a numbered list of suggested changes | every word, until the user approves a change |
| **Footage with speech already recorded** | a peak map of the transcript, so the edit knows where to punch | the speech; reordering clips is an editorial change, so ask first |

If the request does not say which, a prompt with no script text is topic mode. In modes (a) and
(c) of the video-job skill, show the peak map and script with the beat sheet gate. In mode (b),
state the brief choices in `JOB.md` and go on.

## Fast path

1. **Brief.** Write four lines under `## Story` in `JOB.md`:
   - **Viewer:** one specific person (job, problem, where they scroll). Not "everyone".
   - **Core idea:** one sentence. One takeaway per video.
   - **Expectation:** what that viewer believes or predicts before watching.
   - **Reality:** what the video shows instead. This gap is the story.
   If one cannot be filled from the prompt, ask (modes a and c) or choose and say so (mode b).
2. **Budget.** Target duration to words with `references/arc-templates.md` (about 3 words a second
   of finished video for Kokoro at the user's default `--speed 1.3 --skip-silences`). Pick the
   template for the length and list its peak slots with their target second and word count.
3. **Write the ending first.** The last line (the payoff) answers the hook and feels inevitable.
   12 words at most. A call to action, if any, is one short line after it and nothing follows.
4. **Write the hook** (0-3 s, 9 words at most). Drop in mid-conflict, mid-reveal or
   mid-statement. Write three options with different hook devices and keep the most specific one.
   Pair it with a visual hook: what is on screen at frame 1.
5. **Fill the peaks.** First peak by second 8 for videos up to 60 s (by second 15 for longer ones).
   Then one every 10-15 s. Give each a device from `references/peak-devices.md` and never use the
   same device twice in a row. For each, write the expectation it breaks. If you cannot name one, it
   is not a peak.
6. **Fill the releases.** One to three short sentences that explain, give an example or make it
   relatable. End each release with a lift (a "but", a question, a stake) that sets up the next peak.
7. **Connect with But / Therefore.** Read each pair of sentences. "And then" means nothing changed:
   rewrite the link as "but" (conflict) or "so / therefore" (consequence), or cut a line.
8. **Run the checks** below and fix every miss.
9. **Write the outputs.**
   - `data/script.md`: the brief, the peak map table (format below) and the script as read.
   - `data/vo-lines.json` (voiceover): one entry per sentence or two. A peak always starts a new
     line, so its first word becomes an anchor for `rcg infographics resolve`. Put the peak's key
     word last in its clause. Follow the style's voice rules (Kokoro default, Melo for mix-media);
     leave `speed` out so the user's default applies.
   - `data/shoot-script.md` (on camera): the lines to say, one per row, peaks in caps or bold so the
     speaker stresses them, with a note to pause a beat before each peak.
10. **After voicing**, `place-voice` prints each line's start. Fill the "actual s" column of the peak
    map. Any gap over 15 s between peaks (over 10 s in videos of 30 s or less): cut release words,
    not peaks, then re-voice. For recorded speech, take the times from the transcript.
11. **Hand the peaks to the edit.** In `beat-sheet.json`, name the role in each beat's `onScreen`
    (for example `PEAK 2 (contrarian): ...`). The biggest visual change of each stretch lands on the
    peak's key word; releases get calmer visuals. What that means per style is in
    `references/peak-devices.md`, "Peaks in the edit".

## Checks (all must pass before voicing or handing over a shoot script)

- [ ] Hook: no greeting, no name, no "today I'm going to", no "in this video", no logo or setup.
      It opens mid-action and is specific (a "you", a named thing, an exact situation).
- [ ] First peak lands by second 8 (videos up to 60 s) or 15 (longer).
- [ ] No stretch over 15 s, about 45 words, without a peak. At 30 s or less, aim for 10 s, about 30 words.
- [ ] Every peak has a written expectation it breaks. No device twice in a row.
- [ ] No two links in a row are "and then". Most links are "but" or "so".
- [ ] One core idea. Delete any line that does not serve it, even a good one.
- [ ] The last line answers the hook. Every question opened is closed by the end.
- [ ] Sentences are 4-12 words, short words, active verbs, one breath each (the hook 9 or fewer).
- [ ] Facts: every number, date, name and quote was checked this session and its source is in
      `report.md`, or it is cut. A "shocking stat" peak with no source becomes a contrast, reframe
      or bold-statement peak.
- [ ] The hook's promise is paid off. A contrarian take is one you can defend, not bait.
- [ ] First-person stories about the user come only from what the user said or what the footage shows.
- [ ] Words a TTS voice may mishear are flagged (see `style-mix-media/references/script-voice.md`).

## Peak map format (`data/script.md`)

| # | line | target s | actual s | words in | level | role | device | expectation broken | text | visual hit |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | vo1 | 0.3 | | 0 | 70 | hook | mid-conflict | "my edit is the problem" | Your video lost them before you said hello. | key word on screen at frame 1 |
| 2 | vo2 | 2.9 | | 8 | 90 | peak 1 | contrarian | "better editing fixes it" | But better editing won't fix it. A different shape will. | ground change on "shape" |
| 3 | vo3 | 6.3 | | 18 | 35 | release | context | | Old stories build slowly... | same ground, parts added |

The full map of this script is in `references/examples.md`, example 1.

- `target s` = words before the line divided by the words-per-second rate, plus the lead.
- `level` is the 0-100 planning score: hook about 70, peaks 85-95, releases 30-50, payoff 80-95.
- Leave `actual s` empty until the voice is placed (step 10).

## Boundaries

- Organization rules apply to every script: no invented statistics, studies, quotes, dates or
  "experts say"; no words put in a real person's mouth; recent events checked and dated.
- The user's script and recorded speech are kept word for word. Changes are suggestions in a
  numbered list and a question for the user, never a silent edit.
- No promises of reach. The framework's claims about virality and algorithms are rules of thumb
  (`references/framework.md`); do not repeat them to the user as fact.
- Never quote song lyrics. Never put credit or attribution text on screen.
- Never publish or post. Writing and rendering are local.
