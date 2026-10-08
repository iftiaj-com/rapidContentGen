// Build a job's main composition from its beat sheet (the `build` hints that
// `rcg recipe plan` writes): footage shots in camera wrappers (full frame or a
// card over a background), black cards, the music with fades and ducking under
// the voice, voice lines, transition sounds, white flashes, layer order, then
// camera cues per wrapper (rcg camera) and speed ramps (rcg ramp).
//
// Re-runnable: everything it writes sits between rcg:assemble markers and is
// replaced on the next run. Sub-composition blocks (three, flythrough, shader,
// beat-flash, titles, captions) are added by their own commands (rcg recipe build).
//
// Usage: node tools/jobs/assemble.mjs --job <dir> [--sheet <dir>/beat-sheet.json]

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { applyCamera } from '../blocks/camera.mjs';
import { musicLane } from '../blocks/flythrough.mjs';
import { applyRamp } from '../blocks/ramp.mjs';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { ROOT, readJson } from '../lib/config.mjs';
import { validateBeatSheet } from './beat-sheet.mjs';

const CARD = { x: 150, y: 250, w: 780, h: 1387, radius: 32 }; // 9:16 card, clear of the bottom 20% band's caption line
const f3 = (n) => +Number(n).toFixed(3);

function sfxEntry(name) {
  const m = readJson(join(ROOT, 'library', 'sfx', 'manifest.json'));
  const list = Array.isArray(m) ? m : m.sounds || Object.values(m);
  const e = list.find((s) => s.file === name || s.file === `${name}.mp3` || s.file.replace(/\.\w+$/, '') === name);
  if (!e) throw new Error(`Unknown SFX "${name}" (library/sfx/manifest.json)`);
  return e;
}

/** Remove the template's demo shot, letterbox, sample card and audio comment (once). */
function stripTemplateDemo(html) {
  return html
    .replace(/\s*<!-- Shots:[\s\S]*?<\/video>\s*<\/div>/, '')
    .replace(/\s*<!-- Letterbox[\s\S]*?<div id="bar-bottom"[^>]*><\/div>/, '')
    .replace(/\s*<!-- Text cards:[\s\S]*?<div id="t1"[^>]*>.*?<\/div>/, '')
    .replace(/\s*<!-- Audio goes here[\s\S]*?-->/, '')
    .replace('card("#t1", 0.2, 2.5);\n', '');
}

function replaceRegion(html, begin, end, content, insertAt) {
  const re = new RegExp(`${begin.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`);
  const block = `${begin}\n${content}\n${end}`;
  if (re.test(html)) return html.replace(re, block);
  return insertAt(html, block);
}

