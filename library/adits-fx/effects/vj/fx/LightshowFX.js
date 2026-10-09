/**
 * LightshowFX.js — "Lightshow", Video Jockey FX #4. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * A light show cut OUT OF THE LUMINANCE DEPTH FIELD. That is the whole idea, and
 * every mode below is a different way of reading the same one field:
 *
 *      depth = shaped(softened luminance of the composited frame)
 *
 * Nothing here is placed in screen space. There are no fixtures, no beams, no
 * rig hanging in front of the picture. What gets lit is the media's own relief —
 * the bright parts of the plate ARE the near plane, and light is generated from
 * that surface. Point it at a landscape and the ridges light; point it at a face
 * and the cheekbones light. Same pipeline ScanFX established (luminance by
 * default, 9 taps, no model and no upload; uploaded map and MediaPipe subject
 * matte strictly opt-in and free when off).
 *
 * LightsFX (FX #3) is untouched and complementary: it KEYS the frame — decides
 * which existing pixels survive. This one GRADES and STRUCTURES the depth field
 * — bands it, contours it, ignites it — and then runs a DMX pattern over the
 * result so it behaves like a show rather than a filter.
 *
 * ── Seven readings of the field ───────────────────────────────────────────────
 *   0 Thermal Bands  depth quantized to hard palette steps. The band BOUNDARIES
 *                    are the image: on a detailed plate they shred into the
 *                    hair-like radiating filaments the reference is built on.
 *   1 Contour Map    analytic iso-lines of the field at constant PIXEL width,
 *                    bunching where the relief is steep — a topographic map of
 *                    the footage, drawn in light.
 *   2 Duotone Bloom  cold shadows / hot highlights split at the threshold, with
 *                    a wide scatter bloom off the hot side.
 *   3 Ignite Key     hard key with the hot end clipped to white and a lit rim on
 *                    the boundary itself.
 *   4 Ridge Veins    only the high-gradient ridge line survives, as thin
 *                    branching strokes on black.
 *   5 Spectrum Split hue mapped straight onto depth and rotated — the whole
 *                    relief rendered as a moving spectrum.
 *   6 Color Wash     the odd one out, deliberately: the FULL frame, natural,
 *                    pulled toward a tint colour by multiplication — what a
 *                    real coloured gel does to a camera feed. Depth is
 *                    demoted to a gentle presence weight instead of the thing
 *                    structuring the image. Built for a plain "the whole room
 *                    just went red" read (see the `ls_red_room` preset) —
 *                    ported from a reference (red-room.mp4) that is itself
 *                    unstructured: a natural venue video under a literal red
 *                    light, not a graded/posterized effect.
 *
 * ── Why the DMX layer still belongs here ─────────────────────────────────────
 * A graded depth field is a LOOK; a light show is a look that BREATHES. The
 * pattern vocabulary in fx/vj-show.js supplies that, and it plugs in cleanly
 * because every pattern is a function of an axis — and here the axis IS DEPTH:
 *
 *      showMod(bandIndex, depth * bands, sweep * bands, gain, tint)
 *
 * So Chase becomes a lit block travelling THROUGH the relief (ScanFX's move, now
 * carrying a palette), Ring Pulse becomes concentric depth shells racing out
 * from the sweep position, Twinkle scatters random depth bands on every kick,
 * and Blackout Drop kills the whole relief between hits. None of those needed a
 * mode of their own — they fall out of feeding depth in as the axis.
 *
 * Color Wash has no relief to chase through, so it feeds the SAME patterns a
 * single global axis (0,0,0) instead — every pattern still runs, but reads as a
 * pure temporal flash/blink over the whole frame rather than a spatial chase.
 * Kick Bump's non-zero floor (0.30 + beat*2.8) is what turns into "dimmed at
 * rest, flashes on the hit" without any extra machinery.
 *
 * ── Cost ─────────────────────────────────────────────────────────────────────
 * uMode is a uniform, so every fragment takes the same branch: worst case is ONE
 * mode's arithmetic. Six of the seven modes are fully analytic — zero texture
 * taps beyond the one depth read (Color Wash is the cheapest of all: one
 * multiply). Only Duotone Bloom loops (12 golden-angle taps) and it early-outs
 * when Bloom is 0. All screen-space derivatives are taken ONCE at the top of
 * main() via fwidth(), never inside a branch, so they are always well-defined
 * regardless of mode.
 *
 * No frame feedback — VJPass renders with preserveDrawingBuffer:false, and
 * feedback would render differently during Adits' offline post-process, which
 * re-renders frames out of realtime (same reasoning as LumNetworkFX.js:61-65).
 * The show clock is fed MEDIA time during that export, so strobes and sweeps
 * land in a recording at the rate they were performed at.
 *
 * NOTE: this file embeds a GLSL template literal — it is excluded from the prod
 * obfuscator in vite.config.mjs (same as ScanFX.js / LightsFX.js). Do not put a
 * backtick inside the shader, including in its comments; it ends the literal.
 */

