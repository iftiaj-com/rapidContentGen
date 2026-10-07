// Verify a rendered video: look at the artifact, not the exit code.
// Checks dimensions, fps, duration, that audio exists and is not silent,
// loudness and true peak, and (given the render log) that HyperFrames did not
// lower the whole mix. Writes a labeled frame sheet for a visual check.
//
// Usage:
//   node tools/media/verify.mjs <render.mp4> [--width 1080 --height 1920 --fps 24 --duration 16.88]
//        [--log render.log] [--sheet out.png] [--at 1,2,3] [--silence 4.02-4.18] [--json]
//
// Exit code 0 = all checks pass, 1 = at least one failed.

import { existsSync, readFileSync } from 'node:fs';
import { isMain, numList, parseArgs } from '../lib/cli.mjs';
import { loadConfig } from '../lib/config.mjs';
import { contactSheet, loudness, probe, sectionLevels } from '../lib/ffmpeg.mjs';

export async function verifyRender(file, opts = {}) {
  const cfg = loadConfig();
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  const info = await probe(file);
  const v = info.video;
  add('video stream', Boolean(v), v ? `${v.codec} ${v.width}x${v.height} @ ${v.fps.toFixed(3)} fps` : 'missing');
  if (v && opts.width) add('width', v.width === Number(opts.width), `${v.width} (expected ${opts.width})`);
  if (v && opts.height) add('height', v.height === Number(opts.height), `${v.height} (expected ${opts.height})`);
  if (v && opts.fps) add('fps', Math.abs(v.fps - Number(opts.fps)) < 0.01, `${v.fps.toFixed(3)} (expected ${opts.fps})`);
  if (opts.duration) {
    const frame = v?.fps ? 1 / v.fps : 0.05;
    const diff = Math.abs(info.duration - Number(opts.duration));
    add('duration', diff <= frame * 2 + 0.02, `${info.duration.toFixed(3)} s (expected ${opts.duration}, tolerance 2 frames)`);
  }

  const hasAudio = info.audio.length > 0;
  if (opts.expectAudio !== false) add('audio stream', hasAudio, hasAudio ? `${info.audio[0].codec} ${info.audio[0].sampleRate} Hz ${info.audio[0].channels} ch` : 'missing');

  let lv = null;
  let timeline = null;
  if (hasAudio) {
    lv = await loudness(file);
    const target = opts.lufs != null ? Number(opts.lufs) : cfg.defaults.loudnessTarget;
    const tol = opts.lufsTolerance != null ? Number(opts.lufsTolerance) : 2;
    add('loudness', lv.integratedLufs != null && Math.abs(lv.integratedLufs - target) <= tol, `${lv.integratedLufs} LUFS (target ${target} ±${tol})`);
    const ceiling = cfg.defaults.truePeakCeiling ?? -1;
    add('true peak', lv.truePeakDb != null && lv.truePeakDb <= ceiling + 0.3, `${lv.truePeakDb} dBTP (ceiling ${ceiling})`);
    timeline = await sectionLevels(file, { step: 1 });
    const silentSeconds = timeline.filter((s) => s.rmsDb < -60).length;
    add('audio not silent', silentSeconds < timeline.length / 2, `${timeline.length - silentSeconds}/${timeline.length} seconds carry sound`);
    for (const span of [].concat(opts.silence || [])) {
      const [a, b] = String(span).split('-').map(Number);
      const [s] = await sectionLevels(file, { sections: [{ name: 'silence', start: a, end: b }] });
      add(`silence ${a}-${b}s`, s.rmsDb < -60, `${s.rmsDb} dB RMS`);
    }
  }

  if (opts.log) {
    if (!existsSync(opts.log)) add('render log', false, `not found: ${opts.log}`);
    else {
      const m = readFileSync(opts.log, 'utf8').match(/Audio lowered by ([\d.]+) dB/);
      add('no whole-mix gain reduction', !m, m ? `HyperFrames lowered the mix by ${m[1]} dB: fix the mix with tools/audio/mix-check.mjs` : 'none in log');
    }
  }

  let sheet = null;
  if (opts.sheet && v) {
    const times = opts.at ? numList(opts.at) : Array.from({ length: 14 }, (_, i) => +((info.duration * (i + 0.5)) / 14).toFixed(2));
    sheet = await contactSheet(file, opts.sheet, { times, cols: 7 });
  }

  return { file, ok: checks.every((c) => c.pass), checks, loudness: lv, levelsPerSecond: timeline, sheet };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const file = args._[0];
  if (!file) {
    console.error('Usage: node tools/media/verify.mjs <render.mp4> [--width --height --fps --duration --log --sheet --at --silence a-b --json]');
    process.exit(2);
  }
  const res = await verifyRender(file, args);
  if (args.json) console.log(JSON.stringify(res, null, 2));
  else {
    for (const c of res.checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name.padEnd(28)} ${c.detail}`);
    if (res.sheet) console.log(`Frame sheet: ${res.sheet} (open it and look)`);
    console.log(res.ok ? 'VERIFY OK' : 'VERIFY FAILED');
  }
  process.exit(res.ok ? 0 : 1);
}
