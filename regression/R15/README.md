# R15: marketing-pro reference looks (Video-54041)

`jobs/2026-10-09-r15-mp-reference-looks`, 17.86 s, mode (b). It is a copy of the R11 job, re-prepped
from the same WhatsApp source with room for a strip opener and closer. Reference analysis:
`.claude/skills/style-marketing-pro/references/reference-video-54041.md`.

## Assets (approved sources, downloaded with the user's OK, 2026-10-09)

- **Pixabay:** gold leaf 6969821, golden bokeh 6873009, pink-purple watercolour 413269, cherry
  blossom 324175, vertical light-leak video 377045.
- **Unsplash:** gold glitter SG59-rbcNRg (Katie Harp), rooftop-bar drink Hs_h11UX858 (Karol Chomka).
- **Phosphor icons** (in the repo): chat-circle-text, link-simple, calendar-dots, map-pin, ticket,
  users-three (not used in R15; kept for the comment CTA and event beats).
- **Credits:** in the job's `data/credits.json` and `report.md` only.
- **Test music:** `library/sfx/bg-music-daily-mail.mp3`, used only for this local test render. Its
  licence is unconfirmed, so do not publish R15.
- **Strip clips:** R15's own `main-prep.mp4` and `videos/Video_for_testing.mp4` (the user's test clip).

## Steps

```
rcg marketing-pro prep --job $J --src assets/WhatsApp_Video_2026-10-08_at_19.27.12.mp4 --trim --intro 3.8 --outro 1.8 --scaffold
# R11's corrected words restored, shifted by +3.8 s (same trim, 2.02-14.28 s)
rcg marketing-pro plan --job $J --bloom 0 --fill-heroes --fills gold=assets/img/unsplash-sg59-rbcnrg.jpg,pink=assets/img/pixabay-413269.jpg,photo=assets/img/pixabay-324175.jpg --clusters --cards "engineer:assets/img/unsplash-hs-h11ux858.jpg" --whips 2 --music assets/music/bed.mp3 --strips "assets/main-prep.mp4@5:0.5,assets/strip-b.mp4@2:0.42,assets/main-prep.mp4@9:0.5,assets/strip-b.mp4@8:0.42,assets/main-prep.mp4@13:0.5" --leak assets/video/pixabay-377045.mp4
rcg marketing-pro build --job $J
rcg render $J --fps 30 --workers 3
```

## Result

- **Opener:** five strips 0-3.8 s, 0.53 s apart, then a mirror whip (up) at 3.8 s into the shot.
- **Heroes:**
  - "work": gradient fill, in front of the head, lead "you get to", tail "with me".
  - "engineer": gold glitter fill, behind the head, lead "am a software"; the rooftop card beside
    the head, behind the cut-out.
  - "system": pink watercolour fill, lead "have really this".
- **Closer:** five strips at 16.06 s, a light-leak flash, then they drop out to black.
- **Sound:** music looped to 17.86 s and ducked under each sentence; whoosh and clicks.
- **Checks:** hf check 0 errors. Render 1080x1920, 30 fps, 17.867 s, 11/11 verify, -14.5 LUFS,
  -2.5 dBTP.
- **R11 and R11b:** their plans build the same commands as before.

## Found and fixed on the way

- **A whip cut a hero.** Whips first went on punch events, and one landed mid-hero. They now go
  only at sentence starts. The hero before ends 0.2 s ahead, and a whip that would leave a hero's
  main word under 1 s on screen is skipped. On this 12 s talk only the opener whip remains; a left
  whip at 7.63 s rendered correctly in an earlier build.
- **"T is not defined":** the main-word offset was used in the generated script without being
  declared there.
- **The fill did not reach the words.** fit() wraps words in `.ln > .w` spans, and hf check's
  text_not_painted reads each word. `.ln` and `.w` now inherit and clip the fill.
- **A front hero sat behind the cut-out.** The PNP has z 30, and a front hero had no z-index
  (R11's heroes were all behind, so it never showed). The build now gives front heroes z 40.
- **Stale layer rules.** `prep --scaffold` keeps the page head, and with it an earlier build's
  layer rules (`#hero1 { z-index: 20 }`). The scaffold now drops them.
- **The test bed was 9.0 s against a 17.9 s edit.** The audio step now loops a short bed.

## Open

- Several speakers (a clip per sentence), a walking camera, and the "comment WORD" CTA.
- The pastel watercolour fill reads pale on the light wall.
- The card photo is a mechanics test, not matched to the words.
