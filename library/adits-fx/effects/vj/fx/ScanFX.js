/**
 * ScanFX.js — "Depth Scan", the first Video Jockey FX. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * A GLSL port of the WebGPU/TSL scanning-light demo (scan_effect.md +
 * ScanningEffectWithDepthMap-tutorial), rebuilt as a GLOBAL post-pass so it
 * scans whatever Adits has already composited — source media, the active
 * effect, PnP, and the AnamorphicCamera 3D model alike.
 *
 * The core idea, unchanged from the reference: the scan is **not** a
 * screen-space line. It is a depth iso-band —
 *
 *      flow = 1 - smoothstep(0, bandWidth, abs(depth - progress))
 *
 * — so as `progress` sweeps 0→1 the lit band crawls *through* the scene,
 * catching near geometry before far geometry. A pattern (dots / edges / cross /
 * bars / motes) is multiplied by that band and screen-blended over the frame.
 *
 * PORTED, NOT COPIED: the reference is TSL running on `three/webgpu`. Adits
 * bundles the classic WebGL build of three (core/lib/three/three.module.min.js)
 * — there is no TSL, no node material, no `mx_cell_noise_float`, no
 * `blendScreen`. All of it is hand-written GLSL here, and the two baked assets
 * the demo shipped are replaced by things a live VJ tool can actually produce:
 *
 *   depth map  → derived on-GPU from softened luminance (default), with an
 *                optional uploaded map and an optional MediaPipe subject layer.
 *   edge map   → computed with a Sobel pass instead of a pre-baked `edge-2.png`.
 *
 * Depth policy (deliberate): luminance is the ONLY always-on path. It costs 9
 * texture taps of an already-resident texture and needs no model, no upload and
 * no inference. The uploaded map and the AI subject layer are strictly opt-in
 * and cost exactly nothing when off — the samplers fall back to a 1×1
 * placeholder and the branches are uniform-gated.
 *
 * NOTE: this file embeds a GLSL template literal — it is excluded from the prod
 * obfuscator in vite.config.mjs (same as SplitScreen.js / AnamorphicCamera.js).
 */

import { SHAKE_UNIFORM_NAMES, SHAKE_UNIFORMS, SHAKE_FUNCTIONS, setShakeUniforms } from './vj-shake.js';

