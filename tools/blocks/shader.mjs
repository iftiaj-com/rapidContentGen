// Shader layer generator: an AditsShaders object as a HyperFrames sub-composition,
// driven by a per-frame audio table so it reacts to the music deterministically.
//
// The fragment shader is built by the copied AditsShaders harness
// (library/adits-shaders/scripts/lib/offline-shader.mjs prepareShader: reserved
// uniforms, input uniforms, alpha/key wrapper), so the uniform contract has one
// definition. The in-page runtime is a port of that harness's PAGE_GL_RUNTIME:
// compile and look up uniforms ONCE, then draw per seek. Drawing happens from a
// GSAP property setter (HyperFrames' cosmic-orb pattern) because onUpdate does
// not fire on seek.
//
// Usage:
//   node tools/blocks/shader.mjs --job <dir> --shader <slug> [--audio <music file> --audio-offset 0]
//        [--fit fill|square] [--size 760] [--x 540 --y 860] [--scale 0.5]
//        [--clock default|pulse|flywheel|tilt] [--drive 1] [--inputs '{"NAME":0.5}']
//        [--opacity 1] [--blend screen] [--az 0 --el 0]
//        [--start 0] [--duration 15] [--id shader-bg] [--track 2] [--insert]
//
//   fill    covers the frame (rendered at --scale of full size, upscaled by CSS)
//   square  the object as AditsShaders authors it: a square at --x/--y, --size px

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { analyzeToFile } from '../audio/analyze.mjs';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { readJson, ROOT } from '../lib/config.mjs';

const SHADER_DIR = join(ROOT, 'library', 'adits-shaders', 'shaders');
const HARNESS = join(ROOT, 'library', 'adits-shaders', 'scripts', 'lib', 'offline-shader.mjs');

// Shaders whose DESCRIPTION says they rebuild a widely shared Shadertoy technique.
// The code is not a copy, but check before commercial use (docs/shaders/README.md).
export const TECHNIQUE_NOTES = new Set([
  'abyssal-frond-bouquet', 'argent-corner-bloom', 'kleinian-fractal-orb',
  'nova-spiral-shroud', 'orbital-ring-station', 'rose-flagellate-polyp',
]);

const KEYS = ['bass', 'mid', 'treble', 'vol', 'level', 'beat', 'kick', 'snare', 'hat'];

function jobGeometry(jobDir) {
  const html = readFileSync(join(jobDir, 'index.html'), 'utf8');
  const tag = html.match(/<[a-z]+\b[^>]*data-composition-id[^>]*>/i)?.[0] || '';
  const num = (n) => Number(tag.match(new RegExp(`${n}="([^"]+)"`))?.[1]);
  return { html, width: num('data-width') || 1080, height: num('data-height') || 1920, rootDuration: num('data-duration') };
}

function camBasis(azDeg = 0, elDeg = 0) {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  const dir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
  let right = [dir[2], 0, -dir[0]];
  const len = Math.hypot(...right) || 1;
  right = right.map((v) => v / len);
  const up = [dir[1] * right[2] - dir[2] * right[1], dir[2] * right[0] - dir[0] * right[2], dir[0] * right[1] - dir[1] * right[0]];
  return { camDir: dir, camUp: up };
}

