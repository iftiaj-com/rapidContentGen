// rcg infographics: the mechanical half of the info-graphics essay workflow
// (skill .agents/skills/style-info-graphics, style pack library/styles/info-graphics).
// The look lives in the style pack; this tool handles time.
//
//   scaffold     Empties a fresh job's template (placeholder footage, bars, title card)
//                so the composition is graphics only, and sets the root duration.
//   place-voice  Lays the voice lines from audio_meta.json end to end (lead, gaps), writes
//                their audio elements, optionally a music bed ducked under every line, and
//                sets the root duration to the last word + tail.
//   resolve      Turns a plan with word anchors into the plain plan rcg style build reads.
//
// Usage:
//   node tools/blocks/infographics.mjs scaffold --job <dir> --duration <s> [--force]
//   node tools/blocks/infographics.mjs place-voice --job <dir> [--meta assets/voice/audio_meta.json]
//        [--lead 0.25] [--gap 0.2] [--gaps "vo2:0.4,vo3:0.1"] [--tail 0.6] [--track 22]
//        [--music assets/bed-limited.wav --music-volume 0.5 --duck 0.35 --fade-in 0.3 --fade-out 0.8 --music-offset 0]
//        [--duration <s>]
//   node tools/blocks/infographics.mjs resolve --job <dir> --plan <info-plan.json> [--out <style-plan.json>] [--meta ...]
//
// Anchors (in start, end, times and the per-item cue params): "@vo1:prompt" is where the first
// "prompt" in line vo1 starts, "@vo1:prompt#2" the second one, "@vo1:prompt$" where it ends,
// "@vo1.4" the fifth word (0-based), "@vo1:prompt+0.1" with an offset. Starts and ends are
// composition seconds; times and cue params become seconds from the item's start. "end"
// replaces duration; "end": "scene" ends the item where the next ground has finished
// entering (its start plus the wipe, arc, iris or fade time; a cut adds nothing), or at the
// plan's "duration"; "end": "#g4" does the same for the item with id g4 (for a scene that
// hands over to a later ground, past a cutaway). Plain numbers pass through unchanged.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { musicLane } from './flythrough.mjs';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { readJson } from '../lib/config.mjs';

const f3 = (n) => +Number(n).toFixed(3);
const CUES = ['at', 'markAt', 'clickAt', 'typeAt', 'countAt', 'arrowAt', 'plateAt'];
const norm = (w) => String(w).toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, '').replace(/\.+$/, '');
const stripComments = (h) => h.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));

function readIndex(jobDir) {
  const file = join(jobDir, 'index.html');
  if (!existsSync(file)) throw new Error(`No index.html in ${jobDir}`);
  return { file, html: readFileSync(file, 'utf8') };
}

