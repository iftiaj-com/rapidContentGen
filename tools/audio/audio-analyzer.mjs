// rcg audio-analyzer: describe audio once with Essentia (music mood, energy, vocals, genre) and
// LAION-CLAP (open-vocabulary tags per 10 s section), so any agent can pick music and SFX by reading
// the manifest, with no model call at job time.
//
//   rcg audio-analyzer library [--force] [--device cpu]   new or changed files in library/sfx -> manifest
//   rcg audio-analyzer file <inbox/.../song.mp3> [--device cpu]   one inbox audio file -> <folder>/audio-analysis.json
//   rcg audio-analyzer find "tense slow build" [--type music|sfx] [--top 5]   rank library sounds by a phrase
//   rcg audio-analyzer check                               files not analysed yet, or analysed by an older version
//
// Scope (enforced): audio files only (audioAnalyzer.extensions, and ffprobe must find no video stream),
// inside library/sfx or inbox/. Footage is never analysed: most of it carries speech.
// Results are kept by file hash and analysis version: a file is analysed again only when it, the
// models or tools/audio-analyzer/vocab.json change. Human labels (library/sfx/manifest.labels.json) are
// never touched here; measure-sfx merges both into manifest.json.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { loadConfig, readJson, ROOT } from '../lib/config.mjs';
import { measureSfx } from './measure-sfx.mjs';

const SFX_DIR = join(ROOT, 'library', 'sfx');
const ANALYZER_DIR = join(ROOT, 'tools', 'audio-analyzer');
const OUT_FILE = join(SFX_DIR, 'manifest.analyzer.json');
const EMB_DIR = join(SFX_DIR, 'audio-analyzer');
const SCHEMA = 2; // bump when the result shape changes

const abs = (p) => (p == null ? p : isAbsolute(p) ? p : join(ROOT, p));

function settings() {
  const cfg = loadConfig();
  const a = cfg.audioAnalyzer || {};
  const venv = cfg.paths.audioAnalyzerVenv;
  return {
    cfg,
    python: venv ? join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python') : null,
    extensions: (a.extensions || ['.mp3', '.wav']).map((e) => e.toLowerCase()),
    device: a.device || 'cuda',
    clapCheckpoint: abs(a.clapCheckpoint),
    clapSha256: a.clapSha256 || null,
    essentiaModels: abs(a.essentiaModels),
    hfHome: abs(a.hfHome || 'models/hf'),
    cacheDir: abs(a.cacheDir || 'models/audio-analyzer/cache'),
    vocab: join(ANALYZER_DIR, 'vocab.json'),
  };
}

const sha1 = (file) => createHash('sha1').update(readFileSync(file)).digest('hex');

/** Analysis version: changes when the models, the scored words or the result shape change.
 * moodGroups only steer the ranking here, so editing them re-ranks without re-analysing. */
function analysisVersion(s) {
  const { moodGroups, $comment, ...scored } = readJson(s.vocab);
  const vocab = createHash('sha1').update(JSON.stringify(scored)).digest('hex').slice(0, 8);
  return `s${SCHEMA}|clap:${basename(s.clapCheckpoint || '')}|essentia:discogs-effnet-1|vocab:${vocab}`;
}

const inside = (child, parent) => {
  const r = relative(parent, child);
  return r && !r.startsWith('..') && !isAbsolute(r);
};

