// ── PARTICLE SYSTEM: the shared particle cloud (build + physics + audio) ────
// The foundation every particle-family model depends on: the point-cloud
// builder (surface/image sampling → THREE.Points), the per-frame spring +
// audio-reactive physics loop, and the real-time audio feature extractor that
// drives the dance modes. `_tickParticles()` is the hottest loop in the whole
// feature — hand-tuned zero-allocation scratch buffers, a ring-range link
// search (see _tickParticles' inner loop), a baked aVelMag attribute and an
// 8-frame idle-sleep counter are all deliberate optimisations (see the
// particles-perf-safe-wins notes) and are preserved verbatim here.
//
// Extracted from core/AnamorphicCamera.js. Behaviour is byte-for-byte the
// pre-extraction behaviour — see masterplan.md Phase 12.
//
// DESIGN NOTE — `this._particles` stays on the HOST, not in this module.
// BlackHole / Orbit Rings / Particle Network (Phase 15, not yet extracted)
// all reach into the host's `this._particles` bag directly (adding fields
// like `.bhDisc`/`.ring`/`.nodes`, reassigning it wholesale for reveal-model
// save/restore, nulling it on model teardown) — encapsulating the bag inside
// this module would mean either a getter/setter proxy or rewriting all of
// that Phase-15-territory code early, both worse than the alternative: every
// method here takes the particles bag as an explicit parameter (or returns a
// freshly-built one) rather than storing it on `this`. Only the genuinely
// module-private state (audio-feature envelopes, normalize/resolve timing)
// lives on the instance. The host's `_buildParticlePoints`/`_tickParticles`/
// etc. stay as thin wrappers under their original names so none of the many
// existing call sites elsewhere in the host (black hole disc, orbit ring,
// particle network, reveal wipe, transform surface-particles, …) need to
// change.
import { PhotoCubeGlass } from './PhotoCubeGlass.js';

export const PARTICLE_VERTEX_SHADER = `
    attribute float aVelMag;
    attribute float aColorFactor;
    attribute float aSizeMult;
    varying float vVelMag;
    varying float vColorFactor;
    uniform float uSize;
    uniform float uRevealOn;
    uniform float uRevealMode;
    uniform vec2  uRevealPos;
    uniform float uRevealAngle;
    uniform float uRevealRadius;
    uniform float uRevealFeather;
    uniform float uAspect;
    varying float vReveal;
    #ifdef USE_BRIGHTNESS_SIZE
    attribute float aRand;
    uniform float uBrightThreshold;
    uniform float uBrightRandomness;
    #endif
    #ifdef USE_PHOTO_COLOR
    attribute vec3 aPhotoColor;
    varying vec3 vPhotoColor;
    #endif
    #ifdef USE_ORIG_COLOR
    attribute vec3 aOrigColor;
    varying vec3 vOrigColor;
    #endif
    void main() {
        vVelMag      = aVelMag;
        vColorFactor = aColorFactor;
        #ifdef USE_PHOTO_COLOR
        vPhotoColor = aPhotoColor;
        #endif
        #ifdef USE_ORIG_COLOR
        vOrigColor = aOrigColor;
        #endif
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float sizeMult  = aSizeMult;
        #ifdef USE_BRIGHTNESS_SIZE
        // aSizeMult holds raw luminance (0–1). Shape the SIZE playfully:
        float b = aSizeMult;
        // Threshold: dim pixels below the cutoff fade to nothing (soft edge).
        b *= smoothstep(uBrightThreshold, uBrightThreshold + 0.1, b);
        // Randomness: blend toward a per-particle random size for sparkle.
        b *= mix(1.0, aRand * 2.0, uBrightRandomness);
        sizeMult = b * 2.0;
        // NOTE: Contrast no longer affects size — it shapes the photo's
        // tonal contrast in the fragment shader (image-color-only).
        #endif
        gl_PointSize    = uSize * sizeMult / -mvPosition.z;
        gl_Position     = projectionMatrix * mvPosition;

        // Reveal Wipe: 1 = fully shown, 0 = hidden (transparent). When off, always 1.
        vReveal = 1.0;
        if (uRevealOn > 0.5) {
            vec2 scr = (gl_Position.xy / gl_Position.w) * 0.5 + 0.5; // screen 0..1
            float fth = max(uRevealFeather, 0.001);
            if (uRevealMode < 0.5) {
                // Edge wipe: reveal one side of a line at uRevealAngle (aspect-corrected
                // so the angle reads true). Position slides the line along its normal.
                vec2 pc  = vec2((scr.x - 0.5) * uAspect, scr.y - 0.5);
                vec2 nrm = vec2(cos(uRevealAngle), sin(uRevealAngle));
                float span = uAspect * abs(nrm.x) + abs(nrm.y);
                float edge = (uRevealPos.x - 0.5) * span;
                float F    = max(fth * span, 0.001);
                vReveal = smoothstep(edge + F, edge - F, dot(pc, nrm));
            } else {
                // Spotlight: reveal inside an aspect-corrected circle around position
                vec2 dd = scr - uRevealPos;
                dd.x *= uAspect;
                vReveal = smoothstep(uRevealRadius + fth, uRevealRadius - fth, length(dd));
            }
        }
    }
`;

export const PARTICLE_FRAGMENT_SHADER = `
    varying float vVelMag;
    varying float vColorFactor;
    varying float vReveal;
    #ifdef USE_PHOTO_COLOR
    varying vec3 vPhotoColor;
    #endif
    #ifdef USE_ORIG_COLOR
    varying vec3 vOrigColor;
    #endif
    uniform vec3  uColorWarm;
    uniform vec3  uColorCool;
    uniform vec3  uCustomColor;
    uniform float uMinAlpha;
    uniform float uMaxAlpha;
    uniform float uGlowIntensity;
    uniform float uColorMode;
    uniform float uColorModeStrength;
    #ifdef USE_BRIGHTNESS_SIZE
    uniform float uBrightContrast;
    #endif

    vec3 hsvToRgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    vec3 getThermal(float t) {
        t = clamp(t, 0.0, 1.0);
        if (t < 0.25) return mix(vec3(0.0,0.0,0.2), vec3(0.0,0.3,1.0), t*4.0);
        if (t < 0.50) return mix(vec3(0.0,0.3,1.0), vec3(0.8,0.0,0.8), (t-0.25)*4.0);
        if (t < 0.75) return mix(vec3(0.8,0.0,0.8), vec3(1.0,0.1,0.0), (t-0.50)*4.0);
        return              mix(vec3(1.0,0.1,0.0), vec3(1.0,0.9,0.2), (t-0.75)*4.0);
    }
    vec3 cosmicPalette(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
        t = clamp(t, 0.0, 1.0) * 4.0;
        float f = fract(t);
        if (t < 1.0) return mix(c0, c1, f);
        if (t < 2.0) return mix(c1, c2, f);
        if (t < 3.0) return mix(c2, c3, f);
        return              mix(c3, c4, f);
    }

    void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float glow  = smoothstep(0.5, 0.0, d);
        float alpha = clamp(vVelMag * 12.0, uMinAlpha, uMaxAlpha) * uGlowIntensity;
        float t = vColorFactor;

        vec3 origColor;
        #ifdef USE_PHOTO_COLOR
        origColor = vPhotoColor;
        #else
        #ifdef USE_ORIG_COLOR
        origColor = vOrigColor;
        #else
        origColor = mix(uColorCool, uColorWarm, t);
        #endif
        #endif

        vec3 color;
        #ifdef USE_PHOTO_COLOR
        if      (uColorMode < 0.5) color = vPhotoColor;
        #else
        if      (uColorMode < 0.5) color = mix(uColorCool, uColorWarm, t);
        #endif
        else if (uColorMode < 1.5) color = vec3(1.0);
        else if (uColorMode < 2.5) color = hsvToRgb(vec3(t, 1.0, 1.0));
        else if (uColorMode < 3.5) color = mix(vec3(0.0,1.0,1.0), vec3(1.0,0.0,1.0), t);
        else if (uColorMode < 4.5) color = getThermal(t);
        else if (uColorMode < 5.5) color = cosmicPalette(t,
            vec3(0.0,0.0,0.3), vec3(0.2,0.0,0.8), vec3(0.9,0.0,0.5), vec3(1.0,0.9,0.0), vec3(0.0,1.0,1.0));
        else if (uColorMode < 6.5) color = cosmicPalette(t,
            vec3(0.0,0.1,0.2), vec3(0.0,0.5,0.8), vec3(0.8,0.0,1.0), vec3(1.0,0.4,0.8), vec3(1.0,1.0,1.0));
        else if (uColorMode < 7.5) color = cosmicPalette(t,
            vec3(0.1,0.0,0.0), vec3(0.6,0.0,0.2), vec3(1.0,0.3,0.0), vec3(1.0,0.8,0.0), vec3(1.0,1.0,1.0));
        // Mirror Chrome (9): cool silver-white gradient — dark charcoal → bright white highlight
        else if (uColorMode < 9.5) color = mix(vec3(0.05,0.05,0.08), vec3(1.0,1.0,1.0), pow(t, 0.45));
        #ifdef USE_ORIG_COLOR
        // Custom Color (10) / Original Color (11)
        else if (uColorMode < 10.5) color = uCustomColor;
        else                        color = vOrigColor;
        #else
        else                        color = uCustomColor;
        #endif

        color = mix(origColor, color, uColorModeStrength);

        #ifdef USE_PHOTO_COLOR
        // Image mode: opacity comes from the glow slider (NOT velocity), so the
        // photo is fully visible at rest. Only a faint sparkle while moving.
        color = mix(color, vec3(1.0), clamp(vVelMag * 2.0, 0.0, 0.22));
        #ifdef USE_BRIGHTNESS_SIZE
        // Contrast: tonal punch on the photo around mid-grey (1.0 = neutral,
        // >1 deepens shadows / brightens highlights, <1 flattens).
        color = clamp((color - 0.5) * uBrightContrast + 0.5, 0.0, 1.0);
        #endif
        float aImg = clamp(uGlowIntensity * glow, 0.0, 1.0) * vReveal;
        if (aImg < 0.05) discard;   // keep edges from polluting the depth buffer
        gl_FragColor = vec4(color, aImg);
        #else
        color = mix(color, vec3(1.0), clamp(vVelMag * 5.0, 0.0, 0.55));
        gl_FragColor = vec4(color, alpha * glow * vReveal);
        #endif
    }
`;