function setRootDuration(html, d) {
  return html.replace(/(<div\b[^>]*\bid="root"[^>]*\bdata-duration=")[^"]*(")/, `$1${f3(d)}$2`);
}

/** Insert or replace an element by id just before the root's closing tag. */
function putElement(html, id, markup) {
  const re = new RegExp(`[ \\t]*<(div|audio)\\b[^>]*\\bid="${id}"[^>]*>\\s*</\\1>\\n?`);
  if (re.test(html)) return html.replace(re, `      ${markup}\n`);
  const idx = html.lastIndexOf('</div>', html.lastIndexOf('<script>', html.lastIndexOf('window.__timelines')));
  if (idx < 0) throw new Error('Could not find the root closing tag.');
  return `${html.slice(0, idx)}  ${markup}\n    ${html.slice(idx)}`;
}

// ── scaffold ────────────────────────────────────────────────────────────────

export function scaffold({ job, duration, force = false }) {
  const jobDir = resolve(job);
  const { file, html } = readIndex(jobDir);
  const d = Number(duration);
  if (!(d > 0)) throw new Error('scaffold: --duration must be > 0');
  if (!force && !/assets\/main\.mp4/.test(stripComments(html))) {
    throw new Error('scaffold: index.html is no longer the bare template (no placeholder footage). Pass --force to empty it anyway.');
  }
  const open = html.match(/<div\b[^>]*\bid="root"[^>]*>/);
  if (!open) throw new Error('scaffold: no root element');
  const start = open.index + open[0].length;
  const scriptAt = html.indexOf('<script>', start);
  const close = html.lastIndexOf('</div>', scriptAt);
  const body = `
      <!-- Graphics only: grounds, components, voice, music, SFX and captions are added by rcg style build, rcg infographics place-voice and rcg captions. -->
    `;
  const script = `<script>
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>`;
  let out = html.slice(0, start) + body + html.slice(close);
  out = out.replace(/<script>[\s\S]*?window\.__timelines\["main"\][\s\S]*?<\/script>/, script);
  out = setRootDuration(out, d);
  writeFileSync(file, out);
  return { file, duration: f3(d) };
}

// ── place-voice ─────────────────────────────────────────────────────────────

export function placeVoice(o) {
  const jobDir = resolve(o.job);
  const meta = readJson(join(jobDir, o.meta || 'assets/voice/audio_meta.json'));
  const voices = meta.voices || [];
  if (!voices.length) throw new Error('place-voice: no voices in audio_meta.json (run rcg voice say first)');
  const lead = Number(o.lead ?? 0.25), gap = Number(o.gap ?? 0.2), tail = Number(o.tail ?? 0.6);
  const gaps = Object.fromEntries(String(o.gaps || '').split(',').filter(Boolean).map((s) => { const [k, v] = s.split(':'); return [k.trim(), Number(v)]; }));
  const dir = (o.meta ? o.meta.replace(/[^/\\]+$/, '') : 'assets/voice/').replace(/\\/g, '/');
  let { file, html } = readIndex(jobDir);
  let t = lead;
  const placed = [];
  for (const v of voices) {
    if (placed.length) t += gaps[v.id] ?? gap;
    const words = v.words || [];
    const lastWord = words.length ? words[words.length - 1].end : v.duration_s;
    placed.push({ id: v.id, start: f3(t), duration: f3(v.duration_s), speechEnd: f3(t + lastWord), text: v.text });
    html = putElement(html, v.id, `<audio id="${v.id}" src="${dir}${v.path}" data-start="${f3(t)}" data-duration="${f3(v.duration_s)}" data-track-index="${o.track || 22}"></audio>`);
    t += lastWord;
  }
  const total = f3(o.duration != null ? Number(o.duration) : t + tail);
  if (o.music) {
    if (!existsSync(join(jobDir, o.music))) throw new Error(`place-voice: ${o.music} not found in the job`);
    const lane = musicLane({
      total, fadeIn: Number(o['fade-in'] ?? 0.3), fadeOut: Number(o['fade-out'] ?? 0.8), volume: Number(o['music-volume'] ?? 0.5),
      ducks: placed.map((p) => ({ start: p.start, duration: p.speechEnd - p.start })), duckLevel: Number(o.duck ?? 0.35),
    });
    html = putElement(html, 'music', `<audio id="music" src="${o.music}" data-start="0" data-duration="${total}" data-media-start="${Number(o['music-offset'] || 0)}" data-track-index="21" data-automation='${JSON.stringify({ version: 1, lanes: [{ target: 'volume', points: lane }] })}'></audio>`);
  }
  html = setRootDuration(html, total);
  writeFileSync(file, html);
  return { placed, total };
}

// ── resolve ─────────────────────────────────────────────────────────────────

function voiceStarts(html, plan) {
  const out = { ...(plan.voices || {}) };
  for (const m of stripComments(html).matchAll(/<audio\b[^>]*>/g)) {
    const id = m[0].match(/\bid="([^"]+)"/)?.[1];
    const s = m[0].match(/data-start="([^"]+)"/)?.[1];
    if (id && s != null && out[id] == null) out[id] = Number(s);
  }
  return out;
}

