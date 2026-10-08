// The part of Adits' AnamorphicCamera (core/AnamorphicCamera.js) that the 2D-media model
// effects need, rebuilt for the fx harness: the scene from _buildScene, the media texture from
// _make2DMediaTexture (video branch), _planeAspect / _planeGeo / _fitObject, the camera and model
// transform from _applyCameraFromTrack plus composite()'s rotation block, _syncFrameCtx's frame
// context, _getCanvasFilter and the plain branch of _drawObjectLayer. The effect modules
// themselves (library/adits-fx/core/anam) run unmodified on top of it.
//
// Three host-level differences, all forced by rendering offline:
//  * Clock. Adits runs composite() once per display frame (a 60 Hz rAF on the machines it
//    targets) and every module eases, springs or steps physics per call. The harness renders
//    once per output frame, so makeTicker() runs the host logic at options.tickHz (60) on the
//    frame-locked clock and the scene renders once per output frame: the motion matches the
//    live preview instead of running at 24/60 speed.
//  * The followed point. Adits tracks the viewer's hand or face on a mirrored webcam. Offline
//    the point is the subject in the footage (rcg track) or a keyframed point (rcg fx --point),
//    given in output-frame coordinates; each effect converts it to the `_track` value that puts
//    its effect at that point on screen (screenToLocal). It arrives smoothed (One-Euro in rcg
//    track), so Adits' own filter is skipped; a lost point eases home as Adits does (5% a tick).
//  * Audio. Adits reads its live AnalyserNode; the harness gets that analyser emulated per tick
//    (tools/audio/analyser.mjs): the same 128 byte bins and the same bass/mid/treble formula.
// Not rebuilt: the studio light rig and PMREM environment (these effects all use unlit
// ShaderMaterials), background parallax / dolly / fractal passes, glitches, trails, shadows,
// camera movements. The background is the footage frame as it is (or side B, black, none).

import { domProxy, makeHost } from './three-host.js';

export const bandLevel = (f, mode) => (mode === 'bass' ? (f.bass || 0)
  : mode === 'mid' ? (f.mid || 0)
    : mode === 'treble' ? (f.treble || 0)
      : Math.max(f.bass || 0, f.mid || 0, f.treble || 0));

/** "0.5, 4" (seconds of the output clip) -> sorted harness-clock ms (pre-roll included). */
export function schedule(str, env) {
  const pre = ((env.job.skip || 0) / env.job.fps) * 1000;
  return String(str || '').split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite).map((s) => s * 1000 + pre).sort((a, b) => a - b);
}

/** Host clock: run(fn) calls fn(k, ms) for every host tick up to the current frame time and
 *  returns how many ran (none when the output fps is above the tick rate). */
export function makeTicker(env) {
  const hz = env.job.options?.tickHz || 60;
  const step = 1000 / hz;
  let k = 0;
  return {
    hz,
    run(fn) {
      const until = env.now();
      let n = 0;
      while (k * step <= until + 1e-6) { env.setNow(k * step); fn(k, k * step); k++; n++; }
      env.setNow(until);
      return n;
    },
  };
}

/** Adits audioEngine stand-in: one features object and one byte-bin buffer, refreshed per tick. */
export function makeAudio(env) {
  const a = env.job.analyser;
  const features = { bass: 0, mid: 0, treble: 0, vol: 0, rawVol: 0, rawPulse: 0 };
  const bins = a ? new Uint8Array(a.fftSize / 2) : null;
  const engine = { features, freqData: null };
  return {
    engine,
    features,
    at(k) {
      if (!a) return;
      const i = Math.min(k, a.ticks - 1);
      Object.assign(features, a.features[i]);
      const s = atob(a.freq[i]);
      for (let j = 0; j < bins.length; j++) bins[j] = s.charCodeAt(j);
      engine.freqData = bins;
    },
  };
}

/** Adits `_track` + `_handOpenness`, fed from the harness points. toTrack(sx, sy, z) -> {x, y, z}. */
export function makeTrack(env, toTrack) {
  const pts = env.job.track;
  const track = { x: 0, y: 0, z: 0, has: false };
  const st = { open: null };
  const screen = { x: 0.5, y: 0.5 }; // the point itself (output frame, 0..1), while present
  return {
    track,
    screen,
    get handOpenness() { return st.open; },
    at(ms) {
      if (!pts) return; // no point source: tracking off, the view stays centred
      const fi = (ms * env.job.fps) / 1000;
      const i0 = Math.min(Math.floor(fi), pts.length - 1);
      const p0 = pts[i0];
      const p1 = pts[Math.min(i0 + 1, pts.length - 1)];
      if (p0?.has) {
        const u = p1?.has ? Math.min(1, fi - i0) : 0;
        const lerp = (a, b) => a + ((b ?? a) - a) * u;
        screen.x = lerp(p0.x, p1.x); screen.y = lerp(p0.y, p1.y);
        const t = toTrack(screen.x, screen.y, lerp(p0.z, p1.z));
        track.x = t.x; track.y = t.y; track.z = t.z; track.has = true;
        st.open = p0.open == null ? null : lerp(p0.open, p1.open);
      } else {
        track.x += (0 - track.x) * 0.05; track.y += (0 - track.y) * 0.05; track.z += (0 - track.z) * 0.05;
        track.has = false;
        st.open = null;
      }
    },
  };
}

