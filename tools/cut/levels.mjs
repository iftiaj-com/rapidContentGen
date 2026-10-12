// Audio levels for rcg cut: 20 ms RMS windows, a silence threshold derived from this take, and the
// word labels a transcriber stretched over far more audio than the word. Design ported from
// ai-video-editor's build_timeline.py (MIT, docs/PROVENANCE.md).
//
// A fixed dB threshold is wrong: what it separates is a DISTANCE (this speaker's speech vs this
// room's floor), and both move from take to take. So speech = the 99th percentile window, the
// floor = the most common 1 dB bin more than 10 dB under it, threshold = max(speech - 26, floor + 6).
// Under 20 dB between them there is a music bed: the threshold sits a third of the way from the bed
// (the quietest 10%) to speech, and only gaps between words are trimmed.

import { decodeMono } from '../lib/ffmpeg.mjs';

export const WIN_S = 0.02;
const RATE = 16000;
const SPEECH_OFFSET_DB = 26;
const MIN_SEPARATION_DB = 20;
const FLOOR_SEARCH_DB = 10;
const FLOOR_HEADROOM_DB = 6;
const ONSET_MARGIN_S = 0.04; // soft onsets (p, f, h) start under the threshold

/**
 * dBFS per 20 ms window of the file's audio (channels averaged): { rms, peak }. RMS judges speech
 * against the floor; the peak sample finds silence the way ffmpeg's silencedetect does (every
 * sample under the threshold). RMS alone calls the quiet tail of a word silence and clips it.
 */
export async function windowLevels(file) {
  const pcm = await decodeMono(file, RATE);
  const n = Math.round(RATE * WIN_S);
  const len = Math.max(0, Math.floor(pcm.length / n));
  const rms = new Float64Array(len);
  const peak = new Float64Array(len);
  for (let k = 0; k < len; k++) {
    let s = 0;
    let p = 0;
    for (let i = k * n; i < (k + 1) * n; i++) { s += pcm[i] * pcm[i]; p = Math.max(p, Math.abs(pcm[i])); }
    const m = s / n;
    rms[k] = m > 0 ? 10 * Math.log10(m) : -120;
    peak[k] = p > 1e-6 ? 20 * Math.log10(p) : -120;
  }
  return { rms, peak };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];

/** { noise, speech, floor, sep, bed } or { noise: null, reason }. */
export function deriveNoise(lvl) {
  if (lvl.length < 50) return { noise: null, reason: `only ${lvl.length} audio windows, too short to measure` };
  const hist = new Map();
  for (const v of lvl) { const b = Math.floor(v); hist.set(b, (hist.get(b) || 0) + 1); }
  const sorted = Float64Array.from(lvl).sort();
  const speech = Math.floor(sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))]);
  let floor = null;
  for (const [b, c] of hist) if (b < speech - FLOOR_SEARCH_DB && (floor == null || c > hist.get(floor))) floor = b;
  if (floor == null) return { noise: null, reason: `no floor below speech (${speech} dB)`, speech };
  const sep = speech - floor;
  if (sep < MIN_SEPARATION_DB) {
    const bed = pct(sorted, 0.1);
    return { noise: +(bed + (speech - bed) / 3).toFixed(1), speech, floor, sep, bed: +bed.toFixed(1) };
  }
  return { noise: Math.max(speech - SPEECH_OFFSET_DB, floor + FLOOR_HEADROOM_DB), speech, floor, sep };
}

/** Silent runs (every window's peak at or under noise) at least minDur long: [[start, end]] seconds. */
export function silentRuns(peak, noise, minDur) {
  const out = [];
  let a = null;
  for (let k = 0; k <= peak.length; k++) {
    const quiet = k < peak.length && peak[k] <= noise;
    if (quiet && a == null) a = k;
    if (!quiet && a != null) {
      const s = a * WIN_S;
      const e = k * WIN_S;
      if (out.length && s - out[out.length - 1][1] <= 0.05) out[out.length - 1][1] = e;
      else out.push([s, e]);
      a = null;
    }
  }
  return out.filter(([s, e]) => e - s >= minDur);
}

/** When the audio last had energy at or before t (word END labels lag the audio). */
export function audibleEnd(lvl, noise, t) {
  if (!lvl.length) return null;
  let i = Math.min(lvl.length - 1, Math.floor(t / WIN_S));
  while (i >= 0 && lvl[i] <= noise) i--;
  return i < 0 ? null : Math.min(t, (i + 1) * WIN_S);
}

