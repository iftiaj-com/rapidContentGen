// Adits VoxelArt (core/anam/VoxelArt.js, unmodified) driven the way AnamorphicCamera drives it:
// _buildVoxelArtModel (the grid is built in local space, so no _fitObject) and composite()'s
// Voxel Art block (audio depth pulse, Custom Gesture pop, tick), on the 60 Hz host clock. The
// footage is a video model, so the relief is re-voxelised from the live frame on every tick.

import { bandLevel, makeAnamHost, makeAudio, makeTicker, makeTrack } from './anam-host.js';

export async function create(VoxelArt, env) {
  const h = makeAnamHost(env);
  const { dom, THREE } = h;
  const ticker = makeTicker(env);
  const audio = makeAudio(env);
  // Voxel Art reads only the hand openness (Custom Gesture); the point's position is not used.
  const tr = makeTrack(env, (sx, sy, z) => ({ x: (sx - 0.5) * 2, y: (sy - 0.5) * 2, z }));
  let art = null;
  let gesturePop = 0;

  function hostTick(k, ms) {
    audio.at(k);
    tr.at(ms);
    h.applyCamera(tr.track, audio.features);
    h.applyRotation();
    if (dom.anamVoxelArtAudio?.checked) art.setAudioPulse(1 + bandLevel(audio.features, dom.anamVoxelArtAudioMode?.value || 'bass') * 0.9);
    if (dom.anamVoxelArtGesture?.checked) {
      // Open palm grows the relief out of the flat image, fist / no hand flattens it.
      const open = tr.handOpenness;
      const target = (open != null) ? open * 1.4 : 0;
      gesturePop += (target - gesturePop) * 0.2;
      art.setGesturePop(gesturePop);
    }
    art.tick();
  }

  return {
    build() {
      art = new VoxelArt({ THREE });
      const group = art.build(h.texture, h.aspect, {
        cols: parseInt(dom.anamVoxelArtRes?.value ?? 48),
        levels: parseInt(dom.anamVoxelArtLevels?.value ?? 12),
        heightScale: parseFloat(dom.anamVoxelArtHeight?.value ?? 100) / 100,
        outline: parseFloat(dom.anamVoxelArtOutline?.value ?? 40) / 100 * 0.12,
        baseTint: dom.anamVoxelArtBaseTint?.checked !== false,
        autoRotate: !!dom.anamVoxelArtRotate?.checked,
        isVideo: true,
      });
      h.modelGroup.add(group);
    },
    render(ctx) {
      ticker.run(hostTick);
      h.drawBackground(ctx);
      h.render(ctx);
    },
  };
}

export async function setup(effect) { effect.build(); }