export function makeAnamHost(env) {
  const { width: W, height: H } = env.job;
  const base = makeHost(W, H);
  const { THREE, renderer, scene, camera } = base;
  const dom = domProxy();

  // _applyToneMapping
  const MAP = { none: THREE.NoToneMapping, linear: THREE.LinearToneMapping, reinhard: THREE.ReinhardToneMapping, cineon: THREE.CineonToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping };
  renderer.toneMapping = MAP[dom.anamToneMapping?.value ?? 'aces'] ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = parseFloat(dom.anamExposure?.value ?? 1.0);

  const modelGroup = new THREE.Group();
  scene.add(modelGroup);

  // _make2DMediaTexture, video branch: the live frame, sampled like a VideoTexture.
  const texture = new THREE.CanvasTexture(env.media);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  function planeAspect(srcAspect) {
    const sel = dom.anamModelRatio?.value || 'original';
    if (sel !== 'original') {
      const p = sel.split(':');
      if (p.length === 2) {
        const a = parseFloat(p[0]) / parseFloat(p[1]);
        if (a > 0 && isFinite(a)) return a;
      }
    }
    return (srcAspect > 0 && isFinite(srcAspect)) ? srcAspect : 1;
  }
  const aspect = planeAspect(W / H);

  function planeGeo(a, seg = 1) {
    const w = a >= 1 ? 2 * a : 2;
    const h = a >= 1 ? 2 : 2 / a;
    return seg > 1 ? new THREE.PlaneGeometry(w, h, seg, seg) : new THREE.PlaneGeometry(w, h);
  }

  function fitObject(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = 2.0 / maxDim;
    obj.scale.setScalar(s);
    obj.position.set(-center.x * s, -center.y * s, -center.z * s);
  }

  // _applyCameraFromTrack (zoom gesture, dolly zoom and camera movements off).
  function applyCamera(track, features) {
    const strength = parseFloat(dom.anamStrength?.value ?? 100) / 100;
    const depth = parseFloat(dom.anamDepth?.value ?? 50) / 100;
    const userScale = parseFloat(dom.anamScale?.value ?? 100) / 100;
    const holdStill = !!dom.anamMagnetHold?.checked;
    const maxShift = 3.0 * strength;
    const tx = holdStill ? 0 : track.x * maxShift;
    const ty = holdStill ? 0 : -track.y * maxShift;
    const baseZ = 5.0;
    const dz = holdStill ? 0 : track.z * 2.5 * depth;
    const baseDist = baseZ - dz;
    const dist = Math.max(0.5, baseDist);
    const fov0 = 35.0;
    camera.fov = 2 * Math.atan((baseDist * Math.tan(fov0 * Math.PI / 360.0)) / dist) * 180.0 / Math.PI;
    camera.updateProjectionMatrix();
    camera.position.set(tx, ty, dist);
    camera.lookAt(0, 0, 0);
    let scaleFactor = userScale;
    if (dom.anamBeatPulse?.checked) scaleFactor *= (1.0 + (features.bass ?? 0) * 0.35);
    if (dom.anamBreathe?.checked) scaleFactor *= (1.0 + Math.sin(performance.now() * 0.002) * 0.08);
    modelGroup.scale.setScalar(scaleFactor);
    let fx = 0; let fy = 0; let fz = 0;
    if (dom.anamFloat?.checked) {
      const time = performance.now() * 0.0015;
      fx = Math.sin(time * 0.7) * 0.12;
      fy = Math.cos(time * 1.1) * 0.12;
      fz = Math.sin(time * 0.5) * 0.15;
    }
    const pH = (parseFloat(dom.anamPerspH?.value ?? 0) / 100) * 2.5;
    const pV = (parseFloat(dom.anamPerspV?.value ?? 0) / 100) * 2.5;
    modelGroup.position.set(-tx * 0.12 + fx + pH, -ty * 0.12 + fy + pV, fz);
  }

  // composite(): the model rotation block (spin, tumble, roll, float wobble, fixed perspective).
  const ang = { spin: 0, spinUD: 0, roll: 0 };
  function applyRotation() {
    let rx = 0; let ry = 0; let rz = 0;
    if (dom.anamSpin?.checked) { ang.spin += 0.012; ry += ang.spin; }
    if (dom.anamSpinUD?.checked) { ang.spinUD += 0.012; rx += ang.spinUD; }
    if (dom.anamRoll?.checked) { ang.roll += 0.012 * (parseFloat(dom.anamRollSpeed?.value ?? 50) / 50); rz += ang.roll; }
    if (dom.anamFloat?.checked) {
      const time = performance.now() * 0.0015;
      rx += Math.sin(time * 0.8) * 0.08;
      rz += Math.cos(time * 0.6) * 0.08;
    }
    rx += (parseFloat(dom.anamPerspAngle?.value ?? 0) / 100) * (Math.PI / 2);
    ry += (parseFloat(dom.anamPerspRot?.value ?? 0) / 100) * Math.PI;
    rz += (parseFloat(dom.anamPerspRoll?.value ?? 0) / 100) * Math.PI;
    modelGroup.rotation.set(rx, ry, rz);
  }

  function hexToHue(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
    if (d < 0.001) return 0;
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return Math.round(h / 6 * 360) - 40;
  }
  // _getCanvasFilter: the Color Mode as a CSS filter on solid (non-particle) models.
  function canvasFilter() {
    const mode = parseFloat(dom.anamColorMode?.value ?? 0);
    if (mode < 0.5) return null;
    const strength = parseFloat(dom.anamColorModeStrength?.value ?? 100) / 100;
    if (mode < 1.5) return `grayscale(${strength})`;
    if (mode < 2.5) return `hue-rotate(${(performance.now() * 0.04 * strength) % 360}deg) saturate(${1.0 + strength})`;
    if (mode < 3.5) return `saturate(${1.0 + 19.0 * strength}) hue-rotate(${195 * strength}deg)`;
    if (mode < 4.5) return `sepia(${strength}) saturate(${1.0 + 3.0 * strength}) hue-rotate(${330 * strength}deg)`;
    if (mode < 5.5) return `saturate(${1.0 + 3.0 * strength}) hue-rotate(${250 * strength}deg) brightness(${1.0 + 0.3 * strength})`;
    if (mode < 6.5) return `saturate(${1.0 + 3.0 * strength}) hue-rotate(${200 * strength}deg) brightness(${1.0 + 0.1 * strength})`;
    if (mode < 7.5) return `saturate(${1.0 + 3.0 * strength}) hue-rotate(${340 * strength}deg) brightness(${1.0 + 0.2 * strength})`;
    if (mode >= 9.5 && mode < 10.5) {
      const hueShift = hexToHue(dom.anamCustomColor?.value ?? '#ff70b8');
      return `sepia(${strength}) saturate(${1.0 + 7.0 * strength}) hue-rotate(${hueShift * strength}deg)`;
    }
    return null;
  }

  /** The frame under the model: the footage (or side B with --src2), black, or nothing. */
  function drawBackground(ctx) {
    if (env.job.alpha) return;
    const mode = dom.rcgBackground?.value || 'auto';
    if (mode === 'none') return;
    if (mode === 'black') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
    const useB = env.media2 && (mode === 'src2' || mode === 'auto');
    ctx.drawImage(useB ? env.media2 : env.media, 0, 0, W, H);
  }

  /** Render the scene and lay it over ctx (_drawObjectLayer's plain branch). */
  function render(ctx, { solid = true } = {}) {
    texture.needsUpdate = true;
    renderer.render(scene, camera);
    const filter = solid ? canvasFilter() : null;
    if (filter) { ctx.save(); ctx.filter = filter; }
    ctx.drawImage(renderer.domElement, 0, 0, W, H);
    if (filter) { ctx.filter = 'none'; ctx.restore(); }
  }

  /** Where the ray through output-frame point (sx, sy) meets obj's local z = 0 plane. */
  const tmp = { v: new THREE.Vector3(), o: new THREE.Vector3(), d: new THREE.Vector3(), inv: new THREE.Matrix4() };
  function screenToLocal(obj, sx, sy) {
    camera.updateMatrixWorld();
    obj.updateMatrixWorld(true);
    tmp.v.set(sx * 2 - 1, 1 - sy * 2, 0.5).unproject(camera);
    tmp.d.copy(tmp.v).sub(camera.position);
    tmp.inv.copy(obj.matrixWorld).invert();
    tmp.o.copy(camera.position).applyMatrix4(tmp.inv);
    tmp.d.transformDirection(tmp.inv);
    if (Math.abs(tmp.d.z) < 1e-6) return { x: 0, y: 0 };
    const t = -tmp.o.z / tmp.d.z;
    return { x: tmp.o.x + tmp.d.x * t, y: tmp.o.y + tmp.d.y * t };
  }

  // _syncFrameCtx: the shared per-frame context the core/anam modules read.
  const f = { dom, track: null, camera, scene, modelGroup, currentModelKey: '__custom', envParallax: 0, dt: 0.016, now: 0, w: W, h: H, audio: null, app: null, handOpenness: null };
  let lastT = 0;
  function frameCtx(track, handOpenness, audio, app) {
    const now = performance.now();
    f.dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.016;
    lastT = now;
    f.now = now; f.track = track; f.audio = audio; f.app = app; f.handOpenness = handOpenness;
    return f;
  }

  return { ...base, dom, W, H, modelGroup, texture, aspect, planeGeo, fitObject, applyCamera, applyRotation, canvasFilter, drawBackground, render, screenToLocal, frameCtx };
}
