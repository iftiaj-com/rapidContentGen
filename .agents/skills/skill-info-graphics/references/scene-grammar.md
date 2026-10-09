# Scene grammar

A scene = one sentence = one ground + one hero object. A clause inside it changes one part of the
hero (a word, a step, a chip, a highlight), anchored to the word that names it.

## Pick the hero by what the sentence does

| The sentence... | Hero | Notes |
|---|---|---|
| states a hook or a punchline | `stack` | 2-4 lines, one `*orange*` word; `heavy` for a shout, `slant` for a reflective word; an `arrow` to point at something |
| contrasts or defines | `equation` | "Slop ≠ AI", "Editor = [Opus 5.5]"; `chip` for the thing being named |
| shows progress over time | `stairs` | stairs for growth, tower for eras (labels alternate) |
| ranks people, costs or effort | `pyramid` | bottom tier first |
| shows one subject in detail | `photo` | `mark` the detail as it is named; a `plate` names it, and its year can count |
| gives many examples | `collage` | scatter for variety, grid for a gallery, mosaic for "everyone, everywhere" |
| quotes a statement or a public mood | `post` | invented generic account; highlight the key words |
| describes a tool or an action | `prompt` | type, click, show the result |
| names one thing with several parts | `orbit` | each part pops on its word |
| gives one number | `counter` | real, sourced numbers only |

## Grounds

- Alternate so cuts read: dark, then cream or paper, then dark. Light grey (`paper`) suits charts and
  timelines; cream suits calm explanation and UI; dark suits claims and punchlines.
- `"end": "scene"` on every item of a scene keeps them in step with the next ground.
- Scene handovers: `"end": "scene"` keeps an item until the next ground has finished entering, and
  `"end": "#g4"` does the same for a named ground (a scene that continues past a cutaway). Items that
  start with a revealing ground get `reveal` from `resolve`, so they appear only inside it (lesson 13bp).
- A cutaway (a short scene over a running one, like the footage collage in v2): put its ground and
  parts after the running scene in the plan, and hide the running hero for the cutaway window (main
  timeline `tl.set("#o1", { opacity: 0 }, a)` / `{ opacity: 1 }` at b) so no covered text is left.
- Footage under a scene: a plain `<video>` in a `.shot` wrapper in `index.html` (before the hosts), a
  CSS blur for mood, and a `ground` with `opacity` 0.5-0.7 as the scrim.
- Enter with `cut` by default. Use `arc` for a section turn, `wipe-left` / `wipe-up` for a step in
  a sequence, `iris` for the payoff.

## Timing

- Start a scene on the first word of its sentence (or 0.1 s before, `@vo4:Just-0.12`).
- Hero parts land on their words: `times` per word or part, `clickAt` on the end of the word that
  causes the click (`@vo1:prompt$`).
- Give the last scene at least 0.45 s after the last word, and any arrow or highlight time to
  finish before the end (an arrowhead drawn 0.05 s before the end is not seen).
- Scenes shorter than 1.2 s read as a flash; longer than 5 s need a clause change inside them.
- Caption chips hold 0.35 s after a line's last word. If the next line starts sooner, the two chips
  overlap (`hf check` reports `content_overlap`): widen that gap with `place-voice --gaps`.

## Layout

- x defaults to 482 (the safe-box centre, left of the app buttons). Hero centres between y 500 and
  y 1000 read best; keep everything above y 1360 (the chip is at 1440).
- One hero per scene. A small `stack` title above a hero is fine when the voice says it.
- Photos and collages may run past the edges (`"allow-edge": true` on a photo); text may not.
