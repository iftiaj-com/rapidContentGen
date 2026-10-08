// rcg style: style packs. A pack (library/styles/<slug>/) is one visual language,
// ported from a reference style skill: tokens, fonts, a design spec (frame.md),
// a caption preset (library/caption-styles.json) and components. Each component
// is a function that writes one HyperFrames sub-composition, the same way
// rcg captions and rcg title do. The judgment for each pack (which metaphor for
// which beat, layout modes, collisions) lives in its skill,
// .claude/skills/style-<slug>/SKILL.md; this tool does the mechanical part.
//
// Usage:
//   node tools/blocks/style.mjs list
//   node tools/blocks/style.mjs show <slug>
//   node tools/blocks/style.mjs apply --job <dir> --style <slug>
//   node tools/blocks/style.mjs add --job <dir> --style <slug> --component <name> --start <s> --duration <s>
//        [--id x] [--track 20] [--seed 1] [--allow-edge] [--sfx] [--<param> value ...] [--insert]
//   node tools/blocks/style.mjs build --job <dir> --spec <plan.json> [--sfx] [--insert]
//
// apply: copies the pack's font files into <job>/assets/fonts (git-ignored), writes the pack's
//   frame.md as the job's design spec (an existing one is kept once as frame.pre-<slug>.md),
//   puts the tokens and @font-face rules in index.html and records the style in JOB.md.
// add / build: x and y are the component's CENTER in output pixels; w and h its box. Text is
//   fitted into the box with canvas metrics after the fonts load (lessons 13b). The box must sit
//   inside the template's text-safe area unless --allow-edge. Hosts go in before the first
//   captions or title host, so captions stay on top. --sfx also places the component's sound
//   (from the pack's sfx map) with its peak on the component's landing, like rcg assemble.
// A plan file: { "style": "<slug>", "items": [ { "component": "stamp", "id": "st1", "start": 3,
//   "duration": 2, "text": "OK" }, ... ] }. Text params: "|" breaks a line, *word* is emphasis.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { readJson, ROOT } from '../lib/config.mjs';

const STYLES_DIR = join(ROOT, 'library', 'styles');
const f3 = (n) => +Number(n).toFixed(3);
const RESERVED = new Set(['_', 'job', 'style', 'component', 'start', 'duration', 'id', 'track', 'seed', 'allow-edge', 'insert', 'spec', 'sfx']);

// ── Packs ───────────────────────────────────────────────────────────────────

export function listStyles() {
  if (!existsSync(STYLES_DIR)) return [];
  return readdirSync(STYLES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(STYLES_DIR, d.name, 'style.json')))
    .map((d) => d.name);
}

export async function loadStyle(slug) {
  const dir = join(STYLES_DIR, slug);
  if (!existsSync(join(dir, 'style.json'))) throw new Error(`Unknown style "${slug}". Styles: ${listStyles().join(', ') || '(none)'}`);
  const pack = readJson(join(dir, 'style.json'));
  const mod = await import(pathToFileURL(join(dir, pack.components || 'components.mjs')).href);
  return { slug, dir, ...pack, components: mod.components };
}

/** Font files of a pack (bundled HyperFrames families have no file). */
const fontFiles = (pack) => Object.values(pack.type).filter((f) => f.file);

function fontFaceCss(pack) {
  const seen = new Set();
  return fontFiles(pack).filter((f) => !seen.has(f.family + f.weight) && seen.add(f.family + f.weight)).map((f) => `
      @font-face {
        font-family: "${f.family}";
        src: url("assets/fonts/${basename(f.file)}") format("woff2");
        font-weight: ${f.weight};
        font-style: normal;
      }`).join('');
}

function copyFonts(jobDir, pack) {
  const out = [];
  for (const f of fontFiles(pack)) {
    const dest = join(jobDir, 'assets', 'fonts', basename(f.file));
    if (!existsSync(dest)) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(pack.dir, f.file), dest);
      out.push(dest);
    }
  }
  return out;
}

const tokenCss = (tokens) => Object.entries(tokens).map(([k, v]) => `--${k}: ${v};`).join(' ');

