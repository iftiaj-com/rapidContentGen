// rcg split-screen: split-screen explainers from two videos, a presenter and an informative video
// (skill .agents/skills/style-split-screen-edit). Learned from the user's reference Video-94146
// (measured, nothing copied): B-roll in a top panel that fades to black, the presenter in a bottom
// panel, small captions on the dark seam, and timed switches to a full-frame presenter (a-full,
// two-tier title, the marketing-pro face camera), full-frame B-roll (b-full: cover, fit over a
// blurred fill, or a white band card) and back. Geometry and pacing: library/split-screen/layout.json.
//
//   node tools/recipes/split-screen.mjs prep  --job <dir> --presenter <clip> --info <clip> [--info <clip> ...]
//        [--trim] [--denoise 12] [--lufs -14]
//   node tools/recipes/split-screen.mjs prep  --job <dir> --presenter <clip> --sync [--trim]   (no info video: sync mode)
//   node tools/recipes/split-screen.mjs plan  --job <dir> [--seed 1] [--handle "@name"] [--cta "text"] [--darken auto|on|off] [--sync assets/info-sync.mp4]
//        [--onscreen "0-4.7,18.73-19.9"] [--hide-below 0.78]
// --onscreen: an edited presenter clip with cutaways: the ranges where the presenter is on camera; the rest goes b-full.
// --hide-below: a band of the source (fraction of its height, down to the bottom: burned-in captions) kept under the panel.
// --drop <px>: let the source sit up to this far below the panel top (little headroom); the gap is black under the seam shade.
//   node tools/recipes/split-screen.mjs layout --job <dir>          (writes index.html from data/split-plan.json)
//   node tools/recipes/split-screen.mjs commands|build --job <dir> [--dry-run]
//   node tools/recipes/split-screen.mjs clamp --job <dir>           (caption hosts end with their windows; build runs it)
//   node tools/recipes/split-screen.mjs check --job <dir>
//
// prep: the presenter goes through marketing-pro prep (name "a": CFR 30, upscale, denoised and
//   leveled voice, transcript in data/words.json: CORRECT IT before planning); each info clip is
//   made CFR 30 with short GOPs (fast seeks for many cuts) as assets/b<n>-prep.mp4, then rcg broll
//   scores its shots (data/broll.json + sheet: READ it).
// plan: layout per beat (split / afull / bfull), B-roll montage cut to the speech, a static
//   face-safe presenter crop per split window (MediaPipe face track), the decision to darken the
//   presenter's background through a cut-out (rcg matte), titles, captions per window, transitions
//   and sounds. Writes data/split-plan.json, data/style-plan.json, caption word files and beat-sheet.json.
//   Edit data/split-plan.json (layouts, shots, highlights) and run build; build never re-plans.
// sync mode (--sync <clip>): no montage. One 1080x1920 info clip made in step with the speech (for
//   example rendered info-graphics) plays at the edit's own time: every split and b-full window shows
//   it from mediaStart = the window start, top-anchored in the B panel (its top 1190 px) and full
//   frame in b-full; no Ken Burns, no auto hook title. The clip may be made after planning (the
//   graphics are planned against the windows); it must exist before layout.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { readJson, ROOT } from '../lib/config.mjs';
import { probe, run, runBuffer } from '../lib/ffmpeg.mjs';
import { rcg, runCommands } from '../lib/runner.mjs';
import { Reframe } from '../blocks/camera.mjs';
import { validateBeatSheet } from '../jobs/beat-sheet.mjs';
import { analyzeBroll } from '../media/broll.mjs';
import * as MP from './marketing-pro.mjs';
import { writeLayout } from '../blocks/split.mjs';
import { checkSplit } from '../jobs/split-check.mjs';

const f3 = (n) => +Number(n).toFixed(3);
const f2 = (n) => +Number(n).toFixed(2);
export const LAYOUT_FILE = join(ROOT, 'library', 'split-screen', 'layout.json');
export const loadLayout = () => readJson(LAYOUT_FILE);
const jobRel = (jobDir) => relative(ROOT, jobDir).split('\\').join('/');
const NAME = 'a';

// ── prep ──────────────────────────────────────────────────────────────────────

