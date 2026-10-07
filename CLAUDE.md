# rapidContentGen

An AI video-editing workspace. The user drops a video (or several) plus a prompt,
in chat or in `inbox/`, and the agent turns it into a finished motion-graphics
edit. HyperFrames (HTML + GSAP, rendered headless) is the render core. Features
from the user's other apps (Adits, AditsShaders, AditsStudio, flowEditor, the TTS
app) are **copied or ported in** and logged in `docs/PROVENANCE.md`.

**For any editing request, follow the `video-job` skill** (`.claude/skills/video-job/SKILL.md`).
It holds the full workflow: intake, mode, beat sheet, audio, build, render, verify, report.

## Critical rules

- **Never edit the source projects** (`Adits_Modular`, `AditsShaders`, `AditsStudio`,
  `flowEditor`, `tts_app modular`). Read them only. To bring something in, use
  `node tools/rcg.mjs provenance copy|record ...` so it is logged.
- **No hardcoded absolute paths in committed code.** Every path and binary comes from
  `tools/lib/config.mjs` (`config/workspace.json` + git-ignored `config/workspace.local.json`).
- **No frameworks, no build step.** Tools are Node ES modules; the voice tools are Python 3.11.
  Do not add React/Vue/Svelte, a bundler, or a CSS framework.
- **Only edit what the request needs.** No incidental refactors.
- **Ask before each install or download** (pip packages, model weights, fonts, CLI tools).
- **Look at the artifact, not the exit code.** Every render goes through `rcg render`
  (which verifies) and you read the frame sheet before reporting.
- **Never publish or post anything.** Rendering is local; posting is the user's step.

## Environment

- Windows 11. Use the Bash tool (Git Bash) for pipes; PowerShell 5.1 pipes add a UTF-8 BOM
  that breaks JSON. Write JSON from Node or Python, never through PowerShell redirection.
- `python` is 3.13. Never call `python3` (broken Store alias). The voice venv is Python 3.11.
- Git Bash `/tmp` is not the same folder Windows Python sees. Use Windows paths or the
  session scratchpad.
- ffmpeg/ffprobe 8.1 are on PATH. `drawtext` needs an explicit `fontfile` (fontconfig is not
  set up); `tools/lib/ffmpeg.mjs` handles this via `fonts.label` in config.
- HyperFrames runs through the plugin launcher: `node tools/rcg.mjs hf --cwd <job> <args>`.
  Its usage command returns "unknown" here; telemetry is disabled.

## Commands

```
node tools/rcg.mjs                      # list commands
node tools/rcg.mjs doctor               # health check
node tools/rcg.mjs new-job --name x --video a.mp4 [--audio m.mp3] [--prompt-file p.md] [--mode a|b|c]
node tools/rcg.mjs beat-sheet md jobs/<id>/beat-sheet.json jobs/<id>/beat-sheet.md
node tools/rcg.mjs limit in.mp3 out.wav [--ceiling -2.5]
node tools/rcg.mjs mix-check jobs/<id>/index.html
node tools/rcg.mjs hf --cwd jobs/<id> check
node tools/rcg.mjs render jobs/<id> --fps 24 [--workers 3] [--silence a-b]
node tools/rcg.mjs verify file.mp4 --width 1080 --height 1920 --fps 24 --duration 16.88 --sheet s.png
node tools/rcg.mjs provenance check
```

## Layout

- `tools/`: CLIs (`rcg.mjs` is the entry point). `lib/` has config, ffmpeg, provenance.
- `library/`: reusable pieces: `sfx/` (measured manifest), `recipes/` (grades),
  `runtime/`, `blocks/`, `shaders/` (filled phase by phase).
- `templates/`: HyperFrames project templates (`vertical-1080x1920`).
- `jobs/<date>-<slug>/`: one HyperFrames project per job, with `JOB.md`, `beat-sheet.*`,
  `data/`, `renders/`, `report.md`.
- `inbox/`: where the user drops media + `prompt.md`.
- `regression/`: regression job specs per phase.
- `docs/`: `capabilities.md` (what exists and how to call it), `PORTING_CHECKLIST.md`,
  `PROVENANCE.md`, `job-spec.md`.
- `videos/mop-star-trailer/`: the original hand-built job, kept as reference.

## Known pitfalls (each one cost a re-render before)

See `.claude/skills/video-job/references/lessons.md`. The short list:
1. A `data-automation` volume lane sets ABSOLUTE levels and overrides `data-volume`.
2. Music files often peak above 0 dBFS. Limit to -2.5 dBTP first (`rcg limit`).
3. If HyperFrames logs "Audio lowered by X dB", the whole mix was turned down. `rcg mix-check`
   predicts this within about 0.3 dB before rendering; `rcg render` refuses to render a failing mix.
4. Place SFX by the measured crest in `library/sfx/manifest.json`, never by description text.
5. Slowing 24 fps footage below 1x stutters. Use a freeze frame or interpolation.
6. Text cards must be flat (spans directly inside the `.clip`); animate spans, never the clip.
7. Keep text out of the bottom 20% and the right 180 px on 9:16 (app buttons).
8. ffmpeg `-ac 1` downmix reads up to +3 dB hot; level tools average channels instead.
