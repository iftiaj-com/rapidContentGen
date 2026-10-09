/**
 * TileStormFX.js — "Tile Storm", Video Jockey FX #7. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * The frame breaks into tiles and rearranges itself into a ring, a spiral, a
 * kaleidoscope or a scramble, then falls back into place.
 *
 * Everything here is an INVERSE mapping, which is the only way a rearrangement
 * like this fits in a fragment shader. Rather than moving tiles to new places,
 * each output pixel asks "under this layout, which tile am I standing on, and
 * where in the source did that tile come from?" and samples there. That means
 * no geometry, no per-tile draw calls, and a cost that does not change with the
 * tile count.
 *
 * The arrangement is not a switch, it is a DIAL. `uMorph` blends between the
 * untouched frame and the fully rearranged one, so the same shader covers a
 * still frame, a settled arrangement, and every state between. Drive that dial
 * with a kick and the picture snaps apart on the beat and reassembles as the
 * pulse decays, with no transition logic anywhere.
 *
 * A UV-space blend is a deliberate approximation of tiles flying between
 * layouts. Real flight would need per-tile geometry and a depth sort. Over the
 * fraction of a second a hit actually lasts, the two are indistinguishable, and
 * this one runs at the same cost whether there are 16 tiles or 1600.
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

uniform float uMorph;          // 0 = untouched frame, 1 = fully arranged (progress)
uniform float uSpin;           // rotation of the arrangement (intensity)
uniform float uGap;            // gutter between tiles (band)
uniform float uTiles;          // tiles across the frame (tiling)
uniform float uDim;            // base-image dim (dim)

uniform int   uLayout;         // 0 ring, 1 spiral, 2 scatter, 3 kaleido
uniform float uTwist;          // how tightly the spiral winds
uniform vec3  uTint;
uniform float uEdge;           // tinted rim on every tile
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
const float TAU = 6.2831853;

${SHAKE_FUNCTIONS}
float luma(vec2 uv) { return dot(texture(uTex, uv).rgb, LUMA); }

vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
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

/* Which SOURCE tile this fragment is standing on, under the chosen layout, plus
   where inside that tile it sits. Returns the source UV; local comes back so
   the caller can draw a gutter and a rim from the arranged tile rather than
   from the original grid. */
vec2 arrangedUv(vec2 uv, float cols, out vec2 local) {
    vec2 asp = vec2(uAspect, 1.0);
    vec2 p = (uv - 0.5) * asp;
    float maxR = length(asp) * 0.5;

    // The grid is WIDER than it is tall on any non-square frame, so column
    // count carries the aspect. Using cols on both axes would confine every
    // arrangement to a square in the left of the frame.
    float colsX = max(2.0, floor(cols * uAspect));
    vec2 gridN = vec2(colsX, cols);

    float idx;
    if (uLayout == 2) {
        // Scatter — the grid stays put and each cell borrows a random other
        // cell. Reads as the picture shuffling itself rather than moving.
        vec2 g = uv * gridN;
        vec2 cell = floor(g);
        local = fract(g);
        vec2 pick = floor(hash22(cell + 3.17) * gridN);
        return (pick + local) / gridN;
    }

    if (uLayout == 3) {
        // Kaleido — fold the angle into a wedge, so one slice of the frame is
        // mirrored all the way around.
        float wedges = max(2.0, floor(cols));
        float r = length(p) / maxR;
        float th = atan(p.y, p.x) + uSpin * TAU;
        float seg = TAU / wedges;
        th = abs(mod(th, seg * 2.0) - seg);
        vec2 q = vec2(cos(th), sin(th)) * r * maxR;
        local = fract(vec2(th / seg, r) * cols);
        return clamp(q / asp + 0.5, 0.0, 1.0);
    }

    // Ring and spiral both read the frame in polar coordinates, then map the
    // resulting slot index back into the original rectangular grid.
    float rings = max(2.0, floor(cols));
    float r = clamp(length(p) / maxR, 0.0, 0.9999);
    float th = fract((atan(p.y, p.x) / TAU) + 0.5 + uSpin);

    float slot;
    float ringIdx = floor(r * rings);
    if (uLayout == 1) slot = floor(fract(th + r * uTwist) * cols);
    else              slot = floor(th * cols);

    local = vec2(fract(uLayout == 1 ? (th + r * uTwist) * cols : th * cols),
                 fract(r * rings));

    // Slot index folded back into the rectangular source grid. The modulo
    // keeps a high ring count wrapping through the tiles instead of running
    // off the bottom and sampling nothing.
    idx = mod(ringIdx * cols + slot, colsX * cols);
    float col = mod(idx, colsX);
    float row = floor(idx / colsX);
    return (vec2(col, row) + local) / gridN;
}

