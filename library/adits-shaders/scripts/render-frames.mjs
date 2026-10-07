#!/usr/bin/env node
// Frame-sequence renderer: one shader, N transparent PNG frames, no browser
// window and no video machinery.
//
//   node scripts/render-frames.mjs --shader petal-bloom --duration 16 --out ./frames
//   node scripts/render-frames.mjs --shader petal-bloom --frames 480 --fps 30 --size 768
//   node scripts/render-frames.mjs --shader petal-bloom --duration 8 --audio-track a.json
//   node scripts/render-frames.mjs --shader petal-bloom --frames 900 --start 450 --gpu
//
// This is the deterministic half of the video pipeline. scripts/render.mjs
// answers "does this shader look right", this answers "give me every frame of
// it", and both compile and draw through scripts/lib/offline-shader.mjs so the
// uniform contract keeps one definition.
//
// Frames are square and transparent on purpose: ASPECT is "square" across the
// corpus, and the compositor (Automation Studio) is what places the object over
// footage at whatever aspect the output needs. Baking a backdrop in here would
// make the frames uncompositable, which is the trap render.mjs walks into by
// design.
//
// -- Why an HTTP sink instead of --dump-dom ---------------------------------
// runHeadless() returns results as base64 inside a scraped DOM under a 256 MB
// stdout cap: fine for one still, hopeless for hundreds of frames. Here Node
// serves the page and the page POSTs each encoded frame back, so memory stays
// flat, the frame count is unbounded, and awaiting each POST gives natural
// backpressure -- the page cannot outrun the disk.
//
// -- Determinism -----------------------------------------------------------
// TIME is i/fps and FRAMEINDEX is i, both computed, never sampled from a clock.
// Audio comes from a precomputed per-frame table. Two runs of the same
// arguments produce the same frames, which is what makes an exact loop
// (frames = LOOP * fps) and unattended CI rendering possible.

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  camBasis,
  findBrowser,
  PAGE_GL_RUNTIME,
  prepareShader,
} from './lib/offline-shader.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const SHADER_EXTS = ['.glsl', '.fs', '.frag'];

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};

const shaderArg = flag('shader', argv.find((a) => !a.startsWith('--')) ?? '');
const fps = parseInt(flag('fps', '30'), 10);
const size = parseInt(flag('size', '1024'), 10);
const outDir = resolve(flag('out', join(root, 'video-frames')));
const audioFlat = parseFloat(flag('audio', '0'));
const trackFile = flag('audio-track', '');
const quiet = argv.includes('--quiet');
// --gpu renders through the real graphics adapter (ANGLE on D3D11) instead of
// SwiftShader. Measured on a GTX 1650 at 1080²: ~150 ms/frame against ~770 ms.
// Off by default: SwiftShader is the reproducible reference and works on any
// machine; the GPU path depends on the driver and is opt-in for whoever measured it.
const useGpu = argv.includes('--gpu');
// --start N renders frames N..N+FRAMES-1 and names them by their absolute index,
// so a long sequence can be split across processes and the parts concatenated.
// TIME and FRAMEINDEX follow the absolute index, so a shard is bit-identical to
// the same frames from an unsharded run.
const startFrame = parseInt(flag('start', '0'), 10) || 0;

const camArg = flag('cam', '0,0').split(',').map(Number);
const { camDir, camUp } = camBasis(camArg[0] || 0, camArg[1] || 0);

// --set NAME=VALUE overrides one declared input, same syntax as render.mjs.
const overrides = {};
argv.forEach((a, i) => {
  if (a !== '--set') return;
  const pair = argv[i + 1] ?? '';
  const eq = pair.indexOf('=');
  if (eq === -1) return;
  const key = pair.slice(0, eq);
  const raw = pair.slice(eq + 1);
  if (raw === 'true' || raw === 'false') overrides[key] = raw === 'true';
  else if (raw.includes(',')) overrides[key] = raw.split(',').map(Number);
  else overrides[key] = Number(raw);
});

function die(msg) {
  console.error(`render-frames: ${msg}`);
  process.exit(1);
}

if (!shaderArg) die('need --shader <slug|path>');

function resolveShaderPath(name) {
  const direct = resolve(name);
  if (existsSync(direct) && SHADER_EXTS.includes(extname(direct))) return direct;
  for (const ext of SHADER_EXTS) {
    const p = join(root, 'shaders', name + ext);
    if (existsSync(p)) return p;
  }
  return null;
}

const shaderPath = resolveShaderPath(shaderArg);
if (!shaderPath) die(`no such shader: ${shaderArg}`);

const job = prepareShader(shaderPath, overrides);
if (!job) die(`unparsable header: ${shaderArg}`);

// Frame count: --frames wins, else --duration, else the shader's own LOOP so a
// bare invocation yields exactly one seamless cycle.
let frameCount;
if (flag('frames', null)) frameCount = parseInt(flag('frames'), 10);
else if (flag('duration', null)) frameCount = Math.round(parseFloat(flag('duration')) * fps);
else if (job.meta.loop) frameCount = Math.round(job.meta.loop * fps);
else die('no --frames, no --duration, and this shader declares no LOOP');
if (!Number.isFinite(frameCount) || frameCount < 1) die('frame count must be at least 1');

// Per-frame audio table. Absent means silence, the state every shader must look
// finished in.
let audioFrames = null;
if (trackFile) {
  const parsed = JSON.parse(readFileSync(resolve(trackFile), 'utf8'));
  audioFrames = Array.isArray(parsed) ? parsed : parsed.frames;
  if (!Array.isArray(audioFrames)) die(`${trackFile} has no frames array`);
}

