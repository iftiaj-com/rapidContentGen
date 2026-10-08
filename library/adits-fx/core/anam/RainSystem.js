// RainSystem.js — universal GPU particle rain for the AnamorphicCamera scene. // RAIN
//
// Two exports:
//   • RainSystem    — the rain itself: an instanced cloud of velocity-oriented streaks
//                     (motion-blur length from each drop's own speed) plus a pooled splash /
//                     drip layer. Rendered in FRONT of the finished frame in its own scene.
//   • RainCollision — the cheap screen-space "where does a drop land" logic (model
//                     silhouette / media luma / background luma occupancy grids) that used
//                     to live in AnamorphicCamera.js. Pure logic, no DOM.
//
// Why the rain looks like water: a raindrop has no colour of its own. On camera it is a
// tiny lens that shows the scene behind it, bent, with a bright specular line where the
// light catches it. So each streak here REFRACTS the composited frame (the host hands it in
// as uBackground) through a cylinder normal across the streak's width, then adds a specular
// core scaled by how dark the background is (rain glows over dark footage and reads as a
// faint darker line over bright footage). The refraction-through-the-background idea is
// after Lucas Bebber, "Rain & Water Effect Experiments", Codrops, 4 Nov 2015
// (github.com/codrops/RainEffect, MIT); adapted here to oriented falling streaks. No demo
// assets are used.
//
// Geometry: InstancedBufferGeometry (one unit quad, per-drop aPos/aVel/aDepth/aSheet), the
// same pattern as the smoke in BurnDissolve.js. A quad is sized width x length and rotated
// to the velocity vector in the vertex shader, so wind tilts it and speed lengthens it.
// Only the first `activeCount` instances are drawn (instanceCount follows the intensity).
// The CPU physics loop and the Float32Array position layout are unchanged from the old
// THREE.Points version, so getPositions() / recycle() / deflect() keep working.
//
// THREE is passed in (AnamorphicCamera lazy-loads three.js), mirroring ExplodeShatter /
// VoxelDrop — this module has no direct three import.
//
// GLSL in template literals is fine in the obfuscated build — see CLAUDE.md Common Gotchas #8.

import { clamp01 } from './anam-utils.js';

// ── Shared GLSL: the one palette both fragment shaders use ─────────────────
// Interpolated into the streak AND splash shaders so the two layers cannot drift apart.
// mode: 0 Natural (handled by the caller), 1 White, 2 Cyan, 3 Rainbow, 4 Neon, 5 Thermal,
//       6 Custom, 7 Rain Blue (handled by the caller).
const RAIN_COLOR_GLSL = `
vec3 hue(float h) {
    h = fract(h);
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}
vec3 rainPalette(float mode, float seed, float depth, vec3 custom) {
    if (mode < 1.5)      return vec3(1.0);                                       // White
    else if (mode < 2.5) return vec3(0.35, 0.95, 1.0);                           // Cyan
    else if (mode < 3.5) return hue(seed);                                       // Rainbow (per drop)
    else if (mode < 4.5) return hue(seed * 0.33) * 1.4 + 0.15;                   // Neon
    else if (mode < 5.5) return mix(vec3(1.0, 0.85, 0.1), vec3(1.0, 0.15, 0.0), depth); // Thermal
    return custom;                                                                // Custom
}
// Tinted water: the refracted background dyed toward the palette colour.
vec3 rainTint(vec3 bg, vec3 c, float spec) { return mix(bg, bg * 0.45 + c * 0.75, 0.7) + spec * c; }
`;

// ── Streaks ────────────────────────────────────────────────────────────────
// Quad space: position.x = across (-0.5..0.5), position.y = along (-0.5 tail .. 0.5 head).
const STREAK_VERTEX = `
uniform float uSize;        // base streak width in pixels (at the z = 0 plane)
uniform float uShutter;     // 0..1 motion-blur exposure (0 = dots, 1 = 40 ms streaks)
uniform float uIntensity;   // 0..1 master density (fatter drops in a downpour)
uniform float uTime;        // seconds (density sheets)
uniform vec2  uResolution;  // output canvas size in pixels
attribute vec3  aPos;       // per-drop world position (the physics buffer)
attribute vec2  aVel;       // per-drop world velocity (x drift, y fall)
attribute float aDepth;     // 0 far .. 1 near — drives size, speed, brightness, softness
attribute float aSheet;     // per-drop phase: density-sheet modulation + palette seed

varying vec2  vQuad;        // x: across -1..1, y: along 0 (tail) .. 1 (head)
varying float vDepth;
varying float vSeed;        // raw per-drop phase (Rainbow / Neon seed)
varying float vSheetK;      // density-sheet factor for this drop

void main() {
    vDepth = aDepth;
    vSeed = aSheet;
    // Density comes in slow sheets rather than a flat curtain (once per drop, not per pixel).
    vSheetK = 0.72 + 0.28 * sin(uTime * 0.5 + aSheet);
    vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
    // View units per output pixel at this depth (projectionMatrix[1][1] = 1 / tan(fov/2)).
    float viewPerPx = (-mv.z) / (projectionMatrix[1][1] * 0.5 * uResolution.y);
    // Width: the slider is the old sprite size; a streak is about a fifth of that. Near
    // drops are bigger, a downpour slightly fatter.
    float wid = uSize * 0.22 * mix(0.55, 1.45, aDepth) * (1.0 + 0.25 * uIntensity) * viewPerPx;
    // Velocity into view space (the camera may be orbited by tracking), then the streak
    // length = speed x exposure, never shorter than a rounded drop.
    vec3 v3 = (modelViewMatrix * vec4(aVel.x, aVel.y, 0.0, 0.0)).xyz;
    vec2 dir = length(v3.xy) > 0.0001 ? normalize(v3.xy) : vec2(0.0, -1.0);
    float len = max(wid * 2.5, length(aVel) * uShutter * 0.04);
    vec2 across = vec2(-dir.y, dir.x);
    mv.xy += across * (position.x * wid) + dir * (position.y * len);
    gl_Position = projectionMatrix * mv;
    vQuad = vec2(position.x * 2.0, position.y + 0.5);
}
`;

