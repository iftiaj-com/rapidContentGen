// Workspace configuration: the single source of truth for every path and binary.
// config/workspace.json holds committed defaults; config/workspace.local.json
// (git-ignored) holds machine-specific absolute paths and wins on conflict.
// Relative paths resolve against the repo root, which is found from this file's
// location, so no absolute repo path is ever written in code.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Read JSON, tolerating a UTF-8 BOM (PowerShell writes one). */
export function readJson(file, fallback = undefined) {
  if (!existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing JSON file: ${file}`);
  }
  return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** Newest installed HyperFrames plugin version that ships the CLI launcher. */
function detectPluginRoot(launcher) {
  const base = join(homedir(), '.claude', 'plugins', 'cache', 'hyperframes', 'hyperframes');
  if (!existsSync(base)) return null;
  const versions = readdirSync(base)
    .filter((v) => /^\d+(\.\d+)*$/.test(v) && existsSync(join(base, v, launcher)))
    .sort(compareVersions);
  return versions.length ? join(base, versions[versions.length - 1]) : null;
}

/** The plugin's own version, from its manifest (the folder name is only a hint). */
function pluginVersion(root) {
  for (const f of ['plugin.json', '.claude-plugin/plugin.json']) {
    const file = join(root, f);
    if (existsSync(file)) return readJson(file).version || null;
  }
  return null;
}

const abs = (p) => (p == null ? p : isAbsolute(p) ? p : join(ROOT, p));

let cached = null;

export function loadConfig({ fresh = false } = {}) {
  if (cached && !fresh) return cached;
  const base = readJson(join(ROOT, 'config', 'workspace.json'));
  const local = readJson(join(ROOT, 'config', 'workspace.local.json'), {});
  const cfg = deepMerge(base, local);

  for (const [k, v] of Object.entries(cfg.paths || {})) cfg.paths[k] = abs(v);

  const launcherRel = cfg.hyperframes?.launcher || 'skills/hyperframes/scripts/plugin-cli.mjs';
  cfg.hyperframes.pluginRoot = cfg.hyperframes.pluginRoot || detectPluginRoot(launcherRel);
  cfg.hyperframes.launcherPath = cfg.hyperframes.pluginRoot
    ? join(cfg.hyperframes.pluginRoot, launcherRel)
    : null;
  // How HyperFrames runs: through the Claude Code plugin's launcher when it is
  // installed, else straight from npm (`npx hyperframes@<version>`), which needs no
  // plugin, account or agent. usePlugin: false (or RCG_HF_NPX=1) forces npm.
  const pluginUsable = cfg.hyperframes.usePlugin !== false && process.env.RCG_HF_NPX !== '1'
    && Boolean(cfg.hyperframes.launcherPath && existsSync(cfg.hyperframes.launcherPath));
  cfg.hyperframes.runner = pluginUsable ? 'plugin' : 'npx';
  cfg.hyperframes.cliVersion = (pluginUsable && pluginVersion(cfg.hyperframes.pluginRoot)) || cfg.hyperframes.version || 'latest';

  const venv = cfg.paths.voiceVenv;
  cfg.bin.voicePython = venv
    ? join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    : null;

  cached = cfg;
  return cfg;
}
