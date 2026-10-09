// rcg layers: cut a photo (or one frame of a clip) into depth layers for the 2.5D parallax
// (multiplane) look, the Photoshop step of the Vox workflow.
//   1. MediaPipe in headless Chrome (library/vision, task 'segment'): EfficientDet finds the
//      objects, magic_touch cuts one out per click point, the selfie model helps on people.
//   2. OpenCV (tools/track/layers.py, config bin.imagePython): keep the piece under the click,
//      clean and feather the edge, give each pixel to its front-most layer, fill the background
//      behind the cut-outs (Telea, softened).
// Benchmarked against OpenCV GrabCut on the R10 frame: magic_touch was about 25x faster per
// object (0.3 s vs 7.7 s) with clean edges where GrabCut took in the sofa.
//
// Usage:
//   node tools/track/layers.mjs --job <dir> --src assets/<image|clip> [--at <s>] --detect
//   node tools/track/layers.mjs --job <dir> --src assets/<image|clip> [--at <s>] --name scene1
//        --layer "mid:person" --layer "fg:dining table,chair" [--pad 14] [--extend 60] [--feather 1.2]
//        [--fill-scale 0.5] [--min-score 0.3] [--max-side 2400] [--keep]
//
// --layer "<name>:<item>,<item>..." lists ONE layer; give layers from back to front (the
// background "bg" is implicit). An item is a COCO label the detector found ("person", "chair",
// "dining table", "car"...; the best unused box with that label), a click point "@x,y" (0-1 of the
// frame, or pixels), or "box=x,y,w,h" (pixels; clicked at its centre and limited to it).
// --detect only lists what the detector sees, to choose labels. --extend grows each layer that
// many px into the area its front layers hide, filled from its own edge, so a moving foreground
// does not uncover a hard cut (legs behind a chair). --pad dilates the background hole.
// Writes assets/layers/<name>/{bg,<layer>...}.png, data/layers-<name>.json (the manifest the
// vox-parallax "parallax" component reads) and data/layers-<name>.png (check sheet: READ it).

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, isAbsolute, join, resolve } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { loadConfig, ROOT } from '../lib/config.mjs';
import { heavySlot } from '../lib/lock.mjs';
import { probe } from '../lib/ffmpeg.mjs';
import { ff, runVisionPage } from './common.mjs';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);

/** "fg:dining table,chair" -> { name, items: [...] } */
export function parseLayer(spec, W, H) {
  const i = String(spec).indexOf(':');
  if (i <= 0) throw new Error(`--layer "${spec}": use name:item[,item...]`);
  const name = spec.slice(0, i).trim();
  if (!/^[a-z][a-z0-9-]*$/i.test(name) || name === 'bg') throw new Error(`--layer "${spec}": name must be a word other than "bg"`);
  const items = [];
  // Split on commas that are not inside "@x,y" or "box=x,y,w,h".
  const parts = spec.slice(i + 1).match(/@\s*[-\d.]+\s*,\s*[-\d.]+|box=\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+|[^,]+/g) || [];
  for (const raw of parts.map((s) => s.trim()).filter(Boolean)) {
    if (raw.startsWith('@')) {
      let [x, y] = raw.slice(1).split(',').map(Number);
      if (x > 1 || y > 1) { x /= W; y /= H; }
      items.push({ x, y });
    } else if (raw.startsWith('box=')) {
      const box = raw.slice(4).split(',').map((v) => Math.round(Number(v)));
      if (box.length !== 4 || box.some((v) => !Number.isFinite(v))) throw new Error(`--layer "${spec}": box=x,y,w,h in pixels`);
      items.push({ box, x: (box[0] + box[2] / 2) / W, y: (box[1] + box[3] / 2) / H });
    } else {
      items.push({ label: raw.toLowerCase() });
    }
  }
  if (!items.length) throw new Error(`--layer "${spec}": no items`);
  return { name, items };
}

async function prepareSource(src, at, maxSide, dest) {
  const info = await probe(src);
  const v = info.video;
  if (!v) throw new Error(`${src}: no image or video stream`);
  const long = Math.max(v.width, v.height);
  const scale = long > maxSide ? `,scale=${v.width >= v.height ? maxSide : -2}:${v.width >= v.height ? -2 : maxSide}` : '';
  const isImage = IMAGE_EXT.has(extname(src).toLowerCase());
  const args = isImage ? ['-i', src] : ['-ss', String(at || 0), '-i', src];
  return ff([...args, '-frames:v', '1', '-vf', `format=rgb24${scale}`, dest]);
}

