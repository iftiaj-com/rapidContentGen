#!/usr/bin/env node
// cine.mjs: measure and prepare shots for the cinematic skills (style-cinematic-long, style-cinematic-short).
// Code measures (cuts, screen motion, shake, exposure, colour, rough shot size); the agent judges
// (flow, variety, which shots stay, the look).
//
//   node .agents/skills/style-cinematic-long/scripts/cine.mjs measure <job> [--src assets/a.mp4,assets/b.mp4] [--hz 10]
//        every intake video (or --src) -> data/cine/shots.json, shots.md (one line per shot + flags),
//        shots-<n>.png (the middle frame of each shot, labelled with its id). A render or a prepped
//        clip (--src renders/... or assets/cine/...) writes render-flow.* / prep-flow.* instead, so the
//        source measurements stay; --out <name> picks the name.
//   ... prep <job> [--plan data/cine/prep.json] [--fps 24] [--room 1.33]
//        one clip per plan item -> assets/cine/<id>.mp4: trim, stabilize, reverse, flip, colour match,
//        speed with frame-blend motion blur, sources larger than the room camera moves need
//        downsized with lanczos (room x the job's format); then re-measured -> data/cine/prep.out.json (heavy-work slot)
//   ... demo   self-check on synthetic clips made with ffmpeg (no user media, no network)
//
// Plan shape and the meaning of every number: ../references/shot-prep.md. Imports tools/lib only.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../../../tools/lib/config.mjs';
import { filterPath, probe, run, runBuffer } from '../../../../tools/lib/ffmpeg.mjs';
import { heavySlot } from '../../../../tools/lib/lock.mjs';
import { isMain, parseArgs } from '../../../../tools/lib/cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const MOTION_PY = join(ROOT, 'tools', 'media', 'camera_motion.py');
const posix = (p) => p.split(sep).join('/');
const readJ = (f, d = null) => { try { return JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return d; } };
const writeJ = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 1) + '\n', 'utf8'); };
const writeT = (f, s) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, s, 'utf8'); };
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return NaN; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Thresholds. Starting values from synthetic tests (demo), not yet calibrated on a range of real
// footage: read the frame sheet before trusting a flag.
export const T = {
  minShot: 0.5,        // s: a "shot" shorter than this merges into the one before (false cut on a flash or blur)
  validInliers: 25,    // ORB inliers for a step to count as measured motion
  cutDiff: 28,         // mean grey difference between steps (camera_motion.py's cut value); with few matches, a cut
  cutDiffLow: 14,      // with few matches, a difference this large and 3x the steps around it is also a cut
  moving: 2,           // % of frame width (or height) per second: below this a pan reads as still (a drifting subject on a locked-off shot read 1.6)
  zooming: 1.5,        // % scale per second: below this a zoom reads as still
  shakeLight: 0.4,     // median jitter, % of frame width per step at 10 Hz (a locked-off real clip read 0.26)
  shakeHeavy: 1.0,
  dY: 10,              // luma levels from the reference before a shot is flagged
  dWarm: 5,            // V-U chroma levels
  satLo: 0.8, satHi: 1.25,
  faceMedium: 0.12, faceClose: 0.3, // Haar face height / frame height (rough)
};

// ---------------------------------------------------------------- colour (raw sampled frames)

/**
 * Sample a range of a video as small yuv444p frames and return its colour stats:
 * Y mean, 5th/95th percentile, saturation (mean chroma distance from neutral), warmth (V - U).
 * keep=true also returns the sampled pixels (for the colour solver).
 */
export async function colourStats(file, { start = 0, dur, w0, h0, frames = 8, keep = false } = {}) {
  const w = 160;
  const h = Math.max(2, Math.round((w * h0) / w0 / 2) * 2);
  const rate = Math.min(4, Math.max(0.25, frames / Math.max(dur, 0.1)));
  const buf = await runBuffer(['-v', 'error', '-ss', String(start), '-t', String(dur), '-i', file,
    '-vf', `fps=${rate.toFixed(4)},scale=${w}:${h},format=yuv444p`, '-f', 'rawvideo', '-']);
  const plane = w * h;
  const n = Math.floor(buf.length / (plane * 3));
  if (!n) throw new Error(`No frames sampled from ${file} at ${start}+${dur}`);
  let sy = 0; let su = 0; let sv = 0; let ss = 0; let cnt = 0;
  const hist = new Uint32Array(256);
  const Y = keep ? [] : null; const U = keep ? [] : null; const V = keep ? [] : null;
  for (let f = 0; f < n; f++) {
    const o = f * plane * 3;
    for (let i = 0; i < plane; i++) {
      const y = buf[o + i]; const u = buf[o + plane + i]; const v = buf[o + 2 * plane + i];
      sy += y; su += u; sv += v; ss += Math.hypot(u - 128, v - 128); hist[y]++; cnt++;
      if (keep && (i & 3) === 0) { Y.push(y); U.push(u); V.push(v); }
    }
  }
  const pct = (p) => { let acc = 0; const lim = cnt * p; for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= lim) return k; } return 255; };
  const out = { Y: r1(sy / cnt), lo: pct(0.05), hi: pct(0.95), sat: r1(ss / cnt), warm: r1((sv - su) / cnt), frames: n };
  if (keep) out.px = { Y, U, V };
  return out;
}