import { SHAKE_UNIFORM_NAMES, SHAKE_UNIFORMS, SHAKE_FUNCTIONS, setShakeUniforms } from './vj-shake.js';
import { SHOW_UNIFORM_NAMES, SHOW_UNIFORMS, SHOW_FUNCTIONS, SHOW_MODES, VJShowEngine } from './vj-show.js';

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
uniform float uSweep;          // progress  — slides the ramp/key through depth
uniform float uExposure;       // intensity — master brightness
uniform float uEdge;           // band      — contour stroke / key feather width
uniform float uBands;          // tiling    — quantization steps / contour count
uniform float uBloom;          // dim       — scatter bloom off the hot end

// ── Static params (UI) ───────────────────────────────────────────────────────
uniform int   uMode;           // 0..6, see MODES
uniform int   uPalette;
uniform vec3  uTint;           // hot end of the ramp
uniform vec3  uAccent;         // cold end of the ramp
uniform float uThreshold;      // where the field splits hot from cold
uniform float uBlowout;        // how hard the hot end clips to white
uniform float uFringe;         // RGB channel separation across the field
uniform float uKeepMedia;      // how much of the underlying frame survives
uniform float uGlow;
uniform float uParallax;
uniform vec2  uPointer;

// ── Depth ────────────────────────────────────────────────────────────────────
uniform int   uDepthMode;      // 0 luminance, 1 uploaded map
uniform float uDepthSoften;
uniform float uDepthContrast;
uniform float uDepthInvert;
uniform float uUseMatte;
uniform float uSubject;
${SHAKE_UNIFORMS}
${SHOW_UNIFORMS}

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

${SHAKE_FUNCTIONS}
${SHOW_FUNCTIONS}

float luma(vec2 uv) { return dot(texture(uTex, uv).rgb, LUMA); }

/* THE field. Softened luminance relief by default (9 taps, no model, no upload);
   an uploaded map replaces it; the subject matte then pulls a tracked person to
   the near plane so they light before the background does. Softening first is
   what stops video noise from shredding every band edge into sparkle. */
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
    if (uUseMatte > 0.5) d = mix(d, 1.0, texture(uMatteTex, uv).a * uSubject);
    return d;
}

// ── Palette ──────────────────────────────────────────────────────────────────
/* Three-stop ramps read along DEPTH, so the palette is a false-colour map of the
   relief rather than a tint over it. Lava is the reference look: black through
   red and orange to a white-hot core is what makes a grey plate read as LIT. */
