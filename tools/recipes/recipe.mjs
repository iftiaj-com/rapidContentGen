// Recipes: turn a named edit style into a beat-sheet draft locked to the music,
// then build the job from the edited sheet.
//
//   rcg recipe list
//   rcg recipe show <style|section>
//   rcg recipe plan --job <dir> --recipe <style> --duration 24 [--video assets/x.mp4] [--music assets/song-limited.wav]
//                   [--beats data/audiomap.json] [--offset 0] [--seed 1] [--title "TEXT"]
//   rcg recipe commands --job <dir>      (print the build commands for the edited sheet)
//   rcg recipe build --job <dir> [--dry-run]
//
// plan writes beat-sheet.json (+ .md), data/vo-lines.json (when the style is voiced),
// data/flythrough-N.json (card sections, stills cut from the footage), and leaves
// <PLACEHOLDERS> for the words, titles and beat-flash words. Write those, then build.
// Recipes: library/recipes/styles.json and sections.json; schema: docs/recipes.md.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { ROOT, readJson } from '../lib/config.mjs';
import { extractFrame, probe } from '../lib/ffmpeg.mjs';
import { validateBeatSheet } from '../jobs/beat-sheet.mjs';
import { mulberry32, pickSeekTime } from './timeremap.mjs';

const RECIPES = join(ROOT, 'library', 'recipes');
const { snapArrivalsToBeats } = await import(pathToFileURL(join(ROOT, 'library', 'flow', 'beatSnap.js')).href);
const PLACEHOLDER = /<[A-Z][A-Z0-9 _|-]*>/;
const f3 = (n) => +Number(n).toFixed(3);
const rcg = (...args) => ['tools/rcg.mjs', ...args.map(String)];

export const loadStyles = () => readJson(join(RECIPES, 'styles.json'));
export const loadSections = () => readJson(join(RECIPES, 'sections.json'));

function nearest(list, t, after = -Infinity) {
  let best = null;
  for (const x of list) if (x > after && (best === null || Math.abs(x - t) < Math.abs(best - t))) best = x;
  return best;
}

/** Split [a, b] by weights, snapping inner boundaries to the grid (keeps at least minGap apart). */
function splitSnapped(a, b, weights, grid, minGap) {
  const W = weights.reduce((s, w) => s + w, 0);
  const out = [a];
  let acc = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    acc += weights[i];
    const target = a + ((b - a) * acc) / W;
    const snapped = nearest(grid.filter((g) => g < b - minGap), target, out[out.length - 1] + minGap);
    out.push(snapped !== null && Math.abs(snapped - target) < (b - a) / weights.length ? snapped : target);
  }
  out.push(b);
  return out;
}

/** "b@end-0.5:whip_pan_right" -> "b/12.345:whip_pan_right" for a shot [start, end]. */
function resolveCue(tpl, start, end) {
  const m = tpl.match(/^([a-z])@([^:]+):(.*)$/);
  if (!m) throw new Error(`Bad camera template "${tpl}" (layer@time:move[:opts])`);
  const [, layer, when, rest] = m;
  let t = when.startsWith('end') ? end - Number(when.slice(4) || 0) : start + Number(when);
  t = Math.min(Math.max(t, start), Math.max(start, end - 0.05));
  return `${layer}/${f3(t)}:${rest}`;
}