/** Throws unless `file` is an audio-only file inside library/sfx or inbox/ with an allowed extension. */
function checkScope(file, s) {
  const p = resolve(file);
  if (!existsSync(p)) throw new Error(`Not found: ${file}`);
  if (!inside(p, SFX_DIR) && !inside(p, s.cfg.paths.inbox)) {
    throw new Error(`${file}: rcg audio-analyzer only reads library/sfx and inbox/. Copy an attached file into an inbox folder first (skill rcg-analyze-audio).`);
  }
  if (!s.extensions.includes(extname(p).toLowerCase())) {
    throw new Error(`${file}: not an audio file this tool reads (${s.extensions.join(', ')}). Footage is never analysed.`);
  }
  const pr = spawnSync(s.cfg.bin.ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', p], { encoding: 'utf8' });
  const types = (pr.stdout || '').split(/\s+/).filter(Boolean);
  if (pr.status !== 0 || !types.includes('audio')) throw new Error(`${file}: ffprobe found no audio stream.`);
  if (types.includes('video')) throw new Error(`${file}: has a video stream. Footage is never analysed.`);
  return p;
}

/** Library audio files with the kind each manifest already gives (HyperFrames and made SFX are sound effects). */
function libraryFiles(s) {
  const hf = readJson(join(SFX_DIR, 'manifest.hyperframes.json'), {});
  const made = readJson(join(SFX_DIR, 'manifest.made.json'), {});
  const labels = readJson(join(SFX_DIR, 'manifest.labels.json'), {});
  return readdirSync(SFX_DIR)
    .filter((f) => s.extensions.includes(extname(f).toLowerCase()))
    .sort()
    .map((f) => {
      const id = f.slice(0, -extname(f).length);
      const kind = labels[id]?.kind || (hf[id] || made[id] ? 'sfx' : 'auto');
      return { id, file: f, path: join(SFX_DIR, f), kind };
    });
}

function runWorker(mode, request, s) {
  if (!s.python || !existsSync(s.python)) {
    throw new Error('Audio-analyzer venv not found (paths.audioAnalyzerVenv). Create it: tools/audio-analyzer/requirements.txt (ask the user before installing).');
  }
  for (const [label, p] of [['CLAP checkpoint', s.clapCheckpoint], ['Essentia models', s.essentiaModels]]) {
    if (!p || !existsSync(p)) throw new Error(`${label} not found: ${p}. Downloading it needs the user's yes.`);
  }
  mkdirSync(s.cacheDir, { recursive: true });
  const tmp = join(s.cacheDir, `${mode}-${process.pid}`);
  writeFileSync(`${tmp}.req.json`, JSON.stringify(request));
  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    HF_HOME: s.hfHome,
    TRANSFORMERS_VERBOSITY: 'error',
    HF_HUB_DISABLE_PROGRESS_BARS: '1',
    PYTHONWARNINGS: 'ignore',
  };
  // The text encoder (roberta-base) is fetched once into hfHome; after that, never touch the network.
  if (existsSync(join(s.hfHome, 'hub', 'models--roberta-base'))) env.HF_HUB_OFFLINE = '1';
  const r = spawnSync(s.python, ['-I', join(ANALYZER_DIR, 'analyze.py'), mode, `${tmp}.req.json`, `${tmp}.res.json`], {
    env, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
  const lines = (r.stderr || '').split(/\r?\n/).filter((l) => /^ {2}\S+: (music|sfx)$|^(CUDA|GPU|Making|CLAP)/.test(l));
  if (lines.length) console.log(lines.join('\n'));
  if (r.status !== 0 || !existsSync(`${tmp}.res.json`)) {
    rmSync(`${tmp}.req.json`, { force: true });
    throw new Error(`analyze.py ${mode} failed:\n${(r.stderr || '').split(/\r?\n/).slice(-15).join('\n')}`);
  }
  const res = JSON.parse(readFileSync(`${tmp}.res.json`, 'utf8'));
  rmSync(`${tmp}.req.json`, { force: true });
  rmSync(`${tmp}.res.json`, { force: true });
  return res;
}

function workerRequest(s, files, version, embeddingsDir) {
  return {
    files, version, embeddingsDir,
    ffmpeg: s.cfg.bin.ffmpeg,
    device: s.device,
    vocab: s.vocab,
    clapCheckpoint: s.clapCheckpoint,
    clapSha256: s.clapSha256,
    essentiaModels: s.essentiaModels,
  };
}

/** One manifest entry from a worker result. tags/sections/changes are filled by rank(). */
function entry(item, res, hash, version) {
  const c = res.clap;
  return {
    file: item.file,
    hash,
    version,
    analyzedAt: new Date().toISOString().slice(0, 10),
    kind: c.kind,
    kindSource: item.kind === 'auto' ? 'clap' : 'manifest',
    durationS: res.durationS,
    tags: [],
    sections: [],
    changes: false,
    ...(res.essentia ? { music: res.essentia } : {}),
    raw: { autoKind: c.autoKind, kindScores: c.kindScores, words: c.words, scores: c.scores, windows: c.windows },
  };
}

const MIN_BASELINE = 5;      // files of one kind needed before scores are compared with the library average
const MIN_SECTION_S = 5;     // a looped 3 s tail reads as 'different'; shorter sections never count as a change
const CHANGE_MARGIN = 0.03;  // a section changes only when its own top word beats the track's top word by this much

/** Average score per word over the library's files of each kind (same word list). */
function baselines(entries) {
  const out = {};
  for (const kind of ['music', 'sfx']) {
    const rows = Object.values(entries).filter((e) => e.kind === kind && e.raw?.scores);
    if (rows.length < MIN_BASELINE) continue;
    const words = rows[0].raw.words;
    const same = rows.filter((e) => e.raw.words.join('|') === words.join('|'));
    out[kind] = { words, mean: words.map((_, i) => same.reduce((s, e) => s + e.raw.scores[i], 0) / same.length) };
  }
  return out;
}

/**
 * Rank words: shortlist the SHORTLIST best raw matches, then order them by how much more they fit
 * this sound than the library average ('distinct'). Raw order alone lets words CLAP scores high on
 * everything win ('inspiring', 'horror'); distinct alone promotes rare words that fit nothing
 * ('jazz', 'chiptune' on piano tracks). Picked against the 2026-10 ear test.
 */
const SHORTLIST = 10;
const MOOD_SHORTLIST = 6;
let moodFamily = null; // word -> family, from vocab.json moodGroups
function family(word) {
  if (!moodFamily) {
    moodFamily = {};
    const groups = readJson(join(ANALYZER_DIR, 'vocab.json')).moodGroups || {};
    for (const [g, ws] of Object.entries(groups)) if (Array.isArray(ws)) for (const w of ws) moodFamily[w] = g;
  }
  return moodFamily[word] || null;
}

function rank(e, base) {
  const b = base[e.kind];
  const words = e.raw.words;
  const mean = b && b.words.join('|') === words.join('|') ? b.mean : words.map(() => 0);
  const distinct = (scores) => scores.map((s, i) => s - mean[i]);
  const order = (scores) => {
    const d = distinct(scores);
    return scores.map((v, i) => i).sort((x, y) => scores[y] - scores[x]).slice(0, SHORTLIST).sort((x, y) => d[y] - d[x]);
  };
  const moodIdx = words.map((w, i) => i).filter((i) => family(words[i]));
  const moodOrder = (scores) => {
    const d = distinct(scores);
    return moodIdx.slice().sort((x, y) => scores[y] - scores[x]).slice(0, MOOD_SHORTLIST).sort((x, y) => d[y] - d[x]);
  };
  const whole = distinct(e.raw.scores);
  const ranked = order(e.raw.scores);
  e.tags = ranked.slice(0, 8).map((i) => ({ tag: words[i], score: e.raw.scores[i], distinct: +whole[i].toFixed(4) }));
  e.tagsRelativeTo = b ? 'library average' : 'none (too few files of this kind)';
  const moods = moodOrder(e.raw.scores);
  e.moods = moods.slice(0, 4).map((i) => words[i]);
  e.mood = moods.length ? family(words[moods[0]]) : null;
  e.sections = [];
  e.changes = false;
  if (e.raw.windows.length > 1) {
    const top = moods[0];
    for (const w of e.raw.windows) {
      const d = distinct(w.scores);
      const m = moodOrder(w.scores);
      // A change = the section's top mood is in another family and clearly ahead of the track's top mood there.
      const changed = top !== undefined && m.length > 0 && w.toS - w.fromS >= MIN_SECTION_S
        && family(words[m[0]]) !== family(words[top]) && d[m[0]] - d[top] >= CHANGE_MARGIN;
      e.changes ||= changed;
      e.sections.push({ fromS: w.fromS, toS: w.toS, mood: m.length ? family(words[m[0]]) : null,
        tags: order(w.scores).slice(0, 3).map((i) => words[i]), changed });
    }
  }
  return e;
}

/** Library files missing from manifest.analyzer.json or analysed by another version. */
export function checkLibrary() {
  const s = settings();
  const done = readJson(OUT_FILE, {});
  const version = existsSync(s.vocab) ? analysisVersion(s) : null;
  const files = libraryFiles(s);
  const stale = files.filter((f) => !done[f.id] || done[f.id].version !== version || done[f.id].hash !== sha1(f.path));
  const gone = Object.keys(done).filter((id) => !files.some((f) => f.id === id));
  return { files: files.length, stale: stale.map((f) => f.id), gone };
}

async function library(args, s) {
  const version = analysisVersion(s);
  const done = readJson(OUT_FILE, {});
  const files = libraryFiles(s).map((f) => ({ ...f, hash: sha1(f.path) }));
  const todo = files.filter((f) => args.force || !done[f.id] || done[f.id].version !== version || done[f.id].hash !== f.hash);
  for (const f of todo) checkScope(f.path, s);
  const out = {};
  for (const f of files) if (done[f.id]) out[f.id] = done[f.id];
  if (todo.length) {
    console.log(`Analysing ${todo.length} of ${files.length} library file(s)...`);
    const res = runWorker('analyze', workerRequest({ ...s, device: args.device || s.device },
      todo.map((f) => ({ id: f.id, path: f.path, kind: f.kind, hash: f.hash })), version, EMB_DIR), s);
    for (const f of todo) out[f.id] = entry(f, res.results[f.id], f.hash, version);
  } else console.log(`All ${files.length} library files are up to date.`);
  for (const id of Object.keys(done)) if (!out[id]) rmSync(join(EMB_DIR, `${id}.clap.json`), { force: true });
  const base = baselines(out); // re-rank every file: the library average moves as files are added
  for (const e of Object.values(out)) rank(e, base);
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 2) + '\n');
  await measureSfx(); // rebuild manifest.json with the analysis and the human labels merged in
  console.log(`Wrote ${relative(ROOT, OUT_FILE)} and rebuilt library/sfx/manifest.json.`);
}

