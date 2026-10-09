// rcg transition: Adits cut transitions (effects/auto/Transitions.js) at a cut in a job.
// Ported with the same curves and constants; what changed:
//   - progress is timeline time ((t - at) / d), not performance.now() (Adits' own header notes
//     an offline export could show only 1-2 frames of a punch)
//   - the glitch seed is seeded (--seed), not Math.random()
//   - crossfade works: Adits captures the frame just before drawing it back, so its crossfade
//     blends a frame with itself; here the outgoing clip continues under the incoming shot,
//     which fades in over it (alpha 1 - t of the old frame, as Adits intended)
//   - Adits draws on the finished frame (captions included); here flash and the glitch's colour
//     washes cover the frame, while the zoom punch and glitch bands move the footage layers
//     (the shot and any PNP cut-out following it) and leave text steady
//
// Styles (Adits names): flash_white, flash_black, glitch_punch, zoom_punch, crossfade; plus flash_bloom
// (new, from the user's marketing reference: a soft overexposed white bloom over the shot).
//   flash:   full-frame white/black, alpha (1 - t)^2
//   glitch:  alpha (1 - t)^1.5; 3 + floor((1 - t) * 4) bands re-rolled 20 times per punch,
//            each 4 px + up to 6% of the height, shifted up to +/-6% of the width;
//            #ff2b6f / #2bd4ff washes ('lighter') at alpha * 0.25, offset -2 / +2 px
//   zoom:    ease = 1 - (1 - t)^3; scale 1 + 0.18 * (1 - ease); blur 10 * (1 - ease) px
//   crossfade: linear
//   bloom:   alpha rises over the first 30% then falls, (u / 0.3) and ((1 - u) / 0.7)^1.5, peak 0.85;
//            the shot (and its PNP followers) brightens and blurs with it on the inner .rcg-tx
//            wrapper, never on the camera's own element (rcg camera rewrites its filter each frame)
//   light_leak (new, from the split-screen reference Video-94146): a warm screen-blended wash from
//            0.6 D before the cut to 0.4 D after it, peak 0.9, hue drifting yellow -> pink -> orange;
//            needs no --to (it covers the whole frame)
//   mirror_whip (new, from the marketing reference Video-54041): centred on the cut, D/2 either side.
//            The shot slides out (ease-in, (2u)^2) by 55% of the frame and the next slides in from the
//            other side (ease-out); -webkit-box-reflect mirrors the frame into the gap the slide opens,
//            and an SVG blur along the slide (sigma 40 px at 1920 high, peak mid-cut) smears it.
//            --dir up|down|left|right (default up). The shot and its PNP followers move; text stays.
//   zoom_blur (new, same reference): centred on the cut; scale up to 1.45 into the cut and back down
//            out of it, blur up to 18 px and a little brightness at the cut.
//
// Usage:
//   node tools/blocks/transition.mjs --job <dir> --at 4.0 --style zoom_punch|flash_bloom --to "#w2" [--from "#w1"]
//        [--d 0.25] [--seed 1] [--id tx1] [--dir up|down|left|right]
//   --to   the incoming shot wrapper (zoom, glitch, crossfade, bloom); --from the outgoing one (crossfade)

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { elementSpan, rootAttrs } from './camera.mjs';

export const STYLES = ['flash_white', 'flash_black', 'glitch_punch', 'zoom_punch', 'crossfade', 'flash_bloom', 'light_leak', 'mirror_whip', 'zoom_blur'];
const f3 = (n) => +Number(n).toFixed(3);
const MAX_BANDS = 7;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The <video> clip active at time `at` inside a wrapper (its tag and timing). */
function clipAt(html, wrapperId, at) {
  const span = elementSpan(html, wrapperId);
  if (!span) throw new Error(`No element #${wrapperId}`);
  const tags = span.inner.match(/<video\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const a = (n) => Number(tag.match(new RegExp(`\\s${n}="([^"]+)"`))?.[1] || 0);
    if (/\bid="[^"]*-(gp\d|xf|fill)"/.test(tag)) continue; // our own clones
    const s = a('data-start');
    const d = a('data-duration');
    if (at >= s - 1e-6 && at < s + d - 1e-6) return { tag, start: s, dur: d, mediaStart: a('data-media-start'), track: a('data-track-index') };
  }
  throw new Error(`No clip inside #${wrapperId} is playing at ${at} s`);
}

