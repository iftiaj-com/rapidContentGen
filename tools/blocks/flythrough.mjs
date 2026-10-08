// flowEditor camera flythrough as a HyperFrames sub-composition.
//
// Cards (images or videos) sit on a board; the camera flies to each one and
// dwells (`board` motion), or the board stays still and each card flies to the
// centre (`cards` motion). Per card: arrival time, dwell, zoom, path style
// (smooth / linear / arc / whip / punch / kenburns) and entrance effect.
//
// What comes from flowEditor (docs/PROVENANCE.md):
//   library/flow/motionStyles.js     copied; inlined into the composition (export keywords stripped)
//   library/flow/templateRegistry.js copied; card layouts at build time
//   library/flow/audioClipUtils.js   copied; music clip windows + fades -> a volume lane
//   library/flow/beatSnap.js         snapArrivalsToBeats, verbatim
//   library/flow/constants.js        copied; RATIOS, BASE_WIDTH, GAP, layout()
//   useOfflineRender.js              choreography + transition-sound ducking, ported below
//   renderFrame.js                   drawFrame, ported to DOM transforms. Fix: media uses
//                                    object-fit: cover (the canvas renderer stretched it).
//
// Coordinates stay in flowEditor's units (the frame is 360 units wide at camera
// scale 1); the composition multiplies by U = width / 360 when it writes CSS.
// Seekable: a private paused GSAP timeline holds the flowEditor tweens on plain
// proxies; a setter driver on the registered timeline seeks it and writes the DOM.
//
// Usage:
//   node tools/blocks/flythrough.mjs --job <dir> --spec <dir>/data/flythrough.json [--id fly-main]
//        [--start 0] [--track 2] [--insert] [--fit-root]
//   node tools/blocks/flythrough.mjs --list
// Spec: docs/capabilities.md (rcg flythrough) and regression/R4.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { ROOT, readJson } from '../lib/config.mjs';
import { extractFrame } from '../lib/ffmpeg.mjs';

const FLOW = join(ROOT, 'library', 'flow');
const load = (f) => import(pathToFileURL(join(FLOW, f)).href);
const { RATIOS, BASE_WIDTH, GAP, layout } = await load('constants.js');
const { TEMPLATES, applyTemplate } = await load('templateRegistry.js');
const { PATH_STYLES, ENTRANCE_EFFECTS } = await load('motionStyles.js');
const { resolveClipWindows, buildSoundtrackEnvelope, envelopeValueAt } = await load('audioClipUtils.js');
const { snapArrivalsToBeats } = await load('beatSnap.js');

// flowEditor boardModes.js TEXTURE_BG_COLORS (the canvas colours used when recording).
export const TEXTURES = { none: '#0f172a', kraft: '#3D2510', sand: '#A07B4F', cream: '#EDE0C4', parchment: '#C49A45' };
const DUCK_LEVEL = 0.25; // useOfflineRender renderAudioMix
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v']);

/** createCard defaults (flowEditor cardTypes.js) + type from the file extension. */
function withDefaults(c, i) {
  const type = c.type || (VIDEO_EXT.has(extname(c.src || '').toLowerCase()) ? 'video' : 'image');
  return {
    id: c.id ?? i + 1, src: c.src, type, ratio: c.ratio || '9:16',
    duration: c.duration ?? 2, arrivalTime: c.arrivalTime ?? 1, zoom: c.zoom ?? 1,
    pathStyle: c.pathStyle || 'smooth', entrance: c.entrance || 'none',
    mediaStart: c.mediaStart ?? 0, audio: Boolean(c.audio), sound: c.sound || null,
    ...(c.x !== undefined ? { x: c.x } : {}), ...(c.y !== undefined ? { y: c.y } : {}),
  };
}

/** Per-card time segments: useOfflineRender computeSegments (audioSync off). */
export function computeSegments(cards) {
  const segments = [];
  let t = 0;
  for (const card of cards) {
    const arrival = card.arrivalTime !== undefined ? card.arrivalTime : 1.5;
    const stay = card.duration || 2;
    segments.push({ card, arrivalStart: t, arrivalEnd: t + arrival, end: t + arrival + stay });
    t += arrival + stay;
  }
  return segments;
}

