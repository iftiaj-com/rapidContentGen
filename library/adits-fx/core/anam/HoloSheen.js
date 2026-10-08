/**
 * HoloSheen.js — HOLOCARD
 * ----------------------------------------------------------------------------
 * The trading-card "holo foil" look for AnamorphicCamera: a rainbow sheen and a
 * field of glitter that sweep across the model as it turns, blended onto the lit
 * surface with COLOR-DODGE so highlights blow toward white the way real foil does.
 *
 * This is a stop-for-stop port of simeydotme's "Pokemon Card, Holo Effect" pen
 * (codepen.io/simeydotme/pen/PrQKgo) — see Holo_card_effect_code_samples/ at the
 * repo root. That pen is three ingredients and nothing else:
 *
 *   1. `.card:before`  — a 115deg two-colour linear gradient, background-size 300%,
 *                        filter brightness(.5), opacity .5, mix-blend-mode color-dodge
 *   2. `.card:after`   — a 125deg 6-stop rainbow with holo.png and sparkles.gif
 *                        stacked on it (background-blend-mode: overlay),
 *                        background-size 160%, opacity .75, again color-dodge
 *   3. the pointer     — app.js adds NO visual layer. It only slides the two
 *                        background-positions (gradient by /1.5, sparkles by /7, so
 *                        the sparkles parallax against the gradient) and tilts the
 *                        card. On mouse-out a 12s keyframe loop drifts the same
 *                        positions on its own.
 *
 * So the layers are static art and the TILT drives their position. Here the tilt
 * comes for free from the view-space surface normal: tracking, Perspective, Spin,
 * Camera Movements and the orbit camera all turn the model, so the sheen sweeps
 * with no extra input plumbing. The pen's idle keyframe drift is layered on top as
 * a slow sine so the foil stays alive on a still, un-tracked frame.
 *
 * Injection follows core/anam/BurnDissolve.js exactly: onBeforeCompile into three's
 * standard material family, chained and idempotent, so every model keeps its full
 * PBR/Phong lighting underneath the foil. The hook sits at <dithering_fragment> —
 * the LAST include in main() — because mix-blend-mode composites over the finished
 * card artwork, not over an intermediate lighting term. BurnDissolve replaces the
 * same include but keeps the include line in its replacement, so both patches land
 * and Burning + Hologram compose.
 *
 * One deliberate deviation from the CSS: sparkles.gif does not exist in this repo
 * and a GIF cannot be sampled from GLSL, so the glitter is procedural (a jittered
 * hash grid with per-cell twinkle phase). It is ADDED as near-white specks rather
 * than `background-blend-mode: overlay`-ed — a true overlay against a mostly-black
 * sparkle layer would crush the rainbow beneath it, because CSS is compositing an
 * alpha PNG there while we only have a luminance value.
 */

// Only the standard lit families carry the include hooks below. Bespoke
// ShaderMaterials (voxel / carpet / lenticular / explode / black hole …) run their
// own pipelines and are left alone, exactly as BurnDissolve leaves them.
const PATCHABLE = /^Mesh(Standard|Physical|Phong|Lambert|Basic|Toon|Matcap)Material$/;

const HOLO_PARS_VERT = `
varying vec3 vHoloNv;
varying vec3 vHoloVp;
`;

// Injected just before <project_vertex>. The RAW `normal` attribute and
// `normalMatrix` are used rather than `transformedNormal`: MeshBasicMaterial only
// emits <defaultnormal_vertex> under #ifdef USE_ENVMAP, so transformedNormal is not
// reliably in scope across the whole PATCHABLE set. Skinning/morph normals are
// therefore ignored — irrelevant for a foil sheen, which reads off the gross
// orientation of the surface, not its per-vertex deformation.
const HOLO_VERT_HOOK = `
    vHoloNv = normalize(normalMatrix * normal);
    vHoloVp = (modelViewMatrix * vec4(transformed, 1.0)).xyz;
#include <project_vertex>`;

