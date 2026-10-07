// Measure every SFX file: real duration, onset, loudest moment, loudness and true
// peak. Writes library/sfx/manifest.json. HyperFrames' own manifest text can be
// wrong (riser.mp3 says it peaks at the end; it peaks at 3.04 s), so jobs place
// sounds from these measurements, never from descriptions.
//
// Usage: node tools/audio/measure-sfx.mjs

import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from '../lib/cli.mjs';
import { readJson, ROOT } from '../lib/config.mjs';
import { decodeMono, loudness } from '../lib/ffmpeg.mjs';

export async function measureSfx(dir = join(ROOT, 'library', 'sfx')) {
  const hf = readJson(join(dir, 'manifest.hyperframes.json'), {});
  const out = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort()) {
    const sr = 8000;
    const pcm = await decodeMono(join(dir, file), sr);
    const hop = 80; // 10 ms
    const env = [];
    for (let i = 0; i < pcm.length; i += hop) {
      let s = 0;
      const end = Math.min(pcm.length, i + hop);
      for (let j = i; j < end; j++) s += pcm[j] * pcm[j];
      env.push(Math.sqrt(s / Math.max(1, end - i)));
    }
    // Smooth over 100 ms so "peak" is the loudest stretch (the crest a hit
    // should land on), not a single 10 ms spike.
    const smooth = env.map((_, i) => {
      const a = Math.max(0, i - 5);
      const b = Math.min(env.length, i + 5);
      let s = 0;
      for (let j = a; j < b; j++) s += env[j];
      return s / (b - a);
    });
    const max = Math.max(...env);
    // Crest = the stretch within 1.5 dB of the loudest smoothed level. Many
    // sounds hold a plateau (the riser sits within ~1 dB from 3.0 to 3.5 s), so
    // a single "peak" time is misleading. Line the crest START up with the hit.
    const smax = Math.max(...smooth);
    const floor = smax * Math.pow(10, -1.5 / 20);
    const crestStart = smooth.findIndex((v) => v >= floor);
    let crestEnd = crestStart;
    while (crestEnd + 1 < smooth.length && smooth[crestEnd + 1] >= floor * 0.85) crestEnd++;
    const peakIdx = smooth.indexOf(smax);
    const onsetIdx = env.findIndex((v) => v > max * 0.3);
    const lastIdx = env.length - 1 - [...env].reverse().findIndex((v) => v > max * 0.01);
    const lv = await loudness(join(dir, file));
    const id = file.replace(/\.mp3$/, '');
    out[id] = {
      file,
      durationS: +(pcm.length / sr).toFixed(2),
      onsetS: +((onsetIdx * hop) / sr).toFixed(2),
      crestStartS: +((crestStart * hop) / sr).toFixed(2),
      crestEndS: +((crestEnd * hop) / sr).toFixed(2),
      peakS: +((peakIdx * hop) / sr).toFixed(2),
      audibleEndS: +((lastIdx * hop) / sr).toFixed(2),
      integratedLufs: lv.integratedLufs,
      truePeakDb: lv.truePeakDb,
      description: hf[id]?.description || '',
      license: 'Pixabay Content License (see CREDITS.md)',
    };
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(out, null, 2) + '\n');
  return out;
}

if (isMain(import.meta.url)) {
  const res = await measureSfx();
  for (const [id, m] of Object.entries(res)) {
    console.log(`${id.padEnd(18)} dur ${String(m.durationS).padStart(5)}s onset ${String(m.onsetS).padStart(5)} crest ${m.crestStartS}-${m.crestEndS} end ${String(m.audibleEndS).padStart(5)}  ${m.integratedLufs} LUFS  TP ${m.truePeakDb}`);
  }
}
