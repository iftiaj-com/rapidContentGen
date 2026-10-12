#!/usr/bin/env node
// rcg cut: a clean cut of the user's raw talking take (retakes, false starts, fillers, long pauses
// removed), before any graphics, plus the words re-timed to it. Every later step (captions, beats,
// camera, plan) works from assets/cut/<name>.mp4 and data/words.json.
//
//   rcg cut transcribe <job> [--src assets/x.mp4] [--model base] [--lang en] [--force]
//   rcg cut propose    <job> [--keep-fillers]    transcript.txt + candidates.md: the places to decide
//   rcg cut apply      <job>                     decisions.in.json -> spans.json + review.md + hooks.json
//   rcg cut build      <job> [--max-pause 0.15] [--pad 0.10] [--noise dB] [--dry-run]
//   rcg cut render     <job> [--crf 18] [--lock-wait min]   assets/cut/<name>.mp4 (heavy-work slot)
//   rcg cut verify     <job>                     transcribe the cut again, diff with the kept words
//   rcg cut fix        <job> old=new [old=new]   a misheard word, everywhere, timings kept (fixes.json)
//   rcg cut demo                                 self-check on a synthetic clip, no network, no Whisper
//
// <job> may also be given as --job. Files: jobs/<id>/data/cut/ (see docs/capabilities.md).
// The agent reads transcript.txt, candidates.md, review.md and paper-edit.md, never words.raw.json.
// Decide every candidate (yourself or with a sub-agent, then check the answers); when in doubt, keep.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { heavySlot } from '../lib/lock.mjs';
import { applyAnswers, reviewMd } from './apply.mjs';
import { paperEdit, planCut, resolveSpans, retime } from './build.mjs';
import { candidatesMd, findCandidates, textView } from './candidates.mjs';
import { cutConfig, cutSource, cutVideoPath, jobContext, pickSource, posix, readJson, sha256File, sha256Text, writeJson, writeText } from './job.mjs';
import { applyLabels } from './levels.mjs';
import { checkCut, renderCut } from './render.mjs';
import { SETTINGS, applyFixes, swap, transcribeTake } from './transcribe.mjs';
import { compare } from './verify.mjs';

/** A fingerprint of the word timings: candidates and answers belong to one transcript. Fixes keep it. */
const timingSha = (words) => sha256Text(JSON.stringify(words.map((w) => [w.start, w.end]))).slice(0, 16);

const num = (v, d) => (v == null || v === true ? d : Number(v));

export async function transcribe(ctx, a) {
  const cfg = cutConfig();
  const source = pickSource(ctx, a.src);
  const model = a.model && a.model !== true ? a.model : cfg.whisperModel;
  const lang = a.lang && a.lang !== true ? a.lang : cfg.language;
  const sha = await sha256File(source);
  const old = readJson(ctx.file('words.raw.json'), null);
  if (old && !a.force && old.sourceSha256 === sha && old.model === model && old.settings === SETTINGS && (old.lang ?? null) === (lang ?? null)) {
    console.log(`cached     ${ctx.rel(ctx.file('words.raw.json'))} (same take, model and settings; --force to redo)`);
    return old;
  }
  if (old && old.source !== ctx.rel(source)) console.log(`note: replacing the transcript of ${old.source} (one take per job's cut)`);
  console.log(`whisper    ${model} on ${ctx.rel(source)} (cpu; about a quarter of the take's length)`);
  mkdirSync(ctx.cutDir, { recursive: true });
  const t = await transcribeTake(source, ctx.file('whisper.tmp.json'), { model, lang });
  const fixes = readJson(ctx.file('fixes.json'), {});
  const fixed = applyFixes(t.words, fixes);
  const raw = { version: 1, source: ctx.rel(source), sourceSha256: sha, model, lang: lang ?? null, language: t.language, settings: SETTINGS, seconds: t.seconds, words: t.words };
  writeJson(ctx.file('words.raw.json'), raw);
  writeText(ctx.file('transcript.txt'), textView(raw.words, raw.source));
  console.log(`words      ${raw.words.length} (${t.language || '?'}), ${t.seconds}s${fixed ? `, ${fixed} fixed from fixes.json` : ''}`);
  console.log(`wrote      ${ctx.rel(ctx.file('words.raw.json'))}, ${ctx.rel(ctx.file('transcript.txt'))}`);
  return raw;
}

