// Create a job workspace: jobs/<YYYY-MM-DD>-<slug>/ as a HyperFrames project
// built from a template, with the user's media copied into assets/, an intake
// probe (data/intake.json), a safe-zone contact sheet of each video, and JOB.md.
//
// Usage:
//   node tools/jobs/new-job.mjs --name <slug> [--template vertical-1080x1920]
//        [--video a.mp4 ...] [--audio song.mp3 ...] [--image p.jpg ...]
//        [--prompt "..." | --prompt-file inbox/x/prompt.md] [--mode a|b|c]

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
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

export async function newJob({ name, template, videos = [], audios = [], images = [], prompt = '', mode = null }) {
  const cfg = loadConfig();
  const tplName = template || cfg.defaults.template;
  const tplDir = join(cfg.paths.templates, tplName);
  if (!existsSync(join(tplDir, 'index.html'))) throw new Error(`Template not found: ${tplDir}`);
  if (mode && !MODES[mode]) throw new Error(`--mode must be a, b or c`);

  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(name);
  let dir = join(cfg.paths.jobs, `${date}-${slug}`);
  for (let n = 2; existsSync(dir); n++) dir = join(cfg.paths.jobs, `${date}-${slug}-${n}`);
  const id = basename(dir);

  cpSync(tplDir, dir, { recursive: true });
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
    `- **Template:** ${tplName} (${tpl.width || '?'}x${tpl.height || '?'})`,
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
  return { id, dir, media: intake };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.name) {
    console.error('Usage: node tools/jobs/new-job.mjs --name <slug> [--template t] [--video f] [--audio f] [--image f] [--prompt "..." | --prompt-file f] [--mode a|b|c]');
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
  });
  console.log(`Job created: ${res.dir}`);
  for (const m of res.media) console.log(`  ${m.kind}: ${m.asset}${m.sheet ? `  sheet: ${m.sheet}` : ''}`);
}
