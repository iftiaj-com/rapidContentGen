// Caption track generator. Turns word timings into a HyperFrames sub-composition
// styled with an Adits caption preset (library/caption-styles.json).
//
// Why a generator: HyperFrames variables cannot carry arrays, so the words are
// written straight into the sub-composition. Everything is driven by one paused
// GSAP timeline, so any frame can be seeked and rendered the same way twice:
//   - Adits' per-frame flash (flashAlpha *= 0.80 at 60 fps) becomes a tweened
//     CSS variable --flash (1 -> 0, power3.out over 0.35 s, a close match)
//   - Adits' Math.random() word scatter (kinetic) becomes a seeded PRNG
//   - text is measured after fonts load and shrunk to fit the safe box
//
// Usage:
//   node tools/blocks/captions.mjs --job <jobDir> --words <audio_meta.json|words.json|file.srt>
//        [--voice <id>] --style tiktok|karaoke|neon|kinetic|modern|subtitle|glitch|retro|earthquake|vertical_ghost|collage|editorial|editorial-clean
//        [--mode word|2word|phrase] [--position captions|center|top-band] [--y <px>] [--size <px>]
//        [--id captions-vo] [--start <sec>] [--track 30] [--seed 1] [--emphasis "word,word"]
//        [--hollow] [--rgb] [--negative] [--shadow [--shadow-angle 45] [--shadow-dist 4]] [--insert]
//
// --start is where the words' t=0 sits on the main timeline (the voice clip's data-start).
// --insert adds the host <div> to the job's index.html (before the root's closing tag).
//
// Adits Active Tracking Caption text controls (shared/active-tracking-captions.js), on any preset:
//   --hollow    outline only (atcHollowText): no fill, a stroke of 5% of the font size in the text colour
//   --rgb       RGB Highlight (atcRgbHighlight): the text colour cycles r/g/b = sin(2t + 0|2|4) * 127 + 128,
//               t in main-timeline seconds (Adits reads media time), keyed every 0.2 s so it seeks
//   --negative  Negative FX (atcNegative): the captions blend with "difference" over the footage
//   --shadow    Text Shadow (atcShadowEnabled): offset cos/sin(angle) * dist, blur 4, rgba(0,0,0,0.8);
//               it replaces the preset's glow, as in Adits. Angle 0-360 (default 45), dist 0-50 px (4)

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import vm from 'node:vm';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { readJson, ROOT } from '../lib/config.mjs';

const STYLES_FILE = join(ROOT, 'library', 'caption-styles.json');

// ── Inputs ──────────────────────────────────────────────────────────────────

function parseSrtTime(s) {
  const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0;
}

/** SRT cues -> words; multi-word cues are split by character length. */
export function srtToWords(text) {
  const words = [];
  for (const block of text.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.trim().split('\n');
    const timing = lines.find((l) => l.includes('-->'));
    if (!timing) continue;
    const [a, b] = timing.split('-->').map(parseSrtTime);
    const tokens = lines.slice(lines.indexOf(timing) + 1).join(' ').split(/\s+/).filter(Boolean);
    const total = tokens.reduce((n, t) => n + t.length, 0) || 1;
    let t = a;
    for (const tok of tokens) {
      const d = ((b - a) * tok.length) / total;
      words.push({ text: tok, start: +t.toFixed(3), end: +(t + d).toFixed(3) });
      t += d;
    }
  }
  return words;
}

export function loadWords(file, voiceId) {
  if (file.toLowerCase().endsWith('.srt')) return srtToWords(readFileSync(file, 'utf8'));
  const doc = readJson(file);
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc.words)) return doc.words;
  if (Array.isArray(doc.voices)) {
    const v = voiceId ? doc.voices.find((x) => x.id === voiceId) : doc.voices[0];
    if (!v) throw new Error(`Voice "${voiceId}" not in ${file}`);
    if (!Array.isArray(v.words)) throw new Error(`Voice "${v.id}" has no words (made with --no-words?)`);
    return v.words;
  }
  throw new Error(`No words found in ${file}`);
}

// ── Grouping ────────────────────────────────────────────────────────────────

