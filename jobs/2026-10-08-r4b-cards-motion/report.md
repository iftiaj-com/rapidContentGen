# Report: R4b flowEditor cards motion

- **Render:** `renders/final.mp4`, 1080x1920, 24 fps, 8.7 s, rendered in 27 s; all 8 verify checks pass
  (no audio stream, by design).
- **Build:** 4 cards on the `right` layout, `cards` motion, kraft background: arc + fade (zoom 1.2),
  whip (zoom 1.4), Ken Burns video card + slide-down (zoom 1.1, media start 5 s), punch + pop (zoom 1.3).
- **Frame sheet:** each card flies in from the right and lands centred while the previous one travels
  home; the Ken Burns card drifts larger; the punch card overshoots past centre at 7.15 s
  (GSAP back.out(1.6) at 44 % = 104.8 %, 134 board units on a 2800-unit trip) and settles by 7.78 s.
- **Stack arrangement:** checked by snapshot in a scratch copy (board motion, left-right): one card at a
  time, the board empty mid-whip.
