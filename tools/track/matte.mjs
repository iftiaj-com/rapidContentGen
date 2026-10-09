// rcg matte: background removal with MediaPipe's selfie segmenter (Adits' ImageSegmenter
// path, core/ARBackgroundRemoval.js + BakedBackgroundRemoval.js: a pre-baked matte), run
// offline on every source frame at the source's own frame rate, so frame i of the cut-out
// lines up with frame i of the footage.
//
// Writes (in the job):
//   assets/matte/<name>-fg.webm     the subject, background transparent (VP9 + alpha)
//   assets/matte/<name>-plate.webm  the surroundings, subject transparent (hole-cut, --plate)
// Refinement (Adits' ARBackgroundRemoval has none; these are optional): the confidence is
// mapped through smoothstep(lo, hi) (Adits PopArt uses 0.5 -/+ feather 0.12), optional temporal
// blend with the previous frame, optional blur on the upscaled alpha, optional choke (erode the
// edge by N px: removes a rim of the old background, e.g. a white wall around the hair).
//
// Usage:
//   node tools/track/matte.mjs --job <dir> --src assets/x.mp4 [--start 0] [--duration d] [--plate]
//        [--lo 0.38] [--hi 0.62] [--temporal 0] [--feather 1] [--choke 0] [--width <source, long side <=1920>] [--quality 18]
//        [--gpu] [--sheet] [--name x]

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { heavySlot } from '../lib/lock.mjs';
import { loadConfig } from '../lib/config.mjs';
import { contactSheet, probe } from '../lib/ffmpeg.mjs';
import { extractFrames, ff, runVisionPage } from './common.mjs';

/** The source's exact frame rate as "num/den" (e.g. 24000/1001). */
function frameRate(src) {
  const { bin } = loadConfig();
  const out = execFileSync(bin.ffprobe || 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', src], { encoding: 'utf8' }).trim();
  const [n, d] = out.split('/').map(Number);
  if (!(n > 0)) throw new Error(`Could not read the frame rate of ${src}`);
  return { str: d ? `${n}/${d}` : String(n), value: d ? n / d : n };
}

export async function runMatte(opts) {
  const jobDir = resolve(opts.job);
  const src = resolve(jobDir, opts.src || '');
  if (!opts.src || !existsSync(src)) throw new Error(`--src not found: ${opts.src}`);
  const info = await probe(src);
  const rate = frameRate(src);
  const start = Number(opts.start || 0);
  const duration = opts.duration ? Number(opts.duration) : null;
  const sw = info.video.width;
  const sh = info.video.height;
  // Source size by default (long side capped at 1920): a reframe to 9:16 enlarges the cut-out as much as the footage.
  const width = Math.round(Number(opts.width || sw * Math.min(1, 1920 / Math.max(sw, sh))) / 2) * 2;
  const height = Math.round((width * sh) / sw / 2) * 2;
  const name = opts.name || basename(opts.src).replace(/\.\w+$/, '');
  const quality = Number(opts.quality ?? 18);
  const release = await heavySlot('matte', jobDir, opts);
  const work = mkdtempSync(join(tmpdir(), 'rcg-matte-'));
  const t0 = Date.now();
  try {
    const frames = await extractFrames(src, { start, duration, fps: rate.str, width, height }, join(work, 'in'));
    if (!frames) throw new Error('No frames extracted');
    const job = {
      task: 'matte', frames, fps: rate.value, width, height, delegate: opts.gpu ? 'GPU' : 'CPU',
      matte: { lo: Number(opts.lo ?? 0.38), hi: Number(opts.hi ?? 0.62), temporal: Number(opts.temporal ?? 0), feather: Number(opts.feather ?? 1), choke: Number(opts.choke ?? 0) },
    };
    const state = await runVisionPage(work, job, { onProgress: opts.onProgress, timeoutMs: Math.max(240000, frames * 4000) });
    const outDir = resolve(jobDir, 'assets', 'matte');
    mkdirSync(outDir, { recursive: true });
    const fg = join(outDir, `${name}-fg.webm`);
    const vp9 = ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', String(quality), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-auto-alt-ref', '0'];
    const input = ['-framerate', rate.str, '-start_number', '1', '-i', join(work, 'out', '%06d.png')];
    await ff([...input, ...vp9, fg]);
    let plate = null;
    if (opts.plate) {
      plate = join(outDir, `${name}-plate.webm`);
      // Same RGB, alpha = 255 - matte (the hole-cut layer of HyperFrames' remove-background).
      await ff([...input, '-filter_complex', '[0]split[a][b];[b]alphaextract,negate[n];[a][n]alphamerge,format=yuva420p', ...vp9, plate]);
    }
    let sheet = null;
    if (opts.sheet) {
      // The cut-out over a checker pattern, so transparent areas show.
      const preview = join(work, 'preview.mp4');
      await ff(['-f', 'lavfi', '-i', `color=c=0xff00ff:s=${width}x${height}:r=${rate.str}`, '-c:v', 'libvpx-vp9', '-i', fg,
        '-filter_complex', '[0][1]overlay=shortest=1:format=auto', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', preview]);
      sheet = join(outDir, `${name}-fg-sheet.png`);
      const dur = frames / rate.value;
      const n = 8;
      await contactSheet(preview, sheet, { times: Array.from({ length: n }, (_, k) => +((dur * (k + 0.5)) / n).toFixed(2)), cols: 8, thumbWidth: 220 });
    }
    return {
      fg: relative(jobDir, fg).split('\\').join('/'), plate: plate && relative(jobDir, plate).split('\\').join('/'),
      frames, fps: rate.str, size: `${width}x${height}`, start, mask: state.info?.mask, delegate: state.info?.delegate,
      seconds: +((Date.now() - t0) / 1000).toFixed(1), sheet, console: state.console,
    };
  } finally {
    release();
    if (!opts['keep-frames']) rmSync(work, { recursive: true, force: true });
    else console.log(`frames kept in ${work}`);
  }
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job || !a.src) {
    console.error('Usage: matte.mjs --job <dir> --src <clip> [--start s] [--duration s] [--plate] [--lo 0.38] [--hi 0.62] [--temporal 0] [--feather 1] [--quality 18] [--gpu] [--sheet]');
    process.exit(2);
  }
  const r = await runMatte({ ...a, onProgress: (f, n) => { if (f % 60 === 0 || f === n) process.stdout.write(`  frame ${f}/${n}\n`); } });
  console.log(`Wrote ${r.fg}${r.plate ? ` and ${r.plate}` : ''}: ${r.frames} frames at ${r.fps} fps, ${r.size}, mask ${r.mask} (${r.delegate}), in ${r.seconds} s`);
  if (r.start) console.log(`  The cut-out starts at ${r.start} s of the source: give it data-media-start = (the footage's media start) - ${r.start}.`);
  if (r.sheet) console.log(`Sheet: ${r.sheet}`);
}
