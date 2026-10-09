// rcg strips: a cast opener or closer of vertical strips, one clip per strip (learned from the
// user's marketing reference Video-54041, measured: five strips of one speaker each, cut in left
// to right about 0.53 s apart over a black frame; at the end they flash and drop out to black).
//
//   open   strip i comes in at start + i * stagger (drops 90 px and fades in over 0.22 s), all hold
//          to the end of the block
//   close  all strips come in quickly (0.08 s apart), an optional light-leak clip flashes over them
//          (screen blend), then they drop out left to right, 0.14 s apart, to black
//
// Each strip shows its clip scaled to the frame height, centred on the clip's subject (faceX of
// the source width, default 0.5). Clips are muted. A timed black ground sits under the strips.
// The strips and the leak sit in untimed wrappers that GSAP moves; the media elements carry the
// timing (a timed wrapper with a background would stay on screen for the whole edit, lesson 13bq).
//
// Usage:
//   node tools/blocks/strips.mjs --job <dir> --mode open|close --start 0 --duration 3.8
//        --clips "assets/a.mp4@0,assets/b.mp4@4.2:0.45,..." [--stagger 0.53] [--leak assets/video/leak.mp4]
//        [--z 90] [--id strips-open]
//   Clip spec: <job-relative file>@<media start s>[:<subject x 0..1>].

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { probe } from '../lib/ffmpeg.mjs';
import { rootAttrs } from './camera.mjs';

const f1 = (n) => +Number(n).toFixed(1);
const f3 = (n) => +Number(n).toFixed(3);

export function parseClips(spec) {
  return String(spec || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^(.+?)@([\d.]+)(?::([\d.]+))?$/);
    if (!m) throw new Error(`Bad clip "${s}" (want file@mediaStart[:subjectX])`);
    return { src: m[1], mediaStart: Number(m[2]), fx: m[3] != null ? Number(m[3]) : 0.5 };
  });
}

