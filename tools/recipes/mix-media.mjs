// rcg mix-media: the cut-out half of the Mix Media look (a handmade cork-board scrapbook,
// "Hi.Boly" director's bible; skill .agents/skills/style-mix-media, pack library/styles/mix-media).
// The look lives in the style pack; this tool makes the paper pieces from the user's footage.
//
//   node tools/recipes/mix-media.mjs prep --job <dir> --src assets/<clip> [--name v1]
//        [--times 2,4.5,8.6,13.3 | --poses 6] [--objects "cup,cell phone"] [--object-at 9.1]
//        [--no-live] [--live-fps 12] [--border 18] [--paper cream|white]
//        [--boards bare,newspaper,kraft,fabric,watercolor] [--seed 1]
//   node tools/recipes/mix-media.mjs boards  --job <dir> [--overlays bare,newspaper,kraft,fabric,watercolor,mat] [--seed 1]
//   node tools/recipes/mix-media.mjs pose    --job <dir> --src assets/<clip> --at <s> --name <pose-name> [--matte <webm>]
//   node tools/recipes/mix-media.mjs object  --job <dir> --src assets/<clip> --at <s> (--label cup | --point x,y | --box x,y,w,h) [--name cup] [--plain]
//   node tools/recipes/mix-media.mjs sticker --job <dir> --in assets/<image> --name <name> [--cut alpha|light|none]
//        [--edge die|paper|none] [--illustrate] [--border 10]
//   node tools/recipes/mix-media.mjs sheet   --job <dir>
//
// prep: 1. rcg matte on the clip (skipped when assets/matte/<name>-fg.webm exists);
//   2. the live cut-out: the matte re-cut every frame at stop-motion rate (12 fps, "on twos" at 24)
//      with a hand-torn cream paper border, cropped to the subject -> assets/mm/live-<name>.webm;
//   3. still poses at --times (or --poses N picked as distinct silhouettes, sharpest nearby frame):
//      the source frame + the matte alpha at that time, torn border -> assets/mm/pose-<k>.png;
//   4. objects (COCO labels the detector sees: cup, cell phone, laptop, book, bottle...): rcg layers
//      cuts each at its best frame, then the vintage-sticker treatment (posterized, muted, inked,
//      grain, die-cut border) -> assets/mm/obj-<label>.png;
//   5. boards: the cork board with a different overlay per scene -> assets/mm/boards/<overlay>.jpg;
//   6. data/mm-prep.json (every piece with its size and source time) and data/mm-cutouts.png (READ it,
//      then name the poses by what the body says: phone-call, laughing, reading, smiling...).
// Heavy steps (matte, layers) share the machine-wide heavy-work slot; run prep in the background.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isMain, numList, parseArgs } from '../lib/cli.mjs';
import { loadConfig, readJson, ROOT } from '../lib/config.mjs';
import { probe } from '../lib/ffmpeg.mjs';
import { runMatte } from '../track/matte.mjs';
import { makeLayers } from '../track/layers.mjs';

const ART = join(ROOT, 'tools', 'media', 'mixmedia_art.py');
const f3 = (n) => +Number(n).toFixed(3);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function art(args) {
  const { bin } = loadConfig();
  const py = bin.imagePython || 'python';
  let out;
  try {
    out = execFileSync(py, ['-I', ART, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 26 });
  } catch (err) {
    throw new Error(`mixmedia_art.py ${args[0]} failed (${py}; needs OpenCV + NumPy, see rcg doctor): ${(err.stderr || err.message).toString().trim().split('\n').slice(-4).join(' | ')}`);
  }
  return JSON.parse(out.trim().split('\n').pop());
}

const bins = () => { const { bin } = loadConfig(); return ['--ffmpeg', bin.ffmpeg || 'ffmpeg', '--ffprobe', bin.ffprobe || 'ffprobe']; };

