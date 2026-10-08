# Report: Script 1L, split screen with collage info-graphics

Render: `renders/final.mp4` (sheet `renders/final-sheet.png`, seam check `renders/seam.png`).

## What was built

- Your clip (`Script 1L_FINAL.mp4`, 1920x1080, 94.7 s; trimmed of dead air to 78.233 s) as the
  presenter. The voice is the master track (-14.5 LUFS after prep).
- 16 layout windows: split 25% (graphics top, you bottom, face-safe static crop), full-frame
  graphics 67%, full-frame presenter 8%. You are on camera in the source for about 31 of the 78 s;
  the rest of your file is stock B-roll and title cards, so those stretches are full-frame graphics
  (your decision). No stock footage from your edit is reused.
- The graphics: a separate job, `jobs/2026-10-08-script-1l-graphics`, 58 parts in the paper collage
  look (tactile-collage cards, stamps, tags, tape, routes, a taped photo; info-collage counters,
  equations, a salary gauge, icons, word-timed type), every entrance on a spoken word. Rendered once
  and played in step with your voice (split-screen sync mode).
- Collage captions (Courier cards): one-line 2-word cards on the seam, phrase cards over full-frame
  graphics. Collage titles on the full-frame presenter moments.
- Your burned-in captions are covered by a torn paper strip at the bottom of the presenter shots.

## Measured

1080x1920, 30.000 fps, 78.233 s, 33.8 MB; -14.5 LUFS, -2.0 dBTP, no gain reduction. Split check OK
(face inside the panel on every frame of the six split windows, worst overrun 1 px). hf check passed,
contrast 23/23 (graphics job 55/55).

## Content decisions

- **QBI 23%:** the final One Big Beautiful Bill Act kept the QBI deduction at 20% (23% was in an early
  House draft). Your voice says 23%; by your decision the screen shows no percentage (QBI <-> salary
  and the gauge only). Re-record that line if you want it corrected.
- **NYC 8.85%:** NYC does not recognize the S election and taxes S corporations under the General
  Corporation Tax; the 8.85% rate comes from a law firm summary, not checked on the city's own page.
- Transcript corrected against your burned-in captions (net profit, of profit, too high / too low,
  layer, structured); the raw ASR is in `data/words.asr.json`.

## Sources checked (2026-10-08)

- Warren Averett, "The One Big Beautiful Bill Breakdown: QBI Deduction" (warrenaverett.com)
- O'Melveny, "Key Tax Impacts of the One Big Beautiful Bill Act" (omm.com)
- NYC Business, "General Corporation Tax (GCT)" (nyc-business.nyc.gov)
- Farrell Fritz, "NYC: A Helluva Town, for S corps" (taxlawforchb.com)

## Fixed in the tools on the way

Sync mode, `--onscreen`, `--drop`, caption covers (`maskBelow`, `maskAfull`, `maskStyle: paper`), a
split-layout bug that blacked out every window but the last (lesson 13bq), counter decimals and
separators, the `range` gauge, the `↔` operator, the `info-collage` theme. Lessons 13bq, 13br.

## Open

- The music bed was not used (voice and the graphics' sound design only).
- I cannot listen: the mix was judged by measurement (MIX OK, 39 sounds).
- `jobs/2026-10-08-zz-video-test` is a 6 s debug job from the black-frame hunt; delete it if you like.
- Credits (not on screen): the NYC photo, Unsplash, dominik hofbauer, in the graphics job's
  `data/credits.json`.
