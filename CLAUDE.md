@AGENTS.md

## Claude Code notes

The project instructions are in `AGENTS.md`, imported above, so every agent reads the same rules.
These notes apply to Claude Code only.

- **Skills.** Claude Code reads `.claude/skills/`, which holds a copy of the project skills in
  `.agents/skills/` (plus links to HyperFrames' skills, below). Call one
  with `/video-job`, `/style-marketing-pro` and so on. Never edit `.claude/skills/` directly: change
  `.agents/skills/`, then run `node tools/rcg.mjs skills sync`.
- **HyperFrames skills.** This project uses the same HyperFrames skills as every other agent: the
  ones `npx skills add heygen-com/hyperframes` put in `.agents/skills/`, linked into
  `.claude/skills/` (`/hyperframes`, `/hyperframes-core` and others). Keep the Claude Code plugin
  uninstalled or disabled, or Claude sees a second, possibly different copy (`/hyperframes:...`).
  `rcg hf` runs HyperFrames through npx either way (`hyperframes.usePlugin: false`).
- **Shell.** Use the Bash tool (Git Bash) for pipes, and the session scratchpad for temp files.
