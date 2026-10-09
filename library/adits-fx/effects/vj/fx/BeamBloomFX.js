/**
 * BeamBloomFX.js — "Beam Bloom", Video Jockey FX #5. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * Light shafts stream out of the bright parts of the frame and swell on the
 * beat, with haze between them and near geometry standing in front.
 *
 * This is the one FX in the deck that ADDS light to the scene rather than
 * recolouring what is already there. Lights and Lightshow both read the depth
 * field and repaint it; Depth Scan multiplies a pattern by an iso-band. None of
 * them cast anything. Here the frame's own highlights become emitters, which is
 * why it works on any footage without setup: a window, a lamp, a specular
 * highlight on skin, a bright sky, all of them start throwing beams.
 *
 * Method: radial (zoom) blur of a bright-pass, the standard screen-space
 * volumetric-scattering approximation. Walk from the fragment toward the light
 * origin in fixed steps, accumulate whatever is bright along the way, and decay
 * the contribution each step so distant samples fade. Occlusion is FREE and
 * needs no extra pass: a dark pixel contributes nothing, so anything in front of
 * the light already blocks it.
 *
 * Two deliberate cost decisions:
 *
 *  1. Depth is read ONCE per fragment, not inside the march. depthAt() is nine
 *     taps; calling it per step would be ~216 taps per pixel. It is used at the
 *     end to sit the beams behind near geometry, which is the only place the
 *     difference is visible.
 *  2. SAMPLES is a compile-time constant so the loop unrolls. A uniform step
 *     count would force a dynamic loop and cost more than the samples it saves.
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

uniform float uSweep;          // 0..1 light-origin position (progress channel)
uniform float uExposure;       // beam brightness (intensity channel)
uniform float uThreshold;      // how bright a pixel must be to emit (band channel)
uniform float uDecay;          // per-step falloff = beam length (tiling channel)
uniform float uDim;            // base-image dim (dim channel)

uniform float uSpread;         // how far the march reaches, in frame units
uniform float uWarmth;         // far end of a beam reddens
uniform float uOcclude;        // how hard near geometry sits in front
uniform int   uOrigin;         // 0 centre, 1 top, 2 orbit, 3 pointer
uniform int   uColorMode;      // 0 media colour, 1 tint, 2 duotone
uniform vec3  uTint;
uniform float uGlow;           // haze — a soft wash of the bright pass

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
const int SAMPLES = 24;

${SHAKE_FUNCTIONS}
float luma(vec2 uv) { return dot(texture(uTex, uv).rgb, LUMA); }

/* Depth for this pixel. Softened luminance relief by default (9 taps, no model,
   no upload); an uploaded map replaces it, and an AI subject matte then pulls
   the person toward the near plane. Identical to ScanFX's — the shared depth
   contract lives in each FX rather than in a chunk. */
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

/* What this pixel EMITS. A soft knee above the threshold rather than a hard cut,
   so a beam fades in as footage brightens instead of snapping on. */
vec3 emitAt(vec2 uv) {
    vec3 c = texture(uTex, uv).rgb;
    float w = smoothstep(uThreshold, min(1.0, uThreshold + 0.30), dot(c, LUMA));
    if (w <= 0.0) return vec3(0.0);

    vec3 col = c;
    if (uColorMode == 1) col = uTint;
    else if (uColorMode == 2) col = mix(uTint, c, 0.45);
    return col * w;
}

/* Where the light sits, in UV. Orbit is driven by the primary channel, so the
   Control selector steers it: auto sweeps it round, audio jolts it on a hit,
   pointer hands it to the mouse. */
vec2 originUv() {
    if (uOrigin == 1) return vec2(0.5, 0.06);
    if (uOrigin == 2) {
        // Divided by aspect so the light orbits a CIRCLE on screen. In raw UV
        // the same radius on both axes traces an ellipse on any non-square frame.
        float a = uSweep * 6.2831853;
        return vec2(0.5) + vec2(cos(a) / max(1.0, uAspect), sin(a)) * 0.42;
    }
    if (uOrigin == 3) return clamp(vec2(0.5) + uPointer * 0.5, 0.0, 1.0);
    return vec2(0.5);
}

