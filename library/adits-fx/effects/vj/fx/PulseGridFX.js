/**
 * PulseGridFX.js — "Pulse Grid", Video Jockey FX #6. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * The frame is cut into cells, and every hit sends a ring travelling outward
 * from a chosen point. Cells pop, tilt or slide as the ring passes them, and
 * flash while it is on them.
 *
 * This is the deck's first effect that moves the MEDIA itself rather than
 * painting light over it. Depth Scan, Lights, Lightshow and Beam Bloom all
 * leave the frame where it is and add or recolour on top; here each cell
 * resamples its own patch of the frame from a displaced position, so the image
 * physically breaks up on the beat.
 *
 * The ring is a function of DISTANCE, not of time, which is what makes it work
 * with every control source without special-casing any of them:
 *
 *      ring = 1 - smoothstep(0, width, abs(cellDistance - wavePosition))
 *
 * Feed `wavePosition` a kick pulse and the ring snaps to the far edge and
 * collapses inward on every hit. Feed it the Auto LFO and it breathes in and
 * out steadily. Feed it the pointer and you push the ring around by hand. None
 * of that needs a branch here.
 *
 * Distance is normalised against the farthest corner FROM THE CHOSEN ORIGIN, so
 * the wave spans exactly 0..1 whether the light source is in the middle of the
 * frame or in a corner. Without that, a corner origin would only ever cover
 * half its travel before the channel ran out.
 *
 * NOTE: this file embeds a GLSL template literal — it is excluded from the prod
 * obfuscator in vite.config.mjs (same as ScanFX.js and every other VJ FX).
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

uniform float uWave;           // 0..1 ring position (progress channel)
uniform float uPop;            // how hard cells react (intensity channel)
uniform float uWidth;          // ring thickness (band channel)
uniform float uCells;          // cells across the frame (tiling channel)
uniform float uDim;            // base-image dim (dim channel)

uniform float uFlash;          // how brightly the ring lights cells
uniform float uGap;            // gutter between cells
uniform int   uOrigin;         // 0 centre, 1 top-left, 2 pointer, 3 top
uniform int   uMode;           // 0 pop, 1 tilt, 2 slide, 3 shatter
uniform vec3  uTint;
uniform float uGlow;

uniform float uParallax;
uniform vec2  uPointer;        // -1..1
${SHAKE_UNIFORMS}

uniform int   uDepthMode;
uniform float uDepthSoften;
uniform float uDepthContrast;
uniform float uDepthInvert;
uniform float uUseMatte;
uniform float uSubject;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

${SHAKE_FUNCTIONS}
float luma(vec2 uv) { return dot(texture(uTex, uv).rgb, LUMA); }

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec2 rot(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

/* Depth for this pixel. Softened luminance relief by default (9 taps, no model,
   no upload); an uploaded map replaces it, and an AI subject matte then pulls
   the person toward the near plane. */
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

vec2 originUv() {
    if (uOrigin == 1) return vec2(0.0, 0.0);
    if (uOrigin == 2) return clamp(vec2(0.5) + uPointer * 0.5, 0.0, 1.0);
    if (uOrigin == 3) return vec2(0.5, 0.0);
    return vec2(0.5);
}

