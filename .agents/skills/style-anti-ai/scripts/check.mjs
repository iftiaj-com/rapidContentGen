#!/usr/bin/env node
// check.mjs: generic-AI looks in an rcg edit (skill style-anti-ai). Optional; never blocks a render.
//
//   node .agents/skills/style-anti-ai/scripts/check.mjs <job> [--frames] [--sheet <png>]
//   node .agents/skills/style-anti-ai/scripts/check.mjs calibrate [--jobs jobs]
//
// <job> reads index.html, compositions/*.html (their generator comments and CSS), data/plan.json,
// the style's plan file, data/vo-lines.json and the sound <audio> elements. No video is decoded.
// --frames also reads the frame sheet rcg render wrote (renders/*-sheet.png, newest; or --sheet) as
// raw RGB through ffmpeg. Writes <job>/data/anti-ai.json. Exit 1 when a finding is BAN.
// calibrate runs the check on every job and counts, per rule, the jobs and looks it fires on.
//
// Rules, levels and fixes: ../references/rules.md (JSON block). Allowances: ../references/style-allowances.md.
// The user's brand colours and fonts (<job>/data/brand.json: {"colors": [...], "fonts": [...]}) are never flagged.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probe, runBuffer } from '../../../../tools/lib/ffmpeg.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const jsonBlock = (file) => JSON.parse(readFileSync(join(HERE, '..', 'references', file), 'utf8').match(/```json\s*([\s\S]*?)```/)[1]);
const readJ = (f, d = null) => { try { return JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return d; } };

const GROTESK = new Set(['inter', 'inter tight', 'geist', 'archivo', 'roboto', 'poppins', 'montserrat', 'manrope', 'dm sans',
  'plus jakarta sans', 'outfit', 'space grotesk', 'satoshi', 'general sans', 'sora', 'urbanist', 'figtree', 'onest', 'lexend',
  'open sans', 'work sans', 'nunito', 'raleway', 'helvetica', 'helvetica neue', 'arial', 'system-ui', 'sf pro', 'segoe ui']);
const ICON_BAN = new Set(['sparkles', 'sparkle', 'magic-wand', 'wand', 'rocket', 'rocket-launch', 'stars', 'star-four', 'robot', 'bot']);
const ICON_WARN = new Set(['lightning', 'zap', 'brain', 'lightbulb', 'trophy', 'target', 'crosshair', 'flame', 'fire', 'diamond', 'gem', 'crown', 'trend-up', 'chart-line-up']);
const COPY_BAN = /\b(unlock\w*|supercharg\w*|game[- ]?chang\w*|level[- ]up|seamless\w*|elevat\w*|revolutioni[sz]\w*|effortless\w*|next[- ]level|harness\w*|empower\w*|leverag\w*|delv\w*|unleash\w*|skyrocket\w*|cutting[- ]edge|unparalleled|transform your|boost your|10x your|look no further|in today's (?:fast[- ]paced )?world|the secret to|tapestry|testament to)\b/i;
const COPY_WARN = /(\bnot just\b|\bit'?s not \w+(?: \w+)?, it'?s\b|\bhere'?s the thing\b|\blet that sink in\b|\bthe future of\b|\bchanges everything\b|\bmind[- ]?blowing\b|\byou won'?t believe\b)/i;
const MEME = /vine|boom|bruh|airhorn|ka-?ching|record[-_ ]?scratch|bonk|fart|\bsus\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const NON_TEXT = /^(look|tone|accent|fill|exit|enter|times|icon\w*|src|image|img|video|align|font|colou?r|bg|ground|shape|side|dir|mode|kind|style|ease|fit|anchor|position|layout|variant|size|textAt|tailAt|at|cue|sfx|seed|rotate|x|y|w|h|min|max|gap)$/i;
const IGNORE_JOB = /^(README|\.)/;

// ---------------------------------------------------------------- colour helpers

function hsv(c) {
  const s = String(c || '').trim();
  let rgb;
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1];
    rgb = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
  } else {
    const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/i);
    if (!m) return null;
    if (m[4] != null && Number(m[4]) < 0.2) return null; // nearly transparent: not a visible colour
    rgb = [m[1], m[2], m[3]].map((x) => Number(x) / 255);
  }
  return rgbHsv(...rgb);
}

function rgbHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

const colours = (s) => String(s || '').match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g) || [];
const isPurpleBlue = (x) => x && x[0] >= 225 && x[0] <= 295 && x[1] >= 0.4 && x[2] >= 0.3;
const isCream = (x) => x && x[0] >= 20 && x[0] <= 60 && x[1] >= 0.04 && x[1] <= 0.3 && x[2] >= 0.78;
const isNeon = (x) => x && x[1] >= 0.6 && x[2] >= 0.85;
const isNearBlack = (x) => x && x[2] < 0.16;

// ---------------------------------------------------------------- reading a job

/**
 * Is a camera cue a move the viewer sees? Face cues come in pairs: a short eased zoom or a punch,
 * then a long linear drift that holds the frame (not a move). Other cues are moves.
 */
function isMove(cue) {
  const s = String(cue);
  if (!/face\./.test(s)) return true;
  if (/face\.punch/.test(s)) return true;
  const t = Number(s.match(/^(?:[\w-]+\/)?([\d.]+):/)?.[1]);
  const d = Number(s.match(/:d=([\d.]+)/)?.[1] ?? 0);
  return d > 0 && d <= 0.6 && !(t === 0 && d === 0);
}

/** The CSS rules of a composition, @font-face blocks left out: [{ sel, body }]. */
function cssRules(html) {
  const style = (html.match(/<style>([\s\S]*?)<\/style>/g) || []).join('\n').replace(/@font-face\s*\{[^}]*\}/g, '');
  return [...style.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
}

