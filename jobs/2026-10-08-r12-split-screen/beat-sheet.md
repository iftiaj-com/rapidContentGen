# Beat sheet: Split screen: 2026-10-08-r12-split-screen

1080x1920 @ 30 fps, 12.26 s

Split-screen edit: presenter assets/WhatsApp_Video_2026-10-08_at_19.27.12.mp4, info assets/b1-prep.mp4, assets/b2-prep.mp4, assets/b3-prep.mp4, assets/b4-prep.mp4. 3 layout windows (split 0.51, b-full 0.22, a-full 0.27).

| # | Time | Spoken words | What appears on screen | Where the text sits | Sound |
|---|---|---|---|---|---|
| 1 | 0:00.00 to 0:06.23 | Hi, this is a V and this is what you get to work with me and I am a software engineer, | SPLIT (hook (always split); explaining). B: b1-prep#1@0, b3-prep#1@0, b4-prep#1@0. Presenter crop 1x, face 244px, out 0.037.. **"captions (split-seam)"** at 0.00 | custom box {"x":64,"y":1196,"w":836,"h":80} | voice |
| 2 | 0:06.23 to 0:08.98 | so I can do whatever I want and I have really this system | B-FULL (opener "so I" (demoted: a-full share); rhythm (split ran 5.62 s)). B: b2-prep#1@0 band.. **"captions (split-pill)"** at 6.23 | custom box {"x":64,"y":1250,"w":836,"h":80} | voice |
| 3 | 0:08.98 to 0:12.26 | to use this system. | A-FULL (closing line). Titles: "to / use this system" (italic).. **"use this system"** at 9.03 | custom box {"x":102,"y":951,"w":760,"h":300} | voice + whoosh (light leak) |

**Notes**

- Words from data/words.json (correct them before building).
- Presenter background luma 170: darkened through a cut-out.
- No hook title: the first line has no strong key word (best score 0.58). Add one to data/style-plan.json by hand if wanted.
- bfull share 0.22 is outside the soft target 0.25-0.35 (fine for a short clip; check the rhythm).
- afull share 0.27 is outside the soft target 0.15-0.25 (fine for a short clip; check the rhythm).
