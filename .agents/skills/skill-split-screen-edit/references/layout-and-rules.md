# Layout and rules

What the reference does, the numbers the tools use, and why. Numbers live in
`library/split-screen/layout.json`.

## The reference (Video-94146, 112 s, 720x1280, 30 fps)

Measured on 2026-10-08 with a per-half-second classifier (bottom strip against a known split
frame) and a 128-row brightness profile. Treat the numbers as estimates: about +-1-2% of height
for positions, rough for the shares.

| Layout | Share | Typical length | Use |
|---|---|---|---|
| split | about 48% | 4-7 s | explaining; the presenter shot runs on while the top panel cuts every 1-2.5 s (about 55 cuts in 112 s) |
| b-full | about 33% | 0.5-6.5 s | strong visuals: logo cards, a price card, an article with a marker highlight, product UI |
| a-full | about 19% | 1-4 s | section openers ("here is how", "but", "so why"), questions, the closing opinion |

The layout changes about every 3 s. Split to a-full uses a 2-3 frame tinted flash (yellow, pink,
orange); every other change is a hard cut.

Seam (scaled to 1080x1920): B-roll at full brightness to about y 1000, a fade to black to about
y 1190, the caption centred near y 1236, the presenter visible from about y 1190 down with the face
near y 1440-1480. The presenter was shot wide on a dark wall, so a 16:9 presenter fills the bottom
panel almost uncropped and the dark wall blends into the fade.

Captions: small white sans, 1-3 words, on the seam; a dark pill over light backgrounds. Titles:
a small lead line over a large italic serif line at chest height.

## Planner rules (tools/recipes/split-screen.mjs)

1. Beats come from marketing-pro (`clausesFromWords`, `snapOnsets`): clauses at punctuation,
   pauses and conjunctions; beats of about 1.5-4 s that never cross a sentence end.
2. Layout per beat: the first beat is split (the hook). A-full on an opener word, a question,
   the closing line (3+ beats), or after a pause of 0.6 s or more. B-full on a number or stat.
   Otherwise split.
3. The a-full share is capped at 0.30: the weakest a-full beats (pause-only first) go back to split.
   Then the rhythm rule: once split has run 4 s (`splitRun`), the next split beat goes b-full.
4. Windows start 0.1 s before their beat's onset. Same-layout neighbours merge (a-full up to 4 s,
   b-full up to 6.5 s); a window under 0.6 s joins the one before. A full-frame window over its cap
   keeps the clauses that fit; the rest goes back to split.
5. A split window whose presenter crop fails (face out of the panel on more than 5% of frames)
   becomes a-full (4 s or less) or b-full.

Why the cap comes before the rhythm rule: in R12 the rhythm pass ran first, a beat it counted as
a-full was then demoted, and split ran 9 s with no full-frame break.

## Full-frame presenter (a-full)

The marketing-pro face camera is planned over the whole clip once; each a-full window gets a
`face.punch` to the camera state at its start plus the cues inside it. The window's words become
titles in chunks of 6 or fewer words, broken at clause ends: the last up to 3 words in italic
serif (a number becomes a neon hero), the words before it as the lead line. Titles sit at x 482,
y 1060, moved below the chin when the simulated face would reach them; tone (dark or light text)
comes from the sampled background. A-full windows have no seam caption: the title carries the words.

## Captions

One `rcg captions` block per split or b-full window, words re-timed to the window: `split-seam` in
split, `split-pill` in b-full (inside the band, y 1290, on band cards). `split-screen clamp` ends
each block with its window: `rcg captions` holds the last group about 0.4 s past the last word,
which put a seam caption over the next full-frame window in R12.

## Layers (tools/blocks/split.mjs)

B panel z 1, presenter panel z 2, seam fade and shade z 3, full-frame windows z 5-8, highlights
z 9, titles and captions z 40 (id rules written from the plan: an attribute selector on the hosts
did not hold once HyperFrames mounted them, and every caption vanished under the panels in R12),
light leak z 95, handle z 60.

## Sounds

`whoosh-short` (0.14) under each light leak, `pop` (0.16) on each band card, placed by the
measured peak. The presenter's voice is the only other audio. `rcg mix-check` must say MIX OK.
