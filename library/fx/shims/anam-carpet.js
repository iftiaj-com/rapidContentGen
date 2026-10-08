// Adits MagicCarpet (core/anam/MagicCarpet.js, unmodified) driven the way AnamorphicCamera
// drives it: _makeCarpetPlane (the media texture on a 64x64 plane from _planeGeo), _fitObject,
// then MagicCarpet.tick(frame context) from composite(), on the 60 Hz host clock. With
// anamCarpetGesture the point's x banks the carpet and the hand openness sets the wind.

import { makeAnamHost, makeAudio, makeTicker, makeTrack } from './anam-host.js';

export async function create(MagicCarpet, env) {
  const h = makeAnamHost(env);
  const { THREE } = h;
  const ticker = makeTicker(env);
  const audio = makeAudio(env);
  const tr = makeTrack(env, (sx, sy, z) => ({ x: (sx - 0.5) * 2, y: (sy - 0.5) * 2, z }));
  const app = { state: window.app.state, audioEngine: audio.engine };
  let carpet = null;

  function hostTick(k, ms) {
    audio.at(k);
    tr.at(ms);
    h.applyCamera(tr.track, audio.features);
    h.applyRotation();
    carpet.tick(h.frameCtx(tr.track, tr.handOpenness, audio.features, app));
  }

  return {
    build() {
      carpet = new MagicCarpet(THREE);
      const obj = carpet.build(h.texture, h.aspect, h.planeGeo(h.aspect, 64));
      h.fitObject(obj);
      h.modelGroup.add(obj);
    },
    render(ctx) {
      ticker.run(hostTick);
      h.drawBackground(ctx);
      h.render(ctx);
    },
  };
}

export async function setup(effect) { effect.build(); }
