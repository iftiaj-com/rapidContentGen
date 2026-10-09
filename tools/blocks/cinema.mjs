// rcg cinema: Adits Cinema Frames (Global Visuals card) as a HyperFrames block. Letterbox bars
// (Frame UD: top + bottom) and pillarbox bars (Frame LR: left + right) with Adits' colour,
// position and curve, drawn with the same path as core/main.js _drawCinemaFrames() (4883-4922):
//   UD: barH = pos% x H; curveOffset = curve/100 x barH x 0.75 (positive bulges into the picture);
//       top bar M0,0 L W,0 L W,barH Q W/2,(barH + curveOffset) 0,barH, the bottom one mirrored
//   LR: barW = pos% x W; the same with x and y swapped
// What changed: Adits draws the bars on the canvas every frame while the toggle is on; here they
// are an SVG over the composition, shown in time windows (--show), so they sit over the footage,
// effects and captions (Adits draws them over everything too). Midground (Adits draws the bars
// between the background and the PnP / 3D foreground) is --behind <pnp>: the bars go under the
// cut-out. Hold (pins Anamorphic 3D parallax and background opacity), Always On (keeps the bars
// through Universal Glitch flash frames) and Sync (a slider mirror in the UI) have nothing to act
// on here.
//
// Usage:
//   node tools/blocks/cinema.mjs --job <dir> [--ud] [--lr] [--id cf1] [--show "a-b,c-d"]
//        [--color "#000000"] [--pos 20] [--curve 0]            (Frame UD; Adits defaults)
//        [--lr-color "#000000"] [--lr-pos 20] [--lr-curve 0]   (Frame LR)
//        [--z 90 | --behind p1]
//   node tools/blocks/cinema.mjs --job <dir> --remove <id>
//   --ud / --lr  which bars (neither given: --ud)
//   --pos        bar depth, % of the frame height (UD) or width (LR), 0-100 (Adits slider; past 50
//                the two bars overlap and cover the frame)
//   --curve      -100..100: positive curves the inner edge into the picture, negative away from it
//   --show       visible windows in composition seconds (default: the whole composition)

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { rootAttrs } from './camera.mjs';
import { applyLayer } from './layer.mjs';

const f3 = (n) => +Number(n).toFixed(3);
const f2 = (n) => +Number(n).toFixed(2);

function windows(spec, duration) {
  if (spec == null || spec === true) return [[0, duration]];
  return String(spec).split(',').map((w) => {
    const [a, b] = w.split('-').map(Number);
    if (!(b > a) || a < 0) throw new Error(`Bad --show window "${w}" (use a-b in seconds)`);
    return [a, Math.min(b, duration)];
  });
}

function colour(v, flag) {
  const c = String(v ?? '#000000');
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c)) throw new Error(`${flag} must be a hex colour like #000000`);
  return c;
}

/** The two bar paths, in the composition's pixels (main.js 4883-4922). */
export function barPaths(kind, { W, H, pos = 20, curve = 0 }) {
  const posPct = Number(pos) / 100;
  const curveVal = Number(curve);
  if (!(posPct >= 0 && posPct <= 1)) throw new Error('--pos must be 0-100 (% of the frame)');
  if (!(curveVal >= -100 && curveVal <= 100)) throw new Error('--curve must be -100..100');
  if (kind === 'ud') {
    const barH = posPct * H;
    const c = (curveVal / 100) * barH * 0.75;
    return [
      `M0 0 L${W} 0 L${W} ${f2(barH)} Q${f2(W / 2)} ${f2(barH + c)} 0 ${f2(barH)} Z`,
      `M0 ${H} L${W} ${H} L${W} ${f2(H - barH)} Q${f2(W / 2)} ${f2(H - barH - c)} 0 ${f2(H - barH)} Z`,
    ];
  }
  const barW = posPct * W;
  const c = (curveVal / 100) * barW * 0.75;
  return [
    `M0 0 L0 ${H} L${f2(barW)} ${H} Q${f2(barW + c)} ${f2(H / 2)} ${f2(barW)} 0 Z`,
    `M${W} 0 L${W} ${H} L${f2(W - barW)} ${H} Q${f2(W - barW - c)} ${f2(H / 2)} ${f2(W - barW)} 0 Z`,
  ];
}

