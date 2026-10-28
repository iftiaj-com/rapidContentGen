// Character Lighting components for rcg style (tools/blocks/style.mjs).
//
// relight: lights a character on footage after the shoot. Real light shapes a face in 3D; this is
// 2D light shaping that gives the same read. The component draws its own copy of the tracked clip
// (so every blend happens inside the sub-composition), then, in face units that follow the face
// track frame by frame (rcg track: centre, width, roll), it lays shadows (a hard or soft half
// shadow for side keys, a fall-off into darkness, a shadow from above or below, an eye band, window
// blinds), light pools (screen / soft-light ellipses in the light's colour) and a grade. With the
// subject matte (rcg matte) it also drops the background behind the subject, re-draws the subject
// with its own exposure, and draws a rim light from the matte's edge (an SVG filter: the alpha
// eroded, shifted away from the light and cut out of itself). Twelve named setups carry what each
// one communicates (SETUPS); every number can be overridden.
//
// light-plot: the top-down lighting diagram of the reference: room, backdrop, the subject facing
// the camera, the camera's view cone, and each light as a fixture icon with its beam and role
// label. With from= the lights slide from the previous setup's places.
//
// mood-tag: a small dark card naming the setup and what it says (SPLIT LIGHT / Secrecy).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
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

/** A token reference as a literal colour (for SVG attributes and filter floods). */
const lit = (ctx, v) => (String(v).startsWith('var(--') ? ctx.tokens[String(v).slice(6, -1)] : v);

/** A colour-dodge pool must be a dark tint: dodge divides by (1 - colour), so a near-white colour
 * clips every channel it touches. At 0.42 brightness the pool is an exposure gain of about 1.7x. */
function dodgeTint(hex, k = 0.42) {
  const m = String(hex).match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return `rgb(${c.join(', ')})`;
}

const font = (ctx, role, extra = {}) => ({ family: ctx.type[role].family, weight: ctx.type[role].weight, ...extra });

// ── The setups ───────────────────────────────────────────────────────────────
//
// Face units: 100 = the tracked face box width; origin at the box centre, +x toward the key
// (mirrored when the key is on the camera's left), +y down. The box runs from about the hairline
// (-60) to the chin (+60); the eyes sit near -22 (measured per clip, `eyes`).
//
// look:
//   fall   {depth, rx, ry, x, y}       darkness outside an ellipse around the lit area
//   shade  {depth, soft, off, tilt, cheek?}  half shadow on the side away from the key
//   top    {depth, from, to}           shadow from above (dark at `from`, clear by `to`)
//   below  {depth, from, to}           shadow from below (clear at `from`, dark by `to`)
//   band   {depth, rx, ry}             a shadow band over the eyes
//   blinds {depth, period, duty, angle} window-blind stripes on the key side
//   pools  [{x, y, rx, ry, color, a, blend}]  light pools in the light's colour
//   bg     {depth, color}              (matte) background dropped behind the subject
//   backdrop {color, a}                (matte) a lit backdrop, screen-blended (silhouette)
//   cut    {b, c, s}                   (matte) the subject's brightness, contrast, saturation
//   rim    {color, width, dir, glow, a} (matte) rim light; dir = where the light comes from
//   grade  {color, a, desat}           colour wash (soft-light) and desaturation
// plot: lights for the light plot. az = degrees around the subject from the camera side
// (0 = beside the camera, 90 = the key side, 180 = behind), dist 0-1, kind spot | soft | card | blinds,
// h = above | below for a light over or under the head.

