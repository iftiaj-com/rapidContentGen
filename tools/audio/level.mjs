// Set an audio file's integrated loudness (static gain), then limit its peaks.
// Use for voiceover lines so speech sits at a known level before mixing.
//
// Usage: node tools/audio/level.mjs <in> <out.wav> [--lufs -14] [--ceiling -2]
//        node tools/audio/level.mjs --dir <folder> [--lufs -14]   (every .wav in place, *.wav -> *.wav)

import { readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { levelAudio } from '../lib/ffmpeg.mjs';

export async function levelDir(dir, opts) {
  const results = [];
  for (const f of readdirSync(dir).filter((x) => x.toLowerCase().endsWith('.wav') && !x.includes('.leveled.'))) {
    const src = join(dir, f);
    const tmp = join(dir, f.replace(/\.wav$/i, '.leveled.wav'));
    const res = await levelAudio(src, tmp, opts);
    renameSync(tmp, src);
    results.push({ ...res, out: src });
  }
  return results;
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const opts = { lufs: a.lufs != null ? Number(a.lufs) : -14, ceilingDb: a.ceiling != null ? Number(a.ceiling) : -2 };
  let results;
  if (typeof a.dir === 'string') results = await levelDir(a.dir, opts);
  else {
    const [src, out] = a._;
    if (!src || !out) {
      console.error('Usage: level.mjs <in> <out.wav> [--lufs -14] [--ceiling -2] | --dir <folder>');
      process.exit(2);
    }
    results = [await levelAudio(src, out, opts)];
  }
  for (const r of results) {
    console.log(`${r.out}: ${r.before.integratedLufs} -> ${r.after.integratedLufs} LUFS (gain ${r.gainDb > 0 ? '+' : ''}${r.gainDb} dB), true peak ${r.after.truePeakDb} dBTP`);
  }
}