export async function plan(opts) {
  const jobDir = resolve(opts.job);
  const styles = loadStyles();
  const sections = loadSections();
  const style = styles[opts.recipe];
  if (!style) throw new Error(`Unknown recipe "${opts.recipe}". One of: ${Object.keys(styles).filter((k) => !k.startsWith('$')).join(', ')}`);
  const target = Number(opts.duration);
  if (!(target > 2)) throw new Error('--duration <seconds> is required');
  const seed = Number(opts.seed ?? 1);
  const rand = mulberry32(seed);
  const assets = join(jobDir, 'assets');
  const video = opts.video || `assets/${readdirSync(assets).find((f) => /\.(mp4|mov|webm|mkv)$/i.test(f) && !/poster/.test(f))}`;
  if (!existsSync(join(jobDir, video))) throw new Error(`Video not found: ${video}`);
  const vinfo = await probe(join(jobDir, video));
  const music = opts.music || (existsSync(join(assets, 'song-limited.wav')) ? 'assets/song-limited.wav' : null);
  const offset = Number(opts.offset || 0);
  const beatsFile = opts.beats || 'data/audiomap.json';
  if (style.needs.music && !music) throw new Error('This recipe needs music: limit it first (rcg limit) or pass --music.');
  if (!existsSync(join(jobDir, beatsFile))) throw new Error(`Beat grid not found: ${beatsFile}. Run analyze-beatgrid.py (docs/capabilities.md).`);
  const am = readJson(join(jobDir, beatsFile));
  const grid = am.grid || am;
  const downbeats = grid.downbeats_sec.map((t) => t - offset).filter((t) => t > 0.05);
  const beats = grid.beats_sec.map((t) => t - offset).filter((t) => t > 0.05);
  const beatInt = beats.length > 2 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 0.5;

  // 1. Section bounds snapped to downbeats; the end lands on the downbeat nearest the target.
  const secs = style.sections.map((s) => ({ ...sections[s.use], ...s, name: s.use }));
  for (const s of secs) if (!sections[s.name]) throw new Error(`Recipe ${opts.recipe} uses unknown section ${s.name}`);
  const end = opts.exact ? target : nearest(downbeats, target) ?? target;
  const bounds = splitSnapped(0, end, secs.map((s) => s.weight), downbeats, beatInt * 2);

  // 2. Shots per section, snapped to beats; footage picks via the TimeRemap port.
  const beatsOut = [];
  const wrappers = {};
  const blocks = [];
  const layers = {};
  const voiceSlots = [];
  let lastPick = null;
  let cursor = null; // source time where a linear shot continues
  let voiceN = 0;
  const planWarnings = [];
  const voices = style.voice?.voices || [];
  secs.forEach((sec, si) => {
    const a = bounds[si];
    const b = bounds[si + 1];
    const len = b - a;
    const block = sec.block || 'footage';
    const wrapper = `w${si + 1}`;
    let segs;
    if (sec.repeat) {
      const n = Math.max(2, Math.round(len / ((sec.shotBeats || 2) * beatInt)));
      segs = Array.from({ length: n }, (_, k) => sec.segments[k % sec.segments.length]);
    } else segs = sec.segments;
    const cuts = segs.length > 1 ? splitSnapped(a, b, segs.map((s) => s.weight), beats, 0.35) : [a, b];

    // Section-level blocks.
    if (block === 'three') {
      const t = sec.three;
      const local = downbeats.filter((d) => d > a + 0.05 && d < b - 0.2).map((d) => d - a);
      const cues = [t.base, ...local.map((d, k) => `b/${f3(d)}:${k % 2 ? t.alternate : t.downbeat}`)];
      blocks.push({ type: 'three', id: `three-${si + 1}`, start: f3(a), duration: f3(len), scene: t.scene, bg: t.bg, cues });
      layers[`three-${si + 1}`] = 3;
    }
    if (block === 'flythrough') {
      const f = sec.flythrough;
      // At least two beats per card; cards shorter than a bar land on beats, not downbeats
      // (a 2-bar section has only two downbeats for four cards).
      const n = Math.max(2, Math.min(f.cards, Math.floor(len / (beatInt * 2))));
      const cycle = len / n;
      const gridName = cycle >= beatInt * 4 * 0.9 ? 'downbeats' : 'beats';
      const arrival = f3(Math.min(0.8, cycle * 0.45));
      const cards = Array.from({ length: n }, (_, k) => {
        const at = pickSeekTime({ mode: 'random' }, vinfo.duration, 0.1, lastPick, rand);
        lastPick = at;
        return {
          src: `assets/cards/fly${si + 1}-${k + 1}.jpg`, at: f3(at), ratio: f.ratios[k % f.ratios.length],
          arrivalTime: arrival, duration: f3(cycle - arrival), pathStyle: f.paths[k % f.paths.length],
          entrance: f.entrances[k % f.entrances.length], zoom: 1, sound: { sfx: f.sound, volume: 0.3, align: 'crest' },
        };
      });
      // Pre-run the beat snap so the last dwell can be trimmed to end exactly on the section end.
      const snapped = snapArrivalsToBeats(cards, gridName === 'downbeats' ? grid.downbeats_sec : grid.beats_sec, offset + a);
      const total = snapped.reduce((s, c) => s + c.arrivalTime + c.duration, 0);
      cards[n - 1].duration = f3(Math.max(0.4, cards[n - 1].duration + (len - total)));
      const fitted = total - (snapped[n - 1].duration - cards[n - 1].duration);
      if (fitted > len + 0.05) planWarnings.push(`${sec.name}: the flythrough runs ${f3(fitted)} s in a ${f3(len)} s section; give it more weight or fewer cards`);
      const spec = {
        id: `fly-${si + 1}`,
        settings: { motion: f.motion, arrangement: 'none', template: f.template, spacing: f.spacing, cardScale: 0.8, radius: 24, background: f.background },
        snap: { beats: beatsFile, grid: gridName, offset: f3(offset + a) },
        cards: cards.map(({ at, ...c }) => c),
        stills: cards.map((c) => ({ src: c.src, from: video, at: c.at })),
      };
      blocks.push({ type: 'flythrough', id: spec.id, start: f3(a), spec: `data/flythrough-${si + 1}.json`, specDoc: spec });
      layers[spec.id] = 3;
    }
    if (sec.layout === 'card' && sec.background?.shader) {
      // Back-to-back sections on the same shader share one block, so its clock does not restart.
      const prev = blocks.filter((x) => x.type === 'shader').pop();
      if (prev && prev.shader === sec.background.shader && Math.abs(prev.start + prev.duration - a) < 1e-3) prev.duration = f3(b - prev.start);
      else {
        blocks.push({ type: 'shader', id: `sh-${si + 1}`, start: f3(a), duration: f3(len), shader: sec.background.shader });
        layers[`sh-${si + 1}`] = 0;
      }
    }
    if (segs.some((s) => s.text === 'beatflash') && style.text?.beatflash) {
      blocks.push({ type: 'beatflash', id: `flash-${si + 1}`, start: f3(a), duration: f3(len), words: '<BEATFLASH WORDS|ONE|TWO>', ...style.text.beatflash });
      layers[`flash-${si + 1}`] = 6;
    }
    if (style.needs.voice) {
      voiceN++;
      const id = `vo${voiceN}`;
      voiceSlots.push({ id, at: f3(a + 0.25), maxDuration: f3(len - 0.5), voice: voices[(voiceN - 1) % Math.max(1, voices.length)] || 'af_heart', words: Math.max(2, Math.floor((len - 0.5) * 2.6)) });
      if (style.text?.captions) {
        blocks.push({ type: 'captions', id: `cap-${id}`, voice: id, start: f3(a + 0.25), ...style.text.captions });
        layers[`cap-${id}`] = 8;
      }
    }

    // Rows.
    segs.forEach((seg, k) => {
      const s = cuts[k];
      const e = cuts[k + 1];
      const row = { start: f3(s), end: f3(e), words: '', onScreen: '', text: [], sound: '', build: { section: sec.name, block: seg.block || block } };
      const desc = [];
      const sound = [music ? 'Music' : 'No music'];
      if ((seg.block || block) === 'footage') {
        const mode = typeof seg.timefx === 'object' ? seg.timefx : { mode: seg.timefx || 'random' };
        const need = (e - s) * (seg.ramp ? seg.ramp.max || 2 : 1) + 0.1;
        let at = cursor !== null && mode.mode === 'linear' && cursor + need < vinfo.duration ? cursor : pickSeekTime(mode.mode === 'linear' ? { mode: 'random' } : mode, vinfo.duration, need, lastPick, rand);
        at = f3(Math.max(0, Math.min(at, vinfo.duration - need)));
        lastPick = at;
        cursor = at + need - 0.1;
        row.build.shot = { wrapper, src: video, mediaStart: at, layout: sec.layout || 'full' };
        row.build.grade = seg.grade || null;
        const cues = (seg.camera || []).map((tpl) => resolveCue(tpl, s, e));
        wrappers[wrapper] = wrappers[wrapper] || { layout: sec.layout || 'full', kick: Boolean(sec.kick), cues: [] };
        wrappers[wrapper].cues.push(...cues);
        layers[wrapper] = sec.layout === 'card' ? 2 : 1;
        desc.push(`${sec.layout === 'card' ? 'Footage card' : 'Footage'} src ${at.toFixed(2)}-${(at + (e - s)).toFixed(2)}${seg.ramp ? ` (speed ramp ${seg.ramp.min}-${seg.ramp.max}x)` : ''}`);
        desc.push(`camera ${cues.map((c) => c.split(':')[1]).join(' + ') || 'static'}`);
        if (seg.grade) desc.push(`${seg.grade} grade`);
        if (sec.layout === 'card' && sec.background?.shader) desc.push(`over shader ${sec.background.shader}`);
        if (seg.ramp) row.build.ramp = seg.ramp;
      } else if ((seg.block || block) === 'three') desc.push(`3D ${sec.three.scene}: orbit, crash zooms on the downbeats`);
      else if ((seg.block || block) === 'flythrough') { const fb = blocks.find((x) => x.type === 'flythrough' && x.start === f3(a)); desc.push(`Card flythrough: ${fb ? fb.specDoc.cards.length : sec.flythrough.cards} stills from the footage, arrivals snapped to the ${fb ? fb.specDoc.snap.grid : 'downbeats'}`); }
      else if ((seg.block || block) === 'black') desc.push('Black card');
      row.build.fx = (seg.fx || []).map((f) => ({ type: f.split('@')[0], at: f3(f.endsWith('@end') ? e : s) }));
      if (row.build.fx.length) desc.push('white flash');
      row.build.sfx = (seg.sfx || []).map((x) => ({ name: x.name, landing: f3(x.at === 'end' ? e : x.at === 'start' ? s : s + Number(x.at)), align: x.align || 'crest', volume: x.volume ?? 0.3 }));
      for (const x of row.build.sfx) sound.push(`${x.name} at ${x.landing}`);
      if ((seg.block || block) === 'flythrough') sound.push(`${sec.flythrough.sound} on each arrival`);
      if (seg.text === 'title') {
        const pos = (seg.block || block) === 'black' ? 'black-card' : 'top-band';
        const titleN = blocks.filter((x) => x.type === 'title').length + 1;
        const text = titleN === 1 && opts.title ? String(opts.title) : '<TITLE TEXT>';
        row.text.push({ content: text, position: pos, at: f3(s + 0.15) });
        // A title stays up to the end of its section (at most 2.6 s), not just its segment.
        blocks.push({ type: 'title', id: `title-${titleN}`, start: f3(s + 0.15), duration: f3(Math.min(b - s - 0.2, 2.6)), text, position: pos === 'black-card' ? 'center' : 'top-band', ...style.text.title, beat: beatsOut.length });
        layers[`title-${titleN}`] = 7;
      }
      if (seg.text === 'beatflash') desc.push('beat-flash words');
      if (k === 0 && style.needs.voice) {
        const slot = voiceSlots[voiceSlots.length - 1];
        row.words = `<VOICE ${slot.id}: about ${slot.words} words>`;
        row.build.voice = slot.id;
        sound.push(`Voice ${slot.id} at ${slot.at}`);
      } else row.words = style.needs.voice ? '(voice continues)' : 'None (music only)';
      row.onScreen = desc.join('; ');
      row.sound = sound.join('; ');
      beatsOut.push(row);
    });
  });

  // 3. Data files: stills for card sections, flythrough specs, voice-line skeleton.
  mkdirSync(join(jobDir, 'data'), { recursive: true });
  for (const blk of blocks.filter((x) => x.type === 'flythrough')) {
    mkdirSync(join(jobDir, 'assets', 'cards'), { recursive: true });
    for (const s of blk.specDoc.stills) await extractFrame(join(jobDir, s.from), s.at, join(jobDir, s.src));
    const { stills, ...doc } = blk.specDoc;
    writeFileSync(join(jobDir, blk.spec), `${JSON.stringify(doc, null, 2)}\n`);
    delete blk.specDoc;
  }
  if (voiceSlots.length && !existsSync(join(jobDir, 'data', 'vo-lines.json'))) {
    writeFileSync(join(jobDir, 'data', 'vo-lines.json'), `${JSON.stringify(voiceSlots.map((v) => ({ id: v.id, text: `<VOICE ${v.id}>`, voice: v.voice })), null, 2)}\n`);
  }
  for (const [id, w] of Object.entries(wrappers)) w.cues = [...new Set(w.cues)];

  const doc = {
    version: 1,
    title: opts.title || style.label,
    mode: opts.mode || 'b',
    format: { width: 1080, height: 1920, fps: 24, duration: f3(end) },
    summary: `${style.label} (recipe ${opts.recipe}, seed ${seed}): ${style.use}`,
    beats: beatsOut,
    notes: [
      `Planned by rcg recipe plan: sections ${secs.map((s, i) => `${s.name} ${f3(bounds[i])}-${f3(bounds[i + 1])}`).join(', ')}.`,
      'Replace every <PLACEHOLDER> (words, titles, beat-flash words, data/vo-lines.json), then rcg recipe build.',
      ...(style.status !== 'ready' ? [`Recipe status: ${style.status}`] : []),
    ],
    build: {
      recipe: opts.recipe, seed, video,
      music: music ? { src: music, offset, fadeIn: style.music?.fadeIn || 0, fadeOut: style.music?.fadeOut || 0, duck: style.voice?.duck ?? false, volume: style.music?.volume ?? 1 } : null,
      grid: beatsFile,
      // Voice peaks held low: voice, ducked music and SFX overlap (R5 reached +1.4 dBTP at -1.5).
      voice: voiceSlots.length ? { slots: voiceSlots, lufs: style.voice?.lufs ?? -13.5, ceiling: style.voice?.ceiling ?? -1.5 } : null,
      wrappers, blocks, layers,
    },
  };
  const v = validateBeatSheet(doc);
  if (v.errors.length) throw new Error(`Planned sheet does not validate:\n  ${v.errors.join('\n  ')}`);
  writeFileSync(join(jobDir, 'beat-sheet.json'), `${JSON.stringify(doc, null, 2)}\n`);
  return { doc, warnings: [...planWarnings, ...v.warnings] };
}