function ffmpeg(args) {
  const { bin } = loadConfig();
  execFileSync(bin.ffmpeg || 'ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { windowsHide: true, maxBuffer: 1 << 26 });
}

const manifestPath = (jobDir) => join(jobDir, 'data', 'mm-prep.json');
function readManifest(jobDir) {
  return readJson(manifestPath(jobDir), { poses: [], objects: [], stickers: [], boards: {} });
}
function writeManifest(jobDir, m) {
  mkdirSync(join(jobDir, 'data'), { recursive: true });
  writeFileSync(manifestPath(jobDir), `${JSON.stringify(m, null, 2)}\n`);
}
const upsert = (list, item) => { const i = list.findIndex((x) => x.name === item.name); if (i >= 0) list[i] = item; else list.push(item); };

// ── pieces ──────────────────────────────────────────────────────────────────

export function boards(opts) {
  const jobDir = resolve(opts.job);
  const overlays = String(opts.overlays || 'bare,newspaper,kraft,fabric,watercolor,mat');
  const res = art(['boards', '--out-dir', join(jobDir, 'assets', 'mm', 'boards'), '--seed', String(opts.seed ?? 1), '--overlays', overlays]);
  const m = readManifest(jobDir);
  for (const ov of overlays.split(',').map((s) => s.trim()).filter(Boolean)) m.boards[ov] = `assets/mm/boards/${ov}.jpg`;
  writeManifest(jobDir, m);
  return res;
}

export async function pose(opts) {
  const jobDir = resolve(opts.job);
  const src = join(jobDir, opts.src);
  const matte = join(jobDir, opts.matte || `assets/matte/${opts.matteName || 'v1'}-fg.webm`);
  if (!existsSync(src)) throw new Error(`--src not found: ${opts.src}`);
  if (!existsSync(matte)) throw new Error(`No matte at ${matte}: run rcg matte (or prep) first`);
  const at = Number(opts.at);
  const name = slug(opts.name || `pose-${String(at).replace('.', '_')}`);
  const work = mkdtempSync(join(tmpdir(), 'rcg-mm-'));
  try {
    const rgb = join(work, 'rgb.png');
    const alpha = join(work, 'alpha.png');
    ffmpeg(['-ss', String(at), '-i', src, '-frames:v', '1', rgb]);
    // The matte has the source's frame rate and start, so the same time gives the same frame.
    ffmpeg(['-c:v', 'libvpx-vp9', '-ss', String(at), '-i', matte, '-frames:v', '1', '-pix_fmt', 'rgba', alpha]);
    const out = join(jobDir, 'assets', 'mm', `${name}.png`);
    mkdirSync(join(jobDir, 'assets', 'mm'), { recursive: true });
    const res = art(['torn', '--rgb', rgb, '--alpha', alpha, '--out', out, '--border', String(opts.border ?? 18), '--paper', opts.paper || 'cream', '--seed', String(opts.seed ?? Math.round(at * 100))]);
    const item = { name, file: `assets/mm/${name}.png`, at: f3(at), size: res.size, source: opts.src };
    const m = readManifest(jobDir);
    upsert(m.poses, item);
    writeManifest(jobDir, m);
    return item;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function object(opts) {
  const jobDir = resolve(opts.job);
  const at = Number(opts.at);
  const label = opts.label ? String(opts.label).toLowerCase() : null;
  const name = slug(opts.name || label || `obj-${at}`);
  if (!label && !opts.point && !opts.box) throw new Error('object needs --label, --point x,y or --box x,y,w,h');
  const work = mkdtempSync(join(tmpdir(), 'rcg-mm-obj-'));
  let cut;
  try {
    if (opts.box) {
      // A box: GrabCut inside it. The click segmenters (magic_touch) take the whole person when the
      // object is small or the same colour as its surroundings (a white cup on a white wall).
      const frame = join(work, 'frame.png');
      ffmpeg(['-ss', String(at), '-i', join(jobDir, opts.src), '-frames:v', '1', frame]);
      cut = join(work, 'obj.png');
      art(['grab', '--src', frame, '--box', String(opts.box), '--out', cut]);
    } else {
      const lname = `mm-${name}`;
      await makeLayers({ job: jobDir, src: opts.src, at, name: lname, layer: [`obj:${label || `@${opts.point}`}`], pad: 4, extend: 0 });
      cut = join(jobDir, 'assets', 'layers', lname, 'obj.png');
    }
    var out = join(jobDir, 'assets', 'mm', `obj-${name}.png`);
    mkdirSync(join(jobDir, 'assets', 'mm'), { recursive: true });
    var res = art(['sticker', '--in', cut, '--out', out, ...(opts.plain ? [] : ['--illustrate']), '--border', String(opts.border ?? 10),
      '--min-side', String(opts['min-side'] ?? 520), '--seed', String(opts.seed ?? 5)]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const rec = { name, file: `assets/mm/obj-${name}.png`, at: f3(at), label: label || null, size: res.size, source: opts.src, illustrated: !opts.plain };
  const m = readManifest(jobDir);
  upsert(m.objects, rec);
  writeManifest(jobDir, m);
  return rec;
}

export function sticker(opts) {
  const jobDir = resolve(opts.job);
  const src = join(jobDir, opts.in);
  if (!existsSync(src)) throw new Error(`--in not found: ${opts.in}`);
  const name = slug(opts.name || 'sticker');
  const out = join(jobDir, 'assets', 'mm', `st-${name}.png`);
  mkdirSync(join(jobDir, 'assets', 'mm'), { recursive: true });
  const res = art(['sticker', '--in', src, '--out', out, '--cut', opts.cut || 'alpha', '--edge', opts.edge || 'die', '--border', String(opts.border ?? 10),
    '--max-side', String(opts['max-side'] ?? 900), ...(opts.illustrate ? ['--illustrate'] : []), '--seed', String(opts.seed ?? 3)]);
  const rec = { name, file: `assets/mm/st-${name}.png`, size: res.size, source: opts.in, cut: opts.cut || 'alpha', edge: opts.edge || 'die' };
  const m = readManifest(jobDir);
  upsert(m.stickers, rec);
  writeManifest(jobDir, m);
  return rec;
}

export function sheet(opts) {
  const jobDir = resolve(opts.job);
  const m = readManifest(jobDir);
  const items = [
    ...m.poses.map((p) => ({ file: join(jobDir, p.file), label: `${p.name} @${p.at}s` })),
    ...m.objects.map((o) => ({ file: join(jobDir, o.file), label: `obj ${o.name} @${o.at}s` })),
    ...m.stickers.map((s) => ({ file: join(jobDir, s.file), label: `st ${s.name}` })),
  ];
  if (!items.length) throw new Error('Nothing to show: no poses, objects or stickers in data/mm-prep.json');
  const work = mkdtempSync(join(tmpdir(), 'rcg-mm-sheet-'));
  try {
    const list = join(work, 'items.json');
    writeFileSync(list, JSON.stringify(items));
    return art(['sheet', '--out', join(jobDir, 'data', 'mm-cutouts.png'), '--items', list]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ── prep ────────────────────────────────────────────────────────────────────

export async function prep(opts) {
  const jobDir = resolve(opts.job);
  if (!opts.src) throw new Error('prep needs --src assets/<clip>');
  const src = join(jobDir, opts.src);
  if (!existsSync(src)) throw new Error(`--src not found: ${opts.src}`);
  const name = opts.name || 'v1';
  const report = { notes: [] };
  const matteRel = `assets/matte/${name}-fg.webm`;
  if (!existsSync(join(jobDir, matteRel))) {
    console.log(`matte: rcg matte on ${opts.src} (about 0.5 s per source frame on CPU) ...`);
    await runMatte({ job: jobDir, src: opts.src, sheet: true, choke: opts.choke ?? 2, name });
  } else report.notes.push(`matte: kept ${matteRel}`);
  const m = readManifest(jobDir);
  m.source = opts.src;
  m.matte = matteRel;
  writeManifest(jobDir, m);

  if (!opts['no-live']) {
    console.log('live: re-cutting every frame with a torn paper border ...');
    const out = join(jobDir, 'assets', 'mm', `live-${name}.webm`);
    mkdirSync(join(jobDir, 'assets', 'mm'), { recursive: true });
    const res = art(['live', '--in', join(jobDir, matteRel), '--out', out, ...bins(), '--fps', String(opts['live-fps'] ?? 12),
      '--border', String(opts.border ?? 16), '--paper', opts.paper || 'cream', '--max-h', String(opts['max-h'] ?? 1280), '--seed', String(opts.seed ?? 1)]);
    const mm = readManifest(jobDir);
    mm.live = { name: `live-${name}`, file: `assets/mm/live-${name}.webm`, size: res.size, fps: res.fps, duration: res.duration, crop: res.crop, scale: res.scale, source: opts.src };
    writeManifest(jobDir, mm);
  }

  let times = opts.times != null ? numList(opts.times) : null;
  if (!times) {
    const res = art(['pick', '--in', join(jobDir, matteRel), '--src', src, ...bins(), '--count', String(opts.poses ?? 6)]);
    times = res.picks.map((p) => p.at);
    report.notes.push(`poses picked as distinct silhouettes at ${times.join(', ')} s (override with --times)`);
  }
  for (const [k, t] of times.entries()) {
    const p = await pose({ job: jobDir, src: opts.src, at: t, name: `pose-${k + 1}`, matteName: name, border: opts.border, paper: opts.paper });
    console.log(`pose: ${p.file} @ ${p.at}s (${p.size.join('x')})`);
  }

  const wanted = String(opts.objects || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (wanted.length) {
    const dur = (await probe(src)).duration;
    const probes = opts['object-at'] != null ? numList(opts['object-at']) : [0.15, 0.4, 0.65, 0.88].map((f) => f3(f * dur));
    const best = {};
    for (const t of probes) {
      const r = await makeLayers({ job: jobDir, src: opts.src, at: t, detect: true, name: 'mm-detect' });
      for (const d of r.detections) {
        const area = d.box[2] * d.box[3];
        const score = d.score * Math.sqrt(area);
        if (wanted.includes(d.label) && (!best[d.label] || score > best[d.label].score)) best[d.label] = { at: t, score, box: d.box };
      }
    }
    for (const label of wanted) {
      if (!best[label]) { report.notes.push(`object "${label}": not detected at ${probes.join(', ')} s; use object --point or --box`); continue; }
      const o = await object({ job: jobDir, src: opts.src, at: best[label].at, label, name: label });
      console.log(`object: ${o.file} @ ${o.at}s (${o.size.join('x')})`);
    }
  }

  const b = boards({ job: jobDir, overlays: opts.boards || 'bare,newspaper,kraft,fabric,watercolor', seed: opts.seed });
  console.log(`boards: ${b.boards.length} in assets/mm/boards`);
  const s = sheet({ job: jobDir });
  return { manifest: manifestPath(jobDir), sheet: s.sheet, notes: report.notes };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const cmd = a._[0];
  try {
    if (!a.job) throw new Error('Usage: mix-media.mjs prep|boards|pose|object|sticker|sheet --job <dir> ... (see the header)');
    if (cmd === 'prep') {
      const r = await prep({ ...a, 'no-live': Boolean(a['no-live']) });
      for (const n of r.notes) console.log(`note: ${n}`);
      console.log(`Manifest ${r.manifest}\nSheet ${r.sheet} (READ it, then name the poses)`);
    } else if (cmd === 'boards') {
      console.log(JSON.stringify(boards(a)));
    } else if (cmd === 'pose') {
      if (!a.src || a.at == null) throw new Error('pose needs --src and --at');
      console.log(JSON.stringify(await pose(a)));
    } else if (cmd === 'object') {
      if (!a.src || a.at == null) throw new Error('object needs --src and --at');
      console.log(JSON.stringify(await object({ ...a, plain: Boolean(a.plain) })));
    } else if (cmd === 'sticker') {
      if (!a.in) throw new Error('sticker needs --in assets/<image>');
      console.log(JSON.stringify(sticker({ ...a, illustrate: Boolean(a.illustrate) })));
    } else if (cmd === 'sheet') {
      console.log(JSON.stringify(sheet(a)));
    } else {
      throw new Error('Usage: mix-media.mjs prep|boards|pose|object|sticker|sheet (see the header)');
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}