const STREAK_FRAGMENT = `
uniform sampler2D uBackground;  // the composited frame under the rain (half-res copy)
uniform vec2  uResolution;
uniform float uIntensity;       // 0..1 master opacity
uniform float uColorMode;       // 0 Natural, 1 White, 2 Cyan, 3 Rainbow, 4 Neon, 5 Thermal, 6 Custom, 7 Rain Blue
uniform vec3  uCustomColor;
uniform float uRefraction;      // 0..1 how far the drop bends the background
uniform float uHaze;            // 0..1 distance haze on the far layer

varying vec2  vQuad;
varying float vDepth;
varying float vSeed;
varying float vSheetK;
${RAIN_COLOR_GLSL}
void main() {
    float ax = vQuad.x;                          // -1..1 across the streak
    float al = vQuad.y;                          // 0 tail .. 1 head
    float edge = 1.0 - abs(ax);                  // 0 at the rim, 1 on the core line
    // Near drops are out of focus: wider, softer edge. Both ends fade (motion blur).
    float soft = mix(0.16, 0.5, vDepth);
    float body = smoothstep(0.0, soft, edge);
    float caps = smoothstep(0.0, 0.22, al) * smoothstep(0.0, 0.3, 1.0 - al);
    float cover = body * caps;
    if (cover < 0.01) discard;

    // Refraction: a cylinder normal across the width bends the background sideways,
    // more for near (big) drops. Scaled to the frame height so 1080p and 4K match.
    vec2 uv = gl_FragCoord.xy / uResolution;
    float px = uRefraction * 42.0 * (0.45 + vDepth) * (uResolution.y / 1080.0);
    vec2 offs = vec2(-ax * px, (al - 0.5) * uRefraction * 8.0) / uResolution;
    vec3 bg = texture2D(uBackground, uv + offs * cover).rgb;
    float luma = dot(bg, vec3(0.299, 0.587, 0.114));

    // Specular: a thin bright line off-centre (light from the upper left) plus a rim
    // glint. Strong over dark footage, faint over bright footage.
    float spec = smoothstep(0.14, 0.0, abs(ax + 0.35)) * 0.9 + pow(1.0 - edge, 3.0) * 0.35;
    spec *= (1.0 - 0.65 * luma) * mix(0.55, 1.0, vDepth);

    vec3 col;
    float alphaK = 1.0;
    if (uColorMode < 0.5) {
        // Natural water: the bent background, a touch brighter and cooler, slightly
        // darker than a bright sky behind it (a real drop gathers and dims the light).
        col = bg * mix(1.08, 0.9, smoothstep(0.55, 0.95, luma)) * vec3(0.97, 0.99, 1.03);
        col += vec3(0.05, 0.06, 0.08) + spec * vec3(1.0);
        alphaK = 1.15;
    } else if (uColorMode > 6.5) {
        // Rain Blue (the legacy flat look), kept for old shared links.
        col = vec3(0.62, 0.78, 1.0) + spec * 0.5;
    } else {
        col = rainTint(bg, rainPalette(uColorMode, vSeed * 0.15, vDepth, uCustomColor), spec);
    }
    // Distance haze: the far layer greys toward a wet-air tone.
    col = mix(col, vec3(0.62, 0.66, 0.72), uHaze * (1.0 - vDepth) * 0.8);

    float alpha = cover * mix(0.35, 0.9, vDepth) * uIntensity * vSheetK * alphaK;
    if (alpha < 0.01) discard;
    // Straight alpha + NormalBlending: Additive onto the transparent offscreen buffer
    // accumulates almost no alpha and vanishes once drawImage-composited over the video.
    gl_FragColor = vec4(col, min(alpha, 1.0));
}
`;

// ── Splash / drip pool (THREE.Points, short-lived) ─────────────────────────
// No precision qualifiers (THREE's default highp applies to both stages) — a mismatch
// silently breaks shader linking.
const SPLASH_VERTEX = `
uniform float uSize;
attribute float aLife;   // 1 = freshly spawned … 0 = dead
attribute float aSeed;
attribute float aKind;   // 0 splash crown, 1 drip bead
varying float vLife;
varying float vSeed;
varying float vKind;
void main() {
    vLife = aLife;
    vSeed = aSeed;
    vKind = aKind;
    if (aLife <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; } // park dead
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // A crown grows as it ages; a bead stays small.
    float grow = aKind > 0.5 ? 0.6 : (0.6 + 0.9 * (1.0 - aLife));
    gl_PointSize = uSize * grow * (5.0 / max(-mv.z, 0.001));
    gl_Position = projectionMatrix * mv;
}
`;

