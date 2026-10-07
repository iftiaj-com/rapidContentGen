#!/usr/bin/env node
// Real WebGL compile check for the corpus.
//
//   node scripts/compile-check.mjs            check every shader in shaders/
//   node scripts/compile-check.mjs a.glsl     check one file
//
// The static validator cannot parse GLSL, so a file can pass every rule and
// still fail to compile. This drives a headless Chrome or Edge over a
// generated page that assembles each shader exactly the way the site's runtime
// does, compiles it, and reports the driver log. Exit code 1 on any failure.
//
// Skips cleanly (exit 0) when no browser is installed, so it never blocks a
// build on a machine without one; the site's own preview is the other gate.

import { readFileSync, readdirSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { resolve, join, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractHeader, normalizeMeta, glslTypeFor } from '../src/lib/shader-core/header.mjs';
import { stripComments } from '../src/lib/shader-core/parse.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const SHADER_EXTS = ['.glsl', '.fs', '.frag'];

const BROWSERS = [
  process.env.ADITS_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) {
  console.log('compile-check: no Chrome or Edge found, skipping (set ADITS_BROWSER to force)');
  process.exit(0);
}

// Mirror of the runtime's shader assembly. Kept in step with src/lib/renderer.ts.
const RESERVED_DECLS = `
precision highp float;
uniform float TIME;
uniform float TIMEDELTA;
uniform int FRAMEINDEX;
uniform vec2 RENDERSIZE;
uniform int PASSINDEX;
uniform float AUDIO_BASS;
uniform float AUDIO_MID;
uniform float AUDIO_TREBLE;
uniform float AUDIO_VOL;
uniform float AUDIO_LEVEL;
uniform float AUDIO_BEAT;
uniform float AUDIO_KICK;
uniform float AUDIO_SNARE;
uniform float AUDIO_HAT;
uniform float AUDIO_BANDS[24];
uniform vec3 CAM_DIR;
uniform vec3 CAM_UP;
uniform vec3 TRACK;
uniform float TRACK_ON;
uniform float HAND_OPEN;
uniform int ADITS_ALPHA_MODE;
uniform int ADITS_KEY_MODE;
uniform float ADITS_KEY_THR;
uniform float ADITS_KEY_SOFT;
uniform vec3 ADITS_KEY_COLOR;
vec4 _adits_out;
`;

const WRAPPER_MAIN = `
void main() {
  _adits_out = vec4(0.0);
  _adits_user();
  vec4 _adits_c = _adits_out;
  vec3 _adits_rgb = _adits_c.rgb;
  float _adits_a = _adits_c.a;
  if (ADITS_ALPHA_MODE == 1) { _adits_rgb *= _adits_a; }
  else if (ADITS_ALPHA_MODE == 2) { _adits_a = 1.0; }
  float _adits_k = 1.0;
  if (ADITS_KEY_MODE == 1) {
    float _adits_y = dot(_adits_rgb, vec3(0.2126, 0.7152, 0.0722));
    _adits_k = smoothstep(ADITS_KEY_THR, ADITS_KEY_THR + ADITS_KEY_SOFT, _adits_y);
  } else if (ADITS_KEY_MODE == 2) {
    float _adits_m = max(_adits_rgb.r, max(_adits_rgb.g, _adits_rgb.b));
    _adits_k = smoothstep(ADITS_KEY_THR, ADITS_KEY_THR + ADITS_KEY_SOFT, _adits_m);
  } else if (ADITS_KEY_MODE == 3) {
    float _adits_d = distance(_adits_rgb, ADITS_KEY_COLOR);
    _adits_k = smoothstep(ADITS_KEY_THR, ADITS_KEY_THR + ADITS_KEY_SOFT, _adits_d);
  }
  gl_FragColor = vec4(_adits_rgb * _adits_k, _adits_a * _adits_k);
}
`;

function assemble(source) {
  const extracted = extractHeader(source);
  if (!extracted.ok) return { ok: false, error: extracted.error };
  const meta = normalizeMeta(extracted.meta);
  const inputDecls = meta.inputs
    .map((i) => {
      const t = glslTypeFor(i.TYPE);
      return t ? `uniform ${t} ${i.NAME};` : null;
    })
    .filter(Boolean)
    .join('\n');

  const stripped = stripComments(extracted.body);
  const m = /\bvoid\s+main\s*\(\s*(?:void)?\s*\)/.exec(stripped);
  let transformed = extracted.body;
  if (m) {
    transformed =
      extracted.body.slice(0, m.index) +
      'void _adits_user()' +
      extracted.body.slice(m.index + m[0].length);
  }
  transformed = transformed.replace(/\bgl_FragColor\b/g, '_adits_out');
  return { ok: true, source: RESERVED_DECLS + inputDecls + '\n' + transformed + WRAPPER_MAIN };
}

const fileArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
let targets = fileArgs.map((f) => resolve(f));
if (targets.length === 0) {
  const dir = join(root, 'shaders');
  try {
    targets = readdirSync(dir)
      .filter((f) => SHADER_EXTS.includes(extname(f)))
      .map((f) => join(dir, f));
  } catch {
    console.error(`compile-check: cannot read ${dir}`);
    process.exit(1);
  }
}
if (targets.length === 0) {
  console.log('compile-check: nothing to check');
  process.exit(0);
}

const jobs = [];
for (const t of targets) {
  const a = assemble(readFileSync(t, 'utf8'));
  if (!a.ok) {
    console.log(`${basename(t)}: FAIL (${a.error})`);
    process.exit(1);
  }
  jobs.push({ name: basename(t), source: a.source });
}

const work = mkdtempSync(join(tmpdir(), 'adits-compile-'));
const page = join(work, 'check.html');
const out = join(work, 'result.json');

// The shader sources live in a separate file rather than inline. --dump-dom
// prints the whole document, script contents included, so inlining them made
// stdout grow with the corpus until it blew past spawnSync's maxBuffer. Loaded
// this way the dumped DOM stays a few kilobytes no matter how many shaders
// there are.
writeFileSync(join(work, 'jobs.js'), `window.JOBS = ${JSON.stringify(jobs)};`);

writeFileSync(page, `<!doctype html><meta charset="utf-8"><body><script src="jobs.js"></script><script>
const VS = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';
const results = [];
const c = document.createElement('canvas');
c.width = c.height = 64;
const gl = c.getContext('webgl', { alpha: true, premultipliedAlpha: true });
if (!gl) {
  results.push({ name: '(context)', ok: false, log: 'no WebGL context available' });
} else if (!Array.isArray(window.JOBS)) {
  results.push({ name: '(jobs)', ok: false, log: 'jobs.js did not load' });
} else {
  for (const job of window.JOBS) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VS); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, job.source); gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      results.push({ name: job.name, ok: false, log: gl.getShaderInfoLog(fs) || 'compile failed' });
      continue;
    }
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      results.push({ name: job.name, ok: false, log: gl.getProgramInfoLog(p) || 'link failed' });
      continue;
    }
    // Confirm the reserved uniforms the runtime relies on survived linking.
    const missing = ['TIME','RENDERSIZE','ADITS_KEY_MODE'].filter((u) => {
      if (u === 'ADITS_KEY_MODE') return gl.getUniformLocation(p, u) === null;
      return false;
    });
    results.push({ name: job.name, ok: true, log: '', missing });
    gl.deleteProgram(p);
  }
}
document.title = 'ADITS_RESULT:' + JSON.stringify(results);
const pre = document.createElement('pre');
pre.id = 'out';
pre.textContent = JSON.stringify(results);
document.body.appendChild(pre);
</script></body>`);

const BASE_ARGS = [
  '--headless=new',
  '--disable-gpu-sandbox',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--allow-file-access-from-files',
  '--virtual-time-budget=8000',
  '--dump-dom',
];

// Some Linux hosts, including Ubuntu 24.04 with its AppArmor restriction on
// unprivileged user namespaces, cannot start Chrome's sandbox at all. Dropping
// the sandbox is the accepted trade-off in a disposable CI container but not
// something to force on a real desktop, so it is only a second attempt after
// the sandboxed run comes back empty.
const FALLBACK_ARGS = ['--no-sandbox', '--disable-dev-shm-usage'];

function run(extra) {
  const proc = spawnSync(browser, [...BASE_ARGS, ...extra, pathToFileURL(page).href], {
    encoding: 'utf8',
    timeout: 90000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(proc.stdout || '');
  return { proc, match: m };
}

let attempt = run([]);
// A truncated pipe is not a sandbox problem, so retrying without the sandbox
// would only hide the real cause behind a second identical failure.
if (!attempt.match && attempt.proc.error?.code !== 'ENOBUFS') {
  console.error('compile-check: no result from the sandboxed browser, retrying without the sandbox');
  attempt = run(FALLBACK_ARGS);
}

const m = attempt.match;
if (!m) {
  const { proc } = attempt;
  console.error('compile-check: the browser produced no result');
  console.error(`  browser: ${browser}`);
  console.error(`  exit: ${proc.status}  signal: ${proc.signal}  error: ${proc.error?.message ?? 'none'}`);
  console.error('  stderr:');
  console.error(String(proc.stderr || '(empty)'));
  rmSync(work, { recursive: true, force: true });
  process.exit(1);
}

let results;
try {
  results = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
} catch (e) {
  console.error('compile-check: could not parse the result payload');
  rmSync(work, { recursive: true, force: true });
  process.exit(1);
}
rmSync(work, { recursive: true, force: true });

let failed = false;
for (const r of results) {
  if (r.ok) {
    console.log(`${r.name}: compiles and links`);
  } else {
    failed = true;
    console.log(`${r.name}: FAIL`);
    console.log(String(r.log).split('\n').map((l) => `    ${l}`).join('\n'));
  }
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} shader(s) compiled.`);
process.exit(failed ? 1 : 0);
