/**
 * LightsFX.js — "Lights", Video Jockey FX #3. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * Isolates what is LIT and kills everything else. Where ScanFX sweeps a band
 * through depth and LumNetworkFX builds geometry out of bright areas, this one
 * treats luminance as a KEY: above the threshold the frame survives, below it
 * the frame is replaced by a chosen fill colour (or by transparency). The result
 * is a dark-stage light show out of any image, video or webcam feed.
 *
 * ── The one architectural departure ──────────────────────────────────────────
 * ScanFX and LumNetworkFX both end with a screen blend, `1-(1-base)*(1-mask)`,
 * which can only ADD light. LightsFX REPLACES the frame:
 *
 *     outColor = mix(voidColour, litColour, key)
 *
 * That is deliberate, not an oversight. "Everything that isn't lit goes black"
 * cannot be expressed as an additive overlay — an overlay has nothing to
 * subtract with. LightsFX therefore owns its whole output. It still layers
 * correctly with the rest of the pipeline because it runs in the same slot as
 * the other two: after the global grades, before Fisheye / Cinema Frames.
 *
 * ── The key ──────────────────────────────────────────────────────────────────
 *     key = smoothstep(thr - feather, thr + feather, luma)
 *
 * The feather curve is ported from core/ColorMask.js:165-166 (its chroma-key
 * edge), NOT imported from it — ColorMask is a WebGPU pass keyed on raw media at
 * a different pipeline stage; only the maths is worth sharing.
 *
 * Feather lives on the `band` CHANNEL rather than on a static slider, so it can
 * be driven by audio / MIDI / gesture like everything else on the deck.
 * Feathering the light edge to the kick drum is the single most useful thing
 * this effect does live, and it would be impossible as a fixed param.
 *
 * ── Hue Focus ────────────────────────────────────────────────────────────────
 * An optional second gate multiplies into the key so only lights of a chosen
 * colour survive — just the blue wash, just the red lasers. The hue test
 * NORMALIZES both colours first:
 *
 *     hueGate = 1 - smoothstep(tol, tol+e, distance(normalize(rgb), normalize(focus)))
 *
 * Normalizing divides brightness out, so it matches a hue at ANY intensity. This
 * is an improvement on ColorMask's raw RGB distance, which conflates the two and
 * would drop a light as it dims.
 *
 * ── The shared sliders earn their keep ───────────────────────────────────────
 * Depth Contrast and Depth Invert are not decorative here — they shape the KEY:
 * contrast hardens the light/dark decision, and invert flips it so the effect
 * isolates SHADOW instead of light. The subject matte, when enabled,
 * force-lights the tracked person regardless of how dim they actually are.
 *
 * ── Eight modes ──────────────────────────────────────────────────────────────
 *   0 Void        the key alone — clean isolation over the fill
 *   1 Spectral    luminance → 3-stop palette ramp, quantized into bands
 *   2 Bloom Haze  16-tap golden-angle scatter — volumetric fog around lights
 *   3 Light Rain  lit pixels drip downward in columns with quantized beads
 *   4 God Rays    24-tap radial scattering from a pointer/gesture-placed origin
 *   5 Motes       floating quantized dust squares
 *   6 Contour     analytic iso-line of the light boundary, rim only
 *   7 Ignite      the threshold itself sweeps, so lights turn on in brightness order
 *
 * Every mode is a single stateless pass. NO frame feedback: VJPass renders to the
 * default framebuffer with `preserveDrawingBuffer:false`, and feedback would
 * render *differently* during Adits' offline post-process, which re-renders
 * frames out of realtime (same reasoning as LumNetworkFX.js:61-65).
 *
 * Motes are sized in PIXELS against a screen-space grid, never in cell units —
 * LumNetworkFX.js:66-70 documents a mote layer that had to be cut because
 * cell-sized sprites spanned several cells and tiled into continuous streaks.
 *
 * Only one mode's loop runs per frame (the branch is on a uniform, so it is
 * wave-coherent), which caps the worst case at ~24 extra taps per pixel. Loop
 * bounds are compile-time constants so the driver can unroll them.
 *
 * NOTE: this file embeds a GLSL template literal — it is excluded from the prod
 * obfuscator in vite.config.mjs (same as ScanFX.js / LumNetworkFX.js).
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

// ── Driven channels (VJModulator) ────────────────────────────────────────────
uniform float uProgress;       // light sweep — ignite threshold, drip fall, ray spin
uniform float uGain;           // exposure of the lit pass
uniform float uFeather;        // softness of the key edge  ← the feather control
uniform float uDensity;        // drip columns · mote count · ramp bands
uniform float uVoid;           // how much unlit frame survives (0 = pure void)

// ── Static params (UI) ───────────────────────────────────────────────────────
uniform float uThreshold;      // how bright a pixel must be to count as "lit"
uniform float uSpread;         // haze radius · drip length · ray reach · mote size
uniform int   uMode;           // 0..7, see header
uniform int   uPalette;        // 0 true colour, 1 custom, 2..7 built-in ramps
uniform vec3  uFill;           // the void colour
uniform vec3  uTint;           // hot / highlight colour
uniform vec3  uAccent;         // shadow / low colour of the ramp
uniform float uGlow;           // bloom off the hottest areas
uniform float uParallax;       // depth-scaled UV displacement
uniform vec2  uPointer;        // -1..1 — places the god-ray origin
uniform float uTransparent;    // 0/1 — emit a<1 in the void instead of the fill

// ── Hue Focus ────────────────────────────────────────────────────────────────
uniform float uHueFocus;       // 0/1
uniform vec3  uFocusColor;
uniform float uHueTol;

// ── Depth ────────────────────────────────────────────────────────────────────
uniform int   uDepthMode;      // 0 luminance, 1 uploaded map
uniform float uDepthSoften;    // luminance blur radius (px)
uniform float uDepthContrast;  // hardens the key decision
uniform float uDepthInvert;    // 0/1 — flips the key to isolate SHADOW
uniform float uUseMatte;       // 0/1
uniform float uSubject;
${SHAKE_UNIFORMS}
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
${SHAKE_FUNCTIONS}

/* Key constants, resolved once in main() so the mode passes can re-key at
   offset UVs without re-deriving them 24 times. */
