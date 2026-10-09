# B-roll analysis and the montage

## rcg broll (tools/media/broll.mjs)

Per info clip: scene cuts (ffmpeg scene score above 0.25; shots under 0.6 s join a neighbour), then
per shot, from 96 px wide grey frames at 6 fps:

- luma: mean brightness 0-255;
- motion: mean absolute frame difference;
- edge: share of pixels with a gradient over 24 (text and UI score high);
- focus: centroid of edge and motion energy, pulled 30% toward the centre (used for cover crops
  and the Ken Burns origin).

Classes (`CLASS_RULES`): `dark` under luma 28 (skipped); `card` luma 150 or more and motion under
1.2; `ui` edge 0.10 or more and motion under 3; else `footage`. R12 scores: a white stat card
luma 246 motion 0.39 (card); a dark scrolling code page luma 38 edge 0.21 motion 1.7 (ui); a woman
on white luma 238 motion 1.74 (footage, correct: she moves); a dance clip motion 10.7 edge 0.21
(footage: the motion keeps busy footage out of `ui`).

READ `data/broll-sheet.png` (one labelled thumbnail per shot). A wrong class is fixed by editing
`cls` in `data/broll.json`; the planner reads it as it is.

## The montage (makePools in split-screen.mjs)

Mode: montage (the user's choice). The info video is a library of shots cut to the speech.

- Pools: split uses `footage` and `ui`; b-full uses `card`, then `ui`, then `footage`.
- Shots are interleaved by clip, and every piece rotates to the next shot in its pool, so each cut
  in the top panel shows a different source. In R12 the first version read one long clip in order:
  the "cuts" showed continuous footage and nothing changed.
- Each shot keeps one read position shared by both pools, so footage is not shown twice before it
  runs out. A shot read to its end starts again with its focus shifted 0.12 and the other Ken Burns
  direction (`reuse` in the plan; the planner warns).
- Top-panel cuts land on clause onsets 1.0-2.6 s apart (target 1.8 s).

## Placement (tools/blocks/split.mjs)

| Treatment | Where | Geometry |
|---|---|---|
| `panel` | top panel in split | cover crop of 1080x1190 around the focus, Ken Burns 1.00 <-> 1.05 |
| `cover` | b-full, portrait footage | cover crop of the frame, Ken Burns |
| `fit` | b-full, landscape footage and UI | contained at full width over a blurred, darkened cover copy, Ken Burns |
| `band` | b-full, cards | dark grey ground, white band y 560-1360, the clip contained inside with a 40 px margin, scale-in 0.9 -> 1 with a pop |

Cover crops of 16:9 UI in the top panel keep about half of the width; the focus point decides
which half. When the left side of a code page matters, set `focus.x` lower in `data/split-plan.json`.
