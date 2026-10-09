// Marketing Pro components for rcg style (tools/blocks/style.mjs).
//
// hero: one keyword per sentence, upper third, usually behind the head (rcg layer --behind).
//   Looks by meaning (the planner, tools/recipes/marketing-pro.mjs, picks them):
//     serif-caps  purple serif caps, word by word (times = word starts, local seconds)
//     neon        pink-to-cyan gradient caps with a glow (numbers, stats)
//     strike      bold caps with a red line drawn through (negations)
//     focus       bold word pulled from blur into focus (contrast words)
//     italic      italic serif, *accent* words in colour, optional small lead line (emotion, closing)
//     wide        wide-tracked caps with a small lead line (default)
//     fill        heavy caps filled with an image or colour (reference Video-54041): fill = gradient
//                 (purple-pink), red (urgency), gold (CSS gold) or a job-relative image (a texture or a
//                 photo that matches the word); the fill drifts slowly while the word holds
//   Keyword clusters (any look): lead = small line above, tail = small bold words below
//   ("left|right" splits them around the head, gap = the gap in px), textAt / tailAt = local
//   seconds when the main word and each tail part come in (their spoken times).
//   tone: dark = dark text for light backgrounds, light = light text for dark ones. The planner
//   samples the background behind the hero box; the contrast audit measures every text node.
// tag: an outlined pill (Character, Integrity) with a marker ring, popping in near the subject.
// logo: an image (a supplied logo) popping in on a white chip.
// cta: a closing call to action on a dark pill with a link glyph.
// card: a rounded photo card (job-relative src) that flips in with a 3D tilt and floats.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const r1 = (n) => Math.round(n * 10) / 10;

function oneOf(v, list, what) {
  if (!list.includes(v)) throw new Error(`${what} must be one of ${list.join(', ')} (got "${v}")`);
  return v;
}

function font(ctx, role, extra = {}) {
  const f = ctx.type[role];
  if (!f) throw new Error(`unknown type role "${role}"`);
  return { family: f.family, weight: f.weight, ...extra };
}

const LOOKS = {
  'serif-caps': { role: 'serif', upper: true, track: 0.02, size: 150, lh: 1.0 },
  'neon': { role: 'sans', upper: true, track: 0.01, size: 140, lh: 1.0 },
  'strike': { role: 'sans', upper: true, track: 0.01, size: 124, lh: 1.05 },
  'focus': { role: 'ui', upper: true, track: 0.0, size: 156, lh: 1.0 },
  'italic': { role: 'italic', upper: false, track: -0.01, size: 132, lh: 1.05, em: 'italic-bold' },
  'wide': { role: 'sans-mid', upper: true, track: 0.18, size: 104, lh: 1.05 },
  'fill': { role: 'sans', upper: true, track: -0.01, size: 156, lh: 0.95 },
};

const FILLS = ['gradient', 'red', 'gold'];

/** CSS for a fill look: an image, the purple-pink gradient, gold or the urgency red. */
function fillCss(fill, esc) {
  if (fill === 'red') return 'color: var(--alert); text-shadow: 0 4px 18px rgba(0,0,0,0.35);';
  const bg = fill === 'gradient' ? 'linear-gradient(100deg, var(--grad-a) 0%, var(--grad-b) 50%, var(--grad-a) 100%) 0% 50% / 220% 100%'
    : fill === 'gold' ? 'linear-gradient(100deg, var(--gold-b) 0%, var(--gold-a) 35%, #fff3cf 50%, var(--gold-a) 65%, var(--gold-b) 100%) 0% 50% / 220% 100%'
      : `url("${esc(fill)}") 30% 50% / cover`;
  return `background: ${bg}; -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent;`;
}

/** Colours by tone: dark text (light background) or light text (dark background). */
function palette(tone, accent) {
  const dark = tone === 'dark';
  const acc = {
    purple: dark ? '#6a3fa3' : '#c6a6ff',
    teal: dark ? '#1d7487' : '#6fd6ea',
  }[accent] || accent;
  return {
    main: dark ? '#141414' : '#ffffff',
    caps: dark ? '#7f51b6' : '#c6a6ff',
    lead: dark ? '#2b2b2b' : 'rgba(255,255,255,0.92)',
    accent: acc,
    shadow: dark ? '0 2px 16px rgba(255,255,255,0.35)' : '0 3px 18px rgba(0,0,0,0.45)',
  };
}

const SLOT_CSS = (sel, p) => `
      ${sel} {
        position: absolute;
        left: ${r1(p.x - p.w / 2)}px; top: ${r1(p.y - p.h / 2)}px; width: ${p.w}px; height: ${p.h}px;
        display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
      }`;