export function groupWords(words, mode = 'word', { maxChars = 22, maxSeconds = 3, gap = 0.5, hold = 0.35, breakOn = /[.?!]$/ } = {}) {
  // brk: true on a word ends a phrase after it (planners pass their clause breaks this way).
  const ws = words.filter((w) => String(w.text).trim()).map((w) => ({ text: String(w.text).trim(), start: +w.start, end: +w.end, ...(w.brk ? { brk: true } : {}) }));
  const groups = [];
  if (mode === 'word' || mode === '2word') {
    const n = mode === 'word' ? 1 : 2;
    for (let i = 0; i < ws.length; i += n) groups.push(ws.slice(i, i + n));
  } else {
    // A phrase broken for length should not end on a small connecting word
    // ("...a plan, a" / "mop, and a playlist."): carry it into the next phrase.
    const SMALL = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'my', 'your', 'our', 'is']);
    let cur = [];
    for (const w of ws) {
      if (cur.length) {
        const last = cur[cur.length - 1];
        const text = cur.map((x) => x.text).join(' ');
        const natural = breakOn.test(last.text) || last.brk || w.start - last.end > gap;
        if (natural || text.length + 1 + w.text.length > maxChars || w.end - cur[0].start > maxSeconds) {
          const carry = [];
          if (!natural) {
            while (cur.length > 1 && SMALL.has(cur[cur.length - 1].text.toLowerCase().replace(/[^\w']/g, ''))) carry.unshift(cur.pop());
          }
          groups.push(cur);
          cur = carry;
        }
      }
      cur.push(w);
    }
    if (cur.length) groups.push(cur);
  }
  // A group holds until its last word ends plus `hold`, but never past the next
  // group's start: two groups on screen at once overlap and become unreadable.
  return groups.map((g, i) => {
    const next = groups[i + 1];
    let end = g[g.length - 1].end + hold;
    if (next) end = Math.min(end, next[0].start);
    end = Math.max(end, g[0].start + 0.05);
    return { start: +g[0].start.toFixed(3), end: +end.toFixed(3), words: g };
  });
}

// ── Sub-composition HTML ────────────────────────────────────────────────────

function rgbaParts(c) {
  const m = String(c).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/);
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] } : null;
}

/**
 * Adits ATC text controls -> CSS. `shadow` is { angle, dist } or null. Returns the text-shadow and
 * pill box-shadow that replace the preset's (Adits: the user's shadow wins over a style's glow).
 */
export function textFx({ hollow = false, rgb = false, negative = false, shadow = null } = {}) {
  let text = null;
  let pill = null;
  if (shadow) {
    const rad = (Number(shadow.angle ?? 45) * Math.PI) / 180;
    const d = Number(shadow.dist ?? 4);
    const dx = +(Math.cos(rad) * d).toFixed(2);
    const dy = +(Math.sin(rad) * d).toFixed(2);
    text = `${dx}px ${dy}px 4px rgba(0,0,0,0.8)`;
    pill = `${dx}px ${dy}px 10px rgba(0,0,0,0.5)`;
  }
  return { hollow: Boolean(hollow), rgb: Boolean(rgb), negative: Boolean(negative), shadow: text, pillShadow: pill };
}

/** RGB Highlight colour at main-timeline time t (Adits _getRgbHighlightColor: time = ms * 0.002). */
export function rgbAt(t) {
  const ph = t * 2;
  const c = (o) => Math.floor(Math.sin(ph + o) * 127 + 128);
  return `rgb(${c(0)},${c(2)},${c(4)})`;
}

/** Split a CSS shadow list on its top-level commas (not the ones inside rgba()). */
function splitShadows(list) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of String(list)) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((s) => s && s !== 'none');
}

/** A preset's resting text shadows (glow at its base blur, the default dark shadow or its own). */
function staticShadow(style) {
  const g = style.glow || {};
  const glow = g.color && g.color !== 'transparent' && g.blur ? `0 0 ${g.blur}px ${g.color}` : null;
  const own = style.textShadow !== undefined;
  return [glow, style.pill || own ? null : '0 3px 10px rgba(0,0,0,0.65)', own ? style.textShadow : null].filter(Boolean).join(', ') || null;
}

function boxCss(style, flashScale, fx) {
  const lines = [];
  const g = style.glow || {};
  const glow = g.color && g.color !== 'transparent'
    ? `0 0 calc(${g.blur || 0}px + var(--flash) * ${g.flashBlur || 0}px) ${g.color}`
    : null;
  // A preset may set its own textShadow (null = none), e.g. dark ink on a light ground.
  const own = style.textShadow !== undefined;
  const shadows = fx.shadow ? [fx.shadow] : [glow, style.pill || own ? null : '0 3px 10px rgba(0,0,0,0.65)', own ? style.textShadow : null].filter(Boolean);
  lines.push(`text-shadow: ${shadows.join(', ') || 'none'};`);
  if (style.stroke && !fx.hollow) lines.push(`-webkit-text-stroke: var(--stroke) ${style.stroke}; paint-order: stroke fill;`);
  if (style.pill) {
    const base = rgbaParts(style.pill.bg);
    const flash = style.pill.bgFlash ? rgbaParts(style.pill.bgFlash) : null;
    const bg = base && flash
      ? `rgba(${base.r}, ${base.g}, ${base.b}, calc(${base.a} + var(--flash) * ${(flash.a - base.a).toFixed(3)}))`
      : style.pill.bg;
    lines.push(`background: ${bg}; border-radius: ${style.pill.radius}px; padding: 0.3em 0.48em;`);
  }
  // Style-pack presets (library/styles): a drawn edge, a card shadow and a resting tilt.
  if (style.border) lines.push(`border: ${style.border};`);
  const boxShadow = [style.boxShadow, style.pill ? fx.pillShadow : null].filter(Boolean).join(', ');
  if (boxShadow) lines.push(`box-shadow: ${boxShadow};`);
  const tilt = style.rotate ? ` rotate(${style.rotate}deg)` : '';
  lines.push(`transform: scale(calc(1 + var(--flash) * ${flashScale}))${tilt};`);
  return lines.join('\n          ');
}