export class ParticleSystem {
    /** @param {object} THREE  the lazy-loaded three.js namespace (host._three.THREE) */
    constructor(THREE) {
        this.THREE = THREE;
        // Audio-feature extractor state (see updateAudioFeatures()). Persists
        // across model rebuilds, exactly like the pre-extraction `this._af`.
        this.af = null;
        // Assemble/Normalize resolve-ramp state (see updateParticleNormalize()).
        this.normPlaying = false;
        this.normManual = false;
        this.normManualStart = 0;
        this.showClockStart = 0;
        this.normFactor = 1;
        // Audio Size+Glow uniform-restore latch (see tick()).
        this.partSizeGlowActive = false;
    }

    /**
     * Core particle builder — shared by built-in shapes and any GLB model.
     * Reads particle settings from `dom` (count, size, glow, color mode, sampler).
     * @returns {{points: object, particles: object}} the THREE.Points mesh and
     *   the shared particle-state bag the host stashes as `this._particles`.
     */
    buildPoints(sampleGeo, prePositions, photoColors, colorFactorsOverride, origColors, dom) {
        const THREE = this.THREE;

        const N             = prePositions ? Math.floor(prePositions.length / 3) : Math.max(500, parseInt(dom.anamParticleCount?.value ?? 15000));
        const uSize         = parseFloat(dom.anamParticleSize?.value               ?? 30);
        const glowIntensity = parseFloat(dom.anamGlowIntensity?.value              ?? 80) / 100;
        const colorMode     = parseFloat(dom.anamColorMode?.value                  ?? 0);
        const customHex     = dom.anamCustomColor?.value                           ?? '#ff70b8';
        const sampler       = parseInt(dom.anamSampler?.value                      ?? 5);
        // Brightness-driven size (image mode only): port of the Codrops "Interactive
        // Particles" look — bright source pixels become large points, dark ones shrink.
        // Off → keep the original random size variation (some points ~1.9× bigger).
        const brightnessSize = !!photoColors && !!dom.anamBrightnessSize?.checked;

        const origins    = prePositions ?? this.sampleSurface(sampleGeo, N, sampler);
        const positions  = new Float32Array(origins);
        const velocities = new Float32Array(N * 3);
        const velMags    = new Float32Array(N);
        const colorFacs  = new Float32Array(N);
        const sizeMults  = new Float32Array(N);
        const rands      = new Float32Array(N);   // per-particle 0–1 seed for brightness Randomness

        let yMin = Infinity, yMax = -Infinity;
        for (let i = 0; i < N; i++) { const y = origins[i * 3 + 1]; if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
        const yRange = yMax - yMin || 1;

        for (let i = 0; i < N; i++) {
            colorFacs[i]          = colorFactorsOverride ? colorFactorsOverride[i] : (origins[i * 3 + 1] - yMin) / yRange;
            rands[i] = Math.random();
            if (brightnessSize) {
                // Luminosity method (0.21 R + 0.72 G + 0.07 B), as in the Codrops demo.
                // Bake the RAW luminance (0–1); Threshold / Contrast / Randomness then
                // shape it live in the shader (no rebuild needed when tweaking them).
                sizeMults[i] = photoColors[i * 3] * 0.21 + photoColors[i * 3 + 1] * 0.72 + photoColors[i * 3 + 2] * 0.07;
            } else {
                sizeMults[i] = Math.random() < 0.14 ? 1.9 : 1.0;
            }
            velocities[i * 3]     = (Math.random() - 0.5) * 0.05;
            velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
            velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position',     new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aVelMag',      new THREE.BufferAttribute(velMags,   1));
        geo.setAttribute('aColorFactor', new THREE.BufferAttribute(colorFacs, 1));
        geo.setAttribute('aSizeMult',    new THREE.BufferAttribute(sizeMults, 1));
        geo.setAttribute('aRand',        new THREE.BufferAttribute(rands,     1));
        if (photoColors) geo.setAttribute('aPhotoColor', new THREE.BufferAttribute(photoColors, 3));
        if (origColors) geo.setAttribute('aOrigColor', new THREE.BufferAttribute(origColors, 3));

        const mat = new THREE.ShaderMaterial({
            defines: {
                ...(photoColors ? { USE_PHOTO_COLOR: '' } : (origColors ? { USE_ORIG_COLOR: '' } : {})),
                ...(brightnessSize ? { USE_BRIGHTNESS_SIZE: '' } : {}),
            },
            uniforms: {
                uColorWarm:    { value: new THREE.Color(0xff70b8) },
                uColorCool:    { value: new THREE.Color(0x4020e0) },
                uCustomColor:  { value: new THREE.Color(customHex) },
                uMinAlpha:     { value: 0.18 },
                uMaxAlpha:     { value: 0.95 },
                uSize:         { value: uSize },
                uBrightThreshold:  { value: 1 - parseFloat(dom.anamBrightnessThreshold?.value ?? 100) / 100 },
                uBrightContrast:   { value: parseFloat(dom.anamBrightnessContrast?.value   ?? 1.0)        },
                uBrightRandomness: { value: parseFloat(dom.anamBrightnessRandomness?.value ?? 0)   / 100 },
                uGlowIntensity:{ value: glowIntensity },
                uColorMode:    { value: colorMode },
                uColorModeStrength: { value: parseFloat(dom.anamColorModeStrength?.value ?? 100) / 100 },
                // Reveal Wipe — progressive gesture/slider-driven reveal (transparent → visible).
                uRevealOn:     { value: dom.anamRevealEnabled?.checked ? 1 : 0 },
                uRevealMode:   { value: (dom.anamRevealMode?.value === 'spotlight') ? 1 : 0 },
                uRevealPos:    { value: new THREE.Vector2(parseFloat(dom.anamRevealPos?.value ?? 50) / 100, 0.5) },
                uRevealAngle:  { value: parseFloat(dom.anamRevealAngle?.value ?? 0) * Math.PI / 180 },
                uRevealRadius: { value: parseFloat(dom.anamRevealRadius?.value ?? 40) / 100 },
                uRevealFeather:{ value: Math.max(0.001, parseFloat(dom.anamRevealFeather?.value ?? 10) / 100 * 0.5) },
                uAspect:       { value: 1 },
            },
            vertexShader: PARTICLE_VERTEX_SHADER,
            fragmentShader: PARTICLE_FRAGMENT_SHADER,
            // Image mode: normal blending + depth so the photo reads as accurate,
            // crisp color with proper front-over-back occlusion (no additive wash).
            // Nebula mode (mask/torus/GLB): additive glow, order-independent.
            depthWrite:  !!photoColors,
            depthTest:   !!photoColors,
            blending:    photoColors ? THREE.NormalBlending : THREE.AdditiveBlending,
            transparent: true,
        });

        const points = new THREE.Points(geo, mat);
        const particles = { positions, velocities, origins, velMags, N, geo, mat, imageMode: !!photoColors };
        return { points, particles };
    }

    /**
     * Triangle-surface sampler with 5 selectable distributions (the Sampler slider):
     *   1 Uniform   — flat-random per triangle. Over-samples small/dense triangles →
     *                 emphasises fine detail & edges. Best for high-poly/intricate meshes.
     *   2 Vertex    — snaps to mesh vertices. Structural, geometric. Best for low-poly.
     *   3 Wireframe — points along triangle edges. Outline/silhouette. Best for flat
     *                 screens & showing topology.
     *   4 Scatter   — area-weighted surface point pushed along the face normal → a soft
     *                 volumetric shell. Best for nebula/atmospheric looks.
     *   5 Even      — area-weighted, uniform surface density. Cleanest, most legible.
     *                 Best for portraits & smooth solid objects. (Default.)
     * Works with indexed and non-indexed geometry.
     */
    sampleSurface(geometry, N, mode = 5) {
        const pos = geometry.attributes.position;
        const idx = geometry.index?.array ?? null;
        const triCount = idx ? Math.floor(idx.length / 3) : Math.floor(pos.count / 3);
        const out = new Float32Array(N * 3);
        const triVerts = (tri) => {
            const t = tri * 3;
            return idx ? [idx[t], idx[t + 1], idx[t + 2]] : [t, t + 1, t + 2];
        };

        // ── Mode 2: Vertex — snap particles directly to mesh vertices. ──────
        if (mode === 2) {
            const vCount = pos.count;
            for (let i = 0; i < N; i++) {
                const vi = Math.floor(Math.random() * vCount);
                out[i * 3] = pos.getX(vi); out[i * 3 + 1] = pos.getY(vi); out[i * 3 + 2] = pos.getZ(vi);
            }
            return out;
        }

        // Cumulative distribution of triangle areas (½‖(B−A)×(C−A)‖). Modes 3/4/5
        // pick triangles fairly by area; mode 1 picks flat-random instead.
        const cdf = new Float32Array(triCount);
        let acc = 0;
        for (let tri = 0; tri < triCount; tri++) {
            const [ai, bi, ci] = triVerts(tri);
            const ax = pos.getX(ai), ay = pos.getY(ai), az = pos.getZ(ai);
            const e1x = pos.getX(bi) - ax, e1y = pos.getY(bi) - ay, e1z = pos.getZ(bi) - az;
            const e2x = pos.getX(ci) - ax, e2y = pos.getY(ci) - ay, e2z = pos.getZ(ci) - az;
            const crx = e1y * e2z - e1z * e2y;
            const cry = e1z * e2x - e1x * e2z;
            const crz = e1x * e2y - e1y * e2x;
            acc += 0.5 * Math.sqrt(crx * crx + cry * cry + crz * crz);
            cdf[tri] = acc;
        }
        const total = acc || 1;
        const pickTri = () => {
            if (mode === 1) return Math.floor(Math.random() * triCount); // flat-random
            const r = Math.random() * total;                            // area-weighted
            let lo = 0, hi = triCount - 1;
            while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; }
            return lo;
        };

        for (let i = 0; i < N; i++) {
            const [ai, bi, ci] = triVerts(pickTri());
            const ax = pos.getX(ai), ay = pos.getY(ai), az = pos.getZ(ai);
            const bx = pos.getX(bi), by = pos.getY(bi), bz = pos.getZ(bi);
            const cx = pos.getX(ci), cy = pos.getY(ci), cz = pos.getZ(ci);

            if (mode === 3) {
                // Wireframe — interpolate along one of the three edges.
                const e = Math.floor(Math.random() * 3), s = Math.random();
                let p0x, p0y, p0z, p1x, p1y, p1z;
                if (e === 0)      { p0x = ax; p0y = ay; p0z = az; p1x = bx; p1y = by; p1z = bz; }
                else if (e === 1) { p0x = bx; p0y = by; p0z = bz; p1x = cx; p1y = cy; p1z = cz; }
                else              { p0x = cx; p0y = cy; p0z = cz; p1x = ax; p1y = ay; p1z = az; }
                out[i * 3]     = p0x + (p1x - p0x) * s;
                out[i * 3 + 1] = p0y + (p1y - p0y) * s;
                out[i * 3 + 2] = p0z + (p1z - p0z) * s;
                continue;
            }

            // Barycentric surface point (modes 1, 4, 5).
            let u = Math.random(), v = Math.random();
            if (u + v > 1) { u = 1 - u; v = 1 - v; }
            const w = 1 - u - v;
            let x = ax * w + bx * u + cx * v;
            let y = ay * w + by * u + cy * v;
            let z = az * w + bz * u + cz * v;

            if (mode === 4) {
                // Scatter — puff off the surface along the face normal, scaled to the
                // triangle's own size → a soft volumetric shell, not a sharp surface.
                const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
                const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
                let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
                const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
                const push = (Math.random() * 2 - 1) * Math.hypot(e1x, e1y, e1z) * 0.6;
                x += nx * push; y += ny * push; z += nz * push;
            }

            out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
        }
        return out;
    }

