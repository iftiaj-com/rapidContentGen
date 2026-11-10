# Cloned voices

Voices for `rcg voice say --clone <slug>` that work without AditsVoiceStudio. Each one is a
Seed-VC "Quick" voice: a short clip of the real person, used as the reference for zero-shot
voice conversion. There is no trained model per voice.

```
library/voices/<slug>/
    profile.json    name, diffusion_steps, the Kokoro base voice and speed, consent
    reference.wav   the speaker's clip, at most 25 s (only the first 25 s is used)
```

The engine (Seed-VC code, its venv and about 1.8 GB of weights) is not in the repo. Set it up once
per machine: `SETUP.md`, section "Cloned voices".

## Consent

This repo is public. Anyone who clones it can make these voices say anything. Add a voice only when
the person in the clip has agreed to that, and write who agreed and when in `consent`.

## Adding a voice

1. A clean clip of one speaker, no music, 10-25 s, saved as `reference.wav`.
   A voice made in AditsVoiceStudio (Quick mode) can be brought in with
   `node tools/rcg.mjs provenance copy --source aditsVoiceStudio --from vc_runtime_data/voices/<slug>/reference.wav --to library/voices/<slug>/reference.wav`.
2. `profile.json`, as in `ifty/profile.json`. `base` is the Kokoro voice the text is spoken in
   before conversion; it is used when the line sets no voice or speed of its own.
3. Test: `node tools/rcg.mjs voice say --text "..." --clone <slug> --out-dir <dir>`, then listen.
