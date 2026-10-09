# rapidContentGen

An AI video-editing workspace. The user drops a video (or several) plus a prompt,
in chat or in `inbox/`, and the agent turns it into a finished motion-graphics
edit. HyperFrames (HTML + GSAP, rendered headless) is the render core. Features
from the user's other apps (Adits, AditsShaders, AditsStudio, flowEditor, the TTS
app) are **copied or ported in** and logged in `docs/PROVENANCE.md`.

These instructions are for any coding agent (Antigravity, Claude Code and others).
`CLAUDE.md` imports this file and adds notes for Claude Code only.

**For any editing request, follow the `video-job` skill** (`.agents/skills/video-job/SKILL.md`).
It holds the full workflow: intake, mode, beat sheet, audio, build, render, verify, report.

On a fresh clone, or when `rcg doctor` reports a `FAIL`, follow `SETUP.md` first.

## Skills

The project's skills live in `.agents/skills/<name>/SKILL.md`. Read the matching `SKILL.md` before
starting; if your tool does not load it by itself, open the file. Call one by name where the tool
supports it: `/video-job` in Antigravity (2.0 and CLI) and Claude Code.

| Skill | Use for |
|---|---|
| `video-job` | Every editing request: intake, working mode, beat sheet, audio, build, render, verify, report. The others run inside it. |
| `style-marketing-pro` | Promo, ad, personal-brand, coach, UGC or testimonial edits of one talking clip |
| `style-split-screen-edit` | A presenter clip plus an informative clip as a 9:16 split screen |
| `style-info-graphics` | Voice-led info-graphics, explainers, video essays, faceless or topic-only videos |
| `style-tactile-collage` | Paper collage, scrapbook, zine, handmade or analog look |
| `style-quiet-editorial` | Quiet, minimal, premium, editorial or product-UI look |
| `style-vox-parallax` | Vox-style 2.5D parallax from still photos, documentary or archival look |

- **Edit skills in `.agents/skills/` only.** `.claude/skills/` is a copy for Claude Code (which reads
  only that folder). After any change run `node tools/rcg.mjs skills sync`; `rcg doctor` reports a
  stale copy.
- HyperFrames' own skills (`hyperframes`, `hyperframes-core`, `media-use` and others) are installed per
  machine with `npx skills add heygen-com/hyperframes` (`SETUP.md`), live in `.agents/skills/` with
  links in `.claude/skills/`, and are git-ignored by name.

**When the two sets disagree, this project wins.** HyperFrames' skills are the reference for writing
valid compositions (the `data-*` timing contract, clips, tracks, animation rules). For the workflow:

- `video-job` leads every editing request, even though the `hyperframes` skill calls itself the
  entry point. Use HyperFrames' workflow skills (`music-to-video`, `talking-head-recut` and others)
  only where `video-job` routes to them.
- Run HyperFrames only through `node tools/rcg.mjs hf ...` and render only with `rcg render`, never
  `npx hyperframes render` directly: `rcg` sets the ffmpeg without the edge bug (pitfall 9), handles
  graded footage and verifies the output.
- Keep the pinned version (`hyperframes.version` in `config/workspace.json`). Do not run
  `hyperframes upgrade` or move a job to `@latest` without asking the user.
- Media comes from the project's tools and approved sources (`rcg voice`, `rcg assets`, `library/sfx`),
  not from HeyGen's hosted services, which need an account.

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
- **No credit or attribution text on screen.** Never put photographer, source, licence or
  "courtesy of" text in a video. Credits for collected assets live only in the job's
  `data/credits.json` and `report.md` (`rcg assets credits`). The approved sources do not require
  on-screen credit (`.agents/skills/style-info-graphics/references/assets.md`).

## Environment

- Windows 11. Run pipes in Git Bash, not PowerShell 5.1: PowerShell pipes add a UTF-8 BOM
  that breaks JSON. Write JSON from Node or Python, never through PowerShell redirection.
- `python` is 3.13. Never call `python3` (broken Store alias). The voice venv is Python 3.11.
- Git Bash `/tmp` is not the same folder Windows Python sees. Use Windows paths or a temp
  folder both can see.
