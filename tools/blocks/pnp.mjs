// rcg pnp: a PNP layer (Adits "PNP Mode", core/main.js 9146-9216): the same footage again on
// top of the background, with ITS background removed (the rcg matte cut-out). Adits draws the
// PnP pixel-aligned over Main at an opacity; this adds what Adits lacks: a position / scale /
// rotation offset (the side copy of the subject), a media-time offset (a different moment of
// the clip), filters, show windows with entrances and exits, and following the base shot's
// camera so an aligned cut-out stays on the subject through zooms and whips.
//
// Layers: anything between the footage and the PNP sits "behind the subject" (rcg layer).
//
// Usage:
//   node tools/blocks/pnp.mjs --job <dir> --base "#v1" --cutout assets/matte/v1-fg.webm --id p1
//        [--matte-start 0] [--show "a-b,c-d"] [--follow "#w1"|none] [--z 30]
//        [--x 0] [--y 0] [--scale 1] [--rotate 0] [--flip] [--media-offset 0]
//        [--opacity 1] [--filter "grayscale(1) brightness(0.85)"]
//        [--enter fade|blocks|scale|none] [--exit fade|blocks|none] [--enter-d 0.4] [--exit-d 0.3] [--seed 1]
//   --base        the footage clip the cut-out was made from (its timing and layout are copied)
//   --matte-start the source time the cut-out begins at (rcg matte --start; default 0)
//   --show        visible windows in composition time (default: the whole base clip)
//   --follow      the camera wrapper to move with (default: the base clip's wrapper if a camera
//                 block targets it); "none" keeps the cut-out still
//   --x/--y       offset in frame fractions (0.25 = a quarter of the frame to the right/down)
//   --media-offset seconds: show another moment of the clip (negative = earlier)

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { elementSpan, rootAttrs } from './camera.mjs';

const f3 = (n) => +Number(n).toFixed(3);

function parseWindows(spec, fallback) {
  if (!spec) return [fallback];
  return String(spec).split(',').map((w) => {
    const [a, b] = w.split('-').map(Number);
    if (!(b > a)) throw new Error(`Bad --show window "${w}" (use a-b in seconds)`);
    return [a, b];
  });
}