export function makeAnchor({ meta, starts }) {
  const byId = Object.fromEntries((meta.voices || []).map((v) => [v.id, v]));
  return function anchor(spec, where) {
    const m = String(spec).trim().match(/^@([\w-]+)(?:\.(\d+)|:([^#$+\-\s]+)(?:#(\d+))?)(\$)?\s*([+-]\s*\d*\.?\d+)?$/u);
    if (!m) throw new Error(`${where}: bad anchor "${spec}" (use @vo1:word, @vo1:word#2, @vo1:word$, @vo1.3, optional +0.1)`);
    const [, vid, index, word, nth, atEnd, offset] = m;
    const v = byId[vid];
    if (!v) throw new Error(`${where}: no voice line "${vid}" in audio_meta.json`);
    if (starts[vid] == null) throw new Error(`${where}: voice "${vid}" is not placed (no audio element with a data-start; run place-voice)`);
    const words = v.words || [];
    let w;
    if (index != null) w = words[Number(index)];
    else {
      const hits = words.filter((x) => norm(x.text) === norm(word));
      w = hits[(Number(nth) || 1) - 1];
    }
    if (!w) throw new Error(`${where}: "${spec}" not found in ${vid}: ${words.map((x) => x.text).join(' ')}`);
    return { t: starts[vid] + (atEnd ? w.end : w.start) + (offset ? Number(offset.replace(/\s/g, '')) : 0), word: w.text };
  };
}

const isAnchor = (v) => typeof v === 'string' && v.trim().startsWith('@');

// A ground that wipes, arcs, irises or fades in reveals what is under it, so the scene it
// replaces must stay until the entrance is done (else the reveal opens onto the black root).
// Seconds per entrance, as in library/styles/info-graphics/components.mjs (ground).
const ENTER = { cut: 0, fade: 0.3, 'wipe-up': 0.42, 'wipe-left': 0.42, arc: 0.62, iris: 0.5 };
const handover = (item) => (item.component === 'ground' ? ENTER[item.enter || 'cut'] ?? 0 : 0);

export function resolvePlan({ job, plan: planPath, out: outPath, meta: metaPath }) {
  const jobDir = resolve(job);
  const plan = readJson(resolve(planPath));
  const { html } = readIndex(jobDir);
  const meta = readJson(join(jobDir, metaPath || 'assets/voice/audio_meta.json'), { voices: [] });
  const anchor = makeAnchor({ meta, starts: voiceStarts(html, plan) });
  const rootD = Number(html.match(/<div\b[^>]*\bid="root"[^>]*\bdata-duration="([^"]+)"/)?.[1]);
  const total = Number(plan.duration ?? rootD);
  const items = plan.items || [];
  const rows = [];
  // Starts first, so "end": "scene" can look ahead to the next ground.
  const starts = items.map((it, i) => {
    const where = `items[${i}] ${it.id || it.component}`;
    if (isAnchor(it.start)) return anchor(it.start, where);
    if (!Number.isFinite(Number(it.start))) throw new Error(`${where}: start must be a number or an anchor`);
    return { t: Number(it.start), word: null };
  });
  const outItems = items.map((it, i) => {
    const where = `items[${i}] ${it.id || it.component}`;
    const s = starts[i].t;
    const o = { ...it, start: f3(Math.max(0, s)) };
    let end;
    if (it.end === 'scene') {
      const next = items.findIndex((x, k) => k > i && x.component === 'ground');
      end = next >= 0 ? Math.min(total, starts[next].t + handover(items[next])) : total;
    } else if (typeof it.end === 'string' && it.end.startsWith('#')) {
      const next = items.findIndex((x) => x.id === it.end.slice(1));
      if (next < 0) throw new Error(`${where}: end "${it.end}" names no item`);
      end = Math.min(total, starts[next].t + handover(items[next]));
    } else if (isAnchor(it.end)) end = anchor(it.end, where).t;
    else if (it.end != null) end = Number(it.end);
    if (end != null) {
      if (!(end > s)) throw new Error(`${where}: end ${f3(end)} is not after start ${f3(s)}`);
      o.duration = f3(end - s);
      delete o.end;
    }
    if (!(Number(o.duration) > 0)) throw new Error(`${where}: needs a duration or an end`);
    if (it.times != null) {
      const list = Array.isArray(it.times) ? it.times : String(it.times).split(',');
      o.times = list.map((x) => (isAnchor(x) ? f3(anchor(x, where).t - s) : f3(Number(x)))).join(',');
    }
    for (const k of CUES) if (isAnchor(it[k])) o[k] = f3(anchor(it[k], where).t - s);
    if (Number.isFinite(total) && o.start + o.duration > total + 1e-3) throw new Error(`${where}: ends at ${f3(o.start + o.duration)} s, past the duration ${total} s`);
    // Ride the reveal of a ground that enters at the same moment, earlier in the plan.
    if (it.component !== 'ground' && it.reveal == null) {
      const g = items.slice(0, i).reverse().find((x, k) => x.component === 'ground' && Math.abs(starts[i - 1 - k].t - s) < 1e-6);
      if (g && g.enter && g.enter !== 'cut') o.reveal = g.enter;
    }
    rows.push({ id: o.id || '', component: o.component, start: o.start, end: f3(o.start + o.duration), word: starts[i].word, times: o.times || '' });
    return o;
  });
  const result = { style: plan.style || 'info-graphics', items: outItems };
  const dest = resolve(outPath || join(jobDir, 'data', 'style-plan.json'));
  writeFileSync(dest, `${JSON.stringify(result, null, 2)}\n`);
  return { dest, rows, total };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const cmd = a._[0];
  try {
    if (cmd === 'scaffold') {
      if (!a.job || a.duration == null) throw new Error('Usage: infographics.mjs scaffold --job <dir> --duration <s> [--force]');
      const r = scaffold({ job: a.job, duration: a.duration, force: Boolean(a.force) });
      console.log(`Emptied the template in ${r.file}; root duration ${r.duration} s.`);
    } else if (cmd === 'place-voice') {
      if (!a.job) throw new Error('Usage: infographics.mjs place-voice --job <dir> [--lead 0.25] [--gap 0.2] [--music <file>] ...');
      const r = placeVoice(a);
      for (const p of r.placed) console.log(`${p.id.padEnd(6)} ${p.start.toFixed(2).padStart(6)} s  speech to ${p.speechEnd.toFixed(2)} s  "${p.text}"`);
      console.log(`Root duration ${r.total} s.${a.music ? ` Music ${a.music} ducked under ${r.placed.length} line(s).` : ''}`);
    } else if (cmd === 'resolve') {
      if (!a.job || !a.plan) throw new Error('Usage: infographics.mjs resolve --job <dir> --plan <info-plan.json> [--out <style-plan.json>]');
      const r = resolvePlan(a);
      for (const x of r.rows) {
        console.log(`${String(x.id).padEnd(10)} ${String(x.component).padEnd(9)} ${x.start.toFixed(2).padStart(6)}-${x.end.toFixed(2).padEnd(6)} ${x.word ? `on "${x.word}"` : ''}${x.times ? `  times ${x.times}` : ''}`);
      }
      console.log(`Wrote ${r.dest} (${r.rows.length} items). Next: rcg style build --job <dir> --spec ${r.dest} --sfx --insert`);
    } else {
      throw new Error('Usage: infographics.mjs scaffold | place-voice | resolve (see the header of tools/blocks/infographics.mjs)');
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}