/** When the audio first has energy at or after t, before `limit` (labels start early). */
export function audibleStart(lvl, noise, t, limit) {
  let i = Math.max(0, Math.floor(t / WIN_S));
  const end = Math.min(lvl.length, Math.floor(limit / WIN_S));
  while (i < end && lvl[i] <= noise) i++;
  return i >= end ? null : Math.max(t, i * WIN_S - ONSET_MARGIN_S);
}

/** How long a word takes to say, roughly: 0.1 s + 65 ms a letter. */
export const plausibleS = (text) => 0.1 + 0.065 * String(text).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').length;

/** A label far longer than its word (over 2.5x and 0.4 s more): a transcriber artefact. */
export function implausible(w) {
  const est = plausibleS(w.text);
  return w.end - w.start > Math.max(2.5 * est, est + 0.4);
}

/** [[index, voicedSeconds]]: implausible labels holding more voiced audio than their word can (words folded in). */
export function unheard(words, lvl, noise) {
  const out = [];
  words.forEach((w, i) => {
    if (!implausible(w)) return;
    let n = 0;
    for (let k = Math.floor(w.start / WIN_S); k < Math.floor(w.end / WIN_S) && k < lvl.length; k++) if (lvl[k] > noise) n++;
    const voiced = n * WIN_S;
    const est = plausibleS(w.text);
    if (voiced > Math.max(2 * est, est + 0.5)) out.push([i, +voiced.toFixed(2)]);
  });
  return out;
}

const GAP_MIN_S = 1.5;
const GAP_VOICED_S = 1.0;

/**
 * Stretches with no words that still hold speech: Whisper can skip a whole window (18 s of a real
 * take came back empty). [{ after, start, end, voiced, edge }]: after = the word before the gap
 * (-1 before the first), edge = before the first word or after the last (an intro or outro, often music).
 */
export function voicedGaps(words, lvl, noise, duration) {
  const voiced = (a, b) => {
    let n = 0;
    for (let k = Math.floor(a / WIN_S); k < Math.floor(b / WIN_S) && k < lvl.length; k++) if (lvl[k] > noise) n++;
    return n * WIN_S;
  };
  const out = [];
  const bounds = [[-1, 0, words.length ? words[0].start : duration]];
  words.forEach((w, i) => bounds.push([i, w.end, i + 1 < words.length ? words[i + 1].start : duration]));
  for (const [after, a, b] of bounds) {
    if (b - a < GAP_MIN_S) continue;
    const v = voiced(a, b);
    if (v >= GAP_VOICED_S) out.push({ after, start: a, end: b, voiced: +v.toFixed(2), edge: after === -1 || after === words.length - 1 });
  }
  return out;
}

/** {index: [start, end]} for each implausibly long label, fitted to where the audio has energy, at most a speech-rate length. */
export function fitLabels(words, lvl, noise) {
  const out = {};
  words.forEach((w, i) => {
    if (!implausible(w)) return;
    const est = plausibleS(w.text);
    const nxt = words[i + 1]?.start ?? w.end + est;
    let s = w.start;
    let k = Math.floor(s / WIN_S);
    if (lvl.length && k > 0 && k < lvl.length && lvl[k - 1] > noise) {
      // the previous word still sounds at the label start: search from the silence after its tail
      while (k < lvl.length && lvl[k] > noise && k * WIN_S < w.end) k++;
      if (k * WIN_S < w.end) s = k * WIN_S;
    }
    const a = lvl.length ? audibleStart(lvl, noise, s, Math.min(nxt, w.end + est)) : null;
    if (a == null) { out[i] = [w.start, +(w.start + est).toFixed(3)]; return; }
    let j = Math.floor((a + ONSET_MARGIN_S) / WIN_S);
    while (j < lvl.length && lvl[j] > noise && j * WIN_S < a + est) j++;
    out[i] = [+a.toFixed(3), +Math.max(Math.min(j * WIN_S, nxt), a + 0.04).toFixed(3)];
  });
  return out;
}

export const applyLabels = (words, labels) => words.map((w, i) => (labels[i] ? { ...w, start: labels[i][0], end: labels[i][1] } : w));
