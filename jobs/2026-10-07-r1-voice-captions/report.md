# Report: R1 voice + captions

- **Render:** `renders/final.mp4`, 1080x1920, 24 fps, 12.83 s (root 12.8 s), H.264 + AAC stereo.
- **Audio:** -14.5 LUFS, -2.6 dBTP, no whole-mix gain reduction. Mix-check predicted -14.4 / -2.6.
- **Voice:** 4 Kokoro lines (af_heart, am_michael), word alignment 100% on all four, leveled to
  -13.5 LUFS (as heard). Music ducked to 0.324 under speech, 0.72-0.78 in gaps.
- **Captions:** tiktok (word), karaoke (phrase, active word), kinetic (seeded scatter, safe-box
  clamped), neon (2-word). HyperFrames check: 0 layout issues, 9/9 contrast AA.
- **Render time:** 2 min 15 s on the hardware GPU (load limit raised to 180 s automatically).
- **Known limits:** 2-word mode can still pair a word with a trailing "a" ("became a"); the
  small-word rule applies to phrase mode only. The agent cannot listen; the mix was judged by
  measurement.
