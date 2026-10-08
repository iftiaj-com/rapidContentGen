// Minimal headless-Chrome driver over the DevTools protocol (Node's built-in
// WebSocket; no dependencies). Used by the fx harness (tools/fx/fx.mjs).
//
// Browser: config bin.fxChrome, else an installed Google Chrome (it has the
// D3D12 shader libraries WebGPU needs), else HyperFrames' headless shell
// (WebGL2 only: its WebGPU device creation fails without dxil.dll).
// Every launch uses a fresh temporary profile, never the user's.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.mjs';

// Flags HyperFrames uses for hardware rendering on Windows (D3D11 through ANGLE);
// without --no-sandbox the GPU process crashed in the headless shell.
const FLAGS = ['--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=d3d11',
  '--enable-unsafe-webgpu', '--enable-gpu-rasterization', '--force-gpu-mem-available-mb=4096',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--hide-scrollbars'];

export function findChrome() {
  const cfg = loadConfig();
  if (cfg.bin.fxChrome && existsSync(cfg.bin.fxChrome)) return { path: cfg.bin.fxChrome, kind: 'config' };
  const env = process.env;
  const installed = [
    env.ProgramFiles && join(env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env['ProgramFiles(x86)'] && join(env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  for (const p of installed) if (existsSync(p)) return { path: p, kind: 'chrome' };
  const base = join(homedir(), '.cache', 'hyperframes', 'chrome', 'chrome-headless-shell');
  if (existsSync(base)) {
    for (const v of readdirSync(base).sort().reverse()) {
      const p = join(base, v, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
      if (existsSync(p)) return { path: p, kind: 'headless-shell' };
    }
  }
  throw new Error('No Chrome found for the fx harness. Set bin.fxChrome in config/workspace.local.json.');
}

export async function launch({ width = 1080, height = 1920 } = {}) {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'rcg-fx-chrome-'));
  const args = [...FLAGS, '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, 'about:blank'];
  if (chrome.kind !== 'headless-shell') args.unshift('--headless=new');
  const proc = spawn(chrome.path, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
  let port = null;
  for (let i = 0; i < 300 && !port; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const f = join(profile, 'DevToolsActivePort');
    if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0].trim() || null;
    if (proc.exitCode !== null) throw new Error(`Chrome exited (${proc.exitCode}): ${stderr.slice(-600)}`);
  }
  if (!port) throw new Error('Chrome did not open its DevTools port.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method) for (const l of listeners) l(m);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return {
    chrome, send, evaluate,
    on: (fn) => listeners.add(fn),
    stderr: () => stderr,
    async close() {
      try { ws.close(); } catch { /* already closed */ }
      proc.kill();
      await new Promise((r) => setTimeout(r, 300));
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a lock */ }
    },
  };
}
