// Kinetic title card generator: animated title text as a HyperFrames
// sub-composition. Styles come from library/caption-styles.json (Adits presets)
// or the trailer serif; motion comes from a preset. One paused GSAP timeline,
// seeded randomness, canvas-measured fit to the safe box.
//
// Presets
//   slam          words hit from 1.6x scale with blur, staggered (the MOP STAR title)
//   stagger-up    words rise 60 px and fade in one after another
//   kinetic-pop   Adits kinetic feel: seeded tilt per word, pop to 1.15x and settle
//   type-on       letters appear one by one (typewriter), with a blinking-free cursor bar
//
// Usage:
//   node tools/blocks/title.mjs --job <dir> --text "MOP|STAR" [--preset slam] [--style trailer|tiktok|neon|kinetic|...]
//        [--position center|top-band|captions] [--y px] [--size 160] [--color "#3b1f4a"] [--start 11.03] [--duration 1.25]
//        [--id title-main] [--track 40] [--seed 1] [--insert]
// "|" in --text starts a new line.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { readJson, ROOT } from '../lib/config.mjs';

const PRESETS = ['slam', 'stagger-up', 'kinetic-pop', 'type-on'];

// The trailer serif look from the mop-star job (not an Adits preset).
const TRAILER_STYLE = {
  font: 'EB Garamond', weight: 700, uppercase: true, color: '#f7e7c4', stroke: null, pill: null,
  letterSpacing: '0.1em',
  glow: { color: 'rgba(255, 210, 140, 0.45)', blur: 36, flashBlur: 0 },
};

