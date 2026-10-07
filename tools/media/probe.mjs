// Media summary for intake: streams, fps, duration, and loudness/true peak when
// there is audio. Prints JSON.
//
// Usage: node tools/media/probe.mjs <file> [--no-loudness]

import { isMain, parseArgs } from '../lib/cli.mjs';
import { loudness, probe } from '../lib/ffmpeg.mjs';

export async function probeMedia(file, { withLoudness = true } = {}) {
  const info = await probe(file);
  if (withLoudness && info.audio.length) info.loudness = await loudness(file);
  const notes = [];
  if (!info.audio.length) notes.push('No audio track: there are no spoken words to transcribe.');
  if (info.video && info.video.fps > 0 && info.video.fps < 30) {
    notes.push(`Source is ${info.video.fps.toFixed(3)} fps: slowing it below 1x will stutter. Use a freeze frame or interpolation instead.`);
  }
  if (info.loudness?.truePeakDb > -1) notes.push(`True peak ${info.loudness.truePeakDb} dBTP is above -1: limit it before mixing (tools/audio/limit.mjs).`);
  info.notes = notes;
  return info;
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  if (!args._[0]) {
    console.error('Usage: node tools/media/probe.mjs <file> [--no-loudness]');
    process.exit(2);
  }
  console.log(JSON.stringify(await probeMedia(args._[0], { withLoudness: !args['no-loudness'] }), null, 2));
}