const FRAG_SRC = /* glsl */`#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTex;        // unit 0 — the already-composited frame
uniform sampler2D uDepthTex;   // unit 1 — uploaded depth map (opt-in)
uniform sampler2D uMatteTex;   // unit 2 — MediaPipe subject matte (opt-in)

uniform vec2  uRes;
uniform float uAspect;

uniform float uProgress;       // 0..1 scan position through depth
uniform float uBand;           // iso-band half-width in depth units
uniform float uIntensity;      // mask gain before the screen blend
uniform float uTiling;         // pattern cells across the frame
uniform float uDim;            // base-image dim (makes the scan pop)
uniform float uGlow;           // wide pattern-free halo (bloom stand-in)
uniform int   uPattern;        // 0 dots, 1 edges, 2 cross, 3 bars, 4 motes
uniform vec3  uTint;

uniform float uParallax;       // depth-scaled UV displacement amount
uniform vec2  uPointer;        // -1..1
${SHAKE_UNIFORMS}

uniform int   uDepthMode;      // 0 luminance, 1 uploaded map
uniform float uDepthSoften;    // luminance blur radius (px)
uniform float uDepthContrast;
uniform float uDepthInvert;    // 0/1
uniform float uUseMatte;       // 0/1
uniform float uSubject;        // how hard the subject is pulled to the near plane

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
${SHAKE_FUNCTIONS}
float luma(vec2 uv) { return dot(texture(uTex, uv).rgb, LUMA); }

// Value-per-cell hash — stands in for the reference's mx_cell_noise_float.
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

// Motes rise and drift slightly left — the "dust in a light shaft" read. vUv is
// top-left origin, so negative Y is upward.
const vec2 MOTE_DRIFT = vec2(-0.22, -0.98);

/* One drifting field of light motes (uPattern 4).
   "cells" sets mote SCALE (cells across the aspect-corrected frame); "drift" is
   travel in FRAME units per second and is applied BEFORE the cell multiply, so
   two layers of different density still move at the same on-screen speed.

   Each occupied cell hosts a single anisotropic spark built from three terms —
   a hairline streak, a hot core, and a wide bloom — oriented radially outward
   from frame centre (the reference reads as motes streaming past the lens) with
   a hashed jitter so the field never looks combed. Brightness is raised to the
   4th power in the core/bloom weights: most motes stay faint specks and a
   handful blow out, and that ~60:1 ratio is the whole look. A single-exponent
   distribution reads as uniform glitter instead. */
float moteLayer(vec2 tUv, float cells, float drift, float seed) {
    vec2 g = (tUv + MOTE_DRIFT * (uTime * drift)) * cells + seed;
    vec2 cell = floor(g);
    vec2 f = g - cell;
    // Frame centre carried through the SAME transform as g, so the radial
    // origin stays pinned to the middle of the frame in both layers (a raw
    // 0.5*cells would drift with the field and shift per seed).
    vec2 ctr = (vec2(uAspect, 1.0) * 0.5 + MOTE_DRIFT * (uTime * drift)) * cells + seed;

    float acc = 0.0;
    // 3x3 neighbourhood — motes are longer than a cell, so they must be able to
    // bleed across cell borders instead of clipping at them.
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 o  = vec2(float(i), float(j));
            vec2 id = cell + o;
            vec2 r1 = hash22(id);
            // A mote field is mostly air — bail before any trig on empty cells.
            if (r1.x > 0.40) continue;

            vec2 r2 = hash22(id + 19.19);   // position within the cell
            vec2 r3 = hash22(id + 47.31);   // brightness / length
            vec2 d  = f - o - r2;           // fragment ↦ mote centre

            // Radial axis + jitter, built WITHOUT atan: normalize the outward
            // vector, then rotate it by the hashed angle with one complex
            // multiply. One sin/cos per mote instead of atan+sin+cos.
            vec2 rad = id + r2 - ctr;
            rad = dot(rad, rad) < 1e-4 ? vec2(1.0, 0.0) : normalize(rad);
            float jt = (r1.y - 0.5) * 1.7;
            vec2  rj = vec2(cos(jt), sin(jt));
            vec2  ax = vec2(rad.x * rj.x - rad.y * rj.y, rad.x * rj.y + rad.y * rj.x);
            vec2  q  = vec2(dot(d, ax), d.y * ax.x - d.x * ax.y);

            float bri = r3.x;
            float len = 0.16 + 0.26 * r3.y;               // half-length, cells
            float wid = len * (0.05 + 0.06 * r1.y);       // 9:1 … 20:1 hairline

            vec2 sC = vec2(q.x / (len * 0.45), q.y / (wid * 1.8));
            vec2 sB = vec2(q.x / (len * 1.35), q.y / (wid * 4.5));
            float streak = exp(-abs(q.x) / (len * 0.75)) * exp(-(q.y * q.y) / (wid * wid * 0.6));
            float core   = exp(-dot(sC, sC) * 1.7);
            float bloom  = exp(-dot(sB, sB) * 1.2);

            float hero = bri * bri; hero *= hero;
            acc += (streak * 0.50 + core * (0.12 + 3.0 * hero) + bloom * (0.02 + 1.6 * hero))
                 * (0.06 + 0.94 * bri * bri);
        }
    }
    // Normalized so a hero mote peaks near 1.0 and the faintest sit around
    // 0.015 — keeps the shared Intensity channel in the same useful range as
    // every other pattern instead of saturating the whole field at once.
    return acc * 0.19;
}

// Ported from the reference's TSL sdCross (effect3).
float sdCross(vec2 p, vec2 b, float r) {
    p = abs(p);
    p = (p.y > p.x) ? p.yx : p.xy;
    vec2 q = p - b;
    float k = max(q.y, q.x);
    vec2 w = (k > 0.0) ? q : vec2(b.y - p.x, -k);
    float d = length(max(w, 0.0));
    return (k > 0.0 ? d : -d) + r;
}

// Sobel magnitude — replaces the demo's baked edge map.
float sobel(vec2 uv) {
    vec2 t = 1.0 / uRes;
    float tl = luma(uv + vec2(-t.x,  t.y));
    float ml = luma(uv + vec2(-t.x,  0.0));
    float bl = luma(uv + vec2(-t.x, -t.y));
    float tc = luma(uv + vec2( 0.0,  t.y));
    float bc = luma(uv + vec2( 0.0, -t.y));
    float tr = luma(uv + vec2( t.x,  t.y));
    float mr = luma(uv + vec2( t.x,  0.0));
    float br = luma(uv + vec2( t.x, -t.y));
    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy =  tl + 2.0 * tc + tr - bl - 2.0 * bc - br;
    return clamp(length(vec2(gx, gy)), 0.0, 1.0);
}

/* Depth for this pixel.
   Default: softened luminance relief (9 taps, no model, no upload).
   Opt-in:  an uploaded map replaces it; an AI subject matte then pulls the
            person toward the near plane so the band peels off them cleanly. */
float depthAt(vec2 uv) {
    float d;
    if (uDepthMode == 1) {
        d = texture(uDepthTex, uv).r;
    } else {
        vec2 r = vec2(uDepthSoften) / uRes;
        float s = luma(uv);
        s += luma(uv + vec2( r.x, 0.0));
        s += luma(uv + vec2(-r.x, 0.0));
        s += luma(uv + vec2( 0.0,  r.y));
        s += luma(uv + vec2( 0.0, -r.y));
        s += luma(uv + r);
        s += luma(uv - r);
        s += luma(uv + vec2( r.x, -r.y));
        s += luma(uv + vec2(-r.x,  r.y));
        d = s / 9.0;
    }
    d = clamp((d - 0.5) * uDepthContrast + 0.5, 0.0, 1.0);
    d = mix(d, 1.0 - d, uDepthInvert);
    if (uUseMatte > 0.5) {
        float m = texture(uMatteTex, uv).a;
        d = mix(d, 1.0, m * uSubject);
    }
    return d;
}

float patternAt(vec2 uv, vec2 tUv) {
    float tiling = max(4.0, uTiling);

    if (uPattern == 1) return sobel(uv);

    if (uPattern == 3) {
        // Horizontal bars — reads clearly over busy footage.
        return smoothstep(0.44, 0.5, abs(fract(tUv.y * tiling * 0.5) - 0.5));
    }

    if (uPattern == 4) {
        // Two layers: sparse heroes over a fine dust haze, drifting at
        // different speeds. One cell size can only express one mote size, and
        // the reference frame is mostly hairline specks around a few blown-out
        // heroes — a single layer reads as either glitter or as three lamps.
        return moteLayer(tUv, tiling * 0.12, 0.026, 0.0)
             + moteLayer(tUv, tiling * 0.42, 0.014, 53.7) * 0.55;
    }

    vec2 tiled = mod(tUv * tiling, 2.0) - 1.0;

    if (uPattern == 2) {
        float d = sdCross(tiled, vec2(0.3, 0.02), 0.0);
        return 1.0 - smoothstep(0.0, 0.02, d);
    }

    // Dots (default) — cell-noise brightness × round dot, as in the reference.
    float brightness = hash21(floor(tUv * tiling * 0.5));
    return smoothstep(0.5, 0.49, length(tiled)) * brightness;
}

void main() {
    vec2 uv = vUv;
    float d = depthAt(uv);

    // Depth-scaled displacement — the reference's parallax nudge, with Shake
    // layered under it. Both move the MEDIA only; the pattern below stays
    // locked to the screen.
    vec2 mUv = clamp(shakeUv(uv, d) + d * uPointer * uParallax, 0.0, 1.0);
    vec3 base = texture(uTex, mUv).rgb * uDim;

    float flow = 1.0 - smoothstep(0.0, max(0.002, uBand), abs(d - uProgress));

    vec2 tUv = vec2(uv.x * uAspect, uv.y);
    vec3 mask = vec3(patternAt(uv, tUv) * flow * uIntensity) * uTint;

    if (uGlow > 0.0) {
        float halo = 1.0 - smoothstep(0.0, max(0.004, uBand * 4.0), abs(d - uProgress));
        mask += uTint * halo * uGlow;
    }

    // Screen blend — matches blendScreen() in the reference composition.
    vec3 final = 1.0 - (1.0 - base) * (1.0 - clamp(mask, 0.0, 1.0));
    outColor = vec4(final, 1.0);
}`;