/** @font-face rules for presets that use a font file instead of a bundled family. */
function fontFaceCss(style) {
  const faces = [...(style.fontFace || []), ...(style.emphasis?.fontFace || [])];
  return faces.map((f) => `
      @font-face {
        font-family: "${f.family}";
        src: url("assets/fonts/${basename(f.file)}") format("woff2");
        font-weight: ${f.weight || 400};
        font-style: normal;
      }`).join('');
}

/** Copy a preset's font files into the job (assets/fonts is git-ignored, the library copy is the source). */
function ensureFonts(jobDir, style) {
  for (const f of [...(style.fontFace || []), ...(style.emphasis?.fontFace || [])]) {
    const src = join(ROOT, f.file);
    if (!existsSync(src)) throw new Error(`Font file for "${f.family}" is missing: ${f.file}`);
    const dest = join(jobDir, 'assets', 'fonts', basename(f.file));
    if (!existsSync(dest)) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }
  }
}

export function buildCaptionHtml({ id, groups, style, styleName, mode, width, height, centerY, size, safe, seed, flash, emphasis = [], fx = textFx(), start = 0, duration = 0 }) {
  const data = groups.map((g) => ({ s: g.start, e: g.end, w: g.words.map((w) => [w.text, +w.start.toFixed(3), +w.end.toFixed(3)]) }));
  // RGB Highlight: the colour keyed every 0.2 s on the main-timeline clock (linear in between,
  // within about 3 of 255 of Adits' sine), so a seek lands on the same colour as playback.
  const RGB_STEP = 0.2;
  const rgbKeys = fx.rgb
    ? Array.from({ length: Math.ceil((duration || Math.max(...groups.map((g) => g.end))) / RGB_STEP) + 1 }, (_, k) => rgbAt(start + k * RGB_STEP))
    : null;
  // Hollow: the fill goes transparent and the stroke takes the text colour (currentcolor), so the
  // active-word, emphasis and RGB colours still apply. The fill is cleared on the text leaves only:
  // hf check's text_not_painted reads the fill and not the stroke, and accepts a transparent fill
  // under background-clip: text with a background image (an empty gradient here). On .box that clip
  // would cut the pill down to the glyphs. Shadow: one rule for every text element.
  // A text-shadow is cast from the whole glyph and fills a hollow letter in; Adits' canvas shadow
  // comes from the stroke only. So hollow text drops its text-shadows and the layer casts the same
  // shadows with filter: drop-shadow (from the painted pixels: the stroke and any pill). The
  // flash-driven glow pulse has no layer equivalent; its resting blur is kept.
  const hollowShadow = fx.hollow ? (fx.shadow || staticShadow(style)) : null;
  const fxCss = `${fx.hollow ? `
      #${id}-layer .box, #${id}-layer .kw, #${id}-layer .cur, #${id}-layer .lead {
        -webkit-text-stroke: max(1px, 0.05em) currentcolor;
        paint-order: normal;
        text-shadow: none;
      }
      #${id}-layer .tier { text-shadow: none; }${hollowShadow ? `
      #${id}-layer { filter: ${splitShadows(hollowShadow).map((s) => `drop-shadow(${s})`).join(' ')}; }` : ''}
      #${id}-layer .box > span, #${id}-layer .kw, #${id}-layer .cur, #${id}-layer .lead {
        -webkit-text-fill-color: transparent;
        background-image: linear-gradient(transparent, transparent);
        -webkit-background-clip: text;
        background-clip: text;
      }` : ''}${fx.shadow && !fx.hollow ? `
      #${id}-layer .kw, #${id}-layer .tier { text-shadow: ${fx.shadow}; }` : ''}`;
  const kin = style.kinetic || null;
  const flashScale = style.flashScale ?? flash.scale;
  const em = style.emphasis && emphasis.length ? style.emphasis : null;
  // Two-tier layout (style-pack presets): a clause's lead words small above, the rest rolling bold below.
  const tier = style.layout === 'tier' ? (style.tier || {}) : null;
  const emCss = em ? `
      #${id}-layer .em {
        font-family: "${em.font}", serif;
        font-weight: ${em.weight || 400};
        ${em.color ? `color: ${em.color};` : ''}
        ${em.letterSpacing ? `letter-spacing: ${em.letterSpacing};` : ''}
      }` : '';
  const css = `${fontFaceCss(style)}
      #root {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }
      #${id}-layer {
        position: absolute;
        inset: 0;
        font-family: "${style.font}", sans-serif;
        font-weight: ${style.weight};
        color: ${style.color};
        ${style.uppercase ? 'text-transform: uppercase;' : ''}
        line-height: 1.12;
      }
      #${id}-layer .grp {
        position: absolute;
        left: ${safe.left}px;
        width: ${safe.width}px;
        top: ${Math.round(centerY - size * 2)}px;
        height: ${Math.round(size * 4)}px;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        opacity: 0;
      }
      #${id}-layer .box {
        --flash: 0;
        display: inline-block;
        max-width: ${safe.width}px;
        text-wrap: balance;
        ${boxCss(style, flashScale, fx)}
      }${emCss}
      #${id}-layer .kw {
        position: absolute;
        white-space: nowrap;
        opacity: 0;
        text-shadow: 0 0 ${style.glow?.blur || 0}px ${style.glow?.color || 'transparent'}, 0 3px 10px rgba(0,0,0,0.6);
      }${tier ? `
      #${id}-layer .tier { display: flex; flex-direction: column; align-items: center; width: 100%; text-shadow: ${style.textShadow || 'none'}; }
      #${id}-layer .lead { display: block; white-space: nowrap; font-weight: ${tier.leadWeight || 400}; ${tier.leadColor ? `color: ${tier.leadColor};` : ''} opacity: 0; line-height: 1.05; }
      #${id}-layer .cw { position: relative; width: 100%; }
      #${id}-layer .cur { position: absolute; left: 0; right: 0; top: 0; white-space: nowrap; text-align: center; opacity: 0; line-height: 1.08; }` : ''}${fxCss}`;

  const script = `
      (function () {
        var ID = ${JSON.stringify(id)};
        var MODE = ${JSON.stringify(mode)};
        var GROUPS = ${JSON.stringify(data)};
        var SIZE = ${size};
        var SAFE = ${JSON.stringify(safe)};
        var CENTER_Y = ${Math.round(centerY)};
        var KIN = ${JSON.stringify(kin)};
        var ACTIVE = ${JSON.stringify(style.activeWord?.color || null)};
        var FLASH_S = ${flash.seconds};
        var FLASH_SCALE = ${flashScale};
        var SEED = ${Number(seed) >>> 0};${rgbKeys ? `
        var RGB = ${JSON.stringify(rgbKeys)}, RGB_STEP = ${RGB_STEP};` : ''}${tier ? `
        var TIER = ${JSON.stringify(tier)};` : ''}${em ? `
        var EMPH = ${JSON.stringify(emphasis.map((w) => String(w).toLowerCase()))};
        function isEmph(t) { return EMPH.indexOf(String(t).toLowerCase().replace(/[^\\p{L}\\p{N}'-]+/gu, "")) >= 0; }` : ''}

        // mulberry32: seeded, so the kinetic scatter is identical on every render
        function prng(a) {
          return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        }

        // Measure with canvas font metrics, NOT offsetWidth: a caption slot that is
        // not on screen when the page loads has no layout yet and measures 0 px.
        var FONT = ${JSON.stringify(style.font)}, WEIGHT = ${JSON.stringify(String(style.weight))};
        var UPPER = ${style.uppercase ? 'true' : 'false'};
        var PILL_PAD = ${style.pill ? 0.96 : 0};
        var ctx = document.createElement("canvas").getContext("2d");
        function textWidth(text, fs) {
          ctx.font = WEIGHT + " " + fs + "px '" + FONT + "', sans-serif";
          return ctx.measureText(UPPER ? text.toUpperCase() : text).width;
        }
        function boxWidth(text, fs) { return textWidth(text, fs) + fs * PILL_PAD + Math.max(2, fs * 0.06) * 2; }
        function overlap(a, b) {
          var x = Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l));
          var y = Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
          return x * y;
        }

        function build() {
          var layer = document.getElementById(ID + "-layer");
          var tl = gsap.timeline({ paused: true });
          var rnd = prng(SEED);

          if (KIN) {
            var placed = [];   // boxes with their visible windows, to avoid stacking words
            GROUPS.forEach(function (g, gi) {
              g.w.forEach(function (w, wi) {
                var el = document.createElement("div");
                el.className = "kw";
                el.id = ID + "-w" + gi + "-" + wi;
                el.setAttribute("data-layout-allow-overlap", "");
                el.textContent = w[0];
                var fs = SIZE;
                var ww = textWidth(w[0], fs);
                if (ww * KIN.popScale > SAFE.width) { fs = fs * SAFE.width / (ww * KIN.popScale); ww = textWidth(w[0], fs); }
                var hh = fs * 1.12;
                // Pad the box: canvas metrics run a few px narrower than painted text,
                // and a filtered layer is clipped to its box (thin slivers at the edge).
                var pad = Math.round(fs * 0.25);
                el.style.fontSize = fs + "px";
                el.style.width = Math.ceil(ww + pad * 2) + "px";
                el.style.textAlign = "center";
                layer.appendChild(el);
                var bw = ww * KIN.popScale, bh = hh * KIN.popScale;
                var s = w[1], hold = Math.max(KIN.minHold, w[2] - w[1] + 0.4);
                var winEnd = s + hold + KIN.exit;
                // Seeded candidates; keep the one overlapping the fewest visible words.
                var best = null;
                for (var c = 0; c < 8; c++) {
                  var cx = ${width} * (0.5 + (rnd() - 0.5) * 2 * KIN.spreadX);
                  var cy = ${height} * (0.5 + (rnd() - 0.5) * 2 * KIN.spreadY);
                  cx = Math.min(SAFE.left + SAFE.width - bw / 2, Math.max(SAFE.left + bw / 2, cx));
                  cy = Math.min(SAFE.bottom - bh / 2, Math.max(SAFE.top + bh / 2, cy));
                  var box = { l: cx - bw / 2, r: cx + bw / 2, t: cy - bh / 2, b: cy + bh / 2 };
                  var cost = 0;
                  placed.forEach(function (p) { if (p.end > s && p.start < winEnd) cost += overlap(box, p.box); });
                  if (!best || cost < best.cost) best = { cx: cx, cy: cy, box: box, cost: cost };
                  if (cost === 0) break;
                }
                placed.push({ box: best.box, start: s, end: winEnd });
                el.style.left = (best.cx - ww / 2 - pad) + "px";
                el.style.top = (best.cy - hh / 2) + "px";
                // Exit grows the word; cap the growth so it never leaves the canvas.
                var room = Math.min(best.cx, ${width} - best.cx) * 2 / ww;
                var exitScale = Math.max(KIN.popScale, Math.min(KIN.popScale * KIN.exitScale, room));
                var rot = (rnd() * 2 - 1) * KIN.maxRotateDeg;
                tl.fromTo(el, { opacity: 0, scale: 0, rotation: rot, filter: "blur(" + KIN.popBlur + "px)" },
                  { opacity: 1, scale: KIN.popScale, rotation: rot, filter: "blur(0px)", duration: KIN.popIn, ease: "power2.out", immediateRender: false }, s);
                // No filter while the word is held: an idle blur(0px) layer still clips.
                tl.set(el, { filter: "none" }, s + KIN.popIn);
                tl.fromTo(el, { filter: "blur(0px)" }, { opacity: 0, scale: exitScale, filter: "blur(" + KIN.exitBlur + "px)", duration: KIN.exit, ease: "power1.in", immediateRender: false }, s + hold);
              });
            });${tier ? `
          } else if (TIER) {
            // Two-tier: the clause's lead words small and light above (shown for the whole clause),
            // the rest in bold chunks below, one chunk at a time, each blurring in and out.
            var CH = MODE === "word" ? 1 : 2;
            var LEADF = TIER.leadScale || 0.55, BLUR = TIER.blur || 8;
            var LEADW = String(TIER.leadWeight || 400);
            function leadWidth(text, fs) {
              ctx.font = LEADW + " " + fs + "px '" + FONT + "', sans-serif";
              return ctx.measureText(UPPER ? text.toUpperCase() : text).width;
            }
            function blurIn(el, at, dur) {
              tl.fromTo(el, { opacity: 0, filter: "blur(" + BLUR + "px)", scale: 0.96 }, { opacity: 1, filter: "blur(0px)", scale: 1, duration: dur, ease: "power2.out", immediateRender: false }, at);
              // No filter while held: an idle blur(0px) layer still clips.
              tl.set(el, { filter: "none" }, at + dur);
            }
            function blurOut(el, at, dur) {
              tl.fromTo(el, { filter: "blur(0px)" }, { opacity: 0, filter: "blur(" + (BLUR * 0.75) + "px)", duration: dur, ease: "power1.in", immediateRender: false }, at);
            }
            GROUPS.forEach(function (g, gi) {
              var n = g.w.length;
              var lead = n <= 2 ? 0 : Math.min(3, Math.max(1, Math.round(n / 3)));
              var chunks = [], cur = [];
              for (var i = lead; i < n; i++) {
                cur.push(g.w[i]);
                if (cur.length >= CH || /[.,!?;:]$/.test(g.w[i][0]) || i === n - 1) { chunks.push(cur); cur = []; }
              }
              var words = function (c) { return c.map(function (w) { return w[0]; }).join(" "); };
              var fs = SIZE;
              chunks.forEach(function (c) { for (var k = 0; k < 20 && textWidth(words(c), fs) > SAFE.width * 0.92; k++) fs = fs * 0.94; });
              var lf = fs * LEADF;
              var leadText = words(g.w.slice(0, lead));
              for (var k2 = 0; lead && k2 < 20 && leadWidth(leadText, lf) > SAFE.width * 0.92; k2++) lf = lf * 0.94;
              var grp = document.createElement("div");
              grp.className = "grp";
              grp.id = ID + "-g" + gi;
              var col = document.createElement("div");
              col.className = "tier";
              var le = null;
              if (lead) {
                le = document.createElement("span");
                le.className = "lead";
                le.id = ID + "-g" + gi + "-lead";
                le.textContent = leadText;
                le.style.fontSize = lf.toFixed(1) + "px";
                col.appendChild(le);
              }
              var cw = document.createElement("div");
              cw.className = "cw";
              cw.style.height = (fs * 1.12).toFixed(1) + "px";
              var els = chunks.map(function (c, ci) {
                var el = document.createElement("span");
                el.className = "cur";
                el.id = ID + "-g" + gi + "-c" + ci;
                el.textContent = words(c);
                el.style.fontSize = fs.toFixed(1) + "px";
                cw.appendChild(el);
                return el;
              });
              col.appendChild(cw);
              grp.appendChild(col);
              layer.appendChild(grp);
              tl.set(grp, { opacity: 1 }, g.s);
              tl.set(grp, { opacity: 0 }, g.e);
              var IN = 0.18, OUT = 0.12;
              if (le) { blurIn(le, g.s, Math.min(IN, (g.e - g.s) * 0.3)); blurOut(le, Math.max(g.s + IN, g.e - OUT), Math.min(OUT, (g.e - g.s) * 0.2)); }
              els.forEach(function (el, ci) {
                var s = Math.max(g.s, chunks[ci][0][1]);
                var e = ci < els.length - 1 ? Math.max(s + 0.05, chunks[ci + 1][0][1]) : g.e;
                var inD = Math.min(IN, (e - s) * 0.4), outD = Math.min(OUT, (e - s) * 0.3);
                blurIn(el, s, inD);
                blurOut(el, Math.max(s + inD, e - outD), outD);
              });
            });` : ''}
          } else {
            GROUPS.forEach(function (g, gi) {
              var grp = document.createElement("div");
              grp.className = "grp";
              grp.id = ID + "-g" + gi;
              var box = document.createElement("div");
              box.className = "box";
              var text = g.w.map(function (w) { return w[0]; }).join(" ");
              // Fit: at most two lines inside the safe width (phrase mode wraps; word modes stay on one line).
              var fs = SIZE;
              var maxLines = MODE === "phrase" ? 2 : 1;
              // Leave room for the flash pop (scale 1 + FLASH_SCALE) so the peak stays in the safe box.
              for (var k = 0; k < 20 && boxWidth(text, fs) * (1 + FLASH_SCALE) > SAFE.width * maxLines * 0.92; k++) fs = fs * 0.94;
              box.style.fontSize = fs + "px";
              box.style.setProperty("--stroke", Math.max(2, Math.round(fs * 0.06)) + "px");
              if (maxLines === 1) box.style.whiteSpace = "nowrap";
              var spans = g.w.map(function (w, wi) {
                var sp = document.createElement("span");
                sp.id = ID + "-g" + gi + "-" + wi;
                sp.textContent = w[0];${em ? `
                if (isEmph(w[0])) sp.className = "em";` : ''}
                box.appendChild(sp);
                if (wi < g.w.length - 1) box.appendChild(document.createTextNode(" "));
                return sp;
              });
              grp.appendChild(box);
              layer.appendChild(grp);${style.enter === 'rise' ? `
              // Rise in, lift out (style-pack "rise" entrance); the group is hidden at its end.
              var inDur = Math.min(0.28, (g.e - g.s) * 0.35), outDur = Math.min(0.12, (g.e - g.s) * 0.2);
              tl.fromTo(grp, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: inDur, ease: "power3.out", immediateRender: false }, g.s);
              tl.to(grp, { opacity: 0, y: -8, duration: outDur, ease: "power2.in" }, g.e - outDur);
              tl.set(grp, { opacity: 0 }, g.e);` : style.enter === 'blur' ? `
              // Blur in, blur out (style-pack "blur" entrance); no filter while held.
              var inB = Math.min(0.2, (g.e - g.s) * 0.35), outB = Math.min(0.12, (g.e - g.s) * 0.2);
              tl.fromTo(grp, { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: inB, ease: "power2.out", immediateRender: false }, g.s);
              tl.set(grp, { filter: "none" }, g.s + inB);
              tl.fromTo(grp, { filter: "blur(0px)" }, { opacity: 0, filter: "blur(6px)", duration: outB, ease: "power1.in", immediateRender: false }, g.e - outB);
              tl.set(grp, { opacity: 0 }, g.e);` : `
              tl.set(grp, { opacity: 1 }, g.s);
              tl.set(grp, { opacity: 0 }, g.e);`}
              g.w.forEach(function (w, wi) {
                tl.fromTo(box, { "--flash": 1 }, { "--flash": 0, duration: FLASH_S, ease: "power3.out", immediateRender: false }, w[1]);
                if (ACTIVE && g.w.length > 1) {
                  tl.set(spans[wi], { color: ACTIVE }, w[1]);
                  tl.set(spans[wi], { color: ${em ? '""' : '"inherit"'} }, Math.min(g.e, wi < g.w.length - 1 ? g.w[wi + 1][1] : g.e));
                }
              });
            });
          }${rgbKeys ? `
          // RGB Highlight on the layer colour; text elements inherit it.
          tl.set(layer, { color: RGB[0] }, 0);
          for (var r = 1; r < RGB.length; r++) tl.to(layer, { color: RGB[r], duration: RGB_STEP, ease: "none" }, (r - 1) * RGB_STEP);` : ''}
          window.__timelines[ID] = tl;
        }

        // Load the exact face before measuring, then build and register.
        var spec = WEIGHT + " " + SIZE + "px '" + FONT + "'";
        if (document.fonts && document.fonts.load) document.fonts.load(spec).then(build, build);
        else build();
      })();`;

  // Compile the generated script now, so a quoting slip fails here and not in render.
  try {
    new vm.Script(script, { filename: `${id}.inline.js` });
  } catch (err) {
    throw new Error(`Generated caption script for ${id} does not parse: ${err.message}`);
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- Generated by tools/blocks/captions.mjs: style "${styleName}" (Adits preset), mode "${mode}". Regenerate instead of hand-editing. -->
  </head>
  <body>
    <template>
      <style>${css}
      </style>
      <div id="root" data-composition-id="${id}" data-width="${width}" data-height="${height}">
        <div id="${id}-layer"></div>
      </div>
      <script>${script}
      </script>
    </template>
  </body>
</html>
`;
}