export const SETUPS = {
  front: {
    name: 'Front light', meaning: 'Innocence', side: 'right',
    reads: 'Even light from the camera side: no shadows to hide in, the face open and readable. Trust, honesty, youth, a clean slate.',
    look: {
      fall: { depth: 0.32, rx: 270, ry: 340, x: 0, y: 50 },
      pools: [
        { x: 0, y: -10, rx: 125, ry: 150, color: 'key-soft', a: 0.24, blend: 'soft-light' },
        { x: 0, y: -8, rx: 110, ry: 140, color: 'key-soft', a: 0.12, blend: 'color-dodge' },
      ],
      bg: { depth: 0.25, color: '#0b0b0c' },
      cut: { b: 1.06, c: 0.9, s: 1.03 },
      grade: { color: 'grade-warm', a: 0.1, desat: 0 },
    },
    plot: [{ role: 'key', az: 0, dist: 0.42, kind: 'soft', color: 'key-soft' }],
  },
  split: {
    name: 'Split light', meaning: 'Secrecy', side: 'left',
    reads: 'A hard light at 90 degrees: half the face lit, half in black. A divided character, something hidden, two sides.',
    look: {
      shade: { depth: 0.93, soft: 3, off: 0, tilt: 0 },
      fall: { depth: 0.82, rx: 175, ry: 255, x: 45, y: 30 },
      pools: [{ x: 45, y: -15, rx: 80, ry: 115, color: 'key-warm', a: 0.18, blend: 'soft-light' }],
      bg: { depth: 0.9 },
      cut: { b: 1, c: 1.12, s: 1 },
    },
    plot: [{ role: 'key', az: 90, dist: 0.62, kind: 'spot', color: 'key-warm' }],
  },
  under: {
    name: 'Under light', meaning: 'Threat', side: 'right',
    reads: 'Light from below throws shadows upward, against nature (sun and ceilings light from above). Monster light: danger, menace, the uncanny.',
    look: {
      top: { depth: 0.88, from: -115, to: 15 },
      fall: { depth: 0.84, rx: 170, ry: 220, x: 0, y: 70 },
      pools: [
        { x: 0, y: 50, rx: 80, ry: 60, color: 'under', a: 0.3, blend: 'color-dodge' },
        { x: 0, y: 30, rx: 125, ry: 95, color: 'under', a: 0.25, blend: 'soft-light' },
      ],
      bg: { depth: 0.93 },
      cut: { b: 1, c: 1.18, s: 0.75 },
      grade: { color: 'grade-green', a: 0.14, desat: 0.25 },
    },
    plot: [{ role: 'key', az: 0, dist: 0.16, kind: 'spot', color: 'under', h: 'below' }],
  },
  top: {
    name: 'Top light', meaning: 'Unreadable', side: 'right',
    reads: 'Light straight down: the brow shades the eyes, so we cannot read the thoughts behind them. Emotional opacity, authority, interrogation, a closed-off figure.',
    look: {
      pools: [{ x: 0, y: -82, rx: 112, ry: 62, color: 'key-white', a: 0.36, blend: 'color-dodge' }],
      band: { depth: 0.86, rx: 74, ry: 19 },
      below: { depth: 0.7, from: 15, to: 85 },
      fall: { depth: 0.86, rx: 170, ry: 200, x: 0, y: -40 },
      bg: { depth: 0.92 },
      cut: { b: 0.95, c: 1.15, s: 0.85 },
      grade: { a: 0, desat: 0.15 },
    },
    plot: [{ role: 'key', az: 0, dist: 0, kind: 'spot', color: 'key-white', h: 'above' }],
  },
  'back-blue': {
    name: 'Blue backlight', meaning: 'Cold', side: 'right', needsMatte: true,
    reads: 'A cool light behind, the face left in the dark: only an outline. Distance, detachment, a cold or aloof character, someone we are not let close to.',
    look: {
      fall: { depth: 0.5, rx: 200, ry: 300, x: 0, y: 40 },
      bg: { depth: 0.95, color: '#02040b' },
      cut: { b: 0.17, c: 1, s: 0.4 },
      rim: { color: 'rim-blue', width: 0.035, dir: [0.35, -1], glow: 0.6, a: 1 },
      grade: { color: 'grade-cold', a: 0.3, desat: 0 },
    },
    plot: [{ role: 'back', az: 155, dist: 0.5, kind: 'spot', color: 'rim-blue' }],
  },
  'three-point': {
    name: 'Three-point', meaning: 'Heroic', side: 'right',
    reads: 'Key at about 45 degrees, a softer fill on the other side, a back light that separates the head from the background. Balanced, confident, in control: the hero.',
    look: {
      shade: { depth: 0.5, soft: 30, off: -22, tilt: 10 },
      fall: { depth: 0.6, rx: 235, ry: 335, x: 20, y: 60 },
      pools: [
        { x: 40, y: -20, rx: 95, ry: 120, color: 'key-warm', a: 0.22, blend: 'soft-light' },
        { x: 30, y: -25, rx: 70, ry: 90, color: 'key-warm', a: 0.1, blend: 'color-dodge' },
      ],
      bg: { depth: 0.55 },
      cut: { b: 1.03, c: 1.08, s: 1.05 },
      rim: { color: 'rim-warm', width: 0.025, dir: [-0.6, -1], glow: 0.35, a: 0.8 },
      grade: { color: 'grade-warm', a: 0.1, desat: 0 },
    },
    plot: [
      { role: 'key', az: 42, dist: 0.5, kind: 'soft', color: 'key-warm' },
      { role: 'fill', az: -58, dist: 0.62, kind: 'spot', color: 'key-soft' },
      { role: 'back', az: -150, dist: 0.55, kind: 'spot', color: 'rim-warm' },
    ],
  },
  rembrandt: {
    name: 'Rembrandt', meaning: 'Depth', side: 'right',
    reads: 'A high key at about 45 degrees, no fill: the far cheek falls dark except a small lit triangle under the eye. Gravity, inner life, a character with a past.',
    look: {
      shade: { depth: 0.8, soft: 12, off: -16, tilt: 14, cheek: { x: -24, y: 12, rx: 13, ry: 17 } },
      fall: { depth: 0.76, rx: 190, ry: 260, x: 30, y: 30 },
      pools: [{ x: 40, y: -25, rx: 85, ry: 110, color: 'key-warm', a: 0.2, blend: 'soft-light' }],
      bg: { depth: 0.78 },
      cut: { b: 1, c: 1.1, s: 1 },
      grade: { color: 'grade-warm', a: 0.15, desat: 0 },
    },
    plot: [{ role: 'key', az: 48, dist: 0.55, kind: 'soft', color: 'key-warm' }],
  },
  loop: {
    name: 'Loop light', meaning: 'Approachable', side: 'right',
    reads: 'A soft key a little off the camera and above, a light fill: gentle modelling, nothing dramatic. Natural, warm, everyday: the friend, the narrator, the interview.',
    look: {
      shade: { depth: 0.45, soft: 28, off: -30, tilt: 16 },
      fall: { depth: 0.45, rx: 245, ry: 325, x: 25, y: 50 },
      pools: [{ x: 35, y: -20, rx: 100, ry: 125, color: 'key-soft', a: 0.18, blend: 'soft-light' }],
      bg: { depth: 0.35 },
      grade: { color: 'grade-warm', a: 0.08, desat: 0 },
    },
    plot: [
      { role: 'key', az: 30, dist: 0.5, kind: 'soft', color: 'key-soft' },
      { role: 'fill', az: -40, dist: 0.66, kind: 'card', color: 'key-soft' },
    ],
  },
  butterfly: {
    name: 'Butterfly', meaning: 'Idealised', side: 'right',
    reads: 'A key straight in front and above (with a bounce below): a small shadow under the nose and chin, cheekbones shaped. Glamour, the star, an idealised or admired figure.',
    look: {
      below: { depth: 0.55, from: 48, to: 82 },
      fall: { depth: 0.56, rx: 150, ry: 225, x: 0, y: -10 },
      pools: [
        { x: 0, y: -30, rx: 110, ry: 120, color: 'key-white', a: 0.22, blend: 'soft-light' },
        { x: 0, y: -35, rx: 80, ry: 70, color: 'key-white', a: 0.12, blend: 'color-dodge' },
      ],
      bg: { depth: 0.6 },
      cut: { b: 1.04, c: 1.05, s: 1.05 },
      grade: { color: 'grade-warm', a: 0.08, desat: 0 },
    },
    plot: [
      { role: 'key', az: 0, dist: 0.38, kind: 'soft', color: 'key-white', h: 'above' },
      { role: 'bounce', az: 0, dist: 0.2, kind: 'card', color: 'key-white', h: 'below' },
    ],
  },
  noir: {
    name: 'Noir', meaning: 'Guilt', side: 'right',
    reads: 'A hard side key cut by window blinds, black shadows, no colour. Moral ambiguity, guilt, a trap closing: the suspect, the detective at night.',
    look: {
      shade: { depth: 0.9, soft: 8, off: 8, tilt: 22 },
      blinds: { depth: 0.6, period: 26, duty: 0.42, angle: -24 },
      fall: { depth: 0.86, rx: 180, ry: 240, x: 30, y: 20 },
      pools: [
        { x: 40, y: -10, rx: 90, ry: 120, color: 'key-white', a: 0.25, blend: 'soft-light' },
        { x: 38, y: -12, rx: 60, ry: 90, color: 'key-white', a: 0.4, blend: 'color-dodge' },
      ],
      bg: { depth: 0.86 },
      cut: { b: 1, c: 1.25, s: 0.2 },
      grade: { a: 0, desat: 0.9 },
    },
    plot: [
      { role: 'key', az: 70, dist: 0.66, kind: 'spot', color: 'key-white' },
      { role: 'blinds', az: 70, dist: 0.4, kind: 'blinds', color: 'key-white' },
    ],
  },
  dual: {
    name: 'Dual colour', meaning: 'Conflict', side: 'right',
    reads: 'Warm from one side, cool from the other: two forces on one face. Inner conflict, a choice, a character torn between two worlds.',
    look: {
      fall: { depth: 0.72, rx: 205, ry: 285, x: 0, y: 30 },
      pools: [
        { x: 62, y: -10, rx: 85, ry: 150, color: 'dual-warm', a: 0.42, blend: 'soft-light' },
        { x: 66, y: -12, rx: 55, ry: 110, color: 'dual-warm', a: 0.18, blend: 'color-dodge' },
        { x: -62, y: -10, rx: 85, ry: 150, color: 'dual-cool', a: 0.42, blend: 'soft-light' },
        { x: -66, y: -12, rx: 55, ry: 110, color: 'dual-cool', a: 0.18, blend: 'color-dodge' },
      ],
      bg: { depth: 0.82 },
      cut: { b: 0.92, c: 1.12, s: 0.9 },
      rim: { color: 'dual-cool', width: 0.03, dir: [-1, -0.3], glow: 0.4, a: 0.7 },
    },
    plot: [
      { role: 'warm', az: 80, dist: 0.56, kind: 'spot', color: 'dual-warm' },
      { role: 'cool', az: -80, dist: 0.56, kind: 'spot', color: 'dual-cool' },
    ],
  },
  silhouette: {
    name: 'Silhouette', meaning: 'Unknown', side: 'right', needsMatte: true,
    reads: 'Only the background is lit; the character is a black shape. Anonymity, a threat not yet revealed, or an iconic figure before the reveal.',
    look: {
      bg: { depth: 0 },
      backdrop: { color: 'key-white', a: 0.5 },
      cut: { b: 0, c: 1, s: 0 },
      rim: { color: 'key-white', width: 0.02, dir: [0, 0], glow: 0.35, a: 0.45 },
    },
    plot: [{ role: 'back', az: 180, dist: 0.85, kind: 'soft', color: 'key-white' }],
  },
};

