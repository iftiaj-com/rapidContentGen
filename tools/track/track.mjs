// rcg track: MediaPipe face and hand tracking over a clip (Adits' FaceLandmarker and
// HandLandmarker, tasks-vision 0.10.35, run offline by library/vision/vision.js).
// Every frame is inferred with frame-time timestamps, so the same clip gives the same data.
//
// Output (data/track-<name>.json), per frame at --fps, in the SOURCE frame's normalized
// coordinates (0..1, not cropped; consumers map it through their own fit):
//   face:  cx, cy (box centre), w, h (box size), ex, ey (between the eyes), roll (deg),
//          size (eye distance / frame height), present; smoothed with a One-Euro filter on
//          frame time, short gaps held (--hold s), raw values kept under face.raw.
//   hands: per side (Left/Right as MediaPipe labels them): palm x/y, size, pinch, open
//          (Adits GestureEngine formulas), gesture (Adits' geometric fallback: Open_Palm,
//          Closed_Fist, Victory, Thumb_Up, None), pinched (hysteresis 0.22/0.30), present.
//   events: gestures held for at least 120 ms (Adits' TRIGGER_HOLD_MS), as time ranges.
//
// Usage:
//   node tools/track/track.mjs --job <dir> --src assets/x.mp4 [--start 0] [--duration d] [--fps 30]
//        [--width <=1080] [--no-face] [--no-hands] [--faces 1] [--hands 2] [--gpu] [--hold 0.5]
//        [--debug] [--out data/track-x.json]
// --debug also writes renders/track-<name>-debug.mp4 and a frame sheet (boxes, points, hand skeletons).

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { heavySlot } from '../lib/lock.mjs';
import { contactSheet, probe } from '../lib/ffmpeg.mjs';
import { extractFrames, ff, runVisionPage } from './common.mjs';

const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10000) / 10000);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** One-Euro filter (Casiez et al. 2012) on frame time; the Adits anamorphic camera uses the same filter on wall time. */
export function oneEuro(values, times, { minCutoff = 1.0, beta = 0.5, dCutoff = 1.0 } = {}) {
  const out = new Array(values.length).fill(null);
  let xPrev = null;
  let dxPrev = 0;
  let tPrev = null;
  const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (x == null) { xPrev = null; tPrev = null; dxPrev = 0; continue; }
    if (xPrev == null) { out[i] = x; xPrev = x; tPrev = times[i]; continue; }
    const dt = Math.max(1e-4, times[i] - tPrev);
    const dx = (x - xPrev) / dt;
    const edx = dxPrev + alpha(dCutoff, dt) * (dx - dxPrev);
    const cutoff = minCutoff + beta * Math.abs(edx);
    const xf = xPrev + alpha(cutoff, dt) * (x - xPrev);
    out[i] = xf; xPrev = xf; dxPrev = edx; tPrev = times[i];
  }
  return out;
}

/** Hold the last value across gaps up to `maxFrames`; returns [values, present flags]. */
function holdGaps(values, maxFrames) {
  const out = values.slice();
  const present = values.map((v) => (v == null ? 0 : 1));
  let last = null;
  let gap = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] != null) { last = out[i]; gap = 0; continue; }
    gap++;
    if (last != null && gap <= maxFrames) out[i] = last;
  }
  return [out, present];
}

// Isotropic distance: normalized x/y scaled to source pixels, divided by the frame height
// (Adits measures in normalized x/y, which stretches distances on 9:16 frames).
const distFn = (W, H) => (a, b) => Math.hypot((a[0] - b[0]) * W, (a[1] - b[1]) * H) / H;

/** Adits GestureEngine._processHands (574-620) and the geometric gesture fallback (627-640). */
export function handSignals(lm, W, H) {
  const d = distFn(W, H);
  const palmIdx = [0, 5, 9, 13, 17];
  const palm = [0, 1].map((k) => palmIdx.reduce((s, i) => s + lm[i][k], 0) / palmIdx.length);
  const size = d(lm[0], lm[9]);
  const pinch = clamp01(d(lm[4], lm[8]) / (size * 2));
  const open = clamp01(([8, 12, 16, 20].reduce((s, i) => s + d(lm[0], lm[i]), 0) / 4 / size - 0.9) / 1.0);
  const ext = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, pip]) => d(lm[tip], lm[0]) > d(lm[pip], lm[0]) * 1.25);
  const n = ext.filter(Boolean).length;
  let gesture = 'None';
  if (n === 4) gesture = 'Open_Palm';
  else if (n === 2 && ext[0] && ext[1]) gesture = 'Victory';
  else if (n === 0 && lm[4][1] < lm[3][1] && lm[4][1] < lm[0][1] - size * 0.3) gesture = 'Thumb_Up';
  else if (n === 0) gesture = 'Closed_Fist';
  return { palm, size, pinch, open, gesture };
}

