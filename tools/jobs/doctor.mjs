// Workspace health check: config, binaries, HyperFrames plugin, Python, voice
// venv, Kokoro weights, provenance. Read-only.
//
// Usage: node tools/jobs/doctor.mjs

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from '../lib/cli.mjs';
import { loadConfig } from '../lib/config.mjs';
import { checkLedger } from '../lib/provenance.mjs';
import { findChrome } from '../fx/chrome.mjs';

function version(bin, args = ['-version']) {
  try {
    return execFileSync(bin, args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).split('\n')[0].trim();
  } catch {
    return null;
  }
}

/**
 * ffmpeg 8.1 (gyan.dev full build) leaves the last 8 columns black when it
 * converts 1080-wide yuv420p to gbrp. HyperFrames runs that conversion when it
 * extracts video frames and when it encodes, so every 1080-wide render gets a
 * black strip down the right edge. true = this binary converts correctly.
 */
export function gbrpTailOk(ffmpeg) {
  try {
    const buf = execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x808080:s=1080x16,format=yuv420p',
      '-frames:v', '1', '-vf', 'format=gbrp', '-f', 'rawvideo', '-pix_fmt', 'gbrp', '-'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    return buf[1079] > 60;
  } catch {
    return null;
  }
}

export function doctor() {
  const cfg = loadConfig({ fresh: true });
  const rows = [];
  const add = (name, ok, detail, optional = false) => rows.push({ name, ok, detail, optional });

  add('node', true, process.version);
  const ff = version(cfg.bin.ffmpeg);
  add('ffmpeg', Boolean(ff), ff || `not found (${cfg.bin.ffmpeg})`);
  const fp = version(cfg.bin.ffprobe);
  add('ffprobe', Boolean(fp), fp || `not found (${cfg.bin.ffprobe})`);
  add('hyperframes plugin', Boolean(cfg.hyperframes.launcherPath && existsSync(cfg.hyperframes.launcherPath)), cfg.hyperframes.pluginRoot || 'not found');
  const hfFf = cfg.bin.hfFfmpeg || cfg.bin.ffmpeg;
  const tail = gbrpTailOk(hfFf);
  add('ffmpeg for HyperFrames (edge test)', tail === true,
    tail === true ? `${cfg.bin.hfFfmpeg ? 'bin.hfFfmpeg' : 'PATH ffmpeg'}: 1080-wide yuv420p -> gbrp keeps the last columns`
      : tail === false ? `${hfFf}: 1080-wide yuv420p -> gbrp blanks the last 8 columns (black strip on the right of every render). Point bin.hfFfmpeg at an ffmpeg build without the bug.`
        : `could not run ${hfFf}`);
  const py = cfg.bin.python311 ? version(cfg.bin.python311, ['--version']) : null;
  add('python 3.11 (voice venv base)', Boolean(py), py || 'set bin.python311 in config/workspace.local.json', true);
  const venvOk = cfg.bin.voicePython && existsSync(cfg.bin.voicePython);
  add('voice venv', venvOk, venvOk ? cfg.bin.voicePython : 'not created yet (Phase 1)', true);
  const models = cfg.paths.models;
  const kokoro = existsSync(join(models, 'kokoro-v1.0.onnx')) && existsSync(join(models, 'voices.bin'));
  add('Kokoro weights', kokoro, kokoro ? models : 'not copied yet (Phase 1)', true);
  add('label font', Boolean(cfg.fonts?.label && existsSync(cfg.fonts.label)), cfg.fonts?.label || 'set fonts.label (contact sheet timestamps)', true);
  const mp = join(models, 'mediapipe');
  const mpFiles = ['wasm/vision_bundle.mjs', 'wasm/vision_wasm_internal.wasm', 'models/face_landmarker.task', 'models/hand_landmarker.task', 'models/selfie_segmenter.tflite'];
  const mpMissing = mpFiles.filter((f) => !existsSync(join(mp, f)));
  add('MediaPipe (rcg track, rcg matte)', !mpMissing.length, mpMissing.length ? `missing ${mpMissing.join(', ')}: copy from Adits with rcg provenance copy (docs/PROVENANCE.md)` : mp, true);
  const lyMissing = ['models/magic_touch.tflite', 'models/efficientdet_lite0.tflite'].filter((f) => !existsSync(join(mp, f)));
  add('MediaPipe (rcg layers)', !lyMissing.length, lyMissing.length ? `missing ${lyMissing.join(', ')}: copy from Adits with rcg provenance copy` : 'magic_touch + efficientdet_lite0', true);
  const ip = cfg.bin.imagePython || 'python';
  const cv = version(ip, ['-I', '-c', 'import cv2, PIL, numpy, sys; print("python", sys.version.split()[0], "opencv", cv2.__version__, "pillow", PIL.__version__)']);
  add('image python (rcg layers)', Boolean(cv), cv || `${ip}: needs OpenCV + Pillow + numpy (bin.imagePython)`, true);
  let fxBrowser = null;
  try { fxBrowser = findChrome(); } catch { /* none found */ }
  add('browser for rcg fx', Boolean(fxBrowser && fxBrowser.kind !== 'headless-shell'),
    !fxBrowser ? 'no Chrome found: set bin.fxChrome in config/workspace.local.json'
      : fxBrowser.kind === 'headless-shell' ? `${fxBrowser.path} (no WebGPU: heat-haze and blow-pixels need an installed Chrome)` : fxBrowser.path, true);
  for (const [key, p] of Object.entries(cfg.sources || {})) add(`source: ${key}`, existsSync(p), p, true);
  const prov = checkLedger();
  add('provenance ledger', prov.problems.length === 0, `${prov.entries} entries, ${prov.problems.length} problems, ${prov.drift.length} source drift`);
  return rows;
}

if (isMain(import.meta.url)) {
  const rows = doctor();
  for (const r of rows) console.log(`${r.ok ? 'OK  ' : r.optional ? 'TODO' : 'FAIL'}  ${r.name.padEnd(32)} ${r.detail}`);
  const failed = rows.filter((r) => !r.ok && !r.optional);
  console.log(failed.length ? `${failed.length} required check(s) failed` : 'Required checks pass');
  process.exit(failed.length ? 1 : 0);
}
