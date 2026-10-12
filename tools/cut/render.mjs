// rcg cut render: decisions.json -> assets/cut/<name>.mp4 at the source resolution and fps.
// Design ported from ai-video-editor's render.py (MIT, docs/PROVENANCE.md).
//
//   - Every kept range is re-encoded on its own (video only), several at once inside the one
//     heavy-work slot. Never -c copy across cuts: it snaps to keyframes, up to 2 s off.
//   - Frames are counted per range and again after joining: frames in == frames out.
//   - Audio is cut in ONE pass with an 8 ms fade at every join (no clicks) and muxed on at the end:
//     separate AAC pieces per range add encoder padding at every join and drift.
//   - Uses bin.hfFfmpeg when set (pitfall 9), and checks the frame edges afterwards either way.

import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { loadConfig } from '../lib/config.mjs';
import { edgeBands, loudness, probe } from '../lib/ffmpeg.mjs';

const exec = promisify(execFile);
const FADE_S = 0.008;
const LEAD_S = 0.5; // seek this far early; the time-based trim picks the exact frames

function bins() {
  const { bin } = loadConfig();
  return { ffmpeg: bin.hfFfmpeg || bin.ffmpeg || 'ffmpeg', ffprobe: bin.hfFfprobe || bin.ffprobe || 'ffprobe' };
}

async function ff(args) {
  try {
    await exec(bins().ffmpeg, ['-nostdin', '-v', 'error', '-y', ...args], { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 30 * 60000 });
  } catch (e) {
    throw new Error(`ffmpeg failed: ${String(e.stderr || e.message).split('\n').slice(-8).join('\n')}`);
  }
}

async function ffprobeOut(args) {
  const { stdout } = await exec(bins().ffprobe, ['-v', 'error', ...args], { windowsHide: true });
  return stdout.trim();
}

export async function countFrames(file) {
  return Number(await ffprobeOut(['-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file])) || 0;
}

/** [video stream start, file start] in seconds (with -copyts the trim sees the stream's own timestamps). */
async function starts(file) {
  const one = async (args) => { const v = parseFloat(await ffprobeOut([...args, '-of', 'default=nw=1:nk=1', file])); return Number.isFinite(v) ? v : 0; };
  return [await one(['-select_streams', 'v:0', '-show_entries', 'stream=start_time']), await one(['-show_entries', 'format=start_time'])];
}

/** Run fn over items, `n` at a time, in order of results. */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** Encode the kept frame ranges of `source` into `out`. Returns { frames, seconds }. Caller holds the heavy slot. */
export async function renderCut(source, out, { frames, fps, fpsRational, crf = 18 }) {
  const [vstart, fstart] = await starts(source);
  const off = vstart - fstart; // where frame 0 plays on the audio's timeline
  const tmp = mkdtempSync(join(tmpdir(), 'rcg-cut-'));
  const want = frames.reduce((s, [a, b]) => s + b - a, 0);
  console.log(`${frames.length} range(s), ${want} frames -> ${out}`);
  const workers = Math.max(2, Math.floor(cpus().length / 4));
  // Half a frame early on both edges: immune to container timestamp rounding (frame k sits at vstart + k/fps only approximately).
  const errs = await pool(frames, workers, async ([s, e], i) => {
    const t0 = vstart + (s - 0.5) / fps;
    const t1 = vstart + (e - 0.5) / fps;
    const seg = join(tmp, `${String(i).padStart(5, '0')}.mp4`);
    // -copyts: without it the input seek rebases timestamps and the absolute trim picks the wrong footage.
    await ff(['-copyts', '-ss', Math.max(0, t0 - fstart - LEAD_S).toFixed(6), '-i', source, '-an',
      '-vf', `trim=start=${Math.max(0, t0).toFixed(6)}:end=${t1.toFixed(6)},setpts=N/(${fpsRational})/TB`,
      '-r', fpsRational, '-c:v', 'libx264', '-crf', String(crf), '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-g', '15', seg]);
    const got = await countFrames(seg);
    if ((i + 1) % 20 === 0) console.log(`  video ${i + 1}/${frames.length}`);
    return got === e - s ? null : `range ${i}: ${got} frames, wanted ${e - s}`;
  });
  const bad = errs.filter(Boolean);
  if (bad.length) throw new Error(`${bad.join('; ')} (segments kept in ${tmp})`);

  const list = join(tmp, 'list.txt');
  writeFileSync(list, frames.map((_, i) => `file '${join(tmp, `${String(i).padStart(5, '0')}.mp4`).replace(/\\/g, '/').replace(/'/g, "'\\''")}'\n`).join(''));
  const allv = join(tmp, 'video.mp4');
  await ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', allv]);
  if (await countFrames(allv) !== want) throw new Error(`joining lost frames (kept in ${tmp})`);

  console.log('  audio, one pass');
  const parts = frames.map(([s, e], i) => {
    const t0 = off + s / fps;
    const t1 = off + e / fps;
    const fo = Math.max(0, t1 - t0 - FADE_S);
    return `[0:a:0]atrim=start=${t0.toFixed(6)}:end=${t1.toFixed(6)},asetpts=PTS-STARTPTS,afade=t=in:d=${FADE_S},afade=t=out:st=${fo.toFixed(6)}:d=${FADE_S}[a${i}]`;
  });
  const graph = join(tmp, 'audio.txt'); // a file, not argv: hundreds of ranges overrun the Windows command line
  writeFileSync(graph, `${parts.join(';\n')};\n${frames.map((_, i) => `[a${i}]`).join('')}concat=n=${frames.length}:v=0:a=1[ac]`);
  const aud = join(tmp, 'audio.m4a');
  await ff(['-vn', '-i', source, '-/filter_complex', graph, '-map', '[ac]', '-c:a', 'aac', '-b:a', '192k', aud]);
  await ff(['-i', allv, '-i', aud, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', out]);
  const got = await countFrames(out);
  if (got !== want) throw new Error(`frame mismatch: ${got} of ${want} (kept in ${tmp})`);
  rmSync(tmp, { recursive: true, force: true });
  return { frames: got, seconds: want / fps };
}

/** Look at the result, not the exit code: size, fps, audio level, dead frame edges. Returns problems. */
export async function checkCut(out, { width, height, fps, seconds }) {
  const problems = [];
  const p = await probe(out);
  if (!p.video) return ['no video stream'];
  const { width: w, height: h } = p.video;
  // a phone take with rotation metadata comes out upright: its sides swap
  if (!((w === width && h === height) || (w === height && h === width))) problems.push(`size ${w}x${h}, source ${width}x${height}`);
  if (Math.abs(p.video.fps - fps) > 0.01) problems.push(`fps ${p.video.fps.toFixed(3)}, source ${fps.toFixed(3)}`);
  if (Math.abs(p.duration - seconds) > 0.15) problems.push(`duration ${p.duration.toFixed(2)}s, planned ${seconds.toFixed(2)}s`);
  if (!p.audio.length) problems.push('no audio stream');
  else {
    const l = await loudness(out);
    if (!(l.integratedLufs > -60)) problems.push(`audio is near silent (${l.integratedLufs} LUFS)`);
  }
  const times = [0.25, 0.5, 0.75].map((f) => +(p.duration * f).toFixed(2));
  const edges = await edgeBands(out, { times, width: p.video.width, height: p.video.height });
  if (edges.right || edges.left) problems.push(`dead ${edges.right ? 'right' : 'left'} edge in ${edges.right || edges.left} of ${edges.frames} frames (pitfall 9: set bin.hfFfmpeg)`);
  return problems;
}
