// Post-plan step for this job (re-run after `rcg split-screen plan`, before `build`):
// 1. the presenter source has burned-in captions from 82% of its height: mask them (maskBelow 0.80);
// 2. captions in the collage card style (seam y 1236 in split windows, y 1440 over full-frame graphics);
// 3. the sync graphics (jobs/2026-10-08-script-1l-graphics) play muted here, so their sounds are
//    carried over: every SFX audio element of that job becomes a split-plan sfx entry (same landing);
// 4. collage titles on the full-frame presenter windows, in the planner's face-safe title boxes.
// Run from the repo root: node jobs/2026-10-08-script-1l-split/data/post-plan.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const job = join(here, '..');
const graphics = join(job, '..', '2026-10-08-script-1l-graphics');
const root = join(job, '..', '..');
const P = JSON.parse(readFileSync(join(here, 'split-plan.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'library', 'sfx', 'manifest.json'), 'utf8'));
const r3 = (n) => Math.round(n * 1000) / 1000;

// 1.
P.presenter.maskBelow = 0.8;
P.presenter.maskStyle = 'paper'; // a torn collage paper strip over the burned-in captions (a blur left them readable)
P.presenter.maskAfull = 1530; // at the wide a-full framing below (z 1: source rows 883-936 land at y 1570-1664)
// 1b. The full-frame presenter windows: the planner's face camera (z 1.6-1.7) is far too tight on
//     this 16:9 close-up (forehead cut, burned-in captions huge). One steady wide cue per window.
for (const w of P.windows.filter((x) => x.layout === 'afull')) w.cues = [`${w.start}:face.punch:z=1:x=0.5:y=0.4:k=1:d=0:ease=linear`];
// 2.
for (const w of P.windows) if (w.caption) { w.caption.style = 'collage'; w.caption.mode = w.layout === 'bfull' ? 'phrase' : '2word'; w.caption.y = w.layout === 'bfull' ? 1440 : 1236; }
// 3.
const byFile = Object.fromEntries(Object.entries(manifest).filter(([k]) => !k.startsWith('$')).map(([k, v]) => [v.file, { key: k, ...v }]));
const html = readFileSync(join(graphics, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const carried = [];
for (const m of html.matchAll(/<audio\b[^>]*\bid="([^"]+-sfx\d*)"[^>]*>/g)) {
  const a = (n) => m[0].match(new RegExp(`${n}="([^"]*)"`))?.[1];
  const e = byFile[a('src').split('/').pop()];
  if (!e) throw new Error(`no manifest entry for ${a('src')}`);
  carried.push({ id: `g-${m[1]}`, name: e.key, landing: r3(Number(a('data-start')) + (e.peakS ?? e.crestStartS ?? 0)), volume: Number(a('data-volume')) });
}
P.sfx = [...(P.sfx || []).filter((s) => !s.id.startsWith('g-')), ...carried];
writeFileSync(join(here, 'split-plan.json'), `${JSON.stringify(P, null, 2)}\n`);

// 4.
const win = (i) => P.windows.find((w) => w.i === i);
const [w7, w10, w16] = [7, 10, 16].map(win);
const TC = 'tactile-collage';
const items = [
  { style: TC, component: 'paper-card', id: 'title-w7', start: r3(w7.start + 0.07), duration: r3(w7.end - w7.start - 0.07), text: 'The *remaining*|profit', y: 1370, w: 760, h: 250, size: 70, from: 'below', exit: 'out' },
  { style: TC, component: 'paper-card', id: 'title-w10', start: r3(w10.start + 0.06), duration: r3(w10.end - w10.start - 0.06), variant: 'note', text: '*Two* things|most people miss', y: 1370, w: 760, h: 250, size: 66, from: 'below', exit: 'out' },
  { style: TC, component: 'paper-card', id: 'title-w16a', start: r3(w16.start + 0.05), duration: 0.9, text: 'But only when it\'s', y: 1386, w: 720, h: 200, size: 64, from: 'below', exit: 'out' },
  { style: TC, component: 'stamp', id: 'title-w16b', start: 76.76, duration: r3(P.duration - 76.76), text: 'STRUCTURED CORRECTLY', y: 1370, w: 780, h: 220, size: 70, colour: 'resolve', rotate: -4, exit: 'out' },
];
writeFileSync(join(here, 'style-plan.json'), `${JSON.stringify({ style: TC, items }, null, 2)}\n`);
console.log(`maskBelow 0.8; ${P.windows.filter((w) => w.caption).length} caption windows -> collage; ${carried.length} SFX carried from the graphics; ${items.length} collage titles.`);
