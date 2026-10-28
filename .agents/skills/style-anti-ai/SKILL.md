---
name: style-anti-ai
description: Review an rcg edit for looks that read as generic AI output (emoji, slop copy like "unlock" and "supercharge", "10x faster" stats, sparkle and rocket icons, words-only cards, purple-blue accents, neon on black, glass panels, glow halos, default grotesk display fonts, the one-tap caption preset, the same entrance or transition everywhere, a zoom on every line, one whoosh on every block) and propose fixes. A companion check, not a look: it runs with any style pack, is optional, and never blocks a render. Use when the user asks whether an edit looks AI-made, generic, templated or "slop", asks for an anti-AI or taste pass, or when a style skill lists it as a companion. Runs inside the video-job workflow.
---

# Anti-AI review (companion check)

Not a look: never offer it as the style of a video. It reads an edit made with any style pack and
lists what reads as generic AI output, with a fix for each. Optional: no core check calls it, and a
render never waits for it.

## Run it

Before render (cheap, JSON and HTML only):

```
node .agents/skills/style-anti-ai/scripts/check.mjs jobs/<id>
```

After render, add the frame sheet `rcg render` already wrote (no extra decode):

```
node .agents/skills/style-anti-ai/scripts/check.mjs jobs/<id> --frames
```

It writes `jobs/<id>/data/anti-ai.json` and prints one line per finding: `BAN` (fix it unless the
user wants it), `WARN` (worth a look) and `ok` (allowed by the job's look, with the reason). Exit 1
only when something is BAN.

## Read the report

1. **BAN**: fix it, or ask the user once when it might be on purpose. Today only `emoji` and
   `multiplier-stat` are BAN (calibration, `references/rules.md`).
2. **WARN**: look at the block it names. Keep it when there is a reason (the user asked, the brand
   uses it, the style needs it) and say the reason in the report; otherwise apply the fix line.
3. **ok (allowed)**: the job's style pack is made of that look (`references/style-allowances.md`).
   Nothing to do.

Never flagged: the user's brand colours and fonts (`jobs/<id>/data/brand.json`:
`{"colors": ["#..."], "fonts": ["..."]}`), the speaker's own words, and what a style allows.

## Fix

Fix at the source, then run the check again:

- copy, emoji, stats: rewrite the text in the style plan, the title or `data/vo-lines.json` (keep the
  speaker's own words; name the concrete thing).
- colours, fonts, glass, glow: the style pack's tokens or the block's flags, not by hand in a
  composition (`rcg plan check` would report the hand edit as drift).
- entrances, transitions, zooms, sounds: the planner's flags (`rcg marketing-pro plan --whips`,
  `--max-punch`), or vary the components in the style plan.

When the user says a flagged look is what they want, follow `learning-from-user-taste`: a lasting
preference becomes a learned rule, and a look that belongs to a style becomes a row in
`references/style-allowances.md`.

## Change the rules

- `references/rules.md`: each rule, what it reads, its fix, and its `level` (the JSON block is the
  one source). A rule becomes BAN only after `check.mjs calibrate` shows it does not fire on the
  user's approved past jobs; record the evidence in the Calibration section.
- `references/style-allowances.md`: per style pack (and `shader`, `fx`), the rules that do not apply.
- `node .agents/skills/style-anti-ai/scripts/check.mjs demo`: self-check, no network.