    /** Like sampleSurface but also interpolates UV coordinates. Requires geometry with 'uv' attribute. */
    sampleSurfaceWithUV(geometry, N) {
        const pos = geometry.attributes.position;
        const uv  = geometry.attributes.uv;
        const idx = geometry.index?.array ?? null;
        const triCount = idx ? Math.floor(idx.length / 3) : Math.floor(pos.count / 3);
        const outPos = new Float32Array(N * 3);
        const outUV  = new Float32Array(N * 2);
        for (let i = 0; i < N; i++) {
            const t  = Math.floor(Math.random() * triCount) * 3;
            const ai = idx ? idx[t]     : t;
            const bi = idx ? idx[t + 1] : t + 1;
            const ci = idx ? idx[t + 2] : t + 2;
            let u = Math.random(), v = Math.random();
            if (u + v > 1) { u = 1 - u; v = 1 - v; }
            const w = 1 - u - v;
            outPos[i*3]   = pos.getX(ai)*w + pos.getX(bi)*u + pos.getX(ci)*v;
            outPos[i*3+1] = pos.getY(ai)*w + pos.getY(bi)*u + pos.getY(ci)*v;
            outPos[i*3+2] = pos.getZ(ai)*w + pos.getZ(bi)*u + pos.getZ(ci)*v;
            if (uv) {
                outUV[i*2]   = uv.getX(ai)*w + uv.getX(bi)*u + uv.getX(ci)*v;
                outUV[i*2+1] = uv.getY(ai)*w + uv.getY(bi)*u + uv.getY(ci)*v;
            }
        }
        return { positions: outPos, uvs: outUV };
    }

