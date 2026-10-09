// Info-graphics essay components for rcg style (tools/blocks/style.mjs).
// Each component returns { html, css, js } for one sub-composition. `js` runs inside
// build() with: tl (paused timeline), D (duration), $(name) -> element "<id>-<name>",
// fit(el, text, opts) (canvas-measured wrap + shrink), measure(text, font, size), W, H.
// Deterministic throughout: no Math.random, no clocks, no onUpdate (it does not fire on
// seek, tools/blocks/shader.mjs), so counters are digit strips and typing is per-letter sets.
//
// Grammar (.agents/skills/skill-info-graphics/references/scene-grammar.md): one idea per
// sentence; a ground per scene (dark, cream, paper, orange); on it one hero object: a type
// stack with one orange word, an equation, stairs, a pyramid, a post, a prompt bar, an orbit,
// a counter, a photo plate or a collage. `times` (comma list, seconds from the item start)
// lines each step up with a spoken word; `rcg infographics resolve` writes them from anchors.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Phosphor icons copied one at a time by `rcg assets icon add` (MIT, library/icons/phosphor/LICENSE).
const ICONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'icons', 'phosphor');

/** A Phosphor SVG from the library (fill="currentColor"), or a clear error naming the fix. */
function loadIcon(name, weight, what) {
  const file = join(ICONS, weight, weight === 'regular' ? `${name}.svg` : `${name}-${weight}.svg`);
  if (!existsSync(file)) throw new Error(`${what}: icon "${name}" (${weight}) is not in library/icons/phosphor. Find it: rcg assets icon find ${name}; add it: rcg assets icon add ${name} --weight ${weight}`);
  return readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '').trim();
}

const r1 = (n) => Math.round(n * 10) / 10;
/** 153, 1, "," -> "15.3"; 40000, 0, "," -> "40,000" (the counter's widest text, for fitting). */
function fmtNum(n, dec = 0, sep = '') {
  const s = String(n).padStart(dec + 1, '0');
  const int = s.slice(0, s.length - dec).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return dec ? `${int}.${s.slice(-dec)}` : int;
}
const r2 = (n) => Math.round(n * 100) / 100;

function oneOf(v, list, what) {
  if (!list.includes(v)) throw new Error(`${what} must be one of ${list.join(', ')} (got "${v}")`);
  return v;
}

const splitList = (s) => String(s).split('|').map((x) => x.trim()).filter(Boolean);
/** "0.2, 0.8" -> [0.2, 0.8]; numbers pass through. */
function nums(s, what) {
  if (typeof s === 'number') return [s];
  const out = String(s || '').split(',').map((x) => x.trim()).filter(Boolean).map(Number);
  if (out.some((n) => !Number.isFinite(n))) throw new Error(`${what}: times must be numbers (got "${s}")`);
  return out;
}
/** "0.5@0.4, 0.9@2" -> [{ pos: 0.5, t: 0.4 }, { pos: 0.9, t: 2 }] (range knob moves). */
function parseMoves(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [pos, t] = x.split('@').map(Number);
    if (!Number.isFinite(pos) || !Number.isFinite(t) || pos < 0 || pos > 1) throw new Error(`range: a move must be "pos@t" with pos 0..1 (got "${x}")`);
    return { pos, t };
  });
}

/** n start times: the given ones, then `step` apart after the last. */
function fillTimes(given, n, first, step) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(i < given.length ? given[i] : (i ? out[i - 1] + step : first));
  return out.map(r2);
}

function font(ctx, role, extra = {}) {
  const f = ctx.type[role];
  return { family: f.family, weight: f.weight, ...extra };
}

/** Text colours for a ground: white / orange on dark, ink / deep orange on light. */
function inks(on) {
  oneOf(on, ['dark', 'light'], 'on');
  return on === 'dark'
    ? { fg: 'var(--white)', accent: 'var(--orange)', muted: 'var(--muted-dark)', card: 'var(--dark-2)', cardFg: 'var(--white)' }
    : { fg: 'var(--ink)', accent: 'var(--orange-deep)', muted: 'var(--muted)', card: 'var(--white)', cardFg: 'var(--ink)' };
}

function needSrc(src, jobDir, what) {
  if (!src) throw new Error(`${what}: src is required (a job-relative image)`);
  if (jobDir && !existsSync(join(jobDir, src))) throw new Error(`${what}: ${src} not found in the job`);
}

const SLOT = (sel, p) => `
      ${sel} {
        position: absolute;
        left: ${r1(p.x - p.w / 2)}px;
        top: ${r1(p.y - p.h / 2)}px;
        width: ${p.w}px;
        height: ${p.h}px;
      }`;

/** One sound role at the first landing, for components whose sound is a choice. */
const soundAt = (p, at) => (p.sound && p.sound !== 'none' ? [{ role: p.sound, at }] : []);
const SOUNDS = ['none', 'pop', 'swipe', 'hit', 'tick', 'shine', 'click'];

// Browser helpers shared by components. Rise + blur in; no filter while held (an idle
// blur(0px) layer still clips, captions.mjs); exits blur out or fade.
const HELPERS = (m) => `
            function reveal(el, at, o) {
              o = o || {};
              var d = o.dur || ${m.word};
              tl.fromTo(el, { opacity: 0, y: o.rise == null ? ${m.rise} : o.rise, filter: "blur(" + (o.blur == null ? ${m.blur} : o.blur) + "px)" },
                { opacity: 1, y: 0, filter: "blur(0px)", duration: d, ease: o.ease || "${m.wordEase}" }, at);
              tl.set(el, { filter: "none" }, at + d);
            }
            function pop(el, at, o) {
              o = o || {};
              tl.fromTo(el, { opacity: 0, scale: o.from == null ? 0.6 : o.from }, { opacity: 1, scale: 1, duration: o.dur || 0.42, ease: o.ease || "back.out(1.7)" }, at);
            }
            function out(el, kind) {
              if (kind === "cut") return;
              var at = Math.max(0.3, D - ${m.exit});
              if (kind === "blur") tl.fromTo(el, { filter: "blur(0px)" }, { opacity: 0, filter: "blur(8px)", duration: ${m.exit}, ease: "${m.exitEase}", immediateRender: false }, at);
              else tl.to(el, { opacity: 0, duration: ${m.exit}, ease: "${m.exitEase}" }, at);
            }`;

// A rolling digit counter that seeks: each digit is a strip of cells moved with yPercent.
// Values below 10^p leave the cell blank (no leading zeros). A digit that would roll more
// than 40 times shows 40 cells ending on its target (it is a blur at that speed anyway).
const ODOMETER = `
            function odometer(el, from, to, f, size, at, dur, ease, dec, sep) {
              // dec: decimal places (to = 153, dec = 1 shows 15.3); sep: thousands separator. The point
              // and the separator ride on their digit's cells, so a blank digit never shows one.
              dec = dec || 0; sep = sep || "";
              var digits = Math.max(String(to).length, dec + 1), cw = measure("0", f, size);
              el.innerHTML = "";
              var cols = [];
              for (var p = digits - 1; p >= 0; p--) {
                var a = Math.floor(from / Math.pow(10, p)), b = Math.floor(to / Math.pow(10, p));
                if (b - a > 40) a = b - 40;
                var col = document.createElement("span");
                col.className = "odo-col";
                col.setAttribute("data-layout-allow-overflow", "");
                var tail = dec && p === dec ? "." : sep && p > dec && (p - dec) % 3 === 0 ? sep : "";
                col.style.width = (cw + (tail ? measure(tail, f, size) : 0)).toFixed(1) + "px";
                var strip = document.createElement("span");
                strip.className = "odo-strip";
                strip.setAttribute("data-layout-allow-overflow", "");
                for (var v = a; v <= b; v++) {
                  var cell = document.createElement("span");
                  cell.className = "odo-cell";
                  cell.textContent = v <= 0 && p > dec ? "\\u00a0" : String(((v % 10) + 10) % 10) + tail;
                  strip.appendChild(cell);
                }
                col.appendChild(strip);
                el.appendChild(col);
                var n = b - a + 1;
                if (n > 1) tl.fromTo(strip, { yPercent: 0 }, { yPercent: -100 * (n - 1) / n, duration: dur, ease: ease }, at);
                cols.push(col);
              }
              return cols;
            }`;
const ODO_CSS = (sel) => `
      ${sel} .odo-col { display: inline-block; height: 1.18em; overflow: hidden; vertical-align: top; text-align: left; }
      ${sel} .odo-strip { display: block; }
      ${sel} .odo-cell { display: block; height: 1.18em; line-height: 1.18em; }`;

// Hand-drawn arrow "x1,y1>x2,y2" (output px) as a quadratic curve with a two-stroke head.
function arrowPaths(spec, bend) {
  const m = String(spec).match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*>\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) throw new Error(`arrow must look like "x1,y1>x2,y2" (got "${spec}")`);
  const [x1, y1, x2, y2] = m.slice(1).map(Number);
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const cx = (x1 + x2) / 2 - (dy / len) * len * bend * 0.5;
  const cy = (y1 + y2) / 2 + (dx / len) * len * bend * 0.5;
  let L = 0, px = x1, py = y1;
  for (let i = 1; i <= 40; i++) {
    const t = i / 40, u = 1 - t;
    const qx = u * u * x1 + 2 * u * t * cx + t * t * x2, qy = u * u * y1 + 2 * u * t * cy + t * t * y2;
    L += Math.hypot(qx - px, qy - py); px = qx; py = qy;
  }
  const tl = Math.hypot(x2 - cx, y2 - cy) || 1, ux = (x2 - cx) / tl, uy = (y2 - cy) / tl;
  const h = Math.min(30, len * 0.22), a = 0.5;
  const rot = (s) => [x2 - h * (ux * Math.cos(s * a) - uy * Math.sin(s * a)), y2 - h * (uy * Math.cos(s * a) + ux * Math.sin(s * a))];
  const [ax, ay] = rot(1), [bx, by] = rot(-1);
  return {
    body: `M ${r1(x1)} ${r1(y1)} Q ${r1(cx)} ${r1(cy)} ${r1(x2)} ${r1(y2)}`,
    head: `M ${r1(ax)} ${r1(ay)} L ${r1(x2)} ${r1(y2)} L ${r1(bx)} ${r1(by)}`,
    len: Math.ceil(L) + 2, headLen: Math.ceil(2 * h) + 2,
  };
}

