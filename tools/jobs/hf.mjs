// Run the HyperFrames CLI. With the Claude Code plugin installed, through its
// launcher, so the CLI version matches the plugin's skills (the launcher path is
// auto-detected from the plugin cache when not set). Without it, straight from npm
// as `npx --yes hyperframes@<hyperframes.version>`, so any agent (or none) can render.
//
// Usage: node tools/jobs/hf.mjs [--cwd <dir>] <hyperframes args...>

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { isMain } from '../lib/cli.mjs';
import { loadConfig } from '../lib/config.mjs';

export function hfEnv() {
  const cfg = loadConfig();
  const env = { ...process.env };
  // What the plugin launcher sets, so the npx route behaves the same: no skill
  // install or update check from inside a render.
  env.HYPERFRAMES_SKIP_SKILLS ??= '1';
  env.HYPERFRAMES_NO_UPDATE_CHECK ??= '1';
  // Point HyperFrames' Python-based tools (Kokoro TTS, etc.) at the voice venv
  // once it exists, so nothing ever falls back to the broken `python3` alias.
  if (cfg.bin.voicePython && existsSync(cfg.bin.voicePython)) env.HYPERFRAMES_PYTHON = cfg.bin.voicePython;
  // A separate ffmpeg for HyperFrames (rcg doctor's edge test explains why).
  if (cfg.bin.hfFfmpeg) env.HYPERFRAMES_FFMPEG_PATH = cfg.bin.hfFfmpeg;
  if (cfg.bin.hfFfprobe) env.HYPERFRAMES_FFPROBE_PATH = cfg.bin.hfFfprobe;
  // HyperFrames caches extracted video frames keyed by source, range, fps and
  // format, not by ffmpeg build, so frames from another build would be reused.
  // One cache folder per ffmpeg binary keeps them apart.
  if (!env.HYPERFRAMES_EXTRACT_CACHE_DIR) {
    const ff = cfg.bin.hfFfmpeg || cfg.bin.ffmpeg || 'ffmpeg';
    env.HYPERFRAMES_EXTRACT_CACHE_DIR = join(tmpdir(), `hyperframes-extract-cache-${createHash('sha1').update(ff).digest('hex').slice(0, 8)}`);
  }
  return env;
}

const BROWSER_COMMANDS = new Set(['check', 'snapshot', 'render', 'preview']);

/**
 * Graded media (data-color-grading on a video or image) that is on screen at
 * t = 0 makes the first page load slow on this machine's hardware GPU path
 * (GTX 1650 / ANGLE D3D11): longer than check/snapshot's fixed 10 s navigation
 * limit, but within render's adjustable --browser-timeout. SwiftShader loads it
 * but took 20 minutes for one check. Found on the R1 regression job (2026-10-07).
 * Returns the offending element ids.
 */