    /**
     * Build image-colored particle points: samples the photo cube surface,
     * looks up each particle's pixel color from the image (one-time CPU read),
     * and passes per-particle colors to the shader via the USE_PHOTO_COLOR define.
     * @returns {Promise<{points: object, particles: object}>}
     */
    async buildImageParticlePoints(imageUrl, is3D, includeGlass, dom, opts = {}) {
        const THREE = this.THREE;
        // ANAMBG — `cutout` means the source is an already-composed, background-removed
        // snapshot (see core/anam/ModelBgCutout.js). Two consequences below: the fit
        // pass is skipped (the source is already at the target ratio, and its black
        // base would erase the alpha), and particles landing on a transparent pixel are
        // dropped so the cloud takes the subject's shape instead of turning it black.
        const cutout = !!opts.cutout;
        const Ntotal = Math.max(500, parseInt(dom.anamParticleCount?.value ?? 15000));

        // Reserve ~30% of the budget for the glass-shell outline particles.
        const Nglass = includeGlass ? Math.round(Ntotal * 0.3) : 0;
        const Nimg   = Ntotal - Nglass;

        // ── Image particles ──────────────────────────────────────────────
        // Jittered grid sampling (not random triangles) → even coverage with no
        // clumps, so the photo reads cleanly. 3D → grid on each of 6 cube faces;
        // Flat → single grid plane. Actual count is rounded to a square grid.
        const { positions: imgPos, uvs } = this.imageParticleGrid(is3D, Nimg);
        const NimgActual = Math.floor(imgPos.length / 3);

        // One-time image pixel read (blob URL; done at particle init, not per frame)
        const img = await new Promise((res, rej) => {
            const el = new Image();
            el.onload = () => res(el);
            el.onerror = rej;
            el.src = imageUrl;
        });
        const fitMode = cutout ? 'stretch' : (dom.anamImageFit?.value || 'stretch');
        const W_orig = img.naturalWidth;
        const H_orig = img.naturalHeight;

        let cvsW = W_orig, cvsH = H_orig;
        let dx = 0, dy = 0, sx = 0, sy = 0, sw = W_orig, sh = H_orig;

        if (fitMode === 'fit') {
            const size = Math.max(W_orig, H_orig);
            cvsW = size; cvsH = size;
            dx = (size - W_orig) / 2;
            dy = (size - H_orig) / 2;
        } else if (fitMode === 'fill') {
            const size = Math.min(W_orig, H_orig);
            cvsW = size; cvsH = size;
            sx = (W_orig - size) / 2;
            sy = (H_orig - size) / 2;
            sw = size; sh = size;
        }

        const MAX_SIZE = 512;
        const scale = Math.max(cvsW, cvsH) > MAX_SIZE ? MAX_SIZE / Math.max(cvsW, cvsH) : 1;
        const W = Math.max(1, Math.round(cvsW * scale));
        const H = Math.max(1, Math.round(cvsH * scale));

        const cvs = document.createElement('canvas');
        cvs.width = W; cvs.height = H;
        const ctx2 = cvs.getContext('2d');

        if (fitMode !== 'stretch') {
            ctx2.fillStyle = 'black';
            ctx2.fillRect(0, 0, W, H);
        }

        if (fitMode === 'fill') {
            ctx2.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
        } else if (fitMode === 'fit') {
            // Blurred background layer
            ctx2.filter = 'blur(15px) brightness(0.4)';
            const bgScale = Math.max(W / W_orig, H / H_orig);
            ctx2.drawImage(img, (W - W_orig * bgScale) / 2, (H - H_orig * bgScale) / 2, W_orig * bgScale, H_orig * bgScale);
            ctx2.filter = 'none';
            // Sharp foreground layer
            ctx2.drawImage(img, dx * scale, dy * scale, W_orig * scale, H_orig * scale);
        } else {
            ctx2.drawImage(img, 0, 0, W, H);
        }

        const imgData = ctx2.getImageData(0, 0, W, H).data;

        const imgColors = new Float32Array(NimgActual * 3);
        // `kept` compacts both arrays in place as background pixels are skipped. With
        // no cutout every pixel passes, kept === i throughout, and the position writes
        // are self-assignments — the existing behaviour, unchanged.
        const keptPos = cutout ? new Float32Array(NimgActual * 3) : imgPos;
        let kept = 0;
        for (let i = 0; i < NimgActual; i++) {
            const px = Math.min(Math.round(uvs[i*2]       * (W - 1)), W - 1);
            const py = Math.min(Math.round((1 - uvs[i*2+1]) * (H - 1)), H - 1);
            const di = (py * W + px) * 4;
            if (cutout && imgData[di + 3] < 24) continue;   // background — no particle
            keptPos[kept*3]     = imgPos[i*3];
            keptPos[kept*3 + 1] = imgPos[i*3 + 1];
            keptPos[kept*3 + 2] = imgPos[i*3 + 2];
            imgColors[kept*3]   = imgData[di]     / 255;
            imgColors[kept*3+1] = imgData[di + 1] / 255;
            imgColors[kept*3+2] = imgData[di + 2] / 255;
            kept++;
        }
        // A cutout with no opaque pixels at all (segmentation found nothing) would
        // leave an empty cloud — fall back to the full grid rather than nothing.
        const NimgKept = kept > 0 ? kept : NimgActual;

        // ── Glass-shell particles (rounded outer box, cool glassy white) ──
        let glassPos = null, glassColors = null;
        if (Nglass > 0) {
            const curveR = parseFloat(dom.anamCurveRadius?.value ?? 0.2);
            const glassGeo = PhotoCubeGlass._makeRoundedBoxGeo(THREE, 2.2, curveR);
            glassPos = this.sampleSurface(glassGeo, Nglass);
            glassGeo.dispose();
            glassColors = new Float32Array(Nglass * 3);
            for (let i = 0; i < Nglass; i++) {
                glassColors[i*3]   = 0.70;   // cool glassy white-blue
                glassColors[i*3+1] = 0.82;
                glassColors[i*3+2] = 1.0;
            }
        }

        // ── Merge into one particle system (single physics tick) ─────────
        const N = NimgKept + Nglass;
        const positions   = new Float32Array(N * 3);
        const photoColors = new Float32Array(N * 3);
        positions.set(keptPos.subarray(0, NimgKept * 3), 0);
        photoColors.set(imgColors.subarray(0, NimgKept * 3), 0);
        if (glassPos) {
            positions.set(glassPos, NimgKept * 3);
            photoColors.set(glassColors, NimgKept * 3);
        }

        return this.buildPoints(null, positions, photoColors, null, null, dom);
    }

    /**
     * Even, jittered-grid distribution of image particles → no random clumping.
     * Returns { positions, uvs } where each particle's UV maps directly to a pixel.
     * Flat → one grid plane (z=0). 3D → a √(N/6) grid on each of the 6 cube faces,
     * full image UVs per face. Particle count rounds to fill complete grid rows.
     */
    imageParticleGrid(is3D, N) {
        const positions = [];
        const uvs = [];
        const fill = (side, toPos) => {
            for (let i = 0; i < side; i++) {
                for (let j = 0; j < side; j++) {
                    const u = (i + Math.random()) / side;
                    const v = (j + Math.random()) / side;
                    const p = toPos(u * 2 - 1, v * 2 - 1);
                    positions.push(p[0], p[1], p[2]);
                    uvs.push(u, v);
                }
            }
        };
        if (!is3D) {
            const side = Math.max(2, Math.round(Math.sqrt(N)));
            fill(side, (a, b) => [a, b, 0]);
        } else {
            const side = Math.max(2, Math.round(Math.sqrt(N / 6)));
            const faces = [
                (a, b) => [ a,  b,  1],   // +Z
                (a, b) => [ a,  b, -1],   // −Z
                (a, b) => [ 1,  b,  a],   // +X
                (a, b) => [-1,  b,  a],   // −X
                (a, b) => [ a,  1,  b],   // +Y
                (a, b) => [ a, -1,  b],   // −Y
            ];
            faces.forEach((f) => fill(side, f));
        }
        return { positions: new Float32Array(positions), uvs: new Float32Array(uvs) };
    }

