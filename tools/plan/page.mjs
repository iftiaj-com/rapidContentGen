// Read a job's composition the way plan check needs it: the root's size and duration, every
// timed element (composition hosts, video, audio, img with data-start), and the on-screen box
// of a block's text, from the CSS its generator wrote.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { rootAttrs } from '../blocks/camera.mjs';

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const num = (tag, name) => { const v = attr(tag, name); return v == null || v === '' ? null : Number(v); };

/** { root: {width, height, duration}, elements: [{ id, tag, src, start, duration, mediaStart, track, compositionSrc }] } */
export function readPage(html) {
  const root = rootAttrs(html);
  const elements = [];
  for (const m of html.matchAll(/<(div|video|audio|img)\b[^>]*\bdata-start="[^"]*"[^>]*>/gi)) {
    const tag = m[0];
    if (/data-composition-id="main"/.test(tag)) continue;
    elements.push({
      id: attr(tag, 'id') || null,
      tag: m[1].toLowerCase(),
      src: attr(tag, 'src') || null,
      start: num(tag, 'data-start') ?? 0,
      duration: num(tag, 'data-duration'),
      mediaStart: num(tag, 'data-media-start') ?? 0,
      track: num(tag, 'data-track-index'),
      compositionSrc: attr(tag, 'data-composition-src') || null,
      openTag: tag,
    });
  }
  return { root, elements };
}

/**
 * The text box of a generated block: the first absolutely placed rule in its composition's style
 * with left, width, top and height in px (captions .grp, title -card, beatflash -stage, style
 * components). null when the composition has none (shaders, 3D, full-frame layers).
 */
export function textBox(compositionHtml) {
  const style = compositionHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
  for (const rule of style.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sel = rule[1].trim();
    if (sel === '#root' || !/position:\s*absolute/.test(rule[2])) continue;
    const px = (p) => Number(rule[2].match(new RegExp(`(?:^|[;\\s])${p}:\\s*(-?[\\d.]+)px`))?.[1]);
    const box = { x: px('left'), y: px('top'), w: px('width'), h: px('height'), selector: sel };
    if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) continue;
    // Captions lay each group out in a box four lines tall around CENTER_Y; their text reaches
    // 1.6 x SIZE either side, the rule rcg captions itself applies to the bottom zone.
    const cy = Number(compositionHtml.match(/\bCENTER_Y = (-?[\d.]+)/)?.[1]);
    const size = Number(compositionHtml.match(/\bSIZE = ([\d.]+)/)?.[1]);
    if (Number.isFinite(cy) && Number.isFinite(size)) return { ...box, y: Math.round(cy - 1.6 * size), h: Math.round(3.2 * size) };
    return box;
  }
  return null;
}

/** sha256 of index.html plus every compositions/*.html (the page a replay must reproduce). */
export function pageSha(job) {
  const h = createHash('sha256');
  const index = join(job, 'index.html');
  h.update(existsSync(index) ? readFileSync(index) : '');
  const dir = join(job, 'compositions');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.html')).sort()) {
      h.update(`\u0000${f}\u0000`);
      h.update(readFileSync(join(dir, f)));
    }
  }
  return h.digest('hex');
}
