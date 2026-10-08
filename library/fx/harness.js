// fx harness: runs an unmodified Adits effect (or 3D environment) offline,
// one frame at a time, deterministically. Driven by tools/fx/fx.mjs, which
// serves this page, writes /work/job.json and collects /work/out/*.
//
// Determinism: performance.now / Date.now return the frame's timeline time,
// Math.random is a seeded mulberry32, requestAnimationFrame callbacks run once
// per frame. Effect parameters become hidden DOM inputs, so getElementById
// works as it does in the Adits UI. Effect-specific needs (a second media, app
// state) come from an optional shim module named in the job.

const job = await (await fetch('/work/job.json', { cache: 'no-store' })).json();
window.__fx = { state: 'starting', frame: 0, error: null, log: [] };
const log = (m) => { window.__fx.log.push(String(m)); if (window.__fx.log.length > 50) window.__fx.log.shift(); };
window.addEventListener('error', (e) => log(`error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => log(`rejection: ${e.reason?.message || e.reason}`));

// ---- deterministic clock, random and animation frames ----
let NOW = 0;
const EPOCH = Date.UTC(2026, 0, 1);
Object.defineProperty(performance, 'now', { value: () => NOW, configurable: true });
Date.now = () => EPOCH + Math.round(NOW);
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
Math.random = mulberry32(job.seed ?? 1);
let rafQueue = [];
window.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
window.cancelAnimationFrame = () => {};
const flushRaf = () => { const q = rafQueue; rafQueue = []; for (const cb of q) { try { cb(NOW); } catch (e) { log(`raf: ${e.message}`); } } };

// Link shaders synchronously: without KHR_parallel_shader_compile, Adits gl-link checks the link
// status at once instead of polling over animation frames (which left effects on their plain-frame
// fallback for an unknown number of frames, and shifted the random sequence).
for (const P of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
  const orig = P.getExtension;
  P.getExtension = function (name) { return name === 'KHR_parallel_shader_compile' ? null : orig.call(this, name); };
}

// ---- parameters as DOM inputs ----
const holder = document.createElement('div');
holder.style.display = 'none';
document.body.appendChild(holder);
export function setParam(id, value) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('input');
    el.id = id;
    holder.appendChild(el);
  }
  const range = job.ranges?.[id];
  if (typeof value === 'boolean') { el.type = 'checkbox'; el.checked = value; el.value = value ? 'on' : ''; }
  else if (range) {
    // A real range input, as in the Adits UI: the browser clamps and snaps values the same way.
    el.type = 'range'; el.min = String(range[0]); el.max = String(range[1]); el.step = String(range[2]); el.value = String(value);
  } else if (typeof value === 'number') { el.type = 'number'; el.step = 'any'; el.value = String(value); }
  else { el.type = 'text'; el.value = String(value); }
}
for (const [id, v] of Object.entries(job.params || {})) setParam(id, v);

// ---- canvases and the fake videoEngine ----
const W = job.width;
const H = job.height;
const out = document.createElement('canvas');
out.width = W; out.height = H;
document.body.appendChild(out);
const ctx = out.getContext('2d'); // with alpha, as in Adits; flattened on black for opaque output
const flat = document.createElement('canvas');
flat.width = W; flat.height = H;
const fctx = flat.getContext('2d', { alpha: false });
// The source frame. Default: one reused canvas with video-like fields, redrawn every frame.
// job.options.media === 'video': a real, paused <video> of the whole source clip, seeked to each
// frame's time (FrameTunnel samples the clip itself by seeking). play() is disabled so playback
// never runs on the wall clock.
const realVideo = job.options?.media === 'video';
let media;
let mctx = null;
if (realVideo) {
  media = document.createElement('video');
  media.muted = true; media.playsInline = true; media.preload = 'auto'; media.crossOrigin = 'anonymous';
  media.src = `/work/${job.sourceFile}`;
  await new Promise((resolve, reject) => { media.addEventListener('loadeddata', resolve, { once: true }); media.addEventListener('error', () => reject(new Error('source video failed to load')), { once: true }); });
  media.play = () => Promise.resolve();
} else {
  media = document.createElement('canvas');
  media.width = W; media.height = H;
  mctx = media.getContext('2d');
  Object.assign(media, { videoWidth: W, videoHeight: H, readyState: 4, paused: false, currentTime: 0, duration: job.frames / job.fps, muted: true, loop: false });
  media.play = () => Promise.resolve();
  media.pause = () => {};
}
async function seekVideo(t) {
  if (Math.abs(media.currentTime - t) < 1e-4) return;
  await new Promise((resolve) => { media.addEventListener('seeked', resolve, { once: true }); media.currentTime = t; });
  // An unseekable source (no byte ranges) still fires 'seeked', with currentTime back at 0.
  if (Math.abs(media.currentTime - t) > 0.05) throw new Error(`seek to ${t.toFixed(3)} s landed at ${media.currentTime.toFixed(3)} s`);
}
const offCanvas = document.createElement('canvas');
offCanvas.width = W; offCanvas.height = H;
const videoEngine = {
  targetW: W, targetH: H, canvas: out, ctx, activeMedia: media,
  offCanvas, offCtx: offCanvas.getContext('2d'), params: { ...(job.vparams || {}) },
};
// Adits app state as during its own offline export (post-processing), which effects check.
window.app = { state: { isPostProcessing: true, postProcessCurrentTime: 0, isPlaying: true, isImageMode: false, activeMedia: media }, dom: {}, drawFrameSingle() {}, videoEngine };

// Optional second media (side B for SplitScreen / RevealUnder): its own frames, advanced at
// the effect's B speed (job.options.bSpeedParam), drawn into one reused canvas.
let media2 = null;
if (job.frames2 > 0) {
  media2 = document.createElement('canvas');
  media2.width = W; media2.height = H;
  Object.assign(media2, { videoWidth: W, videoHeight: H, readyState: 4 });
}

if (job.webgpu) {
  if (!navigator.gpu) throw new Error('WebGPU is not available in this browser');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter');
  const device = await adapter.requestDevice();
  const format = navigator.gpu.getPreferredCanvasFormat();
  const gpuCanvas = document.createElement('canvas');
  gpuCanvas.width = W; gpuCanvas.height = H;
  const gpuContext = gpuCanvas.getContext('webgpu');
  gpuContext.configure({ device, format, alphaMode: 'premultiplied' });
  Object.assign(videoEngine, { gpuDevice: device, gpuContext, gpuFormat: format, gpuCanvas });
}

async function loadImage(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

const shim = job.shim ? await import(job.shim) : null;
const env = { job, videoEngine, media, media2, out, ctx, setParam, loadImage, log, flushRaf, now: () => NOW, setNow: (t) => { NOW = t; } };
// Cover crop in source pixels, as Adits computes it (core/video-engine.js); the frame canvas is already W x H.
function coverCrop(sw0, sh0) {
  const s = Math.max(W / sw0, H / sh0);
  const sw = W / s; const sh = H / s;
  return { sx: (sw0 - sw) / 2, sy: (sh0 - sh) / 2, sw, sh };
}
const crop = realVideo ? coverCrop(media.videoWidth, media.videoHeight) : { sx: 0, sy: 0, sw: W, sh: H };
const silent = { bass: 0, mid: 0, treble: 0, volume: 0, vol: 0, level: 0 };

/** Deferred shader linking polls with requestAnimationFrame: render (output discarded) and fire
 *  rAF until every job.options.ready property is set, then fail loudly if WebGL setup failed
 *  (the effects otherwise fall back to the plain frame without a word). */
async function warmUp(effect) {
  if (effect.isGPU && videoEngine.gpuDevice) {
    // Adits starts initGPU unawaited; some effects (BlowPixels) finish init from renderGPU.
    for (let k = 0; k < 1000 && !effect.pipelineReady; k++) {
      try { effect.renderGPU?.(videoEngine, media, crop, silent); } catch (e) { log(`warm-up renderGPU: ${e.message}`); }
      await new Promise((r) => setTimeout(r, 10));
    }
    if (!effect.pipelineReady) throw new Error('WebGPU pipeline not ready after warm-up');
  }
  const ready = job.options?.ready || [];
  if (!ready.length) return;
  for (let k = 0; k < 600; k++) {
    effect.render(ctx, videoEngine, media, crop, silent);
    flushRaf();
    if (ready.every((p) => effect[p])) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  const missing = ready.filter((p) => !effect[p]);
  if (missing.length) throw new Error(`effect not ready after warm-up: ${missing.join(', ')}`);
  if (effect._glFailed) throw new Error('effect reports _glFailed (WebGL setup failed)');
}

try {
  const mod = await import(job.module);
  const Cls = mod[job.className] || mod.default;
  const effect = shim?.create ? await shim.create(Cls, env) : new Cls();
  effect.init?.(out, ctx, { analyze: () => ({}) });
  if (job.webgpu && effect.initGPU) await effect.initGPU(videoEngine);
  const pad = (n) => String(n).padStart(6, '0');
  if (realVideo) await seekVideo(job.srcStart || 0);
  else if (job.input !== false) mctx.drawImage(await loadImage(`/work/in/${pad(1)}.png`), 0, 0, W, H);
  if (media2) media2.getContext('2d').drawImage(await loadImage(`/work/in2/${pad(1)}.png`), 0, 0, W, H);
  if (shim?.setup) await shim.setup(effect, env);
  await warmUp(effect);
  if (shim?.afterWarmUp) await shim.afterWarmUp(effect, env);
  // Settle: async work an effect starts on its first render (FrameTunnel samples the clip) must
  // finish first; the probe render's output is discarded.
  const settle = job.options?.settle || [];
  if (settle.length) {
    effect.render(ctx, videoEngine, media, crop, silent);
    for (let k = 0; k < 6000 && settle.some((p) => effect[p]); k++) await new Promise((r) => setTimeout(r, 10));
    if (settle.some((p) => effect[p])) throw new Error(`effect did not settle: ${settle.filter((p) => effect[p]).join(', ')}`);
    if (realVideo) await seekVideo(job.srcStart || 0);
  }
  window.__fx.state = 'running';
  for (let i = 0; i < job.frames; i++) {
    NOW = (job.options?.clockOffset || 0) + (i * 1000) / job.fps;
    if (!realVideo) media.currentTime = i / job.fps;
    window.app.state.postProcessCurrentTime = i / job.fps;
    if (realVideo) await seekVideo((job.srcStart || 0) + i / job.fps);
    else if (job.input !== false) {
      const img = await loadImage(`/work/in/${pad(i + 1)}.png`);
      mctx.drawImage(img, 0, 0, W, H);
    }
    // As the Adits main loop does (core/main.js): clear, reset the context state, then dispatch.
    ctx.clearRect(0, 0, W, H);
    ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (media2) {
      const speed = Number(job.params?.[job.options?.bSpeedParam] ?? 1) || 1;
      const k = Math.min(job.frames2 - 1, Math.floor(i * speed));
      media2.getContext('2d').drawImage(await loadImage(`/work/in2/${pad(k + 1)}.png`), 0, 0, W, H);
    }
    const audio = job.audio?.[i] || silent;
    if (shim?.beforeFrame) await shim.beforeFrame(effect, i, env, audio);
    effect.update?.(NOW, audio);
    let r;
    if (shim?.render) r = shim.render(effect, i, env, audio);
    else if (effect.isGPU && videoEngine.gpuDevice) {
      // GPU dispatch as in Adits: renderGPU, then draw the WebGPU canvas in the same synchronous block.
      const handled = effect.renderGPU(videoEngine, media, crop, audio);
      if (handled !== false) ctx.drawImage(videoEngine.gpuCanvas, 0, 0, W, H);
      else log(`frame ${i}: renderGPU declined`);
      effect.postRender?.(ctx, videoEngine, media, crop, audio);
    } else r = effect.render(ctx, videoEngine, media, crop, audio);
    if (r && typeof r.then === 'function') await r;
    flushRaf();
    if (i >= (job.skip || 0)) { // pre-roll frames are rendered for history, not saved
      let src = out;
      if (!job.alpha) { fctx.fillStyle = '#000'; fctx.fillRect(0, 0, W, H); fctx.drawImage(out, 0, 0); src = flat; }
      const blob = await new Promise((resolve) => src.toBlob(resolve, 'image/png'));
      await fetch(`/work/out/${pad(i + 1)}.png`, { method: 'PUT', body: blob });
    }
    window.__fx.frame = i + 1;
  }
  window.__fx.state = 'done';
} catch (e) {
  window.__fx.state = 'error';
  window.__fx.error = `${e.message}\n${e.stack || ''}`;
}