// ── Job geometry and host insertion (same rules as captions.mjs / title.mjs) ─

function jobGeometry(jobDir) {
  const file = join(jobDir, 'index.html');
  if (!existsSync(file)) throw new Error(`No index.html in ${jobDir}`);
  const html = readFileSync(file, 'utf8');
  const tag = html.match(/<[a-z]+\b[^>]*data-composition-id[^>]*>/i)?.[0] || '';
  const num = (n) => Number(tag.match(new RegExp(`${n}="([^"]+)"`))?.[1]);
  const width = num('data-width') || 1080;
  const height = num('data-height') || 1920;
  const sz = readJson(join(jobDir, 'template.json'), {}).safeZones || {};
  const left = sz.textBox?.x ?? Math.round(width * 0.06);
  const right = sz.noTextRightFrom ?? width - Math.round(width / 6);
  return {
    html, width, height, rootDuration: num('data-duration'),
    safe: { left, width: sz.textBox?.width ?? right - left, top: sz.headerClearTo ?? Math.round(height * 0.1), bottom: sz.noTextBottomFrom ?? Math.round(height * 0.8) },
  };
}

const stripComments = (h) => h.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));

/** Index before the first host whose sub-composition was made by rcg captions or rcg title. */
function topHostIndex(jobDir, html) {
  const clean = stripComments(html);
  const re = /<div\b[^>]*data-composition-src="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(clean))) {
    const file = join(jobDir, m[1]);
    if (!existsSync(file)) continue;
    const head = readFileSync(file, 'utf8').slice(0, 600);
    if (/Generated by tools\/blocks\/(captions|title)\.mjs/.test(head)) {
      return clean.lastIndexOf('\n', m.index) + 1;
    }
  }
  return -1;
}

function rootCloseIndex(html) {
  const idx = html.lastIndexOf('</div>', html.lastIndexOf('<script>', html.lastIndexOf('window.__timelines')));
  if (idx < 0) throw new Error('Could not find the root closing tag. Insert the host by hand.');
  return idx;
}

/** Insert or replace an element by id: hosts go under captions/titles, audio at the root end. */
function placeElement(jobDir, html, id, markup, { underCaptions }) {
  const existing = new RegExp(`[ \\t]*<(div|audio)\\b[^>]*\\bid="${id}"[^>]*>\\s*</\\1>\\n?`);
  if (existing.test(html)) return html.replace(existing, `      ${markup}\n`);
  const top = underCaptions ? topHostIndex(jobDir, html) : -1;
  if (top >= 0) return `${html.slice(0, top)}      ${markup}\n${html.slice(top)}`;
  const idx = rootCloseIndex(html);
  return `${html.slice(0, idx)}  ${markup}\n    ${html.slice(idx)}`;
}

// ── Params ──────────────────────────────────────────────────────────────────

function coerce(value, def, name, comp) {
  if (typeof def === 'number' || (def === null && /^-?\d+(\.\d+)?$/.test(String(value)))) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`${comp}: --${name} must be a number (got "${value}")`);
    return n;
  }
  if (typeof def === 'boolean') return value === true || value === 'true' || value === '1';
  return value === true ? '' : String(value);
}

export function resolveParams(comp, name, given) {
  const out = { ...comp.params };
  for (const [k, v] of Object.entries(given)) {
    if (RESERVED.has(k)) continue;
    if (!(k in comp.params)) throw new Error(`${name}: unknown param --${k}. Params: ${Object.keys(comp.params).join(', ')}`);
    out[k] = coerce(Array.isArray(v) ? v[v.length - 1] : v, comp.params[k], k, name);
  }
  return out;
}

// ── Sub-composition ─────────────────────────────────────────────────────────

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** JSON for an inline script: no "<" so a "</script>" in text cannot end the script. */
const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

