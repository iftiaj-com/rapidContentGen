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
  'voice': ['tools/voice/voice_cli.py', 'Voiceover (Kokoro, 54 voices) + 33 voice effects + word timings -> audio_meta.json (Python venv)'],
  'probe': ['tools/media/probe.mjs', 'Media summary + loudness/true peak + intake notes (JSON)'],
  'sheet': ['tools/media/contact-sheet.mjs', 'Labeled contact sheet, --safe draws the 9:16 no-text zones'],
  'limit': ['tools/audio/limit.mjs', 'Peak-limit music/voice to a true-peak ceiling (default -2.5 dBTP)'],
  'level': ['tools/audio/level.mjs', 'Set integrated loudness (static gain) then limit peaks; --dir levels every WAV in a folder'],
  'captions': ['tools/blocks/captions.mjs', 'Caption track (Adits styles) from word timings -> HyperFrames sub-composition'],
  'title': ['tools/blocks/title.mjs', 'Kinetic title card (slam, stagger-up, kinetic-pop, type-on) -> HyperFrames sub-composition'],
  'shader': ['tools/blocks/shader.mjs', 'AditsShaders object (166) as an audio-reactive HyperFrames layer (fill or square)'],
  'beatflash': ['tools/blocks/beatflash.mjs', 'Adits beat-flash words (bass/mid/treble or kick/snare/hat) -> HyperFrames sub-composition'],
  'camera': ['tools/blocks/camera.mjs', '46 Adits camera moves on footage (layered cues, whip transitions, kick shake); --list'],
  'three': ['tools/blocks/three.mjs', 'Procedural 3D scene (orb/knot/crystal/rings) with camera-move cues and music reactivity'],
  'fx': ['tools/fx/fx.mjs', 'Adits footage effects and 3D environments rendered offline into a clip (unmodified code in a headless-Chrome harness); --list'],
  'ramp': ['tools/blocks/ramp.mjs', 'Speed ramp on a footage clip as a rate lane: Adits audio speed sync (min/max) or explicit points; refuses < 1x'],
  'recipe': ['tools/recipes/recipe.mjs', 'Edit recipes: list | show | plan (beat-sheet draft locked to the beat grid) | commands | build'],
  'assemble': ['tools/jobs/assemble.mjs', 'Build index.html from the beat sheet: shots, card frames, black cards, music + duck, voice, SFX, flashes, cameras, ramps'],
  'flythrough': ['tools/blocks/flythrough.mjs', 'flowEditor camera flythrough over image/video cards (layouts, path styles, entrances, beat snap, transition sounds); --list'],
  'analyze': ['tools/audio/analyze.mjs', 'Music -> per-frame audio table (bands, onsets, kicks) + seekable shader clock'],
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
const cfg = loadConfig();
let bin = process.execPath;
if (script.endsWith('.py')) {
  bin = cfg.bin.voicePython;
  if (!bin || !existsSync(bin)) {
    console.error('Voice venv not found. Create it (see tools/voice/requirements.txt) or run `rcg doctor`.');
    process.exit(1);
  }
}
const child = spawn(bin, [script, ...rest], {
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
});
child.on('close', (code) => process.exit(code ?? 1));
