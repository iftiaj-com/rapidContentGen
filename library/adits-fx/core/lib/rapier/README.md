# Rapier (vendored)

`rapier.mjs` — `@dimforge/rapier3d-compat` **v0.19.3**, Apache-2.0
(https://github.com/dimforge/rapier.js).

The **compat** build inlines the WebAssembly as base64, so this single self-contained
ES module needs no separate `.wasm`, no `import.meta.url` resolution, and **no
COOP/COEP / SharedArrayBuffer** (single-threaded). Loaded lazily by
`core/AnamorphicCamera.js` for the Voxel Drop feature, via the `index.html` import map
(`"@dimforge/rapier3d-compat": "./core/lib/rapier/rapier.mjs"`) + a `@vite-ignore`
dynamic import — exactly like the vendored three.js.

Usage: `const RAPIER = (await import('@dimforge/rapier3d-compat')).default; await RAPIER.init();`

To update: `npm install @dimforge/rapier3d-compat`, copy `rapier.mjs` from the package,
and strip the trailing `//# sourceMappingURL=` line.