// Text fitting at render time: canvas metrics after the fonts load (lessons 13b), greedy wrap,
// shrink by 5% steps to the floor. "|" is a hard line break, *word* toggles emphasis.
const RUNTIME = `
        var MCTX = document.createElement("canvas").getContext("2d");
        function $(s) { return document.getElementById(ID + "-" + s); }
        function measure(t, f, size) {
          MCTX.font = (f.style || "normal") + " " + f.weight + " " + size + "px '" + f.family + "'";
          var s = f.upper ? t.toUpperCase() : t;
          return MCTX.measureText(s).width + (f.track || 0) * size * s.length;
        }
        function tokens(text) {
          return String(text).split("|").map(function (line) {
            var out = [], em = false, touching = false;
            line.split(/(\\*)/).forEach(function (part) {
              if (part === "*") { em = !em; return; }
              // "*clear*." -> one word "clear." : text touching the previous word joins it.
              var glue = touching && part && !/^\\s/.test(part);
              part.split(/\\s+/).filter(Boolean).forEach(function (w, k) {
                if (k === 0 && glue && out.length) out[out.length - 1].t += w;
                else out.push({ t: w, em: em });
              });
              if (part) touching = !/\\s$/.test(part);
            });
            return out;
          });
        }
        function wrapLines(hard, f, fe, size, maxW) {
          var lines = [], space = measure(" ", f, size);
          hard.forEach(function (words) {
            var cur = [], w = 0;
            words.forEach(function (tok) {
              var tw = measure(tok.t, tok.em && fe ? fe : f, size);
              if (cur.length && w + space + tw > maxW) { lines.push({ toks: cur, w: w }); cur = []; w = 0; }
              w += (cur.length ? space : 0) + tw;
              cur.push(tok);
            });
            lines.push({ toks: cur, w: w });
          });
          return lines;
        }
        function fit(el, text, o) {
          var hard = tokens(text), size = o.size, lines, lh = o.lh || 1.1;
          for (var k = 0; k < 40; k++) {
            lines = wrapLines(hard, o.font, o.em, size, o.maxW);
            var widest = Math.max.apply(null, lines.map(function (l) { return l.w; }));
            if ((lines.length <= (o.maxLines || 9) && widest <= o.maxW && lines.length * size * lh <= o.maxH) || size <= o.min) break;
            size = Math.max(o.min, size * 0.95);
          }
          el.style.fontSize = size.toFixed(1) + "px";
          // Word gaps are a measured margin, not text nodes: the renderer dropped some whitespace
          // nodes between inline-block words (R9a: "bigidea"). .w + .w uses --sp.
          el.style.setProperty("--sp", measure(" ", o.font, size).toFixed(1) + "px");
          el.innerHTML = "";
          lines.forEach(function (l, li) {
            var ln = document.createElement("span");
            ln.className = "ln";
            ln.id = el.id + "-l" + li;
            l.toks.forEach(function (tok, ti) {
              var w = document.createElement("span");
              w.className = tok.em ? "w em" : "w";
              w.textContent = tok.t;
              ln.appendChild(w);
            });
            el.appendChild(ln);
          });
          return { size: size, lines: lines.length };
        }`;

