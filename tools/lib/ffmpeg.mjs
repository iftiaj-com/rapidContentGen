// ffmpeg / ffprobe helpers shared by every tool.
// Ported from AditsStudio server/lib/ffmpeg.mjs (probe, loudnorm + faststart);
// binaries now come from config instead of ffmpeg-static, and the measurement
// helpers (loudness, true peak, section levels, peak limiting, frame sheets)
// were added for render verification. See docs/PROVENANCE.md.

import { execFile, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { loadConfig } from './config.mjs';

const execFileAsync = promisify(execFile);

function bins() {
  const { bin } = loadConfig();
  return { ffmpeg: bin.ffmpeg || 'ffmpeg', ffprobe: bin.ffprobe || 'ffprobe' };
}

export async function run(binName, args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  const bin = bins()[binName] || binName;
  try {
    return await execFileAsync(bin, args, { maxBuffer, windowsHide: true });
  } catch (err) {
    const tail = String(err.stderr || err.message || '').split('\n').slice(-12).join('\n');
    throw new Error(`${binName} failed: ${tail}`);
  }
}

/** Run ffmpeg and collect stdout as a Buffer (for raw PCM / raw frames). */
export function runBuffer(args) {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(bins().ffmpeg, args, { windowsHide: true });
    const chunks = [];
    let stderr = '';
    proc.stdout.on('data', (c) => chunks.push(c));
    proc.stderr.on('data', (c) => { stderr += c; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}: ${stderr.split('\n').slice(-8).join('\n')}`));
      else resolvePromise(Buffer.concat(chunks));
    });
  });
}

const parseRate = (r) => {
  const [n, d] = String(r || '0/1').split('/').map(Number);
  return d ? n / d : 0;
};

/** Full media summary: format, first video stream, every audio stream. */
export async function probe(file) {
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries',
    'format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,sample_rate,channels,duration,pix_fmt',
    '-of', 'json',
    file,
  ]);
  const info = JSON.parse(stdout);
  const streams = info.streams || [];
  const v = streams.find((s) => s.codec_type === 'video');
  return {
    file,
    duration: parseFloat(info.format?.duration) || 0,
    sizeBytes: Number(info.format?.size) || 0,
    video: v
      ? {
          codec: v.codec_name,
          width: v.width,
          height: v.height,
          fps: parseRate(v.avg_frame_rate) || parseRate(v.r_frame_rate),
          pixFmt: v.pix_fmt,
          aspect: v.width && v.height ? +(v.width / v.height).toFixed(4) : null,
        }
      : null,
    audio: streams
      .filter((s) => s.codec_type === 'audio')
      .map((a) => ({ index: a.index, codec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels })),
  };
}

/** Integrated loudness (LUFS), loudness range and true peak (dBTP) via ebur128. */
export async function loudness(file) {
  const { stderr } = await run('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file, '-vn',
    '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-',
  ]);
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = summary.match(re);
    if (!m) return null;
    return m[1] === '-inf' ? -Infinity : parseFloat(m[1]);
  };
  return {
    integratedLufs: num(/I:\s+(-?[\d.]+|-inf) LUFS/),
    lra: num(/LRA:\s+(-?[\d.]+) LU/),
    truePeakDb: num(/Peak:\s+(-?[\d.]+|-inf) dBFS/),
  };
}

/** Decode audio to interleaved stereo float32 PCM (mono sources are duplicated). */
export async function decodeStereo(file, sampleRate = 16000) {
  const buf = await runBuffer(['-v', 'error', '-i', file, '-vn', '-ac', '2', '-ar', String(sampleRate), '-f', 'f32le', '-']);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

/**
 * Decode audio to mono float32 PCM by AVERAGING the channels. Do not use
 * ffmpeg's `-ac 1`: its default downmix applies a -3 dB pan law and reads up to
 * +3 dB hot on correlated stereo.
 */
export async function decodeMono(file, sampleRate = 16000) {
  const st = await decodeStereo(file, sampleRate);
  const mono = new Float32Array(st.length / 2);
  for (let i = 0; i < mono.length; i++) mono[i] = (st[2 * i] + st[2 * i + 1]) * 0.5;
  return mono;
}

// Floor at -120 dB so digital silence stays a number (JSON cannot hold -Infinity).
const toDb = (x) => (x > 1e-6 ? 20 * Math.log10(x) : -120);

/**
 * RMS and sample peak (dBFS) per section. sections: [{name,start,end}] in seconds,
 * or omit for fixed windows of `step` seconds over the whole file.
 */
export async function sectionLevels(file, { sections, step = 0.5, sampleRate = 48000 } = {}) {
  // Per-channel measurement: RMS is the power average over both channels and
  // peak is the largest sample in either channel (matches ffmpeg astats).
  const st = await decodeStereo(file, sampleRate);
  const frames = st.length / 2;
  const dur = frames / sampleRate;
  const list = sections && sections.length
    ? sections
    : Array.from({ length: Math.ceil(dur / step) }, (_, i) => ({ name: `${(i * step).toFixed(2)}`, start: i * step, end: Math.min(dur, (i + 1) * step) }));
  return list.map((s) => {
    const a = Math.max(0, Math.floor(s.start * sampleRate)) * 2;
    const b = Math.min(frames, Math.floor(s.end * sampleRate)) * 2;
    let sum = 0;
    let peak = 0;
    for (let i = a; i < b; i++) {
      const v = st[i];
      sum += v * v;
      const m = Math.abs(v);
      if (m > peak) peak = m;
    }
    const n = Math.max(1, b - a);
    return { ...s, rmsDb: +toDb(Math.sqrt(sum / n)).toFixed(1), peakDb: +toDb(peak).toFixed(1) };
  });
}

/**
 * Peak-limit audio to a true-peak ceiling. Runs alimiter at 192 kHz (4x
 * oversampling of 48 kHz) so inter-sample peaks are caught, then re-measures and
 * tightens up to 3 times. Output is 48 kHz 16-bit WAV.
 */
export async function limitAudio(src, out, { ceilingDb = -2.5, maxPasses = 3 } = {}) {
  let target = ceilingDb;
  let result = null;
  for (let pass = 0; pass < maxPasses; pass++) {
    const lin = Math.pow(10, target / 20).toFixed(5);
    await run('ffmpeg', [
      '-y', '-hide_banner', '-i', src, '-vn',
      '-af', `aresample=192000,alimiter=limit=${lin}:level=false:attack=1:release=60,aresample=48000`,
      '-c:a', 'pcm_s16le', out,
    ]);
    result = await loudness(out);
    if (result.truePeakDb == null || result.truePeakDb <= ceilingDb + 0.05) break;
    target -= result.truePeakDb - ceilingDb + 0.1;
  }
  return { out, ...result };
}

/** Loudness-normalize audio and move the moov atom up front; video is copied. */
export async function finalizeVideo(src, out, { lufs = -14, tp = -1.5, reencode = false } = {}) {
  await run('ffmpeg', [
    '-y', '-i', src,
    ...(reencode ? ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy']),
    '-af', `loudnorm=I=${lufs}:TP=${tp}:LRA=11`,
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out,
  ]);
  return out;
}

/** Escape a path for use inside an ffmpeg filter argument (drawtext fontfile). */
export function filterPath(p) {
  return String(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * Labeled contact sheet. times: seconds to grab. Optional safe-zone overlay draws
 * the no-text zones (bottom fraction and right band) in translucent red.
 */
export async function contactSheet(file, out, {
  times, cols = 6, thumbWidth = 270, safe = null, label = true,
} = {}) {
  const info = await probe(file);
  if (!info.video) throw new Error(`No video stream in ${file}`);
  const { width: W, height: H } = info.video;
  const thumbH = Math.round((thumbWidth * H) / W / 2) * 2;
  const font = loadConfig().fonts?.label;
  const dir = mkdtempSync(join(tmpdir(), 'rcg-sheet-'));
  try {
    for (let i = 0; i < times.length; i++) {
      const t = Math.max(0, Math.min(times[i], Math.max(0, info.duration - 0.05)));
      const filters = [];
      if (safe) {
        const by = Math.round(H * (1 - (safe.bottom ?? 0.2)));
        const rx = W - (safe.right ?? 180);
        filters.push(`drawbox=x=0:y=${by}:w=${W}:h=${H - by}:color=red@0.35:t=fill`);
        filters.push(`drawbox=x=${rx}:y=0:w=${W - rx}:h=${H}:color=red@0.35:t=fill`);
        if (safe.top) filters.push(`drawbox=x=0:y=0:w=${W}:h=${safe.top}:color=orange@0.30:t=fill`);
      }
      filters.push(`scale=${thumbWidth}:${thumbH}`);
      if (label && font) {
        filters.push(`drawtext=fontfile='${filterPath(font)}':text='${times[i].toFixed(2)}s':x=6:y=6:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.7`);
      }
      await run('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', filters.join(','), join(dir, `f_${String(i).padStart(4, '0')}.png`)]);
    }
    const rows = Math.ceil(times.length / cols);
    await run('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', join(dir, 'f_%04d.png'), '-vf', `tile=${cols}x${rows}:padding=4:color=black`, '-frames:v', '1', out]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

/** Grab one full-resolution frame. */
export async function extractFrame(file, t, out) {
  await run('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', out]);
  return out;
}