/** Beat list from an analyze-beatgrid audiomap (grid.beats_sec / downbeats_sec) or a plain array. */
function loadBeats(file, grid = 'beats') {
  const doc = readJson(file);
  if (Array.isArray(doc)) return doc;
  const g = doc.grid || doc;
  const list = grid === 'downbeats' ? g.downbeats_sec : g.beats_sec;
  if (!Array.isArray(list)) throw new Error(`No grid.${grid === 'downbeats' ? 'downbeats_sec' : 'beats_sec'} in ${file}`);
  return list;
}

/** Library SFX by name ("whoosh-short") or a job-relative file; copies library sounds into assets/sfx/. */
function resolveSound(jobDir, sound) {
  const manifest = readJson(join(ROOT, 'library', 'sfx', 'manifest.json'));
  const list = Array.isArray(manifest) ? manifest : manifest.sounds || Object.values(manifest);
  const name = sound.sfx || sound.file;
  const entry = list.find((s) => s.file === name || s.file === `${name}.mp3` || s.file.replace(/\.\w+$/, '') === name);
  if (sound.sfx) {
    if (!entry) throw new Error(`Unknown library SFX "${sound.sfx}" (see library/sfx/manifest.json)`);
    mkdirSync(join(jobDir, 'assets', 'sfx'), { recursive: true });
    const dest = join(jobDir, 'assets', 'sfx', entry.file);
    if (!existsSync(dest)) copyFileSync(join(ROOT, 'library', 'sfx', entry.file), dest);
    return { src: `assets/sfx/${entry.file}`, duration: entry.durationS, peak: entry.peakS ?? entry.crestStartS ?? 0 };
  }
  if (!existsSync(join(jobDir, sound.file))) throw new Error(`Sound not found: ${sound.file}`);
  return { src: sound.file.replace(/\\/g, '/'), duration: sound.duration ?? 1, peak: sound.peak ?? 0 };
}

/**
 * Soundtrack volume lane: flowEditor's clip-window envelope (gates + fades) x the
 * auto-duck under each transition sound x the volume. Lane times are clip-local,
 * which is flowEditor's sequence time.
 */
export function musicLane({ total, clips = null, fadeIn = 0, fadeOut = 0, volume = 1, ducks = [], duckLevel = DUCK_LEVEL }) {
  const env = buildSoundtrackEnvelope(resolveClipWindows(clips, total), fadeIn, fadeOut);
  const duckPts = [];
  for (const d of ducks) {
    const end = Math.min(d.start + d.duration, total);
    duckPts.push({ t: Math.max(0, d.start - 0.15), v: 1 }, { t: d.start, v: duckLevel }, { t: end, v: duckLevel }, { t: Math.min(end + 0.45, total), v: 1 });
  }
  // Each duck is its own down-hold-up shape (1 outside it); overlapping ducks take the lower level.
  const duckAt = (t) => {
    let v = 1;
    for (let i = 0; i < duckPts.length; i += 4) v = Math.min(v, envelopeValueAt(duckPts.slice(i, i + 4), t));
    return v;
  };
  // The product of two piecewise-linear curves, sampled at every breakpoint of either.
  const times = [...new Set([0, total, ...env.map((p) => p.t), ...duckPts.map((p) => p.t)])]
    .filter((t) => t >= 0 && t <= total).sort((a, b) => a - b);
  return times.map((t) => ({ t: +t.toFixed(4), v: +(volume * envelopeValueAt(env, t) * duckAt(t)).toFixed(4) }));
}

/** motionStyles.js as a classic-script body: drop the export keywords, keep every line. */
function inlineMotionStyles() {
  const src = readFileSync(join(FLOW, 'motionStyles.js'), 'utf8').replace(/^export\s+/gm, '');
  new vm.Script(src);
  return src;
}