const SPLASH_FRAGMENT = `
uniform sampler2D uBackground;
uniform vec2  uResolution;
uniform float uColorMode;   // same palette as the streaks (shared uniform object)
uniform vec3  uCustomColor;
varying float vLife;
varying float vSeed;
varying float vKind;
${RAIN_COLOR_GLSL}
void main() {
    if (vLife <= 0.0) discard;
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv) * 2.0;               // 0 centre .. 1 rim
    if (d > 1.0) discard;
    float age = 1.0 - vLife;
    float a;
    if (vKind > 0.5) {
        // Drip bead: a soft, slightly tall droplet.
        float dd = length(uv * vec2(1.35, 0.9)) * 2.0;
        a = smoothstep(1.0, 0.35, dd) * vLife;
    } else {
        // Splash crown: an expanding ring, three short spikes, a fading core.
        float ring = smoothstep(0.14, 0.0, abs(d - mix(0.2, 0.95, age))) * (1.0 - age * 0.6);
        float ang = atan(uv.y, uv.x);
        float spikes = smoothstep(0.6, 1.0, abs(sin(ang * 1.5 + vSeed * 6.2832)))
                     * smoothstep(0.95, 0.15, d) * (1.0 - age);
        float core = smoothstep(0.3, 0.0, d) * (1.0 - age);
        a = (ring * 0.7 + spikes * 0.8 + core * 0.5) * vLife;
    }
    if (a < 0.02) discard;

    vec2 suv = gl_FragCoord.xy / uResolution;
    vec2 offs = -uv * 20.0 * (uResolution.y / 1080.0) / uResolution;   // bead-shaped lens
    vec3 bg = texture2D(uBackground, suv + offs).rgb;
    float luma = dot(bg, vec3(0.299, 0.587, 0.114));
    float spec = smoothstep(0.25, 0.0, d) * (1.0 - 0.6 * luma) * 0.6;

    vec3 col;
    if (uColorMode < 0.5)      col = bg * 1.1 + vec3(0.06, 0.07, 0.09) + spec;      // Natural water
    else if (uColorMode > 6.5) col = vec3(0.78, 0.88, 1.0) + spec * 0.5;             // Rain Blue (legacy)
    else                       col = rainTint(bg, rainPalette(uColorMode, vSeed, vSeed, uCustomColor), spec);
    gl_FragColor = vec4(col, min(a, 1.0));
}
`;

export class RainSystem {
    /**
     * @param {object} THREE  three.js namespace (passed in — lazy-loaded by the host)
     * @param {THREE.Camera} camera  scene camera (used to size the rain slab to the frustum)
     * @param {object} opts  { count, colorMode, customColor }
     */
    static build(THREE, camera, opts = {}) {
        const inst = new RainSystem(THREE, camera);
        inst._build(Math.max(200, Math.min(30000, Math.round(opts.count ?? 6000))));
        if (opts.colorMode != null) inst.setColorMode(opts.colorMode);
        if (opts.customColor != null) inst.setCustomColor(opts.customColor);
        return inst;
    }

    constructor(THREE, camera) {
        this._THREE = THREE;
        this._camera = camera;
        this.points = null;       // THREE.Mesh (instanced streaks) — host adds this to its rain scene
        this._geo = null;
        this._mat = null;
        this._count = 0;
        // Uniform value objects shared by the streak AND splash materials (three reads
        // `.value` at bind time), so colour / background / resolution are written once.
        this._uShared = null;
        // Slab extents (world units) sized to the camera frustum at the z=0 plane.
        this._hw = 4; this._hh = 3.5; this._hz = 1.2;
        // CPU per-drop state (mirrors the position buffer).
        this._pos = null;         // the aPos buffer (x,y,z per drop)
        this._vel = null;         // the aVel buffer (vx,vy per drop) — written each frame
        this._vy = null;          // base fall speed per drop (depth-derived)
        this._windVar = null;     // per-drop wind response (a fixed +-8 % so the field is not a rigid sheet)
        this._burst = 0;          // transient extra speed from pulse()
        this._active = 0;         // # of moving drops this frame (= instanceCount; collision tests only these)
        this._cool = null;        // per-drop collision cooldown (Pass-through mode)
        this._vx = null;          // per-drop sideways velocity (Pass-through deflection)

        // Splash pool — host adds splashPoints to the same rain scene.
        this.splashPoints = null;
        this._splashGeo = null;
        this._splashMat = null;
        this._sPos = null;        // splash positions
        this._sVel = null;        // splash velocities
        this._sLife = null;       // splash life (0 = dead)
        this._sKind = null;       // 0 splash crown, 1 drip bead
        this._sDecay = null;      // per-particle life drain /s (splash = fast, drip = slow)
        this._sGrav = null;       // per-particle gravity (splash = high, drip = low)
        this._splashMax = 0;
        this._sCursor = 0;        // ring-buffer write head
        this._splashAlive = false; // any droplet live after the last updateSplashes()
    }

    /**
     * Size the slab to the camera frustum. Called every update(): the tracked camera dollies
     * (distance + fov change together) and tilts (lookAt from an offset), so a slab sized
     * once at build can drift into view. The margin covers the far layer (drops at -hz
     * project larger), the streak tail above each drop, and the tilt.
     */
    _computeSlab() {
        const cam = this._camera;
        const dist = (cam?.position?.length?.() ?? 5) || 5;
        const fov = (cam?.fov ?? 35) * Math.PI / 180;
        const halfH = Math.tan(fov / 2) * dist;
        const aspect = cam?.aspect || 1.6;
        this._hh = halfH * 1.7;             // vertical margin: far layer + streak tail + camera tilt
        this._hw = halfH * aspect * 1.35;   // horizontal only needs wind drift + parallax
        if (!this._hz || this._hz === 1.2) this._hz = Math.max(1.0, halfH * 0.6);   // depth is fixed at build
    }

