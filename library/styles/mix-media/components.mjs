// Mix Media components for rcg style (tools/blocks/style.mjs): a handmade cork-board scrapbook
// built piece by piece in stop-motion (Hi.Boly director's bible; skill style-mix-media).
// Each component returns { html, css, js } for one sub-composition. `js` runs inside build()
// with: tl (paused timeline), D (duration), $(name) -> element "<id>-<name>", fit(el, text, opts),
// W, H. Everything is deterministic: tilts, torn edges and boil come from the seeded ctx.rnd.
//
// Grammar (references/scene-grammar.md in the skill): board = the world of one scene (overlay
// changes per scene, hard cut to the next); cutout / live = the character, a real photo with a torn
// cream paper edge; note = every word on screen, handwritten on paper; sticker = illustrated
// vintage props; doodle = marker marks on the board; tone = the scene's mood (palette shift).
//
// Motion (style.json motion): nothing slides or fades. A piece is hidden, then exists: three
// discrete frames on a 12 fps grid (a little big and tilted, a little small, at rest). Pins and
// tape land two steps after their paper. Words pop one by one on their spoken times.

import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { KINDS, KIND_NAMES, stickerFilter } from './stickers.mjs';

const r1 = (n) => Math.round(n * 10) / 10;
const r3 = (n) => Math.round(n * 1000) / 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function oneOf(v, list, what) {
  if (!list.includes(v)) throw new Error(`${what} must be one of ${list.join(', ')} (got "${v}")`);
  return v;
}

/** Seeded resting tilt: lo..hi degrees either way (the guide: 2-5 degrees, nothing aligned). */
function tilt(rnd, lo = 2, hi = 5) {
  const s = rnd() < 0.5 ? -1 : 1;
  return r1(s * (lo + rnd() * (hi - lo)));
}

function pngSize(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file} is not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