export function buildComponentHtml({ pack, name, comp, params, id, start, duration, geo, seed }) {
  const rnd = prng(seed);
  const ctx = {
    id, D: duration, W: geo.width, H: geo.height, safe: geo.safe, tokens: pack.tokens, type: pack.type,
    motion: pack.motion || {}, rnd, esc, js,
    sel: (s) => `#${id}-${s}`, idf: (s) => `${id}-${s}`,
    family: (role) => `font-family: "${pack.type[role].family}"; font-weight: ${pack.type[role].weight};`,
  };
  const out = comp.render(params, ctx);
  const fonts = [...new Set(Object.values(pack.type).map((f) => `${f.weight} 40px '${f.family}'`))];
  const css = `${fontFaceCss(pack)}
      #root {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }
      #${id}-layer {
        position: absolute;
        inset: 0;
        ${tokenCss(pack.tokens)}
      }
      #${id}-layer .ln { display: block; }
      #${id}-layer .w { display: inline-block; }
      #${id}-layer .w + .w { margin-left: var(--sp, 0.25em); }
${out.css}`;
  const script = `
      (function () {
        var ID = ${js(id)};
        var D = ${duration};
        var W = ${geo.width}, H = ${geo.height};
        var FONTS = ${js(fonts)};
        var tl = gsap.timeline({ paused: true });${RUNTIME}
        function build() {
          try {${out.js}
          } catch (err) {
            console.error("[rcg style] " + ID + ": " + err.message);
          }
          window.__timelines[ID] = tl;
        }
        if (document.fonts && document.fonts.load) {
          Promise.all(FONTS.map(function (s) { return document.fonts.load(s); })).then(build, build);
        } else build();
      })();`;
  try {
    new vm.Script(script, { filename: `${id}.inline.js` });
  } catch (err) {
    throw new Error(`Generated script for ${id} (${pack.slug}/${name}) does not parse: ${err.message}`);
  }
  // The params ride along so the block can be regenerated; no "<" or ">" in the comment (lessons 13d).
  const record = JSON.stringify({ style: pack.slug, component: name, start, duration, seed, params })
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/--/g, '-\\u002d');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- Generated by tools/blocks/style.mjs: style "${pack.slug}", component "${name}". Regenerate instead of hand-editing. -->
    <!-- rcg-style ${record} -->
  </head>
  <body>
    <template>
      <style>${css}
      </style>
      <div id="root" data-composition-id="${id}" data-width="${geo.width}" data-height="${geo.height}">
        <div id="${id}-layer">${out.html}
        </div>
      </div>
      <script>${script}
      </script>
    </template>
  </body>
</html>
`;
}

/** The component's box, rotated, must sit inside the text-safe area. */
function safeCheck(name, params, geo, comp) {
  if (comp.fullFrame) return null;
  const { x, y, w, h } = params;
  const r = Math.abs((params.rotate || 0) * Math.PI / 180);
  const bw = w * Math.cos(r) + h * Math.sin(r);
  const bh = w * Math.sin(r) + h * Math.cos(r);
  const box = { l: x - bw / 2, r: x + bw / 2, t: y - bh / 2, b: y + bh / 2 };
  const s = geo.safe;
  const bad = [];
  if (box.l < s.left - 0.5) bad.push(`left edge ${Math.round(box.l)} < ${s.left}`);
  if (box.r > s.left + s.width + 0.5) bad.push(`right edge ${Math.round(box.r)} > ${s.left + s.width} (app buttons)`);
  if (box.t < s.top - 0.5) bad.push(`top ${Math.round(box.t)} < ${s.top} (app header)`);
  if (box.b > s.bottom + 0.5) bad.push(`bottom ${Math.round(box.b)} > ${s.bottom} (bottom 20%)`);
  return bad.length ? `${name} box x ${Math.round(box.l)}-${Math.round(box.r)}, y ${Math.round(box.t)}-${Math.round(box.b)} leaves the safe area: ${bad.join('; ')}` : null;
}

/** The component's sounds ({role, at} or a function of params for per-row hits), peak on the landing. */
function sfxMarkup(jobDir, pack, comp, id, start, params, duration) {
  if (!comp.sfx) return [];
  const hits = typeof comp.sfx === 'function'
    ? comp.sfx(params, duration, comp.times ? comp.times(params, duration) : [])
    : [comp.sfx];
  const manifest = readJson(join(ROOT, 'library', 'sfx', 'manifest.json'));
  return hits.filter((h) => pack.sfx?.[h.role]).map((h, k) => {
    const hint = pack.sfx[h.role];
    const e = manifest[hint.name];
    if (!e) throw new Error(`Style ${pack.slug}: sfx "${hint.name}" is not in library/sfx/manifest.json`);
    mkdirSync(join(jobDir, 'assets', 'sfx'), { recursive: true });
    if (!existsSync(join(jobDir, 'assets', 'sfx', e.file))) copyFileSync(join(ROOT, 'library', 'sfx', e.file), join(jobDir, 'assets', 'sfx', e.file));
    const landing = start + h.at;
    const at = Math.max(0, landing - (e.peakS ?? e.crestStartS ?? 0));
    const sid = k ? `${id}-sfx${k + 1}` : `${id}-sfx`;
    return { id: sid, landing: f3(landing), at: f3(at), dur: e.durationS, file: e.file, volume: hint.volume };
  });
}

/** Audio already in index.html: [{id, s, e, track}] (comments stripped). */
function audioSpans(html) {
  const out = [];
  for (const m of stripComments(html).matchAll(/<audio\b[^>]*>/g)) {
    const a = (n) => m[0].match(new RegExp(`${n}="([^"]*)"`))?.[1];
    const s = Number(a('data-start') || 0);
    out.push({ id: a('id'), s, e: s + Number(a('data-duration') || 0), track: Number(a('data-track-index')) });
  }
  return out;
}