    _build(count) {
        const THREE = this._THREE;
        this._computeSlab();
        this._count = count;
        this._uShared = {
            uBackground: { value: null },
            uResolution: { value: new THREE.Vector2(1920, 1080) },
            uColorMode: { value: 0 },
            uCustomColor: { value: new THREE.Color('#9ec5ff') },
        };
        const pos = new Float32Array(count * 3);
        const vel = new Float32Array(count * 2);
        const aDepth = new Float32Array(count);
        const aSheet = new Float32Array(count);
        this._vy = new Float32Array(count);
        this._windVar = new Float32Array(count);
        this._cool = new Float32Array(count);
        this._vx = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            // One depth seed drives everything a viewer reads as "near": z in the slab,
            // size, speed and brightness. Squared so most drops sit in the far/mid layers
            // and a few big ones fall close to the lens.
            const depth = Math.random() * Math.random();
            aDepth[i] = depth;
            pos[i * 3]     = (Math.random() - 0.5) * 2 * this._hw;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 2 * this._hh;
            pos[i * 3 + 2] = (depth * 2 - 1) * this._hz;              // near = toward the camera
            this._vy[i] = 5.0 + 7.0 * depth + Math.random() * 0.8;   // terminal velocity grows with size
            this._windVar[i] = 0.92 + Math.random() * 0.16;
            aSheet[i] = Math.random() * Math.PI * 2;
        }
        this._pos = pos; this._vel = vel;