const SETUP_NAMES = Object.keys(SETUPS);
const MATTE_SETUPS = SETUP_NAMES.filter((k) => SETUPS[k].needsMatte);

// ── Job files ────────────────────────────────────────────────────────────────

function findOne(dir, re, what, hint) {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)) : [];
  if (files.length === 1) return files[0];
  if (!files.length) return null;
  throw new Error(`${what}: several found (${files.join(', ')}); ${hint}`);
}

function loadTrack(jobDir, spec) {
  let rel = spec;
  if (spec === 'auto') {
    const f = findOne(join(jobDir, 'data'), /^track-.*\.json$/, 'relight track', 'pass track=data/track-<name>.json');
    rel = f ? `data/${f}` : null;
  }
  if (!rel) return null;
  const file = join(jobDir, rel);
  if (!existsSync(file)) throw new Error(`relight: track ${rel} not found in the job`);
  const t = JSON.parse(readFileSync(file, 'utf8'));
  if (!t.face || !Array.isArray(t.face.cx)) throw new Error(`relight: ${rel} has no face track`);
  return { rel, t };
}

function findMatte(jobDir, spec) {
  if (!spec || spec === 'none') return null;
  if (spec !== 'auto') {
    if (!existsSync(join(jobDir, spec))) throw new Error(`relight: matte ${spec} not found in the job`);
    return spec;
  }
  const f = findOne(join(jobDir, 'assets', 'matte'), /-fg\.webm$/, 'relight matte', 'pass matte=assets/matte/<name>-fg.webm');
  return f ? `assets/matte/${f}` : null;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// ── relight helpers ──────────────────────────────────────────────────────────

const BLACK = (a) => `rgba(0, 0, 0, ${r2(a)})`;

/** The rig children (normal blend, black): built in face units around a centre at (HU, HU). */
function rigLayers(look, p, ctx, HU) {
  const out = [];
  const css = [];
  const k = p.amount;
  const box = (name, extra) => {
    out.push(`<div id="${ctx.idf(name)}"></div>`);
    css.push(`${ctx.sel(name)} { position: absolute; left: ${-HU}px; top: ${-HU}px; width: ${HU * 2}px; height: ${HU * 2}px; ${extra} }`);
  };
  if (look.fall) {
    const f = look.fall;
    box('fall', `background: radial-gradient(ellipse ${f.rx}px ${f.ry}px at ${HU + f.x}px ${HU + f.y}px, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 38%, ${BLACK(f.depth * k)} 100%);`);
  }
  if (look.shade) {
    const s = look.shade;
    const depth = (p.depth ?? s.depth) * k;
    const soft = Math.max(1, p.soft ?? s.soft);
    const a = HU + s.off - soft;
    const b = HU + s.off + soft;
    let mask = '';
    if (s.cheek) {
      // The cheek patch in the shade's own (rotated) frame.
      const th = (-s.tilt * Math.PI) / 180;
      const cx = s.cheek.x * Math.cos(th) - s.cheek.y * Math.sin(th);
      const cy = s.cheek.x * Math.sin(th) + s.cheek.y * Math.cos(th);
      const g = `radial-gradient(ellipse ${s.cheek.rx}px ${s.cheek.ry}px at ${r1(HU + cx)}px ${r1(HU + cy)}px, transparent 0%, transparent 45%, #000 100%)`;
      mask = `-webkit-mask-image: ${g}; mask-image: ${g};`;
    }
    box('shade', `background: linear-gradient(to right, ${BLACK(depth)} 0px, ${BLACK(depth)} ${r1(a)}px, rgba(0,0,0,0) ${r1(b)}px); transform: rotate(${s.tilt}deg); transform-origin: ${HU}px ${HU}px; ${mask}`);
  }
  if (look.top) {
    const s = look.top;
    box('top', `background: linear-gradient(to bottom, ${BLACK(s.depth * k)} 0px, ${BLACK(s.depth * k)} ${HU + s.from}px, rgba(0,0,0,0) ${HU + s.to}px);`);
  }
  if (look.below) {
    const s = look.below;
    box('below', `background: linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) ${HU + s.from}px, ${BLACK(s.depth * k)} ${HU + s.to}px, ${BLACK(s.depth * k)} 100%);`);
  }
  if (look.blinds) {
    const s = look.blinds;
    const on = r1(s.period * s.duty);
    const g = `linear-gradient(to right, transparent 0px, transparent ${HU - 40}px, #000 ${HU + 10}px)`;
    box('blinds', `background: repeating-linear-gradient(${s.angle}deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) ${r1(s.period - on)}px, ${BLACK(s.depth * k)} ${r1(s.period - on + 1.5)}px, ${BLACK(s.depth * k)} ${s.period}px); -webkit-mask-image: ${g}; mask-image: ${g};`);
  }
  if (look.band) {
    const s = look.band;
    out.push(`<div id="${ctx.idf('band')}"></div>`);
    css.push(`${ctx.sel('band')} { position: absolute; left: ${-s.rx}px; top: ${r1(p._eyes - s.ry)}px; width: ${s.rx * 2}px; height: ${s.ry * 2}px; background: radial-gradient(closest-side, ${BLACK(s.depth * k)} 0%, ${BLACK(s.depth * k)} 50%, rgba(0,0,0,0) 100%); }`);
  }
  return { html: out.join('\n                '), css: css.join('\n      ') };
}

/** The rim filter, last in the subject's filter chain (after its brightness, contrast and saturation;
 * SourceAlpha is untouched by those), screen-blended over it, so the matte is drawn once. Directional (dir set): the matte's alpha moved away from the light and cut out
 * of itself, so only the edges that face the light get a band, width = rim.width x face width.
 * All round (dir 0,0, a light straight behind): the alpha eroded and cut out of itself. A threshold
 * drops the faint band a feathered matte edge would leave everywhere else. */
function rimFilter(id, rim, F, ctx, p) {
  const w = Math.max(2, r1(rim.width * F));
  const len = Math.hypot(rim.dir[0], rim.dir[1]);
  const ux = len ? (rim.dir[0] * p._side) / len : 0;
  const uy = len ? rim.dir[1] / len : 0;
  const blur = r1(Math.max(0.8, w * 0.25 * (0.6 + rim.glow)));
  const col = p.rimColor ? colour(ctx, p.rimColor, 'relight rimColor') : colour(ctx, rim.color, 'relight rim');
  const flood = lit(ctx, col);
  const band = len
    ? `<feOffset in="SourceAlpha" dx="${r1(-ux * w)}" dy="${r1(-uy * w)}" result="sh" />`
    : `<feMorphology in="SourceAlpha" operator="erode" radius="${r1(w / 2)}" result="sh" />`;
  return `<svg width="0" height="0" style="position: absolute;" aria-hidden="true"><defs>
                <filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
                  ${band}
                  <feComposite in="SourceAlpha" in2="sh" operator="out" result="edge0" />
                  <feComponentTransfer in="edge0" result="edge"><feFuncA type="linear" slope="2.4" intercept="-0.9" /></feComponentTransfer>
                  <feGaussianBlur in="edge" stdDeviation="${blur}" result="eb" />
                  <feFlood flood-color="${flood}" result="fl" />
                  <feComposite in="fl" in2="eb" operator="in" result="glow" />
                  <feComposite in="glow" in2="SourceAlpha" operator="in" result="inner" />
                  <feComponentTransfer in="glow" result="outer"><feFuncA type="linear" slope="${r2(0.08 + rim.glow * 0.2)}" /></feComponentTransfer>
                  <feMerge result="rim"><feMergeNode in="outer" /><feMergeNode in="inner" /></feMerge>
                  <feComponentTransfer in="rim" result="rimA"><feFuncA type="linear" slope="${r2(rim.a * p.amount)}" /></feComponentTransfer>
                  <feBlend in="rimA" in2="SourceGraphic" mode="screen" />
                </filter>
              </defs></svg>`;
}

// ── Light plot geometry (viewBox 1000 x VH) ─────────────────────────────────

function plotGeometry(vh) {
  const room = { l: 110, r: 890, t: 170, b: vh - 24 };
  const subj = { x: 500, y: room.t + (room.b - room.t) * 0.46 };
  const cam = { x: 500, y: room.t + (room.b - room.t) * 0.84 };
  const R = Math.min(380, (room.r - room.l) / 2 - 40, cam.y - room.t - 40);
  return { room, subj, cam, R };
}

function lightPlace(l, side, g) {
  const az = (l.az * side * Math.PI) / 180;
  const d = l.h && l.dist < 0.25 ? 0 : l.dist;
  const x = g.subj.x + Math.sin(az) * d * g.R;
  const y = g.subj.y + Math.cos(az) * d * g.R;
  const rot = d ? (Math.atan2(g.subj.y - y, g.subj.x - x) * 180) / Math.PI : -90;
  return { x: r1(x), y: r1(y), rot: r1(rot) };
}

function parseLights(spec) {
  // "key:45:0.55:soft:key-warm;fill:-50:0.6:spot;back:160:0.5:spot:rim-blue:above"
  return String(spec).split(';').map((s) => s.trim()).filter(Boolean).map((part) => {
    const [role, az, dist, kind = 'spot', color = 'key-white', h = ''] = part.split(':');
    const l = { role, az: Number(az), dist: Number(dist), kind, color, h: h || undefined };
    if (!role || !Number.isFinite(l.az) || !Number.isFinite(l.dist)) throw new Error(`light-plot lights: "${part}" (use role:az:dist[:kind[:colour[:above|below]]])`);
    oneOf(kind, ['spot', 'soft', 'card', 'blinds'], 'light-plot light kind');
    return l;
  });
}

function fixtureSvg(l, fill) {
  if (l.kind === 'soft') {
    return `<polygon points="-24,-13 -24,13 16,36 16,-36" fill="#141518" /><line x1="16" y1="-36" x2="16" y2="36" stroke="#ffffff" stroke-width="7" /><line x1="16" y1="-36" x2="16" y2="36" stroke="#141518" stroke-width="1.5" transform="translate(4,0)" />`;
  }
  if (l.kind === 'card') {
    return `<rect x="-5" y="-34" width="10" height="68" rx="2" fill="#ffffff" stroke="#8a9099" stroke-width="3" />`;
  }
  if (l.kind === 'blinds') {
    return [-26, -13, 0, 13, 26].map((y) => `<line x1="-3" y1="${y - 4}" x2="3" y2="${y + 4}" stroke="#141518" stroke-width="5" stroke-linecap="round" />`).join('');
  }
  return `<rect x="-19" y="-19" width="34" height="38" rx="6" fill="#141518" /><rect x="15" y="-15" width="8" height="30" rx="2" fill="#2a2c31" /><circle cx="19" cy="0" r="5" fill="${fill}" />`;
}

// ── Components ───────────────────────────────────────────────────────────────

export const components = {
  relight: {
    summary: `Relights the character in the tracked clip with a named setup (${SETUP_NAMES.join(', ')}): shadows, light pools and a grade that follow the face track (rcg track) frame by frame; with the matte (rcg matte) the background drops, the subject gets its own exposure and a rim light. Draws its own copy of the clip, so put it first in the plan (under titles). ${MATTE_SETUPS.join(' and ')} need the matte. rect="x,y,w,h" puts the footage in a box (the stage layout), framed on the face (zoom, focus), ground fills the rest.`,
    fullFrame: true,
    sfx: (p) => (p.click ? [{ role: 'switch', at: 0 }] : []),
    params: {
      setup: 'three-point', side: '', amount: 1, track: 'auto', matte: 'auto', src: '', mediaStart: null, matteOffset: 0,
      rect: '', zoom: 1, focus: '', face: '', ground: 'ground', depth: null, soft: null, bg: null, keyColor: '', rimColor: '', grade: null,
      flicker: 0, in: 'cut', click: false,
    },
    prepare(p, { geo, jobDir, rnd, start, duration }) {
      oneOf(p.setup, SETUP_NAMES, 'relight setup');
      oneOf(p.in, ['cut', 'fade', 'flicker'], 'relight in');
      const S = SETUPS[p.setup];
      p.side = p.side || S.side;
      oneOf(p.side, ['left', 'right'], 'relight side');
      hide(p, '_side', p.side === 'left' ? -1 : 1);
      p.amount = clamp(Number(p.amount), 0, 1.5);
      if (p.mediaStart == null) p.mediaStart = start ?? 0;
      // Where the footage sits: the whole frame, or a box (the stage layout).
      const rect = p.rect ? String(p.rect).split(',').map(Number) : [0, 0, geo.width, geo.height];
      if (rect.length !== 4 || rect.some((n) => !Number.isFinite(n)) || rect[2] <= 0 || rect[3] <= 0) throw new Error(`relight rect "${p.rect}" (use x,y,w,h in output pixels)`);
      hide(p, '_rect', rect);
      const tr = jobDir && !p.face ? loadTrack(jobDir, p.track) : null;
      if (!tr && !p.face) throw new Error('relight: no face track. Run rcg track --job <job> --src <clip> --name <name> (or pass face="cx,cy,w" for a still subject)');
      p.matte = jobDir ? findMatte(jobDir, p.matte) : (p.matte === 'auto' ? null : p.matte);
      if (S.needsMatte && !p.matte) throw new Error(`relight ${p.setup}: needs the subject matte. Run rcg matte --job <job> --src <clip> --name <name> first`);
      if (!p.src) {
        if (!tr) throw new Error('relight: src is required with face= (the clip to light)');
        p.src = tr.t.src;
      }
      if (jobDir && !existsSync(join(jobDir, p.src))) throw new Error(`relight: src ${p.src} not found in the job`);
      // Source size and the cover mapping into the box.
      const sw = tr ? tr.t.width : rect[2];
      const sh = tr ? tr.t.height : rect[3];
      p.zoom = clamp(Number(p.zoom) || 1, 1, 4);
      const kk = Math.max(rect[2] / sw, rect[3] / sh) * p.zoom;
      const dw = sw * kk;
      const dh = sh * kk;
      // Frame on the face: its median centre lands at focus (x,y of the box, default 0.5,0.4),
      // clamped so the footage still covers the box. A full-frame relight at zoom 1 stays centred.
      const fit = rect[2] === geo.width && rect[3] === geo.height && p.zoom === 1 && !p.focus;
      const [fx, fy] = p.focus ? String(p.focus).split(',').map(Number) : [0.5, 0.4];
      let fc;
      if (tr) {
        const t = tr.t;
        const a = clamp(Math.floor((p.mediaStart - t.start) * t.fps), 0, t.frames - 1);
        const b = clamp(Math.ceil((p.mediaStart + duration - t.start) * t.fps), a, t.frames - 1);
        fc = [median(t.face.cx.slice(a, b + 1)), median(t.face.cy.slice(a, b + 1))];
      } else fc = String(p.face).split(',').map(Number);
      const ox = fit ? (rect[2] - dw) / 2 : clamp(rect[2] * fx - fc[0] * dw, rect[2] - dw, 0);
      const oy = fit ? (rect[3] - dh) / 2 : clamp(rect[3] * fy - fc[1] * dh, rect[3] - dh, 0);
      const map = { ox: r1(ox), oy: r1(oy), dw: r1(dw), dh: r1(dh) };
      hide(p, '_map', map);
      const report = [];
      if (tr) {
        const t = tr.t;
        if (tr.t.src && p.src !== tr.t.src) report.push(`src ${p.src} is not the tracked clip ${tr.t.src}: the light will not sit on the face`);
        const fps = t.fps;
        const i0 = clamp(Math.floor((p.mediaStart - t.start) * fps), 0, t.frames - 1);
        const i1 = clamp(Math.ceil((p.mediaStart + duration - t.start) * fps) + 1, 0, t.frames - 1);
        if ((p.mediaStart - t.start) * fps < -0.5 || (p.mediaStart + duration - t.start) * fps > t.frames + 0.5) {
          report.push(`the track covers ${t.start}-${r2(t.start + t.duration)} s of the clip; mediaStart ${p.mediaStart} + ${duration} s runs past it (the light holds the edge frame)`);
        }
        const f = t.face;
        const pick = (arr) => arr.slice(i0, i1 + 1).map(r4);
        const roll = f.roll.slice(i0, i1 + 1).map((r) => r1(Math.abs(r) > 90 ? r - 180 * Math.sign(r) : r));
        const present = f.present ? f.present.slice(i0, i1 + 1) : [];
        const missing = present.filter((v) => !v).length;
        if (missing > present.length * 0.2) report.push(`the face is missing in ${missing} of ${present.length} frames: the light holds the last place there`);
        hide(p, '_face', { fps, i0: r4((p.mediaStart - t.start) * fps - i0), cx: pick(f.cx), cy: pick(f.cy), w: pick(f.w), roll });
        const Fs = f.w.slice(i0, i1 + 1).map((w) => w * map.dw);
        const eyes = f.ey.slice(i0, i1 + 1).map((ey, j) => ((ey - f.cy[i0 + j]) * map.dh) / (f.w[i0 + j] * map.dw) * 100);
        hide(p, '_Fmin', Math.max(20, Math.min(...Fs)));
        hide(p, '_Fmed', median(Fs));
        hide(p, '_eyes', r1(median(eyes)));
      } else {
        const [cx, cy, w] = String(p.face).split(',').map(Number);
        if (![cx, cy, w].every(Number.isFinite)) throw new Error(`relight face "${p.face}" (use cx,cy,w normalized to the box)`);
        hide(p, '_face', { fps: 30, i0: 0, cx: [cx], cy: [cy], w: [w], roll: [0] });
        hide(p, '_Fmin', Math.max(20, w * map.dw));
        hide(p, '_Fmed', w * map.dw);
        hide(p, '_eyes', -22);
      }
      if (p._Fmed < 90) report.push(`the face is small (${Math.round(p._Fmed)} px wide): shaping reads weakly; prefer a closer shot for relights`);
      // Flicker (a fire, a failing bulb): a seeded step table at 12 steps a second.
      if (p.flicker > 0) {
        const steps = Math.ceil(duration * 12) + 2;
        const tab = [];
        for (let i = 0; i < steps; i++) tab.push(r2(1 - p.flicker * rnd()));
        hide(p, '_flick', tab);
      }
      if (!p.matte && S.look.rim) report.push(`no matte: the ${p.setup} rim light and background drop are skipped (rcg matte adds them)`);
      p._report = report.length ? report : null;
    },
    render(p, ctx) {
      const S = SETUPS[p.setup];
      const L = S.look;
      const m = ctx.motion;
      const k = p.amount;
      const [rx, ry, rw, rh] = p._rect;
      const map = p._map;
      const full = rx === 0 && ry === 0 && rw === ctx.W && rh === ctx.H;
      // Rig elements reach 1.25 frame heights from the face at the smallest face size in the window.
      const HU = Math.ceil((Math.max(rw, rh) * 1.25 * 100) / p._Fmin);
      const rig = rigLayers(L, p, ctx, HU);
      const vid = (name, src, extra, track) => `<video id="${ctx.idf(name)}" class="clip" src="${ctx.esc(src)}" data-start="0" data-duration="${r2(ctx.D)}" data-media-start="${r2(Math.max(0, name === 'src' ? p.mediaStart : p.mediaStart + p.matteOffset))}" data-track-index="${track}" data-layout-allow-overflow muted playsinline style="position: absolute; left: ${map.ox}px; top: ${map.oy}px; width: ${map.dw}px; height: ${map.dh}px; ${extra}"></video>`;
      const cut = L.cut || { b: 1, c: 1, s: 1 };
      const mix = (v) => r2(1 + (v - 1) * k);
      const cutFilter = `brightness(${mix(cut.b)}) contrast(${mix(cut.c)}) saturate(${mix(cut.s)})`;
      const bgDepth = (p.bg ?? L.bg?.depth ?? 0) * k;
      const pools = (L.pools || []).map((q, i) => {
        const keyish = /^key-/.test(q.color);
        const col = keyish && p.keyColor ? colour(ctx, p.keyColor, 'relight keyColor') : colour(ctx, q.color, 'relight pool');
        return { ...q, i, col: q.blend === 'color-dodge' ? dodgeTint(lit(ctx, col)) : col, a: r2(q.a * k) };
      });
      const grade = L.grade || { a: 0, desat: 0 };
      const gradeA = r2((p.grade ?? grade.a) * k);
      const desat = r2((grade.desat || 0) * k);
      const rimOn = Boolean(p.matte && L.rim);
      const parts = [];
      parts.push(vid('src', p.src, '', 0));
      if (p.matte) {
        parts.push(`<div id="${ctx.idf('bg')}" class="lay"></div>`);
        if (L.backdrop) parts.push(`<div id="${ctx.idf('bd')}" class="lay"></div>`);
        parts.push(vid('cut', p.matte, `filter: ${cutFilter}${rimOn ? ` url(#${ctx.idf('rimf')})` : ''};`, 1));
      }
      parts.push(`<div id="${ctx.idf('rig')}" data-layout-allow-overflow><div id="${ctx.idf('mir')}">
                ${rig.html}
              </div></div>`);
      for (const q of pools) parts.push(`<div id="${ctx.idf(`p${q.i}`)}" class="pool" data-layout-allow-overflow></div>`);
      if (gradeA > 0 && grade.color) parts.push(`<div id="${ctx.idf('grade')}" class="lay"></div>`);
      if (desat > 0) parts.push(`<div id="${ctx.idf('desat')}" class="lay"></div>`);
      if (p._flick) parts.push(`<div id="${ctx.idf('flick')}" class="lay"></div>`);
      if (rimOn) parts.push(rimFilter(ctx.idf('rimf'), L.rim, p._Fmed, ctx, p));
      const css = `
      ${ctx.sel('ground')} { position: absolute; inset: 0; background: ${colour(ctx, p.ground, 'relight ground')}; }
      ${ctx.sel('stage')} { position: absolute; left: ${rx}px; top: ${ry}px; width: ${rw}px; height: ${rh}px; overflow: hidden; background: ${colour(ctx, p.ground, 'relight ground')}; }
      ${ctx.sel('stage')} video { display: block; object-fit: fill; }
      ${ctx.sel('stage')} .lay { position: absolute; inset: 0; }
      ${ctx.sel('stage')} .pool { position: absolute; left: 0; top: 0; width: 0; height: 0; }
      ${ctx.sel('bg')} { background: ${L.bg?.color || '#000'}; opacity: ${r2(bgDepth)}; }
      ${L.backdrop ? `${ctx.sel('bd')} { background: radial-gradient(ellipse 70% 60% at 50% 40%, ${colour(ctx, L.backdrop.color, 'backdrop')} 0%, rgba(0,0,0,0) 100%); mix-blend-mode: screen; opacity: ${r2(L.backdrop.a * k)}; }` : ''}
      ${ctx.sel('rig')} { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
      ${ctx.sel('mir')} { position: absolute; left: 0; top: 0; width: 0; height: 0; transform: scaleX(${p._side}); }
      ${rig.css}
      ${pools.map((q) => `${ctx.sel(`p${q.i}`)} { background: radial-gradient(closest-side, ${q.col} 0%, ${q.col} 20%, rgba(0,0,0,0) 100%); mix-blend-mode: ${q.blend}; opacity: ${q.a}; }`).join('\n      ')}
      ${gradeA > 0 && grade.color ? `${ctx.sel('grade')} { background: ${colour(ctx, grade.color, 'grade')}; mix-blend-mode: soft-light; opacity: ${gradeA}; }` : ''}
      ${desat > 0 ? `${ctx.sel('desat')} { background: #808080; mix-blend-mode: saturation; opacity: ${desat}; }` : ''}
      ${p._flick ? `${ctx.sel('flick')} { background: #000; opacity: 0; }` : ''}`;
      const html = `${full ? '' : `
          <div id="${ctx.idf('ground')}"></div>`}
          <div id="${ctx.idf('stage')}">
              ${parts.join('\n              ')}
          </div>`;
      // Every frame is a pure function of time: the face table and the entrance envelope.
      const F = p._face;
      const litIds = ['bg', 'bd', 'rig', 'grade', 'desat'];
      const js = `
            var FACE = ${ctx.js(F)};
            var MAP = ${ctx.js(map)};
            var SIDE = ${p._side};
            var POOLS = ${ctx.js(pools.map((q) => ({ id: `p${q.i}`, x: q.x, y: q.y, rx: q.rx, ry: q.ry })))};
            var FLICK = ${p._flick ? ctx.js(p._flick) : 'null'};
            var IN = ${ctx.js(p.in)}, FADE = ${m.fade || 0.3}, FLK = ${m.flicker || 0.4};
            var rig = $("rig"), cutEl = $("cut");
            var LIT = ${ctx.js(litIds)}.map(function (n) { var el = $(n); return el ? { el: el, base: parseFloat(getComputedStyle(el).opacity) || 1 } : null; }).filter(Boolean);
            var PEL = POOLS.map(function (q) { return $(q.id); });
            function idx(t) { return Math.max(0, Math.min(FACE.cx.length - 1, Math.floor(t * FACE.fps + FACE.i0 + 1e-6))); }
            function env(t) {
              if (IN === "fade") return Math.min(1, t / FADE);
              if (IN === "flicker") {
                if (t >= FLK) return 1;
                var u = t / FLK;
                return (u < 0.12 || (u > 0.3 && u < 0.38) || u > 0.6) ? 1 : 0.08;
              }
              return 1;
            }
            function apply(t) {
              var i = idx(t);
              var x = MAP.ox + FACE.cx[i] * MAP.dw, y = MAP.oy + FACE.cy[i] * MAP.dh;
              var F = FACE.w[i] * MAP.dw, r = FACE.roll[i], s = F / 100;
              rig.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) rotate(" + r + "deg) scale(" + s.toFixed(4) + ")";
              var c = Math.cos(r * Math.PI / 180), sn = Math.sin(r * Math.PI / 180);
              for (var j = 0; j < POOLS.length; j++) {
                var q = POOLS[j], px = q.x * SIDE * s, py = q.y * s;
                var w = 2 * q.rx * s, h = 2 * q.ry * s;
                var X = x + px * c - py * sn, Y = y + px * sn + py * c;
                PEL[j].style.left = (X - w / 2).toFixed(1) + "px";
                PEL[j].style.top = (Y - h / 2).toFixed(1) + "px";
                PEL[j].style.width = w.toFixed(1) + "px";
                PEL[j].style.height = h.toFixed(1) + "px";
              }
              var e = env(t), fk = FLICK ? FLICK[Math.min(FLICK.length - 1, Math.floor(t * 12 + 1e-6))] : 1;
              for (var n = 0; n < LIT.length; n++) LIT[n].el.style.opacity = (LIT[n].base * e).toFixed(3);
              for (var j2 = 0; j2 < PEL.length; j2++) PEL[j2].style.opacity = (parseFloat(PEL[j2].dataset.base) * e * fk).toFixed(3);
              if (cutEl) cutEl.style.opacity = e.toFixed(3);
              if (FLICK) $("flick").style.opacity = ((1 - fk) * 0.55 * e).toFixed(3);
            }
            PEL.forEach(function (el) { el.dataset.base = getComputedStyle(el).opacity; });
            var drv = { _t: 0 };
            Object.defineProperty(drv, "t", { get: function () { return this._t; }, set: function (v) { this._t = v; apply(v); } });
            tl.to(drv, { t: D, duration: D, ease: "none" }, 0);
            apply(0);`;
      return { html, css, js };
    },
  },

  'light-plot': {
    summary: 'The top-down lighting diagram: room and backdrop, the subject facing the camera, the camera view cone, each light as a fixture with its beam and role label. setup= draws a named setup (same names as relight); lights="role:az:dist[:kind[:colour[:above|below]]];..." draws your own (az: 0 beside the camera, 90 on the key side, 180 behind). from=<setup> slides the lights from that setup\'s places and the card stays (no re-entry); exit=false keeps it up for the next plot in a chain. title= adds a caption line on the card.',
    params: { setup: 'three-point', side: '', lights: '', from: '', title: '', labels: true, enter: null, exit: true, x: null, y: 1270, w: 836, h: 500, at: 0 },
    prepare(p) {
      p.rotate = 0;
      if (!p.lights) oneOf(p.setup, SETUP_NAMES, 'light-plot setup');
      if (p.from) oneOf(p.from, SETUP_NAMES, 'light-plot from');
      if (p.enter == null) p.enter = !p.from;
      p.side = p.side || (SETUPS[p.setup]?.side ?? 'right');
      oneOf(p.side, ['left', 'right'], 'light-plot side');
    },
    render(p, ctx) {
      const m = ctx.motion;
      const VH = Math.round((p.h / p.w) * 1000);
      const g = plotGeometry(VH);
      const side = p.side === 'left' ? -1 : 1;
      const lights = p.lights ? parseLights(p.lights) : SETUPS[p.setup].plot;
      const prev = p.from ? SETUPS[p.from].plot : [];
      const prevSide = p.from ? (SETUPS[p.from].side === 'left' ? -1 : 1) : side;
      const items = lights.map((l, i) => {
        const to = lightPlace(l, side, g);
        const was = prev.find((q) => q.role === l.role);
        const from = was ? lightPlace(was, prevSide, g) : null;
        const col = lit(ctx, colour(ctx, l.color || 'key-white', 'light-plot light'));
        return { l, i, to, from, col };
      });
      const { room, subj, cam } = g;
      const sx = subj.x;
      const sy = subj.y;
      const beam = (it) => {
        const { to, l } = it;
        if (l.kind === 'blinds' || (l.h && l.dist < 0.25)) return '';
        const ang = Math.atan2(sy - to.y, sx - to.x);
        const nx = -Math.sin(ang);
        const ny = Math.cos(ang);
        const spread = l.kind === 'soft' ? 78 : 52;
        const pts = [[to.x, to.y], [sx + nx * spread, sy + ny * spread], [sx - nx * spread, sy - ny * spread]];
        return `<polygon id="${ctx.idf(`beam${it.i}`)}" points="${pts.map((q) => q.map(r1).join(',')).join(' ')}" fill="${it.col}" opacity="0" />`;
      };
      const label = (it) => {
        if (!p.labels) return '';
        const { to, l } = it;
        let lx = to.x;
        let ly = to.y;
        if (l.h && l.dist < 0.25) { lx = sx + 150; ly = sy - 46; }
        else {
          const ang = Math.atan2(to.y - sy, to.x - sx);
          const onAxis = Math.abs(to.x - sx) < 40 && to.y > sy;
          lx = onAxis ? to.x + 104 : to.x + Math.cos(ang) * 58;
          ly = onAxis ? to.y : to.y + Math.sin(ang) * 58;
        }
        // A label pushed against a wall slides to the fixture's side instead of covering it.
        if (ly < room.t + 26 || ly > room.b - 16) { lx = to.x + (to.x >= sx ? 92 : -92); ly = to.y; }
        lx = clamp(lx, room.l + 50, room.r - 50);
        ly = clamp(ly, room.t + 26, room.b - 16);
        const txt = `${l.role}${l.h ? ` · ${l.h}` : ''}`.toUpperCase();
        return `<text id="${ctx.idf(`lab${it.i}`)}" x="${r1(lx)}" y="${r1(ly + 9)}" text-anchor="middle" class="lab" opacity="0">${ctx.esc(txt)}</text>`;
      };
      const fixture = (it) => {
        const { l } = it;
        const ring = l.h && l.dist < 0.25 ? `<circle r="50" fill="none" stroke="${it.col}" stroke-width="5" stroke-dasharray="10 8" />` : '';
        return `<g id="${ctx.idf(`lt${it.i}`)}" opacity="0">${ring}<g id="${ctx.idf(`lr${it.i}`)}">${fixtureSvg(l, it.col)}</g></g>`;
      };
      const cone = `<polygon points="${cam.x},${r1(cam.y - 34)} ${cam.x + 120},${room.t} ${cam.x - 120},${room.t}" fill="${lit(ctx, 'var(--plot-cone)')}" /><line x1="${cam.x}" y1="${r1(cam.y - 34)}" x2="${cam.x}" y2="${room.t}" stroke="#7d93c0" stroke-width="2" stroke-dasharray="6 6" opacity="0.7" />`;
      const grid = [];
      for (let x = 0; x <= 1000; x += 50) grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="${VH}" />`);
      for (let y = 0; y <= VH; y += 50) grid.push(`<line x1="0" y1="${y}" x2="1000" y2="${y}" />`);
      const titleH = p.title ? 1 : 0;
      const svg = `<svg id="${ctx.idf('svg')}" viewBox="0 0 1000 ${VH}" width="${p.w}" height="${p.h}" aria-hidden="true">
                <g stroke="${lit(ctx, 'var(--plot-grid)')}" stroke-width="1.5">${grid.join('')}</g>
                <rect x="${room.l + 60}" y="${room.t - 70}" width="${room.r - room.l - 120}" height="70" fill="${lit(ctx, 'var(--plot-floor)')}" />
                <rect x="${room.l}" y="${room.t}" width="${room.r - room.l}" height="${room.b - room.t}" fill="${lit(ctx, 'var(--plot-floor)')}" />
                <path d="M ${room.l} ${room.b} L ${room.l} ${room.t} L ${room.r} ${room.t} L ${room.r} ${room.b}" fill="none" stroke="${lit(ctx, 'var(--plot-wall)')}" stroke-width="14" />
                ${items.map(beam).join('\n                ')}
                ${cone}
                <rect x="${sx - 92}" y="${sy + 18}" width="184" height="86" rx="6" fill="rgba(40,44,52,0.10)" stroke="rgba(40,44,52,0.35)" stroke-width="2.5" />
                <circle cx="${sx}" cy="${sy}" r="31" fill="#3a3f47" stroke="#9aa0a8" stroke-width="4" />
                <polygon points="${sx - 13},${sy - 6} ${sx + 13},${sy - 6} ${sx},${sy + 14}" fill="#ffffff" />
                <rect x="${cam.x - 22}" y="${r1(cam.y - 6)}" width="44" height="62" rx="5" fill="#141518" />
                <rect x="${cam.x - 14}" y="${r1(cam.y - 32)}" width="28" height="26" rx="3" fill="${lit(ctx, 'var(--plot-lens)')}" />
                ${items.map(fixture).join('\n                ')}
                ${items.map(label).join('\n                ')}
              </svg>`;
      const css = `
      ${ctx.sel('card')} {
        position: absolute; left: ${r1(p.x - p.w / 2)}px; top: ${r1(p.y - p.h / 2)}px; width: ${p.w}px; height: ${p.h}px;
        background: var(--plot-card); border-radius: 22px; overflow: hidden; opacity: ${p.enter ? 0 : 1};
        box-shadow: 0 18px 40px rgba(0,0,0,0.35);
      }
      ${ctx.sel('svg')} { position: absolute; left: 0; top: 0; display: block; }
      ${ctx.sel('svg')} .lab { font-family: "${ctx.type.label.family}"; font-weight: ${ctx.type.label.weight}; font-size: 30px; letter-spacing: 0.12em; fill: var(--plot-ink); }
      ${ctx.sel('title')} {
        position: absolute; left: 34px; top: 22px; right: 34px; height: 44px;
        font-family: "${ctx.type.label.family}"; font-weight: ${ctx.type.label.weight}; font-size: 30px; letter-spacing: 0.14em;
        text-transform: uppercase; color: var(--plot-ink); white-space: nowrap;
      }`;
      const html = `
          <div id="${ctx.idf('card')}">
              ${svg}${titleH ? `
              <div id="${ctx.idf('title')}">${ctx.esc(p.title)}</div>` : ''}
          </div>`;
      const pose = (it) => it.from || it.to;
      const js = `
            var ITEMS = ${ctx.js(items.map((it) => ({ i: it.i, a: pose(it), b: it.to, moved: Boolean(it.from) })))};
            var AT = ${p.at}, MOVE = ${m.lightMove || 0.45}, POP = ${m.pop || 0.32};${p.enter ? `
            tl.fromTo($("card"), { opacity: 0, y: ${m.rise || 24} }, { opacity: 1, y: 0, duration: ${m.enter}, ease: "${m.enterEase}" }, AT);` : ''}
            ITEMS.forEach(function (it, n) {
              var g = $("lt" + it.i), rot = $("lr" + it.i);
              var st = { x: it.a.x, y: it.a.y, r: it.a.rot, s: it.moved ? 1 : 0.6 };
              function put() {
                g.setAttribute("transform", "translate(" + st.x.toFixed(1) + "," + st.y.toFixed(1) + ") scale(" + st.s.toFixed(3) + ")");
                rot.setAttribute("transform", "rotate(" + st.r.toFixed(1) + ")");
              }
              var drv = { _p: 0 };
              Object.defineProperty(drv, "p", { get: function () { return this._p; }, set: function (v) {
                this._p = v;
                st.x = it.a.x + (it.b.x - it.a.x) * v; st.y = it.a.y + (it.b.y - it.a.y) * v;
                var dr = ((it.b.rot - it.a.rot + 540) % 360) - 180;
                st.r = it.a.rot + dr * v;
                st.s = it.moved ? 1 : 0.6 + 0.4 * v;
                put();
              } });
              put();
              var t0 = AT + 0.12 + n * 0.06;
              tl.fromTo(g, { opacity: it.moved ? 1 : 0 }, { opacity: 1, duration: 0.12, ease: "none" }, t0);
              tl.to(drv, { p: 1, duration: it.moved ? MOVE : POP, ease: it.moved ? "${m.lightMoveEase}" : "${m.popEase}" }, t0);
              var beam = $("beam" + it.i), lab = $("lab" + it.i);
              var land = t0 + (it.moved ? MOVE : POP);
              if (beam) tl.fromTo(beam, { opacity: 0 }, { opacity: 0.22, duration: 0.25, ease: "power2.out" }, land - 0.1);
              if (lab) tl.fromTo(lab, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" }, land - 0.05);
            });${p.title && p.enter ? `
            tl.fromTo($("title"), { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, ease: "power3.out" }, AT + 0.1);` : ''}
${p.exit ? `
            tl.to($("card"), { opacity: 0, duration: ${m.exit}, ease: "${m.exitEase}" }, Math.max(AT + 0.4, D - ${m.exit}));` : ''}`;
      return { html, css, js };
    },
  },

  'mood-tag': {
    summary: 'A small dark card naming the setup and what it says: a tracked yellow label (SPLIT LIGHT) over one bold meaning word (Secrecy). setup= fills both from the setup table; label= and text= override. accent= colours the side bar (default: the setup\'s light).',
    params: { setup: 'split', label: '', text: '', accent: '', x: null, y: 300, w: 520, h: 150, at: 0 },
    prepare(p) {
      p.rotate = 0;
      if (!p.label || !p.text) oneOf(p.setup, SETUP_NAMES, 'mood-tag setup');
    },
    render(p, ctx) {
      const m = ctx.motion;
      const S = SETUPS[p.setup];
      const label = p.label || S.name;
      const text = p.text || S.meaning;
      const accentKey = p.accent || (S ? (S.plot.find((l) => l.role !== 'blinds') || S.plot[0]).color : 'caption');
      const accent = colour(ctx, accentKey, 'mood-tag accent');
      const pad = 30;
      const css = `
      ${ctx.sel('box')} {
        position: absolute; left: ${r1(p.x - p.w / 2)}px; top: ${r1(p.y - p.h / 2)}px; width: ${p.w}px; height: ${p.h}px;
        background: var(--tag-bg); border-radius: 16px; overflow: hidden; opacity: 0;
        display: flex; flex-direction: column; justify-content: center; padding: 0 ${pad}px 0 ${pad + 14}px; box-sizing: border-box;
      }
      ${ctx.sel('bar')} { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; background: ${accent}; }
      ${ctx.sel('label')} { display: block; ${ctx.family('label')} font-size: 26px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--tag-label); line-height: 1.2; white-space: nowrap; }
      ${ctx.sel('text')} { display: block; ${ctx.family('strong')} color: var(--tag-ink); line-height: 1.05; margin-top: 6px; }`;
      const html = `
          <div id="${ctx.idf('box')}"><i id="${ctx.idf('bar')}"></i>
              <span id="${ctx.idf('label')}">${ctx.esc(label)}</span>
              <span id="${ctx.idf('text')}"></span>
          </div>`;
      const inner = p.w - pad * 2 - 14;
      const js = `
            fit($("text"), ${ctx.js(text)}, { font: ${ctx.js(font(ctx, 'strong'))}, size: 62, min: 34, maxW: ${inner}, maxH: ${p.h - 70}, maxLines: 1, lh: 1.05 });
            tl.fromTo($("box"), { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: ${m.enter}, ease: "${m.enterEase}" }, ${p.at});
            tl.fromTo($("bar"), { scaleY: 0 }, { scaleY: 1, duration: ${m.enter}, ease: "${m.enterEase}" }, ${p.at} + 0.05);
            tl.fromTo($("text"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: ${m.enter}, ease: "${m.enterEase}" }, ${p.at} + 0.12);
            tl.to($("box"), { opacity: 0, duration: ${m.exit}, ease: "${m.exitEase}" }, Math.max(${p.at} + 0.5, D - ${m.exit}));`;
      return { html, css, js };
    },
  },
};