/** First SFX lane (40-47, as rcg assemble uses) with no overlapping audio: lint flags overlaps on one track. */
function sfxTrack(spans, s) {
  for (let track = 40; track < 48; track++) {
    if (!spans.some((x) => x.id !== s.id && x.track === track && x.s < s.at + s.dur && s.at < x.e)) return track;
  }
  return 47;
}

// ── Commands ────────────────────────────────────────────────────────────────

export async function addComponent(opts, cache = {}) {
  const jobDir = resolve(opts.job);
  const pack = cache[opts.style] || (cache[opts.style] = await loadStyle(opts.style));
  const name = opts.component;
  const comp = pack.components[name];
  if (!comp) throw new Error(`Style ${pack.slug} has no component "${name}". Components: ${Object.keys(pack.components).join(', ')}`);
  const start = Number(opts.start);
  const duration = Number(opts.duration);
  if (!Number.isFinite(start) || start < 0) throw new Error(`${name}: --start must be >= 0`);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`${name}: --duration must be > 0`);
  if (comp.minDuration && duration < comp.minDuration) throw new Error(`${name}: needs at least ${comp.minDuration} s (got ${duration})`);
  const geo = jobGeometry(jobDir);
  const seed = Number(opts.seed ?? 1);
  const params = resolveParams(comp, name, opts);
  if (params.x == null && 'x' in comp.params) params.x = geo.safe.left + geo.safe.width / 2;
  if (comp.prepare) comp.prepare(params, { geo, rnd: prng(seed + 7919), pack, jobDir });
  const warnings = [];
  const unsafe = safeCheck(name, params, geo, comp);
  if (unsafe && !opts['allow-edge']) throw new Error(`${unsafe}. Move or shrink it, or pass --allow-edge for decoration.`);
  if (unsafe) warnings.push(unsafe);
  const id = opts.id || `${pack.slug.split('-')[0]}-${name}-${String(start).replace('.', '_')}`;
  const html = buildComponentHtml({ pack, name, comp, params, id, start, duration, geo, seed });
  copyFonts(jobDir, pack);
  mkdirSync(join(jobDir, 'compositions'), { recursive: true });
  const out = join(jobDir, 'compositions', `${id}.html`);
  writeFileSync(out, html);
  const host = `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${f3(start)}" data-duration="${f3(duration)}" data-track-index="${opts.track || 20}" data-width="${geo.width}" data-height="${geo.height}"></div>`;
  if (geo.rootDuration && start + duration > geo.rootDuration + 1e-3) {
    warnings.push(`${id} ends at ${f3(start + duration)} s, past the root duration ${geo.rootDuration} s.`);
  }
  const sfx = opts.sfx ? sfxMarkup(jobDir, pack, comp, id, start, params, duration) : [];
  const spans = audioSpans(readFileSync(join(jobDir, 'index.html'), 'utf8'));
  for (const s of sfx) {
    const track = sfxTrack(spans, s);
    spans.push({ id: s.id, s: s.at, e: s.at + s.dur, track });
    s.markup = `<audio id="${s.id}" src="assets/sfx/${s.file}" data-start="${s.at}" data-duration="${s.dur}" data-volume="${s.volume}" data-track-index="${track}"></audio>`;
  }
  if (opts.insert) {
    let h = readFileSync(join(jobDir, 'index.html'), 'utf8');
    h = placeElement(jobDir, h, id, host, { underCaptions: true });
    // Sounds this component placed before and no longer has (a rebuild with fewer hits or no --sfx).
    const keep = new Set(sfx.map((s) => s.id));
    h = h.replace(new RegExp(`[ \\t]*<audio\\b[^>]*\\bid="(${id}-sfx\\d*)"[^>]*>\\s*</audio>\\n?`, 'g'), (m, sid) => (keep.has(sid) ? m : ''));
    for (const s of sfx) h = placeElement(jobDir, h, s.id, s.markup, { underCaptions: false });
    writeFileSync(join(jobDir, 'index.html'), h);
  }
  return { id, out, host, sfx, warnings, params };
}