const UNIFORM_NAMES = [
    'uTex', 'uDepthTex', 'uMatteTex', 'uRes', 'uAspect',
    'uProgress', 'uBand', 'uIntensity', 'uTiling', 'uDim', 'uGlow', 'uPattern', 'uTint',
    'uParallax', 'uPointer', ...SHAKE_UNIFORM_NAMES,
    'uDepthMode', 'uDepthSoften', 'uDepthContrast', 'uDepthInvert', 'uUseMatte', 'uSubject',
];

/** 0..1 channel value → real shader units. */
const lerp = (a, b, t) => a + (b - a) * t;

export class ScanFX {
    static KEY = 'scan';
    static LABEL = 'Depth Scan';

    /** Channels this FX exposes to VJModulator. Every one of them can be driven
     *  by auto / manual / audio / gesture / pointer without further work. */
    static CHANNELS = [
        // `progress` is a POSITION, so its audio default must be a CONTINUOUS
        // band. A `beat` envelope returns to 0 between transients, which parks
        // the scan on the far plane and reads as "nothing is happening" —
        // `beat` stays selectable for a deliberate stutter, just not default.
        { key: 'progress',  label: 'Scan Position', defaults: { source: 'auto', shape: 'ease', rate: 0.33, band: 'bass', axis: 'y' } },
        { key: 'intensity', label: 'Intensity',     defaults: { source: 'manual', manual: 0.65, band: 'vol',    axis: 'radius' } },
        { key: 'band',      label: 'Band Width',    defaults: { source: 'manual', manual: 0.18, band: 'bass',   axis: 'y' } },
        { key: 'tiling',    label: 'Pattern Scale', defaults: { source: 'manual', manual: 0.55, band: 'treble', axis: 'x' } },
        { key: 'dim',       label: 'Base Dim',      defaults: { source: 'manual', manual: 1.0,  band: 'vol',    axis: 'y' } },
    ];

