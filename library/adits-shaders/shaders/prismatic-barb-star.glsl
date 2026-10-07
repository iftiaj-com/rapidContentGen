/*{
  "ADITS": 1,
  "DESCRIPTION": "An eleven-spined barb star that eclipses to a black silhouette twice per loop, its nucleus unchanging, every spine changing species on its own schedule. Each is one knotted chain under seven interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: pod club, barb spine, serrated lance, hair needle. Every edge still splits into a prismatic fringe. Bass clubs the star, treble hones it to needles. Rests as the barb spine.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "iridescent", "chroma-split", "star", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 20.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach",   "TYPE": "float", "DEFAULT": 0.295, "MIN": 0.235, "MAX": 0.310,
      "LABEL": "Spine Reach", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "iris",    "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Iridescence", "BIND": "treble", "BIND_DEPTH": 0.55 },
    { "NAME": "pods",    "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Lens Pods", "BIND": "level", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU 6.28318530718

// Spine half-width at the hub, in uv units.
#define SPW 0.021

// How deep the twice-per-loop eclipse cuts. It used to be a slider; the six-slot
// budget went to the morph controls instead, and this is its old default.
#define ECLIPSE 0.55

// How far the per-spine selector is spread around the star. The change then
// crosses it spine by spine instead of flipping all eleven at once.
#define STAGGER 1.05

// r lags, b leads.
const vec3 CH = vec3(-1.0, 0.0, 1.0);

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

// Narrow smoothed lobe. Kept narrow so the three channels separate instead of
// all staying lit, which is what turns a rainbow into pastel mush.
float lobe(float x) {
    float f = clamp(1.0 - abs(fract(x) - 0.5) * 2.60, 0.0, 1.0);
    return f * f * (3.0 - 2.0 * f);
}

vec3 filmHue(float t) {
    return vec3(lobe(t), lobe(t + 0.3333), lobe(t + 0.6667));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the star
    // and its eclipse wrap seamlessly on a 20 s cycle. Nothing on the morph path
    // reads it: which spine is which belongs to the music, not to the clock.
    float ph = fract(TIME / 20.0);

    float r = length(uv);
    float a = atan(uv.y, uv.x);          // one atan for the frame, none in a loop

    float turn   = ph * TAU;
    float breath = 1.0 + 0.045 * sin(ph * TAU * 2.0);
    float creep  = ph * 3.0;
    float span   = reach * breath;

    // --- Selector -------------------------------------------------------------
    // Balance decides which spine; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // hones a spine to a needle, a kick clubs it.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float alive = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, alive);

    // One transient control drives the light as well as the geometry: the kick
    // that clubs a spine also flares its needle.
    float flareF = 0.32 + 1.00 * snap * AUDIO_KICK;

    // --- Morphing star: eleven spines -------------------------------------------
    const float SPINES = 11.0;
    float sk  = (a + turn) * (SPINES / TAU);
    float sid = mod(floor(sk), SPINES);
    float cf  = fract(sk) - 0.5;
    float pitch = (TAU / SPINES) * r;

    float hv  = hash11(sid * 2.31 + 3.7);
    float hv2 = hash11(sid * 6.79 + 8.1);

    // Per-spine selector. The cosine term sweeps the change around the star and,
    // unlike a linear index ramp, is continuous where the ring wraps. The hash
    // keeps that sweep from looking mechanical. Both are static, so at a fixed
    // spectrum the star holds still: the wave is positioned by the music.
    float u  = 0.5 - 0.5 * cos(sid * (TAU / SPINES));
    float xj = clamp(sel * 3.0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (hv2 - 0.5)),
                     0.0, 3.0);

    // Triangular weights of slope 1.85. Support is 1/1.85 either side of a centre
    // and the centres are spaced 1.0, so neighbours overlap over 2/1.85 - 1 = 0.081
    // of the axis and the sum is never zero. The slope must stay below 2.0 or the
    // normalisation below divides by nothing.
    float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Parameter-space morph. One knotted chain, seven interpolated numbers, so
    // the silhouette deforms and no fragment shows two forms at half alpha.
    //             club       spine      lance      needle
    float lenM = 0.70 * w0 + 1.00 * w1 + 1.06 * w2 + 1.12 * w3;  // reach
    float wM   = 2.10 * w0 + 1.00 * w1 + 0.62 * w2 + 0.26 * w3;  // gauge
    float tpr  = 0.55 * w0 + 1.00 * w1 + 1.25 * w2 + 1.75 * w3;  // taper
    float kntF = 6.00 * w0 + 13.0 * w1 + 20.0 * w2 + 34.0 * w3;  // knot pitch
    float kntZ = 0.35 * w0 + 1.00 * w1 + 1.70 * w2 + 0.20 * w3;  // knot size
    float podZ = 1.70 * w0 + 1.00 * w1 + 0.55 * w2 + 0.10 * w3;  // pod swell
    float ndlM = 0.45 * w0 + 1.00 * w1 + 1.20 * w2 + 1.55 * w3;  // needle

    float L   = span * (0.52 + 0.50 * hv) * lenM;
    float t   = r / max(L, 1e-4);
    float tap = clamp(1.0 - t, 0.0, 1.0);

    // Serrated knots along the spine, and three lens pods swelling it.
    float bt   = fract(t * kntF - creep + hv);
    float barb = smoothstep(0.50, 0.95, bt) * smoothstep(1.06, 0.90, bt);
    float pt   = fract(t * 3.4 + 0.15);
    float pod  = smoothstep(0.62, 0.98, pt) * smoothstep(1.08, 0.92, pt)
               * smoothstep(0.06, 0.30, t) * podZ;
    float w    = SPW * wM * pow(tap, tpr) * (0.34 + 0.78 * tap)
               * (1.0 + 1.75 * kntZ * barb + (1.6 + 2.4 * pods) * pod);

    // The dispersion cut: the spine boundary is found three times at slightly
    // different offsets of the angular cell, so every edge carries a real fringe.
    float disp = (0.004 + 0.026 * iris) * (SPINES / TAU);
    vec3  sd3  = abs(fract(vec3(sk) - CH * disp) - 0.5) * pitch;
    float sd   = abs(cf) * pitch;

    float live = smoothstep(0.012, 0.034, r) * (1.0 - smoothstep(0.965, 1.01, t));
    vec3  bod3 = (1.0 - smoothstep(vec3(w), vec3(w + 0.0016), sd3)) * live;
    float edge = (1.0 - smoothstep(0.0008, 0.0028, abs(sd - w))) * live;

    // Hair needle drawn out past the knots. It carries the kick flare.
    float nw    = 0.0016 * ndlM * (1.0 + 1.4 * flareF);
    // The needle's end is set in uv, not in t: a fraction-of-L cap would let the
    // longest spine's needle run past the frame while the shortest one's barely
    // shows.
    float nEnd = L + (0.048 + 0.032 * hv2) * ndlM;
    float needle = (1.0 - smoothstep(nw, nw + 0.0014, sd))
                 * smoothstep(0.96, 1.02, t)
                 * (1.0 - smoothstep(nEnd - 0.014, nEnd, r));

    // --- Colour ----------------------------------------------------------------
    float sat  = 0.72 + 0.28 * iris;
    float hueT = t * 0.85 + sd * 6.0 + sid * 0.09 + hv2 * 0.21 + ph
               + 0.45 * cos(a - CAM_DIR.x * 2.0);
    vec3  hue  = filmHue(hueT) * vec3(0.92, 1.20, 1.04);
    hue = mix(vec3(0.05, 0.16, 0.14), hue, sat);

    // Only the disagreement between the three cuts is dispersion; the shared part
    // is the body. Splitting them is what keeps this prismatic rather than pastel.
    vec3 split = bod3 - vec3(bod3.g);

    // The eclipse: twice per loop the body drops to a silhouette and only the rims
    // and needles stay lit, which is the reference's black phase.
    float lit = mix(1.0, 0.14, ECLIPSE * (0.5 + 0.5 * cos(ph * TAU * 2.0)));

    float chip = 0.16 + 0.94 * smoothstep(0.04, 0.62, bt);
    float core = (0.0011 / (dot(uv, uv) + 0.0016)) * (1.0 - smoothstep(0.014, 0.090, r));
    float nuc  = 1.0 - smoothstep(0.011, 0.019, r);

    vec3 col = mix(vec3(0.030, 0.062, 0.058), hue * 0.78, 0.42) * bod3.g * chip * 1.70 * lit
             + hue * split * 2.55 * (0.35 + 0.65 * lit)
             + vec3(0.94, 1.00, 0.98) * edge * (0.30 + 0.42 * iris)
             + hue * pod * bod3.g * (0.45 + 0.95 * pods) * lit
             + mix(vec3(1.00, 0.98, 0.92), hue, 0.35) * needle * (0.70 + 1.10 * flareF)
             + vec3(1.00, 0.99, 0.96) * nuc * 0.95
             + vec3(0.98, 1.00, 0.96) * core * (0.45 + 0.70 * flareF);

    // Soft knee: eleven spines converge on the nucleus.
    col = col / (1.0 + col * 0.30);

    // Radial safety bound. The needle form on the longest spine is the furthest
    // thing out: 0.310 reach * 1.045 breath * 1.02 hash * 1.12 length puts the
    // knots at 0.370 and the hair needle past them at 0.450, so this fade only
    // feathers the last of a hair.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. The silhouette keeps full alpha through the
    // eclipse: it goes black, not transparent.
    float alpha = (max(bod3.r, max(bod3.g, bod3.b)) * 1.00 + edge * 0.60
                 + needle * 0.85 + nuc * 1.00 + core * 0.45) * rim;
    alpha = smoothstep(0.020, 0.92, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