    /**
     * Real-time audio feature extractor for the particle dance modes. Each frame it
     * turns the raw 128-bin FFT (`app.audioEngine.freqData`) into the signals a good
     * music visualizer actually needs — computed here, independent of the global
     * Smoothing slider, so transients survive:
     *
     *   • bands[NB] — NB log-grouped band envelopes (0..~1.5), fast-attack / slow-release,
     *                 adaptive-gain normalized (AGC) so quiet and loud songs both react.
     *   • low/mid/high/energy — region + overall envelopes for the Target dropdown.
     *   • kick/snare/hat — onset PULSES (0..1, decaying) from spectral flux in the
     *                 low / mid / high bands → real drum-hit detection, not loudness.
     *
     * State persists on `this.af` across frames; returns the same object each call.
     */
    updateAudioFeatures(app) {
        const NB = 24;
        const af = this.af || (this.af = {
            bands: new Float32Array(NB), edges: null, prev: new Float32Array(128),
            low: 0, mid: 0, high: 0, energy: 0,
            avgLow: 0, avgMid: 0, avgHigh: 0,
            kick: 0, snare: 0, hat: 0, kickCD: 0, snareCD: 0, hatCD: 0, peak: 0.06,
        });
        if (!af.edges) {  // log-spaced band edges over bins 1..120 (computed once)
            af.edges = new Int16Array(NB + 1);
            for (let b = 0; b <= NB; b++)
                af.edges[b] = Math.min(127, Math.max(1, Math.round(1 * Math.pow(120, b / NB))));
        }
        const fd = app?.audioEngine?.freqData;
        if (!fd) {  // no audio yet → ease everything back to rest
            for (let b = 0; b < NB; b++) af.bands[b] *= 0.85;
            af.low *= 0.85; af.mid *= 0.85; af.high *= 0.85; af.energy *= 0.85;
            af.kick *= 0.8; af.snare *= 0.8; af.hat *= 0.8;
            return af;
        }

        // ── Log-band envelopes + adaptive gain ──────────────────────────────
        let frameMax = 1e-4, sum = 0;
        for (let b = 0; b < NB; b++) {
            const e0 = af.edges[b], e1 = Math.max(af.edges[b] + 1, af.edges[b + 1]);
            let s = 0, c = 0;
            for (let i = e0; i < e1; i++) { s += fd[i]; c++; }
            let raw = (c ? s / c : 0) / 255;
            raw *= 1 + (b / NB) * 1.2;                       // perceptual tilt: lift the quieter highs
            if (raw > frameMax) frameMax = raw;
            const prev = af.bands[b];
            af.bands[b] = raw > prev ? raw : raw * 0.35 + prev * 0.65;  // fast attack / slow release
        }
        af.peak = Math.max(frameMax, af.peak * 0.995);       // AGC: track recent peak, slow decay
        const gain = 1 / Math.max(0.08, af.peak);
        let lo = 0, md = 0, hi = 0, ln = 0, mn = 0, hn = 0;
        for (let b = 0; b < NB; b++) {
            const v = Math.min(1.5, af.bands[b] * gain);
            af.bands[b] = v; sum += v;
            if (b < NB * 0.25) { lo += v; ln++; }
            else if (b < NB * 0.6) { md += v; mn++; }
            else { hi += v; hn++; }
        }
        af.low = ln ? lo / ln : 0; af.mid = mn ? md / mn : 0; af.high = hn ? hi / hn : 0;
        af.energy = Math.min(1.5, sum / NB);

        // ── Spectral-flux onset detection → kick / snare / hat ──────────────
        let fLow = 0, fMid = 0, fHigh = 0;
        for (let i = 1; i < 120; i++) {
            const d = fd[i] - af.prev[i];
            if (d > 0) { if (i < 8) fLow += d; else if (i < 40) fMid += d; else fHigh += d; }
            af.prev[i] = fd[i];
        }
        fLow /= 7 * 255; fMid /= 32 * 255; fHigh /= 80 * 255;
        af.avgLow = af.avgLow * 0.9 + fLow * 0.1;            // rolling baselines
        af.avgMid = af.avgMid * 0.9 + fMid * 0.1;
        af.avgHigh = af.avgHigh * 0.9 + fHigh * 0.1;
        af.kickCD = Math.max(0, af.kickCD - 1);
        af.snareCD = Math.max(0, af.snareCD - 1);
        af.hatCD = Math.max(0, af.hatCD - 1);
        if (fLow  > af.avgLow  * 1.5 + 0.012 && af.kickCD  <= 0) { af.kick  = 1; af.kickCD  = 6; }
        if (fMid  > af.avgMid  * 1.6 + 0.010 && af.snareCD <= 0) { af.snare = 1; af.snareCD = 5; }
        if (fHigh > af.avgHigh * 1.7 + 0.008 && af.hatCD   <= 0) { af.hat   = 1; af.hatCD   = 3; }
        af.kick *= 0.86; af.snare *= 0.84; af.hat *= 0.80;   // decay the pulses
        return af;
    }

    /** Overall drive level for the selected Target band (All / Bass / Mid / Treble). */
    afDrive(af, band) {
        return band === 'bass' ? af.low : band === 'mid' ? af.mid
            : band === 'treble' ? af.high : af.energy;
    }

    /**
     * Per-particle data the dance modes need, derived once from the rest cloud and
     * cached on the particles object (invalidated automatically on every rebuild,
     * since buildPoints() makes a fresh object with no _audio):
     *   • dir{x,y,z} — displacement direction (radial-from-centroid for 3D clouds;
     *                  +Z depth-pop for flat image clouds, à la the Codrops webcam demo)
     *   • aband      — angular sector around the cloud → maps each particle to a
     *                  frequency band for the rotating Spectrum Sculpture (radial EQ)
     *   • radius     — mean distance from centroid → scale-independent displacement
     *   • off        — last frame's direct displacement, stripped before physics so
     *                  direct modes track the audio instantly instead of being
     *                  low-passed away by the spring
     */
    ensureParticleAudioData(particles) {
        const p = particles;
        if (!p) return null;
        if (p._audio) return p._audio;
        const { origins, N, imageMode } = p;
        const NB = 24;   // must match updateAudioFeatures band count
        let cx = 0, cy = 0, cz = 0, yMin = Infinity, yMax = -Infinity;
        for (let i = 0; i < N; i++) {
            const i3 = i * 3;
            cx += origins[i3]; cy += origins[i3 + 1]; cz += origins[i3 + 2];
            const y = origins[i3 + 1]; if (y < yMin) yMin = y; if (y > yMax) yMax = y;
        }
        const inv = 1 / (N || 1);
        cx *= inv; cy *= inv; cz *= inv;
        const yr = (yMax - yMin) || 1;
        const dirx = new Float32Array(N), diry = new Float32Array(N), dirz = new Float32Array(N);
        const aband = new Uint16Array(N);   // angular band → rotating radial EQ (Sculpture)
        const hband = new Uint16Array(N);   // height band  → bass-bottom / treble-top (Terrain)
        const prad  = new Float32Array(N);  // distance from centroid → Bloom wave phase
        const TAU = Math.PI * 2;
        let rsum = 0;
        for (let i = 0; i < N; i++) {
            const i3 = i * 3;
            const dx = origins[i3] - cx, dy = origins[i3 + 1] - cy, dz = origins[i3 + 2] - cz;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
            rsum += len;
            prad[i] = len;
            if (imageMode) { dirx[i] = 0; diry[i] = 0; dirz[i] = 1; }
            else { dirx[i] = dx / len; diry[i] = dy / len; dirz[i] = dz / len; }
            // Angle around the vertical axis (xz-plane for 3D; image plane for photos)
            // → which frequency band this particle represents in the radial spectrum.
            const ang = imageMode ? Math.atan2(dy, dx) : Math.atan2(dz, dx);
            aband[i] = Math.min(NB - 1, Math.floor(((ang + Math.PI) / TAU) * NB));
            const h = (origins[i3 + 1] - yMin) / yr;        // 0 bottom → 1 top
            hband[i] = Math.min(NB - 1, Math.floor(h * (NB - 1)));
        }
        p._audio = { cx, cy, cz, dirx, diry, dirz, aband, hband, prad, radius: (rsum * inv) || 1, off: new Float32Array(N * 3) };
        return p._audio;
    }