void main() {
    vec2 uv = vUv;
    vec2 asp = vec2(uAspect, 1.0);
    vec2 org = originUv();

    float cells = max(2.0, uCells);
    vec2 grid = uv * asp * cells;
    vec2 cell = floor(grid);
    vec2 local = fract(grid) - 0.5;              // -0.5..0.5 within the cell
    vec2 cUv = (cell + 0.5) / (asp * cells);     // the cell's centre, in UV

    // Normalised against the farthest corner from THIS origin, so the ring
    // always travels the full 0..1 of the channel wherever the origin sits.
    vec2 farCorner = max(org, vec2(1.0) - org);
    float maxD = max(1e-4, length(farCorner * asp));
    float dist = length((cUv - org) * asp) / maxD;

    float ring = 1.0 - smoothstep(0.0, max(0.01, uWidth), abs(dist - uWave));
    ring *= ring;                                 // tighten the falloff
    float h = hash21(cell);
    float amt = ring * uPop;

    if (uMode == 0) {
        local *= 1.0 - amt * 0.55;                // pop: the cell zooms in
    } else if (uMode == 1) {
        local = rot(local, amt * (h - 0.5) * 2.4);
    } else if (uMode == 2) {
        vec2 away = cUv - org;
        away = dot(away, away) < 1e-6 ? vec2(0.0, -1.0) : normalize(away);
        local += away * asp * amt * 0.45;
    } else {
        local *= 1.0 - amt * 0.35;
        local = rot(local, amt * (h - 0.5) * 2.8);
        local += (vec2(h, hash21(cell + 7.7)) - 0.5) * amt * 0.5;
    }

    vec2 sUv = (cell + 0.5 + local) / (asp * cells);
    float d = depthAt(uv);
    sUv = clamp(shakeUv(sUv, d) + d * uPointer * uParallax, 0.0, 1.0);
    vec3 base = texture(uTex, sUv).rgb * uDim;

    // Gutter, drawn from the ORIGINAL cell coordinates so the grid stays
    // rectangular while its contents move inside it.
    if (uGap > 0.0) {
        vec2 e = abs(fract(grid) - 0.5) * 2.0;
        base *= 1.0 - smoothstep(1.0 - uGap, 1.0, max(e.x, e.y));
    }

    vec3 lit = uTint * ring * (uFlash * (0.45 + h) + uGlow);
    vec3 final = 1.0 - (1.0 - base) * (1.0 - clamp(lit, 0.0, 1.0));
    outColor = vec4(final, 1.0);
}`;

const UNIFORM_NAMES = [
    'uTex', 'uDepthTex', 'uMatteTex', 'uRes', 'uAspect',
    'uWave', 'uPop', 'uWidth', 'uCells', 'uDim',
    'uFlash', 'uGap', 'uOrigin', 'uMode', 'uTint', 'uGlow',
    'uParallax', 'uPointer', ...SHAKE_UNIFORM_NAMES,
    'uDepthMode', 'uDepthSoften', 'uDepthContrast', 'uDepthInvert', 'uUseMatte', 'uSubject',
];

/** 0..1 channel value → real shader units. */
const lerp = (a, b, t) => a + (b - a) * t;

export class PulseGridFX {
    static KEY = 'pulsegrid';
    static LABEL = 'Pulse Grid';

    static CHANNELS = [
        // `progress` is the ring's POSITION. Its audio default is `kick`
        // deliberately, unlike every other FX: an onset pulse snapping to 1 and
        // decaying is exactly a ring launching and travelling, so the pulse
        // shape IS the animation here rather than something to work around.
        { key: 'progress',  label: 'Wave',       defaults: { source: 'audio', band: 'kick', gain: 1.0, smooth: 0.10, axis: 'radius' } },
        { key: 'intensity', label: 'Pop',        defaults: { source: 'manual', manual: 0.55, band: 'kick',  axis: 'radius' } },
        { key: 'band',      label: 'Wave Width', defaults: { source: 'manual', manual: 0.30, band: 'bass',  axis: 'y' } },
        { key: 'tiling',    label: 'Cell Size',  defaults: { source: 'manual', manual: 0.40, band: 'treble', axis: 'x' } },
        { key: 'dim',       label: 'Base Dim',   defaults: { source: 'manual', manual: 1.00, band: 'vol',   axis: 'y' } },
    ];

    static ORIGINS = [
        { value: 0, label: 'Centre' },
        { value: 1, label: 'Corner' },
        { value: 2, label: 'Pointer' },
        { value: 3, label: 'Top' },
    ];

    static MODES = [
        { value: 0, label: 'Pop' },
        { value: 1, label: 'Tilt' },
        { value: 2, label: 'Slide' },
        { value: 3, label: 'Shatter' },
    ];

    static PARAMS = [
        { key: 'mode',   type: 'select', label: 'Cell Motion', options: PulseGridFX.MODES,   default: 0, cols: 2 },
        { key: 'origin', type: 'select', label: 'Wave From',   options: PulseGridFX.ORIGINS, default: 0, cols: 2 },
        { key: 'tint',   type: 'color',  label: 'Flash Colour', default: '#7dd3ff' },
        { key: 'flash',  type: 'range',  label: 'Flash', min: 0, max: 1.5, step: 0.01, default: 0.45, digits: 2,
          hint: 'How brightly a cell lights while the ring is on it. At 0 the cells only move, which reads as a shockwave through the picture rather than a light show.' },
        { key: 'gap',    type: 'range',  label: 'Gutter', min: 0, max: 0.6, step: 0.01, default: 0.10, digits: 2,
          hint: 'Dark border around every cell. A little separates the grid; a lot turns the frame into floating tiles.' },
    ];

    static RANDOM = {
        mode: [0, 1, 2, 3],
        origin: [0, 0, 1, 2, 3],
        tint: ['#7dd3ff', '#ff2d6a', '#ffffff', '#39ff8a', '#ffb020', '#c98bff'],
        ranges: { flash: [0.1, 1.0], gap: [0.0, 0.35], glow: [0.0, 0.25] },
        channels: { intensity: [0.30, 0.85], band: [0.15, 0.55], tiling: [0.20, 0.70] },
        shapes: ['ease', 'pingpong', 'sine'],
        rates: [0.2, 0.3, 0.45, 0.6],
    };

    constructor() {
        this._key = PulseGridFX.KEY;
    }

    /** Signature and responsibilities are identical across every VJ FX — see
     *  ScanFX.render() for the full argument documentation. */
    render(pass, ctx, source, w, h, drive, p, depth, pointer, clock) {
        const prog = pass.buildProgram(this._key, FRAG_SRC, UNIFORM_NAMES);
        if (!prog) return false;
        const u = pass.use(this._key);
        if (!u) return false;
        const gl = pass.gl;

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

        const tint = this._hexToRgb(p.tint);

        gl.uniform2f(u.uRes, w, h);
        gl.uniform1f(u.uAspect, w / Math.max(1, h));

        gl.uniform1f(u.uWave, drive.progress);
        gl.uniform1f(u.uPop, lerp(0.0, 1.4, drive.intensity));
        gl.uniform1f(u.uWidth, lerp(0.03, 0.55, drive.band));
        // Cell count runs high-to-low: turning the Cell Size channel UP should
        // make cells BIGGER, which means fewer of them.
        gl.uniform1f(u.uCells, lerp(48.0, 4.0, drive.tiling));
        gl.uniform1f(u.uDim, lerp(0.25, 1.0, drive.dim));

        gl.uniform1f(u.uFlash, p.flash);
        gl.uniform1f(u.uGap, p.gap);
        // GESTURE FOLLOW — a following hand overrides Wave From with Pointer (2).
        gl.uniform1i(u.uOrigin, pointer.follow ? 2 : (Number(p.origin) || 0));
        gl.uniform1i(u.uMode, Number(p.mode) || 0);
        gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
        gl.uniform1f(u.uGlow, p.glow);

        gl.uniform1f(u.uParallax, p.parallax);
        gl.uniform2f(u.uPointer, pointer.x, pointer.y);
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
        const h = (hex || '#7dd3ff').replace('#', '');
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        if (Number.isNaN(n)) return [0.49, 0.83, 1];
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    dispose() { /* all GPU state lives in the shared VJPass */ }
}