        // Unit quad built inline (sharing another geometry's attributes and then disposing
        // it would hand the renderer buffers it is entitled to free — see BurnDissolve).
        // No uv attribute: the shaders derive everything from `position`.
        const geo = new THREE.InstancedBufferGeometry();
        geo.setIndex([0, 1, 2, 0, 2, 3]);
        geo.setAttribute('position', new THREE.Float32BufferAttribute(
            [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
        geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
        geo.setAttribute('aVel', new THREE.InstancedBufferAttribute(vel, 2));
        geo.setAttribute('aDepth', new THREE.InstancedBufferAttribute(aDepth, 1));
        geo.setAttribute('aSheet', new THREE.InstancedBufferAttribute(aSheet, 1));
        geo.instanceCount = count;

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                ...this._uShared,
                uSize: { value: 18 },
                uShutter: { value: 0.35 },
                uIntensity: { value: 0 },
                uRefraction: { value: 0.5 },
                uHaze: { value: 0.3 },
                uTime: { value: 0 },
            },
            vertexShader: STREAK_VERTEX,
            fragmentShader: STREAK_FRAGMENT,
            transparent: true,
            blending: THREE.NormalBlending,
            depthTest: false,
            depthWrite: false,
            // The quad's along-axis follows the velocity, which points DOWN, so the
            // triangle winding flips to clockwise; with the default FrontSide every
            // streak is back-face culled and nothing draws. Verified in a headless render.
            side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;          // drops live across the whole slab
        mesh.renderOrder = 999;
        this._geo = geo; this._mat = mat; this.points = mesh;

        // Generous pool — drips are long-lived (run all the way to the bottom), so a lot
        // can be on-screen at once. Spawn rate is kept low (the collision step throttles
        // drip spawns) so this comfortably holds ~2 s of drips without overwriting any mid-fall.
        this._buildSplash(Math.min(4500, Math.max(900, Math.round(count * 0.5))));
    }

    /** Pre-allocate the splash droplet pool. */
    _buildSplash(max) {
        const THREE = this._THREE;
        this._splashMax = max;
        this._sCursor = 0;
        this._sPos = new Float32Array(max * 3);
        this._sVel = new Float32Array(max * 3);
        this._sLife = new Float32Array(max);          // all 0 = dead
        this._sKind = new Float32Array(max);
        this._sDecay = new Float32Array(max);
        this._sGrav = new Float32Array(max);
        const aSeed = new Float32Array(max);
        for (let i = 0; i < max; i++) {
            aSeed[i] = Math.random();
            this._sPos[i * 3 + 1] = 1e6;              // park far away until first spawn
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this._sPos, 3));
        geo.setAttribute('aLife', new THREE.BufferAttribute(this._sLife, 1));
        geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
        geo.setAttribute('aKind', new THREE.BufferAttribute(this._sKind, 1));
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                ...this._uShared,
                uSize: { value: 13 },
            },
            vertexShader: SPLASH_VERTEX,
            fragmentShader: SPLASH_FRAGMENT,
            transparent: true,
            blending: THREE.NormalBlending,
            depthTest: false,
            depthWrite: false,
        });
        const pts = new THREE.Points(geo, mat);
        pts.frustumCulled = false;
        pts.renderOrder = 1000;                       // on top of the rain streaks
        this._splashGeo = geo; this._splashMat = mat; this.splashPoints = pts;
    }

    // ── live setters (read by the host each frame or on change) ─────────────
    setSize(px)        { if (this._mat) this._mat.uniforms.uSize.value = px; }
    /** Motion-blur exposure 0..1 (the Motion Blur slider). */
    setShutter(t)      { if (this._mat) this._mat.uniforms.uShutter.value = clamp01(t); }
    setIntensity(v)    { if (this._mat) this._mat.uniforms.uIntensity.value = clamp01(v); }
    setRefraction(v)   { if (this._mat) this._mat.uniforms.uRefraction.value = clamp01(v); }
    setHaze(v)         { if (this._mat) this._mat.uniforms.uHaze.value = clamp01(v); }
    // Shared uniforms: one write reaches both the streaks and the splash droplets.
    setColorMode(m)    { if (this._uShared) this._uShared.uColorMode.value = +m || 0; }
    setCustomColor(c)  { if (this._uShared) this._uShared.uCustomColor.value.set(c); }
    /**
     * The composited frame the drops refract, plus the output size in pixels. Call when
     * the texture is (re)created or the output size changes, not every frame.
     * @param {THREE.Texture} tex  CanvasTexture of the frame (any resolution)
     * @param {number} w  output width in px   @param {number} h  output height in px
     */
    setBackground(tex, w, h) {
        if (!this._uShared) return;
        this._uShared.uBackground.value = tex;
        this._uShared.uResolution.value.set(w, h);
    }
    /** A short kick that makes drops fall faster (Manual button / beat hit). */
    pulse(strength = 1) { this._burst = Math.max(this._burst, strength); }

    /**
     * Advance the rain one frame.
     * @param {number} dt        seconds since last frame (clamped by the host)
     * @param {number} intensity 0..1 master density/opacity from the active trigger
     * @param {number} time      seconds (gust / sheet clock)
     * @param {number} fall      fall-speed multiplier (slider)
     * @param {number} wind      steady sideways wind, signed (slider; world units / s)
     * @param {number} densityK 0..1 cap on how many drops fall (host lowers it as Fall rises,
     *                          so longer streaks do not also mean more of them)
     */
    update(dt, intensity, time, fall, wind, densityK = 1) {
        if (!this._geo) return;
        this._computeSlab();
        this.setIntensity(intensity);
        this._mat.uniforms.uTime.value = time;
        const pos = this._pos, vel = this._vel;
        const hh = this._hh, hw = this._hw;
        const burst = this._burst;
        this._burst *= 0.9;                          // decay the kick
        const fallK = (fall ?? 1) * (1 + burst * 1.5);
        // Wind: a steady drift with slow gusts shared by the whole field (real rain leans
        // as one) times a fixed per-drop response. No per-drop wiggle.
        const windK = (wind ?? 0) * (0.75 + 0.25 * Math.sin(time * 0.37));
        // Heavier intensity → more drops falling. Only the first `active` instances are
        // drawn (instanceCount), so a calm shower is thinner rather than frozen.
        const active = Math.max(1, Math.floor(this._count * clamp01(densityK) * (0.25 + 0.75 * clamp01(intensity))));
        this._active = active;
        this._geo.instanceCount = active;
        const cool = this._cool, vx = this._vx, vy = this._vy, windVar = this._windVar;
        for (let i = 0; i < active; i++) {
            const j = i * 3, k = i * 2;
            if (cool[i] > 0) cool[i] = Math.max(0, cool[i] - dt);   // Pass-through re-hit guard
            const dvx = windK * windVar[i] + vx[i];
            const dvy = -vy[i] * fallK;
            pos[j + 1] += dvy * dt;
            pos[j]     += dvx * dt;
            vel[k] = dvx; vel[k + 1] = dvy;
            vx[i] *= 0.92;                            // deflection coasts then fades (Pass-through)
            if (pos[j + 1] < -hh) {                   // wrap to the top with a new x
                // Keep the overshoot: snapping to exactly hh would line every drop that
                // crossed this frame up on one row and leave a gap of one frame's travel
                // under it (visible as a bright band + dark strip at high Fall).
                pos[j + 1] += 2 * hh;
                if (pos[j + 1] < -hh) pos[j + 1] = hh;
                pos[j]     = (Math.random() - 0.5) * 2 * hw;
                vx[i] = 0;
            }
            // keep horizontal drift inside the slab
            if (pos[j] > hw) pos[j] -= 2 * hw;
            else if (pos[j] < -hw) pos[j] += 2 * hw;
        }
        this._geo.attributes.aPos.needsUpdate = true;
        this._geo.attributes.aVel.needsUpdate = true;
    }

    // ── collision API (driven by RainCollision) ─────────────────────────────
    /** Raw rain position buffer (x,y,z per drop) — read by the collision step. */
    getPositions() { return this._pos; }
    get count() { return this._count; }
    /** # of drops actually falling this frame — only these should be collision-tested. */
    get activeCount() { return this._active; }
    /** True while any splash / drip droplet is still alive (host idle gate). */
    get hasLiveSplashes() { return this._splashAlive; }

    /** A drop "landed": send it back above the slab (spread out, so landed drops do not
     *  re-enter as one row) where it cannot re-hit. */
    recycle(i) {
        if (!this._geo) return;
        const pos = this._pos;
        pos[i * 3 + 1] = this._hh + Math.random() * this._hh * 0.3;
        pos[i * 3] = (Math.random() - 0.5) * 2 * this._hw;
        this._geo.attributes.aPos.needsUpdate = true;
    }

    /** Pass-through mode: true if drop i is free to splash again (cooldown elapsed). */
    coolReady(i) { return !this._cool || this._cool[i] <= 0; }
    /** Arm a per-drop cooldown so a drop falling THROUGH a model sparkles once, not every frame. */
    markHit(i, t = 0.28) { if (this._cool) this._cool[i] = t; }
    /** Pass-through deflection: set a drop's sideways velocity (world units/sec) so it sheets off. */
    deflect(i, v) { if (this._vx) this._vx[i] = v; }

    setSplashSize(px) { if (this._splashMat) this._splashMat.uniforms.uSize.value = px; }

    /**
     * Spawn a small crown of droplets at a world-space impact point. Low, wide and quick,
     * the way a drop hitting a surface actually breaks.
     * @param {THREE.Vector3} point  world hit position
     * @param {THREE.Vector3} normal surface normal at the hit (may be undefined)
     * @param {number} n  droplets to emit
     */
    spawnSplash(point, normal, n = 6) {
        if (!this._splashGeo) return;
        const nx = normal?.x || 0, ny = (normal?.y ?? 1), nz = normal?.z || 0;
        for (let k = 0; k < n; k++) {
            const idx = this._sCursor;
            this._sCursor = (this._sCursor + 1) % this._splashMax;
            const j = idx * 3;
            this._sPos[j] = point.x; this._sPos[j + 1] = point.y; this._sPos[j + 2] = point.z;
            const a = Math.random() * Math.PI * 2;
            const r = 0.35 + Math.random() * 0.6;       // outward speed
            const up = 0.35 + Math.random() * 0.5;      // upward speed (a crown, not a fountain)
            this._sVel[j]     = Math.cos(a) * r + nx * 0.3;
            this._sVel[j + 1] = up + ny * 0.3;
            this._sVel[j + 2] = Math.sin(a) * r + nz * 0.3;
            this._sLife[idx] = 1.0;
            this._sKind[idx] = 0;
            this._sDecay[idx] = 1 / 0.4;                // ~0.4 s burst
            this._sGrav[idx]  = 7.0;
        }
        this._markSplashDirty();
    }

    /**
     * Drip mode — emit beads that cling to the impact point and run slowly DOWN the
     * surface (slow gravity, long life, little lateral spread). Reads as water trickling
     * down the model's contour.
     */
    spawnDrip(point, n = 4) {
        if (!this._splashGeo) return;
        for (let k = 0; k < n; k++) {
            const idx = this._sCursor;
            this._sCursor = (this._sCursor + 1) % this._splashMax;
            const j = idx * 3;
            this._sPos[j] = point.x + (Math.random() - 0.5) * 0.04;
            this._sPos[j + 1] = point.y;
            this._sPos[j + 2] = point.z;
            this._sVel[j]     = (Math.random() - 0.5) * 0.10;   // barely any sideways drift
            this._sVel[j + 1] = -(0.1 + Math.random() * 0.3);   // gentle start; gravity takes over
            this._sVel[j + 2] = (Math.random() - 0.5) * 0.10;
            this._sLife[idx] = 1.0;
            this._sKind[idx] = 1;
            // Very slow life-fade so the drip stays visible the whole way down — it's removed
            // by the bottom-of-view kill in updateSplashes(), not by fading out partway.
            this._sDecay[idx] = 1 / (8.0 + Math.random() * 3.0); // ~8–11 s nominal (rarely reached)
            this._sGrav[idx]  = 2.3;                              // accelerates down the surface
        }
        this._markSplashDirty();
    }

    _markSplashDirty() {
        this._splashAlive = true;
        const a = this._splashGeo.attributes;
        a.position.needsUpdate = true; a.aLife.needsUpdate = true; a.aKind.needsUpdate = true;
    }

    /** Integrate live splash droplets (gravity + fade). Cheap no-op when none alive. */
    updateSplashes(dt) {
        if (!this._splashGeo) return;
        const pos = this._sPos, vel = this._sVel, life = this._sLife, n = this._splashMax;
        const grav = this._sGrav, decay = this._sDecay;
        let any = false;
        for (let i = 0; i < n; i++) {
            if (life[i] <= 0) continue;
            any = true;
            const j = i * 3;
            vel[j + 1] -= grav[i] * dt;
            pos[j] += vel[j] * dt;
            pos[j + 1] += vel[j + 1] * dt;
            pos[j + 2] += vel[j + 2] * dt;
            life[i] -= decay[i] * dt;
            // Retire once it has run off the bottom of the view (frees the slot for new
            // drips; long-lived drips would otherwise keep falling far below, unseen).
            if (life[i] < 0 || pos[j + 1] < -this._hh * 1.4) life[i] = 0;
        }
        this._splashAlive = any;
        if (any) {
            this._splashGeo.attributes.position.needsUpdate = true;
            this._splashGeo.attributes.aLife.needsUpdate = true;
        }
    }

    dispose() {
        this._geo?.dispose?.();
        this._mat?.dispose?.();
        this._splashGeo?.dispose?.();
        this._splashMat?.dispose?.();
        this.points = null; this._geo = null; this._mat = null; this._uShared = null;
        this.splashPoints = null; this._splashGeo = null; this._splashMat = null;
        this._pos = null; this._vel = null;
        this._vy = null; this._windVar = null; this._cool = null; this._vx = null;
        this._sPos = null; this._sVel = null; this._sLife = null; this._sKind = null;
        this._sDecay = null; this._sGrav = null;
    }
}