export async function applyStyle(opts) {
  const jobDir = resolve(opts.job);
  const pack = await loadStyle(opts.style);
  const copied = copyFonts(jobDir, pack);
  const notes = copied.map((f) => `font ${basename(f)} -> assets/fonts/`);
  // Design spec: keep a conflicting frame.md once (never back up a backup).
  const frameSrc = join(pack.dir, 'frame.md');
  const frameDest = join(jobDir, 'frame.md');
  const frameNew = readFileSync(frameSrc, 'utf8');
  if (existsSync(frameDest) && readFileSync(frameDest, 'utf8') !== frameNew) {
    const backup = join(jobDir, `frame.pre-${pack.slug}.md`);
    if (!existsSync(backup)) { copyFileSync(frameDest, backup); notes.push(`kept the old spec as ${basename(backup)}`); }
  }
  writeFileSync(frameDest, frameNew);
  notes.push('frame.md written');
  // Tokens and @font-face in index.html, in one replaceable block.
  const file = join(jobDir, 'index.html');
  let html = readFileSync(file, 'utf8');
  const block = `<style data-rcg-style="${pack.slug}">${fontFaceCss(pack)}
      :root { ${tokenCss(pack.tokens)} }
    </style>`;
  const re = /<style data-rcg-style="[^"]*">[\s\S]*?<\/style>/;
  html = re.test(html) ? html.replace(re, block) : html.replace(/<\/head>/, `    ${block}\n  </head>`);
  writeFileSync(file, html);
  notes.push('tokens + font faces in index.html');
  // JOB.md: one line under the header list.
  const jobMd = join(jobDir, 'JOB.md');
  if (existsSync(jobMd)) {
    let md = readFileSync(jobMd, 'utf8');
    const line = `- **Style:** ${pack.label} (\`${pack.slug}\`): skill \`${pack.skill}\`, spec \`frame.md\``;
    if (/^- \*\*Style:\*\*.*$/m.test(md)) md = md.replace(/^- \*\*Style:\*\*.*$/m, line);
    else if (/^- \*\*Mode:\*\*.*$/m.test(md)) md = md.replace(/^(- \*\*Mode:\*\*.*)$/m, `$1\n${line}`);
    else md = `${md.trimEnd()}\n\n${line}\n`;
    writeFileSync(jobMd, md);
    notes.push('JOB.md style line');
  }
  return { pack, notes };
}

export async function buildPlan(opts) {
  const jobDir = resolve(opts.job);
  const plan = readJson(resolve(opts.spec));
  if (!Array.isArray(plan.items) || !plan.items.length) throw new Error(`${opts.spec}: "items" must be a non-empty array`);
  const cache = {};
  const ids = new Set();
  const results = [];
  const errors = [];
  for (const [i, item] of plan.items.entries()) {
    const style = item.style || plan.style || opts.style;
    if (!style) throw new Error(`items[${i}]: no style (set "style" on the plan or the item)`);
    if (item.id && ids.has(item.id)) { errors.push(`items[${i}]: duplicate id "${item.id}"`); continue; }
    try {
      const res = await addComponent({ ...item, job: jobDir, style, insert: opts.insert, sfx: item.sfx ?? opts.sfx }, cache);
      ids.add(res.id);
      results.push({ ...res, component: item.component, start: item.start, duration: item.duration });
    } catch (err) {
      errors.push(`items[${i}] (${item.component} ${item.id || ''}): ${err.message}`);
    }
  }
  return { results, errors };
}

