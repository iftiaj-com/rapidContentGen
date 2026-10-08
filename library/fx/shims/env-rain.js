// Adits RainSystem (core/anam/RainSystem.js, unmodified) driven the way AnamorphicCamera's
// _buildRain / _tickRain / _compositeRain drive it: its own scene, the finished frame copied at
// half resolution as the background the drops refract, live params read every frame,
// update(dt, intensity, time, fall, wind, densityK) then updateSplashes(dt).
//
// Differences: dt is a fixed 1/fps and time is the frame time (Adits: wall clock). Manual
// trigger rains at full intensity from the first frame (Adits eases in from 0 when switched
// on; set rcgRainEaseIn to keep that). Collision ("splash on subject") uses the footage luma
// field, the path Adits takes when no 3D model is loaded.

import { domProxy, makeHost } from './three-host.js';

const num = (dom, id, d) => { const v = parseFloat(dom[id]?.value); return Number.isFinite(v) ? v : d; };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export async function create(RainSystem, env) {
  const { RainCollision } = await import('/lib/adits-fx/core/anam/RainSystem.js');
  const { width: W, height: H, fps } = env.job;
  const host = makeHost(W, H);
  const { THREE } = host;
  const dom = domProxy();
  const density = num(dom, 'rainDensity', 20);
  const count = Math.round(300 + Math.max(0, Math.min(100, density)) / 100 * 29700);
  const rain = RainSystem.build(THREE, host.camera, { count, colorMode: parseInt(dom.rainColorMode?.value ?? 0), customColor: dom.rainCustomColor?.value || '#9ec5ff' });
  const rainScene = new THREE.Scene();
  if (rain.points) rainScene.add(rain.points);
  if (rain.splashPoints) rainScene.add(rain.splashPoints);
  const collision = new RainCollision(THREE);
  const bg = document.createElement('canvas');
  bg.width = Math.max(2, W >> 1); bg.height = Math.max(2, H >> 1);
  const bgCtx = bg.getContext('2d');
  const bgTex = new THREE.CanvasTexture(bg);
  bgTex.minFilter = THREE.LinearFilter;
  bgTex.generateMipmaps = false;
  rain.setBackground(bgTex, W, H);
  const easeIn = dom.rcgRainEaseIn?.checked;
  let intensity = easeIn ? 0 : 1;
  let audioEMA = 0;

  function target(audio) {
    const trigger = dom.rainTrigger?.value || 'manual';
    if (trigger === 'timer') {
      const dur = Math.max(0.5, num(dom, 'rainDuration', 4));
      const t = performance.now() * 0.001;
      const phase = (t % (2 * dur)) / dur;
      const tri = phase <= 1 ? phase : 2 - phase;
      return { value: tri * tri * (3 - 2 * tri), direct: true };
    }
    if (trigger === 'beat') {
      const band = dom.rainBand?.value || 'all';
      const f = audio || {};
      const level = band === 'bass' ? (f.bass || 0) : band === 'mid' ? (f.mid || 0) : band === 'treble' ? (f.treble || 0) : Math.max(f.bass || 0, f.mid || 0, f.treble || 0);
      audioEMA = audioEMA * 0.6 + level * 0.4;
      return { value: clamp01(audioEMA), k: 0.4 };
    }
    return { value: 1, k: 0.1 }; // manual / gesture latched on
  }

  return {
    render(ctx, ve, media, crop, audio) {
      const dt = Math.max(0.001, Math.min(0.05, 1 / fps));
      const tg = target(audio);
      if (tg.direct) intensity = tg.value;
      else if (easeIn || tg.k === 0.4) { intensity += (tg.value - intensity) * tg.k; if (Math.abs(tg.value - intensity) < 0.001) intensity = tg.value; }
      else intensity = tg.value;
      intensity = clamp01(intensity);
      const fallVal = Math.max(10, num(dom, 'rainFall', 50));
      rain.setSize(num(dom, 'rainSize', 18));
      rain.setShutter(num(dom, 'rainTrails', 35) / 100);
      rain.setRefraction(num(dom, 'rainRefraction', 50) / 100);
      rain.setHaze(num(dom, 'rainHaze', 30) / 100);
      const cmode = parseInt(dom.rainColorMode?.value ?? 0);
      rain.setColorMode(cmode);
      if (cmode === 6) rain.setCustomColor(dom.rainCustomColor?.value || '#9ec5ff');
      rain.update(dt, intensity, performance.now() * 0.001, fallVal / 50, num(dom, 'rainWind', 0) / 100 * 6, Math.min(1, 50 / fallVal));
      // The finished frame under the rain: the footage.
      ctx.drawImage(media, 0, 0, W, H);
      if (dom.rainCollision?.checked && intensity > 0.02) {
        const splash = num(dom, 'rainSplashSize', 13);
        rain.setSplashSize(splash);
        if (collision.refreshBackgroundField(ctx)) collision.step(rain, host.camera, num(dom, 'rainSurfaceLevel', 55) / 100, dom.rainCollisionMode?.value || 'splash', splash);
      }
      rain.updateSplashes(dt);
      if (intensity < 0.01 && !rain.hasLiveSplashes) return;
      bgCtx.drawImage(ctx.canvas, 0, 0, bg.width, bg.height);
      bgTex.needsUpdate = true;
      host.renderer.render(rainScene, host.camera);
      ctx.drawImage(host.renderer.domElement, 0, 0, W, H);
    },
  };
}