float gThr;
float gFeather;

float luma(vec2 uv) { return dot(texture(uTex, uv).rgb, LUMA); }

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

/** Antialiased stroke in PIXEL units — resolution-independent line weight. */
float strokePx(float dpx, float halfW) {
    return 1.0 - smoothstep(halfW - 1.0, halfW + 1.0, abs(dpx));
}

// ── Depth / key shaping ──────────────────────────────────────────────────────

/** Contrast + invert, shared by the key and the palette lookup. Same shaping as
 *  LumNetworkFX's grade(), minus the matte term — the matte is applied to the
 *  KEY directly instead, where "force-light the subject" is what it should mean. */
float shape(float d) {
    d = clamp((d - 0.5) * uDepthContrast + 0.5, 0.0, 1.0);
    return mix(d, 1.0 - d, uDepthInvert);
}

/** Softened plate depth — 9 taps, used ONCE per pixel for the base parallax. */
float plateDepth(vec2 uv) {
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
    return shape(d);
}

/** 5-tap softened luminance — the field the key is cut from. Blurring first is
 *  what stops video noise from shredding the light edge into sparkle. */
float softLuma(vec2 uv) {
    vec2 r = vec2(uDepthSoften + 1.0) / uRes;
    float s = luma(uv) * 2.0;
    s += luma(uv + vec2(r.x, 0.0));
    s += luma(uv - vec2(r.x, 0.0));
    s += luma(uv + vec2(0.0, r.y));
    s += luma(uv - vec2(0.0, r.y));
    return s / 6.0;
}

/** Chroma-only match. Normalizing divides brightness out, so a hue is matched at
 *  ANY intensity — a blue light stays keyed as it dims, which a raw RGB distance
 *  would drop. */
float hueGate(vec3 c) {
    float d = distance(normalize(c + 1e-4), normalize(uFocusColor + 1e-4));
    return 1.0 - smoothstep(uHueTol, uHueTol + max(0.03, gFeather), d);
}

/** ONE tap that answers both questions the mode passes ask: what colour is here,
 *  and is it lit. Deliberately single-tap (not softLuma) — the loops run up to 24
 *  iterations and a 5-tap key would cost 120 taps per pixel. */
vec4 sampleLit(vec2 uv) {
    vec3  c = texture(uTex, uv).rgb;
    float k = smoothstep(gThr - gFeather, gThr + gFeather, shape(dot(c, LUMA)));
    if (uHueFocus > 0.5) k *= hueGate(c);
    return vec4(c, k);
}

