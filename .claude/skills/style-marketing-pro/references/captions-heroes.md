# Captions and hero keywords

## Body caption (`rcg captions --style mp-body | mp-body-dark`)

From the reference: chest height, two tiers. The clause's lead words sit small and light above
(shown for the whole clause); the rest rolls below in bold 1-2 word chunks, one at a time; every
element blurs in (8 px to sharp, 0.18 s) and out. The planner:

- writes `data/words-captions.json` with its clause breaks (`brk: true`), so caption groups follow
  the beats;
- picks `mp-body` (white) or `mp-body-dark` (ink) from the median brightness of the chest area under
  the planned framing (R11: black shirt, luminance 34 -> white);
- places it at y 0.56 H (below the chin even at a 1.6 punch). Override with `--caption-y`.

## Hero keyword (`hero` component)

One per beat, chosen by score: numbers / % / $ (5), negations (4.5), sentence-initial contrast words
(4), emotion words (3.5), proper nouns of 2+ letters (3), a power-word list (2.5), long content
words (1.5). A weak beat (< 1.5) gets no hero unless 4 s have passed; a word is never used twice.

| Role | Look | Motion |
|---|---|---|
| number, stat | `neon`: Montserrat 900 caps, pink-to-cyan gradient, dark outline, pulsing glow | pop in (back.out) |
| negation | `strike`: bold caps, a red line drawn through each line | rise, then the line draws |
| contrast word | `focus`: Inter bold caps | blur-to-sharp focus pull |
| opener, name | `serif-caps`: Playfair Display 700 caps, purple | word by word on the spoken times |
| emotion, closing | `italic`: Playfair Display Italic, `*word*` bold italic in teal/purple, lead line above | words blur in |
| anything else | `wide`: Montserrat 700 tracked caps, small lead line | horizontal spread in (scaleX; letter-spacing animation is refused by hf lint) |
| any but negation, with `--fill-heroes` | `fill`: Montserrat 900 caps filled with `gradient` (purple-pink), `red` (scarcity words), `gold` or a job image (gold texture, pink texture, a photo for a name or place) | rises out of a blur; the fill drifts across the letters while the word holds |

- **Window**: from the keyword's first word, about 2.6 s, ending when the next hero starts (at least
  1.2 s).
- **Place**: centred on the face's screen x (inside the safe box), above the eyes at the planned zoom
  (the simulated reframe gives the face box), top limit y 192.
- **Behind the head** (`rcg layer --behind p1` on the aligned cut-out) when at most 40% of the word
  would be hidden; otherwise in front.
- **Tone**: the plan samples the source pixels behind the hero box at mid-window, through the
  inverse of the camera transform: bright (> 140 of 255) -> dark text; else light text.
- **Contrast audit**: hf check measures every text node. Gradient text counts by its outline (the
  neon look's dark stroke); white text on a light wall fails, which is why tone exists.

## Caption text controls (Adits Active Tracking Caption, `rcg captions`)

Off by default: the reference look uses none of them. The planner stores the choice in
`data/mp-plan.json` and the build passes it on.

| Plan option | Where | What it does | When to use |
|---|---|---|---|
| `--caption-fx shadow` (+ `--caption-shadow-angle`, `--caption-shadow-dist`) | body caption | Adits drop shadow (blur 4, 80% black), replaces the preset's soft shadow | light or busy chest area (a pale shirt, a pattern); on a black shirt it does not show |
| `--caption-fx rgb` | body caption | the text colour cycles red-green-blue on the timeline clock | playful or music-led promos only; it fights the tone rule, so check contrast |
| `--caption-fx hollow` | body caption | outline only, in the text colour | large type only; the 70 px body chunks read thin, so snapshot it |
| `--negative-heroes N` | hero keyword | the hero becomes an inverted caption: white Inter 900 caps at 150 px (shrunk to fit the safe width), no pill, stroke, glow or shadow, `difference` blend, behind the cut-out | a key word on a plain light or dark wall above the head |

Negative heroes:
- **Who qualifies:** a hero already behind the head (at most 40% hidden). Its sampled background
  `bg` must be at least 60 from mid-grey: a difference blend over mid-grey all but vanishes. The
  strongest backgrounds go first, and two negative heroes are never adjacent. The report warns
  when fewer than N qualify.
- **How it is built:**
  - It replaces the hero component: no look, tone or lead line, and it is not in
    `data/style-plan.json`.
  - The keyword is one entry in `data/words-hero<i>.json`, held for the hero window, and built
    with `rcg captions --style modern --mode phrase --size 150 --negative --insert --behind p1`.
  - The id stays `hero<i>`, so its whoosh sound and layer rule carry over on a re-plan.
- **On a bright wall** the word inverts to near-black: R11b "SYSTEM", bg 208, measured 32-48 of 255 in
  the render.
- **Never on the body caption:** it sits in front of the chest, and negative text goes behind
  the subject (user rule).

## Keyword clusters (`--clusters`, reference Video-54041)

- **Lead:** up to 3 words before the keyword (at most 24 characters), small, above it. It comes in
  when the lead is spoken; the hero window now starts there.
- **Keyword:** comes in on its own spoken time (`textAt`).
- **Tail:** up to 3 words after the keyword, to the clause end (at most 22 characters, else one
  word), small and bold below it, each part on its spoken time (`tailAt`).
- **Split:** behind the head, a tail of 2 or more words splits left and right of it. The gap is 1.5
  face widths, at most half the box.
- **Body caption:** cluster words leave it, so nothing shows twice.
- **Whips:** a whip never cuts a hero's main word to under 1 s.

## Photo cards (`--cards "word:img"`)

- **When:** the first time the word is spoken, for 2.4 s.
- **Size:** a 340x420 rounded card that flips in from the side with a 3D tilt, floats, and flips out.
- **Where:** beside the head, on the side with more room, below the hero band, behind the cut-out.
- **Sound:** a soft whoosh (pack `sfx.card`).
- **Photos:** only from the approved sources, after the user says yes; credits never on screen.

## Tags, logos, CTA

`tag` (outlined pill with a ring marker), `logo` (a supplied image on a white chip), `cta` (dark pill
with a link glyph). Placement and timing are manual (see SKILL.md); the planner adds a CTA when the
last beat asks for a link / follow / call.

## Bloom flash

`rcg transition --style flash_bloom --to "#w1"`: a soft white radial bloom; the shot (and its cut-out)
brightens and blurs on the inner wrapper. The planner adds `--bloom N` of them on strong beat starts,
at least 15 s apart (never the first beat).
