#!/usr/bin/env node
// clips.mjs: short vertical clips from a long video (skill style-long-video-to-clips).
// Code measures (sentences, lengths, pace, level, numbers); the agent judges (four questions).
//
//   node .agents/skills/style-long-video-to-clips/scripts/clips.mjs find <job> [--len 20-40|40-60|60-90] [--top 15]
//        needs data/cut/words.raw.json (rcg cut transcribe <job>); writes data/clips/candidates.json,
//        candidates.md and a scores.in.json skeleton for the agent
//   ... shortlist <job> [--n 8]        scores.in.json -> data/clips/shortlist.md (+ .json), no overlaps
//   ... trim <job> --pick k3,k7        re-encode each pick, 0.12 s before and 0.35 s after
//                                      -> assets/clips/<k>.mp4 (heavy-work slot)
//   ... jobs <job> --pick k3,k7 [--style <slug>] [--name <slug>]
//                                      trim (if needed), then rcg new-job per pick, its prompt naming the
//                                      clip, the style, the cut stage and the 9:16 reframe
//   ... demo                           self-check on a synthetic transcript, no media, no network
//
// Ranking rules and the answer shape: ../references/ranking.md. Imports tools/lib only.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probe, run, runBuffer } from '../../../../tools/lib/ffmpeg.mjs';
import { heavySlot } from '../../../../tools/lib/lock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const posix = (p) => p.split(sep).join('/');
const readJ = (f, d = null) => { try { return JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return d; } };
const writeJ = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 1) + '\n', 'utf8'); };
const writeT = (f, s) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, s, 'utf8'); };

const SENTENCE_GAP_S = 1.2;
const PAD_BEFORE = 0.12;
const PAD_AFTER = 0.35;
const WEAK = new Set(['and', 'so', 'but', 'or', 'because', 'then', 'also']);
const NUMBER_WORDS = /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand|million|billion|percent|half|double|triple)$/i;
const LAUGH = /\b(ha(ha)+|laugh(s|ed|ing|ter)?)\b|\[laughter\]/i;
const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(Boolean);

// ---------------------------------------------------------------- sentences and candidates

