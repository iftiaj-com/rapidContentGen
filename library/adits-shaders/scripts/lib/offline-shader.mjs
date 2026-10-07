// The offline shader harness: how a corpus file is compiled and drawn outside
// the browser app. Shared by scripts/render.mjs, the "look at it" gate, and
// scripts/og-images.mjs, which draws the social cards.
//
// One copy on purpose. If the card renderer and the preview renderer disagreed
// about uniforms or alpha, a card would advertise something the site does not
// show.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { extractHeader, normalizeMeta, glslTypeFor } from '../../src/lib/shader-core/header.mjs';
import { stripComments } from '../../src/lib/shader-core/parse.mjs';

/** Every uniform Adits injects, declared for the offline compile. */
export const RESERVED_DECLS = `
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

/** The alpha and key block the panel applies after the shader's own main(). */
export const WRAPPER_MAIN = `
void main() {
  _adits_out = vec4(0.0);
  _adits_user();
  vec4 _adits_c = _adits_out;
  vec3 _adits_rgb = _adits_c.rgb;
  float _adits_a = _adits_c.a;
  if (ADITS_ALPHA_MODE == 1) { _adits_rgb *= _adits_a; }
  else if (ADITS_ALPHA_MODE == 2) { _adits_a = 1.0; }
  gl_FragColor = vec4(_adits_rgb, _adits_a);
}
`;

const BROWSERS = [
  process.env.ADITS_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

/** First Chrome or Edge on this machine, or null when none is installed. */
export function findBrowser() {
  return BROWSERS.find((p) => existsSync(p)) ?? null;
}

/**
 * Turn a corpus file into a compilable fragment shader plus its input values.
 * Returns null when the header will not parse.
 *
 * @param {string} path
 * @param {Record<string, number|boolean|number[]>} [overrides] input DEFAULT overrides
 */
export function prepareShader(path, overrides = {}) {
  const source = readFileSync(path, 'utf8');
  const extracted = extractHeader(source);
  if (!extracted.ok) return null;
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
    transformed = extracted.body.slice(0, m.index) + 'void _adits_user()' + extracted.body.slice(m.index + m[0].length);
  }
  transformed = transformed.replace(/\bgl_FragColor\b/g, '_adits_out');
  const inputs = meta.inputs.map((i) =>
    Object.prototype.hasOwnProperty.call(overrides, i.NAME)
      ? { ...i, DEFAULT: overrides[i.NAME] }
      : i
  );
  return {
    name: basename(path),
    fragSource: RESERVED_DECLS + inputDecls + '\n' + transformed + WRAPPER_MAIN,
    inputs,
    alphaMode: meta.alpha === 'straight' ? 1 : meta.alpha === 'opaque' ? 2 : 0,
    meta,
  };
}

/**
 * The camera basis the site derives from an orbit, in degrees.
 * @param {number} azDeg
 * @param {number} elDeg
 */
export function camBasis(azDeg = 0, elDeg = 0) {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  const dir = [
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az),
  ];
  let right = [dir[2], 0, -dir[0]];
  const len = Math.hypot(...right) || 1;
  right = right.map((v) => v / len);
  const up = [
    dir[1] * right[2] - dir[2] * right[1],
    dir[2] * right[0] - dir[0] * right[2],
    dir[0] * right[1] - dir[1] * right[0],
  ];
  return { camDir: dir, camUp: up };
}

/**
 * In-page helpers, injected as source into the headless document. Defines
 * bindValue(), createGL() and drawJob(); the caller reads back and composites.
 */
export const PAGE_GL_RUNTIME = `
const VS = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';

// Mirror of the runtime's BIND formula so offline output matches the site.
//
// AUDIO is the flat drive every audio uniform shares. The state argument, when
// a caller passes one, carries the individual per-frame band values, so a bound
// input follows the band it actually named — the same resolveBindSource rule as
// src/lib/renderer.ts — instead of one blended level standing in for all nine.
function bindValue(inp, AUDIO, state) {
  const panel = inp.DEFAULT;
  if (typeof panel !== 'number') return panel;
  if (!inp.BIND || inp.BIND === 'none') return panel;
  if (inp.BIND.indexOf('gesture') === 0) return panel;   // no tracking offline
  const source = state && typeof state[inp.BIND] === 'number' ? state[inp.BIND] : AUDIO;
  const depth = typeof inp.BIND_DEPTH === 'number' ? inp.BIND_DEPTH : 1;
  const v = depth >= 0 ? panel + (inp.MAX - panel) * depth * source
                       : panel + (panel - inp.MIN) * depth * source;
  return Math.min(inp.MAX, Math.max(inp.MIN, v));
}

function createGL(W, H) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true,
  });
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  return { canvas, gl, buf };
}