- ffmpeg/ffprobe 8.1 are on PATH. HyperFrames uses ffmpeg 9.0.2 from `tools/bin/` (git-ignored) via
  `bin.hfFfmpeg` / `bin.hfFfprobe` in the local config, because of pitfall 9. `drawtext` needs an explicit `fontfile` (fontconfig is not
  set up); `tools/lib/ffmpeg.mjs` handles this via `fonts.label` in config.
- HyperFrames always runs through `node tools/rcg.mjs hf --cwd <job> <args>` (and `rcg render`).
  It runs `npx hyperframes@<hyperframes.version>` (pinned in `config/workspace.json`, kept in step
  with the installed HyperFrames skills): no plugin, account or login is needed to render. Its usage command returns "unknown" here; telemetry is disabled.

## Commands

```
node tools/rcg.mjs                      # list commands
node tools/rcg.mjs doctor               # health check
node tools/rcg.mjs skills sync          # copy .agents/skills to .claude/skills after editing a skill (check = compare)
node tools/rcg.mjs new-job --name x --video a.mp4 [--audio m.mp3] [--prompt-file p.md] [--mode a|b|c] [--like jobs/<old-id>]
node tools/rcg.mjs inbox list                  # free / claimed inbox folders (new-job claims one); release <folder>
node tools/rcg.mjs inbox done --job jobs/<id>  # job delivered: rename its inbox folder to <folder>-Complete (agents skip these)
node tools/rcg.mjs beat-sheet md jobs/<id>/beat-sheet.json jobs/<id>/beat-sheet.md
node tools/rcg.mjs voice say --lines jobs/<id>/data/vo-lines.json --out-dir jobs/<id>/assets/voice
node tools/rcg.mjs level --dir jobs/<id>/assets/voice --lufs -13.5 --ceiling -1.5
node tools/rcg.mjs captions --job jobs/<id> --words <audio_meta.json|words.json|.srt> --voice vo1 --style tiktok --mode word --start 0.4 --id cap-vo1 --insert   # + --hollow --rgb --shadow; --negative --behind p1
node tools/rcg.mjs title --job jobs/<id> --text "LINE ONE|LINE TWO" --preset slam --style trailer --start 11 --duration 1.5 --id title-main --insert
node tools/rcg.mjs style list                          # style packs; skills style-tactile-collage, style-quiet-editorial, style-vox-parallax, style-marketing-pro
node tools/rcg.mjs layers --job jobs/<id> --src assets/photo.jpg --name s1 --layer "mid:person" --layer "fg:chair"   # depth layers for parallax
node tools/rcg.mjs marketing-pro prep --job jobs/<id> --src assets/clip.mp4 --trim [--intro 3.8 --outro 1.8]     # then plan (--fill-heroes --clusters --cards --whips --strips --music), then build (skill style-marketing-pro)
python -I tools/media/camera_motion.py <video>                   # measure a video's zooms, cuts and drift
node tools/rcg.mjs split-screen prep --job jobs/<id> --presenter assets/p.mp4 --info assets/b.mp4 --trim   # then plan, then build (skill style-split-screen-edit)
node tools/rcg.mjs infographics place-voice --job jobs/<id> --music assets/bed-limited.wav --duration 10   # then resolve --plan data/info-plan.json (skill style-info-graphics)
node tools/rcg.mjs assets icon add rocket-launch --weight bold        # approved sources only; also search / fetch --dry-run / credits
node tools/rcg.mjs broll --job jobs/<id> --src assets/b1-prep.mp4    # info-video shots scored card/ui/footage + sheet
node tools/rcg.mjs style apply --job jobs/<id> --style tactile-collage
node tools/rcg.mjs style build --job jobs/<id> --spec jobs/<id>/data/style-plan.json --sfx --insert
node tools/shaders/catalog.mjs --find "nebula gold"
node tools/rcg.mjs shader --job jobs/<id> --shader <slug> --audio jobs/<id>/assets/song-limited.wav --fit fill --duration 15 --id sh-bg --track 0 --insert
node tools/rcg.mjs beatflash --job jobs/<id> --words "BASS|MID|TREBLE" --audio jobs/<id>/assets/song-limited.wav --source bands --effect neon --duration 15 --id flash --insert
node tools/rcg.mjs analyze music.wav data/audio.json --fps 24 [--clock pulse]
node tools/rcg.mjs beatgrid jobs/<id>/assets/song-limited.wav -o jobs/<id>/data/audiomap.json   # beats, downbeats, phases for beat-synced cuts
node tools/rcg.mjs camera --list
node tools/rcg.mjs camera --job jobs/<id> --target "#w1" --cue "a/0:handheld" --cue "b/5.5:whip_pan_right" --cue "0:vc.ken_burns:hh=30" [--kick m.wav] [--audio m.wav] [--fill blur|cover|none]
node tools/rcg.mjs three --job jobs/<id> --scene orb --cue "a/0:orbit_cw" --cue "b/2.39:crash_zoom_in:i=0.5" --audio m.wav --duration 6 --id three-orb --track 3 --insert
node tools/rcg.mjs flythrough --list
node tools/rcg.mjs flythrough --job jobs/<id> [--spec jobs/<id>/data/flythrough.json] --insert --fit-root
node tools/rcg.mjs recipe list
node tools/rcg.mjs recipe plan --job jobs/<id> --recipe cosmic-promo --duration 14.5 --seed 5 [--title "TEXT"]
node tools/rcg.mjs recipe build --job jobs/<id>      # after filling the <PLACEHOLDERS>
node tools/rcg.mjs assemble --job jobs/<id>
node tools/rcg.mjs ramp --job jobs/<id> --target v4 --audio m.wav --audio-offset 6.29 --min 1 --max 2
node tools/rcg.mjs track --job jobs/<id> --src assets/x.mp4 --debug --name v1        # face + hands -> data/track-v1.json
node tools/rcg.mjs matte --job jobs/<id> --src assets/x.mp4 --plate --sheet --choke 6 --name v1   # -> assets/matte/v1-fg.webm
node tools/rcg.mjs camera --job jobs/<id> --target "#w1" --track data/track-v1.json --cue "0:face.follow:z=1.05:x=0.5:y=0.35:d=0" --cue "2.4:face.zoom:z=1.7:d=0.3"
node tools/rcg.mjs pnp --job jobs/<id> --base "#v1" --cutout assets/matte/v1-fg.webm --id p1 [--x -0.3 --scale 0.85 --media-offset -2 --show a-b --enter blocks --z 25]
node tools/rcg.mjs layer --job jobs/<id> --id kw1 --behind p1      # or --front p1, --z n, --depth 0.5 (captions)
node tools/rcg.mjs transition --job jobs/<id> --at 5 --style zoom_punch --to "#w2"   # flash_white|flash_black|glitch_punch|zoom_punch|crossfade (--from)|mirror_whip (--dir)|zoom_blur
node tools/rcg.mjs strips --job jobs/<id> --mode open --start 0 --duration 3.8 --clips "assets/a.mp4@0:0.5,assets/b.mp4@4"   # cast opener / closer
node tools/rcg.mjs target --job jobs/<id> --base "#v4" --fx assets/fx/x.mp4 --fx-start 12.4 --cutout assets/matte/v1-fg.webm --windows "11.4-12.4:bg,12.4-13.4:fg"
node tools/rcg.mjs fx --list
node tools/rcg.mjs fx --job jobs/<id> --effect ghost --src assets/x.mp4 --start 2 --duration 3 [--param id=v] [--preset p] [--src2 assets/y.mp4 --start2 0] [--audio m.wav] --sheet --out assets/fx/ghost.mp4
node tools/rcg.mjs fx --job jobs/<id> --effect voxel-magnet --src assets/x.mp4 --start 2 --duration 1.5 --track data/track-v1.json --anchor hand --sheet --out assets/fx/magnet.mp4
node tools/rcg.mjs fx --job jobs/<id> --effect voxel-drop --preset bursts --src assets/x.mp4 --start 3 --duration 1.5 --preroll 1 --param rcgDropAt=-0.9 --out assets/fx/drop.mp4
node tools/rcg.mjs fx --job jobs/<id> --effect vj-lightshow --preset ls_ignition --src assets/x.mp4 --start 3 --duration 2 --audio m.wav --audio-offset 6 --sheet --out assets/fx/ls.mp4   # vj-scan|vj-lights|vj-beatwash; --param vj.tint=#00e5ff
node tools/rcg.mjs fx --job jobs/<id> --effect global-visuals --src assets/x.mp4 --start 3 --duration 2 --param fxBnwMode=true --param fxFisheyeEnabled=true --out assets/fx/bnw.mp4   # fxNeonMode fxRgbColors (--audio) fxNegativeMode globalOpacityEnabled
node tools/rcg.mjs cinema --job jobs/<id> --id cf1 --ud --pos 12 --curve 35 --show 4-7 [--lr --lr-pos 7 --lr-color "#14001f"] [--behind p1]   # Adits Cinema Frames; --remove cf1
node tools/rcg.mjs limit in.mp3 out.wav [--ceiling -2.5]
node tools/rcg.mjs mix-check jobs/<id>/index.html
node tools/rcg.mjs hf --cwd jobs/<id> check
node tools/rcg.mjs render jobs/<id> --fps 24 [--workers 3] [--silence a-b]   # render, fx, matte, track, layers, hf render/snapshot: one at a time machine-wide; others wait
node tools/rcg.mjs verify file.mp4 --width 1080 --height 1920 --fps 24 --duration 16.88 --sheet s.png
node tools/rcg.mjs provenance check
```