/** [{ a, b (word indexes), start, end, text, n }]: split on . ? ! or a 1.2 s silence. */
export function sentences(ws) {
  const out = [];
  let a = 0;
  for (let i = 0; i < ws.length; i++) {
    const last = i === ws.length - 1;
    if (last || /[.?!]["')\]]*$/.test(ws[i].text.trim()) || ws[i + 1].start - ws[i].end >= SENTENCE_GAP_S) {
      const text = ws.slice(a, i + 1).map((w) => w.text.trim()).join(' ');
      out.push({ a, b: i, start: ws[a].start, end: ws[i].end, text, n: words(text).length });
      a = i + 1;
    }
  }
  return out;
}

const finished = (s) => /[.?!]["')\]]*$/.test(s.text);

/** Every run of whole sentences inside [lo, hi] seconds that starts on 4+ words and ends on a finished sentence of 3+. */
export function candidates(ss, lo, hi) {
  const out = [];
  for (let i = 0; i < ss.length; i++) {
    if (ss[i].n < 4) continue;
    for (let j = i; j < ss.length; j++) {
      const d = ss[j].end - ss[i].start;
      if (d > hi) break;
      if (d >= lo && finished(ss[j]) && ss[j].n >= 3) out.push({ i, j, start: ss[i].start, end: ss[j].end });
    }
  }
  return out;
}

/** Mean dB of the windows inside [a, b] from 0.25 s windows. */
function levelOf(lvl, a, b) {
  const k0 = Math.max(0, Math.floor(a / 0.25));
  const k1 = Math.min(lvl.length, Math.ceil(b / 0.25));
  if (k1 <= k0) return null;
  let s = 0;
  for (let k = k0; k < k1; k++) s += lvl[k];
  return s / (k1 - k0);
}

/** Features and the code score for each candidate (ranking.md). lvl: 0.25 s RMS dB windows, or null. */
export function score(cands, ss, ws, lvl) {
  const sentLevels = lvl ? ss.map((s) => levelOf(lvl, s.start, s.end)).filter((v) => v != null).sort((x, y) => x - y) : [];
  const median = sentLevels.length ? sentLevels[Math.floor(sentLevels.length / 2)] : 0;
  for (const c of cands) {
    const sw = ws.filter((w) => w.start >= c.start - 0.01 && w.end <= c.end + 0.01);
    const text = ss.slice(c.i, c.j + 1).map((s) => s.text).join(' ');
    const toks = words(text);
    const dur = c.end - c.start;
    const capsMid = ss.slice(c.i, c.j + 1).flatMap((s) => s.text.split(/\s+/).slice(1)).filter((t) => /^[A-Z][a-z]/.test(t) && !/^I('|$)/.test(t));
    c.f = {
      dur: +dur.toFixed(2),
      words: toks.length,
      pace: Math.round((toks.length / dur) * 60),
      loud: lvl ? +((levelOf(lvl, c.start, c.end) ?? median) - median).toFixed(1) : 0,
      first3: sw.filter((w) => w.start < c.start + 3).length,
      numbers: toks.filter((t) => /\d/.test(t) || NUMBER_WORDS.test(t)).length,
      names: capsMid.length,
      laughs: LAUGH.test(text) ? 1 : 0,
      question: /\?["')\]]*$/.test(ss[c.i].text) ? 1 : 0,
      weakStart: WEAK.has(toks[0]) ? 1 : 0,
    };
    c.text = text;
  }
  const z = (key) => {
    const v = cands.map((c) => c.f[key]);
    const m = v.reduce((s, x) => s + x, 0) / (v.length || 1);
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length || 1)) || 1;
    return (c) => (c.f[key] - m) / sd;
  };
  const zp = z('pace');
  const zl = z('loud');
  const zf = z('first3');
  for (const c of cands) {
    c.score = +(zp(c) + zl(c) + zf(c) + 0.5 * Math.min(c.f.numbers, 3) + 0.3 * Math.min(c.f.names, 3)
      + 0.5 * c.f.laughs + 0.5 * c.f.question - 1.5 * c.f.weakStart).toFixed(3);
  }
  return cands;
}

const overlap = (x, y) => Math.max(0, Math.min(x.end, y.end) - Math.max(x.start, y.start));

/** The best `n` by `key` (descending) with at most `maxShare` of the shorter one overlapping any picked. */
export function pickApart(list, n, key, maxShare) {
  const out = [];
  for (const c of [...list].sort((x, y) => key(y) - key(x))) {
    if (out.length >= n) break;
    if (out.every((p) => overlap(p, c) <= maxShare * Math.min(p.end - p.start, c.end - c.start))) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------- job helpers

function jobDir(arg) {
  if (!arg || arg === true) throw new Error('Name the job: clips.mjs <step> jobs/<id>');
  const job = [resolve(String(arg)), join(ROOT, String(arg))].find((p) => existsSync(join(p, 'data')) || existsSync(join(p, 'JOB.md')));
  if (!job) throw new Error(`Not a job folder: ${arg}`);
  return job;
}

function transcript(job) {
  const raw = readJ(join(job, 'data', 'cut', 'words.raw.json'));
  if (!raw?.words?.length) throw new Error('No transcript: run node tools/rcg.mjs cut transcribe <job> first (it is cached by the file\'s sha256)');
  return raw;
}

/** RMS dB per 0.25 s window of the source's audio, one channel at 8 kHz (relative levels only). */
async function levels(file) {
  const buf = await runBuffer(['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-']);
  const pcm = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const n = 2000;
  const out = new Float64Array(Math.floor(pcm.length / n));
  for (let k = 0; k < out.length; k++) {
    let s = 0;
    for (let i = k * n; i < (k + 1) * n; i++) s += pcm[i] * pcm[i];
    out[k] = s > 0 ? 10 * Math.log10(s / n) : -120;
  }
  return out;
}

const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

// ---------------------------------------------------------------- steps

async function find(job, a) {
  const raw = transcript(job);
  const [lo, hi] = String(a.len && a.len !== true ? a.len : '20-40').split('-').map(Number);
  if (!(lo > 0 && hi > lo)) throw new Error('--len is lo-hi seconds, for example 40-60');
  const top = Number(a.top && a.top !== true ? a.top : 15);
  const ss = sentences(raw.words);
  const src = join(job, raw.source);
  const lvl = existsSync(src) ? await levels(src) : null;
  const all = score(candidates(ss, lo, hi), ss, raw.words, lvl);
  const best = pickApart(all, top, (c) => c.score, 0.3).map((c, k) => ({ id: `k${k + 1}`, ...c }));
  const id = createHash('sha256').update(JSON.stringify(best.map((c) => [c.start, c.end]))).digest('hex').slice(0, 12);
  writeJ(join(job, 'data', 'clips', 'candidates.json'), { id, source: raw.source, len: [lo, hi], sentences: ss.length, found: all.length, candidates: best });
  const md = [`# Clip candidates: ${raw.source}`, '',
    `${ss.length} sentences, ${all.length} runs of ${lo}-${hi} s, the best ${best.length} that do not overlap (code score). `
    + 'Score each in `data/clips/scores.in.json` on the four questions (references/ranking.md), from the text alone, '
    + 'as a viewer who did not see the rest. Then: `clips.mjs shortlist <job>`.', ''];
  for (const c of best) {
    md.push(`## ${c.id}  ${fmt(c.start)}-${fmt(c.end)} (${c.f.dur} s), code ${c.score}`);
    md.push(`pace ${c.f.pace} wpm, level ${c.f.loud >= 0 ? '+' : ''}${c.f.loud} dB, ${c.f.first3} words in 3 s, numbers ${c.f.numbers}, names ${c.f.names}${c.f.question ? ', opens on a question' : ''}${c.f.weakStart ? ', weak start' : ''}${c.f.laughs ? ', laugh' : ''}`, '');
    md.push(c.text, '');
  }
  writeT(join(job, 'data', 'clips', 'candidates.md'), md.join('\n'));
  const answers = join(job, 'data', 'clips', 'scores.in.json');
  const prev = readJ(answers);
  const skeleton = { candidates: id, scores: Object.fromEntries(best.map((c) => [c.id, { hook: null, self: null, payoff: null, concrete: null, why: '' }])) };
  if (!prev || prev.candidates !== id) writeJ(answers, skeleton);
  console.log(`${ss.length} sentences, ${all.length} candidate runs of ${lo}-${hi} s; wrote the best ${best.length} to data/clips/candidates.md`);
  console.log(`next: score them in data/clips/scores.in.json, then clips.mjs shortlist ${posix(relative(process.cwd(), job))}`);
  return best;
}

function shortlist(job, a) {
  const cj = readJ(join(job, 'data', 'clips', 'candidates.json'));
  if (!cj) throw new Error('No candidates: run clips.mjs find first');
  const ans = readJ(join(job, 'data', 'clips', 'scores.in.json'));
  if (!ans || ans.candidates !== cj.id) throw new Error('scores.in.json does not answer the current candidates.json (run find again, then score)');
  const missing = [];
  for (const c of cj.candidates) {
    const s = ans.scores[c.id] || {};
    const q = ['hook', 'self', 'payoff', 'concrete'];
    if (q.some((k) => !(Number.isInteger(s[k]) && s[k] >= 0 && s[k] <= 3))) missing.push(c.id);
    else Object.assign(c, { judged: q.reduce((t, k) => t + s[k], 0), q: Object.fromEntries(q.map((k) => [k, s[k]])), why: s.why || '' });
  }
  if (missing.length) throw new Error(`Score hook, self, payoff and concrete (0-3 each) for: ${missing.join(', ')}`);
  const n = Number(a.n && a.n !== true ? a.n : 8);
  const best = pickApart(cj.candidates, n, (c) => c.judged + c.score / 1000, 0);
  const ssOf = (c) => c.text.split(/(?<=[.?!])\s+/)[0];
  const md = [`# Shortlist: ${cj.source}`, '', `The best ${best.length} with no overlap (four questions, 0-12; the code score breaks ties). Pick the clips and one style.`, '',
    '| Clip | Time | Length | Score | Why | Opens on |', '|---|---|---|---|---|---|',
    ...best.map((c) => `| ${c.id} | ${fmt(c.start)}-${fmt(c.end)} | ${c.f.dur} s | ${c.judged}/12 (hook ${c.q.hook}, self ${c.q.self}, payoff ${c.q.payoff}, concrete ${c.q.concrete}) | ${c.why.replace(/\|/g, '/')} | "${ssOf(c).replace(/\|/g, '/')}" |`)];
  writeT(join(job, 'data', 'clips', 'shortlist.md'), md.join('\n') + '\n');
  writeJ(join(job, 'data', 'clips', 'shortlist.json'), { source: cj.source, candidates: cj.id, clips: best });
  console.log(md.slice(4).join('\n'));
  return best;
}

function picks(job, a) {
  const cj = readJ(join(job, 'data', 'clips', 'candidates.json'));
  if (!cj) throw new Error('No candidates: run clips.mjs find first');
  const ids = String(a.pick && a.pick !== true ? a.pick : '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) throw new Error('--pick k1,k3,...');
  return { cj, list: ids.map((id) => cj.candidates.find((c) => c.id === id) || (() => { throw new Error(`No candidate ${id}`); })()) };
}

async function trim(job, a) {
  const { cj, list } = picks(job, a);
  const src = join(job, cj.source);
  const info = await probe(src);
  const release = await heavySlot('clips trim', job, a);
  const out = [];
  try {
    for (const c of list) {
      const s = Math.max(0, c.start - PAD_BEFORE);
      const e = Math.min(info.duration, c.end + PAD_AFTER);
      const file = join(job, 'assets', 'clips', `${c.id}.mp4`);
      mkdirSync(dirname(file), { recursive: true });
      // -ss before -i seeks fast; re-encoding decodes from the keyframe and drops to the exact time
      await run('ffmpeg', ['-v', 'error', '-y', '-ss', s.toFixed(3), '-i', src, '-t', (e - s).toFixed(3), '-c:v', 'libx264', '-crf', '18',
        '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', file], { timeout: 30 * 60000 });
      const got = await probe(file);
      if (Math.abs(got.duration - (e - s)) > 0.1 || !got.audio.length) throw new Error(`${c.id}: ${got.duration.toFixed(2)} s${got.audio.length ? '' : ', no audio'}, wanted ${(e - s).toFixed(2)} s`);
      console.log(`trimmed    ${c.id} ${fmt(s)}-${fmt(e)} -> assets/clips/${c.id}.mp4 (${got.duration.toFixed(2)} s, ${got.video.width}x${got.video.height})`);
      out.push({ c, file, s, e });
    }
  } finally { release(); }
  return out;
}

async function jobs(job, a) {
  const done = await trim(job, a);
  const style = a.style && a.style !== true ? a.style : null;
  const name = a.name && a.name !== true ? a.name : basename(job).replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const made = [];
  for (const { c, file, s, e } of done) {
    const prompt = [`Clip ${c.id} of ${posix(relative(ROOT, join(job, readJ(join(job, 'data', 'clips', 'candidates.json')).source)))}, ${fmt(s)}-${fmt(e)} (skill style-long-video-to-clips).`,
      style ? `Style: ${style}.` : 'Style: ask the user.',
      'Run the cut stage first (video-job step 1b). The source may be 16:9: reframe to 9:16 on the speaker (rcg track, then rcg camera with a face.follow cue).',
      c.why ? `Why this clip: ${c.why}` : '', '', `Text: ${c.text}`].filter((x) => x !== '').join('\n');
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'rcg.mjs'), 'new-job', '--name', `${name}-${c.id}`, '--video', file, '--prompt', prompt], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`new-job for ${c.id} failed: ${r.stderr.slice(-300)}`);
    const dir = r.stdout.match(/Job created: (.+)/)?.[1]?.trim();
    console.log(`job        ${c.id} -> ${dir}`);
    made.push(dir ? posix(relative(ROOT, dir)) : null);
  }
  writeJ(join(job, 'data', 'clips', 'jobs.json'), { style, jobs: made });
  console.log(`next: video-job on each (they plan in parallel; renders queue on the heavy-work slot)`);
  return made;
}

function demo() {
  // one steady speaker (2.6 words a second, 0.4 s between sentences), 1.5 s of silence after "lunch"
  const ws = [];
  let t0 = 0;
  for (const [text, pause] of [['Hi everyone, welcome back.', 0.4], ['Today I want to talk about pricing.', 0.4],
    ['Most founders charge 40 dollars when they should charge 400.', 0.4], ['Here is why that happens and what Stripe found in 2023.', 0.4],
    ['They looked at 9000 companies and the ones that raised prices grew faster.', 0.4], ['So that is the first point.', 0.4],
    ['and then we had lunch', 1.5], ['The second idea is about churn and why it hides in plain sight.', 0.4],
    ['Churn looks small every month but compounds into half your customers in a year.', 0.4]]) {
    const w = text.split(' ').map((x, k) => ({ text: x, start: +(t0 + k / 2.6).toFixed(2), end: +(t0 + k / 2.6 + 0.3).toFixed(2) }));
    ws.push(...w);
    t0 = w[w.length - 1].end + pause;
  }
  let ok = true;
  const t = (name, cond, d = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${d ? `: ${d}` : ''}`); ok = ok && cond; };
  const ss = sentences(ws);
  t('sentences split on . and on a 1.2 s silence', ss.length === 9 && ss[6].text === 'and then we had lunch', ss.map((s) => s.text).join(' / '));
  const cs = score(candidates(ss, 10, 20), ss, ws, null);
  t('candidates start on 4+ words and end finished', cs.length > 0 && cs.every((c) => ss[c.i].n >= 4 && /[.?!]$/.test(ss[c.j].text) && c.end - c.start >= 10 && c.end - c.start <= 20));
  t('no candidate ends on the unfinished sentence', cs.every((c) => c.j !== 6));
  const best = pickApart(cs, 15, (c) => c.score, 0.3);
  const top = best[0];
  t('the stats passage ranks first', top.text.includes('400') || top.text.includes('9000'), `${top.score}: ${top.text.slice(0, 70)}`);
  t('picks overlap at most 30%', best.every((p, i) => best.every((q, j) => i === j || overlap(p, q) <= 0.3 * Math.min(p.end - p.start, q.end - q.start) + 1e-9)));
  t('a weak start is marked', cs.filter((c) => c.f.weakStart).every((c) => /^(so|and)\b/i.test(c.text)));
  console.log(ok ? '\nclips demo: all checks pass' : '\nclips demo: FAILED');
  return ok;
}

// ---------------------------------------------------------------- CLI

const argv = process.argv.slice(2);
const a = { _: [] };
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) { a._.push(argv[i]); continue; }
  const v = argv[i + 1];
  if (v !== undefined && !v.startsWith('--')) { a[argv[i].slice(2)] = v; i++; } else a[argv[i].slice(2)] = true;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [step, target] = a._;
  const steps = { find, shortlist, trim, jobs };
  try {
    if (step === 'demo') process.exit(demo() ? 0 : 1);
    if (!steps[step]) { console.log('Usage: clips.mjs find|shortlist|trim|jobs <job> [...] | demo   (see the header of this file)'); process.exit(step ? 2 : 0); }
    await steps[step](jobDir(a.job ?? target), a);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