/** Raw per-frame vision output -> column arrays of face and hand signals. */
export function deriveTrack(raw, { fps, width: W, height: H, holdSeconds = 0.5 }) {
  const N = raw.frames.length;
  const times = Array.from({ length: N }, (_, i) => i / fps);
  const d = distFn(W, H);
  const col = () => new Array(N).fill(null);
  const fr = { cx: col(), cy: col(), w: col(), h: col(), ex: col(), ey: col(), roll: col(), size: col() };
  raw.frames.forEach((f, i) => {
    const face = f.faces?.[0];
    if (!face) return;
    const [x0, y0, x1, y1] = face.box;
    const p = face.pts;
    fr.cx[i] = (x0 + x1) / 2; fr.cy[i] = (y0 + y1) / 2; fr.w[i] = x1 - x0; fr.h[i] = y1 - y0;
    const eR = p.eyeROuter, eL = p.eyeLOuter;
    if (eR && eL) {
      fr.ex[i] = (eR[0] + eL[0]) / 2; fr.ey[i] = (eR[1] + eL[1]) / 2;
      fr.roll[i] = (Math.atan2((eL[1] - eR[1]) * H, (eL[0] - eR[0]) * W) * 180) / Math.PI;
      fr.size[i] = d(eR, eL);
    }
  });
  const holdFrames = Math.round(holdSeconds * fps);
  const face = { raw: {} , present: null };
  for (const [k, arr] of Object.entries(fr)) {
    face.raw[k] = arr.map(r4);
    const smooth = oneEuro(arr, times, k === 'roll' ? { minCutoff: 1.0, beta: 0.02 } : { minCutoff: 1.0, beta: 0.5 });
    const [held, present] = holdGaps(smooth, holdFrames);
    face[k] = held.map(r4);
    if (!face.present) face.present = present;
  }

  // Hands, grouped by MediaPipe's handedness label (the only identity it gives across frames).
  const sides = {};
  const pinchState = {};
  raw.frames.forEach((f, i) => {
    for (const h of f.hands || []) {
      const side = h.side || 'Unknown';
      const s = sides[side] || (sides[side] = { side, x: col(), y: col(), size: col(), pinch: col(), open: col(), gesture: new Array(N).fill(null), pinched: new Array(N).fill(0) });
      if (s.x[i] != null) continue; // two hands with the same label: keep the first
      const g = handSignals(h.lm, W, H);
      s.x[i] = g.palm[0]; s.y[i] = g.palm[1]; s.size[i] = g.size; s.pinch[i] = g.pinch; s.open[i] = g.open; s.gesture[i] = g.gesture;
      const was = pinchState[side] || false;
      const now = was ? g.pinch < 0.30 : g.pinch < 0.22; // Adits: closes below 0.22, re-arms above 0.30
      pinchState[side] = now;
      s.pinched[i] = now ? 1 : 0;
    }
  });
  const hands = Object.values(sides).map((s) => {
    const out = { side: s.side, present: s.x.map((v) => (v == null ? 0 : 1)), gesture: s.gesture, pinched: s.pinched };
    for (const k of ['x', 'y', 'size', 'pinch', 'open']) out[k] = oneEuro(s[k], times, { minCutoff: 1.0, beta: 0.5 }).map(r4);
    return out;
  });

  // Gesture events: a gesture (or a pinch) held for at least 120 ms.
  const minFrames = Math.max(1, Math.ceil(0.12 * fps));
  const events = [];
  for (const h of hands) {
    const label = (i) => (h.pinched[i] ? 'Pinch' : h.gesture[i]);
    let cur = null;
    let start = 0;
    for (let i = 0; i <= N; i++) {
      const g = i < N ? label(i) : null;
      if (g !== cur) {
        if (cur && cur !== 'None' && i - start >= minFrames) events.push({ gesture: cur, side: h.side, start: r4(start / fps), end: r4(i / fps) });
        cur = g; start = i;
      }
    }
  }
  events.sort((a, b) => a.start - b.start);
  const count = (a) => a.reduce((s, v) => s + (v ? 1 : 0), 0);
  return {
    frames: N, times: times.map(r4), face, hands, events,
    summary: {
      faceFrames: count(face.present), handFrames: Object.fromEntries(hands.map((h) => [h.side, count(h.present)])),
      gestures: events.reduce((m, e) => ((m[e.gesture] = (m[e.gesture] || 0) + 1), m), {}),
    },
  };
}