/** Commands that build a planned job, in order (each an argv for node). */
export function buildCommands(jobDir) {
  const sheet = readJson(join(jobDir, 'beat-sheet.json'));
  const b = sheet.build;
  if (!b) throw new Error('beat-sheet.json has no build section (plan it with rcg recipe plan).');
  const J = relative(ROOT, jobDir).split('\\').join('/');
  const left = [];
  const scan = (v, where) => { if (typeof v === 'string' && PLACEHOLDER.test(v)) left.push(`${where}: ${v}`); };
  sheet.beats.forEach((r, i) => { scan(r.words, `beats[${i}].words`); (r.text || []).forEach((t, k) => scan(t.content, `beats[${i}].text[${k}]`)); });
  for (const blk of b.blocks) { scan(blk.words, `${blk.id}.words`); scan(blk.text, `${blk.id}.text`); }
  if (b.voice) for (const l of readJson(join(jobDir, 'data', 'vo-lines.json'))) scan(l.text, `vo-lines ${l.id}`);
  if (left.length) throw new Error(`Fill these placeholders first:\n  ${left.join('\n  ')}`);

  const music = b.music ? `${J}/${b.music.src}` : null;
  const off = (t) => f3((b.music?.offset || 0) + t);
  const cmds = [];
  if (b.voice) {
    cmds.push(rcg('voice', 'say', '--lines', `${J}/data/vo-lines.json`, '--out-dir', `${J}/assets/voice`));
    cmds.push(rcg('level', '--dir', `${J}/assets/voice`, '--lufs', b.voice.lufs, '--ceiling', b.voice.ceiling ?? -1.5));
  }
  cmds.push(rcg('assemble', '--job', J));
  for (const x of b.blocks) {
    if (x.type === 'three') cmds.push(rcg('three', '--job', J, '--scene', x.scene, '--bg', x.bg, ...(music ? ['--audio', music, '--audio-offset', off(x.start)] : []), '--start', x.start, '--duration', x.duration, '--id', x.id, '--track', 3, ...x.cues.flatMap((c) => ['--cue', c]), '--insert'));
    if (x.type === 'flythrough') cmds.push(rcg('flythrough', '--job', J, '--spec', `${J}/${x.spec}`, '--start', x.start, '--id', x.id, '--track', 4, '--insert'));
    if (x.type === 'shader') cmds.push(rcg('shader', '--job', J, '--shader', x.shader, ...(music ? ['--audio', music, '--audio-offset', off(x.start)] : []), '--fit', 'fill', '--start', x.start, '--duration', x.duration, '--id', x.id, '--track', 0, '--insert'));
    if (x.type === 'beatflash') cmds.push(rcg('beatflash', '--job', J, '--words', x.words, '--audio', music, '--audio-offset', off(x.start), '--source', x.source, '--effect', x.effect, '--style', x.style, '--position', 'top-band', '--start', x.start, '--duration', x.duration, '--id', x.id, '--insert'));
    if (x.type === 'title') cmds.push(rcg('title', '--job', J, '--text', sheet.beats[x.beat]?.text?.[0]?.content ?? x.text, '--preset', x.preset, '--style', x.style, '--position', x.position, '--start', x.start, '--duration', x.duration, '--id', x.id, '--insert'));
    if (x.type === 'captions') cmds.push(rcg('captions', '--job', J, '--words', `${J}/assets/voice/audio_meta.json`, '--voice', x.voice, '--style', x.style, '--mode', x.mode, '--start', x.start, '--id', x.id, '--insert'));
  }
  cmds.push(rcg('mix-check', `${J}/index.html`));
  cmds.push(rcg('hf', '--cwd', J, 'check'));
  return cmds;
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const cmd = a._[0];
  if (cmd === 'list') {
    const styles = loadStyles();
    const sections = loadSections();
    console.log('Styles (whole edits):');
    for (const [k, s] of Object.entries(styles)) if (!k.startsWith('$')) console.log(`  ${k.padEnd(18)} ${s.status === 'ready' ? '' : '[partial] '}${s.use}`);
    console.log('Sections (building blocks):');
    for (const [k, s] of Object.entries(sections)) if (!k.startsWith('$')) console.log(`  ${k.padEnd(18)} ${s.when}`);
  } else if (cmd === 'show') {
    const name = a._[1];
    const doc = loadStyles()[name] || loadSections()[name];
    if (!doc) throw new Error(`No style or section "${name}"`);
    console.log(JSON.stringify(doc, null, 2));
  } else if (cmd === 'plan') {
    const { doc, warnings } = await plan(a);
    execFileSync(process.execPath, [join(ROOT, 'tools', 'jobs', 'beat-sheet.mjs'), 'md', join(resolve(a.job), 'beat-sheet.json'), join(resolve(a.job), 'beat-sheet.md')], { stdio: 'inherit' });
    console.log(`Planned ${doc.beats.length} beats over ${doc.format.duration} s; ${doc.build.blocks.length} blocks; wrappers ${Object.keys(doc.build.wrappers).join(', ') || 'none'}`);
    for (const w of warnings) console.log(`WARNING: ${w}`);
    console.log('Next: replace the <PLACEHOLDERS>, then rcg recipe build --job ' + a.job);
  } else if (cmd === 'commands' || cmd === 'build') {
    const jobDir = resolve(a.job);
    const cmds = buildCommands(jobDir);
    for (const c of cmds) {
      console.log(`> node ${c.map((x) => (/[\s|"<>]/.test(x) ? JSON.stringify(x) : x)).join(' ')}`);
      if (cmd === 'build' && !a['dry-run']) execFileSync(process.execPath, c, { cwd: ROOT, stdio: 'inherit' });
    }
  } else {
    console.error('Usage: recipe.mjs list | show <name> | plan --job <dir> --recipe <style> --duration s [...] | commands --job <dir> | build --job <dir> [--dry-run]');
    process.exit(2);
  }
}
