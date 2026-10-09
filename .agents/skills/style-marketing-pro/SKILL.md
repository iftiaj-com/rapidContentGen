---
name: style-marketing-pro
description: Turn an ordinary single-person talking video into a promo edit in rapidContentGen - a camera that never rests (1.3x base, eased zoom-outs to 1.0x, 1.6x punches on sentence starts, constant drift), two-tier body captions and one hero keyword per beat behind the head, styled by meaning (purple serif caps, neon stats, strikethrough negations, focus-pull contrast words, italic closers, wide caps). Use for marketing, promo, ad, personal-brand, coach, agent, UGC or testimonial edits, or when the user drops a talking clip and asks for this style. Runs inside the video-job workflow.
---

# Marketing Pro (promo talking-head)

This skill owns the look and the planner. The `video-job` skill still owns intake, the working
mode, the report and the final send; use this skill from its analysis step on.

- Planner: `node tools/rcg.mjs marketing-pro prep | plan | commands | build` (`tools/recipes/marketing-pro.mjs`).
- Pack: `library/styles/marketing-pro/` (`hero` incl. the `fill` look and cluster tiers, `card`, `tag`, `logo`, `cta`; Playfair Display Italic downloaded, OFL).
- Captions: `mp-body` / `mp-body-dark` (two-tier, blur in and out). Transitions: `flash_bloom`, `mirror_whip`, `zoom_blur`. Opener / closer: `rcg strips`.
- Learned from the user's reference ad Video-2306 (measured, nothing copied). Regression: `regression/R11/README.md`
  (R11b there: the caption text controls and a negative hero).
- Scope: ONE person in frame. Two people (active-speaker focus) is a later phase (`references/camera-rules.md`).

Read `references/camera-rules.md` before changing any camera number, `references/captions-heroes.md`
before editing heroes or captions, and `references/source-quality.md` for phone footage.

## Fast path

1. **Intake** (video-job steps 1-2): `rcg new-job --name <slug> --video <clip> --mode <a|b|c>`.
2. **Prep** (CFR 30, upscale + clean when small, denoise + level the voice, transcript):
   ```
   node tools/rcg.mjs marketing-pro prep --job jobs/<id> --src assets/<clip> --trim
   ```
   `--trim` cuts dead air (keeps 0.2 s before the first word, 0.5 s after the last; an editorial
   change, say so). READ the printed transcript; correct `data/words.json` (or confirm with the user)
   before planning. The plan and build never re-transcribe.
3. **Plan**:
   ```
   node tools/rcg.mjs marketing-pro plan --job jobs/<id> [--bloom 1] [--max-punch 1.45] [--behind false]
        [--caption-fx shadow[,rgb,hollow] [--caption-shadow-angle 90] [--caption-shadow-dist 6]]
        [--negative-heroes 1]
   ```
   Caption text controls (off by default, so the reference look is unchanged; details in
   `references/captions-heroes.md`, "Caption text controls"):
   - `--caption-fx` passes `--shadow`, `--rgb` or `--hollow` to the body caption. `negative` is
     refused there (the body caption sits in front of the chest).
   - `--negative-heroes N` turns up to N heroes into inverted keyword captions (white, heavy, caps,
     no background) behind the head. Only heroes already behind the head, on a background far from
     mid-grey (|luminance - 128| >= 60), and never two in a row. The report marks them `negative`.
   It tracks the face once (`data/track-main.json`), splits speech into beats, writes the face-cue
   camera, picks heroes and their tone, and writes `beat-sheet.md`. READ its report:
   - events and levels (1.0 / 1.3 / 1.6, plus reach-fixed values);
   - **reach**: base/punch speech frames where the clamp keeps the face off its target; the planner
     raises a segment's zoom up to +0.2 to help. A high share means the source has little room.
   - **upscale**: z x max(W/srcW, H/srcH). Above about 3x the punch looks soft: lower `--max-punch`.
   - heroes: word, look, tone, behind or in front.
   Mode (a)/(c): show the beat sheet and wait for the OK here.
4. **Build**: `node tools/rcg.mjs marketing-pro build --job jobs/<id>` (camera -> matte -> aligned PNP ->
   heroes -> captions -> layers -> bloom -> mix-check -> hf check). `commands` prints the steps only.
5. **Look and render** (video-job steps 7-8): snapshot the opening, every hero window, the punch and
   the end; READ them. Then `rcg render jobs/<id> --fps 30 --workers 3`, read the sheet and one
   full-resolution frame of a hero. Optionally measure the camera with the reference script
   (`references/camera-rules.md`, "Measuring").

## Reference looks (Video-54041: event promo, opt-in)

Read `references/reference-video-54041.md`. All options are off by default, so a plain plan
builds exactly what it did before.

