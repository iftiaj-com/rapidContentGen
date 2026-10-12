// rcg plan check: find on paper what a render would show too late. Reads plan.json, index.html,
// the compositions, the template's safe zones, word files and face tracks; never decodes video.
//
// FAIL (exit 1)
//   kind       an item's command has no entry in kinds.mjs, or misses a required flag
//   input      a file an item reads is gone
//   host       a recorded block's element is no longer in the page (plan and page disagree)
//   timing     a recorded block starts before 0 or ends after the composition
//   captions   words run outside their block or the composition; captions timed to a voice that
//              starts elsewhere; captions timed to a cut (rcg cut) the page does not play
//   safe       text in the bottom no-text zone or the right app-button strip (pitfall 7)
// WARN
//   drift      the page changed since the last recorded step (rcg plan diff)
//   header     text above the header line
//   overlap    two text blocks on screen at once with intersecting boxes
//   face       text over a tracked face (data/track-*.json; camera moves are not modelled)
//   clip       an element outside the plan runs past the composition

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from '../lib/cli.mjs';
import { ROOT, loadConfig } from '../lib/config.mjs';
import { KINDS, validate } from './kinds.mjs';
import { pageSha, readPage, textBox } from './page.mjs';
import { loadPlan } from './record.mjs';

const read = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));

/** The item's argv for this job, parsed. */
export function itemArgs(item, job) {
  return parseArgs(item.argv.map((v) => v.replace(/^\{job\}/, job)));
}

/** The first existing reading of a path an item was given (job token, its cwd, the job). */
function findFile(v, item, job) {
  const s = String(v).replace(/^\{job\}/, job);
  const cands = isAbsolute(s) ? [s] : [join(item.cwd === '.' ? ROOT : isAbsolute(item.cwd) ? item.cwd : join(ROOT, item.cwd), s), join(job, s)];
  return cands.find((p) => existsSync(p)) || null;
}

/** Safe zones of the template whose size matches the page. */
function safeZones(root) {
  const dir = loadConfig().paths.templates;
  if (!existsSync(dir)) return null;
  for (const t of readdirSync(dir)) {
    const f = join(dir, t, 'template.json');
    if (!existsSync(f)) continue;
    const tj = read(f);
    if (tj.width === root.width && tj.height === root.height && tj.safeZones) return { template: t, ...tj.safeZones };
  }
  return null;
}

const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Face boxes in page pixels at timeline time t for every footage element a track file describes. */
function faceSampler(job, page) {
  const dir = join(job, 'data');
  const tracks = existsSync(dir) ? readdirSync(dir).filter((f) => /^track-.+\.json$/.test(f)).map((f) => read(join(dir, f))) : [];
  const users = [];
  for (const tr of tracks) {
    if (!tr.face?.cx || !tr.times) continue;
    for (const el of page.elements.filter((e) => e.tag === 'video' && e.src === tr.src)) users.push({ tr, el });
  }
  const { width: W, height: H } = page.root;
  return (t) => {
    const out = [];
    for (const { tr, el } of users) {
      if (t < el.start || t > el.start + (el.duration ?? Infinity)) continue;
      const st = el.mediaStart + (t - el.start) - (tr.start || 0);
      const i = Math.round(st * (tr.fps || 30));
      if (i < 0 || i >= tr.times.length || !tr.face.present?.[i]) continue;
      // the footage covers the frame (object-fit: cover)
      const s = Math.max(W / tr.width, H / tr.height);
      const ox = (W - tr.width * s) / 2;
      const oy = (H - tr.height * s) / 2;
      const f = tr.face;
      const w = f.w[i] * tr.width * s;
      const h = f.h[i] * tr.height * s;
      out.push({ x: ox + f.cx[i] * tr.width * s - w / 2, y: oy + f.cy[i] * tr.height * s - h / 2, w, h, src: tr.src });
    }
    return out;
  };
}