export function gradedAtStart(html) {
  const body = html.replace(/<!--[\s\S]*?-->/g, '');
  const ids = [];
  for (const m of body.matchAll(/<(video|img)\b([^>]*)>/gi)) {
    const attrs = m[2];
    if (!/data-color-grading=/.test(attrs)) continue;
    const start = Number((attrs.match(/data-start="([^"]+)"/) || [])[1] ?? 0);
    if (start <= 0.05) ids.push((attrs.match(/\bid="([^"]+)"/) || [])[1] || m[1]);
  }
  return ids;
}

const MIRROR = '.rcg-nograde';
// Large media folders are linked (junctions). compositions/ is COPIED: HyperFrames'
// font embedding did not see fonts used in sub-compositions behind a junction
// (captions fell back to a default sans in the mirror).
const SHARED_DIRS = ['assets', 'data'];
const COPIED_DIRS = ['compositions'];
const SHARED_FILES = ['hyperframes.json', 'meta.json', 'package.json', 'template.json'];

/**
 * Build <job>/.rcg-nograde/: a mirror whose assets/compositions/data are
 * directory junctions back to the job (nothing copied) and whose index.html has
 * data-color-grading removed. Grading never changes layout, so lint/layout/
 * motion results from the mirror hold for the real job; the grade itself is
 * verified on the render.
 */
export function gradeFreeMirror(jobDir) {
  const dir = join(jobDir, MIRROR);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const d of SHARED_DIRS) if (existsSync(join(jobDir, d))) symlinkSync(join(jobDir, d), join(dir, d), 'junction');
  for (const d of COPIED_DIRS) if (existsSync(join(jobDir, d))) cpSync(join(jobDir, d), join(dir, d), { recursive: true });
  for (const f of SHARED_FILES) if (existsSync(join(jobDir, f))) copyFileSync(join(jobDir, f), join(dir, f));
  const html = readFileSync(join(jobDir, 'index.html'), 'utf8').replace(/\s*data-color-grading='[^']*'/g, '').replace(/\s*data-color-grading="[^"]*"/g, '');
  writeFileSync(join(dir, 'index.html'), html);
  return dir;
}

/**
 * Plan a browser command for jobs with graded media at t = 0:
 *   render            -> stay on the hardware GPU, raise --browser-timeout to 180 s
 *   check / snapshot  -> run in the grade-free mirror (fixed 10 s navigation limit)
 *   preview           -> unchanged (interactive; the user sees the real job)
 * Returns { args, cwd }.
 */
export function planBrowserRun(args, cwd, note = (m) => process.stdout.write(`${m}\n`)) {
  const cmd = args[0];
  const plan = { args, cwd };
  if (!BROWSER_COMMANDS.has(cmd) || args.some((a) => /browser-gpu|browser-timeout/.test(a))) return plan;
  const index = join(cwd, 'index.html');
  if (!existsSync(index)) return plan;
  const ids = gradedAtStart(readFileSync(index, 'utf8'));
  if (!ids.length) return plan;
  if (cmd === 'render') {
    note(`[rcg] graded media on screen at t=0 (${ids.join(', ')}): raising --browser-timeout to 180 s (slow first load on the hardware GPU).`);
    return { args: [...args, '--browser-timeout', '180'], cwd };
  }
  if (cmd === 'check' || cmd === 'snapshot') {
    const mirror = gradeFreeMirror(cwd);
    // Keep snapshot output in the real job folder.
    const out = [...args];
    const oi = out.findIndex((a) => a === '--output' || a === '-o');
    if (oi >= 0 && out[oi + 1] && !isAbsolute(out[oi + 1])) out[oi + 1] = resolve(cwd, out[oi + 1]);
    else if (cmd === 'snapshot' && oi < 0) out.push('--output', join(cwd, 'snapshots'));
    note(`[rcg] graded media on screen at t=0 (${ids.join(', ')}): running ${cmd} on a grade-free mirror (${MIRROR}); layout is unaffected, the grade is checked in the render.`);
    return { args: out, cwd: mirror };
  }
  return plan;
}

/**
 * Run a HyperFrames command. onLine receives each output line (stdout + stderr).
 * Resolves with { code, output }.
 */
/**
 * The command that runs the HyperFrames CLI with `args`: the plugin launcher, or
 * npx with the pinned version. npx runs through node + npx-cli.js on Windows (as
 * the plugin launcher does) so no shell is needed. Exported for rcg doctor.
 */
export function hfCommand(args = []) {
  const cfg = loadConfig();
  if (cfg.hyperframes.runner === 'plugin') {
    return { command: process.execPath, args: [cfg.hyperframes.launcherPath, ...args], via: `plugin ${cfg.hyperframes.cliVersion}` };
  }
  const cliArgs = ['--yes', `hyperframes@${cfg.hyperframes.cliVersion}`, ...args];
  if (process.platform !== 'win32') return { command: 'npx', args: cliArgs, via: `npx hyperframes@${cfg.hyperframes.cliVersion}` };
  const npx = [
    process.env.npm_execpath && join(dirname(process.env.npm_execpath), 'npx-cli.js'),
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ].filter(Boolean).find((p) => existsSync(p));
  if (!npx) return null;
  return { command: process.execPath, args: [npx, ...cliArgs], via: `npx hyperframes@${cfg.hyperframes.cliVersion}` };
}

export function hf(args, { cwd = process.cwd(), onLine = (l) => process.stdout.write(l + '\n') } = {}) {
  const probe = hfCommand();
  if (!probe) {
    return Promise.reject(new Error('Cannot run HyperFrames: no plugin launcher and no npx-cli.js next to node. Install Node.js with npm (see SETUP.md).'));
  }
  return new Promise((resolvePromise, reject) => {
    const plan = planBrowserRun(args, resolve(cwd), onLine);
    const run = hfCommand(plan.args);
    const proc = spawn(run.command, run.args, { cwd: plan.cwd, env: hfEnv(), windowsHide: true });
    let output = '';
    let pending = '';
    const feed = (chunk) => {
      const text = chunk.toString();
      output += text;
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      for (const l of lines) onLine(l);
    };
    proc.stdout.on('data', feed);
    proc.stderr.on('data', feed);
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (pending) onLine(pending);
      resolvePromise({ code, output });
    });
  });
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  let cwd = process.cwd();
  const i = argv.indexOf('--cwd');
  if (i >= 0) { cwd = argv[i + 1]; argv.splice(i, 2); }
  const { code } = await hf(argv, { cwd });
  process.exit(code ?? 1);
}
