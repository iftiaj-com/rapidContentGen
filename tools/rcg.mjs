#!/usr/bin/env node
// rapidContentGen: one entry point for every workspace tool.
//
//   node tools/rcg.mjs <command> [args]
//
// Run with no command for the list. Each command is also runnable on its own
// from its module file (see docs/capabilities.md).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, ROOT } from './lib/config.mjs';

const COMMANDS = {
  'doctor': ['tools/jobs/doctor.mjs', 'Check config, ffmpeg, HyperFrames plugin, Python and the voice venv'],
  'new-job': ['tools/jobs/new-job.mjs', 'Create jobs/<date>-<name>/ from a template with intake probe + sheets'],
  'beat-sheet': ['tools/jobs/beat-sheet.mjs', 'validate | md: check a beat-sheet.json and write the approval table'],
  'probe': ['tools/media/probe.mjs', 'Media summary + loudness/true peak + intake notes (JSON)'],
  'sheet': ['tools/media/contact-sheet.mjs', 'Labeled contact sheet, --safe draws the 9:16 no-text zones'],
  'limit': ['tools/audio/limit.mjs', 'Peak-limit music/voice to a true-peak ceiling (default -2.5 dBTP)'],
  'mix-check': ['tools/audio/mix-check.mjs', 'Rebuild a composition mix offline and predict HyperFrames gain reduction'],
  'measure-sfx': ['tools/audio/measure-sfx.mjs', 'Re-measure library/sfx onsets, crests, loudness'],
  'render': ['tools/jobs/render.mjs', 'mix-check -> HyperFrames render -> verify (+ frame sheet)'],
  'verify': ['tools/media/verify.mjs', 'Verify any rendered video'],
  'hf': ['tools/jobs/hf.mjs', 'Run the HyperFrames CLI via the plugin launcher (--cwd <job>)'],
  'provenance': ['tools/lib/provenance.mjs', 'copy | record | check | render the provenance ledger'],
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || !COMMANDS[cmd]) {
  console.log('rapidContentGen tools\n');
  for (const [name, [, desc]] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(12)} ${desc}`);
  console.log('\nUsage: node tools/rcg.mjs <command> [args]');
  process.exit(cmd ? 2 : 0);
}

const script = join(ROOT, COMMANDS[cmd][0]);
if (!existsSync(script)) {
  console.error(`Not built yet: ${COMMANDS[cmd][0]}`);
  process.exit(1);
}
loadConfig();
const child = spawn(process.execPath, [script, ...rest], { stdio: 'inherit', windowsHide: true });
child.on('close', (code) => process.exit(code ?? 1));
