# Settings and their hard limits

A learned rule that sets a number becomes a flag on a command rcg already has. These are those
settings, the flag each one becomes, and the limit no taste may cross. `scripts/learn.mjs` reads the
JSON block at the end of this file (the one source), refuses a value past a limit and names the reason.

| The user says | Setting | Applied as | Hard limit | From |
|---|---|---|---|---|
| Cut too slow / too tight | `cut-max-pause` | `rcg cut build --max-pause` (config `cut.maxPause`) | 0.08 to 0.5 s | judgment: under 0.08 s joins sound clipped, over 0.5 s nothing is tightened |
| Keep my ums | `keep-fillers` | `rcg cut propose --keep-fillers` (config `cut.keepFillers`) | none | |
| Captions too small / big | `caption-size` | `rcg captions --size` | 40 to 200 px, and the text fits between the header line and the bottom zone | pitfall 7 |
| Captions higher / lower | `caption-y` | `rcg captions --y` | y + 1.6 x size under 1536 and y - 1.6 x size over 192 on 9:16 | pitfall 7 (`rcg captions` applies the same 1.6 x size rule) |
| Marketing-pro caption height | `mp-caption-y` | `rcg marketing-pro plan --caption-y` | as `caption-y` | pitfall 7 |
| More / fewer words on screen | `caption-mode` | `rcg captions --mode` | word, 2word or phrase; groups never overlap in time | lessons 13c (the tool enforces it) |
| Caption look or colour | `caption-style` | `rcg captions --style` | a preset in `library/caption-styles.json`; the user's brand colours first | |
| Zoom too tight | `mp-max-punch` | `rcg marketing-pro plan --max-punch` | 1.0 to 1.8 | a 2.0x zoom cropped the face on a real take (ai-video-editor, 2026-10-12); the face must stay in frame |
| Voice too slow / fast | `voice-speed` | `rcg voice say --speed` | 0.8 to 1.5 | judgment: Kokoro slurs past 1.5 and drags under 0.8 |
| Music louder / quieter | `music-volume` | `rcg infographics place-voice --music-volume` | 0 to 1 | pitfall 2: music is limited to -2.5 dBTP first, the mix to -14 LUFS and -1 dBTP (`rcg mix-check`) |
| Fewer / more camera moves, no sound effects, anything else | none | a worded rule the agent follows | pitfalls still win | |

Order when rules meet: style pack defaults < every job < one style < one job. The hard limits always
win, and the core checks (`rcg captions` and `rcg title` refusing the bottom zone, `rcg style build`
safe areas, `rcg plan check`, `rcg mix-check`, `rcg verify`) still catch anything that slips.

```json
{
  "cut-max-pause": { "apply": "rcg cut build --max-pause", "min": 0.08, "max": 0.5, "why": "judgment: under 0.08 s joins sound clipped, over 0.5 s nothing is tightened" },
  "keep-fillers": { "apply": "rcg cut propose --keep-fillers", "flag": true },
  "caption-size": { "apply": "rcg captions --size", "min": 40, "max": 200, "why": "pitfall 7: the text must fit between the header line and the bottom no-text zone" },
  "caption-y": { "apply": "rcg captions --y", "bandWith": "caption-size", "defaultSize": 78, "top": 192, "bottom": 1536, "why": "pitfall 7: no text in the bottom 20% of 9:16 (from y 1536) or above the header line (192)" },
  "mp-caption-y": { "apply": "rcg marketing-pro plan --caption-y", "bandWith": "caption-size", "defaultSize": 78, "top": 192, "bottom": 1536, "why": "pitfall 7: no text in the bottom 20% of 9:16 (from y 1536) or above the header line (192)" },
  "caption-mode": { "apply": "rcg captions --mode", "enum": ["word", "2word", "phrase"], "why": "the modes rcg captions has" },
  "caption-style": { "apply": "rcg captions --style", "enumFrom": "library/caption-styles.json", "why": "a preset rcg captions has" },
  "mp-max-punch": { "apply": "rcg marketing-pro plan --max-punch", "min": 1.0, "max": 1.8, "why": "a 2.0x zoom cropped the face on a real take; the face must stay in frame" },
  "voice-speed": { "apply": "rcg voice say --speed", "min": 0.8, "max": 1.5, "why": "judgment: Kokoro slurs past 1.5 and drags under 0.8" },
  "music-volume": { "apply": "rcg infographics place-voice --music-volume", "min": 0, "max": 1, "why": "pitfall 2: louder than 1 undoes the -2.5 dBTP music limit; the mix stays at -14 LUFS and -1 dBTP" }
}
```