    /**
     * Compute the normalization factor (1 = full audio motion → 0 = resolved clean
     * media image). Scaling the audio gain by this factor lets the existing spring
     * reassemble the picture (origins ARE the clean image), reproducing the reference
     * "chaos → assemble → hold" sequence. Three triggers, gated by Resolve Duration:
     *   • Voice/SRT end  — resolve so the image lands exactly as narration finishes.
     *   • Show Timer      — global timeline length for shows with no Voice/SRT track.
     *   • Normalize Now   — manual, ramps from the click (see triggerNormalizeNow()).
     */
    updateParticleNormalize(dom, app) {
        const resolveDur = Math.max(0.2, parseFloat(dom.anamParticleResolveDuration?.value ?? 3));
        const playing = !!app?.state?.isPlaying;
        const tNow = performance.now() * 0.001;

        // Re-arm the show clock + clear a stale manual trigger on each playback start.
        if (playing && !this.normPlaying) {
            this.showClockStart = tNow;
            this.normManual = false;
        }
        this.normPlaying = playing;

        let remaining = Infinity;

        // Manual "Normalize Now" — ramp to the clean image from the click.
        if (this.normManual)
            remaining = Math.min(remaining, resolveDur - (tNow - (this.normManualStart || tNow)));

        if (!!dom.anamParticleAutoNormalize?.checked && playing) {
            const va = app?.voiceAudio;
            let showEnd = 0, clock = 0, have = false;
            if (va && va.src && isFinite(va.duration) && va.duration > 0) {
                showEnd = va.duration; clock = va.currentTime || 0; have = true;
            }
            // SRT captions can outlast the voice clip — extend the show end to the last block.
            const atc = app?.atcEngine;
            if (atc?._srtMode && Array.isArray(atc._srtBlocks) && atc._srtBlocks.length) {
                const end = atc._srtBlocks[atc._srtBlocks.length - 1]?.end ?? 0;
                if (end > showEnd) showEnd = end;
                if (!have) { clock = va?.currentTime ?? (tNow - (this.showClockStart || tNow)); have = true; }
            }
            if (have && showEnd > 0) remaining = Math.min(remaining, showEnd - clock);

            // Global Show Timer — works even with no Voice/SRT track (image / loop shows).
            const showDur = parseFloat(dom.anamParticleShowDuration?.value ?? 0);
            if (showDur > 0)
                remaining = Math.min(remaining, showDur - (tNow - (this.showClockStart || tNow)));
        }

        const nf = (remaining <= resolveDur) ? Math.max(0, Math.min(1, remaining / resolveDur)) : 1;
        this.normFactor = nf;
        return nf;
    }

    /** Force the resolve ramp from now, independent of any timeline — called by
     *  the host's "Normalize Now" button handler. */
    triggerNormalizeNow() {
        this.normManual = true;
        this.normManualStart = performance.now() * 0.001;
    }

