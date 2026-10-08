// =============================================================================
// VoxelArt — turn a 2D image / video frame into 3D voxel art.
// -----------------------------------------------------------------------------
// A modular, self-contained companion to VoxelDrop for the AnamorphicCamera
// "Voxel" section. Where VoxelDrop is a physics toy, VoxelArt is a *renderer*:
// it reconstructs the media as a solid field of stacked cubes (the classic
// MagicaVoxel / voxel-relief look). The media stays UPRIGHT (grid in the XY
// plane, exactly like the flat photo plane); depth is extruded toward the
// viewer along +Z, so brighter pixels pop out. A single -30° turntable angle
// reveals the extrusion without laying the image down as a floor.
//
// This is Phase 1 of the "3D Voxel Art Engine" plan
// (voxel_art_implementation_plan.md). The plan's three stages map here as:
//   • Stage 1 — Spatial estimation: depth is taken from per-cell luminance
//     (bright = closer), computed instantly on the CPU. The engine is
//     architected so a real monocular-depth map (ONNX MiDaS) can be dropped in
//     later via build({ depthMap }) / setDepthMap() with NO renderer changes.
//   • Stage 2 — Voxelisation + solidification: each grid cell becomes a *column*
//     of cubes extruded back from the front face, so the model is solid by
//     construction (no floating voxels). Depth is quantised to discrete voxel
//     levels for the stepped/terraced silhouette.
//   • Stage 3 — Retro render: one instanced box per column, 4-band toon shading
//     and a black voxel-grid outline reproduce the raymarched/dimetric aesthetic
//     without a raymarch pass.
//
// Design notes (mirrors VoxelDrop's contract so AnamorphicCamera drives it the
// same way): THREE is injected (never imported); build() returns a THREE.Group
// added to the model group so anamorphic parallax / scale / spin compose on top;
// the grid lives in local space (long footprint ≈ 2 units, like the flat plane);
// per-instance colour/depth/row come from InstancedBufferAttributes so it
// compiles in a GLSL1 ShaderMaterial on any three.js revision.
//
// NOTE: this file embeds GLSL template literals → it MUST be in the
// vite-plugin-javascript-obfuscator `exclude` list (see vite.config.mjs),
// exactly like AnamorphicCamera.js and VoxelDrop.js.
// =============================================================================

const VART_VERT = `
attribute vec3 aColor;
attribute float aLevels;      // number of voxel steps deep in this column
attribute float aRowT;        // 0 at the bottom row … 1 at the top (base tint)

varying vec3 vColor;
varying vec3 vNormalObj;      // object-space (axis-aligned) face normal → stable toon shade
varying vec3 vLocalPos;       // box-local position in [-0.5, 0.5]
varying float vLevels;
varying float vDepthT;        // 0 at the back of the column … 1 at the front face
varying float vRowT;

void main() {
  vColor = aColor;
  vNormalObj = normal;
  vLocalPos = position;
  vLevels = aLevels;
  vDepthT = position.z + 0.5;
  vRowT = aRowT;
  // InstancedMesh: three declares instanceMatrix for ShaderMaterials (same as
  // VoxelDrop). It carries only translate + axis-aligned scale, so the object
  // normal stays valid for lighting.
  vec4 world = instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * world;
}
`;