export const components = {
  'hero': {
    summary: 'The hero keyword: look serif-caps | neon | strike | focus | italic | wide, tone dark|light (the planner samples the background), lead = small line above, *word* = accent, times = word starts for serif-caps.',
    sfx: (p) => [{ role: p.look === 'neon' ? 'stat' : 'hero', at: 0.05 }],
    params: { text: 'Keyword', lead: '', look: 'wide', tone: 'light', accent: 'purple', x: null, y: 360, w: 720, h: 300, size: 0, min: 56, times: '', exit: 'blur', fill: 'gradient', tail: '', gap: 0, textAt: 0, tailAt: '' },
    prepare(p, { jobDir } = {}) {
      p.rotate = 0;
      if (p.look === 'fill' && !FILLS.includes(p.fill) && jobDir && !existsSync(join(jobDir, p.fill))) throw new Error(`hero: fill image ${p.fill} not found in the job`);
    },
    render(p, ctx) {
      oneOf(p.look, Object.keys(LOOKS), 'hero: look');
      oneOf(p.tone, ['dark', 'light'], 'hero: tone');
      oneOf(p.exit, ['blur', 'cut'], 'hero: exit');
      const L = LOOKS[p.look];
      const c = palette(p.tone, p.accent);
      const size = p.size || L.size;
      const leadSize = Math.round(size * (p.look === 'italic' ? 0.5 : 0.34));
      const leadH = p.lead ? Math.round(leadSize * 1.25) + 6 : 0;
      const tailSize = Math.round(size * 0.34);
      const tailParts = String(p.tail || '').split('|').map((t) => t.trim()).filter(Boolean);
      const split = String(p.tail || '').includes('|') && tailParts.length === 2;
      const tailH = tailParts.length ? Math.round(tailSize * 1.25) + 6 : 0;
      const fillLook = p.look === 'fill';
      const T = Number(p.textAt) || 0;
      const tailAt = String(p.tailAt || '').split(',').map(Number).filter((n) => Number.isFinite(n));
      const m = ctx.motion;
      const mainColour = p.look === 'serif-caps' ? c.caps : c.main;
      const neon = p.look === 'neon';
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}
      ${ctx.sel('lead')} {
        display: block; margin-bottom: 6px; white-space: nowrap;
        ${p.look === 'italic' ? ctx.family('italic') : ctx.family('ui-light')}
        font-size: ${leadSize}px; line-height: 1.2; color: ${c.lead}; text-shadow: ${c.shadow};
      }
      ${ctx.sel('text')} {
        display: block; width: ${p.w}px;
        ${ctx.family(L.role)}
        line-height: ${L.lh}; letter-spacing: ${L.track}em;
        ${L.upper ? 'text-transform: uppercase;' : ''}
        ${neon
    ? `background: linear-gradient(90deg, var(--neon-a), var(--neon-b)); -webkit-background-clip: text; background-clip: text; color: transparent;
        -webkit-text-stroke: 0.035em rgba(48, 6, 58, 0.85); paint-order: stroke fill;`
    : fillLook ? fillCss(p.fill, ctx.esc) : `color: ${mainColour}; text-shadow: ${c.shadow};`}
      }${fillLook && p.fill !== 'red' ? `
      ${ctx.sel('textbox')} { filter: drop-shadow(0 4px 14px rgba(0,0,0,0.32)); }
      ${ctx.sel('text')} .ln, ${ctx.sel('text')} .w { background: inherit; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }` : ''}${tailParts.length ? `
      ${ctx.sel('tail')} {
        display: ${split ? 'grid' : 'block'}; width: ${p.w}px; margin-top: 4px; ${split ? `grid-template-columns: 1fr ${Math.round(p.gap)}px 1fr;` : 'text-align: center;'}
        ${ctx.family('ui')} font-size: ${tailSize}px; line-height: 1.2; color: ${c.main}; text-shadow: ${c.shadow}; white-space: nowrap;
      }
      ${ctx.sel('tail')} .tp { display: block; opacity: 0; }
      ${ctx.sel('tail')} .tp.l { text-align: right; }
      ${ctx.sel('tail')} .tp.r { text-align: left; grid-column: 3; }` : ''}
      ${ctx.sel('text')} .em { ${L.em ? ctx.family(L.em) : ''} color: ${c.accent}; }
      ${ctx.sel('glow')} {
        position: absolute; left: 0; right: 0; top: 0; bottom: 0; pointer-events: none;
        display: flex; align-items: center; justify-content: center;
      }
      ${ctx.sel('glowtext')} {
        display: block; width: ${p.w}px; color: var(--neon-glow);
        ${ctx.family(L.role)} line-height: ${L.lh}; letter-spacing: ${L.track}em; text-transform: uppercase;
        filter: blur(${r1(size * 0.16)}px); opacity: 0;
      }
      #${ctx.id}-layer .bar {
        position: absolute; left: -2%; width: 104%; height: 0.11em; top: 50%; margin-top: -0.05em;
        background: var(--strike); border-radius: 0.05em; transform-origin: 0 50%; transform: scaleX(0) rotate(-1.5deg);
      }
      #${ctx.id}-layer .ln { position: relative; }`;
      const html = `
          <div id="${ctx.idf('slot')}">${p.lead ? `
            <span id="${ctx.idf('lead')}">${ctx.esc(p.lead)}</span>` : ''}
            <div id="${ctx.idf('textbox')}" style="position: relative;">${neon ? `
              <div id="${ctx.idf('glow')}" data-layout-ignore><span id="${ctx.idf('glowtext')}"></span></div>` : ''}
              <span id="${ctx.idf('text')}"></span>
            </div>${tailParts.length ? `
            <div id="${ctx.idf('tail')}">${split
    ? `<span class="tp l">${ctx.esc(tailParts[0])}</span><span class="tp r">${ctx.esc(tailParts[1])}</span>`
    : `<span class="tp">${ctx.esc(tailParts[0])}</span>`}</div>` : ''}
          </div>`;
      const f = font(ctx, L.role, { upper: L.upper, track: L.track });
      const fitArgs = `{ font: ${ctx.js(f)}, em: ${ctx.js(L.em ? font(ctx, L.em, { track: L.track }) : f)}, size: ${size}, min: ${p.min}, maxW: ${r1(p.w * 0.96)}, maxH: ${r1(p.h - leadH - tailH)}, lh: ${L.lh} }`;
      const times = String(p.times || '').split(',').map(Number).filter((n) => Number.isFinite(n));
      let enter;
      switch (p.look) {
        case 'serif-caps':
          enter = `
            var ws = $("text").querySelectorAll(".w"), TIMES = ${ctx.js(times)};
            for (var i = 0; i < ws.length; i++) {
              var at = TIMES.length > i ? TIMES[i] : i * 0.14;
              tl.fromTo(ws[i], { opacity: 0, y: 24, scale: 1.08 }, { opacity: 1, y: 0, scale: 1, duration: 0.26, ease: "power3.out" }, at);
            }`;
          break;
        case 'neon':
          enter = `
            fit($("glowtext"), ${ctx.js(p.text.replace(/\*/g, ''))}, ${fitArgs});
            tl.fromTo($("text"), { opacity: 0, scale: 0.86 }, { opacity: 1, scale: 1, duration: ${m.pop}, ease: "${m.popEase}" }, T);
            tl.fromTo($("glowtext"), { opacity: 0 }, { opacity: 0.95, duration: 0.2, ease: "power1.out" }, T + 0.05);
            tl.to($("glowtext"), { opacity: 0.55, duration: 0.5, ease: "sine.inOut", repeat: Math.max(0, Math.floor((D - T - 0.8) / 0.5)), yoyo: true }, T + 0.3);`;
          break;
        case 'strike':
          enter = `
            var lines = $("text").querySelectorAll(".ln");
            tl.fromTo($("text"), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.28, ease: "power3.out" }, T);
            for (var j = 0; j < lines.length; j++) {
              var bar = document.createElement("i"); bar.className = "bar"; lines[j].appendChild(bar);
              tl.to(bar, { scaleX: 1, rotation: -1.5, duration: 0.3, ease: "power2.inOut" }, T + 0.32 + j * 0.12);
            }`;
          break;
        case 'focus':
          enter = `
            tl.fromTo($("text"), { opacity: 0, scale: 1.1, filter: "blur(${r1(size * 0.12)}px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.5, ease: "expo.out" }, T);
            tl.set($("text"), { filter: "none" }, T + 0.5);`;
          break;
        case 'italic':
          enter = `
            var iw = $("text").querySelectorAll(".w");
            for (var k = 0; k < iw.length; k++) tl.fromTo(iw[k], { opacity: 0, y: 16, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.34, ease: "power2.out" }, T + 0.08 + k * 0.08);
            for (var k2 = 0; k2 < iw.length; k2++) tl.set(iw[k2], { filter: "none" }, T + 0.45 + k2 * 0.08);`;
          break;
        case 'fill': {
          // Rise out of a blur, then the fill drifts across the letters while the word holds.
          const flat = ['gradient', 'gold'].includes(p.fill);
          enter = `
            tl.fromTo($("text"), { opacity: 0, y: 26, scale: 0.92, filter: "blur(10px)" }, { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.42, ease: "expo.out" }, T);
            tl.set($("text"), { filter: "none" }, T + 0.43);${p.fill === 'red' ? '' : `
            tl.fromTo($("text"), { backgroundPosition: "${flat ? '0% 50%' : '30% 50%'}" }, { backgroundPosition: "${flat ? '100% 50%' : '70% 50%'}", duration: Math.max(0.5, D - T), ease: "none" }, T);`}`;
          break;
        }
        default:
          enter = `
            // Spread in with a horizontal scale (transforms only: animating letter-spacing snaps to pixels).
            tl.fromTo($("text"), { opacity: 0, scaleX: 1.35, filter: "blur(6px)" }, { opacity: 1, scaleX: 1, filter: "blur(0px)", duration: 0.5, ease: "expo.out" }, T + 0.05);
            tl.set($("text"), { filter: "none" }, T + 0.56);`;
      }
      const js = `
            var T = ${T};
            fit($("text"), ${ctx.js(p.text)}, ${fitArgs});${p.lead ? `
            tl.fromTo($("lead"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" }, 0);` : ''}${enter}${tailParts.length ? `
            var tps = $("tail").querySelectorAll(".tp"), TAIL = ${ctx.js(tailAt)};
            for (var q = 0; q < tps.length; q++) tl.fromTo(tps[q], { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" }, TAIL.length > q ? TAIL[q] : T + 0.3 + q * 0.2);` : ''}${p.exit === 'blur' ? `
            tl.to($("slot"), { opacity: 0, filter: "blur(10px)", duration: ${m.exit}, ease: "${m.exitEase}" }, Math.max(0.3, D - ${m.exit}));` : ''}`;
      return { html, css, js };
    },
  },

  'tag': {
    summary: 'An outlined pill (a value, a feature) with an optional marker ring beside it, popping in near the subject.',
    sfx: { role: 'pop', at: 0.08 },
    params: { text: 'Integrity', x: null, y: 900, w: 360, h: 110, size: 38, ring: true, side: 'right' },
    prepare(p) { p.rotate = 0; },
    render(p, ctx) {
      oneOf(p.side, ['left', 'right'], 'tag: side');
      const m = ctx.motion;
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}
      ${ctx.sel('pill')} {
        position: relative; display: inline-flex; align-items: center; gap: 14px;
        padding: 14px 28px; border-radius: 999px; background: var(--pill); border: 3px solid var(--ring);
        color: #fff; ${ctx.family('ui')} font-size: ${p.size}px; line-height: 1; white-space: nowrap;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      }
      ${ctx.sel('ring')} {
        position: absolute; top: 50%; ${p.side}: -64px; width: 44px; height: 44px; margin-top: -22px;
        border-radius: 50%; border: 4px solid var(--ring); box-sizing: border-box;
      }`;
      const html = `
          <div id="${ctx.idf('slot')}"><div id="${ctx.idf('pill')}"><span id="${ctx.idf('text')}">${ctx.esc(p.text)}</span>${p.ring ? `<i id="${ctx.idf('ring')}"></i>` : ''}</div></div>`;
      const js = `
            tl.fromTo($("pill"), { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: ${m.pop}, ease: "${m.popEase}" }, 0);${p.ring ? `
            tl.fromTo($("ring"), { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, 0.15);` : ''}
            tl.to($("pill"), { opacity: 0, scale: 0.85, duration: ${m.exit}, ease: "${m.exitEase}" }, Math.max(0.4, D - ${m.exit}));`;
      return { html, css, js };
    },
  },

  'logo': {
    summary: 'A supplied logo image (src, job-relative) popping in on a white chip, floating gently.',
    sfx: { role: 'pop', at: 0.08 },
    params: { src: '', x: null, y: 900, w: 300, h: 120, chip: true },
    prepare(p, { jobDir }) {
      p.rotate = 0;
      if (!p.src) throw new Error('logo: --src is required (a job-relative image of an approved logo)');
      if (jobDir && !existsSync(join(jobDir, p.src))) throw new Error(`logo: ${p.src} not found in the job`);
    },
    render(p, ctx) {
      const m = ctx.motion;
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}
      ${ctx.sel('chip')} {
        width: 100%; height: 100%; padding: 14px 22px; box-sizing: border-box; border-radius: 22px;
        ${p.chip ? 'background: #fff; box-shadow: 0 10px 28px rgba(0,0,0,0.3);' : ''}
      }
      ${ctx.sel('img')} { width: 100%; height: 100%; background: url("${ctx.esc(p.src)}") center / contain no-repeat; }`;
      const html = `
          <div id="${ctx.idf('slot')}"><div id="${ctx.idf('chip')}"><div id="${ctx.idf('img')}"></div></div></div>`;
      const js = `
            tl.fromTo($("chip"), { opacity: 0, scale: 0.5, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: ${m.pop}, ease: "${m.popEase}" }, 0);
            tl.to($("chip"), { y: -8, duration: Math.max(0.5, D - 0.6), ease: "sine.inOut" }, ${m.pop});
            tl.to($("chip"), { opacity: 0, scale: 0.8, duration: ${m.exit}, ease: "${m.exitEase}" }, Math.max(0.4, D - ${m.exit}));`;
      return { html, css, js };
    },
  },

  'cta': {
    summary: 'A closing call to action on a dark pill with a link glyph ("Click the link in my bio").',
    sfx: { role: 'pop', at: 0.08 },
    params: { text: 'Click the link in my bio', x: null, y: 1380, w: 700, h: 120, size: 40 },
    prepare(p) { p.rotate = 0; },
    render(p, ctx) {
      const m = ctx.motion;
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}
      ${ctx.sel('pill')} {
        display: inline-flex; align-items: center; gap: 16px; padding: 18px 32px; border-radius: 999px;
        background: var(--pill); color: #fff; ${ctx.family('ui')} line-height: 1; white-space: nowrap;
        box-shadow: 0 10px 28px rgba(0,0,0,0.35);
      }
      ${ctx.sel('icon')} { width: 40px; height: 40px; flex: 0 0 auto; }
      ${ctx.sel('text')} { display: block; }`;
      const html = `
          <div id="${ctx.idf('slot')}"><div id="${ctx.idf('pill')}">
            <svg id="${ctx.idf('icon')}" viewBox="0 0 24 24"><path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <span id="${ctx.idf('text')}"></span>
          </div></div>`;
      const js = `
            fit($("text"), ${ctx.js(p.text)}, { font: ${ctx.js(font(ctx, 'ui'))}, size: ${p.size}, min: 26, maxW: ${r1(p.w - 140)}, maxH: ${p.h - 40}, maxLines: 1, lh: 1 });
            tl.fromTo($("pill"), { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: ${m.pop}, ease: "${m.popEase}" }, 0);
            tl.to($("pill"), { opacity: 0, duration: ${m.exit}, ease: "${m.exitEase}" }, Math.max(0.4, D - ${m.exit}));`;
      return { html, css, js };
    },
  },

  'card': {
    summary: 'A rounded photo card (src, job-relative: a photo of what the beat names) that flips in with a 3D tilt, floats, then flips out.',
    sfx: { role: 'card', at: 0.1 },
    params: { src: '', x: null, y: 700, w: 380, h: 460, radius: 30, tilt: -8, side: 'right' },
    prepare(p, { jobDir } = {}) {
      p.rotate = 0;
      if (!p.src) throw new Error('card: src is required (a job-relative photo)');
      if (jobDir && !existsSync(join(jobDir, p.src))) throw new Error(`card: ${p.src} not found in the job`);
    },
    render(p, ctx) {
      oneOf(p.side, ['left', 'right'], 'card: side');
      const m = ctx.motion;
      const sgn = p.side === 'left' ? -1 : 1; // the card turns toward the subject
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}
      ${ctx.sel('slot')} { perspective: 1400px; }
      ${ctx.sel('card')} {
        width: 100%; height: 100%; border-radius: ${p.radius}px; transform-origin: 50% 50%;
        background: url("${ctx.esc(p.src)}") center / cover no-repeat;
        box-shadow: 0 24px 50px rgba(0,0,0,0.45); opacity: 0;
      }`;
      const html = `
          <div id="${ctx.idf('slot')}"><div id="${ctx.idf('card')}"></div></div>`;
      const js = `
            tl.fromTo($("card"), { opacity: 0, rotationY: ${-75 * sgn}, rotationX: 12, scale: 0.72, y: 40 }, { opacity: 1, rotationY: ${p.tilt * sgn}, rotationX: 4, scale: 1, y: 0, duration: 0.6, ease: "expo.out" }, 0);
            tl.to($("card"), { rotationY: ${(p.tilt * 0.4) * sgn}, rotationX: 0, y: -12, duration: Math.max(0.5, D - 0.95), ease: "sine.inOut" }, 0.6);
            tl.to($("card"), { opacity: 0, rotationY: ${80 * sgn}, scale: 0.85, duration: 0.35, ease: "power2.in" }, Math.max(0.65, D - 0.35));`;
      return { html, css, js };
    },
  },
};