const HOLO_PARS_FRAG = `
varying vec3 vHoloNv;
varying vec3 vHoloVp;
uniform float uHoloActive;   // 0 = pass-through (material renders untouched)
uniform float uHoloTime;     // seconds — the pen's 12s idle keyframe drift
uniform float uHoloAmt;      // 0..1 — Intensity slider / 100
uniform vec2  uHoloRes;      // drawing-buffer size, for gl_FragCoord
uniform vec2  uHoloOrigin;   // model centre, in 0..1 screen space
uniform float uHoloSpan;     // model half-extent on screen — the CSS "element box"

// --- CSS blend modes, verbatim -------------------------------------------------
// mix-blend-mode: color-dodge. The clamp on the divisor is what stops the
// division exploding to inf where the source hits pure white.
vec3 holoDodge(vec3 b, vec3 s) {
    return min(vec3(1.0), b / max(vec3(0.004), 1.0 - s));
}
// background-blend-mode: overlay
vec3 holoOverlay(vec3 b, vec3 s) {
    return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
}

// A band that is flat at BOTH ends, peak included. The obvious
// max(0, 1 - abs(x)/w) has a derivative kink at its peak, and colour-dodge is steep
// enough near white to turn that kink into a visible crease.
float holoBump(float x, float w) {
    float t = clamp(1.0 - abs(x) / w, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

float holoHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Procedural stand-in for sparkles.gif: one candidate speck per cell, jittered off
// the lattice so the grid never reads as a grid, and gated twice — step() keeps
// most cells permanently dark, pow(,6) keeps the lit ones dark most of the time.
// Together those are what make it glitter rather than shimmer uniformly.
float holoSparkle(vec2 p, float t) {
    vec2 c = p * 120.0;
    vec2 i = floor(c), f = fract(c);
    float h = holoHash(i);
    vec2 jit = vec2(holoHash(i + 7.1), holoHash(i + 3.3));
    float star = 1.0 - smoothstep(0.0, 0.22, length(f - jit));
    float tw = 0.5 + 0.5 * sin(t * 3.1 + h * 62.8);
    return star * pow(tw, 8.0) * step(0.80, h);
}

// --- .card:after — the 125deg rainbow ------------------------------------------
// linear-gradient(125deg, #ff008450 15%, #fca40040 30%, #ffff0030 40%,
//                         #00ff8a20 60%, #00cfff40 70%, #cc4cfa50 85%)
// Colour and alpha are interpolated SEPARATELY and the alpha is returned in .a
// rather than baked into .rgb. Premultiplying here was a real bug: it left every
// stop down around 0.1-0.3, which pins holoOverlay() in its multiply branch forever,
// so the iridescent layer could only ever darken the rainbow instead of tinting it.
vec4 holoRainbow(float r) {
    vec3 S0 = vec3(1.000, 0.000, 0.518), S1 = vec3(0.988, 0.643, 0.000);
    vec3 S2 = vec3(1.000, 1.000, 0.000), S3 = vec3(0.000, 1.000, 0.541);
    vec3 S4 = vec3(0.000, 0.812, 1.000), S5 = vec3(0.800, 0.298, 0.980);
    vec3 col = S0;
    float a = 0.314;                                     // the 8-digit-hex alphas
    col = mix(col, S1, smoothstep(0.15, 0.30, r)); a = mix(a, 0.251, smoothstep(0.15, 0.30, r));
    col = mix(col, S2, smoothstep(0.30, 0.40, r)); a = mix(a, 0.188, smoothstep(0.30, 0.40, r));
    col = mix(col, S3, smoothstep(0.40, 0.60, r)); a = mix(a, 0.125, smoothstep(0.40, 0.60, r));
    col = mix(col, S4, smoothstep(0.60, 0.70, r)); a = mix(a, 0.251, smoothstep(0.60, 0.70, r));
    col = mix(col, S5, smoothstep(0.70, 0.85, r)); a = mix(a, 0.314, smoothstep(0.70, 0.85, r));
    return vec4(col, a);
}

vec3 holoApply(vec3 base) {
    // CSS sizes both gradients to the CARD, so the sheen is anchored to the model,
    // not to the frame: sp is roughly -1..1 across the model's projected box. A
    // screen-anchored version washes flat, because a model covering a quarter of the
    // frame only ever sees a near-constant slice of the ramp.
    vec2 sp = (gl_FragCoord.xy / max(uHoloRes, vec2(1.0)) - uHoloOrigin) / max(uHoloSpan, 0.02);
    sp.x *= uHoloRes.x / max(uHoloRes.y, 1.0);   // keep the CSS angles real angles

    // Interpolated normals arrive denormalized; renormalize once and reuse.
    vec3  N = normalize(vHoloNv);
    vec3  V = normalize(-vHoloVp);          // fragment -> eye, in view space
    // The pointer replacement. N.xy swings as the model turns; its z tells us how
    // edge-on the facet is, and grazing facets are where real foil flares.
    vec2  tilt  = N.xy;
    float graze = 1.0 - abs(N.z);

    // ── .card.active:before — 110deg, background-size 250% ───────────────────
    // The ACTIVE rule, not the resting one. At rest the pen's stops sit at 25%/75%
    // of a 300%-sized ramp positioned at 50%, so the visible window is the empty
    // middle third and the band barely shows; the striking prismatic split in the
    // reference stills is .card.active:before, whose stops are pulled tight to the
    // centre (48%/52%) at 250%. Our model is always in motion, so it is always
    // "active" — this is the rule that applies.
    //   linear-gradient(110deg, transparent 25%, color1 48%, color2 52%, transparent 75%)
    // CSS angles run clockwise from "to top", hence the -90 into maths convention.
    // /2.5 is the 250% background-size slice; the tilt term is the pen's own
    // (50 + (px - 50) / 1.5) background-position drive, and the sine is the drift
    // from its .animated fallback keyframe.
    float aG = radians(110.0 - 90.0);
    vec2  dirG = vec2(cos(aG), sin(aG));
    float rG = clamp(0.5 + dot(sp, dirG) / 2.5
                         + dot(tilt, dirG) * 0.42
                         + sin(uHoloTime * 0.52) * 0.16, 0.0, 1.0);
    vec3 C1 = vec3(0.000, 0.906, 1.000);   // :root --color1  rgb(0,231,255)
    vec3 C2 = vec3(1.000, 0.000, 0.906);   // :root --color2  rgb(255,0,231)
    float b1 = holoBump(rG - 0.48, 0.23);   // transparent 25% -> color1 48%
    float b2 = holoBump(rG - 0.52, 0.23);   // color2 52% -> transparent 75%
    vec3 grad = C1 * b1 + C2 * b2;
    grad = clamp((grad - 0.5) * 1.33 + 0.5, 0.0, 1.0) * 0.66;  // contrast(1.33) brightness(.66)
    grad *= 0.55 + graze * 0.45;                 // flare toward the silhouette

    // ── .card:after — 125deg, background-size 160% ───────────────────────────
    float aA = radians(125.0 - 90.0);
    vec2  dirA = vec2(cos(aA), sin(aA));
    float rA = clamp(0.5 + dot(sp, dirA) / 1.6
                         + dot(tilt, dirA) * 0.30
                         + cos(uHoloTime * 0.37) * 0.14, 0.0, 1.0);
    vec4 rainbow = holoRainbow(rA);
    // The iridescent layer between the rainbow and the glitter. The pen uses a fine
    // holo.png print, and porting that literally as a high-frequency grating was
    // wrong twice over: colour-dodge is steep enough near white to snap even a clean
    // sinusoid into hard-edged stripes, and a fixed grating does not behave like
    // foil anyway — it stays put while the card turns.
    //
    // Real holographic foil is a diffraction grating, so its hue is a smooth
    // function of the ANGLE between the eye and the surface. That is what this is.
    // Under perspective the eye vector varies across even a flat card, so there is
    // a genuine gradient at rest, and the whole spectrum sweeps as the card tilts.
    // One broad cycle, no repeats, nothing to alias.
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);   // abs(): DoubleSide back faces too
    float spec = (1.0 - ndv) * 3.0            // spectral order from the view angle
               + dot(sp, dirA) * 0.55         // most of a cycle across the face, so the
                                              // spectrum shows without ever repeating
               + uHoloTime * 0.035;           // idle drift
    vec3 iri = 0.5 + 0.42 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + spec));
    // Overlay the two full-range colours, THEN apply the gradient's own alpha, the
    // order CSS composites in. The diffraction term carries the hue; the CSS rainbow
    // is the envelope that decides how strongly each part of the sweep shows.
    vec3 after = holoOverlay(rainbow.rgb, iri) * rainbow.a * 1.7;
    // Sparkles parallax against the gradient — the pen moves them by /7 vs /1.5.
    float spark = holoSparkle(sp * 0.35 + tilt * 0.07, uHoloTime);
    after = min(vec3(1.0), after + vec3(1.0, 0.98, 0.94) * spark);

    // Intensity scales the DODGE SOURCE, not the result: a weaker source reads as
    // the foil catching less light, where lerping the output would read as a
    // translucent decal laid over the card.
    vec3 col = holoDodge(base, grad  * 0.88 * uHoloAmt);   // .active:before opacity .88
    col      = holoDodge(col,  after * 1.00 * uHoloAmt);   // .active:after  opacity 1
    return col;
}
`;

