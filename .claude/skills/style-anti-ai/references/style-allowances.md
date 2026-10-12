# Style allowances

Rules that do not apply to a look, because that look is made of them on purpose. rcg ships neon
shaders, VJ effects, paper collage and kinetic type deliberately; a rule that fights a chosen style
is noise. `scripts/check.mjs` reads the JSON block below (the one source) and lists every rule it
skipped and why, so nothing is hidden.

Keys are style pack slugs (found from the job's `rcg-style` components, its `plan.json` style item,
or the style's plan file) and two features: `shader` (the job has shader, 3D or beat-flash blocks) and
`fx` (it plays `rcg fx` clips from `assets/fx/`).

| Look | Rule allowed | Why |
|---|---|---|
| info-graphics | text-only-cards, one-accent-word, big-number, cream-paper-ground | the look is kinetic type with one orange word, counters and stats, on dark, cream or light-grey grounds (style-info-graphics) |
| info-collage | text-only-cards, one-accent-word, big-number, cream-paper-ground | the info-graphics components re-skinned in paper collage (library/styles/info-collage) |
| tactile-collage | cream-paper-ground | paper collage is made of paper grounds |
| mix-media | cream-paper-ground | torn cream paper is one of its four pillars |
| marketing-pro | purple-blue, zoom-every-line | purple serif caps and the zoom rate (eased zooms 1.4-3.2 s apart) are measured from the user's own reference ad |
| character-lighting | neon-on-black | low-key setups and coloured rim or back lights are the look |
| shader | neon-on-black, glow-halo | audio-reactive neon on black is what the shaders are |
| fx | neon-on-black, glow-halo | the VJ and global-visual looks are neon light on dark |

Calibration on the user's past jobs adds rows here (see `rules.md`, Calibration).

```json
{
  "info-graphics": {
    "text-only-cards": "kinetic type is the look",
    "one-accent-word": "one orange word per line is the look",
    "big-number": "counters and stats are part of the look",
    "cream-paper-ground": "cream is one of its three grounds"
  },
  "info-collage": {
    "text-only-cards": "the info-graphics components re-skinned in paper collage: kinetic type is the look",
    "one-accent-word": "one signal-red word per line is the look",
    "big-number": "counters and stats are part of the look",
    "cream-paper-ground": "cream paper is its ground"
  },
  "tactile-collage": { "cream-paper-ground": "paper collage is made of paper grounds" },
  "mix-media": { "cream-paper-ground": "torn cream paper is one of its four pillars" },
  "marketing-pro": {
    "purple-blue": "purple serif caps are measured from the user's reference ad",
    "zoom-every-line": "the camera is measured from the user's reference ad: eased zooms on clause starts 1.4-3.2 s apart"
  },
  "character-lighting": { "neon-on-black": "low-key setups and coloured rim or back lights are the look" },
  "shader": { "neon-on-black": "audio-reactive neon on black is what the shaders are", "glow-halo": "shader light glows by design" },
  "fx": { "neon-on-black": "the VJ and global-visual looks are neon light on dark", "glow-halo": "VJ light glows by design" }
}
```