const VART_FRAG = `
precision mediump float;

uniform vec3  uLightDir;       // object-space directional light
uniform float uAmbient;        // shadow lift (0 = black shadows, 1 = flat)
uniform float uBands;          // toon shading steps (plan: 4)
uniform vec3  uOutlineColor;
uniform float uOutline;        // outline thickness (0 = off)
uniform float uUseBaseTint;    // 1 = tint the bottom rows (earthy base)
uniform vec3  uBaseColor;
uniform float uGlowHalo;

varying vec3 vColor;
varying vec3 vNormalObj;
varying vec3 vLocalPos;
varying float vLevels;
varying float vDepthT;
varying float vRowT;

// Dark line near an integer boundary (voxel-depth seams on the sides).
float lineNear(float x, float w) {
  float d = min(fract(x), 1.0 - fract(x));
  return 1.0 - smoothstep(0.0, w, d);
}
// Dark line near 0 or 1 (cell borders across a face).
float edge01(float x, float w) {
  float d = min(x, 1.0 - x);
  return 1.0 - smoothstep(0.0, w, d);
}

void main() {
  vec3 n = normalize(vNormalObj);

  // ── Discrete tone (banded toon) shading ──────────────────────────────────
  float diff = max(dot(n, normalize(uLightDir)), 0.0);
  float bands = max(1.0, uBands);
  float shade = ceil(diff * bands) / bands;          // snap to hard thresholds
  shade = clamp(shade, 1.0 / bands, 1.0);
  shade = mix(uAmbient, 1.0, shade);                 // lift shadows off pure black

  // ── Earthy base band on the bottom rows' side faces (soil-under-scene read)
  vec3 base = vColor;
  if (uUseBaseTint > 0.5 && abs(n.z) < 0.5) {
    float dirt = 1.0 - smoothstep(0.0, 0.18, vRowT);  // lowest ~18% of rows
    base = mix(base, uBaseColor, dirt * 0.8);
  }
  vec3 col = base * shade;

  // ── Voxel-grid outline ───────────────────────────────────────────────────
  float o = 0.0;
  float w = max(uOutline, 0.0001);
  if (abs(n.z) > 0.5) {
    vec2 p = vLocalPos.xy + 0.5;                      // front / back image face: cell border
    o = max(edge01(p.x, w), edge01(p.y, w));
  } else if (abs(n.x) > 0.5) {
    float horiz = vLocalPos.y + 0.5;                  // cell height
    float depthLines = vDepthT * max(vLevels, 1.0);   // stacked voxel steps into the screen
    o = max(edge01(horiz, w), lineNear(depthLines, w));
  } else {
    float horiz = vLocalPos.x + 0.5;                  // cell width
    float depthLines = vDepthT * max(vLevels, 1.0);
    o = max(edge01(horiz, w), lineNear(depthLines, w));
  }
  col = mix(col, uOutlineColor, o * 0.9 * step(0.0001, uOutline));

  if (uGlowHalo > 0.5) {
    float edgeGlow = o * 0.8;
    vec3 glowCol = mix(vColor, vec3(1.0), 0.6) * (edgeGlow + 0.25) * 1.3;
    col += glowCol * uGlowHalo;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export class VoxelArt {
    constructor({ THREE }) {
        this.THREE = THREE;

        this.group = null;      // returned to AnamorphicCamera; added to model group
        this.pivot = null;      // inner group carrying the centring
        this._tiltGroup = null; // holds the -30° turntable angle
        this.mesh = null;       // InstancedMesh of column boxes
        this.material = null;

        this.grid = null;       // { cols, rows, count, cell }
        this._texture = null;
        this._isVideo = false;
        this._sourceImage = null;   // <img> / <video> element behind the texture

        // Instance attribute mirrors (rebuilt each _sample()).
        this._heights = null;   // Float32Array(count) normalized depth 0..1
        this._alphas = null;    // Uint8Array(count) source alpha — transparent cells hide
        this._colors = null;    // Float32Array(count*3)
        this._levelsAttrArr = null;
        this._rowTArr = null;
        this._colorAttr = null;
        this._levelsAttr = null;
        this._rowTAttr = null;
        this._uvs = null;       // Float32Array(count*2) centre UV per cell
        this._dummy = null;

        // Pluggable depth (Stage 1). When set, overrides luminance sampling.
        this._externalDepth = null; // Float32Array(count) row-major, 0..1

        // Params (mirrored to uniforms / used at (re)build).
        this._cols = 48;
        this._levels = 12;      // max quantised voxel steps of depth
        this._heightScale = 1;  // multiplies the depth before quantisation
        this._outline = 0.05;
        this._baseTint = true;
        this._baseColor = '#6b4a2b';
        this._bands = 4;
        this._ambient = 0.45;
        this._angle = -Math.PI / 6;  // -30° turntable angle
        this._autoRotate = false;
        this._autoRotateSpeed = 0.35; // rad/sec

        this._audioActive = false;   // audio-reactive depth pulse (Milestone 4)
        this._audioPulse = 1;        // live depth multiplier from the audio band
        this._gestureActive = false; // hand-openness → pop amount (Milestone 4)
        this._gesturePop = 1;        // live depth multiplier from the gesture

        // Shader Engine (AR Art "Pop Up Dark/Highlights"): columns outside the
        // selected luminance range flatten to the base height instead of being
        // removed, mirroring the flat-but-visible relief used by the other
        // AR Art styles. 'default' | 'dark' | 'highlights'.
        this._filterMode = 'default';
        this._filterThreshold = 0.6;

        this._glowHalo = false;

        this._lastT = 0;

        // Background-removal matte (RGBA canvas, alpha = person probability,
        // host-owned — see AnamorphicCamera.js's ARBackgroundRemoval wiring).
        // Folded into the readback in _sample() so the existing cutout-media
        // alpha logic below (_alphas / _syncInstances) picks it up for free.
        this._bgMatte = null;
    }

    /** Feed the current background-removal matte or null to turn it off.
     *  Takes effect on the next _sample()/refresh() call. */
    setBackgroundMatte(matteCanvas) {
        this._bgMatte = matteCanvas || null;
    }

    /** Continuous frames only needed while auto-rotating (video, when playing,
     *  is already driven by the main render loop). */
    needsFrames() { return this._autoRotate; }

    /**
     * Build the upright voxel-relief from a 2D media texture.
     * @param {THREE.Texture} texture  image / video texture (its .image is read back)
     * @param {number} aspect          source aspect (w/h) → grid columns/rows
     * @param {object} opts            { cols, levels, heightScale, outline, baseTint,
     *                                    baseColor, autoRotate, isVideo, depthMap }
     * @returns {THREE.Group}
     */
    build(texture, aspect, opts = {}) {
        const { THREE } = this;
        this.dispose();

        if (opts.cols != null) this._cols = opts.cols;
        if (opts.levels != null) this._levels = opts.levels;
        if (opts.heightScale != null) this._heightScale = opts.heightScale;
        if (opts.outline != null) this._outline = opts.outline;
        if (opts.baseTint != null) this._baseTint = opts.baseTint;
        if (opts.baseColor != null) this._baseColor = opts.baseColor;
        if (opts.autoRotate != null) this._autoRotate = opts.autoRotate;
        this._isVideo = !!opts.isVideo;
        this._externalDepth = opts.depthMap || null;

        this._texture = texture;
        this._sourceImage = texture?.image || null;

        const cols = Math.max(8, Math.min(120, Math.round(this._cols)));
        const a = (aspect > 0 && isFinite(aspect)) ? aspect : 1;
        const rows = Math.max(4, Math.round(cols / a));
        const count = cols * rows;

        // Footprint: long side ≈ 2 local units (matches the flat photo plane).
        const cell = 2.0 / Math.max(cols, rows);
        const width = cols * cell;
        const height = rows * cell;
        this.grid = { cols, rows, count, cell, width, height };

        this._heights = new Float32Array(count);
        this._alphas = new Uint8Array(count).fill(255);  // cutout media: transparent cells collapse
        this._colors = new Float32Array(count * 3);
        this._uvs = new Float32Array(count * 2);
        this._levelsAttrArr = new Float32Array(count);
        this._rowTArr = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            this._uvs[i * 2] = (col + 0.5) / cols;
            this._uvs[i * 2 + 1] = (row + 0.5) / rows;
            this._rowTArr[i] = rows > 1 ? row / (rows - 1) : 0; // 0 bottom … 1 top
        }
        this._sample();  // fill heights + colours from the media

        // ── InstancedMesh of unit boxes (one column per cell) ─────────────────
        this._dummy = new THREE.Object3D();
        const geo = new THREE.BoxGeometry(1, 1, 1);
        this._colorAttr = new THREE.InstancedBufferAttribute(this._colors, 3);
        this._levelsAttr = new THREE.InstancedBufferAttribute(this._levelsAttrArr, 1);
        this._rowTAttr = new THREE.InstancedBufferAttribute(this._rowTArr, 1);
        geo.setAttribute('aColor', this._colorAttr);
        geo.setAttribute('aLevels', this._levelsAttr);
        geo.setAttribute('aRowT', this._rowTAttr);

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                // Front (+Z) face reads brightest so the image is legible; top /
                // sides fall into shaded bands to cue the extruded depth.
                uLightDir: { value: new THREE.Vector3(0.35, 0.55, 0.85).normalize() },
                uAmbient: { value: this._ambient },
                uBands: { value: this._bands },
                uOutlineColor: { value: new THREE.Color('#0a0a0a') },
                uOutline: { value: this._outline },
                uUseBaseTint: { value: this._baseTint ? 1 : 0 },
                uBaseColor: { value: new THREE.Color(this._baseColor) },
                uGlowHalo: { value: this._glowHalo ? 1.0 : 0.0 },
            },
            vertexShader: VART_VERT,
            fragmentShader: VART_FRAG,
            side: THREE.FrontSide,
        });

        this.mesh = new THREE.InstancedMesh(geo, this.material, count);
        this.mesh.frustumCulled = false;
        this._syncInstances();

        // Inner pivot centres the mass on the origin (upright, +Y up) so the
        // anamorphic parallax orbits it cleanly. The tilt group turns it -30°
        // about Y — the media stays upright, the extruded depth reads from the side.
        this.pivot = new THREE.Group();
        this.pivot.add(this.mesh);
        this.pivot.position.set(-width * 0.5 + cell * 0.5,
            -height * 0.5 + cell * 0.5,
            -this._levels * cell * 0.5);

        const tilt = new THREE.Group();
        tilt.add(this.pivot);
        tilt.rotation.y = this._angle;

        this.group = new THREE.Group();
        this.group.add(tilt);
        this._tiltGroup = tilt;

        this._lastT = performance.now();
        return this.group;
    }

    /** Read back per-cell luminance (→ depth) and colour from the source media.
     *  When an external depth map is present it drives the depth instead. */
    _sample() {
        const { cols, rows, count } = this.grid;
        const img = this._texture?.image || this._sourceImage;

        // Colour + (fallback) luminance from a small readback canvas.
        let data = null, sw = 0, sh = 0;
        if (img) {
            sw = Math.min(img.width || img.videoWidth || 256, 512);
            sh = Math.min(img.height || img.videoHeight || 256, 512);
            if (sw > 0 && sh > 0) {
                if (!this._readCanvas) {
                    this._readCanvas = document.createElement('canvas');
                    this._readCtx = this._readCanvas.getContext('2d', { willReadFrequently: true });
                }
                const c = this._readCanvas;
                if (c.width !== sw || c.height !== sh) { c.width = sw; c.height = sh; }
                try {
                    this._readCtx.clearRect(0, 0, sw, sh);   // keep alpha honest for cutout media
                    this._readCtx.drawImage(img, 0, 0, sw, sh);
                    if (this._bgMatte) {                      // live selfie-segmentation cutout
                        this._readCtx.globalCompositeOperation = 'destination-in';
                        this._readCtx.drawImage(this._bgMatte, 0, 0, sw, sh);
                        this._readCtx.globalCompositeOperation = 'source-over';
                    }
                    data = this._readCtx.getImageData(0, 0, sw, sh).data;
                } catch (_) { data = null; }
            }
        }

        for (let i = 0; i < count; i++) {
            const u = this._uvs[i * 2];
            const v = this._uvs[i * 2 + 1];
            let r = 0.5, g = 0.5, b = 0.5, lum = 0.5, al = 255;
            if (data) {
                const px = Math.min(sw - 1, Math.max(0, Math.floor(u * sw)));
                const py = Math.min(sh - 1, Math.max(0, Math.floor((1 - v) * sh))); // flip Y → upright
                const idx = (py * sw + px) * 4;
                r = data[idx] / 255; g = data[idx + 1] / 255; b = data[idx + 2] / 255;
                lum = r * 0.299 + g * 0.587 + b * 0.114;
                al = data[idx + 3];
            }
            if (this._alphas) this._alphas[i] = al;
            // Depth: external map (Stage 1 ONNX) wins, else perceived luminance.
            const depth = this._externalDepth
                ? Math.max(0, Math.min(1, this._externalDepth[i]))
                : lum;
            this._heights[i] = depth;
            this._colors[i * 3] = r;
            this._colors[i * 3 + 1] = g;
            this._colors[i * 3 + 2] = b;
        }
        if (this._colorAttr) this._colorAttr.needsUpdate = true;
    }

    /** Push depth → per-instance matrices (columns extruded toward the viewer,
     *  front face pinned at z=0) and refresh the per-column voxel-step count.
     *  When the shader-engine filter is active, columns whose source pixel
     *  falls outside the selected luminance range flatten to the minimum
     *  column height (still visible, just not popped forward). */
    _syncInstances() {
        if (!this.mesh || !this.grid) return;
        const { cols, rows, count, cell } = this.grid;
        const filtered = this._filterMode === 'dark' || this._filterMode === 'highlights';
        for (let i = 0; i < count; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            // Cutout media: cells over the transparent background have no voxel
            // at all — zero-scale the instance (InstancedMesh count is fixed).
            if (this._alphas && this._alphas[i] < 26) {
                this._levelsAttrArr[i] = 1;
                this._dummy.position.set(0, 0, 0);
                this._dummy.scale.set(0, 0, 0);
                this._dummy.rotation.set(0, 0, 0);
                this._dummy.updateMatrix();
                this.mesh.setMatrixAt(i, this._dummy.matrix);
                continue;
            }
            let h = this._heights[i];
            if (filtered) {
                let val = this._filterMode === 'dark' ? 1 - h : h;
                h = val < this._filterThreshold ? 0 : (val - this._filterThreshold) / (1 - this._filterThreshold);
            }
            const lvl = Math.max(1, Math.round(h * this._levels * this._heightScale * this._audioPulse * this._gesturePop));
            this._levelsAttrArr[i] = lvl;
            const dLocal = lvl * cell;
            // Bas-relief: the shared BACK plane is pinned at z=0 and each column
            // pops toward the viewer (+Z), so the varying depth faces the camera
            // (no tails behind the plane). The column spans [0, dLocal].
            this._dummy.position.set(col * cell, row * cell, dLocal * 0.5);
            this._dummy.scale.set(cell, cell, dLocal);
            this._dummy.rotation.set(0, 0, 0);
            this._dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this._dummy.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this._levelsAttr) this._levelsAttr.needsUpdate = true;
    }

    /** Re-sample the media (colour + depth) and rebuild the columns. Cheap
     *  enough to call per frame for video (grid is small). */
    refresh() {
        if (!this.mesh) return;
        this._sample();
        this._syncInstances();
    }

    // ── Live param setters (no rebuild unless noted) ──────────────────────────

    /** Resolution changes the grid topology → caller rebuilds. */
    setResolution(cols) { this._cols = Math.max(8, Math.min(120, Math.round(cols))); }
    setLevels(n) {
        this._levels = Math.max(2, Math.min(48, Math.round(n)));
        this._syncInstances();
    }
    setHeightScale(s) {
        this._heightScale = Math.max(0.05, s);
        this._syncInstances();
    }
    setOutline(v) {
        this._outline = Math.max(0, v);
        if (this.material) this.material.uniforms.uOutline.value = this._outline;
    }
    setGlowHalo(on) {
        this._glowHalo = !!on;
        if (this.material && this.material.uniforms.uGlowHalo) {
            this.material.uniforms.uGlowHalo.value = on ? 1.0 : 0.0;
        }
    }
    /** Shader Engine filter — 'default' | 'dark' | 'highlights', threshold 0..1
     *  (shares the AR Art Density/Threshold slider). Re-syncs column heights
     *  immediately from the already-cached luminance, no re-sample needed. */
    setFilter(mode, threshold) {
        this._filterMode = mode || 'default';
        this._filterThreshold = Math.max(0, Math.min(1, threshold ?? this._filterThreshold));
        this._syncInstances();
    }
    setBaseTint(on) {
        this._baseTint = !!on;
        if (this.material) this.material.uniforms.uUseBaseTint.value = on ? 1 : 0;
    }
    setBaseColor(hex) {
        this._baseColor = hex;
        if (this.material) this.material.uniforms.uBaseColor.value.set(hex);
    }
    setBands(n) {
        this._bands = Math.max(1, Math.round(n));
        if (this.material) this.material.uniforms.uBands.value = this._bands;
    }
    setAngle(rad) {
        this._angle = rad;
        if (this._tiltGroup) this._tiltGroup.rotation.y = rad;
    }
    setAutoRotate(on) { this._autoRotate = !!on; }
    setVideo(on) { this._isVideo = !!on; }

    /** Audio Reactive (Milestone 4) — pulse the extrusion depth from the selected
     *  band level (mult 1 = rest). Applied in tick() so it animates each frame. */
    setAudioPulse(mult) { this._audioPulse = Math.max(0.05, mult); this._audioActive = true; }
    /** Restore the static (non-audio) depth. */
    clearAudio() {
        if (!this._audioActive) return;
        this._audioActive = false;
        this._audioPulse = 1;
        this._syncInstances();
    }

    /** Gesture Depth (Milestone 4) — hand openness scales how far the relief pops
     *  (mult 1 = the slider's Height). Applied in tick() so it eases each frame. */
    setGesturePop(mult) { this._gesturePop = Math.max(0.05, mult); this._gestureActive = true; }
    /** Restore the static (non-gesture) depth. */
    clearGesture() {
        if (!this._gestureActive) return;
        this._gestureActive = false;
        this._gesturePop = 1;
        this._syncInstances();
    }

    /** Stage 1 hook — supply a monocular-depth map (row-major cols*rows, 0..1),
     *  e.g. from an ONNX MiDaS pass, then refresh() to apply. */
    setDepthMap(map) { this._externalDepth = map || null; this.refresh(); }

    // ── Per-frame ─────────────────────────────────────────────────────────────

    tick() {
        if (!this.mesh) return;
        const now = performance.now();
        let dt = (now - (this._lastT || now)) / 1000;
        this._lastT = now;
        dt = Math.min(dt, 0.05);

        if (this._isVideo) this.refresh();            // live video voxelisation
        else if (this._audioActive || this._gestureActive) this._syncInstances();  // reactive depth
        if (this._autoRotate && this._tiltGroup) {
            this._tiltGroup.rotation.y += this._autoRotateSpeed * dt;
        }
    }

    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }
        this.material = null;
        this.group = null;
        this.pivot = null;
        this._tiltGroup = null;
        this.grid = null;
        this._texture = null;
        this._sourceImage = null;
        this._heights = null;
        this._alphas = null;
        this._colors = null;
        this._uvs = null;
        this._levelsAttrArr = null;
        this._rowTArr = null;
        this._colorAttr = null;
        this._levelsAttr = null;
        this._rowTAttr = null;
        this._externalDepth = null;
        this._dummy = null;
        this._bgMatte = null;
        // keep _readCanvas around for reuse across rebuilds
    }
}
