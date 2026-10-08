// Speed ramps on a footage clip as a HyperFrames `rate` lane.
//
// Audio speed sync is a port of Adits core/main.js Speed Sync (and the Advance
// `speed: {min, max}` field): target = min + (max - min) * max(bass, mid, treble),
// eased 20% of the way per display frame. Adits does that live at the display
// rate (assumed 60 Hz); here it runs over the per-frame audio table with the
// easing rescaled to the render fps, so the lane is the same on every render.
// A manual ramp takes explicit points instead.
//
// Rates below 1x are refused unless --allow-slow: 24 fps footage stutters when
// slowed (lessons 5). The tool checks the clip does not run out of source.
//
// Usage:
//   node tools/blocks/ramp.mjs --job <dir> --target v3 --audio <music> [--audio-offset s] [--min 1] [--max 2.4]
//   node tools/blocks/ramp.mjs --job <dir> --target v3 --points "0:1,0.6:2.5,1.4:1"
//   [--allow-slow] [--fps 24] [--tolerance 0.02]

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { analyzeToFile } from '../audio/analyze.mjs';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { probe } from '../lib/ffmpeg.mjs';

const ADITS_FPS = 60; // display rate the Adits easing ran at (assumption: a 60 Hz screen)
const ADITS_EASE = 0.2;

/** Adits Speed Sync over a per-frame table: one rate per frame, starting at 1x. */
export function speedSyncRates(frames, { min = 1, max = 2.4, fps = 24 } = {}) {
  const k = 1 - Math.pow(1 - ADITS_EASE, ADITS_FPS / fps);
  let rate = 1;
  return frames.map((f) => {
    const target = min + (max - min) * Math.max(f.bass || 0, f.mid || 0, f.treble || 0);
    rate += (target - rate) * k;
    return rate;
  });
}

/** Ramer-Douglas-Peucker on {t, v} points (keeps the first and last). */
export function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let dmax = 0;
    for (let i = a + 1; i < b; i++) {
      const u = (points[i].t - points[a].t) / (points[b].t - points[a].t);
      const d = Math.abs(points[i].v - (points[a].v + u * (points[b].v - points[a].v)));
      if (d > dmax) { dmax = d; worst = i; }
    }
    if (dmax > tolerance && worst > 0) { keep[worst] = true; stack.push([a, worst], [worst, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Seconds of source a piecewise-linear rate lane consumes over [0, duration]. */
export function sourceConsumed(points, duration) {
  const pts = points.slice().sort((x, y) => x.t - y.t);
  const at = (t) => {
    if (t <= pts[0].t) return pts[0].v;
    for (let i = 1; i < pts.length; i++) if (t <= pts[i].t) return pts[i - 1].v + (pts[i].v - pts[i - 1].v) * ((t - pts[i - 1].t) / (pts[i].t - pts[i - 1].t || 1));
    return pts[pts.length - 1].v;
  };
  let sum = 0;
  const n = Math.max(1, Math.ceil(duration * 200));
  for (let i = 0; i < n; i++) sum += at(((i + 0.5) / n) * duration) * (duration / n);
  return sum;
}

function videoTag(html, id) {
  const m = html.match(new RegExp(`<video\\b[^>]*\\bid="${id}"[^>]*>`));
  if (!m) throw new Error(`No <video id="${id}"> in index.html`);
  return m[0];
}
const attr = (tag, name) => tag.match(new RegExp(`${name}='([^']*)'|${name}="([^"]*)"`))?.slice(1).find((v) => v !== undefined);

export async function applyRamp(opts) {
  const jobDir = resolve(opts.job);
  const indexPath = join(jobDir, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  const id = String(opts.target || '').replace(/^#/, '');
  const tag = videoTag(html, id);
  const duration = Number(attr(tag, 'data-duration'));
  const mediaStart = Number(attr(tag, 'data-media-start') || 0);
  if (!(duration > 0)) throw new Error(`${id} has no data-duration`);
  const fps = Number(opts.fps) || 24;

  let points;
  if (opts.points) {
    points = String(opts.points).split(',').map((p) => { const [t, v] = p.split(':').map(Number); return { t, v }; });
  } else {
    if (!opts.audio) throw new Error('Give --audio <music> (speed sync) or --points "t:v,...".');
    const table = await analyzeToFile(resolve(opts.audio), join(jobDir, 'data', `ramp-${id}.audio.json`), {
      fps, duration: duration + 1 / fps, offset: Number(opts['audio-offset'] || 0), clock: 'default',
    });
    const rates = speedSyncRates(table.frames, { min: Number(opts.min ?? 1), max: Number(opts.max ?? 2.4), fps });
    points = simplify(rates.map((v, i) => ({ t: +(i / fps).toFixed(4), v: +v.toFixed(4) })).filter((p) => p.t <= duration), Number(opts.tolerance ?? 0.02));
  }
  const slow = points.filter((p) => p.v < 1 - 1e-6);
  if (slow.length && !opts['allow-slow']) throw new Error(`Rate drops to ${Math.min(...slow.map((p) => p.v))}x: 24 fps footage stutters below 1x (lessons 5). Raise --min or pass --allow-slow.`);

  const src = attr(tag, 'src');
  const info = await probe(join(jobDir, src));
  const consumed = sourceConsumed(points, duration);
  const remaining = info.duration - mediaStart;
  if (consumed > remaining + 1e-3) throw new Error(`The ramp needs ${consumed.toFixed(2)} s of source from ${mediaStart} s, but only ${remaining.toFixed(2)} s remain in ${src}. Lower --max or move data-media-start earlier.`);

  // Merge: keep other lanes (volume), replace the rate lane.
  const existing = attr(tag, 'data-automation');
  const doc = existing ? JSON.parse(existing) : { version: 1, lanes: [] };
  doc.lanes = (doc.lanes || []).filter((l) => l.target !== 'rate');
  doc.lanes.push({ target: 'rate', points });
  const cleaned = tag.replace(/\s*data-automation=('[^']*'|"[^"]*")/, '');
  const next = cleaned.replace(/^<video\b/, `<video data-automation='${JSON.stringify(doc)}'`);
  html = html.replace(tag, next);
  writeFileSync(indexPath, html);
  return { id, points: points.length, minRate: Math.min(...points.map((p) => p.v)), maxRate: Math.max(...points.map((p) => p.v)), consumed: +consumed.toFixed(3), remaining: +remaining.toFixed(3), duration };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job || !a.target) {
    console.error('Usage: ramp.mjs --job <dir> --target <video id> (--audio <music> [--audio-offset s] [--min 1] [--max 2.4] | --points "t:v,...") [--allow-slow]');
    process.exit(2);
  }
  const r = await applyRamp(a);
  console.log(`Rate lane on ${r.id}: ${r.points} points, ${r.minRate.toFixed(2)}-${r.maxRate.toFixed(2)}x; ${r.duration} s of timeline uses ${r.consumed} s of source (${r.remaining} s available)`);
}
