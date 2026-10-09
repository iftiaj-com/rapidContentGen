# Source quality (phone and messenger footage)

R11's test clip (a WhatsApp video) shows the usual problems.

| Problem | R11 | What prep does | What stays |
|---|---|---|---|
| Low resolution | 478x850 | lanczos upscale to the output height, light `hqdn3d` + `unsharp` | no new detail: 2.26x at 1.0, 2.94x at 1.3, 3.62x at 1.6 |
| Variable frame rate | frame gaps 32-209 ms, avg 29.3 fps | `fps=30` (constant) | the source's dropped-frame hitches stay visible |
| Quiet audio | -36.6 LUFS, -18.4 dBTP | high-pass 70 Hz, `afftdn nr=12`, level to -14 LUFS / -3.6 dBTP (+23 dB) | room echo: the floor between words measured -26 dBFS at nr 0, 12 and 24 alike |
| Transcription errors | quiet audio misheard words | transcribe the LEVELED voice; correction gate before planning | names and jargon still need a human check |
| Walking in / to the lens | first 2 s and last second | `--trim` keeps 0.2 s before the first word | the reach report flags segments the clamp cannot centre |

## Decisions per job

- Punch softness: above about 3x effective upscale, consider `--max-punch 1.45` (R11 kept 1.6 to test
  the ladder; the report says so).
- Echoey rooms: say "judged by measurement" in the report; offer a re-record or a voiceover.
- A face high in a 9:16 frame: base 1.3 gives just enough room to bring it to y 0.37; the reach fix
  raises the zoom where needed.
