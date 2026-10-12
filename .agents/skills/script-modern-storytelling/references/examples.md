# Worked examples

Target seconds use 3 words a second plus a 0.25 s lead (Kokoro at the user's default). They are
estimates until the voice is placed. Word counts were counted by script, not by hand.

## Example 1: topic mode, about 27 s (76 words)

**Brief**
- Viewer: a small-business owner who posts Reels and gets swiped past in the first seconds.
- Core idea: start in the middle, then re-hook again and again.
- Expectation: "my videos need better editing."
- Reality: "they need a different shape."

**Written first (payoff):** "Still here? That's the shape working." It answers the hook ("lost
them") by pointing at the viewer who stayed.

| # | line | target s | words in | level | role | device | expectation broken | text | visual hit (info-graphics) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | vo1 | 0.3 | 0 | 70 | hook | mid-conflict | "my edit is the problem" | Your video lost them before you said hello. | `stack` on "hello" at frame 1, dark ground |
| 2 | vo2 | 2.9 | 8 | 90 | peak 1 | contrarian | "better editing fixes it" | But better editing won't fix it. A different shape will. | `equation` edit ≠ shape; orange "shape" |
| 3 | vo3 | 6.3 | 18 | 35 | release | context | | Old stories build slowly. Setup, rising action, one big climax at the end. On a feed, nobody waits that long. | `stairs` setup / rising / climax on the same ground |
| 4 | vo4 | 12.9 | 38 | 85 | peak 2 | reframe | "stories start at the start" | So start in the middle. Mid-argument. Mid-reveal. Mid-sentence. | `ground` wipe on "middle"; `stack` of three words |
| 5 | vo5 | 15.6 | 46 | 40 | release | explain | | Then let it breathe, just long enough to explain. | hold; the stack settles |
| 6 | vo6 | 18.6 | 55 | 90 | peak 3 | twist | "one strong opening is enough" | Here's the catch. One peak isn't enough. You need a new one every ten seconds. | `ground` arc; `range` knob gliding across peaks |
| 7 | vo7 | 23.6 | 70 | 85 | payoff | loop payoff | "this was just a tip" | Still here? That's the shape working. | cream ground; orange "working" |

Gaps between peaks (hook counted): 2.6, 10.0, 5.7, 5.0 s. All under 10 s.

Notes:
- vo5 opens with "Then". It is not an "and then" list link: it is an instruction that follows from
  vo4. Still, read it aloud; if it sounds like a list, change it to "Now let it breathe...".
- vo6 says "every ten seconds" while the framework says 10-15. The script claims a rule of thumb, so
  it stays a how-to, not a fact with a number to source.

`data/vo-lines.json` (no `speed`, so the user's default applies):

```json
[
  { "id": "vo1", "text": "Your video lost them before you said hello.", "voice": "af_heart" },
  { "id": "vo2", "text": "But better editing won't fix it. A different shape will.", "voice": "af_heart" },
  { "id": "vo3", "text": "Old stories build slowly. Setup, rising action, one big climax at the end. On a feed, nobody waits that long.", "voice": "af_heart" },
  { "id": "vo4", "text": "So start in the middle. Mid-argument. Mid-reveal. Mid-sentence.", "voice": "af_heart" },
  { "id": "vo5", "text": "Then let it breathe, just long enough to explain.", "voice": "af_heart" },
  { "id": "vo6", "text": "Here's the catch. One peak isn't enough. You need a new one every ten seconds.", "voice": "af_heart" },
  { "id": "vo7", "text": "Still here? That's the shape working.", "voice": "af_heart" }
]
```

## Example 2: rewriting a flat script, about 27 s (78 words)

**Flat (classic arc, as a user might draft it):**

> Hi everyone! Today I want to talk about meeting notes. First, I'll explain what meeting notes
> are. Then I'll share some tips. And then we'll talk about tools. Let's get into it.

What is wrong, by the checks: a greeting and "today I want to"; it starts at zero; no peak in the
whole text; three "and then" links; no core idea (tips and tools are two ideas); no ending.

**Brief**
- Viewer: a team lead whose meeting notes go unread.
- Core idea: put the decision first.
- Expectation: "my notes are too long."
- Reality: "my notes are in the wrong order."

**Modern:**

| # | line | target s | level | role | device | text |
|---|---|---|---|---|---|---|
| 1 | vo1 | 0.3 | 70 | hook | you-statement | Nobody read your meeting notes. Not one person. |
| 2 | vo2 | 2.9 | 90 | peak 1 | contrarian | But it's not because they're too long. It's because the decision is buried on page two. |
| 3 | vo3 | 8.3 | 40 | release | relatable | People open notes for one reason. What did we decide, and what do I do now? |
| 4 | vo4 | 13.6 | 85 | peak 2 | specificity drop | So put the decision first. One line. Bold. Above everything. |
| 5 | vo5 | 16.9 | 40 | release | example | Names and dates go right under it. The discussion goes last, for whoever wants it. |
| 6 | vo6 | 21.9 | 90 | payoff | reframe | Your notes don't need to be shorter. They need to be upside down. |

The payoff was written first and answers the expectation ("too long") with the reality ("upside
down"). "Nobody... not one person" is a hook, not a statistic: it speaks to the viewer's own
experience. If the user wants it softer, "Nobody read your meeting notes" alone also works. Tools,
the second idea, were cut; they could be another video.

## Example 3: auditing the user's script (suggestions only)

The user's words are not changed. The agent returns the peak map of their script and a numbered
list like this, then waits for answers:

```
Peak map: hook at 0.3 s (level 40, a greeting), first peak at 14 s (contrast, "renting vs buying"),
no peak from 14 s to 33 s (19 s), payoff at 38 s.

Suggested changes (none made yet):
1. Line 1 "Hi, welcome back to the channel" delays the hook by about 2 s. Suggest opening on your
   line 4, "Most people get this backwards." Keep, cut, or move?
2. The first peak lands at 14 s. Moving line 4 to the top would put a peak at 0-3 s.
3. Lines 7-10 run 19 s with no peak. Your line 12 ("and that's where it costs you") is a stakes
   peak; moving it to follow line 8 would split that stretch. OK to move?
4. Line 9 says "studies show". Which study? Without a source, I suggest "in my experience" or a cut.
5. The ending (line 14) introduces a new idea. Your line 13 answers the hook; end there?
```

## Example 4: a shoot script for a talking head, about 12-15 s (30 words)

For a person recording on camera (marketing-pro), at an assumed 2.5 words a second. Peaks are in
bold so the speaker stresses them; "(beat)" marks a short pause before a peak.

```
Your customers aren't ignoring your emails.                         hook, 0 s
(beat) **They never saw them.**                                     peak 1, about 2.5 s
Your subject line looked like every other one in the inbox.         release
(beat) **So write it like a text from a friend.**                    payoff, about 8.5 s
```

Every claim in it is the user's call: before recording, confirm it fits their business. A shoot
script with facts about the user (years in business, client counts) uses only what they told us.