1. **Room for an opener or closer:** prep pads the clip (the first and last frame held) and the
   voice (silence). The words move with it.
   ```
   node tools/rcg.mjs marketing-pro prep --job jobs/<id> --src assets/<clip> --trim --intro 3.8 --outro 1.8
   ```
2. **Assets:** only from the approved sources, and ask before each download
   (`rcg assets search` / `fetch`, the Unsplash connector). Credits go only in `data/credits.json`
   and `report.md`, never on screen.
   - Fill textures: gold, a pink or purple texture, a photo for names and places.
   - A photo for each card.
   - A vertical light-leak clip for the closer.
   - Music from the user.
3. **Plan:**
   ```
   node tools/rcg.mjs marketing-pro plan --job jobs/<id> --bloom 0 --fill-heroes \
     --fills gold=assets/img/<gold>.jpg,pink=assets/img/<pink>.jpg,photo=assets/img/<photo>.jpg \
     --clusters --cards "<word>:assets/img/<photo>.jpg" --whips 2 --music assets/music/<bed>.mp3 \
     --strips "assets/<a>.mp4@5:0.5,assets/<b>.mp4@2:0.42,..." --leak assets/video/<leak>.mp4
   ```
   - `--fill-heroes`: every look but strike becomes a filled word.
     - Scarcity words (limited, full, last...) get the red fill.
     - Action and value words (start, sign, link, join, best...) get the gold fill.
     - A capitalized name or place mid-sentence gets the photo fill.
     - Everything else gets the gradient fill, alternating with the pink image.
     - The same fill never appears twice in a row when another fits.
   - `--clusters`: each hero gets up to 3 lead words above and up to 3 tail words below, each coming
     in on its spoken time. Behind the head, a tail of 2 or more words splits left and right of the
     head. These words leave the body caption.
   - `--cards`: a card appears when the word is first spoken. It sits beside the head, below the
     hero band, behind the cut-out.
   - `--whips N`: mirror whips at sentence starts, 3 s apart, plus one at the end of the opener.
     A whip is skipped if it would cut a hero's main word to under 1 s, and the hero before a whip
     ends 0.2 s ahead of it. On a short clip few whips fit.
   - `--strips`: clip specs are `file@mediaStart:subjectX`, one strip per clip (5 in the
     reference). The opener uses the `--intro` room and the closer the `--outro` room.
   - `--music`: limited to -2.5 dBTP, looped when shorter than the edit, ducked under each
     sentence. A whoosh lands on each whip and a soft click on each opener strip.
4. **Build:** `marketing-pro build` adds the strips, whips, cards and the audio step
   (`marketing-pro audio`) to the usual steps. Snapshot the opener, every whip, every hero and the
   closer.

## Manual extras (not automatic)

Add these to `data/style-plan.json` after `plan`, then re-run `build` (it regenerates by id):

```json
{ "component": "tag", "id": "tag1", "start": 6.4, "duration": 1.6, "text": "Integrity", "x": 560, "y": 980, "side": "right" },
{ "component": "logo", "id": "logo1", "start": 8.0, "duration": 1.8, "src": "assets/logos/brand.png", "x": 600, "y": 900, "w": 300, "h": 110 },
{ "component": "cta", "id": "cta1", "start": 10.5, "duration": 1.7, "text": "Click the link in my bio" }
```

Logos only when the user supplies or approves them (record them in `frame.md`). The planner adds a
CTA by itself when the last beat says link / bio / follow / call / book.

## Boundaries

- Keep the words, order and meaning. `--trim` only removes dead air at the ends.
- Never zoom below 1.0 (edges). Never reveal more than the source holds.
- One hero per beat at most; skip weak beats; never the same look twice running.
- Hero words behind the head only when the matte is clean (READ `assets/matte/*-sheet.png`);
  `--behind false` puts them all in front.
- Contrast: tone comes from the sampled background; `hf check` measures every text node. Do not
  override the tone to white on a light wall.
- Negative text only behind the head (user rule): never `--negative` on the body caption or on a
  hero in front. Snapshot every negative hero; over a busy or mid-grey patch it reads weakly.
- Re-plan with the same `--bloom` the job was built with: a bloom left in index.html by an earlier
  build breaks hf check (`page_error ... reading 'style'`) when the new plan has none.
- No copying the reference's people, copy, logos or brand colours.

## Known gaps

- Reference Video-54041 parts not built yet: several speakers with a clip per sentence, a walking
  camera with no zoom ladder, and a "comment WORD" call to action as a big filled word.
- A pale fill (a pastel watercolour) reads weakly on a light wall. Prefer saturated textures there.

- Two people in frame: not built yet (the camera follows the one tracked face).
- A face that leaves the frame or walks to the lens: the track holds the last position; the reach
  report shows it. Trim or cut such moments.
- Noise reduction is a light FFT denoise: it cannot remove room echo (R11 floor -26 dBFS after +23 dB
  of gain, unchanged by stronger settings).
