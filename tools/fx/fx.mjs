// rcg fx: run an Adits footage effect or 3D environment offline over a range
// of a clip and write the result as a new clip for the job to use like any
// footage. The Adits code runs unmodified (library/adits-fx, copied) inside a
// headless-Chrome harness page (library/fx/harness.*) with a frame-locked
// clock and seeded randomness, so the same inputs give the same clip.
//
// Usage:
//   node tools/fx/fx.mjs --list
//   node tools/fx/fx.mjs --job <dir> --effect ghost --src assets/x.mp4 [--start 2] [--duration 3]
//        [--param id=value ...] [--src2 assets/y.mp4 --start2 0] [--audio <music> --audio-offset s]
//        [--seed 1] [--fps 24] [--size 1080x1920] [--out assets/fx/name.mp4] [--keep-frames] [--sheet]
// Effects and their defaults: library/fx/effects.json.

import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { analyzeToFile } from '../audio/analyze.mjs';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { ROOT, loadConfig, readJson } from '../lib/config.mjs';
import { contactSheet, probe } from '../lib/ffmpeg.mjs';
import { launch } from './chrome.mjs';
import { startServer } from './server.mjs';

const exec = promisify(execFile);
export const loadEffects = () => readJson(join(ROOT, 'library', 'fx', 'effects.json'));

// The ffmpeg HyperFrames uses (bin.hfFfmpeg) when set: the PATH 8.1 build loses the
// right 8 columns when converting 1080-wide yuv420p to RGB planes (lessons 16b).
function ffmpegBin() {
  const { bin } = loadConfig();
  return bin.hfFfmpeg || bin.ffmpeg || 'ffmpeg';
}
const ff = (args) => exec(ffmpegBin(), ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 26, windowsHide: true });

