# R1: voiceover + captions (Phase 1 regression)

Four voiceover lines (Kokoro af_heart and am_michael) over the dance clip with a ducked music
bed, one caption style per line: tiktok (word), karaoke (phrase, active-word highlight),
kinetic (seeded scatter), neon (2-word). Warm grade on footage visible from t = 0, which also
exercises the hardware-GPU workaround in `tools/jobs/hf.mjs`.

1. `rcg new-job --name "R1 voice captions" --video <dance> --audio <song> --mode b`
2. `rcg voice say --lines data/vo-lines.json --out-dir assets/voice` (alignment must be >= 0.8)
3. `rcg level --dir assets/voice --lufs -13.5 --ceiling -1.5`; `rcg limit <song> assets/song-limited.wav`
4. Voices at 0.4 / 3.1 / 6.3 / 9.5 s with real `data-duration`; music lane ducked to 0.324 under speech.
5. `rcg captions ... --insert` for each line (see `expected.json` for styles).
6. `rcg mix-check index.html` must print MIX OK; `rcg hf --cwd <job> check` must pass.
7. `rcg render <job> --fps 24 --workers 3` must print RENDER OK.

Found and fixed while building R1 (see lessons 13a-13h): GPU stall with graded footage at t=0,
mono voices playing 3 dB hotter than measured, zero-width measurement in hidden slots,
overlapping word groups, a comment-swallowed video element, a quoting bug in generated scripts.