/** Wrap a wrapper's contents in an inner .rcg-tx div once (zoom punch animates it, not the camera's element). */
function ensureInner(html, wrapperId) {
  const span = elementSpan(html, wrapperId);
  if (!span) throw new Error(`No element #${wrapperId}`);
  if (span.inner.includes(`id="${wrapperId}-tx"`)) return html;
  const inner = `\n        <div id="${wrapperId}-tx" class="rcg-tx" style="position: absolute; inset: 0; transform-origin: 50% 50%;">${span.inner}</div>\n      `;
  const startInner = span.start + span.openTag.length;
  return html.slice(0, startInner) + inner + html.slice(startInner + span.inner.length);
}

/** PNP layers following a camera wrapper (rcg pnp writes FOLLOW = "#w1"). */
function followers(html, wrapperSel) {
  const out = [];
  for (const m of html.matchAll(/\/\/ rcg:pnp ([\w-]+) begin[\s\S]*?var FOLLOW = ("[^"]*"|null);/g)) {
    if (m[2] !== 'null' && JSON.parse(m[2]) === wrapperSel) out.push(m[1]);
  }
  return out;
}

export function applyTransition(opts) {
  const jobDir = resolve(opts.job);
  const indexPath = join(jobDir, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  const root = rootAttrs(html);
  const style = opts.style;
  if (!STYLES.includes(style)) throw new Error(`--style must be one of ${STYLES.join(', ')}`);
  const at = Number(opts.at);
  if (!Number.isFinite(at)) throw new Error('--at <seconds> is required');
  const d = Math.max(1 / 60, Number(opts.d ?? 0.25)); // Adits default 250 ms
  const id = opts.id || `tx-${String(at).replace('.', '_')}`;
  const toId = opts.to ? String(opts.to).replace(/^#/, '') : null;
  const fromId = opts.from ? String(opts.from).replace(/^#/, '') : null;
  if (!['flash_white', 'flash_black', 'light_leak'].includes(style) && !toId) throw new Error(`${style} needs --to "#<incoming shot wrapper>"`);
  if (style === 'crossfade' && !fromId) throw new Error('crossfade needs --from "#<outgoing shot wrapper>"');
  const seedVal = mulberry32(Number(opts.seed ?? 1))() * 1000;
  const W = root.width;
  const H = root.height;

  // Remove an earlier run with this id (markup and script).
  html = html.replace(new RegExp(`\\s*<!-- rcg:tx ${id} begin[\\s\\S]*?<!-- rcg:tx ${id} end -->`, 'g'), '');
  html = html.replace(new RegExp(`      // rcg:tx ${id} begin[\\s\\S]*?// rcg:tx ${id} end\\n`), '');

  const insertMarkup = (wrapperId, markup) => {
    const span = elementSpan(html, wrapperId);
    const innerEnd = span.start + span.openTag.length + span.inner.length;
    html = `${html.slice(0, innerEnd)}\n        <!-- rcg:tx ${id} begin -->${markup}\n        <!-- rcg:tx ${id} end -->\n      ${html.slice(innerEnd)}`;
  };
  const insertTop = (markup) => {
    // Just inside the root's closing tag: the last </div> before the main timeline script.
    const rootEnd = html.lastIndexOf('</div>', html.lastIndexOf('<script>'));
    html = `${html.slice(0, rootEnd)}  <!-- rcg:tx ${id} begin -->${markup}\n      <!-- rcg:tx ${id} end -->\n    ${html.slice(rootEnd)}`;
  };

  let script = '';
  if (style === 'flash_white' || style === 'flash_black') {
    insertTop(`\n      <div id="${id}" class="rcg-txflash" aria-hidden="true" style="position: absolute; inset: 0; z-index: 95; pointer-events: none; opacity: 0; background: ${style === 'flash_white' ? '#ffffff' : '#000000'};"></div>`);
    script = `        var el = document.getElementById(${JSON.stringify(id)});
        function apply(t) { var u = (t - AT) / D; el.style.opacity = u >= 0 && u < 1 ? Math.pow(1 - u, 2).toFixed(4) : "0"; }`;
  } else if (style === 'flash_bloom') {
    insertTop(`
      <div id="${id}" class="rcg-txflash" aria-hidden="true" style="position: absolute; inset: 0; z-index: 95; pointer-events: none; opacity: 0; background: radial-gradient(ellipse 70% 60% at 50% 42%, #ffffff 0%, rgba(255,250,242,0.92) 55%, rgba(255,255,255,0.8) 100%);"></div>`);
    const layers = [toId, ...followers(html, `#${toId}`).map((p) => `${p}-wrap`)];
    for (const l of layers) html = ensureInner(html, l);
    script = `        var el = document.getElementById(${JSON.stringify(id)});
        var els = ${JSON.stringify(layers.map((l) => `${l}-tx`))}.map(function (i) { return document.getElementById(i); });
        function bloom(u) { return u < 0 || u >= 1 ? 0 : 0.85 * (u < 0.3 ? u / 0.3 : Math.pow((1 - u) / 0.7, 1.5)); }
        function apply(t) {
          var o = bloom((t - AT) / D);
          el.style.opacity = o.toFixed(4);
          els.forEach(function (e) { e.style.filter = o > 0.001 ? "brightness(" + (1 + 1.1 * o).toFixed(3) + ") blur(" + (7 * o * (W / 1080)).toFixed(2) + "px)" : ""; });
        }`;
  } else if (style === 'light_leak') {
    // A warm tinted wash (screen blend) that starts 60% of D before the cut and fades out after it,
    // its hue drifting yellow -> pink -> orange (measured: 2-3 frames of tint over the outgoing shot).
    insertTop(`
      <div id="${id}" class="rcg-txflash" aria-hidden="true" style="position: absolute; inset: 0; z-index: 95; pointer-events: none; opacity: 0; mix-blend-mode: screen; background: linear-gradient(160deg, #ffd36b 0%, #ff7aa8 52%, #ff8a3d 100%);"></div>`);
    script = `        var el = document.getElementById(${JSON.stringify(id)});
        var T0 = AT - 0.6 * D;
        function leak(u) { return u < 0 || u >= 1 ? 0 : 0.9 * (u < 0.45 ? u / 0.45 : Math.pow((1 - u) / 0.55, 1.6)); }
        function apply(t) {
          var u = (t - T0) / D, o = leak(u);
          el.style.opacity = o.toFixed(4);
          el.style.filter = o > 0.001 ? "hue-rotate(" + (-28 + 56 * Math.max(0, Math.min(1, u))).toFixed(1) + "deg)" : "";
        }`;
  } else if (style === 'zoom_punch') {
    const layers = [toId, ...followers(html, `#${toId}`).map((p) => `${p}-wrap`)];
    for (const l of layers) html = ensureInner(html, l);
    script = `        var els = ${JSON.stringify(layers.map((l) => `${l}-tx`))}.map(function (i) { return document.getElementById(i); });
        function apply(t) {
          var u = (t - AT) / D, on = u >= 0 && u < 1;
          var e = on ? 1 - Math.pow(1 - u, 3) : 1;
          var s = 1 + 0.18 * (1 - e), b = 10 * (1 - e) * (W / 1280);
          els.forEach(function (el) { el.style.transform = on ? "scale(" + s.toFixed(5) + ")" : ""; el.style.filter = on && b > 0.01 ? "blur(" + b.toFixed(2) + "px)" : ""; });
        }`;
  } else if (style === 'mirror_whip') {
    const dir = String(opts.dir || 'up');
    const V = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    if (!V) throw new Error('--dir must be up, down, left or right');
    const layers = [toId, ...followers(html, `#${toId}`).map((p) => `${p}-wrap`)];
    for (const l of layers) html = ensureInner(html, l);
    insertTop(`
      <svg id="${id}-defs" aria-hidden="true" width="0" height="0" style="position: absolute;"><filter id="${id}-mb" x="-0.1" y="-0.6" width="1.2" height="2.2"><feGaussianBlur id="${id}-mbg" stdDeviation="0 0" /></filter></svg>`);
    // The side the slide uncovers: out of the cut it is behind the motion, into it ahead of it.
    const side = { up: ['below', 'above'], down: ['above', 'below'], left: ['right', 'left'], right: ['left', 'right'] }[dir];
    script = `        var els = ${JSON.stringify(layers.map((l) => `${l}-tx`))}.map(function (i) { return document.getElementById(i); });
        var blur = document.getElementById(${JSON.stringify(`${id}-mbg`)});
        var VX = ${V[0]}, VY = ${V[1]}, SIDE = ${JSON.stringify(side)}, URL = "url(#${id}-mb)";
        function apply(t) {
          var u = (t - (AT - D / 2)) / D, on = u >= 0 && u < 1;
          if (!on) { els.forEach(function (el) { el.style.transform = ""; el.style.filter = ""; el.style.webkitBoxReflect = ""; }); blur.setAttribute("stdDeviation", "0 0"); return; }
          var out = u < 0.5, v = out ? u / 0.5 : (u - 0.5) / 0.5;
          var k = out ? v * v : -(1 - v) * (1 - v);
          var dx = VX * 0.55 * W * k, dy = VY * 0.55 * H * k;
          var sg = (40 * H / 1920 * Math.sin(Math.PI * u)).toFixed(2);
          blur.setAttribute("stdDeviation", VY !== 0 ? "0 " + sg : sg + " 0");
          els.forEach(function (el) {
            el.style.transform = "translate(" + dx.toFixed(1) + "px, " + dy.toFixed(1) + "px)";
            el.style.webkitBoxReflect = (out ? SIDE[0] : SIDE[1]) + " 0px";
            el.style.filter = URL;
          });
        }`;
  } else if (style === 'zoom_blur') {
    const layers = [toId, ...followers(html, `#${toId}`).map((p) => `${p}-wrap`)];
    for (const l of layers) html = ensureInner(html, l);
    script = `        var els = ${JSON.stringify(layers.map((l) => `${l}-tx`))}.map(function (i) { return document.getElementById(i); });
        function apply(t) {
          var u = (t - (AT - D / 2)) / D, on = u >= 0 && u < 1;
          var w = on ? Math.sin(Math.PI * u) : 0;
          var s = 1 + 0.45 * w * w, b = 18 * w * (W / 1080);
          els.forEach(function (el) {
            el.style.transform = on ? "scale(" + s.toFixed(5) + ")" : "";
            el.style.filter = on && b > 0.05 ? "blur(" + b.toFixed(2) + "px) brightness(" + (1 + 0.25 * w).toFixed(3) + ")" : "";
          });
        }`;
  } else if (style === 'glitch_punch') {
    const clip = clipAt(html, toId, at);
    const media = f3(clip.mediaStart + (at - clip.start));
    const dur = f3(Math.min(d, clip.start + clip.dur - at));
    const bands = [];
    for (let i = 0; i < MAX_BANDS; i++) {
      const clone = clip.tag
        .replace(/\bid="([^"]+)"/, (_, v) => `id="${v}-gp${i}"`)
        .replace(/data-start="[^"]*"/, `data-start="${f3(at)}"`)
        // 1 ms apart: HyperFrames flags identical media entries (duplicate_media_discovery_risk).
        .replace(/data-duration="[^"]*"/, `data-duration="${f3(dur - i * 0.001)}"`)
        .replace(/data-media-start="[^"]*"/, `data-media-start="${media}"`)
        .replace(/data-track-index="(\d+)"/, (_, n) => `data-track-index="${Number(n) + 70 + i}"`);
      bands.push(`\n        <div id="${id}-b${i}" class="rcg-gpband" style="position: absolute; inset: 0; clip-path: inset(100% 0 0 0);">${/\smuted\b/.test(clone) ? clone : clone.replace(/^<video/i, '<video muted')}</video></div>`);
    }
    insertMarkup(toId, bands.join(''));
    insertTop(`\n      <div id="${id}-wash" aria-hidden="true" style="position: absolute; inset: 0; z-index: 95; pointer-events: none; opacity: 0;">
        <div style="position: absolute; inset: 0; background: #ff2b6f; mix-blend-mode: plus-lighter; transform: translateX(-2px);"></div>
        <div style="position: absolute; inset: 0; background: #2bd4ff; mix-blend-mode: plus-lighter; transform: translateX(2px);"></div>
      </div>`);
    script = `        var bands = [];
        for (var i = 0; i < ${MAX_BANDS}; i++) bands.push(document.getElementById(${JSON.stringify(id)} + "-b" + i));
        var wash = document.getElementById(${JSON.stringify(`${id}-wash`)});
        var SEED = ${seedVal};
        function pr(s) { var x = Math.sin(s * 12.9898) * 43758.5453; return x - Math.floor(x); } // Adits pseudoRandom
        function apply(t) {
          var u = (t - AT) / D, on = u >= 0 && u < 1;
          var a = on ? Math.pow(1 - u, 1.5) : 0;
          var n = on && a > 0.01 ? 3 + Math.floor((1 - u) * 4) : 0;
          for (var i = 0; i < bands.length; i++) {
            if (i >= n) { bands[i].style.clipPath = "inset(100% 0 0 0)"; bands[i].style.transform = ""; continue; }
            var r = pr(SEED + i * 37.13 + Math.floor(u * 20));
            var y = Math.floor(r * H), h = 4 + Math.floor(pr(r + 1) * H * 0.06);
            var sh = Math.round((pr(r + 2) - 0.5) * W * 0.12 * (1 - u));
            bands[i].style.clipPath = "inset(" + y + "px 0 " + Math.max(0, H - y - h) + "px 0)";
            bands[i].style.transform = "translateX(" + sh + "px)";
          }
          wash.style.opacity = on && a > 0.01 ? (a * 0.25).toFixed(4) : "0";
        }`;
  } else if (style === 'crossfade') {
    const clip = clipAt(html, fromId, at - 1e-3);
    const media = f3(clip.mediaStart + (at - clip.start));
    const clone = clip.tag
      .replace(/\bid="([^"]+)"/, (_, v) => `id="${v}-xf"`)
      .replace(/data-start="[^"]*"/, `data-start="${f3(at)}"`)
      .replace(/data-duration="[^"]*"/, `data-duration="${f3(d)}"`)
      .replace(/data-media-start="[^"]*"/, `data-media-start="${media}"`)
      .replace(/data-track-index="(\d+)"/, (_, n) => `data-track-index="${Number(n) + 80}"`);
    insertMarkup(fromId, `\n        ${/\smuted\b/.test(clone) ? clone : clone.replace(/^<video/i, '<video muted')}</video>`);
    const fading = [toId, ...followers(html, `#${toId}`).map((p) => `${p}-follow`)];
    script = `        var els = ${JSON.stringify(fading)}.map(function (i) { return document.getElementById(i); });
        function apply(t) { var u = (t - AT) / D; var o = u >= 0 && u < 1 ? u : 1; els.forEach(function (el) { el.style.opacity = u >= 0 && u < 1 ? o.toFixed(4) : ""; }); }`;
  }

  const block = `      // rcg:tx ${id} begin (${style}, generated by tools/blocks/transition.mjs)
      (function () {
        var AT = ${f3(at)}, D = ${f3(d)}, W = ${W}, H = ${H};
${script}
        var drv = { _t: 0 };
        Object.defineProperty(drv, "t", { get: function () { return this._t; }, set: function (v) { this._t = v; apply(v); } });
        tl.to(drv, { t: ${root.duration}, duration: ${root.duration}, ease: "none" }, 0);
        apply(0);
      })();
      // rcg:tx ${id} end
`;
  const reg = html.lastIndexOf('window.__timelines');
  const lineStart = html.lastIndexOf('\n', reg) + 1;
  html = `${html.slice(0, lineStart)}${block}${html.slice(lineStart)}`;
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try { new vm.Script(m[1]); } catch (err) { throw new Error(`index.html script would not parse after the transition: ${err.message}`); }
  }
  writeFileSync(indexPath, html);
  return { id, style, at, d };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (a.list) { console.log(STYLES.join('\n')); process.exit(0); }
  if (!a.job || a.at == null || !a.style) {
    console.error(`Usage: transition.mjs --job <dir> --at <s> --style ${STYLES.join('|')} [--to "#w2"] [--from "#w1"] [--d 0.25] [--seed 1] [--id tx1] [--dir up|down|left|right]`);
    process.exit(2);
  }
  const r = applyTransition(a);
  console.log(`Transition ${r.id}: ${r.style} at ${r.at} s for ${r.d} s`);
}
