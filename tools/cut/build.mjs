// rcg cut build: quoted removals (spans.json) + the transcript + the take's audio -> the kept source
// ranges, frame-accurate (decisions.json), the cut as text (paper-edit.md) and the words re-timed
// onto the cut (data/words.json). Nothing here decides WHAT to cut; it only places the edges.
// Design ported from ai-video-editor's build_timeline.py and preview_cut.py (MIT, docs/PROVENANCE.md).
//
//   1. Boundaries: each quoted span resolves to word edges, is snapped out to the neighbouring kept
//      words (taking the dead air round a flub) and padded back in, so no onset or tail is clipped.
//   2. Pauses: every silence over max-pause (0.15 s) is tightened to 2/3 of it (0.10 s), measured
//      from the audio with a threshold derived from this take (levels.mjs).
//   3. Splice budget: the TOTAL silence a join leaves is capped.
//   4. Frames: cut start floored, end ceiled but never into the next kept word's frame; kept
//      slivers under 0.2 s dropped; 0.4 s left after the last word.
//   5. Joins against the audio: a kept edge with speech on both sides moves (up to 0.6 s, never
//      into a removed word) to a quiet frame. An edge that cannot move is reported.

import { execFileSync } from 'node:child_process';
import { loadConfig } from '../lib/config.mjs';
import { WIN_S, applyLabels, audibleEnd, audibleStart, deriveNoise, fitLabels, silentRuns, windowLevels } from './levels.mjs';
import { locate } from './text.mjs';

export const KINDS = new Set(['alt_hook', 'retake', 'false_start', 'filler', 'meta', 'redundant']);
const SHORT_WORD_S = 0.12; // a word this short needs more runway after a splice to be heard
const RUNWAY_S = 0.25;
// A gap between words counts as a pause (a breath) when 90% of it stays this far under speech
// (--gap-quiet-db, config cut.gapQuietDb). ai-video-editor uses 12, which trimmed the soft tail of
// a word on a real rcg take; 15 kept it (config/workspace.json notes the test).
export const GAP_QUIET_DB = 15;
const SPLICE_LEFT_MIN_S = 0.05;
const MIN_KEPT_S = 0.2;
const END_TAIL_S = 0.4;
const SPLICE_REACH_S = 0.6;
const LOUD_OVER_DB = 10;