// ── Collision ──────────────────────────────────────────────────────────────
// Where does a drop land? Not by raycasting (THREE's raycaster has no BVH, so dozens of
// per-triangle tests a frame tank dense meshes). Instead a 96x54 occupancy / luma grid is
// refreshed every few frames from whichever "subject" is on screen, and the step scans a
// budgeted slice of the active drops against it:
//   • refreshModelSilhouette — a loaded 3D model: render the model scene alone into a tiny
//     target and read its alpha coverage (one tiny GPU pass + a 20 KB readback).
//   • refreshMediaField      — a flat image/video plane: the plane texture's luma.
//   • refreshBackgroundField — model 'none': the composited background's luma (webcam
//     subject), with an auto-polarity guess (a person is often darker than the wall).
// The host runs exactly ONE of the three per frame, so they share one throttle counter.
// The grid always holds "1 = subject" after a refresh (the polarity flip is baked in).
// The 96x54 getImageData reads below are a deliberate, tiny exception to the app's
// no-getImageData rule (about 20 KB every third frame).
const FIELD_W = 96, FIELD_H = 54, FIELD_N = FIELD_W * FIELD_H;

export class RainCollision {
    constructor(THREE) {
        this._THREE = THREE;
        this._field = null;         // Float32Array(FIELD_N): 0..1 occupancy / luma, 1 = subject
        this._invert = false;       // background path: dark-subject decision (hysteresis state)
        this._age = 0;              // refresh throttle (one path runs per frame)
        this._silRT = null;         // WebGLRenderTarget for the 3D silhouette
        this._silBuf = null;        // Uint8Array readback
        this._fieldCanvas = null;   // 96x54 scratch canvas for the luma paths
        this._fieldCtx = null;
        this._colIdx = 0;           // round-robin scan cursor over the drops
        this._vec = null;           // scratch THREE.Vector3 (projection)
        this._hit = null;           // scratch THREE.Vector3 (hit point)
        this._pv = null;            // scratch THREE.Matrix4 (projection x view, once per step)
    }

