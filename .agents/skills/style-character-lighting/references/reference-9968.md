# Reference: Video-9968 (measured 2026-10-11)

The user's reference Short: "When you light a character, you decide who they are." It was studied for
technique only. Nothing from it (the 3D head, the voice, the words, the diagram artwork) is copied
into a job.

## The file

- 720 x 1280, 30 fps, 22.1 s, AAC stereo 44.1 kHz. Mean volume -17.5 dB, max -0.3 dB (ffmpeg
  volumedetect). Only the voice was checked: the transcript was read, but whether a music bed sits
  under it was not.
- Measured with: a 1 fps contact sheet, full-resolution frames at each setup, per-frame brightness of
  the top half (to find the light changes), a Whisper transcript with word times
  (`rcg voice transcribe`), and pixel samples for the caption colour and the layout.

## Layout (fractions of the frame height, so they scale to 1080 x 1920)

| Region | Reference (of 1280) | Here (1080 x 1920) |
|---|---|---|
| Character box | 0 to about 51% | `relight rect 0,0,1080,960` (50%), framed on the face with `zoom` |
| Caption | centre at 49%, on the seam, overlapping the bottom of the character box | `cl-seam --y 950` |
| Light plot card | 52.5% to 92% high, 3% to 96.5% wide (rows 672-1177, cols 24-695) | `light-plot y 1270, w 836, h 500` (1020-1520) |
| Ground | about rgb(20, 22, 22), not pure black | token `ground` #141616 |

The reference card runs down to 92% of the height and nearly edge to edge. That would sit under the
app UI (bottom 20%, right 180 px), so here the card is kept inside the safe area. That is a deliberate
change.

## The character

A neutral, featureless 3D head with the same pose, expression and framing in every setup. **Hold
everything else still:** that is why the comparison works, since the light is the only change.

To do the same with real footage:

- Use a calm, neutral stretch of the clip, or freeze one frame as a clip:
  ```
  ffmpeg -ss <t> -i assets/<clip> -frames:v 1 assets/still.png
  ffmpeg -loop 1 -i assets/still.png -t <seconds> -r 30 -pix_fmt yuv420p assets/hold.mp4
  ```
  Then `rcg track` and `rcg matte` on `assets/hold.mp4`, and every `relight` uses `src: "assets/hold.mp4"`
  (or the track's src) with `mediaStart: 0`.
- A talking clip also works (the test job does it). The character then moves between setups, which
  reads as a story more than a comparison.

## Timing (word times from the transcript; light changes from brightness jumps)

| Setup | Cue phrase starts | Light changes | Offset | Verdict word | Held |
|---|---|---|---|---|---|
| Front | "Light him like this," 3.74 | 4.07 | +0.33 | "innocent" 5.18 | 2.06 s |
| Split | "Like this," 6.00 | 6.13 | +0.13 | "hiding something" 7.46 | 2.67 s |
| Under | "From below," 8.82 | 8.80 | -0.02 | "dangerous" 10.00 | 2.40 s |
| Top | "From above," 11.14 | 11.20 | +0.06 | "can't read his eyes" 12.26 | 2.57 s |
| Blue back | "Backlit in blue," 13.66 | 13.77 | +0.11 | "cold" 15.40 | 2.63 s |
| Three-point | "And like this..." 16.32 | 16.40 | +0.08 | "the hero" 17.98 | 5.7 s, to the end |

- Every change is a **hard cut** of the light, and the plot changes on the same frame. In the plot,
  the light icons are re-placed by a cut. Here, `light-plot from=` slides them in 0.45 s, which reads
  better on a phone. For something closer to the cut, leave `from` out and set `enter: false`: the card
  stays and the new lights pop in over 0.32 s.
- **Opener (0-1.5 s):** the light flips between setups every 0.23-0.27 s (brightness jumps at 0.27,
  0.50, 0.77, 1.00, 1.27, 1.50 s), under "When you light a character,". Then a dark, cold look holds
  under "you decide who they are."
- **Rhythm per line:** cue phrase, then a pause of 0.6-0.9 s, then the verdict ("...he's cold."). The light
  is already changed when the verdict lands, so the audience sees it first and hears the meaning second.

## Script pattern

51 words in about 21 s (about 2.4 words a second), calm narration:

1. Premise (over the opener flicker): "When you light a character, you decide who they are."
2. One line per setup: `[how it's lit], [he's / she's / they're + the read].`
   Keep the lighting phrase short (2-4 words) and the read to one word or a short phrase.
3. The last setup is the hero, held longest.
4. The payoff: "And that's the power of lighting."

Write new lines in this pattern for the user's own subject. Never reuse the reference's sentences
word for word unless the user asks for that.

## Captions

A short phrase (one line, 2-5 words) in a bold rounded sans. The colour samples at about
rgb(245, 224, 77). It sits on a dark rounded pill and changes with each phrase, with no pop. In rcg:
`--style cl-seam --mode phrase`.

## Light plot (the diagram)

Top-down on a white card with a faint grid. The room has grey walls on three sides and a beige
backdrop strip at the back. The head marker is a dark circle with a white triangle facing the camera.
The camera (black body, blue lens) is at the bottom, with a pale blue view cone. Lights are black
fixture icons (a softbox as a trapezoid with a white face, a small spot as a square) with faint beams.
For lights under or over the head, the icon sits on the head. `light-plot` draws the same grammar,
with role labels the reference does not have (KEY, FILL, BACK). Turn them off with `labels: false`.
