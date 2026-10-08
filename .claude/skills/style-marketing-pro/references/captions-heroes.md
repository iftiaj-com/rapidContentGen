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

## Tags, logos, CTA

`tag` (outlined pill with a ring marker), `logo` (a supplied image on a white chip), `cta` (dark pill
with a link glyph). Placement and timing are manual (see SKILL.md); the planner adds a CTA when the
last beat asks for a link / follow / call.

## Bloom flash

`rcg transition --style flash_bloom --to "#w1"`: a soft white radial bloom; the shot (and its cut-out)
brightens and blurs on the inner wrapper. The planner adds `--bloom N` of them on strong beat starts,
at least 15 s apart (never the first beat).
