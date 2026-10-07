/*{
  "ADITS": 1,
  "DESCRIPTION": "A neon lace peacock: ninety filaments fanning out of a ringed core, with twelve whiskers past them and eight petals drifting outside, the core and petals unchanging. Each filament is one primitive under five interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: feather blade, lace filament, barbed quill, hair whisker. Bass feathers the fan, treble strips it to hair. Rests as the lace filament.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "neon", "lace", "psychedelic", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 20.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "fan",    "TYPE": "float", "DEFAULT": 0.255, "MIN": 0.195, "MAX": 0.300,
      "LABEL": "Fan Radius", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "lace",   "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Lace Glow", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "petals", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Petal Glow", "BIND": "treble", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU 6.28318530718

// Where the palette starts. It used to be a slider; the six-slot budget went to
// the morph controls instead, and this is the value it defaulted to.
#define HUE_OFF 0.25

// How far the per-filament selector is spread across the fan. The change then
// crosses it as a wave instead of flipping all ninety at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

vec3 pal(float t) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.33, 0.67)));
}

vec2 rot2(vec2 v, float a) {
    float s = sin(a), c = cos(a);
    return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

// One glowing petal: a tilted solid ellipse with a bounded halo around it.
//   x fill, y rim, z halo
vec3 petal(vec2 p, vec2 c, float rad, float tilt) {
    vec2  q = rot2(p - c, -tilt);
    q.y /= 0.62;
    float d  = length(q);
    float dn = d / rad;
    return vec3(1.0 - smoothstep(0.96, 1.02, dn),
                1.0 - smoothstep(0.0014, 0.0044, abs(dn - 1.0) * rad),
                // Bounded: the halo reaches zero three radii out, never the frame.
                (1.0 - smoothstep(1.0, 3.0, dn)) * 0.35);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the fan
    // and its colour wrap seamlessly on a 20 s cycle. Nothing on the morph path
    // reads it: which filament is which belongs to the music, not the clock.
    float ph = fract(TIME / 20.0);

    float r = length(uv);
    float a = atan(uv.y, uv.x);          // one atan for the frame, none in a loop

    float turn   = ph * TAU;
    float breath = 1.0 + 0.045 * sin(ph * TAU * 2.0);
    float creep  = ph * 3.0;
    float span   = fan * breath;
    float hue0   = ph + HUE_OFF + 0.26 * (1.0 - CAM_DIR.z);

    // --- Selector -------------------------------------------------------------
    // Balance decides which filament; loudness only decides how hard it burns.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // strips a filament to hair, a kick feathers it into a blade.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // --- Lace fan --------------------------------------------------------------
    // Ninety hair filaments, all from one angular cell evaluation. Their lengths
    // vary hard, so the fan's edge is a torn fringe and not a clean disc.
    const float HAIRS = 90.0;
    float sk  = (a + turn) * (HAIRS / TAU);
    float sid = mod(floor(sk), HAIRS);
    float sd  = abs(fract(sk) - 0.5) * (TAU / HAIRS) * r;

    float hv  = hash11(sid * 1.53 + 2.7);
    float hv2 = hash11(sid * 5.91 + 7.3);

    // Per-filament selector. The cosine term sweeps the change across the fan
    // and, unlike a linear index ramp, is continuous where the ring of ninety
    // wraps. The hash keeps that sweep from looking mechanical. Both are static,
    // so at a fixed spectrum the fan holds still.
    float u  = 0.5 - 0.5 * cos(sid * (TAU / HAIRS));
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

    // Parameter-space morph. One filament primitive, five interpolated numbers,
    // so the outline deforms and no fragment shows two forms at half alpha.
    //             blade      filament   quill      hair
    float lenM = 0.70 * w0 + 1.00 * w1 + 1.08 * w2 + 1.15 * w3;  // reach
    float hwM  = 3.20 * w0 + 1.00 * w1 + 1.55 * w2 + 0.55 * w3;  // gauge
    float bfr  = 9.00 * w0 + 22.0 * w1 + 34.0 * w2 + 55.0 * w3;  // bead pitch
    float bgz  = 1.50 * w0 + 1.00 * w1 + 1.25 * w2 + 2.20 * w3;  // bead spread
    float glM  = 0.80 * w0 + 1.00 * w1 + 1.15 * w2 + 1.45 * w3;  // emission

    float L   = span * (0.52 + 0.62 * hv) * lenM;
    float t   = r / max(L, 1e-4);
    float hw  = 0.0017 * hwM * (1.0 - 0.45 * clamp(t, 0.0, 1.0));

    float onH = smoothstep(0.008, 0.024, r) * (1.0 - smoothstep(0.94, 1.02, t));
    float hair = (1.0 - smoothstep(hw, hw + 0.0013, sd)) * onH * glM;

    // Beads strung along the filaments, which is what gives the fan its glitter.
    float bt   = fract(t * bfr - creep + hv2);
    float bead = smoothstep(0.66, 0.98, bt) * smoothstep(1.06, 0.90, bt);
    float glint = (1.0 - smoothstep(hw * 2.6 * bgz, hw * 2.6 * bgz + 0.0012, sd))
                * bead * onH;

    // Concentric rings printed across the fan, and a bright ringed hub.
    float ring = (1.0 - smoothstep(0.07, 0.20, abs(fract(r * 42.0 - creep * 2.0) - 0.5)))
               * (1.0 - smoothstep(span * 0.82, span * 0.98, r))
               * smoothstep(0.010, 0.030, r);
    float hubR = (1.0 - smoothstep(0.10, 0.30, abs(fract(r * 96.0 - creep * 4.0) - 0.5)))
               * (1.0 - smoothstep(0.030, 0.062, r));
    float nuc  = 1.0 - smoothstep(0.014, 0.024, r);

    // Twelve longer whiskers reaching past the fan.
    const float WHISK = 12.0;
    float wk  = (a - turn * 2.0) * (WHISK / TAU);
    float wid = mod(floor(wk), WHISK);
    float wsd = abs(fract(wk) - 0.5) * (TAU / WHISK) * r;
    float wL  = span * (1.28 + 0.34 * hash11(wid * 3.19 + 4.1));
    float whisk = (1.0 - smoothstep(0.0011, 0.0026, wsd))
                * smoothstep(0.020, 0.050, r)
                * (1.0 - smoothstep(wL - 0.018, wL, r));

    vec3 hueH = pal(hue0 + hv * 0.55 + t * 0.22);
    vec3 hueW = pal(hue0 + 0.42 + hash11(wid * 7.7) * 0.30);
    vec3 white = vec3(1.00, 0.99, 0.96);

    // One transient control drives the light as well as the geometry. AUDIO_SNARE
    // already decays, so it is used straight and the floor keeps the rings lit
    // in silence.
    float snare = 1.0 + 1.5 * snap * AUDIO_SNARE;

    vec3 col = hueH * hair * (0.85 + 1.35 * lace)
             + white * glint * (0.55 + 0.90 * lace)
             + mix(hueH, white, 0.45) * ring * (0.70 + 1.15 * lace) * snare
             + white * hubR * 0.60 * snare
             + white * nuc * 0.95
             + hueW * whisk * (0.45 + 0.60 * lace);

    float cov = hair + glint * 0.6 + ring * 0.5 + hubR * 0.7 + nuc + whisk * 0.8;

    // --- Shared core: petal swarm ----------------------------------------------
    // Eight solid petals drifting outside the fan, each on its own orbit. Neither
    // they nor the ringed hub changes species; they are what holds the object
    // together while the lace turns over.
    float pr = 0.315 + 0.030 * sin(ph * TAU);
    vec3 q1 = petal(uv, rot2(vec2(pr, 0.0), ph * TAU + 0.0), 0.042, 0.4 + ph * TAU);
    vec3 q2 = petal(uv, rot2(vec2(pr * 1.06, 0.0), -ph * TAU + 0.9), 0.034, -0.8 - ph * TAU);
    vec3 q3 = petal(uv, rot2(vec2(pr * 0.92, 0.0), ph * TAU * 2.0 + 1.8), 0.038, 1.1 + ph * TAU * 2.0);
    vec3 q4 = petal(uv, rot2(vec2(pr * 1.12, 0.0), -ph * TAU * 2.0 + 2.7), 0.029, -0.3 - ph * TAU * 2.0);
    vec3 q5 = petal(uv, rot2(vec2(pr * 0.86, 0.0), ph * TAU * 3.0 + 3.6), 0.036, 0.7 + ph * TAU);
    vec3 q6 = petal(uv, rot2(vec2(pr * 1.02, 0.0), -ph * TAU * 3.0 + 4.5), 0.031, -1.2 - ph * TAU);
    vec3 q7 = petal(uv, rot2(vec2(pr * 1.15, 0.0), ph * TAU + 5.4), 0.026, 0.2 + ph * TAU * 3.0);
    vec3 q8 = petal(uv, rot2(vec2(pr * 0.78, 0.0), -ph * TAU + 6.0), 0.033, -0.6 - ph * TAU * 2.0);

    float pFill = max(max(max(q1.x, q2.x), max(q3.x, q4.x)),
                      max(max(q5.x, q6.x), max(q7.x, q8.x)));
    float pRim  = q1.y + q2.y + q3.y + q4.y + q5.y + q6.y + q7.y + q8.y;
    float pHalo = q1.z + q2.z + q3.z + q4.z + q5.z + q6.z + q7.z + q8.z;

    // Each petal takes a different slot of the palette, as the reference's do.
    vec3 pc = pal(hue0 + 0.55) * q1.x + pal(hue0 + 0.10) * q2.x
            + pal(hue0 + 0.72) * q3.x + pal(hue0 + 0.30) * q4.x
            + pal(hue0 + 0.88) * q5.x + pal(hue0 + 0.45) * q6.x
            + pal(hue0 + 0.05) * q7.x + pal(hue0 + 0.63) * q8.x;

    col += mix(pc, vec3(pFill) * white, 0.14) * (1.05 + 1.55 * petals)
         + white * min(pRim, 2.0) * 0.30
         + pal(hue0 + 0.4) * min(pHalo, 2.0) * (0.60 * petals);

    // Soft knee: ninety filaments converge on one point.
    col = col / (1.0 + col * 0.30);

    // Radial safety bound. The hair form is the longest filament, at 0.300 fan *
    // 1.045 breath * 1.14 hash * 1.15 length, which is 0.411, so the fan itself
    // never reaches this fade; only the whiskers and the outer petals do, exactly
    // as they did before.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (min(cov, 1.3) * 0.95 + pFill * 1.00
                 + min(pRim, 1.0) * 0.60 + min(pHalo, 1.0) * 0.28) * rim;
    alpha = smoothstep(0.020, 0.92, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
