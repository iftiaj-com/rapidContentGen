// 2D camera moves on footage: apply Adits camera-move cues to an element in a
// job's main composition (usually an untimed .shot wrapper or a footage card).
//
// The runtime (library/runtime/camera-moves.js: the 46 Adits moves and the 20
// Virtual Camera presets) is copied into the job once; each camera block is a
// property-setter driver on the main timeline that writes the element's
// transform and filter for time t. Seekable: the pose is a pure function of t
// (plus the precomputed audio tables).
//
// The target must not also be moved by other GSAP transform tweens (they would
// fight over `transform`). Wrap it in another element if it is.
//
// Usage:
//   node tools/blocks/camera.mjs --job <dir> --target "#w1" --cue "0:handheld" --cue "5.5:whip_pan_right:i=1.2"
//        [--bpm 136] [--kick <music>] [--audio <music>] [--audio-offset 0] [--fill blur|cover|none] [--id cam-w1]
//   move cue   = [layer/]at:move[:i=intensity][:s=speed][:loop][:bars=N][:from=s][:rev]   (bars needs --bpm)
//   preset cue = [layer/]at:vc.<preset>[:d=s][:s=speed][:i=..][:loop][:rev][:bars=N][:curve=-300..300]
//                [:zigzag=-300..300][:hh=0..100][:react=<mode>][:sens=x]
//     d    = the Adits clip duration (default: until the layer's next cue or the end);
//            the preset reaches its finish after d / speed seconds. bars=N: finish after N bars.
//     hh   = handheld shake amount. react needs --audio (or --kick).
//   --fill (presets only): blur = Adits look, edges show a blurred copy of the footage
//            (default when the target holds <video>/<img>); cover = one fixed zoom per cue
//            so no edge shows; none = edges show.
//   node tools/blocks/camera.mjs --list      (all move, preset and react names)

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { analyzeToFile } from '../audio/analyze.mjs';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { ROOT } from '../lib/config.mjs';

const RUNTIME = join(ROOT, 'library', 'runtime', 'camera-moves.js');
const require = createRequire(import.meta.url);
export const Moves = require(RUNTIME);

const isPreset = (move) => String(move).startsWith('vc.');

/**
 * "[layer/]5.5:whip_pan_right[:i=1.2][:s=1][:loop][:bars=1][:from=0.5][:rev]" -> cue object.
 * "[layer/]0:vc.ken_burns[:d=6][:hh=40][:react=bass_zoom]..." -> preset cue.
 * Layers combine (e.g. a: handheld all along, b: whips at the cuts).
 */
export function parseCue(spec, { bpm } = {}) {
  let s = String(spec);
  let layer = 'a';
  const slash = s.indexOf('/');
  if (slash > 0) { layer = s.slice(0, slash); s = s.slice(slash + 1); }
  const [at, move, ...opts] = s.split(':');
  const preset = isPreset(move);
  if (preset ? !Moves.PRESETS[move.slice(3)] : !Moves.MOVES[move]) throw new Error(`Unknown move or preset "${move}". Run with --list.`);
  const cue = { at: Number(at), move, layer };
  if (!Number.isFinite(cue.at)) throw new Error(`Bad cue time in "${spec}"`);
  let bars = null;
  for (const o of opts) {
    const [k, v] = o.split('=');
    if (k === 'i') cue.intensity = Number(v);
    else if (k === 's') cue.speed = Number(v);
    else if (k === 'loop') cue.loop = true;
    else if (k === 'from') cue.from = Number(v);
    else if (k === 'rev') cue.reverse = true;
    else if (k === 'bars') {
      if (!bpm) throw new Error(`Cue "${spec}" uses bars but no --bpm was given`);
      bars = Number(v);
    } else if (preset && k === 'd') cue.dur = Number(v);
    else if (preset && k === 'curve') cue.curve = Number(v);
    else if (preset && k === 'zigzag') cue.zigzag = Number(v);
    else if (preset && k === 'hh') cue.handheld = Number(v);
    else if (preset && k === 'sens') cue.sens = Number(v);
    else if (preset && k === 'react') {
      if (!Moves.REACT_MODES.includes(v)) throw new Error(`Unknown react mode "${v}". One of: ${Moves.REACT_MODES.join(', ')}`);
      cue.react = v;
    } else throw new Error(`Unknown cue option "${o}" in "${spec}"`);
  }
  if (bars != null) {
    if (preset) {
      // The preset reaches its finish when dur / speed seconds have passed: make that N bars.
      const speed = cue.speed ?? Moves.PRESETS[move.slice(3)][13];
      cue.dur = bars * (60 / Number(bpm)) * 4 * speed;
    } else cue.rate = Moves.beatRate(move, Number(bpm), bars, 4, cue.speed || 1);
  }
  return cue;
}