function analyseFile(args, s) {
  const target = args._[1];
  if (!target) throw new Error('Usage: rcg audio-analyzer file <inbox/<folder>/song.mp3>');
  const p = checkScope(target, s);
  if (inside(p, SFX_DIR)) throw new Error('That file is in library/sfx: run `rcg audio-analyzer library`.');
  const version = analysisVersion(s);
  const hash = sha1(p);
  const item = { id: basename(p, extname(p)), file: basename(p), path: p, kind: 'auto', hash };
  const cached = join(s.cacheDir, `${hash}.json`);
  let e = existsSync(cached) ? readJson(cached) : null;
  if (!e || e.version !== version) {
    const embDir = join(s.cacheDir, 'emb');
    const res = runWorker('analyze', workerRequest({ ...s, device: args.device || s.device }, [item], version, embDir), s);
    e = entry(item, res.results[item.id], hash, version);
    writeFileSync(cached, JSON.stringify(e, null, 2) + '\n');
  } else console.log('Already analysed (same file and version): using the cached result.');
  rank(e, baselines(readJson(OUT_FILE, {}))); // compared with the library's average per word
  const outFile = join(dirname(p), 'audio-analysis.json');
  const all = readJson(outFile, {});
  const { raw, ...readable } = e; // raw per-word scores stay in the cache
  all[item.file] = { ...readable, file: item.file };
  writeFileSync(outFile, JSON.stringify(all, null, 2) + '\n');
  console.log(`${item.file}: ${e.kind}; ${e.tags.slice(0, 5).map((t) => t.tag).join(', ')}`);
  if (e.music) console.log(`  energy ~${e.music.energyEstimate}/5, vocals ${e.music.vocalsEstimate}, mood theme ${e.music.moodTheme.slice(0, 3).map((t) => t.tag).join(', ')}`);
  console.log(`Wrote ${relative(ROOT, outFile)}`);
}

