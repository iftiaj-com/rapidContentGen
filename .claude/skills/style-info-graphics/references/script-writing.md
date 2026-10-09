# Writing the script (topic mode)

The script is the edit: every scene is a sentence. Write it first, read it as a viewer, then voice it.

## Length

- Voices are made at speed 1.3x with skip silences on (the default, user rule 2026-10-08). At those
  settings Kokoro `af_heart` spoke 3.6 words a second of speech (measured on the 25-word "Opus 5.5
  made this" v2 script; 3.26 at 1.05-1.22 without skipping). With a 0.25 s lead, gaps between lines
  and a closing tail, budget about 3 words a second of finished video: 10 s = 26-29 words,
  30 s = 85-95, 60 s = 175-190. These are estimates from one script; measure after voicing
  (`place-voice` prints where speech ends) and cut words if it runs long.
- The reference ran 2.75 words a second with a human narrator; this style now runs faster.

## Shape

1. **Hook (first 1-3 s):** a short line that states the turn or speaks to the viewer ("You don't
   hate X." / "One prompt."). No greeting, no title card.
2. **Claim:** what the video argues or shows, in plain words.
3. **Evidence:** two to five sentences, each one idea with one visual (history, a number, a
   comparison, a process).
4. **Turn:** "And then...", "Now...", "In other words..." marks a section; give it a ground change.
5. **Payoff:** a short last line that answers the hook. It can point at the video itself.

## Sentences

- One claim per sentence, 4-12 words. Short words. Active verbs.
- Put the key word last in its clause: it lands on the orange word and the scene's hit.
- Lists of three or four are good for `orbit`, `stairs` or `stack` (each item is a word anchor).
- Name things the viewer can picture; each noun is a candidate visual.

## Facts

- Every number, date, name and quote must come from a source you checked in this session. Put the
  source in `report.md`. If it cannot be checked, cut it or say it as opinion.
- No invented statistics, studies, quotes or "experts say". No attributing words to real people
  unless you have the exact source.
- Recent events: check before claiming, and give the date of the check.
- Self-referential topics (a video about how it was made) are safe when every claim describes this
  job and can be checked in its files (the script, the voice, the components, the render log).

## Script mode (the user wrote it)

- Keep every word. Split it into voice lines at sentence ends; long sentences can split at a
  comma or a conjunction.
- If it is much longer than the target length, or a fact looks wrong, ask before changing it.
- With a supplied voice recording: transcribe it (`rcg voice transcribe <file> --out words.json`),
  place it as one line, and anchor against its words the same way.
