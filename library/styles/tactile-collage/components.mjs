// Tactile Paper Collage components for rcg style (tools/blocks/style.mjs).
// Each component returns { html, css, js } for one sub-composition. `js` runs inside
// build() with: tl (paused timeline), D (duration), $(name) -> element "<id>-<name>",
// fit(el, text, opts) (canvas-measured wrap + shrink), W, H. Everything here is
// deterministic: tilts and wobbles come from the seeded ctx.rnd, path lengths are
// computed in Node.
//
// Grammar (references/style-system.md in the skill): paper card = one statement;
// stamp = verdict or status; checklist = ordered work; route = movement between
// states; file tag = an artifact passed along; scribble = emphasis, drawn once;
// taped photo = evidence; paper ground = the full-frame paper world.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const r1 = (n) => Math.round(n * 10) / 10;

function colour(ctx, v, what) {
  if (ctx.tokens[v]) return `var(--${v})`;
  if (/^(#|rgb|hsl)/.test(String(v))) return v;
  throw new Error(`${what}: unknown colour "${v}". Roles: ${Object.keys(ctx.tokens).join(', ')} or a CSS colour`);
}

/** A colour used for text or a stamp ring: the role's "-ink" shade when the pack has one (contrast). */
function textColour(ctx, v, what) {
  return ctx.tokens[`${v}-ink`] ? `var(--${v}-ink)` : colour(ctx, v, what);
}

function font(ctx, role, extra = {}) {
  const f = ctx.type[role];
  if (!f) throw new Error(`unknown type role "${role}". Roles: ${Object.keys(ctx.type).join(', ')}`);
  return { family: f.family, weight: f.weight, ...extra };
}

/** Seeded resting tilt in [-max, -1] or [1, max] degrees. */
function tilt(rnd, max) {
  const t = (rnd() * 2 - 1) * max;
  return r1(Math.sign(t || 1) * Math.max(1, Math.abs(t)));
}

function oneOf(v, list, what) {
  if (!list.includes(v)) throw new Error(`${what} must be one of ${list.join(', ')} (got "${v}")`);
  return v;
}

/** GSAP "from" vars for a placed object, relative to its resting tilt. */
function enterFrom(from, rot, settle) {
  switch (from) {
    case 'left': return `{ opacity: 0, x: -280, rotation: ${r1(rot - settle)} }`;
    case 'right': return `{ opacity: 0, x: 280, rotation: ${r1(rot + settle)} }`;
    case 'below': return `{ opacity: 0, y: 160, rotation: ${r1(rot + settle)} }`;
    default: return `{ opacity: 0, y: -26, scale: 1.1, rotation: ${r1(rot + settle)} }`; // drop: set down onto the page
  }
}

/** Exit with a reason: lifted off, or passed on in the direction it came from. */
function exitJs(target, from, m, mode) {
  if (mode === 'cut') return '';
  const to = from === 'left' ? 'x: 260' : from === 'right' ? 'x: -260' : 'y: -48';
  return `
            tl.to(${target}, { opacity: 0, ${to}, duration: ${m.exit}, ease: "${m.exitEase}" }, Math.max(0, D - ${m.exit}));`;
}

const SLOT_CSS = (sel, p) => `
      ${sel} {
        position: absolute;
        left: ${r1(p.x - p.w / 2)}px;
        top: ${r1(p.y - p.h / 2)}px;
        width: ${p.w}px;
        height: ${p.h}px;
        display: flex;
        align-items: center;
        justify-content: center;
      }`;

// Tape: a strip with torn ends, laid across a corner; the wrapper holds the angle.
const TAPE_CSS = (ctx) => `
      #${ctx.id}-layer .tape-at { position: absolute; width: 150px; height: 44px; }
      #${ctx.id}-layer .tape {
        display: block;
        width: 100%;
        height: 100%;
        background: color-mix(in srgb, var(--spark) 64%, transparent);
        clip-path: polygon(3% 0, 97% 0, 100% 18%, 96% 36%, 100% 54%, 96% 72%, 100% 90%, 97% 100%, 3% 100%, 0 82%, 4% 64%, 0 46%, 4% 28%, 0 10%);
        transform-origin: 0 50%;
      }`;
const tapeHtml = (ctx, n, style) => `
            <i class="tape-at" style="${style}"><b class="tape" id="${ctx.idf(`tape${n}`)}"></b></i>`;
const tapeJs = (ctx, n, at) => `
            tl.fromTo($("tape${n}"), { scaleX: 0 }, { scaleX: 1, duration: 0.18, ease: "power2.out" }, ${at});`;

// ── Polylines for drawn marks ───────────────────────────────────────────────

const pathD = (pts) => `M ${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L ')}`;
const pathLen = (pts) => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

function quad(a, c, b, n = 64) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return pts;
}

/** Hand-drawn strokes for a scribble, in the box's local pixels. */
function scribbleStrokes(shape, w, h, rnd) {
  const j = (a) => (rnd() * 2 - 1) * a;
  switch (shape) {
    case 'underline': {
      const line = (x0, x1, y0, amp) => Array.from({ length: 41 }, (_, i) => {
        const t = i / 40;
        return [x0 + (x1 - x0) * t, y0 + Math.sin(t * Math.PI * 2.2 + 0.6) * amp - t * h * 0.12];
      });
      return [line(0, w, h * 0.42, h * 0.07), line(w * 0.07, w * 0.9, h * 0.78, h * 0.05)];
    }
    case 'circle': {
      const a0 = -Math.PI * (0.55 + rnd() * 0.3);
      const turns = 1.12;
      return [Array.from({ length: 81 }, (_, i) => {
        const t = i / 80;
        const a = a0 + t * turns * Math.PI * 2;
        const k = 1 + j(0.025) - t * 0.07;
        return [w / 2 + Math.cos(a) * (w / 2) * k, h / 2 + Math.sin(a) * (h / 2) * k];
      })];
    }
    case 'arrow': {
      const a = [w * 0.04, h * 0.92];
      const b = [w * 0.94, h * 0.12];
      const c = [w * (0.3 + j(0.08)), h * (0.1 + j(0.06))];
      const body = quad(a, c, b, 48);
      const dx = b[0] - c[0];
      const dy = b[1] - c[1];
      const ang = Math.atan2(dy, dx);
      const L = Math.min(w, h) * 0.32;
      const head = (s) => [b, [b[0] - Math.cos(ang + s) * L, b[1] - Math.sin(ang + s) * L]];
      return [body, head(0.5), head(-0.5)];
    }
    case 'cross':
      return [[[w * 0.08, h * 0.1], [w * 0.92 + j(6), h * 0.9 + j(6)]], [[w * 0.9, h * 0.08], [w * 0.1 + j(6), h * 0.92 + j(6)]]];
    case 'box': {
      const o = 10;
      return [[[-o, j(4)], [w + o, j(4)], [w + j(4), h + o], [-o + j(4), h + j(4)], [j(3), -o]]];
    }
    default:
      throw new Error(`scribble: shape must be underline, circle, arrow, cross or box (got "${shape}")`);
  }
}

// ── Components ──────────────────────────────────────────────────────────────

export const components = {
  'paper-ground': {
    summary: 'Full-frame paper world for a full-frame beat: warm paper with dot, ruled or grid texture. Add it first so other pieces sit on it.',
    fullFrame: true,
    params: { texture: 'dots', tone: 'paper', enter: 'slide', exit: 'slide' },
    render(p, ctx) {
      oneOf(p.texture, ['dots', 'ruled', 'grid', 'plain'], 'paper-ground: texture');
      oneOf(p.enter, ['slide', 'cut'], 'paper-ground: enter');
      oneOf(p.exit, ['slide', 'cut'], 'paper-ground: exit');
      const tex = {
        dots: 'radial-gradient(circle, rgba(37,35,31,0.11) 1.7px, transparent 2.2px) 0 0 / 36px 36px, radial-gradient(circle, rgba(37,35,31,0.05) 1.2px, transparent 1.6px) 13px 7px / 23px 29px',
        ruled: 'linear-gradient(to right, transparent 118px, rgba(217,91,69,0.42) 118px, rgba(217,91,69,0.42) 121px, transparent 121px), repeating-linear-gradient(to bottom, transparent 0, transparent 69px, rgba(49,89,200,0.17) 69px, rgba(49,89,200,0.17) 72px)',
        grid: 'linear-gradient(rgba(49,89,200,0.11) 2px, transparent 2px) 0 0 / 60px 60px, linear-gradient(to right, rgba(49,89,200,0.11) 2px, transparent 2px) 0 0 / 60px 60px',
        plain: 'none',
      }[p.texture];
      const css = `
      ${ctx.sel('ground')} {
        position: absolute;
        inset: 0;
        background: ${tex === 'none' ? '' : `${tex}, `}${colour(ctx, p.tone, 'paper-ground: tone')};
        box-shadow: 0 -14px 0 var(--shadow);
      }`;
      const html = `
          <div id="${ctx.idf('ground')}"></div>`;
      let js = '';
      if (p.enter === 'slide') js += `
            tl.fromTo($("ground"), { y: H }, { y: 0, duration: 0.5, ease: "power3.out" }, 0);`;
      if (p.exit === 'slide') js += `
            tl.to($("ground"), { y: H, duration: 0.3, ease: "power2.in" }, Math.max(0.5, D - 0.3));`;
      return { html, css, js };
    },
  },

  'paper-card': {
    summary: 'One statement on a sheet: ink edge, offset shadow, optional marker kicker and tape. variant=note gives ruled notebook paper in marker. *word* = marker emphasis.',
    sfx: { role: 'place', at: 0.3 },
    params: { text: 'One clear idea', kicker: '', variant: 'card', x: null, y: 760, w: 720, h: 360, size: 76, min: 40, role: '', accent: 'signal', align: '', tape: true, rotate: null, from: 'drop', exit: 'out' },
    prepare(p, { rnd }) {
      if (p.rotate === null) p.rotate = tilt(rnd, p.variant === 'note' ? 4 : 3);
    },
    render(p, ctx) {
      oneOf(p.variant, ['card', 'note'], 'paper-card: variant');
      oneOf(p.from, ['drop', 'below', 'left', 'right'], 'paper-card: from');
      const note = p.variant === 'note';
      const role = p.role || (note ? 'marker' : 'display');
      const lh = role === 'marker' ? 1.2 : role === 'mono' ? 1.2 : 1.06;
      const align = p.align || (note ? 'left' : 'center');
      const m = ctx.motion;
      const padX = note ? 56 : 44;
      const padY = 36;
      const kickerSize = Math.round(p.size * 0.58);
      const kickerH = p.kicker ? Math.round(kickerSize * 1.25) + 8 : 0;
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}${TAPE_CSS(ctx)}
      ${ctx.sel('card')} {
        position: relative;
        width: ${p.w}px;
        max-height: ${p.h}px;
        padding: ${padY}px ${padX}px ${padY + 4}px ${padX}px;
        background-color: var(--sheet);
        border: 4px solid var(--ink);
        border-radius: 3px;
        box-shadow: ${note ? '6px 9px 0 var(--shadow)' : '9px 9px 0 var(--ink)'};
        color: var(--ink);
        text-align: ${align};
      }
      ${ctx.sel('kicker')} {
        display: block;
        margin-bottom: 8px;
        font-family: "${ctx.type.marker.family}";
        font-size: ${kickerSize}px;
        line-height: 1.25;
        color: ${textColour(ctx, p.accent, 'paper-card: accent')};
        transform: rotate(-2deg);
        white-space: nowrap;
      }
      ${ctx.sel('text')} {
        display: block;
        ${ctx.family(role)}
        line-height: ${lh};
        letter-spacing: ${role === 'display' ? '-0.01em' : '0'};
      }
      ${ctx.sel('text')} .em {
        font-family: "${ctx.type.marker.family}";
        font-weight: ${ctx.type.marker.weight};
        color: ${textColour(ctx, p.accent, 'paper-card: accent')};
      }`;
      const tapes = !p.tape ? '' : note
        ? tapeHtml(ctx, 0, `left: ${r1(p.w / 2 - 75)}px; top: -24px; transform: rotate(-4deg);`)
        : tapeHtml(ctx, 0, 'left: -46px; top: -6px; transform: rotate(-34deg);') + tapeHtml(ctx, 1, `left: ${p.w - 104}px; top: -6px; transform: rotate(34deg);`);
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('card')}">${p.kicker ? `
              <span id="${ctx.idf('kicker')}">${ctx.esc(p.kicker)}</span>` : ''}
              <span id="${ctx.idf('text')}"></span>${tapes}
            </div>
          </div>`;
      const ruled = note ? `
            var step = r.size * ${lh};
            $("card").style.backgroundImage = "linear-gradient(to right, transparent 30px, rgba(217,91,69,0.45) 30px, rgba(217,91,69,0.45) 33px, transparent 33px), repeating-linear-gradient(to bottom, transparent 0, transparent " + (step - 3).toFixed(1) + "px, rgba(49,89,200,0.2) " + (step - 3).toFixed(1) + "px, rgba(49,89,200,0.2) " + step.toFixed(1) + "px)";
            $("card").style.backgroundPosition = "0 0, 0 " + (${padY + kickerH} + 2) + "px";` : '';
      const js = `
            var r = fit($("text"), ${ctx.js(p.text)}, { font: ${ctx.js(font(ctx, role))}, em: ${ctx.js(font(ctx, 'marker'))}, size: ${p.size}, min: ${p.min}, maxW: ${p.w - padX * 2 - 8}, maxH: ${p.h - padY * 2 - 4 - kickerH}, lh: ${lh} });${ruled}
            tl.fromTo($("card"), ${enterFrom(p.from, p.rotate, m.settleDeg)}, { opacity: 1, x: 0, y: 0, scale: 1, rotation: ${p.rotate}, duration: ${m.enter}, ease: "${m.enterEase}" }, 0);${p.kicker ? `
            tl.fromTo($("kicker"), { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" }, ${r1(m.enter * 0.6)});` : ''}${p.tape ? tapeJs(ctx, 0, r1(m.enter * 0.75)) + (note ? '' : tapeJs(ctx, 1, r1(m.enter * 0.75 + 0.08))) : ''}${exitJs('$("card")', p.from, m, p.exit)}`;
      return { html, css, js };
    },
  },

  'stamp': {
    summary: 'A verdict, status or chapter change stamped down hard: double ink ring, tilted, back.out landing.',
    sfx: { role: 'stamp', at: 0.3 },
    params: { text: 'APPROVED', x: null, y: 700, w: 560, h: 220, size: 84, min: 40, colour: 'signal', fill: 'sheet', role: 'display', rotate: null, exit: 'out' },
    prepare(p, { rnd }) {
      if (p.rotate === null) p.rotate = tilt(rnd, 6);
    },
    render(p, ctx) {
      oneOf(p.fill, ['sheet', 'none'], 'stamp: fill');
      const c = textColour(ctx, p.colour, 'stamp: colour');
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}
      ${ctx.sel('stamp')} {
        position: relative;
        max-width: ${p.w}px;
        padding: 18px 34px 16px;
        border: 7px solid ${c};
        border-radius: 16px;
        background: ${p.fill === 'sheet' ? 'rgba(255, 250, 240, 0.9)' : 'transparent'};
        ${p.fill === 'none' ? 'mix-blend-mode: multiply;' : ''}
        color: ${c};
        text-align: center;
        text-transform: uppercase;
      }
      ${ctx.sel('stamp')}::after {
        content: "";
        position: absolute;
        inset: 7px;
        border: 3px solid ${c};
        border-radius: 9px;
      }
      ${ctx.sel('text')} {
        display: block;
        ${ctx.family(p.role)}
        line-height: 1.02;
        letter-spacing: 0.05em;
      }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('stamp')}"><span id="${ctx.idf('text')}"></span></div>
          </div>`;
      const m = ctx.motion;
      const js = `
            fit($("text"), ${ctx.js(p.text)}, { font: ${ctx.js(font(ctx, p.role, { upper: true, track: 0.05 }))}, size: ${p.size}, min: ${p.min}, maxW: ${p.w - 96}, maxH: ${p.h - 60}, maxLines: 2, lh: 1.02 });
            tl.fromTo($("stamp"), { opacity: 0, scale: 1.9, rotation: ${r1(p.rotate - 12)} }, { opacity: 1, scale: 1, rotation: ${p.rotate}, duration: ${m.pop}, ease: "${m.popEase}" }, 0);${p.exit === 'cut' ? '' : `
            tl.to($("stamp"), { opacity: 0, scale: 0.94, duration: 0.18, ease: "power2.in" }, Math.max(0, D - 0.18));`}`;
      return { html, css, js };
    },
  },

  'checklist': {
    summary: 'Ordered work: a sheet with a marker title and rows that appear and get checked in turn. items="a|b|c", times="1.2,2,2.8" (row appear times, default spread over the duration).',
    sfx: (p, D, times) => times.map((t) => ({ role: 'check', at: t + 0.4 })),
    params: { title: '', items: 'First step|Second step|Done', times: '', x: null, y: 820, w: 720, h: 560, size: 46, min: 28, accent: 'primary', rotate: null, from: 'drop', exit: 'out' },
    prepare(p, { rnd }) {
      if (p.rotate === null) p.rotate = tilt(rnd, 2.5);
    },
    times(p, D) {
      const n = String(p.items).split('|').filter((s) => s.trim()).length;
      if (p.times) {
        const t = String(p.times).split(',').map(Number);
        if (t.length !== n || t.some((x) => !Number.isFinite(x) || x < 0 || x > D)) throw new Error(`checklist: times needs ${n} numbers inside 0-${D}`);
        return t;
      }
      const first = 0.7;
      const step = Math.min(1.4, Math.max(0.35, (D - 1.4 - first) / Math.max(1, n)));
      return Array.from({ length: n }, (_, i) => r1(first + i * step));
    },
    render(p, ctx) {
      const items = String(p.items).split('|').map((s) => s.trim()).filter(Boolean);
      if (!items.length) throw new Error('checklist: items is empty');
      const times = this.times(p, ctx.D);
      const m = ctx.motion;
      const padX = 44;
      const padY = 36;
      const titleSize = Math.round(p.size * 1.35);
      const titleH = p.title ? Math.round(titleSize * 1.25) + 14 : 0;
      const gap = 16;
      const rowH = Math.floor((p.h - padY * 2 - titleH - gap * (items.length - 1)) / items.length);
      if (rowH < 56) throw new Error(`checklist: ${items.length} rows need more height than h=${p.h}`);
      const box = Math.min(50, rowH - 8);
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}
      ${ctx.sel('card')} {
        width: ${p.w}px;
        padding: ${padY}px ${padX}px;
        background: var(--sheet);
        border: 4px solid var(--ink);
        border-radius: 3px;
        box-shadow: 9px 9px 0 var(--ink);
        color: var(--ink);
      }
      ${ctx.sel('title')} {
        display: block;
        margin-bottom: 14px;
        font-family: "${ctx.type.marker.family}";
        font-size: ${titleSize}px;
        line-height: 1.25;
        color: ${textColour(ctx, p.accent, 'checklist: accent')};
        white-space: nowrap;
      }
      #${ctx.id}-layer .row {
        display: flex;
        align-items: center;
        gap: 22px;
        height: ${rowH}px;
        margin-top: ${gap}px;
      }
      #${ctx.id}-layer .row:first-of-type { margin-top: 0; }
      #${ctx.id}-layer .box {
        flex: 0 0 ${box}px;
        width: ${box}px;
        height: ${box}px;
        border: 4px solid var(--ink);
        border-radius: 4px;
        background: var(--sheet);
      }
      #${ctx.id}-layer .box svg { display: block; width: 100%; height: 100%; overflow: visible; }
      #${ctx.id}-layer .box path {
        fill: none;
        stroke: var(--resolve);
        stroke-width: 7;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 40;
        stroke-dashoffset: 40;
      }
      #${ctx.id}-layer .t {
        display: block;
        ${ctx.family('mono')}
        line-height: 1.15;
      }`;
      const rows = items.map((_, i) => `
              <div class="row" id="${ctx.idf(`r${i}`)}">
                <span class="box" id="${ctx.idf(`b${i}`)}"><svg viewBox="0 0 40 40"><path id="${ctx.idf(`c${i}`)}" d="M 8 21 L 17 30 L 33 10" /></svg></span>
                <span class="t" id="${ctx.idf(`t${i}`)}"></span>
              </div>`).join('');
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('card')}">${p.title ? `
              <span id="${ctx.idf('title')}">${ctx.esc(p.title)}</span>` : ''}${rows}
            </div>
          </div>`;
      const rowJs = items.map((it, i) => `
            fit($("t${i}"), ${ctx.js(it)}, { font: ${ctx.js(font(ctx, 'mono'))}, size: ${p.size}, min: ${p.min}, maxW: ${p.w - padX * 2 - box - 30}, maxH: ${rowH}, maxLines: 2, lh: 1.15 });
            tl.fromTo($("r${i}"), { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.3, ease: "power3.out" }, ${times[i]});
            tl.to($("c${i}"), { strokeDashoffset: 0, duration: 0.28, ease: "power2.out" }, ${r1(times[i] + 0.35)});
            tl.to($("b${i}"), { backgroundColor: "color-mix(in srgb, var(--resolve) 22%, var(--sheet))", duration: 0.2 }, ${r1(times[i] + 0.4)});`).join('');
      const js = `${rowJs}
            tl.fromTo($("card"), ${enterFrom(p.from, p.rotate, m.settleDeg)}, { opacity: 1, x: 0, y: 0, scale: 1, rotation: ${p.rotate}, duration: ${m.enter}, ease: "${m.enterEase}" }, 0);${exitJs('$("card")', p.from, m, p.exit)}`;
      return { html, css, js };
    },
  },

  'route': {
    summary: 'A dotted route drawn from (x1,y1) to (x2,y2): learning, transfer or a dependency. bend curves it; label puts a file tag at the end.',
    sfx: { role: 'draw', at: 0.1 },
    params: { x1: 220, y1: 1240, x2: 760, y2: 560, bend: 0.3, colour: 'ink', label: '', draw: 0.9, delay: 0, arrow: true },
    prepare(p) {
      // Box for the safe check: the route's bounds plus its label.
      const xs = [p.x1, p.x2];
      const ys = [p.y1, p.y2];
      if (p.label) { xs.push(p.x2 - 190, p.x2 + 190); ys.push(p.y2 - 150); }
      const pad = 24;
      p.x = (Math.min(...xs) + Math.max(...xs)) / 2;
      p.y = (Math.min(...ys) + Math.max(...ys)) / 2;
      p.w = Math.max(...xs) - Math.min(...xs) + pad * 2;
      p.h = Math.max(...ys) - Math.min(...ys) + pad * 2;
      p.rotate = 0;
    },
    render(p, ctx) {
      const a = [p.x1, p.y1];
      const b = [p.x2, p.y2];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (dist < 80) throw new Error('route: the end points are too close (under 80 px)');
      const nx = -(b[1] - a[1]) / dist;
      const ny = (b[0] - a[0]) / dist;
      const c = [mid[0] + nx * p.bend * dist * 0.5, mid[1] + ny * p.bend * dist * 0.5];
      const pts = quad(a, c, b);
      const len = Math.ceil(pathLen(pts)) + 2;
      const d = pathD(pts);
      const ang = Math.atan2(b[1] - c[1], b[0] - c[0]);
      const head = [[b[0] - Math.cos(ang + 0.55) * 38, b[1] - Math.sin(ang + 0.55) * 38], b, [b[0] - Math.cos(ang - 0.55) * 38, b[1] - Math.sin(ang - 0.55) * 38]];
      const col = colour(ctx, p.colour, 'route: colour');
      const end = r1(p.delay + p.draw);
      const css = `
      ${ctx.sel('svg')} { position: absolute; left: 0; top: 0; overflow: visible; }
      ${ctx.sel('tag')} {
        position: absolute;
        left: ${r1(p.x2 - 190)}px;
        top: ${r1(p.y2 - 150)}px;
        width: 380px;
        height: 96px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      ${ctx.sel('tagbox')} {
        padding: 12px 22px;
        background: var(--sheet);
        border: 4px solid var(--ink);
        border-radius: 4px;
        box-shadow: 6px 6px 0 var(--ink);
        color: var(--ink);
        text-transform: uppercase;
        white-space: nowrap;
      }
      ${ctx.sel('tagtext')} { display: block; ${ctx.family('mono')} line-height: 1.1; letter-spacing: 0.04em; }`;
      const html = `
          <svg id="${ctx.idf('svg')}" width="${ctx.W}" height="${ctx.H}" viewBox="0 0 ${ctx.W} ${ctx.H}" data-layout-allow-overflow>
            <defs>
              <mask id="${ctx.idf('mask')}" maskUnits="userSpaceOnUse" x="0" y="0" width="${ctx.W}" height="${ctx.H}">
                <path id="${ctx.idf('reveal')}" d="${d}" fill="none" stroke="#fff" stroke-width="30" stroke-linecap="round" style="stroke-dasharray: ${len}; stroke-dashoffset: ${len};" />
              </mask>
            </defs>
            <path d="${d}" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round" stroke-dasharray="0.1 23" mask="url(#${ctx.idf('mask')})" />${p.arrow ? `
            <path id="${ctx.idf('head')}" d="${pathD(head)}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />` : ''}
          </svg>${p.label ? `
          <div id="${ctx.idf('tag')}"><div id="${ctx.idf('tagbox')}"><span id="${ctx.idf('tagtext')}"></span></div></div>` : ''}`;
      const js = `
            tl.to($("reveal"), { strokeDashoffset: 0, duration: ${p.draw}, ease: "power1.inOut" }, ${p.delay});${p.arrow ? `
            tl.fromTo($("head"), { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none" }, ${r1(end - 0.08)});` : ''}${p.label ? `
            fit($("tagtext"), ${ctx.js(p.label)}, { font: ${ctx.js(font(ctx, 'mono', { upper: true, track: 0.04 }))}, size: 40, min: 26, maxW: 320, maxH: 60, maxLines: 1, lh: 1.1 });
            tl.fromTo($("tagbox"), { opacity: 0, scale: 0.6, rotation: -8 }, { opacity: 1, scale: 1, rotation: -2, duration: 0.34, ease: "back.out(1.4)" }, ${end});` : ''}
            tl.to($("svg"), { opacity: 0, duration: 0.2, ease: "power2.in" }, Math.max(${end}, D - 0.2));${p.label ? `
            tl.to($("tagbox"), { opacity: 0, y: -30, duration: 0.2, ease: "power2.in" }, Math.max(${end}, D - 0.2));` : ''}`;
      return { html, css, js };
    },
  },

  'file-tag': {
    summary: 'A named artifact (file, folder, deliverable) slid in on a tabbed tag: a handoff. from=left|right decides which way it travels and leaves.',
    sfx: { role: 'tag', at: 0.38 },
    params: { text: 'notes.txt', x: null, y: 600, w: 460, h: 130, size: 46, min: 28, colour: 'spark', from: 'left', rotate: null, exit: 'out' },
    prepare(p, { rnd }) {
      if (p.rotate === null) p.rotate = tilt(rnd, 3);
    },
    render(p, ctx) {
      oneOf(p.from, ['left', 'right', 'below', 'drop'], 'file-tag: from');
      const c = colour(ctx, p.colour, 'file-tag: colour');
      const m = ctx.motion;
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}
      ${ctx.sel('tag')} {
        position: relative;
        max-width: ${p.w}px;
        margin-top: 24px;
        padding: 16px 30px;
        background: ${c};
        border: 4px solid var(--ink);
        border-radius: 0 6px 6px 6px;
        box-shadow: 7px 7px 0 var(--ink);
        color: var(--ink);
        text-transform: uppercase;
        white-space: nowrap;
      }
      ${ctx.sel('tag')}::before {
        content: "";
        position: absolute;
        left: -4px;
        top: -30px;
        width: 150px;
        height: 30px;
        background: ${c};
        border: 4px solid var(--ink);
        border-bottom: none;
        border-radius: 10px 10px 0 0;
      }
      ${ctx.sel('text')} { display: block; ${ctx.family('mono')} line-height: 1.1; letter-spacing: 0.04em; }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('tag')}"><span id="${ctx.idf('text')}"></span></div>
          </div>`;
      const js = `
            fit($("text"), ${ctx.js(p.text)}, { font: ${ctx.js(font(ctx, 'mono', { upper: true, track: 0.04 }))}, size: ${p.size}, min: ${p.min}, maxW: ${p.w - 76}, maxH: ${p.h - 70}, maxLines: 1, lh: 1.1 });
            tl.fromTo($("tag"), ${enterFrom(p.from, p.rotate, 8)}, { opacity: 1, x: 0, y: 0, scale: 1, rotation: ${p.rotate}, duration: 0.45, ease: "${m.enterEase}" }, 0);${exitJs('$("tag")', p.from, m, p.exit)}`;
      return { html, css, js };
    },
  },

  'scribble': {
    summary: 'A hand-drawn mark drawn once over a box: underline, circle, arrow, cross or box. Emphasis or a relationship, never decoration.',
    sfx: null,
    params: { shape: 'underline', x: null, y: 900, w: 520, h: 90, colour: 'signal', width: 9, draw: 0.6, delay: 0, exit: 'out' },
    prepare(p) { p.rotate = 0; },
    render(p, ctx) {
      const strokes = scribbleStrokes(p.shape, p.w, p.h, ctx.rnd);
      const lens = strokes.map((s) => Math.ceil(pathLen(s)) + 2);
      const total = lens.reduce((a, b) => a + b, 0);
      const col = colour(ctx, p.colour, 'scribble: colour');
      const css = `
      ${ctx.sel('svg')} {
        position: absolute;
        left: ${r1(p.x - p.w / 2)}px;
        top: ${r1(p.y - p.h / 2)}px;
        overflow: visible;
      }`;
      const paths = strokes.map((s, i) => `
            <path id="${ctx.idf(`s${i}`)}" d="${pathD(s)}" fill="none" stroke="${col}" stroke-width="${p.width}" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray: ${lens[i]}; stroke-dashoffset: ${lens[i]};" />`).join('');
      const html = `
          <svg id="${ctx.idf('svg')}" width="${p.w}" height="${p.h}" viewBox="0 0 ${p.w} ${p.h}" data-layout-allow-overflow>${paths}
          </svg>`;
      let t = p.delay;
      const draws = strokes.map((_, i) => {
        const d = r1(Math.max(0.08, p.draw * lens[i] / total));
        const line = `
            tl.to($("s${i}"), { strokeDashoffset: 0, duration: ${d}, ease: "power1.inOut" }, ${r1(t)});`;
        t += d;
        return line;
      }).join('');
      const js = `${draws}${p.exit === 'cut' ? '' : `
            tl.to($("svg"), { opacity: 0, duration: 0.18, ease: "power2.in" }, Math.max(${r1(t)}, D - 0.18));`}`;
      return { html, css, js };
    },
  },

  'headline': {
    summary: 'A large display statement straight on the page or footage; words land in spoken order. *word* = marker emphasis in the accent colour; highlight=true lays a tape stroke under it (the word turns ink for contrast).',
    sfx: { role: 'place', at: 0.2 },
    params: { text: 'Make it *real*', x: null, y: 520, w: 800, h: 420, size: 116, min: 56, tone: 'ink', accent: 'signal', align: 'center', highlight: false, shadow: null },
    prepare(p) { p.rotate = 0; },
    render(p, ctx) {
      oneOf(p.align, ['center', 'left'], 'headline: align');
      const light = p.tone === 'sheet' || p.tone === 'paper';
      const shadow = p.shadow === null ? light : Boolean(p.shadow);
      const tilts = Array.from({ length: 48 }, () => r1((ctx.rnd() * 2 - 1) * 5));
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}
      ${ctx.sel('text')} {
        display: block;
        width: ${p.w}px;
        ${ctx.family('display')}
        line-height: 1.04;
        letter-spacing: -0.015em;
        color: ${textColour(ctx, p.tone, 'headline: tone')};
        text-align: ${p.align};
        ${shadow ? 'text-shadow: 5px 5px 0 rgba(37, 35, 31, 0.6);' : ''}
      }
      ${ctx.sel('text')} .em {
        font-family: "${ctx.type.marker.family}";
        font-weight: ${ctx.type.marker.weight};
        color: ${p.highlight ? 'var(--ink)' : textColour(ctx, p.accent, 'headline: accent')};
        ${p.highlight ? 'background: linear-gradient(transparent 58%, color-mix(in srgb, var(--spark) 72%, transparent) 58%, color-mix(in srgb, var(--spark) 72%, transparent) 92%, transparent 92%); padding: 0 0.08em;' : ''}
      }`;
      const html = `
          <div id="${ctx.idf('slot')}"><span id="${ctx.idf('text')}"></span></div>`;
      const js = `
            fit($("text"), ${ctx.js(p.text)}, { font: ${ctx.js(font(ctx, 'display'))}, em: ${ctx.js(font(ctx, 'marker'))}, size: ${p.size}, min: ${p.min}, maxW: ${p.w}, maxH: ${p.h}, lh: 1.04 });
            var words = $("text").querySelectorAll(".w"), TILT = ${ctx.js(tilts)};
            var gap = Math.min(0.09, 0.6 / Math.max(1, words.length));
            for (var i = 0; i < words.length; i++) {
              tl.fromTo(words[i], { opacity: 0, y: 42, rotation: TILT[i % TILT.length] }, { opacity: 1, y: 0, rotation: words[i].className.indexOf("em") >= 0 ? -3 : 0, duration: 0.42, ease: "power3.out" }, i * gap);
            }
            tl.to($("text"), { opacity: 0, y: -40, duration: 0.22, ease: "power2.in" }, Math.max(0.6, D - 0.22));`;
      return { html, css, js };
    },
  },

  'taped-photo': {
    summary: 'Evidence: an image (a still from the footage, a product shot) on a sheet with tape and an optional marker caption. src is a job-relative path.',
    sfx: { role: 'place', at: 0.3 },
    params: { src: '', caption: '', x: null, y: 760, w: 600, ratio: 0.8, rotate: null, from: 'drop', exit: 'out' },
    prepare(p, { rnd, jobDir }) {
      if (!p.src) throw new Error('taped-photo: --src is required (a job-relative image, e.g. assets/stills/s1.jpg)');
      if (jobDir && !existsSync(join(jobDir, p.src))) throw new Error(`taped-photo: ${p.src} not found in the job`);
      if (p.rotate === null) p.rotate = tilt(rnd, 4);
      const pad = 22;
      p.imgH = Math.round((p.w - pad * 2) / p.ratio);
      p.h = pad + p.imgH + (p.caption ? 96 : 30);
    },
    render(p, ctx) {
      const pad = 22;
      const m = ctx.motion;
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}${TAPE_CSS(ctx)}
      ${ctx.sel('photo')} {
        position: relative;
        width: ${p.w}px;
        height: ${p.h}px;
        padding: ${pad}px ${pad}px 0;
        background: var(--sheet);
        border: 4px solid var(--ink);
        border-radius: 3px;
        box-shadow: 9px 9px 0 var(--shadow);
      }
      ${ctx.sel('img')} {
        width: 100%;
        height: ${p.imgH}px;
        background: var(--paper) url("${ctx.esc(p.src)}") center / cover no-repeat;
        border: 3px solid var(--ink);
      }
      ${ctx.sel('cap')} {
        display: block;
        margin-top: 14px;
        text-align: center;
        font-family: "${ctx.type.marker.family}";
        line-height: 1.2;
        color: var(--ink);
        transform: rotate(-1.5deg);
      }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('photo')}">
              <div id="${ctx.idf('img')}"></div>${p.caption ? `
              <span id="${ctx.idf('cap')}"></span>` : ''}${tapeHtml(ctx, 0, 'left: -48px; top: -4px; transform: rotate(-36deg);')}${tapeHtml(ctx, 1, `left: ${p.w - 102}px; top: -4px; transform: rotate(36deg);`)}
            </div>
          </div>`;
      const js = `${p.caption ? `
            fit($("cap"), ${ctx.js(p.caption)}, { font: ${ctx.js(font(ctx, 'marker'))}, size: 52, min: 30, maxW: ${p.w - pad * 2}, maxH: 64, maxLines: 1, lh: 1.2 });` : ''}
            tl.fromTo($("photo"), ${enterFrom(p.from, p.rotate, m.settleDeg)}, { opacity: 1, x: 0, y: 0, scale: 1, rotation: ${p.rotate}, duration: ${m.enter}, ease: "${m.enterEase}" }, 0);${tapeJs(ctx, 0, r1(m.enter * 0.75))}${tapeJs(ctx, 1, r1(m.enter * 0.75 + 0.08))}${exitJs('$("photo")', p.from, m, p.exit)}`;
      return { html, css, js };
    },
  },
};