function readBlock(job, el) {
  const html = readFileSync(join(job, el.compositionSrc), 'utf8');
  const b = { id: el.id, start: el.start, kind: 'other', texts: [], wrote: true, icons: [], html };
  const meta = html.match(/<!-- rcg-style (\{.*?\}) -->/);
  const gen = html.match(/Generated by tools\/blocks\/(\w+)\.mjs(?::\s*(?:preset|style) "([^"]+)")?/);
  if (meta) {
    const m = JSON.parse(meta[1]);
    Object.assign(b, { kind: 'style', style: m.style, entrance: `${m.style}/${m.component}${m.params?.enter ? `:${m.params.enter}` : ''}` });
    // the icon component names its icon in `name`; orbit lists them in `icons` ("a|b|c")
    if (m.component === 'icon' && typeof m.params?.name === 'string') b.icons.push(m.params.name.toLowerCase());
    for (const [k, v] of Object.entries(m.params || {})) {
      if (/^icons?$/i.test(k) && typeof v === 'string' && v) b.icons.push(...v.toLowerCase().split('|').filter(Boolean));
      else if (/icon/i.test(k)) continue;
      else if (typeof v === 'string' && /\p{L}/u.test(v) && !NON_TEXT.test(k) && !/[\\/]|\.(png|jpe?g|webp|svg|mp4|webm)$/i.test(v)) b.texts.push(v);
    }
  } else if (gen) {
    b.kind = gen[1];
    if (b.kind === 'title') { b.entrance = `title:${gen[2]}`; b.texts = JSON.parse(html.match(/var LINES = (\[.*?\])/)?.[1] || '[]'); }
    if (b.kind === 'beatflash') b.texts = JSON.parse(html.match(/var WORDS = (\[.*?\])/)?.[1] || '[]');
    if (b.kind === 'captions') {
      b.captionStyle = gen[2];
      b.wrote = false; // the speaker's (or the script's) words: checked through vo-lines.json, not here
      const groups = JSON.parse(html.match(/var GROUPS = (\[[\s\S]*?\]);/)?.[1] || '[]');
      b.texts = [groups.flatMap((g) => g.w.map((w) => w[0])).join(' ')];
    }
  }
  for (const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]*icons?\/[^"]*)"/gi)) b.icons.push(basename(m[1]).replace(/\.\w+$/, '').replace(/-(bold|fill|duotone|light|thin|regular)$/, '').toLowerCase());
  const body = html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const rules = cssRules(html);
  // media: video, canvas, a non-icon <img>, or a photo drawn as a CSS background (vox parallax plates)
  b.media = /<(video|canvas)\b/i.test(body) || [...body.matchAll(/<img\b[^>]*src="([^"]*)"/gi)].some((m) => !/icons?\//.test(m[1]))
    || rules.some((r) => [...r.body.matchAll(/url\(["']?([^"')]+)/g)].some((m) => /\.(png|jpe?g|webp|avif|gif)$/i.test(m[1]) && !/icons?\//.test(m[1])));
  b.font = rules.map((r) => r.body.match(/font-family:\s*["']?([^"',;]+)/)?.[1]).find(Boolean) || null;
  b.grounds = rules.flatMap((r) => [...r.body.matchAll(/background(?:-color|-image)?\s*:\s*([^;]+)/g)].map((m) => m[1]));
  b.inks = rules.flatMap((r) => [...r.body.matchAll(/(?:^|[;\s])(?:color|fill)\s*:\s*([^;]+)/g)].map((m) => m[1]));
  b.glass = rules.some((r) => /backdrop-filter\s*:[^;]*blur/.test(r.body));
  b.glows = rules.flatMap((r) => [...r.body.matchAll(/(?:text-shadow|box-shadow)\s*:\s*([^;]+)/g)].flatMap((m) => m[1].split(/,(?![^(]*\))/)))
    .filter((sh) => { const px = [...sh.matchAll(/(-?[\d.]+)px/g)].map((x) => Number(x[1])); const c = hsv(colours(sh)[0]); return px.length >= 3 && px[2] >= 12 && c && c[1] >= 0.5 && c[2] >= 0.6; });
  b.eases = [...html.matchAll(/ease\s*:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  const caps = rules.some((r) => /text-transform\s*:\s*uppercase/.test(r.body));
  const stroke = rules.some((r) => /-webkit-text-stroke\s*:\s*[1-9]/.test(r.body) || /paint-order\s*:\s*stroke/.test(r.body));
  const yellow = b.inks.some((c) => colours(c).some((x) => { const h = hsv(x); return h && h[0] >= 40 && h[0] <= 65 && h[1] > 0.6; }));
  b.presetCaptions = b.kind === 'captions' && caps && stroke && yellow;
  return b;
}

/** Everything the rules read, from one job folder. */
export function readJob(job) {
  const html = readFileSync(join(job, 'index.html'), 'utf8');
  const duration = Number(html.match(/data-composition-id="main"[^>]*data-duration="([\d.]+)"/)?.[1] || html.match(/<div id="root"[^>]*data-duration="([\d.]+)"/)?.[1] || 0);
  const els = [...html.matchAll(/<(div|audio|video)\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (t, n) => t.match(new RegExp(`\\s${n}="([^"]*)"`))?.[1];
  const blocks = [];
  for (const t of els) {
    const src = attr(t, 'data-composition-src');
    if (src && existsSync(join(job, src))) {
      const b = readBlock(job, { id: attr(t, 'id'), start: Number(attr(t, 'data-start') || 0), compositionSrc: src });
      b.end = b.start + Number(attr(t, 'data-duration') || duration);
      blocks.push(b);
    }
  }
  // what is on screen besides our blocks: footage, photos, and blocks that draw media
  const media = els.filter((t) => /^<video/i.test(t) && attr(t, 'data-start') != null)
    .map((t) => [Number(attr(t, 'data-start')), Number(attr(t, 'data-start')) + Number(attr(t, 'data-duration') || duration)]);
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const s = attr(m[0], 'data-start');
    if (s != null && !/icons?\//.test(attr(m[0], 'src') || '')) media.push([Number(s), Number(s) + Number(attr(m[0], 'data-duration') || duration)]);
  }
  for (const b of blocks) if (b.media || ['shader', 'three', 'flythrough'].includes(b.kind)) media.push([b.start, b.end]);
  blocks.sort((a, b) => a.start - b.start);
  const sounds = els.filter((t) => /^<audio/i.test(t)).map((t) => ({ id: attr(t, 'id') || '', src: attr(t, 'src') || '' }))
    .filter((s) => /\/sfx\/|library\/sfx|-sfx$/i.test(`${s.src} ${s.id}`) && !/voice|music|bed/i.test(s.id));
  const plan = readJ(join(job, 'data', 'plan.json'));
  const arg = (it, f) => { const i = it.argv.indexOf(`--${f}`); return i >= 0 ? it.argv[i + 1] : null; };
  const styles = new Set(blocks.map((b) => b.style).filter(Boolean));
  for (const it of plan?.items || []) if (it.command === 'style' && arg(it, 'style')) styles.add(arg(it, 'style'));
  for (const [f, s] of [['mp-plan.json', 'marketing-pro'], ['mm-plan.json', 'mix-media'], ['info-plan.json', 'info-graphics']]) if (existsSync(join(job, 'data', f))) styles.add(s);
  const features = new Set();
  if (blocks.some((b) => ['shader', 'three', 'beatflash'].includes(b.kind))) features.add('shader');
  if (/src="assets\/fx\//.test(html)) features.add('fx');
  // transitions and camera cues: plan.json when the job has one, else the style's own plan file
  let transitions = null;
  let cues = null;
  if (plan?.items?.length) {
    transitions = plan.items.filter((it) => it.command === 'transition').map((it) => arg(it, 'style'));
    cues = plan.items.filter((it) => it.command === 'camera').reduce((n, it) => n + it.argv.filter((x, i) => it.argv[i - 1] === '--cue' && isMove(x)).length, 0);
  } else {
    const mp = readJ(join(job, 'data', 'mp-plan.json'));
    const sp = readJ(join(job, 'data', 'split-plan.json'));
    if (mp) { transitions = [...(mp.blooms || []).map(() => 'flash_bloom'), ...(mp.whips || []).map(() => 'mirror_whip')]; cues = (mp.cues || []).filter(isMove).length; }
    if (sp) { transitions = (sp.transitions || []).map((t) => t.style); cues = (sp.windows || []).reduce((n, w) => n + (w.cues || []).filter(isMove).length, 0); }
  }
  const vo = readJ(join(job, 'data', 'vo-lines.json'), []);
  const script = (Array.isArray(vo) ? vo : vo.lines || []).map((l) => l.text).filter(Boolean);
  const brand = readJ(join(job, 'data', 'brand.json'), {});
  return { job, duration, blocks, media, sounds, styles, features, transitions, cues, script, brand };
}

// ---------------------------------------------------------------- the rules

export function check(J, RULES, ALLOW) {
  const found = [];
  const add = (rule, where, detail, level) => found.push({ rule, level: level || RULES[rule].level, where, detail, fix: RULES[rule].fix });
  const brandColours = (J.brand.colors || []).map((c) => String(c).toLowerCase());
  const brandFonts = (J.brand.fonts || []).map((f) => String(f).toLowerCase());
  const branded = (c) => brandColours.some((b) => String(c).toLowerCase().includes(b.replace(/^#/, '')));

  const designed = J.blocks.filter((b) => ['style', 'title', 'beatflash'].includes(b.kind));
  const ourText = [...designed.flatMap((b) => b.texts.map((t) => [`#${b.id}`, t])), ...J.script.map((t, i) => [`vo-lines.json line ${i + 1}`, t])];
  for (const b of J.blocks) for (const t of b.texts) if (EMOJI.test(t)) add('emoji', `#${b.id}`, t.match(EMOJI)[0]);
  for (const [where, t] of ourText) {
    if (EMOJI.test(t) && where.startsWith('vo-lines')) add('emoji', where, t.match(EMOJI)[0]);
    const m = t.match(COPY_BAN);
    if (m) add('slop-copy', where, `"${m[0]}" in "${t.slice(0, 80)}"`);
    const w = t.match(COPY_WARN);
    if (w) add('slop-structure', where, `"${w[0]}" in "${t.slice(0, 80)}"`);
    if (/—/.test(t)) add('em-dash', where, t.slice(0, 80));
    if (/\d\s*[x×]\b/i.test(t) && /faster|cheaper|better|more|less|than|times/i.test(t)) add('multiplier-stat', where, t.slice(0, 80));
  }
  for (const b of designed) {
    for (const t of b.texts) {
      // per line ("|" breaks a line): a list of one-word labels is not title case
      for (const line of t.split('|')) {
        const long = (line.match(/[A-Za-z][\w']*/g) || []).filter((x) => x.length > 3);
        if (long.length >= 3 && long.every((x) => /^[A-Z][a-z]/.test(x))) { add('title-case', `#${b.id}`, line.trim()); break; }
      }
      if (/\*[^*]+\*/.test(t)) add('one-accent-word', `#${b.id}`, t);
    }
    if (b.texts.length && b.texts.every((t) => /^[\s$€£+\-~]*[\d.,]+\s*[%x×kKmMbB]?\+?$/.test(t.trim()))) add('big-number', `#${b.id}`, b.texts.join(' '));
    for (const ic of new Set(b.icons)) {
      if (ICON_BAN.has(ic)) add('slop-icon', `#${b.id}`, ic);
      else if (ICON_WARN.has(ic)) add('slop-icon', `#${b.id}`, ic, 'WARN');
    }
    if (b.font && GROTESK.has(b.font.toLowerCase()) && !brandFonts.includes(b.font.toLowerCase())) add('default-grotesk-display', `#${b.id}`, b.font);
  }
  // words on a plain ground: a text block with no footage, photo or drawn media on screen for most of it
  const covered = (b) => J.media.reduce((s, [a, e]) => s + Math.max(0, Math.min(e, b.end) - Math.max(a, b.start)), 0) >= 0.5 * (b.end - b.start);
  const plain = designed.filter((b) => b.texts.length && !b.media && !b.icons.length && !covered(b));
  if (designed.length >= 3 && plain.length / designed.length >= 0.5) add('text-only-cards', 'designed blocks', `${plain.length} of ${designed.length} are words with no footage or picture on screen`);
  // overshoot on most entrances ("motion on everything"); one hero moment is fine
  const bouncy = designed.filter((b) => b.eases.some((e) => /back|elastic|bounce/i.test(e)));
  if (bouncy.length >= 3 && bouncy.length / designed.length >= 0.6) {
    add('bounce-ease', `${bouncy.length} of ${designed.length} blocks`, bouncy[0].eases.find((e) => /back|elastic|bounce/i.test(e)));
  }

  for (const b of J.blocks) {
    for (const g of b.grounds) {
      for (const c of colours(g)) {
        if (branded(c)) continue;
        const x = hsv(c);
        if (isPurpleBlue(x)) add('purple-blue', `#${b.id}`, `background ${c}`);
        if (isCream(x) && b.kind !== 'captions') add('cream-paper-ground', `#${b.id}`, `background ${c}`);
      }
    }
    for (const c of b.inks.flatMap(colours)) if (!branded(c) && isPurpleBlue(hsv(c))) add('purple-blue', `#${b.id}`, `text ${c}`);
    const dark = b.grounds.flatMap(colours).some((c) => isNearBlack(hsv(c)));
    const neon = b.inks.flatMap(colours).find((c) => isNeon(hsv(c)) && !branded(c));
    if (dark && neon && b.kind !== 'captions') add('neon-on-black', `#${b.id}`, `near-black ground + ${neon}`);
    if (b.glass) add('glass-panel', `#${b.id}`, 'backdrop-filter blur');
    if (b.glows.length) add('glow-halo', `#${b.id}`, b.glows[0].trim().slice(0, 60));
    if (b.presetCaptions) add('preset-captions', `#${b.id}`, `style ${b.captionStyle}: uppercase, yellow, stroke`);
  }
  // the same entrance on 4+ text blocks in a row
  const ent = designed.filter((b) => b.entrance);
  for (let i = 0, j = 0; i < ent.length; i = j) {
    while (j < ent.length && ent[j].entrance === ent[i].entrance) j++;
    if (j - i >= 4) add('same-entrance', `#${ent[i].id} .. #${ent[j - 1].id}`, `${j - i} blocks in a row enter as ${ent[i].entrance}`);
  }
  if (J.transitions && J.transitions.length >= 3 && new Set(J.transitions).size === 1) add('same-transition', 'transitions', `all ${J.transitions.length} are ${J.transitions[0]}`);
  if (J.cues != null && J.duration > 0 && (J.cues / J.duration) * 60 > 15) add('zoom-every-line', 'camera', `${Math.round((J.cues / J.duration) * 60)} cues a minute (${J.cues} in ${J.duration}s)`);
  if (J.sounds.length >= 6) {
    const counts = {};
    for (const s of J.sounds) counts[basename(s.src)] = (counts[basename(s.src)] || 0) + 1;
    const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (n / J.sounds.length > 0.5) add('one-sfx-repeated', 'sound', `${top} is ${n} of ${J.sounds.length} cues`);
  }
  const whooshes = J.sounds.filter((s) => /whoosh|swoosh|swish/i.test(s.src)).length;
  if (designed.length >= 4 && whooshes >= designed.length) add('whoosh-every-block', 'sound', `${whooshes} whooshes for ${designed.length} blocks`);
  for (const f of new Set(J.sounds.map((s) => basename(s.src)).filter((f) => MEME.test(f)))) add('meme-sfx', 'sound', f);

  // allowances: what the job's look is made of on purpose
  const keys = [...J.styles, ...J.features];
  const allowed = [];
  const kept = [];
  const seen = new Set();
  for (const f of found) {
    const k = `${f.rule}|${f.where}|${f.detail}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const by = keys.find((s) => ALLOW[s]?.[f.rule]);
    if (by) allowed.push({ ...f, allowedBy: by, because: ALLOW[by][f.rule] });
    else kept.push(f);
  }
  return { looks: keys, findings: kept, allowed };
}

// ---------------------------------------------------------------- the frame sheet

/** Colour shares over the rendered frame sheet. */
export async function sheetStats(png) {
  const p = await probe(png);
  const { width: W, height: H } = p.video;
  const buf = await runBuffer(['-v', 'error', '-i', png, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  let n = 0;
  let purple = 0;
  let dark = 0;
  let neon = 0;
  const bins = new Map();
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      const i = (y * W + x) * 3;
      const r = buf[i] / 255;
      const g = buf[i + 1] / 255;
      const b = buf[i + 2] / 255;
      const v = rgbHsv(r, g, b);
      n++;
      if (isPurpleBlue(v)) purple++;
      if (v[2] < 0.16) dark++;
      if (isNeon(v)) neon++;
      const key = ((buf[i] >> 4) << 8) | ((buf[i + 1] >> 4) << 4) | (buf[i + 2] >> 4);
      bins.set(key, (bins.get(key) || 0) + 1);
    }
  }
  const [topKey, topN] = [...bins].sort((a, b) => b[1] - a[1])[0];
  const top = `#${[(topKey >> 8) & 15, (topKey >> 4) & 15, topKey & 15].map((q) => (q * 16 + 8).toString(16).padStart(2, '0')).join('')}`;
  return { purple: purple / n, dark: dark / n, neon: neon / n, top, topShare: topN / n };
}

export function checkSheet(s, sheetName, RULES) {
  const out = [];
  const add = (rule, detail) => out.push({ rule, level: RULES[rule].level, where: `frames (${sheetName})`, detail, fix: RULES[rule].fix });
  if (s.purple > 0.3) add('purple-blue', `${Math.round(s.purple * 100)}% of the frames is blue-purple`);
  if (s.dark >= 0.45 && s.neon >= 0.002 && s.neon <= 0.2) add('neon-on-black', `${Math.round(s.dark * 100)}% near-black with ${(s.neon * 100).toFixed(1)}% neon`);
  if (s.topShare > 0.5 && isCream(hsv(s.top))) add('cream-paper-ground', `${Math.round(s.topShare * 100)}% of the frames is ${s.top}`);
  return out;
}

// ---------------------------------------------------------------- CLI

function newestSheet(job) {
  const dir = join(job, 'renders');
  if (!existsSync(dir)) return null;
  const sheets = readdirSync(dir).filter((f) => /-sheet\.png$/.test(f)).map((f) => join(dir, f));
  return sheets.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] || null;
}

async function runJob(job, a, RULES, ALLOW, { quiet = false } = {}) {
  const J = readJob(job);
  const res = check(J, RULES, ALLOW);
  if (a.frames) {
    const sheet = a.sheet && a.sheet !== true ? resolve(a.sheet) : newestSheet(job);
    if (!sheet) res.findings.push({ rule: 'frames', level: 'NOTE', where: 'frames', detail: 'no renders/*-sheet.png yet (rcg render writes it)', fix: '' });
    else {
      const extra = checkSheet(await sheetStats(sheet), basename(sheet), RULES);
      for (const f of extra) {
        const by = res.looks.find((s) => ALLOW[s]?.[f.rule]);
        if (by) res.allowed.push({ ...f, allowedBy: by, because: ALLOW[by][f.rule] }); else res.findings.push(f);
      }
    }
  }
  const bans = res.findings.filter((f) => f.level === 'BAN').length;
  const warns = res.findings.filter((f) => f.level === 'WARN').length;
  if (!quiet) {
    console.log(`looks: ${res.looks.join(', ') || 'none found'}`);
    for (const f of res.findings) console.log(`${f.level.padEnd(4)}  ${f.rule.padEnd(24)} ${f.where}: ${f.detail}${f.fix ? `\n      fix: ${f.fix}` : ''}`);
    for (const f of res.allowed) console.log(`ok    ${f.rule.padEnd(24)} ${f.where}: allowed for ${f.allowedBy} (${f.because})`);
    console.log(`${bans} BAN, ${warns} WARN, ${res.allowed.length} allowed by the look`);
    writeFileSync(join(job, 'data', 'anti-ai.json'), JSON.stringify({ ...res, checkedAt: new Date().toISOString() }, null, 1) + '\n');
  }
  return { ...res, bans };
}

async function calibrate(a, RULES, ALLOW) {
  const dir = resolve(a.jobs && a.jobs !== true ? a.jobs : join(ROOT, 'jobs'));
  const jobs = readdirSync(dir).filter((d) => !IGNORE_JOB.test(d) && existsSync(join(dir, d, 'index.html')));
  const fired = {};
  const allowedN = {};
  for (const d of jobs) {
    let res;
    try { res = await runJob(join(dir, d), { frames: a.frames }, RULES, ALLOW, { quiet: true }); } catch (e) { console.log(`skip ${d}: ${e.message}`); continue; }
    for (const f of res.findings) (fired[f.rule] ||= new Map()).set(d, `${res.looks.join('+') || '-'}: ${f.detail}`.slice(0, 110));
    for (const f of res.allowed) (allowedN[f.rule] ||= new Set()).add(d);
  }
  console.log(`${jobs.length} jobs in ${dir}\n`);
  for (const r of Object.keys(RULES)) {
    const m = fired[r];
    console.log(`${r.padEnd(24)} ${RULES[r].level}/${RULES[r].suggested}  fires on ${m ? m.size : 0} job(s)${allowedN[r] ? `, allowed on ${allowedN[r].size}` : ''}`);
    if (m) for (const [d, why] of m) console.log(`    ${d}  ${why}`);
  }
  return 0;
}

/**
 * Self-check on a scratch job from the template, no network: titles made by rcg title carry the banned
 * copy, emoji and stat; the icon block is written in rcg style's format (no slop icon is installed,
 * and fetching one is a download). Each banned item must be reported with its rule and its block.
 */
async function demo(RULES, ALLOW) {
  const { cpSync, mkdirSync, rmSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const job = join(tmpdir(), `rcg-anti-ai-demo-${process.pid}`);
  const ok = (name, cond, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); return cond; };
  const rcg = (...args) => {
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'rcg.mjs'), ...args.map(String)], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`rcg ${args[0]}: ${r.stderr.slice(-200)}`);
  };
  let pass = true;
  rmSync(job, { recursive: true, force: true });
  try {
    cpSync(join(ROOT, 'templates', 'vertical-1080x1920'), job, { recursive: true });
    mkdirSync(join(job, 'data'), { recursive: true });
    rcg('title', '--job', job, '--text', 'Two things|most people miss', '--start', 0.5, '--duration', 1.5, '--id', 'clean', '--insert');
    let res = check(readJob(job), RULES, ALLOW);
    pass = ok('a plain title raises nothing', res.findings.length === 0, res.findings.map((f) => f.rule).join(', ')) && pass;
    rcg('title', '--job', job, '--text', 'Unlock it|10x faster than ever 🚀', '--start', 2.5, '--duration', 1.5, '--id', 'slop', '--insert');
    const comp = `<!doctype html><html><head><!-- rcg-style {"style":"info-graphics","component":"icon","start":4,"duration":1,"seed":1,"params":{"name":"rocket","label":"Launch"}} --></head><body><template><style>#root{position:absolute;inset:0}</style><div id="root"></div></template></body></html>`;
    writeFileSync(join(job, 'compositions', 'ic1.html'), comp);
    const idx = join(job, 'index.html');
    writeFileSync(idx, readFileSync(idx, 'utf8').replace(/(<div id="slop")/, '<div id="ic1" data-composition-id="ic1" data-composition-src="compositions/ic1.html" data-start="4" data-duration="1" data-track-index="21" data-width="1080" data-height="1920"></div>\n      $1'));
    res = check(readJob(job), RULES, ALLOW);
    const has = (rule, id, level) => res.findings.some((f) => f.rule === rule && f.where === `#${id}` && f.level === level);
    pass = ok('BAN emoji, with its block', has('emoji', 'slop', 'BAN')) && pass;
    pass = ok('BAN multiplier-stat, with its block', has('multiplier-stat', 'slop', 'BAN')) && pass;
    pass = ok('slop-icon, with its block', has('slop-icon', 'ic1', RULES['slop-icon'].level)) && pass;
    pass = ok('WARN slop-copy, with its block', has('slop-copy', 'slop', 'WARN')) && pass;
    // the same block: a finding without the look, allowed with it
    const block = { id: 'b1', kind: 'style', start: 0, end: 2, texts: ['Say *this* once'], icons: [], media: false, font: null, grounds: [], inks: [], glass: false, glows: [], eases: [], presetCaptions: false };
    const J = (styles) => ({ duration: 10, blocks: [block], media: [], sounds: [], styles: new Set(styles), features: new Set(), transitions: null, cues: null, script: [], brand: {} });
    const plainRes = check(J([]), RULES, ALLOW);
    const infoRes = check(J(['info-graphics']), RULES, ALLOW);
    pass = ok('an allowance moves a finding to the allowed list', plainRes.findings.some((f) => f.rule === 'one-accent-word')
      && infoRes.allowed.some((f) => f.rule === 'one-accent-word' && f.allowedBy === 'info-graphics') && !infoRes.findings.length) && pass;
  } catch (e) {
    pass = ok('demo', false, e.message);
  } finally {
    rmSync(job, { recursive: true, force: true });
  }
  console.log(pass ? '\nstyle-anti-ai demo: all checks pass' : '\nstyle-anti-ai demo: FAILED');
  return pass;
}

const argv = process.argv.slice(2);
const a = { _: [] };
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) { a._.push(argv[i]); continue; }
  const v = argv[i + 1];
  if (v !== undefined && !v.startsWith('--')) { a[argv[i].slice(2)] = v; i++; } else a[argv[i].slice(2)] = true;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const RULES = jsonBlock('rules.md');
  const ALLOW = jsonBlock('style-allowances.md');
  const target = a._[0];
  if (!target) { console.log('Usage: check.mjs <job> [--frames] [--sheet png] | calibrate [--jobs dir] [--frames]'); process.exit(2); }
  try {
    if (target === 'calibrate') process.exit(await calibrate(a, RULES, ALLOW));
    if (target === 'demo') process.exit((await demo(RULES, ALLOW)) ? 0 : 1);
    const job = [resolve(target), join(ROOT, target)].find((p) => existsSync(join(p, 'index.html')));
    if (!job) throw new Error(`Not a job folder: ${target}`);
    const res = await runJob(job, a, RULES, ALLOW);
    process.exit(res.bans ? 1 : 0);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
