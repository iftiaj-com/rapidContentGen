// 3D scene generator: a procedural Three.js scene as a HyperFrames
// sub-composition, with the camera driven by Adits camera-move cues
// (library/runtime/camera-moves.js, applyToThreeCamera) and optional music
// reactivity (bass swells the object, kicks add beat shake).
//
// Procedural geometry only: the Adits GLB models are on Hold until their
// licenses are cleared (docs/PORTING_CHECKLIST.md).
//
// Rendering is seekable: a GSAP property setter on the sub-composition
// timeline calls renderAt(t); every value is a function of t and the
// precomputed audio table. Three.js loads as an ES module from the CDN the
// HyperFrames three adapter uses, and the timeline registers once the scene is
// built (HyperFrames waits for late registration).
//
// Usage:
//   node tools/blocks/three.mjs --job <dir> --scene orb|knot|crystal|rings
//        [--cue "0:orbit_cw" --cue "2.39:crash_zoom_in" ...] [--bpm 136]
//        [--audio <music> --audio-offset 0] [--color "#64d2ff"] [--accent "#ff4fa3"]
//        [--bg transparent|"#05060a"] [--spin 0.6] [--start 0] [--duration 6] [--id three-main] [--track 3] [--insert]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { analyzeToFile } from '../audio/analyze.mjs';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { ROOT } from '../lib/config.mjs';
import { Moves, parseCue } from './camera.mjs';

const RUNTIME = join(ROOT, 'library', 'runtime', 'camera-moves.js');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.181.2/+esm';
const SCENES = ['orb', 'knot', 'crystal', 'rings'];

/**
 * The camera runtime without comments and blank lines, for inlining into the
 * sub-composition (keeps the file under HyperFrames' size warning). Compiled
 * and checked against the full version's move count before use.
 */
export function compactRuntime() {
  const src = readFileSync(RUNTIME, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s+$/, ''))
    .filter((l) => l.trim())
    .join('\n');
  const ctx = {};
  vm.runInNewContext(`${src}\n;this.out = RCGCameraMoves.names.length;`, ctx);
  if (ctx.out !== Moves.names.length) throw new Error('Compacted camera runtime lost moves.');
  return src;
}

function jobGeometry(jobDir) {
  const html = readFileSync(join(jobDir, 'index.html'), 'utf8');
  const tag = html.match(/<[a-z]+\b[^>]*data-composition-id[^>]*>/i)?.[0] || '';
  const num = (n) => Number(tag.match(new RegExp(`${n}="([^"]+)"`))?.[1]);
  return { html, width: num('data-width') || 1080, height: num('data-height') || 1920, rootDuration: num('data-duration') };
}