export async function prep(opts) {
  const jobDir = resolve(opts.job);
  const infos = [].concat(opts.info || []);
  if (!opts.presenter || (!infos.length && !opts.sync)) throw new Error('prep needs --presenter <clip> and at least one --info <clip> (or --sync for a clip made later)');
  const pres = await MP.prep({ job: jobDir, src: opts.presenter, name: NAME, trim: opts.trim, denoise: opts.denoise, lufs: opts.lufs, ceiling: opts.ceiling, scaffold: true });
  if (!infos.length) return { presenter: pres, broll: { clips: [] } };
  const preps = [];
  for (const [i, src] of infos.entries()) {
    const abs = isAbsolute(src) ? src : join(jobDir, src);
    if (!existsSync(abs)) throw new Error(`--info not found: ${abs}`);
    const info = await probe(abs);
    if (!info.video) throw new Error(`${src}: no video stream`);
    const long = Math.max(info.video.width, info.video.height);
    const out = join(jobDir, 'assets', `b${i + 1}-prep.mp4`);
    // Short GOPs: the montage seeks into these files many times.
    const vf = ['fps=30', long > 1920 ? (info.video.width >= info.video.height ? 'scale=1920:-2:flags=lanczos' : 'scale=-2:1920:flags=lanczos') : null, 'format=yuv420p'].filter(Boolean).join(',');
    await run('ffmpeg', ['-y', '-v', 'error', '-i', abs, '-an', '-vf', vf, '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-g', '15', '-keyint_min', '15', out]);
    preps.push(`assets/${basename(out)}`);
  }
  const { doc } = await analyzeBroll({ job: jobDir, src: preps });
  return { presenter: pres, broll: doc };
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Median luminance (0-255) of a source rect at time t. */
async function lumaAt(video, t, rect) {
  const buf = await runBuffer(['-v', 'error', '-ss', String(f3(t)), '-i', video, '-frames:v', '1', '-vf', `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y},scale=48:-2`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  const a = Array.from(buf).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 128;
}

const median = (xs) => { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Face of track frame i in source px, or null when no face: the face box (sides included, chin
 * extended) and the hair top.
 */
export function faceFrame(track, i, srcW, srcH, P) {
  const F = track.face;
  if (F.present && !F.present[i]) return null;
  const cx = F.cx[i]; const cy = F.cy[i]; const w = F.w[i]; const h = F.h[i];
  if (![cx, cy, w, h].every(Number.isFinite)) return null;
  const fw = w * srcW; const fh = h * srcH;
  const x = cx * srcW; const y = cy * srcH;
  return { l: x - fw / 2 - P.sides * fw, r: x + fw / 2 + P.sides * fw, t: y - fh / 2, b: y + fh / 2 + P.chinDown * fh, hair: y - fh / 2 - P.hairUp * fh, cx: x, cy: y, fh };
}

/**
 * How far (output px) a face overruns the presenter panel under a crop. Hard: the face box stays in
 * x margin..W-margin, y shadeTo..H-margin (clear of the shade, above the bottom edge). Soft: the
 * hair may sit under the shade but never above the panel top (into the seam and the B-roll).
 */
export function faceOverrun(f, c, L) {
  const P = L.presenter; const S = L.seam;
  const X = (v) => c.s * v + c.tx; const Y = (v) => c.s * v + c.ty;
  return Math.max(0, P.margin - X(f.l), X(f.r) - (L.W - P.margin), S.shadeTo - Y(f.t), Y(f.b) - (L.H - P.margin), S.aTop + P.margin - Y(f.hair));
}

/**
 * Static face-safe crop of the presenter for a split window [t0, t1): the scale s and the offsets
 * (tx, ty) of the source in OUTPUT px (screen = s * src + t). Searches scales from the target face
 * size down to a cover fit, and the offsets on a grid, for the fewest frames that overrun
 * (faceOverrun > 2 px), then the face closest to its target. When no cover crop passes, it tries
 * smaller scales with a blurred side fill (fill: true; portrait selfies, people who move).
 */
export function solveCrop(track, t0, t1, L, srcW, srcH, { hideBelow = null, drop = 0 } = {}) {
  const P = L.presenter; const S = L.seam;
  const W = L.W; const H = L.H;
  const fps = track.fps;
  const i0 = Math.max(0, Math.floor((t0 - (track.start || 0)) * fps));
  const i1 = Math.min(track.face.cx.length, Math.ceil((t1 - (track.start || 0)) * fps));
  const faces = [];
  let missing = 0;
  for (let i = i0; i < i1; i++) { const f = faceFrame(track, i, srcW, srcH, P); if (f) faces.push(f); else missing++; }
  const panelH = H - S.aTop;
  // hideBelow: a band of the source (fraction of its height down to the bottom, e.g. burned-in
  // captions) that must stay under the panel's bottom edge: a floor on the scale and on ty.
  const sHide = hideBelow ? panelH / (hideBelow * srcH) : 0;
  const sCover = Math.max(W / srcW, panelH / srcH, sHide);
  if (!faces.length) return { s: f3(sCover), tx: f2((W - srcW * sCover) / 2), ty: f2(S.aTop), out: 1, frames: 0, missing, faceH: 0, fill: false, note: 'no face in this window' };
  const mfh = median(faces.map((f) => f.fh));
  const mcx = median(faces.map((f) => f.cx));
  const mcy = median(faces.map((f) => f.cy));
  const grid = (lo, hi, n) => (hi - lo < 1 ? [(lo + hi) / 2] : Array.from({ length: n + 1 }, (_, k) => lo + ((hi - lo) * k) / n));
  const best = (s, fill) => {
    // drop: the source may sit up to `drop` px below the panel top (a source with little headroom);
    // the strip it leaves is black under the dark seam shade, so it reads as part of the seam.
    const tyR = [hideBelow ? Math.max(H - s * srcH, H - s * hideBelow * srcH) : H - s * srcH, S.aTop + Math.min(drop, S.shadeTo - S.aTop)];
    if (tyR[0] > tyR[1] + 0.5) return null; // cannot cover the panel's height
    const txR = fill ? [0, W - s * srcW] : [W - s * srcW, 0];
    let top = null;
    for (const ty of grid(tyR[0], tyR[1], Math.min(240, Math.ceil((tyR[1] - tyR[0]) / 3)))) {
      for (const tx of grid(Math.min(...txR), Math.max(...txR), Math.min(120, Math.ceil(Math.abs(txR[1] - txR[0]) / 6)))) {
        const c = { s, tx, ty };
        let out = 0;
        for (const f of faces) if (faceOverrun(f, c, L) > 2) out++;
        const cost = out * 1e6 + Math.abs(s * mcy + ty - P.faceCenterY) + 0.5 * Math.abs(s * mcx + tx - W / 2);
        if (!top || cost < top.cost) top = { s, tx, ty, out, cost };
      }
    }
    return top;
  };
  let pick = null;
  const s0 = clamp(P.faceH / mfh, sCover, sCover * 2.5);
  for (let s = s0; s >= sCover - 1e-9; s = s > sCover + 1e-9 ? Math.max(sCover, s * 0.94) : 0) {
    const b = best(s, false);
    if (b && (!pick || b.out < pick.out)) pick = { ...b, fill: false };
    if (pick && pick.out / faces.length <= P.maxOut) break;
  }
  if (pick.out / faces.length > P.maxOut && !hideBelow) {
    for (let s = sCover * 0.94; s >= sCover * P.fitMin - 1e-9; s *= 0.94) {
      const b = best(s, true);
      if (b && b.out < pick.out) pick = { ...b, fill: true };
      if (pick.out / faces.length <= P.maxOut) break;
    }
  }
  return { s: f3(pick.s), tx: f2(pick.tx), ty: f2(pick.ty), out: f3(pick.out / faces.length), frames: faces.length, missing, faceH: Math.round(mfh * pick.s), fill: pick.fill };
}

/**
 * The B-roll montage. Shots keep one read position each (shared by both pools, so footage is not
 * shown twice before it runs out); every piece rotates to the next shot in its pool, so each cut
 * shows a different source, interleaved by clip. take(pool, dur) returns pieces that fill dur.
 * A shot read to its end starts again with a shifted crop and the other Ken Burns direction (reuse).
 */
function makePools(broll) {
  const perClip = broll.clips.map((c) => c.shots.map((s) => ({ ...s, w: c.width, h: c.height, orientation: c.orientation })).filter((s) => s.cls !== 'dark'));
  const shots = [];
  for (let k = 0; perClip.some((l) => k < l.length); k++) for (const l of perClip) if (l[k]) shots.push(l[k]);
  if (!shots.length) throw new Error('data/broll.json has no usable shots (all dark?)');
  const byCls = (cls) => shots.filter((s) => cls.includes(s.cls));
  const split = byCls(['footage', 'ui']).length ? byCls(['footage', 'ui']) : shots;
  const full = [...byCls(['card']), ...byCls(['ui']), ...byCls(['footage'])];
  const pools = { split: { list: split, k: 0 }, full: { list: full.length ? full : shots, k: 0 } };
  const off = new Map(shots.map((s) => [s.id, 0]));
  const pass = new Map(shots.map((s) => [s.id, 0]));
  let kbDir = 1;
  function take(name, dur) {
    const p = pools[name];
    const pieces = [];
    let need = dur;
    let guard = 0;
    while (need > 1e-3 && guard++ < 400) {
      const s = p.list[p.k];
      const left = s.dur - off.get(s.id);
      if (left < Math.min(0.6, need) - 1e-6) {
        // Too little left to show: start this shot again (reuse), or move on if it is short anyway.
        if (off.get(s.id) > 0) { off.set(s.id, 0); pass.set(s.id, pass.get(s.id) + 1); } else p.k = (p.k + 1) % p.list.length;
        continue;
      }
      const len = Math.min(need, left);
      const ps = pass.get(s.id);
      const focus = ps ? { x: f3(clamp(s.focus.x + (ps % 2 ? 0.12 : -0.12), 0.2, 0.8)), y: s.focus.y } : s.focus;
      pieces.push({ shot: s.id, src: s.src, mediaStart: f3(s.start + off.get(s.id)), dur: f3(len), cls: s.cls, w: s.w, h: s.h, orientation: s.orientation, focus, kb: ps % 2 ? -kbDir : kbDir, reuse: ps });
      kbDir = -kbDir;
      off.set(s.id, off.get(s.id) + len);
      need -= len;
      p.k = (p.k + 1) % p.list.length;
    }
    return pieces;
  }
  return { take, pools, shots };
}

const OPENER = /^(here('s| is)?|but|so|now|one more|the (best|truth|secret|problem|catch)|and here|why|what if|imagine|listen|look|okay|ok)\b/i;
const NUMBER = /\d|%|\$|\b(percent|million|billion|thousand|hundred)\b/i;
const CTA = /\b(link|bio|follow|subscribe|comment|share|book|dm|message|click)\b/i;

// ── plan ──────────────────────────────────────────────────────────────────────

export async function plan(opts) {
  const jobDir = resolve(opts.job);
  const J = jobRel(jobDir);
  const L = loadLayout();
  const PC = L.pacing;
  const seed = Number(opts.seed ?? 1);
  const source = readJson(join(jobDir, 'data', `mp-source-${NAME}.json`));
  const video = join(jobDir, source.prep.file);
  const voice = join(jobDir, 'assets', `${NAME}-voice.wav`);
  const D = f3(source.duration);
  const srcW = source.prep.width; const srcH = source.prep.height;
  const words = readJson(join(jobDir, 'data', 'words.json')).words.filter((w) => String(w.text).trim());
  const sync = opts.sync ? String(opts.sync).replace(/\\/g, '/') : null;
  const broll = sync ? { clips: [{ src: sync, width: L.W, height: L.H, orientation: 'portrait', sync: true, shots: [] }] } : readJson(join(jobDir, 'data', 'broll.json'));
  const warnings = [];

  const trackFile = join(jobDir, 'data', `track-${NAME}.json`);
  if (!existsSync(trackFile)) {
    execFileSync(process.execPath, ['tools/rcg.mjs', 'track', '--job', J, '--src', source.prep.file, '--name', NAME, '--no-hands'], { cwd: ROOT, stdio: 'inherit' });
  }
  const track = readJson(trackFile);
  const facePct = track.summary?.faceFrames / Math.max(1, track.frames);
  if (facePct < 0.8) warnings.push(`A face was found on only ${(facePct * 100).toFixed(0)}% of presenter frames.`);

  // Speech structure (marketing-pro): clauses snapped to onsets, beats of 1.5-4 s.
  const envelope = await MP.speechEnvelope(voice);
  const { clauses: rawClauses, sentences: beats } = MP.clausesFromWords(words, { silences: envelope.silences });
  const clauses = MP.snapOnsets(rawClauses, envelope);
  beats.forEach((b) => { b.clauses = b.clauses.map((c) => clauses[rawClauses.indexOf(c)]); b.onset = b.clauses[0].onset; });
  const text = (b) => b.words.map((w) => w.text).join(' ');
  const cta = opts.cta ? String(opts.cta) : null;
  if (!cta && CTA.test(text(beats[beats.length - 1]))) warnings.push('The last line sounds like a call to action; pass --cta "text" to add the CTA pill.');

  // 1. A layout per beat.
  const labels = beats.map((b, i) => {
    const t = text(b);
    const gap = i > 0 ? b.start - beats[i - 1].end : 0;
    if (i === 0) return { layout: 'split', reason: 'hook (always split)' };
    if (OPENER.test(t)) return { layout: 'afull', reason: `opener "${t.split(/\s+/).slice(0, 2).join(' ')}"`, strength: 3 };
    if (/\?$/.test(b.words[b.words.length - 1].text)) return { layout: 'afull', reason: 'question', strength: 3 };
    if (i === beats.length - 1 && beats.length >= 3) return { layout: 'afull', reason: 'closing line', strength: 2 };
    if (gap >= PC.pauseForAfull) return { layout: 'afull', reason: `pause ${f2(gap)} s before`, strength: 1 };
    if (NUMBER.test(t)) return { layout: 'bfull', reason: 'number or stat' };
    return { layout: 'split', reason: 'explaining' };
  });
  if (cta) labels[labels.length - 1] = { layout: 'afull', reason: 'call to action', strength: 3 };
  // Cap the a-full share: demote the weakest (pause-only first), never the closing or CTA beat.
  const share = (layout) => labels.reduce((s, l, i) => s + (l.layout === layout ? beats[i].end - beats[i].start : 0), 0) / D;
  while (share('afull') > PC.afullShareMax) {
    const cands = labels.map((l, i) => ({ l, i })).filter((x) => x.l.layout === 'afull' && x.i < labels.length - 1).sort((a, b) => a.l.strength - b.l.strength);
    if (!cands.length) break;
    labels[cands[0].i] = { layout: 'split', reason: `${cands[0].l.reason} (demoted: a-full share)` };
  }
  // B-full rhythm: once split has run splitRun seconds, the next split beat goes full frame.
  let run = 0;
  labels.forEach((l, i) => {
    const d = beats[i].end - beats[i].start;
    if (l.layout !== 'split') { run = 0; return; }
    if (i > 0 && run >= PC.splitRun) { labels[i] = { layout: 'bfull', reason: `${l.reason}; rhythm (split ran ${f2(run)} s)` }; run = 0; return; }
    run += d;
  });

  // 2. Windows from beats (break `lead` before the beat's onset), merged and length-capped.
  let windows = beats.map((b, i) => ({ layout: labels[i].layout, reason: labels[i].reason, beats: [i], start: i === 0 ? 0 : f3(Math.max(0, b.onset - PC.lead)), end: 0 }));
  windows.forEach((w, i) => { w.end = i + 1 < windows.length ? windows[i + 1].start : D; });
  const merge = () => {
    for (let i = windows.length - 1; i > 0; i--) {
      const a = windows[i - 1]; const b = windows[i];
      const max = { split: Infinity, afull: PC.afullMax, bfull: PC.bfullMax }[a.layout];
      if (a.layout === b.layout && b.end - a.start <= max + 1e-6) { a.end = b.end; a.beats.push(...b.beats); a.reason = `${a.reason}; ${b.reason}`; windows.splice(i, 1); }
    }
    // Too short: join the window before (or after, at the start).
    for (let i = windows.length - 1; i >= 0 && windows.length > 1; i--) {
      if (windows[i].end - windows[i].start >= PC.minWindow) continue;
      if (i > 0) { windows[i - 1].end = windows[i].end; windows[i - 1].beats.push(...windows[i].beats); windows.splice(i, 1); } else { windows[1].start = 0; windows[1].beats.unshift(...windows[0].beats); windows.splice(0, 1); }
    }
  };
  merge();
  // A full-frame window over its cap: keep the clauses that fit, the rest goes back to split.
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    const max = { afull: PC.afullMax, bfull: PC.bfullMax }[w.layout];
    if (!max || w.end - w.start <= max + 1e-6) continue;
    const cut = clauses.map((c) => f3(c.onset - PC.lead)).filter((t) => t > w.start + 1.0 && t <= w.start + max).pop();
    if (!cut) continue;
    windows.splice(i + 1, 0, { layout: 'split', reason: `rest of a long ${w.layout} window`, beats: [...w.beats], start: cut, end: w.end });
    w.end = cut;
  }

  // 2b. --onscreen "a-b,c-d": the presenter is on camera only in these ranges (an edited source with
  //     cutaways). Windows are cut at the bounds; every part outside them becomes b-full, so no other
  //     footage reaches the presenter panel or an a-full window. Short on-camera parts go b-full too.
  const onscreen = opts.onscreen ? String(opts.onscreen).split(',').map((r) => r.split('-').map(Number)).filter((r) => r.length === 2 && r.every(Number.isFinite)) : null;
  if (onscreen) {
    const inR = (t) => onscreen.some(([a, b]) => t >= a - 1e-6 && t < b - 1e-6);
    const bounds = onscreen.flat();
    const next = [];
    for (const w of windows) {
      const cuts = [w.start, ...bounds.filter((b) => b > w.start + 1e-3 && b < w.end - 1e-3).sort((x, y) => x - y), w.end];
      for (let k = 0; k + 1 < cuts.length; k++) {
        const on = inR((cuts[k] + cuts[k + 1]) / 2);
        next.push({ ...w, beats: [...w.beats], start: f3(cuts[k]), end: f3(cuts[k + 1]), layout: on ? w.layout : 'bfull', reason: on ? w.reason : `presenter off camera in the source (${w.reason})` });
      }
    }
    for (const w of next) if (w.layout !== 'bfull' && w.end - w.start < PC.minWindow) { w.layout = 'bfull'; w.reason = `${w.reason}; on-camera part under ${PC.minWindow} s`; }
    // Same-layout neighbours merge (no cap: in sync mode the graphics carry the rhythm).
    windows = next.reduce((acc, w) => { const p = acc[acc.length - 1]; if (p && p.layout === w.layout && (w.layout === 'bfull' || p.end - p.start + w.end - w.start <= PC.splitMax + 1e-6)) { p.end = w.end; p.beats.push(...w.beats.filter((b) => !p.beats.includes(b))); } else acc.push(w); return acc; }, []);
    // A b-full part under the minimum joins its b-full neighbour, else the window before.
    for (let i = windows.length - 1; i > 0; i--) if (windows[i].end - windows[i].start < PC.minWindow) { windows[i - 1].end = windows[i].end; windows.splice(i, 1); }
  }
  const cropOpts = { hideBelow: opts['hide-below'] != null ? Number(opts['hide-below']) : null, drop: Number(opts.drop || 0) };

  // 3. Presenter crop per split window; a window whose head leaves the panel changes layout.
  for (const w of windows) {
    if (w.layout !== 'split') continue;
    w.crop = solveCrop(track, w.start, w.end, L, srcW, srcH, cropOpts);
    if (w.crop.out > L.presenter.maxOut) {
      const to = w.end - w.start <= PC.afullMax ? 'afull' : 'bfull';
      warnings.push(`${f2(w.start)}-${f2(w.end)} s: the head leaves the presenter panel on ${(w.crop.out * 100).toFixed(0)}% of frames; the window becomes ${to}.`);
      w.reason = `${w.reason}; head leaves the panel (${(w.crop.out * 100).toFixed(0)}%) -> ${to}`;
      w.layout = to;
      delete w.crop;
    }
  }
  if (!onscreen) merge();
  for (const w of windows) if (w.layout === 'split' && !w.crop) w.crop = solveCrop(track, w.start, w.end, L, srcW, srcH, cropOpts);
  windows.forEach((w, i) => { w.i = i + 1; w.start = f3(w.start); w.end = f3(w.end); });

  // 4. Darken the presenter's background (cut-out over a dark blurred copy) when it is bright.
  const darkenOpt = String(opts.darken || 'auto');
  const lums = [];
  for (const w of windows.filter((x) => x.layout === 'split')) {
    const t = (w.start + w.end) / 2;
    const { s, tx, ty } = w.crop;
    const r = { x: Math.round(clamp(-tx / s, 0, srcW - 8)), y: Math.round(clamp((L.seam.aTop - ty) / s, 0, srcH - 8)) };
    r.w = Math.round(Math.min(srcW - r.x, L.W / s)); r.h = Math.round(Math.min(srcH - r.y, (L.seam.shadeTo + 140 - L.seam.aTop) / s));
    lums.push(await lumaAt(video, t, r));
  }
  const bgLuma = lums.length ? median(lums) : 0;
  const darken = darkenOpt === 'on' || (darkenOpt === 'auto' && bgLuma > L.presenter.darkenLuma);

  // 5. B-roll montage. Top-panel shots cut on clause onsets every 1-2.6 s; full-frame windows take
  //    the card / UI shots first.
  const { take } = sync ? { take: null } : makePools(broll);
  const [minShot, targetShot, maxShot] = PC.topShot;
  const syncPiece = (w, focus) => ({ shot: 'sync', src: sync, mediaStart: w.start, dur: f3(w.end - w.start), cls: 'sync', w: L.W, h: L.H, orientation: 'portrait', focus, kb: 0, reuse: 0, start: w.start, end: w.end });
  const onsets = clauses.map((c) => f3(c.onset - PC.lead));
  for (const w of windows) {
    if (sync) {
      if (w.layout === 'split') w.shots = [syncPiece(w, { x: 0.5, y: 0 })];
      else if (w.layout === 'bfull') { w.shots = [{ ...syncPiece(w, { x: 0.5, y: 0.5 }), treatment: 'cover' }]; w.highlights = []; }
      continue;
    }
    if (w.layout === 'split') {
      const cuts = [w.start];
      let cur = w.start;
      while (w.end - cur > maxShot) {
        const cands = onsets.filter((t) => t >= cur + minShot && t <= cur + maxShot && t <= w.end - minShot);
        const next = cands.length ? cands.reduce((p, t) => (Math.abs(t - cur - targetShot) < Math.abs(p - cur - targetShot) ? t : p)) : f3(Math.min(cur + targetShot, w.end - minShot));
        cuts.push(next); cur = next;
      }
      cuts.push(w.end);
      w.shots = [];
      for (let k = 0; k + 1 < cuts.length; k++) {
        let at = cuts[k];
        for (const p of take('split', f3(cuts[k + 1] - cuts[k]))) { w.shots.push({ ...p, start: f3(at), end: f3(at + p.dur) }); at += p.dur; }
      }
    } else if (w.layout === 'bfull') {
      w.shots = [];
      let at = w.start;
      for (const p of take('full', f3(w.end - w.start))) { w.shots.push({ ...p, start: f3(at), end: f3(at + p.dur) }); at += p.dur; }
      for (const s of w.shots) s.treatment = s.cls === 'card' ? 'band' : (s.cls === 'ui' || s.orientation === 'landscape') ? 'fit' : 'cover';
      w.highlights = [];
    }
  }
  windows.forEach((w) => (w.shots || []).forEach((s) => { if (!s.treatment) s.treatment = 'panel'; }));

  // 6. A-full: the marketing-pro face camera (planned over the whole clip, used inside each window)
  //    and two-tier titles in front of the subject.
  const pseudoHeroes = beats.map((b, si) => { const h = MP.pickHero(b, { first: si === 0, last: si === beats.length - 1 }); return { sentence: si, look: h.role, score: h.score, start: b.start, cta: false }; });
  const cam = MP.planCamera(clauses, beats, pseudoHeroes, { duration: D, seed });
  const camCues = cam.cues;
  const sim = MP.simulator(track, camCues, { W: L.W, H: L.H });
  const items = [];
  const titleJobs = [];
  const A = L.afull;
  for (const w of windows.filter((x) => x.layout === 'afull')) {
    const st = Reframe.stateAt(camCues, w.start);
    const inside = camCues.filter((c) => c.at > w.start + 1e-3 && c.at < w.end - 1e-3);
    w.cues = [{ at: w.start, move: 'face.punch', z: f3(st.z), x: f3(st.x), y: f3(st.y), k: 1, d: 0, ease: 'linear' }, ...inside].map(MP.cueSpec);
    // Titles: the window's words in chunks of <= maxWords, broken at clause ends.
    const ws = words.filter((x) => x.start >= w.start - 1e-3 && x.start < w.end - 1e-3);
    const ends = new Set(clauses.map((c) => c.words[c.words.length - 1]));
    const chunks = [];
    let cur = [];
    ws.forEach((x) => { cur.push(x); const orig = clauses.flatMap((c) => c.words).find((y) => y.start === x.start && y.text === String(x.text).trim()); if (cur.length >= A.maxWords || (orig && ends.has(orig))) { chunks.push(cur); cur = []; } });
    if (cur.length) chunks.push(cur);
    chunks.forEach((c, k) => {
      const plain = (x) => String(x.text).replace(/[,.;:!?]+$/, '');
      const numIdx = c.findIndex((x) => NUMBER.test(x.text));
      let lead; let main; let look;
      if (numIdx >= 0) { look = 'neon'; main = c.slice(numIdx, numIdx + 2).map(plain).join(' '); lead = c.slice(0, numIdx).map(plain).join(' '); }
      else { look = 'italic'; const kk = Math.min(3, c.length); main = c.slice(c.length - kk).map(plain).join(' '); lead = c.slice(0, c.length - kk).map(plain).join(' '); }
      const start = f3(Math.max(w.start, c[0].start - 0.05));
      const end = f3(k + 1 < chunks.length ? Math.max(start + 0.6, chunks[k + 1][0].start - 0.05) : w.end);
      // Keep the title off the face (simulated camera at the chunk's middle).
      const s = sim.at((start + end) / 2);
      let y = A.titleY;
      const faceB = s.face.y + s.face.h * 0.7;
      if (y - A.titleH / 2 < faceB + 20) y = Math.round(Math.min(1536 - A.titleH / 2, faceB + 20 + A.titleH / 2));
      titleJobs.push({ id: `title-w${w.i}-${k + 1}`, t: (start + end) / 2, box: { x: A.titleX - A.titleW / 2, y: y - A.titleH / 2, w: A.titleW, h: A.titleH } });
      items.push({ component: 'hero', id: `title-w${w.i}-${k + 1}`, start, duration: f3(end - start), text: main, lead, look, tone: 'light', accent: 'purple', x: A.titleX, y, w: A.titleW, h: A.titleH, exit: 'cut' });
    });
  }
  // Title tone from the background behind its box (as marketing-pro does): dark text on light walls.
  for (const tj of titleJobs) {
    const lum = await lumaAt(video, tj.t, sim.sourceRect(tj.t, tj.box, srcW, srcH));
    const it = items.find((x) => x.id === tj.id);
    it.tone = lum > 140 ? 'dark' : 'light';
  }
  // Hook title over the B panel in the first window (one key phrase, italic serif), only when the
  // first line has a strong key word (a name, number or power word: hero score >= 2.5).
  const first = windows[0];
  const hook = beats[0] ? MP.pickHero(beats[0], { first: true }) : null;
  if (hook && hook.score < 2.5) warnings.push(`No hook title: the first line has no strong key word (best score ${hook.score}). Add one to data/style-plan.json by hand if wanted.`);
  if (!sync && first.layout === 'split' && hook && hook.score >= 2.5) {
    const h = hook;
    const kw = beats[0].words.slice(h.a, h.b + 1).map((x) => String(x.text).replace(/[,.;:!?]+$/, '')).join(' ');
    const shot0 = first.shots?.[0];
    const sh = broll.clips.flatMap((c) => c.shots).find((s) => s.id === shot0?.shot);
    const end = f3(Math.min(first.end, Math.max(beats[0].end + 0.3, 1.6)));
    items.push({ component: 'hero', id: 'title-hook', start: 0.05, duration: f3(end - 0.05), text: kw, lead: '', look: 'italic', tone: sh && sh.luma > 150 ? 'dark' : 'light', accent: 'purple', x: 482, y: 930, w: 760, h: 200, exit: 'blur' });
  }
  if (cta) {
    const last = windows[windows.length - 1];
    items.push({ component: 'cta', id: 'cta1', start: f3(Math.max(last.start, D - 2.6)), duration: f3(Math.min(2.6, D - last.start) - 0.05), text: cta, y: 1400 });
  }
  writeFileSync(join(jobDir, 'data', 'style-plan.json'), `${JSON.stringify({ style: 'marketing-pro', items }, null, 2)}\n`);

  // 7. Captions per split / b-full window (a-full windows carry their words as the title).
  mkdirSync(join(jobDir, 'data', 'captions'), { recursive: true });
  for (const w of windows) {
    if (w.layout === 'afull') { w.caption = null; continue; }
    const ws = words.filter((x) => x.start >= w.start - 1e-3 && x.start < w.end - 1e-3);
    if (!ws.length) { w.caption = null; continue; }
    const rel = ws.map((x) => ({ text: String(x.text).trim(), start: f3(x.start - w.start), end: f3(Math.min(x.end, w.end - 0.02) - w.start) }));
    const file = `data/captions/cap-w${w.i}.json`;
    writeFileSync(join(jobDir, file), `${JSON.stringify({ words: rel }, null, 2)}\n`);
    const band = w.layout === 'bfull' && w.shots.some((s) => s.treatment === 'band');
    w.caption = { file, style: w.layout === 'split' ? 'split-seam' : 'split-pill', y: band ? L.bfull.bandCaptionY : L.seam.captionY, mode: '2word' };
  }

  // 8. Transitions and sounds: a light leak into each a-full window, a pop on each band card.
  const transitions = [];
  const sfx = [];
  windows.forEach((w, k) => {
    if (k > 0 && w.layout === 'afull' && windows[k - 1].layout !== 'afull') {
      transitions.push({ at: w.start, style: L.transitions.toAfull.style, d: L.transitions.toAfull.d, id: `leak-w${w.i}` });
      sfx.push({ id: `sfx-leak-w${w.i}`, name: L.transitions.toAfull.sfx, landing: w.start, volume: L.transitions.toAfull.volume });
    }
    for (const s of w.shots || []) if (s.treatment === 'band') sfx.push({ id: `sfx-band-${w.i}-${f2(s.start)}`.replace('.', '_'), name: L.transitions.band.sfx, landing: f3(s.start + 0.08), volume: L.transitions.band.volume });
  });

  // 9. Shares and the beat sheet.
  const dur = (layout) => f3(windows.filter((w) => w.layout === layout).reduce((s, w) => s + w.end - w.start, 0));
  const shares = { split: f2(dur('split') / D), bfull: f2(dur('bfull') / D), afull: f2(dur('afull') / D) };
  for (const [k, [lo, hi]] of Object.entries(PC.shares)) if (shares[k] < lo || shares[k] > hi) warnings.push(`${k} share ${shares[k]} is outside the soft target ${lo}-${hi} (fine for a short clip; check the rhythm).`);
  const reuse = windows.flatMap((w) => w.shots || []).filter((s) => s.reuse).length;
  if (reuse) warnings.push(`${reuse} B-roll piece(s) reuse footage already shown (the info video is shorter than the edit needs); they use a shifted crop and the other Ken Burns direction.`);

  const splitPlan = {
    version: 1, seed, duration: D, layoutFile: 'library/split-screen/layout.json',
    presenter: { src: source.prep.file, voice: `assets/${NAME}-voice.wav`, width: srcW, height: srcH, track: `data/track-${NAME}.json`, darken, bgLuma, cutout: darken ? `assets/matte/${NAME}-fg.webm` : null, onscreen, hideBelow: cropOpts.hideBelow, drop: cropOpts.drop },
    clips: broll.clips.map((c) => ({ src: c.src, width: c.width, height: c.height, orientation: c.orientation })),
    handle: opts.handle ? { text: String(opts.handle) } : null,
    windows, transitions, sfx, shares, warnings,
  };
  writeFileSync(join(jobDir, 'data', 'split-plan.json'), `${JSON.stringify(splitPlan, null, 2)}\n`);

  const label = { split: 'SPLIT', afull: 'A-FULL', bfull: 'B-FULL' };
  const beatSheet = {
    version: 1, title: `Split screen: ${basename(jobDir)}`, format: { width: L.W, height: L.H, fps: 30, duration: D },
    summary: `Split-screen edit: presenter ${source.src}, info ${broll.clips.map((c) => c.src).join(', ')}. ${windows.length} layout windows (split ${shares.split}, b-full ${shares.bfull}, a-full ${shares.afull}).`,
    beats: windows.map((w) => {
      const ws = words.filter((x) => x.start >= w.start - 1e-3 && x.start < w.end - 1e-3);
      const shots = (w.shots || []).map((s) => `${s.shot}@${s.mediaStart}${s.treatment !== 'panel' ? ` ${s.treatment}` : ''}`).join(', ');
      const titles = items.filter((it) => it.start >= w.start - 1e-3 && it.start < w.end - 1e-3);
      return {
        start: w.start, end: w.end, words: ws.map((x) => x.text).join(' '),
        onScreen: `${label[w.layout]} (${w.reason}).${shots ? ` B: ${shots}.` : ''}${w.crop ? ` Presenter crop ${w.crop.s}x, face ${w.crop.faceH}px, out ${w.crop.out}.` : ''}${titles.length ? ` Titles: ${titles.map((t) => `"${t.lead ? `${t.lead} / ` : ''}${t.text}" (${t.look})`).join(', ')}.` : ''}`,
        text: [
          ...(w.caption ? [{ content: `captions (${w.caption.style})`, position: 'custom', at: w.start, box: { x: 64, y: w.caption.y - 40, w: 836, h: 80 } }] : []),
          ...titles.map((t) => ({ content: t.text, position: 'custom', at: t.start, box: { x: Math.round(t.x - t.w / 2), y: Math.round(t.y - t.h / 2), w: t.w, h: t.h } })),
        ],
        sound: transitions.some((t) => Math.abs(t.at - w.start) < 1e-3) ? 'voice + whoosh (light leak)' : 'voice',
      };
    }),
    notes: ['Words from data/words.json (correct them before building).', `Presenter background luma ${bgLuma}: ${darken ? 'darkened through a cut-out' : 'left as shot'}.`, ...warnings],
  };
  const problems = validateBeatSheet(beatSheet);
  writeFileSync(join(jobDir, 'beat-sheet.json'), `${JSON.stringify(beatSheet, null, 2)}\n`);
  return { splitPlan, items, problems, warnings };
}

// ── commands / build ──────────────────────────────────────────────────────────

export function buildCommands(jobDir) {
  const J = jobRel(jobDir);
  const P = readJson(join(jobDir, 'data', 'split-plan.json'));
  const style = readJson(join(jobDir, 'data', 'style-plan.json'), { items: [] });
  const me = 'tools/recipes/split-screen.mjs';
  const cmds = [];
  if (P.presenter.darken && !existsSync(join(jobDir, P.presenter.cutout))) {
    const M = loadLayout().presenter.matte;
    cmds.push(rcg('matte', '--job', J, '--src', P.presenter.src, '--name', NAME, '--choke', M.choke, '--feather', M.feather, '--temporal', M.temporal, '--sheet'));
  }
  cmds.push([me, 'layout', '--job', J]);
  for (const w of P.windows.filter((x) => x.layout === 'afull')) {
    cmds.push(rcg('camera', '--job', J, '--target', `#wa${w.i}`, '--track', P.presenter.track, '--id', `cam-wa${w.i}`, ...w.cues.flatMap((c) => ['--cue', c])));
  }
  if (style.items?.length) cmds.push(rcg('style', 'build', '--job', J, '--spec', `${J}/data/style-plan.json`, '--sfx', '--insert'));
  P.windows.filter((w) => w.caption).forEach((w, k) => {
    cmds.push(rcg('captions', '--job', J, '--words', `${J}/${w.caption.file}`, '--style', w.caption.style, '--mode', w.caption.mode, '--y', w.caption.y, '--start', w.start, '--id', `cap-w${w.i}`, '--track', 30 + (k % 2), '--insert'));
  });
  cmds.push([me, 'clamp', '--job', J]);
  for (const t of P.transitions) cmds.push(rcg('transition', '--job', J, '--at', t.at, '--style', t.style, '--d', t.d, '--id', t.id));
  cmds.push(rcg('mix-check', `${J}/index.html`));
  cmds.push([me, 'check', '--job', J]);
  cmds.push(rcg('hf', '--cwd', J, 'check'));
  return cmds;
}

/**
 * Caption hosts end with their window: rcg captions holds the last group a little past the last
 * word, which showed a seam caption over the next (full-frame) window in R12.
 */
export function clampCaptions(jobDir) {
  const P = readJson(join(jobDir, 'data', 'split-plan.json'));
  const file = join(jobDir, 'index.html');
  let html = readFileSync(file, 'utf8');
  const out = [];
  for (const w of P.windows.filter((x) => x.caption)) {
    const re = new RegExp(`(<div id="cap-w${w.i}"[^>]*data-duration=")([0-9.]+)(")`);
    const m = html.match(re);
    if (!m) { out.push(`cap-w${w.i}: host not found`); continue; }
    const max = f3(w.end - w.start);
    if (Number(m[2]) > max) { html = html.replace(re, `$1${max}$3`); out.push(`cap-w${w.i}: ${m[2]} -> ${max} s`); }
  }
  writeFileSync(file, html);
  return out.length ? out : ['captions already end with their windows'];
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const cmd = a._[0];
  const fail = (m) => { console.error(m); process.exit(2); };
  try {
    if (cmd === 'prep') {
      if (!a.job || !a.presenter || (!a.info && !a.sync)) fail('Usage: split-screen.mjs prep --job <dir> --presenter <clip> --info <clip> [--info <clip>] [--trim] [--denoise 12] [--lufs -14]');
      const { presenter, broll } = await prep({ ...a, trim: Boolean(a.trim) });
      const r = presenter.report;
      console.log(`Presenter ${r.source.width}x${r.source.height} -> ${r.prep.file} ${r.prep.width}x${r.prep.height} @ ${r.prep.fps} fps; voice ${r.audio.after.integratedLufs} LUFS; trim ${r.trim.start}-${r.trim.end} s; duration ${r.duration} s`);
      console.log(`Transcript (${presenter.words.length} words): ${presenter.words.map((w) => w.text).join(' ')}`);
      for (const c of broll.clips) console.log(`Info ${c.src}: ${c.width}x${c.height} ${c.orientation}, ${c.duration} s, shots: ${c.shots.map((s) => `${s.id} ${s.cls}`).join(', ')}`);
      console.log(a.sync ? 'Next: correct data/words.json, then rcg split-screen plan --sync assets/info-sync.mp4' : 'Next: correct data/words.json, READ data/broll-sheet.png (fix classes in data/broll.json), then rcg split-screen plan');
    } else if (cmd === 'plan') {
      if (!a.job) fail('Usage: split-screen.mjs plan --job <dir> [--seed 1] [--handle "@name"] [--cta "text"] [--darken auto|on|off]');
      const { splitPlan: P, items, problems } = await plan(a);
      execFileSync(process.execPath, [join(ROOT, 'tools', 'jobs', 'beat-sheet.mjs'), 'md', join(resolve(a.job), 'beat-sheet.json'), join(resolve(a.job), 'beat-sheet.md')], { stdio: 'inherit' });
      for (const w of P.windows) {
        console.log(`  w${String(w.i).padEnd(3)} ${String(w.start).padStart(6)}-${String(w.end).padEnd(6)} ${w.layout.padEnd(6)} ${w.reason}`);
        if (w.crop) console.log(`        presenter crop ${w.crop.s}x at (${w.crop.tx}, ${w.crop.ty}), face ${w.crop.faceH}px, head out ${w.crop.out} of ${w.crop.frames} frames`);
        for (const s of w.shots || []) console.log(`        B ${String(s.start).padStart(6)}-${String(s.end).padEnd(6)} ${s.shot} @${s.mediaStart} ${s.treatment}${s.reuse ? ' (reuse)' : ''}`);
        if (w.cues) console.log(`        camera ${w.cues.length} cue(s)`);
      }
      console.log(`Shares: split ${P.shares.split}, b-full ${P.shares.bfull}, a-full ${P.shares.afull}. Presenter background luma ${P.presenter.bgLuma}: ${P.presenter.darken ? 'darken through a cut-out' : 'as shot'}.`);
      console.log(`Titles: ${items.map((t) => `${t.id} "${t.lead ? `${t.lead} / ` : ''}${t.text}" ${t.look} ${t.start}-${f3(t.start + t.duration)}`).join('; ') || 'none'}`);
      for (const w of P.warnings) console.log(`WARNING: ${w}`);
      for (const p of problems.errors || []) console.log(`BEAT SHEET ERROR: ${p}`);
      console.log(`Next: review beat-sheet.md (edit data/split-plan.json if needed), then rcg split-screen build --job ${a.job}`);
    } else if (cmd === 'layout') {
      if (!a.job) fail('Usage: split-screen.mjs layout --job <dir>');
      const r = writeLayout({ job: a.job });
      console.log(`index.html written: ${r.windows} windows, ${r.videos} video clips, ${r.sfx} sound(s)${r.darken ? ', presenter background darkened' : ''}`);
    } else if (cmd === 'commands' || cmd === 'build') {
      if (!a.job) fail('Usage: split-screen.mjs commands|build --job <dir> [--dry-run]');
      runCommands(buildCommands(resolve(a.job)), { dryRun: cmd === 'commands' || Boolean(a['dry-run']) });
    } else if (cmd === 'clamp') {
      if (!a.job) fail('Usage: split-screen.mjs clamp --job <dir>');
      for (const l of clampCaptions(resolve(a.job))) console.log(l);
    } else if (cmd === 'check') {
      if (!a.job) fail('Usage: split-screen.mjs check --job <dir>');
      const r = checkSplit({ job: a.job });
      for (const l of r.lines) console.log(l);
      if (r.errors.length) { for (const e of r.errors) console.error(`SPLIT CHECK FAIL: ${e}`); process.exit(1); }
      console.log('SPLIT CHECK OK');
    } else {
      fail('Usage: split-screen.mjs prep | plan | layout | commands | build | check --job <dir> ...');
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}