// ── Palette ──────────────────────────────────────────────────────────────────

/** Three-stop ramp: shadow → mid → hot. Palette 2 ("Wreck") is lifted from the
 *  reference footage — navy through lavender to gold is what makes a dark plate
 *  read as lit rather than as merely underexposed. */
vec3 paletteColor(float t, vec3 src) {
    if (uPalette == 0) return src;
    vec3 c0, c1, c2;
    if      (uPalette == 1) { c0 = uAccent;                  c1 = mix(uAccent, uTint, 0.5); c2 = uTint; }
    else if (uPalette == 2) { c0 = vec3(0.04, 0.09, 0.22);   c1 = vec3(0.55, 0.53, 0.86);   c2 = vec3(1.00, 0.78, 0.30); }
    else if (uPalette == 3) { c0 = vec3(0.18, 0.02, 0.02);   c1 = vec3(0.95, 0.35, 0.05);   c2 = vec3(1.00, 0.95, 0.80); }
    else if (uPalette == 4) { c0 = vec3(0.02, 0.06, 0.20);   c1 = vec3(0.20, 0.70, 0.95);   c2 = vec3(0.92, 0.99, 1.00); }
    else if (uPalette == 5) { c0 = vec3(0.02, 0.12, 0.06);   c1 = vec3(0.45, 0.90, 0.15);   c2 = vec3(0.95, 1.00, 0.45); }
    else if (uPalette == 6) { c0 = vec3(0.16, 0.07, 0.01);   c1 = vec3(0.95, 0.60, 0.12);   c2 = vec3(1.00, 0.93, 0.72); }
    else                    { c0 = vec3(0.10, 0.01, 0.16);   c1 = vec3(0.85, 0.10, 0.65);   c2 = vec3(1.00, 0.80, 0.95); }
    t = clamp(t, 0.0, 1.0);
    return t < 0.5 ? mix(c0, c1, t * 2.0) : mix(c1, c2, (t - 0.5) * 2.0);
}

// ═══ MODE 2 — Bloom Haze ═════════════════════════════════════════════════════
// A golden-angle spiral rather than a box or a ring: 16 taps placed at
// r = sqrt(i/n) are uniformly distributed over the DISC, so a 16-tap scatter
// looks like fog instead of like 16 ghosts. Sampled un-keyed by the centre pixel
// so the haze bleeds OUT into the void — that outward bleed is the whole read.
vec3 hazePass(vec2 uv) {
    float rad = mix(0.006, 0.070, uSpread);
    vec3  acc = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float a  = fi * 2.39996;
        float r  = sqrt((fi + 0.5) / 16.0);
        vec2  o  = vec2(cos(a), sin(a)) * (r * rad) * vec2(1.0, uAspect);
        vec4  s  = sampleLit(uv + o);
        float w  = 1.0 - r * 0.85;
        acc  += s.rgb * s.a * w;
        wsum += w;
    }
    return acc / max(1e-4, wsum);
}

// ═══ MODE 3 — Light Rain ═════════════════════════════════════════════════════
// vUv is TOP-left origin, so "up" is -y: each pixel looks UPWARD for lit matter
// and inherits it with distance decay, which reads as that matter dripping DOWN.
//
// Three rules keep this a rain of light rather than a dither over the frame:
//
//  1. Rain falls from a light INTO DARKNESS. Only matter that is more lit above
//     than at this pixel contributes (the excess term). Without that, a bright sky
//     drips onto itself and every pixel below it inherits full brightness, so
//     the whole frame becomes one washed field - which is exactly the fault
//     this replaced.
//  2. The bead phase is quantised to four offsets shared across columns. A
//     fully random phase per column, at a bead pitch of a few pixels, is a
//     checkerboard, not dashes.
//  3. Each streak tapers inside its column, so snapping x to a column gives thin
//     parallel lines instead of stair-stepped bars of the source image.
vec3 rainPass(vec2 uv) {
    float len   = mix(0.05, 0.42, uSpread);
    float cols  = mix(40.0, 220.0, uDensity);
    float ci    = floor(uv.x * cols);
    float cx    = (ci + 0.5) / cols;
    float jit   = hash21(vec2(ci, 7.0));
    float phase = floor(jit * 4.0) * 0.25;
    float speed = 0.10 + 0.55 * uProgress;
    float fall  = uTime * speed * (0.8 + 0.4 * jit);
    float beadF = mix(8.0, 28.0, uDensity);

    float hereL = sampleLit(uv).a;

    vec3 acc = vec3(0.0);
    for (int i = 1; i <= 20; i++) {
        float t = float(i) / 20.0;
        vec2  p = vec2(cx, uv.y - t * len * (0.7 + 0.6 * jit));
        if (p.y >= 0.0) {
            vec4  s = sampleLit(p);
            float excess = max(0.0, s.a - hereL);
            float decay  = exp(-t * 3.0);
            acc = max(acc, s.rgb * excess * decay);
        }
    }

    // Dashes travelling down the column on a rhythm the neighbours share.
    float bead = smoothstep(0.30, 0.42, fract((uv.y - fall + phase) * beadF));
    // Taper toward the column edges so the streak is a line, not a bar.
    float fx   = abs(fract(uv.x * cols) - 0.5) * 2.0;
    float thin = 1.0 - smoothstep(0.35, 0.9, fx);
    return acc * bead * thin;
}

