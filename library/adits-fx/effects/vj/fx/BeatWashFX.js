/**
 * BeatWashFX.js — "Beat Wash", Video Jockey FX #8. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * One coloured light at a chosen point washes the whole frame, falls off with
 * distance, blows out to white at its core, and between hits the room drops to
 * a dim complementary floor with only the emitters left lit.
 *
 * This is the lighting model of a stage or a rendered showcase reel: a hidden
 * point source behind an always-on emitter (a neon ring, a crystal, a lamp),
 * with the ENVIRONMENT doing the animating. On a hit the walls and floor flare;
 * between hits they fall back while the emitter keeps its own colour. Nothing
 * else in the deck does this. Lights keeps only the emitters over a void,
 * Lightshow recolours the depth field uniformly, and Beam Bloom emits from every
 * highlight rather than from one chosen point.
 *
 * Light is MULTIPLICATIVE here, not screen-blended like the other FX:
 *
 *      lit = frame * tint * envelope * falloff * relief * power
 *
 * because real illumination is albedo times light. A screen blend would wash
 * dark surfaces the same as bright ones and lose the sense of a surface being
 * lit. A small additive haze term gives the air its glow on top.
 *
 * The temporal character (a hit that flickers and fades, a strobe burst under a
 * hump) is NOT here. It lives in VJModulator's Feel shapers, which shape the
 * Light channel before it arrives, so the same shapes are available to every
 * FX and this shader stays a pure function of its inputs.
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

uniform float uLight;          // 0..1 light level (progress channel, Feel-shaped)
uniform float uPower;          // light gain (intensity channel)
uniform float uReach;          // falloff softness: how far the light carries (band channel)
uniform float uRays;           // radial streak amount from the emitters (tiling channel)
uniform float uFloor;          // how bright the room stays with the light off (dim channel)

uniform int   uOrigin;         // 0 centre, 1 above, 2 below, 3 pointer
uniform vec3  uTint;           // the light's colour
uniform vec3  uShadow;         // what the unlit room is pulled toward
uniform float uBlowout;        // how hard the core clips to white
uniform float uRelief;         // how much luminance-depth shapes the light
uniform float uKeep;           // how much the emitters keep their own colour
uniform float uEmitThr;        // luminance above which a pixel counts as an emitter
uniform float uGlow;           // additive haze in the lit air

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
const int RAY_SAMPLES = 16;

${SHAKE_FUNCTIONS}
float luma(vec2 uv) { return dot(texture(uTex, uv).rgb, LUMA); }

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

/* Emitter key: how much this pixel is a light SOURCE in the frame itself (the
   ring, the crystal, a lamp). Soft knee so a highlight fades into being an
   emitter instead of popping. Same shape as the Lights FX key. */
float emitAt(vec2 uv) {
    return smoothstep(uEmitThr - 0.06, uEmitThr + 0.06, luma(uv));
}

vec2 originUv() {
    if (uOrigin == 1) return vec2(0.5, 0.08);
    if (uOrigin == 2) return vec2(0.5, 0.92);
    if (uOrigin == 3) return clamp(vec2(0.5) + uPointer * 0.5, 0.0, 1.0);
    return vec2(0.5);
}

