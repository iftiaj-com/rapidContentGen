# Style packs

A style pack is one reusable visual language: drop a new video, name the style, and the edit is
built from ready parts instead of hand-written HTML. Five packs exist: two ported from public HyperFrames style skills, three learned from reference
videos (Vox-style parallax, a promo talking-head ad, an info-graphics video essay):

| Pack | Skill | Look | Regression |
|---|---|---|---|
| `tactile-collage` | `.agents/skills/style-tactile-collage` | paper, ink edges, tape, stamps, routes, checklists, marker emphasis | R9a |
| `quiet-editorial` | `.agents/skills/style-quiet-editorial` | serif headline, Inter labels, warm canvas, cards, cursor selection, one green state | R9b |
| `marketing-pro` | `.agents/skills/style-marketing-pro` | promo talking-head: a planner (`rcg marketing-pro`) turns speech into a moving camera (1.3 base / 1.0 wide / 1.6 punch, drift), hero keywords behind the head styled by meaning, two-tier captions | R11 |
| `info-graphics` | `.agents/skills/style-info-graphics` | voice-led video essay: a new visual each sentence on dark, cream or grey grounds; type stacks with one orange word, equations, stairs, pyramids, posts, prompt bars with a cursor, orbits, counters, Phosphor icons, photo plates, collages; word-anchored timing (`rcg infographics`); one-word chip captions | R13 |
| `vox-parallax` | `.agents/skills/style-vox-parallax` | photos cut into depth layers (`rcg layers`) on a virtual multiplane camera; depth blur, haze, grain, 12 fps steps, orange highlighter labels, serif titles, photo cards, archival plates | R10 |

## How a pack is built

Each pack has two halves, following the reference repos (which ship a `SKILL.md`, `references/`,
a `frame.md` design spec, caption and safe-zone components, fonts and scripts):

| Reference skill part | Here |
|---|---|
| `SKILL.md` (workflow, boundaries) | `.agents/skills/style-<slug>/SKILL.md`, used inside the `video-job` workflow |
| `references/*.md` (style system, scene grammar, layout, motion, captions) | `.agents/skills/style-<slug>/references/` |
| `assets/frame.md` (design spec copied into the project) | `library/styles/<slug>/frame.md`, written by `rcg style apply` |
| tokens in `frame.md` | `library/styles/<slug>/style.json` `tokens` (CSS custom properties) |
| caption component | a preset in `library/caption-styles.json`, used by `rcg captions --style <name>` |
| safe-zone component | `rcg style` refuses boxes outside the template's safe area; `rcg sheet --safe`; snapshots |
| fonts + install / preflight script | `style.json` `type` roles; font files in `library/styles/<slug>/fonts/`, copied into the job's git-ignored `assets/fonts/` |
| validate-package script | `node tools/rcg.mjs style show <slug>` loads and lists every part; R9 renders it |
| hand-built scenes | `library/styles/<slug>/components.mjs`: each component writes one sub-composition |

## Files in a pack

```
library/styles/<slug>/
  style.json       label, use, keywords, from, skill, tokens, type roles, captions, motion, sfx map
  frame.md         design spec written into each job
  components.mjs   export const components = { name: { summary, params, prepare?, sfx?, fullFrame?, render } }
  fonts/           only for faces HyperFrames does not bundle, with their licence files
```

A component's `render(params, ctx)` returns `{ html, css, js }`. `js` runs inside the
sub-composition's `build()` after the fonts load, with `tl` (paused GSAP timeline), `D` (duration),
`$(name)` (the element `<id>-<name>`) and `fit(el, text, opts)` (canvas-measured wrap and shrink;
`|` breaks a line, `*word*` marks emphasis). `ctx` gives `id`, `W`, `H`, `safe`, `tokens`, `type`,
`motion`, a seeded `rnd()`, `esc()`, `js()` (safe JSON for inline script), `sel()`, `idf()` and
`family(role)`. `prepare(params, { geo, rnd, pack, jobDir })` fills derived params (seeded tilt, a
box computed from end points) before the safe-area check. `sfx` is `{ role, at }` or a function
returning several hits; roles map to `style.json` `sfx`.

Rules every component keeps (lessons in the video-job skill): no `Math.random` or clocks (seed it),
no `visibility: visible`, text measured with canvas metrics, word gaps as measured margins (not
whitespace nodes, lesson 13ba), exits inside the duration, generated script compiled before writing.

## Adding a pack

From a reference style skill (a repo like the two above):

1. Clone it next to the source projects (`E:/Develop/Antigravity_testing/style-refs/`), add it under
   `sources` in `config/workspace.local.json`, and read every file.
2. Fonts: use a bundled HyperFrames family where it fits (`hyperframes-creative` typography list).
   Otherwise ask before copying an open-licensed font, log it with `rcg provenance copy|record`.
   Never copy a font that is not licensed for it.
3. Write `style.json` (tokens from its `frame.md`; check text colours for 3:1 or better against the
   grounds they sit on and add `-ink` / `-deep` text shades where needed), `frame.md`, the caption
   preset, and one component per item in its component grammar.
4. Write the skill: a fast path through `rcg style`, a plan-file example, the component table,
   boundaries, and `references/` adapted to this workspace's safe zones.
5. Record provenance (`port` for rewritten files, `learn` for ideas only), then build a regression
   job with real footage that uses every component, render it, read the sheet and a full-resolution
   frame, and write `regression/R<n>/README.md`.

From a reference video only: describe its look as tokens, type roles, components and motion
timings first (the `design-dna` skill can help extract them), confirm with the user, then follow
steps 3-5. Do not copy people, footage, copy or brand marks from the video.

## Commands

```
node tools/rcg.mjs style list
node tools/rcg.mjs style show <slug>
node tools/rcg.mjs style apply --job jobs/<id> --style <slug>
node tools/rcg.mjs style add --job jobs/<id> --style <slug> --component <name> --start s --duration s [--<param> v ...] [--sfx] [--insert]
node tools/rcg.mjs style build --job jobs/<id> --spec jobs/<id>/data/style-plan.json [--sfx] [--insert]
```

`build` prints `ERROR` and exits 1 for an item it could not build (most often a box outside the safe
area); the other items are still written. Read the whole output.