const browser = findBrowser();
if (!browser) die('no Chrome or Edge found (set ADITS_BROWSER)');

mkdirSync(outDir, { recursive: true });

const pageScript = `${PAGE_GL_RUNTIME}
const JOB = ${JSON.stringify(job)};
const SIZE = ${size};
const FPS = ${fps};
const FRAMES = ${frameCount};
const START = ${startFrame};
const AUDIO_FLAT = ${audioFlat};
const TRACK = ${audioFrames ? JSON.stringify(audioFrames) : 'null'};
const CAM = { camDir: ${JSON.stringify(camDir)}, camUp: ${JSON.stringify(camUp)} };

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', body });
  if (!res.ok) throw new Error(path + ' -> ' + res.status);
}

(async () => {
  try {
    const ctx = createGL(SIZE, SIZE);
    for (let k = 0; k < FRAMES; k++) {
      const i = START + k;
      // Hold the last analysed entry if the table runs short, so a rounding
      // difference between the audio pass and the frame count cannot drop the
      // drive to silence part-way through a render.
      const state = TRACK ? (TRACK[i] || TRACK[TRACK.length - 1]) : null;
      const drawn = drawJob(ctx, JOB, SIZE, SIZE, {
        time: i / FPS,
        frameIndex: i,
        fps: FPS,
        audio: AUDIO_FLAT,
        audioState: state,
        camDir: CAM.camDir,
        camUp: CAM.camUp,
      });
      if (!drawn.ok) { await post('/fail', 'compile: ' + drawn.log); return; }

      // toBlob on the GL canvas hands back straight-alpha PNG (the browser
      // undoes the premultiply it stored), which is what an ffmpeg overlay
      // expects to receive.
      const blob = await new Promise((r) => ctx.canvas.toBlob(r, 'image/png'));
      if (!blob) { await post('/fail', 'frame ' + i + ' encoded to nothing'); return; }
      await post('/f/' + i, blob);
    }
    await post('/done', 'ok');
  } catch (e) {
    try { await post('/fail', String((e && e.message) || e)); } catch (_) { /* sink gone */ }
  }
})();
`;

const work = mkdtempSync(join(tmpdir(), 'adits-frames-'));
const profile = join(work, 'profile');
const slug = basename(shaderPath).replace(/\.(glsl|fs|frag)$/i, '');

let received = 0;
let failure = null;
let lastActivity = Date.now();
let settle;
const finished = new Promise((r) => { settle = r; });

const server = createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><body style="margin:0">`
      + `<script>${pageScript}</` + `script></body>`);
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    lastActivity = Date.now();
    res.writeHead(200);
    res.end('ok');
    if (req.url.startsWith('/f/')) {
      const i = parseInt(req.url.slice(3), 10);
      writeFileSync(join(outDir, `${slug}-${String(i).padStart(6, '0')}.png`), body);
      received++;
      if (!quiet && (received % 15 === 0 || received === frameCount)) {
        process.stdout.write(`\r  ${slug}: ${received}/${frameCount} frames`);
      }
      return;
    }
    if (req.url === '/fail') failure = body.toString('utf8');
    if (req.url === '/done' || req.url === '/fail') settle();
  });
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  const gl = useGpu
    ? ['--use-angle=d3d11', '--enable-gpu-rasterization']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const child = spawn(browser, [
    '--headless=new',
    '--disable-gpu-sandbox',
    ...gl,
    '--ignore-gpu-blocklist',
    // A dedicated profile forces a fresh browser process. Without it an
    // already-running Chrome swallows the URL as a tab in the existing instance
    // and every flag above is silently ignored.
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    `http://127.0.0.1:${port}/`,
  ], { stdio: 'ignore' });

  // Stall guard: a wedged GPU process or a shader that hangs the rasterizer
  // would otherwise leave this waiting forever. Measured from the last frame
  // received, not from the start, so a slow COST:high shader is not cut off
  // merely for being slow.
  const stallMs = parseInt(flag('stall-timeout', '120000'), 10);
  const watchdog = setInterval(() => {
    if (Date.now() - lastActivity > stallMs) {
      failure = `no frame for ${Math.round(stallMs / 1000)}s (stalled at ${received}/${frameCount})`;
      settle();
    }
  }, 2000);

  child.on('exit', (code) => {
    // A browser that dies before /done is a failure the page could not report.
    if (received < frameCount && !failure) {
      failure = `browser exited (code ${code}) after ${received}/${frameCount} frames`;
      settle();
    }
  });

  finished.then(() => {
    clearInterval(watchdog);
    try { child.kill(); } catch { /* already gone */ }
    server.close();
    // Best-effort: Chrome keeps handles on its profile briefly after the kill,
    // and on Windows that makes the unlink fail. The directory sits under the OS
    // temp root, so losing the race costs nothing worth reporting.
    try {
      rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch { /* temp dir, the OS will sweep it */ }
    if (!quiet) process.stdout.write('\n');
    if (failure) die(failure);
    if (received !== frameCount) die(`wrote ${received} of ${frameCount} frames`);
    if (!quiet) {
      console.log(`${slug}: ${received} frames at ${size}x${size}, ${fps}fps `
        + `(${(received / fps).toFixed(2)}s) -> ${outDir}`);
    }
    process.exit(0);
  });
});
