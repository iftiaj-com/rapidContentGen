// Beat-flash words: a word per band (bass / mid / treble) that flashes when its
// band hits. Ported from Adits shared/captions.js (CaptionEngine.draw): each
// band keeps a decaying peak (state = max(state * decay, band)); when the
// strongest state is over the threshold its word shows, pulsed in size by the
// level. Effects: none, neon, shadow, rgb, vertical_ghost, shake.
//
// Adits runs this per animation frame with Math.random() for shake. Here the
// states are computed in Node from the per-frame audio table (tools/audio/
// analyze.mjs), the 60 fps decay is converted to the table's fps, shake uses a
// seeded PRNG, and the page only looks up the current frame from a GSAP
// property setter. Same look, but seekable and identical on every render.
//
// --source onsets uses kick / snare / hat onsets instead of the smoothed bands:
// a loud master keeps the bass band pinned near 1, so with bands the bass word
// never lets go.
//
// Usage:
//   node tools/blocks/beatflash.mjs --job <dir> --words "BASS|MID|TREBLE" --audio <music> [--audio-offset 0]
//        [--source bands|onsets] [--thresh 0.25] [--decay 0.85] [--scale 1.4] [--effect none|neon|shadow|rgb|vertical_ghost|shake]
//        [--style modern] [--size-pct 8] [--position top-band|center|captions] [--start 0] [--duration s] [--id beatflash] [--insert]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { analyzeToFile } from '../audio/analyze.mjs';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { readJson, ROOT } from '../lib/config.mjs';

const EFFECTS = ['none', 'neon', 'shadow', 'rgb', 'vertical_ghost', 'shake'];

function jobGeometry(jobDir) {
  const html = readFileSync(join(jobDir, 'index.html'), 'utf8');
  const tag = html.match(/<[a-z]+\b[^>]*data-composition-id[^>]*>/i)?.[0] || '';
  const num = (n) => Number(tag.match(new RegExp(`${n}="([^"]+)"`))?.[1]);
  const width = num('data-width') || 1080;
  const height = num('data-height') || 1920;
  const sz = readJson(join(jobDir, 'template.json'), {}).safeZones || {};
  const left = sz.textBox?.x ?? Math.round(width * 0.06);
  const right = sz.noTextRightFrom ?? width - Math.round(width / 6);
  return { html, width, height, rootDuration: num('data-duration'), safe: { left, width: sz.textBox?.width ?? right - left, bottom: sz.noTextBottomFrom ?? Math.round(height * 0.8) } };
}

/** Per-frame [wordIndex or -1, value] from the audio table, Adits' decay rule. */
export function flashFrames(table, { source = 'bands', thresh = 0.25, decay = 0.85 } = {}) {
  const keys = source === 'onsets' ? ['kick', 'snare', 'hat'] : ['bass', 'mid', 'treble'];
  const perFrame = Math.pow(decay, 60 / table.fps); // Adits decays once per 60 fps frame
  const state = [0, 0, 0];
  return table.frames.map((f) => {
    let best = -1;
    let val = 0;
    for (let k = 0; k < 3; k++) {
      state[k] = Math.max(state[k] * perFrame, f[keys[k]]);
      if (state[k] > thresh && state[k] > val) { val = state[k]; best = k; }
    }
    return [best, Math.round(val * 1000) / 1000];
  });
}