export async function assemble(opts) {
  const jobDir = resolve(opts.job);
  const sheetPath = resolve(opts.sheet || join(jobDir, 'beat-sheet.json'));
  const sheet = readJson(sheetPath);
  const { errors } = validateBeatSheet(sheet);
  if (errors.length) throw new Error(`Beat sheet does not validate:\n  ${errors.join('\n  ')}`);
  const build = sheet.build || {};
  const D = Number(sheet.format.duration);
  const grades = readJson(join(ROOT, 'library', 'recipes', 'grades.json'));
  const indexPath = join(jobDir, 'index.html');
  let html = stripTemplateDemo(readFileSync(indexPath, 'utf8'));
  const report = { shots: 0, wrappers: 0, black: 0, flashes: 0, sfx: 0, voice: 0, ramps: 0, warnings: [] };

  // 1. Shots, grouped into their wrappers (one camera target per wrapper).
  const wrappers = new Map();
  const blacks = [];
  const flashes = [];
  const sfx = [];
  sheet.beats.forEach((b, i) => {
    const hint = b.build || {};
    if (hint.block === 'black') blacks.push({ id: `black${blacks.length + 1}`, start: b.start, end: b.end });
    if (hint.shot) {
      const w = hint.shot.wrapper;
      if (!wrappers.has(w)) wrappers.set(w, { id: w, layout: hint.shot.layout || 'full', shots: [] });
      wrappers.get(w).shots.push({ id: `v${i + 1}`, beat: b, shot: hint.shot, grade: hint.grade });
    }
    for (const f of hint.fx || []) if (f.type === 'flash') flashes.push(f.at);
    for (const s of hint.sfx || []) sfx.push(s);
  });

  const lines = [];
  for (const w of wrappers.values()) {
    const vids = w.shots.map((s) => {
      const g = s.grade && grades[s.grade] ? ` data-color-grading='${JSON.stringify(grades[s.grade].grading)}'` : '';
      if (s.grade && !grades[s.grade]) report.warnings.push(`Unknown grade "${s.grade}" on ${s.id}`);
      report.shots++;
      return `        <video id="${s.id}" class="clip" src="${s.shot.src}" data-start="${f3(s.beat.start)}" data-duration="${f3(s.beat.end - s.beat.start)}" data-media-start="${f3(s.shot.mediaStart || 0)}" data-track-index="1"${g} muted playsinline></video>`;
    }).join('\n');
    report.wrappers++;
    const inner = `      <div id="${w.id}" class="shot">\n${vids}\n      </div>`;
    // The card frame stays untimed (videos may not nest in a timed element) and has no shadow:
    // empty, it is invisible. The shadow is its own timed clip spanning the shots; on the frame
    // it stayed on screen over every later section (R5 cool-down).
    const span = { start: Math.min(...w.shots.map((x) => x.beat.start)), end: Math.max(...w.shots.map((x) => x.beat.end)) };
    if (w.layout === 'card') {
      lines.push(`      <div id="${w.id}-shadow" class="rcg-cardshadow clip" data-start="${f3(span.start)}" data-duration="${f3(span.end - span.start)}" data-track-index="3"></div>`);
      lines.push(`      <div id="${w.id}-frame" class="rcg-cardframe">\n${inner.replace(/^/gm, '  ')}\n      </div>`);
    } else lines.push(inner);
  }
  for (const k of blacks) {
    lines.push(`      <div id="${k.id}" class="rcg-black clip" data-start="${f3(k.start)}" data-duration="${f3(k.end - k.start)}" data-track-index="2"></div>`);
    report.black++;
  }
  if (flashes.length) lines.push('      <div id="rcg-flash" class="rcg-flash"></div>');

  // 2. Audio: voice lines (from audio_meta.json), music with fades + duck under the voice, SFX.
  const voiceSlots = build.voice?.slots || [];
  const metaPath = join(jobDir, 'assets', 'voice', 'audio_meta.json');
  const meta = existsSync(metaPath) ? readJson(metaPath) : null;
  const placed = [];
  for (const slot of voiceSlots) {
    const v = meta?.voices?.find((x) => x.id === slot.id);
    if (!v) { report.warnings.push(`Voice ${slot.id} not generated yet (rcg voice say); skipped`); continue; }
    const dur = f3(v.duration_s);
    if (slot.at + dur > D) report.warnings.push(`Voice ${slot.id} runs past the end (${f3(slot.at + dur)} > ${D})`);
    placed.push({ start: slot.at, duration: dur });
    lines.push(`      <audio id="${slot.id}" src="assets/voice/${slot.id}.wav" data-start="${f3(slot.at)}" data-duration="${dur}" data-track-index="22"></audio>`);
    report.voice++;
  }
  if (build.music?.src) {
    const m = build.music;
    if (!existsSync(join(jobDir, m.src))) throw new Error(`Music not found: ${m.src}`);
    const lane = musicLane({ total: D, fadeIn: m.fadeIn || 0, fadeOut: m.fadeOut || 0, volume: m.volume ?? 1, ducks: m.duck ? placed : [], duckLevel: typeof m.duck === 'number' ? m.duck : 0.5 });
    lines.push(`      <audio id="music" src="${m.src}" data-start="0" data-duration="${D}" data-media-start="${m.offset || 0}" data-track-index="21"\n        data-automation='${JSON.stringify({ version: 1, lanes: [{ target: 'volume', points: lane }] })}'></audio>`);
  }
  sfx.forEach((s, k) => {
    const e = sfxEntry(s.name);
    mkdirSync(join(jobDir, 'assets', 'sfx'), { recursive: true });
    if (!existsSync(join(jobDir, 'assets', 'sfx', e.file))) copyFileSync(join(ROOT, 'library', 'sfx', e.file), join(jobDir, 'assets', 'sfx', e.file));
    const start = Math.max(0, s.align === 'start' ? s.landing : s.landing - (e.peakS ?? e.crestStartS ?? 0));
    lines.push(`      <audio id="sfx${k + 1}" src="assets/sfx/${e.file}" data-start="${f3(start)}" data-duration="${e.durationS}" data-volume="${s.volume ?? 0.5}" data-track-index="${40 + (k % 8)}"></audio>`);
    report.sfx++;
  });

  html = replaceRegion(html, '      <!-- rcg:assemble begin (generated by tools/jobs/assemble.mjs; regenerate instead of editing) -->', '      <!-- rcg:assemble end -->', lines.join('\n'), (h, block) => {
    const rootOpen = h.match(/<div[^>]*data-composition-id="main"[^>]*>/);
    const at = rootOpen.index + rootOpen[0].length;
    return `${h.slice(0, at)}\n${block}${h.slice(at)}`;
  });

  // 3. CSS: card frames, black cards, flash, and the layer order of every block.
  const layers = Object.entries(build.layers || {}).map(([id, z]) => `      #${id} { z-index: ${z}; }`).join('\n');
  const css = `      .rcg-cardframe { position: absolute; left: ${CARD.x}px; top: ${CARD.y}px; width: ${CARD.w}px; height: ${CARD.h}px; border-radius: ${CARD.radius}px; overflow: hidden; z-index: 2; }
      .rcg-cardshadow { position: absolute; left: ${CARD.x}px; top: ${CARD.y}px; width: ${CARD.w}px; height: ${CARD.h}px; border-radius: ${CARD.radius}px; z-index: 1; box-shadow: 0 30px 90px rgba(0, 0, 0, 0.55); }
      .rcg-cardframe .shot { inset: 0; width: ${CARD.w}px; height: ${CARD.h}px; }
      .rcg-cardframe .shot video { width: ${CARD.w}px; height: ${CARD.h}px; }
      .rcg-black { position: absolute; inset: 0; background: #000; z-index: 3; }
      .rcg-flash { position: absolute; inset: 0; background: #fff; opacity: 0; z-index: 9; pointer-events: none; }
${layers}`;
  html = replaceRegion(html, '      /* rcg:assemble css begin */', '      /* rcg:assemble css end */', css, (h, block) => h.replace('    </style>', `${block}\n    </style>`));

  // 4. Flash tweens on the main timeline.
  const flashJs = flashes.sort((a, b) => a - b).map((t) => `      tl.fromTo("#rcg-flash", { opacity: 0 }, { opacity: 0.9, duration: 0.05, ease: "none" }, ${f3(Math.max(0, t - 0.05))});\n      tl.to("#rcg-flash", { opacity: 0, duration: 0.3, ease: "power2.out" }, ${f3(t)});`).join('\n');
  html = replaceRegion(html, '      // rcg:assemble script begin', '      // rcg:assemble script end', flashJs || '      // (no flashes)', (h, block) => {
    const reg = h.lastIndexOf('window.__timelines');
    const lineStart = h.lastIndexOf('\n', reg) + 1;
    return `${h.slice(0, lineStart)}${block}\n${h.slice(lineStart)}`;
  });
  report.flashes = flashes.length;

  // 5. Root duration, then a compile check of the inline scripts.
  html = html.replace(/(<div[^>]*data-composition-id="main"[^>]*?)data-duration="[^"]*"/, `$1data-duration="${D}"`);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
  writeFileSync(indexPath, html);

  // 6. Cameras per wrapper, then ramps (both edit index.html in place).
  for (const [id, w] of Object.entries(build.wrappers || {})) {
    if (!w.cues?.length) continue;
    const res = await applyCamera({ job: jobDir, target: `#${id}`, cue: w.cues, id: `cam-${id}`, ...(w.kick && build.music?.src ? { kick: join(jobDir, build.music.src), 'audio-offset': build.music.offset || 0 } : {}) });
    report.warnings.push(...res.warnings);
  }
  for (const [i, b] of sheet.beats.entries()) {
    const r = b.build?.ramp;
    if (!r || !b.build?.shot) continue;
    await applyRamp({ job: jobDir, target: `v${i + 1}`, audio: join(jobDir, build.music.src), 'audio-offset': (build.music.offset || 0) + b.start, min: r.min ?? 1, max: r.max ?? 2 });
    report.ramps++;
  }
  return report;
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job) {
    console.error('Usage: assemble.mjs --job <dir> [--sheet <beat-sheet.json>]');
    process.exit(2);
  }
  const r = await assemble(a);
  console.log(`Assembled: ${r.shots} shots in ${r.wrappers} wrappers, ${r.black} black cards, ${r.flashes} flashes, ${r.voice} voice lines, ${r.sfx} sounds, ${r.ramps} ramps`);
  for (const w of r.warnings) console.log(`WARNING: ${w}`);
}