## Layout

- `AGENTS.md`: these instructions (all agents). `CLAUDE.md`: imports this file, plus Claude Code notes.
- `.agents/skills/`: the project's skills (edit here). `.claude/skills/`: a copy for Claude Code (`rcg skills sync`).
- `tools/`: CLIs (`rcg.mjs` is the entry point). `lib/` has config, ffmpeg, provenance.
- `library/`: reusable pieces: `sfx/` (measured manifest), `recipes/` (grades), `styles/` (style packs, `docs/styles.md`),
  `runtime/`, `blocks/`, `shaders/` (filled phase by phase), `adits-fx/` (Adits effects and
  environments, copied unmodified) and `fx/` (the `rcg fx` harness and effect registry).
- `templates/`: HyperFrames project templates (`vertical-1080x1920`).
- `jobs/<date>-<slug>/`: one HyperFrames project per job (git-ignored: jobs stay on each user's machine), with `JOB.md`, `beat-sheet.*`,
  `data/`, `renders/`, `report.md`.
- `inbox/`: where the user drops media + `prompt.md`.
- `regression/`: test specs per phase (git-ignored: they use files on the original machine).
- `docs/`: `capabilities.md` (what exists and how to call it), `PORTING_CHECKLIST.md`,
  `PROVENANCE.md`, `job-spec.md`.
- `videos/mop-star-trailer/`: the original hand-built job, kept as reference.

## Known pitfalls (each one cost a re-render before)

See `.agents/skills/video-job/references/lessons.md`. The short list:
1. A `data-automation` volume lane sets ABSOLUTE levels and overrides `data-volume`.
2. Music files often peak above 0 dBFS. Limit to -2.5 dBTP first (`rcg limit`).
3. If HyperFrames logs "Audio lowered by X dB", the whole mix was turned down. `rcg mix-check`
   predicts this within about 0.3 dB before rendering; `rcg render` refuses to render a failing mix.
4. Place SFX by the measured crest in `library/sfx/manifest.json`, never by description text.
5. Slowing 24 fps footage below 1x stutters. Use a freeze frame or interpolation.
6. Text cards must be flat (spans directly inside the `.clip`); animate spans, never the clip.
7. Keep text out of the bottom 20% and the right 180 px on 9:16 (app buttons).
8. ffmpeg `-ac 1` downmix reads up to +3 dB hot; level tools average channels instead.
9. The PATH ffmpeg 8.1 blanks the right 8 px of every 1080-wide HyperFrames render (yuv420p -> gbrp
   bug). `rcg verify` fails it; `rcg doctor` tests it. `bin.hfFfmpeg` points HyperFrames at 9.0.2.
10. Chrome colour-manages BT.709-tagged PNGs (shadows sink) and cannot seek a `<video>` served
   without byte ranges. `rcg fx` writes untagged frames and serves ranges (lessons 13ab, 13ac).