export async function runTrack(opts) {
  const jobDir = resolve(opts.job);
  const src = resolve(jobDir, opts.src || '');
  if (!opts.src || !existsSync(src)) throw new Error(`--src not found: ${opts.src}`);
  const info = await probe(src);
  const start = Number(opts.start || 0);
  const duration = Number(opts.duration || info.duration - start);
  const fps = Number(opts.fps) || Math.min(30, Math.round(info.video.fps || 24));
  const sw = info.video.width;
  const sh = info.video.height;
  const width = Math.round(Number(opts.width || Math.min(sw, 1080)) / 2) * 2;
  const height = Math.round((width * sh) / sw / 2) * 2;
  const name = opts.name || basename(opts.src).replace(/\.\w+$/, '');
  const release = await heavySlot('track', jobDir, opts);
  const work = mkdtempSync(join(tmpdir(), 'rcg-track-'));
  const t0 = Date.now();
  try {
    const frames = await extractFrames(src, { start, duration, fps, width, height }, join(work, 'in'));
    if (!frames) throw new Error('No frames extracted');
    const job = {
      task: 'track', frames, fps, width, height, delegate: opts.gpu ? 'GPU' : 'CPU',
      face: !opts['no-face'], hands: !opts['no-hands'], numFaces: Number(opts.faces || 1), numHands: Number(opts.hands || 2),
      debug: Boolean(opts.debug),
    };
    const state = await runVisionPage(work, job, { onProgress: opts.onProgress });
    const raw = JSON.parse(readFileSync(join(work, 'out', 'track.json'), 'utf8'));
    const derived = deriveTrack(raw, { fps, width: sw, height: sh, holdSeconds: Number(opts.hold ?? 0.5) });
    const doc = {
      version: 1, tool: 'rcg track', engine: `MediaPipe tasks-vision 0.10.35 (${state.info?.delegate || job.delegate})`,
      src: relative(jobDir, src).split('\\').join('/'), start, duration: +(frames / fps).toFixed(4), fps, width: sw, height: sh,
      coords: 'normalized 0..1 in the source frame (uncropped)', ...derived,
    };
    const outRel = opts.out || `data/track-${name}.json`;
    const outAbs = resolve(jobDir, outRel);
    mkdirSync(resolve(outAbs, '..'), { recursive: true });
    writeFileSync(outAbs, JSON.stringify(doc));
    let debug = null;
    if (opts.debug) {
      const dbgRel = `renders/track-${name}-debug.mp4`;
      const dbgAbs = resolve(jobDir, dbgRel);
      mkdirSync(resolve(dbgAbs, '..'), { recursive: true });
      await ff(['-framerate', String(fps), '-start_number', '1', '-i', join(work, 'dbg', '%06d.png'), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', dbgAbs]);
      const sheet = dbgAbs.replace(/\.mp4$/, '-sheet.png');
      const n = 8;
      await contactSheet(dbgAbs, sheet, { times: Array.from({ length: n }, (_, k) => +((doc.duration * (k + 0.5)) / n).toFixed(2)), cols: 8, thumbWidth: 220 });
      debug = { video: dbgRel, sheet };
    }
    return { out: outRel.split('\\').join('/'), frames, fps, seconds: +((Date.now() - t0) / 1000).toFixed(1), summary: doc.summary, events: doc.events, engine: doc.engine, console: state.console, debug };
  } finally {
    release();
    if (!opts['keep-frames']) rmSync(work, { recursive: true, force: true });
    else console.log(`frames kept in ${work}`);
  }
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job || !a.src) {
    console.error('Usage: track.mjs --job <dir> --src <clip> [--start s] [--duration s] [--fps n] [--width <=1080] [--no-face] [--no-hands] [--gpu] [--debug] [--out data/track-x.json]');
    process.exit(2);
  }
  const r = await runTrack({ ...a, onProgress: (f, n) => { if (f % 60 === 0 || f === n) process.stdout.write(`  frame ${f}/${n}\n`); } });
  console.log(`Wrote ${r.out}: ${r.frames} frames at ${r.fps} fps in ${r.seconds} s (${r.engine})`);
  console.log(`  face in ${r.summary.faceFrames}/${r.frames} frames; hands ${JSON.stringify(r.summary.handFrames)}; gestures ${JSON.stringify(r.summary.gestures)}`);
  for (const e of r.events.slice(0, 20)) console.log(`  ${e.start.toFixed(2)}-${e.end.toFixed(2)} s  ${e.gesture} (${e.side})`);
  if (r.events.length > 20) console.log(`  ... ${r.events.length - 20} more events`);
  if (r.console?.length) console.log(`  page console (${r.console.length}):\n    ${r.console.join('\n    ')}`);
  if (r.debug) console.log(`Debug: ${r.debug.video}\nSheet: ${r.debug.sheet}`);
}