// ═══ MODE 4 — God Rays ═══════════════════════════════════════════════════════
// Textbook radial scattering: march from the pixel back toward the light origin
// accumulating lit matter with exponential decay. The origin rides uPointer, so
// mouse or hand tracking sweeps the shafts across the room live.
vec3 raysPass(vec2 uv) {
    vec2  origin = vec2(0.5) + uPointer * 0.45;
    vec2  delta  = (uv - origin) * (mix(0.30, 1.0, uSpread) / 24.0);
    vec2  p      = uv;
    vec3  acc    = vec3(0.0);
    float decay  = 1.0;
    for (int i = 0; i < 24; i++) {
        p -= delta;
        vec4 s = sampleLit(p);
        acc   += s.rgb * s.a * decay;
        decay *= 0.93;
    }
    return acc / 24.0;
}

// ═══ MODE 5 — Motes ══════════════════════════════════════════════════════════
// The grid is sized in PIXELS (uv * uRes / cellPx), never in cell units — see
// the header note. Square, unfiltered sprites on purpose: the reference dust is
// quantized, and a soft round bokeh reads as lens dirt instead.
vec3 motesPass(vec2 uv) {
    float cellPx = mix(34.0, 12.0, uSpread);
    vec2  g  = (uv * uRes) / cellPx;
    g.y     -= uTime * (0.12 + 0.55 * uProgress);
    vec2  gi = floor(g);
    vec2  gf = g - gi;

    float keep = step(hash21(gi), mix(0.03, 0.30, uDensity));
    vec2  c    = hash22(gi + 3.7) * 0.6 + 0.2;
    float sz   = mix(0.08, 0.26, hash21(gi + 9.1));
    float m    = keep * (1.0 - step(sz, max(abs(gf.x - c.x), abs(gf.y - c.y))));

    // A floor of 0.3 lets motes drift through the void as well as over lit
    // matter — pinning them to the key would strand them all on the subject.
    float near = sampleLit(uv).a;
    float bri  = mix(0.35, 1.0, hash21(gi + 17.3));
    return uTint * m * bri * (0.3 + 0.7 * near);
}

// ═══ MODE 6 — Contour ════════════════════════════════════════════════════════
// Analytic distance to the light iso-line via screen-space derivatives,
// d_px = f / |grad f|, giving an exactly N-pixel rim no matter how steep the
// falloff is. Cheaper and far cleaner than thresholding a blur. (Same technique
// as LumNetworkFX.js:411-413; the derivative sits in uniform control flow, so it
// is well-defined.)
vec3 contourPass(float sig) {
    float dpx = sig / max(1e-5, length(vec2(dFdx(sig), dFdy(sig))));
    return uTint * strokePx(dpx, mix(0.8, 5.0, uSpread));
}

