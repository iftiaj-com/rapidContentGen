// Quiet Editorial UI components for rcg style (tools/blocks/style.mjs).
// Each component returns { html, css, js } for one sub-composition. `js` runs inside
// build() with: tl (paused timeline), D (duration), $(name) -> element "<id>-<name>",
// fit(el, text, opts) (canvas-measured wrap + shrink), W, H. Deterministic throughout.
//
// Grammar (references/style-system.md in the skill): headline = one dominant sentence
// (label, then hero, then body); doc card = a document object; list = selection, with a
// cursor only when it causes the change; progress = a path with one success state;
// status = a compact confirmed / pending pill; window = quiet chrome around content.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const r1 = (n) => Math.round(n * 10) / 10;

function oneOf(v, list, what) {
  if (!list.includes(v)) throw new Error(`${what} must be one of ${list.join(', ')} (got "${v}")`);
  return v;
}

function font(ctx, role, extra = {}) {
  const f = ctx.type[role];
  return { family: f.family, weight: f.weight, ...extra };
}

const splitList = (s) => String(s).split('|').map((x) => x.trim()).filter(Boolean);

const SLOT_CSS = (sel, p, align = 'center') => `
      ${sel} {
        position: absolute;
        left: ${r1(p.x - p.w / 2)}px;
        top: ${r1(p.y - p.h / 2)}px;
        width: ${p.w}px;
        height: ${p.h}px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: ${align === 'left' ? 'flex-start' : 'center'};
      }`;

// Kicker: a short ink rule, then a tracked uppercase label.
const KICKER_CSS = (ctx) => `
      #${ctx.id}-layer .kicker {
        display: flex;
        align-items: center;
        gap: 16px;
        ${ctx.family('label')}
        font-size: 24px;
        line-height: 1.1;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--ink);
        white-space: nowrap;
      }
      #${ctx.id}-layer .rule { display: block; width: 42px; height: 2px; background: var(--ink); transform-origin: 0 50%; }`;

const CARD_CSS = `
        background: var(--active);
        border: 2px solid var(--border);
        border-radius: 22px;
        box-shadow: 0 16px 40px var(--shadow-soft);`;

/** Rise in from below; exits are short and decisive. */
const riseJs = (target, m, at = 0) => `
            tl.fromTo(${target}, { opacity: 0, y: ${m.rise} }, { opacity: 1, y: 0, duration: ${m.enter}, ease: "${m.enterEase}" }, ${at});`;
const exitJs = (target, m) => `
            tl.to(${target}, { opacity: 0, y: -12, duration: ${m.exit}, ease: "${m.exitEase}" }, Math.max(0.3, D - ${m.exit}));`;

// The pointer: crisp black with a white edge.
const CURSOR_SVG = (id) => `<svg id="${id}" width="56" height="56" viewBox="0 0 28 28"><path d="M5 3 L5 22 L10 17.5 L13.4 25 L16.6 23.6 L13.2 16.3 L20 16.3 Z" fill="#0d0d0d" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round" /></svg>`;

const CHECK = '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M6 12.5 L10.2 16.6 L18 8" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>';

