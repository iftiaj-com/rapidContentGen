// Offline mix check: rebuild a HyperFrames composition's audio mix with ffmpeg
// and measure it BEFORE spending minutes on a full render.
//
// Mirrors how HyperFrames mixes root-level media:
//   - <audio id src> and <video data-has-audio="true"> without `muted` are mixed
//   - data-start / data-duration / data-media-start / data-playback-rate place them
//   - a data-automation "volume" lane gives ABSOLUTE levels and overrides
//     data-volume (learned the hard way on the mop-star job); without a lane,
//     data-volume is the static level
// Media inside sub-compositions (data-composition-src) is not expanded; the tool
// warns when it sees one.
//
// The mix is written as 32-bit float WAV: 16-bit output would clip anything
// over 0 dBFS and hide the real peak.
//
// Usage: node tools/audio/mix-check.mjs <index.html> [--out mix.wav] [--json]

import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { loadConfig } from '../lib/config.mjs';
import { loudness, probe, run, sectionLevels } from '../lib/ffmpeg.mjs';

const ATTR_RE = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttrs(src) {
  const attrs = {};
  for (const m of src.matchAll(ATTR_RE)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return attrs;
}

const decodeEntities = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export function parseComposition(html) {
  const warnings = [];
  const rootTag = html.match(/<[a-z]+\b[^>]*data-composition-id[^>]*>/i);
  const root = rootTag ? parseAttrs(rootTag[0]) : {};
  const rootDuration = root['data-duration'] ? Number(root['data-duration']) : null;
  if (/data-composition-src/i.test(html)) {
    warnings.push('Sub-compositions found (data-composition-src): media inside them is not included in this check.');
  }
  const clips = [];
  for (const m of html.matchAll(/<(audio|video)\b([^>]*)>/gi)) {
    const kind = m[1].toLowerCase();
    const a = parseAttrs(m[2]);
    if (!a.src) continue;
    if (kind === 'video' && (a['data-has-audio'] !== 'true' || 'muted' in a)) continue;
    if (kind === 'audio' && !a.id) {
      warnings.push(`<audio src="${a.src}"> has no id: HyperFrames will NOT mix it (silent).`);
      continue;
    }
    let lane = null;
    if (a['data-automation']) {
      try {
        const auto = JSON.parse(decodeEntities(a['data-automation']));
        lane = (auto.lanes || []).find((l) => l.target === 'volume') || null;
      } catch (e) {
        warnings.push(`${a.id}: data-automation is not valid JSON (${e.message}).`);
      }
    }
    if (lane && a['data-volume'] && Number(a['data-volume']) !== 1) {
      warnings.push(`${a.id}: has both data-volume=${a['data-volume']} and a volume lane. The lane wins; data-volume is ignored.`);
    }
    clips.push({
      id: a.id || '(no id)',
      kind,
      src: a.src,
      start: Number(a['data-start'] || 0),
      duration: a['data-duration'] ? Number(a['data-duration']) : null,
      mediaStart: Number(a['data-media-start'] || 0),
      rate: Number(a['data-playback-rate'] || 1),
      volume: a['data-volume'] != null && a['data-volume'] !== '' ? Number(a['data-volume']) : 1,
      lane: lane ? [...lane.points].sort((p, q) => p.t - q.t) : null,
    });
  }
  return { rootDuration, clips, warnings };
}

/** atempo accepts 0.5..2.0 per stage, so chain stages for other rates. */
function atempoChain(rate) {
  if (rate === 1) return [];
  const out = [];
  let r = rate;
  while (r < 0.5) { out.push('atempo=0.5'); r /= 0.5; }
  while (r > 2) { out.push('atempo=2.0'); r /= 2; }
  out.push(`atempo=${r.toFixed(6)}`);
  return out;
}

/** Piecewise-linear lane -> ffmpeg volume expression in clip-local seconds. */
function laneExpr(points) {
  if (!points.length) return '1';
  let expr = String(points[points.length - 1].v);
  for (let i = points.length - 2; i >= 0; i--) {
    const p = points[i];
    const q = points[i + 1];
    const span = Math.max(1e-6, q.t - p.t);
    expr = `if(lt(t,${q.t}),${p.v}+(${q.v - p.v})*(t-${p.t})/${span},${expr})`;
  }
  return `if(lt(t,${points[0].t}),${points[0].v},${expr})`;
}

export async function mixCheck(htmlPath, { out } = {}) {
  const cfg = loadConfig();
  const html = readFileSync(htmlPath, 'utf8');
  const baseDir = dirname(resolve(htmlPath));
  const { rootDuration, clips, warnings } = parseComposition(html);
  if (!clips.length) return { ok: true, clips: [], warnings: [...warnings, 'No audible media found.'] };

  for (const c of clips) {
    c.path = resolve(baseDir, c.src);
    if (!existsSync(c.path)) throw new Error(`${c.id}: source not found: ${c.path}`);
    if (c.duration == null) {
      const info = await probe(c.path);
      c.duration = Math.max(0, (info.duration - c.mediaStart) / c.rate);
    }
    if (rootDuration != null && c.start + c.duration > rootDuration + 1e-3) {
      warnings.push(`${c.id}: ends at ${(c.start + c.duration).toFixed(2)}s, past the root duration ${rootDuration}s (it will be cut).`);
    }
  }
  const total = rootDuration ?? Math.max(...clips.map((c) => c.start + c.duration));

  const inputs = [];
  const chains = [];
  clips.forEach((c, i) => {
    inputs.push('-i', c.path);
    const delayMs = Math.round(c.start * 1000);
    const vol = c.lane ? `volume='${laneExpr(c.lane)}':eval=frame` : `volume=${c.volume}`;
    const steps = [
      `atrim=start=${c.mediaStart}:duration=${(c.duration * c.rate).toFixed(6)}`,
      'asetpts=PTS-STARTPTS',
      ...atempoChain(c.rate),
      'aformat=sample_rates=48000:channel_layouts=stereo',
      vol,
      `adelay=${delayMs}|${delayMs}`,
    ];
    chains.push(`[${i}:a]${steps.join(',')}[a${i}]`);
  });
  const mixInputs = clips.map((_, i) => `[a${i}]`).join('');
  chains.push(`${mixInputs}amix=inputs=${clips.length}:normalize=0:duration=longest,apad,atrim=0:${total}[mix]`);

  const outPath = out ? resolve(out) : join(baseDir, 'data', 'mix-check.wav');
  mkdirSync(dirname(outPath), { recursive: true });
  await run('ffmpeg', ['-y', '-hide_banner', '-v', 'error', ...inputs, '-filter_complex', chains.join(';'), '-map', '[mix]', '-c:a', 'pcm_f32le', outPath]);

  const lv = await loudness(outPath);
  const ceiling = cfg.defaults.truePeakCeiling ?? -1;
  const reduction = lv.truePeakDb != null && lv.truePeakDb > ceiling ? +(lv.truePeakDb - ceiling).toFixed(1) : 0;
  const clipLevels = await sectionLevels(outPath, {
    sections: clips.map((c) => ({ name: c.id, start: c.start, end: Math.min(total, c.start + Math.min(c.duration, 1.5)) })),
  });
  const timeline = await sectionLevels(outPath, { step: 1 });
  if (reduction > 0) {
    warnings.push(`Mix true peak ${lv.truePeakDb} dBTP is over the ${ceiling} dBTP ceiling: HyperFrames will lower the WHOLE mix by about ${reduction} dB. Limit the hot source (tools/audio/limit.mjs) or lower the clip causing the peak.`);
  }
  return {
    ok: reduction === 0,
    mixFile: outPath,
    totalSeconds: total,
    integratedLufs: lv.integratedLufs,
    truePeakDb: lv.truePeakDb,
    predictedGainReductionDb: reduction,
    clips: clips.map(({ path, ...c }, i) => ({ ...c, firstSecondsRmsDb: clipLevels[i].rmsDb, firstSecondsPeakDb: clipLevels[i].peakDb })),
    timeline: timeline.map((s) => ({ t: s.start, rmsDb: s.rmsDb, peakDb: s.peakDb })),
    warnings,
  };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const file = args._[0];
  if (!file) {
    console.error('Usage: node tools/audio/mix-check.mjs <index.html> [--out mix.wav] [--json]');
    process.exit(2);
  }
  const res = await mixCheck(file, { out: typeof args.out === 'string' ? args.out : undefined });
  if (args.json) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(`Mix: ${res.mixFile}`);
    console.log(`Integrated ${res.integratedLufs} LUFS | true peak ${res.truePeakDb} dBTP | predicted HF gain reduction ${res.predictedGainReductionDb} dB`);
    for (const c of res.clips) {
      const lvl = c.lane ? `lane ${c.lane.map((p) => p.v).join('->')}` : `vol ${c.volume}`;
      console.log(`  ${c.id.padEnd(16)} ${c.start.toFixed(2).padStart(6)}s +${c.duration.toFixed(2)}s  ${lvl.padEnd(22)} first-1.5s rms ${c.firstSecondsRmsDb} dB, peak ${c.firstSecondsPeakDb} dB`);
    }
    for (const w of res.warnings) console.log(`  WARNING: ${w}`);
    console.log(res.ok ? 'MIX OK' : 'MIX NEEDS WORK');
  }
  process.exit(res.ok ? 0 : 1);
}