void main() {
    vec2 uv = vUv;

    // Depth is 9 taps and its ONLY consumer is the displacement below — unlike
    // ScanFX and LumNetworkFX, where depth feeds the effect itself and has to be
    // paid every frame. Shake already early-outs at uShake <= 0, and the parallax
    // term is zero whenever the pointer is centred (which is every frame the
    // mouse is off the canvas, and the whole offline export). Skipping it there
    // is byte-identical — pd would have been multiplied by zero — and cuts the
    // cheap modes from 15 taps per pixel to 6. Uniform control flow, so the
    // branch is wave-coherent.
    bool needsDepth = uShake > 0.0 || (uParallax > 0.0 && dot(abs(uPointer), vec2(1.0)) > 0.0);
    float pd = needsDepth ? plateDepth(uv) : 0.0;

    // Shake + parallax move the MEDIA only; the overlay stays locked to the
    // screen, exactly as uParallax already behaves in the other two FX.
    vec2  mUv = clamp(shakeUv(uv, pd) + pd * uPointer * uParallax, 0.0, 1.0);

    gFeather = max(0.004, uFeather * 0.45 + 0.004);
    // Ignite sweeps the threshold from above the hottest pixel down past the
    // darkest, so the frame lights up in strict brightness order.
    gThr = (uMode == 7) ? mix(uThreshold + 0.55, uThreshold - 0.35, uProgress) : uThreshold;
    gThr = clamp(gThr, -0.2, 1.2);

    vec3  src = texture(uTex, mUv).rgb;
    float L   = shape(softLuma(mUv));
    float sig = L - gThr;

    // Contour draws the light BOUNDARY over the bare void and no fill at all, so
    // it never needs a key — skipping it here also skips the matte tap, which is
    // the only texture read in this block.
    float key = 0.0;
    if (uMode != 6) {
        key = smoothstep(-gFeather, gFeather, sig);
        if (uHueFocus > 0.5) key *= hueGate(src);
        // The tracked subject is force-lit regardless of how dim they really are.
        if (uUseMatte > 0.5) key = mix(key, 1.0, texture(uMatteTex, uv).a * uSubject);
    }

    // Spectral quantizes the ramp lookup into hard bands; every other mode reads
    // the continuous field.
    float pt = L;
    if (uMode == 1) {
        float bands = floor(mix(4.0, 24.0, uDensity));
        pt = floor(L * bands) / max(1.0, bands - 1.0);
    }
    vec3 lit = paletteColor(pt, src) * uGain;

    vec3 add = vec3(0.0);
    if      (uMode == 2) add = hazePass(mUv)  * uGain * 0.9;
    else if (uMode == 3) add = rainPass(mUv)  * uGain;
    else if (uMode == 4) add = raysPass(mUv)  * uGain * 1.4;
    else if (uMode == 5) add = motesPass(uv)  * uGain;
    else if (uMode == 6) add = contourPass(sig) * uGain;

    // Bloom off the hottest lit matter — the shared Glow slider.
    add += lit * smoothstep(gThr, gThr + 0.3, L) * uGlow * key;

    vec3 voidRGB = mix(uFill, src, uVoid);
    vec3 rgb     = clamp(mix(voidRGB, lit, key) + add, 0.0, 1.0);

    // Transparent void: alpha follows wherever the effect actually draws — the
    // key, the ghosted frame, or a mode's own light — or that light would be
    // blitted away.
    float a = (uTransparent > 0.5)
        ? clamp(max(max(key, uVoid), max(add.r, max(add.g, add.b))), 0.0, 1.0)
        : 1.0;

    // PREMULTIPLIED output. Two reasons, and the second is the important one:
    // it keeps VJPass on the canvas-native premultiplied format, so no
    // full-resolution conversion is imposed on the other two FX every frame; and
    // it makes the blend correct. Straight alpha resolves to a*rgb+(1-a)*frame,
    // which DILUTES a mode's coloured light toward the raw frame as alpha drops.
    // Premultiplied resolves to rgb+(1-a)*frame, which lays that light OVER the
    // frame — the intended read. a is 1.0 on every opaque path, so this is a
    // no-op there.
    outColor = vec4(rgb * a, a);
}
`;

const UNIFORM_NAMES = [
    'uTex', 'uDepthTex', 'uMatteTex', 'uRes', 'uAspect',
    'uProgress', 'uGain', 'uFeather', 'uDensity', 'uVoid',
    'uThreshold', 'uSpread', 'uMode', 'uPalette', 'uFill', 'uTint', 'uAccent',
    'uGlow', 'uParallax', 'uPointer', 'uTransparent',
    'uHueFocus', 'uFocusColor', 'uHueTol', ...SHAKE_UNIFORM_NAMES,
    'uDepthMode', 'uDepthSoften', 'uDepthContrast', 'uDepthInvert', 'uUseMatte', 'uSubject',
];

const lerp = (a, b, t) => a + (b - a) * t;

export class LightsFX {
    static KEY = 'lights';
    static LABEL = 'Lights';

    /** The five channel KEYS are shared across every FX on purpose — MIDI_TARGETS
     *  is hard-coded to them, so learned bindings and slider values survive an FX
     *  switch. Only the wording changes. */
    static CHANNELS = [
        { key: 'progress',  label: 'Light Sweep', defaults: { source: 'auto',   shape: 'ease', rate: 0.20, band: 'bass',   axis: 'y' } },
        { key: 'intensity', label: 'Light Gain',  defaults: { source: 'manual', manual: 0.62,  band: 'vol',    axis: 'radius' } },
        { key: 'band',      label: 'Feather',     defaults: { source: 'manual', manual: 0.22,  band: 'bass',   axis: 'y' } },
        { key: 'tiling',    label: 'Density',     defaults: { source: 'manual', manual: 0.45,  band: 'treble', axis: 'x' } },
        { key: 'dim',       label: 'Void Level',  defaults: { source: 'manual', manual: 0.00,  band: 'vol',    axis: 'y' } },
    ];

    static MODES = [
        { value: 0, label: 'Void' },
        { value: 1, label: 'Spectral' },
        { value: 2, label: 'Bloom Haze' },
        { value: 3, label: 'Light Rain' },
        { value: 4, label: 'God Rays' },
        { value: 5, label: 'Motes' },
        { value: 6, label: 'Contour' },
        { value: 7, label: 'Ignite' },
    ];

    static PALETTES = [
        { value: 0, label: 'True Color' },
        { value: 1, label: 'Custom (Hot / Shadow)' },
        { value: 2, label: 'Wreck' },
        { value: 3, label: 'Ember' },
        { value: 4, label: 'Ice' },
        { value: 5, label: 'Toxic' },
        { value: 6, label: 'Sodium' },
        { value: 7, label: 'Magenta Noir' },
    ];

    /** Declarative UI — VJDeck builds, binds and writes these with no
     *  FX-specific code. See VJDeck's PARAM DESCRIPTORS section. */
    static PARAMS = [
        { key: 'mode',    type: 'select', label: 'Mode',    options: LightsFX.MODES,    default: 0, cols: 2 },
        { key: 'palette', type: 'select', label: 'Palette', options: LightsFX.PALETTES, default: 0, cols: 2 },
        // Void = what replaces everything unlit. Hot/Shadow are the ends of the
        // Custom ramp, and colour the mode overlays.
        { key: 'fill',   type: 'color', label: 'Void',   default: '#000000', cols: 3 },
        { key: 'tint',   type: 'color', label: 'Hot',    default: '#ffdca8', cols: 3 },
        { key: 'accent', type: 'color', label: 'Shadow', default: '#0a1024', cols: 3 },

        { key: 'threshold', type: 'range', label: 'Threshold', min: 0, max: 1, step: 0.01, default: 0.42, digits: 2,
          hint: 'How bright a pixel must be to survive. Everything below it becomes the Void colour.' },
        { key: 'spread',    type: 'range', label: 'Spread',    min: 0, max: 1, step: 0.01, default: 0.40, digits: 2,
          hint: 'Haze radius · drip length · ray reach · mote size, depending on the mode.' },
        { key: 'transparent', type: 'check', label: 'Transparent Void',
          note: '— show the frame through instead of the fill colour', default: false },

        // Hue Focus — key on a COLOUR as well as on brightness, so a single
        // fixture colour can be isolated out of a lit stage. Its two controls
        // only mean anything once it is armed.
        { key: 'hueFocus', type: 'check', label: 'Hue Focus',
          note: '— keep only lights of one colour', default: false },
        { key: 'hueColor', type: 'color', label: 'Focus Color', default: '#3399ff', eyedrop: true,
          showIf: (p) => !!p.hueFocus },
        { key: 'hueTol',   type: 'range', label: 'Hue Tolerance', min: 0.02, max: 1, step: 0.01, default: 0.35, digits: 2,
          showIf: (p) => !!p.hueFocus },
    ];

    static RANDOM = {
        mode: [0, 1, 2, 3, 4, 5, 6, 7],
        palette: [0, 1, 2, 3, 4, 5, 6, 7],
        // Near-black only. A light-luminance key over a bright fill inverts the
        // read — the "void" glows and the lights vanish into it.
        fill: ['#000000', '#01030a', '#04060c', '#0a0410', '#02080a'],
        tint: ['#ffdca8', '#8ff0ff', '#ff4bd8', '#ffffff', '#ffbe6a', '#b6ff7a', '#c8b4ff'],
        accent: ['#0a1738', '#1a0d02', '#02101f', '#12001a', '#050a16', '#0d1a06'],
        ranges: {
            glow: [0.06, 0.30],
            // Kept off the extremes: past ~0.62 the key starves on dark footage
            // and the frame goes fully black, which reads as a broken deck.
            threshold: [0.30, 0.58],
            spread: [0.25, 0.80],
        },
        channels: { band: [0.12, 0.52], tiling: [0.25, 0.75] },
        shapes: ['ramp', 'ease', 'sine', 'pingpong'],
        // Slowest of the pools. The void is mostly negative space, so a fast
        // sweep reads as flicker rather than as light moving.
        rates: [0.08, 0.11, 0.15, 0.20, 0.26],
    };

    constructor() {
        this._key = LightsFX.KEY;
    }

    /**
     * @param {object} clock  { time, dt, audio, beatClock } — `time` is seconds on
     *                        the deck's show clock (MEDIA time during offline
     *                        export, wall clock live)
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
        const tint = this._hexToRgb(p.tint, [1.0, 0.86, 0.55]);
        const accent = this._hexToRgb(p.accent, [0.08, 0.12, 0.28]);
        const fill = this._hexToRgb(p.fill, [0, 0, 0]);
        const focus = this._hexToRgb(p.hueColor, [0.2, 0.6, 1.0]);

        gl.uniform2f(u.uRes, w, h);
        gl.uniform1f(u.uAspect, w / Math.max(1, h));

        gl.uniform1f(u.uProgress, drive.progress);
        gl.uniform1f(u.uGain, lerp(0.40, 2.20, drive.intensity));
        gl.uniform1f(u.uFeather, drive.band);
        gl.uniform1f(u.uDensity, drive.tiling);
        gl.uniform1f(u.uVoid, drive.dim);

        gl.uniform1f(u.uThreshold, p.threshold ?? 0.45);
        gl.uniform1f(u.uSpread, p.spread ?? 0.45);
        gl.uniform1i(u.uMode, p.mode ?? 0);
        gl.uniform1i(u.uPalette, p.palette ?? 0);
        gl.uniform3f(u.uFill, fill[0], fill[1], fill[2]);
        gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
        gl.uniform3f(u.uAccent, accent[0], accent[1], accent[2]);
        gl.uniform1f(u.uGlow, p.glow ?? 0.15);
        gl.uniform1f(u.uParallax, p.parallax ?? 0.02);
        gl.uniform2f(u.uPointer, pointer.x, pointer.y);
        gl.uniform1f(u.uTransparent, p.transparent ? 1 : 0);

        gl.uniform1f(u.uHueFocus, p.hueFocus ? 1 : 0);
        gl.uniform3f(u.uFocusColor, focus[0], focus[1], focus[2]);
        gl.uniform1f(u.uHueTol, p.hueTol ?? 0.35);

        // `progress` is the channel the Control selector owns — Shake rides it.
        setShakeUniforms(gl, u, p, drive.progress, clock.time);

        gl.uniform1i(u.uDepthMode, useMap ? 1 : 0);
        gl.uniform1f(u.uDepthSoften, p.depthSoften ?? 3.0);
        gl.uniform1f(u.uDepthContrast, p.depthContrast ?? 1.2);
        gl.uniform1f(u.uDepthInvert, p.depthInvert ? 1 : 0);
        gl.uniform1f(u.uUseMatte, useMatte ? 1 : 0);
        gl.uniform1f(u.uSubject, p.subject ?? 0.7);

        pass.draw();
        pass.blit(ctx, w, h);
        return true;
    }

    _hexToRgb(hex, fallback) {
        if (typeof hex !== 'string') return fallback;
        let s = hex.replace('#', '');
        if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
        if (s.length !== 6) return fallback;
        const v = parseInt(s, 16);
        if (Number.isNaN(v)) return fallback;
        return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
    }

    /** All GPU state lives in the shared VJPass, which the deck disposes. */
    dispose() { }
}