void main() {
    vec2 uv = vUv;
    vec2 asp = vec2(uAspect, 1.0);
    float d = depthAt(uv);

    vec2 mUv = clamp(shakeUv(uv, d) + d * uPointer * uParallax, 0.0, 1.0);
    vec3 src = texture(uTex, mUv).rgb;

    // Distance from the light, aspect-corrected and normalised against the
    // farthest corner from THIS origin, so Reach spans the frame wherever the
    // light sits (same construction as Pulse Grid).
    vec2 org = originUv();
    vec2 farCorner = max(org, vec2(1.0) - org);
    float maxD = max(1e-4, length(farCorner * asp));
    float dist = length((uv - org) * asp) / maxD;

    // Inverse-square-ish falloff. Reach sets how quickly it dies: a small
    // Reach is a tight pool of light, a large one lights the whole room.
    float k = mix(40.0, 1.2, clamp(uReach, 0.0, 1.0));
    float fall = 1.0 / (1.0 + k * dist * dist);

    // Surfaces that read as near the light take more of it. At 0 the wash is
    // flat; at 1 it follows the frame's own relief.
    float expo = mix(1.0, 0.35 + 0.65 * d, uRelief);

    // The light on the scene: albedo times illumination.
    float env = clamp(uLight, 0.0, 1.0);
    vec3 lit = src * uTint * (env * fall * expo * uPower);

    // Core blowout: where the light is strongest it clips toward white, so the
    // colour lives in the falloff rather than at the source.
    float hot = smoothstep(0.8, 1.8, dot(lit, LUMA) * 1.6 + env * fall * uBlowout * 0.8);
    lit = mix(lit, vec3(1.0), hot * uBlowout);

    // Haze: the lit air carries some light even where there is no surface.
    lit += uTint * (env * fall * uGlow * 0.9);

    // The floor: what the room looks like with the light off. Pulled toward the
    // Shadow colour so the dark reads as a colour, not as missing picture.
    vec3 base = src * uFloor * mix(vec3(1.0), uShadow * 2.0, 0.7);

    vec3 rgb = base + lit;

    // Radial rays from the EMITTERS only: march toward the light origin and
    // gather emitter key, so streaks come from the ring or crystal and not from
    // every bright pixel in the frame. Uniform-gated: costs nothing at 0.
    if (uRays > 0.001) {
        vec2 delta = (uv - org) * (0.9 / float(RAY_SAMPLES));
        vec2 coord = uv;
        float illum = 1.0, acc = 0.0;
        for (int i = 0; i < RAY_SAMPLES; i++) {
            coord -= delta;
            acc += emitAt(clamp(coord, 0.0, 1.0)) * illum;
            illum *= 0.90;
        }
        acc = acc / float(RAY_SAMPLES) * uRays * (0.4 + 0.6 * env) * 2.2;
        rgb += uTint * acc * (1.0 - 0.6 * smoothstep(0.45, 0.95, d));
    }

    // Emitters keep their own colour whatever the wash does, which is what
    // makes the ring or the crystal read as the thing that is lit rather than
    // as a surface being washed.
    float key = emitAt(mUv);
    rgb = mix(rgb, src, key * uKeep);

    // Soft clip, matching Lightshow, so a hot core rolls off instead of banding.
    rgb = rgb / (1.0 + max(vec3(0.0), rgb - 1.0));
    outColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}`;

const UNIFORM_NAMES = [
    'uTex', 'uDepthTex', 'uMatteTex', 'uRes', 'uAspect',
    'uLight', 'uPower', 'uReach', 'uRays', 'uFloor',
    'uOrigin', 'uTint', 'uShadow', 'uBlowout', 'uRelief', 'uKeep', 'uEmitThr', 'uGlow',
    'uParallax', 'uPointer', ...SHAKE_UNIFORM_NAMES,
    'uDepthMode', 'uDepthSoften', 'uDepthContrast', 'uDepthInvert', 'uUseMatte', 'uSubject',
];

/** 0..1 channel value → real shader units. */
const lerp = (a, b, t) => a + (b - a) * t;

export class BeatWashFX {
    static KEY = 'beatwash';
    static LABEL = 'Beat Wash';

    static CHANNELS = [
        // `progress` IS the light level. Its audio default is the kick, and the
        // presets pin a Feel on it (flicker / burst), which is where this FX's
        // whole temporal character comes from: the shader is a pure function of
        // the level it is handed.
        { key: 'progress',  label: 'Light',  defaults: { source: 'audio', band: 'kick', gain: 1.0, smooth: 0.0, axis: 'radius' } },
        { key: 'intensity', label: 'Power',  defaults: { source: 'manual', manual: 0.60, band: 'kick', axis: 'radius' } },
        { key: 'band',      label: 'Reach',  defaults: { source: 'manual', manual: 0.70, band: 'bass', axis: 'y' } },
        { key: 'tiling',    label: 'Rays',   defaults: { source: 'manual', manual: 0.40, band: 'treble', axis: 'x' } },
        { key: 'dim',       label: 'Floor',  defaults: { source: 'manual', manual: 0.10, band: 'vol', axis: 'y' } },
    ];

    static ORIGINS = [
        { value: 0, label: 'Centre' },
        { value: 1, label: 'Above' },
        { value: 2, label: 'Below' },
        { value: 3, label: 'Pointer' },
    ];

    static PARAMS = [
        { key: 'origin',  type: 'select', label: 'Light From', options: BeatWashFX.ORIGINS, default: 0 },
        { key: 'tint',    type: 'color',  label: 'Light',  default: '#ff2200', cols: 2 },
        { key: 'shadow',  type: 'color',  label: 'Shadow', default: '#0a2a26', cols: 2 },
        { key: 'blowout', type: 'range',  label: 'Blowout', min: 0, max: 1, step: 0.01, default: 0.60, digits: 2,
          hint: 'How hard the core of the light clips to white. The colour then lives in the falloff, the way a real hot source reads.' },
        { key: 'relief',  type: 'range',  label: 'Relief', min: 0, max: 1, step: 0.01, default: 0.50, digits: 2,
          hint: 'How much the frame\\u2019s own relief shapes the light. At 0 the wash is flat; at 1 the parts that read as near the light catch it first.' },
        { key: 'keep',    type: 'range',  label: 'Emitters', min: 0, max: 1, step: 0.01, default: 0.80, digits: 2,
          hint: 'How much the brightest parts of the frame keep their own colour through the wash and the blackout. This is what keeps a neon sign or a lamp lit while the room goes dark.' },
        { key: 'emitThr', type: 'range',  label: 'Emitter Level', min: 0.40, max: 0.95, step: 0.01, default: 0.72, digits: 2,
          hint: 'How bright a pixel must be to count as an emitter.' },
    ];

    static RANDOM = {
        origin: [0, 0, 1, 2, 3],
        tint: ['#ff2200', '#6a9cff', '#ffb020', '#39ff8a', '#ff2d9e', '#cfe4ff', '#c98bff'],
        shadow: ['#0a2a26', '#1a1040', '#0b0b2a', '#2a0a10', '#101a0a'],
        ranges: { blowout: [0.3, 0.95], relief: [0.2, 0.9], keep: [0.5, 1.0], glow: [0.0, 0.3] },
        channels: { intensity: [0.40, 0.90], band: [0.35, 0.95], tiling: [0.0, 0.8], dim: [0.02, 0.30] },
        shapes: ['ease', 'sine'],
        rates: [0.1, 0.16, 0.25],
    };

    constructor() {
        this._key = BeatWashFX.KEY;
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

        const tint = this._hexToRgb(p.tint, [1, 0.13, 0]);
        const shadow = this._hexToRgb(p.shadow, [0.04, 0.16, 0.15]);

        gl.uniform2f(u.uRes, w, h);
        gl.uniform1f(u.uAspect, w / Math.max(1, h));

        gl.uniform1f(u.uLight, drive.progress);
        gl.uniform1f(u.uPower, lerp(0.6, 5.0, drive.intensity));
        gl.uniform1f(u.uReach, drive.band);
        gl.uniform1f(u.uRays, drive.tiling);
        gl.uniform1f(u.uFloor, lerp(0.0, 0.6, drive.dim));

        // GESTURE FOLLOW — a following hand overrides Light From with Pointer.
        gl.uniform1i(u.uOrigin, pointer.follow ? 3 : (Number(p.origin) || 0));
        gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
        gl.uniform3f(u.uShadow, shadow[0], shadow[1], shadow[2]);
        gl.uniform1f(u.uBlowout, p.blowout);
        gl.uniform1f(u.uRelief, p.relief);
        gl.uniform1f(u.uKeep, p.keep);
        gl.uniform1f(u.uEmitThr, p.emitThr);
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

    _hexToRgb(hex, fallback) {
        const h = (hex || '').replace('#', '');
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        if (!h || Number.isNaN(n)) return fallback;
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    dispose() { /* all GPU state lives in the shared VJPass */ }
}