    /** Start the round-robin scan from the first drop again (host reset()). */
    resetCursor() { this._colIdx = 0; }

    _ensureField() {
        if (!this._field) this._field = new Float32Array(FIELD_N);
        return this._field;
    }

    /**
     * Draw any CanvasImageSource into the 96x54 scratch canvas and fill the field with its
     * luma. Returns false (field untouched) if the source is tainted or not ready.
     */
    _lumaGridFrom(src) {
        if (!this._fieldCanvas) {
            this._fieldCanvas = document.createElement('canvas');
            this._fieldCanvas.width = FIELD_W; this._fieldCanvas.height = FIELD_H;
            this._fieldCtx = this._fieldCanvas.getContext('2d', { willReadFrequently: true });
        }
        const field = this._ensureField();
        try {
            this._fieldCtx.drawImage(src, 0, 0, FIELD_W, FIELD_H);
            const data = this._fieldCtx.getImageData(0, 0, FIELD_W, FIELD_H).data;
            for (let i = 0; i < FIELD_N; i++) {
                const k = i * 4;
                field[i] = (0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]) / 255;
            }
        } catch (_) { return false; }
        return true;
    }

    /**
     * 3D model: render the model scene alone into a tiny target and read its coverage.
     * The rain lives in its own scene, so nothing needs hiding here.
     * @returns {boolean} true if an occupancy grid is available this frame
     */
    refreshModelSilhouette(renderer, scene, camera) {
        const THREE = this._THREE;
        if (!THREE || !renderer || !scene || !camera) return false;
        // Refresh every 2nd frame — the silhouette barely moves between frames.
        if (this._field && ++this._age % 2 !== 0) return true;
        if (!this._silRT) {
            this._silRT = new THREE.WebGLRenderTarget(FIELD_W, FIELD_H, { depthBuffer: true });
            this._silBuf = new Uint8Array(FIELD_N * 4);
        }
        const field = this._ensureField();
        const prevRT = renderer.getRenderTarget();
        renderer.setRenderTarget(this._silRT);
        renderer.render(scene, camera);            // autoClear handles the wipe
        renderer.readRenderTargetPixels(this._silRT, 0, 0, FIELD_W, FIELD_H, this._silBuf);
        renderer.setRenderTarget(prevRT);
        // Coverage (alpha) → occupancy, flipped to top-down so it matches step()'s
        // uv→row mapping (readRenderTargetPixels returns rows bottom-up).
        const buf = this._silBuf;
        for (let r = 0; r < FIELD_H; r++) {
            const src = (FIELD_H - 1 - r) * FIELD_W, dst = r * FIELD_W;
            for (let c = 0; c < FIELD_W; c++) field[dst + c] = buf[(src + c) * 4 + 3] > 12 ? 1.0 : 0.0;
        }
        return true;
    }

    /**
     * Model 'none': sample the on-screen background (already composited on ctx: webcam,
     * video, or image) into the luma grid so splashes land on the subject. Sampling the
     * final canvas auto-aligns with mirror/parallax (no coordinate fix-ups).
     * @returns {boolean} true if a luma grid is available this frame
     */
    refreshBackgroundField(ctx) {
        if (!ctx?.canvas) return !!this._field;
        if (this._field && ++this._age % 3 !== 0) return true;  // throttle
        if (!this._lumaGridFrom(ctx.canvas)) return !!this._field;
        const field = this._field;
        // Auto-polarity: a webcam subject is often DARKER than the wall behind it (so
        // "bright = subject" misses them). Compare the centre (where the subject usually
        // is) to the border; if the centre is clearly darker, treat DARK as the subject.
        let cSum = 0, cN = 0, eSum = 0, eN = 0;
        for (let r = 0; r < FIELD_H; r++) {
            const cy = r / FIELD_H;
            for (let c = 0; c < FIELD_W; c++) {
                const cx = c / FIELD_W, l = field[r * FIELD_W + c];
                if (cx > 0.28 && cx < 0.72 && cy > 0.16 && cy < 0.84) { cSum += l; cN++; }
                else if (cx < 0.14 || cx > 0.86 || cy < 0.12 || cy > 0.88) { eSum += l; eN++; }
            }
        }
        const cm = cN ? cSum / cN : 0.5, em = eN ? eSum / eN : 0.5;
        // Hysteresis so the polarity doesn't flicker when centre/border contrast is marginal.
        const diff = em - cm;                          // >0 = centre darker than border
        if (diff > 0.06) this._invert = true;          // clearly dark subject → invert
        else if (diff < 0.00) this._invert = false;    // centre brighter → normal
        // otherwise keep the previous decision
        if (this._invert) for (let i = 0; i < FIELD_N; i++) field[i] = 1 - field[i];
        return true;
    }

    /**
     * Flat image/video plane: there is no real geometry, so the "surface" is faked from the
     * media's own brightness — a drop crossing from a dark (background) cell into a bright
     * (subject) cell over a bright silhouette's top edge spawns a splash. A stylised
     * approximation, not true depth/segmentation. Refreshes every few frames.
     * @param {THREE.Object3D} modelGroup  the group holding the media plane
     * @returns {boolean} true if a usable height field is available this frame
     */
    refreshMediaField(modelGroup) {
        // Throttle first (videos change; images don't) so the traverse below runs ~every 3rd frame.
        if (this._field && ++this._age % 3 !== 0) return true;
        // Find the flat plane's source texture image (HTMLImage/Video/ImageBitmap).
        let img = null;
        modelGroup?.traverse((n) => {
            if (img || !n.isMesh) return;
            const m = Array.isArray(n.material) ? n.material[0] : n.material;
            if (m?.map?.image) img = m.map.image;
        });
        if (!img || !(img.width || img.videoWidth || img.naturalWidth)) return !!this._field;
        if (!this._lumaGridFrom(img)) return !!this._field;   // tainted / not ready: keep last grid
        return true;
    }

    /**
     * Act on drops that fall over the subject silhouette (see refresh*).
     *  • splash / drip → spawn at the silhouette's TOP edge (where rain lands).
     *  • through       → DEFLECT every over-silhouette drop sideways, away from the
     *                    silhouette's horizontal centre, so rain parts and slides off the
     *                    left/right edges and the model area stays clear.
     * @param {RainSystem} rain
     * @param {THREE.Camera} camera
     * @param {number} level       0..1 luma cutoff for "subject"
     * @param {string} mode        'through' | 'splash' | 'drip'
     * @param {number} splashSize  splash sprite size in px (scales the burst count)
     */
    step(rain, camera, level, mode, splashSize) {
        const THREE = this._THREE;
        if (!THREE || !this._field || !rain) return;
        const pos = rain.getPositions();
        if (!pos) return;
        const v = (this._vec ||= new THREE.Vector3());
        const hit = (this._hit ||= new THREE.Vector3());
        // World → clip in one matrix (Vector3.project would multiply by two per drop).
        const pv = (this._pv ||= new THREE.Matrix4()).multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        const FW = FIELD_W, FH = FIELD_H, field = this._field;
        const splashN = Math.round(4 + (splashSize / 13) * 4);
        const through = mode === 'through';
        const active = Math.max(1, rain.activeCount);
        // Drips are persistent streams that live ~2 s — spawning at the full rate would
        // churn the pool and recycle them before they fall. Throttle drip spawns hard.
        const budget = mode === 'drip' ? 7 : 70;             // max splash/drip spawns / frame
        // Pass-through deflects drops (cheap) so it scans wider; splash/drip just spawn.
        const scanMax = through ? Math.min(active, 8000) : Math.min(active, 3200);

        // Silhouette horizontal centre → drops left of it deflect left, right of it right.
        let centerU = 0.5;
        if (through) {
            let sumC = 0, cnt = 0;
            for (let r = 0; r < FH; r++) {
                const base = r * FW;
                for (let c = 0; c < FW; c++) if (field[base + c] >= level) { sumC += c; cnt++; }
            }
            if (cnt > 0) centerU = (sumC / cnt) / FW;
        }

        let i = this._colIdx, scanned = 0, did = 0;
        while (scanned < scanMax) {
            i = (i + 1 >= active) ? 0 : i + 1;
            scanned++;
            v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(pv);
            const u = v.x * 0.5 + 0.5, vv = v.y * 0.5 + 0.5;
            if (u < 0 || u > 1 || vv < 0 || vv > 1) continue;          // off-screen drop
            const col = Math.min(FW - 1, Math.max(0, (u * FW) | 0));
            const row = Math.min(FH - 1, Math.max(0, ((1 - vv) * FH) | 0)); // uv→image row (y flip)
            if (field[row * FW + col] < level) continue;               // not over the subject
            const above = field[Math.max(0, row - 1) * FW + col];      // screen-up = one row up
            if (through) {
                // Sheet off to the side: push harder the deeper the drop is over the model,
                // so it clears the centre and slides toward the nearer edge.
                const dir = (u < centerU) ? -1 : 1;
                const depth = 0.5 + Math.abs(u - centerU) * 2.0;       // ~0.5 near centre … ~1.5 at edge
                rain.deflect(i, dir * (2.2 + depth * 1.6));            // world units/sec sideways
                if (above < level && did < budget && rain.coolReady(i)) {
                    hit.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
                    rain.spawnSplash(hit, null, Math.max(2, Math.round(splashN * 0.45))); // faint contact fleck
                    rain.markHit(i, 0.2);
                    did++;
                }
                continue;
            }
            if (above >= level) continue;                              // splash/drip: top edge only
            if (did >= budget) continue;
            hit.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
            this._onHit(rain, i, hit, splashN, mode);
            did++;
        }
        this._colIdx = i;
    }

    /**
     * Apply the selected collision behaviour at an impact point:
     *  • splash  — crown up/out, drop stops (recycled to the top).
     *  • through — fleck, drop keeps FALLING through the model (cooldown stops re-fire).
     *  • drip    — beads trickle DOWN the surface, drop stops (recycled).
     */
    _onHit(rain, i, point, splashN, mode) {
        if (mode === 'drip') {
            rain.spawnDrip(point, 3);   // few beads per stream; spawn rate is throttled
            rain.recycle(i);
        } else if (mode === 'through') {
            if (rain.coolReady(i)) {
                rain.spawnSplash(point, null, Math.max(2, Math.round(splashN * 0.55)));
                rain.markHit(i, 0.28);
            }
            // no recycle — the drop continues past the model and recycles at the slab floor
        } else {
            rain.spawnSplash(point, null, splashN);
            rain.recycle(i);
        }
    }

    dispose() {
        this._silRT?.dispose?.();
        this._silRT = null; this._silBuf = null;
        this._field = null; this._fieldCanvas = null; this._fieldCtx = null;
        this._vec = null; this._hit = null; this._pv = null;
        this._colIdx = 0;
    }
}
