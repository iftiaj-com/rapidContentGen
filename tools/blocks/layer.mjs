// rcg layer: put a block (captions, title, any element) behind or in front of a PNP cut-out,
// so text sits between the footage and the subject ("BG Vid to PNP Vid", Adits
// atcBgToPnpToggle) or over both, and switch it during the edit.
//
// Adits' "Depth Position" (atcBgToPnpSlider, main.js 9138-9144) puts a caption line behind the
// PnP for the first <depth> share of its motion, then in front. --depth does the same per
// caption group (read from the caption block's GROUPS); --order front-first is the reverse.
//
// Usage:
//   node tools/blocks/layer.mjs --job <dir> --id <element id> (--behind p1 | --front p1 | --z n)
//        [--switch "t:front,t:behind,..."] [--depth 0.5 [--order behind-first|front-first]]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { isMain, parseArgs } from '../lib/cli.mjs';

const f3 = (n) => +Number(n).toFixed(3);

/** The z-index of a PNP (rcg pnp writes it inline on <id>-follow). */
function pnpZ(html, pnp) {
  const m = html.match(new RegExp(`id="${pnp}-follow"[^>]*z-index:\\s*(\\d+)`));
  if (!m) throw new Error(`No PNP "${pnp}" in index.html (rcg pnp --id ${pnp})`);
  return Number(m[1]);
}

/** Caption groups of a captions block, in composition time: [{s, e}]. */
function captionGroups(jobDir, html, id) {
  const host = html.match(new RegExp(`<div\\b[^>]*\\bid="${id}"[^>]*>`))?.[0];
  const src = host?.match(/data-composition-src="([^"]+)"/)?.[1];
  if (!src) throw new Error(`--depth needs a caption block (#${id} has no data-composition-src)`);
  const file = join(jobDir, src);
  if (!existsSync(file)) throw new Error(`Missing ${src}`);
  const m = readFileSync(file, 'utf8').match(/var GROUPS = (\[[\s\S]*?\]);\n/);
  if (!m) throw new Error(`${src} has no GROUPS table (is it an rcg captions block?)`);
  const start = Number(host.match(/data-start="([^"]+)"/)?.[1] || 0);
  return JSON.parse(m[1]).map((g) => ({ s: start + g.s, e: start + g.e }));
}