void main() {
    vec2 uv = vUv;
    float d = depthAt(uv);

    vec2 mUv = clamp(shakeUv(uv, d) + d * uPointer * uParallax, 0.0, 1.0);
    vec3 base = texture(uTex, mUv).rgb * uDim;

    vec2 origin = originUv();

    // March toward the light. Step size scales with distance from the origin,
    // which is what makes the beams radiate instead of smearing uniformly.
    vec2 delta = (uv - origin) * (uSpread / float(SAMPLES));
    vec2 coord = uv;
    float illum = 1.0;
    vec3 acc = vec3(0.0);

    for (int i = 0; i < SAMPLES; i++) {
        coord -= delta;
        acc += emitAt(clamp(coord, 0.0, 1.0)) * illum;
        illum *= uDecay;
    }
    acc *= uExposure / float(SAMPLES);

    // Light through dust warms as it travels, so the far end of a beam reddens.
    float far = clamp(length(uv - origin) * 1.4, 0.0, 1.0);
    acc *= mix(vec3(1.0), vec3(1.18, 0.94, 0.70), far * uWarmth);

    // Near geometry sits in FRONT of the beams. One depth read, already paid for.
    acc *= 1.0 - uOcclude * smoothstep(0.45, 0.95, d);

    // Haze: the air between beams carries some of the same light.
    if (uGlow > 0.0) acc += emitAt(uv) * uGlow * 0.7;

    // Screen blend, matching every other FX in the deck.
    vec3 final = 1.0 - (1.0 - base) * (1.0 - clamp(acc, 0.0, 1.0));
    outColor = vec4(final, 1.0);
}`;

const UNIFORM_NAMES = [
    'uTex', 'uDepthTex', 'uMatteTex', 'uRes', 'uAspect',
    'uSweep', 'uExposure', 'uThreshold', 'uDecay', 'uDim',
    'uSpread', 'uWarmth', 'uOcclude', 'uOrigin', 'uColorMode', 'uTint', 'uGlow',
    'uParallax', 'uPointer', ...SHAKE_UNIFORM_NAMES,
    'uDepthMode', 'uDepthSoften', 'uDepthContrast', 'uDepthInvert', 'uUseMatte', 'uSubject',
];

/** 0..1 channel value → real shader units. */
const lerp = (a, b, t) => a + (b - a) * t;

export class BeamBloomFX {
    static KEY = 'beam';
    static LABEL = 'Beam Bloom';

    /** The five shared channel keys, relabelled. Keys are fixed across every FX
     *  on purpose — that is what lets a learned MIDI knob survive an FX switch. */
    static CHANNELS = [
        // `progress` steers the light ORIGIN, so its audio default is a
        // continuous band. An onset pulse returns to zero between hits, which
        // would snap the light back to its start every time and read as a
        // glitch rather than a sweep. Kick stays selectable for exactly that
        // stutter, it just is not the default.
        { key: 'progress',  label: 'Light Sweep',  defaults: { source: 'auto', shape: 'sine', rate: 0.08, band: 'bass', axis: 'x' } },
        { key: 'intensity', label: 'Beam Power',   defaults: { source: 'manual', manual: 0.62, band: 'kick',   axis: 'radius' } },
        { key: 'band',      label: 'Threshold',    defaults: { source: 'manual', manual: 0.55, band: 'vol',    axis: 'y' } },
        { key: 'tiling',    label: 'Beam Length',  defaults: { source: 'manual', manual: 0.70, band: 'treble', axis: 'x' } },
        { key: 'dim',       label: 'Base Dim',     defaults: { source: 'manual', manual: 0.85, band: 'vol',    axis: 'y' } },
    ];

    static ORIGINS = [
        { value: 0, label: 'Centre' },
        { value: 1, label: 'Above' },
        { value: 2, label: 'Orbit' },
        { value: 3, label: 'Pointer' },
    ];

    static COLOR_MODES = [
        { value: 0, label: 'Media Colour' },
        { value: 1, label: 'Tint Only' },
        { value: 2, label: 'Duotone' },
    ];

    static PARAMS = [
        { key: 'origin',    type: 'select', label: 'Light From', options: BeamBloomFX.ORIGINS,     default: 0, cols: 2 },
        { key: 'colorMode', type: 'select', label: 'Colour',     options: BeamBloomFX.COLOR_MODES, default: 0, cols: 2 },
        { key: 'tint',      type: 'color',  label: 'Beam Tint',  default: '#ffd9a0',
          showIf: (p) => Number(p.colorMode) !== 0 },
        { key: 'spread',    type: 'range',  label: 'Spread', min: 0.2, max: 2.0, step: 0.01, default: 0.85, digits: 2,
          hint: 'How far the beams reach across the frame. Long spreads look volumetric; short ones read as a tight glow around each highlight.' },
        { key: 'warmth',    type: 'range',  label: 'Warmth', min: 0, max: 1, step: 0.01, default: 0.45, digits: 2,
          hint: 'Reddens the far end of every beam, the way real light warms as it travels through dust.' },
        { key: 'occlude',   type: 'range',  label: 'Occlusion', min: 0, max: 1, step: 0.01, default: 0.60, digits: 2,
          hint: 'How firmly near objects sit in front of the beams. At 0 the light washes over everything.' },
    ];

    static RANDOM = {
        origin: [0, 1, 2, 3],
        colorMode: [0, 0, 1, 2],
        tint: ['#ffd9a0', '#9fd8ff', '#ff9ec7', '#ffffff', '#b6ff9c', '#ffb020'],
        ranges: { spread: [0.5, 1.6], warmth: [0.0, 0.9], occlude: [0.2, 0.9], glow: [0.0, 0.35] },
        channels: { band: [0.35, 0.75], tiling: [0.45, 0.92] },
        shapes: ['sine', 'ease', 'pingpong'],
        rates: [0.05, 0.08, 0.12, 0.18, 0.25],
    };

    constructor() {
        this._key = BeamBloomFX.KEY;
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

        gl.uniform1f(u.uSweep, drive.progress);
        gl.uniform1f(u.uExposure, lerp(1.5, 22.0, drive.intensity));
        // Threshold runs high-to-low: turning the channel UP should mean MORE
        // beam, and more beam means a lower bar to emit.
        gl.uniform1f(u.uThreshold, lerp(0.92, 0.20, drive.band));
        // Decay stays below 1 or the march accumulates without bound.
        gl.uniform1f(u.uDecay, lerp(0.80, 0.985, drive.tiling));
        gl.uniform1f(u.uDim, lerp(0.25, 1.0, drive.dim));

        gl.uniform1f(u.uSpread, p.spread);
        gl.uniform1f(u.uWarmth, p.warmth);
        gl.uniform1f(u.uOcclude, p.occlude);
        // GESTURE FOLLOW — a following hand overrides Light From with Pointer.
        gl.uniform1i(u.uOrigin, pointer.follow ? 3 : (Number(p.origin) || 0));
        gl.uniform1i(u.uColorMode, Number(p.colorMode) || 0);
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
        const h = (hex || '#ffd9a0').replace('#', '');
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        if (Number.isNaN(n)) return [1, 0.85, 0.63];
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    dispose() { /* all GPU state lives in the shared VJPass */ }
}
