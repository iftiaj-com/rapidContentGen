# R11: Marketing Pro (promo talking-head from a raw phone clip)

`jobs/2026-10-08-r11-marketing-pro`, 12.27 s, 30 fps, mode (b). Source: the user's raw clip
`WhatsApp Video 2026-10-08 at 19.27.12.mp4` (478x850, VFR 29.3 fps, -36.6 LUFS, one person). Style
learned from the user's reference ad Video-2306 (measured with `tools/media/camera_motion.py`).

## Steps

1. `rcg new-job --name r11-marketing-pro --video <clip> --mode b`
2. `rcg marketing-pro prep --job $J --src assets/<clip> --trim`: 1080x1920 CFR 30 (upscaled), voice
   -36.6 -> -14.9 LUFS / -3.6 dBTP, trim 2.02-14.28 s. Transcript kept exactly as heard (user's choice).
3. `rcg marketing-pro plan --job $J --bloom 1`: 4 beats, 5 events (1 punch), 11 face cues, heroes
   "work" (serif-caps), "engineer" (wide), "system" (serif-caps), all dark text behind the head;
   captions mp-body at y 1075; one bloom at 6.23 s.
4. `rcg marketing-pro build --job $J` (camera, matte, pnp, style build, captions, layers, bloom,
   mix-check, hf check), then `rcg render $J --fps 30 --workers 3`.

## Checks

- No regressions: the 30 original caption outputs are byte-identical; R9b rebuilds byte-identical.
- Plan: reach fix raised two segments (1.3 -> 1.5 at 0.1 s: off-target 72% -> 61%, the source has him
  walking in at the frame edge; 1.3 -> 1.4 at 3.78 s: 38% -> 7%). Upscale 2.26 / 2.94 / 3.62x
  (reported; the punch was kept at 1.6 to test the ladder).
- hf check passes, 7/7 text nodes at WCAG AA. MIX OK (-14.2 LUFS, -2.8 dBTP).
- Render: 11/11 verify (1080x1920, 30 fps, 12.267 s, -14.2 LUFS, -2.7 dBTP).
- Camera measured on the render (`data/camera-measured.json`): eased events 1.0 -> 1.5 (measured about
  1.43), x0.71 at 1.6 s and x1.24 at 3.8 s over 0.27 s, the punch x1.09 at 6.27 s (bloom frames count
  as cuts). Drift between events is dominated by the source's own handheld motion and the subject
  walking, so it cannot be checked against the plan on this clip.
- Read by eye: the frame sheet and snapshots (hair over "WORK" / "ENGINEER" / "SYSTEM", wide at 2-3 s,
  tight from 3.9 s, the bloom at 6.3 s, two-tier captions on the clauses).

## Open

- Faces in the render are 0.17-0.20 of the frame height (the reference: 0.09-0.15): the source is
  already framed close and the 1.3 base adds to it. A framing-aware base (aim for a face height
  rather than a fixed zoom) would match the reference better; the user chose the fixed ladder.
- Two people in frame: not built (camera-rules.md, later phase).

## R11b: caption text controls and a negative hero (2026-10-09)

`jobs/2026-10-09-r11b-mp-caption-fx`: a copy of the R11 job (renders and snapshots left out),
re-planned and rebuilt in place:

```
rcg marketing-pro plan --job $J --bloom 1 --negative-heroes 1 --caption-fx shadow --caption-shadow-angle 90 --caption-shadow-dist 6
rcg marketing-pro build --job $J
```

- Heroes: "work" (serif-caps, bg 197) and "engineer" (wide, bg 187) as before; "system" (bg 208,
  the brightest) became the negative hero: `rcg captions --negative --behind p1`, Inter 900 caps,
  8.71-11.41 s. It inverts the light wall to near-black (32-48 of 255 measured in the render).
- Body caption: `mp-body` with `--shadow` at 90°/6 px. On the black shirt the shadow does not show,
  as expected (use it on pale or busy chests).
- hf check passed; render 1080x1920, 30 fps, 12.267 s, 11/11 verify, -14.2 LUFS, -2.7 dBTP.
- Found on the way: re-planning an R11 copy without `--bloom 1` left the old bloom script in
  index.html, pointing at a wrapper the PNP rebuild removes (`page_error ... reading 'style'`).
  Fixed: build now runs `rcg transition --remove bloom<n>` first for every bloom in index.html
  that the plan dropped, which also unwraps `w1-tx`/`p1-wrap-tx` when no other block uses them.
  Checked on a copy: re-plan without `--bloom`, build, hf check passed with no `rcg:tx` left; re-plan
  with `--bloom 1` gave the same build commands as R11 and, after build, the same index.html.