function showStyle(pack) {
  const lines = [`${pack.label} (${pack.slug})`, `  ${pack.use}`, `  skill: ${pack.skill}`, `  from: ${pack.from}`, '', '  Type roles:'];
  for (const [role, f] of Object.entries(pack.type)) lines.push(`    ${role.padEnd(10)} ${f.family} ${f.weight}${f.file ? ` (file ${f.file})` : ' (bundled)'}`);
  lines.push('', `  Captions: rcg captions --style ${pack.captions.style} --mode ${pack.captions.mode}${pack.captions.alt ? ` (alt: ${pack.captions.alt})` : ''}`, '', '  Components:');
  for (const [name, c] of Object.entries(pack.components)) {
    lines.push(`    ${name}${c.fullFrame ? ' (full frame)' : ''}: ${c.summary}`);
    lines.push(`      params: ${Object.entries(c.params).map(([k, v]) => `${k}=${v === '' ? '""' : v}`).join(' ')}`);
    if (typeof c.sfx === 'function') lines.push('      sfx: one per hit (rows, steps), from the pack sfx map');
    else if (c.sfx) lines.push(`      sfx: ${c.sfx.role} at +${c.sfx.at} s -> ${pack.sfx?.[c.sfx.role]?.name || '(none)'}`);
  }
  return lines.join('\n');
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const cmd = a._[0];
  const fail = (msg) => { console.error(msg); process.exit(2); };
  try {
    if (cmd === 'list') {
      for (const slug of listStyles()) {
        const p = readJson(join(STYLES_DIR, slug, 'style.json'));
        console.log(`${slug.padEnd(18)} ${p.label}: ${p.use}\n${''.padEnd(18)} keywords: ${(p.keywords || []).join(', ')}`);
      }
    } else if (cmd === 'show') {
      if (!a._[1]) fail('Usage: style.mjs show <slug>');
      console.log(showStyle(await loadStyle(a._[1])));
    } else if (cmd === 'apply') {
      if (!a.job || !a.style) fail('Usage: style.mjs apply --job <dir> --style <slug>');
      const { pack, notes } = await applyStyle(a);
      console.log(`Applied ${pack.label} to ${a.job}: ${notes.join('; ')}`);
      console.log(`Next: rcg style show ${pack.slug} (components), rcg captions --style ${pack.captions.style}`);
    } else if (cmd === 'add') {
      if (!a.job || !a.style || !a.component || a.start == null || a.duration == null) {
        fail('Usage: style.mjs add --job <dir> --style <slug> --component <name> --start s --duration s [--id x] [--<param> v ...] [--sfx] [--insert]');
      }
      const res = await addComponent({ ...a, insert: Boolean(a.insert), sfx: Boolean(a.sfx) });
      console.log(`Wrote ${res.out}`);
      console.log(a.insert ? 'Host inserted into index.html' : `Host element:\n${res.host}`);
      for (const s of res.sfx) console.log(`SFX ${a.insert ? 'placed' : 'element'}: ${s.markup} (peak on ${s.landing} s)`);
      for (const w of res.warnings) console.log(`WARNING: ${w}`);
    } else if (cmd === 'build') {
      if (!a.job || !a.spec) fail('Usage: style.mjs build --job <dir> --spec <plan.json> [--sfx] [--insert]');
      const { results, errors } = await buildPlan({ ...a, insert: Boolean(a.insert), sfx: Boolean(a.sfx) });
      for (const r of results) {
        console.log(`${String(r.id).padEnd(16)} ${String(r.component).padEnd(14)} ${f3(r.start).toFixed(2).padStart(6)}-${f3(Number(r.start) + Number(r.duration)).toFixed(2).padEnd(6)}${r.sfx.length ? ` sfx peak ${r.sfx.map((s) => s.landing).join(', ')}` : ''}`);
        for (const w of r.warnings) console.log(`  WARNING: ${w}`);
      }
      console.log(`${results.length} component(s) ${a.insert ? 'inserted' : 'written (not inserted; pass --insert)'}.`);
      if (errors.length) {
        for (const e of errors) console.error(`ERROR: ${e}`);
        process.exit(1);
      }
    } else {
      fail('Usage: style.mjs list | show <slug> | apply --job <dir> --style <slug> | add ... | build --job <dir> --spec <plan.json>');
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}