function rootAttrs(html) {
  const tag = html.match(/<[a-z]+\b[^>]*data-composition-id[^>]*>/i)?.[0] || '';
  const num = (n) => Number(tag.match(new RegExp(`${n}="([^"]+)"`))?.[1]);
  return { width: num('data-width') || 1080, height: num('data-height') || 1920, duration: num('data-duration') };
}

/** Opening tag, inner HTML and end offset of the element with this id (same-tag nesting counted). */
function elementSpan(html, id) {
  const open = new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\bid="${id}"[^>]*>`, 'i').exec(html);
  if (!open) return null;
  const tag = open[1].toLowerCase();
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = open.index + open[0].length;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (!depth) return { start: open.index, openTag: open[0], inner: html.slice(open.index + open[0].length, m.index), end: m.index + m[0].length };
  }
  return null;
}

/**
 * Adits drawBackground: a static, blurred copy of the footage behind the camera
 * target (blur 22 px), so edges revealed by a preset show footage instead of
 * black. The clones keep the originals' timing. Overscan is 72 px a side (Adits
 * uses 28): CSS blur fades the element's own edges over about 3 x 22 px, which
 * darkened the frame border at 28.
 */
function fillElement(html, tid, root) {
  const span = elementSpan(html, tid);
  const media = span.inner.match(/<video\b[^>]*>[\s\S]*?<\/video>|<img\b[^>]*>/gi) || [];
  if (!media.length) throw new Error(`--fill blur needs <video> or <img> inside #${tid}`);
  const clones = media.map((tag) => {
    let c = tag.replace(/\bid="([^"]+)"/, (_, v) => `id="${v}-fill"`);
    c = c.replace(/data-track-index="(\d+)"/, (_, n) => `data-track-index="${Number(n) + 50}"`);
    if (/^<video/i.test(c) && !/\smuted\b/.test(c)) c = c.replace(/^<video/i, '<video muted');
    return c;
  });
  const cls = span.openTag.match(/\bclass="([^"]*)"/)?.[1] || '';
  const sx = ((root.width + 144) / root.width).toFixed(4);
  const sy = ((root.height + 144) / root.height).toFixed(4);
  return `<div id="${tid}-fill" data-rcg="camera-fill" class="${cls}" aria-hidden="true" style="filter: blur(22px); transform: scale(${sx}, ${sy}); transform-origin: 50% 50%;">
        ${clones.join('\n        ')}
      </div>
      `;
}

