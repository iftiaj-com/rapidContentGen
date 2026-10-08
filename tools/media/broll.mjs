// rcg broll: analyse the informative video(s) of a split-screen job (skill-split-screen-edit).
//
// For each clip: scene cuts (ffmpeg scene score), then per shot the mean brightness, motion
// (mean frame difference), an edge-density "text or UI" score and a focus point (the centroid of
// edge and motion energy, pulled 30% toward the centre). Each shot gets a class that the planner
// uses to pick a layout:
//   card     bright, nearly still (slide, logo, white card)        -> full frame as a band card
//   ui       dense hard edges, little motion (screen recording)    -> full frame, fit + blurred fill
//   footage  everything else                                       -> the top panel of the split
//   dark     near black (fades, black frames)                      -> skipped
// The numbers are rough by design: READ the sheet and fix a class in data/broll.json by hand when
// it is wrong (the planner reads the file as it is).
//
// Usage:
//   node tools/media/broll.mjs --job <dir> --src assets/b1-prep.mp4 [--src assets/b2-prep.mp4]
//        [--threshold 0.25] [--min 0.6] [--rate 6] [--out data/broll.json] [--sheet data/broll-sheet.png]

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { loadConfig } from '../lib/config.mjs';
import { filterPath, probe, run, runBuffer } from '../lib/ffmpeg.mjs';

const f3 = (n) => +Number(n).toFixed(3);
const f2 = (n) => +Number(n).toFixed(2);

// Class thresholds (0-255 luma, motion in luma levels per sample, edge as a pixel fraction).
export const CLASS_RULES = { darkLuma: 28, cardLuma: 150, cardMotion: 1.2, uiEdge: 0.1, uiMotion: 3 };

export function classify(s, R = CLASS_RULES) {
  if (s.luma < R.darkLuma) return 'dark';
  if (s.luma >= R.cardLuma && s.motion < R.cardMotion) return 'card';
  if (s.edge >= R.uiEdge && s.motion < R.uiMotion) return 'ui';
  return 'footage';
}

/** Scene-cut times (s) from ffmpeg's scene score. */
export async function sceneCuts(file, threshold = 0.25) {
  const { stderr } = await run('ffmpeg', ['-v', 'info', '-i', file, '-an', '-vf', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-']);
  return [...String(stderr).matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1])).filter(Number.isFinite);
}

/** Small grey frames at `rate` fps: { frames: Float32Array[], w, h, rate }. */
async function greyFrames(file, info, rate) {
  const w = 96;
  const h = Math.max(2, Math.round((w * info.video.height) / info.video.width / 2) * 2);
  const buf = await runBuffer(['-v', 'error', '-i', file, '-an', '-vf', `fps=${rate},scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-']);
  const n = Math.floor(buf.length / (w * h));
  const frames = [];
  for (let i = 0; i < n; i++) frames.push(Float32Array.from(buf.subarray(i * w * h, (i + 1) * w * h)));
  return { frames, w, h, rate };
}

/** Stats of frames [a, b): luma, motion, edge share, focus point (0..1). */
function shotStats(g, a, b) {
  const { frames, w, h } = g;
  let luma = 0; let motion = 0; let mN = 0; let edge = 0; let n = 0;
  let ex = 0; let ey = 0; let ew = 0;
  for (let i = a; i < b; i++) {
    const f = frames[i];
    const p = i > a ? frames[i - 1] : null;
    let sum = 0; let diff = 0; let e = 0;
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const k = y * w + x;
        const v = f[k];
        sum += v;
        const gm = Math.abs(f[k + 1] - v) + Math.abs(f[k + w] - v);
        const d = p ? Math.abs(v - p[k]) : 0;
        if (gm > 24) e++;
        diff += d;
        const wgt = (gm > 24 ? gm : 0) + 2 * d;
        ex += wgt * (x + 0.5); ey += wgt * (y + 0.5); ew += wgt;
      }
    }
    const px = (w - 1) * (h - 1);
    luma += sum / px; edge += e / px; n++;
    if (p) { motion += diff / px; mN++; }
  }
  const fx = ew > 0 ? ex / ew / w : 0.5;
  const fy = ew > 0 ? ey / ew / h : 0.45;
  return {
    luma: f2(luma / Math.max(1, n)), motion: f2(mN ? motion / mN : 0), edge: f3(edge / Math.max(1, n)),
    focus: { x: f3(0.5 + (fx - 0.5) * 0.7), y: f3(0.45 + (fy - 0.45) * 0.7) },
  };
}

export async function analyzeClip(file, { threshold = 0.25, min = 0.6, rate = 6, rel = file } = {}) {
  const info = await probe(file);
  if (!info.video) throw new Error(`${file}: no video stream`);
  const dur = info.duration;
  const cuts = (await sceneCuts(file, threshold)).filter((t) => t > 0.05 && t < dur - 0.05);
  // Shots between cuts; one shorter than `min` joins the shot before it (or the next, at the start).
  const bounds = [0, ...cuts, dur];
  let shots = [];
  for (let i = 0; i + 1 < bounds.length; i++) shots.push({ start: bounds[i], end: bounds[i + 1] });
  for (let i = shots.length - 1; i >= 0 && shots.length > 1; i--) {
    if (shots[i].end - shots[i].start >= min) continue;
    if (i > 0) { shots[i - 1].end = shots[i].end; shots.splice(i, 1); } else { shots[1].start = shots[0].start; shots.splice(0, 1); }
  }
  const g = await greyFrames(file, info, rate);
  shots = shots.map((s, i) => {
    const a = Math.max(0, Math.floor(s.start * rate));
    const b = Math.min(g.frames.length, Math.max(a + 1, Math.ceil(s.end * rate)));
    const st = shotStats(g, a, b);
    return { id: `${basename(file).replace(/\.[^.]+$/, '')}#${i + 1}`, src: rel, start: f3(s.start), end: f3(s.end), dur: f3(s.end - s.start), ...st, cls: classify(st) };
  });
  return {
    src: rel, width: info.video.width, height: info.video.height, fps: f2(info.video.fps), duration: f3(dur),
    orientation: info.video.width > info.video.height ? 'landscape' : 'portrait', cuts: cuts.map(f3), shots,
  };
}