vec3 paletteColor(float t) {
    t = clamp(t, 0.0, 1.0);
    if (uPalette == 0) return mix(uAccent, uTint, t);
    if (uPalette == 7) return showHue2rgb(fract(t + uShowHue));
    vec3 c0, c1, c2;
    if      (uPalette == 1) { c0 = vec3(0.02, 0.00, 0.02); c1 = vec3(0.95, 0.14, 0.02); c2 = vec3(1.00, 0.92, 0.35); } // Lava
    else if (uPalette == 2) { c0 = vec3(0.06, 0.01, 0.00); c1 = vec3(0.90, 0.35, 0.05); c2 = vec3(1.00, 0.95, 0.80); } // Ember
    else if (uPalette == 3) { c0 = vec3(0.01, 0.04, 0.10); c1 = vec3(0.10, 0.62, 0.90); c2 = vec3(0.90, 0.99, 1.00); } // Ice
    else if (uPalette == 4) { c0 = vec3(0.01, 0.06, 0.02); c1 = vec3(0.30, 0.90, 0.12); c2 = vec3(0.92, 1.00, 0.55); } // Toxic
    else if (uPalette == 5) { c0 = vec3(0.06, 0.00, 0.10); c1 = vec3(0.90, 0.10, 0.70); c2 = vec3(1.00, 0.85, 0.98); } // Magenta
    else                    { c0 = vec3(0.05, 0.02, 0.00); c1 = vec3(1.00, 0.52, 0.08); c2 = vec3(1.00, 0.90, 0.62); } // Sodium
    return t < 0.5 ? mix(c0, c1, t * 2.0) : mix(c1, c2, (t - 0.5) * 2.0);
}

/** Depth quantized to hard steps, normalized back to 0..1. */
float quant(float d, float bands) {
    return floor(clamp(d, 0.0, 1.0) * bands) / max(1.0, bands - 1.0);
}

/** Antialiased iso-line of s at every integer, in constant PIXEL width.
 *  d_px = distance-to-line / |gradient|, which is exact regardless of how steep
 *  the relief is — far cleaner (and cheaper) than thresholding a blur. sw is
 *  fwidth(s), taken once in main() so this stays out of divergent control flow. */
float isoLine(float s, float sw, float halfPx) {
    float f = fract(s);
    float dpx = min(f, 1.0 - f) / max(1e-5, sw);
    return 1.0 - smoothstep(halfPx - 0.7, halfPx + 0.7, dpx);
}