export async function applyCamera(opts) {
  const jobDir = resolve(opts.job);
  const indexPath = join(jobDir, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  const root = rootAttrs(html);
  if (!root.duration) throw new Error('Root composition needs data-duration.');
  const target = String(opts.target || '');
  if (!/^#[\w-]+$/.test(target)) throw new Error('--target must be an id selector like "#w1"');
  const tid = target.slice(1);
  const idMatch = new RegExp(`id="${tid}"`);
  if (!idMatch.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error(`No element ${target} in index.html`);
  const cues = [].concat(opts.cue || []).map((c) => parseCue(c, { bpm: opts.bpm })).sort((a, b) => a.at - b.at);
  if (!cues.length) throw new Error('Give at least one --cue at:move');
  const id = opts.id || `cam-${tid}`;
  const warnings = [];
  const tweenOnTarget = new RegExp(`tl\\.(?:to|from|fromTo|set)\\(\\s*["']${target}["'][^)]*(?:scale|x:|y:|rotation|transform)`);
  if (tweenOnTarget.test(html)) warnings.push(`${target} already has GSAP transform tweens; they will fight the camera. Put the camera on a wrapper instead.`);

  // Audio: per-frame kick (beat shake) and bass/mid/treble (preset react modes).
  const fps = Number(opts.fps) || 24;
  const needAudio = cues.some((c) => c.react);
  const audioSrc = opts.kick || opts.audio;
  if (needAudio && !audioSrc) throw new Error('A cue uses react=; pass --audio <music> (or --kick).');
  let table = null;
  if (audioSrc) {
    table = await analyzeToFile(resolve(audioSrc), join(jobDir, 'data', `${id}.audio.json`), {
      fps, duration: root.duration + 1 / fps, offset: Number(opts['audio-offset'] ?? opts['kick-offset'] ?? 0), clock: 'default',
    });
  }
  const kick = opts.kick ? table.frames.map((f) => f.kick) : null;
  const aud = needAudio ? table.frames.map((f) => [f.bass, f.mid, f.treble]) : null;
  const audioAt = (t) => {
    if (!aud) return null;
    const f = Math.max(0, Math.min(aud.length - 1, Math.floor(t * fps + 1e-6)));
    return { bass: aud[f][0], mid: aud[f][1], treble: aud[f][2], prevBass: aud[Math.max(0, f - 1)][0] };
  };

  // Presets: fill mode, default duration (until the layer's next cue or the end), and for
  // "cover" one fixed scale per cue (the largest the cue needs), so the zoom does not pulse.
  const presetCues = cues.filter((c) => isPreset(c.move));
  const span0 = elementSpan(html, tid);
  const fill = opts.fill || (span0 && /<(video|img)\b/i.test(span0.inner) ? 'blur' : 'cover');
  if (!['blur', 'cover', 'none'].includes(fill)) throw new Error('--fill must be blur, cover or none');
  for (const c of presetCues) {
    const next = cues.find((o) => o.layer === c.layer && o.at > c.at);
    const end = Math.min(root.duration, next ? next.at : root.duration);
    c.fill = fill;
    if (!(c.dur > 0)) c.dur = +(end - c.at).toFixed(3);
    if (fill === 'cover') {
      let need = 1;
      for (let f = Math.floor(c.at * fps); f / fps <= end + 1e-9; f++) {
        const t = f / fps;
        const p = Moves.evaluate(c.move, t - c.at, { ...c, audio: c.react ? audioAt(t) : null });
        need = Math.max(need, Moves.poseToCss(p, root.width, root.height).scale);
      }
      c.cover = +need.toFixed(4);
    }
  }

  // 1. Runtime: copied into the job (lib/camera-moves.js) and loaded once by a
  //    classic script tag before the main timeline script. A file instead of an
  //    inline copy keeps index.html small (HyperFrames warns on large files).
  mkdirSync(join(jobDir, 'lib'), { recursive: true });
  copyFileSync(RUNTIME, join(jobDir, 'lib', 'camera-moves.js'));
  html = html.replace(/<script data-rcg="camera-runtime">[\s\S]*?<\/script>\s*/, ''); // older inline form
  const runtimeTag = '<script src="lib/camera-moves.js" data-rcg="camera-runtime"></script>';
  if (!html.includes(runtimeTag)) {
    const mainScript = html.lastIndexOf('<script>', html.lastIndexOf('window.__timelines'));
    if (mainScript < 0) throw new Error('Could not find the main timeline script.');
    html = `${html.slice(0, mainScript)}${runtimeTag}\n    ${html.slice(mainScript)}`;
  }

  // 2. The blurred fill behind the target (replaced on every run, removed if not "blur").
  html = html.replace(new RegExp(`<div id="${tid}-fill" data-rcg="camera-fill"[\\s\\S]*?</div>\\s*`), '');
  if (presetCues.length && fill === 'blur') {
    const span = elementSpan(html, tid);
    html = `${html.slice(0, span.start)}${fillElement(html, tid, root)}${html.slice(span.start)}`;
  }

  // 3. The camera block, replacing an earlier one with the same id.
  const block = `      // rcg:camera ${id} begin (generated by tools/blocks/camera.mjs; regenerate instead of editing)
      (function () {
        var el = document.querySelector(${JSON.stringify(target)});
        var CUES = ${JSON.stringify(cues)};
        var KICK = ${kick ? JSON.stringify(kick) : 'null'};
        var AUD = ${aud ? JSON.stringify(aud) : 'null'};
        var FPS = ${fps};
        var DUR = ${root.duration};
        var W = el.offsetWidth || ${root.width}, H = el.offsetHeight || ${root.height};
        el.style.transformOrigin = "50% 50%";
        el.style.willChange = "transform, filter";
        function frame(n, t) { return Math.max(0, Math.min(n - 1, Math.floor(t * FPS + 1e-6))); }
        function kickAt(t) { return KICK ? KICK[frame(KICK.length, t)] : 0; }
        function audioAt(t) {
          if (!AUD) return null;
          var f = frame(AUD.length, t), a = AUD[f], b = AUD[Math.max(0, f - 1)];
          return { bass: a[0], mid: a[1], treble: a[2], prevBass: b[0] };
        }
        function apply(t) {
          var c = RCGCameraMoves.poseToCss(RCGCameraMoves.poseAt(CUES, t, kickAt, audioAt), W, H);
          el.style.transform = c.transform;
          el.style.filter = c.filter;
        }
        var drv = { _t: 0 };
        Object.defineProperty(drv, "t", { get: function () { return this._t; }, set: function (v) { this._t = v; apply(v); } });
        tl.to(drv, { t: DUR, duration: DUR, ease: "none" }, 0);
        apply(0);
      })();
      // rcg:camera ${id} end
`;
  const existing = new RegExp(`      // rcg:camera ${id} begin[\\s\\S]*?// rcg:camera ${id} end\\n`);
  if (existing.test(html)) html = html.replace(existing, block);
  else {
    const reg = html.lastIndexOf('window.__timelines');
    const lineStart = html.lastIndexOf('\n', reg) + 1;
    html = `${html.slice(0, lineStart)}${block}${html.slice(lineStart)}`;
  }

  // Compile-check the main inline scripts before writing.
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try { new vm.Script(m[1]); } catch (err) { throw new Error(`index.html script would not parse after inserting the camera: ${err.message}`); }
  }
  writeFileSync(indexPath, html);
  return { id, target, cues, kick: Boolean(kick), react: Boolean(aud), fill: presetCues.length ? fill : null, warnings };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (a.list) {
    for (const n of Moves.names) {
      const d = Moves.MOVES[n];
      console.log(`${n.padEnd(24)} move, ${d.once ? `one-shot ${d.dur}s` : 'continuous'}`);
    }
    for (const n of Moves.presetNames) {
      const r = Moves.PRESETS[n.slice(3)];
      console.log(`${n.padEnd(24)} 2D preset, speed ${r[13]}${r[8] || r[9] || r[10] || r[11] ? ', perspective' : ''}${r[6] || r[7] ? ', rotation' : ''}`);
    }
    console.log(`react modes (presets): ${Moves.REACT_MODES.join(', ')}`);
    process.exit(0);
  }
  if (!a.job || !a.target || !a.cue) {
    console.error('Usage: camera.mjs --job <dir> --target "#id" --cue "at:move|vc.preset[:opts]" ... [--bpm n] [--kick music] [--audio music] [--fill blur|cover|none] [--id x] | --list');
    process.exit(2);
  }
  const res = await applyCamera(a);
  const desc = (c) => `${c.at}s ${c.move}${c.cover ? ` (cover ${c.cover})` : ''}`;
  console.log(`Camera ${res.id} on ${res.target}: ${res.cues.map(desc).join(', ')}${res.kick ? ' (+ kick shake)' : ''}${res.react ? ' (+ audio react)' : ''}${res.fill ? `; fill ${res.fill}` : ''}`);
  for (const w of res.warnings) console.log(`WARNING: ${w}`);
}