    /**
     * Run one physics step: spring-attract to origin + viewer-position repel + audio.
     * @param {object} particles  the host's `this._particles` bag (mutated in place).
     * @param {object} f          the host's shared, preallocated frame context
     *                            (masterplan.md §6.5) — dom, track, app. Never
     *                            store it. Never allocate here.
     */
    tick(particles, f) {
        if (!particles) return;
        const dom = f.dom, track = f.track, app = f.app;
        const { positions, velocities, origins, velMags, N, geo, imageMode, mat } = particles;

        // ── Idle sleep ───────────────────────────────────────────────────────
        // With audio off and no active tracking there is no force left that can
        // move the cloud; once peak velocity has stayed ~zero for 8 consecutive
        // frames, skip the whole physics loop AND both attribute uploads (the
        // common "particles at rest" case becomes ~free). Wakes automatically:
        // enabling audio or tracking falls through here, and a rebuild makes a
        // fresh particles object (counter resets via the end-of-loop update).
        const audioOn = !!dom.anamParticleAudioEnabled?.checked;
        if (!audioOn && !track.has && (particles._calmFrames || 0) >= 8) return;

        // Map viewer tracking (~-1..1) to model-space repel origin
        const mx = track.x * 1.0;
        const my = -track.y * 1.0;
        const mz = 0.0;
        const repelR  = 0.42;
        const repelF  = 0.007;
        // Image mode: stiffer spring + heavier damping so particles snap back onto
        // their pixel after the viewer-repel → the photo stays sharp, not jittery.
        const springK = imageMode ? 0.05 : 0.018;
        const damping  = imageMode ? 0.78 : 0.84;

        // ── Audio dance setup (computed once per frame) ──────────────────────
        // Three modes built on real audio features (see updateAudioFeatures):
        //   flow     — particles advect through an audio-modulated curl-noise field;
        //              kick punches an outward shockwave; the spring reforms the shape
        //              between hits (loud dissolves, quiet reassembles). Continuous life.
        //   spectrum — rotating radial equalizer: each particle rides its angular
        //              frequency band's envelope (DIRECT displacement). See the song.
        //   beat     — return-to-form cloud that EXPLODES on kick, TWISTS on snare,
        //              SHIMMERS on hats. Locked to the drums, not loudness.
        const tNow = performance.now() * 0.001;
        let aMode = 'off', aGain = 0, af = null, direct = false;
        let flowStr = 0, flowScale = 0, flowSpeed = 0, flowSpring = 1, trebJit = 0, kickBurst = 0;
        let specScale = 0, specRotF = 0;
        let bKick = 0, bTwist = 0, bScatter = 0, bHat = 0;
        // Classic modes (rebuilt on the new feature extractor):
        let bloomBase = 0, bloomWaveSpeed = 0, bloomPhaseK = 0;   // Bloom / Breathe
        let turbAmp = 0, turbKick = 0;                            // Turbulence
        let sgLevel = 0;
        // Assembly-show presets (all viewport-bounded, audio-reactive):
        let dnaShape = 0, dnaR = 0, dnaTurns = 0, dnaSpin = 0, dnaKick = 0;   // DNA Helix
        let satShape = 0, satTilt = 0, satSpin = 0, satMaxR = 0, satKick = 0; // Saturn Rings
        let waveAmp = 0, waveK = 0, wavePhase = 0, waveKick = 0;              // Wave (replaces Terrain)
        let cycSpin = 0, cycPull = 0, cycLift = 0;                            // Cyclone (replaces Swirl)
        // Use any cached audio data even when the toggle is off, so a residual direct
        // offset from the last audio-on frame gets stripped (no particles left stuck).
        const aud = particles._audio || (audioOn ? this.ensureParticleAudioData(particles) : null);
        const off = aud?.off || null;
        if (audioOn) {
            aMode = dom.anamParticleAudioMotion?.value || 'flow';
            // Normalization: as the show ends, ramp the audio gain to 0 so the spring
            // resolves the cloud back onto the clean media image (origins).
            const nf = this.updateParticleNormalize(dom, app);
            aGain = (parseFloat(dom.anamParticleAudioIntensity?.value ?? 60) / 100) * nf;
            af = this.updateAudioFeatures(app);
            const tband = dom.anamParticleAudioBand?.value || 'all';
            const R = aud?.radius || 1;
            sgLevel = Math.min(1.2, this.afDrive(af, tband) * 0.8 + af.kick * 0.6);
            if (aMode === 'flow') {
                direct = false;
                const drive = this.afDrive(af, tband);
                flowStr   = (0.018 + af.energy * 0.05 + drive * 0.03) * aGain * R; // base life + audio
                flowScale = 1.3 + af.low * 1.8;                                    // bass sets structure size
                flowSpeed = 0.4 + af.energy * 1.6;                                 // energy speeds the flow
                trebJit   = af.high * aGain * 0.045 * R;                           // treble sparkle
                kickBurst = af.kick * aGain * 0.5 * R;                             // kick shockwave
                flowSpring = 1 - Math.min(0.85, af.energy * 0.9) * nf;             // loud dissolves / quiet reforms (full spring as it normalizes)
            } else if (aMode === 'spectrum') {
                direct = true;
                specScale = aGain * 1.4 * R;
                specRotF  = tNow * (0.25 + af.energy * 1.6);                       // spin the EQ with energy
            } else if (aMode === 'beat') {
                direct = false;
                // Target emphasises one drum (Bass→kick, Mid→snare, Treble→hat); All = balanced.
                const kE = af.kick  * (tband === 'bass'   ? 1.8 : 1.0);
                const sE = af.snare * (tband === 'mid'    ? 1.8 : 1.0);
                const hE = af.hat   * (tband === 'treble' ? 1.8 : 1.0);
                bKick    = kE * aGain * 0.7 * R;    // radial explosion on kick
                bTwist   = sE * aGain * 0.12;       // tangential twist on snare
                bScatter = sE * aGain * 0.14 * R;   // scatter on snare
                bHat     = hE * aGain * 0.05 * R;   // shimmer on hats
            }
            // ── Classic modes, now driven by the real feature extractor ─────
            else if (aMode === 'bloom') {
                // Concentric breath-wave: idle breath keeps it alive, the target band
                // swells the amplitude, energy speeds the ripple, and a kick punches it.
                direct = true;
                bloomBase      = (0.10 + this.afDrive(af, tband) * 1.2 + af.kick * 0.5) * aGain * R;
                bloomWaveSpeed = 1.6 + af.energy * 9.0;
                bloomPhaseK    = 5.0 / R;
            } else if (aMode === 'turbulence') {
                // Agitated shimmer scaled by the target band, with a kick burst on top.
                turbAmp  = this.afDrive(af, tband) * aGain * 0.16 * R;
                turbKick = af.kick * aGain * 0.4 * R;
            }
            // ── Assembly-show presets — reshape the media into a form, then resolve ──
            else if (aMode === 'dna') {
                // Double helix about the vertical axis: the image's columns twist into
                // two intertwined strands. Bass swells the radius; energy spins it.
                direct = true;
                dnaShape = aGain;                          // 0 → clean image, 1 → full helix
                dnaR     = (0.22 + af.low * 0.10) * R;     // helix radius (viewport-bounded)
                dnaTurns = 3.0;                            // vertical turns across the height
                dnaSpin  = tNow * (0.6 + af.energy * 2.2);
                dnaKick  = af.kick * 0.12 * R;             // radius pop on the kick
            } else if (aMode === 'saturn') {
                // Tilted orbiting rings around the image centre; inner rings spin faster.
                direct = true;
                satShape = aGain;
                satTilt  = 0.35;                           // ring-plane tilt (rad)
                satSpin  = tNow * (0.4 + this.afDrive(af, tband) * 1.6);
                satMaxR  = 0.5 * R;                        // outer ring (fits preview)
                satKick  = af.kick * 0.10 * R;
            } else if (aMode === 'wave') {
                // Travelling sine ripple across the media (depth axis) — band sets the
                // height, energy the speed; a kick sends a swell through it.
                direct = true;
                waveAmp   = (0.10 + this.afDrive(af, tband) * 0.9) * aGain * R;
                waveK     = 3.0 / (R || 1);
                wavePhase = tNow * (1.2 + af.energy * 5.0);
                waveKick  = af.kick * aGain * 0.4 * R;
            } else if (aMode === 'cyclone') {
                // Vortex funnel about the vertical axis: tangential spin + inward pull +
                // lift. Spin rides the band level and surges on kicks (spring self-limits).
                cycSpin = (0.02 + this.afDrive(af, tband) * 0.10 + af.kick * 0.06) * aGain;
                cycPull = 0.010 * aGain;
                cycLift = 0.010 * aGain * R;
            }
        }
        const cx = aud?.cx || 0, cy = aud?.cy || 0, cz = aud?.cz || 0;
        const NB = af ? af.bands.length : 24;
        let peakV = 0;   // settle detector for the idle-sleep gate

        for (let i = 0; i < N; i++) {
            const i3 = i * 3;
            // Strip last frame's direct audio offset → run physics on the clean base.
            let px = positions[i3], py = positions[i3 + 1], pz = positions[i3 + 2];
            if (off) { px -= off[i3]; py -= off[i3 + 1]; pz -= off[i3 + 2]; }
            const ox = origins[i3], oy = origins[i3 + 1], oz = origins[i3 + 2];

            // Spring: pull toward the shape. Flow mode weakens it with energy so loud
            // passages dissolve the cloud and quiet ones let it reassemble.
            const sK = (aMode === 'flow') ? springK * flowSpring : springK;
            velocities[i3]     += (ox - px) * sK;
            velocities[i3 + 1] += (oy - py) * sK;
            velocities[i3 + 2] += (oz - pz) * sK;

            // Repel: push particles away from the viewer's projected position
            // Only apply when a gesture/face is actively tracked; otherwise
            // track.x/y are 0, which would repel from the model centre and
            // create a visible hole even at rest.
            if (track.has) {
                const dx = px - mx, dy = py - my, dz = pz - mz;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < repelR && dist > 1e-4) {
                    const f2 = repelF * (1.0 - dist / repelR) / dist;
                    velocities[i3]     += dx * f2;
                    velocities[i3 + 1] += dy * f2;
                    velocities[i3 + 2] += dz * f2;
                }
            }

            // Audio impulses (added straight to velocity; the spring/damping settle them)
            if (aMode === 'flow') {
                // Curl-like trig flow field → continuous organic, fluid motion. Bass sets
                // the structure scale, energy the speed; treble adds sparkle; kick punches.
                const s = flowScale, tp = tNow * flowSpeed;
                velocities[i3]     += (Math.sin(py * s + tp)        - Math.cos(pz * s + tp * 0.8)) * flowStr;
                velocities[i3 + 1] += (Math.sin(pz * s + tp * 1.1)  - Math.cos(px * s + tp * 0.9)) * flowStr;
                velocities[i3 + 2] += (Math.sin(px * s + tp * 0.9)  - Math.cos(py * s + tp * 1.2)) * flowStr;
                if (trebJit) {
                    velocities[i3]     += (Math.random() - 0.5) * trebJit;
                    velocities[i3 + 1] += (Math.random() - 0.5) * trebJit;
                    velocities[i3 + 2] += (Math.random() - 0.5) * trebJit;
                }
                if (kickBurst) {
                    velocities[i3]     += aud.dirx[i] * kickBurst;
                    velocities[i3 + 1] += aud.diry[i] * kickBurst;
                    velocities[i3 + 2] += aud.dirz[i] * kickBurst;
                }
            } else if (aMode === 'beat') {
                if (bKick) {                                   // radial explosion on the kick
                    velocities[i3]     += aud.dirx[i] * bKick;
                    velocities[i3 + 1] += aud.diry[i] * bKick;
                    velocities[i3 + 2] += aud.dirz[i] * bKick;
                }
                if (bTwist) {                                  // tangential twist on the snare
                    const rx = px - cx, rz = pz - cz;
                    velocities[i3]     += -rz * bTwist;
                    velocities[i3 + 2] +=  rx * bTwist;
                }
                if (bScatter) {                                // snare scatter
                    velocities[i3]     += (Math.random() - 0.5) * bScatter;
                    velocities[i3 + 1] += (Math.random() - 0.5) * bScatter;
                    velocities[i3 + 2] += (Math.random() - 0.5) * bScatter;
                }
                if (bHat) {                                    // hi-hat shimmer
                    velocities[i3]     += (Math.random() - 0.5) * bHat;
                    velocities[i3 + 1] += (Math.random() - 0.5) * bHat;
                    velocities[i3 + 2] += (Math.random() - 0.5) * bHat;
                }
            } else if (aMode === 'turbulence') {
                if (turbAmp) {                                 // agitated shimmer
                    velocities[i3]     += (Math.random() - 0.5) * turbAmp;
                    velocities[i3 + 1] += (Math.random() - 0.5) * turbAmp;
                    velocities[i3 + 2] += (Math.random() - 0.5) * turbAmp;
                }
                if (turbKick) {                                // kick burst on top
                    velocities[i3]     += aud.dirx[i] * turbKick;
                    velocities[i3 + 1] += aud.diry[i] * turbKick;
                    velocities[i3 + 2] += aud.dirz[i] * turbKick;
                }
            } else if (aMode === 'cyclone') {
                // Vortex funnel: tangential spin + inward pull + lift. Image clouds swirl
                // in the picture plane (xy); 3D clouds swirl about the vertical axis (xz).
                if (cycSpin || cycPull || cycLift) {
                    if (imageMode) {
                        const ex = px - cx, ey = py - cy;
                        velocities[i3]     += -ey * cycSpin - ex * cycPull;
                        velocities[i3 + 1] +=  ex * cycSpin - ey * cycPull;
                        velocities[i3 + 2] +=  cycLift * Math.sin(tNow * 1.5 + aud.prad[i]);
                    } else {
                        const rx = px - cx, rz = pz - cz;
                        velocities[i3]     += -rz * cycSpin - rx * cycPull;
                        velocities[i3 + 2] +=  rx * cycSpin - rz * cycPull;
                        velocities[i3 + 1] +=  cycLift;
                    }
                }
            }

            // Damping + Euler integrate (base position, audio-offset-free)
            velocities[i3]     *= damping;
            velocities[i3 + 1] *= damping;
            velocities[i3 + 2] *= damping;
            px += velocities[i3];
            py += velocities[i3 + 1];
            pz += velocities[i3 + 2];

            // Direct displacement — each particle either rides a frequency-band envelope
            // (spectrum / bloom / wave) or is reshaped into a form (dna / saturn). The
            // reshaping offset is scaled by the audio gain (× normalization), so it melts
            // back onto the origin — the clean media image — as the show resolves.
            let ax = 0, ay = 0, az = 0;
            if (direct) {
                if (aMode === 'spectrum') {
                    const fb = aud.aband[i] + specRotF;        // rotate the spectrum mapping
                    const b0 = ((fb | 0) % NB + NB) % NB;
                    const b1 = (b0 + 1) % NB;
                    const fr = fb - Math.floor(fb);
                    const d = (af.bands[b0] * (1 - fr) + af.bands[b1] * fr) * specScale;
                    ax = aud.dirx[i] * d; ay = aud.diry[i] * d; az = aud.dirz[i] * d;
                } else if (aMode === 'bloom') {
                    const wave = 0.5 + 0.5 * Math.sin(tNow * bloomWaveSpeed - aud.prad[i] * bloomPhaseK);
                    const d = bloomBase * wave;
                    ax = aud.dirx[i] * d; ay = aud.diry[i] * d; az = aud.dirz[i] * d;
                } else if (aMode === 'wave') {
                    // Travelling ripple along the depth axis, phase from the media's x.
                    az = Math.sin((ox - cx) * waveK - wavePhase) * (waveAmp + waveKick);
                } else if (aMode === 'dna') {
                    // Wrap the column at this height onto one of two helical strands.
                    const TAU = 6.283185307179586;
                    const hN = aud.hband[i] / (NB - 1);        // 0 bottom → 1 top
                    const ph = hN * dnaTurns * TAU + dnaSpin + ((i & 1) ? Math.PI : 0);
                    const r  = dnaR + dnaKick;
                    ax = ((cx + Math.cos(ph) * r) - ox) * dnaShape;   // keep height (oy), wrap x/z
                    az = ((cz + Math.sin(ph) * r) - oz) * dnaShape;
                } else if (aMode === 'saturn') {
                    // Map onto a tilted orbiting ring at its own radius (inner rings faster).
                    const TAU = 6.283185307179586;
                    const ringR = Math.min(aud.prad[i], satMaxR) + satKick;
                    const spd   = satSpin * (1.0 + (1.0 - ringR / (satMaxR || 1)) * 0.8);
                    const a = (aud.aband[i] / NB) * TAU + spd;
                    const u = Math.cos(a) * ringR, v = Math.sin(a) * ringR;
                    ax = ((cx + u) - ox) * satShape;
                    ay = ((cy + v * Math.sin(satTilt)) - oy) * satShape;
                    az = ((cz + v * Math.cos(satTilt)) - oz) * satShape;
                }
            }
            positions[i3]     = px + ax;
            positions[i3 + 1] = py + ay;
            positions[i3 + 2] = pz + az;
            if (off) { off[i3] = ax; off[i3 + 1] = ay; off[i3 + 2] = az; }

            // Brightness: physics speed + audio displacement (velMag → alpha in shader).
            const vx = velocities[i3], vy = velocities[i3 + 1], vz = velocities[i3 + 2];
            velMags[i] = Math.sqrt(vx * vx + vy * vy + vz * vz)
                + (direct ? Math.sqrt(ax * ax + ay * ay + az * az) * 0.6 : 0);
            if (velMags[i] > peakV) peakV = velMags[i];
        }

