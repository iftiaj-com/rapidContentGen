# R13: info-graphics essay pack

Skill `skill-info-graphics`, pack `library/styles/info-graphics`, tool `rcg infographics`. Learned from
the user's reference Short "Disney vs Midjourney" (YouTube Shorts fZIXlBGaIMs; technique only,
nothing copied; `.claude/skills/skill-info-graphics/references/reference-analysis.md`).

## R13a: component gallery (snapshots only, not rendered)

`jobs/2026-10-08-r13-info-graphics`, 24 s, graphics only, every component once on its own ground.
Test stills copied from earlier jobs' assets (`a.png` from R0, `b`/`c` from R4, `d` from R4b,
`e`/`f` from R10), all the user's own footage frames.

1. `rcg new-job --name r13-info-graphics --mode b`, `rcg infographics scaffold --duration 24`,
   `rcg style apply --style info-graphics`.
2. `data/style-plan.json` (22 items, plain numbers), `rcg style build --sfx --insert`: 22 inserted.
3. `rcg hf check`: passed; lint, runtime and motion 0/0; contrast 85/85 WCAG AA. Layout info only:
   odometer strips and collage cards past the edge (both intentional, now tagged
   `data-layout-allow-overflow`).
4. Snapshots `snapshots/gallery/contact-sheet-1..2.jpg`, read: stack with heavy orange word and arrow,
   equation with key cap, stairs, tower with the hot step in orange, pyramid with tier chips, mono photo
   with mark bar and a plate counting 1908 to 1923, scatter collage, post with highlight sweep, prompt
   with typed text, cursor on the button and the result image, orbit with four chips, counter mid-roll
   and settled.

5. Icon scene added (24-26 s, root now 26 s): four Phosphor bold icons fetched with
   `rcg assets icon add` (microphone, film-strip, speaker-high, rocket-launch; plus sparkle) in each
   badge (disc, chip, ring, none) with labels; snapshot `snapshots/icons/` read, clean. `hf check`
   passed; 5 contrast warnings are the photo plate's clipped counter digits measured against the
   photo while it rolls (not visible text; no HyperFrames opt-out exists).

Open: the gallery was not rendered to MP4, so the collage, post and counter were seen only in
snapshots. Render it once before calling those components ready.

## R13b: first real job (topic mode, rendered)

`jobs/2026-10-08-opus-5-5-made-this`, 10 s, 30 fps, mode (b). Topic "Opus 5.5 made this": the agent
wrote the script (4 lines, 23 words), voiced it with Kokoro af_heart, planned four scenes with
word anchors (prompt + stack, orbit, equation, heavy stack with arrow) and rendered.

- `rcg render`: RENDER OK. 1080x1920, 30.000 fps, 10.000 s, -14.6 LUFS, -2.7 dBTP, no dead edge band,
  no whole-mix gain reduction; 1.2 MB; rendered in 33 s.
- Found and fixed on the way: the last line's caption chip overlapped the next line's first chip by
  0.05 s (gap before vo3 widened from 0.3 to 0.4 s, `place-voice --gaps`); the closing arrowhead was
  drawn too late to be seen (anchored to the spoken word instead of 0.15 s after it); orbit chips were
  wider than their boxes (`width: max-content`).
- A full-resolution frame of the prompt bar from the MP4 shows the word spaces intact (lesson 13ba).
