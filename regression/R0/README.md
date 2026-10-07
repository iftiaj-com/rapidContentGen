# R0: mop-star rebuild (Phase 0 regression)

Rebuilds the approved MOP STAR trailer through the workspace workflow and checks that the
tools reproduce the hand-built result.

Steps:

1. `node tools/rcg.mjs new-job --name "R0 mop star rebuild" --video <video> --audio <song> --mode b`
2. `node tools/rcg.mjs limit assets/<song>.mp3 assets/song-limited.wav`
3. Stage SFX from `library/sfx/`, extract the freeze frame at 5.70 s.
4. Composition = `videos/mop-star-trailer/index.html` with job paths, lanes without `data-volume`.
5. `node tools/rcg.mjs mix-check <job>/index.html` must print MIX OK.
6. `node tools/rcg.mjs hf --cwd <job> check` must pass.
7. `node tools/rcg.mjs render <job> --fps 24 --workers 3 --silence 4.02-4.18` must print RENDER OK.
8. PSNR against the reference render must stay above 50 dB.

Pass criteria and the last run's numbers are in `expected.json`.
