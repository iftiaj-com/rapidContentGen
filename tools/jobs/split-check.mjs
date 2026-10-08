// rcg split-screen check: geometric checks of a split-screen job (skill-split-screen-edit),
// from data/split-plan.json, the face track and index.html. Run by the build before hf check.
//
// Fails on: layout windows with gaps, overlaps or under the minimum length; B-roll pieces that
// do not fill their window or read past the end of their clip; a presenter crop that leaves the
// panel uncovered or lets the head box (hair and chin included) leave the visible panel on more
// than presenter.maxOut of a window's frames; an a-full title box over the face (simulated
// face camera); a planned camera, caption or voice missing from index.html.
//
//   node tools/jobs/split-check.mjs --job <dir>     (or: rcg split-screen check --job <dir>)

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { readJson, ROOT } from '../lib/config.mjs';
import { parseFaceCue } from '../blocks/camera.mjs';
import { simulator } from '../recipes/marketing-pro.mjs';
import { faceFrame, faceOverrun } from '../recipes/split-screen.mjs';

const f2 = (n) => +Number(n).toFixed(2);
const f3 = (n) => +Number(n).toFixed(3);

export function checkSplit(opts) {
  const jobDir = resolve(opts.job);
  const P = readJson(join(jobDir, 'data', 'split-plan.json'));
  const L = readJson(join(ROOT, P.layoutFile || 'library/split-screen/layout.json'));
  const S = L.seam; const PR = L.presenter; const PC = L.pacing;
  const W = L.W; const H = L.H; const D = P.duration;
  const errors = []; const lines = [];
  const pres = P.presenter;
  const track = readJson(join(jobDir, pres.track));
  const broll = readJson(join(jobDir, 'data', 'broll.json'), { clips: [] }); // sync mode has none
  const clipDur = Object.fromEntries(broll.clips.map((c) => [c.src, c.duration]));
  const ws = P.windows;

  // 1. Windows.
  if (Math.abs(ws[0].start) > 1e-3) errors.push(`the first window starts at ${ws[0].start} s, not 0`);
  if (Math.abs(ws[ws.length - 1].end - D) > 1e-3) errors.push(`the last window ends at ${ws[ws.length - 1].end} s, not ${D}`);
  ws.forEach((w, i) => {
    if (i && Math.abs(w.start - ws[i - 1].end) > 1e-3) errors.push(`w${w.i} starts at ${w.start} s but w${ws[i - 1].i} ends at ${ws[i - 1].end} s`);
    if (w.end - w.start < PC.minWindow - 1e-3) errors.push(`w${w.i} is ${f2(w.end - w.start)} s (minimum ${PC.minWindow})`);
    const max = { afull: PC.afullMax, bfull: PC.bfullMax }[w.layout];
    if (max && w.end - w.start > max + 0.05) lines.push(`note: w${w.i} ${w.layout} runs ${f2(w.end - w.start)} s (cap ${max})`);
  });

  // 2. B-roll pieces.
  for (const w of ws.filter((x) => x.shots)) {
    let at = w.start;
    for (const s of w.shots) {
      if (Math.abs(s.start - at) > 2e-3) errors.push(`w${w.i}: B piece ${s.shot} starts at ${s.start} s, expected ${f3(at)} (gap or overlap)`);
      if (s.end - s.start < 0.25) errors.push(`w${w.i}: B piece ${s.shot} is only ${f2(s.end - s.start)} s`);
      const cd = clipDur[s.src];
      if (cd != null && s.mediaStart + (s.end - s.start) > cd + 0.05) errors.push(`w${w.i}: B piece ${s.shot} reads to ${f2(s.mediaStart + s.end - s.start)} s of a ${cd} s clip`);
      at = s.end;
    }
    if (Math.abs(at - w.end) > 2e-3) errors.push(`w${w.i}: B pieces end at ${f3(at)} s, the window at ${w.end} s`);
  }

  // 3. Presenter crop: panel covered (or a side fill behind), face inside the visible panel.
  for (const w of ws.filter((x) => x.layout === 'split')) {
    const c = w.crop;
    const widthOk = c.fill ? c.tx >= -0.5 && c.tx + pres.width * c.s <= W + 0.5 : c.tx <= 0.5 && c.tx + pres.width * c.s >= W - 0.5;
    // A plan made with --drop may leave a strip at the panel top, no deeper than the seam shade.
    const gap = pres.drop ? Math.min(pres.drop, S.shadeTo - S.aTop) : 0;
    if (!widthOk || c.ty > S.aTop + gap + 0.5 || c.ty + pres.height * c.s < H - 0.5) errors.push(`w${w.i}: the presenter crop leaves part of the panel empty`);
    const fps = track.fps;
    const i0 = Math.max(0, Math.floor((w.start - (track.start || 0)) * fps));
    const i1 = Math.min(track.face.cx.length, Math.ceil((w.end - (track.start || 0)) * fps));
    let n = 0; let out = 0; let worst = 0;
    for (let i = i0; i < i1; i++) {
      const f = faceFrame(track, i, pres.width, pres.height, PR);
      if (!f) continue;
      const over = faceOverrun(f, c, L);
      n++;
      if (over > 2) out++;
      worst = Math.max(worst, over);
    }
    const share = n ? out / n : 0;
    lines.push(`w${w.i} split ${w.start}-${w.end}: face inside the panel on ${n - out}/${n} frames (worst overrun ${Math.round(worst)} px), face ${c.faceH} px${c.fill ? ', scaled with a side fill' : ''}`);
    if (share > PR.maxOut) errors.push(`w${w.i}: the head leaves the presenter panel on ${(share * 100).toFixed(0)}% of frames (max ${PR.maxOut * 100}%)`);
  }

  // 4. A-full titles off the face.
  const style = readJson(join(jobDir, 'data', 'style-plan.json'), { items: [] });
  for (const w of ws.filter((x) => x.layout === 'afull')) {
    const cues = w.cues.map(parseFaceCue).sort((a, b) => a.at - b.at);
    const sim = simulator(track, cues, { W, H });
    for (const it of style.items.filter((x) => x.component === 'hero' && x.start >= w.start - 1e-3 && x.start < w.end - 1e-3)) {
      let hit = 0;
      for (let t = it.start; t < it.start + it.duration; t += 0.1) {
        const f = sim.at(t).face;
        const fb = { l: f.x - f.w / 2, r: f.x + f.w / 2, t: f.y - f.h / 2, b: f.y + f.h / 2 };
        const tb = { l: it.x - it.w / 2, r: it.x + it.w / 2, t: it.y - it.h / 2, b: it.y + it.h / 2 };
        if (Math.min(fb.r, tb.r) > Math.max(fb.l, tb.l) && Math.min(fb.b, tb.b) > Math.max(fb.t, tb.t)) hit++;
      }
      if (hit) errors.push(`${it.id}: the title box covers the face on ${hit} sample(s)`);
    }
  }

  // 5. Build completeness (only once index.html carries the split layout).
  const indexFile = join(jobDir, 'index.html');
  const html = existsSync(indexFile) ? readFileSync(indexFile, 'utf8') : '';
  if (html.includes('rcg:split begin')) {
    if (!new RegExp(`<audio id="voice"[^>]*data-duration="${D}"`).test(html)) errors.push('the voice clip is missing or does not span the edit');
    for (const w of ws) {
      if (w.layout === 'afull' && !html.includes(`rcg:camera cam-wa${w.i} begin`)) errors.push(`w${w.i}: no camera on #wa${w.i}`);
      if (w.caption && !html.includes(`compositions/cap-w${w.i}.html`)) errors.push(`w${w.i}: caption block cap-w${w.i} is not in index.html`);
      const capDur = Number(html.match(new RegExp(`<div id="cap-w${w.i}"[^>]*data-duration="([0-9.]+)"`))?.[1]);
      if (w.caption && capDur > w.end - w.start + 1e-3) errors.push(`w${w.i}: captions run ${f2(capDur)} s, past the window (${f2(w.end - w.start)} s): run split-screen clamp`);
    }
    for (const it of style.items) if (!html.includes(`compositions/${it.id}.html`)) errors.push(`${it.id} is not in index.html`);
  } else lines.push('note: index.html does not carry the split layout yet (run layout / build); build checks skipped');

  const counts = ws.reduce((m, w) => ({ ...m, [w.layout]: (m[w.layout] || 0) + 1 }), {});
  lines.unshift(`${ws.length} windows (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}), duration ${D} s, shares ${JSON.stringify(P.shares)}`);
  return { errors, lines };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job) { console.error('Usage: split-check.mjs --job <dir>'); process.exit(2); }
  const r = checkSplit(a);
  for (const l of r.lines) console.log(l);
  if (r.errors.length) { for (const e of r.errors) console.error(`SPLIT CHECK FAIL: ${e}`); process.exit(1); }
  console.log('SPLIT CHECK OK');
}
