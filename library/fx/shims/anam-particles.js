// Adits ParticleSystem (core/anam/ParticleSystem.js, unmodified) driven the way
// AnamorphicCamera drives the custom-media particle cloud: _loadModel's particle branch (a
// still of the video model, _videoFrameURL, sampled by buildImageParticlePoints), _fitObject,
// then per frame _syncRevealUniforms and ParticleSystem.tick(particles, frame context), on the
// 60 Hz host clock. The dance modes read the analyser bins (app.audioEngine.freqData, --audio);
// the repel follows the point (--track / --point) in the cloud's own space; Reveal Wipe follows
// it on screen. Not rebuilt: Reveal Wipe's "Solid Model" half and the Transform styles.
//
// rcgLiveColor (rcg addition, off = Adits): re-colour the image particles from the current
// footage frame each output frame, with the same sampling (fit / fill / stretch) as the build.

import { makeAnamHost, makeAudio, makeTicker, makeTrack } from './anam-host.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** _videoFrameURL: the current frame, longest side at most 512, as a PNG data URL. */
function frameURL(media) {
  const max = 512;
  const s = Math.min(1, max / Math.max(media.width, media.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(media.width * s));
  c.height = Math.max(1, Math.round(media.height * s));
  c.getContext('2d').drawImage(media, 0, 0, c.width, c.height);
  return { url: c.toDataURL('image/png'), w: c.width, h: c.height };
}

export async function create(ParticleSystem, env) {
  const h = makeAnamHost(env);
  const { dom, THREE } = h;
  const ticker = makeTicker(env);
  const audio = makeAudio(env);
  const ps = new ParticleSystem(THREE);
  let points = null;
  let particles = null;
  let live = null;
  // tick() repels from (track.x, -track.y, 0) in the points' own space.
  const tr = makeTrack(env, (sx, sy, z) => {
    const p = h.screenToLocal(points, sx, sy);
    return { x: p.x, y: -p.y, z };
  });
  const app = { state: window.app.state, audioEngine: audio.engine };

  // _syncRevealUniforms; a present point moves the edge / spotlight to it on screen.
  function syncReveal() {
    const u = particles?.mat?.uniforms;
    if (!u || !u.uRevealOn) return;
    const on = !!dom.anamRevealEnabled?.checked;
    u.uRevealOn.value = on ? 1 : 0;
    if (!on) return;
    const spotlight = (dom.anamRevealMode?.value || 'edge') === 'spotlight';
    u.uRevealMode.value = spotlight ? 1 : 0;
    u.uAspect.value = h.W / h.H;
    u.uRevealFeather.value = Math.max(0.001, parseFloat(dom.anamRevealFeather?.value ?? 10) / 100 * 0.5);
    u.uRevealAngle.value = parseFloat(dom.anamRevealAngle?.value ?? 0) * Math.PI / 180;
    u.uRevealRadius.value = parseFloat(dom.anamRevealRadius?.value ?? 40) / 100;
    if (tr.track.has) u.uRevealPos.value.set(clamp01(tr.screen.x), spotlight ? clamp01(1 - tr.screen.y) : 0.5);
    else u.uRevealPos.value.set(parseFloat(dom.anamRevealPos?.value ?? 50) / 100, 0.5);
  }

  function hostTick(k, ms) {
    audio.at(k);
    tr.at(ms);
    h.applyCamera(tr.track, audio.features);
    h.applyRotation();
    syncReveal();
    ps.tick(particles, h.frameCtx(tr.track, tr.handOpenness, audio.features, app));
  }

  // rcgLiveColor: per image particle, its UV from its rest position (imageParticleGrid maps
  // u, v in 0..1 to a, b in -1..1 on the plane or on each cube face), read back each frame.
  function setupLiveColor(srcW, srcH, is3D, includeGlass) {
    const Ntotal = Math.max(500, parseInt(dom.anamParticleCount?.value ?? 15000));
    const nImg = particles.N - (includeGlass ? Math.round(Ntotal * 0.3) : 0);
    const fitMode = dom.anamImageFit?.value || 'stretch';
    let cvsW = srcW; let cvsH = srcH;
    if (fitMode === 'fit') { cvsW = cvsH = Math.max(srcW, srcH); } else if (fitMode === 'fill') { cvsW = cvsH = Math.min(srcW, srcH); }
    const scale = Math.max(cvsW, cvsH) > 512 ? 512 / Math.max(cvsW, cvsH) : 1;
    const W = Math.max(1, Math.round(cvsW * scale));
    const H = Math.max(1, Math.round(cvsH * scale));
    const px = new Uint32Array(nImg);
    const o = particles.origins;
    for (let i = 0; i < nImg; i++) {
      const x = o[i * 3]; const y = o[i * 3 + 1]; const z = o[i * 3 + 2];
      // Flat cloud: (a, b, 0). Cube: the face is the axis at +-1 (+-Z: x, y; +-X: z, y; +-Y: x, z).
      const ax = Math.abs(x); const ay = Math.abs(y); const az = Math.abs(z);
      const [a, b] = !is3D || (az >= ax && az >= ay) ? [x, y] : (ax >= ay ? [z, y] : [x, z]);
      const u = (a + 1) / 2; const v = (b + 1) / 2;
      const cx = Math.min(Math.round(u * (W - 1)), W - 1);
      const cy = Math.min(Math.round((1 - v) * (H - 1)), H - 1);
      px[i] = (cy * W + cx) * 4;
    }
    const small = document.createElement('canvas');
    small.width = srcW; small.height = srcH;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    return {
      update(media) {
        small.getContext('2d').drawImage(media, 0, 0, srcW, srcH);
        // The same draw as buildImageParticlePoints, so a pixel lands where the build put it.
        if (fitMode !== 'stretch') { g.fillStyle = 'black'; g.fillRect(0, 0, W, H); }
        if (fitMode === 'fill') {
          const size = Math.min(srcW, srcH);
          g.drawImage(small, (srcW - size) / 2, (srcH - size) / 2, size, size, 0, 0, W, H);
        } else if (fitMode === 'fit') {
          g.filter = 'blur(15px) brightness(0.4)';
          const bgScale = Math.max(W / srcW, H / srcH);
          g.drawImage(small, (W - srcW * bgScale) / 2, (H - srcH * bgScale) / 2, srcW * bgScale, srcH * bgScale);
          g.filter = 'none';
          const size = Math.max(srcW, srcH);
          g.drawImage(small, ((size - srcW) / 2) * scale, ((size - srcH) / 2) * scale, srcW * scale, srcH * scale);
        } else g.drawImage(small, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data;
        const col = particles.geo.attributes.aPhotoColor;
        for (let i = 0; i < nImg; i++) {
          const j = px[i];
          col.array[i * 3] = d[j] / 255; col.array[i * 3 + 1] = d[j + 1] / 255; col.array[i * 3 + 2] = d[j + 2] / 255;
        }
        col.needsUpdate = true;
      },
    };
  }

  return {
    async build() {
      const is3D = dom.anam3dImage?.checked !== false;
      const includeGlass = is3D && dom.anamGlassShow?.checked !== false;
      const src = frameURL(env.media);
      const r = await ps.buildImageParticlePoints(src.url, is3D, includeGlass, dom, { cutout: false });
      points = r.points;
      particles = r.particles;
      h.fitObject(points);
      h.modelGroup.add(points);
      if (dom.rcgLiveColor?.checked) live = setupLiveColor(src.w, src.h, is3D, includeGlass);
    },
    render(ctx) {
      ticker.run(hostTick);
      if (live) live.update(env.media);
      h.drawBackground(ctx);
      h.render(ctx, { solid: false });
    },
  };
}

export async function setup(effect) { await effect.build(); }
