// Create a job workspace: jobs/<YYYY-MM-DD>-<slug>/ as a HyperFrames project
// built from a template, with the user's media copied into assets/, an intake
// probe (data/intake.json), a safe-zone contact sheet of each video, and JOB.md.
// With --like, the edit files of an earlier job (index.html, compositions/,
// lib/, beat sheet, data/*.json plans) are copied instead of the template, without
// its media, renders or caches, so a similar video starts from a working edit.
//
// Usage:
//   node tools/jobs/new-job.mjs --name <slug> [--template vertical-1080x1920]
//        [--video a.mp4 ...] [--audio song.mp3 ...] [--image p.jpg ...]
//        [--prompt "..." | --prompt-file inbox/x/prompt.md] [--mode a|b|c]
//        [--like jobs/<old-id>]

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { loadConfig, readJson } from '../lib/config.mjs';
import { makeSheet } from '../media/contact-sheet.mjs';
import { probeMedia } from '../media/probe.mjs';

export const MODES = {
  a: 'Beat sheet first. After approval: build, check, render and verify with no further stops.',
  b: 'Fully autonomous: plan, build, render, verify, then report.',
  c: 'Approval at every stage: beat sheet, preview, and before the final render.',
};

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'job';
const safeName = (f) => basename(f).replace(/[^\w.-]+/g, '_');

// What --like leaves behind: media, renders, caches and the per-job files this
// script writes fresh. Mirrors the job entries in .gitignore. Fonts and SFX under
// assets/ do not depend on the footage, so they come along.
const LIKE_KEEP_ASSETS = new Set(['fonts', 'sfx']);
const LIKE_SKIP_DIRS = new Set(['renders', 'snapshots', 'frames', 'beats', 'video-frames', 'output', 'outputs',
  '.hyperframes', '.thumbnails', '.rcg-nograde', '.transcode-cache', 'node_modules']);
const LIKE_SKIP_FILES = new Set(['JOB.md', 'report.md', 'meta.json', 'package.json']);
const LIKE_SKIP_EXT = new Set(['.mp4', '.mov', '.webm', '.mkv', '.wav', '.mp3', '.m4a', '.aac', '.flac', '.log', '.part', '.tmp', '.bak']);

function likeFilter(srcDir) {
  return (src) => {
    const rel = relative(srcDir, src);
    if (!rel) return true;
    const parts = rel.split(sep);
    if (parts[0] === 'assets') return parts.length === 1 || LIKE_KEEP_ASSETS.has(parts[1]);
    if (LIKE_SKIP_DIRS.has(parts[0])) return false;
    if (parts.length === 1 && LIKE_SKIP_FILES.has(parts[0])) return false;
    const name = parts[parts.length - 1];
    if (LIKE_SKIP_EXT.has(extname(name).toLowerCase())) return false;
    if (parts[0] === 'data' && parts.length === 2
      && (name.startsWith('intake') || name.endsWith('.png') || name.endsWith('.audio.json') || name.endsWith('-say.json'))) return false;
    return true;
  };
}

