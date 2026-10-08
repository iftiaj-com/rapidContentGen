// Vox Parallax components for rcg style (tools/blocks/style.mjs).
//
// parallax: the multiplane camera. Layers from `rcg layers` (data/layers-<name>.json) sit in a CSS
// 3D stage at depths z (px behind the focus plane; negative = in front), each pre-scaled by
// (P + z) / P so the still frame looks unchanged at rest, where P (the perspective) comes from the
// lens: P = focal / 36 * W (a 35 mm lens on a full-frame-wide frame). The camera moves in x, y and z;
// perspective does the parallax: far layers shift and grow less than near ones. Node computes the
// camera path once per output step (the stepped fps, 12 by default), checks that no layer edge
// can come into frame (and scales a layer up if it would), and embeds the table; the page only
// looks it up, so every frame is a pure function of time.
//
// The other components are the Vox overlays: highlight (orange highlighter label), serif-title
// (with an optional hand-drawn arrow), board (cardboard or archival paper ground), photo-card
// (a tilted print) and archive (an aged, toned photo on paper).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../../tools/lib/config.mjs';

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const hide = (obj, key, value) => Object.defineProperty(obj, key, { value, enumerable: false, writable: true });

function oneOf(v, list, what) {
  if (!list.includes(v)) throw new Error(`${what} must be one of ${list.join(', ')} (got "${v}")`);
  return v;
}

function colour(ctx, v, what) {
  if (ctx.tokens[v]) return `var(--${v})`;
  if (/^(#|rgb|hsl)/.test(String(v))) return v;
  throw new Error(`${what}: unknown colour "${v}". Tokens: ${Object.keys(ctx.tokens).join(', ')} or a CSS colour`);
}

/** "mid:-140,60;fg:20,0" -> { mid: [-140, 60], fg: [20, 0] } */
function pairs(spec, what) {
  const out = {};
  for (const part of String(spec || '').split(';').map((s) => s.trim()).filter(Boolean)) {
    const [k, v] = part.split(':');
    const nums = String(v || '').split(',').map(Number);
    if (!k || nums.some((n) => !Number.isFinite(n))) throw new Error(`${what}: "${part}" (use name:number[,number])`);
    out[k.trim()] = nums;
  }
  return out;
}

// ── Textures (generated once per job with ffmpeg, deterministic seeds) ─────────

export function ensureTextures(jobDir) {
  const dir = join(jobDir, 'assets', 'textures');
  mkdirSync(dir, { recursive: true });
  const ffmpeg = loadConfig().bin.ffmpeg || 'ffmpeg';
  const make = (file, src, vf) => {
    if (existsSync(join(dir, file))) return;
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-vf', vf, '-frames:v', '1', join(dir, file)], { windowsHide: true });
  };
  for (let i = 0; i < 4; i++) make(`grain-${i}.png`, 'color=c=0x808080:s=512x512:d=1', `format=gray,noise=alls=64:allf=u:all_seed=${101 + i}`);
  const tone = (r, g, b, k) => `format=rgb24,lutrgb=r='clip(${r}+(val-128)*${k},0,255)':g='clip(${g}+(val-128)*${k},0,255)':b='clip(${b}+(val-128)*${k},0,255)'`;
  make('paper.png', 'color=c=0x808080:s=270x480:d=1', `format=gray,noise=alls=100:allf=u:all_seed=11,scale=1080:1920:flags=bicubic,gblur=sigma=14,noise=alls=12:allf=u:all_seed=12,${tone(214, 205, 187, 0.9)}`);
  make('cardboard.png', 'color=c=0x808080:s=540x960:d=1', `format=gray,noise=alls=100:allf=u:all_seed=21,scale=1080:1920:flags=bicubic,gblur=sigma=3,noise=alls=22:allf=u:all_seed=22,${tone(166, 132, 90, 0.75)}`);
  return 'assets/textures';
}

// ── Camera paths ────────────────────────────────────────────────────────────

const easeSine = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, u)));
const easeQuad = (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));