/** One labelled thumbnail per shot (its middle frame), tiled. */
export async function brollSheet(jobDir, clips, out) {
  const font = loadConfig().fonts?.label;
  const dir = mkdtempSync(join(tmpdir(), 'rcg-broll-'));
  try {
    let i = 0;
    for (const c of clips) {
      for (const s of c.shots) {
        const t = f3((s.start + s.end) / 2);
        const label = `${s.id}  ${s.start}-${s.end}s  ${s.cls}  L${Math.round(s.luma)} M${s.motion} E${s.edge}`;
        const vf = ['scale=360:360:force_original_aspect_ratio=decrease', 'pad=360:360:(ow-iw)/2:(oh-ih)/2:color=0x202020'];
        if (font) vf.push(`drawtext=fontfile='${filterPath(font)}':text='${label.replace(/[:']/g, ' ').replace(/#/g, ' ')}':x=6:y=6:fontsize=13:fontcolor=yellow:box=1:boxcolor=black@0.75`);
        await run('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', join(jobDir, s.src), '-frames:v', '1', '-vf', vf.join(','), join(dir, `f_${String(i).padStart(4, '0')}.png`)]);
        i++;
      }
    }
    const cols = Math.min(6, i);
    const rows = Math.ceil(i / cols);
    mkdirSync(dirname(out), { recursive: true });
    await run('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', join(dir, 'f_%04d.png'), '-vf', `tile=${cols}x${rows}:padding=4:color=black`, '-frames:v', '1', out]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

export async function analyzeBroll(opts) {
  const jobDir = resolve(opts.job);
  const srcs = [].concat(opts.src || []);
  if (!srcs.length) throw new Error('--src <clip> is required (repeat it for several clips)');
  const clips = [];
  for (const s of srcs) {
    const abs = isAbsolute(s) ? s : join(jobDir, s);
    const rel = relative(jobDir, abs).split('\\').join('/');
    clips.push(await analyzeClip(abs, { threshold: Number(opts.threshold ?? 0.25), min: Number(opts.min ?? 0.6), rate: Number(opts.rate ?? 6), rel }));
  }
  const out = join(jobDir, opts.out || 'data/broll.json');
  mkdirSync(dirname(out), { recursive: true });
  const doc = { version: 1, rules: CLASS_RULES, clips };
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  const sheet = await brollSheet(jobDir, clips, join(jobDir, opts.sheet || 'data/broll-sheet.png'));
  return { doc, out, sheet };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job || !a.src) {
    console.error('Usage: broll.mjs --job <dir> --src <clip> [--src <clip>] [--threshold 0.25] [--min 0.6] [--rate 6] [--out data/broll.json] [--sheet data/broll-sheet.png]');
    process.exit(2);
  }
  try {
    const { doc, out, sheet } = await analyzeBroll(a);
    for (const c of doc.clips) {
      console.log(`${c.src}: ${c.width}x${c.height} ${c.orientation}, ${c.duration} s, ${c.shots.length} shot(s)`);
      for (const s of c.shots) console.log(`  ${s.id.padEnd(28)} ${String(s.start).padStart(7)}-${String(s.end).padEnd(7)} ${s.cls.padEnd(8)} luma ${s.luma} motion ${s.motion} edge ${s.edge} focus ${s.focus.x},${s.focus.y}`);
    }
    console.log(`Wrote ${out} and ${sheet}. READ the sheet; fix a wrong class in the JSON by hand.`);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}