export function propose(ctx, a) {
  const { raw } = cutSource(ctx);
  const keepFillers = a['keep-fillers'] === true || cutConfig().keepFillers === true;
  const cands = findCandidates(raw.words, { keepFillers });
  const transcript = timingSha(raw.words);
  writeJson(ctx.file('candidates.json'), { transcript, keepFillers, candidates: cands });
  writeText(ctx.file('transcript.txt'), textView(raw.words, raw.source));
  writeText(ctx.file('candidates.md'), candidatesMd(cands, raw.source));
  const asked = cands.filter((c) => !c.auto);
  const skeleton = { transcript, answers: Object.fromEntries(asked.map((c) => [c.id, null])), extra: [] };
  const inFile = ctx.file('decisions.in.json');
  const prev = readJson(inFile, null);
  if (!prev) writeJson(inFile, skeleton);
  else if (prev.transcript !== transcript) {
    writeJson(ctx.file('decisions.in.new.json'), skeleton);
    console.log('note: decisions.in.json answers an older transcript, so its ids may point at other places now.'
      + ' A fresh skeleton is in decisions.in.new.json: answer it and rename it to decisions.in.json.');
  }
  console.log(`candidates ${asked.length} to decide, ${cands.length - asked.length} cut without asking (um/uh, alternate hooks)`);
  console.log(`read       ${ctx.rel(ctx.file('transcript.txt'))}, ${ctx.rel(ctx.file('candidates.md'))}`);
  console.log(`answer in  ${ctx.rel(inFile)}, then: rcg cut apply ${posix(relative(process.cwd(), ctx.job))}`);
}

