// rcg split-screen layout: writes a job's index.html from data/split-plan.json (planned by
// tools/recipes/split-screen.mjs). It owns the base layer only; the build then adds cameras,
// titles, captions and transitions on top with the usual blocks. Re-running it rewrites
// index.html from the template head, so build always starts from here.
//
// Layers (z): B panel 1 | presenter panel 2 | seam fade + shade 3 | full-frame windows 5-8 |
// highlights 9 | titles and captions 40 | handle 60. Every video is a timed clip; panel wrappers are untimed. Geometry
// comes from library/split-screen/layout.json. Tracks: B panel 1, presenter 2, cut-out 3, presenter side fill 13, a-full 4,
// b-full 5, b-full blurred fill 6, band ground 7, band 8, seam 9, shade 10, handle 11,
// highlights 12, caption mask 14 (presenter.maskBelow), b-full black backing 15, a-full caption mask 16 (presenter.maskAfull), voice 22, sounds 40-47.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { readJson, ROOT } from '../lib/config.mjs';

const f2 = (n) => +Number(n).toFixed(2);
const f3 = (n) => +Number(n).toFixed(3);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Cover a box with a source, the focus point kept as central as the edges allow. */
export function coverPlace(bw, bh, boxW, boxH, focus = { x: 0.5, y: 0.45 }) {
  const k = Math.max(boxW / bw, boxH / bh);
  const dw = bw * k; const dh = bh * k;
  return { left: f2(clamp(boxW / 2 - focus.x * dw, boxW - dw, 0)), top: f2(clamp(boxH / 2 - focus.y * dh, boxH - dh, 0)), width: f2(dw), height: f2(dh) };
}

/** Contain a source in a box, centred. */
export function fitPlace(bw, bh, boxW, boxH) {
  const k = Math.min(boxW / bw, boxH / bh);
  const dw = bw * k; const dh = bh * k;
  return { left: f2((boxW - dw) / 2), top: f2((boxH - dh) / 2), width: f2(dw), height: f2(dh) };
}

const box = (p) => `left: ${p.left}px; top: ${p.top}px; width: ${p.width}px; height: ${p.height}px;`;
const timing = (s, e, mediaStart, track) => `data-start="${f3(s)}" data-duration="${f3(e - s)}"${mediaStart != null ? ` data-media-start="${f3(mediaStart)}"` : ''} data-track-index="${track}"`;

/**
 * A cover over burned-in captions: "blur" (a blurred, darkened band with a soft top edge) or "paper"
 * (an opaque strip of collage paper with a torn top edge, seeded so it is the same on every render).
 */
function captionCover(id, start, end, top, track, z, W, H, style = 'blur', seed = 1) {
  const t = `${timing(start, end, null, track)}`;
  const base = `position: absolute; left: 0; top: ${top}px; width: ${W}px; height: ${H - top}px; z-index: ${z};`;
  if (style !== 'paper') {
    return `<div id="${id}" class="clip" ${t} style="${base} backdrop-filter: blur(16px) brightness(0.62); -webkit-backdrop-filter: blur(16px) brightness(0.62); background: linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.55)); -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 46px); mask-image: linear-gradient(to bottom, transparent 0, #000 46px);"></div>`;
  }
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const pts = [];
  for (let x = 0; x <= W; x += 36) pts.push(`${Math.min(W, x)}px ${f2(6 + rnd() * 16)}px`);
  const poly = `polygon(0 100%, ${pts.join(', ')}, ${W}px 100%)`;
  return `<div id="${id}" class="clip" ${t} style="${base} filter: drop-shadow(0 -6px 6px rgba(37,35,31,0.28));"><div style="position: absolute; inset: 0; clip-path: ${poly}; background: radial-gradient(circle, rgba(37,35,31,0.11) 1.7px, transparent 2.2px) 0 0 / 36px 36px, #f3e8cc;"></div></div>`;
}