// Compile, link, set every uniform, draw one full-screen triangle.
// Returns { ok } or { ok: false, log }.
function drawJob(ctx, job, W, H, cfg) {
  const gl = ctx.gl;
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, VS); gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, job.fragSource); gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    return { ok: false, log: gl.getShaderInfoLog(fs) };
  }
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    return { ok: false, log: gl.getProgramInfoLog(p) };
  }
  gl.useProgram(p);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const f1 = (n, v) => { const l = gl.getUniformLocation(p, n); if (l) gl.uniform1f(l, v); };
  const i1 = (n, v) => { const l = gl.getUniformLocation(p, n); if (l) gl.uniform1i(l, v); };
  const f3 = (n, a, b, d) => { const l = gl.getUniformLocation(p, n); if (l) gl.uniform3f(l, a, b, d); };

  // cfg.fps and cfg.frameIndex let a frame-sequence renderer declare the real
  // cadence. A single-frame caller omits both and gets the 60fps the site runs
  // at, which is what FRAMEINDEX has always been derived from here.
  const fps = cfg.fps || 60;
  f1('TIME', cfg.time); f1('TIMEDELTA', 1 / fps);
  i1('FRAMEINDEX', typeof cfg.frameIndex === 'number' ? cfg.frameIndex : Math.round(cfg.time * fps));
  i1('PASSINDEX', 0);
  const rl = gl.getUniformLocation(p, 'RENDERSIZE'); if (rl) gl.uniform2f(rl, W, H);
  // cfg.audioState drives each audio uniform from its own band. Without one
  // every audio uniform shares the flat cfg.audio drive, which is all a still
  // frame needs.
  const A = cfg.audioState || null;
  const aud = (k) => (A && typeof A[k] === 'number' ? A[k] : cfg.audio);
  f1('AUDIO_BASS', aud('bass'));   f1('AUDIO_MID', aud('mid'));
  f1('AUDIO_TREBLE', aud('treble')); f1('AUDIO_VOL', aud('vol'));
  f1('AUDIO_LEVEL', aud('level'));
  f1('AUDIO_BEAT', aud('beat'));   f1('AUDIO_KICK', aud('kick'));
  f1('AUDIO_SNARE', aud('snare')); f1('AUDIO_HAT', aud('hat'));
  const bl = gl.getUniformLocation(p, 'AUDIO_BANDS[0]');
  if (bl) {
    gl.uniform1fv(bl, A && A.bands && A.bands.length === 24
      ? new Float32Array(A.bands)
      : new Float32Array(24).fill(cfg.audio));
  }
  f3('CAM_DIR', cfg.camDir[0], cfg.camDir[1], cfg.camDir[2]);
  f3('CAM_UP', cfg.camUp[0], cfg.camUp[1], cfg.camUp[2]);
  f3('TRACK', 0, 0, 0); f1('TRACK_ON', 0); f1('HAND_OPEN', -1);
  i1('ADITS_ALPHA_MODE', job.alphaMode);
  i1('ADITS_KEY_MODE', 0); f1('ADITS_KEY_THR', 0.1); f1('ADITS_KEY_SOFT', 0.2);
  f3('ADITS_KEY_COLOR', 0, 0, 0);

  for (const inp of job.inputs) {
    const l = gl.getUniformLocation(p, inp.NAME);
    if (!l) continue;
    if (inp.TYPE === 'float') gl.uniform1f(l, bindValue(inp, cfg.audio, A));
    else if (inp.TYPE === 'long') gl.uniform1i(l, Math.round(bindValue(inp, cfg.audio, A)));
    else if (inp.TYPE === 'bool' || inp.TYPE === 'event') gl.uniform1i(l, inp.DEFAULT ? 1 : 0);
    else if (inp.TYPE === 'color' && inp.DEFAULT) gl.uniform4f(l, inp.DEFAULT[0], inp.DEFAULT[1], inp.DEFAULT[2], inp.DEFAULT[3]);
    else if (inp.TYPE === 'point2D' && inp.DEFAULT) gl.uniform2f(l, inp.DEFAULT[0], inp.DEFAULT[1]);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.buf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.deleteProgram(p);
  return { ok: true };
}
`;

/**
 * Run a page script in headless Chrome and return whatever it wrote into
 * <pre id="out"> as JSON. The script is expected to build that element.
 *
 * @param {string} pageScript JavaScript source for the document
 * @param {{ browser?: string, timeoutMs?: number, label?: string }} [options]
 */
export function runHeadless(pageScript, options = {}) {
  const browser = options.browser ?? findBrowser();
  if (!browser) {
    throw new Error('no Chrome or Edge found (set ADITS_BROWSER)');
  }
  const work = mkdtempSync(join(tmpdir(), 'adits-offline-'));
  const page = join(work, 'page.html');
  writeFileSync(page, `<!doctype html><meta charset="utf-8"><body style="margin:0"><script>${pageScript}</script></body>`);
  const proc = spawnSync(browser, [
    '--headless=new',
    '--disable-gpu-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--allow-file-access-from-files',
    '--virtual-time-budget=60000',
    '--dump-dom',
    pathToFileURL(page).href,
  ], { encoding: 'utf8', timeout: options.timeoutMs ?? 180000, maxBuffer: 256 * 1024 * 1024 });
  rmSync(work, { recursive: true, force: true });

  const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(proc.stdout || '');
  if (!m) {
    const detail = (proc.stderr || '').split('\n').slice(0, 8).join('\n');
    throw new Error(`the browser produced no result\n${detail}`);
  }
  const decoded = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  return JSON.parse(decoded);
}
