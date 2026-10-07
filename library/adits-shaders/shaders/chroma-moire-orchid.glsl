/*{
  "ADITS": 1,
  "DESCRIPTION": "A seven-fold spider-orchid of scalloped neon ripple bands, every edge split into acid-green, hot-magenta and deep-blue moire fringes. The petal profile is one primitive under six interpolated numbers, so the flower morphs by deforming, not cross-fading, through four forms: round scallop bulb, spider-orchid petal, raked claw, needle ray. Bass rounds the bloom, treble sharpens it to rays, and the change sweeps across the flower rather than flipping it. Rests as the spider-orchid petal.",
  "CREDIT": "claude-sonnet-5",
  "DATE": "2026-08-20",
  "CATEGORIES": ["generative", "morph", "psychedelic", "moire", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "sens",     "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",     "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",     "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "bodySize", "TYPE": "float", "DEFAULT": 0.32, "MIN": 0.24, "MAX": 0.345,
      "LABEL": "Body Size", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "warpAmt",  "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Band Warp", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "fringe",   "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Chroma Fringe", "BIND": "treble", "BIND_DEPTH": 0.50 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

// Angular symmetry. It used to be a slider; an integer keeps the seam at +-PI
// invisible, and the six-slot budget went to the morph controls instead.
#define FOLDS 7.0

// How far the selector is spread across the flower. The change then crosses it
// as a wave instead of flipping every petal at once.
#define STAGGER 1.05

// One chroma sample of the orchid band field.
// Returns: x = lit band coverage, y = body silhouette, z = normalized radius.
// The six morph numbers arrive as arguments rather than being derived here, so
// all three chroma samples read the same form: derived per sample they would
// disagree near a cleft and the fringe would break into wedges.
vec3 orchidSample(float r, float ang, float ph, float Rb, float phOff,
                  float pexp, float pflr, float plen, float bfr, float bsh, float rake) {
    // Scallop wobble of the band field: two counter-crawling waves at
    // 2 and 3 cycles per loop, so both wrap seamlessly.
    float wob = 1.0
        + warpAmt * 0.075 * sin(ang * FOLDS + TAU * ph * 2.0)
        + warpAmt * 0.045 * sin(ang * FOLDS * 2.0 - TAU * ph * 3.0);
    float rw = r * wob;

    // Petal envelope: FOLDS lobes, written from the cell coordinate so the lobe
    // sharpness, the cleft depth and a radial rake are all free parameters. At
    // pexp 1.25, pflr 0.40 and rake 0 this is the original spider-orchid outline.
    float R0 = Rb * plen;
    float c  = fract(ang * (FOLDS / TAU) + 0.5) - 0.5;
    float cs = c + rake * clamp(rw / max(R0, 1e-3), 0.0, 1.2) * 0.30;
    float pet = pow(abs(cos(cs * PI)), pexp);
    float R   = R0 * (pflr + (1.0 - pflr) * pet);
    float rn  = rw / max(R, 1e-4);

    // Concentric scalloped bands, scrolling outward exactly one band period
    // per loop. Narrow: wide bands from the three chroma samples overlap and
    // sum to white, which is how a colour-split effect turns into grey mud.
    float band = 0.5 + 0.5 * cos(TAU * (rn * bfr - ph) + phOff);
    band = smoothstep(bsh, bsh + 0.33, band);

    // Silhouette: soft edge, zero everywhere the organism is not.
    float body = smoothstep(1.0, 0.93, rn);
    return vec3(band * body, body, rn);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Single loop phase; every animated rate below is an integer multiple of it.
    // Nothing on the morph path reads it: which petal this is belongs to the
    // music, not to the clock.
    float ph = fract(TIME / 12.0);

    float r = length(uv);
    float ang = atan(uv.y, uv.x);

    // --- Selector -------------------------------------------------------------
    // Balance decides which flower; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // sharpens the bloom to rays, a kick rounds it back into bulbs.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // Rocking precession, one cycle per loop. The beat snaps the rotation half
    // a sector; AUDIO_BEAT already decays, so the snap eases back on its own.
    ang += 0.16 * sin(TAU * ph);
    ang += snap * 1.45 * AUDIO_BEAT * (PI / FOLDS);

    // Per-petal stagger. This field is continuous rather than a set of separate
    // primitives, so the stagger has to be continuous too: a per-cell index would
    // put a different form either side of every cleft and cut a hard radial seam
    // there. Both terms below are smooth and TAU-periodic, so the form drifts
    // across the flower with no seam anywhere, and each petal still lands
    // somewhere different on the selector axis.
    float u   = 0.5 - 0.5 * cos(ang);
    float jit = 0.25 * sin(ang * 2.0 + 1.1) + 0.25 * sin(ang * 3.0 + 2.7);
    float xj  = clamp(sel * 3.0 + STAGGER * (0.62 * (u - 0.5) + 0.38 * jit), 0.0, 3.0);

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

    // Parameter-space morph. One petal primitive, six interpolated numbers, so
    // the outline deforms and no fragment ever shows two flowers at half alpha.
    //             bulb       orchid     claw       ray
    float pexp = 0.55 * w0 + 1.25 * w1 + 1.90 * w2 + 3.20 * w3;   // lobe sharpness
    float pflr = 0.66 * w0 + 0.40 * w1 + 0.26 * w2 + 0.10 * w3;   // cleft depth
    float plen = 0.80 * w0 + 1.00 * w1 + 1.08 * w2 + 1.18 * w3;   // reach
    float bfr  = 3.50 * w0 + 6.00 * w1 + 8.00 * w2 + 14.0 * w3;   // band pitch
    float bsh  = 0.42 * w0 + 0.60 * w1 + 0.70 * w2 + 0.78 * w3;   // band gauge
    float rake = 0.00 * w0 + 0.05 * w1 + 0.42 * w2 + 0.00 * w3;   // claw curl

    // Breathing, two cycles per loop.
    float Rb = bodySize * (1.0 + 0.035 * sin(TAU * ph * 2.0));

    // Three samples of the same field at slightly different scale, twist and
    // band phase: the RGB channel split that fringes every edge into moire.
    // A third of a band period apart is the separation that gives clean
    // red/green/blue rings; the fringe control scales toward it from about a
    // quarter, so even the low end of the slider stays saturated.
    float split = (TAU / 3.0) * (0.70 + 0.30 * fringe);
    vec3 sR = orchidSample(r * (1.0 - fringe * 0.090), ang + fringe * 0.045, ph, Rb,  split,
                           pexp, pflr, plen, bfr, bsh, rake);
    vec3 sG = orchidSample(r,                          ang,                  ph, Rb,  0.0,
                           pexp, pflr, plen, bfr, bsh, rake);
    vec3 sB = orchidSample(r * (1.0 + fringe * 0.090), ang - fringe * 0.045, ph, Rb, -split,
                           pexp, pflr, plen, bfr, bsh, rake);

    vec3 MAG  = vec3(1.00, 0.08, 0.62);   // hot magenta drives the red sample
    vec3 ACID = vec3(0.42, 1.00, 0.12);   // acid green drives the centre sample
    vec3 BLU  = vec3(0.10, 0.28, 1.00);   // deep blue drives the blue sample

    // Inner bands run hotter than the rim, so the core reads clearly brighter.
    float bright = mix(1.25, 0.55, clamp(sG.z, 0.0, 1.0));

    vec3 col = (MAG * sR.x + ACID * sG.x + BLU * sB.x) * 0.90 * bright;

    // Dark indigo flesh between the bands: the organism stays solid, not hollow.
    float bodyU = max(sG.y, max(sR.y, sB.y));
    col += vec3(0.030, 0.015, 0.070) * bodyU;

    // Magenta nucleus, bounded so it dies inside the innermost cleft radius.
    float core = 0.0030 / (dot(uv, uv) + 0.0060) * smoothstep(Rb * 0.38, 0.0, r);
    col += vec3(1.00, 0.42, 0.90) * core;

    // Radial safety bound. The worst case is the ray form at the largest body
    // size with the band warp fully open, which reaches 0.479; this fade feathers
    // that last sliver rather than letting the frame cut it, and at the default
    // body size it never touches the flower at all.
    float rim = 1.0 - smoothstep(0.440, 0.492, r);
    col *= rim;

    // Coverage: solid body in the interior, band-lace at the rim.
    float lace = max(sG.x, max(sR.x, sB.x));
    float edgeZone = smoothstep(0.55, 0.95, sG.z);
    float alpha = bodyU * mix(1.0, lace, edgeZone * 0.88);
    alpha = clamp(alpha + core * 0.55, 0.0, 1.0) * rim;

    // Premultiply: rgb and alpha are zero everywhere the organism is not.
    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
