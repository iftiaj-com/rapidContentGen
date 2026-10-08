// rcg target: effect target selection (Adits "Effects Target", pnpApplyTo bg|fg, main.js
// 9147-9206), switchable during the edit (interchange background and foreground).
//
//   bg window: the effect clip (rcg fx, whole frame) over the footage, and the clean subject
//              cut-out (rcg matte) over it: the effect shows on the background only.
//   fg window: the effect clip masked to the subject (rcg fx --matte: <clip>-fg.webm) over
//              everything: the effect shows on the subject only.
// Each layer is an rcg pnp layer, so it follows the shot's camera and fades with transitions.
//
// Usage:
//   node tools/blocks/target.mjs --job <dir> --base "#v4" --fx assets/fx/ghost-s4.mp4 --fx-start 12.4
//        --cutout assets/matte/v1-fg.webm [--matte-start 0] --windows "11.4-12.4:bg,12.4-13.4:fg" [--id t4]
//   --fx        the whole-frame effect clip; its subject-only twin is <fx without .mp4>-fg.webm
//   --fx-start  the source time the effect clip starts at (rcg fx --start)
//   --cutout    the subject cut-out for bg windows (rcg matte)

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { applyPnp } from './pnp.mjs';

export function applyTarget(opts) {
  const id = opts.id || 'target';
  const jobDir = resolve(opts.job);
  const fgClip = String(opts.fx).replace(/\.\w+$/, '-fg.webm');
  const windows = String(opts.windows || '').split(',').map((w) => {
    const [range, where] = w.split(':');
    const [a, b] = range.split('-').map(Number);
    if (!(b > a) || !['bg', 'fg'].includes(where)) throw new Error(`Bad window "${w}" (a-b:bg or a-b:fg)`);
    return { a, b, where };
  });
  if (!windows.length) throw new Error('--windows "a-b:bg,c-d:fg" is required');
  const bg = windows.filter((w) => w.where === 'bg').map((w) => `${w.a}-${w.b}`).join(',');
  const fg = windows.filter((w) => w.where === 'fg').map((w) => `${w.a}-${w.b}`).join(',');
  const common = { job: opts.job, base: opts.base, enter: 'none', exit: 'none' };
  const out = [];
  if (bg) {
    if (!opts.cutout) throw new Error('bg windows need --cutout (the subject cut-out from rcg matte)');
    out.push(applyPnp({ ...common, id: `${id}-bg`, cutout: opts.fx, 'matte-start': opts['fx-start'], z: 5, show: bg }));
    out.push(applyPnp({ ...common, id: `${id}-subj`, cutout: opts.cutout, 'matte-start': opts['matte-start'] || 0, z: 30, show: bg }));
  }
  if (fg) {
    if (!existsSync(resolve(jobDir, fgClip))) throw new Error(`Missing ${fgClip}: render the effect with rcg fx --matte <cut-out> --apply both`);
    out.push(applyPnp({ ...common, id: `${id}-fg`, cutout: fgClip, 'matte-start': opts['fx-start'], z: 35, show: fg }));
  }
  return { id, windows, layers: out.map((l) => `${l.id} (z ${l.z})`) };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job || !a.base || !a.fx || a['fx-start'] == null || !a.windows) {
    console.error('Usage: target.mjs --job <dir> --base "#v1" --fx assets/fx/x.mp4 --fx-start s --cutout assets/matte/v1-fg.webm --windows "a-b:bg,c-d:fg" [--matte-start 0] [--id t1]');
    process.exit(2);
  }
  const r = applyTarget(a);
  console.log(`Effect target ${r.id}: ${r.windows.map((w) => `${w.a}-${w.b} ${w.where}`).join(', ')}; layers ${r.layers.join(', ')}`);
}