function jobGeometry(jobDir) {
  const html = readFileSync(join(jobDir, 'index.html'), 'utf8');
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

export function buildTitleHtml({ id, lines, style, preset, width, height, centerY, size, safe, seed, duration }) {
  const glow = style.glow && style.glow.color !== 'transparent' ? `0 0 ${style.glow.blur || 0}px ${style.glow.color}, ` : '';
  const css = `
      #root {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }
      #${id}-card {
        position: absolute;
        left: ${safe.left}px;
        width: ${safe.width}px;
        top: ${Math.round(centerY - size * lines.length * 0.75)}px;
        height: ${Math.round(size * lines.length * 1.5)}px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: "${style.font}", serif;
        font-weight: ${style.weight};
        color: ${style.color};
        ${style.uppercase ? 'text-transform: uppercase;' : ''}
        ${style.letterSpacing ? `letter-spacing: ${style.letterSpacing};` : ''}
        line-height: 1.02;
        text-align: center;
        text-shadow: ${style.shadow || `${glow}0 3px 16px rgba(0, 0, 0, 0.75)`};
        ${style.stroke ? `-webkit-text-stroke: ${Math.max(2, Math.round(size * 0.04))}px ${style.stroke}; paint-order: stroke fill;` : ''}
      }
      #${id}-card .line {
        display: block;
        white-space: nowrap;
      }
      #${id}-card .w,
      #${id}-card .c {
        display: inline-block;
        opacity: 0;
      }`;

  const script = `
      (function () {
        var ID = ${JSON.stringify(id)};
        var LINES = ${JSON.stringify(lines)};
        var PRESET = ${JSON.stringify(preset)};
        var SIZE = ${size};
        var SAFE_W = ${safe.width};
        var DUR = ${duration};
        var FONT = ${JSON.stringify(style.font)}, WEIGHT = ${JSON.stringify(String(style.weight))};
        var UPPER = ${style.uppercase ? 'true' : 'false'};
        var SPACING_EM = ${style.letterSpacing ? parseFloat(style.letterSpacing) : 0};
        var SEED = ${Number(seed) >>> 0};
        function prng(a) {
          return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        }
        var ctx = document.createElement("canvas").getContext("2d");
        function lineWidth(text, fs) {
          ctx.font = WEIGHT + " " + fs + "px '" + FONT + "', serif";
          var s = UPPER ? text.toUpperCase() : text;
          return ctx.measureText(s).width + s.length * SPACING_EM * fs;
        }
        function build() {
          var card = document.getElementById(ID + "-card");
          var tl = gsap.timeline({ paused: true });
          var rnd = prng(SEED);
          // Fit the widest line into the safe width with 22% room for the motion
          // overshoot (kinetic-pop peaks at 1.15x, plus the 1.03x drift).
          var fs = SIZE;
          var widest = 0;
          LINES.forEach(function (l) { widest = Math.max(widest, lineWidth(l, fs)); });
          if (widest * 1.22 > SAFE_W) fs = fs * SAFE_W / (widest * 1.22);
          card.style.fontSize = fs + "px";
          var units = [];
          LINES.forEach(function (text, li) {
            var line = document.createElement("span");
            line.className = "line";
            line.id = ID + "-l" + li;
            card.appendChild(line);
            if (PRESET === "type-on") {
              text.split("").forEach(function (ch, ci) {
                var c = document.createElement("span");
                c.className = "c";
                c.id = ID + "-l" + li + "-c" + ci;
                c.textContent = ch === " " ? "\\u00a0" : ch;
                line.appendChild(c);
                units.push(c);
              });
            } else {
              text.split(/\\s+/).filter(Boolean).forEach(function (word, wi, arr) {
                var w = document.createElement("span");
                w.className = "w";
                w.id = ID + "-l" + li + "-w" + wi;
                w.textContent = word;
                line.appendChild(w);
                // Explicit gap, not a whitespace text node: between inline-block words a
                // space text node went missing in render ("CLEANSPIN REPEAT").
                if (wi < arr.length - 1) w.style.marginRight = "0.26em";
                units.push(w);
              });
            }
          });
          var n = units.length;
          var inSpan = Math.min(0.6, DUR * 0.35);
          var step = n > 1 ? inSpan / (n - 1) : 0;
          var outAt = Math.max(inSpan + 0.3, DUR - 0.25);
          units.forEach(function (u, i) {
            var t = i * step;
            if (PRESET === "slam") {
              tl.fromTo(u, { opacity: 0, scale: 1.6, filter: "blur(8px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.2, ease: "power4.out", immediateRender: false }, t);
              tl.set(u, { filter: "none" }, t + 0.2);
            } else if (PRESET === "stagger-up") {
              tl.fromTo(u, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out", immediateRender: false }, t);
            } else if (PRESET === "kinetic-pop") {
              var rot = (rnd() * 2 - 1) * 8;
              tl.fromTo(u, { opacity: 0, scale: 0, rotation: rot }, { opacity: 1, scale: 1.15, rotation: rot, duration: 0.3, ease: "back.out(2)", immediateRender: false }, t);
              tl.to(u, { scale: 1, rotation: rot * 0.5, duration: 0.25, ease: "power2.out" }, t + 0.3);
            } else {
              tl.set(u, { opacity: 1 }, t);
            }
          });
          // Hold with a slow drift, then fade out together before the slot ends.
          tl.to(card, { scale: 1.03, duration: Math.max(0.1, outAt - inSpan), ease: "none" }, inSpan);
          tl.to(units, { opacity: 0, duration: 0.25, ease: "power1.in" }, outAt);
          window.__timelines[ID] = tl;
        }
        var spec = WEIGHT + " " + SIZE + "px '" + FONT + "'";
        if (document.fonts && document.fonts.load) document.fonts.load(spec).then(build, build);
        else build();
      })();`;

  try {
    new vm.Script(script, { filename: `${id}.inline.js` });
  } catch (err) {
    throw new Error(`Generated title script for ${id} does not parse: ${err.message}`);
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- Generated by tools/blocks/title.mjs: preset "${preset}". Regenerate instead of hand-editing. -->
  </head>
  <body>
    <template>
      <style>${css}
      </style>
      <div id="root" data-composition-id="${id}" data-width="${width}" data-height="${height}">
        <div id="${id}-card"></div>
      </div>
      <script>${script}
      </script>
    </template>
  </body>
</html>
`;
}

export function generateTitle(opts) {
  const jobDir = resolve(opts.job);
  const preset = opts.preset || 'slam';
  if (!PRESETS.includes(preset)) throw new Error(`Unknown preset "${preset}". Presets: ${PRESETS.join(', ')}`);
  const styleName = opts.style || 'trailer';
  const base = styleName === 'trailer' ? TRAILER_STYLE : readJson(join(ROOT, 'library', 'caption-styles.json')).styles[styleName];
  if (!base) throw new Error(`Unknown style "${styleName}"`);
  // --color: dark text for light footage (no glow, a light shadow), as text behind a subject often needs.
  const style = opts.color ? { ...base, color: opts.color, glow: null, stroke: null, shadow: '0 2px 10px rgba(0, 0, 0, 0.18)' } : base;
  const lines = String(opts.text || '').split('|').map((s) => s.trim()).filter(Boolean);
  if (!lines.length) throw new Error('--text is required');
  const geo = jobGeometry(jobDir);
  const size = Number(opts.size) || Math.round(160 * (geo.width / 1080));
  const positions = { center: geo.height * 0.45, 'top-band': geo.height * 0.1667, captions: geo.height * 0.7 };
  const centerY = Number(opts.y) || positions[opts.position || 'center'];
  if (!centerY) throw new Error(`Unknown --position ${opts.position}`);
  const halfH = size * lines.length * 0.6;
  if (centerY + halfH > geo.safe.bottom) throw new Error(`Title reaches the bottom no-text zone (y ${Math.round(centerY + halfH)} > ${geo.safe.bottom}); use a smaller --size or higher --position.`);
  const duration = Number(opts.duration) || 1.5;
  const id = opts.id || 'title-main';
  const html = buildTitleHtml({ id, lines, style, preset, width: geo.width, height: geo.height, centerY, size, safe: geo.safe, seed: opts.seed ?? 1, duration });
  mkdirSync(join(jobDir, 'compositions'), { recursive: true });
  const out = join(jobDir, 'compositions', `${id}.html`);
  writeFileSync(out, html);
  const start = Number(opts.start || 0);
  const host = `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${start}" data-duration="${duration}" data-track-index="${opts.track || 40}" data-width="${geo.width}" data-height="${geo.height}"></div>`;
  if (opts.insert) {
    const h = geo.html;
    const existing = new RegExp(`<div id="${id}"[^>]*data-composition-src="compositions/${id}\\.html"[^>]*></div>`);
    if (existing.test(h)) writeFileSync(join(jobDir, 'index.html'), h.replace(existing, host));
    else {
      const idx = h.lastIndexOf('</div>', h.lastIndexOf('<script>', h.lastIndexOf('window.__timelines')));
      if (idx < 0) throw new Error('Could not find the root closing tag. Insert the host by hand.');
      writeFileSync(join(jobDir, 'index.html'), `${h.slice(0, idx)}  ${host}\n    ${h.slice(idx)}`);
    }
  }
  const warnings = [];
  if (geo.rootDuration && start + duration > geo.rootDuration + 1e-3) warnings.push(`Title ends at ${start + duration} s, past the root duration ${geo.rootDuration} s.`);
  return { out, host, lines, preset, style: styleName, size, centerY, warnings };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job || !a.text) {
    console.error('Usage: title.mjs --job <dir> --text "LINE ONE|LINE TWO" [--preset slam|stagger-up|kinetic-pop|type-on] [--style trailer|<caption style>] [--position center|top-band|captions] [--size px] [--color css] [--start s] [--duration s] [--id x] [--insert]');
    process.exit(2);
  }
  const res = generateTitle({ ...a, insert: Boolean(a.insert) });
  console.log(`Wrote ${res.out} (${res.preset}, style ${res.style}, ${res.size}px at y=${Math.round(res.centerY)})`);
  console.log(a.insert ? 'Host inserted into index.html' : `Host element:\n${res.host}`);
  for (const w of res.warnings) console.log(`WARNING: ${w}`);
}
