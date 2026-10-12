// Shared paths and file helpers for rcg cut. Every file the cut stage writes lives in
// jobs/<id>/data/cut/, except the render (assets/cut/<name>.mp4) and the re-timed words
// every later step uses (data/words.json).

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ROOT, loadConfig, readJson } from '../lib/config.mjs';

export { readJson };

export const posix = (p) => p.split(sep).join('/');

/** The job folder from a positional arg or --job, relative to the cwd or the repo root. */
export function jobContext(arg) {
  if (!arg || arg === true) throw new Error('Name the job: rcg cut <step> jobs/<id> (or --job jobs/<id>)');
  const cands = [resolve(String(arg)), join(ROOT, String(arg))];
  const job = cands.find((p) => existsSync(join(p, 'data')) || existsSync(join(p, 'JOB.md')));
  if (!job) throw new Error(`Not a job folder: ${arg}`);
  const cutDir = join(job, 'data', 'cut');
  return { job, cutDir, file: (name) => join(cutDir, name), rel: (p) => posix(relative(job, p)) };
}

/** The settings rcg cut uses: config "cut" (config/workspace.json) over built-in defaults. */
export function cutConfig() {
  const { $comment, ...cut } = loadConfig().cut || {};
  return { whisperModel: 'base', language: null, maxPause: 0.15, pad: 0.1, gapQuietDb: 15, keepFillers: false, ...cut };
}

/** The source take: --src (job-relative or absolute), else the job's only video in data/intake.json. */
export function pickSource(ctx, src) {
  if (src && src !== true) {
    const p = isAbsolute(src) ? src : join(ctx.job, src);
    if (!existsSync(p)) throw new Error(`No such file: ${src}`);
    return p;
  }
  const intake = readJson(join(ctx.job, 'data', 'intake.json'), []);
  const vids = (Array.isArray(intake) ? intake : []).filter((x) => x.kind === 'video');
  if (vids.length !== 1) throw new Error(`The job has ${vids.length} videos in data/intake.json: name the take with --src assets/<file>`);
  return join(ctx.job, vids[0].asset);
}

/** The take this job's cut is working on, recorded by rcg cut transcribe. */
export function cutSource(ctx) {
  const raw = readJson(ctx.file('words.raw.json'), null);
  if (!raw) throw new Error('No transcript yet: run rcg cut transcribe first');
  return { raw, source: join(ctx.job, raw.source) };
}

/** assets/cut/<name>.mp4 for a source. */
export function cutVideoPath(ctx, source) {
  return join(ctx.job, 'assets', 'cut', `${basename(source, extname(source))}.mp4`);
}

export function writeJson(file, data) {
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 1) + '\n', 'utf8');
}

export function writeText(file, text) {
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, text, 'utf8');
}

export const readText = (file) => readFileSync(file, 'utf8');

/** sha256 of a file, streamed (a 4K take can be gigabytes). */
export function sha256File(file) {
  return new Promise((ok, fail) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (c) => h.update(c)).on('error', fail).on('end', () => ok(h.digest('hex')));
  });
}

export const sha256Text = (s) => createHash('sha256').update(s).digest('hex');
