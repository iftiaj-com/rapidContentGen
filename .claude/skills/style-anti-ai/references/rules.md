# Anti-AI rules

Looks that read as generic AI output, what `scripts/check.mjs` reads to find each one, and the fix.
The rule list started from ai-video-editor's `skills/style-edit/references/ai-tells.md` (32 rules, 15
BAN, with its sources: design write-ups on "AI slop", Wikipedia's "Signs of AI writing", caption-app
presets and that app owner's own rejections). It was rewritten for rcg: what a rule reads is an rcg
composition, plan or audio element, not that app's cards.

- **BAN**: fix it unless the user wants it. **WARN**: worth a look; keep it when there is a reason.
- `level` is the level the check uses now. `suggested` is the source's level. A rule moves to its
  suggested level only after it has been run on the user's past jobs without firing on one they
  approved; a rule that fires on an approved job stays WARN, or that style gets an allowance
  (`style-allowances.md`). The calibration and its evidence are at the end.
- Never flagged: the user's brand colours and fonts (`data/brand.json`), the speaker's own words
  (transcript captions), real posts and captures, and what a style's allowance covers.

| id | Looks like | Read from | Fix |
|---|---|---|---|
| `emoji` | emoji in captions, titles or cards | every on-screen text | the word, or the real logo |
| `slop-icon` | sparkles, wand, rocket, stars, bot (suggested BAN); zap, brain, bulb, trophy, target, gem, crown (WARN) | icon names in style params and icon file names | the real logo or product UI |
| `slop-copy` | unlock, supercharge, game-changer, seamless, elevate, leverage, unleash, skyrocket, cutting-edge, delve ... | text we wrote: titles, style components, beat-flash words, `data/vo-lines.json` | the speaker's words; name the concrete thing |
| `slop-structure` | "it's not just X, it's Y", "here's the thing", "changes everything", "the future of" | the same text | say the claim once, plainly |
| `multiplier-stat` | a big "10x faster" stat | the same text | show where the number was published |
| `text-only-cards` | half or more of the designed blocks are words on a plain ground | style components and titles with no image, video or drawing | show the thing itself; keep type for the lines that need it |
| `big-number` | a block that is only a number | the same blocks | show where the number came from |
| `em-dash` | em dashes in on-screen copy | text we wrote | a comma or a full stop |
| `title-case` | Title Case On Every Word | titles and style component text | sentence case, or the speaker's own casing |
| `one-accent-word` | one `*word*` set apart in a heading | style component text | set the line plainly; emphasis comes from timing |
| `purple-blue` | indigo or violet accents and purple-to-blue gradients (hue 225-295, saturation 40%+) | colours in our compositions; the frame sheet with `--frames` | colour from the real content or the brand |
| `neon-on-black` | a near-black ground lit by one acid accent | composition grounds and text colours; the frame sheet | a real dark UI only when the subject has one |
| `cream-paper-ground` | a warm cream or beige paper ground (hue 20-60, saturation 4-30%, value 78%+) | composition backgrounds; the frame sheet | the footage or a plain surface |
| `glass-panel` | frosted glass: `backdrop-filter` blur | composition CSS | a plain card, or none |
| `glow-halo` | a coloured glow round text or shapes (shadow blur 12 px or more in a bright saturated colour) | composition CSS | crisp edges; depth from a real shadow |
| `default-grotesk-display` | display text in Inter, Montserrat, Poppins, Roboto, Archivo, Geist ... | the first font of titles, style components and beat-flash words | a serif or a measured display face |
| `preset-captions` | the one-tap preset: uppercase, yellow, heavy stroke | the caption composition's CSS | a caption look chosen for this video |
| `bounce-ease` | overshoot, elastic or bounce on entrances | GSAP eases in our compositions | expo or quart out; one overshoot on one hero moment |
| `same-entrance` | the same entrance on 4+ blocks in a row | title presets and style components, by start time | vary the entrance by what the block is |
| `same-transition` | the same designed transition on 3+ cuts | `plan.json` transition items (else the style's plan file) | hard cuts for most; a designed transition for one or two |
| `zoom-every-line` | more than 15 camera moves a minute | camera cues in `plan.json` (else the style's plan file) | the measured rate; move on the lines that earn it |
| `one-sfx-repeated` | one sound file on over half of 6+ cues | sound effect `<audio>` elements | a different file per cue, most cues silent |
| `whoosh-every-block` | a whoosh on every block (4+) | sound effect file names against the block count | sound on a few events |
| `meme-sfx` | vine boom, bruh, airhorn, ka-ching, record scratch | sound effect file names | none, unless the user asks |

```json
{
  "emoji": { "level": "BAN", "suggested": "BAN", "fix": "the word, or the real logo" },
  "slop-icon": { "level": "WARN", "suggested": "BAN", "fix": "the real logo or product UI; a sparkle or rocket means 'AI' and nothing else" },
  "slop-copy": { "level": "WARN", "suggested": "BAN", "fix": "the speaker's own words; name the concrete thing" },
  "slop-structure": { "level": "WARN", "suggested": "WARN", "fix": "say the claim once, plainly" },
  "multiplier-stat": { "level": "BAN", "suggested": "BAN", "fix": "show the page that published the number" },
  "text-only-cards": { "level": "WARN", "suggested": "BAN", "fix": "show the thing itself; keep type for the lines that need it" },
  "big-number": { "level": "WARN", "suggested": "WARN", "fix": "show where the number came from" },
  "em-dash": { "level": "WARN", "suggested": "WARN", "fix": "a comma or a full stop" },
  "title-case": { "level": "WARN", "suggested": "WARN", "fix": "sentence case, or the speaker's own casing" },
  "one-accent-word": { "level": "WARN", "suggested": "WARN", "fix": "set the line plainly; emphasis comes from landing on the spoken word" },
  "purple-blue": { "level": "WARN", "suggested": "WARN", "fix": "colour from the real content or the brand" },
  "neon-on-black": { "level": "WARN", "suggested": "WARN", "fix": "a real dark UI only when the subject has one" },
  "cream-paper-ground": { "level": "WARN", "suggested": "WARN", "fix": "the footage or a plain surface" },
  "glass-panel": { "level": "WARN", "suggested": "WARN", "fix": "a plain card with a real shadow, or no card" },
  "glow-halo": { "level": "WARN", "suggested": "WARN", "fix": "crisp edges; depth from a real shadow" },
  "default-grotesk-display": { "level": "WARN", "suggested": "WARN", "fix": "a serif or a measured display face" },
  "preset-captions": { "level": "WARN", "suggested": "WARN", "fix": "a caption look chosen for this video" },
  "bounce-ease": { "level": "WARN", "suggested": "WARN", "fix": "expo or quart out; one overshoot on one hero moment" },
  "same-entrance": { "level": "WARN", "suggested": "WARN", "fix": "vary the entrance by what the block is" },
  "same-transition": { "level": "WARN", "suggested": "WARN", "fix": "hard cuts for most; a designed transition for one or two moments" },
  "zoom-every-line": { "level": "WARN", "suggested": "WARN", "fix": "the measured rate; move on the lines that earn it" },
  "one-sfx-repeated": { "level": "WARN", "suggested": "WARN", "fix": "a different file per cue; most cues land silent" },
  "whoosh-every-block": { "level": "WARN", "suggested": "WARN", "fix": "sound on a few events" },
  "meme-sfx": { "level": "WARN", "suggested": "WARN", "fix": "none, unless the user asks" }
}
```

## Calibration

Run 2026-10-12 with `check.mjs calibrate --frames` over the 36 jobs in `jobs/` (13 s). All 36 were
treated as approved: that is an assumption, not something the user confirmed per job. A rule that
fired on one of them stays WARN or got an allowance.

| Rule | Fires on | Decision |
|---|---|---|
| `emoji`, `multiplier-stat` | 0 jobs | **BAN** (their suggested level) |
| `slop-icon` | 2 (rocket-launch in 2026-10-08-r13-info-graphics, sparkle in 2026-10-10-dont-hurt-claude, a video about AI) | stays WARN |
| `slop-copy` | 1 ("highest-leverage" in 2026-10-08-script-1l-graphics) | stays WARN |
| `text-only-cards` | 1 (2026-10-07-r1b-title-presets, titles on black); allowed on 5 | stays WARN |
| `default-grotesk-display` | 14 (Inter in info-graphics and marketing-pro, Montserrat in titles) | WARN |
| `one-accent-word` | 8 (the `*word*` emphasis of the style packs); allowed on 7 | WARN |
| `glass-panel` | 4 (vox-parallax) | WARN |
| `title-case`, `preset-captions` | 3 each | WARN |
| `purple-blue`, `neon-on-black` | 2 each (a magenta caption flash; frames of a title test and one info-graphics job); allowed on 3 each | WARN |
| `one-sfx-repeated`, `whoosh-every-block` | 2 each | WARN |
| `bounce-ease`, `same-entrance`, `same-transition` | 1 each | WARN |
| `zoom-every-line` | 0; allowed on the 3 marketing-pro jobs | WARN |
| `slop-structure`, `big-number`, `em-dash`, `glow-halo`, `meme-sfx`, `cream-paper-ground` | 0 | WARN (suggested WARN) |

Detector fixes the first run showed (they fired on rcg's own design, not on a tell):
- text-only: a text block over footage or a photo is not "words on a plain ground" (rcg keeps text and
  media in separate layers), and a photo drawn as a CSS background is media (vox parallax plates).
- title case: judged per line; a list of one-word labels ("Script|Voice|Frames|Sound") is not one.
- bounce: overshoot on 60% or more of the designed blocks, not on any one (rcg's generators use
  `back.out` for single hero entrances).
- camera: a move is a short eased zoom or a punch; the long linear drift after it is not a move.
