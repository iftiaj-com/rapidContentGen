// Labeled contact sheet of a video, optionally with the no-text safe zones drawn
// in red (bottom 20% and the right-edge button column for Reels/Shorts/TikTok).
//
// Usage:
//   node tools/media/contact-sheet.mjs <video> <out.png> [--every 0.5 | --at 1,2.5,4] [--cols 7] [--safe] [--width 270]

import { isMain, numList, parseArgs } from '../lib/cli.mjs';
import { contactSheet, probe } from '../lib/ffmpeg.mjs';

export const SAFE_VERTICAL = { bottom: 0.2, right: 180 };

export async function makeSheet(file, out, { every, at, cols = 7, safe = false, width = 270 } = {}) {
  let times = at ? numList(at) : null;
  if (!times) {
    const { duration } = await probe(file);
    const step = Number(every || Math.max(0.5, duration / 14));
    times = [];
    for (let t = 0; t < duration - 0.02; t += step) times.push(+t.toFixed(3));
  }
  await contactSheet(file, out, { times, cols: Number(cols), thumbWidth: Number(width), safe: safe ? SAFE_VERTICAL : null });
  return { out, times };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const [file, out] = args._;
  if (!file || !out) {
    console.error('Usage: node tools/media/contact-sheet.mjs <video> <out.png> [--every 0.5 | --at 1,2,3] [--cols 7] [--safe] [--width 270]');
    process.exit(2);
  }
  const res = await makeSheet(file, out, { every: args.every, at: args.at, cols: args.cols, safe: Boolean(args.safe), width: args.width });
  console.log(`Sheet: ${res.out} (${res.times.length} frames)`);
}
