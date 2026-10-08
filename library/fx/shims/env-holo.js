// Adits HoloSheen (core/anam/HoloSheen.js, unmodified): a holographic foil patched into the
// materials of a 3D object, as AnamorphicCamera's _tickHolo applies it. Here the object is the
// footage on a plane (the Adits photo/video "model"), shown with MeshBasicMaterial so the
// footage itself is not tone-mapped. The sheen follows the view angle, so a flat plane facing
// the camera barely moves it: rcgHoloMotion tilts the plane (default) or orbits it.
//
// Params: anamHoloIntensity (0..100, Adits default 70); rcgHoloMotion tilt | orbit | none;
// rcgHoloTilt degrees; rcgHoloScale (1 = the plane fills the frame height).

import { domProxy, makeHost } from './three-host.js';

export async function create(HoloSheen, env) {
  const { width: W, height: H } = env.job;
  const host = makeHost(W, H);
  const { THREE } = host;
  const dom = domProxy();
  const scale = parseFloat(dom.rcgHoloScale?.value ?? 1.12) || 1.12;
  const visibleH = 2 * 5 * Math.tan((35 / 2) * Math.PI / 180); // camera at z 5, fov 35
  const tex = new THREE.CanvasTexture(env.media);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(visibleH * scale * (W / H), visibleH * scale),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }),
  );
  const group = new THREE.Group();
  group.add(plane);
  host.scene.add(group);
  const holo = new HoloSheen(THREE);
  holo.patchTree(group);
  holo.measure(group, group);
  const size = new THREE.Vector2();
  let clock = 0;
  return {
    render(ctx, ve, media, crop, audio) {
      tex.needsUpdate = true;
      const t = performance.now() / 1000;
      clock += 1 / env.job.fps; // _tickHolo accumulates clamped dt
      const tilt = (parseFloat(dom.rcgHoloTilt?.value ?? 9) || 0) * Math.PI / 180;
      const motion = dom.rcgHoloMotion?.value || 'tilt';
      if (motion === 'tilt') { group.rotation.y = Math.sin(t * 0.7) * tilt; group.rotation.x = Math.sin(t * 0.43 + 1.1) * tilt * 0.6; }
      else if (motion === 'orbit') { group.rotation.y = Math.sin(t * 0.5) * tilt * 2; group.rotation.x = 0; }
      else { group.rotation.set(0, 0, 0); }
      group.updateMatrixWorld(true);
      host.camera.updateMatrixWorld();
      host.renderer.getDrawingBufferSize(size);
      holo.update({ time: clock, amt: Math.max(0, Math.min(1, (parseFloat(dom.anamHoloIntensity?.value ?? 70) || 0) / 100)), w: size.x, h: size.y, group, camera: host.camera });
      host.renderer.render(host.scene, host.camera);
      ctx.drawImage(host.renderer.domElement, 0, 0, W, H);
    },
  };
}
