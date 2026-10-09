# rapidContentGen

An AI video-editing workspace. You drop a video (or several) and a short prompt. A coding agent
turns it into a finished motion-graphics edit: cuts, captions, titles, voiceover, camera moves,
shaders, 3D and beat-synced effects. Everything renders locally.

The render core is [HyperFrames](https://github.com/heygen-com/hyperframes) (HTML + GSAP, rendered
headless). Around it sits a set of Node and Python tools (`node tools/rcg.mjs ...`) and a set of
agent skills that tell the agent how to plan, build, render and check a video.

It has only been set up and tested on Windows 11.

## How it works

1. You put a clip and a `prompt.md` in `inbox/<name>/`, or attach them in chat.
2. You tell your agent: "new job from inbox/<name>".
3. The agent follows the `video-job` skill: intake, beat sheet, audio prep, build, render, verify,
   report. The finished video lands in `jobs/<date>-<name>/renders/`.

The project is set up for **Google Antigravity** and **Claude Code**. Every `rcg` command can also
be run by hand.

## Requirements

| Needed | Notes |
|---|---|
| Node.js 22 | Older versions have not been tested |
| ffmpeg and ffprobe on PATH | 8.1 works for the tools |
| A second ffmpeg for HyperFrames | 9.0.2 "essentials" build, unzipped into `tools/bin/`. ffmpeg 8.1 blanks the right edge of every 1080-wide render, so it cannot be used here |
| Internet, once | `npx` downloads the pinned HyperFrames version on first run, then caches it |

No HyperFrames account, login or API key is needed to render.

Optional, by feature: Python 3.11 (voiceover and word timings), MediaPipe files (face tracking,
background removal), Google Chrome (footage effects), a free Pixabay key (asset search).
`SETUP.md` covers each one.

## Setup

The full guide is in [SETUP.md](SETUP.md). The short version:

```bash
git clone https://github.com/iftiaj-com/rapidContentGen.git
cd rapidContentGen
```

Create the local config and point it at your binaries. Use absolute paths.

```bash
cp config/workspace.local.example.json config/workspace.local.json
```

Install the HyperFrames skills once per machine. In the picker choose **Core Skills** and select
every agent you use.

```bash
npx skills add heygen-com/hyperframes
```

Check the result, and run this again after each step:

```bash
node tools/rcg.mjs doctor
```

`OK` means ready. `FAIL` must be fixed before rendering. `TODO` is optional and only blocks the
feature it names.

Then open the repo root in your agent and start a new conversation so the skills load. Claude Code
users: do not also install the HyperFrames plugin, or Claude sees two copies of the skills.

## Make a video

```bash
node tools/rcg.mjs new-job --name my-reel --video clip.mp4 --prompt-file prompt.md
```

Or drop the files in `inbox/my-reel/` (see [inbox/README.md](inbox/README.md)) and ask the agent
for "new job from inbox/my-reel". To start from an earlier edit:

```bash
node tools/rcg.mjs new-job --name my-next-reel --like jobs/<old-id> --video new-clip.mp4
```

Render and verify always go through `rcg render`, which checks the mix first, renders, then
inspects the output and writes a frame sheet.

## What is in the box

| Folder | Contents |
|---|---|
| `tools/` | The CLIs. `rcg.mjs` is the entry point; run it with no arguments to list commands |
| `.agents/skills/` | The project's skills (`video-job` plus the style skills). Edit here only |
| `.claude/skills/` | A copy for Claude Code, kept in step with `node tools/rcg.mjs skills sync` |
| `library/` | Reusable pieces: SFX with a measured manifest, shaders, effects, style packs, recipes, icons |
| `templates/` | HyperFrames project templates (`vertical-1080x1920`) |
| `config/` | `workspace.json` (committed defaults) and `workspace.local.json` (your paths, git-ignored) |
| `docs/` | `capabilities.md` (every command and its status), `styles.md`, `job-spec.md`, `PROVENANCE.md` |
| `inbox/` | Where you drop media and a prompt |
| `jobs/` | One HyperFrames project per video. Git-ignored: jobs stay on your machine |

Media, models, the voice venv and the extra ffmpeg are git-ignored. The clone is small; the
optional downloads are listed with sizes in `SETUP.md`.

## Skills

| Skill | Use for |
|---|---|
| `video-job` | Every editing request. The others run inside it |
| `style-marketing-pro` | Promo, ad, personal-brand, UGC or testimonial edits of one talking clip |
| `style-split-screen-edit` | A presenter clip plus an informative clip as a 9:16 split screen |
| `style-info-graphics` | Voice-led info-graphics, explainers, faceless or topic-only videos |
| `style-tactile-collage` | Paper collage, scrapbook, zine, handmade look |
| `style-quiet-editorial` | Quiet, minimal, premium, editorial or product-UI look |
| `style-vox-parallax` | Vox-style 2.5D parallax from still photos |

## Rules for agents and contributors

The rules every agent follows are in [AGENTS.md](AGENTS.md). The ones that matter most:

- No frameworks and no build step. Tools are Node ES modules; the voice tools are Python 3.11.
- No hardcoded absolute paths in committed code. Paths come from `config/`.
- Edit skills in `.agents/skills/` only, then run `node tools/rcg.mjs skills sync`.
- Look at the artifact, not the exit code. Every render is verified and the frame sheet is read.
- Line endings are frozen by `.gitattributes`. Do not change `core.autocrlf` handling: the
  provenance hashes depend on exact bytes.
- Nothing is published or posted by the tools. Posting is your step.

Features ported from the author's other apps are logged in `docs/PROVENANCE.md`, with licence
notes where the source recorded one.

## License

MIT, see [LICENSE](LICENSE).

Third-party pieces in the repo keep their own terms: the Phosphor icons in
`library/icons/phosphor/` are MIT (their LICENSE file is included), and the beat-grid script in
`tools/audio/hyperframes/` is Apache-2.0 from HyperFrames. `docs/PROVENANCE.md` lists the rest.
HyperFrames itself is downloaded by `npx` and is not part of this repo.