function find(args, s) {
  const query = args._.slice(1).join(' ');
  if (!query) throw new Error('Usage: rcg audio-analyzer find "<phrase>" [--type music|sfx] [--top 5]');
  const res = runWorker('find', { ...workerRequest(s, [], analysisVersion(s), EMB_DIR), query, type: args.type || null, top: Number(args.top || 5) }, s);
  console.log(`"${res.query}"`);
  for (const r of res.results) {
    console.log(`  ${r.score.toFixed(3)}  ${r.id.padEnd(40)} ${r.kind}  best ${r.bestSection.fromS}-${r.bestSection.toS}s (${r.bestSection.score.toFixed(3)})`);
  }
}

function check() {
  const c = checkLibrary();
  console.log(`${c.files} library audio files; ${c.stale.length} to analyse${c.stale.length ? `: ${c.stale.join(', ')}` : ''}${c.gone.length ? `; ${c.gone.length} removed from the folder: ${c.gone.join(', ')}` : ''}`);
  if (c.stale.length) console.log('Run: node tools/rcg.mjs audio-analyzer library');
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const sub = args._[0];
  try {
    const s = settings();
    if (sub === 'library') await library(args, s);
    else if (sub === 'file') analyseFile(args, s);
    else if (sub === 'find') find(args, s);
    else if (sub === 'check') check();
    else {
      console.log('Usage: rcg audio-analyzer library [--force] [--device cpu] | file <inbox/.../audio> | find "<phrase>" [--type music|sfx] [--top n] | check');
      process.exit(sub ? 2 : 0);
    }
  } catch (err) {
    console.error(String(err.message || err));
    process.exit(1);
  }
}