function parseValue(v) {
  if (v === 'true' || v === 'false') return v === 'true';
  if (v !== '' && !Number.isNaN(Number(v)) && !/^#/.test(v)) return Number(v);
  return v;
}

// Frames are written WITHOUT colour tags: a BT.709-tagged PNG (cICP/gAMA/cHRM) is colour-managed
// by Chrome on decode (gamma 2.4 to sRGB, shadows 16 -> 4), while HyperFrames shows footage from
// untagged JPEGs as raw sRGB. Convert to RGB first (BT.709 matrix), then drop the tags.
async function extract(src, start, duration, fps, W, H, dir) {
  mkdirSync(dir, { recursive: true });
  await ff(['-ss', String(start), '-t', String(duration), '-i', src,
    '-vf', `fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},format=rgb24,setparams=color_primaries=unknown:color_trc=unknown:colorspace=unknown`,
    '-start_number', '1', join(dir, '%06d.png')]);
  return readdirSync(dir).filter((f) => f.endsWith('.png')).length;
}

/** Map our analyze.mjs frames onto the audioFeatures object the Adits effects read. */
function toAudioFeatures(f) {
  // Adits core/audio-engine.js fields: rawPulse equals bass; rawVol is the 0..1 level.
  return { bass: f.bass, mid: f.mid, treble: f.treble, vol: f.vol, volume: f.vol, rawVol: f.level, rawPulse: f.bass, level: f.level, kick: f.kick, snare: f.snare, hat: f.hat, beat: f.beat, bands: f.bands };
}

export async function runFx(opts) {
  const effects = loadEffects();
  const def = effects[opts.effect];
  if (!def) throw new Error(`Unknown effect "${opts.effect}". rcg fx --list`);
  const jobDir = resolve(opts.job);
  const fps = Number(opts.fps) || 24;
  const [W, H] = String(opts.size || '1080x1920').split('x').map(Number);
  const needsInput = def.input !== false;
  const src = needsInput ? resolve(jobDir, opts.src || '') : null;
  if (needsInput && (!opts.src || !existsSync(src))) throw new Error(`--src not found: ${opts.src}`);
  const start = Number(opts.start || 0);
  const info = src ? await probe(src) : null;
  const duration = Number(opts.duration || (info ? info.duration - start : 4));
  // Pre-roll: stateful effects (frame buffers, simulations) render this much before the range and drop it,
  // so history exists from the first output frame. Clamped to the start of the clip.
  const preroll = needsInput ? Math.min(start, Number(opts.preroll ?? def.preroll ?? 0)) : Number(opts.preroll ?? def.preroll ?? 0);
  const skip = Math.round(preroll * fps);
  const work = mkdtempSync(join(tmpdir(), `rcg-fx-${opts.effect}-`));
  const t0 = Date.now();
  try {
    // media 'video': the effect gets the whole source clip as a real <video> (it seeks it itself).
    const realVideo = def.options?.media === 'video';
    let sourceFile = null;
    if (realVideo) {
      sourceFile = `source${extname(src)}`;
      copyFileSync(src, join(work, sourceFile));
    }
    const frames = needsInput && !realVideo ? await extract(src, start - preroll, duration + preroll, fps, W, H, join(work, 'in')) : Math.round((duration + preroll) * fps);
    if (!frames) throw new Error('No frames extracted');
    let frames2 = 0;
    if (def.needs?.includes('src2') && !opts.src2) throw new Error(`${opts.effect} needs --src2 (the second media)`);
    if (opts.src2 && (def.needs?.includes('src2') || def.optional?.includes('src2'))) {
      frames2 = await extract(resolve(jobDir, opts.src2), Math.max(0, Number(opts.start2 || 0) - preroll), frames / fps + 0.5, fps, W, H, join(work, 'in2'));
    }
    let audio = null;
    if (opts.audio) {
      const table = await analyzeToFile(resolve(jobDir, opts.audio), join(work, 'audio.json'), { fps, duration: frames / fps + 1 / fps, offset: Number(opts['audio-offset'] || 0) - preroll, clock: 'default' });
      audio = table.frames.map(toAudioFeatures);
    }
    // Defaults, then an Adits preset (as the app applies it: input values over the current ones),
    // then --param overrides. A dotted key (motionTrails.blendMode) sets videoEngine.params.
    const params = { ...(def.params || {}) };
    const vparams = JSON.parse(JSON.stringify(def.vparams || {}));
    if (opts.preset) {
      const p = def.presets?.[opts.preset];
      if (!p) throw new Error(`No preset "${opts.preset}" for ${opts.effect}. One of: ${Object.keys(def.presets || {}).join(', ') || '(none)'}`);
      Object.assign(params, def.presetResets || {}, p);
    }
    for (const p of [].concat(opts.param || [])) {
      const k = String(p).slice(0, String(p).indexOf('='));
      const v = parseValue(String(p).slice(k.length + 1));
      if (k.includes('.')) {
        const path = k.split('.');
        let o = vparams;
        for (const seg of path.slice(0, -1)) o = o[seg] = o[seg] || {};
        o[path[path.length - 1]] = v;
      } else params[k] = v;
    }
    const alpha = Boolean(opts.alpha ?? def.alpha);
    const jobDoc = {
      module: `/lib/adits-fx/${def.module}`, className: def.class, width: W, height: H, fps, frames, frames2,
      sourceFile, srcStart: start - preroll, ranges: def.ranges || {},
      seed: Number(opts.seed ?? 1), params, skip, vparams, webgpu: Boolean(def.webgpu),
      shim: def.shim ? `/lib/fx/shims/${def.shim}` : null, alpha, input: needsInput, audio,
      options: def.options || {},
    };
    writeFileSync(join(work, 'job.json'), JSON.stringify(jobDoc));

    const srv = await startServer(work);
    const browser = await launch({ width: W, height: H });
    // Page console errors and warnings: three.js shader compile errors land here, not in __fx.
    const consoleLines = [];
    browser.on((m) => {
      if (consoleLines.length >= 20) return;
      if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
        consoleLines.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400)}`);
      } else if (m.method === 'Runtime.exceptionThrown') {
        consoleLines.push(`exception: ${(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 400)}`);
      }
    });
    try {
      await browser.send('Page.navigate', { url: `http://127.0.0.1:${srv.port}/lib/fx/harness.html` });
      let state = null;
      let last = -1;
      const deadline = Date.now() + Math.max(120000, frames * 4000);
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 400));
        state = await browser.evaluate('JSON.stringify(window.__fx || null)').then(JSON.parse).catch(() => null);
        if (!state) continue;
        if (state.frame !== last && opts.onProgress) { opts.onProgress(state.frame, frames); last = state.frame; }
        if (state.state === 'done' || state.state === 'error') break;
      }
      if (!state || state.state !== 'done') {
        throw new Error(`fx ${opts.effect} ${state?.state || 'timed out'} at frame ${state?.frame ?? '?'}: ${state?.error || ''}\nlog: ${(state?.log || []).join(' | ')}\nconsole: ${consoleLines.join(' | ')}\nchrome: ${browser.stderr().slice(-500)}`);
      }
      if (state.log?.length && opts.onLog) opts.onLog(state.log);
      if (consoleLines.length && opts.onConsole) opts.onConsole(consoleLines);
    } finally {
      await browser.close();
      await srv.close();
    }

    const outRel = opts.out || `assets/fx/${opts.id || `${opts.effect}-${basename(opts.src || 'env').replace(/\.\w+$/, '')}-${start}`}${alpha ? '.mov' : '.mp4'}`;
    const outAbs = resolve(jobDir, outRel);
    mkdirSync(resolve(outAbs, '..'), { recursive: true });
    const enc = alpha
      ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le']
      : ['-c:v', 'libx264', '-crf', '12', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
    await ff(['-framerate', String(fps), '-start_number', String(skip + 1), '-i', join(work, 'out', '%06d.png'), ...enc, outAbs]);
    const outInfo = await probe(outAbs);
    let sheet = null;
    if (opts.sheet) {
      sheet = outAbs.replace(/\.\w+$/, '-sheet.png');
      const n = 7;
      await contactSheet(outAbs, sheet, { times: Array.from({ length: n }, (_, k) => +((outInfo.duration * (k + 0.5)) / n).toFixed(2)), cols: 7 });
    }
    return { out: relative(jobDir, outAbs).split('\\').join('/'), frames: frames - skip, preroll, seconds: +((Date.now() - t0) / 1000).toFixed(1), duration: outInfo.duration, size: `${outInfo.video.width}x${outInfo.video.height}`, sheet, browser: browser.chrome.kind };
  } finally {
    if (!opts['keep-frames']) rmSync(work, { recursive: true, force: true });
    else console.log(`frames kept in ${work}`);
  }
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (a.list) {
    for (const [k, d] of Object.entries(loadEffects())) if (!k.startsWith('$')) console.log(`${k.padEnd(16)} ${d.kind.padEnd(10)} ${d.label}${d.needs?.length ? `  [needs ${d.needs.join(', ')}]` : ''}`);
    process.exit(0);
  }
  if (!a.job || !a.effect) {
    console.error('Usage: fx.mjs --job <dir> --effect <name> --src <clip> [--start s] [--duration s] [--param id=v ...] [--src2 clip] [--audio music] [--out path] | --list');
    process.exit(2);
  }
  const r = await runFx({ ...a, onProgress: (f, n) => { if (f % 24 === 0 || f === n) process.stdout.write(`  frame ${f}/${n}\n`); }, onLog: (l) => console.log(`  page log: ${l.slice(-5).join(' | ')}`), onConsole: (l) => console.log(`  page console (${l.length}):\n    ${l.join('\n    ')}`) });
  console.log(`Wrote ${r.out}: ${r.frames} frames, ${r.size}, ${r.duration.toFixed(2)} s, in ${r.seconds} s (${r.browser})${r.sheet ? `\nSheet: ${r.sheet}` : ''}`);
}