    /** Drives the Pattern dropdown — the deck builds the options from this. */
    static PATTERNS = [
        { value: 0, label: 'Dots' },
        { value: 1, label: 'Edges' },
        { value: 2, label: 'Cross' },
        { value: 3, label: 'Bars' },
        { value: 4, label: 'Motes' },
    ];

    /** Declarative UI — VJDeck builds, binds and writes these with no
     *  FX-specific code. See VJDeck's PARAM DESCRIPTORS section. */
    static PARAMS = [
        { key: 'pattern', type: 'select', label: 'Pattern', options: ScanFX.PATTERNS, default: 0, cols: 2 },
        { key: 'tint',    type: 'color',  label: 'Color',   default: '#ff2d2d', cols: 2 },
    ];

    /** Randomize pool — combos that reliably look good together, so the button
     *  never lands on mud. */
    static RANDOM = {
        pattern: [0, 1, 2, 3, 4],
        tint: ['#ff2d2d', '#00e5ff', '#ff3df0', '#ffffff', '#39ff8a', '#ffb020', '#7c5cff'],
        ranges: { glow: [0.05, 0.30] },
        channels: { band: [0.10, 0.40], tiling: [0.20, 0.80] },
        shapes: ['ramp', 'ease', 'sine', 'pingpong'],
        rates: [0.16, 0.22, 0.28, 0.33, 0.45, 0.6],
    };

