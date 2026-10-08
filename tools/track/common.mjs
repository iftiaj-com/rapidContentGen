// Shared plumbing for rcg track / rcg matte: frame extraction and running the vision
// harness page (library/vision/vision.*) in Chrome through the fx server.

import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { launch } from '../fx/chrome.mjs';
import { startServer } from '../fx/server.mjs';
import { loadConfig } from '../lib/config.mjs';

const exec = promisify(execFile);

/** The ffmpeg HyperFrames uses (bin.hfFfmpeg) when set: 8.1 loses the right 8 columns of 1080-wide yuv420p (lessons 16b). */
export function ffmpegBin() {
  const { bin } = loadConfig();
  return bin.hfFfmpeg || bin.ffmpeg || 'ffmpeg';
}
export const ff = (args) => exec(ffmpegBin(), ['-nostdin', '-v', 'error', '-y', ...args], { maxBuffer: 1 << 26, windowsHide: true });

/**
 * Extract untagged RGB PNG frames (Chrome colour-manages BT.709-tagged PNGs, lessons 13ab).
 * size: { width, height } exact output size (the source aspect is kept by the caller).
 */
export async function extractFrames(src, { start = 0, duration, fps, width, height }, dir) {
  mkdirSync(dir, { recursive: true });
  const args = ['-ss', String(start)];
  if (duration) args.push('-t', String(duration));
  args.push('-i', src, '-vf', `fps=${fps},scale=${width}:${height}:flags=lanczos,format=rgb24,setparams=color_primaries=unknown:color_trc=unknown:colorspace=unknown`,
    '-start_number', '1', join(dir, '%06d.png'));
  await ff(args);
  return readdirSync(dir).filter((f) => f.endsWith('.png')).length;
}

/** Run the vision page for the job in workDir; returns the final window.__vision state. */
export async function runVisionPage(workDir, job, { onProgress, timeoutMs } = {}) {
  writeFileSync(join(workDir, 'job.json'), JSON.stringify(job));
  const srv = await startServer(workDir);
  const browser = await launch({ width: 640, height: 640 });
  const consoleLines = [];
  browser.on((m) => {
    if (consoleLines.length >= 20) return;
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      consoleLines.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      consoleLines.push(`exception: ${(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 300)}`);
    }
  });
  try {
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${srv.port}/lib/vision/vision.html` });
    let state = null;
    let last = -1;
    const deadline = Date.now() + (timeoutMs || Math.max(180000, job.frames * 3000));
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 400));
      state = await browser.evaluate('JSON.stringify(window.__vision || null)').then(JSON.parse).catch(() => null);
      if (!state) continue;
      if (state.frame !== last && onProgress) { onProgress(state.frame, job.frames); last = state.frame; }
      if (state.state === 'done' || state.state === 'error') break;
    }
    if (!state || state.state !== 'done') {
      throw new Error(`vision ${job.task} ${state?.state || 'timed out'} at frame ${state?.frame ?? '?'}: ${state?.error || ''}\nlog: ${(state?.log || []).join(' | ')}\nconsole: ${consoleLines.join(' | ')}`);
    }
    return { ...state, console: consoleLines, browser: browser.chrome.kind };
  } finally {
    await browser.close();
    await srv.close();
  }
}