// The pointer: white with a black edge (reads on cream, paper and photos).
const CURSOR_SVG = (id) => `<svg id="${id}" width="64" height="64" viewBox="0 0 28 28"><path d="M5 3 L5 22 L10 17.5 L13.4 25 L16.6 23.6 L13.2 16.3 L20 16.3 Z" fill="#ffffff" stroke="#101010" stroke-width="1.5" stroke-linejoin="round" /></svg>`;

const OPS = {
  '=': ['M 18 38 H 82', 'M 18 62 H 82'],
  '≠': ['M 18 38 H 82', 'M 18 62 H 82', 'M 66 16 L 34 84'],
  '>': ['M 28 20 L 76 50 L 28 80'],
  '<': ['M 72 20 L 24 50 L 72 80'],
  '→': ['M 14 50 H 84', 'M 62 28 L 86 50 L 62 72'],
  '↔': ['M 12 50 H 88', 'M 32 30 L 12 50 L 32 70', 'M 68 30 L 88 50 L 68 70'],
  '+': ['M 50 18 V 82', 'M 18 50 H 82'],
  '×': ['M 24 24 L 76 76', 'M 76 24 L 24 76'],
};

export const components = {
  'ground': {
    summary: 'The ground of a scene: dark (vignette), cream, paper (light grey), orange or white. Enter cut, fade, wipe-up, wipe-left, arc (a curved edge sweeps in from the bottom left) or iris; exit cut, fade or arc. opacity < 1 makes it a scrim over footage below; texture (a job image, e.g. a Poly Haven wall) blends in at textureOpacity. Put it first in the scene.',
    fullFrame: true,
    sfx: (p) => (['cut', 'fade'].includes(p.enter) ? [] : [{ role: 'swipe', at: 0.18 }]),
    params: { tone: 'dark', enter: 'cut', exit: 'cut', vignette: 0.45, opacity: 1, texture: '', textureOpacity: 0.35, blend: 'multiply' },
    prepare(p, { jobDir }) { if (p.texture) needSrc(p.texture, jobDir, 'ground'); },
    render(p, ctx) {
      oneOf(p.tone, ['dark', 'cream', 'paper', 'orange', 'white'], 'ground: tone');
      oneOf(p.enter, ['cut', 'fade', 'wipe-up', 'wipe-left', 'arc', 'iris'], 'ground: enter');
      oneOf(p.exit, ['cut', 'fade', 'arc'], 'ground: exit');
      const bg = `var(--${p.tone})`;
      const vig = p.tone === 'dark' && p.vignette > 0
        ? `radial-gradient(ellipse 75% 60% at 50% 45%, rgba(0,0,0,0) 40%, rgba(0,0,0,${r2(p.vignette)}) 100%), ` : '';
      oneOf(p.blend, ['multiply', 'overlay', 'soft-light', 'screen', 'normal'], 'ground: blend');
      const css = `
      ${ctx.sel('g')} { position: absolute; inset: 0; }
      ${ctx.sel('fill')} { position: absolute; inset: 0; background: ${vig}${bg}; opacity: ${r2(p.opacity)}; }${p.texture ? `
      ${ctx.sel('tx')} { position: absolute; inset: 0; background: url("${ctx.esc(p.texture)}") center / cover no-repeat; mix-blend-mode: ${p.blend}; opacity: ${r2(p.textureOpacity)}; }` : ''}`;
      const html = `
          <div id="${ctx.idf('g')}"><div id="${ctx.idf('fill')}"></div>${p.texture ? `<div id="${ctx.idf('tx')}"></div>` : ''}</div>`;
      const enter = {
        'fade': `tl.fromTo($("g"), { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" }, 0);`,
        'wipe-up': `tl.fromTo($("g"), { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.42, ease: "power3.inOut" }, 0);`,
        'wipe-left': `tl.fromTo($("g"), { clipPath: "inset(0% 0% 0% 100%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.42, ease: "power3.inOut" }, 0);`,
        'arc': `tl.fromTo($("g"), { clipPath: "circle(0% at -30% 120%)" }, { clipPath: "circle(190% at -30% 120%)", duration: 0.62, ease: "power2.inOut" }, 0);`,
        'iris': `tl.fromTo($("g"), { clipPath: "circle(0% at 50% 45%)" }, { clipPath: "circle(120% at 50% 45%)", duration: 0.5, ease: "power3.inOut" }, 0);`,
      }[p.enter] || '';
      const exit = {
        'fade': `tl.to($("g"), { opacity: 0, duration: 0.25, ease: "power1.in" }, Math.max(0.4, D - 0.25));`,
        'arc': `tl.to($("g"), { clipPath: "circle(0% at 130% -20%)", duration: 0.5, ease: "power2.in" }, Math.max(0.4, D - 0.5));`,
      }[p.exit] || '';
      return { html, css, js: `
            ${enter}
            ${exit}` };
    },
  },

  'stack': {
    summary: 'Kinetic type: lines stacked with a stair offset ("In|other|*words*"), words rising out of a blur one by one (times = one per word). *word* is the accent orange; heavy=true sets it in Inter 900; slant=true sets the stack oblique. Optional hand-drawn arrow "x1,y1>x2,y2".',
    sfx: (p) => soundAt(p, nums(p.times, 'stack')[0] ?? 0.05),
    params: { text: 'In|other|*words*', on: 'dark', x: null, y: 760, w: 760, h: 460, size: 120, min: 48, align: 'left', step: 56, slant: false, heavy: false, times: '', arrow: '', bend: 0.45, arrowAt: null, out: 'fade', sound: 'none' },
    render(p, ctx) {
      oneOf(p.align, ['left', 'center'], 'stack: align');
      oneOf(p.out, ['fade', 'blur', 'cut'], 'stack: out');
      oneOf(p.sound, SOUNDS, 'stack: sound');
      const c = inks(p.on);
      const m = ctx.motion;
      const nLines = splitList(p.text).length || 1;
      const stepTotal = p.align === 'left' ? p.step * (nLines - 1) : 0;
      const style = p.slant ? 'italic' : 'normal';
      const f = font(ctx, 'display', { track: -0.03, style });
      const fe = p.heavy ? font(ctx, 'heavy', { track: -0.03, style }) : f;
      const times = nums(p.times, 'stack');
      const arrow = p.arrow ? arrowPaths(p.arrow, p.bend) : null;
      const css = `${SLOT(ctx.sel('slot'), p)}
      ${ctx.sel('slot')} { display: flex; flex-direction: column; justify-content: center; align-items: ${p.align === 'left' ? 'flex-start' : 'center'}; }
      ${ctx.sel('hero')} {
        display: block;
        ${ctx.family('display')}
        font-style: ${style};
        line-height: 0.96;
        letter-spacing: -0.03em;
        color: ${c.fg};
        text-align: ${p.align};
      }
      ${ctx.sel('hero')} .em { color: ${c.accent}; ${p.heavy ? ctx.family('heavy') : ''} }
      ${ctx.sel('hero')} .ln { padding-bottom: 0.06em; }
      ${ctx.sel('svg')} { position: absolute; left: 0; top: 0; overflow: visible; }`;
      const html = `
          <div id="${ctx.idf('slot')}"><span id="${ctx.idf('hero')}"></span></div>${arrow ? `
          <svg id="${ctx.idf('svg')}" width="${ctx.W}" height="${ctx.H}" viewBox="0 0 ${ctx.W} ${ctx.H}">
            <path id="${ctx.idf('shaft')}" d="${arrow.body}" fill="none" stroke="${c.accent}" stroke-width="5" stroke-linecap="round" style="stroke-dasharray: ${arrow.len}; stroke-dashoffset: ${arrow.len};" />
            <path id="${ctx.idf('head')}" d="${arrow.head}" fill="none" stroke="${c.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray: ${arrow.headLen}; stroke-dashoffset: ${arrow.headLen};" />
          </svg>` : ''}`;
      const js = `${HELPERS(m)}
            fit($("hero"), ${ctx.js(p.text)}, { font: ${ctx.js(f)}, em: ${ctx.js(fe)}, size: ${p.size}, min: ${p.min}, maxW: ${p.w - stepTotal}, maxH: ${p.h}, lh: 0.96 });
            var rows = $("hero").querySelectorAll(".ln"), words = [];
            for (var i = 0; i < rows.length; i++) {
              ${p.align === 'left' ? `rows[i].style.marginLeft = (i * ${p.step}) + "px";` : ''}
              var ws = rows[i].querySelectorAll(".w");
              for (var k = 0; k < ws.length; k++) words.push(ws[k]);
            }
            var T = ${ctx.js(times)}, last = 0.05;
            for (var j = 0; j < words.length; j++) {
              var at = j < T.length ? T[j] : (j ? last + ${m.stagger} : 0.05);
              reveal(words[j], at);
              last = at;
            }${arrow ? `
            var aAt = ${p.arrowAt == null ? 'last + 0.25' : p.arrowAt};
            tl.to($("shaft"), { strokeDashoffset: 0, duration: ${m.draw}, ease: "${m.drawEase}" }, aAt);
            tl.to($("head"), { strokeDashoffset: 0, duration: 0.18, ease: "power1.out" }, aAt + ${m.draw} - 0.04);` : ''}
            out($("slot"), ${ctx.js(p.out)});${arrow ? `
            out($("svg"), ${ctx.js(p.out === 'blur' ? 'fade' : p.out)});` : ''}`;
      return { html, css, js };
    },
  },

  'equation': {
    summary: 'An equation: left, a drawn operator (= ≠ > < → ↔ + ×) and right, appearing at times "left,op,right". *word* is orange; chip=left|right sets that term as a dark key cap with orange text (like an app icon). "|" breaks a term into two lines.',
    sfx: (p, D) => {
      const t = fillTimes(nums(p.times, 'equation'), 3, 0.05, 0.4);
      return [{ role: 'tick', at: t[1] + 0.1 }, ...(p.chip !== 'none' ? [{ role: 'pop', at: t[p.chip === 'left' ? 0 : 2] + 0.12 }] : [])];
    },
    params: { left: '*Slop*', op: '≠', right: 'AI', on: 'light', x: null, y: 700, w: 836, h: 260, size: 96, min: 44, chip: 'right', times: '', out: 'fade' },
    render(p, ctx) {
      if (!OPS[p.op]) throw new Error(`equation: op must be one of ${Object.keys(OPS).join(' ')} (got "${p.op}")`);
      oneOf(p.chip, ['none', 'left', 'right'], 'equation: chip');
      oneOf(p.out, ['fade', 'blur', 'cut'], 'equation: out');
      const c = inks(p.on);
      const m = ctx.motion;
      const t = fillTimes(nums(p.times, 'equation'), 3, 0.05, 0.4);
      const opW = Math.round(p.size * 0.95);
      const gap = Math.round(p.size * 0.32);
      const pad = Math.round(p.size * 0.24);
      const termW = Math.floor((p.w - opW - gap * 2) / 2) - (p.chip !== 'none' ? pad * 2 : 0);
      const f = font(ctx, 'display', { track: -0.02 });
      const term = (k) => `<span class="term${p.chip === k ? ' chip' : ''}" id="${ctx.idf(k)}"><span id="${ctx.idf(k + '-t')}"></span></span>`;
      const css = `${SLOT(ctx.sel('slot'), p)}
      ${ctx.sel('slot')} { display: flex; align-items: center; justify-content: center; gap: ${gap}px; }
      #${ctx.id}-layer .term { display: block; ${ctx.family('display')} line-height: 1; letter-spacing: -0.02em; color: ${c.fg}; text-align: center; }
      #${ctx.id}-layer .term .em { color: ${c.accent}; }
      #${ctx.id}-layer .term.chip {
        padding: ${pad}px; border-radius: ${Math.round(p.size * 0.26)}px;
        background: linear-gradient(160deg, #3a3a3a, var(--chip) 60%);
        box-shadow: 0 14px 30px var(--shadow), inset 0 2px 0 rgba(255,255,255,0.14);
        color: var(--orange);
      }
      #${ctx.id}-layer .term.chip .em { color: var(--orange); }
      ${ctx.sel('op')} { width: ${opW}px; height: ${opW}px; flex: none; }`;
      const paths = OPS[p.op].map((d, i) => `<path id="${ctx.idf('o' + i)}" d="${d}" fill="none" stroke="${c.fg}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray: 140; stroke-dashoffset: 140;" />`).join('');
      const html = `
          <div id="${ctx.idf('slot')}">${term('left')}<svg id="${ctx.idf('op')}" viewBox="0 0 100 100">${paths}</svg>${term('right')}</div>`;
      const opts = (k) => `{ font: ${ctx.js(f)}, size: ${p.size}, min: ${p.min}, maxW: ${termW}, maxH: ${p.h - (p.chip === k ? pad * 2 : 0)}, lh: 1 }`;
      const js = `${HELPERS(m)}
            var a = fit($("left-t"), ${ctx.js(p.left)}, ${opts('left')});
            var b = fit($("right-t"), ${ctx.js(p.right)}, ${opts('right')});
            var s = Math.min(a.size, b.size);
            $("left-t").style.fontSize = s.toFixed(1) + "px";
            $("right-t").style.fontSize = s.toFixed(1) + "px";
            ${p.chip === 'left' ? `pop($("left"), ${t[0]});` : `reveal($("left"), ${t[0]});`}
            ${OPS[p.op].map((_, i) => `tl.to($("o${i}"), { strokeDashoffset: 0, duration: 0.24, ease: "power2.out" }, ${r2(t[1] + i * 0.12)});`).join('\n            ')}
            ${p.chip === 'right' ? `pop($("right"), ${t[2]});` : `reveal($("right"), ${t[2]});`}
            out($("slot"), ${ctx.js(p.out)});`;
      return { html, css, js };
    },
  },

  'stairs': {
    summary: 'A step chart: steps "Name:Value|..." (bottom first) build one by one at times. layout=stairs (blocks rising left to right, labels above) or tower (blocks stacked, labels alternating left and right). tone orange, grey or dark; hot = the index drawn in orange when tone is grey or dark (default the last).',
    sfx: (p, D) => fillTimes(nums(p.times, 'stairs'), splitList(p.steps).length, 0.1, 0.35).map((at) => ({ role: 'tick', at: at + 0.15 })),
    params: { steps: 'Stone:Months|Paint:Weeks|Photo:Days|Digital:Hours|AI:Minutes', layout: 'stairs', tone: 'orange', hot: -1, on: 'light', x: null, y: 900, w: 800, h: 860, label: 32, times: '', out: 'fade' },
    render(p, ctx) {
      oneOf(p.layout, ['stairs', 'tower'], 'stairs: layout');
      oneOf(p.tone, ['orange', 'grey', 'dark'], 'stairs: tone');
      oneOf(p.out, ['fade', 'blur', 'cut'], 'stairs: out');
      const c = inks(p.on);
      const steps = splitList(p.steps).map((s) => { const [name, ...v] = s.split(':'); return { name: name.trim(), value: v.join(':').trim() }; });
      const n = steps.length;
      if (n < 2) throw new Error('stairs: give at least two steps ("A:1|B:2")');
      const hot = p.hot < 0 ? n + p.hot : p.hot;
      const times = fillTimes(nums(p.times, 'stairs'), n, 0.1, 0.35);
      const fill = { orange: ['#f08a45', 'var(--orange)', '#c45a1a'], grey: ['#e2e2e2', '#cfcfcf', '#a9a9a9'], dark: ['#3a3a3a', '#2c2c2c', '#151515'] }[p.tone];
      const hotFill = ['#f08a45', 'var(--orange)', '#c45a1a'];
      const labelH = Math.round(p.label * 2.6);
      const blocks = [];
      if (p.layout === 'stairs') {
        const sw = p.w / n;
        const maxBH = p.h - labelH - 10;
        steps.forEach((s, i) => {
          const bh = Math.round(maxBH * (i + 1) / n);
          blocks.push({ left: r1(i * sw), top: p.h - bh, w: r1(sw - 6), h: bh, lx: r1(i * sw), ly: p.h - bh - labelH - 8, lw: r1(sw - 6), align: 'center' });
        });
      } else {
        const gapY = 8, bh = (p.h - gapY * (n - 1)) / n, tw = p.w * 0.36;
        steps.forEach((s, i) => {
          const bw = tw * (1 - i * (0.5 / n));
          const top = p.h - (i + 1) * bh - i * gapY;
          const left = (p.w - bw) / 2;
          const side = i % 2 === 0 ? 'left' : 'right';
          const lw = (p.w - tw) / 2 - 24;
          blocks.push({ left: r1(left), top: r1(top), w: r1(bw), h: r1(bh), lx: side === 'left' ? 0 : r1(p.w - lw), ly: r1(top + bh / 2 - labelH / 2), lw: r1(lw), align: side === 'left' ? 'right' : 'left' });
        });
      }
      const css = `${SLOT(ctx.sel('slot'), p)}
      #${ctx.id}-layer .blk { position: absolute; border-radius: 6px; transform-origin: 50% 100%; box-shadow: 0 10px 24px var(--shadow); }
      #${ctx.id}-layer .blk::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 14px; border-radius: 6px 6px 0 0; background: rgba(255,255,255,0.28); }
      #${ctx.id}-layer .lab { position: absolute; display: flex; flex-direction: column; justify-content: center; height: ${labelH}px; }
      #${ctx.id}-layer .lab .nm { display: block; ${ctx.family('display')} line-height: 1.05; color: ${c.fg}; }
      #${ctx.id}-layer .lab .vl { display: block; ${ctx.family('body')} line-height: 1.15; color: ${c.muted}; margin-top: 4px; }
      #${ctx.id}-layer .lab.hot .nm { color: ${c.accent}; }`;
      const html = `
          <div id="${ctx.idf('slot')}">${blocks.map((b, i) => {
            const [hi, mid, lo] = (p.tone !== 'orange' && i === hot) ? hotFill : fill;
            return `
            <div class="blk" id="${ctx.idf('b' + i)}" style="left:${b.left}px;top:${b.top}px;width:${b.w}px;height:${b.h}px;background:linear-gradient(180deg, ${hi}, ${mid} 40%, ${lo});"></div>
            <div class="lab${i === hot ? ' hot' : ''}" id="${ctx.idf('l' + i)}" style="left:${b.lx}px;top:${b.ly}px;width:${b.lw}px;align-items:${b.align === 'center' ? 'center' : b.align === 'right' ? 'flex-end' : 'flex-start'};text-align:${b.align};"><span class="nm" id="${ctx.idf('n' + i)}"></span><span class="vl" id="${ctx.idf('v' + i)}"></span></div>`;
          }).join('')}
          </div>`;
      const fN = font(ctx, 'display'), fV = font(ctx, 'body');
      const js = `${HELPERS(ctx.motion)}
            var S = ${ctx.js(steps)}, T = ${ctx.js(times)}, LW = ${ctx.js(blocks.map((b) => b.lw))};
            for (var i = 0; i < S.length; i++) {
              fit($("n" + i), S[i].name, { font: ${ctx.js(fN)}, size: ${p.label}, min: 18, maxW: LW[i], maxH: ${Math.round(p.label * 1.2)}, maxLines: 1, lh: 1.05 });
              if (S[i].value) fit($("v" + i), S[i].value, { font: ${ctx.js(fV)}, size: ${Math.round(p.label * 0.8)}, min: 16, maxW: LW[i], maxH: ${Math.round(p.label)}, maxLines: 1, lh: 1.15 });
              tl.fromTo($("b" + i), { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.38, ease: "back.out(1.4)" }, T[i]);
              reveal($("l" + i), T[i] + 0.12, { rise: 16, blur: 6, dur: 0.3 });
            }
            out($("slot"), ${ctx.js(p.out)});`;
      return { html, css, js };
    },
  },

  'pyramid': {
    summary: 'A hierarchy pyramid: a two-faced stone triangle with tier lines; tiers "Bottom|...|Top" get orange label chips, bottom first, at times. Use for class, priority, cost or effort ladders.',
    sfx: (p) => fillTimes(nums(p.times, 'pyramid'), splitList(p.tiers).length, 0.55, 0.3).map((at) => ({ role: 'tick', at: at + 0.1 })),
    params: { tiers: 'Laborers|Craftsmen|Artisans|Patrons|Masters', on: 'dark', x: null, y: 960, w: 800, h: 820, label: 30, times: '', out: 'fade' },
    render(p, ctx) {
      oneOf(p.out, ['fade', 'blur', 'cut'], 'pyramid: out');
      inks(p.on);
      const tiers = splitList(p.tiers);
      const n = tiers.length;
      if (n < 2) throw new Error('pyramid: give at least two tiers');
      const times = fillTimes(nums(p.times, 'pyramid'), n, 0.55, 0.3);
      const th = p.h / n;
      const css = `${SLOT(ctx.sel('slot'), p)}
      ${ctx.sel('tri')} { position: absolute; inset: 0; filter: drop-shadow(0 26px 30px rgba(0,0,0,0.45)); transform-origin: 50% 100%; }
      ${ctx.sel('fl')}, ${ctx.sel('fr')} { position: absolute; inset: 0; }
      ${ctx.sel('fl')} {
        clip-path: polygon(50% 0%, 60% 100%, 0% 100%);
        background: repeating-linear-gradient(0deg, rgba(0,0,0,0) 0 ${r1(th - 4)}px, rgba(0,0,0,0.38) ${r1(th - 4)}px ${r1(th)}px), repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 3px, rgba(0,0,0,0.05) 3px 7px), linear-gradient(160deg, #9a8b7a, #6d5f51);
      }
      ${ctx.sel('fr')} {
        clip-path: polygon(50% 0%, 100% 100%, 60% 100%);
        background: repeating-linear-gradient(0deg, rgba(0,0,0,0) 0 ${r1(th - 4)}px, rgba(0,0,0,0.42) ${r1(th - 4)}px ${r1(th)}px), linear-gradient(200deg, #5a4e43, #3a322b);
      }
      #${ctx.id}-layer .tier {
        position: absolute; left: 50%; display: block; white-space: nowrap;
        ${ctx.family('display')} font-size: ${p.label}px; line-height: 1; color: var(--ink);
        background: var(--orange); padding: 0.22em 0.5em; border-radius: 4px;
        box-shadow: 0 6px 14px rgba(0,0,0,0.35);
      }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('tri')}"><div id="${ctx.idf('fl')}"></div><div id="${ctx.idf('fr')}"></div></div>${tiers.map((t, i) => `
            <span class="tier" id="${ctx.idf('t' + i)}" style="top:${r1(p.h - (i + 0.5) * th - p.label * 0.72)}px;">${ctx.esc(t)}</span>`).join('')}
          </div>`;
      const js = `${HELPERS(ctx.motion)}
            tl.fromTo($("tri"), { opacity: 0, scale: 0.86, y: 60 }, { opacity: 1, scale: 1, y: 0, duration: 0.55, ease: "power3.out" }, 0);
            var T = ${ctx.js(times)};
            for (var i = 0; i < T.length; i++) {
              tl.set($("t" + i), { xPercent: -50 }, 0);
              pop($("t" + i), T[i], { from: 0.4 });
            }
            out($("slot"), ${ctx.js(p.out)});`;
      return { html, css, js };
    },
  },

  'photo': {
    summary: 'One image: frame none, card (white border), museum (gilt frame, mat) or round; tone color or mono; a slow push. mark="x,y,w,h" (0..1 of the photo) sweeps an orange bar over a detail at markAt (the eyes, a date). plate="Left|1908|Right" adds a caption bar; a numeric middle can count to plateTo.',
    sfx: (p) => [...(p.enter === 'cut' ? [] : [{ role: 'swipe', at: 0.12 }]), ...(p.mark ? [{ role: 'tick', at: p.markAt + 0.1 }] : [])],
    params: { src: '', x: null, y: 860, w: 760, ratio: 0.8, frame: 'card', tone: 'color', enter: 'rise', push: 0.05, rotate: 0, mark: '', markAt: 0.4, plate: '', plateTo: null, plateAt: 0.3, plateDur: 1.6, out: 'fade' },
    prepare(p, { jobDir }) {
      needSrc(p.src, jobDir, 'photo');
      const pad = { none: 0, card: 22, museum: 54, round: 0 }[p.frame] ?? 0;
      p._pad = pad;
      p.h = Math.round((p.w - pad * 2) / p.ratio + pad * 2 + (p.plate ? 96 : 0));
    },
    render(p, ctx) {
      oneOf(p.frame, ['none', 'card', 'museum', 'round'], 'photo: frame');
      oneOf(p.tone, ['color', 'mono'], 'photo: tone');
      oneOf(p.enter, ['rise', 'drop', 'fade', 'cut'], 'photo: enter');
      oneOf(p.out, ['fade', 'blur', 'cut'], 'photo: out');
      const pad = p._pad;
      const plate = p.plate ? p.plate.split('|').map((s) => s.trim()) : null;
      if (plate && plate.length !== 3) throw new Error('photo: plate must be "left|middle|right"');
      const countTo = plate && p.plateTo != null && /^\d+$/.test(plate[1]) ? Math.round(p.plateTo) : null;
      if (countTo != null && countTo < Number(plate[1])) throw new Error('photo: plateTo must be >= the plate middle number');
      let mark = null;
      if (p.mark) {
        mark = p.mark.split(',').map(Number);
        if (mark.length !== 4 || mark.some((v) => !Number.isFinite(v))) throw new Error('photo: mark must be "x,y,w,h" in 0..1');
      }
      const frameCss = {
        none: '',
        card: 'background: #fbfaf6; box-shadow: 0 22px 44px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.2);',
        museum: 'background: #f3efe6; border: 26px solid #8f7a55; border-image: linear-gradient(135deg, #c8b07a, #6f5a36 40%, #b49a64 60%, #5a4828) 1; box-shadow: 0 26px 50px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(0,0,0,0.25);',
        round: 'border-radius: 26px; overflow: hidden; box-shadow: 0 22px 44px rgba(0,0,0,0.3);',
      }[p.frame];
      const imgH = Math.round((p.w - pad * 2) / p.ratio);
      const css = `${SLOT(ctx.sel('slot'), p)}
      ${ctx.sel('card')} { position: absolute; left: 0; top: 0; width: 100%; height: ${imgH + pad * 2}px; padding: ${p.frame === 'museum' ? 28 : pad}px; ${frameCss} }
      ${ctx.sel('win')} { position: relative; width: 100%; height: 100%; overflow: hidden; ${p.frame === 'round' ? 'border-radius: 26px;' : ''} }
      ${ctx.sel('img')} { position: absolute; inset: 0; background: #999 url("${ctx.esc(p.src)}") center / cover no-repeat; ${p.tone === 'mono' ? 'filter: grayscale(1) contrast(1.12);' : ''} }
      ${mark ? `${ctx.sel('mark')} { position: absolute; left: ${r1(mark[0] * 100)}%; top: ${r1(mark[1] * 100)}%; width: ${r1(mark[2] * 100)}%; height: ${r1(mark[3] * 100)}%; background: var(--orange); mix-blend-mode: multiply; transform-origin: 0 50%; }` : ''}
      ${plate ? `${ctx.sel('plate')} {
        position: absolute; left: 0; right: 0; top: ${imgH + pad * 2}px; height: 96px;
        display: flex; align-items: center; justify-content: space-between; padding: 0 28px;
        background: var(--white); color: var(--ink);
      }
      ${ctx.sel('plate')} .pl { ${ctx.family('body')} font-size: 28px; white-space: nowrap; }
      ${ctx.sel('num')} { ${ctx.family('display')} font-size: 60px; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }${ODO_CSS(ctx.sel('num'))}` : ''}`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('card')}"><div id="${ctx.idf('win')}"><div id="${ctx.idf('img')}"></div>${mark ? `<div id="${ctx.idf('mark')}"></div>` : ''}</div></div>${plate ? `
            <div id="${ctx.idf('plate')}"><span class="pl">${ctx.esc(plate[0])}</span><span id="${ctx.idf('num')}">${ctx.esc(plate[1])}</span><span class="pl">${ctx.esc(plate[2])}</span></div>` : ''}
          </div>`;
      const enter = {
        rise: `tl.fromTo($("slot"), { opacity: 0, y: 140, rotation: ${r1(p.rotate + 4)} }, { opacity: 1, y: 0, rotation: ${p.rotate}, duration: ${ctx.motion.enter}, ease: "${ctx.motion.enterEase}" }, 0);`,
        drop: `tl.fromTo($("slot"), { opacity: 0, scale: 1.18, rotation: ${r1(p.rotate - 5)} }, { opacity: 1, scale: 1, rotation: ${p.rotate}, duration: 0.4, ease: "power3.out" }, 0);`,
        fade: `tl.fromTo($("slot"), { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power1.out" }, 0); tl.set($("slot"), { rotation: ${p.rotate} }, 0);`,
        cut: `tl.set($("slot"), { rotation: ${p.rotate} }, 0);`,
      }[p.enter];
      const js = `${HELPERS(ctx.motion)}${countTo != null ? ODOMETER : ''}
            ${enter}
            tl.fromTo($("img"), { scale: 1 }, { scale: ${r2(1 + p.push)}, duration: D, ease: "none" }, 0);${mark ? `
            tl.fromTo($("mark"), { scaleX: 0 }, { scaleX: 1, duration: 0.32, ease: "power2.out" }, ${p.markAt});` : ''}${countTo != null ? `
            odometer($("num"), ${Number(plate[1])}, ${countTo}, ${ctx.js(font(ctx, 'display'))}, 60, ${p.plateAt}, ${p.plateDur}, "power1.inOut");` : ''}
            out($("slot"), ${ctx.js(p.out)});`;
      return { html, css, js };
    },
  },

  'collage': {
    summary: 'Several images (srcs "a.jpg|b.jpg|...") landing one by one at times: layout scatter (seeded tilt, cards on the ground), grid (a gallery wall of framed pictures) or mosaic (a wall of small tiles, the list repeated, slowly pushing in). Full frame; no text.',
    fullFrame: true,
    sfx: (p) => (p.layout === 'mosaic' ? [{ role: 'shine', at: 0.3 }] : fillTimes(nums(p.times, 'collage'), splitList(p.srcs).length, 0.05, 0.22).map((at) => ({ role: 'pop', at: at + 0.12 }))),
    params: { srcs: '', layout: 'scatter', frame: 'card', tone: 'color', w: 440, ratio: 0.8, cols: 2, top: 300, bottom: 1500, times: '', push: 0.05, out: 'fade' },
    prepare(p, { jobDir, rnd }) {
      const list = splitList(p.srcs);
      if (!list.length) throw new Error('collage: srcs is required ("assets/a.jpg|assets/b.jpg")');
      for (const s of list) needSrc(s, jobDir, 'collage');
      p._list = list;
      p._jit = list.map(() => [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]);
    },
    render(p, ctx) {
      oneOf(p.layout, ['scatter', 'grid', 'mosaic'], 'collage: layout');
      oneOf(p.frame, ['card', 'museum', 'none'], 'collage: frame');
      oneOf(p.tone, ['color', 'mono'], 'collage: tone');
      oneOf(p.out, ['fade', 'blur', 'cut'], 'collage: out');
      const list = p._list;
      const frameCss = {
        card: 'background: #fbfaf6; padding: 14px; box-shadow: 0 18px 36px rgba(0,0,0,0.38);',
        museum: 'background: #efe9dc; padding: 16px; border: 16px solid #8f7a55; border-image: linear-gradient(135deg, #cdb683, #6a5532 45%, #b79d66 60%, #574526) 1; box-shadow: 0 18px 36px rgba(0,0,0,0.45);',
        none: 'box-shadow: 0 18px 36px rgba(0,0,0,0.35);',
      }[p.frame];
      const items = [];
      if (p.layout === 'mosaic') {
        const cols = Math.max(3, p.cols), cw = ctx.W / cols * 1.1, ch = cw / p.ratio;
        const rows = Math.ceil(ctx.H * 1.12 / ch) + 1;
        for (let r = 0; r < rows; r++) for (let k = 0; k < cols + 1; k++) {
          const i = (r * (cols + 1) + k) % list.length;
          items.push({ src: list[i], x: r1(k * cw - cw * 0.3 + (r % 2) * cw * 0.25), y: r1(r * ch - ch * 0.4), w: r1(cw - 10), h: r1(ch - 10), rot: 0 });
        }
      } else {
        const cols = Math.max(1, p.cols), rows = Math.ceil(list.length / cols);
        const cellW = ctx.W / cols, cellH = (p.bottom - p.top) / rows, h = p.w / p.ratio;
        list.forEach((src, i) => {
          const c = i % cols, r = Math.floor(i / cols), j = p._jit[i];
          const scatter = p.layout === 'scatter';
          const cx = cellW * (c + 0.5) + (scatter ? j[0] * cellW * 0.12 : 0), cy = p.top + cellH * (r + 0.5) + (scatter ? j[1] * cellH * 0.1 : 0);
          items.push({ src, x: r1(cx - p.w / 2), y: r1(cy - h / 2), w: p.w, h: r1(h), rot: scatter ? r1(j[2] * 8) : 0 });
        });
      }
      const times = fillTimes(nums(p.times, 'collage'), items.length, 0.05, p.layout === 'mosaic' ? 0.012 : 0.22);
      const css = `
      ${ctx.sel('wall')} { position: absolute; inset: 0; transform-origin: 50% 45%; }
      #${ctx.id}-layer .pc { position: absolute; ${p.layout === 'mosaic' ? 'box-shadow: 0 6px 12px rgba(0,0,0,0.5);' : frameCss} }
      #${ctx.id}-layer .pc i { display: block; width: 100%; height: 100%; background-size: cover; background-position: center; ${p.tone === 'mono' ? 'filter: grayscale(1) contrast(1.1);' : ''} }`;
      const html = `
          <div id="${ctx.idf('wall')}">${items.map((it, i) => `
            <div class="pc" data-layout-allow-overflow id="${ctx.idf('p' + i)}" style="left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;"><i style="background-image:url('${ctx.esc(it.src)}')"></i></div>`).join('')}
          </div>`;
      const js = `${HELPERS(ctx.motion)}
            var T = ${ctx.js(times)}, R = ${ctx.js(items.map((it) => it.rot))};
            for (var i = 0; i < T.length; i++) {
              tl.fromTo($("p" + i), { opacity: 0, scale: ${p.layout === 'mosaic' ? 0.6 : 1.25}, rotation: R[i] - 6 }, { opacity: 1, scale: 1, rotation: R[i], duration: ${p.layout === 'mosaic' ? 0.3 : 0.36}, ease: "power3.out" }, T[i]);
            }
            tl.fromTo($("wall"), { scale: 1 }, { scale: ${r2(1 + p.push)}, duration: D, ease: "none" }, 0);
            out($("wall"), ${ctx.js(p.out)});`;
      return { html, css, js };
    },
  },

  'post': {
    summary: 'A social post card: avatar (src or initials), name, handle, text with *highlight* words that get an orange box sweep at markAt, and a date line. Write your own copy; never imitate a real account.',
    sfx: (p) => [{ role: 'swipe', at: 0.08 }],
    params: { name: 'A. Writer', handle: '@writer', text: 'Then *AI* changed the rules.', date: '', avatar: '', on: 'light', x: null, y: 760, w: 820, h: 460, size: 48, min: 30, markAt: 0.7, out: 'fade' },
    prepare(p, { jobDir }) { if (p.avatar) needSrc(p.avatar, jobDir, 'post'); },
    render(p, ctx) {
      oneOf(p.out, ['fade', 'blur', 'cut'], 'post: out');
      const pad = 40, av = 92;
      const initials = p.name.split(/\s+/).map((s) => s[0] || '').join('').slice(0, 2).toUpperCase();
      const css = `${SLOT(ctx.sel('slot'), p)}
      ${ctx.sel('slot')} { display: flex; align-items: center; }
      ${ctx.sel('card')} { width: 100%; padding: ${pad}px; background: var(--white); border-radius: 28px; box-shadow: 0 24px 50px var(--shadow), 0 2px 6px rgba(0,0,0,0.08); }
      ${ctx.sel('head')} { display: flex; align-items: center; gap: 22px; margin-bottom: 26px; }
      ${ctx.sel('av')} { width: ${av}px; height: ${av}px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center;
        background: ${p.avatar ? `#ccc url("${ctx.esc(p.avatar)}") center / cover no-repeat` : 'var(--ink)'}; color: var(--white); ${ctx.family('display')} font-size: 34px; }
      ${ctx.sel('nm')} { display: block; ${ctx.family('display')} font-size: 36px; line-height: 1.1; color: var(--ink); white-space: nowrap; }
      ${ctx.sel('hd')} { display: block; ${ctx.family('body')} font-size: 28px; line-height: 1.2; color: var(--muted); white-space: nowrap; }
      ${ctx.sel('txt')} { display: block; ${ctx.family('body')} line-height: 1.22; color: var(--ink); }
      ${ctx.sel('txt')} .em {
        background-image: linear-gradient(var(--orange), var(--orange)); background-repeat: no-repeat; background-position: 0 50%; background-size: 0% 100%;
        padding: 0 0.1em; margin-left: calc(var(--sp) - 0.1em); margin-right: -0.1em;
      }
      ${ctx.sel('txt')} .ln > .em:first-child { margin-left: -0.1em; }
      ${ctx.sel('dt')} { display: block; margin-top: 24px; ${ctx.family('body')} font-size: 26px; color: var(--muted); }`;
      const html = `
          <div id="${ctx.idf('slot')}"><div id="${ctx.idf('card')}">
            <div id="${ctx.idf('head')}"><div id="${ctx.idf('av')}">${p.avatar ? '' : ctx.esc(initials)}</div><div><span id="${ctx.idf('nm')}">${ctx.esc(p.name)}</span><span id="${ctx.idf('hd')}">${ctx.esc(p.handle)}</span></div></div>
            <span id="${ctx.idf('txt')}"></span>${p.date ? `
            <span id="${ctx.idf('dt')}">${ctx.esc(p.date)}</span>` : ''}
          </div></div>`;
      const js = `${HELPERS(ctx.motion)}
            fit($("txt"), ${ctx.js(p.text)}, { font: ${ctx.js(font(ctx, 'body'))}, size: ${p.size}, min: ${p.min}, maxW: ${p.w - pad * 2}, maxH: ${p.h - pad * 2 - av - 26 - (p.date ? 60 : 0)}, maxLines: 5, lh: 1.22 });
            reveal($("card"), 0, { rise: 80, blur: 12, dur: ${ctx.motion.enter} });
            var em = $("txt").querySelectorAll(".em");
            if (em.length) tl.to(em, { backgroundSize: "100% 100%", duration: 0.34, ease: "power2.out", stagger: 0.08 }, ${p.markAt});
            out($("slot"), ${ctx.js(p.out)});`;
      return { html, css, js };
    },
  },

  'prompt': {
    summary: 'A prompt bar: the text types in (cps letters a second from typeAt), a cursor glides to the button and clicks at clickAt (default: typing end + 0.35), the button flashes; with result=<image> the result grows out of the bar above it. y is the centre of the whole group.',
    sfx: (p) => {
      const typeEnd = p.typeAt + p.text.length / p.cps;
      const click = p.clickAt ?? typeEnd + 0.35;
      return [{ role: 'type', at: p.typeAt + 0.45 }, { role: 'click', at: click }, ...(p.result ? [{ role: 'pop', at: click + 0.3 }] : [])];
    },
    params: { text: 'Make a 10 second video about it', button: 'Generate', on: 'light', mono: false, x: null, y: 900, w: 820, size: 34, typeAt: 0.25, cps: 24, clickAt: null, result: '', resultW: 560, resultRatio: 1, out: 'fade' },
    prepare(p, { jobDir }) {
      if (p.result) needSrc(p.result, jobDir, 'prompt');
      p._barH = Math.round(p.size * 3.2);
      p._resH = p.result ? Math.round(p.resultW / p.resultRatio) : 0;
      p.h = p._barH + (p.result ? p._resH + 40 : 0);
    },
    render(p, ctx) {
      oneOf(p.out, ['fade', 'blur', 'cut'], 'prompt: out');
      inks(p.on);
      const barH = p._barH, resH = p._resH;
      const typeEnd = p.typeAt + p.text.length / p.cps;
      const click = r2(p.clickAt ?? typeEnd + 0.35);
      const btnW = Math.round(p.size * 0.62 * p.button.length + p.size * 1.6);
      const textW = p.w - btnW - 70;
      const role = p.mono ? 'mono' : 'body';
      const css = `${SLOT(ctx.sel('slot'), p)}
      ${ctx.sel('bar')} {
        position: absolute; left: 0; bottom: 0; width: 100%; height: ${barH}px;
        display: flex; align-items: center; justify-content: space-between; padding: 0 ${Math.round(barH * 0.16)}px 0 ${Math.round(barH * 0.32)}px;
        background: var(--white); border: 2px solid var(--line); border-radius: ${Math.round(barH / 2)}px;
        box-shadow: 0 18px 40px var(--shadow);
      }
      ${ctx.sel('txt')} { display: block; width: ${textW}px; ${ctx.family(role)} line-height: 1.15; color: var(--ink); white-space: nowrap; overflow: hidden; }
      ${ctx.sel('btn')} {
        flex: none; height: ${Math.round(barH * 0.68)}px; padding: 0 ${Math.round(p.size * 0.8)}px; border-radius: ${Math.round(barH * 0.34)}px;
        display: flex; align-items: center; background: var(--orange); color: var(--ink);
        ${ctx.family('display')} font-size: ${Math.round(p.size * 0.9)}px; white-space: nowrap;
      }
      ${ctx.sel("cur")} { position: absolute; left: 0; top: 0; }
      ${p.result ? `${ctx.sel('res')} {
        position: absolute; left: ${r1((p.w - p.resultW) / 2)}px; top: 0; width: ${p.resultW}px; height: ${resH}px;
        background: #999 url("${ctx.esc(p.result)}") center / cover no-repeat; border-radius: 22px;
        box-shadow: 0 26px 50px rgba(0,0,0,0.3); transform-origin: 50% 100%;
      }` : ''}`;
      const html = `
          <div id="${ctx.idf('slot')}">${p.result ? `
            <div id="${ctx.idf('res')}"></div>` : ''}
            <div id="${ctx.idf('bar')}"><span id="${ctx.idf('txt')}"></span><span id="${ctx.idf('btn')}">${ctx.esc(p.button)}</span></div>
            ${CURSOR_SVG(ctx.idf('cur'))}
          </div>`;
      const js = `${HELPERS(ctx.motion)}
            fit($("txt"), ${ctx.js(p.text)}, { font: ${ctx.js(font(ctx, role))}, size: ${p.size}, min: 20, maxW: ${textW}, maxH: ${Math.round(p.size * 1.3)}, maxLines: 1, lh: 1.15 });
            var chars = [];
            $("txt").querySelectorAll(".w").forEach(function (w) {
              var s = w.textContent; w.textContent = "";
              for (var i = 0; i < s.length; i++) { var c = document.createElement("span"); c.textContent = s[i]; w.appendChild(c); chars.push(c); }
              chars.push(null);
            });
            tl.fromTo($("bar"), { opacity: 0, y: 40, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power3.out" }, 0);
            tl.set(chars.filter(Boolean), { opacity: 0 }, 0);
            for (var k = 0; k < chars.length; k++) if (chars[k]) tl.set(chars[k], { opacity: 1 }, ${p.typeAt} + k / ${p.cps});
            // The cursor: in from the lower right, onto the button, a press, then rest.
            // Canvas metrics, not offsetWidth: a slot off screen at load has no layout yet.
            var btn = $("btn");
            var bw = measure(${ctx.js(p.button)}, ${ctx.js(font(ctx, 'display'))}, ${Math.round(p.size * 0.9)}) + ${Math.round(p.size * 0.8) * 2};
            var bx = ${p.w - Math.round(barH * 0.16)} - bw * 0.45, by = ${p.h - barH / 2} + ${Math.round(barH * 0.08)};
            tl.fromTo($("cur"), { x: ${p.w} + 40, y: ${p.h} + 160, opacity: 0 }, { x: bx, y: by, opacity: 1, duration: 0.6, ease: "power3.inOut" }, Math.max(0.1, ${click} - 0.62));
            tl.to($("cur"), { scale: 0.82, duration: 0.07, ease: "power1.in", transformOrigin: "20% 15%" }, ${click} - 0.05);
            tl.to($("cur"), { scale: 1, duration: 0.14, ease: "power2.out" }, ${click} + 0.04);
            tl.to(btn, { scale: 0.92, duration: 0.07, ease: "power1.in" }, ${click} - 0.05);
            tl.to(btn, { scale: 1, backgroundColor: "#ffffff", duration: 0.18, ease: "power2.out" }, ${click} + 0.04);
            tl.to(btn, { backgroundColor: "${ctx.tokens.orange}", duration: 0.3, ease: "power1.out" }, ${click} + 0.25);${p.result ? `
            tl.fromTo($("res"), { opacity: 0, scale: 0.2, y: ${Math.round(resH * 0.4)} }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.3)" }, ${click} + 0.18);` : ''}
            out($("slot"), ${ctx.js(p.out)});`;
      return { html, css, js };
    },
  },

  'orbit': {
    summary: 'A central idea with satellites: an orange disc, a dark core with the label (oblique), and chips "A|B|C" that pop on at times and orbit slowly (turn degrees over the item). Use for "everything revolves around X" or "one tool, many jobs".',
    sfx: (p) => [{ role: 'pop', at: 0.2 }, ...fillTimes(nums(p.times, 'orbit'), splitList(p.items).length, 0.5, 0.25).map((at) => ({ role: 'tick', at: at + 0.12 }))],
    params: { label: 'Imagination', items: 'Script|Voice|Motion|Sound', icons: '', iconWeight: 'bold', on: 'dark', x: null, y: 860, size: 560, chip: 30, turn: 30, times: '', out: 'fade' },
    prepare(p) {
      p.w = p.size + 260; p.h = p.size + 140;
      const names = splitList(p.icons);
      if (names.length && names.length !== splitList(p.items).length) throw new Error('orbit: give one icon per item ("pencil-simple|microphone|...")');
      p._icons = names.map((n) => loadIcon(n, p.iconWeight, 'orbit'));
    },
    render(p, ctx) {
      oneOf(p.out, ['fade', 'blur', 'cut'], 'orbit: out');
      inks(p.on);
      const items = splitList(p.items);
      const times = fillTimes(nums(p.times, 'orbit'), items.length, 0.5, 0.25);
      const R = p.size / 2, core = Math.round(p.size * 0.44), cx = p.w / 2, cy = p.h / 2;
      const css = `${SLOT(ctx.sel('slot'), p)}
      ${ctx.sel('disc')} { position: absolute; left: ${r1(cx - R)}px; top: ${r1(cy - R)}px; width: ${p.size}px; height: ${p.size}px; border-radius: 50%;
        background: radial-gradient(circle at 40% 35%, color-mix(in srgb, var(--orange) 70%, white), var(--orange) 55%, color-mix(in srgb, var(--orange) 80%, black)); box-shadow: 0 30px 60px rgba(0,0,0,0.35); }
      ${ctx.sel('core')} { position: absolute; left: ${r1(cx - core / 2)}px; top: ${r1(cy - core / 2)}px; width: ${core}px; height: ${core}px; border-radius: 50%;
        background: var(--chip); display: flex; align-items: center; justify-content: center; box-shadow: 0 14px 30px rgba(0,0,0,0.4); }
      ${ctx.sel('lab')} { display: block; ${ctx.family('display')} font-style: italic; color: var(--white); text-align: center; line-height: 1.02; }
      ${ctx.sel('ring')} { position: absolute; left: ${r1(cx)}px; top: ${r1(cy)}px; width: 0; height: 0; }
      #${ctx.id}-layer .sat { position: absolute; left: 0; top: 0; width: max-content; }
      #${ctx.id}-layer .sat b svg { width: 1.15em; height: 1.15em; flex: none; color: var(--orange-deep); }
      #${ctx.id}-layer .sat b { display: flex; width: max-content; align-items: center; gap: 0.35em; white-space: nowrap; ${ctx.family('display')} font-size: ${p.chip}px; line-height: 1; color: var(--ink);
        background: var(--white); padding: 0.4em 0.7em; border-radius: 999px; box-shadow: 0 10px 22px rgba(0,0,0,0.3); }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('disc')}"></div>
            <div id="${ctx.idf('core')}"><span id="${ctx.idf('lab')}"></span></div>
            <div id="${ctx.idf('ring')}">${items.map((t, i) => {
              const a = (-90 + i * 360 / items.length) * Math.PI / 180;
              return `
              <div class="sat" id="${ctx.idf('s' + i)}" style="left:${r1(Math.cos(a) * (R + 14))}px;top:${r1(Math.sin(a) * (R + 14))}px;"><b id="${ctx.idf('c' + i)}">${p._icons[i] || ''}${ctx.esc(t)}</b></div>`;
            }).join('')}
            </div>
          </div>`;
      const js = `${HELPERS(ctx.motion)}
            fit($("lab"), ${ctx.js(p.label)}, { font: ${ctx.js(font(ctx, 'display', { style: 'italic' }))}, size: ${Math.round(core * 0.2)}, min: 20, maxW: ${Math.round(core * 0.82)}, maxH: ${Math.round(core * 0.6)}, lh: 1.02 });
            tl.fromTo($("disc"), { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: "back.out(1.5)" }, 0);
            tl.fromTo($("core"), { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.6)" }, 0.12);
            reveal($("lab"), 0.3, { rise: 12, blur: 8 });
            tl.fromTo($("ring"), { rotation: 0 }, { rotation: ${p.turn}, duration: D, ease: "none" }, 0);
            var T = ${ctx.js(times)};
            for (var i = 0; i < T.length; i++) {
              tl.set($("s" + i), { xPercent: -50, yPercent: -50 }, 0);
              tl.fromTo($("s" + i), { rotation: 0 }, { rotation: ${-p.turn}, duration: D, ease: "none" }, 0);
              pop($("c" + i), T[i]);
            }
            out($("slot"), ${ctx.js(p.out)});`;
      return { html, css, js };
    },
  },

  'counter': {
    summary: 'A big number that rolls from `from` to `to` (whole numbers; decimals=1 shows to=153 as 15.3, sep="," groups thousands) between countAt and countAt + countDur, with prefix and suffix (the suffix in the accent) and a label under it. For real, sourced figures only.',
    sfx: (p) => [{ role: 'tick', at: p.countAt + p.countDur }],
    params: { from: 0, to: 100, decimals: 0, sep: '', prefix: '', suffix: '', label: '', on: 'dark', x: null, y: 760, w: 760, h: 420, size: 220, countAt: 0.15, countDur: 1.2, ease: 'power2.out', out: 'fade' },
    prepare(p) {
      if (!Number.isInteger(p.from) || !Number.isInteger(p.to) || p.from < 0 || p.to < p.from) throw new Error('counter: from and to must be whole numbers with 0 <= from <= to');
    },
    render(p, ctx) {
      oneOf(p.out, ['fade', 'blur', 'cut'], 'counter: out');
      const c = inks(p.on);
      const f = font(ctx, 'display', { track: -0.04 });
      const css = `${SLOT(ctx.sel('slot'), p)}
      ${ctx.sel('slot')} { display: flex; flex-direction: column; align-items: center; justify-content: center; }
      ${ctx.sel('row')} { display: flex; align-items: flex-start; ${ctx.family('display')} line-height: 1.18; letter-spacing: -0.04em; color: ${c.fg}; font-variant-numeric: tabular-nums; white-space: nowrap; }
      ${ctx.sel('suf')} { color: ${c.accent}; }
      ${ctx.sel('lab')} { display: block; margin-top: ${Math.max(26, Math.round(p.size * 0.12))}px; ${ctx.family('body')} color: ${c.muted}; text-align: center; line-height: 1.2; }${ODO_CSS(ctx.sel('num'))}`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('row')}"><span id="${ctx.idf('pre')}">${ctx.esc(p.prefix)}</span><span id="${ctx.idf('num')}"></span><span id="${ctx.idf('suf')}">${ctx.esc(p.suffix)}</span></div>${p.label ? `
            <span id="${ctx.idf('lab')}"></span>` : ''}
          </div>`;
      const js = `${HELPERS(ctx.motion)}${ODOMETER}
            var full = ${ctx.js(p.prefix + fmtNum(p.to, p.decimals, p.sep) + p.suffix)};
            var size = ${p.size};
            while (size > 60 && measure(full, ${ctx.js(f)}, size) > ${p.w}) size *= 0.95;
            $("row").style.fontSize = size.toFixed(1) + "px";
            odometer($("num"), ${p.from}, ${p.to}, ${ctx.js(f)}, size, ${p.countAt}, ${p.countDur}, ${ctx.js(p.ease)}, ${p.decimals}, ${ctx.js(p.sep)});${p.label ? `
            fit($("lab"), ${ctx.js(p.label)}, { font: ${ctx.js(font(ctx, 'body'))}, size: 40, min: 26, maxW: ${p.w}, maxH: 100, maxLines: 2, lh: 1.2 });
            reveal($("lab"), ${r2(p.countAt + 0.2)}, { rise: 16, blur: 6 });` : ''}
            reveal($("row"), 0, { rise: 40, blur: 12, dur: 0.4 });
            out($("slot"), ${ctx.js(p.out)});`;
      return { html, css, js };
    },
  },

  'range': {
    summary: 'A gauge for a trade-off: a bar cut into zones "Label:note:bad|Label:note:good|..." and a labelled knob that glides to each position in moves "pos@t,..." (pos 0..1 along the bar, t seconds from the item start; the first move places it). When the knob lands in a zone, the zone pulses and its note appears. Use for too-low / sweet-spot / too-high decisions.',
    sfx: (p) => parseMoves(p.moves).slice(1).map((m) => ({ role: 'tick', at: m.t + 0.25 })),
    params: { zones: 'Too low:IRS flags it:bad|Sweet spot::good|Too high:Smaller deduction:bad', knob: 'Salary', moves: '0.5@0.4,0.88@2,0.12@3.6', title: '', on: 'light', x: null, y: 860, w: 820, h: 420, label: 34, out: 'fade' },
    prepare(p) {
      const zones = splitList(p.zones).map((z) => { const [label, note = '', tone = 'neutral'] = z.split(':').map((s) => s.trim()); return { label, note, tone }; });
      if (zones.length < 2) throw new Error('range: give at least two zones ("Low:note:bad|High:note:good")');
      for (const z of zones) oneOf(z.tone, ['bad', 'good', 'neutral'], 'range: zone tone');
      p._zones = zones;
      p._moves = parseMoves(p.moves);
      if (!p._moves.length) throw new Error('range: moves needs at least one "pos@t"');
    },
    render(p, ctx) {
      oneOf(p.out, ['fade', 'blur', 'cut'], 'range: out');
      const c = inks(p.on);
      const m = ctx.motion;
      const zones = p._zones; const moves = p._moves;
      const barH = 34; const knob = 70;
      const titleH = p.title ? Math.round(p.label * 1.9) : 0;
      const barY = titleH + Math.round(p.label * 2.1) + 20;
      const zw = p.w / zones.length;
      const fill = { bad: 'color-mix(in srgb, var(--orange) 38%, var(--white))', good: 'color-mix(in srgb, var(--good) 45%, var(--white))', neutral: 'var(--white)' };
      const ink = { bad: c.accent, good: 'var(--good-deep)', neutral: c.fg };
      const css = `${SLOT(ctx.sel('slot'), p)}
      ${ctx.sel('title')} { position: absolute; left: 0; top: 0; width: 100%; display: block; ${ctx.family('display')} color: ${c.fg}; text-align: center; line-height: 1.05; }
      ${ctx.sel('bar')} { position: absolute; left: 0; top: ${barY}px; width: ${p.w}px; height: ${barH}px; display: flex; border: 4px solid var(--ink); border-radius: ${barH}px; overflow: hidden; transform-origin: 0 50%; box-shadow: 0 8px 0 var(--shadow); }
      #${ctx.id}-layer .zn { flex: 1; height: 100%; transform-origin: 50% 50%; }
      #${ctx.id}-layer .zn + .zn { border-left: 3px solid var(--ink); }
      #${ctx.id}-layer .zl { position: absolute; top: ${barY - Math.round(p.label * 1.55)}px; display: block; text-align: center; ${ctx.family('display')} line-height: 1; white-space: nowrap; }
      #${ctx.id}-layer .zt { position: absolute; top: ${barY + barH / 2 + knob / 2 + 10 + Math.round(p.label * 0.8 * 1.64) + 16}px; display: block; text-align: center; ${ctx.family('body')} line-height: 1.15; }
      ${ctx.sel('knob')} { position: absolute; left: 0; top: ${barY + barH / 2 - knob / 2}px; width: ${knob}px; height: ${knob}px; border-radius: 50%; background: var(--white); border: 5px solid var(--ink); box-shadow: 0 10px 18px var(--shadow); }
      ${ctx.sel('tag')} { position: absolute; left: 50%; top: ${knob + 10}px; transform: translateX(-50%); white-space: nowrap; ${ctx.family('display')} font-size: ${Math.round(p.label * 0.8)}px; line-height: 1; color: var(--white); background: var(--chip); padding: 0.32em 0.6em; border-radius: 8px; }`;
      const html = `
          <div id="${ctx.idf('slot')}">${p.title ? `
            <span id="${ctx.idf('title')}"></span>` : ''}
            <div id="${ctx.idf('bar')}">${zones.map((z, i) => `<i class="zn" id="${ctx.idf('z' + i)}" style="background: ${fill[z.tone]};"></i>`).join('')}</div>${zones.map((z, i) => `
            <span class="zl" id="${ctx.idf('l' + i)}" style="left: ${r1(i * zw)}px; width: ${r1(zw)}px; color: ${ink[z.tone]};"></span>${z.note ? `
            <span class="zt" id="${ctx.idf('n' + i)}" style="left: ${r1(i * zw)}px; width: ${r1(zw)}px; color: ${ink[z.tone]};"></span>` : ''}`).join('')}
            <div id="${ctx.idf('knob')}"><span id="${ctx.idf('tag')}">${ctx.esc(p.knob)}</span></div>
          </div>`;
      const zoneAt = (pos) => Math.min(zones.length - 1, Math.max(0, Math.floor(pos * zones.length)));
      const kx = (pos) => r1(pos * p.w - knob / 2);
      const js = `${HELPERS(m)}${p.title ? `
            fit($("title"), ${ctx.js(p.title)}, { font: ${ctx.js(font(ctx, 'display'))}, size: ${Math.round(p.label * 1.4)}, min: 24, maxW: ${p.w}, maxH: ${titleH}, maxLines: 1, lh: 1.05 });
            reveal($("title"), 0);` : ''}
            var Z = ${ctx.js(zones)};
            for (var i = 0; i < Z.length; i++) {
              fit($("l" + i), Z[i].label, { font: ${ctx.js(font(ctx, 'display'))}, size: ${p.label}, min: 20, maxW: ${r1(zw - 12)}, maxH: ${Math.round(p.label * 1.2)}, maxLines: 1, lh: 1 });
              if (Z[i].note) fit($("n" + i), Z[i].note, { font: ${ctx.js(font(ctx, 'body'))}, size: ${Math.round(p.label * 0.8)}, min: 18, maxW: ${r1(zw - 12)}, maxH: ${Math.round(p.label * 2)}, maxLines: 2, lh: 1.15 });
              reveal($("l" + i), 0.2 + i * 0.1, { rise: 14, blur: 6, dur: 0.3 });
            }
            tl.fromTo($("bar"), { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power3.out" }, 0.05);
            tl.set($("knob"), { x: ${kx(moves[0].pos)} }, 0);
            pop($("knob"), ${moves[0].t}, { from: 0.3 });${moves.map((mv, k) => {
              const z = zoneAt(mv.pos);
              const land = k ? r2(mv.t + 0.25) : r2(mv.t + 0.15);
              return `${k ? `
            tl.to($("knob"), { x: ${kx(mv.pos)}, duration: 0.5, ease: "power3.inOut" }, ${r2(mv.t - 0.25)});` : ''}
            tl.fromTo($("z${z}"), { scaleY: 1 }, { scaleY: 1.6, duration: 0.14, ease: "power2.out", yoyo: true, repeat: 1 }, ${land});
            tl.to($("knob"), { borderColor: ${ctx.js(zones[z].tone === 'good' ? ctx.tokens['good-deep'] : zones[z].tone === 'bad' ? ctx.tokens['orange-deep'] : ctx.tokens.ink)}, duration: 0.2, ease: "power1.out" }, ${land});${zones[z].note ? `
            reveal($("n${z}"), ${land}, { rise: 12, blur: 6, dur: 0.3 });` : ''}`;
            }).join('')}
            out($("slot"), ${ctx.js(p.out)});`;
      return { html, css, js };
    },
  },

  'icon': {
    summary: 'A Phosphor icon (from library/icons/phosphor; add one with rcg assets icon add <name> --weight bold) popping on at `at`, coloured by tone; badge none, disc (orange disc, dark icon), chip (dark key cap, orange icon) or ring; optional label under it. Use beside a word it names, or several in a row.',
    sfx: (p) => soundAt(p, p.at + 0.1),
    params: { name: 'sparkle', weight: 'bold', tone: 'accent', on: 'dark', badge: 'none', label: '', x: null, y: 760, size: 180, at: 0.05, enter: 'pop', sound: 'pop', out: 'fade' },
    prepare(p) {
      p._svg = loadIcon(p.name, p.weight, 'icon');
      const box = p.badge === 'none' ? p.size : Math.round(p.size * 1.55);
      p._box = box;
      p.w = Math.max(box, p.label ? Math.round(p.size * 2.4) : 0);
      p.h = box + (p.label ? Math.round(p.size * 0.5) : 0);
    },
    render(p, ctx) {
      oneOf(p.badge, ['none', 'disc', 'chip', 'ring'], 'icon: badge');
      oneOf(p.tone, ['accent', 'fg', 'muted', 'white', 'ink', 'orange'], 'icon: tone');
      oneOf(p.enter, ['pop', 'rise', 'spin'], 'icon: enter');
      oneOf(p.out, ['fade', 'blur', 'cut'], 'icon: out');
      oneOf(p.sound, SOUNDS, 'icon: sound');
      const c = inks(p.on);
      const tone = { accent: c.accent, fg: c.fg, muted: c.muted, white: 'var(--white)', ink: 'var(--ink)', orange: 'var(--orange)' }[p.tone];
      const color = p.badge === 'disc' ? 'var(--ink)' : p.badge === 'chip' ? 'var(--orange)' : tone;
      const badge = {
        none: '',
        disc: 'border-radius: 50%; background: radial-gradient(circle at 40% 35%, color-mix(in srgb, var(--orange) 70%, white), var(--orange) 55%, color-mix(in srgb, var(--orange) 80%, black)); box-shadow: 0 18px 36px rgba(0,0,0,0.3);',
        chip: `border-radius: ${Math.round(p._box * 0.24)}px; background: linear-gradient(160deg, #3a3a3a, var(--chip) 60%); box-shadow: 0 14px 30px var(--shadow), inset 0 2px 0 rgba(255,255,255,0.14);`,
        ring: `border-radius: 50%; border: ${Math.max(4, Math.round(p.size * 0.04))}px solid ${tone};`,
      }[p.badge];
      const svg = p._svg.replace(/^<svg\b/, `<svg id="${ctx.idf('svg')}" width="${p.size}" height="${p.size}"`);
      const css = `${SLOT(ctx.sel('slot'), p)}
      ${ctx.sel('slot')} { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
      ${ctx.sel('box')} { width: ${p._box}px; height: ${p._box}px; flex: none; display: flex; align-items: center; justify-content: center; color: ${color}; ${badge} }
      ${ctx.sel('svg')} { display: block; }
      ${ctx.sel('lab')} { display: block; margin-top: ${Math.round(p.size * 0.12)}px; ${ctx.family('display')} color: ${c.fg}; text-align: center; line-height: 1.05; white-space: nowrap; }`;
      const html = `
          <div id="${ctx.idf('slot')}"><div id="${ctx.idf('box')}">${svg}</div>${p.label ? `<span id="${ctx.idf('lab')}"></span>` : ''}</div>`;
      const enter = {
        pop: `pop($("box"), ${p.at}, { from: 0.4 });`,
        rise: `reveal($("box"), ${p.at}, { rise: 40, blur: 10, dur: 0.4 });`,
        spin: `tl.fromTo($("box"), { opacity: 0, scale: 0.4, rotation: -120 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.5, ease: "back.out(1.5)" }, ${p.at});`,
      }[p.enter];
      const js = `${HELPERS(ctx.motion)}
            ${enter}${p.label ? `
            fit($("lab"), ${ctx.js(p.label)}, { font: ${ctx.js(font(ctx, 'display'))}, size: ${Math.round(p.size * 0.26)}, min: 22, maxW: ${p.w}, maxH: ${Math.round(p.size * 0.4)}, maxLines: 1, lh: 1.05 });
            reveal($("lab"), ${r2(p.at + 0.12)}, { rise: 14, blur: 6, dur: 0.3 });` : ''}
            out($("slot"), ${ctx.js(p.out)});`;
      return { html, css, js };
    },
  },
};