export function buildFlyHtml({ id, width, height, cards, segments, settings, total }) {
  const U = width / 360;
  const bg = settings.background || '#000000';
  const bgCss = /\.(png|jpe?g|webp)$/i.test(bg) ? `background: #000 url("${bg}") center / cover no-repeat;` : `background: ${TEXTURES[bg] || bg};`;
  const radius = settings.radius ?? 24;
  const cardScale = settings.cardScale ?? 0.8;
  const css = `
      #root {
        position: absolute;
        inset: 0;
        overflow: hidden;
        ${bgCss}
      }
      #${id}-world {
        position: absolute;
        left: ${width / 2}px;
        top: ${height / 2}px;
        width: 0;
        height: 0;
        transform-origin: 0 0;
      }
      .${id}-mv {
        position: absolute;
        left: 0;
        top: 0;
      }
      .${id}-card {
        position: absolute;
      }
      .${id}-fx {
        position: absolute;
        inset: 0;
        overflow: hidden;
        border-radius: ${(radius * U).toFixed(2)}px;
      }
      .${id}-fx img,
      .${id}-fx video {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }`;
  const markup = cards.map((c, i) => {
    const w = BASE_WIDTH * cardScale * U;
    const h = (BASE_WIDTH / (RATIOS[c.ratio] || 1)) * cardScale * U;
    const seg = segments[i];
    const media = c.type === 'video'
      ? `<img src="${c.poster}" alt="" />
              <video id="${id}-v${i}" class="clip" src="${c.src}" data-start="${seg.arrivalStart.toFixed(3)}" data-duration="${(total - seg.arrivalStart).toFixed(3)}" data-media-start="${c.mediaStart}" data-hf-media-start-basis="local" data-track-index="${10 + i}" loop${c.audio ? ' data-has-audio="true"' : ' muted'} playsinline></video>`
      : `<img src="${c.src}" alt="" />`;
    return `        <div id="${id}-mv${i}" class="${id}-mv">
          <div id="${id}-c${i}" class="${id}-card" style="left: ${(c.x * U - w / 2).toFixed(2)}px; top: ${(c.y * U - h / 2).toFixed(2)}px; width: ${w.toFixed(2)}px; height: ${h.toFixed(2)}px;">
            <div id="${id}-fx${i}" class="${id}-fx">
              ${media}
            </div>
          </div>
        </div>`;
  }).join('\n');

  const data = cards.map((c, i) => ({
    x: c.x, y: c.y, ratio: c.ratio, zoom: c.zoom, pathStyle: c.pathStyle, entrance: c.entrance,
    w: BASE_WIDTH * cardScale, h: (BASE_WIDTH / (RATIOS[c.ratio] || 1)) * cardScale,
    arrivalStart: segments[i].arrivalStart, arrivalEnd: segments[i].arrivalEnd, end: segments[i].end,
  }));
  const script = `
      (function () {
        var ID = ${JSON.stringify(id)};
        var DUR = ${total};
        var U = ${U};
        var CARDS = ${JSON.stringify(data)};
        var MOTION = ${JSON.stringify(settings.motion || 'board')};
        var STACK = ${JSON.stringify((settings.arrangement || 'none') === 'stack')};
        var START = ${JSON.stringify({ x: settings.startX || 0, y: settings.startY || 0 })};
        var S0 = 1;

        // ---- flowEditor motionStyles.js (verbatim, export keywords removed) ----
${inlineMotionStyles()}
        // ---- end motionStyles.js ----

        // Choreography: flowEditor useOfflineRender, on plain proxies in a private paused timeline.
        var ftl = gsap.timeline({ paused: true });
        var cam = { x: START.x, y: START.y, scale: S0 };
        var cardOffsets = MOTION === "cards" ? CARDS.map(function () { return { x: 0, y: 0 }; }) : null;
        function fxEndScaleFor(card) { return MOTION === "cards" ? cardZoom(card) : 1; }
        function entStartFor(card) { return entranceStart(cardEntrance(card), card.w, card.h, fxEndScaleFor(card)); }
        var cardFx = CARDS.map(function (c) {
          var s = entStartFor(c);
          return s ? { x: s.x, y: s.y, scale: s.scale, alpha: 0 } : { x: 0, y: 0, scale: 1, alpha: 1 };
        });
        function addFxTweens(i) {
          var card = CARDS[i];
          var dur = card.arrivalEnd - card.arrivalStart;
          var fx = cardFx[i];
          var start = entStartFor(card);
          var endScale = fxEndScaleFor(card);
          if (start) {
            ftl.to(fx, { x: 0, y: 0, scale: endScale, alpha: 1, duration: Math.max(0.15, dur), ease: start.ease }, card.arrivalStart);
          } else if (endScale !== 1) {
            ftl.to(fx, { scale: endScale, duration: dur, ease: "power3.inOut" }, card.arrivalStart);
          }
          if (MOTION === "cards" && cardPath(card) === "kenburns") {
            ftl.to(fx, { scale: endScale * KENBURNS_DRIFT, duration: card.end - card.arrivalEnd, ease: "none" }, card.arrivalEnd);
          }
        }
        if (cardOffsets) {
          var centerX = -START.x / S0;
          var centerY = -START.y / S0;
          CARDS.forEach(function (card, i) {
            var dur = card.arrivalEnd - card.arrivalStart;
            addCameraArrival(ftl, cardOffsets[i], {
              from: { x: 0, y: 0 },
              to: { x: centerX - card.x, y: centerY - card.y },
              arrival: dur,
              style: cardPath(card),
            }, card.arrivalStart);
            if (i > 0 && !STACK) {
              var prev = CARDS[i - 1];
              ftl.to(cardOffsets[i - 1], { x: 0, y: 0, duration: dur, ease: "power3.inOut" }, card.arrivalStart);
              if (fxEndScaleFor(prev) !== 1 || cardPath(prev) === "kenburns") {
                ftl.to(cardFx[i - 1], { scale: 1, duration: dur, ease: "power3.inOut" }, card.arrivalStart);
              }
            }
            addFxTweens(i);
            ftl.to({}, { duration: card.end - card.arrivalEnd }, card.arrivalEnd);
          });
        } else {
          var camFrom = { x: START.x, y: START.y };
          CARDS.forEach(function (card, i) {
            var zoom = cardZoom(card);
            var style = cardPath(card);
            var camTo = { x: -card.x * S0 * zoom, y: -card.y * S0 * zoom, scale: S0 * zoom };
            addCameraArrival(ftl, cam, { from: camFrom, to: camTo, arrival: card.arrivalEnd - card.arrivalStart, style: style }, card.arrivalStart);
            if (style === "kenburns") {
              addKenBurnsDwell(ftl, cam, camTo, card.end - card.arrivalEnd, card.arrivalEnd);
              camFrom = { x: camTo.x * KENBURNS_DRIFT, y: camTo.y * KENBURNS_DRIFT };
            } else {
              camFrom = { x: camTo.x, y: camTo.y };
            }
            addFxTweens(i);
            ftl.to({}, { duration: card.end - card.arrivalEnd }, card.arrivalEnd);
          });
        }

        // drawFrame, ported to DOM: camera on the world, travel offsets on the movers,
        // entrance FX on the media boxes, stack visibility per segment.
        var world = document.getElementById(ID + "-world");
        var nodes = CARDS.map(function (c, i) {
          return { mv: document.getElementById(ID + "-mv" + i), card: document.getElementById(ID + "-c" + i), fx: document.getElementById(ID + "-fx" + i) };
        });
        function visible(i, t) {
          if (!STACK) return true;
          var until = i + 1 < CARDS.length ? CARDS[i + 1].arrivalStart : Infinity;
          return t >= CARDS[i].arrivalStart && t < until;
        }
        function render(t) {
          ftl.time(Math.min(t, ftl.duration()), true);
          world.style.transform = "translate(" + (cam.x * U).toFixed(3) + "px, " + (cam.y * U).toFixed(3) + "px) scale(" + (cam.scale / S0).toFixed(5) + ")";
          nodes.forEach(function (n, i) {
            var f = cardFx[i];
            var show = visible(i, t) && f.alpha > 0.004;
            n.card.style.visibility = show ? "visible" : "hidden";
            if (cardOffsets) n.mv.style.transform = "translate(" + (cardOffsets[i].x * U).toFixed(3) + "px, " + (cardOffsets[i].y * U).toFixed(3) + "px)";
            n.fx.style.transform = "translate(" + (f.x * U).toFixed(3) + "px, " + (f.y * U).toFixed(3) + "px) scale(" + f.scale.toFixed(5) + ")";
            n.fx.style.opacity = String(Math.max(0, Math.min(1, f.alpha)));
          });
        }

        var tl = gsap.timeline({ paused: true });
        var drv = { _t: 0 };
        Object.defineProperty(drv, "t", { get: function () { return this._t; }, set: function (v) { this._t = v; render(v); } });
        tl.to(drv, { t: DUR, duration: DUR, ease: "none" }, 0);
        render(0);
        window.__timelines[ID] = tl;
      })();`;
  try {
    new vm.Script(script, { filename: `${id}.inline.js` });
  } catch (err) {
    throw new Error(`Generated flythrough script for ${id} does not parse: ${err.message}`);
  }
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- Generated by tools/blocks/flythrough.mjs (flowEditor port). Regenerate instead of hand-editing. -->
  </head>
  <body>
    <template>
      <style>${css}
      </style>
      <div id="root" data-composition-id="${id}" data-width="${width}" data-height="${height}">
        <div id="${id}-world" data-layout-allow-overflow>
${markup}
        </div>
      </div>
      <script>${script}
      </script>
    </template>
  </body>
</html>
`;
}

function rootInfo(html) {
  const tag = html.match(/<[a-z]+\b[^>]*data-composition-id[^>]*>/i)?.[0] || '';
  const num = (n) => Number(tag.match(new RegExp(`${n}="([^"]+)"`))?.[1]);
  return { tag, width: num('data-width') || 1080, height: num('data-height') || 1920, duration: num('data-duration') };
}