export function apply(ctx) {
  const { raw } = cutSource(ctx);
  const cj = readJson(ctx.file('candidates.json'), null);
  if (!cj) throw new Error('No candidates.json: run rcg cut propose first');
  const input = readJson(ctx.file('decisions.in.json'), null);
  if (!input) throw new Error('No decisions.in.json: answer the candidates in candidates.md first');
  const now = timingSha(raw.words);
  if (cj.transcript !== now) throw new Error('The transcript changed since rcg cut propose: run it again.');
  if (input.transcript && input.transcript !== now) throw new Error('decisions.in.json answers an older transcript: answer decisions.in.new.json (rcg cut propose) instead.');
  const { spans, review, hooks, errors } = applyAnswers(raw.words, cj.candidates, input);
  errors.push(...resolveSpans(spans, raw.words).errors);
  if (errors.length) throw new Error(errors.map((e) => `ERROR: ${e}`).join('\n'));
  writeJson(ctx.file('spans.json'), spans);
  writeText(ctx.file('review.md'), reviewMd(review));
  writeJson(ctx.file('hooks.json'), hooks);
  const kinds = {};
  for (const s of spans) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
  console.log(`spans      ${spans.length} to remove${spans.length ? ` (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')})` : ''}`);
  console.log(`review     ${review.length} item(s) for the user in ${ctx.rel(ctx.file('review.md'))}`);
  if (hooks.length) console.log(`hooks      ${hooks.length} alternate hook(s) cut, listed in ${ctx.rel(ctx.file('hooks.json'))}`);
}

export async function build(ctx, a) {
  const cfg = cutConfig();
  const { raw, source } = cutSource(ctx);
  const spansFile = ctx.file('spans.json');
  if (!existsSync(spansFile)) throw new Error('No spans.json: run rcg cut apply first (with no candidates it writes an empty list)');
  const spans = readJson(spansFile);
  const maxPause = num(a['max-pause'], cfg.maxPause);
  const pad = num(a.pad, cfg.pad);
  if (!(maxPause >= 0.05 && maxPause <= 2)) throw new Error('--max-pause must be between 0.05 and 2 seconds');
  const gapQuietDb = num(a['gap-quiet-db'], cfg.gapQuietDb);
  const plan = await planCut({ source, words: raw.words, spans, maxPause, pad, gapQuietDb, noise: a.noise == null || a.noise === true ? null : a.noise });
  for (const l of plan.report) console.log(l);
  plan.modelCuts.forEach((c, i) => console.log(`  CUT <<${i + 1}>> ${c.start.toFixed(2)}-${c.end.toFixed(2)} [${c.kind}] "${c.evidence.slice(0, 60)}"`));
  if (a['dry-run']) { console.log('(dry run, nothing written)'); return plan; }
  const out = cutVideoPath(ctx, source);
  const dec = {
    version: 1, source: raw.source, sourceSha256: raw.sourceSha256, output: ctx.rel(out),
    fps: plan.video.fps, fpsRational: plan.video.fpsRational, sourceFrames: plan.video.frames, duration: plan.video.duration,
    final: +plan.final.toFixed(3), maxPause, pad, gapQuietDb, noise: plan.noise,
    frames: plan.frames, spans: plan.keptSpans, modelCuts: plan.modelCuts, cuts: plan.cuts, labels: plan.labels,
    splicesInSpeech: plan.stillInSpeech,
  };
  writeJson(ctx.file('decisions.json'), dec);
  const extra = plan.stillInSpeech.length ? [`- joins still in speech (listen): ${plan.stillInSpeech.map((t) => `${t.toFixed(2)}s`).join(', ')}`] : [];
  writeText(ctx.file('paper-edit.md'), paperEdit(plan.fitted, plan.modelCuts, plan.keptSpans, plan.video.duration, plan.final, extra));
  writeJson(join(ctx.job, 'data', 'words.json'), { source: ctx.rel(out), cutOf: raw.source, words: retime(plan.fitted, plan.keptSpans) });
  console.log(`wrote      ${ctx.rel(ctx.file('decisions.json'))}, ${ctx.rel(ctx.file('paper-edit.md'))}, data/words.json`);
  console.log(`next       read paper-edit.md, then rcg cut render`);
  return plan;
}

export async function render(ctx, a) {
  const dec = readJson(ctx.file('decisions.json'), null);
  if (!dec) throw new Error('No decisions.json: run rcg cut build first');
  const source = join(ctx.job, dec.source);
  if (await sha256File(source) !== dec.sourceSha256) throw new Error(`${dec.source} changed since the transcript: run rcg cut transcribe again`);
  const out = join(ctx.job, dec.output);
  mkdirSync(dirname(out), { recursive: true });
  const release = await heavySlot('cut render', ctx.job, a);
  let res;
  try {
    res = await renderCut(source, out, { frames: dec.frames, fps: dec.fps, fpsRational: dec.fpsRational, crf: num(a.crf, 18) });
  } finally { release(); }
  const { probe } = await import('../lib/ffmpeg.mjs');
  const src = await probe(source);
  const problems = await checkCut(out, { width: src.video.width, height: src.video.height, fps: dec.fps, seconds: res.seconds });
  console.log(`rendered   ${ctx.rel(out)}: ${res.frames} frames, ${res.seconds.toFixed(2)}s (source ${dec.duration.toFixed(2)}s)`);
  if (problems.length) throw new Error(`The render does not look right: ${problems.join('; ')}`);
  console.log('checked    size, fps, duration, audio level, frame edges: OK');
  console.log('next       rcg cut verify');
}

export async function verify(ctx) {
  const cfg = cutConfig();
  const { raw } = cutSource(ctx);
  const dec = readJson(ctx.file('decisions.json'), null);
  if (!dec) throw new Error('No decisions.json: run rcg cut build first');
  const out = join(ctx.job, dec.output);
  if (!existsSync(out)) throw new Error(`No ${dec.output}: run rcg cut render first`);
  const sha = await sha256File(out);
  let heard = readJson(ctx.file('cut.transcript.json'), null);
  if (!heard || heard.cutSha256 !== sha || heard.model !== raw.model || heard.settings !== SETTINGS) {
    console.log(`whisper    ${raw.model} on ${dec.output}`);
    const t = await transcribeTake(out, ctx.file('whisper.tmp.json'), { model: raw.model, lang: raw.language || raw.lang || cfg.language });
    heard = { cut: dec.output, cutSha256: sha, model: raw.model, settings: SETTINGS, words: t.words };
    applyFixes(heard.words, readJson(ctx.file('fixes.json'), {}));
    writeJson(ctx.file('cut.transcript.json'), heard);
  }
  const fitted = applyLabels(raw.words, dec.labels || {});
  const { ok, lines, result } = compare({ fitted, keptSpans: dec.spans, modelCuts: dec.modelCuts, heard: heard.words });
  for (const l of lines) console.log(l);
  writeJson(ctx.file('verify.json'), result);
  console.log(`wrote      ${ctx.rel(ctx.file('verify.json'))}`);
  return ok;
}

export function fix(ctx, pairs) {
  const parsed = pairs.map((p) => { const i = p.indexOf('='); if (i < 1) throw new Error(`Not old=new: ${p}`); return [p.slice(0, i).toLowerCase(), p.slice(i + 1)]; });
  if (!parsed.length) throw new Error('Usage: rcg cut fix <job> old=new [old=new ...]');
  const fixes = { ...readJson(ctx.file('fixes.json'), {}), ...Object.fromEntries(parsed) };
  writeJson(ctx.file('fixes.json'), fixes);
  const now = Object.fromEntries(parsed);
  let n = 0;
  for (const f of [ctx.file('words.raw.json'), ctx.file('cut.transcript.json'), join(ctx.job, 'data', 'words.json')]) {
    const doc = readJson(f, null);
    if (!doc?.words) continue;
    n += applyFixes(doc.words, now);
    writeJson(f, doc);
  }
  // quotes that name a fixed word must still match the transcript
  const sp = readJson(ctx.file('spans.json'), null);
  if (sp) { for (const s of sp) for (const [o, v] of parsed) s.text = swap(s.text, o, v); writeJson(ctx.file('spans.json'), sp); }
  const din = readJson(ctx.file('decisions.in.json'), null);
  if (din?.extra) { for (const s of din.extra) for (const [o, v] of parsed) s.text = swap(s.text, o, v); writeJson(ctx.file('decisions.in.json'), din); }
  const raw = readJson(ctx.file('words.raw.json'), null);
  if (raw) writeText(ctx.file('transcript.txt'), textView(raw.words, raw.source));
  console.log(`fixed      ${n} word(s); kept in ${ctx.rel(ctx.file('fixes.json'))} for later transcripts`);
}

async function main() {
  const a = parseArgs();
  const [step, ...rest] = a._;
  const steps = ['transcribe', 'propose', 'apply', 'build', 'render', 'verify', 'fix', 'demo'];
  if (!steps.includes(step)) {
    console.log(`Usage: rcg cut <${steps.join('|')}> <job> [options]   (see tools/cut/cut.mjs)`);
    process.exit(step ? 2 : 0);
  }
  if (step === 'demo') {
    const { demo } = await import('./demo.mjs');
    process.exit(await demo() ? 0 : 1);
  }
  const ctx = jobContext(a.job ?? rest[0]);
  const pairs = a.job ? rest : rest.slice(1);
  if (step === 'transcribe') await transcribe(ctx, a);
  else if (step === 'propose') propose(ctx, a);
  else if (step === 'apply') apply(ctx);
  else if (step === 'build') await build(ctx, a);
  else if (step === 'render') await render(ctx, a);
  else if (step === 'verify') process.exitCode = (await verify(ctx)) ? 0 : 1;
  else if (step === 'fix') fix(ctx, pairs);
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