const HOLO_FRAG_HOOK = `#include <dithering_fragment>
    if (uHoloActive > 0.5) gl_FragColor.rgb = holoApply(gl_FragColor.rgb);`;

export class HoloSheen {
    constructor(THREE) {
        this.THREE = THREE;
        this.uniforms = {
            uHoloActive: { value: 0 },
            uHoloTime: { value: 0 },
            uHoloAmt: { value: 0.7 },
            uHoloRes: { value: new THREE.Vector2(1, 1) },
            uHoloOrigin: { value: new THREE.Vector2(0.5, 0.5) },
            uHoloSpan: { value: 0.5 },
        };
        // Model-local bounding-box corners, measured once per model and projected
        // every frame — see measure() / _project().
        this._corners = null;
        this._scratch = new THREE.Vector3();
        // Unique per instance and folded into every patched material's cache key
        // below — see _patchMaterial for why this must never repeat.
        this._sessionId = Math.random().toString(36).slice(2, 10);
        this._mats = [];   // patched materials, for restore()
    }

    /** How many materials the sheen is actually driving. 0 means this model has
     *  nothing the injection can reach (particle cloud, bespoke ShaderMaterial). */
    get patchedCount() { return this._mats.length; }

    /* ── Material patching ────────────────────────────────────────────────── */