export function buildThreeHtml({ id, scene, cues, audio, fps, width, height, duration, color, accent, bg, spin }) {
  const css = `
      #root {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }
      #${id}-canvas {
        position: absolute;
        left: 0;
        top: 0;
        width: ${width}px;
        height: ${height}px;
        display: block;
      }`;
  const moduleScript = `
      import * as THREE from "${THREE_URL}";
      (function () {
        var ID = ${JSON.stringify(id)};
        var DUR = ${duration};
        var FPS = ${fps};
        var W = ${width}, H = ${height};
        var CUES = ${JSON.stringify(cues)};
        var AUDIO = ${audio ? JSON.stringify(audio) : 'null'};   // [[bass, kick], ...] per frame
        var SCENE = ${JSON.stringify(scene)};
        var SPIN = ${spin};
        // Frame the object (radius about 1.9 with its shell) to about 60% of the
        // narrower side. A fixed z = 6, fov 35 overflowed a 9:16 frame: the
        // horizontal view is only about 20 degrees there.
        var FOV = W < H ? 50 : 35;
        var halfNarrow = W < H ? Math.atan(Math.tan((FOV * Math.PI) / 360) * (W / H)) : (FOV * Math.PI) / 360;
        var DIST = 1.9 / (Math.tan(halfNarrow) * 0.62);
        var BASE = { position: [0, 0, DIST], target: [0, 0, 0], fov: FOV };

        var canvas = document.getElementById(ID + "-canvas");
        var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1);
        renderer.setSize(W, H, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        ${bg === 'transparent' ? 'renderer.setClearColor(0x000000, 0);' : `renderer.setClearColor(new THREE.Color(${JSON.stringify(bg)}), 1);`}
        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(BASE.fov, W / H, 0.1, 200);

        // Seeded starfield on a far shell, so orbits and zooms show parallax.
        var seed = 1337;
        function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
        var starPos = new Float32Array(900 * 3);
        for (var si = 0; si < 900; si++) {
          var u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = 40 + rnd() * 30, s = Math.sqrt(1 - u * u);
          starPos[si * 3] = r * s * Math.cos(th); starPos[si * 3 + 1] = r * u; starPos[si * 3 + 2] = r * s * Math.sin(th);
        }
        var starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
        scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.85 })));

        var main = new THREE.Color(${JSON.stringify(color)});
        var acc = new THREE.Color(${JSON.stringify(accent)});
        var group = new THREE.Group();
        scene.add(group);
        var parts = [];
        function std(c, metal, rough, emissive) {
          return new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough, emissive: emissive || 0x000000, emissiveIntensity: 0.6 });
        }
        if (SCENE === "orb") {
          var orb = new THREE.Mesh(new THREE.SphereGeometry(1.25, 96, 96), std(main, 0.55, 0.25));
          group.add(orb); parts.push(orb);
          var shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshBasicMaterial({ color: acc, wireframe: true, transparent: true, opacity: 0.55 }));
          group.add(shell); parts.push(shell);
        } else if (SCENE === "knot") {
          var knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.95, 0.32, 256, 32), std(main, 0.7, 0.2, acc));
          group.add(knot); parts.push(knot);
        } else if (SCENE === "crystal") {
          var core = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0), std(main, 0.2, 0.05, acc));
          core.material.flatShading = true; group.add(core); parts.push(core);
          for (var i = 0; i < 8; i++) {
            var a = (i / 8) * Math.PI * 2;
            var shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), std(acc, 0.3, 0.1));
            shard.position.set(Math.cos(a) * 2.1, Math.sin(a * 2) * 0.35, Math.sin(a) * 2.1);
            group.add(shard); parts.push(shard);
          }
        } else {
          [1.0, 1.35, 1.7].forEach(function (r, i) {
            var ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 24, 160), std(i === 1 ? acc : main, 0.85, 0.2));
            group.add(ring); parts.push(ring);
          });
          var heart = new THREE.Mesh(new THREE.SphereGeometry(0.45, 48, 48), std(acc, 0.1, 0.3, acc));
          group.add(heart); parts.push(heart);
        }
        scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2233, 1.6));
        var key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 5); scene.add(key);
        var rim = new THREE.PointLight(acc.getHex(), 30, 20); rim.position.set(-3, -1, -2); scene.add(rim);

        function audioAt(t) {
          if (!AUDIO) return [0, 0];
          var f = Math.max(0, Math.min(AUDIO.length - 1, Math.floor(t * FPS + 1e-6)));
          return AUDIO[f];
        }
        function renderAt(t) {
          var au = audioAt(t);
          var swell = 1 + 0.18 * au[0];
          group.scale.setScalar(swell);
          group.rotation.y = t * SPIN;
          group.rotation.x = Math.sin(t * 0.6) * 0.18;
          if (SCENE === "orb") parts[1].rotation.y = -t * SPIN * 1.6;
          if (SCENE === "rings") parts.slice(0, 3).forEach(function (r, i) { r.rotation.x = t * (0.5 + i * 0.35); r.rotation.y = t * (0.3 + i * 0.25); });
          if (SCENE === "crystal") parts.slice(1).forEach(function (s, i) { s.rotation.x = t * 1.3 + i; s.rotation.y = t * 0.9 + i; });
          var pose = RCGCameraMoves.poseAt(CUES, t, function () { return au[1]; });
          RCGCameraMoves.applyToThreeCamera(camera, pose, BASE);
          renderer.render(scene, camera);
        }

        var tl = gsap.timeline({ paused: true });
        var drv = { _t: 0 };
        Object.defineProperty(drv, "t", { get: function () { return this._t; }, set: function (v) { this._t = v; renderAt(v); } });
        tl.to(drv, { t: DUR, duration: DUR, ease: "none" }, 0);
        renderAt(0);
        window.__timelines[ID] = tl;
      })();`;

  // Compile-check the module body (without the import line) as a classic script.
  try {
    new vm.Script(moduleScript.replace(/^\s*import[^;]+;/m, 'var THREE = {};'), { filename: `${id}.inline.js` });
  } catch (err) {
    throw new Error(`Generated three.js script for ${id} does not parse: ${err.message}`);
  }
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- Generated by tools/blocks/three.mjs: scene "${scene}". Regenerate instead of hand-editing. -->
  </head>
  <body>
    <template>
      <style>${css}
      </style>
      <div id="root" data-composition-id="${id}" data-width="${width}" data-height="${height}">
        <canvas id="${id}-canvas" data-layout-allow-overflow></canvas>
      </div>
      <script>
${compactRuntime()}
      </script>
      <script type="module">${moduleScript}
      </script>
    </template>
  </body>
</html>
`;
}

export async function generateThree(opts) {
  const jobDir = resolve(opts.job);
  const scene = opts.scene || 'orb';
  if (!SCENES.includes(scene)) throw new Error(`--scene must be one of ${SCENES.join(', ')}`);
  const geo = jobGeometry(jobDir);
  const duration = Number(opts.duration) || geo.rootDuration || 6;
  const fps = Number(opts.fps) || 24;
  const id = opts.id || 'three-main';
  const cues = [].concat(opts.cue || ['0:orbit_cw']).map((c) => parseCue(c, { bpm: opts.bpm })).sort((a, b) => a.at - b.at);
  const flat = cues.find((c) => c.move.startsWith('vc.'));
  if (flat) throw new Error(`${flat.move} is a 2D footage preset (rcg camera); the 3D camera takes moves only. Run rcg camera --list.`);
  let audio = null;
  if (opts.audio) {
    const table = await analyzeToFile(resolve(opts.audio), join(jobDir, 'data', `${id}.audio.json`), {
      fps, duration: duration + 1 / fps, offset: Number(opts['audio-offset'] || 0), clock: 'default',
    });
    audio = table.frames.map((f) => [f.bass, f.kick]);
  }
  const html = buildThreeHtml({
    id, scene, cues, audio, fps, width: geo.width, height: geo.height, duration,
    color: opts.color || '#64d2ff', accent: opts.accent || '#ff4fa3', bg: opts.bg || 'transparent', spin: Number(opts.spin ?? 0.6),
  });
  mkdirSync(join(jobDir, 'compositions'), { recursive: true });
  const out = join(jobDir, 'compositions', `${id}.html`);
  writeFileSync(out, html);
  const start = Number(opts.start || 0);
  const host = `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${start}" data-duration="${duration}" data-track-index="${opts.track || 3}" data-width="${geo.width}" data-height="${geo.height}"></div>`;
  if (opts.insert) {
    const h = geo.html;
    const existing = new RegExp(`<div id="${id}"[^>]*data-composition-src="compositions/${id}\\.html"[^>]*></div>`);
    if (existing.test(h)) writeFileSync(join(jobDir, 'index.html'), h.replace(existing, host));
    else {
      const idx = h.lastIndexOf('</div>', h.lastIndexOf('<script>', h.lastIndexOf('window.__timelines')));
      if (idx < 0) throw new Error('Could not find the root closing tag. Insert the host by hand.');
      writeFileSync(join(jobDir, 'index.html'), `${h.slice(0, idx)}  ${host}\n    ${h.slice(idx)}`);
    }
  }
  return { out, host, scene, cues, audio: Boolean(audio) };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (!a.job) {
    console.error(`Usage: three.mjs --job <dir> --scene ${SCENES.join('|')} [--cue "at:move[:i=..][:s=..][:loop][:bars=N]"]... [--bpm n] [--audio music] [--color c] [--accent c] [--bg transparent|color] [--spin r] [--start s] [--duration s] [--id x] [--insert]`);
    process.exit(2);
  }
  const res = await generateThree({ ...a, insert: Boolean(a.insert) });
  console.log(`Wrote ${res.out} (${res.scene}; camera ${res.cues.map((c) => `${c.at}s ${c.move}`).join(', ')}${res.audio ? '; audio-reactive' : ''})`);
  console.log(a.insert ? 'Host inserted into index.html' : `Host element:\n${res.host}`);
}
export { Moves };