    constructor() {
        this._key = ScanFX.KEY;
    }

    /**
     * @param {VJPass} pass
     * @param {CanvasRenderingContext2D} ctx   output 2D context (blit target)
     * @param {HTMLCanvasElement} source       the already-composited frame
     * @param {number} w @param {number} h
     * @param {object} drive    { progress, intensity, band, tiling, dim } — each 0..1
     * @param {object} p        static params from the UI
     * @param {object} depth    { mode, mapSource, mapToken, matteSource, matteToken }
     * @param {object} pointer  { x, y } in -1..1
     * @param {object} clock    { time, dt, audio, beatClock } — `time` is seconds on
     *                          the deck's show clock: MEDIA time during offline
     *                          export (so mote drift and Shake land in a recording
     *                          at the rate they were performed at), wall clock live.
     *                          NOT derived from `progress` — that channel ping-pongs
     *                          and resets, which would stutter the drift backwards
     *                          at every cycle boundary.
     */
    render(pass, ctx, source, w, h, drive, p, depth, pointer, clock) {
        const prog = pass.buildProgram(this._key, FRAG_SRC, UNIFORM_NAMES);
        if (!prog) return false;
        const u = pass.use(this._key);
        if (!u) return false;
        const gl = pass.gl;

        // ── Textures ─────────────────────────────────────────────────────────
        pass.uploadFrame(source, 0);

        const useMap = depth.mode === 1 && !!depth.mapSource;
        if (useMap) pass.uploadAux(1, depth.mapSource, depth.mapToken);
        else pass.bindBlank(1);

        const useMatte = !!depth.matteSource;
        if (useMatte) pass.uploadAux(2, depth.matteSource, depth.matteToken);
        else pass.bindBlank(2);

        gl.uniform1i(u.uTex, 0);
        gl.uniform1i(u.uDepthTex, 1);
        gl.uniform1i(u.uMatteTex, 2);

        // ── Uniforms ─────────────────────────────────────────────────────────
        const tint = this._hexToRgb(p.tint);

        gl.uniform2f(u.uRes, w, h);
        gl.uniform1f(u.uAspect, w / Math.max(1, h));

        gl.uniform1f(u.uProgress, drive.progress);
        gl.uniform1f(u.uBand, lerp(0.004, 0.09, drive.band));
        gl.uniform1f(u.uIntensity, lerp(0.5, 14.0, drive.intensity));
        gl.uniform1f(u.uTiling, lerp(20.0, 200.0, drive.tiling));
        gl.uniform1f(u.uDim, lerp(0.25, 1.0, drive.dim));
        gl.uniform1f(u.uGlow, p.glow);
        gl.uniform1i(u.uPattern, p.pattern);
        gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);

        gl.uniform1f(u.uParallax, p.parallax);
        gl.uniform2f(u.uPointer, pointer.x, pointer.y);
        // `progress` is the channel the Control selector owns — Shake rides it.
        setShakeUniforms(gl, u, p, drive.progress, clock.time);

        gl.uniform1i(u.uDepthMode, useMap ? 1 : 0);
        gl.uniform1f(u.uDepthSoften, p.depthSoften);
        gl.uniform1f(u.uDepthContrast, p.depthContrast);
        gl.uniform1f(u.uDepthInvert, p.depthInvert ? 1 : 0);
        gl.uniform1f(u.uUseMatte, useMatte ? 1 : 0);
        gl.uniform1f(u.uSubject, p.subject);

        pass.draw();
        pass.blit(ctx, w, h);
        return true;
    }

    _hexToRgb(hex) {
        const h = (hex || '#ff2d2d').replace('#', '');
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        if (Number.isNaN(n)) return [1, 0.18, 0.18];
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    dispose() { /* all GPU state lives in the shared VJPass */ }
}