export function writeLayout(opts) {
  const jobDir = resolve(opts.job);
  const P = readJson(join(jobDir, 'data', 'split-plan.json'));
  const L = readJson(join(ROOT, P.layoutFile || 'library/split-screen/layout.json'));
  const S = L.seam; const B = L.bfull;
  const W = L.W; const H = L.H; const D = P.duration;
  const panelB = S.bBottom; const panelA = H - S.aTop;
  const pres = P.presenter;
  if (pres.darken && !existsSync(join(jobDir, pres.cutout))) throw new Error(`The plan darkens the presenter's background but ${pres.cutout} is missing: run rcg matte first (build does).`);
  const body = [];
  const tweens = [];
  let videos = 0;
  const vid = (id, src, s, e, ms, track, style, extra = '') => { videos++; return `<video id="${id}" class="clip" src="${src}" ${timing(s, e, ms, track)} muted playsinline style="position: absolute; ${style} object-fit: fill;"${extra}></video>`; };
  const kb = (sel, s, e, dir, k = B.kenBurns) => {
    if (!dir) return; // sync pieces carry their own motion
    const a = dir > 0 ? 1 : f3(1 + k); const b = dir > 0 ? f3(1 + k) : 1;
    tweens.push(`tl.fromTo("${sel}", { scale: ${a} }, { scale: ${b}, duration: ${f3(e - s)}, ease: "none" }, ${f3(s)});`);
  };

  // B panel (split windows).
  const bShots = [];
  const pShots = [];
  const seams = [];
  for (const w of P.windows.filter((x) => x.layout === 'split')) {
    w.shots.forEach((s, k) => bShots.push({ ...s, id: `${w.i}_${k + 1}` }));
    pShots.push(w);
    seams.push(w);
  }
  body.push(`      <!-- B panel: the info video, top, during split windows -->
      <div id="pB" style="position: absolute; left: 0; top: 0; width: ${W}px; height: ${panelB}px; overflow: hidden; z-index: 1;">`);
  for (const s of bShots) {
    const pl = coverPlace(s.w, s.h, W, panelB, s.focus);
    body.push(`        <div id="sb${s.id}" class="bshot" data-layout-allow-overflow style="position: absolute; left: 0; top: 0; width: ${W}px; height: ${panelB}px; transform-origin: ${f2(s.focus.x * 100)}% ${f2(s.focus.y * 100)}%;">
          ${vid(`vb${s.id}`, s.src, s.start, s.end, s.mediaStart, 1, box(pl))}
        </div>`);
    kb(`#sb${s.id}`, s.start, s.end, s.kb);
  }
  body.push('      </div>');

  // Presenter panel (split windows): a static face-safe crop per window.
  body.push(`      <!-- Presenter panel: bottom, static face-safe crop per split window -->
      <div id="pA" style="position: absolute; left: 0; top: ${S.aTop}px; width: ${W}px; height: ${panelA}px; overflow: hidden; z-index: 2;">`);
  for (const w of pShots) {
    const c = w.crop;
    const pl = { left: c.tx, top: f2(c.ty - S.aTop), width: f2(pres.width * c.s), height: f2(pres.height * c.s) };
    // A scaled-down crop (c.fill) stands on a blurred, darkened cover copy, its side edges feathered.
    const feather = c.fill ? ' -webkit-mask-image: linear-gradient(to right, transparent 0, #000 36px, #000 calc(100% - 36px), transparent 100%); mask-image: linear-gradient(to right, transparent 0, #000 36px, #000 calc(100% - 36px), transparent 100%);' : '';
    const fill = c.fill ? `${vid(`vpf${w.i}`, pres.src, w.start, w.end, w.start, 13, `${box(coverPlace(pres.width, pres.height, W, panelA, { x: 0.5, y: 0.3 }))} filter: ${B.fitBlur};`)}\n          ` : '';
    const base = vid(`vp${w.i}`, pres.src, w.start, w.end, w.start, 2, `${box(pl)}${pres.darken ? ` filter: ${L.presenter.darkenFilter};` : ''}${feather}`);
    const cut = pres.darken ? `\n          ${vid(`vpm${w.i}`, pres.cutout, w.start, w.end, w.start, 3, `${box(pl)}${feather}`)}` : '';
    body.push(`        <div id="sp${w.i}" class="pshot" style="position: absolute; left: 0; top: 0; width: ${W}px; height: ${panelA}px;">
          ${fill}${base}${cut}
        </div>`);
  }
  body.push('      </div>');

  // Burned-in captions in the presenter source (plan presenter.maskBelow, a fraction of the source
  // height): a blurred, darkened band from just above where those rows land, soft at its top edge.
  if (pres.maskBelow) {
    for (const w of pShots) {
      const top = Math.round(clamp(w.crop.ty + w.crop.s * pres.maskBelow * pres.height - 40, S.aTop, H - 20));
      body.push(`      ${captionCover(`mask${w.i}`, w.start, w.end, top, 14, 3, W, H, pres.maskStyle, w.i)}`);
    }
  }

  // Seam: the B panel fades to black; the presenter panel starts under a dark shade (the caption band).
  for (const w of seams) {
    body.push(`      <div id="seam${w.i}" class="clip" ${timing(w.start, w.end, null, 9)} style="position: absolute; left: 0; top: ${S.fadeFrom}px; width: ${W}px; height: ${S.bBottom - S.fadeFrom + 1}px; z-index: 3; background: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 55%, #000 100%);"></div>`);
    body.push(`      <div id="shade${w.i}" class="clip" ${timing(w.start, w.end, null, 10)} style="position: absolute; left: 0; top: ${S.aTop - 1}px; width: ${W}px; height: ${S.shadeTo - S.aTop + 1}px; z-index: 3; background: linear-gradient(to bottom, rgba(0,0,0,${S.shadeAlpha}) 0%, rgba(0,0,0,${f2(S.shadeAlpha * 0.6)}) 45%, rgba(0,0,0,0) 100%);"></div>`);
  }

  // Full-frame presenter windows (the camera block animates #wa<i>).
  for (const w of P.windows.filter((x) => x.layout === 'afull')) {
    videos++;
    body.push(`      <!-- A-full window ${w.i}: presenter full frame -->
      <div id="wa${w.i}" class="shot" style="z-index: 5;">
        <video id="va${w.i}" class="clip" src="${pres.src}" ${timing(w.start, w.end, w.start, 4)} muted playsinline></video>
      </div>`);
    // presenter.maskAfull: the output y where burned-in captions start in a full-frame window (set by
    // hand for the window's framing; the camera moves the source, so it cannot be derived here).
    if (pres.maskAfull) {
      const top = Math.round(clamp(pres.maskAfull, 0, H - 20));
      body.push(`      ${captionCover(`maska${w.i}`, w.start, w.end, top, 16, 6, W, H, pres.maskStyle, 100 + w.i)}`);
    }
  }

  // Full-frame B-roll windows: cover, fit over a blurred fill, or a white band card.
  for (const w of P.windows.filter((x) => x.layout === 'bfull')) {
    w.shots.forEach((s, k) => {
      const id = `${w.i}_${k + 1}`;
      if (s.treatment === 'band') {
        const bh = B.bandBottom - B.bandTop;
        const pl = fitPlace(s.w, s.h, W - 80, bh - 80);
        body.push(`      <!-- B-full ${id}: band card -->
      <div id="gr${id}" class="clip" ${timing(s.start, s.end, null, 7)} style="position: absolute; inset: 0; z-index: 5; background: ${B.groundColour};"></div>
      <div id="bd${id}" class="clip" ${timing(s.start, s.end, null, 8)} style="position: absolute; left: 0; top: ${B.bandTop}px; width: ${W}px; height: ${bh}px; z-index: 6; background: ${B.bandColour};"></div>
      <div id="bm${id}" class="fshot" style="position: absolute; left: 40px; top: ${B.bandTop + 40}px; width: ${W - 80}px; height: ${bh - 80}px; z-index: 7;">
        ${vid(`vf${id}`, s.src, s.start, s.end, s.mediaStart, 5, box(pl))}
      </div>`);
        tweens.push(`tl.fromTo("#bm${id}", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(1.6)" }, ${f3(s.start)});`);
        return;
      }
      const main = s.treatment === 'fit' ? fitPlace(s.w, s.h, W, H) : coverPlace(s.w, s.h, W, H, s.focus);
      const fill = s.treatment === 'fit'
        ? `\n          ${vid(`vf${id}b`, s.src, s.start, s.end, s.mediaStart, 6, `${box(coverPlace(s.w, s.h, W, H, s.focus))} filter: ${B.fitBlur};`)}`
        : '';
      // The black backing is a timed clip of its own: on the untimed wrapper it stayed on screen for
      // the whole edit and every later window's wrapper covered all the panels (black frames).
      body.push(`      <!-- B-full ${id}: ${s.treatment} -->
      <div id="bf${id}" class="clip" ${timing(s.start, s.end, null, 15)} style="position: absolute; inset: 0; z-index: 5; background: #000;"></div>
      <div id="wf${id}" class="fshot" style="position: absolute; inset: 0; z-index: 5; overflow: hidden;">
        <div id="kf${id}" data-layout-allow-overflow style="position: absolute; inset: 0; transform-origin: ${f2(s.focus.x * 100)}% ${f2(s.focus.y * 100)}%;">${fill}
          ${vid(`vf${id}`, s.src, s.start, s.end, s.mediaStart, 5, box(main))}
        </div>
      </div>`);
      kb(`#kf${id}`, s.start, s.end, s.kb);
    });
    // Manual highlights (boxes in output px, added to the plan by hand): a marker bar sweeping in.
    (w.highlights || []).forEach((h, k) => {
      const id = `hl${w.i}_${k + 1}`;
      body.push(`      <div id="${id}" class="clip" ${timing(h.at, h.at + (h.d || 1.5), null, 12)} style="position: absolute; left: ${h.x}px; top: ${h.y}px; width: ${h.w}px; height: ${h.h}px; z-index: 9; background: ${h.colour || 'rgba(255,214,0,0.5)'}; mix-blend-mode: multiply; transform-origin: 0 50%;"></div>`);
      tweens.push(`tl.fromTo("#${id}", { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "power2.out" }, ${f3(h.at)});`);
    });
  }

  // Channel handle for the first seconds (top left: the right 180 px belong to the app buttons).
  if (P.handle?.text) {
    const hd = L.handle;
    body.push(`      <div id="handle" class="clip" ${timing(0, Math.min(D, hd.seconds), null, 11)} style="position: absolute; left: ${hd.x}px; top: ${hd.y - hd.size}px; z-index: 60; font-family: 'Inter', sans-serif; font-weight: 800; font-size: ${hd.size}px; color: #fff;"><span style="display: inline-block; padding: 8px 18px; border-radius: 999px; background: rgba(0,0,0,0.62);">${esc(P.handle.text)}</span></div>`);
    tweens.push(`tl.fromTo("#handle > span", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, 0.1);`);
    tweens.push(`tl.to("#handle > span", { opacity: 0, duration: 0.25, ease: "power1.in" }, ${f3(Math.min(D, hd.seconds) - 0.3)});`);
  }

  // Voice and sounds (peak on the landing; first free lane 40-47).
  body.push(`      <audio id="voice" src="${pres.voice}" ${timing(0, D, null, 22)}></audio>`);
  const manifest = readJson(join(ROOT, 'library', 'sfx', 'manifest.json'));
  const lanes = [];
  for (const s of P.sfx || []) {
    const e = manifest[s.name];
    if (!e) throw new Error(`sfx "${s.name}" is not in library/sfx/manifest.json`);
    mkdirSync(join(jobDir, 'assets', 'sfx'), { recursive: true });
    if (!existsSync(join(jobDir, 'assets', 'sfx', e.file))) copyFileSync(join(ROOT, 'library', 'sfx', e.file), join(jobDir, 'assets', 'sfx', e.file));
    const at = f3(Math.max(0, s.landing - (e.peakS ?? e.crestStartS ?? 0)));
    const end = f3(Math.min(D, at + e.durationS));
    if (end - at < 0.05) continue;
    let track = 40;
    while (track < 47 && lanes.some((x) => x.track === track && x.s < end && at < x.e)) track++;
    lanes.push({ track, s: at, e: end });
    body.push(`      <audio id="${s.id}" src="assets/sfx/${e.file}" ${timing(at, end, null, track)} data-volume="${s.volume}"></audio>`);
  }

  // Sub-composition hosts the build will add (captions per window, titles, CTA): kept above the layout.
  const style = readJson(join(jobDir, 'data', 'style-plan.json'), { items: [] });
  const hostIds = [...P.windows.filter((w) => w.caption).map((w) => `cap-w${w.i}`), ...style.items.map((it) => it.id)];
  if (!hostIds.length) hostIds.push('no-hosts');

  // The document: the template head plus this block's CSS.
  const tpl = readFileSync(join(ROOT, 'templates', 'vertical-1080x1920', 'index.html'), 'utf8');
  const head = tpl.slice(0, tpl.indexOf('  <body>')).replace('  </head>', `    <style data-rcg="split">
      /* rcg split-screen layout (tools/blocks/split.mjs). Panel media carry inline geometry. */
      .bshot video, .pshot video, .fshot video { position: absolute; }
      /* Titles and captions above the panels, seam and full-frame windows (id rules: HyperFrames
         mounts the hosts, so an attribute selector does not hold). */
      ${hostIds.map((h) => `#${h}`).join(', ')} { z-index: 40; }
    </style>
  </head>`);
  const html = `${head}  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="${W}" data-height="${H}">
${body.join('\n')}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      // rcg:split begin (Ken Burns on B-roll, card entrances, handle, highlights)
      ${tweens.join('\n      ')}
      // rcg:split end
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
  writeFileSync(join(jobDir, 'index.html'), html);
  return { windows: P.windows.length, videos, sfx: lanes.length, darken: pres.darken };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job) { console.error('Usage: split.mjs --job <dir>'); process.exit(2); }
  const r = writeLayout(a);
  console.log(`index.html written: ${r.windows} windows, ${r.videos} video clips, ${r.sfx} sound(s)`);
}