// Every assets/... path the copied edit points at, so JOB.md can say what to supply.
function assetRefs(dir) {
  const files = [join(dir, 'index.html')];
  const comp = join(dir, 'compositions');
  if (existsSync(comp)) for (const f of readdirSync(comp)) if (f.endsWith('.html')) files.push(join(comp, f));
  const refs = new Set();
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/assets\/[^"'\s)<>?#]+/g)) refs.add(m[0]);
  return [...refs].sort();
}

function likeSection(dir, likeDir) {
  const refs = assetRefs(dir);
  return [
    `## Started from \`${basename(likeDir)}\``,
    '',
    'The edit (index.html, compositions/, lib/, beat sheet, data/*.json, assets/fonts, assets/sfx)',
    'was copied from that job. Its footage, voice, music, renders and report were not. Timings, words, tracking and camera data in data/',
    'still describe the old footage: re-run the tools that measure the new media before building.',
    '',
    '### Assets the copied edit references',
    '',
    ...(refs.length ? refs.map((r) => `- [${existsSync(join(dir, r)) ? 'x' : ' '}] \`${r}\``) : ['_None._']),
    '',
  ];
}

export async function newJob({ name, template, videos = [], audios = [], images = [], prompt = '', mode = null, like = null }) {
  const cfg = loadConfig();
  if (like && template) throw new Error('Use --like or --template, not both');
  const likeDir = like ? resolve(like) : null;
  if (likeDir && !existsSync(join(likeDir, 'index.html'))) throw new Error(`--like job has no index.html: ${likeDir}`);
  const tplName = likeDir ? null : (template || cfg.defaults.template);
  const tplDir = likeDir || join(cfg.paths.templates, tplName);
  if (!existsSync(join(tplDir, 'index.html'))) throw new Error(`Template not found: ${tplDir}`);
  if (mode && !MODES[mode]) throw new Error(`--mode must be a, b or c`);

  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(name);
  let dir = join(cfg.paths.jobs, `${date}-${slug}`);
  for (let n = 2; existsSync(dir); n++) dir = join(cfg.paths.jobs, `${date}-${slug}-${n}`);
  const id = basename(dir);

  cpSync(tplDir, dir, likeDir ? { recursive: true, filter: likeFilter(likeDir) } : { recursive: true });
  mkdirSync(join(dir, 'assets'), { recursive: true });
  mkdirSync(join(dir, 'data'), { recursive: true });

  const hfVersion = cfg.hyperframes.pluginRoot ? basename(cfg.hyperframes.pluginRoot) : 'latest';
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ id, name: id, createdAt: new Date().toISOString() }, null, 2) + '\n');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: id,
    private: true,
    type: 'module',
    scripts: {
      dev: `npx --yes hyperframes@${hfVersion} preview`,
      check: `npx --yes hyperframes@${hfVersion} check`,
      render: `npx --yes hyperframes@${hfVersion} render`,
    },
  }, null, 2) + '\n');

  const media = [];
  const add = (files, kind) => {
    for (const f of [].concat(files || []).filter(Boolean)) {
      if (!existsSync(f)) throw new Error(`Media not found: ${f}`);
      const dest = join(dir, 'assets', safeName(f));
      copyFileSync(f, dest);
      media.push({ kind, source: f, asset: `assets/${basename(dest)}` });
    }
  };
  add(videos, 'video');
  add(audios, 'audio');
  add(images, 'image');

  const intake = [];
  for (const m of media) {
    if (m.kind === 'image') { intake.push({ ...m }); continue; }
    const info = await probeMedia(join(dir, m.asset));
    const entry = { ...m, probe: info };
    if (m.kind === 'video' && info.video) {
      const sheet = join(dir, 'data', `intake-${basename(m.asset, extname(m.asset))}.png`);
      await makeSheet(join(dir, m.asset), sheet, { safe: info.video.height > info.video.width, cols: 7 });
      entry.sheet = `data/${basename(sheet)}`;
    }
    intake.push(entry);
  }
  writeFileSync(join(dir, 'data', 'intake.json'), JSON.stringify(intake, null, 2) + '\n');

  const tpl = readJson(join(tplDir, 'template.json'), {});
  const lines = [
    `# Job ${id}`,
    '',
    likeDir
      ? `- **Like:** \`${basename(likeDir)}\` (edit files copied, ${tpl.width || '?'}x${tpl.height || '?'})`
      : `- **Template:** ${tplName} (${tpl.width || '?'}x${tpl.height || '?'})`,
    `- **Mode:** ${mode ? `(${mode}) ${MODES[mode]}` : 'NOT SET: ask the user to choose (a), (b) or (c) before planning.'}`,
    `- **Status:** intake done`,
    '',
    '## Prompt',
    '',
    prompt ? prompt.trim() : '_No prompt recorded yet._',
    '',
    '## Media',
    '',
    ...intake.map((m) => {
      const p = m.probe;
      if (!p) return `- ${m.kind}: \`${m.asset}\``;
      const v = p.video ? `${p.video.width}x${p.video.height} @ ${p.video.fps.toFixed(3)} fps` : 'no video';
      const a = p.audio.length ? `${p.audio[0].codec}${p.loudness ? `, ${p.loudness.integratedLufs} LUFS, TP ${p.loudness.truePeakDb}` : ''}` : 'no audio';
      return `- ${m.kind}: \`${m.asset}\`, ${p.duration.toFixed(2)} s, ${v}, ${a}${m.sheet ? ` (sheet: \`${m.sheet}\`)` : ''}${p.notes.length ? `\n  - ${p.notes.join('\n  - ')}` : ''}`;
    }),
    '',
    ...(likeDir ? likeSection(dir, likeDir) : []),
    '## Stages',
    '',
    '- [x] Intake',
    '- [ ] Mode confirmed',
    '- [ ] Analysis (transcript, beats, safe-zone review)',
    '- [ ] Beat sheet (beat-sheet.md + beat-sheet.json)',
    '- [ ] Pre-production audio (TTS, limiting, SFX placement, mix-check)',
    '- [ ] Build',
    '- [ ] Check + snapshots',
    '- [ ] Render',
    '- [ ] Verify',
    '- [ ] Report (report.md)',
    '',
  ];
  writeFileSync(join(dir, 'JOB.md'), lines.join('\n'));
  const missing = likeDir ? assetRefs(dir).filter((r) => !existsSync(join(dir, r))) : [];
  return { id, dir, media: intake, missing };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.name) {
    console.error('Usage: node tools/jobs/new-job.mjs --name <slug> [--template t] [--video f] [--audio f] [--image f] [--prompt "..." | --prompt-file f] [--mode a|b|c] [--like jobs/<old-id>]');
    process.exit(2);
  }
  const prompt = a['prompt-file'] ? readFileSync(a['prompt-file'], 'utf8') : (typeof a.prompt === 'string' ? a.prompt : '');
  const res = await newJob({
    name: a.name,
    template: typeof a.template === 'string' ? a.template : undefined,
    videos: a.video,
    audios: a.audio,
    images: a.image,
    prompt,
    mode: typeof a.mode === 'string' ? a.mode : null,
    like: typeof a.like === 'string' ? a.like : null,
  });
  console.log(`Job created: ${res.dir}`);
  for (const m of res.media) console.log(`  ${m.kind}: ${m.asset}${m.sheet ? `  sheet: ${m.sheet}` : ''}`);
  if (a.like) {
    console.log(`Edit copied from ${a.like}.`);
    if (res.missing.length) console.log(`  ${res.missing.length} referenced asset(s) not supplied yet (listed in JOB.md):\n    ${res.missing.join('\n    ')}`);
  }
}