export function buildBeatflashHtml({ id, words, frames, fps, style, effect, scale, sizePx, centerY, safe, width, height, duration, seed }) {
  const stroke = style.stroke || '#000000';
  const css = `
      #root {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }
      #${id}-stage {
        position: absolute;
        left: ${safe.left}px;
        width: ${safe.width}px;
        top: ${Math.round(centerY - sizePx * scale)}px;
        height: ${Math.round(sizePx * scale * 2)}px;
        font-family: "${style.font}", sans-serif;
        font-weight: ${style.weight};
        ${style.uppercase ? 'text-transform: uppercase;' : ''}
      }
      #${id}-stage .bw {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        color: ${style.color};
        -webkit-text-stroke: ${Math.max(2, Math.round(sizePx * 0.075))}px ${stroke};
        paint-order: stroke fill;
        opacity: 0;
      }`;
  const script = `
      (function () {
        var ID = ${JSON.stringify(id)};
        var DUR = ${duration};
        var FPS = ${fps};
        var FRAMES = ${JSON.stringify(frames)};
        var WORDS = ${JSON.stringify(words)};
        var EFFECT = ${JSON.stringify(effect)};
        var SCALE = ${scale};
        var SIZE = ${sizePx};
        var COLOR = ${JSON.stringify(style.color)};
        var MAXW = ${safe.width};
        var FONT = ${JSON.stringify(style.font)}, WEIGHT = ${JSON.stringify(String(style.weight))};
        var UPPER = ${style.uppercase ? 'true' : 'false'};
        var SEED = ${Number(seed) >>> 0};
        function rand(i) { var a = (SEED ^ (i * 2654435761)) >>> 0; a = Math.imul(a ^ (a >>> 15), 1 | a); a ^= a + Math.imul(a ^ (a >>> 7), 61 | a); return ((a ^ (a >>> 14)) >>> 0) / 4294967296; }
        var ctx = document.createElement("canvas").getContext("2d");
        function fitSize(text) {
          ctx.font = WEIGHT + " " + SIZE + "px '" + FONT + "', sans-serif";
          var w = ctx.measureText(UPPER ? text.toUpperCase() : text).width * SCALE;
          return w > MAXW ? SIZE * MAXW / w : SIZE;
        }
        var stage = document.getElementById(ID + "-stage");
        var els = WORDS.map(function (w, i) {
          var el = document.createElement("div");
          el.className = "bw";
          el.id = ID + "-w" + i;
          el.textContent = w;
          el.setAttribute("data-layout-allow-overlap", "");
          el.dataset.base = String(w ? fitSize(w) : SIZE);
          stage.appendChild(el);
          return el;
        });
        function shadowFor(v) {
          if (EFFECT === "neon") return "0 0 " + (30 * v).toFixed(1) + "px " + COLOR;
          if (EFFECT === "shadow") return "0.1em 0.1em 0.3em rgba(0,0,0,0.8)";
          if (EFFECT === "rgb") return "-0.06em 0 0 rgba(255,0,0,0.9), 0.06em 0 0 rgba(0,0,255,0.9)";
          if (EFFECT === "vertical_ghost") return "0 -0.6em 0 rgba(255,255,255,0.65), 0 0.6em 0 rgba(255,255,255,0.65), 0 -1.2em 0 rgba(255,255,255,0.3), 0 1.2em 0 rgba(255,255,255,0.3)";
          return "0 3px 10px rgba(0,0,0,0.6)";
        }
        function draw(t) {
          var f = Math.max(0, Math.min(FRAMES.length - 1, Math.floor(t * FPS + 1e-6)));
          var cur = FRAMES[f], wi = cur[0], v = cur[1];
          els.forEach(function (el, i) {
            if (i !== wi || !WORDS[i]) { el.style.opacity = "0"; return; }
            var fs = Number(el.dataset.base) * (1 + v * (SCALE - 1));
            el.style.opacity = "1";
            el.style.fontSize = fs.toFixed(1) + "px";
            el.style.textShadow = shadowFor(v);
            var dx = 0, dy = 0;
            if (EFFECT === "shake") { dx = (rand(f * 2) - 0.5) * 20 * v; dy = (rand(f * 2 + 1) - 0.5) * 20 * v; }
            el.style.left = dx.toFixed(1) + "px";
            el.style.top = dy.toFixed(1) + "px";
          });
        }
        var tl = gsap.timeline({ paused: true });
        var driver = { _t: 0 };
        Object.defineProperty(driver, "t", { get: function () { return this._t; }, set: function (v) { this._t = v; draw(v); } });
        tl.to(driver, { t: DUR, duration: DUR, ease: "none" }, 0);
        window.__timelines[ID] = tl;
        draw(0);
      })();`;
  try {
    new vm.Script(script, { filename: `${id}.inline.js` });
  } catch (err) {
    throw new Error(`Generated beat-flash script for ${id} does not parse: ${err.message}`);
  }
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- Generated by tools/blocks/beatflash.mjs (Adits beat-flash captions). Regenerate instead of hand-editing. -->
  </head>
  <body>
    <template>
      <style>${css}
      </style>
      <div id="root" data-composition-id="${id}" data-width="${width}" data-height="${height}">
        <div id="${id}-stage"></div>
      </div>
      <script>${script}
      </script>
    </template>
  </body>
</html>
`;
}

export async function generateBeatflash(opts) {
  const jobDir = resolve(opts.job);
  const words = String(opts.words || '').split('|').map((s) => s.trim());
  while (words.length < 3) words.push('');
  if (!words.some(Boolean)) throw new Error('--words needs at least one of "BASS|MID|TREBLE"');
  const effect = opts.effect || 'none';
  if (!EFFECTS.includes(effect)) throw new Error(`--effect must be one of ${EFFECTS.join(', ')}`);
  const styles = readJson(join(ROOT, 'library', 'caption-styles.json')).styles;
  const style = styles[opts.style || 'modern'];
  if (!style) throw new Error(`Unknown style ${opts.style}`);
  const geo = jobGeometry(jobDir);
  const duration = Number(opts.duration) || geo.rootDuration || 10;
  const fps = Number(opts.fps) || 24;
  const id = opts.id || 'beatflash';
  if (!opts.audio) throw new Error('--audio <music file> is required');
  const table = await analyzeToFile(resolve(opts.audio), join(jobDir, 'data', `${id}.audio.json`), {
    fps, duration: duration + 1 / fps, offset: Number(opts['audio-offset'] || 0), clock: 'default',
  });
  const frames = flashFrames(table, { source: opts.source || 'bands', thresh: Number(opts.thresh ?? 0.25), decay: Number(opts.decay ?? 0.85) });
  const scale = Number(opts.scale ?? 1.4);
  const sizePx = Math.round(geo.width * (Number(opts['size-pct'] ?? 8) / 100) * 1.6);
  const positions = { 'top-band': geo.height * 0.1667, center: geo.height * 0.45, captions: geo.height * 0.7 };
  const centerY = Number(opts.y) || positions[opts.position || 'top-band'];
  if (centerY + sizePx * scale > geo.safe.bottom) throw new Error(`Beat-flash words would reach the bottom no-text zone at this size/position.`);
  const html = buildBeatflashHtml({ id, words, frames, fps, style, effect, scale, sizePx, centerY, safe: geo.safe, width: geo.width, height: geo.height, duration, seed: opts.seed ?? 7 });
  mkdirSync(join(jobDir, 'compositions'), { recursive: true });
  const out = join(jobDir, 'compositions', `${id}.html`);
  writeFileSync(out, html);
  const start = Number(opts.start || 0);
  const host = `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${start}" data-duration="${duration}" data-track-index="${opts.track || 35}" data-width="${geo.width}" data-height="${geo.height}"></div>`;
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
  const shown = frames.filter((f) => f[0] >= 0).length;
  const switches = frames.filter((f, i) => i > 0 && f[0] !== frames[i - 1][0]).length;
  const perWord = [0, 1, 2].map((k) => frames.filter((f) => f[0] === k).length);
  return { out, host, frames: frames.length, shown, switches, perWord, source: opts.source || 'bands' };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job || !a.words || !a.audio) {
    console.error('Usage: beatflash.mjs --job <dir> --words "BASS|MID|TREBLE" --audio <music> [--audio-offset s] [--source bands|onsets] [--thresh 0.25] [--decay 0.85] [--scale 1.4] [--effect none|neon|shadow|rgb|vertical_ghost|shake] [--style modern] [--size-pct 8] [--position top-band|center|captions] [--start s] [--duration s] [--id x] [--insert]');
    process.exit(2);
  }
  const res = await generateBeatflash({ ...a, insert: Boolean(a.insert) });
  console.log(`Wrote ${res.out}: ${res.frames} frames (${res.source}), a word is shown on ${res.shown}, ${res.switches} switches, frames per word [bass, mid, treble] = [${res.perWord.join(', ')}]`);
  console.log(a.insert ? 'Host inserted into index.html' : `Host element:\n${res.host}`);
}