    /** Inject the holo stage into every eligible material under `root`.
     *  Idempotent per material; safe to call repeatedly as the model changes. */
    patchTree(root) {
        if (!root) return;
        root.traverse((n) => {
            if (n.isInstancedMesh) return;         // host's instanced visuals — not the model
            if (n.userData.__burnSmoke) return;    // BurnDissolve's puffs
            if (!n.isMesh) return;                 // Points/Lines have no fragment hooks
            const mats = Array.isArray(n.material) ? n.material : [n.material];
            for (const m of mats) this._patchMaterial(m);
        });
    }

    _patchMaterial(material) {
        if (!material || material.userData.__holoPatched) return;
        if (!PATCHABLE.test(material.type)) return;
        material.userData.__holoPatched = true;

        const uniforms = this.uniforms;
        // Keep the originals so restore() hands the material back exactly as found
        // (another add-on — BurnDissolve, LenticularSkin — may already own these).
        const prev = material.onBeforeCompile;
        const prevKey = material.customProgramCacheKey;
        material.userData.__holoPrevOBC = prev;
        material.userData.__holoPrevKey = prevKey;
        material.onBeforeCompile = (shader, renderer) => {
            if (typeof prev === 'function') prev(shader, renderer);
            for (const k in uniforms) shader.uniforms[k] = uniforms[k];
            shader.vertexShader = HOLO_PARS_VERT + shader.vertexShader
                .replace('#include <project_vertex>', HOLO_VERT_HOOK);
            shader.fragmentShader = HOLO_PARS_FRAG + shader.fragmentShader
                .replace('#include <dithering_fragment>', HOLO_FRAG_HOOK);
        };
        // The cache key MUST change every time a material is (re)patched, or three
        // silently breaks — the same trap documented at length in BurnDissolve.js:
        // customProgramCacheKey() indexes a PER-MATERIAL program cache that restore()
        // cannot clear, and chaining the previous key alone resolves to the literal
        // source text of this closure, which is identical on every call. A second
        // patch would then hit the first session's cache entry, reuse its compiled
        // program, skip onBeforeCompile entirely, and therefore never rebind
        // materialProperties.uniforms to THIS instance's uniform objects — the shader
        // stays frozen on stale values. Folding in _sessionId forces a genuine miss.
        const sessionId = this._sessionId;
        material.customProgramCacheKey = () =>
            'holo-sheen:' + sessionId + '|' + (typeof prevKey === 'function' ? prevKey.call(material) : '');
        material.needsUpdate = true;
        this._mats.push(material);
    }

