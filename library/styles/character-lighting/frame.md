---
name: Character Lighting
styleAuthority: presentation
pack: library/styles/character-lighting
principle: light decides who the character is · one setup per beat · cut the light on the cue word
---

# Character Lighting: design specification

Written by `rcg style apply --style character-lighting`. The same character reads as innocent,
hiding something, dangerous, unreadable, cold or heroic depending only on where the light falls.
This job lights its character on purpose: every setup is chosen for what it says about the
character at that moment. Judgment and the setup catalogue: `.agents/skills/style-character-lighting/`.

## Tokens

```css
:root {
  --ground: #141616;     /* the dark around a lit character, and the stage outside the footage box */
  --key-warm: #ffcf96;   /* tungsten key: drama, warmth */
  --key-soft: #ffe9d2;   /* soft daylight key: front and loop light */
  --key-white: #fff6ea;  /* neutral hard key: top light, noir, butterfly */
  --under: #ffe2bd;      /* the light from below */
  --rim-blue: #3d7dff;   /* cold backlight */
  --rim-warm: #ffe0b0;   /* hero back light */
  --dual-warm: #ff7a3d;  /* colour contrast, warm side */
  --dual-cool: #2fb8ff;  /* colour contrast, cool side */
  --plot-card: #f7f6f2;  /* the light plot card */
  --plot-ink: #16181c;   /* plot labels */
  --plot-lens: #2f6bff;  /* the camera's lens on the plot */
  --tag-bg: rgba(10, 10, 12, 0.80);
  --tag-label: #f5e04d;  /* setup names, and the caption yellow */
  --caption: #f5e04d;    /* measured from the reference: about rgb(245, 224, 77) */
}
```

## Type

| Role | Face | Use |
|---|---|---|
| label | Inter 700, uppercase, tracked 0.12-0.16em | setup names, plot labels (KEY, FILL, BACK) |
| strong | Inter 800 | the meaning word on a mood tag (Secrecy) |
| captions | `cl-seam`: Inter 800, yellow on a dark rounded pill | one phrase at a time |

## Layouts

| Layout | When | Geometry (1080 x 1920) |
|---|---|---|
| Stage | lighting explainers, setup comparisons (the reference) | footage box `rect 0,0,1080,960` on `--ground`; captions on the seam (`--y 950`); light plot card `y 1270, w 836, h 500` |
| Full frame | a story relit beat by beat | relight on the whole frame; a mood tag at `y 300` at most once per setup change; normal caption lane |

## Rules

- One setup per beat. The light changes with the character, on the word that turns them.
- Cut the light (hard cut) on the cue word, as the reference does: 0.0-0.33 s after the cue word starts (median about 0.1 s).
  Fades are for a light switching on inside a shot, never for a setup change in an explainer.
- Every light has a reason: say which source motivates it (a window, a lamp, a screen, the moon).
- Keep the key on the same side through a scene unless the change is the point.
- Text: setup names on the plot and tags only; never credits.
