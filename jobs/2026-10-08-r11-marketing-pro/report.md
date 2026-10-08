# Report: 2026-10-08-r11-marketing-pro

R11 regression for the `marketing-pro` style pack and planner (regression/R11/README.md).

- Built: a promo reframe of the user's raw phone clip: 5 camera events on beat starts (1.0 / 1.3+ /
  one 1.6 punch with a bloom), drift between them, three hero keywords behind the head, two-tier
  captions, soft swipe sounds by crest.
- Render: `renders/final.mp4`, 1080x1920, 30 fps, 12.267 s, -14.2 LUFS, -2.7 dBTP. `rcg verify` 11/11.
- Deviations: --trim removed 2.0 s of walking in and the tail; the transcript was kept exactly as
  heard ("a V", "really this system"), as the user chose.
- Not verified: the audio was judged by measurement only; room echo remains (floor -26 dBFS).
- Source limits: 478x850 means 2.9x-3.6x upscale at base and punch (soft); the opening frames have
  him at the frame edge (walking in).
