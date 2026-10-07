// Music -> per-frame audio table for audio-reactive shaders and captions.
//
// Ported from AditsStudio server/lib/audio-analysis.mjs (analyseTrack), which
// reproduces the browser AnalyserNode path the AditsShaders BIND depths were
// tuned against: Blackman window, 2048-point FFT, -100..-30 dB byte scale, band
// ranges, AGC, onset flux and the attack/release envelope. Two deliberate
// changes (see docs/PROVENANCE.md):
//   1. Decoding averages the channels (AnalyserNode's mono downmix). The
//      original used ffmpeg `-ac 1`, which reads up to +3 dB hot on stereo.
//   2. A shader clock column is added: AditsShaders src/lib/audio.ts
//      AudioSpeed (the "Audio Drive" flywheel) integrated at a fixed dt = 1/fps,
//      so a frame's TIME is a lookup, not a running accumulator. That makes the
//      music-driven clock seekable and identical on every render.
//
// Usage:
//   node tools/audio/analyze.mjs <audio> <out.json> --fps 24 [--duration s | --frames n]
//        [--offset s] [--clock default|flywheel|pulse|tilt] [--drive 1]

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { decodeMono, probe } from '../lib/ffmpeg.mjs';

const SAMPLE_RATE = 44100;
const FFT_SIZE = 2048;
const BIN_COUNT = FFT_SIZE / 2;
const MIN_DB = -100;
const MAX_DB = -30;
const BAND_COUNT = 24;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function follow(current, target, dt, attack, release) {
  const tau = target > current ? attack : release;
  const k = 1 - Math.exp(-dt / Math.max(tau, 1e-4));
  return current + (target - current) * k;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const WINDOW = (() => {
  const w = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    const x = i / (FFT_SIZE - 1);
    w[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * x) + 0.08 * Math.cos(4 * Math.PI * x);
  }
  return w;
})();

