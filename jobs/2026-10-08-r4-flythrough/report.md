# Report: R4 flowEditor flythrough

- **Render:** `renders/final.mp4`, 1080x1920, 24 fps, 13.72 s, rendered in 40 s; all 11 verify checks pass.
- **Audio:** -15.8 LUFS, -1.3 dBTP, no whole-mix gain reduction (mix-check predicted -15.7 LUFS, -2.5 dBTP).
- **Build:** `rcg flythrough` from `data/flythrough.json`: 8 cards on the star layout, board motion,
  arrivals snapped to downbeats (landings 0.51, 2.39, 4.20, 5.87, 7.54, 9.31, 10.96, 12.72 s; at most
  6 ms off the grid). Four whooshes land their crest on the arrival; the music ducks to 0.5 under them.
- **Frame sheet:** every card lands centred at its zoom with rounded corners; the 16:9 and 1:1 cards
  are cover-cropped from portrait stills; the Ken Burns card grows during its dwell; both video cards play.
- **Deviation:** the first render used flowEditor's duck level (0.25) and measured -16.1 LUFS, outside
  -14 ±2. `"duck": 0.5` (a new option) brought it to -15.8.
- **Determinism:** repeat snapshots identical; reverse-order seeks identical except 1.9 s (75 dB PSNR).
