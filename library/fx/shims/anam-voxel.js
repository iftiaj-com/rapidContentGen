// Adits VoxelDrop (core/anam/VoxelDrop.js, unmodified, with the Rapier build Adits vendors)
// driven the way AnamorphicCamera drives it: _buildVoxelModel, _triggerVoxelDrop and
// composite()'s voxel block (Magnet / Flip / Grow drives, the tunnel speed drive, tick(), the
// Auto Timer and the Audio Trigger), on the 60 Hz host clock (anam-host.js). One class, five
// registry effects: voxel-drop (styles drop / orbit / tunnel / bursts), voxel-hole, voxel-magnet,
// voxel-flip, voxel-grow. The grid lives in the model group's local space (no _fitObject).
// Pyramorphic, also in VoxelDrop, is not wired here.
//
// rcg params: rcgDropAt / rcgBackAt = seconds of the output clip where the Drop and Back to
// Plane buttons are pressed; rcgBackground auto | footage | src2 | black | none.

import { bandLevel, makeAnamHost, makeAudio, makeTicker, makeTrack, schedule } from './anam-host.js';

const magnetRangeToRadius = (v) => 0.15 + (Math.max(0, Math.min(100, v)) / 100) * 1.85;

export async function create(VoxelDrop, env) {
  const RAPIER = (await import('/lib/adits-fx/core/lib/rapier/rapier.mjs')).default;
  await RAPIER.init();
  const h = makeAnamHost(env);
  const { dom, THREE } = h;
  const ticker = makeTicker(env);
  const audio = makeAudio(env);
  let voxel = null;
  // updateMagnet / updateFlip / updateGrow put the point at (tx * R, -ty * R) in grid space.
  const tr = makeTrack(env, (sx, sy, z) => {
    const p = h.screenToLocal(voxel.group, sx, sy);
    const R = Math.max(voxel.grid.width, voxel.grid.height) * 0.65;
    return { x: p.x / R, y: -p.y / R, z };
  });
  const drops = schedule(dom.rcgDropAt?.value, env);
  const backs = schedule(dom.rcgBackAt?.value, env);
  const s = { magnetDriveDir: 1, magnetDriveGain: 0, flipDriveGain: 0, growGestureGain: 0, lastState: 'default', timerLastDrop: 0, audioLastTrigger: 0 };

  function triggerDrop() {
    const style = dom.anamVoxelDropStyle?.value;
    if (style === 'orbit') voxel.startOrbit();
    else if (style === 'tunnel') voxel.startTunnel();
    else if (style === 'bursts') voxel.startBursts();
    else voxel.startDrop();
  }

  function hostTick(k, ms) {
    audio.at(k);
    tr.at(ms);
    const track = tr.track;
    const open = tr.handOpenness;
    const af = audio.features;
    h.applyCamera(track, af);
    h.applyRotation();
    while (drops.length && drops[0] <= ms + 1e-6) { drops.shift(); triggerDrop(); }
    while (backs.length && backs[0] <= ms + 1e-6) { backs.shift(); voxel.startReverse(); }

    if (dom.anamVoxelMagnet?.checked) {
      voxel.updateMagnet(track.x, track.y, track.z);
      if (dom.anamMagnetGesture?.checked) {
        // Custom Gesture: closing the hand ramps PULL up, opening it ramps PUSH up.
        let targetGain = 0;
        if (open != null) {
          if (open > 0.5 && dom.anamMagnetGesturePush?.checked) { s.magnetDriveDir = -1; targetGain = (open - 0.5) * 2; }
          else if (open < 0.5 && dom.anamMagnetGesturePull?.checked) { s.magnetDriveDir = 1; targetGain = (0.5 - open) * 2; }
        }
        targetGain = Math.max(0, Math.min(1, targetGain));
        s.magnetDriveGain += (targetGain - s.magnetDriveGain) * 0.2;
        voxel.setMagnetDrive(s.magnetDriveDir || 1, s.magnetDriveGain);
      }
    }
    if (dom.anamVoxelFlip?.checked) {
      if (dom.anamFlipGesture?.checked) {
        voxel.updateFlip(track.x, track.y, track.z);
        const targetGain = (open != null) ? Math.max(0, Math.min(1, open)) : 0;
        s.flipDriveGain += (targetGain - s.flipDriveGain) * 0.2;
        voxel.setFlipDrive(1, s.flipDriveGain);
      } else if (dom.anamFlipAudio?.checked) {
        const targetGain = Math.max(0, Math.min(1, bandLevel(af, dom.anamFlipAudioMode?.value || 'bass') * 1.2));
        const kk = targetGain > s.flipDriveGain ? 0.5 : 0.18; // fast attack, slower release
        s.flipDriveGain += (targetGain - s.flipDriveGain) * kk;
        voxel.setFlipAudioDrive(s.flipDriveGain);
      }
    }
    if (dom.anamVoxelGrow?.checked) {
      voxel.updateGrow(track.x, track.y, track.z); // always local, following the point
      if (dom.anamGrowGesture?.checked) {
        const targetGain = (open != null) ? Math.max(0, Math.min(1, open)) : 0;
        s.growGestureGain += (targetGain - s.growGestureGain) * 0.2;
        voxel.setGrowGestureDrive(s.growGestureGain);
      } else {
        voxel.setGrowGestureDrive(1.0);
      }
      voxel.setGrowAudioPulse(dom.anamGrowAudio?.checked ? bandLevel(af, dom.anamGrowAudioMode?.value || 'bass') * 0.8 : 0);
    }
    if (dom.anamVoxelDropStyle?.value === 'tunnel') {
      let speedMult = 1.0;
      if (track.has && open !== null) speedMult += (1.0 - open) * 4.0;   // fist = warp
      if (dom.anamVoxelAudioEnabled?.checked) speedMult += bandLevel(af, dom.anamVoxelAudioMode?.value || 'bass') * 2.5;
      voxel.setTunnelDrive(speedMult);
    }
    voxel.tick();
    if (voxel.state !== s.lastState) {
      s.lastState = voxel.state;
      if (voxel.state === 'default') s.timerLastDrop = performance.now();
    }
    // Auto Timer: a drop every N seconds while the plane is idle (not in Hole mode).
    if (dom.anamVoxelTimerEnabled?.checked && !dom.anamVoxelHole?.checked && voxel.state === 'default') {
      const interval = parseFloat(dom.anamVoxelTimer?.value ?? 3) * 1000;
      if (performance.now() - s.timerLastDrop >= interval) { s.timerLastDrop = performance.now(); triggerDrop(); }
    }
    // Audio Trigger: a drop when the band peaks above 0.75, at most every 2 s.
    if (dom.anamVoxelAudioEnabled?.checked && !dom.anamVoxelHole?.checked && voxel.state === 'default') {
      const nowMs = performance.now();
      if (bandLevel(af, dom.anamVoxelAudioMode?.value || 'bass') > 0.75 && (!s.audioLastTrigger || nowMs - s.audioLastTrigger > 2000)) {
        s.audioLastTrigger = nowMs;
        triggerDrop();
      }
    }
  }

  return {
    // _buildVoxelModel, after the first frame is on the media canvas (Grow samples it).
    build() {
      voxel = new VoxelDrop({ THREE, RAPIER });
      const group = voxel.build(h.texture, h.aspect, {
        cols: parseInt(dom.anamVoxelCols?.value ?? 20),
        organic: dom.anamVoxelOrganic?.checked !== false,
        dance: dom.anamVoxelDance?.checked !== false,
        danceLevel: parseInt(dom.anamVoxelDanceLevel?.value ?? 4),
        dropDelay: parseFloat(dom.anamVoxelDropDelay?.value ?? 0),
      });
      if (dom.anamVoxelHole?.checked) {
        voxel.setHoleRadius(parseFloat(dom.anamVoxelHoleSize?.value ?? 35) / 100);
        voxel.setHoleMode(true);
      } else if (dom.anamVoxelMagnet?.checked) {
        voxel.setMagnetParams(parseFloat(dom.anamVoxelMagnetStrength?.value ?? 150) / 100, magnetRangeToRadius(parseFloat(dom.anamVoxelMagnetRange?.value ?? 10)));
        voxel.setMagnetInvert(!!dom.anamMagnetInvert?.checked);
        voxel.setMagnetMode(true);
      } else if (dom.anamVoxelFlip?.checked) {
        voxel.setFlipParams(parseFloat(dom.anamVoxelFlipSpeed?.value ?? 50) / 100, magnetRangeToRadius(parseFloat(dom.anamVoxelFlipRange?.value ?? 30)));
        voxel.setFlipAxis(parseInt(dom.anamVoxelFlipAxis?.value ?? 0));
        if (!dom.anamFlipGesture?.checked && !dom.anamFlipAudio?.checked) voxel.clearFlipDrive();
        voxel.setFlipMode(true);
      } else if (dom.anamVoxelGrow?.checked) {
        voxel.setGrowAmount(parseFloat(dom.anamVoxelGrowHeight?.value ?? 3000) / 100);
        voxel.setGrowContrast(parseFloat(dom.anamVoxelGrowContrast?.value ?? 50) / 100);
        voxel.setGrowBackside(!!dom.anamVoxelGrowBackside?.checked);
        voxel.setGrowAudioEnabled(!!dom.anamGrowAudio?.checked);
        voxel.setGrowRange(magnetRangeToRadius(parseFloat(dom.anamVoxelGrowRange?.value ?? 30)));
        voxel.setGrowMode(true);
      }
      h.modelGroup.add(group);
      s.timerLastDrop = performance.now();
    },
    render(ctx) {
      ticker.run(hostTick);
      h.drawBackground(ctx);
      h.render(ctx);
    },
  };
}

export async function setup(effect) { effect.build(); }