    /**
     * Undo every patch — the materials recompile back to whatever they were before
     * us, with any hooks installed ahead of us handed back intact.
     *
     * uHoloActive is zeroed FIRST and deliberately: the uniform object is shared by
     * reference with every compiled program, so even if a recompile is deferred (or
     * a stale program stays bound for a frame) the sheen immediately becomes a
     * pass-through instead of freezing on the model.
     */
    restore() {
        this.uniforms.uHoloActive.value = 0;
        for (const m of this._mats) {
            if (!m || !m.userData.__holoPatched) continue;
            delete m.userData.__holoPatched;
            m.onBeforeCompile = m.userData.__holoPrevOBC || (() => {});
            m.customProgramCacheKey = m.userData.__holoPrevKey || (() => '');
            delete m.userData.__holoPrevOBC;
            delete m.userData.__holoPrevKey;
            m.needsUpdate = true;
        }
        this._mats.length = 0;
    }

    /* ── Bounds ───────────────────────────────────────────────────────────── */

    /**
     * Cache `root`'s bounding-box corners in GROUP-LOCAL space. CSS sizes both holo
     * gradients to the card element, so the shader needs an equivalent "element box"
     * to size them to; projecting these eight points each frame gives it one that
     * tracks the model through every rotation and zoom.
     *
     * Group-local rather than world means tracking, jiggle and the spin toggles move
     * the box for free without a re-measure — only a genuine model swap needs one.
     */
    measure(root, group) {
        const { THREE } = this;
        this._corners = null;
        if (!root || !group) return;
        group.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
        const box = new THREE.Box3();
        const m = new THREE.Matrix4();
        const v = new THREE.Vector3();
        root.traverse((n) => {
            if (n.isInstancedMesh || n.userData.__burnSmoke) return;
            if (!n.isMesh || !n.geometry) return;
            if (!n.geometry.boundingBox) n.geometry.computeBoundingBox();
            const bb = n.geometry.boundingBox;
            if (!bb) return;
            m.multiplyMatrices(inv, n.matrixWorld);
            for (let k = 0; k < 8; k++) {
                v.set(k & 1 ? bb.max.x : bb.min.x,
                      k & 2 ? bb.max.y : bb.min.y,
                      k & 4 ? bb.max.z : bb.min.z).applyMatrix4(m);
                box.expandByPoint(v);
            }
        });
        if (box.isEmpty()) return;
        const c = [];
        for (let k = 0; k < 8; k++) {
            c.push(new THREE.Vector3(k & 1 ? box.max.x : box.min.x,
                                     k & 2 ? box.max.y : box.min.y,
                                     k & 4 ? box.max.z : box.min.z));
        }
        this._corners = c;
    }

    /** Project the cached box to 0..1 screen space -> uHoloOrigin / uHoloSpan.
     *  Eight points per frame, no traversal, no allocation. */
    _project(group, camera) {
        if (!this._corners || !group || !camera) return;
        group.updateMatrixWorld(true);
        const v = this._scratch;
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (let i = 0; i < 8; i++) {
            v.copy(this._corners[i]).applyMatrix4(group.matrixWorld).project(camera);
            const x = v.x * 0.5 + 0.5, y = v.y * 0.5 + 0.5;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        // A vertex behind the camera projects to nonsense; a sane clamp keeps the
        // sheen stable instead of exploding when the model swings past the lens.
        if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;
        this.uniforms.uHoloOrigin.value.set((minX + maxX) * 0.5, (minY + maxY) * 0.5);
        this.uniforms.uHoloSpan.value = Math.min(4, Math.max(0.02,
            Math.max(maxX - minX, maxY - minY) * 0.5));
    }

    /* ── Per-frame feed ───────────────────────────────────────────────────── */

    /**
     * @param {number} o.time  seconds — drives the idle drift and the twinkle
     * @param {number} o.amt   0..1 — Intensity; 0 is an exact no-op
     * @param {number} o.w     drawing-buffer width  (gl_FragCoord space)
     * @param {number} o.h     drawing-buffer height
     * @param {THREE.Object3D} o.group   model group (its projected box sizes the gradients)
     * @param {THREE.Camera}   o.camera
     */
    update({ time = 0, amt = 0.7, w = 1, h = 1, group = null, camera = null }) {
        const u = this.uniforms;
        u.uHoloActive.value = amt > 0.0005 ? 1 : 0;
        u.uHoloTime.value = time;
        u.uHoloAmt.value = amt;
        u.uHoloRes.value.set(Math.max(1, w), Math.max(1, h));
        this._project(group, camera);
    }

    dispose() {
        this.restore();
        this._corners = null;
    }
}
