// Adits' live audio analyser, offline: the Web Audio AnalyserNode that Adits builds in
// core/audio-engine.js (fftSize 256 -> 128 byte bins, smoothingTimeConstant = fxSmooth / 100,
// -100..-30 dB byte scale), sampled at a fixed tick rate instead of the display's rAF, plus
// the features its analyze() derives from those bins (bass / mid / treble / vol with the
// fxThresh threshold and fxSens sensitivity). The anamorphic effects read both: the
// particle dance modes run their own extractor over the raw bins (freqData), the voxel,
// carpet and cutout drives read bass / mid / treble.
//
// AnalyserNode details follow Chromium's RealtimeAnalyser: Blackman window (alpha 0.16,
// x = i / N) over the latest N samples, |X[k]| / N, smoothing on the magnitudes across calls,
// 20*log10, byte = trunc(clamp(255 * (dB - min) / (max - min))). The input is the channel
// average (the analyser's mono downmix). The sample rate is an assumption: an AudioContext
// runs at the output device rate, 48 kHz on most Windows machines.
//
// Usage (library): analyserTable(file, { hz: 60, ticks, offset })

import { fft } from './analyze.mjs';
import { decodeMono } from '../lib/ffmpeg.mjs';

const ADITS = { fftSize: 256, smoothing: 0.8, threshold: 50, sensitivity: 1.0, minDb: -100, maxDb: -30 };

export async function analyserTable(file, { hz = 60, ticks, offset = 0, sampleRate = 48000, ...opt } = {}) {
  const o = { ...ADITS, ...opt };
  const N = o.fftSize;
  const bins = N / 2;
  const pcm = await decodeMono(file, sampleRate);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const x = i / N;
    win[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * x) + 0.08 * Math.cos(4 * Math.PI * x);
  }
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const mag = new Float64Array(bins); // smoothed magnitudes, carried across ticks
  const bytes = new Uint8Array(bins);
  const scale = 255 / (o.maxDb - o.minDb);
  const norm = (v) => Math.max(0, (v - o.threshold) / (255 - o.threshold));
  const r4 = (v) => Math.round(v * 10000) / 10000;
  const freq = new Array(ticks);
  const features = new Array(ticks);
  for (let k = 0; k < ticks; k++) {
    const end = Math.round((offset + k / hz) * sampleRate);
    for (let i = 0; i < N; i++) {
      const s = end - N + i;
      re[i] = (s >= 0 && s < pcm.length ? pcm[s] : 0) * win[i];
      im[i] = 0;
    }
    fft(re, im);
    im[0] = 0; // Chromium drops the packed Nyquist term from bin 0
    for (let i = 0; i < bins; i++) {
      const m = Math.hypot(re[i], im[i]) / N;
      let v = o.smoothing * mag[i] + (1 - o.smoothing) * m;
      if (!Number.isFinite(v)) v = 0;
      mag[i] = v;
      const db = v > 0 ? 20 * Math.log10(v) : -1000;
      const b = scale * (db - o.minDb);
      bytes[i] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
    // audio-engine.js analyze(): bins 0-9 bass, 10-49 mid, 50-119 treble, all 128 volume.
    let bass = 0; let mid = 0; let treb = 0; let vol = 0;
    for (let i = 0; i < bins; i++) {
      const v = bytes[i];
      vol += v;
      if (i < 10) bass += v; else if (i < 50) mid += v; else if (i < 120) treb += v;
    }
    const f = { bass: norm(bass / 10) * o.sensitivity, mid: norm(mid / 40) * o.sensitivity, treble: norm(treb / 70) * o.sensitivity, vol: norm(vol / 128) * o.sensitivity, rawVol: vol / 128 / 255 };
    f.rawPulse = f.bass;
    for (const key of Object.keys(f)) f[key] = r4(f[key]);
    features[k] = f;
    freq[k] = Buffer.from(bytes).toString('base64');
  }
  return { hz, sampleRate, fftSize: N, smoothing: o.smoothing, threshold: o.threshold, sensitivity: o.sensitivity, offset, ticks, freq, features };
}
