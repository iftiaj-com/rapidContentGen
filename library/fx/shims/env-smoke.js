// Adits SmokeEnv (core/anam/SmokeEnv.js, unmodified) in its AnamorphicCamera host setup:
// built into an env group at the origin with the camera, ticked once per frame (it reads
// performance.now itself, which the harness locks to the frame time). No model is loaded, so
// the puffs flow freely. Output: the smoke over the footage frame, or alone with alpha.

import { domProxy, makeHost, texturesLoaded } from './three-host.js';

export async function create(SmokeEnv, env) {
  const { width: W, height: H } = env.job;
  const host = makeHost(W, H);
  const dom = domProxy();
  const envGroup = new host.THREE.Group();
  host.scene.add(envGroup);
  const loads = await texturesLoaded();
  const smoke = new SmokeEnv(host.THREE);
  smoke.build(dom, envGroup, host.camera, null);
  if (!(await loads.wait())) env.log('smoke texture did not finish loading');
  return {
    render(ctx, ve, media, crop, audio) {
      if (!env.job.alpha) ctx.drawImage(media, 0, 0, W, H);
      smoke.tick({ dom, track: { x: 0 }, envParallax: 0, modelGroup: null, currentModelKey: 'none', audio });
      host.renderer.render(host.scene, host.camera);
      ctx.drawImage(host.renderer.domElement, 0, 0, W, H);
    },
  };
}
