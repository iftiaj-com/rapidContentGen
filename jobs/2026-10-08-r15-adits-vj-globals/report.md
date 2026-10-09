# Report: R15 reel (Adits Global Visuals and four Video Jockey FX)

- **Render:** `renders/final.mp4`, 1080x1920, 24 fps, 15.0 s, rendered in 1 min 20 s; all 11 verify checks pass.
- **Audio:** -14.9 LUFS, -2.2 dBTP, no whole-mix gain reduction (mix-check predicted -14.7 / -2.5).
- **How it was built:** shots 1-11 are clips `rcg fx` rendered offline with the unmodified Adits
  VideoEngine, VJDeck and AudioEngine (shim `library/fx/shims/adits-post.js`); shot 12 is the plain R7
  clip with its PNP cut-out. Cinema Frames are `rcg cinema` blocks. Shot list: `regression/R15/README.md`.

| Time | Shot | Look in the render |
|---|---|---|
| 0-1.25 | BnW + Cinema UD | grey room, curved black letterbox bars |
| 1.25-2.5 | Fisheye 80% | the room bulges from the centre |
| 2.5-3.75 | Negative + Opacity 60% | inverted, dimmed toward black |
| 3.75-5 | RGB colors | the frame recoloured red / blue / green / yellow, stepping on the music |
| 5-6.25 | Neon + Cinema LR | a hue-cycling glow wash, dark purple pillarbox bars |
| 6.25-7.5 | Depth Scan, Pulse Scan | red dots sweeping through the luminance depth |
| 7.5-8.75 | Depth Scan, Ghost Edges over BnW | magenta edges crawling through the grey room |
| 8.75-10 | Subject Reveal | amber dots on the matted subject only, moving with the point |
| 10-11.25 | Lights, Cathedral | the lit dancer over a dark room, god rays streaming from her |
| 11.25-12.5 | Lightshow, Ignition | the room as burning orange contour bands |
| 12.5-13.75 | Beat Wash, Red Alert | a dark room flaring red on the kicks |
| 13.75-15 | Cinema Midground | black curved bars behind the woman, her head and skirt in front |

**Open points:**
- Neon Sweep, Lit Haze and other audio-position presets pin on this loud, limited song (lessons 13bt);
  Lit Laser (red lights only) and Depth Bloom suit other footage (13bu). All 26 sweep sheets are in
  `assets/fx/sweep/`.
- Parity with the live Adits app was judged from the code paths, the formula checks and the sheets, not
  by recording Adits side by side.