export async function applyStrips(opts) {
  const jobDir = resolve(opts.job);
  const indexPath = join(jobDir, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  const root = rootAttrs(html);
  const W = root.width;
  const H = root.height;
  const mode = opts.mode || 'open';
  if (!['open', 'close'].includes(mode)) throw new Error('--mode must be open or close');
  const S = Number(opts.start ?? 0);
  const D = Number(opts.duration);
  if (!(D > 0.5)) throw new Error('--duration (s) is required, over 0.5');
  const clips = parseClips(opts.clips);
  if (clips.length < 2) throw new Error('--clips needs at least 2 clips');
  const N = clips.length;
  const stagger = Number(opts.stagger ?? 0.53);
  const z = Number(opts.z ?? 90);
  const id = opts.id || `strips-${mode}`;
  const sw = W / N;

  // Remove an earlier run with this id.
  html = html.replace(new RegExp(`\\s*<!-- rcg:strips ${id} begin[\\s\\S]*?<!-- rcg:strips ${id} end -->`, 'g'), '');
  html = html.replace(new RegExp(`      // rcg:strips ${id} begin[\\s\\S]*?// rcg:strips ${id} end\\n`), '');

  const parts = [`\n      <div id="${id}-bg" class="clip" data-start="${f3(S)}" data-duration="${f3(D)}" data-track-index="96" style="position: absolute; inset: 0; background: #000; z-index: ${z};"></div>`];
  const tweens = [];
  for (let i = 0; i < N; i++) {
    const c = clips[i];
    if (!existsSync(join(jobDir, c.src))) throw new Error(`${c.src} not found in the job`);
    const info = await probe(join(jobDir, c.src));
    const vw = info.video.width * (H / info.video.height);
    const left = f1(sw / 2 - c.fx * vw);
    const t0 = mode === 'open' ? S + i * stagger : S + i * 0.08;
    const t1 = mode === 'open' ? S + D : S + D - (N - i) * 0.14;
    if (t1 - t0 < 0.3) throw new Error(`strip ${i + 1} would show for under 0.3 s: lower --stagger or raise --duration`);
    parts.push(`
      <div id="${id}-s${i}" style="position: absolute; left: ${f1(i * sw)}px; top: 0; width: ${f1(sw + 0.5)}px; height: ${H}px; overflow: hidden; z-index: ${z + 1}; opacity: 0;">
        <video id="${id}-v${i}" class="clip" src="${c.src}" data-start="${f3(t0)}" data-duration="${f3(t1 - t0)}" data-media-start="${f3(c.mediaStart)}" data-track-index="${100 + i}" muted playsinline style="position: absolute; left: ${left}px; top: 0; width: ${f1(vw)}px; height: ${H}px; object-fit: cover;"></video>
      </div>`);
    tweens.push(`tl.fromTo("#${id}-s${i}", { opacity: 0, y: -90 }, { opacity: 1, y: 0, duration: 0.22, ease: "power3.out", immediateRender: false }, ${f3(t0)});`);
    if (mode === 'close') tweens.push(`tl.to("#${id}-s${i}", { opacity: 0, y: 90, duration: 0.14, ease: "power2.in" }, ${f3(t1 - 0.14)});`);
    else tweens.push(`tl.set("#${id}-s${i}", { opacity: 0 }, ${f3(t1)});`);
  }
  if (mode === 'close' && opts.leak) {
    if (!existsSync(join(jobDir, opts.leak))) throw new Error(`${opts.leak} not found in the job`);
    const l0 = S + Math.min(0.4, D * 0.15);
    const ld = Math.min(1.4, D - (l0 - S) - N * 0.14);
    parts.push(`
      <div id="${id}-leakw" style="position: absolute; inset: 0; z-index: ${z + 2}; mix-blend-mode: screen; opacity: 0; pointer-events: none;">
        <video id="${id}-leak" class="clip" src="${opts.leak}" data-start="${f3(l0)}" data-duration="${f3(ld)}" data-media-start="0" data-track-index="99" muted playsinline style="position: absolute; inset: 0; width: ${W}px; height: ${H}px; object-fit: cover;"></video>
      </div>`);
    tweens.push(`tl.fromTo("#${id}-leakw", { opacity: 0 }, { opacity: 0.95, duration: ${f3(ld * 0.3)}, ease: "power1.out", immediateRender: false }, ${f3(l0)});`);
    tweens.push(`tl.to("#${id}-leakw", { opacity: 0, duration: ${f3(ld * 0.5)}, ease: "power1.in" }, ${f3(l0 + ld * 0.5)});`);
  }

  // Markup just inside the root's closing tag (on top of the edit), script before the registration.
  const rootEnd = html.lastIndexOf('</div>', html.lastIndexOf('<script>'));
  html = `${html.slice(0, rootEnd)}  <!-- rcg:strips ${id} begin (${mode}, ${N} strips, tools/blocks/strips.mjs) -->${parts.join('')}\n      <!-- rcg:strips ${id} end -->\n    ${html.slice(rootEnd)}`;
  const block = `      // rcg:strips ${id} begin (generated by tools/blocks/strips.mjs)
${tweens.map((t) => `      ${t}`).join('\n')}
      // rcg:strips ${id} end
`;
  const reg = html.lastIndexOf('window.__timelines');
  const lineStart = html.lastIndexOf('\n', reg) + 1;
  html = `${html.slice(0, lineStart)}${block}${html.slice(lineStart)}`;
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try { new vm.Script(m[1]); } catch (err) { throw new Error(`index.html script would not parse after the strips: ${err.message}`); }
  }
  writeFileSync(indexPath, html);
  return { id, mode, n: N, start: S, duration: D };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job || !a.clips || a.duration == null) {
    console.error('Usage: strips.mjs --job <dir> --mode open|close --start s --duration s --clips "file@ms[:x],..." [--stagger 0.53] [--leak file] [--z 90] [--id x]');
    process.exit(2);
  }
  const r = await applyStrips(a);
  console.log(`Strips ${r.id}: ${r.mode}, ${r.n} strips, ${r.start}-${f3(r.start + r.duration)} s`);
}
