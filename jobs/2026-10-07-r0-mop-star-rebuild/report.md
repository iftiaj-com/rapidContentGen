# Report: R0 mop-star rebuild

- **Render:** `renders/final.mp4`, 1080x1920, 24 fps, 16.92 s (root 16.88 s; within 2 frames), H.264 + AAC stereo 48 kHz.
- **Audio:** -13.9 LUFS integrated, -1.3 dBTP true peak, no whole-mix gain reduction in the log, true silence 4.02-4.18 s.
- **Mix check before render:** predicted -13.9 LUFS / -1.3 dBTP / 0 dB reduction, matching the render exactly.
- **Picture:** frame sheet `renders/final-sheet.png` matches the beat sheet. PSNR against the original hand-built render: 72.4 dB average, 58.3 dB minimum (visually identical).
- **Render time:** 2 min 40 s with 3 workers.
- **Deviations:** none from the approved trailer. `data-volume` removed from clips that use volume lanes (the lane is what sets the level).
- **Not verified:** the agent cannot listen to audio; the mix was judged by measurement only.
