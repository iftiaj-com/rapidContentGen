---
name: style-long-video-to-clips
description: Turn a long video the user adds (podcast, talk, interview, stream, webinar, usually 16:9) into a few short vertical clips in rapidContentGen, each edited with a style pack the user picks. Code finds every run of whole sentences that fits the length and scores what it can count; the agent judges hook, self-contained, payoff and concrete; the user picks from a shortlist; each pick becomes its own job that runs the cut stage, a 9:16 reframe on the speaker and the video-job workflow. A workflow, not a look. Use when the user asks for clips, shorts, highlights or reels from a long video, "cut this podcast into shorts", "find the best moments", or names this skill. Files the user adds only (no link downloader).
---

# Long video to clips

A workflow, not a look: never offer it as a style. The clips it makes are edited with a style pack the
user picks (`rcg style list`). Script: `node .agents/skills/style-long-video-to-clips/scripts/clips.mjs`
(below: `clips`). Ranking rules: `references/ranking.md`.

## 1. Source

Only a file the user adds (chat path or `inbox/`). Links are not supported: no downloader is installed,
and adding one is the user's call. Make a job for the long video:
`node tools/rcg.mjs new-job --name <slug> --video <file>`. It holds the transcript and the candidates;
the clips get their own jobs in step 6.

## 2. Transcribe

`node tools/rcg.mjs cut transcribe jobs/<id>` (the cut stage's transcriber, cached by the file's sha256;
re-runs cost nothing). Say the time first: on this machine it ran at about 0.2x the video's length
(273 s took 54 s), so an hour is roughly 12-15 minutes.

## 3. Find

`clips find jobs/<id> --len 20-40` (or `40-60`, `60-90`: ask which length if the user did not say).
It writes `data/clips/candidates.md`: the best 15 runs of whole sentences that do not overlap, each
with its time, numbers and full text, and a `scores.in.json` to fill.

## 4. Judge

Score every candidate in `data/clips/scores.in.json`, from its text alone, as a viewer who did not see
the rest: `hook`, `self`, `payoff`, `concrete` (0-3 each) and one `why` line (`references/ranking.md`).
A long list may go to sub-agents (one compact file, one question, the fixed answer shape); spot-check
their scores against the text before using them. A run that drifts between two topics scores 0 on `self`.

## 5. Shortlist and ask

`clips shortlist jobs/<id>` writes `data/clips/shortlist.md`: the best 8 with no overlap. Show it and
ask in the question box: which clips, and one style pack for all of them (recommend the pack that fits
the talk; marketing-pro for a single speaker selling or teaching).

## 6. Make the clip jobs

`clips jobs jobs/<id> --pick k2,k7 --style <slug>` re-encodes each pick (0.12 s before, 0.35 s after,
in the heavy-work slot) to `assets/clips/<k>.mp4`, then runs `rcg new-job` once per pick. Each job's
`JOB.md` prompt names the clip, the style, the cut stage and the reframe. (`clips trim` does the
re-encode alone.)

## 7. Edit each clip

Run `video-job` on each clip job, with the chosen style:

1. Cut stage (video-job step 1b): the clip starts and ends on sentence edges, but retakes and pauses inside it go.
2. 16:9 source: reframe to 9:16 on the speaker: `rcg track` on the cut, then `rcg camera` with a
   `face.follow` cue on the footage wrapper (the style skill may do this in its own prep).
3. The style's workflow, check, render and verify, as for any job.

Planning can run in parallel (one agent per clip where the host allows it); renders queue on the
heavy-work slot one at a time (a 30-70 s render took 2.5-4.5 minutes here). Report each clip's render.

## Self-check

`clips demo`: sentences, candidate rules, ranking and overlap, on a synthetic transcript (no media).
