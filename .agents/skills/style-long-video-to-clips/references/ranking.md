# Finding and ranking clips

Code measures, the agent judges. `scripts/clips.mjs find` cuts the long video's transcript into
sentences, lists every run of whole sentences that fits the length, scores each run on what can be
counted, and writes the best 15 that do not overlap to `data/clips/candidates.md`. The agent then
answers four questions per candidate in `data/clips/scores.in.json`; `clips.mjs shortlist` keeps the
best 8 with no overlap.

## Sentences and candidates (code)

- A sentence ends on `.`, `?` or `!`, or at a silence of 1.2 s or more between words.
- A candidate is a run of whole sentences whose length is inside `--len` (20-40, 40-60 or 60-90 s).
- It starts on a sentence of 4 or more words, and ends on a finished sentence (`.`, `?` or `!`) of 3
  or more words.

## Code features and the code score

| Feature | What it counts | Weight (judgment, tune on real talks) |
|---|---|---|
| pace | words a minute (z-score across candidates) | +1 |
| loud | mean level against the talk's median sentence level (z-score) | +1 |
| first 3 s | words said in the first 3 seconds: a fast start (z-score) | +1 |
| numbers | digits and number words, up to 3 | +0.5 each |
| names | capitalised words that do not start a sentence (people, products, places), up to 3 | +0.3 each |
| laughs | "haha", "laugh", "[laughter]" | +0.5 |
| question | the first sentence is a question | +0.5 |
| weak start | starts on and, so, but, or, because, then, also | -1.5 |

The code score only orders the list. It cannot tell whether a passage makes sense alone; the agent's
scores decide the shortlist, and the code score breaks ties.

## The four questions (agent, 0-3 each)

Answer them from the candidate's text only, as a viewer who did not see the rest of the video.

| Question | 0 | 3 |
|---|---|---|
| **hook**: does the first sentence make you want the next one, on its own? | a greeting, a "so, yeah", a reference to earlier | a claim, a question, a number, a surprise |
| **self**: is it self-contained? | needs "as I said", an unexplained "it" or "they", a name never introduced | a newcomer follows it |
| **payoff**: does it land? | stops mid-thought or trails off | ends on the answer, the punchline or the takeaway |
| **concrete**: is it specific? | general advice anyone could say | a number, a name, an example, a story |

Write one line of `why` per candidate in the speaker's terms ("the 3-step pricing story with the
$40k number"). That line goes on the shortlist the user reads.

## Answer file

```json
{ "candidates": "<id from candidates.json>",
  "scores": { "k1": { "hook": 3, "self": 2, "payoff": 3, "concrete": 2, "why": "..." } } }
```

Every candidate needs all four numbers. A sub-agent may fill it (one compact file, one question, a
fixed answer shape); spot-check a few against the text before running `shortlist`.

## Shortlist

Total = hook + self + payoff + concrete (0-12), ties broken by the code score. The best 8 with no
overlap go to `data/clips/shortlist.md` with their time range, length, total, the `why` line and the
opening sentence. The user picks the clips and one style pack.