/** fps (number + rational string), duration and the video stream's real frame count. */
export function probeVideo(file) {
  const { bin } = loadConfig();
  const q = (args) => execFileSync(bin.ffprobe || 'ffprobe', ['-v', 'error', ...args, file], { encoding: 'utf8', windowsHide: true }).trim();
  const rate = q(['-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'default=nw=1:nk=1']);
  const [n, d] = rate.split('/').map(Number);
  const fps = n / (d || 1);
  const duration = parseFloat(q(['-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1']));
  // Count from the stream, never duration * fps: a phone's audio often runs a frame or two past its video.
  const packets = q(['-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'default=nw=1:nk=1']);
  const frames = /^\d+$/.test(packets) ? Number(packets) : Math.round(duration * fps);
  const hasAudio = q(['-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0']).length > 0;
  return { fps, fpsRational: rate, duration, frames, hasAudio };
}

/** Quoted spans -> cuts on word edges: { cuts, errors }. A phrase said twice needs "after" or "occurrence". */
export function resolveSpans(spans, words) {
  const cuts = [];
  const errors = [];
  spans.forEach((sp, i) => {
    const text = sp.text || '';
    const kind = sp.kind || 'retake';
    const conf = sp.confidence || 'high';
    if (!KINDS.has(kind)) { errors.push(`span[${i}]: kind "${kind}" is not one of ${[...KINDS].join(', ')}`); return; }
    if (!['high', 'medium', 'low'].includes(conf)) { errors.push(`span[${i}]: confidence "${conf}" is not high, medium or low`); return; }
    let hits = locate(text, words);
    if (sp.after != null) hits = hits.filter(([a]) => words[a].start >= Number(sp.after));
    if (!hits.length) { errors.push(`span[${i}] "${text.slice(0, 50)}": no match. Quote it from transcript.txt.`); return; }
    let hit;
    if (sp.occurrence != null) {
      hit = hits[Number(sp.occurrence) - 1];
      if (!hit) { errors.push(`span[${i}] "${text.slice(0, 50)}": occurrence ${sp.occurrence} but it appears ${hits.length}x`); return; }
    } else if (sp.after != null || hits.length === 1) hit = hits[0];
    else {
      errors.push(`span[${i}] "${text.slice(0, 50)}": appears ${hits.length}x (${hits.slice(0, 6).map(([a]) => `${words[a].start.toFixed(2)}s`).join(', ')}). Add "after": <seconds> or "occurrence": N.`);
      return;
    }
    const [a, b] = hit;
    cuts.push({ start: words[a].start, end: words[b].end, kind, confidence: conf, evidence: words.slice(a, b + 1).map((w) => w.text.trim()).join(' '), note: sp.note || '' });
  });
  cuts.sort((x, y) => x.start - y.start);
  for (let k = 1; k < cuts.length; k++) {
    if (cuts[k].start < cuts[k - 1].end) errors.push(`overlap ${cuts[k - 1].start.toFixed(2)}-${cuts[k - 1].end.toFixed(2)}s and ${cuts[k].start.toFixed(2)}-${cuts[k].end.toFixed(2)}s: merge them into one span`);
  }
  return { cuts, errors };
}

const coveredBy = (w, cuts) => cuts.some((c) => c.start <= w.start && w.end <= c.end);

/** A point inside [left, right], padded from the near side, or the midpoint when the gap cannot hold the pad. */
function edge(left, right, pad, fromLeft) {
  const gap = right - left;
  if (gap <= 0) return fromLeft ? right : left;
  if (gap >= 2 * pad) return fromLeft ? left + pad : right - pad;
  return left + gap / 2;
}

function snapAndPad(cuts, words, pad) {
  const kept = words.filter((w) => !coveredBy(w, cuts));
  return cuts.map((c) => {
    const prevEnd = Math.max(0, ...kept.filter((w) => w.end <= c.start + 1e-6).map((w) => w.end));
    const nxt = kept.filter((w) => w.start >= c.end - 1e-6).sort((x, y) => x.start - y.start)[0];
    const padR = nxt && nxt.end - nxt.start < SHORT_WORD_S ? Math.max(pad, RUNWAY_S) : pad;
    let a = edge(prevEnd, c.start, pad, true);
    let b = nxt ? edge(c.end, nxt.start, padR, false) : c.end;
    if (b <= a) { a = c.start; b = c.end; }
    if (!nxt) b = Infinity; // a removal that runs to the end must not leave a stub of frames
    return { ...c, start: a, end: b, next: nxt ? nxt.start : null };
  });
}

/** Gaps between words the audio confirms are not speech (90% of the gap's windows under quietDb). */
function quietWordGaps(words, gapMax, lvl, quietDb) {
  const out = [];
  for (let k = 1; k < words.length; k++) {
    const a = words[k - 1].end;
    const b = words[k].start;
    if (b - a <= gapMax || !lvl.length) continue;
    const win = Array.from(lvl.slice(Math.floor(a / WIN_S), Math.floor(b / WIN_S))).sort((x, y) => x - y);
    if (win.length && win[Math.floor(0.9 * (win.length - 1))] < quietDb) out.push([a, b]);
  }
  return out;
}

function mergeRanges(r) {
  const out = [];
  for (const [a, b] of [...r].sort((x, y) => x[0] - y[0])) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Tighten (never close) every silence over gapMax. */
function silenceCuts(words, gapMax, gapKeep, heard) {
  const out = [];
  for (const [a, b] of heard) {
    if (b - a <= gapMax) continue;
    const nxt = words.find((w) => w.start >= b - 0.05);
    const keep = nxt && nxt.end - nxt.start < SHORT_WORD_S ? Math.max(gapKeep, RUNWAY_S) : gapKeep;
    const s = a + keep / 2;
    const e = b - keep / 2;
    if (e - s >= 0.04) out.push({ start: s, end: e, kind: 'silence', confidence: 'high', evidence: `${(b - a).toFixed(2)}s silence`, note: `tightened to ${keep.toFixed(2)}s` });
  }
  return out;
}

function leadTrailCuts(kept, dur, gapKeep) {
  if (!kept.length) return [];
  const out = [];
  const first = kept[0].start;
  const last = Math.max(...kept.map((w) => w.end));
  if (first > gapKeep) out.push({ start: 0, end: first - gapKeep, kind: 'silence', confidence: 'high', evidence: `${first.toFixed(2)}s before the first word`, note: 'lead-in' });
  if (dur - last > gapKeep) out.push({ start: last + gapKeep, end: Infinity, kind: 'silence', confidence: 'high', evidence: 'after the last word', note: 'tail' });
  return out;
}

const KIND_RANK = { redundant: 4, retake: 2, false_start: 2, meta: 2, filler: 2, alt_hook: 2, silence: 0 };

function mergeCuts(cuts) {
  const out = [];
  for (const c of [...cuts].sort((x, y) => x.start - y.start)) {
    const last = out[out.length - 1];
    if (last && c.start <= last.end + 1e-6) {
      last.end = Math.max(last.end, c.end);
      if ((KIND_RANK[c.kind] ?? 2) > (KIND_RANK[last.kind] ?? 2)) last.kind = c.kind;
      if (c.next != null) last.next = Math.max(last.next || 0, c.next);
      last.evidence = `${last.evidence} | ${c.evidence}`.slice(0, 300);
      if (c.confidence === 'low') last.confidence = 'low';
    } else out.push({ ...c });
  }
  return out;
}

function spliceNeighbours(c, kept, lvl, noise) {
  let left = null;
  for (const w of kept) if (w.start < c.start) { const e = Math.min(w.end, c.start); left = left == null ? e : Math.max(left, e); }
  if (left != null && lvl.length && noise != null) {
    const a = audibleEnd(lvl, noise, left);
    if (a != null) left = Math.max(Math.min(left, a), Math.max(0, ...kept.filter((w) => w.start < c.start).map((w) => w.start)));
  }
  let nxt = kept.filter((w) => w.end > c.end).sort((x, y) => x.start - y.start)[0] || null;
  if (nxt && lvl.length && noise != null) {
    const on = audibleStart(lvl, noise, Math.max(nxt.start, c.end), nxt.end);
    if (on != null && on > nxt.start) nxt = { ...nxt, start: on };
  }
  return [left, nxt];
}

/** Cap the total silence each join leaves. Only ever widens a cut, never into a kept word. */
function enforceSpliceBudget(cuts, words, modelCuts, budget, lvl, noise) {
  budget = Math.max(budget, SPLICE_LEFT_MIN_S);
  const kept = words.filter((w) => !coveredBy(w, modelCuts));
  for (const c of cuts) {
    const [prevEnd, nxt] = spliceNeighbours(c, kept, lvl, noise);
    if (prevEnd == null || !nxt) continue;
    c.next = nxt.start; // the audible onset: the frame clamp must not reach back past it
    const left = Math.max(0, c.start - prevEnd);
    const right = Math.max(0, nxt.start - c.end);
    if (left + right <= budget + 1e-6) continue;
    const short = nxt.end - nxt.start < SHORT_WORD_S;
    let wantRight = Math.max(0, Math.min(right, short ? budget - SPLICE_LEFT_MIN_S : budget / 2));
    let wantLeft = Math.max(SPLICE_LEFT_MIN_S, budget - wantRight);
    if (wantLeft > left) { wantLeft = left; wantRight = Math.max(0, budget - left); }
    c.start = prevEnd + wantLeft;
    c.end = nxt.start - Math.min(right, wantRight);
  }
  return cuts;
}

function spliceGaps(cuts, words, modelCuts, lvl, noise) {
  const kept = words.filter((w) => !coveredBy(w, modelCuts));
  const out = [];
  for (const c of cuts) {
    const [prevEnd, nxt] = spliceNeighbours(c, kept, lvl, noise);
    if (prevEnd != null && nxt) out.push(Math.max(0, c.start - prevEnd) + Math.max(0, nxt.start - c.end));
  }
  return out;
}

/** Cuts -> kept [startFrame, endFrame) pairs. */
function keptFrames(cuts, fps, total) {
  const kept = [];
  let cursor = 0;
  for (const c of cuts) {
    let a = Math.max(0, Math.min(total, Math.floor(c.start * fps)));
    let b = c.end === Infinity ? total : Math.max(0, Math.min(total, Math.ceil(c.end * fps)));
    if (c.next != null) b = Math.min(b, Math.max(a + 1, Math.floor(c.next * fps)));
    a = Math.max(a, cursor);
    if (b <= a) continue;
    // a sliver between two cuts is a mislabelled flub tail, or a one-frame flash before the first jump
    if (a - cursor >= MIN_KEPT_S * fps) kept.push([cursor, a]);
    cursor = b;
  }
  if (cursor < total) kept.push([cursor, total]);
  return kept;
}

function inSpeech(lvl, t, quietDb) {
  const w = Math.floor(t / WIN_S);
  return w > 0 && w < lvl.length && Math.min(lvl[w - 1], lvl[w]) > quietDb + LOUD_OVER_DB;
}

/** Move each kept edge that lands in speech out into its removed side, to a quiet frame. */
function fixSplices(frames, fps, lvl, quietDb, total, removed) {
  frames = frames.map((f) => [...f]);
  const reach = Math.floor(SPLICE_REACH_S * fps);
  const quiet = (g) => {
    const w = Math.floor(g / fps / WIN_S);
    const win = Array.from(lvl.slice(Math.max(0, w - 1), w + 1));
    return Math.min(...(win.length ? win : [0])) <= quietDb;
  };
  const moved = [];
  const left = [];
  frames.forEach((fr, k) => {
    for (const side of [0, 1]) {
      const f = fr[side];
      const t = f / fps;
      if (f === (side === 0 ? 0 : total) || !inSpeech(lvl, t, quietDb)) continue;
      let to = null;
      if (side === 0) {
        const lo = Math.max(k ? frames[k - 1][1] : 0, f - reach, ...removed.filter(([s]) => s < t).map(([, e]) => Math.ceil(Math.min(e, t) * fps)));
        for (let g = f; g >= lo; g--) if (quiet(g)) { to = g; break; }
      } else {
        const hi = Math.min(k + 1 < frames.length ? frames[k + 1][0] : total, f + reach, ...removed.filter(([, e]) => e > t).map(([s]) => Math.floor(Math.max(s, t) * fps)));
        for (let g = f; g <= hi; g++) if (quiet(g)) { to = g; break; }
      }
      if (to == null) left.push(+t.toFixed(2));
      else { fr[side] = to; moved.push([+t.toFixed(2), +(to / fps).toFixed(2)]); }
    }
  });
  const out = [];
  for (const fr of frames) {
    if (out.length && fr[0] <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], fr[1]);
    else out.push(fr);
  }
  return { frames: out, moved, left };
}

/** A word plays if at least 0.1 s of it (or half, if shorter) is inside a kept span. */
export function isKept(w, spans) {
  // Whisper can label a word with no length ("So," 4.34-4.34): it plays if that moment does.
  if (w.end - w.start <= 0) return spans.some((s) => s.start <= w.start && w.start < s.end);
  const need = Math.min(0.1, (w.end - w.start) / 2);
  return spans.reduce((s, k) => s + Math.max(0, Math.min(w.end, k.end) - Math.max(w.start, k.start)), 0) >= need;
}

/** Kept words moved onto the cut's timeline. */
export function retime(words, spans) {
  const offs = [];
  let t = 0;
  for (const s of spans) { offs.push(t); t += s.end - s.start; }
  const out = [];
  for (const w of words) {
    if (!isKept(w, spans)) continue;
    let best = 0;
    let bestLen = -Infinity;
    spans.forEach((s, k) => { const l = Math.min(w.end, s.end) - Math.max(w.start, s.start); if (l > bestLen) { bestLen = l; best = k; } });
    const s = spans[best];
    out.push({ text: w.text, start: +(Math.max(w.start, s.start) - s.start + offs[best]).toFixed(3), end: +(Math.min(w.end, s.end) - s.start + offs[best]).toFixed(3) });
  }
  return out.sort((x, y) => x.start - y.start);
}

/** A cut moment -> the same moment in the source. */
export function toSource(t, spans) {
  let off = 0;
  for (const s of spans) {
    const n = s.end - s.start;
    if (t <= off + n) return +(s.start + Math.max(0, t - off)).toFixed(2);
    off += n;
  }
  return spans.length ? +spans[spans.length - 1].end.toFixed(2) : +t.toFixed(2);
}

/** paper-edit.md: what plays, <<n>> where cut n was removed, CLIPPED words nobody asked to cut. */
export function paperEdit(words, modelCuts, spans, dur, final, extra = []) {
  const kept = [];
  const clipped = [];
  let prev = null;
  for (const w of words) {
    const mid = (w.start + w.end) / 2;
    const ci = modelCuts.findIndex((c) => c.start <= mid && mid <= c.end);
    if (!isKept(w, spans)) {
      if (ci < 0) clipped.push(w.text.trim());
      else if (ci !== prev) kept.push(`<<${ci + 1}>>`);
      prev = ci < 0 ? null : ci;
    } else { kept.push(w.text.trim()); prev = null; }
  }
  const lines = ['# Paper edit', '', `- source ${dur.toFixed(1)}s, cut ${final.toFixed(1)}s, ${(dur - final).toFixed(1)}s removed`,
    `- ${modelCuts.length} cut(s) from spans.json, the rest is pauses`, ...extra, ''];
  if (clipped.length) lines.push(`- **CLIPPED by a pause cut, not asked for:** ${clipped.join(' ')}`, '  Raise --pad and build again; if it stays, rcg cut verify says whether it plays.', '');
  lines.push('## What plays', '', '`<<n>>` marks where cut n was removed.', '', kept.join(' '), '', '## Cuts', '');
  modelCuts.forEach((c, i) => lines.push(`- <<${i + 1}>> ${c.start.toFixed(2)}-${c.end.toFixed(2)}s \`${c.kind}\` (${c.confidence}): ${c.evidence}${c.note ? `  _(${c.note})_` : ''}`));
  return lines.join('\n') + '\n';
}

/**
 * Plan the cut. words: the raw transcript words. Returns everything decisions.json holds plus the
 * report lines; throws listing every span that did not resolve.
 */
export async function planCut({ source, words, spans, maxPause, pad, noise: noiseFlag, gapQuietDb = GAP_QUIET_DB }) {
  const first = resolveSpans(spans, words);
  if (first.errors.length) throw new Error(first.errors.map((e) => `ERROR: ${e}`).join('\n'));
  const gapMax = maxPause;
  const gapKeep = +(maxPause * 2 / 3).toFixed(3);
  const video = probeVideo(source);
  if (!video.hasAudio) throw new Error('The take has no audio track: the cut stage works from speech.');
  const { rms: lvl, peak } = await windowLevels(source);
  const diag = deriveNoise(lvl);
  const noise = noiseFlag != null ? Number(noiseFlag) : diag.noise;
  if (noise == null) throw new Error(`Cannot derive a silence threshold: ${diag.reason}. Pass --noise <dB> (about 10 dB above the mean volume).`);
  const bed = diag.bed != null && noiseFlag == null;
  const labels = fitLabels(words, lvl, noise);
  const fitted = applyLabels(words, labels);
  const { cuts: modelCuts } = resolveSpans(spans, fitted);
  const keptWords = fitted.filter((w) => !coveredBy(w, modelCuts));
  let heard;
  if (bed) heard = quietWordGaps(keptWords, gapMax, lvl, noise);
  else {
    const speechDb = Array.from(lvl).sort((x, y) => x - y)[Math.floor(0.99 * (lvl.length - 1))] ?? 0;
    heard = mergeRanges([...silentRuns(peak, noise, gapMax), ...quietWordGaps(keptWords, gapMax, lvl, speechDb - gapQuietDb)]);
  }
  const spliceNoise = bed ? null : noise; // over a music bed, word labels bound the joins
  let all = mergeCuts([...snapAndPad(modelCuts, fitted, pad), ...silenceCuts(fitted, gapMax, gapKeep, heard), ...leadTrailCuts(keptWords, video.duration, gapKeep)]);
  all = enforceSpliceBudget(all, fitted, modelCuts, maxPause, lvl, spliceNoise);
  if (keptWords.length && all.length && all[all.length - 1].end >= video.duration) {
    const last = Math.max(...keptWords.map((w) => w.end));
    all[all.length - 1].start = Math.max(all[all.length - 1].start, Math.min(video.duration, last + END_TAIL_S));
  }
  let frames = keptFrames(all, video.fps, video.frames);
  let moved = [];
  let stillInSpeech = [];
  if (spliceNoise != null) {
    const removed = fitted.filter((w) => coveredBy(w, modelCuts)).map((w) => [w.start, w.end]);
    ({ frames, moved, left: stillInSpeech } = fixSplices(frames, video.fps, lvl, noise, video.frames, removed));
  }
  const keptSpans = frames.map(([a, b]) => ({ start: +(a / video.fps).toFixed(6), end: +(b / video.fps).toFixed(6) }));
  const final = keptSpans.reduce((s, k) => s + k.end - k.start, 0);
  const gaps = spliceGaps(all, fitted, modelCuts, lvl, spliceNoise).sort((x, y) => x - y);
  for (const c of all) { delete c.next; if (c.end === Infinity) c.end = video.duration; }
  const report = [
    `noise      ${noise.toFixed(0)} dB ${noiseFlag != null ? '(--noise)' : `derived (speech ${diag.speech}, ${bed ? `music bed ${diag.bed}: trimming only between words` : `floor ${diag.floor}`})`}`,
    ...(Object.keys(labels).length ? [`labels     ${Object.keys(labels).length} over-long word label(s) fitted to the audio`] : []),
    `pause      tighten over ${gapMax.toFixed(2)}s to ${gapKeep.toFixed(2)}s`,
    `source     ${video.duration.toFixed(2)}s at ${video.fps.toFixed(3)} fps, ${video.frames} frames`,
    `cuts       ${modelCuts.length} from spans.json, ${all.length} after merging with pauses`,
    `result     ${final.toFixed(2)}s (${(video.duration - final).toFixed(2)}s removed, ${keptSpans.length} kept ranges)`,
    ...(gaps.length ? [`joins      median gap ${gaps[Math.floor(gaps.length / 2)].toFixed(3)}s, max ${gaps[gaps.length - 1].toFixed(3)}s`] : []),
    ...(spliceNoise != null ? [`speech     ${moved.length} join(s) moved off speech; ${stillInSpeech.length} still in speech${stillInSpeech.length ? `: ${stillInSpeech.slice(0, 8).map((t) => `${t.toFixed(2)}s`).join(', ')} (listen to these joins)` : ''}`] : []),
  ];
  return { video, noise, diag, labels, fitted, modelCuts, cuts: all, frames, keptSpans, final, moved, stillInSpeech, report };
}
