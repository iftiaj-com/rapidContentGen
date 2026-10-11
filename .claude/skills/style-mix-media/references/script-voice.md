# Script and voice

## Writing the script

- First person for diary and personal stories; second person for hooks and tutorials.
- Conversational, like writing in a journal out loud. Short sentences. Room to breathe.
- Hook (first line, under 3 s): a curiosity line. Build: the story in small concrete details.
  Turn: a feeling changes. Close: one line that stays.
- 30-60 s; budget about 3 words a second of finished video (the test: 86 words, 32.7 s).
- Fit the story to the footage: list what the person does on camera (call, laugh, read, smile) and
  let the lines use those moments. Never claim the person said or did what the clip contradicts.
- Content modes from the guide: origin / personal, tutorial / process, product showcase,
  relatable / trend, brand collaboration. Facts are true or framed as personal; no invented stats.
- The user's script is kept word for word. A change (a word the voice cannot say) is a question.

## Voice

| Engine | Call | Notes |
|---|---|---|
| MeloTTS | `rcg voice say --engine melo [--voice EN-US]` | speakers EN-US, EN-BR, EN_INDIA, EN-AU, EN-Default; runs in `bin.meloPython` (a Python with `melotts`, torch and the cached weights; this machine: AditsVoiceStudio's `venv_311`), offline only; the model loads in 80-150 s, all Melo lines in one process |
| Kokoro (default) | `rcg voice say [--voice af_heart]` | 54 voices, in the voice venv |

- Pace: the user's default is Kokoro at `--speed 1.3 --skip-silences` (about 3.6 words a second).
  Melo at `--speed 1.0` already speaks about 3.5 words a second, so keep Melo at 1.0 with
  `--skip-silences`; pauses between lines come from `place-voice` gaps.
- Melo samples randomly: each run is a new take. Check every line with Whisper:
  `tools/voice/.venv/Scripts/python.exe -I tools/voice/voice_cli.py transcribe <line.wav> --out heard.json`
  and read the words. Digits for spoken numbers ("40" for "forty") are fine; a wrong word is not.
- Test findings: "laughed" came out as "left" in three takes (rephrased: "cracked up");
  "forty unread emails" was heard as "unready meals" (rephrased: "forty emails, unread");
  "I almost..." lost its first word once (a new take fixed it).
- To swap in a better take, copy its wav, srt and `audio_meta.json` entry under the line's id, and
  update `data/vo-lines.json` to the words actually spoken.