export const components = {
  'canvas': {
    summary: 'The warm canvas for a full-frame beat. Add it first; one headline and one operational object go on it.',
    fullFrame: true,
    params: { enter: 'wipe', exit: 'cut' },
    render(p, ctx) {
      oneOf(p.enter, ['wipe', 'cut'], 'canvas: enter');
      oneOf(p.exit, ['wipe', 'cut'], 'canvas: exit');
      const css = `
      ${ctx.sel('canvas')} { position: absolute; inset: 0; background: var(--canvas); }`;
      const html = `
          <div id="${ctx.idf('canvas')}"></div>`;
      let js = '';
      if (p.enter === 'wipe') js += `
            tl.fromTo($("canvas"), { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.45, ease: "power3.inOut" }, 0);`;
      if (p.exit === 'wipe') js += `
            tl.to($("canvas"), { clipPath: "inset(0% 0% 100% 0%)", duration: 0.3, ease: "power2.in" }, Math.max(0.5, D - 0.3));`;
      return { html, css, js };
    },
  },

  'headline': {
    summary: 'The editorial headline: kicker (rule + label), a large serif line, optional body. *word* draws an ink underline (once per beat). surface=card puts it on a white card for busy footage.',
    params: { kicker: '', text: 'One clear idea', body: '', x: null, y: 560, w: 780, h: 520, size: 104, min: 56, align: 'left', surface: 'none', tone: 'ink' },
    prepare(p) { p.rotate = 0; },
    render(p, ctx) {
      oneOf(p.align, ['left', 'center'], 'headline: align');
      oneOf(p.surface, ['none', 'card'], 'headline: surface');
      oneOf(p.tone, ['ink', 'light'], 'headline: tone');
      const m = ctx.motion;
      const pad = p.surface === 'card' ? 44 : 0;
      const kickerH = p.kicker ? 24 + 30 : 0;
      const bodyH = p.body ? 34 * 1.42 * 3 + 24 : 0;
      const inner = p.w - pad * 2;
      const ink = p.tone === 'light' ? 'var(--active)' : 'var(--ink)';
      const css = `${SLOT_CSS(ctx.sel('slot'), p, p.align)}${KICKER_CSS(ctx)}
      ${ctx.sel('box')} {
        width: ${p.w}px;
        padding: ${pad}px;
        text-align: ${p.align};
        ${p.surface === 'card' ? CARD_CSS : ''}
      }
      ${ctx.sel('kicker')} { margin-bottom: 30px; ${p.align === 'center' ? 'justify-content: center;' : ''} ${p.tone === 'light' ? 'color: var(--active);' : ''} }
      ${p.tone === 'light' ? `${ctx.sel('kicker')} .rule { background: var(--active); }` : ''}
      ${ctx.sel('hero')} {
        display: block;
        ${ctx.family('display')}
        line-height: 0.98;
        letter-spacing: -0.035em;
        color: ${ink};
      }
      ${ctx.sel('hero')} .ln { overflow: hidden; padding-bottom: 0.08em; }
      ${ctx.sel('hero')} .em {
        background-image: linear-gradient(currentColor, currentColor);
        background-repeat: no-repeat;
        background-position: 0 92%;
        background-size: 0% 0.05em;
      }
      ${ctx.sel('body')} {
        display: block;
        margin-top: 24px;
        ${ctx.family('body')}
        line-height: 1.42;
        color: ${p.tone === 'light' ? 'var(--active)' : 'var(--muted)'};
      }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('box')}">${p.kicker ? `
              <div class="kicker" id="${ctx.idf('kicker')}"><i class="rule" id="${ctx.idf('rule')}"></i><span id="${ctx.idf('label')}">${ctx.esc(p.kicker)}</span></div>` : ''}
              <span id="${ctx.idf('hero')}"></span>${p.body ? `
              <span id="${ctx.idf('body')}"></span>` : ''}
            </div>
          </div>`;
      const js = `
            fit($("hero"), ${ctx.js(p.text)}, { font: ${ctx.js(font(ctx, 'display', { track: -0.035 }))}, size: ${p.size}, min: ${p.min}, maxW: ${inner}, maxH: ${p.h - pad * 2 - kickerH - bodyH}, lh: 0.98 });${p.body ? `
            fit($("body"), ${ctx.js(p.body)}, { font: ${ctx.js(font(ctx, 'body'))}, size: 34, min: 26, maxW: ${inner}, maxH: ${r1(34 * 1.42 * 3)}, maxLines: 3, lh: 1.42 });` : ''}${p.surface === 'card' ? riseJs('$("box")', m) : ''}${p.kicker ? `
            tl.fromTo($("rule"), { scaleX: 0 }, { scaleX: 1, duration: ${m.label}, ease: "power3.out" }, 0);
            tl.fromTo($("label"), { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: ${m.label}, ease: "power3.out" }, 0.05);` : ''}
            var rows = $("hero").querySelectorAll(".ln");
            for (var i = 0; i < rows.length; i++) {
              tl.fromTo(rows[i].querySelectorAll(".w"), { yPercent: 105, opacity: 0 }, { yPercent: 0, opacity: 1, duration: ${m.display}, ease: "${m.displayEase}" }, ${p.kicker ? 0.16 : 0} + i * 0.08);
            }
            var em = $("hero").querySelectorAll(".em");
            if (em.length) tl.to(em, { backgroundSize: "100% 0.05em", duration: 0.42, ease: "power2.inOut" }, ${p.kicker ? 0.75 : 0.6});${p.body ? `
            tl.fromTo($("body"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: ${m.enter}, ease: "${m.enterEase}" }, ${p.kicker ? 0.42 : 0.3});` : ''}${exitJs('$("box")', m)}`;
      return { html, css, js };
    },
  },

  'doc-card': {
    summary: 'A document object: label and meta, a serif title, a few lines, an optional status pill (tone=success only when it is really done). selected=true gives the ink edge.',
    sfx: (p) => (p.status && p.tone === 'success' ? [{ role: 'confirm', at: p.statusAt }] : []),
    params: { label: 'Draft', meta: '', title: 'Weekly plan', lines: 'Collect the notes|Pick one priority|Share by Friday', status: '', tone: 'neutral', statusAt: 1.1, selected: false, x: null, y: 820, w: 720, h: 600 },
    prepare(p) { p.rotate = 0; },
    render(p, ctx) {
      oneOf(p.tone, ['neutral', 'success'], 'doc-card: tone');
      const m = ctx.motion;
      const lines = splitList(p.lines);
      const pad = 44;
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}
      ${ctx.sel('card')} {
        width: ${p.w}px;
        max-height: ${p.h}px;
        padding: ${pad}px;
        ${CARD_CSS}
        ${p.selected ? 'border-color: var(--ink); box-shadow: 0 20px 46px var(--shadow-raised);' : ''}
      }
      ${ctx.sel('head')} {
        display: flex;
        justify-content: space-between;
        align-items: center;
        ${ctx.family('label')}
        font-size: 22px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--muted);
        white-space: nowrap;
      }
      ${ctx.sel('title')} {
        display: block;
        margin: 22px 0 18px;
        ${ctx.family('display')}
        line-height: 1.02;
        letter-spacing: -0.025em;
        color: var(--ink);
      }
      #${ctx.id}-layer .doc-row {
        display: block;
        padding: 16px 0;
        border-top: 2px solid var(--border);
        ${ctx.family('body')}
        font-size: 30px;
        line-height: 1.3;
        color: var(--ink);
        white-space: nowrap;
        overflow: hidden;
      }
      ${ctx.sel('foot')} { display: flex; justify-content: flex-end; margin-top: 22px; }
      ${ctx.sel('pill')} {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        padding: 12px 22px;
        border-radius: 999px;
        ${ctx.family('strong')}
        font-size: 26px;
        line-height: 1;
        ${p.tone === 'success' ? 'background: var(--success-deep); color: var(--active);' : 'background: var(--quiet); color: var(--ink); border: 2px solid var(--border);'}
      }
      ${ctx.sel('pill')} i { display: block; width: 24px; height: 24px; ${p.tone === 'success' ? '' : 'border-radius: 50%; background: var(--ink); width: 12px; height: 12px;'} }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('card')}">
              <div id="${ctx.idf('head')}"><span>${ctx.esc(p.label)}</span><span>${ctx.esc(p.meta)}</span></div>
              <span id="${ctx.idf('title')}"></span>${lines.map((l, i) => `
              <span class="doc-row" id="${ctx.idf(`row${i}`)}">${ctx.esc(l)}</span>`).join('')}${p.status ? `
              <div id="${ctx.idf('foot')}"><span id="${ctx.idf('pill')}"><i>${p.tone === 'success' ? CHECK : ''}</i>${ctx.esc(p.status)}</span></div>` : ''}
            </div>
          </div>`;
      const js = `
            fit($("title"), ${ctx.js(p.title)}, { font: ${ctx.js(font(ctx, 'display'))}, size: 64, min: 40, maxW: ${p.w - pad * 2}, maxH: 140, maxLines: 2, lh: 1.02 });${riseJs('$("card")', m)}${lines.map((_, i) => `
            tl.fromTo($("row${i}"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }, ${r1(0.25 + i * 0.07)});`).join('')}${p.status ? `
            tl.fromTo($("pill"), { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: ${m.select}, ease: "${m.selectEase}" }, ${p.statusAt});` : ''}${exitJs('$("card")', m)}`;
      return { html, css, js };
    },
  },

  'list': {
    summary: 'Selection: quiet rows; a cursor travels to one row and clicks it, the row becomes the active white card, and with done=true it confirms in green. cursor=false skips the pointer.',
    sfx: (p) => [{ role: 'select', at: p.selectAt }, ...(p.done ? [{ role: 'confirm', at: p.selectAt + 0.35 }] : [])],
    params: { label: '', items: 'Collected notes|Focused draft|Ready to review', select: 0, selectAt: 1.2, cursor: true, done: true, x: null, y: 860, w: 720, h: 560 },
    prepare(p) {
      p.rotate = 0;
      const n = splitList(p.items).length;
      if (!n) throw new Error('list: items is empty');
      if (!p.select) p.select = n;
      if (p.select < 1 || p.select > n) throw new Error(`list: select must be 1-${n}`);
    },
    render(p, ctx) {
      const m = ctx.motion;
      const items = splitList(p.items);
      const n = items.length;
      const labelH = p.label ? 60 : 0;
      const gap = 18;
      const rowH = Math.min(118, Math.floor((p.h - labelH - gap * (n - 1)) / n));
      if (rowH < 70) throw new Error(`list: ${n} rows need more height than h=${p.h}`);
      const k = p.select - 1;
      if (p.cursor && p.selectAt < m.cursor + 0.2) throw new Error(`list: selectAt must be at least ${m.cursor + 0.2} s so the cursor can travel`);
      // Row k's centre in slot coordinates (the stack is vertically centred in the slot).
      const stackH = labelH + n * rowH + (n - 1) * gap;
      const top = (p.h - stackH) / 2 + labelH;
      const target = { x: p.w * 0.72, y: top + k * (rowH + gap) + rowH * 0.55 };
      const t = ctx.tokens;
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}${KICKER_CSS(ctx)}
      ${ctx.sel('stack')} { width: ${p.w}px; }
      ${ctx.sel('kicker')} { height: ${labelH - 24}px; margin-bottom: 24px; }
      #${ctx.id}-layer .row {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: ${rowH}px;
        margin-top: ${gap}px;
        padding: 0 34px;
        background: var(--quiet);
        border: 2px solid var(--border);
        border-radius: 18px;
        ${ctx.family('strong')}
        font-size: 30px;
        color: var(--muted);
        white-space: nowrap;
      }
      #${ctx.id}-layer .row:first-of-type { margin-top: 0; }
      #${ctx.id}-layer .num { ${ctx.family('label')} font-size: 22px; letter-spacing: 0.12em; }
      #${ctx.id}-layer .ok {
        position: absolute;
        right: 30px;
        top: 50%;
        width: 44px;
        height: 44px;
        margin-top: -22px;
        padding: 6px;
        border-radius: 50%;
        background: var(--success-deep);
        opacity: 0;
      }
      ${ctx.sel('cursor')} { position: absolute; left: 0; top: 0; opacity: 0; }`;
      const rows = items.map((it, i) => `
              <div class="row" id="${ctx.idf(`r${i}`)}"><span>${ctx.esc(it)}</span><span class="num" id="${ctx.idf(`n${i}`)}">${String(i + 1).padStart(2, '0')}</span>${i === k && p.done ? `<i class="ok" id="${ctx.idf('ok')}">${CHECK}</i>` : ''}</div>`).join('');
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('stack')}">${p.label ? `
              <div class="kicker" id="${ctx.idf('kicker')}"><i class="rule"></i><span>${ctx.esc(p.label)}</span></div>` : ''}${rows}
            </div>
            ${p.cursor ? CURSOR_SVG(ctx.idf('cursor')) : ''}
          </div>`;
      const sel = p.selectAt;
      const js = `${items.map((_, i) => `
            tl.fromTo($("r${i}"), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.4, ease: "${m.enterEase}" }, ${r1(0.08 * i)});`).join('')}${p.cursor ? `
            tl.fromTo($("cursor"), { opacity: 0, x: ${r1(target.x + 220)}, y: ${r1(target.y + 300)} }, { opacity: 1, x: ${r1(target.x + 140)}, y: ${r1(target.y + 190)}, duration: 0.2, ease: "none" }, ${r1(sel - m.cursor - 0.2)});
            tl.to($("cursor"), { x: ${r1(target.x)}, y: ${r1(target.y)}, duration: ${m.cursor}, ease: "power2.inOut" }, ${r1(sel - m.cursor)});
            tl.to($("cursor"), { scale: 0.84, duration: 0.08, ease: "power2.out", transformOrigin: "10% 10%" }, ${sel});
            tl.to($("cursor"), { scale: 1, duration: 0.14, ease: "power2.out" }, ${r1(sel + 0.08)});
            tl.to($("cursor"), { opacity: 0, x: ${r1(target.x + 60)}, y: ${r1(target.y + 80)}, duration: 0.3, ease: "power2.in" }, ${r1(sel + 0.5)});` : ''}
            tl.to($("r${k}"), { backgroundColor: "${t.active}", borderColor: "${t.ink}", color: "${t.ink}", scale: 1.03, boxShadow: "0 18px 44px ${t['shadow-raised']}", duration: ${m.select}, ease: "${m.selectEase}" }, ${sel});${p.done ? `
            tl.to($("n${k}"), { opacity: 0, duration: 0.15 }, ${r1(sel + 0.3)});
            tl.fromTo($("ok"), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: ${m.select}, ease: "${m.selectEase}" }, ${r1(sel + 0.35)});` : ''}${exitJs('$("stack")', m)}`;
      return { html, css, js };
    },
  },

  'progress': {
    summary: 'A path of steps: an ink hairline with numbered nodes; each node fills as it is reached and the last one completes in green. steps="Plan|Draft|Ship", times="0.6,1.4,2.2".',
    sfx: (p, D, times) => [{ role: 'confirm', at: times[times.length - 1] + 0.1 }],
    params: { label: '', steps: 'Plan|Draft|Ship', times: '', x: null, y: 980, w: 760, h: 260 },
    prepare(p) { p.rotate = 0; },
    times(p, D) {
      const n = splitList(p.steps).length;
      if (p.times) {
        const t = String(p.times).split(',').map(Number);
        if (t.length !== n || t.some((x) => !Number.isFinite(x) || x < 0 || x > D)) throw new Error(`progress: times needs ${n} numbers inside 0-${D}`);
        return t;
      }
      const first = 0.6;
      const step = Math.min(1.2, Math.max(0.35, (D - 1.0 - first) / Math.max(1, n - 1)));
      return Array.from({ length: n }, (_, i) => r1(first + i * step));
    },
    render(p, ctx) {
      const m = ctx.motion;
      const steps = splitList(p.steps);
      const n = steps.length;
      if (n < 2) throw new Error('progress: needs at least 2 steps');
      const times = this.times(p, ctx.D);
      const node = 64;
      const span = p.w - node;
      const t = ctx.tokens;
      const labelH = p.label ? 60 : 0;
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}${KICKER_CSS(ctx)}
      ${ctx.sel('wrap')} { position: relative; width: ${p.w}px; }
      ${ctx.sel('kicker')} { margin-bottom: 36px; }
      ${ctx.sel('track')} { position: relative; height: ${node}px; }
      ${ctx.sel('rail')}, ${ctx.sel('fill')} {
        position: absolute;
        left: ${node / 2}px;
        top: ${node / 2 - 1}px;
        width: ${span}px;
        height: 2px;
        background: var(--border);
      }
      ${ctx.sel('fill')} { background: var(--ink); transform-origin: 0 50%; transform: scaleX(0); }
      #${ctx.id}-layer .node {
        position: absolute;
        top: 0;
        width: ${node}px;
        height: ${node}px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid var(--border);
        border-radius: 50%;
        background: var(--active);
        ${ctx.family('strong')}
        font-size: 24px;
        color: var(--muted);
      }
      #${ctx.id}-layer .node .ok { position: absolute; inset: 12px; opacity: 0; }
      #${ctx.id}-layer .step {
        position: absolute;
        top: ${node + 22}px;
        width: 240px;
        margin-left: -120px;
        text-align: center;
        ${ctx.family('label')}
        font-size: 24px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
        white-space: nowrap;
      }`;
      const xs = steps.map((_, i) => r1((span * i) / (n - 1)));
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('wrap')}">${p.label ? `
              <div class="kicker" id="${ctx.idf('kicker')}"><i class="rule"></i><span>${ctx.esc(p.label)}</span></div>` : ''}
              <div id="${ctx.idf('track')}">
                <i id="${ctx.idf('rail')}"></i><i id="${ctx.idf('fill')}"></i>${steps.map((s, i) => `
                <div class="node" id="${ctx.idf(`n${i}`)}" style="left: ${xs[i]}px;"><span id="${ctx.idf(`d${i}`)}">${i + 1}</span>${i === n - 1 ? `<i class="ok" id="${ctx.idf('ok')}">${CHECK}</i>` : ''}</div>
                <span class="step" id="${ctx.idf(`s${i}`)}" style="left: ${r1(xs[i] + node / 2)}px;">${ctx.esc(s)}</span>`).join('')}
              </div>
            </div>
          </div>`;
      const reach = steps.map((_, i) => {
        const last = i === n - 1;
        const fillTo = i === 0 ? '' : `
            tl.to($("fill"), { scaleX: ${r1(i / (n - 1) * 1000) / 1000}, duration: ${r1(Math.max(0.2, times[i] - times[i - 1]) * 0.8)}, ease: "power2.inOut" }, ${r1(times[i - 1] + 0.05)});`;
        return `${fillTo}
            tl.to($("n${i}"), { backgroundColor: "${last ? t['success-deep'] : t.ink}", borderColor: "${last ? t['success-deep'] : t.ink}", color: "${t.active}", scale: 1.08, duration: 0.24, ease: "${m.selectEase}" }, ${times[i]});
            tl.to($("n${i}"), { scale: 1, duration: 0.2, ease: "power2.out" }, ${r1(times[i] + 0.24)});
            tl.to($("s${i}"), { color: "${t.ink}", duration: 0.2 }, ${times[i]});${last ? `
            tl.to($("d${i}"), { opacity: 0, duration: 0.1 }, ${times[i]});
            tl.to($("ok"), { opacity: 1, duration: 0.18 }, ${r1(times[i] + 0.08)});` : ''}`;
      }).join('');
      const js = `${riseJs('$("wrap")', m)}${reach}${exitJs('$("wrap")', m)}`;
      return { html, css, js };
    },
  },

  'status': {
    summary: 'A compact status pill: tone=success (filled deep green with a check) only for a real completed / confirmed state, neutral otherwise.',
    sfx: (p) => (p.tone === 'success' ? [{ role: 'confirm', at: 0.1 }] : [{ role: 'pop', at: 0.1 }]),
    params: { text: 'Ready to review', tone: 'success', x: null, y: 1200, w: 520, h: 110 },
    prepare(p) { p.rotate = 0; },
    render(p, ctx) {
      oneOf(p.tone, ['neutral', 'success'], 'status: tone');
      const m = ctx.motion;
      const ok = p.tone === 'success';
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}
      ${ctx.sel('pill')} {
        display: inline-flex;
        align-items: center;
        gap: 16px;
        max-width: ${p.w}px;
        padding: 20px 34px;
        border-radius: 999px;
        ${ok ? 'background: var(--success-deep); color: var(--active);' : 'background: var(--active); color: var(--ink); border: 2px solid var(--border); box-shadow: 0 12px 30px var(--shadow-soft);'}
        white-space: nowrap;
      }
      ${ctx.sel('mark')} { display: block; flex: 0 0 auto; ${ok ? 'width: 34px; height: 34px;' : 'width: 14px; height: 14px; border-radius: 50%; background: var(--ink);'} }
      ${ctx.sel('text')} { display: block; ${ctx.family('strong')} line-height: 1.1; }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('pill')}"><i id="${ctx.idf('mark')}">${ok ? CHECK : ''}</i><span id="${ctx.idf('text')}"></span></div>
          </div>`;
      const js = `
            fit($("text"), ${ctx.js(p.text)}, { font: ${ctx.js(font(ctx, 'strong'))}, size: 34, min: 26, maxW: ${p.w - 120}, maxH: 44, maxLines: 1, lh: 1.1 });
            tl.fromTo($("pill"), { opacity: 0, scale: 0.82, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: ${m.select + 0.05}, ease: "${m.selectEase}" }, 0);${exitJs('$("pill")', m)}`;
      return { html, css, js };
    },
  },

  'window': {
    summary: 'Quiet app chrome around content: a toolbar with a centred label over either an image (src, e.g. a still from the footage) or lines that appear one by one.',
    params: { label: 'Notes', lines: 'Outline the idea|Cut it to one step|Ship the first version', src: '', x: null, y: 820, w: 760, h: 640 },
    prepare(p, { jobDir }) {
      p.rotate = 0;
      if (p.src && jobDir && !existsSync(join(jobDir, p.src))) throw new Error(`window: ${p.src} not found in the job`);
    },
    render(p, ctx) {
      const m = ctx.motion;
      const lines = p.src ? [] : splitList(p.lines);
      const bar = 64;
      const css = `${SLOT_CSS(ctx.sel('slot'), p)}
      ${ctx.sel('win')} {
        width: ${p.w}px;
        height: ${p.h}px;
        overflow: hidden;
        background: var(--active);
        border: 2px solid var(--border);
        border-radius: 26px;
        box-shadow: 0 18px 46px var(--shadow-soft);
      }
      ${ctx.sel('bar')} {
        height: ${bar}px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--quiet);
        border-bottom: 2px solid var(--border);
        ${ctx.family('label')}
        font-size: 22px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--muted);
      }
      ${ctx.sel('body')} { height: ${p.h - bar - 2}px; padding: ${p.src ? 0 : 40}px ${p.src ? 0 : 44}px; }
      ${ctx.sel('img')} { width: 100%; height: 100%; background: var(--quiet) url("${ctx.esc(p.src)}") center / cover no-repeat; }
      #${ctx.id}-layer .wl {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 18px 0;
        border-bottom: 2px solid var(--border);
        ${ctx.family('body')}
        font-size: 30px;
        line-height: 1.3;
        color: var(--ink);
        white-space: nowrap;
        overflow: hidden;
      }
      #${ctx.id}-layer .wl i { flex: 0 0 auto; width: 10px; height: 10px; border-radius: 50%; background: var(--ink); }`;
      const html = `
          <div id="${ctx.idf('slot')}">
            <div id="${ctx.idf('win')}">
              <div id="${ctx.idf('bar')}">${ctx.esc(p.label)}</div>
              <div id="${ctx.idf('body')}">${p.src ? `<div id="${ctx.idf('img')}"></div>` : lines.map((l, i) => `
                <div class="wl" id="${ctx.idf(`l${i}`)}"><i></i><span>${ctx.esc(l)}</span></div>`).join('')}
              </div>
            </div>
          </div>`;
      const step = lines.length ? Math.min(0.45, Math.max(0.2, (ctx.D - 1.2) / lines.length)) : 0;
      const js = `${riseJs('$("win")', m)}${lines.map((_, i) => `
            tl.fromTo($("l${i}"), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.3, ease: "power3.out" }, ${r1(0.45 + i * step)});`).join('')}${exitJs('$("win")', m)}`;
      return { html, css, js };
    },
  },
};