        // Idle-sleep counter: with no possible force and ~zero peak velocity the
        // remaining drift is sub-visible (< 1e-4 world units total), so after 8
        // such frames the gate at the top stops ticking entirely.
        particles._calmFrames = (!audioOn && !track.has && peakV < 2e-5)
            ? (particles._calmFrames || 0) + 1 : 0;

        // Size + Glow pulse — modulate the live uniforms by the audio level, then
        // restore the slider values once when the option is switched off.
        const sizeGlowOn = audioOn && !!dom.anamParticleAudioSizeGlow?.checked;
        if (sizeGlowOn && mat) {
            const baseSize = parseFloat(dom.anamParticleSize?.value ?? 30);
            const baseGlow = parseFloat(dom.anamGlowIntensity?.value ?? 80) / 100;
            const k = sgLevel * aGain;
            mat.uniforms.uSize.value = baseSize * (1 + k * 1.3);
            mat.uniforms.uGlowIntensity.value = Math.min(1, baseGlow * (1 + k * 1.0));
            this.partSizeGlowActive = true;
        } else if (this.partSizeGlowActive && mat) {
            mat.uniforms.uSize.value = parseFloat(dom.anamParticleSize?.value ?? 30);
            mat.uniforms.uGlowIntensity.value = parseFloat(dom.anamGlowIntensity?.value ?? 80) / 100;
            this.partSizeGlowActive = false;
        }

        geo.attributes.position.needsUpdate = true;
        geo.attributes.aVelMag.needsUpdate  = true;
    }

    /**
     * Static wireframe-lines representation of the model surface — the model's
     * own triangle edges drawn as additive lines, coloured by the current colour
     * mode. No growth animation (a static counterpart to the dot cloud).
     * @param {object} geometry           the source mesh geometry.
     * @param {function} transformColorFn the host's `_transformColor(t)` (Phase 14
     *                                    territory — stays on host, passed in here).
     * @returns {{grp: object, seg: object}} the host stashes `this._transform =
     *   { style: 'static_lines', grp, seg, static: true }` and returns `grp`.
     */
    buildStaticLines(geometry, transformColorFn) {
        const THREE = this.THREE;
        const grp = new THREE.Group();
        const wire = new THREE.WireframeGeometry(geometry);
        const pos = wire.attributes.position;
        // Per-vertex colour by height, matching the particle colour modes.
        let yMin = Infinity, yMax = -Infinity;
        for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
        const yr = (yMax - yMin) || 1;
        const colors = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const c = transformColorFn((pos.getY(i) - yMin) / yr);
            colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        }
        wire.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const mat = new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.6,
            blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const seg = new THREE.LineSegments(wire, mat);
        seg.frustumCulled = false;
        grp.add(seg);
        return { grp, seg };
    }

    /** Present for contract consistency; the points/lines mesh is parented
     *  inside `_modelGroup`, so the host's generic model-clear disposal loop
     *  in `_loadModel()` already handles geometry/material teardown today —
     *  not wired to a call site (matches core/anam/FractalBackground.js). */
    dispose() {
        this.af = null;
    }
}
