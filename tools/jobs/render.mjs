// Render a job and verify the result in one step. A render is not "done" until
// verify passes: dimensions, fps, duration, audio present and not silent,
// loudness, true peak, no "Audio lowered by" in the log, and a frame sheet to
// look at.
//
// Renders take the machine-wide heavy-work slot (shared with rcg fx, matte and
// track; defaults.heavySlots, 1 by default), so two agent sessions never starve
// each other of RAM and GPU. A second one waits for the slot; --lock-wait
// <minutes> caps the wait (0 = fail at once).
//
// Usage: node tools/jobs/render.mjs <jobDir> [--fps 24] [--quality looks|draft|delivery]
//        [--workers 3] [--name final] [--silence 4.02-4.18] [--skip-mix-check] [--lock-wait 30]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mixCheck, parseComposition } from '../audio/mix-check.mjs';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { loadConfig } from '../lib/config.mjs';
import { heavySlot } from '../lib/lock.mjs';
import { verifyRender } from '../media/verify.mjs';
import { hf } from './hf.mjs';

function rootAttrs(html) {
  const tag = html.match(/<[a-z]+\b[^>]*data-composition-id[^>]*>/i)?.[0] || '';
  const get = (n) => Number(tag.match(new RegExp(`${n}="([^"]+)"`))?.[1]);
  return { width: get('data-width'), height: get('data-height'), duration: get('data-duration') };
}

export async function renderJob(jobDir, opts = {}) {
  const cfg = loadConfig();
  const dir = resolve(jobDir);
  const indexHtml = join(dir, 'index.html');
  if (!existsSync(indexHtml)) throw new Error(`No index.html in ${dir}`);
  const fps = Number(opts.fps || cfg.defaults.fps);
  const name = opts.name || 'final';
  mkdirSync(join(dir, 'renders'), { recursive: true });
  const out = join(dir, 'renders', `${name}.mp4`);
  const logFile = join(dir, 'renders', `${name}.log`);

  // A composition with no audible media renders without an audio stream; do not
  // fail it for that (the title-preset demo is silent on purpose).
  const hasAudio = parseComposition(readFileSync(indexHtml, 'utf8')).clips.length > 0;
  if (!opts.skipMixCheck && hasAudio) {
    const mix = await mixCheck(indexHtml);
    if (!mix.ok) {
      return { ok: false, stage: 'mix-check', mix, message: 'Mix check failed: HyperFrames would lower the whole mix. Fix the mix first (or pass --skip-mix-check).' };
    }
  }

  let release;
  try {
    release = await heavySlot('render', dir, opts);
  } catch (e) {
    return { ok: false, stage: 'slot', message: e.message };
  }

  const args = ['render', '--fps', String(fps), '--output', out];
  if (opts.quality) args.push('--quality', String(opts.quality));
  if (opts.workers) args.push('--workers', String(opts.workers));
  const { code, output } = await hf(args, {
    cwd: dir,
    onLine: (l) => {
      if (/Render:trace|\[Compiler\]/.test(l)) return;
      if (l.trim()) process.stdout.write(l + '\n');
    },
  });
  release();
  writeFileSync(logFile, output);
  if (code !== 0 || !existsSync(out)) return { ok: false, stage: 'render', message: `Render failed (exit ${code}). Log: ${logFile}` };

  const root = rootAttrs(readFileSync(indexHtml, 'utf8'));
  const verify = await verifyRender(out, {
    width: root.width,
    height: root.height,
    fps,
    duration: root.duration,
    log: logFile,
    sheet: join(dir, 'renders', `${name}-sheet.png`),
    silence: opts.silence,
    expectAudio: hasAudio,
  });
  return { ok: verify.ok, stage: 'verify', out, logFile, verify };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a._[0]) {
    console.error('Usage: node tools/jobs/render.mjs <jobDir> [--fps 24] [--quality q] [--workers n] [--name final] [--silence a-b] [--skip-mix-check] [--lock-wait min]');
    process.exit(2);
  }
  const res = await renderJob(a._[0], {
    fps: a.fps, quality: a.quality, workers: a.workers, name: typeof a.name === 'string' ? a.name : undefined,
    silence: a.silence, skipMixCheck: Boolean(a['skip-mix-check']),
    lockWait: a['lock-wait'] == null ? undefined : a['lock-wait'], agent: a.agent,
  });
  if (res.verify) {
    for (const c of res.verify.checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name.padEnd(28)} ${c.detail}`);
    if (res.verify.sheet) console.log(`Frame sheet: ${res.verify.sheet} (open it and look)`);
  } else {
    console.log(res.message);
    if (res.mix) for (const w of res.mix.warnings) console.log(`  WARNING: ${w}`);
  }
  console.log(res.ok ? `RENDER OK: ${res.out}` : `RENDER NOT OK (${res.stage})`);
  process.exit(res.ok ? 0 : 1);
}