/** Camera offset at time t (px; z > 0 is toward the scene). */
function cameraAt(move, t, D, a, P, zFront, W, H, ph) {
  const u = easeSine(t / D);
  const reach = a * 0.42 * (P + zFront); // a push never reaches the front layer
  const panX = a * 0.09 * W;
  const panY = a * 0.07 * H;
  switch (move) {
    case 'push': return [0, 0, u * reach];
    case 'pull': return [0, 0, (1 - u) * reach];
    case 'pan-right': return [(u - 0.5) * 2 * panX, 0, u * reach * 0.25];
    case 'pan-left': return [(0.5 - u) * 2 * panX, 0, u * reach * 0.25];
    case 'rise': return [0, (0.5 - u) * 2 * panY, u * reach * 0.25];
    case 'fall': return [0, (u - 0.5) * 2 * panY, u * reach * 0.25];
    case 'drift': {
      const s = t / D;
      return [
        panX * 0.55 * Math.sin(2 * Math.PI * (ph[0] * s) + ph[1]),
        panY * 0.45 * Math.sin(2 * Math.PI * (ph[2] * s) + ph[3]),
        u * reach * 0.45,
      ];
    }
    case 'still': return [0, 0, 0];
    default: throw new Error(`parallax: move must be push, pull, pan-left, pan-right, rise, fall, drift or still (got "${move}")`);
  }
}