export function applyLayer(opts) {
  const jobDir = resolve(opts.job);
  const indexPath = join(jobDir, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  const id = String(opts.id || '').replace(/^#/, '');
  if (!id || !new RegExp(`\\bid="${id}"`).test(html)) throw new Error(`No element #${id} in index.html`);
  const pnp = opts.behind || opts.front || opts.pnp;
  const z0 = pnp ? pnpZ(html, String(pnp).replace(/^#/, '')) : null;
  const zFor = (where) => {
    if (where === 'behind') { if (z0 == null) throw new Error('behind needs a PNP (--behind p1)'); return z0 - 10; }
    if (where === 'front') { if (z0 == null) throw new Error('front needs a PNP (--front p1)'); return z0 + 10; }
    const n = Number(where);
    if (!Number.isFinite(n)) throw new Error(`Bad layer "${where}"`);
    return n;
  };
  const initial = opts.z != null ? zFor(opts.z) : zFor(opts.behind ? 'behind' : 'front');

  // Static z-index: a rule in the managed style block.
  const rule = `      #${id} { z-index: ${initial}; }`;
  const styleRe = /\s*<style data-rcg="layers">([\s\S]*?)<\/style>/;
  const existing = html.match(styleRe);
  let rules = existing ? existing[1].split('\n').filter((l) => l.trim() && !l.includes(`#${id} {`)) : [];
  rules.push(rule);
  const styleBlock = `\n    <style data-rcg="layers">\n${rules.join('\n')}\n    </style>`;
  html = existing ? html.replace(styleRe, styleBlock) : html.replace('</head>', `${styleBlock.slice(1)}\n  </head>`);

  // Timed switches: explicit, or per caption group (Adits depth position).
  const sets = [];
  if (opts.switch) {
    for (const s of String(opts.switch).split(',')) {
      const [t, where] = s.split(':');
      sets.push([Number(t), zFor(where)]);
    }
  }
  if (opts.depth != null) {
    const depth = Math.max(0, Math.min(1, Number(opts.depth)));
    const frontFirst = opts.order === 'front-first';
    const zb = zFor('behind');
    const zf = zFor('front');
    for (const g of captionGroups(jobDir, html, id)) {
      const at = g.s + depth * (g.e - g.s);
      sets.push([g.s, frontFirst ? zf : zb], [at, frontFirst ? zb : zf]);
    }
  }
  sets.sort((a, b) => a[0] - b[0]);
  // Behind the subject on purpose: tell HyperFrames' layout check the occlusion is intended.
  const everBehind = z0 != null && [initial, ...sets.map((s) => s[1])].some((z) => z < z0);
  const hostRe = new RegExp(`(<[a-z][\\w-]*\\b[^>]*\\bid="${id}")([^>]*>)`);
  html = html.replace(hostRe, (m, a, b) => {
    const clean = `${a}${b.replace(/\sdata-layout-allow-occlusion\b/, '')}`;
    return everBehind ? clean.replace(`id="${id}"`, `id="${id}" data-layout-allow-occlusion`) : clean;
  });
  // The layout audit reads the flag on the text elements themselves; blocks (titles, captions)
  // build their words in script, so flag them there too. Re-run after regenerating the block.
  const src = html.match(new RegExp(`<[a-z][\\w-]*\\b[^>]*\\bid="${id}"[^>]*data-composition-src="([^"]+)"`))?.[1];
  if (src && existsSync(join(jobDir, src))) {
    const compPath = join(jobDir, src);
    let comp = readFileSync(compPath, 'utf8').replace(/\s*\/\/ rcg:layer allow-occlusion begin[\s\S]*?\/\/ rcg:layer allow-occlusion end/, '');
    if (everBehind) {
      const reg = comp.lastIndexOf('window.__timelines[');
      if (reg > 0) {
        const lineStart = comp.lastIndexOf('\n', reg) + 1;
        const indent = comp.slice(lineStart, reg);
        const sel = `[data-composition-id="${id}"] span, [data-composition-id="${id}"] div`;
        comp = `${comp.slice(0, lineStart)}${indent}// rcg:layer allow-occlusion begin (tools/blocks/layer.mjs: this text sits behind a PNP cut-out on purpose)\n${indent}Array.prototype.forEach.call(document.querySelectorAll(${JSON.stringify(sel)}), function (e) { e.setAttribute("data-layout-allow-occlusion", ""); });\n${indent}// rcg:layer allow-occlusion end\n${comp.slice(lineStart)}`;
      }
    }
    writeFileSync(compPath, comp);
  }
  const blockRe = new RegExp(`      // rcg:layer ${id} begin[\\s\\S]*?// rcg:layer ${id} end\\n`);
  html = html.replace(blockRe, '');
  if (sets.length) {
    const block = `      // rcg:layer ${id} begin (generated by tools/blocks/layer.mjs)
${sets.map(([t, z]) => `      tl.set("#${id}", { zIndex: ${z} }, ${f3(t)});`).join('\n')}
      // rcg:layer ${id} end
`;
    const reg = html.lastIndexOf('window.__timelines');
    const lineStart = html.lastIndexOf('\n', reg) + 1;
    html = `${html.slice(0, lineStart)}${block}${html.slice(lineStart)}`;
  }
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try { new vm.Script(m[1]); } catch (err) { throw new Error(`index.html script would not parse after the layer change: ${err.message}`); }
  }
  writeFileSync(indexPath, html);
  return { id, z: initial, pnpZ: z0, switches: sets };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job || !a.id || (!a.behind && !a.front && a.z == null)) {
    console.error('Usage: layer.mjs --job <dir> --id <element> (--behind p1 | --front p1 | --z n) [--switch "t:front,..."] [--depth 0.5 [--order front-first]]');
    process.exit(2);
  }
  const r = applyLayer(a);
  console.log(`#${r.id}: z-index ${r.z}${r.pnpZ != null ? ` (PNP at ${r.pnpZ})` : ''}${r.switches.length ? `; ${r.switches.length} switches` : ''}`);
}
