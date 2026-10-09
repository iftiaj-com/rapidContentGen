# Setup

How to get a fresh clone of rapidContentGen ready to make videos. It has only been set up and
tested on Windows 11.

## What the clone has, and what it does not

The clone (about 16 MB) has the tools (`tools/rcg.mjs`), the library (shaders, effects, style
packs, recipes, the SFX library), the template, the docs and the Claude Code skills.

These are git-ignored and do not come with it:

| Missing | Size | Needed for |
|---|---|---|
| `config/workspace.local.json` | small | paths on your machine |
| `tools/bin/` (a good ffmpeg) | about 420 MB | clean renders (see step 3) |
| `tools/voice/.venv` | about 750 MB | voiceover and word timings |
| `models/` (Kokoro, MediaPipe) | about 380 MB | voiceover, face and hand tracking, background removal |
| `jobs/` | yours | each video you make (created for you) |

The project is driven by Claude Code: you drop a video and a prompt, and the agent follows the
`video-job` skill. You can also run every `rcg` command by hand.

## Check where you are

Run this first, and again after each step:

```bash
node tools/rcg.mjs doctor
```

- `OK`: ready.
- `FAIL`: required. Fix these before rendering.
- `TODO`: optional. Only the features that need it will not work.

## Required

### 1. Node.js

Node 22 is what the project runs on. Older versions have not been tested.

### 2. Claude Code with the HyperFrames plugin

HyperFrames renders every video. Install the plugin in Claude Code:

```
/plugin marketplace add heygen-com/hyperframes
/plugin install hyperframes@hyperframes
```

`doctor` finds it on its own under `~/.claude/plugins/cache/hyperframes/hyperframes/<version>`.
If it lives somewhere else, set `hyperframes.pluginRoot` in the local config (step 4).

### 3. ffmpeg, plus an ffmpeg for HyperFrames

- Put `ffmpeg` and `ffprobe` on PATH. 8.1 works for the tools.
- HyperFrames needs a build without the edge bug: ffmpeg 8.1 (gyan.dev) turns the right 8 px
  of every 1080-wide render black (lesson 16b in `.claude/skills/video-job/references/lessons.md`).
  The gyan.dev release "essentials" build 9.0.2 is fine. Unzip it into `tools/bin/` and point the
  config at it (step 4, `bin.hfFfmpeg` and `bin.hfFfprobe`).

`doctor` runs an edge test on that binary, and `rcg verify` fails any render with the strip.

### 4. Local config

```bash
cp config/workspace.local.example.json config/workspace.local.json
```

Edit it. Remove the keys you do not need. A typical file:

```json
{
  "bin": {
    "hfFfmpeg": "C:/path/to/rapidContentGen/tools/bin/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe",
    "hfFfprobe": "C:/path/to/rapidContentGen/tools/bin/ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe",
    "python311": "C:/Users/<you>/AppData/Local/Programs/Python/Python311/python.exe"
  },
  "fonts": { "label": "C:/Windows/Fonts/arial.ttf" },
  "sources": {}
}
```

- Use absolute paths for everything under `bin` and `fonts`. They are not resolved from the repo
  root, and HyperFrames runs from inside each job folder, so a relative ffmpeg path breaks there.
  (Entries under `paths` may be relative.)
- `sources` lists the projects features were copied from (Adits, AditsShaders, the TTS app and
  others). Leave it empty unless you have them: it is only needed to copy more features in.
- `keys.pixabay` (optional): a free Pixabay API key for `rcg assets`.
- Write JSON with an editor, Node or Python, not PowerShell redirection: PowerShell 5.1 adds a
  byte-order mark that breaks the file.

## Optional, by feature

### Voiceover and word timings (`rcg voice`, `rcg captions` from a script)

Needs Python 3.11 (not 3.13), the venv, the Kokoro weights and a Whisper model.

```bash
py -3.11 -m venv tools/voice/.venv
tools/voice/.venv/Scripts/python.exe -m pip install -r tools/voice/requirements.txt
```

Kokoro weights go in `models/`:

- `models/kokoro-v1.0.onnx`
- `models/voices.bin`

The originals were copied from the TTS app (`tts_app modular`). If you do not have it, the
public source is the kokoro-onnx project's release files (`kokoro-v1.0.onnx` and
`voices-v1.0.bin`, renamed to `voices.bin`). These have not been checked against the hashes in
`docs/provenance.json`; if they differ, `doctor` reports "edited after copy".

Word timings use the faster-whisper `base` model. The tool never downloads it by itself. Fetch it
once (about 145 MB, from Hugging Face):

```bash
tools/voice/.venv/Scripts/python.exe -c "from faster_whisper import WhisperModel; WhisperModel('base')"
```

Then test:

```bash
node tools/rcg.mjs voice selftest
```

### Face and hand tracking, background removal (`rcg track`, `rcg matte`, `rcg pnp`)

Needs the MediaPipe files in `models/mediapipe/`:

```
models/mediapipe/wasm/   vision_bundle.mjs, vision_wasm_internal.js/.wasm, vision_wasm_nosimd_internal.js/.wasm
models/mediapipe/models/ face_landmarker.task, hand_landmarker.task, selfie_segmenter.tflite
                         magic_touch.tflite, efficientdet_lite0.tflite   (these two: rcg layers)
```

They were copied from Adits (`Adits/core/lib/mediapipe-wasm/` and `mediapipe-models/`). With
Adits in `sources`, copy them with `node tools/rcg.mjs provenance copy ...` (see
`docs/PROVENANCE.md` for each path). Without Adits, the same files come from Google's MediaPipe
Tasks Vision release; versions other than the ones Adits ships have not been tested here.

### Depth layers for parallax (`rcg layers`)

A Python with OpenCV, Pillow and numpy (3.13 is fine). Set `bin.imagePython` if it is not
`python` on PATH.

```bash
python -m pip install opencv-python pillow numpy
```

### Footage effects (`rcg fx`)

Google Chrome, installed normally. The WebGPU effects (Heat Haze, Blow Pixels, Global Visuals)
need the real Chrome, not the headless shell. Set `bin.fxChrome` if Chrome is somewhere unusual.

### Contact sheet timestamps

`fonts.label`: any `.ttf` file. ffmpeg's `drawtext` needs an explicit font file here.

## Make a video

1. Put your clip and a `prompt.md` in `inbox/<name>/` (see `inbox/README.md`), or attach them in
   chat.
2. Ask Claude Code: "new job from inbox/<name>".
3. The agent creates `jobs/<date>-<name>/`, plans, builds, renders with `rcg render` and checks the
   result. The finished video is in `jobs/<id>/renders/`.

To start a similar video from one you made before:

```bash
node tools/rcg.mjs new-job --name my-next-reel --like jobs/<old-id> --video new-clip.mp4
```

## Notes

- Run `python`, never `python3`: on Windows, `python3` is a broken Microsoft Store alias.
- Line endings are frozen (`.gitattributes`). Do not change `core.autocrlf` handling: the
  provenance hashes depend on exact bytes.
- `doctor` lists missing git-ignored copies (models) as one `TODO` row;
  `node tools/rcg.mjs provenance check` names each file.
- "source drift" in `doctor` means a source project changed after a file was copied. It is
  information, not an error, and it only shows if you have the source projects.