export async function generateFlythrough(opts) {
  const jobDir = resolve(opts.job);
  const specPath = resolve(opts.spec || join(jobDir, 'data', 'flythrough.json'));
  const spec = readJson(specPath);
  const settings = { motion: 'board', arrangement: 'none', spacing: 800, cardScale: 0.8, radius: 24, background: '#000000', ...(spec.settings || {}) };
  if (!['board', 'cards'].includes(settings.motion)) throw new Error('settings.motion must be board or cards');
  const id = opts.id || spec.id || 'fly-main';
  const start = Number(opts.start ?? spec.start ?? 0);
  const indexPath = join(jobDir, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  const root = rootInfo(html);

  // Cards: defaults, layout (template or flowEditor's even spread), beat snap.
  let cards = (spec.cards || []).map(withDefaults);
  if (!cards.length) throw new Error('The spec has no cards.');
  for (const c of cards) {
    if (!c.src || !existsSync(join(jobDir, c.src))) throw new Error(`Card media not found in the job: ${c.src}`);
    if (!RATIOS[c.ratio]) throw new Error(`Unknown ratio ${c.ratio}; one of ${Object.keys(RATIOS).join(', ')}`);
    if (!PATH_STYLES.some((p) => p.value === c.pathStyle)) throw new Error(`Unknown pathStyle ${c.pathStyle}`);
    if (!ENTRANCE_EFFECTS.some((p) => p.value === c.entrance)) throw new Error(`Unknown entrance ${c.entrance}`);
  }
  if (settings.template) {
    if (!TEMPLATES[settings.template]) throw new Error(`Unknown template ${settings.template}; one of ${Object.keys(TEMPLATES).join(', ')}`);
    cards = applyTemplate(settings.template, cards, settings.arrangement, settings.spacing);
  } else if (cards.some((c) => c.x === undefined || c.y === undefined)) {
    cards = layout(cards, settings.spacing || GAP);
  }
  let beats = null;
  if (spec.snap) {
    beats = loadBeats(resolve(jobDir, spec.snap.beats), spec.snap.grid || 'beats');
    cards = snapArrivalsToBeats(cards, beats, Number(spec.snap.offset ?? spec.music?.offset ?? 0));
  }
  const segments = computeSegments(cards);
  const total = +segments[segments.length - 1].end.toFixed(3);

  // Video cards: a still of the first frame shows until the card's video starts
  // (flowEditor holds paused videos on their first frame until arrival).
  for (const [i, c] of cards.entries()) {
    if (c.type !== 'video') continue;
    c.poster = `assets/${id}-poster-${i}.jpg`;
    await extractFrame(join(jobDir, c.src), c.mediaStart, join(jobDir, c.poster));
  }

  const out = join(jobDir, 'compositions', `${id}.html`);
  mkdirSync(join(jobDir, 'compositions'), { recursive: true });
  writeFileSync(out, buildFlyHtml({ id, width: root.width, height: root.height, cards, segments, settings, total }));

  // Sounds: per-card transition clip (flowEditor fires it 0.1 s before the arrival
  // ends; "crest" lines the measured peak up with the landing instead) + ducking.
  const sounds = [];
  for (const [i, c] of cards.entries()) {
    if (!c.sound) continue;
    const s = resolveSound(jobDir, c.sound);
    const align = c.sound.align || 'crest';
    const local = Math.max(0, align === 'flow' ? segments[i].arrivalEnd - 0.1 : segments[i].arrivalEnd - s.peak);
    sounds.push({ i, ...s, local, volume: c.sound.volume ?? 0.5 });
  }
  const audioTags = sounds.map((s) => `<audio id="${id}-sfx-${s.i}" src="${s.src}" data-start="${(start + s.local).toFixed(3)}" data-duration="${s.duration}" data-volume="${s.volume}" data-track-index="${30 + s.i}"></audio>`);
  let lane = null;
  if (spec.music) {
    const m = spec.music;
    if (!existsSync(join(jobDir, m.src))) throw new Error(`Music not found in the job: ${m.src}`);
    lane = musicLane({
      total, clips: m.clips ?? null, fadeIn: m.fadeIn || 0, fadeOut: m.fadeOut || 0, volume: m.volume ?? 1,
      // duck: true = flowEditor's level (0.25); a number sets the level (an rapidContentGen option).
      ducks: m.duck ? sounds.map((s) => ({ start: s.local, duration: s.duration })) : [],
      duckLevel: typeof m.duck === 'number' ? m.duck : DUCK_LEVEL,
    });
    audioTags.unshift(`<audio id="${id}-music" src="${m.src}" data-start="${start}" data-duration="${total}" data-media-start="${m.offset || 0}" data-track-index="20"
        data-automation='${JSON.stringify({ version: 1, lanes: [{ target: 'volume', points: lane }] })}'></audio>`);
  }

  const warnings = [];
  const end = +(start + total).toFixed(3);
  if (opts.insert) {
    const host = `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${start}" data-duration="${total}" data-track-index="${opts.track || 2}" data-width="${root.width}" data-height="${root.height}"></div>`;
    html = html.replace(new RegExp(`\\s*<audio id="${id}-(?:music|sfx-\\d+)"[\\s\\S]*?</audio>`, 'g'), '');
    const existing = new RegExp(`<div id="${id}"[^>]*data-composition-src="compositions/${id}\\.html"[^>]*></div>`);
    const block = [host, ...audioTags].join('\n      ');
    if (existing.test(html)) html = html.replace(existing, block);
    else {
      const idx = html.lastIndexOf('</div>', html.lastIndexOf('<script>', html.lastIndexOf('window.__timelines')));
      if (idx < 0) throw new Error('Could not find the root closing tag. Insert the host by hand.');
      html = `${html.slice(0, idx)}  ${block}\n    ${html.slice(idx)}`;
    }
    if (root.duration && end > root.duration + 1e-6) {
      if (opts['fit-root']) html = html.replace(root.tag, root.tag.replace(/data-duration="[^"]+"/, `data-duration="${end}"`));
      else warnings.push(`Root data-duration ${root.duration} s is shorter than the flythrough end ${end} s (pass --fit-root).`);
    }
    writeFileSync(indexPath, html);
  }

  // Landing report: where each arrival ends, and the distance to the nearest grid beat.
  const offset = Number(spec.snap?.offset ?? spec.music?.offset ?? 0);
  const landings = segments.map((s, i) => {
    const landing = +s.arrivalEnd.toFixed(3);
    let err = null;
    if (beats) {
      const grid = beats.map((b) => b - offset);
      err = +Math.min(...grid.map((b) => Math.abs(b - s.arrivalEnd))).toFixed(4);
    }
    return { i, src: basename(cards[i].src), arrival: +(s.arrivalEnd - s.arrivalStart).toFixed(3), landing, dwellEnd: +s.end.toFixed(3), beatError: err };
  });
  return { id, out, total, start, end, landings, sounds: sounds.length, music: Boolean(lane), lanePoints: lane?.length || 0, warnings };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (a.list) {
    console.log(`templates:  ${Object.keys(TEMPLATES).join(', ')}  (arrangement: none | stack | spacing)`);
    console.log(`pathStyle:  ${PATH_STYLES.map((p) => p.value).join(', ')}`);
    console.log(`entrance:   ${ENTRANCE_EFFECTS.map((p) => p.value).join(', ')}`);
    console.log(`ratio:      ${Object.keys(RATIOS).join(', ')}`);
    console.log(`motion:     board | cards`);
    console.log(`background: any CSS colour, an image path, or a texture: ${Object.keys(TEXTURES).join(', ')}`);
    process.exit(0);
  }
  if (!a.job) {
    console.error('Usage: flythrough.mjs --job <dir> [--spec <file>] [--id x] [--start s] [--track n] [--insert] [--fit-root] | --list');
    process.exit(2);
  }
  const res = await generateFlythrough({ ...a, insert: Boolean(a.insert) });
  console.log(`Wrote ${res.out}: ${res.landings.length} cards, ${res.total} s (composition ${res.start}-${res.end} s), ${res.sounds} transition sounds${res.music ? `, music lane ${res.lanePoints} points` : ''}`);
  for (const l of res.landings) console.log(`  card ${l.i + 1} ${l.src.padEnd(28)} arrival ${String(l.arrival).padEnd(5)} lands ${String(l.landing).padEnd(7)} dwell to ${l.dwellEnd}${l.beatError != null ? `  beat error ${(l.beatError * 1000).toFixed(1)} ms` : ''}`);
  for (const w of res.warnings) console.log(`WARNING: ${w}`);
}