// Scene reveal: a part that enters with a ground's wipe, arc, iris or fade rides the same
// clip on its own layer, so it shows only where the new ground already is (else it floats
// over the outgoing scene). rcg infographics resolve sets `reveal` for items that start with
// a revealing ground. Times and shapes match the ground's entrances above.
const REVEALS = {
  fade: (m) => `tl.fromTo(${m}, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" }, 0);`,
  'wipe-up': (m) => `tl.fromTo(${m}, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.42, ease: "power3.inOut" }, 0); tl.set(${m}, { clipPath: "none" }, 0.42);`,
  'wipe-left': (m) => `tl.fromTo(${m}, { clipPath: "inset(0% 0% 0% 100%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.42, ease: "power3.inOut" }, 0); tl.set(${m}, { clipPath: "none" }, 0.42);`,
  arc: (m) => `tl.fromTo(${m}, { clipPath: "circle(0% at -30% 120%)" }, { clipPath: "circle(190% at -30% 120%)", duration: 0.62, ease: "power2.inOut" }, 0); tl.set(${m}, { clipPath: "none" }, 0.62);`,
  iris: (m) => `tl.fromTo(${m}, { clipPath: "circle(0% at 50% 45%)" }, { clipPath: "circle(120% at 50% 45%)", duration: 0.5, ease: "power3.inOut" }, 0); tl.set(${m}, { clipPath: "none" }, 0.5);`,
};
for (const [name, comp] of Object.entries(components)) {
  if (name === 'ground') continue;
  comp.params.reveal = 'none';
  const render = comp.render;
  comp.render = (p, ctx) => {
    oneOf(p.reveal, ['none', ...Object.keys(REVEALS)], `${name}: reveal`);
    const out = render(p, ctx);
    if (p.reveal === 'none') return out;
    return { ...out, js: `${out.js}
            ${REVEALS[p.reveal]('$("layer")')}` };
  };
}