export const components = {
  'parallax': {
    summary: 'The multiplane shot: rcg layers output on a virtual 3D camera (push, pull, pan, rise, fall, drift), depth blur, haze, dust, grain, vignette, light leak, paper, stepped fps. object="mid:-140,60" moves a layer on its own.',
    fullFrame: true,
    minDuration: 0.5,
    params: {
      layers: '', move: 'push', amount: 0.5, focal: 35, depths: '', object: '', objectIn: 0, objectOut: 0,
      blur: '', focusX: 0.5, focusY: 0.5, haze: 0.15, hazeColor: '#e8eef3', dust: 0, grain: 0.28,
      vignette: 0.35, leak: 0, paper: 0, lens: 3, fps: 12,
    },
    prepare(p, { geo, rnd, jobDir }) {
      if (!p.layers) throw new Error('parallax: --layers is required (data/layers-<name>.json from rcg layers)');
      const file = join(jobDir, p.layers);
      if (!existsSync(file)) throw new Error(`parallax: ${p.layers} not found (run rcg layers first)`);
      const m = JSON.parse(readFileSync(file, 'utf8'));
      for (const name of m.order) {
        const f = join(jobDir, m.dir, m.layers[name].file);
        if (!existsSync(f)) throw new Error(`parallax: layer file missing: ${m.dir}/${m.layers[name].file}`);
      }
      hide(p, '_m', m);
      hide(p, '_tex', ensureTextures(jobDir));
      hide(p, '_ph', [0.35 + rnd() * 0.3, rnd() * 6.283, 0.25 + rnd() * 0.3, rnd() * 6.283, rnd() * 6.283]);
      hide(p, '_dust', Array.from({ length: Math.max(0, Math.min(80, p.dust | 0)) }, () => [rnd(), rnd(), 2 + rnd() * 5, 0.3 + rnd() * 0.45, (rnd() - 0.5) * 30, -10 - rnd() * 30]));
      oneOf(Number(p.focal), [24, 28, 35, 50, 85], 'parallax: focal');
      if (!(p.amount >= 0 && p.amount <= 1)) throw new Error('parallax: amount must be 0-1');
    },
    render(p, ctx) {
      const { W, H, D } = ctx;
      const m = p._m;
      const P = (p.focal / 36) * W;
      const cut = m.order.slice(1);
      const n = cut.length;
      // Depths in units of P: bg 1.4; cut-outs from +0.15 (back) to -0.3 (front).
      const z = { bg: 1.4 * P };
      cut.forEach((name, i) => { z[name] = n === 1 ? 0 : (0.15 - (0.45 * i) / (n - 1)) * P; });
      for (const [k, v] of Object.entries(pairs(p.depths, 'parallax: depths'))) {
        if (!(k in z)) throw new Error(`parallax: depths names "${k}", layers are ${m.order.join(', ')}`);
        z[k] = v[0] * P;
      }
      for (const k of m.order) if (P + z[k] < 0.2 * P) throw new Error(`parallax: layer ${k} is too close to the camera (depth ${r2(z[k] / P)})`);
      const zFront = Math.min(...m.order.map((k) => z[k]));
      // Depth blur: the far background a little, the front-most cut-out more, the rest sharp.
      const blur = { bg: 2.5 };
      if (n >= 2) blur[cut[n - 1]] = 6;
      for (const [k, v] of Object.entries(pairs(p.blur, 'parallax: blur'))) blur[k] = v[0];
      const objects = pairs(p.object, 'parallax: object');
      for (const k of Object.keys(objects)) if (!cut.includes(k)) throw new Error(`parallax: object names "${k}", cut-out layers are ${cut.join(', ') || '(none)'}`);
      const oIn = Math.max(0, p.objectIn);
      const oOut = p.objectOut > 0 ? Math.min(D, p.objectOut) : D;
      // Cover fit of the source image, with a focus point for the crop.
      const cover = Math.max(W / m.width, H / m.height);
      const ew = m.width * cover;
      const eh = m.height * cover;
      const offX = (0.5 - p.focusX) * (ew - W);
      const offY = (0.5 - p.focusY) * (eh - H);
      // Camera table, one row per output step.
      const rate = p.fps > 0 ? p.fps : 60;
      const steps = Math.ceil(D * rate) + 1;
      const rows = [];
      for (let k = 0; k < steps; k++) {
        const t = Math.min(D, k / rate);
        const [cx, cy, cz] = cameraAt(p.move, t, D, p.amount, P, zFront, W, H, p._ph);
        const ou = easeQuad((t - oIn) / Math.max(1e-3, oOut - oIn));
        const row = [r1(cx), r1(cy), r1(cz)];
        for (const name of cut) { const o = objects[name] || [0, 0]; row.push(r1(o[0] * ou), r1((o[1] || 0) * ou)); }
        rows.push(row);
      }
      // Coverage: the background, and any cut-out touching a frame edge, must keep covering the
      // frame through the whole move (blur fades an element's edge by about 3x its radius).
      const over = {};
      const touches = (k) => k === 'bg' || Object.values(m.layers[k].touches || {}).some(Boolean);
      for (const k of m.order) {
        let need = 1;
        if (touches(k)) {
          const ci = cut.indexOf(k);
          for (const row of rows) {
            const kp = P / (P + z[k] - row[2]);
            const kRel = (P + z[k]) / (P + z[k] - row[2]);
            const ox = ci >= 0 ? row[3 + ci * 2] : 0;
            const oy = ci >= 0 ? row[4 + ci * 2] : 0;
            const cx = (offX * kRel) + (ox * kRel) - row[0] * kp;
            const cy = (offY * kRel) + (oy * kRel) - row[1] * kp;
            const margin = 3 * (blur[k] || 0) + 2;
            need = Math.max(need, (W / 2 + Math.abs(cx) + margin) / ((ew / 2) * kRel), (H / 2 + Math.abs(cy) + margin) / ((eh / 2) * kRel));
          }
        }
        over[k] = Math.round(need * 1000) / 1000;
      }
      const layers = m.order.map((k) => ({ id: k, z: r1(z[k]), s: Math.round(((P + z[k]) / P) * over[k] * 10000) / 10000, ci: cut.indexOf(k) }));
      const url = (f) => `${m.dir}/${f}`;
      const hazeZ = n ? r1((z.bg + z[cut[0]]) / 2) : r1(z.bg * 0.5);
      const hazeS = Math.round(((P + hazeZ) / P) * Math.max(over.bg, 1.05) * 10000) / 10000;
      const dustZ = n ? r1(z[cut[n - 1]] * 0.5 - 0.05 * P) : 0;
      const css = `
      ${ctx.sel('stage')} {
        position: absolute;
        inset: 0;
        overflow: hidden;
        perspective: ${r1(P)}px;
        perspective-origin: 50% 50%;
        background: #000;
      }
      #${ctx.id}-layer .plane {
        position: absolute;
        left: ${r1((W - ew) / 2)}px;
        top: ${r1((H - eh) / 2)}px;
        width: ${r1(ew)}px;
        height: ${r1(eh)}px;
        background-size: 100% 100%;
        background-repeat: no-repeat;
        transform-origin: 50% 50%;
        will-change: transform;
      }
${m.order.map((k) => `      ${ctx.sel(`p-${k}`)} { background-image: url("${ctx.esc(url(m.layers[k].file))}");${blur[k] ? ` filter: blur(${blur[k]}px);` : ''} }`).join('\n')}
      ${ctx.sel('haze')} {
        position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform-origin: 50% 50%;
        background: linear-gradient(to bottom, ${p.hazeColor} 0%, transparent 72%);
        opacity: ${r2(p.haze)};
      }
      #${ctx.id}-layer .mote {
        position: absolute; left: 0; top: 0; border-radius: 50%;
        background: radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 70%);
      }
      ${ctx.sel('lens')} {
        position: absolute; inset: 0;
        backdrop-filter: blur(${r1(p.lens)}px);
        -webkit-mask-image: radial-gradient(ellipse 70% 62% at 50% 50%, transparent 62%, #000 100%);
        mask-image: radial-gradient(ellipse 70% 62% at 50% 50%, transparent 62%, #000 100%);
      }
      ${ctx.sel('leak')} {
        position: absolute; inset: 0; mix-blend-mode: screen; opacity: 0;
        background: radial-gradient(circle at 12% 8%, rgba(255,160,70,0.85) 0%, rgba(255,90,30,0.35) 30%, rgba(255,90,30,0) 60%);
      }
      ${ctx.sel('paper')} { position: absolute; inset: 0; mix-blend-mode: multiply; opacity: ${r2(p.paper)}; background: url("${p._tex}/paper.png") center / cover; }
      ${ctx.sel('grain')} { position: absolute; inset: -64px; mix-blend-mode: overlay; opacity: ${r2(p.grain)}; background-image: url("${p._tex}/grain-0.png"); background-size: 512px 512px; }
      ${ctx.sel('vig')} { position: absolute; inset: 0; background: radial-gradient(ellipse 75% 65% at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,${r2(p.vignette)}) 100%); }`;
      const planes = m.order.map((k, i) => {
        const el = `<div class="plane" id="${ctx.idf(`p-${k}`)}" data-layout-allow-overflow></div>`;
        const hz = i === 0 && p.haze > 0 ? `\n            <div id="${ctx.idf('haze')}" data-layout-allow-overflow></div>` : '';
        return `\n            ${el}${hz}`;
      }).join('');
      const motes = p._dust.map((_, i) => `\n            <i class="mote" id="${ctx.idf(`m${i}`)}"></i>`).join('');
      const html = `
          <div id="${ctx.idf('stage')}">${planes}${motes}
          </div>${p.lens > 0 ? `\n          <div id="${ctx.idf('lens')}"></div>` : ''}${p.leak > 0 ? `\n          <div id="${ctx.idf('leak')}"></div>` : ''}${p.paper > 0 ? `\n          <div id="${ctx.idf('paper')}"></div>` : ''}${p.grain > 0 ? `\n          <div id="${ctx.idf('grain')}"></div>` : ''}${p.vignette > 0 ? `\n          <div id="${ctx.idf('vig')}"></div>` : ''}`;
      const js = `
            var P = ${r1(P)}, RATE = ${rate}, STEPPED = ${p.fps > 0 ? 'true' : 'false'};
            // The crop focus offset is in-plane, scaled by depth like object motion, so layers line up at rest.
            var OFFX = ${r1(offX)}, OFFY = ${r1(offY)};
            var ROWS = ${ctx.js(rows)};
            var LAYERS = ${ctx.js(layers)};
            var HAZE = { z: ${hazeZ}, s: ${hazeS} };
            var DUST = ${ctx.js(p._dust.map((d) => d.map(r2)))}, DUSTZ = ${dustZ};
            var LEAK = ${r2(p.leak)}, PH = ${r2(p._ph[4])};
            var els = LAYERS.map(function (l) { return $("p-" + l.id); });
            var haze = $("haze"), leak = $("leak"), grain = $("grain");
            var motes = DUST.map(function (d, i) { return $("m" + i); });
            var GRAIN = [0, 1, 2, 3].map(function (i) { return 'url("${p._tex}/grain-' + i + '.png")'; });
            function rowAt(t) {
              var f = t * RATE;
              if (STEPPED) return ROWS[Math.min(ROWS.length - 1, Math.floor(f + 1e-6))];
              var i = Math.min(ROWS.length - 2, Math.floor(f)), a = ROWS[i], b = ROWS[i + 1], u = Math.min(1, f - i);
              return a.map(function (v, k) { return v + (b[k] - v) * u; });
            }
            function apply(t) {
              var r = rowAt(t), cx = r[0], cy = r[1], cz = r[2];
              for (var i = 0; i < LAYERS.length; i++) {
                var l = LAYERS[i], k = (P + l.z) / P;
                var ox = ((l.ci >= 0 ? r[3 + l.ci * 2] : 0) + OFFX) * k, oy = ((l.ci >= 0 ? r[4 + l.ci * 2] : 0) + OFFY) * k;
                els[i].style.transform = "translate3d(" + (ox - cx).toFixed(2) + "px," + (oy - cy).toFixed(2) + "px," + (cz - l.z).toFixed(2) + "px) scale(" + l.s + ")";
              }
              if (haze) haze.style.transform = "translate3d(" + (-cx).toFixed(2) + "px," + (-cy).toFixed(2) + "px," + (cz - HAZE.z).toFixed(2) + "px) scale(" + HAZE.s + ")";
              var tq = STEPPED ? Math.floor(t * RATE + 1e-6) / RATE : t;
              for (var j = 0; j < motes.length; j++) {
                var d = DUST[j], x = d[0] * W + d[4] * tq, y = d[1] * H + d[5] * tq;
                motes[j].style.width = motes[j].style.height = d[2] + "px";
                motes[j].style.opacity = d[3];
                motes[j].style.transform = "translate3d(" + (x - cx).toFixed(1) + "px," + (y - cy).toFixed(1) + "px," + (cz - DUSTZ).toFixed(1) + "px)";
              }
              if (leak) leak.style.opacity = (LEAK * (0.55 + 0.45 * Math.sin(2 * Math.PI * 0.35 * tq + PH))).toFixed(3);
              if (grain) {
                var g = Math.floor(t * 24 + 1e-6), q = STEPPED ? Math.floor(t * RATE + 1e-6) : g;
                grain.style.backgroundImage = GRAIN[q % 4];
                grain.style.backgroundPosition = ((q * 197) % 512) + "px " + ((q * 331) % 512) + "px";
              }
            }
            var drv = { _t: 0 };
            Object.defineProperty(drv, "t", { get: function () { return this._t; }, set: function (v) { this._t = v; apply(v); } });
            tl.to(drv, { t: D, duration: D, ease: "none" }, 0);
            apply(0);`;
      hide(p, '_report', { P: r1(P), depths: Object.fromEntries(Object.entries(z).map(([k, v]) => [k, r2(v / P)])), over, steps });
      return { html, css, js };
    },
  },

  'highlight': {
    summary: 'The orange highlighter label: white serif text on a mottled orange swipe with ragged ends, wiped in left to right. One key word, name or date per beat.',
    sfx: { role: 'swipe', at: 0.05 },
    params: { text: 'Animation', x: null, y: 760, w: 600, h: 150, size: 78, min: 40, colour: 'orange', rotate: null, align: 'center', exit: 'wipe' },
    prepare(p, { rnd }) {
      if (p.rotate === null) p.rotate = r1((rnd() * 2 - 1) * 1.8);
      hide(p, '_edge', Array.from({ length: 12 }, () => r1(rnd() * 3.5)));
      hide(p, '_blots', Array.from({ length: 7 }, () => [r1(rnd() * 100), r1(rnd() * 100), r1(18 + rnd() * 30), rnd() > 0.5 ? 1 : 0]));
    },
    render(p, ctx) {
      oneOf(p.align, ['center', 'left'], 'highlight: align');
      oneOf(p.exit, ['wipe', 'cut'], 'highlight: exit');
      const m = ctx.motion;
      const e = p._edge;
      // Ragged left and right ends (brush/torn marker), straight top and bottom.
      const clip = `polygon(${e[0]}% 0, ${100 - e[1]}% 0, ${100 - e[2] * 0.4}% 22%, ${100 - e[3]}% 48%, ${100 - e[4] * 0.5}% 74%, ${100 - e[5]}% 100%, ${e[6]}% 100%, ${e[7] * 0.4}% 78%, ${e[8]}% 52%, ${e[9] * 0.5}% 26%)`;
      const blots = p._blots.map(([x, y, s, d]) => `radial-gradient(circle at ${x}% ${y}%, ${d ? 'rgba(228,40,6,0.55)' : 'rgba(255,120,40,0.45)'} 0%, transparent ${s}%)`).join(', ');
      const css = `
      ${ctx.sel('slot')} {
        position: absolute;
        left: ${r1(p.x - p.w / 2)}px; top: ${r1(p.y - p.h / 2)}px; width: ${p.w}px; height: ${p.h}px;
        display: flex; align-items: center; justify-content: ${p.align === 'left' ? 'flex-start' : 'center'};
      }
      ${ctx.sel('wipe')} { transform: rotate(${p.rotate}deg); clip-path: inset(0 100% 0 0); }
      ${ctx.sel('box')} {
        padding: 0.12em 0.55em 0.2em;
        background: ${blots}, ${colour(ctx, p.colour, 'highlight: colour')};
        clip-path: ${clip};
        color: #fff;
        white-space: nowrap;
      }
      ${ctx.sel('text')} { display: block; ${ctx.family('serif')} line-height: 1.1; letter-spacing: 0.005em; }`;
      const html = `
          <div id="${ctx.idf('slot')}"><div id="${ctx.idf('wipe')}"><div id="${ctx.idf('box')}"><span id="${ctx.idf('text')}"></span></div></div></div>`;
      const js = `
            fit($("text"), ${ctx.js(p.text)}, { font: ${ctx.js({ family: ctx.type.serif.family, weight: ctx.type.serif.weight })}, size: ${p.size}, min: ${p.min}, maxW: ${r1(p.w * 0.86)}, maxH: ${r1(p.h * 0.8)}, maxLines: 1, lh: 1.1 });
            tl.fromTo($("wipe"), { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: ${m.swipe}, ease: "${m.swipeEase}" }, 0);
            tl.fromTo($("text"), { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" }, 0.12);${p.exit === 'wipe' ? `
            tl.to($("wipe"), { clipPath: "inset(0% 0% 0% 100%)", duration: ${m.exit}, ease: "${m.exitEase}" }, Math.max(0.5, D - ${m.exit}));` : ''}`;
      return { html, css, js };
    },
  },

  'serif-title': {
    summary: 'A serif statement: light lines in sky blue, *emphasis* words bold slate; words rise in. arrow="x1,y1>x2,y2" draws a hand-drawn arrow after the words (bend curves it). scrim=0.85 puts the words on a soft paper strip (that opacity) when the photo is busy or mid-grey; the light blue needs it.',
    params: { text: 'Look at *this*', x: null, y: 520, w: 800, h: 420, size: 120, min: 56, tone: 'sky', accent: 'slate', align: 'left', arrow: '', bend: 0.45, shadow: false, scrim: 0 },
    prepare(p, { rnd }) {
      p.rotate = 0;
      hide(p, '_wob', Array.from({ length: 40 }, () => (rnd() * 2 - 1)));
    },
    render(p, ctx) {
      oneOf(p.align, ['left', 'center'], 'serif-title: align');
      const m = ctx.motion;
      let arrow = null;
      if (p.arrow) {
        const mm = String(p.arrow).match(/^\s*([-\d.]+)\s*,\s*([-\d.]+)\s*>\s*([-\d.]+)\s*,\s*([-\d.]+)\s*$/);
        if (!mm) throw new Error('serif-title: arrow is "x1,y1>x2,y2" in output pixels');
        const [x1, y1, x2, y2] = mm.slice(1).map(Number);
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const nx = -(y2 - y1) / dist;
        const ny = (x2 - x1) / dist;
        const c = [(x1 + x2) / 2 + nx * p.bend * dist * 0.5, (y1 + y2) / 2 + ny * p.bend * dist * 0.5];
        const pts = [];
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          const u = 1 - t;
          const w = Math.sin(t * Math.PI) * 3 * p._wob[i % 40];
          pts.push([u * u * x1 + 2 * u * t * c[0] + t * t * x2 + nx * w, u * u * y1 + 2 * u * t * c[1] + t * t * y2 + ny * w]);
        }
        const len = Math.ceil(pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0)) + 2;
        const ang = Math.atan2(y2 - c[1], x2 - c[0]);
        const head = [[x2 - Math.cos(ang + 0.5) * 30, y2 - Math.sin(ang + 0.5) * 30], [x2, y2], [x2 - Math.cos(ang - 0.5) * 30, y2 - Math.sin(ang - 0.5) * 30]];
        const d = (q) => `M ${q.map(([a, b]) => `${r1(a)} ${r1(b)}`).join(' L ')}`;
        arrow = { body: d(pts), head: d(head), len };
      }
      const css = `
      ${ctx.sel('slot')} {
        position: absolute;
        left: ${r1(p.x - p.w / 2)}px; top: ${r1(p.y - p.h / 2)}px; width: ${p.w}px; height: ${p.h}px;
        display: flex; align-items: center;
      }
      ${ctx.sel('text')} {
        display: block; ${p.scrim > 0 ? `width: fit-content; max-width: ${p.w}px; padding: 0.16em 0.32em 0.2em; ${p.align === 'center' ? 'margin: 0 auto;' : ''} transform: rotate(-0.8deg);` : `width: ${p.w}px;`}
        ${ctx.family('serif')}
        line-height: 1.0; letter-spacing: -0.01em; text-align: ${p.align};
        color: ${colour(ctx, p.tone, 'serif-title: tone')};
        ${p.shadow ? 'text-shadow: 0 2px 14px rgba(0,0,0,0.35);' : ''}
      }
      ${ctx.sel('text')} .em { font-weight: ${ctx.type['serif-bold'].weight}; color: ${colour(ctx, p.accent, 'serif-title: accent')}; letter-spacing: -0.02em; }
      ${ctx.sel('svg')} { position: absolute; left: 0; top: 0; overflow: visible; }`;
      const html = `
          <div id="${ctx.idf('slot')}"><span id="${ctx.idf('text')}"></span></div>${arrow ? `
          <svg id="${ctx.idf('svg')}" width="${ctx.W}" height="${ctx.H}" viewBox="0 0 ${ctx.W} ${ctx.H}" data-layout-allow-overflow>
            <path id="${ctx.idf('arrow')}" d="${arrow.body}" fill="none" stroke="var(--ink)" stroke-width="4.5" stroke-linecap="round" style="stroke-dasharray: ${arrow.len}; stroke-dashoffset: ${arrow.len};" />
            <path id="${ctx.idf('head')}" d="${arrow.head}" fill="none" stroke="var(--ink)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity="0" />
          </svg>` : ''}`;
      const js = `
            fit($("text"), ${ctx.js(p.text)}, { font: ${ctx.js({ family: ctx.type.serif.family, weight: ctx.type.serif.weight })}, em: ${ctx.js({ family: ctx.type['serif-bold'].family, weight: ctx.type['serif-bold'].weight })}, size: ${p.size}, min: ${p.min}, maxW: ${p.scrim > 0 ? r1(p.w - 0.7 * p.size) : p.w}, maxH: ${p.scrim > 0 ? r1(p.h - 0.4 * p.size) : p.h}, lh: 1.0 });
            var words = $("text").querySelectorAll(".w");
            for (var i = 0; i < words.length; i++) {
              tl.fromTo(words[i], { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.6, ease: "expo.out" }, i * 0.06);
            }
            var endWords = Math.min(1.2, words.length * 0.06 + 0.3);${p.scrim > 0 ? `
            tl.fromTo($("text"), { backgroundColor: "rgba(246,242,235,0)", boxShadow: "0 8px 22px rgba(0,0,0,0)" }, { backgroundColor: "rgba(246,242,235,${r2(p.scrim)})", boxShadow: "0 8px 22px rgba(0,0,0,0.18)", duration: 0.3, ease: "power1.out" }, 0);` : ''}${arrow ? `
            tl.to($("arrow"), { strokeDashoffset: 0, duration: 0.55, ease: "power1.inOut" }, endWords);
            tl.to($("head"), { opacity: 1, duration: 0.08 }, endWords + 0.5);
            tl.to($("svg"), { opacity: 0, duration: ${m.exit}, ease: "${m.exitEase}" }, Math.max(endWords + 0.6, D - ${m.exit}));` : ''}
            tl.to($("text"), { opacity: 0, y: -14, duration: ${m.exit}, ease: "${m.exitEase}" }, Math.max(endWords, D - ${m.exit}));`;
      return { html, css, js };
    },
  },

  'board': {
    summary: 'A full-frame physical ground: cardboard (for photo cards) or archival paper (for archive plates). Add it before the card or plate.',
    fullFrame: true,
    params: { texture: 'cardboard', enter: 'cut' },
    prepare(p, { jobDir }) { hide(p, '_tex', ensureTextures(jobDir)); },
    render(p, ctx) {
      oneOf(p.texture, ['cardboard', 'paper'], 'board: texture');
      oneOf(p.enter, ['cut', 'slide'], 'board: enter');
      const css = `
      ${ctx.sel('board')} { position: absolute; inset: 0; background: url("${p._tex}/${p.texture}.png") center / cover; }
      ${ctx.sel('vig')} { position: absolute; inset: 0; background: radial-gradient(ellipse 80% 70% at 50% 45%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.38) 100%); }`;
      const html = `
          <div id="${ctx.idf('board')}"></div><div id="${ctx.idf('vig')}"></div>`;
      const js = p.enter === 'slide' ? `
            tl.fromTo([$("board"), $("vig")], { y: H }, { y: 0, duration: 0.5, ease: "power3.out" }, 0);` : '';
      return { html, css, js };
    },
  },

  'photo-card': {
    summary: 'A photo printed with a white border, tilted on the board, settling in and drifting closer. src is a job-relative image (a still, or a layers source).',
    sfx: { role: 'place', at: 0.25 },
    params: { src: '', x: null, y: 860, w: 720, ratio: 0.75, rotate: null, push: 0.05, from: 'below' },
    prepare(p, { rnd, jobDir }) {
      if (!p.src) throw new Error('photo-card: --src is required (a job-relative image)');
      if (jobDir && !existsSync(join(jobDir, p.src))) throw new Error(`photo-card: ${p.src} not found in the job`);
      if (p.rotate === null) p.rotate = r1((rnd() > 0.5 ? 1 : -1) * (2.5 + rnd() * 3));
      p.h = Math.round((p.w - 44) / p.ratio + 44);
    },
    render(p, ctx) {
      oneOf(p.from, ['below', 'drop', 'cut'], 'photo-card: from');
      const m = ctx.motion;
      const css = `
      ${ctx.sel('slot')} {
        position: absolute;
        left: ${r1(p.x - p.w / 2)}px; top: ${r1(p.y - p.h / 2)}px; width: ${p.w}px; height: ${p.h}px;
      }
      ${ctx.sel('card')} {
        width: 100%; height: 100%; padding: 22px; background: #fbfaf6;
        box-shadow: 0 18px 38px rgba(0,0,0,0.38), 0 2px 4px rgba(0,0,0,0.25);
        transform-origin: 50% 50%;
      }
      ${ctx.sel('img')} { width: 100%; height: 100%; background: #ccc url("${ctx.esc(p.src)}") center / cover no-repeat; }`;
      const html = `
          <div id="${ctx.idf('slot')}"><div id="${ctx.idf('card')}"><div id="${ctx.idf('img')}"></div></div></div>`;
      const from = p.from === 'drop' ? `{ opacity: 0, scale: 1.12, rotation: ${r1(p.rotate + 5)} }` : `{ opacity: 0, y: 160, rotation: ${r1(p.rotate + 6)} }`;
      const js = `${p.from === 'cut' ? `
            tl.set($("card"), { rotation: ${p.rotate} }, 0);` : `
            tl.fromTo($("card"), ${from}, { opacity: 1, y: 0, scale: 1, rotation: ${p.rotate}, duration: ${m.enter}, ease: "${m.enterEase}" }, 0);`}
            tl.fromTo($("slot"), { scale: 1 }, { scale: ${r2(1 + p.push)}, duration: D, ease: "none" }, 0);`;
      return { html, css, js };
    },
  },

  'archive': {
    summary: 'An archival plate: the image toned (sepia or mono), soft or oval edges, multiplied onto the paper board, slowly pushing in. Put a board (texture paper) first.',
    params: { src: '', x: null, y: 800, w: 760, ratio: 0.8, tint: 'sepia', shape: 'soft', push: 0.06 },
    prepare(p, { jobDir }) {
      if (!p.src) throw new Error('archive: --src is required (a job-relative image)');
      if (jobDir && !existsSync(join(jobDir, p.src))) throw new Error(`archive: ${p.src} not found in the job`);
      p.rotate = 0;
      p.h = Math.round(p.w / p.ratio);
    },
    render(p, ctx) {
      oneOf(p.tint, ['sepia', 'mono'], 'archive: tint');
      oneOf(p.shape, ['soft', 'oval'], 'archive: shape');
      const filter = p.tint === 'sepia' ? 'grayscale(1) sepia(0.45) contrast(1.12) brightness(0.96)' : 'grayscale(1) contrast(1.18) brightness(0.98)';
      const mask = p.shape === 'oval'
        ? 'radial-gradient(ellipse 48% 48% at 50% 50%, #000 82%, transparent 100%)'
        : 'radial-gradient(ellipse 62% 62% at 50% 50%, #000 70%, transparent 100%)';
      const css = `
      ${ctx.sel('slot')} {
        position: absolute;
        left: ${r1(p.x - p.w / 2)}px; top: ${r1(p.y - p.h / 2)}px; width: ${p.w}px; height: ${p.h}px;
        mix-blend-mode: multiply;
      }
      ${ctx.sel('img')} {
        width: 100%; height: 100%;
        background: url("${ctx.esc(p.src)}") center / cover no-repeat;
        filter: ${filter};
        -webkit-mask-image: ${mask}; mask-image: ${mask};
      }`;
      const html = `
          <div id="${ctx.idf('slot')}"><div id="${ctx.idf('img')}"></div></div>`;
      const js = `
            tl.fromTo($("slot"), { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "power1.out" }, 0);
            tl.fromTo($("img"), { scale: 1 }, { scale: ${r2(1 + p.push)}, duration: D, ease: "none" }, 0);`;
      return { html, css, js };
    },
  },
};