export async function makeLayers(opts) {
  const cfg = loadConfig();
  const jobDir = resolve(opts.job);
  const srcAbs = isAbsolute(opts.src) ? opts.src : join(jobDir, opts.src);
  if (!existsSync(srcAbs)) throw new Error(`Source not found: ${srcAbs}`);
  const name = opts.name || 'scene';
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) throw new Error(`--name "${name}": letters, digits and dashes`);
  const release = await heavySlot('layers', jobDir, opts);
  const work = mkdtempSync(join(tmpdir(), 'rcg-layers-'));
  try {
    mkdirSync(join(work, 'in'), { recursive: true });
    mkdirSync(join(work, 'out'), { recursive: true });
    await prepareSource(srcAbs, opts.at, Number(opts['max-side'] || 2400), join(work, 'in', 'source.png'));
    const { width: W, height: H } = (await probe(join(work, 'in', 'source.png'))).video;

    const layerSpecs = [].concat(opts.layer || []).map((s) => parseLayer(s, W, H));
    if (!opts.detect && !layerSpecs.length) throw new Error('Give at least one --layer (or --detect to list objects).');
    const requests = [];
    const layers = layerSpecs.map((l) => ({
      name: l.name,
      requests: l.items.map((it) => { requests.push({ ...it, layer: l.name, person: it.label === 'person' }); return requests.length - 1; }),
    }));
    if (new Set(layers.map((l) => l.name)).size !== layers.length) throw new Error('Layer names must be unique.');

    const t0 = Date.now();
    const state = await runVisionPage(work, {
      task: 'segment', delegate: 'CPU', width: W, height: H, frames: requests.length + 2,
      minScore: Number(opts['min-score'] ?? 0.3), requests, selfie: requests.some((r) => r.person),
    }, { timeoutMs: 180000 });
    const det = JSON.parse(readFileSync(join(work, 'out', 'detect.json'), 'utf8'));
    const visionMs = Date.now() - t0;
    mkdirSync(join(jobDir, 'data'), { recursive: true });
    writeFileSync(join(jobDir, 'data', `layers-${name}-detect.json`), `${JSON.stringify(det, null, 2)}\n`);
    if (opts.detect) return { detections: det.detections, size: [W, H], visionMs, console: state.console };

    const missing = det.requests.filter((r) => r.missing);
    if (missing.length) {
      throw new Error(`Not found by the detector: ${missing.map((r) => `"${r.label}" (${r.layer})`).join(', ')}. `
        + `It sees: ${det.detections.map((d) => `${d.label} ${d.score}`).join(', ') || 'nothing'}. Use a click point @x,y or box=x,y,w,h instead.`);
    }
    const outDir = join(jobDir, 'assets', 'layers', name);
    const manifest = join(jobDir, 'data', `layers-${name}.json`);
    const sheet = join(jobDir, 'data', `layers-${name}.png`);
    const specFile = join(work, 'spec.json');
    writeFileSync(specFile, JSON.stringify({
      work, outDir, manifest, sheet, layers, requests: det.requests, detections: det.detections,
      source: opts.src + (opts.at != null && !IMAGE_EXT.has(extname(srcAbs).toLowerCase()) ? ` @ ${opts.at}s` : ''),
      pad: Number(opts.pad ?? 14), extend: Number(opts.extend ?? 60), fillScale: Number(opts['fill-scale'] ?? 0.5), feather: Number(opts.feather ?? 1.2),
    }));
    const py = cfg.bin.imagePython || 'python';
    const t1 = Date.now();
    let out;
    try {
      out = execFileSync(py, ['-I', join(ROOT, 'tools', 'track', 'layers.py'), specFile], { encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 24 });
    } catch (err) {
      throw new Error(`layers.py failed (${py}; needs OpenCV + Pillow, see rcg doctor): ${err.stderr || err.message}`);
    }
    const res = JSON.parse(out.trim().split('\n').pop());
    // The manifest stores job-relative paths, so the job folder can move.
    const m = JSON.parse(readFileSync(manifest, 'utf8'));
    m.dir = `assets/layers/${name}`;
    writeFileSync(manifest, `${JSON.stringify(m, null, 2)}\n`);
    if (opts.keep) copyFileSync(join(work, 'in', 'source.png'), join(outDir, 'source.png'));
    return { ...res, manifest, sheet, size: [W, H], visionMs, cvMs: Date.now() - t1, requests: det.requests, console: state.console };
  } finally {
    release();
    if (!opts.keepWork) rmSync(work, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job || !a.src) {
    console.error('Usage: layers.mjs --job <dir> --src <image|clip> [--at s] (--detect | --name n --layer "name:item,..." ...) [--pad 14] [--feather 1.2] [--fill-scale 0.5]');
    process.exit(2);
  }
  try {
    const r = await makeLayers({ ...a, detect: Boolean(a.detect), keep: Boolean(a.keep) });
    if (a.detect) {
      console.log(`Detections in ${r.size.join('x')} (${r.visionMs} ms):`);
      for (const d of r.detections) console.log(`  ${d.label.padEnd(16)} ${d.score.toFixed(2)}  box ${d.box.join(',')}`);
      if (!r.detections.length) console.log('  none: use click points (--layer "mid:@0.5,0.4")');
    } else {
      console.log(`Layers ${r.size.join('x')}: vision ${r.visionMs} ms, OpenCV ${r.cvMs} ms; background fill covers ${(r.fill * 100).toFixed(1)}% of the frame`);
      for (const [k, v] of Object.entries(r.layers)) console.log(`  ${k.padEnd(8)} ${(v.area * 100).toFixed(1).padStart(5)}% of frame  ${(v.notes || []).join('; ')}`);
      for (const q of r.requests) if (q.label) console.log(`  "${q.label}" -> ${q.layer}: box ${q.box.join(',')} (score ${q.score})`);
      console.log(`Manifest ${r.manifest}\nSheet ${r.sheet} (READ it)`);
    }
    for (const c of r.console || []) console.log(`page console: ${c}`);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}