// ── Job integration ─────────────────────────────────────────────────────────

function jobGeometry(jobDir) {
  const html = readFileSync(join(jobDir, 'index.html'), 'utf8');
  const tag = html.match(/<[a-z]+\b[^>]*data-composition-id[^>]*>/i)?.[0] || '';
  const num = (n) => Number(tag.match(new RegExp(`${n}="([^"]+)"`))?.[1]);
  const width = num('data-width') || 1080;
  const height = num('data-height') || 1920;
  const tpl = readJson(join(jobDir, 'template.json'), {});
  const sz = tpl.safeZones || {};
  const left = sz.textBox?.x ?? Math.round(width * 0.06);
  const right = sz.noTextRightFrom ?? width - Math.round(width / 6);
  const safe = {
    left,
    width: sz.textBox?.width ?? right - left,
    top: sz.headerClearTo ?? Math.round(height * 0.1),
    bottom: sz.noTextBottomFrom ?? Math.round(height * 0.8),
  };
  return { html, width, height, rootDuration: num('data-duration'), safe };
}

export function generateCaptions(opts) {
  const jobDir = resolve(opts.job);
  const styles = readJson(STYLES_FILE);
  const style = styles.styles[opts.style];
  if (!style) throw new Error(`Unknown style "${opts.style}". Styles: ${Object.keys(styles.styles).join(', ')}`);
  const mode = style.kinetic ? 'word' : (opts.mode || style.defaultMode || 'phrase');
  const words = loadWords(resolve(opts.words), opts.voice);
  if (!words.length) throw new Error('No words to caption.');
  const geo = jobGeometry(jobDir);
  ensureFonts(jobDir, style);
  const scale = geo.width / 1080;
  const defaults = { word: 120, '2word': 104, phrase: 78, ...(style.sizes || {}) };
  const size = Number(opts.size) || Math.round((style.kinetic ? 110 : defaults[mode] || 78) * scale);
  const positions = { captions: geo.height * 0.7, center: geo.height * 0.45, 'top-band': geo.height * 0.1667 };
  const centerY = Number(opts.y) || positions[opts.position || 'captions'];
  if (!centerY) throw new Error(`Unknown --position ${opts.position}`);
  if (!style.kinetic && centerY + size * 1.6 > geo.safe.bottom) {
    throw new Error(`Captions at y=${centerY} with size ${size}px would reach the bottom no-text zone (from y=${geo.safe.bottom}).`);
  }
  // Tier presets group whole clauses (the mode then sets the size of the rolling bold chunks).
  const groups = style.layout === 'tier'
    ? groupWords(words, 'phrase', { maxChars: 44, maxSeconds: 3.4, gap: 0.3, breakOn: /[.?!,;:]$/ })
    : groupWords(words, mode, { maxChars: Math.round(22 * (geo.width / 1080) * (78 / size) * 1.1) || 22 });
  const id = opts.id || `captions-${opts.style}`;
  const start = Number(opts.start || 0);
  const tail = style.kinetic ? (style.kinetic.exit + 0.4) : 0.1;
  const lastEnd = Math.max(...groups.map((g) => g.end), ...words.map((w) => +w.end + (style.kinetic ? Math.max(style.kinetic.minHold, 0) : 0)));
  const duration = +(lastEnd + tail).toFixed(3);
  const wantShadow = opts.shadow || opts['shadow-angle'] != null || opts['shadow-dist'] != null;
  const fx = textFx({
    hollow: opts.hollow, rgb: opts.rgb, negative: opts.negative,
    shadow: wantShadow ? { angle: opts['shadow-angle'] ?? 45, dist: opts['shadow-dist'] ?? 4 } : null,
  });
  if (fx.shadow) {
    const ang = Number(opts['shadow-angle'] ?? 45); const dist = Number(opts['shadow-dist'] ?? 4);
    if (!(ang >= 0 && ang <= 360) || !(dist >= 0 && dist <= 50)) throw new Error('--shadow-angle must be 0-360 and --shadow-dist 0-50 (the Adits ranges)');
  }
  const html = buildCaptionHtml({
    id, groups, style, styleName: opts.style, mode, width: geo.width, height: geo.height,
    centerY, size, safe: geo.safe, seed: opts.seed ?? 1, flash: styles.flash,
    emphasis: opts.emphasis ? String(opts.emphasis).split(',').map((w) => w.trim()).filter(Boolean) : [],
    fx, start, duration,
  });
  mkdirSync(join(jobDir, 'compositions'), { recursive: true });
  const out = join(jobDir, 'compositions', `${id}.html`);
  writeFileSync(out, html);

  // Negative FX blends on the host: an element inside it would only blend with the host's own
  // stacking context (the host gets a z-index), not with the footage under it.
  const blend = fx.negative ? ' style="mix-blend-mode: difference"' : '';
  const host = `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${start}" data-duration="${duration}" data-track-index="${opts.track || 30}" data-width="${geo.width}" data-height="${geo.height}"${blend}></div>`;
  const warnings = [];
  if (geo.rootDuration && start + duration > geo.rootDuration + 1e-3) {
    warnings.push(`Captions end at ${(start + duration).toFixed(2)} s, past the root duration ${geo.rootDuration} s; extend the root or trim the words.`);
  }
  if (opts.insert) {
    const html0 = geo.html;
    if (html0.includes(`data-composition-src="compositions/${id}.html"`)) {
      writeFileSync(join(jobDir, 'index.html'), html0.replace(new RegExp(`<div id="${id}"[^>]*data-composition-src="compositions/${id}\\.html"[^>]*></div>`), host));
    } else {
      const idx = html0.lastIndexOf('</div>', html0.lastIndexOf('<script>', html0.lastIndexOf('window.__timelines')));
      if (idx < 0) throw new Error('Could not find the root closing tag to insert the captions host. Insert it by hand.');
      writeFileSync(join(jobDir, 'index.html'), `${html0.slice(0, idx)}  ${host}\n    ${html0.slice(idx)}`);
    }
  }
  return { out, host, groups: groups.length, words: words.length, mode, size, centerY, duration, warnings, fx };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job || !a.words || !a.style) {
    console.error('Usage: captions.mjs --job <dir> --words <file> --style <name> [--voice id] [--mode word|2word|phrase] [--position captions|center|top-band] [--y px] [--size px] [--id x] [--start s] [--track n] [--seed n] [--emphasis "word,word"] [--hollow] [--rgb] [--negative] [--shadow] [--shadow-angle 0-360] [--shadow-dist 0-50] [--insert]');
    process.exit(2);
  }
  const res = generateCaptions({ ...a, insert: Boolean(a.insert) });
  console.log(`Wrote ${res.out}`);
  const on = ['hollow', 'rgb', 'negative', 'shadow'].filter((k) => res.fx[k]);
  if (on.length) console.log(`Text controls: ${on.join(', ')}${res.fx.shadow ? ` (shadow ${res.fx.shadow})` : ''}`);
  console.log(`${res.words} words in ${res.groups} groups, mode ${res.mode}, ${res.size}px at y=${Math.round(res.centerY)}, duration ${res.duration} s`);
  console.log(a.insert ? 'Host inserted into index.html' : `Host element:\n${res.host}`);
  for (const w of res.warnings) console.log(`WARNING: ${w}`);
}
