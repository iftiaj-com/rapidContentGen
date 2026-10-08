// The three.js host the Adits environments expect, as AnamorphicCamera builds it
// (core/AnamorphicCamera.js _buildScene): WebGLRenderer alpha + antialias, pixel ratio 1,
// transparent clear, ACES Filmic at exposure 1, PerspectiveCamera(35) at (0, 0, 5) looking
// at the origin. preserveDrawingBuffer is on so the canvas can be read after render.

import * as THREE from 'three';

export function makeHost(W, H) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  scene.add(camera);
  return { THREE, renderer, scene, camera };
}

/** The Adits envs read `dom[id].value` / `.checked`; the harness made those inputs. */
export const domProxy = () => new Proxy({}, { get: (_, id) => (typeof id === 'string' ? document.getElementById(id) : undefined) });

/** Resolve once three's default loading manager has no pending loads (textures). */
export async function texturesLoaded(timeoutMs = 10000) {
  const m = THREE.DefaultLoadingManager;
  let pending = 0;
  let started = false;
  const prevStart = m.onStart;
  const prevLoad = m.onLoad;
  m.onStart = (...a) => { started = true; pending = 1; prevStart?.(...a); };
  m.onLoad = (...a) => { pending = 0; prevLoad?.(...a); };
  return { wait: async () => {
    const t0 = performance.timeOrigin;
    for (let k = 0; k < timeoutMs / 10; k++) {
      if (started && pending === 0) return true;
      await new Promise((r) => setTimeout(r, 10));
    }
    return !started;
  } };
}