export function applyPnp(opts) {
  const jobDir = resolve(opts.job);
  const indexPath = join(jobDir, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  const root = rootAttrs(html);
  const id = opts.id || 'p1';
  if (!/^[a-z][\w-]*$/i.test(id)) throw new Error('--id must be a plain id like p1');
  const baseId = String(opts.base || '').replace(/^#/, '');
  const baseTag = (html.match(new RegExp(`<video\\b[^>]*\\bid="${baseId}"[^>]*>`)) || [])[0];
  if (!baseTag) throw new Error(`No <video id="${baseId}"> in index.html (--base)`);
  if (!opts.cutout) throw new Error('--cutout assets/matte/<name>-fg.webm (rcg matte) is required');
  const attr = (n) => baseTag.match(new RegExp(`\\s${n}="([^"]*)"`))?.[1];
  const start = Number(attr('data-start') || 0);
  const dur = Number(attr('data-duration'));
  const mediaStart = Number(attr('data-media-start') || 0);
  if (!(dur > 0)) throw new Error(`#${baseId} needs data-duration`);
  const mediaOffset = Number(opts['media-offset'] || 0);
  const cutMediaStart = f3(mediaStart - Number(opts['matte-start'] || 0) + mediaOffset);
  if (cutMediaStart < 0) throw new Error(`The cut-out would start before its first frame (media start ${cutMediaStart}); check --matte-start / --media-offset`);
  const style = attr('style'); // the base layout (rcg camera's uncrop), so the cut-out lines up
  const z = Number(opts.z ?? 30);
  const windows = parseWindows(opts.show, [start, start + dur]);
  const track = Number(opts.track ?? 60);
  // Clip timing. An aligned cut-out keeps the base clip's timing: HyperFrames decodes both from
  // the same start, while a later start lands a frame off (its remove-background notes). An
  // offset copy (moved, scaled or another moment) needs no frame lock, so it spans only its
  // show windows: less to decode, and no duplicate media entry next to an aligned PNP.
  const aligned = !mediaOffset && !Number(opts.x || 0) && !Number(opts.y || 0) && Number(opts.scale ?? 1) === 1 && !Number(opts.rotate || 0) && !opts.flip;
  let clipStart = start;
  let clipDur = dur;
  if (!aligned) {
    clipStart = Math.max(start, Math.min(...windows.map((w) => w[0])));
    clipDur = Math.min(start + dur, Math.max(...windows.map((w) => w[1]))) - clipStart;
  }
  const clipMedia = f3(cutMediaStart + (clipStart - start));

  // Which camera wrapper to follow: given, or the element whose camera block contains the base.
  let follow = opts.follow;
  if (!follow) {
    for (const m of html.matchAll(/window\.RCGCamPoses\[("#[\w-]+")\]/g)) {
      const sel = JSON.parse(m[1]);
      const span = elementSpan(html, sel.slice(1));
      if (span && span.inner.includes(`id="${baseId}"`)) { follow = sel; break; }
    }
  }
  if (follow === 'none') follow = null;

  const x = Number(opts.x || 0) * root.width;
  const y = Number(opts.y || 0) * root.height;
  const scale = Number(opts.scale ?? 1);
  const op = Number(opts.opacity ?? 1);
  const enter = opts.enter || 'fade';
  const exit = opts.exit || 'fade';
  const enterD = Number(opts['enter-d'] ?? 0.4);
  const exitD = Number(opts['exit-d'] ?? 0.3);
  for (const e of [enter, exit]) if (!['fade', 'blocks', 'scale', 'none'].includes(e)) throw new Error(`--enter/--exit: fade, blocks, scale or none (got ${e})`);

  const markup = `      <!-- rcg:pnp ${id} begin (tools/blocks/pnp.mjs; regenerate instead of editing) -->
      <div id="${id}-follow" class="shot rcg-pnp-follow" data-rcg="pnp" style="z-index: ${z}; pointer-events: none; transform-origin: 50% 50%;">
        <div id="${id}-wrap" class="rcg-pnp" style="position: absolute; inset: 0; opacity: 0;${opts.filter ? ` filter: ${opts.filter};` : ''}">
          <video id="${id}" class="clip" src="${opts.cutout}" data-start="${f3(clipStart)}" data-duration="${f3(clipDur)}" data-media-start="${clipMedia}" data-track-index="${track}"${style ? ` style="${style}" data-layout-allow-overflow` : ''} muted playsinline></video>
        </div>
      </div>
      <!-- rcg:pnp ${id} end -->
`;
  const markupRe = new RegExp(`      <!-- rcg:pnp ${id} begin[\\s\\S]*?<!-- rcg:pnp ${id} end -->\\n`);
  if (markupRe.test(html)) html = html.replace(markupRe, markup);
  else {
    // Right after the base clip's wrapper (or the clip itself), so later layers stack above it.
    const host = follow ? elementSpan(html, follow.slice(1)) : null;
    const at = host ? host.end : html.indexOf(baseTag) + baseTag.length;
    const lineEnd = html.indexOf('\n', at) + 1;
    html = `${html.slice(0, lineEnd)}${markup}${html.slice(lineEnd)}`;
  }

  // Show windows, entrances and exits (GSAP on the untimed wrapper, as HyperFrames needs:
  // it forces opacity 1 on active clips). Offsets are GSAP transform props on the same wrapper.
  const cols = 9;
  const rows = 16;
  const tw = [];
  tw.push(`        tl.set(wrap, { x: ${f3(x)}, y: ${f3(y)}, scaleX: ${f3(opts.flip ? -scale : scale)}, scaleY: ${f3(scale)}, rotation: ${f3(Number(opts.rotate || 0))}, opacity: 0, transformOrigin: "50% 50%" }, 0);`);
  for (const [a, b] of windows) {
    const ed = Math.min(enterD, (b - a) / 2);
    const xd = Math.min(exitD, (b - a) / 2);
    if (enter === 'none') tw.push(`        tl.set(wrap, { opacity: ${op} }, ${f3(a)});`);
    else if (enter === 'fade') tw.push(`        tl.fromTo(wrap, { opacity: 0 }, { opacity: ${op}, duration: ${f3(ed)}, ease: "power2.out", immediateRender: false }, ${f3(a)});`);
    else if (enter === 'scale') tw.push(`        tl.fromTo(wrap, { opacity: 0, scaleX: ${f3((opts.flip ? -scale : scale) * 0.85)}, scaleY: ${f3(scale * 0.85)} }, { opacity: ${op}, scaleX: ${f3(opts.flip ? -scale : scale)}, scaleY: ${f3(scale)}, duration: ${f3(ed)}, ease: "back.out(1.6)", immediateRender: false }, ${f3(a)});`);
    else tw.push(`        tl.set(wrap, { opacity: ${op} }, ${f3(a)});\n        blocks(${f3(a)}, ${f3(ed)}, true);`);
    if (exit === 'none') tw.push(`        tl.set(wrap, { opacity: 0 }, ${f3(b)});`);
    else if (exit === 'fade') tw.push(`        tl.to(wrap, { opacity: 0, duration: ${f3(xd)}, ease: "power2.in" }, ${f3(b - xd)});`);
    else if (exit === 'scale') tw.push(`        tl.to(wrap, { opacity: 0, scaleX: ${f3((opts.flip ? -scale : scale) * 0.85)}, scaleY: ${f3(scale * 0.85)}, duration: ${f3(xd)}, ease: "power2.in" }, ${f3(b - xd)});`);
    else tw.push(`        blocks(${f3(b - xd)}, ${f3(xd)}, false);\n        tl.set(wrap, { opacity: 0 }, ${f3(b)});`);
  }
  const usesBlocks = enter === 'blocks' || exit === 'blocks';
  const block = `      // rcg:pnp ${id} begin (generated by tools/blocks/pnp.mjs; regenerate instead of editing)
      (function () {
        var follow = document.getElementById(${JSON.stringify(`${id}-follow`)});
        var wrap = document.getElementById(${JSON.stringify(`${id}-wrap`)});
        var FOLLOW = ${JSON.stringify(follow || null)};
        var DUR = ${root.duration};
        // Copy the base shot's camera pose (rcg camera registers it) every frame.
        function apply(t) {
          var f = FOLLOW && window.RCGCamPoses && window.RCGCamPoses[FOLLOW];
          if (!f) return;
          var c = f(t);
          follow.style.transform = c.transform;
          follow.style.filter = c.filter;
        }
        var drv = { _t: 0 };
        Object.defineProperty(drv, "t", { get: function () { return this._t; }, set: function (v) { this._t = v; apply(v); } });
        tl.to(drv, { t: DUR, duration: DUR, ease: "none" }, 0);
        apply(0);${usesBlocks ? `
        // Block build: a ${cols} x ${rows} grid of cells revealed (or hidden) in a seeded order.
        var W = ${root.width}, H = ${root.height}, COLS = ${cols}, ROWS = ${rows};
        var order = [];
        for (var i = 0; i < COLS * ROWS; i++) order.push(i);
        var s = ${Number(opts.seed ?? 1) >>> 0} || 1;
        function rnd() { s = (s + 0x6d2b79f5) >>> 0; var q = s; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }
        for (var j = order.length - 1; j > 0; j--) { var r = Math.floor(rnd() * (j + 1)); var tmp = order[j]; order[j] = order[r]; order[r] = tmp; }
        function clipFor(u) {
          var n = Math.round(u * order.length);
          if (n >= order.length) return "none";
          var cw = W / COLS, ch = H / ROWS, d = "";
          for (var k = 0; k < n; k++) { var c = order[k] % COLS, rr = Math.floor(order[k] / COLS); d += "M" + (c * cw).toFixed(1) + " " + (rr * ch).toFixed(1) + "h" + cw.toFixed(1) + "v" + ch.toFixed(1) + "h-" + cw.toFixed(1) + "z"; }
          return n ? "path('" + d + "')" : "path('M0 0z')";
        }
        function blocks(at, d, inward) {
          var p = { _u: inward ? 0 : 1 };
          Object.defineProperty(p, "u", { get: function () { return this._u; }, set: function (v) { this._u = v; wrap.style.clipPath = clipFor(v); } });
          tl.fromTo(p, { u: inward ? 0 : 1 }, { u: inward ? 1 : 0, duration: d, ease: "none", immediateRender: false }, at);
          tl.set(p, { u: inward ? 1 : 0 }, at + d);
        }` : ''}
${tw.join('\n')}
      })();
      // rcg:pnp ${id} end
`;
  const blockRe = new RegExp(`      // rcg:pnp ${id} begin[\\s\\S]*?// rcg:pnp ${id} end\\n`);
  if (blockRe.test(html)) html = html.replace(blockRe, block);
  else {
    const reg = html.lastIndexOf('window.__timelines');
    const lineStart = html.lastIndexOf('\n', reg) + 1;
    html = `${html.slice(0, lineStart)}${block}${html.slice(lineStart)}`;
  }
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try { new vm.Script(m[1]); } catch (err) { throw new Error(`index.html script would not parse after inserting the PNP: ${err.message}`); }
  }
  writeFileSync(indexPath, html);
  return { id, base: `#${baseId}`, cutout: opts.cutout, mediaStart: cutMediaStart, follow, windows, z };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job || !a.base || !a.cutout) {
    console.error('Usage: pnp.mjs --job <dir> --base "#v1" --cutout assets/matte/v1-fg.webm [--id p1] [--show a-b,...] [--follow "#w1"|none] [--x 0 --y 0 --scale 1 --rotate 0 --flip] [--media-offset 0] [--opacity 1] [--filter css] [--enter fade|blocks|scale|none] [--exit ...] [--z 30]');
    process.exit(2);
  }
  const r = applyPnp(a);
  console.log(`PNP ${r.id}: ${r.cutout} over ${r.base} (media start ${r.mediaStart}), z ${r.z}, ${r.follow ? `follows ${r.follow}` : 'no camera follow'}; shown ${r.windows.map(([x, y]) => `${x}-${y}`).join(', ')}`);
}