void main() {
    vec2 uv = vUv;

    // Depth is read at the UNSHAKEN uv: the relief is the subject here, so it
    // must stay locked while the media moves under it. Shake and parallax
    // displace the MEDIA sample only, exactly as in the other three FX.
    float d = depthAt(uv);
    vec2  mUv = clamp(shakeUv(uv, d) + d * uPointer * uParallax, 0.0, 1.0);
    vec3  src = texture(uTex, mUv).rgb;

    // ONE derivative for the whole shader, taken before any branch so it can
    // never sit in divergent control flow. Every mode that needs a gradient
    // scales this instead of taking its own.
    float dw = max(1e-5, fwidth(d));

    float bands = floor(mix(3.0, 32.0, uBands));
    float edge  = mix(0.006, 0.120, uEdge);
    float fr    = uFringe * 0.045;

    // The sweep slides the whole reading through the field, so "the light moves"
    // even on a still frame. Threshold rides it.
    float thr = clamp(uThreshold + (uSweep - 0.5) * 0.8, 0.0, 1.0);

    // ── Show modulation, with DEPTH as the pattern axis ──────────────────────
    // This is what turns a grade into a show: a chase runs through the relief, a
    // ring pulse radiates out from the sweep position, a blackout drop kills the
    // field between kicks. Color Wash has no relief to chase through, so it
    // gets a single global "fixture" (0,0,0) instead — the same patterns then
    // read as a pure temporal flash/blink over the whole frame.
    float g; vec3 tnt;
    if (uMode == 6) {
        showMod(0.0, 0.0, 0.0, g, tnt);
    } else {
        showMod(floor(d * bands), d * bands, uSweep * bands, g, tnt);
    }

    vec3 col = vec3(0.0);

    if (uMode == 0) {
        // ── Thermal Bands ────────────────────────────────────────────────────
        // The band boundaries ARE the picture. Each channel is quantized at a
        // slightly different depth so the steps split into coloured fringes, the
        // way the reference's filaments carry magenta and green edges.
        col.r = paletteColor(quant(d + fr, bands)).r;
        col.g = paletteColor(quant(d,      bands)).g;
        col.b = paletteColor(quant(d - fr, bands)).b;
        col *= mix(0.35, 1.0, smoothstep(0.0, 0.55, d));

    } else if (uMode == 1) {
        // ── Contour Map ──────────────────────────────────────────────────────
        // A topographic map of the footage. Channel-separated the same way, which
        // is what gives each line its red edge and green edge.
        float sc = bands * 1.6;
        float sw = dw * sc;
        vec3 line = vec3(
            isoLine((d + fr) * sc, sw, mix(0.6, 3.0, uEdge)),
            isoLine( d       * sc, sw, mix(0.6, 3.0, uEdge)),
            isoLine((d - fr) * sc, sw, mix(0.6, 3.0, uEdge))
        );
        col = line * paletteColor(0.55 + 0.45 * d);
        // The hot plateau above the threshold stays filled, so the lines read as
        // contours AROUND a lit region rather than as a bare wireframe.
        col += paletteColor(d) * smoothstep(thr, thr + edge, d) * 0.85;

    } else if (uMode == 2) {
        // ── Duotone Bloom ────────────────────────────────────────────────────
        float k = smoothstep(thr - edge, thr + edge, d);
        col = mix(paletteColor(0.12), paletteColor(0.92), k);
        if (uBloom > 0.001) {
            // 16 taps on a golden-angle spiral at r = sqrt(i/n): uniformly
            // distributed over the DISC, so the scatter reads as bloom instead of
            // as sixteen ghosts.
            float rad = mix(0.010, 0.075, uBloom);
            float acc = 0.0;
            for (int i = 0; i < 16; i++) {
                float fi = float(i);
                float a  = fi * 2.39996;
                float r  = sqrt((fi + 0.5) / 16.0);
                vec2  o  = vec2(cos(a), sin(a)) * (r * rad) * vec2(1.0, uAspect);
                acc += smoothstep(thr - edge, thr + edge, depthAt(clamp(uv + o, 0.0, 1.0))) * (1.0 - r * 0.8);
            }
            col += paletteColor(0.98) * (acc / 16.0) * uBloom * 1.8;
        }

    } else if (uMode == 3) {
        // ── Ignite Key ───────────────────────────────────────────────────────
        float k = smoothstep(thr - edge, thr + edge, d);
        col = paletteColor(d) * k;
        // Clip the hot end to white — the reference's blown cores.
        col = mix(col, vec3(1.0), smoothstep(thr, thr + mix(0.30, 0.02, uBlowout), d) * uBlowout);
        // A lit rim on the boundary itself, channel-separated for the fringe.
        // isoLine measures distance to the nearest INTEGER, so the argument is
        // (d - thr) directly: the rim lands where the field crosses the
        // threshold. fwidth(d - thr) == fwidth(d), so dw is the right scale.
        col += uTint * vec3(
            isoLine(d - thr + fr, dw, mix(0.8, 4.0, uEdge)),
            isoLine(d - thr,      dw, mix(0.8, 4.0, uEdge)),
            isoLine(d - thr - fr, dw, mix(0.8, 4.0, uEdge))
        ) * 0.9;

    } else if (uMode == 4) {
        // ── Ridge Veins ──────────────────────────────────────────────────────
        // Only where the relief turns sharply. fwidth IS the per-pixel gradient
        // magnitude, so the ridge falls out with no extra taps; the hash flicker
        // is what makes a static ridge read as a live vein rather than an edge
        // detect.
        float ridge = smoothstep(mix(0.020, 0.002, uEdge), mix(0.060, 0.010, uEdge), dw);
        float flick = 0.55 + 0.45 * showHash(floor(d * 90.0) + floor(uShowFast) * 3.7);
        col = paletteColor(0.55 + 0.45 * d) * ridge * flick;
        col += paletteColor(1.0) * ridge * smoothstep(thr, 1.0, d) * uBlowout;

    } else if (uMode == 5) {
        // ── Spectrum Split ───────────────────────────────────────────────────
        // Hue straight onto depth, rotating. Quantized when Band Count is high so
        // it steps through the spectrum instead of smearing.
        float t = fract(d * mix(1.0, 3.0, uBands) + uShowHue + uSweep);
        col = showHue2rgb(t);
        col = mix(col, showHue2rgb(quant(t, bands)), step(12.0, bands));
        col *= mix(0.25, 1.0, d);

    } else {
        // ── Color Wash ───────────────────────────────────────────────────────
        // Natural colour, NOT depth-structured like the other six readings: the
        // full frame stays exactly as shot, pulled toward the tint by
        // MULTIPLYING it. That is what a real coloured gel does to a camera
        // feed — G/B crush while R survives, so skin and highlights go pink-red
        // and the shadows go to black-red. One multiply, zero extra texture
        // taps. Depth only weights PRESENCE here (Edge Width sets how much
        // darker the background sits than the subject) — it is not what is
        // structuring the image the way it is in modes 0-5.
        vec3 washed = mix(src, src * uTint, uBlowout);
        washed *= mix(1.0 - uEdge * 0.6, 1.0, d);
        col = washed;
    }

    // Show gain/tint, then exposure. Applied to every mode identically, which is
    // why a pattern reads the same whichever reading of the field is on screen.
    vec3 lit = col * tnt * g * uExposure;

    // Superlinear bloom off the hottest matter — no extra taps, and it keeps the
    // colour of whatever is blowing out instead of washing it to white.
    lit += lit * dot(lit, LUMA) * uGlow * 2.0;

    vec3 rgb = src * uKeepMedia + lit;

    // Identity below 1, soft compression above — a drop can slam past white
    // without the palette collapsing to grey.
    rgb = rgb / (1.0 + max(vec3(0.0), rgb - 1.0));

    outColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}
