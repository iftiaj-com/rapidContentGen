---
name: learning-from-user-taste
description: Save the user's taste in rapidContentGen so a correction given once applies to every later job without being said again. Use when the user reacts to a render, frame sheet, preview or plan ("captions too small", "too many zooms", "too slow", "keep my ums", "I don't like the colour", "always do X", "never do Y", "remember this", "next time ..."), when they change something at an approval stop, or when they ask to see, change or forget a saved preference. Sorts each reaction first: a bug goes to lessons.md, a one-off fix stays in the job, only taste is saved, in the skill where the user rules already live, checked against the hard limits and the existing rules. Runs inside the video-job workflow.
---

# Learning from user taste

A correction the user gives once is saved in the right place and applied on the next job. There is
no separate store: a learned rule is one line in a marked section (`<!-- rcg:learned begin/end -->`)
of the skill that already carries that kind of rule, or of the job's `JOB.md`. Skills are read on
every job, so a saved rule applies with no extra step.

Script: `node .agents/skills/learning-from-user-taste/scripts/learn.mjs` (below: `learn`). It writes
the marked sections, refuses values past the hard limits (`references/limits.md`), finds clashes, and
runs `rcg skills sync`. Never edit a learned section by hand.

## 1. Sort the reaction (before saving anything)

| It is | Signs | Where it goes |
|---|---|---|
| A bug or a measured fact | "the right edge is black", "the audio clips", a frame is wrong in every render, a tool misbehaves | `.agents/skills/video-job/references/lessons.md` (and a code check where possible). Never a learned rule |
| A one-off fix | about this video's content: "move this title, it covers her face", "cut the second sentence" | fix it in this job only. Not saved |
| Taste | how the user likes edits to look, sound or feel: "captions too small", "fewer zooms", "keep my ums" | a learned rule (step 2) |

When it is unclear whether a reaction is taste or a one-off, ask once, with "just this job" as the
recommended answer, so one-off fixes do not pile up as rules.

## 2. Pick the scope (ask once if the user did not say)

| Scope | `--scope` | File |
|---|---|---|
| Every job | `every` | `.agents/skills/video-job/SKILL.md` |
| One style | `style:<slug>` (`style:marketing-pro`) | `.agents/skills/style-<slug>/SKILL.md` |
| This job only | `job:jobs/<id>` | `jobs/<id>/JOB.md` |

Ask in the question box: "Keep this for next time?" with options this job only (recommended when
unsure), every <style> video, every video.

## 3. Turn it into a setting or a worded rule

If the reaction maps to a setting in `references/limits.md` (caption size or height, words on screen,
caption style, zoom, cut pace, fillers, voice speed, music level), save it as that setting with a
value: the line then names the exact flag, and the agent applies it as that flag on the next job.
Anything else is a worded rule ("no sound effects on titles", "fewer camera moves") that the agent
follows.

```
learn add --scope every --rule "Captions sit higher, at y 1400 on 9:16" --setting caption-y --value 1400
learn add --scope style:marketing-pro --rule "Zooms stay gentle" --setting mp-max-punch --value 1.4
learn add --scope every --rule "Keep the speaker's ums" --setting keep-fillers
learn add --scope job:jobs/<id> --rule "No sound effects on the titles"
```

Exit codes and what to do:

- **3 refused**: the value crosses a hard limit (it names the pitfall). Tell the user why, offer the
  nearest allowed value, and save that only if they agree. Pitfalls and safe zones always win over taste.
- **4 clash**: that scope already sets the setting. Show both lines, ask the user which one wins,
  then run again with `--replace "<text of the old line>"`. Never keep both.
- `related` lines: existing rules that share words with the new one. Read them; if one contradicts the
  new rule (one asks for a caption stroke, another forbids it), ask which wins and `--replace` it.
- `also set in`: the setting has another value in a broader or narrower scope. That is allowed (the
  narrower scope wins); say so to the user.

## 4. Apply it now

Redo the edit the user reacted to with the new rule, so they see the change. Then go on.

## Reading the rules on a job

At the start of a job (video-job step 1), the agent follows the learned sections of `video-job`, of
the style skill in use, and of the job's `JOB.md`. To see them in order with each setting's value:

```
learn effective --style marketing-pro --job jobs/<id>
```

Order when rules meet: style pack defaults < every job < one style < one job. A learned setting is
passed as its flag (a recipe's own planner flag where the line names one).

## Other commands

- `learn list [--job jobs/<id>]`: every learned line by scope.
- `learn forget --scope <scope> --match "<text>"`: remove one line when the user drops a preference.
- `learn check`: lines parse, values are within the limits, one line per setting and scope, and no
  user rule is left outside a learned section. Run it after any change.

## Where taste comes from

1. **Chat** (default): the user watches the render, the frame sheet or a Studio preview and types a reaction.
2. **Approval stops** (video-job modes a and c): when the user changes something at a stop, ask once
   "keep this for next time?".
3. **Review page notes** (later, when the review page exists): sort each note the same way.
