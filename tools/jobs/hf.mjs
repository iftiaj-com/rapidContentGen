// Run the HyperFrames CLI through the installed plugin's launcher, so the CLI
// version always matches the plugin's skills. The launcher path comes from
// config (auto-detected from the plugin cache when not set).
//
// Usage: node tools/jobs/hf.mjs [--cwd <dir>] <hyperframes args...>

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isMain } from '../lib/cli.mjs';
import { loadConfig } from '../lib/config.mjs';

export function hfEnv() {
  const cfg = loadConfig();
  const env = { ...process.env };
  // Point HyperFrames' Python-based tools (Kokoro TTS, etc.) at the voice venv
  // once it exists, so nothing ever falls back to the broken `python3` alias.
  if (cfg.bin.voicePython && existsSync(cfg.bin.voicePython)) env.HYPERFRAMES_PYTHON = cfg.bin.voicePython;
  return env;
}

/**
 * Run a HyperFrames command. onLine receives each output line (stdout + stderr).
 * Resolves with { code, output }.
 */
export function hf(args, { cwd = process.cwd(), onLine = (l) => process.stdout.write(l + '\n') } = {}) {
  const cfg = loadConfig();
  if (!cfg.hyperframes.launcherPath || !existsSync(cfg.hyperframes.launcherPath)) {
    return Promise.reject(new Error('HyperFrames plugin launcher not found. Set hyperframes.pluginRoot in config/workspace.local.json.'));
  }
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(process.execPath, [cfg.hyperframes.launcherPath, ...args], { cwd, env: hfEnv(), windowsHide: true });
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