export function checkPlan(job) {
  const fails = [];
  const warns = [];
  const fail = (check, msg) => fails.push({ check, msg });
  const warn = (check, msg) => warns.push({ check, msg });
  const plan = loadPlan(job);
  if (!plan) {
    fail('plan', 'no data/plan.json yet: it is written when a block command (rcg captions, title, ...) runs on the job');
    return { ok: false, fails, warns, items: 0 };
  }
  const html = readFileSync(join(job, 'index.html'), 'utf8');
  const page = readPage(html);
  const byId = new Map(page.elements.filter((e) => e.id).map((e) => [e.id, e]));
  const dur = page.root.duration;
  const tol = 0.05;
  if (pageSha(job) !== plan.pageSha) warn('drift', 'the page changed since the last recorded step (Studio or a hand edit?): rcg plan diff shows what; plan apply would undo it');

  const texts = []; // { id, key, start, end, box, allowEdge }
  const itemHosts = new Set();
  for (const it of plan.items) {
    const where = `${it.key} (${it.command})`;
    if (!KINDS[it.command]) { fail('kind', `${where}: no kind "${it.command}" in tools/plan/kinds.mjs`); continue; }
    const a = itemArgs(it, job);
    for (const p of validate(it.command, a)) fail('kind', `${where}: ${p}`);
    for (const f of KINDS[it.command].inputs) {
      if (a[f] != null && a[f] !== true && !findFile(a[f], it, job)) fail('input', `${where}: --${f} ${a[f]} does not exist`);
    }
    for (const h of it.hosts || []) {
      itemHosts.add(h);
      const el = byId.get(h);
      const comp = join(job, 'compositions', `${h}.html`);
      if (!el && !existsSync(comp)) { fail('host', `${where}: #${h} is not in the page any more (rcg plan diff)`); continue; }
      if (!el) continue;
      const end = el.start + (el.duration ?? 0);
      if (el.start < -tol || (Number.isFinite(dur) && el.duration != null && end > dur + tol)) {
        fail('timing', `${where}: #${h} plays ${el.start.toFixed(2)}-${end.toFixed(2)}s, the composition is ${dur}s`);
      }
      if (KINDS[it.command].text && el.compositionSrc && existsSync(join(job, el.compositionSrc))) {
        const box = textBox(readFileSync(join(job, el.compositionSrc), 'utf8'));
        if (box) texts.push({ id: h, key: it.key, start: el.start, end, box, allowEdge: a['allow-edge'] === true });
      }
    }
    if (it.command === 'captions') checkCaptions(it, a, job, page, byId, fail);
  }

  for (const el of page.elements) {
    if (!el.id || itemHosts.has(el.id) || el.duration == null || !Number.isFinite(dur)) continue;
    if (el.start + el.duration > dur + tol) warn('clip', `#${el.id} runs to ${(el.start + el.duration).toFixed(2)}s, past the composition (${dur}s)`);
  }

  const sz = safeZones(page.root);
  if (sz) {
    for (const t of texts) {
      const b = t.box;
      const say = `${t.key}: #${t.id} text box ${b.x}-${b.x + b.w} x ${b.y}-${b.y + b.h} px`;
      const add = t.allowEdge ? warn : fail;
      if (b.y + b.h > sz.noTextBottomFrom) add('safe', `${say} reaches the bottom no-text zone (from ${sz.noTextBottomFrom}, pitfall 7)`);
      if (b.x + b.w > sz.noTextRightFrom) add('safe', `${say} reaches the right app-button strip (from ${sz.noTextRightFrom}, pitfall 7)`);
      if (b.y < sz.headerClearTo) warn('header', `${say} starts above the header line (${sz.headerClearTo})`);
    }
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const p = texts[i];
      const q = texts[j];
      const a0 = Math.max(p.start, q.start);
      const a1 = Math.min(p.end, q.end);
      if (a1 - a0 > tol && inter(p.box, q.box) > 0) warn('overlap', `#${p.id} and #${q.id} share the screen at ${a0.toFixed(2)}-${a1.toFixed(2)}s and their text boxes intersect`);
    }
  }
  // a block layered behind a PNP cut-out sits under the subject: it cannot cover the face
  const behind = new Set();
  for (const it of plan.items) {
    const a = itemArgs(it, job);
    if ((it.command === 'layer' || it.command === 'captions') && a.behind && a.behind !== true) behind.add(it.command === 'layer' ? String(a.id).replace(/^#/, '') : String(KINDS.captions.key(a)));
  }
  const faces = faceSampler(job, page);
  for (const t of texts.filter((x) => !behind.has(x.id))) {
    let hit = null;
    for (let s = t.start; s <= t.end && !hit; s += 0.25) {
      for (const f of faces(s)) if (f.w * f.h > 0 && inter(t.box, f) / (f.w * f.h) > 0.25) { hit = s; break; }
    }
    if (hit != null) warn('face', `${t.key}: #${t.id} covers over a quarter of the tracked face at ${hit.toFixed(2)}s (camera moves not modelled)`);
  }
  return { ok: !fails.length, fails, warns, items: plan.items.length, safeZones: sz?.template || null };
}

function checkCaptions(it, a, job, page, byId, fail) {
  const where = `${it.key} (captions)`;
  const f = findFile(a.words, it, job);
  if (!f || /\.srt$/i.test(f)) return;
  const doc = read(f);
  let words = Array.isArray(doc.words) ? doc.words : null;
  if (!words && a.voice) words = (doc.voices || []).find((v) => v.id === a.voice)?.words || null;
  if (!words?.length) return;
  const start = Number(a.start ?? 0);
  const host = byId.get(String(KINDS.captions.key(a)));
  const w0 = start + Math.min(...words.map((w) => w.start));
  const w1 = start + Math.max(...words.map((w) => w.end));
  const dur = page.root.duration;
  if (Number.isFinite(dur) && w1 > dur + 0.05) fail('captions', `${where}: the last word ends at ${w1.toFixed(2)}s, after the composition (${dur}s)`);
  if (host && host.duration != null && (w0 < host.start - 0.05 || w1 > host.start + host.duration + 0.05)) {
    fail('captions', `${where}: words run ${w0.toFixed(2)}-${w1.toFixed(2)}s, outside the block (${host.start}-${(host.start + host.duration).toFixed(2)}s)`);
  }
  if (a.voice) {
    const v = byId.get(String(a.voice));
    if (v && Math.abs(v.start - start) > 0.02) fail('captions', `${where}: --start ${start} but voice #${a.voice} starts at ${v.start}s (words would be early or late)`);
  }
  // words re-timed to an rcg cut belong to that cut: the page must play it
  if (doc.source && doc.cutOf) {
    const plays = page.elements.some((e) => e.src === doc.source);
    if (!plays) fail('captions', `${where}: the words are timed to ${doc.source} (rcg cut of ${doc.cutOf}), but the page does not play it${page.elements.some((e) => e.src === doc.cutOf) ? `; it plays the raw take ${doc.cutOf}` : ''}`);
  }
}