void main() {
    vec2 uv = vUv;
    float d = depthAt(uv);
    float cols = max(2.0, floor(uTiles));

    vec2 local = vec2(0.5);
    vec2 arranged = arrangedUv(uv, cols, local);

    // The dial: 0 leaves the frame exactly as it arrived, 1 is the full
    // arrangement. Everything between is a real state, not a transition.
    vec2 sUv = mix(uv, clamp(arranged, 0.0, 1.0), clamp(uMorph, 0.0, 1.0));
    sUv = clamp(shakeUv(sUv, d) + d * uPointer * uParallax, 0.0, 1.0);
    vec3 base = texture(uTex, sUv).rgb * uDim;

    // Gutter and rim fade in with the morph, so a settled frame stays clean.
    float m = clamp(uMorph, 0.0, 1.0);
    vec2 e = abs(local - 0.5) * 2.0;
    float edge = max(e.x, e.y);

    if (uGap > 0.0) base *= 1.0 - smoothstep(1.0 - uGap, 1.0, edge) * m;

    vec3 lit = uTint * (smoothstep(0.72, 1.0, edge) * uEdge + uGlow) * m;
    vec3 final = 1.0 - (1.0 - base) * (1.0 - clamp(lit, 0.0, 1.0));
    outColor = vec4(final, 1.0);
}`;

const UNIFORM_NAMES = [
    'uTex', 'uDepthTex', 'uMatteTex', 'uRes', 'uAspect',
    'uMorph', 'uSpin', 'uGap', 'uTiles', 'uDim',
    'uLayout', 'uTwist', 'uTint', 'uEdge', 'uGlow',
    'uParallax', 'uPointer', ...SHAKE_UNIFORM_NAMES,
    'uDepthMode', 'uDepthSoften', 'uDepthContrast', 'uDepthInvert', 'uUseMatte', 'uSubject',
];

/** 0..1 channel value → real shader units. */
const lerp = (a, b, t) => a + (b - a) * t;

export class TileStormFX {
    static KEY = 'tilestorm';
    static LABEL = 'Tile Storm';

    static CHANNELS = [
        // `progress` is the MORPH dial, and its audio default is `kick` for the
        // same reason Pulse Grid's is: a pulse that snaps to 1 and decays is
        // already the shape of "snap apart, fall back", so the arrangement
        // needs no transition logic of its own.
        { key: 'progress',  label: 'Arrange',  defaults: { source: 'audio', band: 'kick', gain: 1.0, smooth: 0.12, axis: 'radius' } },
        { key: 'intensity', label: 'Spin',     defaults: { source: 'auto', shape: 'ramp', rate: 0.05, band: 'mid', axis: 'x' } },
        { key: 'band',      label: 'Gutter',   defaults: { source: 'manual', manual: 0.20, band: 'bass', axis: 'y' } },
        { key: 'tiling',    label: 'Tiles',    defaults: { source: 'manual', manual: 0.45, band: 'treble', axis: 'x' } },
        { key: 'dim',       label: 'Base Dim', defaults: { source: 'manual', manual: 1.00, band: 'vol', axis: 'y' } },
    ];

    static LAYOUTS = [
        { value: 0, label: 'Ring' },
        { value: 1, label: 'Spiral' },
        { value: 2, label: 'Scatter' },
        { value: 3, label: 'Kaleido' },
    ];

    static PARAMS = [
        { key: 'layout', type: 'select', label: 'Arrangement', options: TileStormFX.LAYOUTS, default: 0, cols: 2 },
        { key: 'tint',   type: 'color',  label: 'Rim Colour',  default: '#c98bff', cols: 2 },
        { key: 'twist',  type: 'range',  label: 'Twist', min: 0, max: 6, step: 0.05, default: 1.5, digits: 2,
          showIf: (p) => Number(p.layout) === 1,
          hint: 'How many turns the spiral makes from the middle to the edge.' },
        { key: 'edge',   type: 'range',  label: 'Rim', min: 0, max: 1, step: 0.01, default: 0.25, digits: 2,
          hint: 'Tinted outline on every tile. It fades in with the arrangement, so a settled frame keeps clean edges.' },
    ];

    static RANDOM = {
        layout: [0, 1, 2, 3],
        tint: ['#c98bff', '#ffffff', '#ff2d6a', '#7dd3ff', '#39ff8a', '#ffb020'],
        ranges: { twist: [0.5, 4.0], edge: [0.0, 0.6], glow: [0.0, 0.2] },
        channels: { band: [0.05, 0.40], tiling: [0.25, 0.75] },
        shapes: ['ramp', 'sine'],
        rates: [0.03, 0.05, 0.09, 0.15],
    };

    constructor() {
        this._key = TileStormFX.KEY;
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

        gl.uniform1f(u.uMorph, drive.progress);
        gl.uniform1f(u.uSpin, drive.intensity);
        gl.uniform1f(u.uGap, lerp(0.0, 0.5, drive.band));
        gl.uniform1f(u.uTiles, lerp(3.0, 26.0, drive.tiling));
        gl.uniform1f(u.uDim, lerp(0.25, 1.0, drive.dim));

        gl.uniform1i(u.uLayout, Number(p.layout) || 0);
        gl.uniform1f(u.uTwist, p.twist);
        gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
        gl.uniform1f(u.uEdge, p.edge);
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
        const h = (hex || '#c98bff').replace('#', '');
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        if (Number.isNaN(n)) return [0.79, 0.55, 1];
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    dispose() { /* all GPU state lives in the shared VJPass */ }
}