function prepManifest(jobDir) {
  const f = join(jobDir, 'data', 'mm-prep.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}

function needFile(jobDir, src, what) {
  if (!src) throw new Error(`${what}: src is required (a job-relative path)`);
  if (jobDir && !existsSync(join(jobDir, src))) throw new Error(`${what}: ${src} not found in the job`);
}

// ── stop-motion timing ──────────────────────────────────────────────────────

const STEP = 1 / 12;
const hideJs = (sel, rot) => `
            tl.set(${sel}, { opacity: 0, rotation: ${rot}, scale: 1 }, 0);`;
function popJs(sel, at, rot, m) {
  const a = r3(Math.max(0, at));
  return `
            tl.set(${sel}, { opacity: 1, scale: ${m.popScale}, rotation: ${r1(rot + m.popTilt)} }, ${a});
            tl.set(${sel}, { scale: 0.985, rotation: ${r1(rot - m.popTilt * 0.35)} }, ${r3(a + STEP)});
            tl.set(${sel}, { scale: 1, rotation: ${rot} }, ${r3(a + 2 * STEP)});`;
}
function wiggleJs(sel, from, to, rot, amp, rnd, fps) {
  if (!(amp > 0)) return '';
  let s = '';
  for (let t = from; t < to - 1e-6; t += 1 / fps) s += `
            tl.set(${sel}, { rotation: ${r1(rot + (rnd() * 2 - 1) * amp)} }, ${r3(t)});`;
  return s;
}
// A static block still needs a timeline as long as the block.
const holdJs = (sel) => `
            tl.set(${sel}, { opacity: 1 }, Math.max(0, D - 0.001));`;

// ── torn paper ──────────────────────────────────────────────────────────────

/** A hand-torn outline as a CSS polygon (px): low waviness + fibre jags, inset 0..amp from the box. */
function tornPoly(w, h, rnd, { amp = 6, step = 6, sides = 'trbl', inset = 0 } = {}) {
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  let k = 0;
  const off = (side) => {
    k += 1;
    if (!sides.includes(side)) return inset;
    const v = 0.5 + 0.22 * Math.sin(k * 0.23 + ph[0]) + 0.16 * Math.sin(k * 0.071 + ph[1]) + 0.42 * (rnd() - 0.5);
    return inset + amp * clamp(v, 0, 1);
  };
  const pts = [];
  for (let x = 0; x < w; x += step) pts.push([x, off('t')]);
  for (let y = 0; y < h; y += step) pts.push([w - off('r'), y]);
  for (let x = w; x > 0; x -= step) pts.push([x, h - off('b')]);
  for (let y = h; y > 0; y -= step) pts.push([off('l'), y]);
  return `polygon(${pts.map(([x, y]) => `${r1(x)}px ${r1(y)}px`).join(', ')})`;
}

// ── attachments (pins, tape, clips) ─────────────────────────────────────────

const ATTACH = ['none', 'pin', 'tape', 'washi', 'masking', 'clip', 'paperclip'];
const PIN_COLORS = ['#c4302a', '#b9bcc4', '#e2b634', '#4268ac', '#6fb894', '#e48aa1'];
const WASHI = [
  ['repeating-linear-gradient(45deg, #f4c7cf 0 9px, #fbeef0 9px 18px)', 'stripes'],
  ['radial-gradient(#8fb6d8 2.6px, transparent 3.2px) 0 0 / 13px 13px, #e9f1f8', 'dots'],
  ['repeating-linear-gradient(90deg, #bfe2cf 0 7px, #eef8f2 7px 14px)', 'stripes'],
  ['radial-gradient(#e0a75c 2.4px, transparent 3px) 0 0 / 12px 12px, #fbf0c8', 'dots'],
];
const attachRole = (kind) => (['pin', 'clip', 'paperclip'].includes(kind) ? 'pin' : ['tape', 'washi', 'masking'].includes(kind) ? 'tape' : null);

function tapeStrip(ctx, rnd, { w, h, bg, left, top, rot, opacity = 1, extra = '' }) {
  const clip = tornPoly(w, h, rnd, { amp: 4, step: 4, sides: 'lr' });
  return `<i class="mm-tape" style="left: ${r1(left)}px; top: ${r1(top)}px; width: ${w}px; height: ${h}px; transform: rotate(${rot}deg); background: ${bg}; opacity: ${opacity}; clip-path: ${clip};${extra}"></i>`;
}

/** clear: the y (item px) where the paper's words begin; nothing may cover a word. */
function attachHtml(kind, w, h, ctx, rnd, clear = 80) {
  const id = ctx.idf('att');
  let inner = '';
  // A corner strip at -38 deg reaches about 0.31 of its length down the paper.
  const cornerLen = (want) => Math.round(Math.min(want, Math.max(70, (clear - 10) / 0.31)));
  const topFor = (height, minOverlap = 10) => r1(clamp(clear - height - 4, minOverlap - height, -14));
  switch (kind) {
    case 'pin': {
      const c = PIN_COLORS[Math.floor(rnd() * PIN_COLORS.length)];
      const x = w * (0.42 + rnd() * 0.16);
      inner = `<i class="mm-pin" style="left: ${r1(x - 15)}px; top: ${r1(clamp(clear - 34, -14, -2))}px; background: radial-gradient(circle at 34% 30%, #ffffff 0 9%, ${c} 34%, color-mix(in srgb, ${c} 55%, #000) 100%);"></i>`;
      break;
    }
    case 'tape': {
      const tw = Math.round(clamp(w * 0.42, 90, 170));
      inner = tapeStrip(ctx, rnd, { w: tw, h: 42, left: w / 2 - tw / 2, top: topFor(42), rot: tilt(rnd, 2, 7), bg: 'linear-gradient(100deg, rgba(255,255,255,0.22), rgba(255,255,255,0.5) 42%, rgba(255,255,255,0.26))', extra: ' box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35);' });
      break;
    }
    case 'washi': {
      const [bg] = WASHI[Math.floor(rnd() * WASHI.length)];
      const want = Math.round(clamp(w * 0.5, 110, 190));
      const atCorner = rnd() < 0.5 && clear >= 0.31 * 110 + 10;
      inner = atCorner
        ? (() => { const tw = cornerLen(want); return tapeStrip(ctx, rnd, { w: tw, h: 38, left: -tw * 0.42, top: -14, rot: -38 + tilt(rnd, 1, 4), bg, opacity: 0.92 }); })()
        : tapeStrip(ctx, rnd, { w: want, h: 40, left: w / 2 - want / 2, top: topFor(40), rot: tilt(rnd, 2, 6), bg, opacity: 0.92 });
      break;
    }
    case 'masking': {
      const tw = cornerLen(Math.round(clamp(w * 0.32, 90, 140)));
      const bg = 'rgba(238, 226, 188, 0.93)';
      inner = tapeStrip(ctx, rnd, { w: tw, h: 34, left: -tw * 0.42, top: -12, rot: -40 + tilt(rnd, 1, 4), bg })
        + tapeStrip(ctx, rnd, { w: tw, h: 34, left: w - tw * 0.58, top: -12, rot: 40 + tilt(rnd, 1, 4), bg });
      break;
    }
    case 'clip': {
      const x = w / 2 - 34;
      inner = `<svg class="mm-clip" style="left: ${r1(x)}px; top: ${r1(clamp(clear - 80, -58, -40))}px;" width="68" height="76" viewBox="0 0 68 76">
              <path d="M18 34 L 22 6 Q 34 -2 46 6 L 50 34" fill="none" stroke="#c9ccd2" stroke-width="4" stroke-linecap="round"/>
              <path d="M24 34 L 27 12 Q 34 7 41 12 L 44 34" fill="none" stroke="#9ea2a9" stroke-width="3" stroke-linecap="round"/>
              <path d="M6 34 H 62 L 56 70 H 12 Z" fill="#26231f"/>
              <path d="M10 38 H 58" stroke="#4d4843" stroke-width="3"/>
            </svg>`;
      break;
    }
    case 'paperclip': {
      // On the right edge, clipped over by about 20 px: inside the paper's right margin, clear of the words.
      inner = `<svg class="mm-clip" style="left: ${r1(w - 22)}px; top: ${r1(h * 0.12 + rnd() * 16)}px; transform: rotate(${tilt(rnd, 3, 8)}deg);" width="40" height="110" viewBox="0 0 40 110">
              <path d="M28 40 V 92 Q 28 104 18 104 Q 8 104 8 92 V 18 Q 8 6 20 6 Q 32 6 32 18 V 80 Q 32 88 24 88 Q 16 88 16 80 V 34" fill="none" stroke="#b7bcc4" stroke-width="4.5" stroke-linecap="round"/>
              <path d="M28 40 V 92 Q 28 104 18 104 Q 8 104 8 92 V 18 Q 8 6 20 6 Q 32 6 32 18 V 80" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>
            </svg>`;
      break;
    }
    default:
      return '';
  }
  return `
              <div id="${id}" class="mm-att">${inner}</div>`;
}

const ATTACH_CSS = (ctx) => `
      #${ctx.id}-layer .mm-att { position: absolute; inset: 0; pointer-events: none; }
      #${ctx.id}-layer .mm-pin { position: absolute; width: 30px; height: 30px; border-radius: 50%; box-shadow: 3px 5px 4px rgba(30, 18, 8, 0.4); }
      #${ctx.id}-layer .mm-tape { position: absolute; display: block; transform-origin: 50% 50%; }
      #${ctx.id}-layer .mm-clip { position: absolute; overflow: visible; filter: drop-shadow(2px 4px 3px rgba(30, 18, 8, 0.38)); }`;

function attachJs(ctx, kind, at, m) {
  if (!kind || kind === 'none') return '';
  const t = r3(at + m.attachDelay);
  return `
            tl.set($("att"), { opacity: 0 }, 0);
            tl.set($("att"), { opacity: 1, scale: 1.06 }, ${t});
            tl.set($("att"), { scale: 1 }, ${r3(t + STEP)});`;
}

const attachSfx = (p, m) => {
  const role = attachRole(p.attach);
  return role ? [{ role, at: r3(p.at + m.attachDelay) }] : [];
};

const SLOT_CSS = (ctx, p) => `
      ${ctx.sel('slot')} { position: absolute; left: ${r1(p.x - p.w / 2)}px; top: ${r1(p.y - p.h / 2)}px; width: ${r1(p.w)}px; height: ${r1(p.h)}px; }
      ${ctx.sel('item')} { position: absolute; inset: 0; opacity: 0; transform: rotate(${p.rotate}deg); transform-origin: 50% 50%; }`;

const MOTION = { popScale: 1.08, popTilt: 1.6, attachDelay: 0.1667, wordStagger: 0.3, wiggleFps: 6, flickerFps: 8 };
const motion = (ctx) => ({ ...MOTION, ...ctx.motion });

// ── board ───────────────────────────────────────────────────────────────────

const MOOD_FILTER = {
  warm: 'saturate(1.04) sepia(0.06)',
  neutral: 'none',
  cool: 'saturate(0.62) brightness(0.95) hue-rotate(-6deg)',
  golden: 'sepia(0.22) saturate(1.16) brightness(1.04)',
};
const MOOD_VEIL = { none: 'transparent', warm: 'rgba(255, 170, 110, 0.07)', cool: 'rgba(70, 100, 150, 0.14)', golden: 'rgba(255, 186, 90, 0.12)' };

export const components = {
  board: {
    summary: 'The cork board world of one scene: warm cork, thin wooden frame and this scene\'s overlay (bare, newspaper, kraft, fabric, watercolor; mat = the green cutting mat of the reference videos). First item of every scene; the next board is a hard cut. Images: rcg mix-media boards.',
    fullFrame: true,
    params: { overlay: 'bare', src: '', mood: 'warm' },
    prepare(p, { jobDir }) {
      if (!p.src) p.src = `assets/mm/boards/${p.overlay}.jpg`;
      oneOf(p.mood, Object.keys(MOOD_FILTER), 'board mood');
      if (jobDir && !existsSync(join(jobDir, p.src))) throw new Error(`board: ${p.src} not found; run rcg mix-media boards --job <dir> --overlays ${p.overlay}`);
    },
    render(p, ctx) {
      const css = `
      ${ctx.sel('board')} { position: absolute; inset: 0; background: #7a5536 url("${ctx.esc(p.src)}") center / cover no-repeat; filter: ${MOOD_FILTER[p.mood]}; }`;
      return { html: `
          <div id="${ctx.idf('board')}"></div>`, css, js: holdJs('$("board")') };
    },
  },

  tone: {
    summary: 'The scene\'s mood over the whole frame, last item of a scene: a light colour veil (cool = sad or lost, golden = grateful, warm = happy), optional vignette and a stop-motion exposure flicker. Keep it subtle: the palette shifts, nothing looks like a filter.',
    fullFrame: true,
    params: { mood: 'none', amount: 1, vignette: 0.2, flicker: 0.025 },
    prepare(p) { oneOf(p.mood, Object.keys(MOOD_VEIL), 'tone mood'); },
    render(p, ctx) {
      const m = motion(ctx);
      const veil = MOOD_VEIL[p.mood].replace(/([\d.]+)\)$/, (s, a) => `${r3(Number(a) * p.amount)})`);
      const css = `
      ${ctx.sel('veil')} { position: absolute; inset: 0; background: ${veil}; }
      ${ctx.sel('vig')} { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, transparent 58%, rgba(40, 24, 10, ${p.vignette}) 100%); }
      ${ctx.sel('flick')} { position: absolute; inset: 0; background: #1a120a; opacity: 0; }`;
      let js = holdJs('$("veil")');
      if (p.flicker > 0) {
        for (let t = 0; t < ctx.D - 1e-6; t += 1 / m.flickerFps) js += `
            tl.set($("flick"), { opacity: ${r3(ctx.rnd() * p.flicker)} }, ${r3(t)});`;
      }
      return { html: `
          <div id="${ctx.idf('veil')}"></div>
          <div id="${ctx.idf('vig')}"></div>
          <div id="${ctx.idf('flick')}"></div>`, css, js };
    },
  },

  // ── the character ─────────────────────────────────────────────────────────

  cutout: {
    summary: 'The character as a real photo cut-out with its torn cream paper edge (rcg mix-media pose: assets/mm/pose-<n>.png), straight-on, slight tilt, popping in on a beat. Never illustrated, no outline, no shadow. tone: none, cool, golden or sepia for the scene mood.',
    decor: true,
    sfx(p) { return [{ role: 'place', at: p.at }, ...attachSfx(p, MOTION)]; },
    params: { src: '', x: null, y: 1000, h: 900, rotate: null, attach: 'none', at: 0, flip: false, tone: 'none' },
    prepare(p, { rnd, jobDir }) {
      needFile(jobDir, p.src, 'cutout');
      oneOf(p.attach, ATTACH, 'cutout attach');
      oneOf(p.tone, ['none', 'cool', 'golden', 'sepia'], 'cutout tone');
      const [iw, ih] = jobDir ? pngSize(join(jobDir, p.src)) : [600, 900];
      p.w = Math.round((p.h * iw) / ih);
      if (p.rotate === null) p.rotate = tilt(rnd, 1, 3);
    },
    render(p, ctx) {
      const m = motion(ctx);
      const filter = { none: 'none', cool: 'saturate(0.7) brightness(0.97)', golden: 'sepia(0.18) saturate(1.08)', sepia: 'sepia(0.6) contrast(0.95)' }[p.tone];
      const css = `${SLOT_CSS(ctx, p)}${ATTACH_CSS(ctx)}
      ${ctx.sel('img')} { position: absolute; inset: 0; width: 100%; height: 100%; filter: ${filter};${p.flip ? ' transform: scaleX(-1);' : ''} }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('item')}">
              <img id="${ctx.idf('img')}" src="${ctx.esc(p.src)}" alt="" />${attachHtml(p.attach, p.w, p.h, ctx, ctx.rnd)}
            </div>
          </div>`;
      const js = `${hideJs('$("item")', p.rotate)}${popJs('$("item")', p.at, p.rotate, m)}${attachJs(ctx, p.attach, p.at, m)}${holdJs('$("slot")')}`;
      return { html, css, js };
    },
  },

  live: {
    summary: 'The character moving: the matte re-cut every frame with a torn paper edge at 12 fps (rcg mix-media prep: assets/mm/live-<name>.webm), playing from mediaStart (seconds into the source clip). For the moments the footage itself tells: a laugh, a gesture, a reaction.',
    decor: true,
    sfx(p) { return [{ role: 'place', at: p.at }, ...attachSfx(p, MOTION)]; },
    params: { src: '', mediaStart: 0, x: null, y: 1000, h: 900, rotate: null, attach: 'none', at: 0 },
    prepare(p, { rnd, jobDir }) {
      const live = jobDir ? prepManifest(jobDir).live : null;
      if (!p.src) {
        if (!live) throw new Error('live: no src and no live cut-out in data/mm-prep.json (run rcg mix-media prep)');
        p.src = live.file;
      }
      needFile(jobDir, p.src, 'live');
      oneOf(p.attach, ATTACH, 'live attach');
      const size = live && live.file === p.src ? live.size : null;
      if (!size) throw new Error(`live: ${p.src} is not the live cut-out recorded in data/mm-prep.json (its size is needed)`);
      p.w = Math.round((p.h * size[0]) / size[1]);
      p.mediaEnd = live.duration;
      if (p.rotate === null) p.rotate = tilt(rnd, 1, 2.5);
    },
    render(p, ctx) {
      const m = motion(ctx);
      if (p.mediaStart < 0 || p.mediaStart + ctx.D > p.mediaEnd + 0.05) {
        throw new Error(`live: mediaStart ${p.mediaStart} + duration ${r3(ctx.D)} runs past the cut-out (${p.mediaEnd} s)`);
      }
      const css = `${SLOT_CSS(ctx, p)}${ATTACH_CSS(ctx)}
      ${ctx.sel('vid')} { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('item')}">
              <video id="${ctx.idf('vid')}" class="clip" src="${ctx.esc(p.src)}" data-start="0" data-duration="${r3(ctx.D)}" data-media-start="${r3(p.mediaStart)}" data-track-index="0" muted playsinline></video>${attachHtml(p.attach, p.w, p.h, ctx, ctx.rnd)}
            </div>
          </div>`;
      const js = `${hideJs('$("item")', p.rotate)}${popJs('$("item")', p.at, p.rotate, m)}${attachJs(ctx, p.attach, p.at, m)}${holdJs('$("slot")')}`;
      return { html, css, js };
    },
  },

  // ── words on paper ────────────────────────────────────────────────────────

  note: {
    summary: 'Every word on screen: handwritten black ink on a torn piece of paper (lined notebook, plain, grid, kraft, a post-it, a masking-tape strip or a small slip), pinned or taped, the words popping in one by one on their spoken times (times, from rcg infographics resolve anchors). The paper grows with the text. *word* = one highlighted word in Caveat Bold; | breaks a line.',
    sfx(p) { return [{ role: p.paper === 'masking' ? 'tape' : 'place', at: p.at }, ...attachSfx(p, MOTION)]; },
    params: { text: '', x: null, y: 420, w: 0, size: 72, paper: 'lined', attach: 'pin', rotate: null, at: 0, times: '', highlight: 'butter', align: 'left' },
    prepare(p, { rnd }) {
      if (!p.text) throw new Error('note: text is required');
      oneOf(p.paper, ['lined', 'plain', 'grid', 'kraft', 'postit', 'masking', 'slip'], 'note paper');
      oneOf(p.attach, ATTACH, 'note attach');
      if (p.paper === 'masking') p.attach = 'none'; // the strip is the tape: nothing pins tape
      oneOf(p.highlight, ['butter', 'pink', 'mint', 'lavender'], 'note highlight');
      oneOf(p.align, ['left', 'center'], 'note align');
      const s = p.size;
      const pads = {
        lined: [s * 0.42, s * 0.5, s * 1.0, s * 0.5], plain: [s * 0.45, s * 0.5, s * 0.55, s * 0.55], grid: [s * 0.45, s * 0.5, s * 0.55, s * 0.55],
        kraft: [s * 0.45, s * 0.5, s * 0.55, s * 0.55], postit: [s * 0.62, s * 0.5, s * 0.5, s * 0.5], masking: [s * 0.22, s * 0.45, s * 0.22, s * 0.45],
        slip: [s * 0.42, s * 0.42, s * 0.34, s * 0.42],
      }[p.paper]; // top, right, bottom, left
      p.pad = pads.map((v) => Math.round(v));
      const lines = p.text.replace(/\*/g, '').split('|');
      const cw = s * 0.43; // Caveat's mean advance per character, measured loosely (the runtime fit shrinks if needed)
      const longest = Math.max(...lines.map((l) => l.length));
      const padX = p.pad[1] + p.pad[3];
      if (!p.w) p.w = Math.round(clamp(longest * cw + padX + s * 0.4, s * 2.2, 780));
      const inner = p.w - padX;
      const nLines = p.paper === 'masking' ? 1 : lines.reduce((n, l) => n + Math.max(1, Math.ceil((l.length * cw) / inner)), 0);
      p.lh = 1.14;
      p.h = Math.round(p.pad[0] + p.pad[2] + nLines * s * p.lh);
      if (p.paper === 'postit') { const side = Math.max(p.w, p.h); p.w = p.h = Math.min(side, 560); }
      if (p.rotate === null) p.rotate = p.paper === 'masking' ? tilt(rnd, 2, 6) : tilt(rnd, 2, 5);
      p.words = p.text.replace(/\*/g, '').split(/[\s|]+/).filter(Boolean).length;
    },
    render(p, ctx) {
      const m = motion(ctx);
      const [pt, pr, pb, pl] = p.pad;
      // Caveat's ascenders, descenders and slanted first letters reach past their boxes: the text box is
      // padded so every glyph stays inside it (HyperFrames' occlusion probe otherwise hits the paper).
      const ex = Math.round(p.size * 0.24);
      const exX = Math.round(p.size * 0.14);
      const torn = !['postit'].includes(p.paper);
      const clip = p.paper === 'masking' ? tornPoly(p.w, p.h, ctx.rnd, { amp: 5, step: 4, sides: 'lr' })
        : torn ? tornPoly(p.w, p.h, ctx.rnd, { amp: p.paper === 'slip' ? 4 : 6, inset: 2 }) : 'none';
      const rim = torn && p.paper !== 'masking' ? tornPoly(p.w, p.h, ctx.rnd, { amp: 5, inset: 0 }) : null;
      const bg = {
        lined: 'var(--notebook)',
        plain: 'radial-gradient(circle at 30% 20%, #fffdf6, #f3ecd9)',
        grid: 'linear-gradient(rgba(140, 170, 210, 0.38) 1.5px, transparent 1.5px) 0 0 / 30px 30px, linear-gradient(90deg, rgba(140, 170, 210, 0.38) 1.5px, transparent 1.5px) 0 0 / 30px 30px, #fbfaf4',
        kraft: 'radial-gradient(circle at 35% 25%, #d4ad7c, #c49a6c)',
        postit: 'linear-gradient(#f2d566 0 13%, #f9e384 13%)',
        masking: 'rgba(238, 226, 188, 0.95)',
        slip: '#fffdf8',
      }[p.paper];
      const lined = p.paper === 'lined';
      const css = `${SLOT_CSS(ctx, p)}${ATTACH_CSS(ctx)}
      ${ctx.sel('sheet')} { position: absolute; inset: 0; filter: drop-shadow(0 2px 1.6px rgba(40, 25, 10, ${p.paper === 'masking' ? 0.12 : 0.3})); }
      ${rim ? `${ctx.sel('rim')} { position: absolute; inset: 0; background: #fffdf7; clip-path: ${rim}; }` : ''}
      ${ctx.sel('paper')} { position: absolute; inset: 0; background: ${bg}; clip-path: ${clip};${lined ? ` --lh: ${r1(p.size * p.lh)}px; --off: 0px; background-image: linear-gradient(to bottom, transparent calc(var(--lh) - 2.5px), var(--rule) calc(var(--lh) - 2.5px), var(--rule) var(--lh)); background-size: 100% var(--lh); background-position: 0 var(--off);` : ''} }
      ${lined ? `${ctx.sel('margin')} { position: absolute; top: 0; bottom: 0; left: ${r1(pl * 0.62)}px; width: 2.5px; background: var(--margin); opacity: 0.85; }` : ''}
      ${ctx.sel('txt')} { position: absolute; left: ${pl - exX}px; right: ${pr - exX}px; top: ${pt - ex}px; bottom: ${pb - ex}px; padding: ${ex}px ${exX}px; color: var(--ink); text-align: ${p.align}; line-height: ${p.lh}; font-family: "${ctx.type.hand.family}"; font-weight: ${ctx.type.hand.weight}; white-space: nowrap; }
      ${ctx.sel('txt')} .w { opacity: 0; transform-origin: 50% 70%; }
      ${ctx.sel('txt')} .em { font-weight: ${ctx.type['hand-bold'].weight}; background: linear-gradient(transparent 50%, var(--hl-${p.highlight}) 50%, var(--hl-${p.highlight}) 92%, transparent 92%); padding: 0 0.06em; }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('item')}">
              <div id="${ctx.idf('sheet')}">${rim ? `
                <div id="${ctx.idf('rim')}"></div>` : ''}
                <div id="${ctx.idf('paper')}">${lined ? `<i id="${ctx.idf('margin')}"></i>` : ''}</div>
              </div>
              <div id="${ctx.idf('txt')}"></div>${attachHtml(p.attach, p.w, p.h, ctx, ctx.rnd, pt - Math.round(ex * 0.6))}
            </div>
          </div>`;
      const given = String(p.times || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
      const times = Array.from({ length: p.words }, (_, i) => r3(given[i] != null ? given[i] : (given.length ? given[given.length - 1] : p.at + 0.15 + i * m.wordStagger)));
      const js = `
            var r = fit($("txt"), ${ctx.js(p.text)}, { font: ${ctx.js({ family: ctx.type.hand.family, weight: ctx.type.hand.weight })}, em: ${ctx.js({ family: ctx.type['hand-bold'].family, weight: ctx.type['hand-bold'].weight })}, size: ${p.size}, min: ${Math.round(p.size * 0.55)}, maxW: ${p.w - pl - pr}, maxH: ${p.h - pt - pb + 2}, maxLines: 9, lh: ${p.lh} });${lined ? `
            var lh = r.size * ${p.lh};
            $("paper").style.setProperty("--lh", lh.toFixed(1) + "px");
            $("paper").style.setProperty("--off", (${pt} - lh * 0.1).toFixed(1) + "px");` : ''}
            var ws = $("txt").querySelectorAll(".w");
            var T = ${ctx.js(times)};
            for (var i = 0; i < ws.length; i++) {
              var t = T[Math.min(i, T.length - 1)];
              tl.set(ws[i], { opacity: 1, scale: 1.14, rotation: ${r1(tilt(ctx.rnd, 1, 3))} }, t);
              tl.set(ws[i], { scale: 1, rotation: 0 }, t + ${r3(STEP)});
            }${hideJs('$("item")', p.rotate)}${popJs('$("item")', p.at, p.rotate, m)}${attachJs(ctx, p.attach, p.at, m)}${holdJs('$("slot")')}`;
      return { html, css, js };
    },
  },

  // ── props ─────────────────────────────────────────────────────────────────

  sticker: {
    summary: `An illustrated vintage prop with a white die-cut border, popping in (kind: ${KIND_NAMES.join(', ')}), or an image sticker (src: an rcg mix-media object / sticker PNG). img = a still inside polaroid, stamp, oval; text = the printed words of ticket ("MAIN|No. 7"), calendar ("MON|12"), label, stamp value, polaroid or postcard caption; color = a palette name (or gingham / glitter for stars, rain for cloud). wiggle = degrees of a 6 fps wiggle while it stays.`,
    decor: true,
    sfx(p) { return [{ role: attachRole(p.attach) || 'sticker', at: p.at }]; },
    params: { kind: 'star', src: '', x: null, y: 600, size: 180, rotate: null, color: '', img: '', text: '', attach: 'none', at: 0, wiggle: 0, flip: false },
    prepare(p, { rnd, jobDir }) {
      oneOf(p.attach, ATTACH, 'sticker attach');
      if (p.src) {
        needFile(jobDir, p.src, 'sticker');
        if (extname(p.src).toLowerCase() !== '.png') throw new Error('sticker: src must be a PNG with alpha (rcg mix-media object / sticker makes one)');
        const [iw, ih] = jobDir ? pngSize(join(jobDir, p.src)) : [1, 1];
        p.w = p.size;
        p.h = Math.round((p.size * ih) / iw);
      } else {
        oneOf(p.kind, KIND_NAMES, 'sticker kind');
        if (p.img) needFile(jobDir, p.img, `sticker ${p.kind} img`);
        const k = KINDS[p.kind]({ id: 'probe', color: p.color, img: p.img, text: p.text, family: 'x' });
        p.w = p.size;
        p.h = Math.round((p.size * k.h) / k.w);
      }
      if (p.rotate === null) p.rotate = tilt(rnd, 2, 6);
    },
    render(p, ctx) {
      const m = motion(ctx);
      let art;
      if (p.src) {
        art = `<img id="${ctx.idf('img')}" src="${ctx.esc(p.src)}" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%;${p.flip ? ' transform: scaleX(-1);' : ''}" />`;
      } else {
        const fid = ctx.idf('f');
        const k = KINDS[p.kind]({ id: ctx.idf('k'), color: p.color, img: p.img, text: p.text, family: ctx.type.hand.family });
        const border = Math.max(5, Math.round((k.w / p.size) * 7));
        art = `<svg class="mm-svg" viewBox="0 0 ${k.w} ${k.h}" width="${p.w}" height="${p.h}" overflow="visible"${p.flip ? ' style="transform: scaleX(-1);"' : ''}>
                <defs>${stickerFilter(fid, Math.floor(ctx.rnd() * 900) + 1, border, !p.img)}</defs>
                <g filter="url(#${fid})">${k.art}
                </g>
              </svg>`;
      }
      const css = `${SLOT_CSS(ctx, p)}${ATTACH_CSS(ctx)}
      ${ctx.sel('art')} { position: absolute; inset: 0; filter: drop-shadow(1px 3px 2px rgba(40, 25, 10, 0.32)); }
      #${ctx.id}-layer .mm-svg { position: absolute; left: 0; top: 0; overflow: visible; }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('item')}">
              <div id="${ctx.idf('art')}">${art}</div>${attachHtml(p.attach, p.w, p.h, ctx, ctx.rnd)}
            </div>
          </div>`;
      const js = `${hideJs('$("item")', p.rotate)}${popJs('$("item")', p.at, p.rotate, m)}${attachJs(ctx, p.attach, p.at, m)}${wiggleJs('$("item")', p.at + 3 * STEP, ctx.D, p.rotate, p.wiggle, ctx.rnd, m.wiggleFps)}${holdJs('$("slot")')}`;
      return { html, css, js };
    },
  },

  doodle: {
    summary: 'A marker mark drawn straight on the board or a paper (circle, underline, arrow, sparkle, heart, star, cross, route, squiggle), drawn on in a few stop-motion steps, then a gentle line boil while it stays. Put it after the thing it marks in the plan.',
    decor: true,
    sfx(p) { return [{ role: 'scribble', at: p.at }]; },
    params: { shape: 'circle', x: null, y: 600, w: 320, h: 160, color: 'ink', stroke: 7, at: 0, steps: 3, boil: true, rotate: 0 },
    prepare(p) {
      oneOf(p.shape, ['circle', 'underline', 'arrow', 'sparkle', 'heart', 'star', 'cross', 'route', 'squiggle'], 'doodle shape');
      oneOf(p.color, ['ink', 'white', 'pink', 'red', 'blue'], 'doodle color');
      p.steps = clamp(Math.round(p.steps), 1, 6);
    },
    render(p, ctx) {
      const m = motion(ctx);
      const col = { ink: '#22201c', white: '#fbf8f1', pink: '#d9788b', red: '#c45a4b', blue: '#5f7fb3' }[p.color];
      const variants = [0, 1].map(() => doodleStrokes(p.shape, p.w, p.h, ctx.rnd));
      const paths = (strokes, cls) => strokes.map((pts) => {
        const len = Math.ceil(pathLen(pts));
        return `<path class="${cls}" d="${pathD(pts)}" fill="none" stroke="${col}" stroke-width="${p.stroke}" stroke-linecap="round" stroke-linejoin="round"${p.shape === 'route' ? ` stroke-dasharray="2 ${p.stroke * 2.4}"` : ` stroke-dasharray="${len}" stroke-dashoffset="${len}"`} data-len="${len}"/>`;
      }).join('\n                ');
      const css = `
      ${ctx.sel('slot')} { position: absolute; left: ${r1(p.x - p.w / 2)}px; top: ${r1(p.y - p.h / 2)}px; width: ${p.w}px; height: ${p.h}px; transform: rotate(${p.rotate}deg); }
      ${ctx.sel('slot')} svg { position: absolute; inset: 0; overflow: visible; }
      ${ctx.sel('b')} { opacity: 0; }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <svg width="${p.w}" height="${p.h}" viewBox="0 0 ${p.w} ${p.h}">
              <g id="${ctx.idf('a')}">
                ${paths(variants[0], 'sa')}
              </g>
              <g id="${ctx.idf('b')}">
                ${paths(variants[1], 'sb')}
              </g>
            </svg>
          </div>`;
      const route = p.shape === 'route';
      let js = `
            var A = Array.prototype.slice.call($("a").querySelectorAll("path")), B = Array.prototype.slice.call($("b").querySelectorAll("path"));
            tl.set($("slot"), { opacity: 0 }, 0);
            tl.set($("slot"), { opacity: 1 }, ${r3(p.at)});`;
      // Draw on in discrete steps (stop-motion), the same for both variants.
      for (let k = 1; k <= p.steps; k++) {
        const t = r3(p.at + (k - 1) * STEP);
        js += route ? `
            tl.set(A.concat(B), { opacity: ${r3(k / p.steps)} }, ${t});` : `
            for (var i = 0; i < A.length; i++) tl.set([A[i], B[i]], { attr: { "stroke-dashoffset": Number(A[i].getAttribute("data-len")) * ${r3(1 - k / p.steps)} } }, ${t});`;
      }
      if (p.boil) {
        let on = 0;
        for (let t = p.at + p.steps * STEP + 1 / 6; t < ctx.D - 1e-6; t += 1 / 6) {
          on = 1 - on;
          js += `
            tl.set($("a"), { opacity: ${1 - on} }, ${r3(t)}); tl.set($("b"), { opacity: ${on} }, ${r3(t)});`;
        }
      }
      js += holdJs('$("slot")');
      return { html, css, js };
    },
  },
};