/** Solve a correction (gamma on Y, chroma gain and a warm/cool shift) that moves `src` stats to `target`. */
export function solveColour(src, target, { maxGamma = 1.6, minGamma = 0.6, satRange = [0.7, 1.4], dead = { Y: 2, warm: 1, sat: 0.04 } } = {}) {
  const px = src.px;
  const notes = [];
  let gamma = 1;
  if (Number.isFinite(target.Y) && Math.abs(target.Y - src.Y) > dead.Y) {
    const meanFor = (g) => { let s = 0; for (const y of px.Y) s += 255 * Math.pow(y / 255, g); return s / px.Y.length; };
    let lo = minGamma; let hi = maxGamma; // mean falls as gamma rises
    if (meanFor(lo) < target.Y) { gamma = lo; notes.push(`exposure capped (gamma ${lo}): cannot brighten to Y ${target.Y}`); }
    else if (meanFor(hi) > target.Y) { gamma = hi; notes.push(`exposure capped (gamma ${hi}): cannot darken to Y ${target.Y}`); }
    else { for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (meanFor(m) > target.Y) lo = m; else hi = m; } gamma = (lo + hi) / 2; }
  }
  let k = 1;
  if (Number.isFinite(target.sat) && src.sat > 0.5 && Math.abs(target.sat / src.sat - 1) > dead.sat) {
    k = target.sat / src.sat;
    if (k < satRange[0] || k > satRange[1]) { notes.push(`saturation capped at x${k < satRange[0] ? satRange[0] : satRange[1]} (wanted x${r2(k)})`); k = Math.min(satRange[1], Math.max(satRange[0], k)); }
  }
  let du = 0; let dv = 0;
  if (Number.isFinite(target.warm)) {
    const meanU = px.U.reduce((a, b) => a + b, 0) / px.U.length;
    const meanV = px.V.reduce((a, b) => a + b, 0) / px.V.length;
    const warmAfter = k * (meanV - 128) - k * (meanU - 128);
    const d = target.warm - warmAfter;
    if (Math.abs(d) > dead.warm) {
      const cap = 12;
      if (Math.abs(d) > 2 * cap) notes.push(`warmth shift capped at ${2 * cap} (wanted ${r1(d)})`);
      dv = Math.max(-cap, Math.min(cap, d / 2)); du = -dv;
    }
  }
  const identity = Math.abs(gamma - 1) < 1e-3 && Math.abs(k - 1) < 1e-3 && !du && !dv;
  const f = (x) => x.toFixed(4);
  const filter = identity ? null
    : `lutyuv=y='clip(255*pow(val/255\\,${f(gamma)})\\,0\\,255)':u='clip((val-128)*${f(k)}+128+(${f(du)})\\,0\\,255)':v='clip((val-128)*${f(k)}+128+(${f(dv)})\\,0\\,255)'`;
  return { gamma: r3(gamma), sat: r3(k), du: r2(du), dv: r2(dv), filter, notes };
}

// ---------------------------------------------------------------- motion (camera_motion.py)