export function buildShaderHtml({ id, job, table, box, canvasW, canvasH, width, height, duration, opacity, blend, cam }) {
  // Compact table: one row per frame [9 named values..., 24 bands...], plus TIME.
  const rows = table ? table.frames.map((f) => [...KEYS.map((k) => f[k]), ...f.bands]) : null;
  const css = `
      #root {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }
      #${id}-canvas {
        position: absolute;
        left: ${Math.round(box.x)}px;
        top: ${Math.round(box.y)}px;
        width: ${Math.round(box.w)}px;
        height: ${Math.round(box.h)}px;
        opacity: ${opacity};
        ${blend ? `mix-blend-mode: ${blend};` : ''}
      }`;
  const script = `
      (function () {
        var ID = ${JSON.stringify(id)};
        var DUR = ${duration};
        var FRAG = ${JSON.stringify(job.fragSource)};
        var INPUTS = ${JSON.stringify(job.inputs)};
        var ALPHA_MODE = ${job.alphaMode};
        var FPS = ${table ? table.fps : 24};
        var ROWS = ${rows ? JSON.stringify(rows) : 'null'};
        var CLOCK = ${table ? JSON.stringify(table.clock.time) : 'null'};
        var CAM_DIR = ${JSON.stringify(cam.camDir)}, CAM_UP = ${JSON.stringify(cam.camUp)};
        var KEYS = ${JSON.stringify(KEYS)};
        var W = ${canvasW}, H = ${canvasH};

        var canvas = document.getElementById(ID + "-canvas");
        canvas.width = W;
        canvas.height = H;
        var gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
        var ready = false, prog = null, loc = {};

        // Audio state at block time t: linear interpolation between table frames.
        // No table -> silence (every audio uniform 0, TIME = t).
        function stateAt(t) {
          var s = { time: t, bands: new Float32Array(24) };
          KEYS.forEach(function (k) { s[k] = 0; });
          if (!ROWS) return s;
          var x = Math.max(0, t * FPS), i = Math.min(ROWS.length - 1, Math.floor(x));
          var j = Math.min(ROWS.length - 1, i + 1), u = Math.min(1, x - i);
          var a = ROWS[i], b = ROWS[j];
          for (var k = 0; k < KEYS.length; k++) s[KEYS[k]] = a[k] + (b[k] - a[k]) * u;
          for (var n = 0; n < 24; n++) s.bands[n] = a[9 + n] + (b[9 + n] - a[9 + n]) * u;
          s.time = CLOCK[i] + (CLOCK[j] - CLOCK[i]) * u + (x > ROWS.length - 1 ? (x - (ROWS.length - 1)) / FPS : 0);
          return s;
        }

        // BIND, mirrored from the AditsShaders harness: a bound input follows the
        // band it names, otherwise the flat level.
        function bindValue(inp, A) {
          var panel = inp.DEFAULT;
          if (typeof panel !== "number") return panel;
          if (!inp.BIND || inp.BIND === "none" || inp.BIND.indexOf("gesture") === 0) return panel;
          var src = typeof A[inp.BIND] === "number" ? A[inp.BIND] : A.level;
          var depth = typeof inp.BIND_DEPTH === "number" ? inp.BIND_DEPTH : 1;
          var v = depth >= 0 ? panel + (inp.MAX - panel) * depth * src : panel + (panel - inp.MIN) * depth * src;
          return Math.min(inp.MAX, Math.max(inp.MIN, v));
        }

        function init() {
          if (!gl) return;
          var vs = gl.createShader(gl.VERTEX_SHADER);
          gl.shaderSource(vs, "attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }");
          gl.compileShader(vs);
          var fs = gl.createShader(gl.FRAGMENT_SHADER);
          gl.shaderSource(fs, FRAG);
          gl.compileShader(fs);
          if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) { console.error(ID + " shader compile: " + gl.getShaderInfoLog(fs)); return; }
          prog = gl.createProgram();
          gl.attachShader(prog, vs); gl.attachShader(prog, fs);
          gl.bindAttribLocation(prog, 0, "aPos");
          gl.linkProgram(prog);
          if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(ID + " link: " + gl.getProgramInfoLog(prog)); return; }
          gl.useProgram(prog);
          var buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
          ["TIME", "TIMEDELTA", "FRAMEINDEX", "PASSINDEX", "RENDERSIZE", "AUDIO_BASS", "AUDIO_MID", "AUDIO_TREBLE", "AUDIO_VOL",
           "AUDIO_LEVEL", "AUDIO_BEAT", "AUDIO_KICK", "AUDIO_SNARE", "AUDIO_HAT", "AUDIO_BANDS[0]", "CAM_DIR", "CAM_UP", "TRACK",
           "TRACK_ON", "HAND_OPEN", "ADITS_ALPHA_MODE", "ADITS_KEY_MODE", "ADITS_KEY_THR", "ADITS_KEY_SOFT", "ADITS_KEY_COLOR"]
            .forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
          INPUTS.forEach(function (inp) { loc["in:" + inp.NAME] = gl.getUniformLocation(prog, inp.NAME); });
          gl.viewport(0, 0, W, H);
          gl.disable(gl.BLEND);
          ready = true;
        }

        function draw(t) {
          if (!ready) return;
          var A = stateAt(t);
          var f1 = function (n, v) { if (loc[n]) gl.uniform1f(loc[n], v); };
          var i1 = function (n, v) { if (loc[n]) gl.uniform1i(loc[n], v); };
          var f3 = function (n, v) { if (loc[n]) gl.uniform3f(loc[n], v[0], v[1], v[2]); };
          f1("TIME", A.time); f1("TIMEDELTA", 1 / FPS);
          i1("FRAMEINDEX", Math.round(t * FPS)); i1("PASSINDEX", 0);
          if (loc.RENDERSIZE) gl.uniform2f(loc.RENDERSIZE, W, H);
          f1("AUDIO_BASS", A.bass); f1("AUDIO_MID", A.mid); f1("AUDIO_TREBLE", A.treble); f1("AUDIO_VOL", A.vol);
          f1("AUDIO_LEVEL", A.level); f1("AUDIO_BEAT", A.beat); f1("AUDIO_KICK", A.kick); f1("AUDIO_SNARE", A.snare); f1("AUDIO_HAT", A.hat);
          if (loc["AUDIO_BANDS[0]"]) gl.uniform1fv(loc["AUDIO_BANDS[0]"], A.bands);
          f3("CAM_DIR", CAM_DIR); f3("CAM_UP", CAM_UP); f3("TRACK", [0, 0, 0]); f1("TRACK_ON", 0); f1("HAND_OPEN", -1);
          i1("ADITS_ALPHA_MODE", ALPHA_MODE); i1("ADITS_KEY_MODE", 0); f1("ADITS_KEY_THR", 0.1); f1("ADITS_KEY_SOFT", 0.2); f3("ADITS_KEY_COLOR", [0, 0, 0]);
          INPUTS.forEach(function (inp) {
            var l = loc["in:" + inp.NAME];
            if (!l) return;
            if (inp.TYPE === "float") gl.uniform1f(l, bindValue(inp, A));
            else if (inp.TYPE === "long") gl.uniform1i(l, Math.round(bindValue(inp, A)));
            else if (inp.TYPE === "bool" || inp.TYPE === "event") gl.uniform1i(l, inp.DEFAULT ? 1 : 0);
            else if (inp.TYPE === "color" && inp.DEFAULT) gl.uniform4f(l, inp.DEFAULT[0], inp.DEFAULT[1], inp.DEFAULT[2], inp.DEFAULT[3]);
            else if (inp.TYPE === "point2D" && inp.DEFAULT) gl.uniform2f(l, inp.DEFAULT[0], inp.DEFAULT[1]);
          });
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.flush();
        }

        init();
        var tl = gsap.timeline({ paused: true });
        var driver = { _t: 0 };
        Object.defineProperty(driver, "t", {
          get: function () { return this._t; },
          set: function (v) { this._t = v; draw(v); },
        });
        tl.to(driver, { t: DUR, duration: DUR, ease: "none" }, 0);
        window.__timelines[ID] = tl;
        draw(0);
      })();`;

  try {
    new vm.Script(script, { filename: `${id}.inline.js` });
  } catch (err) {
    throw new Error(`Generated shader script for ${id} does not parse: ${err.message}`);
  }
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- Generated by tools/blocks/shader.mjs from AditsShaders "${job.name}". Regenerate instead of hand-editing. -->
  </head>
  <body>
    <template>
      <style>${css}
      </style>
      <div id="root" data-composition-id="${id}" data-width="${width}" data-height="${height}">
        <canvas id="${id}-canvas"></canvas>
      </div>
      <script>${script}
      </script>
    </template>
  </body>
</html>
`;
}

export async function generateShader(opts) {
  const jobDir = resolve(opts.job);
  const slug = String(opts.shader || '').replace(/\.(glsl|fs|frag)$/, '');
  const path = ['.glsl', '.fs', '.frag'].map((e) => join(SHADER_DIR, slug + e)).find((p) => existsSync(p));
  if (!path) throw new Error(`Shader "${slug}" not found in ${SHADER_DIR}`);
  const { prepareShader } = await import(`file:///${HARNESS.replace(/\\/g, '/')}`);
  const overrides = opts.inputs ? JSON.parse(opts.inputs) : {};
  const job = prepareShader(path, overrides);
  if (!job) throw new Error(`Shader header did not parse: ${path}`);

  const geo = jobGeometry(jobDir);
  const duration = Number(opts.duration) || geo.rootDuration || 10;
  const fps = Number(opts.fps) || 24;
  const id = opts.id || `shader-${slug}`;

  let table = null;
  if (opts.audio) {
    const out = join(jobDir, 'data', `${id}.audio.json`);
    table = await analyzeToFile(resolve(opts.audio), out, {
      fps, duration: duration + 1 / fps, offset: Number(opts['audio-offset'] || 0),
      clock: opts.clock || 'pulse', drive: opts.drive ?? 0.35,
    });
  }

  const fit = opts.fit || 'fill';
  let box;
  let canvasW;
  let canvasH;
  if (fit === 'square') {
    const size = Number(opts.size) || Math.round(geo.width * 0.7);
    const cx = Number(opts.x) || geo.width / 2;
    const cy = Number(opts.y) || geo.height * 0.45;
    box = { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
    canvasW = canvasH = Math.round(size * Number(opts.scale || 1));
  } else {
    const scale = Number(opts.scale || 0.5);
    box = { x: 0, y: 0, w: geo.width, h: geo.height };
    canvasW = Math.round(geo.width * scale);
    canvasH = Math.round(geo.height * scale);
  }
  const html = buildShaderHtml({
    id, job, table, box, canvasW, canvasH, width: geo.width, height: geo.height, duration,
    opacity: Number(opts.opacity ?? 1), blend: opts.blend || null, cam: camBasis(Number(opts.az || 0), Number(opts.el || 0)),
  });
  mkdirSync(join(jobDir, 'compositions'), { recursive: true });
  const outHtml = join(jobDir, 'compositions', `${id}.html`);
  writeFileSync(outHtml, html);

  const start = Number(opts.start || 0);
  const host = `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${start}" data-duration="${duration}" data-track-index="${opts.track || 2}" data-width="${geo.width}" data-height="${geo.height}"></div>`;
  if (opts.insert) {
    const h = geo.html;
    const existing = new RegExp(`<div id="${id}"[^>]*data-composition-src="compositions/${id}\\.html"[^>]*></div>`);
    if (existing.test(h)) writeFileSync(join(jobDir, 'index.html'), h.replace(existing, host));
    else {
      const idx = h.lastIndexOf('</div>', h.lastIndexOf('<script>', h.lastIndexOf('window.__timelines')));
      if (idx < 0) throw new Error('Could not find the root closing tag. Insert the host by hand.');
      writeFileSync(join(jobDir, 'index.html'), `${h.slice(0, idx)}  ${host}\n    ${h.slice(idx)}`);
    }
  }
  const warnings = [];
  if (TECHNIQUE_NOTES.has(slug)) warnings.push(`"${slug}" rebuilds a widely shared Shadertoy technique (per its description). Check before commercial use.`);
  if (geo.rootDuration && start + duration > geo.rootDuration + 1e-3) warnings.push(`Shader ends at ${start + duration} s, past the root duration ${geo.rootDuration} s.`);
  return { out: outHtml, host, shader: slug, fit, canvas: `${canvasW}x${canvasH}`, audio: Boolean(table), clock: table?.clock.mode || null, kicks: table?.kicks || [], warnings, meta: job.meta };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job || !a.shader) {
    console.error('Usage: shader.mjs --job <dir> --shader <slug> [--audio file --audio-offset s] [--fit fill|square] [--size px] [--x px --y px] [--scale 0.5] [--clock default|pulse|flywheel|tilt] [--drive 1] [--inputs json] [--opacity 1] [--blend mode] [--start s] [--duration s] [--id x] [--insert]');
    process.exit(2);
  }
  const res = await generateShader({ ...a, insert: Boolean(a.insert) });
  console.log(`Wrote ${res.out} (${res.shader}, ${res.fit}, canvas ${res.canvas}${res.audio ? `, audio clock ${res.clock}, ${res.kicks.length} kicks` : ', silent'})`);
  console.log(a.insert ? 'Host inserted into index.html' : `Host element:\n${res.host}`);
  for (const w of res.warnings) console.log(`WARNING: ${w}`);
}
