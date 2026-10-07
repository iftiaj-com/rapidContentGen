// Peak-limit a music or voice file to a true-peak ceiling before it goes into a
// composition, so HyperFrames never has to lower the whole mix. Loudness is left
// almost unchanged; only short transients are caught.
//
// Usage: node tools/audio/limit.mjs <in> <out.wav> [--ceiling -2.5]

import { isMain, parseArgs } from '../lib/cli.mjs';
import { loadConfig } from '../lib/config.mjs';
import { limitAudio, loudness } from '../lib/ffmpeg.mjs';

export async function limit(src, out, ceilingDb) {
  const before = await loudness(src);
  const after = await limitAudio(src, out, { ceilingDb });
  return {
    src,
    out,
    ceilingDb,
    before,
    after: { integratedLufs: after.integratedLufs, lra: after.lra, truePeakDb: after.truePeakDb },
    loudnessChangeLu: before.integratedLufs != null && after.integratedLufs != null
      ? +(after.integratedLufs - before.integratedLufs).toFixed(1)
      : null,
  };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const [src, out] = args._;
  if (!src || !out) {
    console.error('Usage: node tools/audio/limit.mjs <in> <out.wav> [--ceiling -2.5]');
    process.exit(2);
  }
  const ceiling = args.ceiling != null ? Number(args.ceiling) : loadConfig().defaults.musicLimitDb;
  const res = await limit(src, out, ceiling);
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.after.truePeakDb != null && res.after.truePeakDb > ceiling + 0.1 ? 1 : 0);
}