function motionRows(file, hz, start = null, dur = null) {
  const { bin } = loadConfig();
  const py = bin.imagePython || 'python';
  const dir = mkdtempSync(join(tmpdir(), 'rcg-cine-'));
  const out = join(dir, 'motion.json');
  try {
    let src = file;
    if (start !== null) { // a range: cut it to a temporary file first (camera_motion.py reads whole files)
      src = join(dir, 'range.mp4');
      const r0 = spawnSync(loadConfig().bin.ffmpeg || 'ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', String(start), '-t', String(dur), '-i', file, '-an', '-c:v', 'libx264', '-crf', '12', '-preset', 'veryfast', src], { windowsHide: true });
      if (r0.status !== 0) throw new Error(`could not cut ${file} ${start}+${dur}`);
    }
    const r = spawnSync(py, ['-I', MOTION_PY, src, '--hz', String(hz), '--json', out, '--rows'], { encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 26 });
    if (r.status !== 0) throw new Error(`camera_motion.py failed on ${file}: ${(r.stderr || r.error?.message || '').split('\n').slice(-6).join('\n')}`);
    return readJ(out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Screen motion, shake and face size of the rows inside [a, b). */
export function motionOf(rows, a, b, { W, H, hz }) {
  const inside = rows.filter((r) => r.t > a && r.t <= b);
  const valid = inside.filter((r) => r.inl >= T.validInliers);
  const dur = Math.max(1e-3, b - a);
  if (valid.length < 3) return { dir: 'n/a', speed: 0, panX: 0, panY: 0, zoom: 0, shake: null, shakeLabel: 'n/a', face: 0 };
  // Trimmed means and medians, not plain sums: on a locked-off shot RANSAC sometimes locks onto a large
  // moving subject for a step or two, and those steps would otherwise read as a pan or as shake (found on
  // a dance clip). A plain median is no good for travel: it reads an even shake as a steady pan.
  const panX = (trimmedMean(valid.map((r) => r.tx)) * hz / W) * 100; // % width per s; + = content moves right
  const panY = (trimmedMean(valid.map((r) => r.ty)) * hz / H) * 100; // + = content moves down
  const zoom = (Math.exp(trimmedMean(valid.map((r) => Math.log(Math.max(r.s, 1e-6)))) * hz) - 1) * 100; // + = content grows (push in)
  // Shake: the typical step-to-step shift left after a 0.6 s moving median (the intended move).
  const win = Math.max(1, Math.round(hz * 0.3));
  const sx = valid.map((r) => (r.tx / W) * 100); const sy = valid.map((r) => (r.ty / W) * 100);
  const res = [];
  for (let i = 0; i < valid.length; i++) {
    const lo = Math.max(0, i - win); const hi = Math.min(valid.length, i + win + 1);
    res.push(Math.hypot(sx[i] - median(sx.slice(lo, hi)), sy[i] - median(sy.slice(lo, hi))));
  }
  const shake = median(res) * Math.sqrt(10 / hz); // scaled to a 10 Hz step
  const shakeLabel = shake >= T.shakeHeavy ? 'shaky' : shake >= T.shakeLight ? 'light' : 'steady';
  let dir = 'still'; let speed = 0;
  const pan = Math.max(Math.abs(panX), Math.abs(panY));
  if (Math.abs(zoom) >= T.zooming && Math.abs(zoom) >= pan) { dir = zoom > 0 ? 'in' : 'out'; speed = Math.abs(zoom); }
  else if (pan >= T.moving) { dir = Math.abs(panX) >= Math.abs(panY) ? (panX > 0 ? 'right' : 'left') : (panY > 0 ? 'down' : 'up'); speed = pan; }
  const faces = inside.map((r) => r.face).filter((x) => x > 0);
  return { dir, speed: r1(speed), panX: r1(panX), panY: r1(panY), zoom: r1(zoom), shake: r2(shake), shakeLabel, face: r3(median(faces) || 0) };
}

/**
 * Hard cuts from the per-step rows. camera_motion.py calls a step with few feature matches OR a large
 * frame difference a cut, which splits low-texture shots (sky, water, a plain wall) and fast pans over
 * fine detail. Here a cut needs both: the matches are lost AND the picture changes (a large difference,
 * or one well above the steps around it).
 */
export function cutSteps(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const near = rows.slice(Math.max(1, i - 10), Math.min(rows.length, i + 11)).filter((x) => x !== r).map((x) => x.diff);
    const base = median(near) || 0;
    if (r.inl < T.validInliers && (r.diff >= T.cutDiff || (r.diff >= T.cutDiffLow && r.diff >= 3 * base))) out.push(r.t);
  }
  return out;
}

/** The frame with the highest scene score in [start, start + dur): the exact cut time (falls back to `fallback`). */
async function refineCut(file, start, dur, fallback) {
  try {
    const { stdout } = await run('ffmpeg', ['-v', 'error', '-ss', String(start), '-t', String(dur), '-i', file, '-vf', "select='gte(scene\\,0)',metadata=print:file=-", '-f', 'null', '-']);
    let best = -1; let at = fallback; let pts = null;
    for (const line of stdout.split('\n')) {
      const p = line.match(/pts_time:([\d.]+)/); if (p) pts = Number(p[1]);
      const s = line.match(/lavfi\.scene_score=([\d.]+)/);
      if (s && pts !== null && Number(s[1]) > best) { best = Number(s[1]); at = start + pts; }
    }
    return r3(at);
  } catch { return fallback; }
}

/** Mean of the values within 4 MADs of the median (drops the odd step that tracked the subject). */
function trimmedMean(xs) {
  const m = median(xs);
  const mad = median(xs.map((x) => Math.abs(x - m))) || 1e-9;
  const keep = xs.filter((x) => Math.abs(x - m) <= 4 * 1.4826 * mad);
  return keep.length ? keep.reduce((a, b) => a + b, 0) / keep.length : m;
}

const sizeOf = (face) => (face >= T.faceClose ? 'close' : face >= T.faceMedium ? 'medium' : face > 0 ? 'wide+face' : 'wide/none');

// ---------------------------------------------------------------- measure

function jobFormat(job) {
  try {
    const html = readFileSync(join(job, 'index.html'), 'utf8');
    const root = html.match(/id="root"[^>]*>/s)?.[0] || '';
    const w = Number(root.match(/data-width="(\d+)"/)?.[1]); const h = Number(root.match(/data-height="(\d+)"/)?.[1]);
    if (w && h) return { w, h };
  } catch { /* no page yet */ }
  return { w: 1080, h: 1920 };
}

// Output name for measure: the intake measurements (shots.*) are what prep reads, so measuring a render
// or a prepped clip must not overwrite them.
function measureName(list, out) {
  if (out) {
    if (!/^[\w-]+$/.test(String(out))) throw new Error(`--out must be a plain name (letters, digits, - or _): ${out}`);
    return String(out);
  }
  const p = list.map((s) => posix(s).replace(/^\.\//, ''));
  if (p.some((s) => s.startsWith('renders/'))) return 'render-flow';
  if (p.some((s) => s.startsWith('assets/cine/'))) return 'prep-flow';
  return 'shots';
}

function sources(job, src) {
  if (src) return String(src).split(',').map((s) => s.trim()).filter(Boolean);
  const intake = readJ(join(job, 'data', 'intake.json'), []);
  return intake.filter((m) => m.kind === 'video').map((m) => m.asset);
}

export async function measure(job, opts = {}) {
  const hz = Number(opts.hz || 10);
  const fmt = opts.format ? (([w, h]) => ({ w: Number(w), h: Number(h) }))(String(opts.format).split('x')) : jobFormat(job);
  const list = sources(job, opts.src);
  if (!list.length) throw new Error('No videos: pass --src or create the job with rcg new-job --video');
  const name = measureName(list, opts.out);
  const shots = []; const srcInfo = [];
  for (const rel of list) {
    const file = resolve(job, rel);
    const info = await probe(file);
    if (!info.video) { console.log(`skip ${rel}: no video stream`); continue; }
    const { width: W, height: H, fps } = info.video;
    console.log(`measuring ${rel} (${W}x${H}, ${r2(fps)} fps, ${r1(info.duration)} s) ...`);
    const m = motionRows(file, hz);
    const step = 1 / (m.hz || hz);
    const cuts = [];
    for (const t of cutSteps(m.rows || [])) cuts.push(await refineCut(file, Math.max(0, t - step - 0.05), step + 0.1, t));
    let bounds = [0, ...cuts, info.duration];
    const merged = [bounds[0]];
    for (const t of bounds.slice(1)) { if (t - merged[merged.length - 1] >= T.minShot || t === info.duration) merged.push(t); }
    if (merged.length > 2 && merged[merged.length - 1] - merged[merged.length - 2] < T.minShot) merged.splice(merged.length - 2, 1);
    bounds = merged;
    const cover = Math.max(fmt.w / W, fmt.h / H);
    srcInfo.push({ src: posix(rel), W, H, fps: r2(fps), duration: r2(info.duration), headroom: r2(1 / cover), cuts: bounds.length - 2 });
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i]; const b = bounds[i + 1];
      const mo = motionOf(m.rows || [], a, b, { W, H, hz: m.hz || hz });
      const c = await colourStats(file, { start: a, dur: b - a, w0: W, h0: H });
      shots.push({ id: `s${String(shots.length + 1).padStart(2, '0')}`, src: posix(rel), start: r2(a), end: r2(b), dur: r2(b - a), ...mo, size: sizeOf(mo.face), Y: c.Y, lo: c.lo, hi: c.hi, sat: c.sat, warm: c.warm });
    }
  }
  const ref = { Y: r1(median(shots.map((s) => s.Y))), sat: r1(median(shots.map((s) => s.sat))), warm: r1(median(shots.map((s) => s.warm))) };
  for (const s of shots) {
    const fl = [];
    const dy = s.Y - ref.Y; const dw = s.warm - ref.warm; const ks = ref.sat ? s.sat / ref.sat : 1;
    if (Math.abs(dy) > T.dY) fl.push(dy > 0 ? `brighter +${r1(dy)}` : `darker ${r1(dy)}`);
    if (Math.abs(dw) > T.dWarm) fl.push(dw > 0 ? `warmer +${r1(dw)}` : `cooler ${r1(dw)}`);
    if (ks < T.satLo || ks > T.satHi) fl.push(`sat x${r2(ks)}`);
    if (s.shakeLabel === 'shaky') fl.push('shaky');
    const room = srcInfo.find((k) => k.src === s.src)?.headroom ?? 1;
    if (s.dir === 'still' && s.dur >= 2) fl.push(room >= 1.15 ? `still: room for a crop move (up to ${room}x)` : `still: a crop move would soften it (zoom room ${room}x)`);
    if (s.dir === 'n/a') fl.push('motion not measured (low texture or fast blur)');
    if (s.dur < 0.8) fl.push('very short');
    s.flags = fl;
  }
  const out = { job: posix(relative(ROOT, resolve(job))), format: fmt, hz, thresholds: T, reference: ref, sources: srcInfo, shots };
  writeJ(join(job, 'data', 'cine', `${name}.json`), out);
  writeT(join(job, 'data', 'cine', `${name}.md`), shotsMd(out));
  const sheets = await shotSheets(job, shots, name);
  console.log(`${shots.length} shot(s) from ${srcInfo.length} source(s) -> data/cine/${name}.md, ${name}.json, ${sheets.join(', ')}`);
  return out;
}

function shotsMd(o) {
  const L = [];
  L.push(`# Shots (${o.shots.length})`, '');
  L.push(`Output ${o.format.w}x${o.format.h}. Reference (median of all shots): Y ${o.reference.Y}, sat ${o.reference.sat}, warm ${o.reference.warm}.`, '');
  L.push('| source | size | fps | length | cuts found | zoom room |', '|---|---|---|---|---|---|');
  for (const s of o.sources) L.push(`| ${s.src} | ${s.W}x${s.H} | ${s.fps} | ${s.duration} s | ${s.cuts} | ${s.headroom}x${s.headroom < 1 ? ' (already upscaled: soft)' : s.headroom < 1.15 ? ' (little room for a crop move)' : ''} |`);
  L.push('', '| id | source | in-out (s) | dur | screen motion | %/s | shake | size | Y (lo-hi) | sat | warm | flags |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of o.shots) L.push(`| ${s.id} | ${basename(s.src)} | ${s.start}-${s.end} | ${s.dur} | ${s.dir} | ${s.speed} | ${s.shake ?? 'n/a'} ${s.shakeLabel} | ${s.size} | ${s.Y} (${s.lo}-${s.hi}) | ${s.sat} | ${s.warm} | ${s.flags.join('; ')} |`);
  L.push('', 'Legend: screen motion is where the picture content moves (a camera panning right makes it move left; in = push in or zoom in).',
    'It is the dominant motion in the frame: usually the camera, but a subject that fills the frame (a dancer, a passing car) can win. Check the sheet.',
    `Shake is the typical jitter left after a 0.6 s moving median, in % of frame width per step (steady < ${T.shakeLight} <= light < ${T.shakeHeavy} <= shaky).`,
    'Size is a rough guess from the largest frontal face (none found reads as wide). Zoom room: how far a crop can zoom before upscaling.',
    'Thresholds are starting values, not calibrated on real footage: check every flag against the frame sheet.');
  return L.join('\n') + '\n';
}

async function shotSheets(job, shots, prefix = 'shots') {
  const font = loadConfig().fonts?.label;
  const per = 48; const names = [];
  for (let p = 0; p * per < shots.length; p++) {
    const part = shots.slice(p * per, (p + 1) * per);
    const dir = mkdtempSync(join(tmpdir(), 'rcg-cine-sheet-'));
    try {
      for (let i = 0; i < part.length; i++) {
        const s = part[i];
        const vf = ['scale=320:180:force_original_aspect_ratio=decrease', 'pad=320:180:(ow-iw)/2:(oh-ih)/2:black'];
        if (font) vf.push(`drawtext=fontfile='${filterPath(font)}':text='${s.id} ${s.dir}':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.7`);
        await run('ffmpeg', ['-v', 'error', '-y', '-ss', String((s.start + s.end) / 2), '-i', resolve(job, s.src), '-frames:v', '1', '-vf', vf.join(','), join(dir, `f_${String(i).padStart(4, '0')}.png`)]);
      }
      const cols = Math.min(6, part.length); const rows = Math.ceil(part.length / cols);
      const name = `${prefix}-${p + 1}.png`;
      await run('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', join(dir, 'f_%04d.png'), '-vf', `tile=${cols}x${rows}:padding=4:color=black`, '-frames:v', '1', join(job, 'data', 'cine', name)]);
      names.push(`data/cine/${name}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  return names;
}

// ---------------------------------------------------------------- prep

function resolveItem(job, it, shots) {
  const x = { ...it };
  if (x.shot) {
    const s = shots?.shots?.find((k) => k.id === x.shot);
    if (!s) throw new Error(`${x.id}: shot ${x.shot} is not in data/cine/shots.json (run measure)`);
    // One frame inside each cut, so a cut found at 1-frame accuracy never brings in the neighbour shot.
    const meta = shots.sources.find((k) => k.src === s.src);
    const f = meta?.fps ? 1 / meta.fps : 0;
    x.src ??= s.src;
    x.in ??= r3(s.start > 0 ? s.start + f : s.start);
    x.out ??= r3(meta && s.end < meta.duration - 0.01 ? s.end - f : s.end);
  }
  if (!x.id || !x.src) throw new Error(`Plan item needs id and src (or shot): ${JSON.stringify(it)}`);
  return x;
}

export async function prep(job, opts = {}) {
  const planFile = resolve(job, opts.plan || 'data/cine/prep.json');
  const plan = readJ(planFile);
  if (!plan?.items?.length) throw new Error(`No items in ${planFile} (shape: references/shot-prep.md)`);
  const fps = Number(opts.fps || plan.fps || loadConfig().defaults.fps || 24);
  const fmt = plan.format ? (([w, h]) => ({ w: Number(w), h: Number(h) }))(String(plan.format).split('x')) : jobFormat(job);
  const shots = readJ(join(job, 'data', 'cine', 'shots.json'));
  const items = plan.items.map((it) => resolveItem(job, it, shots));
  // Size cap: a clip keeps at most `room` x the format (cover fit), enough for a crop move or push-in.
  // Larger sources (4K into a 1080p edit) are downsized with lanczos: full-size 4K clips made
  // HyperFrames frame extraction time out (VIDEO_SOURCE_UNRENDERABLE). false keeps the source size.
  const roomOf = (v, who) => { if (v === false || v === 'false') return false; const r = Number(v); if (!(r >= 1)) throw new Error(`${who}: room must be a number >= 1 or false (got ${v})`); return r; };
  const room = roomOf(opts.room ?? plan.room ?? 4 / 3, 'room');
  const release = opts.noSlot ? () => {} : await heavySlot('cine prep', job, opts);
  const results = [];
  try {
    // 1. Measure every item's source range (the target is set from the items that will be in the edit).
    const meta = new Map();
    for (const it of items) {
      const file = resolve(job, it.src);
      const info = await probe(file);
      if (!info.video) throw new Error(`${it.id}: no video in ${it.src}`);
      const a = Number(it.in ?? 0); const b = Number(it.out ?? info.duration);
      if (!(b > a) || b > info.duration + 0.05) throw new Error(`${it.id}: range ${a}-${b} is outside ${it.src} (${r2(info.duration)} s)`);
      const c = await colourStats(file, { start: a, dur: b - a, w0: info.video.width, h0: info.video.height, keep: true, frames: 10 });
      meta.set(it.id, { file, info, a, b, c });
    }
    const pick = (m) => (m === 'median' || m === undefined)
      ? { Y: median(items.filter((i) => i.match !== false).map((i) => meta.get(i.id).c.Y)), sat: median(items.filter((i) => i.match !== false).map((i) => meta.get(i.id).c.sat)), warm: median(items.filter((i) => i.match !== false).map((i) => meta.get(i.id).c.warm)) }
      : typeof m === 'string' ? (() => { const r = meta.get(m)?.c || shots?.shots?.find((s) => s.id === m); if (!r) throw new Error(`match: no item or shot ${m}`); return { Y: r.Y, sat: r.sat, warm: r.warm }; })()
        : m;
    const target = plan.match === false ? null : pick(plan.match);
    if (target) console.log(`colour target (${typeof plan.match === 'string' ? plan.match : plan.match ? 'given' : 'median of the items'}): Y ${r1(target.Y)}, sat ${r1(target.sat)}, warm ${r1(target.warm)}`);

    // 2. Build each clip.
    mkdirSync(join(job, 'assets', 'cine'), { recursive: true });
    for (const it of items) {
      const { file, info, a, b, c } = meta.get(it.id);
      const srcFps = info.video.fps;
      const speed = Number(it.speed ?? 1);
      const notes = [];
      if (!(speed > 0)) throw new Error(`${it.id}: speed must be > 0`);
      if (speed < 1 && srcFps / speed < fps * 0.99) throw new Error(`${it.id}: ${speed}x needs a source of ${r1(fps / speed)}+ fps and ${r2(srcFps)} fps: it would stutter (lessons 5). Use a freeze frame, a shorter hold or footage shot at a high frame rate.`);
      if (it.audio && (speed !== 1 || it.reverse)) throw new Error(`${it.id}: audio: true only with speed 1 and no reverse`);
      if (it.reverse && b - a > 20) notes.push('reverse buffers every frame: long ranges need a lot of memory');
      const vf = [];
      const tmp = mkdtempSync(join(tmpdir(), 'rcg-cine-prep-'));
      try {
        if (it.stabilize && it.stabilize?.engine === 'deshake') {
          vf.push('deshake=rx=48:ry=48:edge=mirror');
        } else if (it.stabilize) {
          const trf = join(tmp, 'motion.trf');
          const shk = Number(it.stabilize?.shakiness ?? 6);
          await run('ffmpeg', ['-v', 'error', '-y', '-ss', String(a), '-t', String(b - a), '-i', file, '-vf', `vidstabdetect=shakiness=${shk}:accuracy=15:result='${filterPath(trf)}'`, '-f', 'null', '-'], { timeout: 1800000 });
          const smooth = Number(it.stabilize?.smoothing ?? 12);
          vf.push(`vidstabtransform=input='${filterPath(trf)}':smoothing=${smooth}:optzoom=1:zoomspeed=0.25:interpol=bicubic`, 'unsharp=5:5:0.5:3:3:0.0');
        }
        // After stabilizing (its transforms are in source pixels), before reverse (it buffers every frame).
        const itRoom = it.reframe ? null : roomOf(it.room ?? room, it.id);
        let cap = null;
        if (itRoom) {
          const W = info.video.width; const H = info.video.height;
          const k = itRoom * Math.max(fmt.w / W, fmt.h / H);
          if (k < 1) {
            const cw = Math.round((W * k) / 2) * 2; const ch = Math.round((H * k) / 2) * 2;
            vf.push(`scale=${cw}:${ch}:flags=lanczos`);
            cap = { room: r2(itRoom), from: `${W}x${H}`, to: `${cw}x${ch}` };
            notes.push(`downsized ${W}x${H} -> ${cw}x${ch} (room ${r2(itRoom)}x of ${fmt.w}x${fmt.h})`);
          }
        }
        if (it.reverse) vf.push('reverse');
        if (it.flip) vf.push('hflip');
        if (it.reframe) {
          // Crop to the output's shape (as large as the source allows), centred at x / y (0-1). x or y may be
          // [from, to]: an eased pan across the clip (a crop move done in prep), stepped by frame number.
          const A = fmt.w / fmt.h; const W = info.video.width; const H = info.video.height;
          const cw = W / H > A ? Math.round((H * A) / 2) * 2 : W; const ch = W / H > A ? H : Math.round(W / A / 2) * 2;
          const N = Math.max(1, Math.round((b - a) * srcFps) - 1);
          const pos = (v) => { const [p0, p1] = Array.isArray(v) ? v.map(Number) : [Number(v ?? 0.5), Number(v ?? 0.5)];
            if (![p0, p1].every((q) => q >= 0 && q <= 1)) throw new Error(`${it.id}: reframe x / y must be 0-1`);
            return p0 === p1 ? `${p0}` : `(${p0}+(${p1 - p0})*(3*pow(min(n/${N},1),2)-2*pow(min(n/${N},1),3)))`; };
          vf.push(`crop=${cw}:${ch}:x='(iw-ow)*${pos(it.reframe.x)}':y='(ih-oh)*${pos(it.reframe.y)}'`, `scale=${fmt.w}:${fmt.h}:flags=lanczos`);
          if (cw < fmt.w) notes.push(`reframe upscales ${r2(fmt.w / cw)}x (${cw}x${ch} -> ${fmt.w}x${fmt.h}): check sharpness`);
        }
        let col = null;
        const tgt = it.match === false ? null : (it.match !== undefined && it.match !== true ? pick(it.match) : target);
        if (tgt) { col = solveColour(c, tgt); if (col.filter) vf.push(col.filter); notes.push(...col.notes); }
        const per = (srcFps * speed) / fps; // source frames behind one output frame
        let blend = 1;
        if (speed > 1 && it.blur !== false) {
          blend = Math.min(8, Math.round(per));
          if (blend >= 2) vf.push(`tmix=frames=${blend}`);
          else notes.push(`no motion blur: ${r2(per)} source frames per output frame at ${speed}x (needs 1.5+)`);
        }
        vf.push(`setpts=(PTS-STARTPTS)/${speed}`, `fps=${fps}`, 'scale=trunc(iw/2)*2:trunc(ih/2)*2', 'format=yuv420p');
        const out = join(job, 'assets', 'cine', `${it.id}.mp4`);
        const args = ['-v', 'error', '-y', '-ss', String(a), '-t', String(b - a), '-i', file, '-vf', vf.join(','),
          '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-g', String(Math.round(fps)), '-movflags', '+faststart'];
        if (it.audio && info.audio?.length) args.push('-c:a', 'aac', '-b:a', '192k'); else args.push('-an');
        args.push(out);
        console.log(`${it.id}: ${it.src} ${r2(a)}-${r2(b)} s${cap ? ` -> ${cap.to}` : ''}${it.stabilize ? ' stabilize' : ''}${it.reverse ? ' reverse' : ''}${it.flip ? ' flip' : ''}${it.reframe ? ` reframe ${fmt.w}x${fmt.h} x ${JSON.stringify(it.reframe.x ?? 0.5)}` : ''}${speed !== 1 ? ` ${speed}x` : ''}${blend >= 2 ? ` blur ${blend}` : ''}${col?.filter ? ` colour(g ${col.gamma}, sat x${col.sat}, warm ${r1(col.dv - col.du)})` : ''}`);
        await run('ffmpeg', args, { timeout: 1800000 });
        const oi = await probe(out);
        const after = await colourStats(out, { start: 0, dur: oi.duration, w0: oi.video.width, h0: oi.video.height });
        const res = { id: it.id, file: posix(relative(job, out)), src: it.src, in: r2(a), out: r2(b), speed, reverse: !!it.reverse, flip: !!it.flip, stabilize: !!it.stabilize, reframe: it.reframe || null, cap, blend,
          duration: r3(oi.duration), size: `${oi.video.width}x${oi.video.height}`, fps: r2(oi.video.fps),
          before: { Y: c.Y, sat: c.sat, warm: c.warm }, after: { Y: after.Y, sat: after.sat, warm: after.warm }, target: tgt ? { Y: r1(tgt.Y), sat: r1(tgt.sat), warm: r1(tgt.warm) } : null, correction: col ? { gamma: col.gamma, sat: col.sat, du: col.du, dv: col.dv } : null, notes };
        if (tgt && (Math.abs(after.Y - tgt.Y) > 4 || Math.abs(after.warm - tgt.warm) > 3)) res.notes.push(`not fully matched: Y ${after.Y} vs ${r1(tgt.Y)}, warm ${after.warm} vs ${r1(tgt.warm)}`);
        if (it.stabilize) {
          const hzM = 10;
          const mb = motionRows(file, hzM, a, b - a); const ma = motionRows(out, hzM);
          const sb = motionOf(mb.rows || [], 0, 1e9, { W: info.video.width, H: info.video.height, hz: mb.hz || hzM }).shake;
          const sa = motionOf(ma.rows || [], 0, 1e9, { W: oi.video.width, H: oi.video.height, hz: ma.hz || hzM }).shake;
          res.shake = { before: sb, after: sa };
          res.notes.push(`stabilized (${it.stabilize?.engine === 'deshake' ? 'deshake' : 'vidstab'}): shake ${sb} -> ${sa}${sa != null && sb != null && sa > sb * 0.8 ? ' (little gain: try the other engine, a slower speed, or drop the shot)' : ''}; the edges are zoomed or filled, check the frame for warping`);
        }
        console.log(`   -> ${res.file} ${res.duration} s  Y ${c.Y} -> ${after.Y}  sat ${c.sat} -> ${after.sat}  warm ${c.warm} -> ${after.warm}${tgt ? `  (target ${r1(tgt.Y)} / ${r1(tgt.sat)} / ${r1(tgt.warm)})` : ''}${res.notes.length ? `\n   note: ${res.notes.join('; ')}` : ''}`);
        results.push(res);
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    }
  } finally { release(); }
  writeJ(join(job, 'data', 'cine', 'prep.out.json'), { fps, format: `${fmt.w}x${fmt.h}`, room: room === false ? false : r2(room), items: results });
  console.log(`${results.length} clip(s) -> assets/cine/, data/cine/prep.out.json`);
  return results;
}

// ---------------------------------------------------------------- demo (self-check)

async function demo() {
  const job = mkdtempSync(join(tmpdir(), 'rcg-cine-demo-'));
  const fail = [];
  const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
  try {
    mkdirSync(join(job, 'assets'), { recursive: true });
    const A = join(job, 'assets', 'ab.mp4'); const C = join(job, 'assets', 'c.mp4');
    // A still texture with detail at every scale (colour noise, upscaled), filmed by a moving crop.
    const TEX = join(job, 'tex.png');
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=gray:s=160x90,noise=alls=100:allf=0,format=rgb24', '-frames:v', '1', '-vf', 'scale=2560:1440:flags=bicubic', TEX]);
    const pan = (x, y = '360') => ['-loop', '1', '-framerate', '30', '-t', '3', '-i', TEX, '-vf', `crop=1280:720:x='${x}':y='${y}'`];
    const enc = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '30'];
    // ab.mp4: 3 s of content moving left (camera pans right), a hard cut, 3 s negated, darker, moving right.
    const a1 = join(job, 'a1.mp4'); const a2 = join(job, 'a2.mp4');
    await run('ffmpeg', ['-v', 'error', '-y', ...pan('200+t*160'), ...enc, a1]);
    await run('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-framerate', '30', '-t', '3', '-i', TEX, '-vf', "crop=1280:720:x='1000-t*160':y=300,negate,eq=brightness=-0.12", ...enc, a2]);
    await run('ffmpeg', ['-v', 'error', '-y', '-i', a1, '-i', a2, '-filter_complex', '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]', ...enc, A]);
    // c.mp4: 3 s, hand-held jitter, no travel.
    await run('ffmpeg', ['-v', 'error', '-y', ...pan('640+14*sin(t*37)+11*sin(t*23)', '360+12*sin(t*31)'), ...enc, C]);
    const m = await measure(job, { src: 'assets/ab.mp4,assets/c.mp4', format: '1920x1080' });
    const sh = m.shots;
    check(sh.length === 3, `3 shots found (got ${sh.length}: ${sh.map((s) => `${s.id} ${s.start}-${s.end}`).join(', ')})`);
    check(sh[0]?.dir === 'left', `s01 moves left (got ${sh[0]?.dir}, panX ${sh[0]?.panX})`);
    check(sh[1]?.dir === 'right', `s02 moves right (got ${sh[1]?.dir}, panX ${sh[1]?.panX})`);
    check(sh[2]?.shakeLabel === 'shaky' && sh[0]?.shakeLabel === 'steady', `s03 shaky, s01 steady (got ${sh[2]?.shake} ${sh[2]?.shakeLabel}, ${sh[0]?.shake} ${sh[0]?.shakeLabel})`);
    check(sh[1] && sh[0] && sh[1].Y < sh[0].Y - 5, `s02 darker than s01 (Y ${sh[1]?.Y} vs ${sh[0]?.Y})`);
    writeJ(join(job, 'data', 'cine', 'prep.json'), { fps: 24, format: '1080x1920', match: 's01', items: [
      { id: 'c1', shot: 's01', speed: 2 },
      { id: 'c2', shot: 's02', reverse: true },
      { id: 'c3', shot: 's02', flip: true, match: false },
      { id: 'c4', shot: 's03', stabilize: true, match: false },
      { id: 'c5', shot: 's03', stabilize: { engine: 'deshake' }, match: false },
      { id: 'c6', shot: 's01', reframe: { x: [0.1, 0.9] }, match: false },
    ] });
    const res = await prep(job, { noSlot: true });
    const by = Object.fromEntries(res.map((r) => [r.id, r]));
    check(Math.abs(by.c1.duration - 1.5) < 0.1 && by.c1.blend >= 2, `c1 2x: 1.5 s with frame blend (got ${by.c1.duration} s, blend ${by.c1.blend})`);
    check(Math.abs(by.c2.after.Y - by.c2.target.Y) <= 4, `c2 matched to s01 (Y ${by.c2.before.Y} -> ${by.c2.after.Y}, target ${by.c2.target.Y})`);
    const dirOf = async (f) => (await measure(job, { src: f, format: '1920x1080' })).shots[0];
    const d2 = await dirOf('assets/cine/c2.mp4'); const d3 = await dirOf('assets/cine/c3.mp4');
    check(d2.dir === 'left', `reverse turns s02 (right) to left (got ${d2.dir})`);
    check(d3.dir === 'left', `flip turns s02 (right) to left (got ${d3.dir})`);
    const kept = readJ(join(job, 'data', 'cine', 'shots.json'));
    check(kept?.shots?.length === 3 && existsSync(join(job, 'data', 'cine', 'prep-flow.json')), `measuring a prepped clip leaves shots.json alone (${kept?.shots?.length} shots; prep-flow.json written)`);
    // On this random-noise texture vidstab gains less than deshake (and on a real dance clip both cut
    // shake by about a third), so the demo checks that deshake helps and that vidstab was re-measured.
    check(by.c4.shake?.after != null, `vidstab clip re-measured (shake ${by.c4.shake?.before} -> ${by.c4.shake?.after})`);
    check(by.c5.shake?.after < by.c5.shake?.before * 0.7, `deshake lowers shake (${by.c5.shake?.before} -> ${by.c5.shake?.after})`);
    const d6 = (await measure(job, { src: 'assets/cine/c6.mp4', format: '1080x1920' })).shots[0];
    check(by.c6.size === '1080x1920' && d6.dir === 'left' && d6.speed > sh[0].speed * 1.5,
      `reframe to 9:16 with a crop pan: ${by.c6.size}, moves ${d6.dir} at ${d6.speed} %/s (s01 alone: ${sh[0].speed})`);
    // Size cap: 1280x720 sources into a 640x360 format keep 4/3 of it (854x480); room: false keeps 1280x720.
    writeJ(join(job, 'data', 'cine', 'prep-cap.json'), { fps: 24, format: '640x360', match: false, items: [
      { id: 'k1', shot: 's01' }, { id: 'k2', shot: 's01', room: false }, { id: 'k3', shot: 's01', room: 2 },
    ] });
    const cap = Object.fromEntries((await prep(job, { noSlot: true, plan: 'data/cine/prep-cap.json' })).map((r) => [r.id, r]));
    const capOut = readJ(join(job, 'data', 'cine', 'prep.out.json'));
    check(cap.k1.size === '854x480' && cap.k1.cap?.from === '1280x720' && cap.k2.size === '1280x720' && !cap.k2.cap && cap.k3.size === '1280x720' && capOut?.room === 1.33,
      `size cap: room 1.33 -> ${cap.k1.size}, room false -> ${cap.k2.size}, room 2 (no downsize) -> ${cap.k3.size}; prep.out.json room ${capOut?.room}`);
  } finally { if (process.env.CINE_KEEP) console.log(`kept ${job}`); else rmSync(job, { recursive: true, force: true }); }
  console.log(fail.length ? `\n${fail.length} check(s) failed` : '\nall checks passed');
  if (fail.length) process.exitCode = 1;
}

// ---------------------------------------------------------------- CLI

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const [cmd, job] = a._;
  const usage = 'usage: cine.mjs measure <job> [--src a.mp4,b.mp4] [--hz 10] [--format WxH] [--out name] | prep <job> [--plan data/cine/prep.json] [--fps 24] [--room 1.33] | demo';
  (async () => {
    if (cmd === 'demo') return demo();
    if (!job || !existsSync(job)) throw new Error(usage);
    if (cmd === 'measure') return measure(resolve(job), a);
    if (cmd === 'prep') return prep(resolve(job), a);
    throw new Error(usage);
  })().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