/** analyseTrack, ported. `offset` skips into the file (seconds). */
export async function analyseTrack(file, { fps, frames, offset = 0 }) {
  const pcm = await decodeMono(file, SAMPLE_RATE);
  const dt = 1 / fps;
  const binHz = (SAMPLE_RATE / 2) / BIN_COUNT;
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const bytes = new Uint8Array(BIN_COUNT);
  const sm = { bass: 0, mid: 0, treble: 0, vol: 0, level: 0, bands: new Float64Array(BAND_COUNT) };
  const prevZone = [0, 0, 0];
  const onset = [0, 0, 0];
  let runningPeak = 0.05;

  const avgRange = (lo, hi) => {
    const a = Math.max(0, Math.floor(lo / binHz));
    const b = Math.min(BIN_COUNT - 1, Math.ceil(hi / binHz));
    if (b < a) return 0;
    let sum = 0;
    for (let i = a; i <= b; i++) sum += bytes[i];
    return sum / ((b - a + 1) * 255);
  };

  const out = [];
  for (let f = 0; f < frames; f++) {
    const start = Math.round((offset + f / fps) * SAMPLE_RATE);
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = start + i;
      re[i] = (s >= 0 && s < pcm.length ? pcm[s] : 0) * WINDOW[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let i = 0; i < BIN_COUNT; i++) {
      const mag = Math.hypot(re[i], im[i]) / FFT_SIZE;
      const db = mag > 0 ? 20 * Math.log10(mag) : MIN_DB;
      const v = (255 / (MAX_DB - MIN_DB)) * (db - MIN_DB);
      bytes[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    const bassRaw = avgRange(35, 160);
    const midRaw = avgRange(160, 2000);
    const trebRaw = avgRange(2000, 12000);
    const target = { bass: clamp01(bassRaw * 1.6), mid: clamp01(midRaw * 1.8), treble: clamp01(trebRaw * 2.2) };
    target.vol = clamp01((bassRaw + midRaw + trebRaw) * 0.7);
    runningPeak = Math.max(runningPeak * Math.exp(-dt / 6), target.vol, 0.05);
    target.level = clamp01(target.vol / runningPeak);

    const zones = [target.bass, target.mid, target.treble];
    for (let z = 0; z < 3; z++) {
      const flux = zones[z] - prevZone[z];
      prevZone[z] = zones[z];
      if (flux > 0.09 && zones[z] > 0.2) onset[z] = 1;
      else onset[z] *= Math.exp(-dt / 0.11);
    }
    const targetBands = new Float64Array(BAND_COUNT);
    for (let i = 0; i < BAND_COUNT; i++) {
      const lo = 40 * Math.pow(16000 / 40, i / BAND_COUNT);
      const hi = 40 * Math.pow(16000 / 40, (i + 1) / BAND_COUNT);
      targetBands[i] = clamp01(avgRange(lo, hi) * (1.2 + i * 0.09));
    }
    sm.bass = follow(sm.bass, target.bass, dt, 0.03, 0.14);
    sm.mid = follow(sm.mid, target.mid, dt, 0.03, 0.14);
    sm.treble = follow(sm.treble, target.treble, dt, 0.03, 0.14);
    sm.vol = follow(sm.vol, target.vol, dt, 0.03, 0.14);
    sm.level = follow(sm.level, target.level, dt, 0.02, 0.2);
    for (let i = 0; i < BAND_COUNT; i++) sm.bands[i] = follow(sm.bands[i], targetBands[i], dt, 0.03, 0.12);

    const round = (v) => Math.round(v * 1000) / 1000;
    out.push({
      bass: round(sm.bass), mid: round(sm.mid), treble: round(sm.treble), vol: round(sm.vol), level: round(sm.level),
      kick: round(clamp01(onset[0])), snare: round(clamp01(onset[1])), hat: round(clamp01(onset[2])), beat: round(clamp01(onset[0])),
      bands: Array.from(sm.bands, round),
    });
  }
  return { fps, frames: out };
}

/**
 * AudioSpeed.update (AditsShaders src/lib/audio.ts), ported and integrated:
 * returns TIME per frame. 'default' is a flat 1x clock (the shader's authored
 * rates). 'flywheel' coasts to 0.15x in silence; 'pulse' rests at 1x; 'tilt'
 * speeds up on treble and slows on bass.
 */
export function shaderClock(frames, fps, { mode = 'flywheel', drive = 1 } = {}) {
  const dt = 1 / fps;
  const times = new Array(frames.length);
  let vel = 0;
  let t = 0;
  for (let f = 0; f < frames.length; f++) {
    times[f] = Math.round(t * 10000) / 10000;
    let mult = 1;
    if (mode !== 'default' && drive > 0.001) {
      const a = frames[f];
      const d = Math.min(0.1, Math.max(0, dt));
      const accel = 1 - Math.pow(0.02, d);
      const friction = Math.pow(0.005, d);
      if (mode === 'tilt') {
        const target = (a.treble - a.bass) * 4.5 * drive;
        if (Math.max(a.bass, a.treble) > 0.06) vel += (target - vel) * accel;
        else { vel *= friction; if (Math.abs(vel) < 0.02) vel = 0; }
        mult = Math.min(10, Math.max(0.1, 1 + vel));
      } else {
        const dominant = Math.max(a.bass, a.mid, a.treble);
        if (dominant > 0.08) vel += (dominant * 5.0 * drive - vel) * accel;
        else { vel *= friction; if (vel < 0.02) vel = 0; }
        mult = mode === 'pulse' ? Math.min(10, 1 + vel) : Math.min(10, 0.15 + vel);
      }
    }
    t += mult * dt;
  }
  return times;
}

/** Kick onsets (frame where the kick pulse jumps to 1) as beat times in seconds. */
export function kickTimes(frames, fps) {
  const out = [];
  for (let f = 0; f < frames.length; f++) {
    if (frames[f].kick === 1 && (f === 0 || frames[f - 1].kick < 1)) out.push(+(f / fps).toFixed(3));
  }
  return out;
}

export async function analyzeToFile(audio, out, { fps = 24, duration, frames, offset = 0, clock = 'flywheel', drive = 1 } = {}) {
  let n = Number(frames);
  if (!n) {
    const dur = Number(duration) || Math.max(0, (await probe(audio)).duration - offset);
    n = Math.ceil(dur * fps);
  }
  const table = await analyseTrack(audio, { fps: Number(fps), frames: n, offset: Number(offset) });
  const doc = {
    version: 1,
    source: audio,
    offset: Number(offset),
    fps: Number(fps),
    frameCount: n,
    clock: { mode: clock, drive: Number(drive), time: shaderClock(table.frames, Number(fps), { mode: clock, drive: Number(drive) }) },
    kicks: kickTimes(table.frames, Number(fps)),
    frames: table.frames,
  };
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify(doc) + '\n');
  return doc;
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const [audio, out] = a._;
  if (!audio || !out) {
    console.error('Usage: analyze.mjs <audio> <out.json> --fps 24 [--duration s | --frames n] [--offset s] [--clock default|flywheel|pulse|tilt] [--drive 1]');
    process.exit(2);
  }
  const doc = await analyzeToFile(audio, out, { fps: a.fps || 24, duration: a.duration, frames: a.frames, offset: a.offset || 0, clock: a.clock || 'flywheel', drive: a.drive ?? 1 });
  const peak = (k) => Math.max(...doc.frames.map((f) => f[k])).toFixed(2);
  const lastT = doc.clock.time[doc.clock.time.length - 1];
  console.log(`Wrote ${out}: ${doc.frameCount} frames @ ${doc.fps} fps, ${doc.kicks.length} kicks`);
  console.log(`peaks: bass ${peak('bass')} mid ${peak('mid')} treble ${peak('treble')} level ${peak('level')}; shader clock (${doc.clock.mode}) ends at TIME ${lastT.toFixed(2)} for ${(doc.frameCount / doc.fps).toFixed(2)} s`);
}