// ── doodle geometry ─────────────────────────────────────────────────────────

const pathD = (pts) => `M ${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L ')}`;
const pathLen = (pts) => pts.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);

function quad(a, c, b, n = 48) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
  });
}

function doodleStrokes(shape, w, h, rnd) {
  const j = (a) => (rnd() * 2 - 1) * a;
  const wob = (pts, a) => pts.map(([x, y]) => [x + j(a), y + j(a)]);
  switch (shape) {
    case 'circle': {
      const a0 = -Math.PI * (0.5 + rnd() * 0.3);
      return [Array.from({ length: 73 }, (_, i) => {
        const t = i / 72;
        const a = a0 + t * 1.12 * Math.PI * 2;
        const k = 1 + j(0.02) - t * 0.06;
        return [w / 2 + Math.cos(a) * (w / 2) * k, h / 2 + Math.sin(a) * (h / 2) * k];
      })];
    }
    case 'underline':
      return [wob(Array.from({ length: 33 }, (_, i) => [w * (i / 32), h * 0.55 + Math.sin(i / 32 * Math.PI * 2.1) * h * 0.08 - (i / 32) * h * 0.1]), 0.8),
        wob(Array.from({ length: 25 }, (_, i) => [w * (0.08 + 0.8 * i / 24), h * 0.82 + Math.sin(i / 24 * Math.PI * 1.6) * h * 0.05]), 0.8)];
    case 'arrow': {
      const a = [w * 0.04, h * 0.9];
      const b = [w * 0.95, h * 0.15];
      const c = [w * (0.35 + j(0.06)), h * (0.05 + j(0.05))];
      const body = wob(quad(a, c, b), 0.8);
      const ang = Math.atan2(b[1] - c[1], b[0] - c[0]);
      const L = Math.min(w, h) * 0.3;
      const head = (s) => [[b[0] - Math.cos(ang + s) * L, b[1] - Math.sin(ang + s) * L], b];
      return [body, head(0.5), head(-0.5)];
    }
    case 'sparkle': {
      const cx = w / 2;
      const cy = h / 2;
      return [0, 1, 2, 3, 4].map((k) => {
        const a = -Math.PI / 2 + (k - 2) * 0.5;
        const r0 = Math.min(w, h) * 0.2;
        const r1v = Math.min(w, h) * (k % 2 ? 0.42 : 0.5);
        return [[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 + h * 0.2], [cx + Math.cos(a) * r1v, cy + Math.sin(a) * r1v + h * 0.2]];
      });
    }
    case 'heart': {
      return [wob(Array.from({ length: 61 }, (_, i) => {
        const t = (i / 60) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        return [w / 2 + (x / 34) * w, h / 2 + (y / 34) * h * 1.05];
      }), 0.7)];
    }
    case 'star': {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? 0.2 : 0.48;
        pts.push([w / 2 + Math.cos(a) * w * rr, h / 2 + Math.sin(a) * h * rr]);
      }
      return [wob(pts, 1.2)];
    }
    case 'cross':
      return [wob([[w * 0.05, h * 0.5 + j(4)], [w * 0.95, h * 0.42 + j(4)]], 1.2), wob([[w * 0.08, h * 0.62], [w * 0.92, h * 0.56]], 1.2)];
    case 'route':
      return [wob(quad([w * 0.04, h * 0.92], [w * (0.5 + j(0.1)), h * (0.1 + j(0.1))], [w * 0.96, h * 0.3], 60), 0.6)];
    case 'squiggle':
    default:
      return [wob(Array.from({ length: 49 }, (_, i) => [w * (i / 48), h / 2 + Math.sin((i / 48) * Math.PI * 4) * h * 0.35]), 0.8)];
  }
}