`;

const UNIFORM_NAMES = [
    'uTex', 'uDepthTex', 'uMatteTex', 'uRes', 'uAspect',
    'uSweep', 'uExposure', 'uEdge', 'uBands', 'uBloom',
    'uMode', 'uPalette', 'uTint', 'uAccent',
    'uThreshold', 'uBlowout', 'uFringe', 'uKeepMedia', 'uGlow', 'uParallax', 'uPointer',
    ...SHAKE_UNIFORM_NAMES, ...SHOW_UNIFORM_NAMES,
    'uDepthMode', 'uDepthSoften', 'uDepthContrast', 'uDepthInvert', 'uUseMatte', 'uSubject',
];

export class LightshowFX {
    static KEY = 'lightshow';
    static LABEL = 'Lightshow';

    /** The five channel KEYS are shared across every FX on purpose — MIDI_TARGETS
     *  is hard-coded to them, so learned bindings and slider values survive an FX
     *  switch. Only the wording changes.
     *
     *  Note what is NOT here: the strobe, the flashes and the per-beat randomness
     *  come from VJShowEngine's own clocks, not from these channels. That is the
     *  point — it leaves all five free to shape how the depth field is READ. */
    static CHANNELS = [
        { key: 'progress',  label: 'Depth Sweep', defaults: { source: 'auto',   shape: 'ease', rate: 0.16, band: 'bass',   axis: 'y' } },
        { key: 'intensity', label: 'Exposure',    defaults: { source: 'manual', manual: 0.70, band: 'vol',    axis: 'radius' } },
        { key: 'band',      label: 'Edge Width',  defaults: { source: 'manual', manual: 0.30, band: 'treble', axis: 'y' } },
        { key: 'tiling',    label: 'Band Count',  defaults: { source: 'manual', manual: 0.45, band: 'treble', axis: 'x' } },
        { key: 'dim',       label: 'Bloom',       defaults: { source: 'manual', manual: 0.35, band: 'vol',    axis: 'y' } },
    ];

    static MODES = [
        { value: 0, label: 'Thermal Bands' },
        { value: 1, label: 'Contour Map' },
        { value: 2, label: 'Duotone Bloom' },
        { value: 3, label: 'Ignite Key' },
        { value: 4, label: 'Ridge Veins' },
        { value: 5, label: 'Spectrum Split' },
        { value: 6, label: 'Color Wash' },
    ];

    static PALETTES = [
        { value: 0, label: 'Custom (Cold / Hot)' },
        { value: 1, label: 'Lava' },
        { value: 2, label: 'Ember' },
        { value: 3, label: 'Ice' },
        { value: 4, label: 'Toxic' },
        { value: 5, label: 'Magenta' },
        { value: 6, label: 'Sodium' },
        { value: 7, label: 'Spectrum (rolling)' },
    ];

    /** Declarative UI — VJDeck builds, binds, writes and resets these without a
     *  single FX-specific line. See VJDeck's PARAM DESCRIPTORS section. */
    static PARAMS = [
        { key: 'mode',     type: 'select', label: 'Light Mode', options: LightshowFX.MODES,    default: 0, cols: 2 },
        { key: 'showMode', type: 'select', label: 'Pattern',    options: SHOW_MODES,           default: 4, cols: 2 },
        { key: 'palette',  type: 'select', label: 'Palette',    options: LightshowFX.PALETTES, default: 1 },
        { key: 'tint',     type: 'color',  label: 'Hot',        default: '#ffd23a', cols: 2 },
        { key: 'accent',   type: 'color',  label: 'Cold',       default: '#050210', cols: 2 },

        { key: 'threshold', type: 'range', label: 'Threshold', min: 0, max: 1, step: 0.01, default: 0.45, digits: 2,
          hint: 'Where the depth field splits hot from cold. Depth Sweep slides this through the relief.' },
        { key: 'blowout',   type: 'range', label: 'Blowout',   min: 0, max: 1, step: 0.01, default: 0.55, digits: 2,
          hint: 'How hard the hot end clips to white. On Color Wash this instead sets how strongly the frame is pulled toward the tint colour.' },
        { key: 'fringe',    type: 'range', label: 'RGB Fringe', min: 0, max: 1, step: 0.01, default: 0.35, digits: 2,
          hint: 'Splits the three channels across the field, so band edges and contour lines carry coloured rims.' },
        { key: 'keepMedia', type: 'range', label: 'Keep Media', min: 0, max: 1, step: 0.01, default: 0.10, digits: 2,
          hint: 'How much of the underlying frame survives beneath the light. 0 is a pure false-colour read of the depth.' },

        { key: 'showAmount', type: 'range', label: 'Pattern Amount', min: 0, max: 1, step: 0.01, default: 1.00, digits: 2,
          hint: 'Dry/wet for the pattern. At 0 the field is lit but perfectly steady.' },
        { key: 'showSpread', type: 'range', label: 'Pattern Spread', min: 0.5, max: 12, step: 0.1, default: 3.0, digits: 1,
          hint: 'How many depth bands one chase block spans. Small = a thin light travelling through the relief.' },
        { key: 'showSpeed',  type: 'range', label: 'Pattern Speed',  min: 0, max: 3, step: 0.01, default: 0.75, digits: 2 },
        { key: 'strobeHz',   type: 'range', label: 'Strobe Rate',    min: 1, max: 24, step: 0.5, default: 8.0, digits: 1,
          hint: 'Hz for Strobe, Emergency and HyperX. Ignored by the other patterns.' },
        { key: 'beatSync',   type: 'check', label: 'Chase Steps on Beat',
          note: '— one pattern step per kick instead of a free-running speed', default: false },
        { key: 'hueSpeed',   type: 'range', label: 'Hue Drift', min: 0, max: 1, step: 0.01, default: 0.10, digits: 2,
          hint: 'Rotation speed for the Spectrum palette and the hue-shifting patterns.' },
        { key: 'sensitivity', type: 'range', label: 'Beat Sensitivity', min: 0, max: 1, step: 0.01, default: 0.55, digits: 2,
          hint: 'Onset detector threshold. Ignored once a BPM is tapped in Beat Sync — the clock takes over.' },
        { key: 'release',    type: 'range', label: 'Envelope Release', min: 0.02, max: 1, step: 0.01, default: 0.18, digits: 2,
          hint: 'How long brightness holds after a hit. Long sticks through a breakdown, short snaps.' },
    ];

    /** Randomize pool — VJDeck reads this instead of carrying an FX branch. */
    static RANDOM = {
        mode:     [0, 1, 2, 3, 4, 5, 6],
        showMode: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 16],
        palette:  [0, 1, 2, 3, 4, 5, 6, 7],
        tint:     ['#ffd23a', '#ff3b1f', '#8ff0ff', '#ff1f8f', '#b6ff7a', '#ffffff'],
        accent:   ['#050210', '#0a0018', '#00060f', '#100400', '#020a08'],
        ranges: {
            threshold: [0.28, 0.62],
            blowout:   [0.25, 0.90],
            fringe:    [0.10, 0.70],
            // Never randomized to 0 — a fully black plate with an unlucky pattern
            // reads as a broken deck rather than as a look.
            keepMedia: [0.04, 0.40],
            showSpread: [1.2, 6.5],
            showSpeed:  [0.30, 1.60],
            strobeHz:   [4, 16],
        },
        channels: { band: [0.15, 0.55], tiling: [0.20, 0.80], dim: [0.10, 0.65] },
        shapes: ['ramp', 'ease', 'sine', 'pingpong'],
        rates:  [0.08, 0.12, 0.16, 0.22, 0.30],
    };

    constructor() {
        this._key = LightshowFX.KEY;
        this._show = new VJShowEngine();
    }

    /** Called by the deck on preset change / FX switch / reset, so a re-entered
     *  show starts on a clean bar instead of mid-chase. */
    reset() {
        this._show.reset();
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
     * @param {object} clock    { time, dt, audio, beatClock } — time/dt are MEDIA
     *                          based during offline export, wall clock live
     */
    render(pass, ctx, source, w, h, drive, p, depth, pointer, clock) {
        const prog = pass.buildProgram(this._key, FRAG_SRC, UNIFORM_NAMES);
        if (!prog) return false;
        const u = pass.use(this._key);
        if (!u) return false;
        const gl = pass.gl;

        // ── Show brain ───────────────────────────────────────────────────────
        // clock.liveDt is 0 when the deck's Control source (Audio Reactive /
        // Gesture) currently has no real signal — see VJDeck._resolveClock().
        // Falls back to clock.dt for every other Control mode (liveDt is
        // undefined there), so Auto/Manual/Pointer/MIDI behave exactly as before.
        this._show.update(clock.dt, clock.audio, {
            band: p.showBand || 'bass',
            release: p.release,
            sensitivity: p.sensitivity,
            beatDecay: p.release,          // one control for "how long a hit holds"
            showSpeed: p.showSpeed,
            strobeHz: p.strobeHz,
            hueSpeed: p.hueSpeed,
            beatSync: !!p.beatSync,
        }, clock.beatClock, clock.liveDt ?? clock.dt);

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
        const tint = this._hexToRgb(p.tint, [1.0, 0.82, 0.23]);
        const accent = this._hexToRgb(p.accent, [0.02, 0.01, 0.06]);

        gl.uniform2f(u.uRes, w, h);
        gl.uniform1f(u.uAspect, w / Math.max(1, h));

        gl.uniform1f(u.uSweep, drive.progress);
        gl.uniform1f(u.uExposure, 0.35 + drive.intensity * 2.0);
        gl.uniform1f(u.uEdge, drive.band);
        gl.uniform1f(u.uBands, drive.tiling);
        gl.uniform1f(u.uBloom, drive.dim);

        gl.uniform1i(u.uMode, p.mode ?? 0);
        gl.uniform1i(u.uPalette, p.palette ?? 1);
        gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
        gl.uniform3f(u.uAccent, accent[0], accent[1], accent[2]);
        gl.uniform1f(u.uThreshold, p.threshold ?? 0.45);
        gl.uniform1f(u.uBlowout, p.blowout ?? 0.55);
        gl.uniform1f(u.uFringe, p.fringe ?? 0.35);
        gl.uniform1f(u.uKeepMedia, p.keepMedia ?? 0.10);
        gl.uniform1f(u.uGlow, p.glow ?? 0.15);
        gl.uniform1f(u.uParallax, p.parallax ?? 0.02);
        gl.uniform2f(u.uPointer, pointer.x, pointer.y);

        // The sweep is already a uniform of its own; the show phase gets it as an
        // offset too, so the Control selector scrubs the pattern as well as the
        // reading of the field.
        this._show.bind(gl, u, p, drive.progress);
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
        const h = String(hex || '').replace('#', '');
        const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
        if (!h || Number.isNaN(n)) return fallback;
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    /** All GPU state lives in the shared VJPass, which the deck disposes. */
    dispose() { }
}