function strip(html, id) {
  return html
    .replace(new RegExp(`\\s*<!-- rcg:cinema ${id} begin[\\s\\S]*?<!-- rcg:cinema ${id} end -->`, 'g'), '')
    .replace(new RegExp(`      // rcg:cinema ${id} begin[\\s\\S]*?// rcg:cinema ${id} end\\n`), '')
    .replace(new RegExp(`\\n      #${id} \\{ z-index: [^}]*\\}`), '');
}

function checkScripts(html) {
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try { new vm.Script(m[1]); } catch (err) { throw new Error(`index.html script would not parse after rcg cinema: ${err.message}`); }
  }
}

export function removeCinema(opts) {
  const indexPath = join(resolve(opts.job), 'index.html');
  const html = readFileSync(indexPath, 'utf8');
  const id = String(opts.remove);
  const out = strip(html, id);
  checkScripts(out);
  writeFileSync(indexPath, out);
  return { id, removed: out !== html };
}

export function applyCinema(opts) {
  const jobDir = resolve(opts.job);
  const indexPath = join(jobDir, 'index.html');
  const root = rootAttrs(readFileSync(indexPath, 'utf8'));
  const W = root.width;
  const H = root.height;
  const id = String(opts.id || 'cf1');
  const ud = Boolean(opts.ud) || !opts.lr;
  const paths = [];
  if (ud) for (const d of barPaths('ud', { W, H, pos: opts.pos ?? 20, curve: opts.curve ?? 0 })) paths.push([colour(opts.color, '--color'), d]);
  if (opts.lr) for (const d of barPaths('lr', { W, H, pos: opts['lr-pos'] ?? 20, curve: opts['lr-curve'] ?? 0 })) paths.push([colour(opts['lr-color'], '--lr-color'), d]);
  const wins = windows(opts.show, root.duration);

  let html = strip(readFileSync(indexPath, 'utf8'), id);
  const markup = `  <!-- rcg:cinema ${id} begin (tools/blocks/cinema.mjs; regenerate instead of editing) -->
      <svg id="${id}" class="rcg-cinema" aria-hidden="true" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0;">
${paths.map(([c, d]) => `        <path fill="${c}" d="${d}"/>`).join('\n')}
      </svg>
      <!-- rcg:cinema ${id} end -->
    `;
  // Just inside the root's closing tag: the last </div> before the main timeline script.
  const rootEnd = html.lastIndexOf('</div>', html.lastIndexOf('<script>'));
  html = `${html.slice(0, rootEnd)}${markup}${html.slice(rootEnd)}`;
  const block = `      // rcg:cinema ${id} begin (generated by tools/blocks/cinema.mjs)
${wins.map(([a, b]) => `      tl.set("#${id}", { opacity: 1 }, ${f3(a)});${b < root.duration ? `\n      tl.set("#${id}", { opacity: 0 }, ${f3(b)});` : ''}`).join('\n')}
      // rcg:cinema ${id} end
`;
  const reg = html.lastIndexOf('window.__timelines');
  const lineStart = html.lastIndexOf('\n', reg) + 1;
  html = `${html.slice(0, lineStart)}${block}${html.slice(lineStart)}`;
  checkScripts(html);
  writeFileSync(indexPath, html);
  // Stacking through the managed layer rules, so rcg layer can move it later (Midground = --behind).
  const layer = applyLayer({ job: jobDir, id, ...(opts.behind ? { behind: opts.behind } : { z: opts.z ?? 90 }) });
  return { id, bars: paths.length, windows: wins, z: layer.z };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (a.job && a.remove) {
    const r = removeCinema(a);
    console.log(r.removed ? `Removed cinema frame ${r.id}` : `No cinema frame ${r.id} in index.html`);
    process.exit(0);
  }
  if (!a.job) {
    console.error('Usage: cinema.mjs --job <dir> [--ud] [--lr] [--id cf1] [--show "a-b"] [--color #000] [--pos 20] [--curve 0] [--lr-color #000] [--lr-pos 20] [--lr-curve 0] [--z 90 | --behind p1]\n       cinema.mjs --job <dir> --remove <id>');
    process.exit(2);
  }
  const r = applyCinema(a);
  console.log(`Cinema frame ${r.id}: ${r.bars} bars, z-index ${r.z}, shown ${r.windows.map(([s, e]) => `${s}-${e}`).join(', ')} s`);
}
